"""Verified LoveScotch variant prices for manually or automatically linked products."""
import json
import logging
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
from sqlmodel import Session, select

from ..models import Bottle, MarketPrice, RetailPriceLink, RetailPriceObservation

logger = logging.getLogger(__name__)
_request_lock = threading.Lock()
_last_request = 0.0


class RetailPriceError(ValueError):
    pass


def error_detail(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code}"
    if isinstance(exc, httpx.TimeoutException):
        return "request timed out"
    if isinstance(exc, httpx.TransportError):
        return f"network failure ({type(exc).__name__})"
    return f"{type(exc).__name__}: {str(exc)[:200]}"


def utcnow():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def canonical_url(value: str) -> str:
    try:
        url = urlsplit(value.strip())
    except ValueError as exc:
        raise RetailPriceError("Enter a LoveScotch HTTPS product URL.") from exc
    if (url.scheme != "https" or url.netloc not in {"lovescotch.com", "www.lovescotch.com"}
            or not re.fullmatch(r"/products/[a-z0-9-]+/?", url.path)):
        raise RetailPriceError("Enter a LoveScotch HTTPS product URL.")
    return "https://lovescotch.com" + url.path.rstrip("/")


def fetch_product(url: str) -> dict:
    global _last_request
    url = canonical_url(url)
    # Serialize requests and leave a small gap, including preview requests.
    with _request_lock:
        time.sleep(max(0, 2 - (time.monotonic() - _last_request)))
        try:
            with httpx.Client(timeout=10, follow_redirects=False, headers={
                "User-Agent": "WhiskeyDB/retail-price-lookup", "Accept": "application/json",
            }) as client:
                page = client.get(url, headers={"Accept": "text/html"})
                page.raise_for_status()
                match = re.search(r'Shopify\.currency\s*=\s*(\{[^;]+\})', page.text)
                if not match or json.loads(match.group(1)).get("active") != "USD":
                    raise RetailPriceError("Could not verify USD pricing; quote was not saved.")
                time.sleep(2)
                response = client.get(url + ".js")
                response.raise_for_status()
                data = response.json()
            if not isinstance(data, dict) or not isinstance(data.get("title"), str):
                raise ValueError("Invalid product")
            variants = []
            for v in data["variants"]:
                cents = v["price"]
                if type(cents) is not int or cents <= 0 or type(v.get("available")) is not bool:
                    raise ValueError("Invalid price or availability")
                variants.append({"variant_id": str(v["id"]), "title": v["title"],
                                 "barcode": v.get("barcode"), "price_cents": cents,
                                 "available": v["available"]})
            if not variants:
                raise ValueError("No variants")
            return {"product_url": url, "product_title": data["title"],
                    "currency": "USD", "variants": variants}
        except RetailPriceError as exc:
            logger.warning("LoveScotch price lookup failed for %s: %s", url, exc)
            raise
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            reason = error_detail(exc)
            logger.warning("LoveScotch price lookup failed for %s: %s", url, reason)
            raise RetailPriceError(f"LoveScotch product price lookup failed ({reason}). Try again later.") from exc
        finally:
            _last_request = time.monotonic()


def record_quote(session: Session, link: RetailPriceLink, product: dict):
    variant = next((v for v in product["variants"] if v["variant_id"] == link.variant_id), None)
    if variant is None:
        raise RetailPriceError("The linked variant no longer exists. Please review the product link.")
    if link.barcode and variant["barcode"] != link.barcode:
        raise RetailPriceError("The product barcode changed. Please review the product link.")
    observation = RetailPriceObservation(
        bottle_id=link.bottle_id, product_url=link.product_url, variant_id=link.variant_id,
        product_title=product["product_title"], price_cents=variant["price_cents"],
        currency=product["currency"], available=variant["available"],
    )
    link.last_error = None
    session.add(link)
    session.add(observation)
    bottle = session.get(Bottle, link.bottle_id)
    if bottle and bottle.barcode_upc:
        session.add(MarketPrice(
            barcode_upc=bottle.barcode_upc.strip(), price=variant["price_cents"] / 100,
            currency=product["currency"], source="LoveScotch", provider="lovescotch",
            as_of=observation.checked_at, ingest_type="provider", created_by="system",
            notes=f"Retail quote: {link.product_url}; in stock: {variant['available']}",
        ))
    session.commit()
    return observation


def refresh_link(session: Session, link: RetailPriceLink):
    link.last_attempt_at = utcnow()
    session.add(link)
    session.commit()
    try:
        return record_quote(session, link, fetch_product(link.product_url))
    except RetailPriceError as exc:
        link.last_error = str(exc)
        session.add(link)
        session.commit()
        raise


def refresh_due_prices():
    from ..db import engine
    from ..settings import settings
    if not settings.RETAIL_PRICE_AUTO_REFRESH:
        return
    with Session(engine) as session:
        for link in session.exec(select(RetailPriceLink)).all():
            latest = session.exec(select(RetailPriceObservation).where(
                RetailPriceObservation.bottle_id == link.bottle_id,
                RetailPriceObservation.product_url == link.product_url,
                RetailPriceObservation.variant_id == link.variant_id,
            ).order_by(RetailPriceObservation.observation_id.desc())).first()
            now = utcnow()
            if latest and now - aware(latest.checked_at) < timedelta(days=7):
                continue
            if link.last_attempt_at and now - aware(link.last_attempt_at) < timedelta(days=1):
                continue
            try:
                refresh_link(session, link)
            except RetailPriceError:
                continue
