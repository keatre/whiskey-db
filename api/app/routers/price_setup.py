import json
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin
from ..models import RetailPriceBatch
from ..services import retail_batch

router = APIRouter(prefix="/admin/price-setup", tags=["admin"], dependencies=[Depends(require_admin)])


class BatchInput(BaseModel):
    source: Literal["lovescotch"] = "lovescotch"


@router.get("")
def get_setup(session: Session = Depends(get_session)):
    due, missing = retail_batch.inventory(session)
    batch = session.exec(select(RetailPriceBatch).order_by(RetailPriceBatch.batch_id.desc())).first()
    return {"sources": [{"id": "lovescotch", "name": "LoveScotch"}],
            "eligible": len(due), "missing_identifier": missing,
            "batch": retail_batch.batch_response(batch)}


@router.post("/batch", status_code=202)
def start_batch(payload: BatchInput, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    with retail_batch.start_lock:
        active = session.exec(select(RetailPriceBatch).where(RetailPriceBatch.status.in_(["queued", "running"]))).first()
        if active:
            raise HTTPException(409, "A price lookup batch is already running.")
        due, _ = retail_batch.inventory(session)
        batch = RetailPriceBatch(source=payload.source, total=len(due), bottle_ids_json=json.dumps(due))
        session.add(batch)
        session.commit()
        session.refresh(batch)
        response = retail_batch.batch_response(batch)
        background_tasks.add_task(retail_batch.run_batch, batch.batch_id)
        return response
