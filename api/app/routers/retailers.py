from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from ..db import get_session
from ..models import Retailer
from sqlmodel import SQLModel

router = APIRouter(prefix="/retailers", tags=["retailers"])

class RetailerUpdate(SQLModel):
    name: Optional[str] = None
    type: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None

@router.get("", response_model=List[Retailer])
def list_retailers(session: Session = Depends(get_session)):
    return session.exec(select(Retailer).order_by(Retailer.name)).all()

@router.get("/{retailer_id}", response_model=Retailer)
def get_retailer(retailer_id: int, session: Session = Depends(get_session)):
    r = session.get(Retailer, retailer_id)
    if not r:
        raise HTTPException(404, "Retailer not found")
    return r

@router.post("", response_model=Retailer, status_code=status.HTTP_201_CREATED)
def create_retailer(retailer: Retailer, session: Session = Depends(get_session)):
    if not retailer.name or not retailer.name.strip():
        raise HTTPException(422, "name is required")
    session.add(retailer)
    session.commit()
    session.refresh(retailer)
    return retailer

@router.patch("/{retailer_id}", response_model=Retailer)
def update_retailer(retailer_id: int, patch: RetailerUpdate, session: Session = Depends(get_session)):
    r = session.get(Retailer, retailer_id)
    if not r:
        raise HTTPException(404, "Retailer not found")
    data = patch.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(r, k, v)
    session.add(r)
    session.commit()
    session.refresh(r)
    return r

@router.delete("/{retailer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_retailer(retailer_id: int, session: Session = Depends(get_session)):
    r = session.get(Retailer, retailer_id)
    if not r:
        raise HTTPException(404, "Retailer not found")
    session.delete(r)
    session.commit()
    return None
