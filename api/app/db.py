import os
from sqlmodel import SQLModel, create_engine, Session

# Align default with docker-compose's volume path; still overridden by .env if set
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/whiskey.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    echo=False,
    pool_pre_ping=True,
)

def init_db():
    # Import models module so SQLModel metadata includes every table
    from . import models  # noqa: F401

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
            if "is_rare" not in cols:
                conn.exec_driver_sql("ALTER TABLE bottle ADD COLUMN is_rare INTEGER DEFAULT 0 NOT NULL")

def get_session():
    with Session(engine) as session:
        yield session
