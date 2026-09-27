"""UPC discovery agents. Catalog SKUs nominate candidates; product barcodes confirm them."""
import json
import logging
import re
import threading
import time
from datetime import timedelta

import httpx
from sqlmodel import Session

from ..models import Bottle, RetailCatalogCache, RetailMatchState, RetailPriceLink
from . import retail_prices as prices

logger = logging.getLogger(__name__)
_match_lock = threading.Lock()
_catalog_failure_at = {}


def normalize_barcode(value):
    # UPC-A and its zero-padded EAN/GTIN forms represent the same item.
    value = re.sub(r"[\s-]", "", str(value or ""))
    if not re.fullmatch(r"[0-9]{8}|[0-9]{12,14}", value):
        return None
    return value.zfill(14)


def catalog_candidates(session: Session, barcode: str, collection: str | None = None):
    scope = f"lovescotch:{collection}" if collection else "lovescotch"
    endpoint = f"https://lovescotch.com/collections/{collection}/products.json" if collection else "https://lovescotch.com/products.json"
    cached = session.get(RetailCatalogCache, scope)
    if cached and prices.utcnow() - prices.aware(cached.fetched_at) < timedelta(days=7):
        return json.loads(cached.candidates_json).get(barcode, [])
    failed_at = _catalog_failure_at.get(scope)
    if failed_at and prices.utcnow() - failed_at < timedelta(minutes=15):
        raise prices.RetailPriceError("LoveScotch catalog is temporarily unavailable. Retry in 15 minutes or link manually.")
    index = {}
    started = time.monotonic()
    page = 0
    try:
        # Build a complete index before accepting a match, so duplicate UPCs are visible.
        # Never replace a complete cached catalog with a partial/failed download.
        with prices._request_lock:
            with httpx.Client(timeout=10, follow_redirects=False, headers={
                "User-Agent": "WhiskeyDB/retail-price-lookup", "Accept": "application/json",
            }) as client:
                for page in range(1, 101):
                    if time.monotonic() - started > 300:
                        raise ValueError("Catalog lookup exceeded five minutes")
                    for attempt in range(3):
                        time.sleep(max(0, (2 if attempt == 0 else 5 * attempt) - (time.monotonic() - prices._last_request)))
                        try:
                            response = client.get(endpoint, params={"limit": 250, "page": page})
                            if collection and response.status_code == 404:
                                products = []
                            else:
                                response.raise_for_status()
                                products = response.json()["products"]
                            break
                        except httpx.HTTPStatusError as exc:
                            if attempt == 2 or exc.response.status_code not in {500, 502, 503, 504}:
                                raise
                        except httpx.TransportError:
                            if attempt == 2:
                                raise
                        finally:
                            prices._last_request = time.monotonic()
                    if not isinstance(products, list):
                        raise ValueError("Invalid catalog")
                    for product in products:
                        url = prices.canonical_url("https://lovescotch.com/products/" + product["handle"])
                        for variant in product["variants"]:
                            key = normalize_barcode(variant.get("barcode") or variant.get("sku"))
                            if key:
                                candidate = {"product_url": url, "variant_id": str(variant["id"]),
                                             "title": product["title"], "tags": product.get("tags", []),
                                             "variant_title": variant["title"]}
                                index.setdefault(key, {})[candidate["variant_id"]] = candidate
                    if len(products) < 250:
                        break
                else:
                    raise ValueError("Catalog exceeded page limit")
        index = {key: list(values.values()) for key, values in index.items()}
        cache = cached or RetailCatalogCache(provider=scope, candidates_json="{}")
        cache.candidates_json = json.dumps(index)
        cache.fetched_at = prices.utcnow()
        session.add(cache)
        session.commit()
        _catalog_failure_at.pop(scope, None)
        return index.get(barcode, [])
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        _catalog_failure_at[scope] = prices.utcnow()
        reason = prices.error_detail(exc)
        logger.warning("LoveScotch catalog failed: scope=%s page=%s endpoint=%s reason=%s", scope, page, endpoint, reason)
        raise prices.RetailPriceError(f"LoveScotch catalog lookup failed ({scope}, page {page}: {reason}). Retry in 15 minutes or link manually.") from exc


def collection_handles(brand):
    # Retailer handles vary: Oban uses oban-distillery; possessives often omit the apostrophe.
    handles = []
    for text in (brand, brand.replace("'", "").replace("’", "")):
        slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
        if slug and slug not in handles:
            handles.append(slug)
    return list(dict.fromkeys(handles + [f"{slug}-distillery" for slug in handles]))


def discover_candidates(session, barcode, brand):
    # Try a bounded set of small brand collections before the store-wide catalog.
    for slug in collection_handles(brand):
        try:
            candidates = catalog_candidates(session, barcode, collection=slug)
            if candidates:
                return candidates
        except prices.RetailPriceError as exc:
            logger.info("LoveScotch brand collection unavailable: collection=%s reason=%s", slug, exc)
    return catalog_candidates(session, barcode)


def set_state(session, bottle_id, status, message):
    state = session.get(RetailMatchState, bottle_id) or RetailMatchState(
        bottle_id=bottle_id, status=status, message=message)
    state.status, state.message, state.updated_at = status, message, prices.utcnow()
    session.add(state)
    session.commit()


def queue_match(session, background_tasks, bottle_id):
    set_state(session, bottle_id, "queued", "Waiting to look up the bottle barcode.")
    background_tasks.add_task(match_bottle, bottle_id)


