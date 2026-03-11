import os
from sqlmodel import SQLModel, create_engine, Session

# Align default with docker-compose's volume path; still overridden by .env if set
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/whiskey.db")
WINE_DATABASE_URL = os.getenv("WINE_DATABASE_URL", "sqlite:////data/wine.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    echo=False,
    pool_pre_ping=True,
)

wine_engine = create_engine(
    WINE_DATABASE_URL,
    connect_args={"check_same_thread": False} if WINE_DATABASE_URL.startswith("sqlite") else {},
    echo=False,
    pool_pre_ping=True,
)

_wine_initialized = False

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

            _migrate_users_table(conn)

def init_wine_db():
    global _wine_initialized
    if _wine_initialized:
        return
    from .wine_models import WineSQLModel  # noqa: F401
    WineSQLModel.metadata.create_all(wine_engine)
    _wine_initialized = True

def get_session():
    with Session(engine) as session:
        yield session


def get_wine_session():
    init_wine_db()
    with Session(wine_engine) as session:
        yield session


def _migrate_users_table(conn):
    result = conn.exec_driver_sql(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users';"
    ).scalar()
    if not result:
        return

    needs_migration = False
    if "role IN ('admin','guest')" in result:
        needs_migration = True
    if "email TEXT UNIQUE" in result or "email TEXT NOT NULL" in result:
        needs_migration = True
    if "username TEXT" in result and "UNIQUE" not in result:
        needs_migration = True

    if not needs_migration:
        return

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS users__tmp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin','user')),
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    rows = conn.exec_driver_sql(
        "SELECT id, username, email, password_hash, role, is_active, created_at FROM users"
    ).fetchall()

    for row in rows:
        rid, username, email, password_hash, role, is_active, created_at = row
        username = (username or "").strip()
        if not username:
            fallback = (email or "").split("@")[0].strip()
            username = fallback or f"user_{rid}"

        role = role or "user"
        if role == "guest":
            role = "user"

        email = (email or None)
        if email:
            email = email.strip() or None

        conn.exec_driver_sql(
            "INSERT INTO users__tmp (id, username, email, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (rid, username, email, password_hash, role, is_active, created_at),
        )

    conn.exec_driver_sql("DROP TABLE users")
    conn.exec_driver_sql("ALTER TABLE users__tmp RENAME TO users")
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_users_username ON users (username)")
