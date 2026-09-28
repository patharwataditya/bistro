# Bistro Web — Security Design

Status: normative for the web client and the `/auth/web/*` endpoints. Reviewers use the
checklist at the end.

## 1. Threat model

| Asset | Threat | Primary control |
|---|---|---|
| Refresh token (30-day session) | XSS exfiltration, disk theft, logs | HttpOnly cookie, never in JS/storage, Caddy redacts `Cookie` |
| Access token (15 min JWT) | XSS use while page open | CSP, React hygiene; memory only, short TTL |
| Session integrity | CSRF on cookie endpoints, login CSRF, cookie tossing | Origin + custom header, `__Host-` cookie, no CORS |
| Session availability | Multi-tab refresh race triggering reuse detection | Web Locks single-flight (section 4) |
| Credentials | Brute force / spraying | Existing per-user+IP and per-IP throttle, shared by web login |
| Shared restaurant PCs | Next person inherits session | Short web session TTL, visible sign-out, "sign out everywhere" |
| UI | Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |

**Critical environmental fact:** `sslip.io` is **not** on the Public Suffix List (checked
2026-09-28). Every `*.sslip.io` host, which anyone can point at their own server, is
therefore *same-site* with `54-237-167-13.sslip.io`. As a result:
- `SameSite=Strict` does **not** stop requests from `https://evil-1-2-3-4.sslip.io`.
- Such a host can set cookies with `Domain=sslip.io`, which is cookie tossing and can
  fixate a session.

On this domain SameSite is only defence in depth. The real CSRF controls are the Origin
check and the custom header. The cookie must use the `__Host-` prefix. **Move to a
domain we own before general availability**, and keep all of these controls after the move.

XSS stays the dominant risk. HttpOnly stops an attacker from *stealing* the refresh token,
but injected script can still call `/auth/web/refresh` from our origin and act as the user
while the tab is open. CSP and the React rules in section 7 are the actual defence.

## 2. Token and session design

- **Access token:** kept only in a JS module variable (not React state that devtools
  persist, not storage). Sent as `Authorization: Bearer`. Each tab holds its own.
- **Refresh token:** an HttpOnly cookie, set and read only by `/auth/web/*`. It never
  appears in any JSON body, request or response.
- The web endpoints wrap the existing `services/auth.py` functions (`login`, `refresh`,
  `revoke_by_refresh_token`, `revoke_all_sessions`, `start_session`) and share one
  rotation/reuse/grace implementation with Android. The mobile endpoints (`/auth/refresh`,
  `/auth/revoke`) never read cookies. The web endpoints never accept a body token.

### Cookie (exact)

```
Set-Cookie: __Host-bistro_rt=<token>; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=<remaining web session seconds>
```

- **Why `__Host-` rather than `Path=/api/v1/auth/web`:** the browser guarantees that a
  `__Host-` cookie was set by this exact host with `Secure`, no `Domain` and `Path=/`, so a
  sibling `*.sslip.io` cannot plant or shadow it. The price is that the cookie rides on
  every same-origin request. That is harmless because only `/auth/web/*` reads it, and
  Caddy redacts `Cookie` in logs by default (never enable `log_credentials`). A narrow
  `Path` without the prefix is vulnerable to tossing, so the prefix wins.
- **Clearing:** `Set-Cookie: __Host-bistro_rt=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`.
- **Web session lifetime:** add a `ttl` parameter to `start_session`. Web uses 12 h
  absolute (one shift) plus a 2 h idle timeout, enforced on refresh via
  `session.last_used_at`. `Max-Age` equals the time left on the absolute lifetime.
  Android keeps 30 days.
- The server derives `device_label` itself (for example `"Web · Chrome on Windows"` from
  a parsed, truncated User-Agent). The client does not send it.

### Guards common to every `/auth/web/*` endpoint

These run before any database work, in this order:
1. `Origin` must be present and equal `BISTRO_WEB_ORIGIN` (for example
   `https://54-237-167-13.sslip.io`).
2. `X-Bistro-Client: web` must be present. Any custom header forces a CORS preflight
   cross-origin. The API sends no CORS headers, so the preflight fails.
3. If `Sec-Fetch-Site` is present, it must be `same-origin`.
4. POST only. Login requires `Content-Type: application/json`.

A failed guard returns **403** `{"error":{"code":"PERMISSION_DENIED","message":"Request blocked.","details":{}}}`
and never touches the cookie. This reuses an existing contract code, so `enums.json` is
unchanged.

All success and failure responses carry `Cache-Control: no-store`.

### Endpoints

**`POST /api/v1/auth/web/login`**, body `{"username","password"}`
- Calls `auth.login(db, username, password, derived_label, client_ip)` with the *same*
  `client_ip` derivation as `/auth/login`. It therefore shares both throttle keys
  (`login:{user}:{ip}` and `login-ip:{ip}`) with Android.
