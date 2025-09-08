from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .db import init_db
from .routers import bottles, purchases, notes, retailers, valuation
from .routers.uploads import router as uploads_router  # NEW

app = FastAPI(title="Whiskey DB API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/health")
def health():
    return {"status": "ok"}

# serve /static/* from ./static
app.mount("/static", StaticFiles(directory="static"), name="static")

# routers
app.include_router(bottles.router)
app.include_router(purchases.router)
app.include_router(notes.router)
app.include_router(retailers.router)
app.include_router(uploads_router)
app.include_router(valuation.router)
