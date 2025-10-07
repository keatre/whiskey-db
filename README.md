# Whiskey-DB 🥃
Self-hosted database for cataloging and valuing your whiskey collection.

[![GitHub release](https://img.shields.io/github/v/release/keatre/whiskey-db)](https://github.com/keatre/whiskey-db/releases)
![CI](https://github.com/keatre/whiskey-db/actions/workflows/ci.yml/badge.svg)

## ✨ Features
- Add, edit, and delete bottles with brand, expression, style, region, distillery, ABV, age, size, release year
- Upload bottle images
- Mash bill & tasting notes with full **Markdown support** (tables, lists, headers, etc.)
- Purchases tracking with quantity, price, and status
- Market valuation API (UPC lookup)
- Admin price management (manual uploads plus optional provider sync)
- Grouped bottle browser (by Style → Substyle → Brand/Expression)
- Mobile-friendly UI (Next.js 14, React 18, TypeScript)
- REST API powered by FastAPI + SQLModel
- Admin console for managing users (create, disable, reset credentials)
- SQLite by default (Postgres optional)

## 🚀 Getting Started

### Prerequisites
- Docker + Docker Compose
- Node.js 20 (if building outside Docker)
- Python 3.12 (if building outside Docker)

### Setup
Clone the repo:
```bash
git clone https://github.com/keatre/whiskey-db.git
cd whiskey-db
```
Create your .env file (see .env.example):
```bash
cp .env.example .env
```
Start the stack:
```bash
docker compose up -d --build
```
Access:
- Frontend: http://localhost:8080
- API: http://localhost:8000/docs

### 📚Usage
- Navigate to Bottles to browse by style
- Click + New Bottle to add
- Edit/Delete bottles from their detail page
- Add mash bill or notes using Markdown (tables, lists, headings, etc.)
- Track purchases with quantity & price
- UPC lookup auto-fetches current market values

#### Admin Console
- Visit `/admin` (link in the top navigation when signed in) to reach operational tools.
- The **User management** section lets administrators invite new users, toggle roles, activate/deactivate accounts, and issue password resets. All passwords are hashed with Argon2 before storage.
- The **Market prices** page records manual price uploads, triggers one-off provider syncs, and lists the latest valuation per UPC. Configure external lookups with `MARKET_PRICE_PROVIDER_URL` (supports `{upc}` templating), optional `MARKET_PRICE_PROVIDER_API_KEY`, `MARKET_PRICE_PROVIDER_NAME`, and `MARKET_PRICE_PROVIDER_TIMEOUT_SECONDS`.
- Use the in-page `Logout` button to end your session quickly, especially on shared devices.
- The UI now opens in dark mode by default; the theme toggle in the header lets you switch to light mode as needed and remembers your preference.

## 🛡️ Disaster Recovery to NAS (v1.1.2)

Backups run from the `backup` service and push snapshots to your NAS over SMB/CIFS. By default they are encrypted with Restic, but you can opt into plaintext `.tar.gz` archives by flipping `BACKUP_ENCRYPTED=false` in your `.env`.

### Setup
1. Copy `.env.example` → `.env` and fill:
   - `APP_NAME` / `NEXT_PUBLIC_APP_NAME` to control the app/browser title (defaults to “Whiskey DB”).
   - `ACCESS_TOKEN_EXPIRE_MINUTES` sets the admin session lifetime for both backend and frontend (override via `NEXT_PUBLIC_SESSION_IDLE_MINUTES` only when testing shorter windows).
   - `COOKIE_SECURE=true` locks cookies to HTTPS; leave `COOKIE_DOMAIN` unset unless you need cross-subdomain auth.
   - `BACKUP_REPOSITORY` (path inside the backup container where your NAS is mounted, e.g. `/remote/restic-whiskey-db`)
   - `RESTIC_PASSWORD` (when `BACKUP_ENCRYPTED=true`, keep it safe)
   - Set `TZ=America/Chicago` (or your preferred zone) so backup timestamps follow your local time.
   - Set `BACKUP_ENCRYPTED=false` for plaintext archives and optionally point `BACKUP_ARCHIVE_DIR` elsewhere.
   - Flip `BACKUP_LOCAL_FILES=true` when you want backups to bundle your top-level `.env` and `docker-compose.yml` alongside the database.
   - Optionally tune `BACKUP_CRON`, retention, or enable `BACKUP_ON_START=true` for an immediate smoke-test run.
   - Mount your NAS share on the Docker host (e.g. `/mnt/restic-whiskey-db`) and ensure `docker-compose.yml` binds it into the backup container at `/remote`.
   - Configure logging with `LOG_LEVEL` (`none`, `error`, `info`, `debug`), `LOG_FILE_PATH` (default `/logs/whiskey_db.log`), `LOG_MAX_MB`, and `LOG_RETENTION_DAYS`.
   - (Optional) Set `PUID`/`PGID` so the install steps can reset ownership on generated files after running with elevated privileges.
2. Bring the stack up:
   ```bash
   docker compose up -d

## 📜 Logging

All application containers stream through a shared log sink that writes to `LOG_FILE_PATH` (defaults to `/logs/whiskey_db.log`, mounted from the host `./logs` directory).

- `LOG_LEVEL` controls what gets persisted: `none` keeps Docker-only logs, `error` records stderr only, `info` (default) captures normal activity, and `debug` keeps everything.
- The log includes ISO8601 timestamps, service name (`API`, `WEB`, `BACKUP`), and severity.
- Files auto-rotate once they reach `LOG_MAX_MB` (default 10 MB). Historical files are timestamped and trimmed after `LOG_RETENTION_DAYS`.
- Docker Compose binds the host `./logs` folder into every service; create it (or point `LOG_FILE_PATH` elsewhere) before deploying.
- Host access is just a bind mount, so secure the `logs/` directory and include it in your backup policy if desired.

### 🔐Security Notes
- Default DB is SQLite (local file under /data/)
- For production, configure Postgres + TLS reverse proxy
- See SECURITY.md

### 🛠 Development
```bash
cd web
npm run dev

cd api
uvicorn app.main:app --reload

# Run combined lint/tests (creates .venv, installs deps, logs to logs/whiskey_db.log)
./scripts/run_ci_checks.py
```
### 📦 Versioning
This repo uses [Semantic Versioning](https://semver.org/)

- Current stable: v1.0.0
- Future dev: feature branches → PR → ```main```
