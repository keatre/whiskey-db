from fastapi import Depends, HTTPException, Request, status
import ipaddress
import logging
import os
from collections import Counter
from threading import Lock
from typing import Optional

from .settings import settings
from .security import decode_token


# --- module instrumentation -------------------------------------------------

logger = logging.getLogger("uvicorn.error")

_LAN_DECISION_METRICS: Counter = Counter()
_LAN_DECISION_LOCK = Lock()
_LOGGABLE_REASONS = {
    "lan_guest_disabled",
    "ip_not_private",
    "cloudflare_forced_auth",
    "host_not_allowed",
    "lan_guest_granted",
}
LAN_DECISION_HEADER = "X-Whiskey-Lan-Decision"


def _record_lan_guest_metric(reason: str) -> None:
    with _LAN_DECISION_LOCK:
        _LAN_DECISION_METRICS[reason] += 1


def lan_guest_metrics_snapshot() -> dict[str, int]:
    """
    Shallow copy of the LAN guest decision counters.
    Useful when attaching to a running container for troubleshooting.
    """
    with _LAN_DECISION_LOCK:
        return dict(_LAN_DECISION_METRICS)


# --- helpers ---------------------------------------------------------------

def _to_bool(v) -> bool:
    """
    Robust truthy parser for env-driven flags.
    Accepts True/False, "true"/"false", "1"/"0", etc.
    """
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    s = str(v).strip().lower()
    return s in {"1", "true", "yes", "y", "on"}


def _trusted_nets():
    """
    Build list of trusted proxy networks from TRUSTED_PROXIES.
    Accepts CIDRs or plain IPs.
    """
    nets = []
    for cidr in (settings.TRUSTED_PROXIES or "").split(","):
        cidr = cidr.strip()
        if not cidr:
            continue
        try:
            nets.append(ipaddress.ip_network(cidr, strict=False))
            continue
        except Exception:
            pass
        # try plain IP -> convert to /32 or /128
        try:
            ip = ipaddress.ip_address(cidr)
            if ip.version == 4:
                nets.append(ipaddress.ip_network(f"{ip.exploded}/32", strict=False))
            else:
                nets.append(ipaddress.ip_network(f"{ip.exploded}/128", strict=False))
        except Exception:
            # ignore invalid entry
            pass
    return nets


_TRUSTED_NETS = _trusted_nets()


_LAN_GUEST_HOSTS_RAW = os.getenv("LAN_GUEST_HOSTS")


def _lan_guest_hosts():
    default_hosts = "localhost,127.0.0.1"
    hosts = []
    for entry in (_LAN_GUEST_HOSTS_RAW or default_hosts).split(","):
        entry = entry.strip().lower()
        if entry:
            hosts.append(entry)
    return hosts


_LAN_GUEST_HOSTS = _lan_guest_hosts()
_LAN_GUEST_HOSTS_IS_DEFAULT = _LAN_GUEST_HOSTS_RAW is None


