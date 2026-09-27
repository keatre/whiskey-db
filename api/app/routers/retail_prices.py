from datetime import timedelta

from fastapi import BackgroundTasks, APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin, require_view_access
from ..models import RetailMatchState, Bottle, RetailPriceLink, RetailPriceObservation
from ..services import retail_prices as service
from ..settings import settings
from ..services.retail_matching import queue_match, set_state

router = APIRouter(prefix="/bottles/{bottle_id}/retail-price", tags=["retail prices"])


class ProductInput(BaseModel):
    product_url: str = Field(max_length=1000)


class LinkInput(ProductInput):
    variant_id: str = Field(max_length=30)
    confirmed: bool = False


def bottle_exists(bottle_id: int, session: Session):
    if not session.get(Bottle, bottle_id):
        raise HTTPException(404, "Bottle not found")


def product_or_error(url):
    try:
        return service.fetch_product(url)
    except service.RetailPriceError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("", dependencies=[Depends(require_view_access)])
def get_price(bottle_id: int, session: Session = Depends(get_session)):
    bottle_exists(bottle_id, session)
    link = session.get(RetailPriceLink, bottle_id)
    history = session.exec(select(RetailPriceObservation).where(
        RetailPriceObservation.bottle_id == bottle_id,
    ).order_by(RetailPriceObservation.observation_id.desc()).limit(100)).all()
    latest = session.exec(select(RetailPriceObservation).where(
        RetailPriceObservation.bottle_id == bottle_id,
        RetailPriceObservation.product_url == link.product_url,
        RetailPriceObservation.variant_id == link.variant_id,
    ).order_by(RetailPriceObservation.observation_id.desc())).first() if link else None
    # SQLite strips timezone information; explicitly serialize observation times as UTC.
    rows = [{**p.model_dump(), "checked_at": service.aware(p.checked_at).isoformat()} for p in history]
    match_state = session.get(RetailMatchState, bottle_id)
    match_data = match_state.model_dump() if match_state else None
    if match_state and match_state.status in {"queued", "matching"} and service.utcnow() - service.aware(match_state.updated_at) >= timedelta(minutes=10):
        match_data.update(status="error", message="The previous lookup did not finish. Retry UPC matching or link manually.")
    return {"link": link, "history": rows,
            "latest": {**latest.model_dump(), "checked_at": service.aware(latest.checked_at).isoformat()} if latest else None,
            "stale": latest is None or service.utcnow() - service.aware(latest.checked_at) >= timedelta(days=7),
            "auto_refresh": settings.RETAIL_PRICE_AUTO_REFRESH,
            "match": match_data}


@router.post("/preview", dependencies=[Depends(require_admin)])
def preview(bottle_id: int, payload: ProductInput, session: Session = Depends(get_session)):
    bottle_exists(bottle_id, session)
    return product_or_error(payload.product_url)


@router.put("/link", dependencies=[Depends(require_admin)])
def save_link(bottle_id: int, payload: LinkInput, session: Session = Depends(get_session)):
    bottle_exists(bottle_id, session)
    if not payload.confirmed:
        raise HTTPException(422, "Confirm the bottle size, expression, and release match.")
    product = product_or_error(payload.product_url)
    variant = next((v for v in product["variants"] if v["variant_id"] == payload.variant_id), None)
    if not variant:
        raise HTTPException(422, "Choose a product variant.")
    link = session.get(RetailPriceLink, bottle_id) or RetailPriceLink(
        bottle_id=bottle_id, product_url=product["product_url"], variant_id=payload.variant_id,
        product_title=product["product_title"],
    )
    link.product_url = product["product_url"]
    link.variant_id = payload.variant_id
    link.product_title = product["product_title"]
    link.barcode = variant["barcode"]
    link.last_attempt_at = service.utcnow()
    service.record_quote(session, link, product)
    set_state(session, bottle_id, "matched", "Product linked manually and market price updated.")
    return get_price(bottle_id, session)


@router.delete("/link", dependencies=[Depends(require_admin)])
def unlink(bottle_id: int, session: Session = Depends(get_session)):
    bottle_exists(bottle_id, session)
    link = session.get(RetailPriceLink, bottle_id)
    if link:
        session.delete(link)
        session.commit()
    set_state(session, bottle_id, "unlinked", "Product unlinked. Retry UPC matching or select a product manually.")
    return get_price(bottle_id, session)


@router.post("/refresh", dependencies=[Depends(require_admin)])
def refresh(bottle_id: int, session: Session = Depends(get_session)):
    bottle_exists(bottle_id, session)
    link = session.get(RetailPriceLink, bottle_id)
    if not link:
        raise HTTPException(404, "Link a LoveScotch product first.")
    if link.last_attempt_at and service.utcnow() - service.aware(link.last_attempt_at) < timedelta(hours=1):
        raise HTTPException(429, "This product was checked recently. Please wait an hour before refreshing.")
    try:
        service.refresh_link(session, link)
    except service.RetailPriceError as exc:
        raise HTTPException(502, str(exc)) from exc
    return get_price(bottle_id, session)


@router.post("/match", dependencies=[Depends(require_admin)], status_code=202)
def match(bottle_id: int, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    bottle_exists(bottle_id, session)
    state = session.get(RetailMatchState, bottle_id)
    if state and state.status in {"queued", "matching"} and service.utcnow() - service.aware(state.updated_at) < timedelta(minutes=10):
        return get_price(bottle_id, session)
    queue_match(session, background_tasks, bottle_id)
    return get_price(bottle_id, session)
