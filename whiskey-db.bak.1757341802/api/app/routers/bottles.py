from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List, Optional
from ..db import get_session
from ..models import Bottle

router = APIRouter(prefix="/bottles", tags=["bottles"])

@router.get("", response_model=List[Bottle])
def list_bottles(
    q: Optional[str] = Query(default=None, description="search by brand/expression/distillery"),
    session: Session = Depends(get_session),
):
    stmt = select(Bottle)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (Bottle.brand.ilike(like)) |
            (Bottle.expression.ilike(like)) |
            (Bottle.distillery.ilike(like))
        )
    return session.exec(stmt.order_by(Bottle.brand, Bottle.expression)).all()

@router.post("", response_model=Bottle)
def create_bottle(bottle: Bottle, session: Session = Depends(get_session)):
    session.add(bottle)
    session.commit()
    session.refresh(bottle)
    return bottle

@router.get("/{bottle_id}", response_model=Bottle)
def get_bottle(bottle_id: int, session: Session = Depends(get_session)):
    bottle = session.get(Bottle, bottle_id)
    if not bottle:
        raise HTTPException(404, "Bottle not found")
    return bottle
