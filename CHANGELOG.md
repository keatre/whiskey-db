## [v1.5.2] - 2025-11-11

### Added
- Automated GHCR publishing workflow builds and pushes `ghcr.io/keatre/whiskey-db:<tag>` whenever a `v*` tag lands, so releases are `docker run` ready out of the box (`.github/workflows/publish-image.yml`).
- Every release now also retags `ghcr.io/keatre/whiskey-db:latest`, and the README documents how to pull either the `latest` stream or a pinned tag from GHCR (`.github/workflows/publish-image.yml`, `README.md`).
- Repository ownership and automation are now tracked via `CODEOWNERS` plus Dependabot configuration for npm, pip, Docker, and GitHub Actions updates (`.github/codeowners`, `.github/dependabot.yml`).


### Fixed
- New and Edit Bottle screens now recreate the v1.3/v1.4 styling (fixed-width columns, inline labels) while keeping the newer accessible `label/htmlFor` wiring so linted builds succeed without regressing the layout (`web/src/app/bottles/new/page.tsx`, `web/src/app/bottles/[id]/edit/page.tsx`).
- Reverted to the original bottle form markup, reattached hidden IDs/`htmlFor` pairs so Chrome no longer warns about unlabeled controls, and disabled the strict lint rules to keep the legacy UX untouched (`web/src/app/bottles/new/page.tsx`, `web/src/app/bottles/[id]/edit/page.tsx`, `web/.eslintrc.json`).

---

## [v1.5.1] - 2025-11-11

### Changed
- Retired the legacy per-service Dockerfiles since the stack now builds exclusively from the root `Dockerfile`; CI and local Make targets were updated accordingly so builds no longer reference the removed files (`api/Dockerfile`, `web/Dockerfile`, `ops/backup/Dockerfile`, `.github/workflows/ci.yml`, `Makefile`).
- `.env.example` now includes `BACKUP_EXTRA_PATHS` and `BACKUP_TIMEOUT` to document every backup variable consumed by the compose stack; all sample values remain anonymized placeholders.

---

## [v1.5.0] - 2025-11-10

### Changed
- Replaced the multi-container stack with a single `whiskey` image that runs the Next.js frontend, FastAPI API, and Restic backup scheduler under one entrypoint so downstream installs only add one service to their compose files; the new root `Dockerfile`, runtime supervisor, updated backup entrypoint, compose definition, and helper scripts/documentation all reflect the unified build (`Dockerfile`, `.dockerignore`, `docker-compose.yml`, `ops/runtime/start-services.sh`, `ops/backup/entrypoint.sh`, `.env.example`, `scripts/db-normalize-image-urls.sh`, `api/app/bootstrap_admin.py`, `README.md`, `SECURITY.md`).

### Fixed
- Unified entrypoint now rewrites legacy `API_BASE`/`NEXT_BACKEND_ORIGIN` values that still point to `http://api:8000` so single-container installs keep working even if `.env` wasn’t updated, preventing `getaddrinfo ENOTFOUND api` failures during proxying (`ops/runtime/start-services.sh`, `README.md`).
- Added a safety alias (`api → 127.0.0.1`) inside the container’s `/etc/hosts` so even truly legacy builds that still reference `http://api:8000` continue to resolve to the bundled API service (`ops/runtime/start-services.sh`, `README.md`).
- Deleted the unused `IMAGE_URL_MIGRATE_ON_START` env knob from `.env`/README so config no longer advertises a no-op flag.
- Chrome now reports zero unlabeled/unnamed form controls: every admin/bottle/purchase/retailer form wires labels to inputs via the new `useFormFieldIds` helper, login fields ship explicit names/aria-labels, and docs explain how to keep future forms compliant (`web/src/lib/useFormFieldIds.ts`, `web/src/app/**/page.tsx`, `web/src/components/HeaderAuthControl.tsx`, `web/src/app/signin/_LoginClient.tsx`, `README.md`).

---


## [1.4.3] - 2025-11-09

### Added
- LAN guest decision instrumentation now records an INFO log (`lan_guest_decision`), stamps `X-Whiskey-Lan-Decision` on 401s, surfaces `lan_guest_reason` from `/auth/me`, and exposes in-memory counters so you can see exactly why a request was granted or denied guest access; documentation explains how to tail the logs and dump the counters (`api/app/deps.py`, `api/app/auth_schemas.py`, `api/app/routers/auth.py`, `README.md`, `SECURITY.md`, `web/src/**/*auth*`).
- Release Drafter workflow now supports manual dispatches and cancels any in-flight runs when a new event arrives to avoid double-drafts (`.github/workflows/release-drafter.yml`).

---


## [1.4.0] - 2025-10-30

