# api/app/main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routers import auth, bottles, purchases, notes, retailers, valuation
from .routers.uploads import router as uploads_router
from .settings import settings

app = FastAPI(title="Whiskey DB API")

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

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/health")
def health():
    return {"status": "ok"}

# --- Routers (include BEFORE mounting /uploads static) ---
# Backend lives at ROOT (Case A) – paths like /auth/login, /bottles, /uploads/image, etc.
app.include_router(auth.router)
app.include_router(bottles.router)
app.include_router(purchases.router)
app.include_router(notes.router)
app.include_router(retailers.router)
app.include_router(uploads_router)   # <-- must come before the /uploads static mount
app.include_router(valuation.router)

# --- Static mounts (mount AFTER the routers so POST /uploads/image is not shadowed) ---
# Generic static (if used elsewhere)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve uploads directly from /uploads (backed by /data/uploads)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/data/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
