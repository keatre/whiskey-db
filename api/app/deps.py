from fastapi import Depends, HTTPException, Request, status
import ipaddress
from .settings import settings
from .security import decode_token

def _trusted_nets():
    nets = []
    for cidr in (settings.TRUSTED_PROXIES or "").split(","):
        cidr = cidr.strip()
        if not cidr:
            continue
        try:
            nets.append(ipaddress.ip_network(cidr, strict=False))
        except Exception:
            try:
                nets.append(ipaddress.ip_network(f"{cidr}/32", strict=False))
            except Exception:
                pass
    return nets

_TRUSTED_NETS = _trusted_nets()

def _ip_from_request(request: Request) -> str:
    remote = (request.client.host if request.client else "unknown").strip()
    try:
        rip = ipaddress.ip_address(remote)
    except Exception:
        return remote
    if any(rip in n for n in _TRUSTED_NETS):
        for key in ("cf-connecting-ip", "x-forwarded-for", "true-client-ip"):
            v = request.headers.get(key)
            if v:
                return v.split(",")[0].strip()
    return remote

def _is_private_ip(s: str) -> bool:
    try:
        ip = ipaddress.ip_address(s)
        return ip.is_private or ip.is_loopback
    except Exception:
        return False

async def get_current_user_role(request: Request):
    ip = _ip_from_request(request)
    cookies = request.cookies or {}
    token = cookies.get(settings.JWT_COOKIE_NAME)
    role = "guest"
    username = None
    email = None
    if token:
        try:
            payload = decode_token(token)
            role = payload.get("role") or "guest"
            username = payload.get("sub")
        except Exception:
            role = "guest"
    lan_guest = bool(settings.ALLOW_LAN_GUEST and _is_private_ip(ip))
    return {"role": role, "username": username, "email": email, "lan_guest": lan_guest, "ip": ip}

async def require_admin(user=Depends(get_current_user_role)):
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user

async def require_view_access(user=Depends(get_current_user_role)):
    if user["role"] == "admin":
        return user
    if settings.ALLOW_LAN_GUEST and user["lan_guest"]:
        return user
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required")
