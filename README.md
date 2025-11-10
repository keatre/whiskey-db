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
> The single `whiskey` service now bundles the FastAPI API, Next.js frontend, and scheduled backups. Rebuild it with `docker compose build whiskey` whenever you change backend requirements (`api/requirements.txt`), frontend dependencies (`web/package*.json`), or the backup scripts under `ops/backup/`.

Access:
- Frontend: http://localhost:8080
- API: http://localhost:8000/docs

### 🌐 Cloudflare Tunnel (Optional)
- Deploy the Cloudflare Tunnel agent alongside this stack and point it at the `whiskey` service (`http://whiskey:3000`) so TLS terminates at Cloudflare.
- Keep `COOKIE_SECURE=auto` (default) to emit Secure cookies only when requests arrive over HTTPS; local-only installs can override to `false` for plain HTTP.
- Ensure `TRUSTED_PROXIES` in `.env` includes the IP ranges that present requests (the defaults cover 127.0.0.1 and common private ranges used by the tunnel client).
- To lock down admin access for remote users, layer Cloudflare Access or another identity-aware proxy in front of `/admin` routes while leaving LAN guests untouched.
- Requests that pass through Cloudflare no longer qualify for LAN-guest viewing; they now require authentication even if `ALLOW_LAN_GUEST=true`, while direct LAN access keeps the guest experience.
- The proxy route adds `x-whiskey-via=cloudflare` when Cloudflare headers are present so the API can enforce the remote-only auth path; no extra configuration is required.
- Configure `LAN_GUEST_HOSTS` (comma-separated hostnames) to list the origins that should keep LAN guest access; leave the defaults for localhost-only development or add your LAN hostname/IP as needed.
- FastAPI now emits a `lan_guest_decision` log (INFO) whenever LAN guest access is granted or denied, including the host/IP/reason. Tail `docker compose logs -f whiskey | grep lan_guest_decision` while testing, or snapshot counters with:

  ```bash
  docker compose exec whiskey python - <<'PY'
  from app.deps import lan_guest_metrics_snapshot
  print(lan_guest_metrics_snapshot())
  PY
  ```
- 401 responses now include `X-Whiskey-Lan-Decision` and `/auth/me` exposes a `lan_guest_reason` field so you can see exactly why a browser was treated as “remote” (e.g., `host_not_allowed`, `cloudflare_forced_auth`).
- When building the unified image, the compose file forwards `NEXT_PUBLIC_API_BASE` and `NEXT_BACKEND_ORIGIN` build args so client-side fetches target the proxy (`/api`). Update those values in `.env` before running `docker compose build whiskey` if your deployment uses different URLs.

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
- The **Market prices** page records manual price uploads, triggers one-off provider syncs, lets you adjust the latest stored valuation, and lists the freshest price per UPC. Configure external lookups with `MARKET_PRICE_PROVIDER_URL` (supports `{upc}` templating), optional `MARKET_PRICE_PROVIDER_API_KEY`, `MARKET_PRICE_PROVIDER_NAME`, and `MARKET_PRICE_PROVIDER_TIMEOUT_SECONDS`. See `.env.example` for sample values.
- Use the in-page `Logout` button to end your session quickly, especially on shared devices.
- The UI now opens in dark mode by default; the theme toggle in the header lets you switch to light mode as needed and remembers your preference.

## 🛡️ Disaster Recovery to NAS (v1.1.2)

Backups now run inside the primary `whiskey` service and push snapshots to your NAS over SMB/CIFS. By default they are encrypted with Restic, but you can opt into plaintext `.tar.gz` archives by flipping `BACKUP_ENCRYPTED=false` in your `.env`.

