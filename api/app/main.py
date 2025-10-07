# api/app/main.py
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routers import auth, bottles, purchases, notes, retailers, valuation
from .routers.admin_prices import router as admin_prices_router
from .routers.admin_users import router as admin_users_router
from .routers.uploads import router as uploads_router, UPLOAD_DIR
from .settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Whiskey DB API", lifespan=lifespan)

# --- CORS (env-driven; cookie auth needs explicit allowed origins) ---
origins = [o.strip() for o in (settings.ALLOWED_ORIGINS or "").split(",") if o.strip()]
if not origins:
    origins = ["http://localhost:8080", "http://127.0.0.1:8080"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,
)

@app.get("/health")
def health():
    return {"status": "ok"}

# --- Routers (include BEFORE mounting /uploads static) ---
# Backend lives at ROOT (Case A) – paths like /auth/login, /bottles, /uploads/image, etc.
app.include_router(auth.router)
app.include_router(admin_users_router)
app.include_router(admin_prices_router)
app.include_router(bottles.router)
app.include_router(purchases.router)
app.include_router(notes.router)
app.include_router(retailers.router)
app.include_router(uploads_router)   # <-- must come before the /uploads static mount
app.include_router(valuation.router)

# --- Static mounts (mount AFTER the routers so POST /uploads/image is not shadowed) ---
_API_ROOT = Path(__file__).resolve().parents[1]
_STATIC_DIR = _API_ROOT / "static"
if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

# Serve uploads directly from /uploads using the resolved directory from uploads router.
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
