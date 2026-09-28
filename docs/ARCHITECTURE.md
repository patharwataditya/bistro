# Bistro — Architecture

Restaurant operations manager: an Android (Kotlin/Compose) client backed by a
FastAPI + PostgreSQL modular monolith, deployed on a single AWS EC2 instance.

```
Android app ──HTTPS──▶ Caddy (TLS, rate limits) ──▶ FastAPI (uvicorn) ──▶ PostgreSQL
                         EC2 t4g.small, Docker Compose; only 22 (restricted), 80, 443 open
```

## 1. Repository layout

| Path | Contents |
|---|---|
| `backend/` | FastAPI app (`app/`), Alembic migrations, tests, Dockerfile |
| `android/` | Android app (single `:app` module, package `ai.synkrasis.bistro`) |
| `contract/enums.json` | Canonical enum/state values shared by both sides; tests on each side fail on drift |
| `deploy/` | docker-compose.prod, caddy/Caddyfile, provisioning + backup scripts |

## 2. Backend layers

```
api/routers      HTTP only: parse, call service, serialize. Declares required permission.
schemas/         Pydantic request/response models (extra="forbid" → no mass assignment)
services/        Business rules, state machines, money math, audit writes, transactions
repositories     Folded into services as SQLAlchemy 2 queries (a separate repo layer
                 would be pure pass-through at this size)
models/          SQLAlchemy ORM, the single source of schema truth → Alembic migrations
core/            config, db session, security (JWT/argon2), errors, logging, rbac deps
```

* Sync SQLAlchemy 2 + psycopg 3. One DB transaction per request (`get_db` commits on
  success, rolls back on any exception) — a failed payment can never half-apply.
* Concurrency: every state transition loads the aggregate root with
  `SELECT … FOR NO KEY UPDATE` (order → ticket/bill → table, always in that order, so FK
  key-share locks never deadlock against it) *and* checks a client-supplied `version`
  (optimistic concurrency, `409 STALE_VERSION`). Two cashiers cannot both close a bill;
  two cooks cannot both bump a ticket. Kitchen progress does not bump the order version.
* Commits happen in `TransactionalRoute` *before* the response is sent, so a failed
  commit is an error response, never a false success.
* Idempotency: `Idempotency-Key` header on order creation, send-to-kitchen, bill
  creation and payments. Keys are stored per user+route with the response; a replay
  returns the original response, a key reused with a different body → 422.
* Errors: uniform envelope `{"error": {"code", "message", "details"}}`, stable codes
  (`PERMISSION_DENIED`, `INVALID_TRANSITION`, `STALE_VERSION`, `VALIDATION_ERROR`, …)
  the app maps to human copy. Internal exceptions never leak.
* Money: `NUMERIC(12,2)` + Python `Decimal`, `ROUND_HALF_UP`, all totals computed
  server-side. Client-sent amounts other than "amount tendered" are never accepted.
* Time: `timestamptz` everywhere (UTC). Report day boundaries use the location's IANA
  timezone.

## 3. Tenancy

`Restaurant 1─* Location`. Users belong to a restaurant and have a home location;
every operational row (tables, menu, orders, tickets, bills, audit) carries
`location_id`. The location is resolved **server-side** from the authenticated user,
never from the request, so IDOR across locations is structurally impossible.
Roles belong to a restaurant.

## 4. Auth

* `POST /auth/login` → access JWT (HS256, 15 min, claims: sub, sid, ver) + opaque
  refresh token (256-bit random, stored as SHA-256, 30 days).
* Refresh rotates the token; presenting an already-rotated token revokes the whole
  session (reuse detection).
* Each request re-loads the user: deactivation or `token_version` bump (password
  reset, role change of self) invalidates access tokens immediately.
* Passwords: Argon2id (`pwdlib`). Per-account lockout after 5 failures / 15 min, plus
  proxy-level rate limit on `/auth/*`.

## 5. RBAC

`User *─* Role *─* Permission`. Permissions are code-defined strings
(`orders.create`, …) seeded into the DB; roles are data. Routers declare
`Depends(require("orders.create"))`; nothing checks role names.

Anti-escalation rules (enforced in `services/staff.py`, `services/roles.py`):
1. You can only grant/assign a role whose permissions ⊆ your own permissions.
2. You can only create/edit a role to hold permissions ⊆ your own.
3. You cannot change your own roles, nor edit a role you currently hold.
4. You cannot modify/deactivate a user whose permissions ⊄ yours (e.g. a manager
   cannot touch the owner).
5. System roles (Owner) are immutable; the last active Owner cannot be removed.

Default roles: Owner (all), Administrator (all but roles.delete), Manager, Cashier,
Kitchen Staff, Floor Staff. Restaurant-wide changes (renaming the restaurant) require the
full permission set. Password resets require *strictly* more access than the target.

## 6. Domain state machines

**Table**: `AVAILABLE | OCCUPIED | RESERVED | CLEANING | BLOCKED`.
Invariant: `OCCUPIED ⇔ table has an active order` — `OCCUPIED` is only ever set by
opening an order and cleared by closing/cancelling/moving it. Manual status changes
are allowed only between the other four and only when no active order exists.
Paying the bill moves the table to `CLEANING`.

