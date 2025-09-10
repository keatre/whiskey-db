import os
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./whiskey.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    echo=False,
)

def init_db():
    from .models import Bottle, Purchase, TastingNote, Retailer, Tag, BottleTag, BottleAudit  # noqa
    SQLModel.metadata.create_all(engine)

    # --- NEW: lightweight auto-migration for sqlite to add missing columns ---
    if DATABASE_URL.startswith("sqlite"):
        with engine.begin() as conn:
            # Add 'mashbill_markdown' to 'bottle' if missing
            cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info('bottle');")}
            if "mashbill_markdown" not in cols:
                conn.exec_driver_sql("ALTER TABLE bottle ADD COLUMN mashbill_markdown TEXT")
            if "proof" not in cols:
                conn.exec_driver_sql("ALTER TABLE bottle ADD COLUMN proof REAL")

def get_session():
    with Session(engine) as session:
        yield session
