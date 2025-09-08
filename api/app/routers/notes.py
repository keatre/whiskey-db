from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select
from ..db import get_session
from ..models import TastingNote, Purchase

router = APIRouter(prefix="/notes", tags=["notes"])

@router.get("", response_model=List[TastingNote])
def list_notes(
    purchase_id: Optional[int] = Query(default=None, description="filter by purchase_id"),
    session: Session = Depends(get_session),
):
    stmt = select(TastingNote)
    if purchase_id is not None:
        stmt = stmt.where(TastingNote.purchase_id == purchase_id)
    return session.exec(stmt.order_by(TastingNote.tasted_dt.desc().nullslast(), TastingNote.created_utc.desc())).all()

@router.post("", response_model=TastingNote, status_code=status.HTTP_201_CREATED)
def create_note(n: TastingNote, session: Session = Depends(get_session)):
    p = session.get(Purchase, n.purchase_id)
    if not p:
        raise HTTPException(422, "Unknown purchase_id")

    # normalize datetime if sent as string (from <input type="datetime-local">)
    if isinstance(n.tasted_dt, str) and n.tasted_dt:
        n.tasted_dt = datetime.fromisoformat(n.tasted_dt)

    n.created_utc = datetime.utcnow()
    n.updated_utc = datetime.utcnow()
    session.add(n)
    session.commit()
    session.refresh(n)
    return n
