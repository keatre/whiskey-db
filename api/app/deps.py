from fastapi import Depends, HTTPException, Request, status
import ipaddress
from typing import Optional

from .settings import settings
from .security import decode_token


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

    # Parse JWT from cookie (auth)
    cookies = request.cookies or {}
    token = cookies.get(settings.JWT_COOKIE_NAME)

    role: str = "anonymous"
    username: Optional[str] = None
    email: Optional[str] = None

    if token:
        try:
            payload = decode_token(token)
            # honor role from token if present; default to "user" if token exists but no role
            role = payload.get("role") or "user"
            username = payload.get("sub") or payload.get("username")
            email = payload.get("email")
        except Exception:
            # invalid token → treat as anonymous (do not grant guest unless LAN+flag)
            role = "anonymous"

    # LAN guest allowance (only if unauthenticated)
    allow_lan_guest = _to_bool(settings.ALLOW_LAN_GUEST)
    lan_guest = False
    if role in ("anonymous",):
        if allow_lan_guest and _is_private_ip(ip):
            role = "guest"
            lan_guest = True

    return {
        "role": role,
        "username": username,
        "email": email,
        "lan_guest": lan_guest,
        "ip": ip,
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
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required")