### Setup
1. Copy `.env.example` → `.env` and fill:
   - `APP_NAME` / `NEXT_PUBLIC_APP_NAME` to control the app/browser title (defaults to “Whiskey DB”).
   - `ACCESS_TOKEN_EXPIRE_MINUTES` sets the admin session lifetime for both backend and frontend (override via `NEXT_PUBLIC_SESSION_IDLE_MINUTES` only when testing shorter windows).
   - `COOKIE_SECURE=true` locks cookies to HTTPS; leave `COOKIE_DOMAIN` unset unless you need cross-subdomain auth.
   - `BACKUP_REPOSITORY` (path inside the container where your NAS is mounted, e.g. `/remote/restic-whiskey-db`)
   - `RESTIC_PASSWORD` (when `BACKUP_ENCRYPTED=true`, keep it safe)
   - Set `TZ=America/Chicago` (or your preferred zone); the frontend reuses this value for localized timestamps (bottle valuations, admin price history, etc.).
   - Set `BACKUP_ENCRYPTED=false` for plaintext archives and optionally point `BACKUP_ARCHIVE_DIR` elsewhere.
   - Flip `BACKUP_LOCAL_FILES=true` when you want backups to bundle your top-level `.env` and `docker-compose.yml` alongside the database.
   - Optionally tune `BACKUP_CRON`, retention, or enable `BACKUP_ON_START=true` for an immediate smoke-test run.
   - Mount your NAS share on the Docker host (e.g. `/mnt/restic-whiskey-db`) and ensure `docker-compose.yml` binds it into the container at `/remote`.
   - Configure logging with `LOG_LEVEL` (`none`, `error`, `info`, `debug`), `LOG_FILE_PATH` (default `/logs/whiskey_db.log`), `LOG_MAX_MB`, and `LOG_RETENTION_DAYS`.
   - (Optional) Set `PUID`/`PGID` so the install steps can reset ownership on generated files after running with elevated privileges.
2. Bring the stack up:
   ```bash
   docker compose up -d
   ```

## 📜 Logging

All core processes stream through a shared log sink that writes to `LOG_FILE_PATH` (defaults to `/logs/whiskey_db.log`, mounted from the host `./logs` directory).

- `LOG_LEVEL` controls what gets persisted: `none` keeps Docker-only logs, `error` records stderr only, `info` (default) captures normal activity, and `debug` keeps everything.
- The log includes ISO8601 timestamps, service name (`API`, `WEB`, `BACKUP`), and severity.
- Files auto-rotate once they reach `LOG_MAX_MB` (default 10 MB). Historical files are timestamped and trimmed after `LOG_RETENTION_DAYS`.
- Docker Compose binds the host `./logs` folder into every service; create it (or point `LOG_FILE_PATH` elsewhere) before deploying.
- When `PUID`/`PGID` are set, the log writer ensures both the active log file and its lock are owned by that user, preventing root-owned artifacts on restart.
- Host access is just a bind mount, so secure the `logs/` directory and include it in your backup policy if desired.

## 🧰 Environment Variables

### Core Service Parameters

| Environment Variable | Purpose | Default |
| --- | --- | --- |
| `APP_NAME` | Application name surfaced on the backend (emails, logs). | `Whiskey DB` |
| `NEXT_PUBLIC_APP_NAME` | Frontend-visible app name, injected into the bundle. | `Whiskey DB` |
| `API_HOST` | Address FastAPI listens on inside the container. | `0.0.0.0` |
| `API_PORT` | Port FastAPI binds to. | `8000` |
| `API_BASE` | Backend origin the Next.js proxy forwards to. | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_API_BASE` | Browser base path used by the frontend when calling the API (served via the `/api` proxy). | `/api` |
| `NEXT_BACKEND_ORIGIN` | Origin baked into the unified image for server rewrites (set before `docker compose build whiskey`). | `http://127.0.0.1:8000` |
| `TZ` | IANA timezone applied to API timestamps and the backup scheduler. | `America/Chicago` |
| `DATABASE_URL` | SQLModel database connection string. | `sqlite:////data/whiskey.db` |
| `SECRET_KEY` | JWT signing key for auth tokens (replace in production). | `change-me-please` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access-token lifetime in minutes. | `20` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh-token lifetime in days. | `30` |
| `JWT_COOKIE_NAME` | Name of the access-token cookie. | `access_token` |
| `JWT_REFRESH_COOKIE_NAME` | Name of the refresh-token cookie. | `refresh_token` |
| `COOKIE_SECURE` | `auto`, `true`, or `false`; controls whether cookies carry the Secure flag. | `auto` |
| `COOKIE_SAMESITE` | SameSite policy for auth cookies. | `lax` |
| `COOKIE_DOMAIN` | Optional domain scope for cookies (leave unset for host-only). | *(unset)* |
| `CF_TUNNEL_TOKEN` | Cloudflare Tunnel token (if using the bundled `cloudflared` service). | *(unset)* |

### Access Control / Networking

