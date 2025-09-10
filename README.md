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