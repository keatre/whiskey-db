"""Admin-triggered, sequential price checks with persisted progress."""
import json
import logging
import threading
from datetime import timedelta

from sqlmodel import Session, select

from ..models import Bottle, MarketPrice, RetailPriceBatch, RetailPriceLink, RetailPriceObservation, RetailMatchState
from . import retail_prices as prices
from .retail_matching import match_bottle, normalize_barcode

logger = logging.getLogger(__name__)
start_lock = threading.Lock()


def latest_update(session, bottle, link):
    if link:
        quote = session.exec(select(RetailPriceObservation).where(
            RetailPriceObservation.bottle_id == bottle.bottle_id,
            RetailPriceObservation.product_url == link.product_url,
            RetailPriceObservation.variant_id == link.variant_id,
        ).order_by(RetailPriceObservation.checked_at.desc())).first()
        return prices.aware(quote.checked_at) if quote else None
    if bottle.barcode_upc:
        quotes = session.exec(select(MarketPrice).where(
            MarketPrice.barcode_upc == bottle.barcode_upc.strip(), MarketPrice.price.is_not(None),
        )).all()
        return max((prices.aware(q.as_of or q.fetched_at) for q in quotes), default=None)
    return None


def eligibility(session, bottle):
    link = session.get(RetailPriceLink, bottle.bottle_id)
    if not link and not normalize_barcode(bottle.barcode_upc):
        return "missing"
    updated = latest_update(session, bottle, link)
    return "fresh" if updated and updated > prices.utcnow() - timedelta(days=7) else "due"


def inventory(session):
    due, missing = [], 0
    for bottle in session.exec(select(Bottle).order_by(Bottle.bottle_id)).all():
        state = eligibility(session, bottle)
        if state == "due":
            due.append(bottle.bottle_id)
        elif state == "missing":
            missing += 1
    return due, missing


def batch_response(batch):
    if not batch:
        return None
    results = json.loads(batch.results_json)
    return {"batch_id": batch.batch_id, "source": batch.source, "status": batch.status,
            "total": batch.total, "completed": len(results), "results": results,
            "current_bottle": batch.current_bottle,
            "created_at": prices.aware(batch.created_at).isoformat(),
            "finished_at": prices.aware(batch.finished_at).isoformat() if batch.finished_at else None,
            "updated": sum(r["status"] == "updated" for r in results),
            "failed": sum(r["status"] == "error" for r in results),
            "needs_attention": sum(r["status"] in {"needs_review", "no_match", "missing_upc"} for r in results),
            "skipped": sum(r["status"] == "skipped" for r in results)}


def interrupt_unfinished_batches():
    from ..db import engine
    with Session(engine) as session:
        for batch in session.exec(select(RetailPriceBatch).where(RetailPriceBatch.status.in_(["queued", "running"]))).all():
            batch.status = "interrupted"
            batch.current_bottle = None
            batch.finished_at = prices.utcnow()
            session.add(batch)
        session.commit()


def run_batch(batch_id):
    from ..db import engine
    with Session(engine) as session:
        batch = session.get(RetailPriceBatch, batch_id)
        if not batch or batch.status != "queued":
            return
        batch.status = "running"
        session.add(batch)
        session.commit()
        try:
            for bottle_id in json.loads(batch.bottle_ids_json):
                bottle = session.get(Bottle, bottle_id)
                name = f"{bottle.brand} {bottle.expression or ''}".strip() if bottle else f"Bottle #{bottle_id}"
                batch.current_bottle = name
                session.add(batch)
                session.commit()
                status, message = "skipped", "Bottle was deleted or its price has already been updated."
                try:
                    if bottle and eligibility(session, bottle) == "due":
                        link = session.get(RetailPriceLink, bottle_id)
                        if link and link.last_attempt_at and prices.utcnow() - prices.aware(link.last_attempt_at) < timedelta(hours=1):
                            message = "Checked within the last hour; retry in a later batch."
                        else:
                            match_bottle(bottle_id)
                            session.expire_all()
                            bottle = session.get(Bottle, bottle_id)
                            state = session.get(RetailMatchState, bottle_id)
                            if bottle and eligibility(session, bottle) == "fresh":
                                status, message = "updated", "Market price updated from LoveScotch."
                            elif state:
                                status, message = state.status, state.message
                                if status in {"matched", "queued", "matching"}:
                                    status, message = "skipped", "No new quote was saved; retry later."
                            else:
                                message = "Bottle is no longer available."
                except Exception:
                    session.rollback()
                    logger.exception("Batch %s lookup failed for bottle %s", batch_id, bottle_id)
                    status, message = "error", "Lookup failed. Try this bottle again individually."
                batch = session.get(RetailPriceBatch, batch_id)
                results = json.loads(batch.results_json)
                results.append({"bottle_id": bottle_id, "name": name, "status": status, "message": message})
                batch.results_json = json.dumps(results)
                session.add(batch)
                session.commit()
            batch.status = "completed"
        except Exception:
            session.rollback()
            logger.exception("Retail batch %s interrupted", batch_id)
            batch = session.get(RetailPriceBatch, batch_id)
            batch.status = "interrupted"
        batch.current_bottle = None
        batch.finished_at = prices.utcnow()
        session.add(batch)
        session.commit()
