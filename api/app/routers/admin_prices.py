"""Admin endpoints for managing market price records."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import desc, nulls_last
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin
from ..models import MarketPrice
from ..services.market_prices import fetch_external_quote, persist_quote

router = APIRouter(
    prefix="/admin/prices",
    tags=["admin"],
)


class MarketPriceBase(BaseModel):
    barcode_upc: str = Field(min_length=3, description="UPC or barcode identifier")
    price: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default="USD", min_length=3, max_length=6)
    source: Optional[str] = Field(default=None, description="Human-readable source label")
    provider: Optional[str] = Field(default=None, description="System/provider identifier")
    as_of: Optional[datetime] = Field(default=None, description="ISO timestamp for the price")
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("barcode_upc")
    @classmethod
    def _normalize_upc(cls, value: str) -> str:
        v = value.strip()
        if not v:
            raise ValueError("UPC cannot be blank")
        return v

    @field_validator("currency")
    @classmethod
    def _normalize_currency(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip().upper() or None


class MarketPriceCreate(MarketPriceBase):
    ingest_type: Literal["manual", "csv", "provider"] = "manual"


class MarketPriceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    price_id: int
    barcode_upc: str
    price: Optional[float]
    currency: Optional[str]
    source: Optional[str]
    provider: Optional[str]
    as_of: Optional[datetime]
    fetched_at: datetime
    ingest_type: str
    created_by: Optional[str]
    notes: Optional[str]


class MarketPriceSyncRequest(BaseModel):
    barcode_upc: str = Field(min_length=3)
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("barcode_upc")
    @classmethod
    def _normalize_upc(cls, value: str) -> str:
        v = value.strip()
        if not v:
            raise ValueError("UPC cannot be blank")
        return v


def _base_query(upc: Optional[str] = None):
    stmt = select(MarketPrice).order_by(
        nulls_last(desc(MarketPrice.as_of)),
        desc(MarketPrice.fetched_at),
        desc(MarketPrice.price_id),
    )
    if upc:
        stmt = stmt.where(MarketPrice.barcode_upc == upc)
    return stmt


@router.get("", response_model=list[MarketPriceOut])
def list_prices(
    upc: Optional[str] = Query(default=None, description="Filter by specific UPC"),
    latest: bool = Query(default=False, description="Only return the latest record per UPC"),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
):
    stmt = _base_query(upc).limit(limit if not latest else limit * 5)
    rows = session.exec(stmt).all()

    if latest and not upc:
        dedup: dict[str, MarketPrice] = {}
        for row in rows:
            if row.barcode_upc not in dedup:
                dedup[row.barcode_upc] = row
        rows = list(dedup.values())
        rows.sort(key=lambda r: (r.as_of or r.fetched_at), reverse=True)

    return rows[:limit]


@router.post("", response_model=MarketPriceOut, status_code=status.HTTP_201_CREATED)
def create_price(
    payload: MarketPriceCreate,
    session: Session = Depends(get_session),
    admin=Depends(require_admin),
):
    record = MarketPrice(
        barcode_upc=payload.barcode_upc,
        price=payload.price,
        currency=payload.currency or "USD",
        source=payload.source,
        provider=payload.provider or payload.source,
        as_of=payload.as_of,
        ingest_type=payload.ingest_type,
        created_by=admin["username"],
        notes=payload.notes,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.post("/sync", response_model=MarketPriceOut, status_code=status.HTTP_201_CREATED)
def sync_price_from_provider(
    payload: MarketPriceSyncRequest,
    session: Session = Depends(get_session),
    admin=Depends(require_admin),
):
    quote = fetch_external_quote(payload.barcode_upc)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider did not return a price for that UPC",
        )

    try:
        record = persist_quote(
            session,
            quote,
            ingest_type="provider",
            created_by=admin["username"],
            notes=payload.notes,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to store quote: {exc}") from exc

    return record
