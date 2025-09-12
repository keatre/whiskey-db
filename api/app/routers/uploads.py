import os
import uuid
import imghdr

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from ..deps import require_admin
from ..settings import settings

router = APIRouter(prefix="/uploads", tags=["uploads"])

# Config from settings / .env
MAX_SIZE_BYTES = int(settings.UPLOAD_MAX_MB) * 1024 * 1024
UPLOAD_DIR = settings.UPLOAD_DIR

os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/image", dependencies=[Depends(require_admin)])
async def upload_image(file: UploadFile = File(...)):
    """
    Admin-only image upload with streaming size check and sniffed type validation.
    Max size is controlled via .env -> UPLOAD_MAX_MB.
    """
    # Stream to temp file while enforcing size
    tmp_name = f"tmp_{uuid.uuid4().hex}"
    tmp_path = os.path.join(UPLOAD_DIR, tmp_name)

    bytes_written = 0
    try:
        with open(tmp_path, "wb") as out:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > MAX_SIZE_BYTES:
                    raise HTTPException(status_code=413, detail="File too large")
                out.write(chunk)

        # Validate actual image type (don’t trust extension/MIME)
        kind = imghdr.what(tmp_path)
        if kind not in {"jpeg", "png", "gif", "webp"}:
            raise HTTPException(status_code=415, detail="Unsupported image type")

        # Normalize extension based on sniffed type
        ext_map = {"jpeg": ".jpg", "png": ".png", "gif": ".gif", "webp": ".webp"}
        final_name = f"{uuid.uuid4().hex}{ext_map[kind]}"
        final_path = os.path.join(UPLOAD_DIR, final_name)

        os.replace(tmp_path, final_path)

        # Public URL (FastAPI mounts /static -> ./static)
        public_url = "/static/uploads/" + final_name
        return JSONResponse({"url": public_url})
    except:
        # Clean up temp file on any error
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass
        raise
