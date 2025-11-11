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


def main() -> int:
    # Ensure tables exist
    init_db()

    # Validate env
    if not settings.ADMIN_USERNAME or not settings.ADMIN_PASSWORD:
        print("ERROR: Set ADMIN_USERNAME and ADMIN_PASSWORD in your top-level .env")
        return 1

    with Session(engine) as session:
        # Does a user with this username already exist?
        existing = session.exec(select(User).where(User.username == settings.ADMIN_USERNAME)).first()
        if existing:
            print(f"INFO: Admin user already exists: {settings.ADMIN_USERNAME}")
            return 0

        user = User(
            username=settings.ADMIN_USERNAME,
            email=getattr(settings, "ADMIN_EMAIL", None),  # optional
            password_hash=hash_password(settings.ADMIN_PASSWORD),
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.commit()
        print(f"OK: Admin user created: {settings.ADMIN_USERNAME}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
