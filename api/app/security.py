# api/app/security.py
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
import bcrypt
from fastapi import HTTPException, status
import jwt

from .settings import settings

ALGORITHM = "HS256"
PASSWORD_HASHER = PasswordHasher()


# -----------------------------
# Password hashing & verification
# -----------------------------
def hash_password(plain: str) -> str:
    """
    Hash with Argon2id by default.
    """
    return PASSWORD_HASHER.hash(plain)


def _normalize_bcrypt_hash(hashed: str) -> bytes:
    # bcrypt can emit/accept $2a$ and $2b$; normalize legacy $2y$ for compatibility.
    if hashed.startswith("$2y$"):
        hashed = "$2b$" + hashed[4:]
    return hashed.encode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify against either Argon2 or bcrypt, based on hash prefix.
    We auto-detect the scheme from the stored hash to ensure backward compatibility.
    """
    if hashed.startswith("$argon2"):
        try:
            return PASSWORD_HASHER.verify(hashed, plain)
        except (InvalidHashError, VerificationError):
            return False
        except Exception:
            return False

    if hashed.startswith("$2a$") or hashed.startswith("$2b$") or hashed.startswith("$2y$"):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), _normalize_bcrypt_hash(hashed))
        except ValueError:
            return False
        except Exception:
            return False

    # Unknown format -> hard fail
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
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