- If a valid `__Host-bistro_rt` is already present, revoke that session first, so a
  browser holds at most one session and a different user logging in kills the previous
  user's tabs.
- `200` `{"access_token","token_type":"bearer","expires_in":900}` plus `Set-Cookie`.
- `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED` (`details.retry_after_seconds`), `422 VALIDATION_ERROR`.

**`POST /api/v1/auth/web/refresh`**, no body
- No cookie: `401 UNAUTHENTICATED`.
- Unknown, reused, revoked or expired token: `401 UNAUTHENTICATED` plus the clearing cookie.
- Deactivated account: `403 ACCOUNT_INACTIVE` plus the clearing cookie.
- Success: `200` `{"access_token","token_type":"bearer","expires_in":900}` plus the rotated `Set-Cookie`.

**`POST /api/v1/auth/web/logout`**, no body
- Revokes the session named by the cookie (`revoke_by_refresh_token`). If a valid Bearer
  is also present, it revokes that session too.
- Always returns `204` plus the clearing cookie, whether or not a session was found.

**`POST /api/v1/auth/web/logout-all`** (new), requires Bearer
- `revoke_all_sessions(user)`, which revokes every device and bumps `token_version`.
- `204` plus the clearing cookie.

**`POST /api/v1/auth/web/password`** (new), web counterpart of `/me/password`
- Same service call and the same `password:{user_id}` throttle.
- Returns the access token only and sets the new cookie. `/me/password` must not be used
  by web, because it returns the refresh token in its body.

## 3. CSRF analysis

- **Bearer-authenticated API:** immune to CSRF. Browsers never attach `Authorization`
  automatically. No CORS middleware exists, and none may be added with
  `allow_credentials`. The `cors_origins` setting stays unused.
- **Cookie endpoints:** these are the only CSRF surface. The attacks are:
  - login CSRF (victim ends up signed in as the attacker)
  - forced logout
  - forced rotation, which is harmless because the attacker cannot read the response

  A form or simple request from any `*.sslip.io` site would carry the Strict cookie,
  because that site counts as same-site. The Origin check and the custom header block it.
  `fetch` with a custom header from any other origin triggers a preflight, and the
  preflight fails.
- **Refresh response readability:** only same-origin script can read it. No CORS means no
  cross-origin reads.
- **The remaining bypass is XSS**, which is covered in sections 1 and 7.

## 4. Multi-tab refresh coordination

### The risk

All tabs share one cookie jar and so one refresh chain.
- If two tabs refresh at once with `T0`, the server serialises them (`FOR UPDATE`). The
  second one lands in the 10 s grace path, which deletes `T1` and issues `T2`.
- If the responses arrive out of order, the jar can end up holding the deleted `T1`. The
  next refresh then returns 401 and forces a logout.
- A request carrying `T0` that is delayed more than 10 s after another tab's rotation is
  treated as reuse. That revokes the whole session for every tab and device.
- Restoring a browser with 6 Bistro tabs fires 6 refreshes simultaneously.

### Required design: single-flight across tabs with the Web Locks API

```ts
// auth/refresh.ts. The only code allowed to call /auth/web/refresh.
let inflight: Promise<string> | null = null;          // in-tab dedupe
export function refreshAccessToken(): Promise<string> {
  inflight ??= navigator.locks.request("bistro:refresh", async () => {
    const res = await fetchWithTimeout("/api/v1/auth/web/refresh", {
      method: "POST", credentials: "same-origin",
      headers: { "X-Bistro-Client": "web" },
    }, 8000);                                         // must be < server grace (10 s)
    ...                                               // set in-memory token, schedule next
  }).finally(() => { inflight = null; });
  return inflight;
}
```

- **Serialised, each tab gets its own access token.** The browser applies `Set-Cookie`
  before `fetch` resolves, so the next lock holder always sends the newest token. Only the
  lock holder ever sends a refresh request.
- **Timeout and retry:** client timeout 8 s, one immediate retry, both inside the same
  lock. A response lost after the server committed is then retried within the 10 s grace
  window and recovers instead of revoking.
- **Proactive refresh:** refresh at `expires_in − 60 s ± 15 s jitter`. Also refresh on
  `visibilitychange`/`online` when the token has expired.
- **Reactive refresh:** on `401 TOKEN_EXPIRED`, refresh once, then replay the request
  once. On any other 401, or a failed refresh, clear memory and go to `/login`. Never loop.
- **Optional optimisation:** the lock holder posts the new access token on the
  `BroadcastChannel("bistro:auth")`. A tab that enters the lock within 30 s of such a
  message adopts that token instead of refreshing. The channel is same-origin only, and
  XSS could read it anyway, so it adds no new exposure.
- **Fallback:** Web Locks has been baseline since 2022 and needs a secure context, which we
  have. If `navigator.locks` is missing, show "unsupported browser" rather than race.
