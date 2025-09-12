# api/app/security.py
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import HTTPException, status
from jose import jwt, JWTError

# passlib hashers (argon2 preferred, bcrypt fallback)
from passlib.hash import argon2, bcrypt  # requires argon2-cffi if using argon2

from .settings import settings

ALGORITHM = "HS256"


# -----------------------------
# Password hashing & verification
# -----------------------------
def hash_password(plain: str) -> str:
    """
    Hash with Argon2id by default.
    """
    # Argon2id is the recommended default today.
    # This returns strings like: $argon2id$v=19$m=...
    return argon2.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify against either Argon2 or bcrypt, based on hash prefix.
    We auto-detect the scheme from the stored hash to ensure backward compatibility.
    """
    try:
        if hashed.startswith("$argon2"):
            return argon2.verify(plain, hashed)
        # bcrypt is typically $2b$, $2a$, etc.
        if hashed.startswith("$2a$") or hashed.startswith("$2b$") or hashed.startswith("$2y$"):
            return bcrypt.verify(plain, hashed)
        # Unknown format → hard fail
        return False
    except Exception:
        return False


# -----------------------------
# JWT helpers
# -----------------------------
def create_token(username: str, role: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode & validate JWT. Raises 401 on failure.
    """
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
