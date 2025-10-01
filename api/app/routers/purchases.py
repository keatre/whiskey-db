from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select
from ..db import get_session
from ..models import Purchase, Bottle, PurchaseUpdate

router = APIRouter(prefix="/purchases", tags=["purchases"])

@router.get("", response_model=List[Purchase])
def list_purchases(
    bottle_id: Optional[int] = Query(default=None, description="filter by bottle_id"),
    session: Session = Depends(get_session),
):
    stmt = select(Purchase)
    if bottle_id is not None:
        stmt = stmt.where(Purchase.bottle_id == bottle_id)
    return session.exec(stmt.order_by(Purchase.purchase_date.desc().nullslast())).all()

@router.get("/{purchase_id}", response_model=Purchase)
def get_purchase(purchase_id: int, session: Session = Depends(get_session)):
    item = session.get(Purchase, purchase_id)
    if not item:
        raise HTTPException(404, "Purchase not found")
    return item

@router.post("", response_model=Purchase, status_code=status.HTTP_201_CREATED)
def create_purchase(p: Purchase, session: Session = Depends(get_session)):
    b = session.get(Bottle, p.bottle_id)
    if not b:
        raise HTTPException(422, "Unknown bottle_id")

    # normalize incoming strings to date/datetime
    if isinstance(p.purchase_date, str) and p.purchase_date:
        p.purchase_date = date.fromisoformat(p.purchase_date)
    if isinstance(p.opened_dt, str) and p.opened_dt:
        p.opened_dt = datetime.fromisoformat(p.opened_dt)
    if isinstance(p.killed_dt, str) and p.killed_dt:
        p.killed_dt = datetime.fromisoformat(p.killed_dt)

    if p.quantity is None:
        p.quantity = 1

    # Auto-status when dates supplied
    if p.killed_dt:
        p.status = "finished"
    elif p.opened_dt:
        p.status = "open"

    p.created_utc = datetime.utcnow()
    p.updated_utc = datetime.utcnow()
    session.add(p)
    session.commit()
    session.refresh(p)
    return p

@router.patch("/{purchase_id}", response_model=Purchase)
def update_purchase(purchase_id: int, patch: PurchaseUpdate, session: Session = Depends(get_session)):
    p = session.get(Purchase, purchase_id)
    if not p:
        raise HTTPException(404, "Purchase not found")

    data = patch.model_dump(exclude_unset=True)

    # check bottle if changed
    if "bottle_id" in data and data["bottle_id"] is not None:
        if not session.get(Bottle, data["bottle_id"]):
            raise HTTPException(422, "Unknown bottle_id")

    # coerce date/datetime strings
    if "purchase_date" in data and isinstance(data["purchase_date"], str) and data["purchase_date"]:
        data["purchase_date"] = date.fromisoformat(data["purchase_date"])
    if "opened_dt" in data and isinstance(data["opened_dt"], str) and data["opened_dt"]:
        data["opened_dt"] = datetime.fromisoformat(data["opened_dt"])
    if "killed_dt" in data and isinstance(data["killed_dt"], str) and data["killed_dt"]:
        data["killed_dt"] = datetime.fromisoformat(data["killed_dt"])

    for k, v in data.items():
        setattr(p, k, v)

    if "killed_dt" in data:
        if getattr(p, "killed_dt", None):
            p.status = "finished"
    elif "opened_dt" in data:
        if getattr(p, "opened_dt", None):
            p.status = "open"

    p.updated_utc = datetime.utcnow()
    session.add(p)
    session.commit()
    session.refresh(p)
    return p
