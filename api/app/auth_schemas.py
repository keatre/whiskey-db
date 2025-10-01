# api/app/auth_schemas.py
from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class MeResponse(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    role: str
    authenticated: bool
    lan_guest: bool
