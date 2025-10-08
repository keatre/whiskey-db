import csv
import os
from datetime import datetime
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, nulls_last
from sqlmodel import Session, select

from ..db import get_session
from ..models import MarketPrice
from ..services.market_prices import fetch_external_quote, persist_quote

router = APIRouter(prefix="/valuation", tags=["valuation"])

DATA_PATH = os.getenv("VALUATION_CSV", "data/market_prices.csv")
logger = logging.getLogger(__name__)


class ValuationResponse(BaseModel):
    barcode_upc: str
    price: Optional[float] = None
    currency: Optional[str] = "USD"
    source: Optional[str] = None
    as_of: Optional[str] = None   # ISO date string

def _model_to_response(price: MarketPrice, upc: str) -> ValuationResponse:
    as_of = price.as_of.isoformat() if price.as_of else None
    return ValuationResponse(
        barcode_upc=upc,
        price=price.price,
        currency=price.currency or "USD",
        source=price.source or price.provider,
        as_of=as_of,
    )


def _csv_lookup(upc: str) -> Optional[ValuationResponse]:
    # If no CSV yet, return empty valuation (not an error; just unknown)
    if not os.path.exists(DATA_PATH):
        return None

    with open(DATA_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if (row.get("barcode_upc") or "").strip() == upc.strip():
                price = row.get("price")
                try:
                    price = float(price) if price not in (None, "",) else None
                except Exception:
                    price = None
                currency = (row.get("currency") or "USD").strip() or "USD"
                source = (row.get("source") or "").strip() or None
                as_of = (row.get("as_of") or "").strip() or None
                # basic sanity for date
                if as_of:
                    try:
                        _ = datetime.fromisoformat(as_of)
                    except Exception:
                        as_of = None
                return ValuationResponse(
                    barcode_upc=upc,
                    price=price,
                    currency=currency,
                    source=source,
                    as_of=as_of,
                )

    return None


def _latest_price(session: Session, upc: str) -> Optional[MarketPrice]:
    stmt = (
        select(MarketPrice)
        .where(MarketPrice.barcode_upc == upc)
        .order_by(
            nulls_last(desc(MarketPrice.as_of)),
            desc(MarketPrice.fetched_at),
            desc(MarketPrice.price_id),
        )
    )
    return session.exec(stmt).first()


@router.get("", response_model=ValuationResponse)
def get_valuation(
    upc: str = Query(..., alias="upc"),
    session: Session = Depends(get_session),
):
    upc = (upc or "").strip()
    if not upc:
        raise HTTPException(status_code=400, detail="UPC is required")

    # 1) Database truth
    price = _latest_price(session, upc)
    if price:
        return _model_to_response(price, upc)

    # 2) Attempt external provider lookup (if configured)
    quote = fetch_external_quote(upc)
    if quote:
        try:
            stored = persist_quote(
                session,
                quote,
                ingest_type="provider",
                created_by="system",
            )
            return _model_to_response(stored, upc)
        except Exception as exc:
            logger.warning("Failed to persist external price for %s: %s", upc, exc)

    # 3) CSV fallback
    csv_resp = _csv_lookup(upc)
    if csv_resp:
        return csv_resp

    # 4) Unknown UPC
    return ValuationResponse(barcode_upc=upc, price=None)
