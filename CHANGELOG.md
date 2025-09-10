
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