# -----------------------------------------------------------
# Whiskey-DB Makefile
# Shortcuts for local dev, builds, tests, and releases
# -----------------------------------------------------------

# Variables (can be overridden, e.g. make release v=1.1.0)
VERSION ?= 1.1.0
DOCKER ?= docker

# --- HELP ---
help:
	@echo "Available targets:"
	@echo "  make web-dev        # Run Next.js dev server (port 3000)"
	@echo "  make api-dev        # Run FastAPI dev server (port 8000)"
	@echo "  make web-build      # Docker build web image"
	@echo "  make api-build      # Docker build api image"
	@echo "  make up             # Start stack via docker-compose"
	@echo "  make down           # Stop stack"
	@echo "  make api-test       # Run backend pytest suite"
	@echo "  make lint           # Run Ruff (API) and TypeScript check (web)"
	@echo "  make test           # Run full test suite (API pytest + web build check)"
	@echo "  make clean          # Remove build artifacts"
	@echo "  make release v=1.2.0  # Tag and push a new release"

# --- DEV ---
web-dev:
	cd web && npm run dev

api-dev:
	cd api && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# --- DOCKER BUILDS ---
web-build:
	$(DOCKER) build -t whiskey-web:dev ./web

api-build:
	$(DOCKER) build -t whiskey-api:dev ./api

# --- STACK ---
up:
	docker compose up -d --build

down:
	docker compose down

# --- TESTS ---
api-test:
	cd api && pytest -q --maxfail=1

test: api-test
	@echo "▶ Running frontend type-check and build..."
	cd web && npx tsc --noEmit && npm run build

# --- LINT ---
lint:
	cd api && ruff check .
	cd web && npx tsc --noEmit

# --- RELEASE ---
release:
	@git checkout main
	@git pull
	@git tag -a v$(VERSION) -m "Whiskey-DB v$(VERSION)"
	@git push origin v$(VERSION)
	@echo "✅ Tagged and pushed v$(VERSION). Draft release will update on GitHub."

# --- CLEAN ---
clean:
	rm -rf web/node_modules web/.next
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name "*.egg-info" -exec rm -rf {} +
