import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlmodel import Session, select, SQLModel

from ..db import get_session
from ..models import Bottle, BottleAudit, Purchase, TastingNote, BottleTag
from ..deps import get_current_user_role, require_admin, require_view_access  # <-- NEW

router = APIRouter(prefix="/bottles", tags=["bottles"], dependencies=[Depends(get_current_user_role)])

# ---- Optional: enforce allowed styles (uncomment to enable)
# ALLOWED_STYLES = {
#     "Scotch - Single Malt","Scotch - Blended","Scotch - Blended Malt","Scotch - Single Grain",
#     "Bourbon - Straight Bourbon","Bourbon - Barrel Proof",
#     "Rye - Straight Rye",
#     "Irish - Single Pot Still","Irish - Single Malt","Irish - Blended",
#     "Japanese - Single Malt","Japanese - Blended",
#     "Canadian - Whisky",
#     "Other - Single Malt","Other - Blended","Other - Grain","Other - —"
# }

# ---- NEW: a minimal PATCH schema so all fields are optional
class BottlePatch(SQLModel):
    brand: Optional[str] = None
    expression: Optional[str] = None
    distillery: Optional[str] = None
    style: Optional[str] = None
    region: Optional[str] = None
    age: Optional[int] = None
    abv: Optional[float] = None
    proof: Optional[float] = None
    size_ml: Optional[int] = None
    release_year: Optional[int] = None
    barcode_upc: Optional[str] = None
    mashbill_markdown: Optional[str] = None
    notes_markdown: Optional[str] = None
    image_url: Optional[str] = None


# ---------- READ (guest or authenticated) ----------
@router.get("", response_model=List[Bottle], dependencies=[Depends(require_view_access)])
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


@router.get("/{bottle_id}", response_model=Bottle, dependencies=[Depends(require_view_access)])
def get_bottle(bottle_id: int, session: Session = Depends(get_session)):
    b = session.get(Bottle, bottle_id)
    if not b:
        raise HTTPException(404, "Bottle not found")
    return b


@router.get("/{bottle_id}/audits", response_model=List[BottleAudit], dependencies=[Depends(require_view_access)])
def list_bottle_audits(bottle_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(BottleAudit).where(BottleAudit.bottle_id == bottle_id).order_by(BottleAudit.changed_at.desc())
    ).all()


# ---------- WRITE (admin only) ----------
@router.post("", response_model=Bottle, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_bottle(bottle: Bottle, session: Session = Depends(get_session)):
    if not bottle.brand or not bottle.brand.strip():
        raise HTTPException(422, "brand is required")
    bottle.created_utc = datetime.utcnow()
    bottle.updated_utc = datetime.utcnow()
    session.add(bottle)
    session.commit()
    session.refresh(bottle)
    return bottle


@router.patch("/{bottle_id}", response_model=Bottle, dependencies=[Depends(require_admin)])
def update_bottle(
    bottle_id: int,
    patch: BottlePatch,
    session: Session = Depends(get_session),
    changed_by: str | None = None
):
    b = session.get(Bottle, bottle_id)
    if not b:
        raise HTTPException(404, "Bottle not found")

    before = b.model_dump()
    data = patch.model_dump(exclude_unset=True)

    # keep safe
    data.pop("bottle_id", None)
    data.pop("created_utc", None)
    data.pop("updated_utc", None)

    # Optional: enforce style against an allowed list
    # if "style" in data and data["style"] is not None and data["style"] not in ALLOWED_STYLES:
    #     raise HTTPException(status_code=422, detail="Unknown style")

    # If client sent only proof, compute abv
    if "proof" in data and "abv" not in data and data["proof"] is not None:
        try:
            data["abv"] = round(float(data["proof"]) / 2.0, 1)
        except Exception:
            pass

    for k, v in data.items():
        setattr(b, k, v)

    b.updated_utc = datetime.utcnow()
    session.add(b)
    session.commit()
    session.refresh(b)

    after = b.model_dump()
    changes = {}
    for k in data.keys():
        if before.get(k) != after.get(k):
            changes[k] = {"from": before.get(k), "to": after.get(k)}

    if changes:
        audit = BottleAudit(
            bottle_id=b.bottle_id,
            changed_by=changed_by,
            changes_json=json.dumps(changes, ensure_ascii=False),
        )
        session.add(audit)
        session.commit()

    return b


@router.delete("/{bottle_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_bottle(bottle_id: int, session: Session = Depends(get_session)):
    b = session.get(Bottle, bottle_id)
    if not b:
        raise HTTPException(404, "Bottle not found")

    # 1) Tasting notes for this bottle's purchases
    purchase_ids = [
        p.purchase_id
        for p in session.exec(select(Purchase).where(Purchase.bottle_id == bottle_id)).all()
        if p.purchase_id is not None
    ]
    if purchase_ids:
        notes = session.exec(
            select(TastingNote).where(TastingNote.purchase_id.in_(purchase_ids))
        ).all()
        for n in notes:
            session.delete(n)

    # 2) Purchases for this bottle
    purchases = session.exec(
        select(Purchase).where(Purchase.bottle_id == bottle_id)
    ).all()
    for p in purchases:
        session.delete(p)

    # 3) Tag links
    links = session.exec(
        select(BottleTag).where(BottleTag.bottle_id == bottle_id)
    ).all()
    for link in links:
        session.delete(link)

    # 4) Audit rows
    audits = session.exec(
        select(BottleAudit).where(BottleAudit.bottle_id == bottle_id)
    ).all()
    for a in audits:
        session.delete(a)

    # 5) The bottle
    session.delete(b)
    session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
