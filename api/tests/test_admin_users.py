from __future__ import annotations

import os
import tempfile

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import engine, init_db
from app.main import app
from app.models import User
from app.security import hash_password


def _configure_test_db() -> None:
    fd, path_str = tempfile.mkstemp(prefix="test-admin-users", suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path_str}"


_configure_test_db()


def bootstrap_admin(username: str = "root", password: str = "AdminPass123!") -> None:
    init_db()
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            existing.password_hash = hash_password(password)
            existing.role = "admin"
            existing.is_active = True
            session.add(existing)
        else:
            session.add(
                User(
                    username=username,
                    email="root@example.com",
                    password_hash=hash_password(password),
                    role="admin",
                    is_active=True,
                )
            )
        session.commit()


def login(client: TestClient, username: str = "root", password: str = "AdminPass123!") -> None:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200


def test_admin_routes_require_admin_role():
    bootstrap_admin()
    client = TestClient(app)
    # Not logged in -> should fail
    response = client.get("/admin/users")
    assert response.status_code == 403

    # Login as admin and ensure success
    login(client)
    response = client.get("/admin/users")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload and payload[0]["username"] == "root"


def test_admin_user_crud_flow():
    bootstrap_admin()
    client = TestClient(app)
    login(client)

    # Root admin details
    resp = client.get("/admin/users")
    assert resp.status_code == 200
    users = resp.json()
    root = next(u for u in users if u["username"] == "root")

    # Cannot deactivate the only admin
    resp = client.patch(f"/admin/users/{root['id']}", json={"is_active": False})
    assert resp.status_code == 400

    # Create a regular user
    new_user_payload = {
        "username": "casey",
        "email": "casey@example.com",
        "password": "TempPass123!",
        "role": "user",
    }
    create_resp = client.post("/admin/users", json=new_user_payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["username"] == "casey"
    assert created["role"] == "user"
    user_id = created["id"]

    # Password stored as hash
    with Session(engine) as session:
        db_user = session.get(User, user_id)
        assert db_user is not None
        assert db_user.password_hash != new_user_payload["password"]
        assert db_user.password_hash.startswith("$argon2")

    # Duplicate username rejected
    dup_resp = client.post("/admin/users", json=new_user_payload)
    assert dup_resp.status_code == 400

    # Promote to admin
    promote = client.patch(f"/admin/users/{user_id}", json={"role": "admin"})
    assert promote.status_code == 200
    assert promote.json()["role"] == "admin"

    # Now we can deactivate the original root admin (not last admin anymore)
    deactivate_root = client.patch(f"/admin/users/{root['id']}", json={"is_active": False})
    assert deactivate_root.status_code == 200

    # The promoted admin cannot demote themselves if they are the last active admin
    demote = client.patch(f"/admin/users/{user_id}", json={"role": "user"})
    assert demote.status_code == 400

    # Re-activate root for cleanliness
    reactivate_root = client.patch(f"/admin/users/{root['id']}", json={"is_active": True})
    assert reactivate_root.status_code == 200

    # Password reset endpoint
    reset_resp = client.post(f"/admin/users/{user_id}/password", json={"password": "NewSecret123!"})
    assert reset_resp.status_code == 200
    with Session(engine) as session:
        db_user = session.get(User, user_id)
        assert db_user is not None
        assert db_user.password_hash != "NewSecret123!"
        assert db_user.password_hash.startswith("$argon2")

    # Create user without email should succeed and expose null email
    create_no_email = client.post(
        "/admin/users",
        json={
            "username": "noemail",
            "password": "NoEmailPass123!",
            "role": "user",
        },
    )
    assert create_no_email.status_code == 201
    no_email_payload = create_no_email.json()
    assert no_email_payload["email"] is None

    # Clearing email via update should also work
    patch_email = client.patch(f"/admin/users/{user_id}", json={"email": None})
    assert patch_email.status_code == 200
    assert patch_email.json()["email"] is None
