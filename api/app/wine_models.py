from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import MetaData
from sqlmodel import SQLModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class WineSQLModel(SQLModel):
    metadata = MetaData()
    __abstract__ = True


class WineBottleBase(WineSQLModel):
    brand: str
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
    is_rare: bool = Field(default=False)


class WineBottle(WineBottleBase, table=True):
    __tablename__ = "wine_bottle"

    wine_id: Optional[int] = Field(default=None, primary_key=True)
    created_utc: datetime = Field(default_factory=_utcnow)
    updated_utc: datetime = Field(default_factory=_utcnow)
