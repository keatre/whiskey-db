# api/app/lan.py
import ipaddress
from typing import Optional
from fastapi import Request
from .settings import settings

# RFC1918 + loopback + unique local (IPv6) ranges
PRIVATE_CIDRS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

# Parse trusted proxies list from .env (comma separated)
TRUSTED_PROXIES = []
for entry in settings.TRUSTED_PROXIES.split(","):
    entry = entry.strip()
    if not entry:
        continue
    net = ipaddress.ip_network(entry, strict=False)
    TRUSTED_PROXIES.append(net)


def client_ip(request: Request) -> Optional[str]:
    """
    Return the best guess at the original client IP.
    Respects X-Forwarded-For if the immediate peer is a trusted proxy.
    """
    peer = request.client.host if request.client else None

    # Use X-Forwarded-For if present and we trust the peer
    xff = request.headers.get("x-forwarded-for")
    if xff and peer:
        try:
            peer_ip = ipaddress.ip_address(peer)
            if any(peer_ip in net for net in TRUSTED_PROXIES):
                # Take the first IP in X-Forwarded-For chain
                first = xff.split(",")[0].strip()
                ipaddress.ip_address(first)  # validate
                return first
        except ValueError:
            pass

    return peer


def is_private_ip(ip_str: Optional[str]) -> bool:
    """
    Return True if the given IP belongs to a private range.
    """
    if not ip_str:
        return False
    ip = ipaddress.ip_address(ip_str)
    return any(ip in cidr for cidr in PRIVATE_CIDRS)
