import imghdr
import os
import uuid

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/uploads", tags=["uploads"])

# 10 MB default; tweak with env if you like
MAX_SIZE = int(os.getenv("UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "static/uploads")

os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    # basic length guard (header may omit, so we also stream-check)
    if file.size and file.size > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    # save to temp, then validate it is actually an image
    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    name = f"{uuid.uuid4().hex}{ext}"
    tmp_path = os.path.join(UPLOAD_DIR, f"tmp_{name}")
    final_path = os.path.join(UPLOAD_DIR, name)

    bytes_written = 0
    with open(tmp_path, "wb") as out:
        while True:
            chunk = await file.read(64 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > MAX_SIZE:
                out.close()
                os.remove(tmp_path)
                raise HTTPException(status_code=413, detail="File too large")
            out.write(chunk)

    # sniff type (don’t trust extension)
    kind = imghdr.what(tmp_path)
    if kind not in {"jpeg", "png", "gif", "webp"}:
        os.remove(tmp_path)
        raise HTTPException(status_code=415, detail="Unsupported image type")

    # normalize extension based on sniffed type
    ext_map = {"jpeg": ".jpg", "png": ".png", "gif": ".gif", "webp": ".webp"}
    final_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}{ext_map[kind]}")

    os.replace(tmp_path, final_path)

    # public URL served by /static
    public_url = "/static/uploads/" + os.path.basename(final_path)
    return JSONResponse({"url": public_url})
