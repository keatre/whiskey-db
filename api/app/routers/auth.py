# api/app/routers/auth.py
import time
import ipaddress
import json
from collections import defaultdict, deque
from typing import Deque, Dict, Any

from fastapi import APIRouter, Depends, Response, Request, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlmodel import select
from datetime import timedelta, datetime, timezone

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticationCredential,
    AuthenticatorAssertionResponse,
    AuthenticatorAttestationResponse,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    PublicKeyCredentialType,
    RegistrationCredential,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from ..db import get_session
from ..models import User, PasskeyCredential
from ..settings import settings
from ..security import verify_password, create_token, decode_token
from ..auth_schemas import (
    LoginRequest,
    MeResponse,
    PasskeyOptionsRequest,
    PasskeyVerifyRequest,
    PasskeyRegisterVerifyRequest,
)
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

# -------------------------
# Passkey (WebAuthn) challenges
# -------------------------
_PASSKEY_AUTH_CHALLENGES: Dict[str, tuple[Any, float]] = {}
_PASSKEY_REG_CHALLENGES: Dict[str, tuple[Any, float]] = {}
_PASSKEY_CHALLENGE_TTL = getattr(settings, "PASSKEY_CHALLENGE_TTL_SECONDS", 120)

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
# Passkey helpers
# -------------------------
def _store_passkey_challenge(store: Dict[str, tuple[Any, float]], username: str, challenge: Any) -> None:
    store[username] = (challenge, time.monotonic() + _PASSKEY_CHALLENGE_TTL)


def _pop_passkey_challenge(store: Dict[str, tuple[Any, float]], username: str) -> Any | None:
    entry = store.pop(username, None)
    if not entry:
        return None
    challenge, expires_at = entry
    if time.monotonic() > expires_at:
        return None
    return challenge


def _authentication_credential_from_payload(payload: dict[str, Any]) -> AuthenticationCredential:
    resp = payload.get("response", {})
    id_str = payload.get("id")
    raw_id = base64url_to_bytes(payload.get("rawId", id_str))
    return AuthenticationCredential(
        id=id_str,
        raw_id=raw_id,
        response=AuthenticatorAssertionResponse(
            client_data_json=base64url_to_bytes(resp["clientDataJSON"]),
            authenticator_data=base64url_to_bytes(resp["authenticatorData"]),
            signature=base64url_to_bytes(resp["signature"]),
            user_handle=base64url_to_bytes(resp["userHandle"]) if resp.get("userHandle") else None,
        ),
        type=payload.get("type", "public-key"),
    )


def _registration_credential_from_payload(payload: dict[str, Any]) -> RegistrationCredential:
    resp = payload.get("response", {})
    id_str = payload.get("id")
    raw_id = base64url_to_bytes(payload.get("rawId", id_str))
    return RegistrationCredential(
        id=id_str,
        raw_id=raw_id,
        response=AuthenticatorAttestationResponse(
            client_data_json=base64url_to_bytes(resp["clientDataJSON"]),
            attestation_object=base64url_to_bytes(resp["attestationObject"]),
            transports=resp.get("transports"),
        ),
        type=payload.get("type", "public-key"),
    )


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

def _is_secure_request(request: Request) -> bool:
    """
    Determine if the originating request was HTTPS.
    - Honor X-Forwarded-Proto when present (first entry wins).
    - Fall back to the request's own scheme.
    """
    forwarded = request.headers.get("x-forwarded-proto") or ""
    if forwarded:
        proto = forwarded.split(",")[0].strip().lower()
        if proto in {"https", "wss"}:
            return True
        if proto in {"http", "ws"}:
            return False

    # RFC 7239 Forwarded: proto=https
    forwarded_header = request.headers.get("forwarded")
    if forwarded_header:
        # forwarded can be comma-separated entries; inspect first
        first_part = forwarded_header.split(",")[0].lower()
        if "proto=https" in first_part:
            return True
        if "proto=http" in first_part:
            return False

    # Cloudflare Tunnel / proxies expose cf-visitor='{"scheme":"https"}'
    cf_visitor = request.headers.get("cf-visitor")
    if cf_visitor:
        visitor_lower = cf_visitor.lower()
        if '"scheme":"https"' in visitor_lower:
            return True
        if '"scheme":"http"' in visitor_lower:
            return False
    scheme = (request.url.scheme or "").lower()
    return scheme in {"https", "wss"}


def _cookie_flags(request: Request) -> dict:
    """
    Decide cookie security flags based on env + request scheme.
    - If settings.COOKIE_SECURE is explicitly set, parse it robustly.
    - If None or "auto", detect HTTPS via X-Forwarded-Proto or request.url.scheme.
    - Default samesite to 'lax' unless overridden.
    - If settings.COOKIE_DOMAIN is set, include it; otherwise omit (binds to current host).
    """
    raw_secure = getattr(settings, "COOKIE_SECURE", None)
    is_secure_req = _is_secure_request(request)

    # auto-detect when missing or "auto"
    if raw_secure is None or (isinstance(raw_secure, str) and raw_secure.strip().lower() == "auto"):
        secure = is_secure_req
    else:
        forced = _to_bool(raw_secure)
        # Respect explicit False. If explicitly True but the request is plain HTTP,
        # fall back to False so local/test clients can still receive cookies.
        secure = forced and is_secure_req

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
        lan_guest_reason=None,
    )