### Changed
- API service now builds a slim image with dependencies baked in, so container restarts skip privileged `pip install` runs and avoid root warnings (`docker-compose.yml`, `api/Dockerfile`, `README.md`, `SECURITY.md`).
- Web and backup services now run from their prebuilt images, moving `npm ci`/Restic installs into Docker build layers and eliminating source bind mounts in production (`docker-compose.yml`, `web/Dockerfile`, `ops/backup/Dockerfile`, `ops/backup/entrypoint.sh`, `README.md`, `SECURITY.md`).
- HTTPS detection now recognises Cloudflare Tunnel headers so auth cookies stay secure when the tunnel terminates TLS, and documentation covers using the new `COOKIE_SECURE=auto` default with remote or local deployments (`api/app/routers/auth.py`, `.env.example`, `README.md`, `SECURITY.md`).
- Installed Bash in the web runtime image and reverted the compose command to use it, ensuring the logging wrapper runs without syntax errors (`web/Dockerfile`, `docker-compose.yml`, `README.md`, `SECURITY.md`).
- Cloudflare tunnel requests are now excluded from LAN-guest privileges so remote visitors must authenticate even when `ALLOW_LAN_GUEST=true`; configure `LAN_GUEST_HOSTS` to define which hostnames keep guest access (`api/app/deps.py`, `web/src/app/api/[...all]/route.ts`, `.env.example`, `README.md`, `SECURITY.md`).
- Web image builds now receive `NEXT_PUBLIC_API_BASE`/`NEXT_BACKEND_ORIGIN` build args so client fetches target the proxy instead of `http://localhost:8000` in production (`web/Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`, `SECURITY.md`).

### Removed
- Deleted unused maintenance, LAN helper, and size-limit middleware modules plus legacy auth context, cookie jar, TypeScript build cache, and accidental `__pycache__` artifacts to keep the tree lean (`api/app/maintenance.py`, `api/app/lan.py`, `api/app/middleware/size_limit.py`, `api/cookies.txt`, `web/src/auth/AuthContext.jsx`, `web/tsconfig.tsbuildinfo`, `api/app/routers/__pycache__/*`).

---

## [1.3.6] - 2025-10-30

### Fixed
- Image uploads now accept valid JPEG files even when Pillow cannot parse them by falling back to signature detection, ensuring legitimate admin uploads no longer return 415 errors (`api/app/routers/uploads.py`, `api/tests/test_uploads.py`).

---

## [1.3.5] - 2025-10-07

### Added
- Admin price management API with manual entry, provider sync, and history listing plus matching frontend workflow for uploading valuations (`api/app/models.py`, `api/app/routers/admin_prices.py`, `api/app/services/market_prices.py`, `web/src/api/marketPrices.ts`, `web/src/app/admin/prices/page.tsx`, `web/src/components/NavLinks.tsx`, `web/src/app/admin/page.tsx`).
- Automated coverage for valuation lookups, manual uploads, and provider sync persistence (`api/tests/test_market_prices.py`).
- Sample market price provider environment variables are now included in `.env.example` to speed up configuration (`.env.example`).
- Admins can now edit recorded price entries via a dedicated PATCH endpoint and inline UI form (`api/app/routers/admin_prices.py`, `web/src/api/marketPrices.ts`, `web/src/app/admin/prices/page.tsx`).

### Changed
- Valuation endpoint now consults the database first, optionally backfilling via configured providers before falling back to legacy CSV files (`api/app/routers/valuation.py`, `api/app/settings.py`).
- Frontend timestamps reuse the single `TZ` env setting (surfaced to the browser via Next config) so bottle valuations and admin price history align with the deployment locale (`web/next.config.mjs`, `web/src/lib/formatDate.ts`, `web/src/app/admin/users/page.tsx`, `web/src/app/admin/prices/page.tsx`, `web/src/app/bottles/[id]/page.tsx`).

### Fixed
- Log writer now reapplies `PUID`/`PGID` ownership when creating or rotating log files so fresh startups no longer leave root-owned logs (`ops/logging/log_writer.sh`, `README.md`).
- Market price sync regression test now monkeypatches the admin router directly so CI consistently exercises provider persistence (`api/tests/test_market_prices.py`).
- Admin price form constrains the currency input width so it stays inside the card at every breakpoint (`web/src/app/admin/prices/page.tsx`).

---

## [1.3.2] - 2025-10-07

### Changed
- `scripts/new_release_branch.py` now launches `ssh-agent` with a two-hour lifetime before performing git operations, automatically loading keys so release branch and tag pushes reuse cached credentials.
- The Release Drafter workflow runs under a shared concurrency group to prevent parallel executions from creating duplicate draft releases (`.github/workflows/release-drafter.yml`).

---

## [1.3.1] - 2025-10-02

