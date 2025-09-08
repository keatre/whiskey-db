from datetime import datetime, date
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class Retailer(SQLModel, table=True):
    retailer_id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None

class Tag(SQLModel, table=True):
    tag_id: Optional[int] = Field(default=None, primary_key=True)
    name: str

class BottleTag(SQLModel, table=True):
    bottle_id: int = Field(foreign_key="bottle.bottle_id", primary_key=True)
    tag_id: int = Field(foreign_key="tag.tag_id", primary_key=True)

class Bottle(SQLModel, table=True):
    bottle_id: Optional[int] = Field(default=None, primary_key=True)
    brand: str
    expression: Optional[str] = None
    distillery: Optional[str] = None
    style: Optional[str] = None
    region: Optional[str] = None
    age: Optional[int] = None
    abv: Optional[float] = None
    size_ml: Optional[int] = None
    release_year: Optional[int] = None
    barcode_upc: Optional[str] = None
    notes_markdown: Optional[str] = None
    image_url: Optional[str] = None
    created_utc: datetime = Field(default_factory=datetime.utcnow)
    updated_utc: datetime = Field(default_factory=datetime.utcnow)

    purchases: List["Purchase"] = Relationship(back_populates="bottle")
    tags: List[Tag] = Relationship(back_populates="bottles", link_model=BottleTag)

class Purchase(SQLModel, table=True):
    purchase_id: Optional[int] = Field(default=None, primary_key=True)
    bottle_id: int = Field(foreign_key="bottle.bottle_id")
    purchase_date: Optional[date] = None
    retailer_id: Optional[int] = Field(default=None, foreign_key="retailer.retailer_id")
    price_paid: Optional[float] = None
    tax_paid: Optional[float] = None
    location: Optional[str] = None
    quantity: int = 1
    storage_location: Optional[str] = None
    opened_dt: Optional[datetime] = None
    killed_dt: Optional[datetime] = None
    status: Optional[str] = None
    created_utc: datetime = Field(default_factory=datetime.utcnow)
    updated_utc: datetime = Field(default_factory=datetime.utcnow)

    bottle: Bottle = Relationship(back_populates="purchases")

class TastingNote(SQLModel, table=True):
    note_id: Optional[int] = Field(default=None, primary_key=True)
    purchase_id: int = Field(foreign_key="purchase.purchase_id")
    tasted_dt: Optional[datetime] = None
    nose: Optional[str] = None
    palate: Optional[str] = None
    finish: Optional[str] = None
    rating_100: Optional[int] = None
    notes_markdown: Optional[str] = None
    created_utc: datetime = Field(default_factory=datetime.utcnow)
    updated_utc: datetime = Field(default_factory=datetime.utcnow)

Tag.bottles = Relationship(back_populates="tags", link_model=BottleTag)
