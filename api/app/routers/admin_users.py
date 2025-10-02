"""Admin-only user management endpoints."""

from __future__ import annotations

from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..admin_users_schemas import (
    UserCreate,
    UserOut,
    UserPasswordUpdate,
    UserUpdate,
)
from ..db import get_session
from ..deps import require_admin
from ..models import User
from ..security import hash_password

router = APIRouter(
    prefix="/admin/users",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


def _list_active_admin_ids(session: Session) -> Iterable[int]:
    stmt = select(User.id).where(User.role == "admin", User.is_active.is_(True))
    return list(session.exec(stmt))


def _ensure_username_available(session: Session, username: str, *, skip_id: int | None = None) -> None:
    stmt = select(User).where(User.username == username)
    existing = session.exec(stmt).first()
    if existing and existing.id != skip_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")


def _normalize_username(value: str) -> str:
    username = value.strip()
    if len(username) < 3:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Username must be at least 3 characters")
    return username


def _sanitize_email(value: str | None) -> str | None:
    if value is None:
        return None
    email = value.strip()
    return email or None


def _get_user(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("", response_model=list[UserOut])
def list_users(session: Session = Depends(get_session)):
    stmt = select(User).order_by(User.username.asc())
    return session.exec(stmt).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, session: Session = Depends(get_session)):
    username = _normalize_username(payload.normalized_username())
    _ensure_username_available(session, username)
    email = _sanitize_email(payload.email)

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, session: Session = Depends(get_session)):
    user = _get_user(session, user_id)

    if "role" in payload.model_fields_set and payload.role is not None and payload.role != user.role:
        if user.role == "admin" and payload.role != "admin":
            active_admin_ids = _list_active_admin_ids(session)
            if len(active_admin_ids) <= 1 and user.id in active_admin_ids:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the last active admin")
        user.role = payload.role

    if "is_active" in payload.model_fields_set and payload.is_active is not None and payload.is_active != user.is_active:
        if user.role == "admin" and payload.is_active is False:
            active_admin_ids = _list_active_admin_ids(session)
            if len(active_admin_ids) <= 1 and user.id in active_admin_ids:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate the last active admin")
        user.is_active = payload.is_active

    if "email" in payload.model_fields_set:
        email = _sanitize_email(payload.email)
        user.email = email

    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/{user_id}/password")
def update_password(user_id: int, payload: UserPasswordUpdate, session: Session = Depends(get_session)):
    user = _get_user(session, user_id)
    user.password_hash = hash_password(payload.password)
    session.add(user)
    session.commit()
    return {"ok": True}
