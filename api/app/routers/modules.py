from datetime import datetime, timezone
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin
from ..models import ModuleSetting

router = APIRouter(tags=["modules"])

ALLOWED_MODULES = {"wine"}


class ModuleUpdate(BaseModel):
    enabled: bool


def _module_snapshot(session: Session) -> Dict[str, bool]:
    rows = session.exec(select(ModuleSetting)).all()
    existing = {row.key: row.enabled for row in rows}
    return {key: bool(existing.get(key, False)) for key in ALLOWED_MODULES}


@router.get("/modules")
def list_modules(session: Session = Depends(get_session)):
    return {"modules": _module_snapshot(session)}


@router.get("/admin/modules", dependencies=[Depends(require_admin)])
def admin_modules(session: Session = Depends(get_session)):
    return {"modules": _module_snapshot(session)}


@router.put("/admin/modules/{module_key}", dependencies=[Depends(require_admin)])
def set_module(module_key: str, payload: ModuleUpdate, session: Session = Depends(get_session)):
    if module_key not in ALLOWED_MODULES:
        raise HTTPException(status_code=404, detail="Module not found")

    row = session.exec(select(ModuleSetting).where(ModuleSetting.key == module_key)).first()
    if row is None:
        row = ModuleSetting(key=module_key, enabled=payload.enabled, updated_at=datetime.now(timezone.utc))
    else:
        row.enabled = payload.enabled
        row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    return {"module": module_key, "enabled": row.enabled}
