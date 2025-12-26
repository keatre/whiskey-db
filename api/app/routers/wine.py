from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlmodel import Session, select, SQLModel

from ..db import get_session, get_wine_session
from ..models import ModuleSetting
from ..wine_models import WineBottle
from ..deps import get_current_user_role, require_admin, require_view_access

router = APIRouter(prefix="/wine", tags=["wine"], dependencies=[Depends(get_current_user_role)])


class WineBottlePatch(SQLModel):
    brand: Optional[str] = None
    expression: Optional[str] = None
    winery: Optional[str] = None
    style: Optional[str] = None
    region: Optional[str] = None
    vintage_year: Optional[int] = None
    abv: Optional[float] = None
    size_ml: Optional[int] = None
    barcode_upc: Optional[str] = None
    notes_markdown: Optional[str] = None
    image_url: Optional[str] = None
    is_rare: Optional[bool] = None


def _wine_enabled(session: Session) -> bool:
    row = session.exec(select(ModuleSetting).where(ModuleSetting.key == "wine")).first()
    return bool(row and row.enabled)


def require_wine_enabled(session: Session = Depends(get_session)):
    if not _wine_enabled(session):
        raise HTTPException(status_code=404, detail="Module not enabled")


@router.get("", response_model=List[WineBottle], dependencies=[Depends(require_view_access), Depends(require_wine_enabled)])
def list_wines(
    q: Optional[str] = Query(default=None, description="search by brand/expression/winery"),
    rare: Optional[bool] = Query(default=None, description="filter by rarity flag"),
    session: Session = Depends(get_wine_session),
):
    stmt = select(WineBottle)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (WineBottle.brand.ilike(like))
            | (WineBottle.expression.ilike(like))
            | (WineBottle.winery.ilike(like))
        )
    if rare is True:
        stmt = stmt.where(WineBottle.is_rare.is_(True))
    elif rare is False:
        stmt = stmt.where(WineBottle.is_rare.is_(False))
    return session.exec(stmt.order_by(WineBottle.brand, WineBottle.expression)).all()


@router.get("/{wine_id}", response_model=WineBottle, dependencies=[Depends(require_view_access), Depends(require_wine_enabled)])
def get_wine(wine_id: int, session: Session = Depends(get_wine_session)):
    w = session.get(WineBottle, wine_id)
    if not w:
        raise HTTPException(404, "Wine not found")
    return w


@router.post("", response_model=WineBottle, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin), Depends(require_wine_enabled)])
def create_wine(wine: WineBottle, session: Session = Depends(get_wine_session)):
    if not wine.brand or not wine.brand.strip():
        raise HTTPException(422, "brand is required")
    wine.created_utc = datetime.utcnow()
    wine.updated_utc = datetime.utcnow()
    session.add(wine)
    session.commit()
    session.refresh(wine)
    return wine


@router.patch("/{wine_id}", response_model=WineBottle, dependencies=[Depends(require_admin), Depends(require_wine_enabled)])
def update_wine(
    wine_id: int,
    patch: WineBottlePatch,
    session: Session = Depends(get_wine_session),
):
    w = session.get(WineBottle, wine_id)
    if not w:
        raise HTTPException(404, "Wine not found")

    data = patch.model_dump(exclude_unset=True)
    data.pop("wine_id", None)
    data.pop("created_utc", None)
    data.pop("updated_utc", None)

    for k, v in data.items():
        setattr(w, k, v)

    w.updated_utc = datetime.utcnow()
    session.add(w)
    session.commit()
    session.refresh(w)

    return w


@router.delete("/{wine_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin), Depends(require_wine_enabled)])
def delete_wine(wine_id: int, session: Session = Depends(get_wine_session)):
    w = session.get(WineBottle, wine_id)
    if not w:
        raise HTTPException(404, "Wine not found")
    session.delete(w)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