def _is_from_trusted(ip_str: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except Exception:
        return False
    return any(ip_obj in net for net in _TRUSTED_NETS)


def _ip_from_request(request: Request) -> str:
    """
    Determine the real client IP:
    - If the direct peer is in TRUSTED_PROXIES, trust X-Forwarded-For/CF headers.
    - Prefer the leftmost (original) address from XFF.
    - Otherwise, fall back to the direct peer.
    """
    peer = (request.client.host if request.client else "127.0.0.1").strip()

    # Only trust forwarding headers if peer is a trusted proxy
    if _TRUSTED_NETS and _is_from_trusted(peer):
        # Order of preference for typical reverse proxies/CDNs
        for key in ("cf-connecting-ip", "x-forwarded-for", "true-client-ip"):
            raw = request.headers.get(key)
            if not raw:
                continue
            # XFF can be a list; leftmost is original client
            first = raw.split(",")[0].strip()
            if first:
                return first
    return peer


def _is_cloudflare_request(request: Request) -> bool:
    hdr = request.headers
    if hdr.get("x-whiskey-via", "").lower() == "cloudflare":
        return True
    cf_ip = hdr.get("cf-connecting-ip")
    if cf_ip and not _is_private_ip(cf_ip.split(",", 1)[0].strip()):
        return True
    return any(hdr.get(name) for name in ("cf-ray", "cf-visitor", "cf-ew-via"))


def _host_allows_lan(host: str) -> bool:
    if not host:
        return False
    host_only = host.split(":", 1)[0].lower().strip("[]")
    if _LAN_GUEST_HOSTS_IS_DEFAULT:
        return True
    # When custom hosts are configured, still allow literal private/loopback IPs.
    if _is_private_ip(host_only):
        return True
    return any(host_only == allowed or host_only.endswith(f".{allowed.lstrip('.')}") for allowed in _LAN_GUEST_HOSTS)


def _is_private_ip(s: str) -> bool:
    try:
        ip = ipaddress.ip_address(s)
        return (
            ip.is_private
            or ip.is_loopback
            or ip in ipaddress.ip_network("10.0.0.0/8")
            or ip in ipaddress.ip_network("172.16.0.0/12")
            or ip in ipaddress.ip_network("192.168.0.0/16")
        )
    except Exception:
        return False


# --- public deps -----------------------------------------------------------

async def get_current_user_role(request: Request):
    """
    Returns a dict:
      {
        "role": "admin" | "user" | "guest" | "anonymous",
        "username": <str|None>,
        "email": <str|None>,
        "lan_guest": <bool>,
        "ip": <str>
      }

    - 'guest' when ALLOW_LAN_GUEST=true and client IP is private.
    - 'user'/'admin' when JWT cookie is valid and carries a role.
    - 'anonymous' otherwise.
    """
    ip = _ip_from_request(request)
    via_cloudflare = _is_cloudflare_request(request)
    request_host = request.headers.get("x-whiskey-host") or request.headers.get("host") or ""

    # Parse JWT from cookie (auth)
    cookies = request.cookies or {}
    token = cookies.get(settings.JWT_COOKIE_NAME)

    role: str = "anonymous"
    username: Optional[str] = None
    email: Optional[str] = None

    decision_reason = "no_token"

    if token:
        try:
            payload = decode_token(token)
            # honor role from token if present; default to "user" if token exists but no role
            role = payload.get("role") or "user"
            username = payload.get("sub") or payload.get("username")
            email = payload.get("email")
            decision_reason = "authenticated_token"
        except Exception:
            # invalid token → treat as anonymous (do not grant guest unless LAN+flag)
            role = "anonymous"
            decision_reason = "token_invalid"

    # LAN guest allowance (only if unauthenticated)
    allow_lan_guest = _to_bool(settings.ALLOW_LAN_GUEST)
    lan_guest = False
    if role in ("anonymous",):
        if not allow_lan_guest:
            decision_reason = "lan_guest_disabled"
        elif not _is_private_ip(ip):
            decision_reason = "ip_not_private"
        elif via_cloudflare:
            decision_reason = "cloudflare_forced_auth"
        elif not _host_allows_lan(request_host):
            decision_reason = "host_not_allowed"
        elif allow_lan_guest and _is_private_ip(ip) and not via_cloudflare and _host_allows_lan(request_host):
            role = "guest"
            lan_guest = True
            decision_reason = "lan_guest_granted"
        else:
            decision_reason = "anonymous"

    _record_lan_guest_metric(decision_reason)
    if decision_reason in _LOGGABLE_REASONS:
        logger.info(
            "lan_guest_decision reason=%s role=%s lan_guest=%s ip=%s host=%s via_cloudflare=%s allow_lan_flag=%s token_present=%s",
            decision_reason,
            role,
            lan_guest,
            ip,
            request_host or "<empty>",
            via_cloudflare,
            allow_lan_guest,
            bool(token),
        )

    return {
        "role": role,
        "username": username,
        "email": email,
        "lan_guest": lan_guest,
        "ip": ip,
        "via_cloudflare": via_cloudflare,
        "host": request_host,
        "decision_reason": decision_reason,
    }


async def require_admin(user=Depends(get_current_user_role)):
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


async def require_view_access(user=Depends(get_current_user_role)):
    """
    Allow viewing for:
      - admin
      - user (authenticated non-admin)
      - guest (LAN guest when ALLOW_LAN_GUEST=true)
    Block:
      - anonymous (outside LAN and not authenticated)
    """
    if user["role"] in ("admin", "user"):
        return user
    if user["role"] == "guest" and _to_bool(settings.ALLOW_LAN_GUEST):
        return user
    headers = None
    decision = user.get("decision_reason")
    if decision:
        headers = {LAN_DECISION_HEADER: decision}
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required", headers=headers)
