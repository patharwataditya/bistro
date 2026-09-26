# Bistro — Restaurant Operations Manager

Android app (Kotlin/Compose) + FastAPI/PostgreSQL API for running tables, orders, the
kitchen, billing, staff access and reporting. Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md);
Android patterns: [docs/ANDROID_CONVENTIONS.md](docs/ANDROID_CONVENTIONS.md).

| Path | What |
|---|---|
| `backend/` | FastAPI app, Alembic migrations, pytest suite, Dockerfile |
| `android/` | Android app (`ai.synkrasis.bistro`) |
| `contract/enums.json` | State/permission/error values shared by both sides (tests on each side enforce it) |
| `deploy/` | EC2 provisioning, production compose (Caddy + API + Postgres), backups, redeploy |

## Backend

```sh
cd backend
uv sync                                    # Python 3.13
docker run -d --name bistro-dev-db -e POSTGRES_USER=bistro -e POSTGRES_PASSWORD=bistro \
  -e POSTGRES_DB=bistro -p 127.0.0.1:5544:5432 postgres:18-alpine
docker exec bistro-dev-db psql -U bistro -c "CREATE DATABASE bistro_test"
cp .env.example .env                       # BISTRO_ENVIRONMENT=development
uv run alembic upgrade head
uv run python -m app.cli demo              # demo data; accounts owner/admin/manager/cashier/chef/server, password bistro-demo-1
uv run uvicorn app.main:app --reload       # docs at /api/v1/docs (not exposed in production)

uv run pytest                              # API, RBAC, state machines, money, real-concurrency tests
uv run ruff check app tests && uv run mypy app
```

Configuration is environment-only (`BISTRO_*`, see `app/core/config.py`). Anything not explicitly
`development`/`test` runs as production and refuses to start with a weak or default JWT secret.

CLI (`python -m app.cli`): `sync` (permission catalog, runs on every start), `bootstrap`
(first restaurant + owner; password from `BISTRO_OWNER_PASSWORD`), `sample-floor`
(tables/menu/taxes, no accounts), `demo` (dev only), `purge-idempotency`.

## Android

```sh
cd android
./gradlew :app:assembleDebug               # API URL from gradle.properties `bistro.apiUrl` (HTTPS only)
./gradlew :app:testDebugUnitTest           # contract, decoding, session, error mapping, logic
./gradlew :app:recordRoborazziDebug        # JVM screenshots in Light/Dark/Black → app/build/outputs/roborazzi
./gradlew :app:lintDebug
```

## Deployment (AWS EC2)

* `deploy/provision.sh` — idempotently creates the key pair (`~/.ssh/bistro-key.pem`), security
  group (SSH from the operator's IP only; 80/443 public), a **t4g.small** Ubuntu 24.04 arm64
  instance (encrypted gp3, IMDSv2) and an Elastic IP. Writes non-secret facts to `deploy/state/`.
* `deploy/setup-server.sh` — runs on the host: swap, Docker, unattended upgrades, generates
  secrets into `deploy/.env.prod` **on the server only**, starts the stack, installs nightly
  `pg_dump` backups (7-day retention in `/var/backups/bistro`) and idempotency cleanup.
* `deploy/deploy.sh` — ship code changes and restart; migrations run on container start.
* TLS: Caddy obtains a Let's Encrypt certificate for `<elastic-ip>.sslip.io`. To use a real
  domain, point it at the Elastic IP, set `BISTRO_DOMAIN` in the server's `.env.prod`, and
  update `bistro.apiUrl`.

Production accounts created for testing are listed in `deploy/state/credentials.txt`
(git-ignored, local only). Change those passwords after testing.
