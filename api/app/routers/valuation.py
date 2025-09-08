from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import csv
import os
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/valuation", tags=["valuation"])

DATA_PATH = os.getenv("VALUATION_CSV", "data/market_prices.csv")

class ValuationResponse(BaseModel):
    barcode_upc: str
    price: Optional[float] = None
    currency: Optional[str] = "USD"
    source: Optional[str] = None
    as_of: Optional[str] = None   # ISO date string

@router.get("", response_model=ValuationResponse)
def get_valuation(upc: str = Query(..., alias="upc")):
    # If no CSV yet, return empty valuation (not an error; just unknown)
    if not os.path.exists(DATA_PATH):
        return ValuationResponse(barcode_upc=upc, price=None)

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

    # Not found in CSV
    return ValuationResponse(barcode_upc=upc, price=None)