@router.post("/passkey/options")
def passkey_options(
    data: PasskeyOptionsRequest,
    db: Session = Depends(get_session),
):
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required.")

    user = db.exec(select(User).where(User.username == username, User.is_active.is_(True))).first()
    allow = []
    if user:
        creds = db.exec(select(PasskeyCredential).where(PasskeyCredential.user_id == user.id)).all()
        allow = [
            PublicKeyCredentialDescriptor(
                id=base64url_to_bytes(c.credential_id),
                type=PublicKeyCredentialType.PUBLIC_KEY,
            )
            for c in creds
        ]

    options = generate_authentication_options(
        rp_id=settings.PASSKEY_RP_ID,
        allow_credentials=allow or None,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    _store_passkey_challenge(_PASSKEY_AUTH_CHALLENGES, username, options.challenge)
    return JSONResponse(content=json.loads(options_to_json(options)))


@router.post("/passkey/verify", response_model=MeResponse)
def passkey_verify(
    data: PasskeyVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_session),
):
    ip = _ip_from_request(request)
    _throttle_check(ip)

    username = data.username.strip()
    if not username:
        _throttle_record(ip, success=False)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required.")

    expected_challenge = _pop_passkey_challenge(_PASSKEY_AUTH_CHALLENGES, username)
    if not expected_challenge:
        _throttle_record(ip, success=False)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending passkey challenge.")

    user = db.exec(select(User).where(User.username == username, User.is_active.is_(True))).first()
    if not user:
        _throttle_record(ip, success=False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    credential = _authentication_credential_from_payload(data.credential)
    passkeys = db.exec(select(PasskeyCredential).where(PasskeyCredential.user_id == user.id)).all()
    cred_map = {c.credential_id: c for c in passkeys}
    record = cred_map.get(credential.id)
    if not record:
        _throttle_record(ip, success=False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_rp_id=settings.PASSKEY_RP_ID,
        expected_origin=settings.PASSKEY_RP_ORIGIN,
        credential_public_key=base64url_to_bytes(record.public_key),
        credential_current_sign_count=record.sign_count,
        require_user_verification=True,
    )
    record.sign_count = verification.new_sign_count
    record.last_used_at = datetime.now(timezone.utc)
    db.add(record)
    db.commit()

    access = create_token(user.username, user.role, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    refresh = create_token(user.username, user.role, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))

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

    _throttle_record(ip, success=True)

    return MeResponse(
        username=user.username,
        email=user.email or None,
        role=user.role,
        authenticated=True,
        lan_guest=False,
        lan_guest_reason=None,
    )


@router.post("/passkey/register/options")
def passkey_register_options(
    user_payload=Depends(get_current_user_role),
    db: Session = Depends(get_session),
):
    if user_payload.get("role") not in ("admin", "user"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    username = user_payload.get("username")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    user = db.exec(select(User).where(User.username == username, User.is_active.is_(True))).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    creds = db.exec(select(PasskeyCredential).where(PasskeyCredential.user_id == user.id)).all()
    exclude = [
        PublicKeyCredentialDescriptor(
            id=base64url_to_bytes(c.credential_id),
            type=PublicKeyCredentialType.PUBLIC_KEY,
        )
        for c in creds
    ]

    options = generate_registration_options(
        rp_name=settings.PASSKEY_RP_NAME,
        rp_id=settings.PASSKEY_RP_ID,
        user_id=str(user.id).encode("utf-8"),
        user_name=user.username,
        user_display_name=user.username,
        exclude_credentials=exclude or None,
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.REQUIRED,
            resident_key=ResidentKeyRequirement.PREFERRED,
        ),
    )
    _store_passkey_challenge(_PASSKEY_REG_CHALLENGES, user.username, options.challenge)
    return JSONResponse(content=json.loads(options_to_json(options)))


@router.post("/passkey/register/verify")
def passkey_register_verify(
    data: PasskeyRegisterVerifyRequest,
    user_payload=Depends(get_current_user_role),
    db: Session = Depends(get_session),
):
    if user_payload.get("role") not in ("admin", "user"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    username = user_payload.get("username")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    user = db.exec(select(User).where(User.username == username, User.is_active.is_(True))).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    expected_challenge = _pop_passkey_challenge(_PASSKEY_REG_CHALLENGES, user.username)
    if not expected_challenge:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending passkey challenge.")

    credential = _registration_credential_from_payload(data.credential)
    existing = db.exec(select(PasskeyCredential).where(PasskeyCredential.credential_id == credential.id)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Passkey already registered.")

    verification = verify_registration_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_rp_id=settings.PASSKEY_RP_ID,
        expected_origin=settings.PASSKEY_RP_ORIGIN,
        require_user_verification=True,
    )

    transports = data.credential.get("response", {}).get("transports")
    if transports is not None:
        transports = json.dumps(transports)

    record = PasskeyCredential(
        user_id=user.id,
        credential_id=bytes_to_base64url(verification.credential_id),
        public_key=bytes_to_base64url(verification.credential_public_key),
        sign_count=verification.sign_count,
        transports=transports,
        created_at=datetime.now(timezone.utc),
        last_used_at=None,
    )
    db.add(record)
    db.commit()
    return {"status": "registered"}


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
        lan_guest_reason=user.get("decision_reason"),
    )


@router.post("/refresh", response_model=MeResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_session)):
    refresh_token = request.cookies.get(settings.JWT_REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(refresh_token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    stmt = select(User).where(User.username == username, User.is_active.is_(True))
    user = db.exec(stmt).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate access token
    access = create_token(user.username, user.role, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    cookie_opts = _cookie_flags(request)
    response.set_cookie(
        settings.JWT_COOKIE_NAME,
        access,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **cookie_opts,
    )

    return MeResponse(
        username=user.username,
        email=user.email or None,
        role=user.role,
        authenticated=True,            # still authenticated
        lan_guest=False,
        lan_guest_reason=None,
    )