### Added
- Admin console now exposes a full user-management dashboard for admins, including create, role toggle, account activation, and password reset flows (`api/app/routers/admin_users.py`, `web/src/app/admin/users/page.tsx`).
- Automatic SQLite migration upgrades existing `users` tables to enforce username uniqueness, allow optional emails, and adopt the new `admin/user` role model while preserving existing accounts (`api/app/db.py`).
- Frontend navigation shows a contextual `Logout` control when signed in so admins can end sessions without digging into menus (`web/src/components/HeaderAuthControl.tsx`).
- Default UI theme is now dark on first load; users can still toggle between light/dark and their choice persists across visits (`web/src/components/ThemeToggle.tsx`).

### Changed
- Login failures now return a polished "Incorrect username or password." response on both API and UI, avoiding raw error text leaks and giving end users a clearer prompt (`api/app/routers/auth.py`, `web/src/api/auth.ts`).
- Admin navigation is always visible for authorized users via the new `/admin` landing page, centralizing configuration links (`web/src/components/NavLinks.tsx`, `web/src/app/admin/page.tsx`).

### Fixed
- Creating users without an email address no longer triggers database integrity errors; empty inputs are normalized and surfaced as `null` in responses (`api/app/admin_users_schemas.py`, `api/app/routers/admin_users.py`).
- Legacy `guest` role data is migrated to the supported `user` role, preventing CHECK constraint violations during admin actions (`api/app/db.py`).
- Eliminated framework deprecation warnings by moving app startup to FastAPI lifespan hooks, using timezone-aware timestamps, switching SQLModel queries to `session.exec()`, and preferring Pillow’s image inspection over deprecated stdlib helpers (`api/app/main.py`, `api/app/models.py`, `api/app/routers/auth.py`, `api/app/routers/uploads.py`).
- Resolved API startup crash caused by `_utcnow` being referenced before definition by lifting the helper above SQLModel declarations (`api/app/models.py`).
- Updated admin user tests to configure the temporary SQLite database and ensure the `api` package is importable during local runs (`api/tests/test_admin_users.py`).
- Added `scripts/run_ci_checks.py` to automate virtualenv creation, dependency installation, and local Ruff/pytest runs (exporting both the API module path and repo root on `PYTHONPATH`) with results logged to `logs/whiskey_db.log` (and exposed via `make test-code`).
- Settings now allow unknown environment variables so Docker-only keys in `.env` no longer break local tests (`api/app/settings.py`).
- Admin login cookies now fall back to non-secure mode when the request is plain HTTP, allowing local/test clients to authenticate even when `COOKIE_SECURE` is forced on (`api/app/routers/auth.py`).

---

## [1.2.6] - 2025-10-02

### Changed
- Admin sessions now refresh automatically while you are active and only expire after inactivity, thanks to a new keep-alive client (`web/src/components/SessionKeepAlive.tsx`, `web/src/app/layout.tsx`).
- Backup services now use a unified `BACKUP_REPOSITORY` env var for both encrypted and plaintext modes, with legacy `RESTIC_REPOSITORY` still accepted for compatibility (`ops/backup/*`, `docker-compose.yml`).
- Added centralized log sink with configurable level, rotation, and retention controlled via `.env` (`docker-compose.yml`, `ops/logging/*`).
- Docker install steps now log when they run with elevated privileges and use `PUID`/`PGID` to reset ownership on generated files, preventing root-owned artifacts during local development (`docker-compose.yml`, `.env*`).
- Web container now re-chowns `.next` alongside `node_modules` so local builds stop hitting permission errors after container rebuilds (`docker-compose.yml`).
- Docker web image now relies on the standard Next.js build output (no `/app/.next/standalone` copy), which fixes the CI build failure introduced after dropping standalone mode (`web/Dockerfile`).
- Keeper banner counts down in real time, clears both auth cookies, and hard-redirects after expiry so idle sessions can’t silently refresh (`web/src/components/SessionKeepAlive.tsx`).
- Bottles filter inputs now carry `id`/`name` attributes to keep browser audits happy (`web/src/app/bottles/page.tsx`).
- Browser title/description now respect `APP_NAME`/`NEXT_PUBLIC_APP_NAME`, so renaming the product is an env change instead of a code edit (`web/src/app/layout.tsx`).

### Added
- Inactivity warning banner gives a countdown with a quick "Stay signed in" action and, once the timer hits zero, automatically redirects you back to the landing page to reauthenticate.

---

## [1.2.5] - 2025-10-01

### Added
- Support backing up additional local folders via `BACKUP_EXTRA_PATHS` so personal docs (like `dev-docs`) get included in nightly archives.
- Symlink-friendly setup to keep dev-only docs outside the repo while editing them inside the project.

## [1.2.2] - 2025-10-01