**Order** (a check for a table visit): `OPEN → BILLED → CLOSED`, `OPEN → CANCELLED`.
Rounds of items are added while `OPEN`. `BILLED` locks items (bill issued); voiding the
bill (no payments yet) returns it to `OPEN`. `CLOSED` only via full payment.

**Order item**: `PENDING (not yet fired) → SENT → PREPARING → READY → SERVED`;
`PENDING|SENT → VOIDED` (voiding sent items requires `orders.cancel`).
Item price, name and tax category are snapshotted at add time, so menu edits never
alter history. Unavailable items cannot be added; items already on an order keep
going.

**Kitchen ticket** (one per fire): `NEW → ACCEPTED → PREPARING → READY → COMPLETED`,
`NEW→PREPARING` allowed, `* → CANCELLED` when every item on it is voided / order
cancelled. Ticket transitions propagate to its items.

**Bill**: `OPEN (issued) → PAID`, `OPEN → VOID` (nothing held),
`PAID → REFUNDED / PARTIALLY_REFUNDED` via refund records. Multiple payments
(split tender) allowed; bill becomes `PAID` in the same transaction that makes
`net paid (payments − refunds) ≥ total`, which also closes the order and moves the table
to the configured after-payment status (`CLEANING` or `AVAILABLE`).
Refunds go back only on the method the money came in on (capped per method). A refund on a
still-`OPEN` bill is a *correction* (unwinding a mistaken payment, flagged `is_correction`)
so the bill can then be discounted or voided; corrections are not counted as sales refunds.
Rounding increments are limited to 0.01/0.05/0.10/0.25/0.50/1.00, and a positive amount is
never rounded to zero.

**Reports**: gross sales = totals of bills settled in range (local calendar days);
refunds = non-correction refunds made in range; net = gross − refunds (also per day).
Payment-method figures are money held per method (payments − refunds).

Bill math: `subtotal = Σ line totals (non-voided)`; `discount` (percent or fixed,
≤ subtotal, reason required); `service_charge = rate × (subtotal − discount)`;
each tax = `rate × (subtotal − discount + taxable service charge)` rounded per line;
`total = rounded to the location's rounding increment` with explicit `round_off`.

## 7. API

Prefix `/api/v1`. Resources: `/auth`, `/me`, `/users`, `/roles`, `/permissions`,
`/locations/current` (settings), `/tables`, `/table-areas`, `/menu/categories`,
`/menu/items`, `/orders`, `/kitchen/tickets`, `/bills`, `/payment-methods`,
`/reports`, `/audit-logs`, `/dashboard`, `/health`.
List endpoints: `?limit&cursor|offset&sort&filters`; responses `{items, total}`.
OpenAPI docs enabled only when `ENVIRONMENT != production`.

## 8. Android

Single module, packages `core/` (network, session, haptics, design system), `data/`
(DTOs, repositories), `domain/` (models, permission logic, state rules),
`feature/<name>/` (screen + ViewModel + components). Manual DI through an
`AppContainer` (Hilt adds build complexity without benefit at this size).

* UI state: sealed `UiState` per screen; ViewModels expose `StateFlow`, receive intents.
* Network: OkHttp + Retrofit + kotlinx.serialization. Authenticator refreshes once with
  a mutex; non-idempotent requests are never auto-retried; mutating money/state
  calls carry `Idempotency-Key`.
* Tokens: refresh token encrypted with an Android Keystore AES-GCM key, stored in
  DataStore. Access token kept in memory.
* Live data: polling (tables/kitchen/dashboard every 5–10 s while visible, lifecycle
  aware). Stale data shown with a "last updated" affordance on network failure;
  no offline writes (financial correctness beats offline convenience).
* Navigation: bottom bar (Floor, Orders, Kitchen, Billing — filtered by permission)
  + "More" hub (Menu, Reports, Staff, Roles, Settings, Audit). Routes are guarded by
  permission client-side *and* rejected server-side.
* Themes: exactly Light / Dark / Black, persisted; semantic token sets, not inversion.
* Haptics: `BistroHaptics` maps semantic events (Confirm, Success, Reject, Selection,
  Toggle, Destructive) to `HapticFeedbackConstants`, guarded by capability.

## 9. Deployment

* **Instance: t4g.small** (2 vCPU Graviton, 2 GiB, burstable). Budget: OS ~250 MB,
  Docker ~80 MB, Postgres tuned (`shared_buffers=128MB`) ~250 MB, 2 uvicorn workers
  ~250 MB, Caddy ~40 MB → ~0.9 GB, leaving headroom plus 1 GiB swap. t4g.micro (1 GiB)
  would swap under load with a colocated database; anything larger is idle capacity.
* Ubuntu 24.04 arm64, Docker Compose: `caddy`, `api`, `db`. Postgres is on an internal
  Docker network only. Caddy obtains a Let's Encrypt certificate for
  `<elastic-ip>.sslip.io` (swap for a real domain by editing one env var).
* Security group: 22 from the operator's IP only, 80 (ACME + redirect), 443.
* `restart: unless-stopped`, container healthchecks, Docker log rotation, nightly
  `pg_dump` with 7-day retention.
