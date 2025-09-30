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
- Grouped bottle browser (by Style → Substyle → Brand/Expression)
- Mobile-friendly UI (Next.js 14, React 18, TypeScript)
- REST API powered by FastAPI + SQLModel
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

## 🛡️ Disaster Recovery to NAS (v1.1.2)

Backups run from the `backup` service and push snapshots to your NAS over SMB/CIFS. By default they are encrypted with Restic, but you can opt into plaintext `.tar.gz` archives by flipping `BACKUP_ENCRYPTED=false` in your `.env`.

### Setup
1. Copy `.env.example` → `.env` and fill:
   - `NAS_SMB_HOST`, `NAS_SMB_SHARE`
   - `NAS_SMB_USER`, `NAS_SMB_PASS`
   - `RESTIC_PASSWORD` (when `BACKUP_ENCRYPTED=true`, keep it safe)
   - Set `BACKUP_ENCRYPTED=false` for plaintext archives and optionally point `BACKUP_ARCHIVE_DIR` elsewhere.
   - Optionally tune `BACKUP_CRON`, retention, or enable `BACKUP_ON_START=true` for an immediate smoke-test run.
2. Bring the stack up:
   ```bash
   docker compose up -d

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
```
### 📦 Versioning
This repo uses [Semantic Versioning](https://semver.org/)

- Current stable: v1.0.0
- Future dev: feature branches → PR → ```main```
