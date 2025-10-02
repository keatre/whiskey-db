# api/app/routers/auth.py
import time
import ipaddress
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import APIRouter, Depends, Response, Request, HTTPException, status
from sqlalchemy.orm import Session
from sqlmodel import select
from datetime import timedelta

from ..db import get_session
from ..models import User
from ..settings import settings
from ..security import verify_password, create_token, decode_token
from ..auth_schemas import LoginRequest, MeResponse
from ..deps import get_current_user_role

router = APIRouter(prefix="/auth", tags=["auth"])

# -------------------------
# In-memory login rate limit (per IP)
# -------------------------
_ATTEMPTS: Dict[str, Deque[float]] = defaultdict(deque)  # ip -> deque[timestamps of failed attempts]
_LOCKOUT_UNTIL: Dict[str, float] = {}                    # ip -> monotonic() unlock_at

_WINDOW = getattr(settings, "LOGIN_WINDOW_SECONDS", 60)
_MAX_ATTEMPTS = getattr(settings, "LOGIN_MAX_ATTEMPTS", 10)
_LOCKOUT = getattr(settings, "LOGIN_LOCKOUT_SECONDS", 180)

# Parse trusted proxies (CIDR or single IPs) to safely honor X-Forwarded-For / CF-Connecting-IP
_TRUSTED_NETS = []
for cidr in (settings.TRUSTED_PROXIES or "").split(","):
    cidr = cidr.strip()
    if not cidr:
        continue
    try:
        _TRUSTED_NETS.append(ipaddress.ip_network(cidr, strict=False))
    except Exception:
        # allow single IPs too
        try:
            _TRUSTED_NETS.append(ipaddress.ip_network(f"{cidr}/32", strict=False))
        except Exception:
            pass


def _ip_from_request(request: Request) -> str:
    """Return client IP, honoring forwarded headers only if peer is a trusted proxy."""
    remote = (request.client.host if request.client else "unknown").strip()
    try:
        rip = ipaddress.ip_address(remote)
    except Exception:
        return remote

    # Trust forwarded headers only if remote peer is in a trusted net
    if any(rip in net for net in _TRUSTED_NETS):
        hdr = request.headers
        # Prefer Cloudflare then standard XFF, then True-Client-IP
        for key in ("cf-connecting-ip", "x-forwarded-for", "true-client-ip"):
            v = hdr.get(key)
            if v:
                return v.split(",")[0].strip()
    return remote


def _throttle_check(ip: str) -> None:
    now = time.monotonic()
    unlock = _LOCKOUT_UNTIL.get(ip)
    if unlock and now < unlock:
        retry = int(unlock - now) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry)},
        )

    dq = _ATTEMPTS[ip]
    # prune timestamps outside the sliding window
    while dq and (now - dq[0]) > _WINDOW:
        dq.popleft()

    if len(dq) >= _MAX_ATTEMPTS:
        _ATTEMPTS[ip].clear()
        _LOCKOUT_UNTIL[ip] = now + _LOCKOUT
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(_LOCKOUT)},
        )


def _throttle_record(ip: str, success: bool) -> None:
    if success:
        _ATTEMPTS.pop(ip, None)
        _LOCKOUT_UNTIL.pop(ip, None)
    else:
        _ATTEMPTS[ip].append(time.monotonic())


# -------------------------
# Cookie helpers (scheme-aware)
# -------------------------
def _to_bool(v) -> bool:
    """Robust truthy parser for env values like 'true'/'false'/'1'/'0'."""
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    s = str(v).strip().lower()
    return s in {"1", "true", "yes", "y", "on"}

def _cookie_flags(request: Request) -> dict:
    """
    Decide cookie security flags based on env + request scheme.
    - If settings.COOKIE_SECURE is explicitly set, parse it robustly.
    - If None or "auto", detect HTTPS via X-Forwarded-Proto or request.url.scheme.
    - Default samesite to 'lax' unless overridden.
    - If settings.COOKIE_DOMAIN is set, include it; otherwise omit (binds to current host).
    """
    raw_secure = getattr(settings, "COOKIE_SECURE", None)

    # auto-detect when missing or "auto"
    if raw_secure is None or (isinstance(raw_secure, str) and raw_secure.strip().lower() == "auto"):
        scheme = (request.headers.get("x-forwarded-proto") or request.url.scheme or "").lower()
        secure = (scheme == "https")
    else:
        secure = _to_bool(raw_secure)

    samesite = (getattr(settings, "COOKIE_SAMESITE", None) or "lax").lower()
    domain = getattr(settings, "COOKIE_DOMAIN", None) or None

    base = {
        "httponly": True,
        "samesite": samesite,
        "secure": secure,
        "path": "/",
    }
    if domain:
        base["domain"] = domain
    return base


@router.post("/login", response_model=MeResponse)
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_session),
):
    ip = _ip_from_request(request)
    _throttle_check(ip)

    stmt = select(User).where(User.username == data.username, User.is_active.is_(True))
    user = db.exec(stmt).first()
    if not user or not verify_password(data.password, user.password_hash):
        _throttle_record(ip, success=False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
        )

    # Create tokens
    access = create_token(user.username, user.role, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    refresh = create_token(user.username, user.role, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))

    # Set cookies (scheme-aware)
    cookie_opts = _cookie_flags(request)
    response.set_cookie(
        settings.JWT_COOKIE_NAME,
        access,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **cookie_opts,
    )
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE_NAME,
        refresh,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        **cookie_opts,
    )

    # Successful login resets counters
    _throttle_record(ip, success=True)

    return MeResponse(
        username=user.username,
        email=user.email or None,
        role=user.role,
        authenticated=True,            # logged in -> authenticated
        lan_guest=False,
    )


@router.post("/logout")
def logout(request: Request, response: Response):
    cookie_opts = _cookie_flags(request)
    response.delete_cookie(settings.JWT_COOKIE_NAME, **cookie_opts)
    response.delete_cookie(settings.JWT_REFRESH_COOKIE_NAME, **cookie_opts)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(user=Depends(get_current_user_role)):
    # authenticated if and only if we are "admin" or "user"
    is_auth = user["role"] in ("admin", "user")
    return MeResponse(
        username=user.get("username"),
        email=user.get("email") or None,
        role=user["role"],
        authenticated=is_auth,
        lan_guest=user["lan_guest"],
    )


@router.post("/refresh", response_model=MeResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_session)):
    refresh_token = request.cookies.get(settings.JWT_REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(refresh_token)
    username = payload.get("sub")
    role = payload.get("role")

    stmt = select(User).where(User.username == username, User.is_active.is_(True))
    user = db.exec(stmt).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate access token
    access = create_token(username, role, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    cookie_opts = _cookie_flags(request)
    response.set_cookie(
        settings.JWT_COOKIE_NAME,
        access,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **cookie_opts,
    )

    return MeResponse(
        username=username,
        email=user.email or None,
        role=role,
        authenticated=True,            # still authenticated
        lan_guest=False,
    )