- **Server:** keep the grace path as it is. Do not widen it to "fix" races; the lock is the
  fix.

## 5. Logout semantics

- **All tabs are one session.** Logout in any tab calls `/auth/web/logout`. That revokes
  the session server-side, and `get_actor` rejects the other tabs' access tokens
  immediately because `revoked_at` is checked on every request. The tab then posts
  `{type:"logout"}` on `bistro:auth`. Receiving tabs drop the token, clear the query cache
  and navigate to `/login`. Tabs that miss the message fail their next call with 401 and
  do the same.
- **"Log out this tab only" is not offered.** It would be illusory while the cookie
  remains.
- **"Sign out everywhere"** calls `/auth/web/logout-all` and covers all devices, including
  Android.
- **Login in another tab** posts `{type:"login", userId}`. A receiving tab showing a
  different user reloads.
- A deactivated account (`403 ACCOUNT_INACTIVE`) behaves like logout, with a message.

## 6. Headers (Caddy)

SPA responses:

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
```

Kept from the existing global block: HSTS, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.

`/api/v1/*` responses: add `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.

### CSP notes

- **React and motion libraries:** they set styles through the CSSOM
  (`element.style.x = …`), and CSP does not restrict that. So `style-src 'self'` works
  without `'unsafe-inline'`.
- **What is forbidden:** CSS-in-JS runtimes that inject `<style>` (emotion,
  styled-components runtime), motion features that inject `<style>` (for example
  `AnimatePresence mode="popLayout"`), inline `<script>` or `<style>` in `index.html`,
  and a theme "anti-flash" inline script. Put that script in `/theme-init.js` instead.
- **Fallback if a dependency truly needs it:** add `style-src-attr 'unsafe-inline'` only,
  after security review. Never add `'unsafe-inline'` or `'unsafe-eval'` to `script-src`.
- **`connect-src 'self'`** also covers same-host `wss:` in current browsers. If realtime
  is added, test it explicitly.
- **Trusted Types:** stage 2. Ship
  `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'` first. Enforce
  it once it is clean.

### Caching

- `index.html`: `Cache-Control: no-cache`.
- Hashed `/assets/*`: `public, max-age=31536000, immutable`.
- Auth responses: `no-store` (section 2).

### Caddy layout

Keep `handle /api/v1/*` first. Then:

```
handle {
    root * /srv/web
    @maps path *.map
    respond @maps 404
    try_files {path} /index.html
    file_server
}
```

Replace the current `respond "Bistro API"`.

## 7. XSS rules for React code

- No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `document.write`, `eval`, `new Function`, or string `setTimeout`. Enforce with ESLint
  (`react/no-danger`, `no-restricted-properties`, `no-implied-eval`).
- No HTML sanitiser is needed, because we never render HTML. All server data (menu names,
  notes, staff names) renders as text through JSX. Adding a sanitiser is a design change
  that needs review.
- **URLs:** any `href`, `src` or `window.open` built from data must go through
  `safeUrl()`, which parses with `new URL(x, location.origin)` and allows only `https:`,
  or same-origin relative paths. `javascript:`, `data:` and `vbscript:` are rejected.
  Internal navigation uses the router, never string-built `href`.
- External links use `rel="noopener noreferrer"`. `window.open(url, "_blank", "noopener,noreferrer")`.
- Never spread server objects into props (`<a {...data}>`).
- No `target` names derived from data. No `postMessage` listeners without an
  `event.origin === location.origin` check.
- **Dependencies:** no third-party scripts, CDNs, analytics or font services. Fonts are
  self-hosted `woff2`. Lockfile committed. `npm audit`/`osv-scanner` runs in CI. New
  dependencies are reviewed, with particular attention to anything touching the DOM or
  styles.

## 8. Browser storage

- **Never** in `localStorage`, `sessionStorage`, IndexedDB or the Cache API: access or
  refresh tokens, `/me` payload, permissions, usernames, orders, bills, customer data,
  audit data, persisted query caches, or form drafts containing customer/payment data.
- **Allowed**, under namespaced keys (`bistro.pref.*`) and validated on read as untrusted:
  appearance (light/dark/system), density, sidebar collapsed, last-used non-sensitive view
  or tab, locale.
- Permissions are UI hints only. The server enforces every permission.

## 9. Build, config, logging

- **Source maps:** `build.sourcemap: "hidden"`. Maps are archived as CI artifacts
  (private) for debugging, never copied to `/srv/web`. Caddy returns 404 for `*.map` as a
  backstop.
- **Env:** only `VITE_*` values reach the bundle, and everything in the bundle is public.
  The only allowed config is the public base path (`VITE_BASE_PATH=/`); the API base is
  always the relative `/api/v1`. No secrets, internal hosts, feature keys or absolute API
  URLs. CI fails if the built JS contains `BISTRO_`, `-----BEGIN` or `.env` values.
- **Console:** production builds strip `console.log/debug/info`. `console.error` may log
  the error `code` and `x-request-id` only. Never tokens, headers, request/response bodies,
  passwords, or user/customer data. The same rule applies to any in-app error reporter.
  No third-party error tracker, since that would need a CSP change.
- **Error handling:** branch on `error.code` from the envelope
  `{"error":{"code","message","details"}}`, and show `message`, which the server writes to
  be user-safe. Never render raw exception text.

## 10. Rate limiting

- Web login must call `auth.login()` with the same `client_ip` derivation. It then shares
  the per-user+IP limit (5 per 15 min) and the per-IP limit (30) with Android.
  `client_ip` is correct because uvicorn trusts `X-Forwarded-For` only from `172.30.0.0/24`
  (Caddy).
- **Shared restaurant NAT:** web and tablets share the `login-ip` bucket, so a brute force
  from inside the restaurant locks out everyone for 15 min. This is accepted. The UI shows
  `retry_after_seconds`.
- `/auth/web/password` shares `password:{user_id}`.
- `/auth/web/refresh` and `/auth/web/logout` do no Argon2 work, and tokens have 256-bit
  entropy, so no throttle is needed. Monitor `refresh_token_reuse` warnings instead.
- The UI disables the submit button while a request is in flight and never auto-retries
  login.

## 11. Existing backend issues affecting web

1. **`sslip.io` is not a public suffix.** Other `*.sslip.io` hosts are same-site and can
   toss cookies (section 1). Move to an owned domain before general availability.
2. **Token responses lack `Cache-Control: no-store`.** This affects `/auth/login`,
   `/auth/refresh` and `/me/password`, which are Android today. Add it to all of them.
3. **`/me/password` returns a `refresh_token` in JSON.** Web needs `/auth/web/password`
   (section 2).
4. **No self-service "sign out everywhere".** `revoke_all_sessions` is only reachable
   through a password change or staff administration. Add `logout-all`.
5. **A single 30-day refresh TTL for all clients** is too long for shared browsers. Add a
   per-client TTL and an idle timeout.
6. **`docker-entrypoint.sh` defaults `--forwarded-allow-ips` to `*`** when
   `BISTRO_TRUSTED_PROXIES` is unset. This fails open: if the API port is ever exposed,
   spoofed `X-Forwarded-For` bypasses the per-IP throttle. Default to `127.0.0.1`.
7. **`Settings.cors_origins` is dead config.** Remove it, or document that CORS must stay
   off.
8. **The grace path deletes the unreceived successor.** Combined with a shared cookie jar
   and out-of-order responses, that can strand a tab on a deleted token. Section 4 is
   mandatory, not optional.
9. **API responses carry no CSP.** Add the minimal policy in section 6.
10. **In the refresh grace path, an `AccountInactive` does not revoke the session**, unlike
    the normal path. Harmless (it still fails) but inconsistent.

## 12. Reviewer checklist

- [ ] Refresh token never appears in JS, JSON bodies, storage, logs or console.
- [ ] Cookie is exactly `__Host-bistro_rt; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=…`; it is cleared on logout, on 401 from refresh, and on `ACCOUNT_INACTIVE`.
- [ ] Every `/auth/web/*` enforces Origin == `BISTRO_WEB_ORIGIN`, `X-Bistro-Client: web` and `Sec-Fetch-Site`; failure returns 403 with no DB work. Tests cover a missing Origin, a foreign `*.sslip.io` Origin and a missing header.
- [ ] Web login and password change share the existing throttle keys and IP derivation.
- [ ] Mobile endpoints ignore cookies; web endpoints ignore body tokens.
- [ ] All `/auth/web/*` and token responses send `Cache-Control: no-store`.
- [ ] No CORS middleware.
- [ ] Refresh only through `refreshAccessToken()` (Web Locks, 8 s timeout, one retry, in-tab dedupe). No other `fetch` to `/auth/web/refresh`.
- [ ] Logout broadcasts on `bistro:auth`; other tabs clear the token and caches.
- [ ] CSP header matches section 6 exactly. No `'unsafe-inline'` or `'unsafe-eval'`. No inline script or style in `index.html`. No `<style>`-injecting libraries.
- [ ] No `dangerouslySetInnerHTML`/`innerHTML`/`eval` (ESLint enforced). Every data-derived URL goes through `safeUrl()`.
- [ ] No third-party origins anywhere (fonts, scripts, images, analytics).
- [ ] Storage contains only `bistro.pref.*` UI preferences.
- [ ] No `.map` files in the deployed bundle, and `*.map` returns 404.
- [ ] Only `VITE_BASE_PATH` in env; the bundle secret scan passes.
- [ ] Production console output is limited to error code and request ID.
