
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

## [1.0.1] - 2025-09-10
### Changed
- Minor updates to accommodate GitHub logic and CI/lint/pytest wiring
- Dockerfile fixes for web image build
- Initial pytest health test and CI integration

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
