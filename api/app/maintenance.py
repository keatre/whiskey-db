# api/app/maintenance.py
from sqlmodel import Session, text
import os

def _api_base_prefix() -> str:
    # Prefer frontend env (propagated into API container via compose), fallback to /api
    base = os.getenv("NEXT_PUBLIC_API_BASE", "/api") or "/api"
    return base.rstrip("/")

def normalize_image_urls(session: Session) -> int:
    """
    Normalize legacy/stale bottle.image_url values to use the API prefix
    and a leading slash, so the browser hits /api/static/uploads/<file>.

    Idempotent; safe to run multiple times.
    Returns number of rows updated (best-effort estimate).
    """
    api = _api_base_prefix()

    # 1) Fix 'static/uploads/foo.jpg' → '/static/uploads/foo.jpg'
    r1 = session.exec(
        text("""
            UPDATE bottle
               SET image_url = '/' || image_url
             WHERE image_url LIKE 'static/uploads/%';
        """)
    )

    # 2) Prefix '/api' for '/static/uploads/foo.jpg' → '/api/static/uploads/foo.jpg'
    r2 = session.exec(
        text(f"""
            UPDATE bottle
               SET image_url = '{api}' || image_url
             WHERE image_url LIKE '/static/uploads/%'
               AND image_url NOT LIKE '{api}/%';
        """)
    )

    # 3) Remove double '/api' prefixes like '/api/api/static/uploads/foo.jpg'
    r3 = session.exec(
        text(f"""
            UPDATE bottle
               SET image_url = REPLACE(image_url, '{api}{api}/', '{api}/')
             WHERE image_url LIKE '{api}{api}/%';
        """)
    )

    session.commit()

    # r1/r2/r3 rowcounts are None on some SQLite builds; return best-effort
    return sum([(r1.rowcount or 0), (r2.rowcount or 0), (r3.rowcount or 0)])


def maybe_fix_legacy_image_urls(session: Session) -> None:
    """
    Gate the normalization behind an env flag so you control when it runs.
    Set IMAGE_URL_MIGRATE_ON_START=true in .env to enable.
    """
    flag = (os.getenv("IMAGE_URL_MIGRATE_ON_START") or "").strip().lower()
    if flag not in {"1", "true", "yes", "on"}:
        return
    try:
        changed = normalize_image_urls(session)
        if changed:
            print(f"[maintenance] image_url normalization updated {changed} row(s).")
        else:
            print("[maintenance] image_url normalization found nothing to change.")
    except Exception as e:
        # non-fatal; continue boot
        print(f"[maintenance] image_url normalization failed: {e}")
