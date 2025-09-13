#!/usr/bin/env python3
"""
Normalize image URLs stored in the DB so they all use the new API path:

    /api/uploads/<file>

The script:
  1) Ensures leading slash for bare forms: 'uploads/...' -> '/uploads/...'
  2) Converts legacy '/static/uploads/...' -> '/uploads/...'
  3) Ensures API prefix on '/uploads/...': -> '/api/uploads/...'
  4) Collapses any accidental '/api/api/...'
  5) (NEW) Converts '/api/static/uploads/...' -> '/api/uploads/...'

Usage (inside container):
    python /app/scripts/normalize_image_urls.py         # dry-run
    RUN=1 python /app/scripts/normalize_image_urls.py   # commit changes

Environment:
    DB_PATH (default: /data/whiskey.db)
    NEXT_PUBLIC_API_BASE (default: /api)
    RUN=1 to commit; otherwise dry-run only.
"""
import os
import sqlite3

DB = os.getenv("DB_PATH", "/data/whiskey.db")
API = (os.getenv("NEXT_PUBLIC_API_BASE") or "/api").rstrip("/")
RUN = os.getenv("RUN") == "1"

def show_counts(cur, tag):
    q = """
    SELECT
      SUM(image_url LIKE '/api/uploads/%')        AS api_uploads,
      SUM(image_url LIKE '/uploads/%')            AS uploads,
      SUM(image_url LIKE '/static/uploads/%')     AS static_slash,
      SUM(image_url LIKE 'static/uploads/%')      AS static_noslash,
      SUM(image_url LIKE 'uploads/%')             AS uploads_noslash,
      SUM(image_url LIKE '/api/static/uploads/%') AS api_static_uploads,
      SUM(image_url LIKE '/api/api/%')            AS double_api,
      SUM(image_url LIKE 'http%')                 AS http_abs,
      SUM(image_url IS NOT NULL AND TRIM(image_url)<>'') AS total_nonempty
    FROM bottle
    """
    cur.execute(q)
    row = cur.fetchone()
    keys = [
        "api_uploads","uploads","static_slash","static_noslash","uploads_noslash",
        "api_static_uploads","double_api","http_abs","total_nonempty"
    ]
    print(f"{tag}: {dict(zip(keys, row))}")

def main():
    print(f"[normalize] DB={DB}  API_BASE={API}  mode={'COMMIT' if RUN else 'DRY-RUN'}")
    if not os.path.exists(DB):
        print(f"[normalize] DB not found: {DB}")
        raise SystemExit(1)

    con = sqlite3.connect(DB)
    cur = con.cursor()

    show_counts(cur, "before")

    # Start transaction
    con.execute("BEGIN")

    # 1) Ensure leading slash for bare forms
    cur.execute("UPDATE bottle SET image_url='/'||image_url WHERE image_url LIKE 'static/uploads/%'")
    cur.execute("UPDATE bottle SET image_url='/'||image_url WHERE image_url LIKE 'uploads/%'")

    # 2) Map legacy /static/uploads -> /uploads
    cur.execute("UPDATE bottle SET image_url=REPLACE(image_url, '/static/uploads/', '/uploads/') WHERE image_url LIKE '/static/uploads/%'")

    # 3) Ensure API base prefix for /uploads
    cur.execute(f"""
        UPDATE bottle
           SET image_url='{API}'||image_url
         WHERE image_url LIKE '/uploads/%'
           AND image_url NOT LIKE '{API}/%'
    """)

    # 4) Collapse accidental double /api/api
    cur.execute(f"""
        UPDATE bottle
           SET image_url=REPLACE(image_url, '{API}{API}/', '{API}/')
         WHERE image_url LIKE '{API}{API}/%'
    """)

    # 5) (NEW) Convert '/api/static/uploads/...' -> '/api/uploads/...'
    cur.execute("""
        UPDATE bottle
           SET image_url=REPLACE(image_url, '/api/static/uploads/', '/api/uploads/')
         WHERE image_url LIKE '/api/static/uploads/%'
    """)

    if RUN:
        con.commit()
        print("[normalize] Changes committed.")
    else:
        con.rollback()
        print("[normalize] DRY-RUN: Rolled back changes. Set RUN=1 to commit.")

    show_counts(cur, "after (post-tx)")
    cur.execute("SELECT image_url FROM bottle WHERE image_url IS NOT NULL AND TRIM(image_url)<>'' LIMIT 8")
    samples = [r[0] for r in cur.fetchall()]
    print("[normalize] sample values:", samples)

if __name__ == "__main__":
    main()