def title_years(title):
    return {int(year) for year in re.findall(r"\b(?:19|20)\d{2}\b", title or "")}


def expected_year(bottle):
    if bottle.release_year:
        return bottle.release_year
    years = title_years(bottle.expression)
    return next(iter(years)) if len(years) == 1 else None


def candidate_years(candidate):
    # Product/variant names identify releases; tags and descriptions do not.
    return title_years(candidate["title"]) | title_years(candidate["variant_title"])


def select_release_candidates(bottle, candidates):
    year = expected_year(bottle)
    if not year:
        return candidates, None
    matching = [c for c in candidates if year in candidate_years(c)]
    if matching:
        return matching, None
    undated = [c for c in candidates if not candidate_years(c)]
    if undated:
        return undated, None
    found = ", ".join(str(y) for y in sorted(set().union(*(candidate_years(c) for c in candidates))))
    return [], f"UPC matches releases titled {found}, but no {year} release was found. Please review the product link."


def review_reason(bottle, candidate):
    tags = candidate.get("tags", [])
    text = " ".join([candidate["title"], candidate["variant_title"],
                     tags if isinstance(tags, str) else " ".join(tags)]).lower()
    if re.search(r"\bbundle\b|\bgift set\b|\bpack\b", text):
        return "The UPC candidate is a bundle or gift set. Please confirm the product manually."
    sizes = {round(float(number) * (1000 if unit == "l" else 1))
             for number, unit in re.findall(r"\b(\d+(?:\.\d+)?)\s*(ml|l)\b", text)}
    if bottle.size_ml and sizes and sizes != {bottle.size_ml}:
        return f"The UPC candidate lists a different bottle size than {bottle.size_ml} ml. Please confirm the product manually."
    year = expected_year(bottle)
    years = candidate_years(candidate)
    if year and years and year not in years:
        return f"The retailer title lists release year {', '.join(map(str, sorted(years)))}, but your bottle specifies {year}. No matching release was found."
    return None


def match_bottle(bottle_id):
    from ..db import engine
    with _match_lock, Session(engine) as session:
        bottle = session.get(Bottle, bottle_id)
        if not bottle:
            return
        try:
            link = session.get(RetailPriceLink, bottle_id)
            if link:
                if not link.last_attempt_at or prices.utcnow() - prices.aware(link.last_attempt_at) >= timedelta(hours=1):
                    prices.refresh_link(session, link)
                set_state(session, bottle_id, "matched", "Using the existing LoveScotch product link.")
                return
            barcode = normalize_barcode(bottle.barcode_upc)
            if not barcode:
                set_state(session, bottle_id, "missing_upc", "Add a valid UPC/EAN barcode to the bottle, or link a product manually.")
                return
            set_state(session, bottle_id, "matching", "Looking up the UPC in LoveScotch's catalog. The first lookup may take a few minutes.")
            candidates = discover_candidates(session, barcode, bottle.brand)
            if not candidates:
                set_state(session, bottle_id, "no_match", "No UPC candidate found in LoveScotch's catalog. You can link a product manually.")
                return
            candidates, year_error = select_release_candidates(bottle, candidates)
            if year_error:
                set_state(session, bottle_id, "needs_review", year_error)
                return
            reason = ("Multiple products match the UPC. Please link the correct product manually."
                      if len(candidates) != 1 else review_reason(bottle, candidates[0]))
            if reason:
                set_state(session, bottle_id, "needs_review", reason)
                return
            candidate = candidates[0]
            product = prices.fetch_product(candidate["product_url"])
            variant = next((v for v in product["variants"] if v["variant_id"] == candidate["variant_id"]), None)
            if not variant or normalize_barcode(variant["barcode"]) != barcode:
                set_state(session, bottle_id, "no_match", "The catalog candidate's actual barcode did not match. Please link manually.")
                return
            # Check the live title too: cached catalog names may describe an older release.
            candidate = {**candidate, "title": product["product_title"], "variant_title": variant["title"]}
            reason = review_reason(bottle, candidate)
            if reason:
                set_state(session, bottle_id, "needs_review", reason)
                return
            # A user may have changed the bottle or linked it while the network request ran.
            session.expire_all()
            bottle = session.get(Bottle, bottle_id)
            if not bottle:
                return
            if session.get(RetailPriceLink, bottle_id):
                set_state(session, bottle_id, "matched", "Using the manually selected product link.")
                return
            if normalize_barcode(bottle.barcode_upc) != barcode or review_reason(bottle, candidate):
                set_state(session, bottle_id, "needs_review", "Bottle details changed during lookup. Retry matching or link manually.")
                return
            link = RetailPriceLink(bottle_id=bottle_id, product_url=product["product_url"],
                                   variant_id=variant["variant_id"], product_title=product["product_title"],
                                   barcode=variant["barcode"], last_attempt_at=prices.utcnow())
            prices.record_quote(session, link, product)
            set_state(session, bottle_id, "matched", "Matched automatically by UPC and updated the market price.")
        except Exception as exc:
            session.rollback()
            logger.warning("Retail matching failed for bottle %s: %s", bottle_id, prices.error_detail(exc),
                           exc_info=not isinstance(exc, prices.RetailPriceError))
            if session.get(Bottle, bottle_id):
                message = str(exc) if isinstance(exc, prices.RetailPriceError) else "Price lookup failed. Retry matching or link manually."
                set_state(session, bottle_id, "error", message)
