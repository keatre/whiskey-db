from datetime import datetime, date
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

# --- Link table FIRST ---
class BottleTag(SQLModel, table=True):
    bottle_id: int = Field(foreign_key="bottle.bottle_id", primary_key=True)
    tag_id: int = Field(foreign_key="tag.tag_id", primary_key=True)

class Retailer(SQLModel, table=True):
    retailer_id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: Optional[str] = None            # store/auction/private
    website: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None

class Tag(SQLModel, table=True):
    tag_id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    bottles: List["Bottle"] = Relationship(back_populates="tags", link_model=BottleTag)

class BottleBase(SQLModel):
    brand: str
    expression: Optional[str] = None
    distillery: Optional[str] = None
    style: Optional[str] = None
    region: Optional[str] = None
    age: Optional[int] = None
    proof: Optional[float] = None
    abv: Optional[float] = None
    size_ml: Optional[int] = None
    release_year: Optional[int] = None
    barcode_upc: Optional[str] = None
    mashbill_markdown: Optional[str] = None
    notes_markdown: Optional[str] = None
    image_url: Optional[str] = None
    is_rare: bool = Field(default=False)

class BottleAudit(SQLModel, table=True):
    audit_id: Optional[int] = Field(default=None, primary_key=True)
    bottle_id: int
    changed_by: Optional[str] = None        # future: user id/subject
    changed_at: datetime = Field(default_factory=datetime.utcnow)
    # store as JSON string (SQLite TEXT)
    changes_json: str

class Bottle(BottleBase, table=True):
    bottle_id: Optional[int] = Field(default=None, primary_key=True)
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
    status: Optional[str] = None          # sealed/open/finished
    created_utc: datetime = Field(default_factory=datetime.utcnow)
    updated_utc: datetime = Field(default_factory=datetime.utcnow)

    bottle: "Bottle" = Relationship(back_populates="purchases")

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

class PurchaseUpdate(SQLModel):
    bottle_id: Optional[int] = None
    purchase_date: Optional[str] = None   # accept ISO string; we’ll coerce
    retailer_id: Optional[int] = None
    price_paid: Optional[float] = None
    tax_paid: Optional[float] = None
    location: Optional[str] = None
    quantity: Optional[int] = None
    storage_location: Optional[str] = None
    opened_dt: Optional[str] = None       # accept ISO string; we’ll coerce
    killed_dt: Optional[str] = None
    status: Optional[str] = None

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    username: Optional[str] = Field(default=None, index=True)
    email: Optional[str] = Field(default=None, index=True)
    password_hash: str
    role: str  # 'admin' or 'guest'
    is_active: bool = True
    created_at: Optional[datetime] = None