| Environment Variable | Purpose | Default |
| --- | --- | --- |
| `ALLOW_LAN_GUEST` | Permit read-only access from trusted LAN addresses when unauthenticated. | `true` |
| `TRUSTED_PROXIES` | Comma-separated CIDRs whose `X-Forwarded-For` headers are honored. | `127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` |
| `LAN_GUEST_HOSTS` | Hostnames that still receive LAN guest access (even behind tunnels). | `localhost,127.0.0.1` |
| `LOGIN_WINDOW_SECONDS` | Sliding window for login attempt tracking. | `60` |
| `LOGIN_MAX_ATTEMPTS` | Failed attempts allowed per window before lockout. | `10` |
| `LOGIN_LOCKOUT_SECONDS` | Lockout duration once attempts are exceeded. | `180` |
| `ALLOWED_ORIGINS` | CORS whitelist for the API. | `http://localhost:8080,http://127.0.0.1:8080` |

### Uploads & Media

| Environment Variable | Purpose | Default |
| --- | --- | --- |
| `UPLOAD_MAX_MB` | Maximum image upload size (MB). | `100` |
| `UPLOAD_DIR` | Directory where uploaded assets are stored. | `/data/uploads` |
| `IMAGE_URL_MIGRATE_ON_START` | Run legacy URL normalization on startup when true. | `true` |

### Logging & Runtime User

| Environment Variable | Purpose | Default |
| --- | --- | --- |
| `LOG_LEVEL` | Granularity captured by the shared log writer (`none`, `error`, `info`, `debug`). | `info` |
| `LOG_FILE_PATH` | Location of the aggregated log file (mounted from host). | `/logs/whiskey_db.log` |
| `LOG_MAX_MB` | Rotate log file after this many megabytes. | `10` |
| `LOG_RETENTION_DAYS` | Retain rotated logs for this many days. | `14` |
| `PUID` / `PGID` | Host user/group IDs applied to generated files (optional). | *(unset)* |

### Backups (Restic / Plain Tar)

| Environment Variable | Purpose | Default |
| --- | --- | --- |
| `BACKUP_ENABLED` | Toggle scheduled backups. | `true` |
| `BACKUP_SOURCE` | Path mounted into the container for snapshotting. | `/data` |
| `BACKUP_REPOSITORY` | Destination path for restic repos or plaintext archives. | `/remote/restic-whiskey-db` |
| `BACKUP_ENCRYPTED` | Choose encrypted restic (`true`) or plaintext tar archives (`false`). | `true` |
| `BACKUP_ARCHIVE_DIR` | Target directory for plaintext archives when encryption is disabled. | `/remote/whiskey-db-plain` |
| `RESTIC_PASSWORD` | Restic repository password (required when encrypted). | *(unset)* |
| `RESTIC_KEEP_DAILY` | Daily snapshots retained by restic. | `7` |
| `RESTIC_KEEP_WEEKLY` | Weekly snapshots retained. | `4` |
| `RESTIC_KEEP_MONTHLY` | Monthly snapshots retained. | `12` |
| `PLAINTEXT_RETENTION_DAYS` | Days to keep plaintext archives. | `30` |
| `BACKUP_CRON` | Cron schedule for recurring backups. | `0 3 * * *` |
| `BACKUP_TAG` | Optional label applied to snapshots. | `whiskey-db` |
| `BACKUP_LOCAL_FILES` | Include `.env` and `docker-compose.yml` in snapshots when mounted. | `false` |
| `BACKUP_ON_START` | Run an immediate backup when the container boots. | `false` |

### Optional Integrations

| Environment Variable | Purpose | Default |
| --- | --- | --- |
| `MARKET_PRICE_PROVIDER_URL` | External API endpoint for bottle valuations (`{upc}` templated). | *(unset)* |
| `MARKET_PRICE_PROVIDER_API_KEY` | API key for the valuation provider. | *(unset)* |
| `MARKET_PRICE_PROVIDER_NAME` | Friendly provider label shown in the UI. | *(unset)* |
| `MARKET_PRICE_PROVIDER_TIMEOUT_SECONDS` | Timeout for valuation HTTP requests. | `8` |


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
Prefer `docker compose build whiskey` (or `docker compose up --build whiskey`) after changing backend requirements, frontend dependencies, or the backup scripts so the unified image stays current; create a local `docker-compose.override.yml` if you need to bind-mount the source directories for hot reloads.


### 📦 Versioning
This repo uses [Semantic Versioning](https://semver.org/)

- Current stable: v1.3.6
- Future dev: feature branches → PR → ```main```
