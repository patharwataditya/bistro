# Local setup (Windows, macOS, Linux)

Runs the whole system on one machine: **PostgreSQL** (database), the **FastAPI backend** (API)
and **Bistro Web** (React app). The Android app is optional and covered at the end.

| Piece | Runs at | Started with |
|---|---|---|
| PostgreSQL | `localhost:5544` | Docker (or a native install on port 5432) |
| Backend API | `http://127.0.0.1:8010` | `uv run uvicorn …` |
| Web app | `http://127.0.0.1:5173` | `npm run dev` (proxies `/api` to the backend) |

Demo sign-in after setup: **owner / bistro-demo-1** (also admin, manager, cashier, chef,
server — same password). These accounts exist only in your local database.

---

## 1. Install the tools

### Windows (PowerShell)

```powershell
winget install --id Git.Git -e
winget install --id astral-sh.uv -e            # Python tooling; installs Python 3.13 for you
winget install --id OpenJS.NodeJS.LTS -e       # Node 22 or newer (24 recommended)
winget install --id Docker.DockerDesktop -e    # for PostgreSQL; needs WSL 2 (Docker offers to enable it)
```

Close and reopen PowerShell so the new commands are on `PATH`, start **Docker Desktop** once
and wait until it says it's running, then check:

```powershell
git --version; uv --version; node --version; docker --version
```

If PowerShell refuses to run `npm` ("running scripts is disabled on this system"), allow
local scripts for your user once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### macOS / Linux

Install Git, [uv](https://docs.astral.sh/uv/getting-started/installation/), Node 22+ (24
recommended) and Docker with your package manager (for example `brew install git uv node`
plus Docker Desktop, or your distribution's packages).

## 2. Get the code

```powershell
git clone https://github.com/patharwataditya/bistro.git
cd bistro
```

## 3. Database

### Option A — Docker (recommended, same commands on every OS)

```powershell
docker run -d --name bistro-dev-db -e POSTGRES_USER=bistro -e POSTGRES_PASSWORD=bistro -e POSTGRES_DB=bistro -p 127.0.0.1:5544:5432 postgres:18-alpine
docker exec bistro-dev-db psql -U bistro -c "CREATE DATABASE bistro_test"
```

After a reboot, start it again with `docker start bistro-dev-db`.

### Option B — PostgreSQL installed natively (no Docker)

Install PostgreSQL 16 or newer (Windows: `winget install --id PostgreSQL.PostgreSQL.17 -e`, or
the installer from postgresql.org; remember the password you give the `postgres` user). Then
open **SQL Shell (psql)** (or `psql -U postgres`) and run:

```sql
CREATE ROLE bistro LOGIN PASSWORD 'bistro';
CREATE DATABASE bistro OWNER bistro;
CREATE DATABASE bistro_test OWNER bistro;
```

A native install listens on port **5432**, so in step 4 change the port in `backend\.env`
from `5544` to `5432`, and for the tests set the test URL too (see "Tests").

## 4. Backend (API)

```powershell
cd backend
uv sync                                   # creates .venv with Python 3.13 and all packages
Copy-Item .env.example .env               # macOS/Linux: cp .env.example .env
uv run alembic upgrade head               # creates the tables
uv run python -m app.cli demo             # demo restaurant, floor, menu and staff accounts
uv run uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

Leave this terminal running. Check it in a browser: `http://127.0.0.1:8010/api/v1/health`
should answer `{"status":"ok","database":"ok",…}`; interactive API docs are at
`http://127.0.0.1:8010/api/v1/docs`.

`.env` holds development settings only (`BISTRO_ENVIRONMENT=development`). Never put
production secrets in it; production configuration lives only on the server.

## 5. Web app

In a **second** terminal, from the repository root:

```powershell
cd web
npm ci
npm run dev
```

Open **http://127.0.0.1:5173** and sign in as `owner` / `bistro-demo-1`. The dev server
forwards `/api` to the backend on port 8010. If your backend runs elsewhere, set the target
before `npm run dev`:

```powershell
$env:BISTRO_API_TARGET = "http://127.0.0.1:8000"     # macOS/Linux: export BISTRO_API_TARGET=…
```

Try the other roles (`server`, `chef`, `cashier`, `manager`) to see how access differs; use
Light / Dark / Black from the top bar.

## 6. Tests and checks

Backend (the database from step 3 must be running):

```powershell
cd backend
uv run pytest
uv run ruff check app tests
uv run mypy app
```

With a native PostgreSQL on 5432, point the tests at it first:
`$env:BISTRO_DATABASE_URL = "postgresql+psycopg://bistro:bistro@localhost:5432/bistro_test"`.

Web:

```powershell
cd web
npm run typecheck
npm run lint
npm test                                  # unit and component tests (Vitest)
npx playwright install chromium           # once, for browser tests
npm run e2e                               # needs the backend (step 4) and `npm run dev` running
```

## 7. Android app (optional)

Open the `android` folder in Android Studio (it uses its bundled JDK). The app talks to the
URL in `android/gradle.properties` (`bistro.apiUrl`, HTTPS only). From a terminal:

```powershell
cd android
.\gradlew.bat :app:assembleDebug          # macOS/Linux: ./gradlew :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `connection refused` on port 5544 | Docker Desktop isn't running, or run `docker start bistro-dev-db`. |
| `port is already allocated` when starting PostgreSQL | Another container/service uses 5544: `docker ps`, or change `-p 127.0.0.1:5545:5432` and the port in `backend\.env`. |
| Web app shows "Can't reach Bistro" | The backend isn't running on 8010 (step 4), or set `BISTRO_API_TARGET`. |
| Sign-in fails with "Cross-site request refused" | Open the app at the same address the dev server prints (`http://127.0.0.1:5173` or `http://localhost:5173`), not through another proxy. |
| `npm` blocked in PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or run `npm.cmd`. |
| `uv` not found after installing | Reopen the terminal (PATH is read at start). |
| Reset the demo data | `docker rm -f bistro-dev-db`, then repeat steps 3 and 4. |
