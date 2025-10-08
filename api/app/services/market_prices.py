from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from sqlmodel import Session

from ..models import MarketPrice
from ..settings import settings

logger = logging.getLogger(__name__)


@dataclass
class ExternalQuote:
    barcode_upc: str
    price: Optional[float]
    currency: Optional[str]
    source: Optional[str]
    as_of: Optional[datetime]
    provider: Optional[str]
    raw: Optional[dict[str, Any]] = None


def _coerce_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        except Exception:
            return None
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def fetch_external_quote(upc: str) -> Optional[ExternalQuote]:
    """
    Attempt to fetch a market price quote from an external provider.
    Returns None when the provider is not configured or any request error occurs.
    """
    url_template = settings.MARKET_PRICE_PROVIDER_URL
    if not url_template:
        return None

    upc = (upc or "").strip()
    if not upc:
        return None

    params: dict[str, Any] = {}
    final_url = url_template
    if "{upc}" in url_template:
        try:
            final_url = url_template.format(upc=upc)
        except Exception as exc:
            logger.warning("Failed to format MARKET_PRICE_PROVIDER_URL %s: %s", url_template, exc)
            return None
    else:
        params["upc"] = upc

    headers: dict[str, str] = {}
    if settings.MARKET_PRICE_PROVIDER_API_KEY:
        headers["Authorization"] = f"Bearer {settings.MARKET_PRICE_PROVIDER_API_KEY}"

    timeout = settings.MARKET_PRICE_PROVIDER_TIMEOUT_SECONDS or 8

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.get(final_url, params=params, headers=headers)
        response.raise_for_status()
        payload: Any = response.json()
    except Exception as exc:
        logger.warning("External price lookup failed for UPC %s: %s", upc, exc)
        return None

    if not isinstance(payload, dict):
        logger.debug("External price payload for %s was not a JSON object: %r", upc, payload)
        return None

    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not isinstance(data, dict):
        logger.debug("External price payload for %s missing object payload: %r", upc, payload)
        return None

    price = data.get("price")
    try:
        price = float(price) if price not in (None, "") else None
    except (TypeError, ValueError):
        price = None

    currency: Optional[str] = data.get("currency") or payload.get("currency")
    if isinstance(currency, str):
        currency = currency.strip().upper() or None

    source = data.get("source") or payload.get("source")
    provider = (
        data.get("provider")
        or payload.get("provider")
        or settings.MARKET_PRICE_PROVIDER_NAME
        or source
    )

    as_of = _coerce_datetime(data.get("as_of") or payload.get("as_of"))

    return ExternalQuote(
        barcode_upc=upc,
        price=price,
        currency=currency,
        source=source,
        as_of=as_of,
        provider=provider,
        raw=data,
    )


def persist_quote(
    session: Session,
    quote: ExternalQuote,
    *,
    ingest_type: str = "provider",
    created_by: Optional[str] = None,
    notes: Optional[str] = None,
) -> MarketPrice:
    """
    Store an ExternalQuote in the database and return the resulting MarketPrice row.
    """
    if quote is None:
        raise ValueError("quote must not be None")

    currency = quote.currency or "USD"
    if isinstance(currency, str):
        currency = currency.strip().upper() or "USD"

    record = MarketPrice(
        barcode_upc=quote.barcode_upc.strip(),
        price=quote.price,
        currency=currency,
        source=quote.source or quote.provider,
        provider=quote.provider,
        as_of=quote.as_of or datetime.now(timezone.utc),
        ingest_type=ingest_type,
        created_by=created_by,
        notes=notes,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record