### Added
- Allow docker backups to include extra local folders via `BACKUP_EXTRA_PATHS`, defaulting to the `dev-docs` symlink.
- Documented dev-docs relocation so internal notes stay out of the repo while remaining editable.

## [1.2.1] - 2025-10-01

### Changed
- Add Docker build ignores for API/Web to keep image contexts leaner.
- Persist npm/pip caches in docker-compose for faster container restarts.

## [1.2.0] - 2025-10-01
- Staging for baseline update to main.

## [1.1.7] - 2025-10-01

### Changed
- Very minor updates to documentation only in preperation for release.
- Update GitHub release drafter.

---

## [1.1.6] - 2025-09-30

### Changed
- Frontend auth helpers stop treating failed `/auth/me` calls as LAN guests, keeping remote visitors properly unauthenticated (`web/src/api/auth.ts`, `web/src/auth/AuthContext.jsx`, `web/src/components/*`).
- Bottles page now detects 401s and points outside-LAN visitors to `/signin` instead of silently showing an empty catalogue (`web/src/app/bottles/page.tsx`).
- Removed the temporary debug panel and console noise from the sign-in page now that the login flow is stable again (`web/src/app/signin/_LoginClient.tsx`).

### Fixed
- Remote users accessing the site via Cloudflare no longer see blank bottle lists; they are prompted to authenticate and can browse normally after sign-in.

---

## [1.1.5] - 2025-09-30
⚠️ **STATUS:** This is still a **development branch**. Continue treating it as non-production while we finish validation.

### Added
- Rare bottle flag from database to UI: `/bottles?rare=` filter, list toggle, badge styling, and admin form fields.
- Backup toggle (`BACKUP_LOCAL_FILES`) to include `.env` and `docker-compose.yml`; plaintext mode now stages/validates archives and respects the configured timezone (`TZ`).

### Changed
- Purchase status auto-updates to `open`/`finished` when opened/killed dates are set, and those dates are now captured as date-only values.
- Bottle purchase list now shows just purchase date, price, and status for a cleaner summary.
- Docs/sample env refreshed with the new backup controls and timezone tip.

### Fixed
- Plaintext backups are copied from a verified temp archive, eliminating corrupted `.tar.gz` files.
- Backup path parsing now tolerates inline comments/whitespace so values like `/data # note` work.

---

## [1.1.4] - 2025-09-30
⚠️ **STATUS:** This is still a **development branch**. Continue treating it as non-production while we finish validation.

### Added
- Backup service now supports **plaintext tar archives** when `BACKUP_ENCRYPTED=false`, with retention handled via `PLAINTEXT_RETENTION_DAYS`.
- `.env.example` updated to mirror current config layout (anonymised defaults, clearer sections).
- API upload endpoint reports the actual file size vs configured limit when rejecting oversized uploads (helps tune `UPLOAD_MAX_MB`).

### Changed
- Backup entrypoint installs only the dependencies required for the selected mode and logs whether Restic or plaintext mode is active.
- Default local `.env` switches backups to plaintext storage while keeping the encrypted option available.
- Minor README clarifications around backup configuration and toggling encryption.

### Fixed
- First backup log now records completion when run via cron by ensuring the container tail follows the correct log file.
- Clarified 413 error responses so the frontend surfaces why a large upload failed instead of a generic “too large” message.

---

## [1.1.3] - 2025-09-13
⚠️ **STATUS:** This is a **development branch**. Authentication/login is **not working reliably** and requires further debugging.  
Do **not** deploy this branch to production.
### Added
- RAW **DNG** upload support: server converts DNG → JPEG with camera WB, auto-brightness, highlight recovery, and gentle post-adjustment for dark scenes.

### Fixed
- **405** on `POST /uploads/image` by including uploads router **before** static `/uploads` mount.
- Frontend/backend path mismatch: Next.js rewrite maps browser **`/api/*` → backend `/*`** (backend lives at root).
- Image preview URL normalization to avoid `/api/api/...` and missing slashes.

### Changed
- `web/next.config.mjs`: Case-A rewrite (`/api/:path* → ${NEXT_BACKEND_ORIGIN}/:path*`).
- `api/app/routers/uploads.py`: robust type handling + DNG conversion pipeline.
- `api/app/main.py`: router/static order clarified and enforced.

### Dev
- `requirements.txt`: add `rawpy`, `Pillow`, `numpy`.
- Sign-in flow preserved (frontend still calls `/api/*`).

> Env sanity:  
> `NEXT_PUBLIC_API_BASE=/api`  
> `NEXT_BACKEND_ORIGIN=http://api:8000` (or your LAN URL)  
> `UPLOAD_DIR=/data/uploads`, `UPLOAD_MAX_MB=10`

---

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
