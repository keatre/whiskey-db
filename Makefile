# -----------------------------------------------------------
# Whiskey-DB Makefile
# Shortcuts for local dev, builds, tests, and releases
# -----------------------------------------------------------

# Variables (can be overridden, e.g. make release v=1.1.0)
VERSION ?= 1.1.0
DOCKER ?= docker

PR_VERSION_RAW := $(shell awk 'match($$0, /^## \[([0-9]+\.[0-9]+\.[0-9]+)\]/, m) {print m[1]; exit}' CHANGELOG.md)
PR_VERSION := $(strip $(PR_VERSION_RAW))
ifeq ($(PR_VERSION),)
PR_VERSION := local
endif
PR_BRANCH := pr/pr-ready-v$(PR_VERSION)

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
	@echo "  make prepare-pr     # Stash dev docs, create PR branch, and push"
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

.PHONY: prepare-pr
prepare-pr:
	@echo "📦 Stashing dev-only docs so PR diff stays clean"
	@paths=""; \
	doc_status=$$(git status --porcelain -- dev-docs 2>/dev/null || true); \
	if [ -n "$$doc_status" ]; then \
		paths="dev-docs $$paths"; \
	fi; \
	roadmap_status=$$(git status --porcelain -- ROADMAP.md 2>/dev/null || true); \
	if [ -n "$$roadmap_status" ]; then \
		paths="ROADMAP.md $$paths"; \
	fi; \
	if [ -n "$$paths" ]; then \
		git stash push --include-untracked -- $$paths >/dev/null && echo "   • Stashed $$paths"; \
	else \
		echo "   • No dev-only docs to stash"; \
	fi
	@if ! git diff --quiet || ! git diff --cached --quiet; then \
		echo "   ! Working tree still has other changes. Commit or stash them before preparing the PR."; \
		exit 1; \
	fi
	@branch="$(PR_BRANCH)"; \
	current_branch=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$current_branch" != "$$branch" ]; then \
		echo "🌿 Creating PR branch $$branch"; \
		git checkout -B "$$branch"; \
	else \
		echo "🌿 Already on PR branch $$branch"; \
	fi
	@echo "🚀 Pushing $(PR_BRANCH) to origin"
	@git push -u origin "$(PR_BRANCH)"
	@echo "✅ PR branch ready. Run 'git stash pop' after the PR to restore docs."
