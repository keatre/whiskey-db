# api/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routers import auth, bottles, purchases, notes, retailers, valuation
from .routers.uploads import router as uploads_router
from .settings import settings

app = FastAPI(title="Whiskey DB API")

# --- CORS (env-driven; required for cookie auth from the web app) ---
# settings.ALLOWED_ORIGINS is a comma-separated list, e.g.:
# "http://461weston.ddns.net:8080,http://192.168.4.55:8080,http://localhost:8080"
origins = [o.strip() for o in (settings.ALLOWED_ORIGINS or "").split(",") if o.strip()]

# Fallbacks for dev if the env var is empty
if not origins:
    origins = ["http://localhost:8080", "http://127.0.0.1:8080"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      # must be explicit when allow_credentials=True
    allow_credentials=True,     # required so API can set JWT cookies
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,               # nicer preflight caching
)

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/health")
def health():
    return {"status": "ok"}

# Serve uploaded images, etc.
app.mount("/static", StaticFiles(directory="static"), name="static")

# Routers
app.include_router(auth.router)
app.include_router(bottles.router)
app.include_router(purchases.router)
app.include_router(notes.router)
app.include_router(retailers.router)
app.include_router(uploads_router)
app.include_router(valuation.router)
