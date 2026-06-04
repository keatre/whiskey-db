#!/usr/bin/env python3
"""
Seed the first admin user into the database using top-level .env values.

Required .env keys:
  ADMIN_USERNAME=jdoe
  ADMIN_PASSWORD=SuperSecret123
Optional:
  ADMIN_EMAIL=john.doe@gmail.com

Usage:
  - Inside Docker:  docker compose exec whiskey python -m app.bootstrap_admin
  - Host machine:   cd api && python -m app.bootstrap_admin
"""

from sqlmodel import Session, select
from .db import init_db, engine
from .models import User
from .settings import settings
from .security import hash_password


def ensure_admin_user(
    session: Session,
    *,
    username: str,
    password: str,
    email: str | None = None,
) -> tuple[bool, str]:
    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        return False, f"INFO: Admin user already exists: {username}"

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    session.add(user)
    session.commit()
    return True, f"OK: Admin user created: {username}"


def bootstrap_admin_from_settings(*, initialize_db: bool = True, startup: bool = False) -> int:
    if initialize_db:
        init_db()

    username = (settings.ADMIN_USERNAME or "").strip()
    password = settings.ADMIN_PASSWORD or ""
    email = getattr(settings, "ADMIN_EMAIL", None) or None

    if not username:
        if startup:
            return 0
        print("ERROR: Set ADMIN_USERNAME and ADMIN_PASSWORD in your top-level .env")
        return 1

    if not password:
        if startup:
            print("WARN: ADMIN_USERNAME is set but ADMIN_PASSWORD is empty; skipping admin bootstrap.")
            return 0
        print("ERROR: Set ADMIN_USERNAME and ADMIN_PASSWORD in your top-level .env")
        return 1

    with Session(engine) as session:
        _, message = ensure_admin_user(
            session,
            username=username,
            password=password,
            email=email,
        )
    print(message)
    return 0


def main() -> int:
    return bootstrap_admin_from_settings()


if __name__ == "__main__":
    raise SystemExit(main())
