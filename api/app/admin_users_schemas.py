"""Pydantic schemas for admin-led user management flows."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict

Role = Literal["admin", "user"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: Optional[str] = None
    role: Role
    is_active: bool
    created_at: Optional[datetime] = None

    @field_validator("email", mode="before")
    @classmethod
    def _empty_email_to_none(cls, value: Optional[str]) -> Optional[str]:
        if value in ("", None):
            return None
        return value


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: Optional[EmailStr] = None
    password: str = Field(..., min_length=8)
    role: Role = "user"
    is_active: bool = True

    def normalized_username(self) -> str:
        return self.username.strip()


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[Role] = None
    is_active: Optional[bool] = None


class UserPasswordUpdate(BaseModel):
    password: str = Field(..., min_length=8)


__all__ = [
    "Role",
    "UserCreate",
    "UserOut",
    "UserPasswordUpdate",
    "UserUpdate",
]
