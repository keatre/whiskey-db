
## [1.1.2] - 2025-09-13
⚠️ **STATUS:** This is a **development branch**. Authentication/login is **not working reliably** and requires further debugging.  
Do **not** deploy this branch to production.

### Added
- **Automated backups** via a lightweight backup container using Restic:
  - Supports SMB/CIFS mount to a local NAS.
  - Nightly cron by default (configurable).
  - Retention policy (daily/weekly/monthly) configurable via `.env`.
- **Image storage & serving overhaul**:
  - All uploads are now stored under `/data/uploads` (bind mounted).
  - API serves images directly at `/uploads/<file>` and public URLs use `/api/uploads/<file>`.
  - New `apiPath()` helper ensures legacy paths still render.
  - Bottle detail page now has a resilient inline SVG fallback (no 404 flood).

### Changed
- `api/app/main.py` now mounts:
  - `/uploads` → serves `UPLOAD_DIR` (defaults to `/data/uploads`).
  - Kept `/static` for any non-upload assets.
- `api/app/routers/uploads.py` now returns URLs in the form `/<API_BASE>/uploads/<filename>`.
- `web/src/app/bottles/[id]/page.tsx`:
  - Uses `apiPath(bottle.image_url)` for safe URL normalization.
  - Inline fallback placeholder (no network) and prevents onError loops.
- `web/src/middleware.ts`:
  - Explicitly bypasses static/public assets (incl. `/favicon.ico`) to avoid unwanted interception.
- Added favicon + platform icons support (`web/public/*`) and metadata in `layout.tsx`.

### Added (maintenance)
- `api/scripts/normalize_image_urls.py` + `scripts/db-normalize-image-urls.sh`
  - One-shot DB migration to normalize existing `bottle.image_url` rows to `/api/uploads/<file>`.
  - Idempotent; supports dry-run and commit (`RUN=1`).

### Fixed
- First-run backup “permission denied”: ensure `/app/backup.sh` is executable and called via `sh`.
- Image 404 loops caused by missing placeholder—now replaced with an inline SVG.

### Notes / Migration
1. Place your favicon bundle in `web/public/` (e.g. from favicon.io).
2. Run the DB normalization **once**:
```bash
./scripts/db-normalize-image-urls.sh # dry-run
RUN=1 ./scripts/db-normalize-image-urls.sh # commit changes
```
3. Ensure `.env` contains the SMB settings and backup variables (see `.env.example` section below).
4. Bounce services:
```bash
docker compose up -d --build
```

---

## [v1.1.1-dev] - Development Branch (Unstable)

⚠️ **STATUS:** This is a **development branch**. Authentication/login is **not working reliably** and requires further debugging.  
Do **not** deploy this branch to production.

### Added
- Introduced `/signin` page to replace the old `/login` route.
- Implemented new `_LoginClient.tsx` with explicit `AuthApi.login` calls (no implicit form navigation).
- Added debug logging to LoginClient lifecycle and API calls.
- Added `DebugPanel` on sign-in page with direct buttons for:
  - `/api/ping`
  - `/api/health`
  - `/api/auth/login` (probe)
- Extended proxy route (`[...all]/route.ts`) with improved error logging.
- Introduced local `/api/echo` route for isolating page → Next.js fetch path.
- Updated `docker-compose.yml`:
  - Cleaned `depends_on` → now both `api` and `web` run independently on `appnet`.
  - Explicit aliases set for inter-container resolution.

### Changed
- Renamed `web/src/app/login/` → `web/src/app/signin/`.
- Updated imports and routing logic to point to `/signin`.
- Adjusted middleware to explicitly allow `/signin` route and avoid touching `/api/*`.

### Fixed
- None confirmed. Partial fixes attempted for proxy reliability.

### Known Issues
- **Login flow still inconsistent**:
  - `AuthApi.login` requests sometimes hang as `pending` in DevTools.
  - Inconsistent behavior between `/api/echo`, `/api/health`, and `/api/auth/login`.
  - Requests occasionally succeed once and then fail on retry.
- Possible culprits:
  - Middleware interfering with API routes.
  - Dev-mode HMR websockets exhausting socket pools.
  - Browser-side issues (service workers, extensions, or caching).
  - Proxy route sometimes not firing (`[Proxy] ENTER` missing).
- This must be revisited in the next development cycle (planned v1.1.2).

---

## [1.1.0] - 2025-09-12
### Added
- Username-based authentication (email optional as metadata).
- JWT auth with Access & Refresh tokens stored in HttpOnly cookies; configurable expiry, SameSite, and Secure flags.
- LAN guest mode (read-only from private IPs) when `ALLOW_LAN_GUEST=true`; external users must authenticate.
- Auth router: `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/refresh`.
- Admin bootstrap CLI (`api/app/bootstrap_admin.py`) seeded from `.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).
- Basic login throttling (per-IP sliding window + lockout) on `/auth/login`.
- Image upload endpoint (`/uploads/image`) restricted to admin; size limit via `UPLOAD_MAX_MB`, directory via `UPLOAD_DIR`.
- Next.js API proxy: rewrite `/api/:path*` → `${API_BASE}/:path*` (defaults to `http://api:8000` in Compose).
- Login page and header controls; Retailers nav is hidden for non-admins.

### Changed
- Switched login identifier from email to **username** throughout.
- Centralized settings with **pydantic-settings**; all configs come from the **top-level `.env`**.
- API write operations (bottles, purchases, notes, retailers, uploads) now require **admin** via shared deps.
- Web pages hide admin-only actions when not authenticated as admin (new/edit/delete, add purchase/note).
- Layout places Theme toggle and Auth control at right; nav hides Retailers for non-admins.
- Next.js build reads `API_BASE` at build time; browser uses `NEXT_PUBLIC_API_BASE=/api` for same-origin calls.

### Fixed
- Added `pydantic[email]` to satisfy email field types; resolved startup error for email validator.
- Added `pydantic-settings` to resolve `ModuleNotFoundError` on settings.
- Fixed `uploads` router to import `Depends` and enforce env-driven size limits.
- Fixed `NameError: require_view_access` in bottles router by importing from deps.

### Security
- Passwords hashed with bcrypt; no plaintext at rest.
- HttpOnly cookies for tokens; SameSite and Secure configurable via `.env`.
- Added basic rate limiting for login to slow brute-force attempts.

### Notes
- Rebuild **web** after changing `.env` (rewrites are read at build time):
docker compose build web && docker compose up -d web
- Recommended Compose: put `web` and `api` on the same bridge network; set `API_BASE=http://api:8000`; set `NEXT_PUBLIC_API_BASE=/api`.
- Health checks:
- API: `GET /health` → `{"status":"ok"}`
- Proxied: `GET /api/health` via the web container should also return `{"status":"ok"}`

---

## [1.0.1] - 2025-09-10
### Changed
- Minor updates to accommodate GitHub logic and CI/lint/pytest wiring
- Dockerfile fixes for web image build
- Initial pytest health test and CI integration

---

## [1.0.0] - 2025-09-09
### Added
- Bottle CRUD (create, edit, delete)
- Purchases tracking with pricing and status
- Mash bill & notes with full Markdown support (tables, lists, headers)
- Grouping bottles by **Style → Substyle**
- Market valuation lookup (UPC)
- Mobile-friendly frontend (Next.js 14)
- REST API backend (FastAPI + SQLModel + SQLite)
- Docker Compose setup (frontend + backend)

### Security
- `.env` example provided
- Default SQLite, but Postgres supported
- Notes on running behind TLS reverse proxy
