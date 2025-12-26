# api/app/auth_schemas.py
from pydantic import BaseModel
from typing import Optional, Any


class LoginRequest(BaseModel):
    username: str
    password: str


class MeResponse(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    role: str
    authenticated: bool
    lan_guest: bool
    lan_guest_reason: Optional[str] = None


class PasskeyOptionsRequest(BaseModel):
    username: str


class PasskeyVerifyRequest(BaseModel):
    username: str
    credential: dict[str, Any]
