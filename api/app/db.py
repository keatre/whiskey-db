import os
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.orm import sessionmaker, declarative_base

# Align default with docker-compose's volume path; still overridden by .env if set
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/whiskey.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    echo=False,
    pool_pre_ping=True,
)

def init_db():
    # Include all models so create_all() picks them up (adds User for auth)
    from .models import (
        Bottle,
        Purchase,
        TastingNote,
        Retailer,
        Tag,
        BottleTag,
        BottleAudit,
        User,  # <-- NEW: ensure users table is created
    )  # noqa

    SQLModel.metadata.create_all(engine)

    # --- lightweight auto-migration for sqlite to add missing columns ---
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
