# api/app/routers/uploads.py
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
UPLOAD_DIR = settings.UPLOAD_DIR  # e.g., /data/uploads
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_IMGHDR = {"jpeg", "png", "gif", "webp"}  # formats we accept as-is


def _api_base_prefix() -> str:
    # Honor NEXT_PUBLIC_API_BASE from env (default /api)
    base = os.getenv("NEXT_PUBLIC_API_BASE", "/api") or "/api"
    return base.rstrip("/")


def _looks_like_dng(path: str, filename: str) -> bool:
    """Cheap DNG check: extension .dng OR TIFF header."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext == ".dng":
        return True
    try:
        with open(path, "rb") as f:
            sig = f.read(4)
        # DNG is TIFF-based: 'II*\\x00' (little-endian) or 'MM\\x00*' (big-endian)
        return sig in (b"II*\x00", b"MM\x00*")
    except Exception:
        return False


@router.post("/image", dependencies=[Depends(require_admin)])
async def upload_image(file: UploadFile = File(...)):
    """
    Admin-only image upload with streaming size check and actual type validation.
    - jpeg/png/gif/webp are saved as-is
    - dng is converted to jpeg (sRGB) and saved (with sensible brightness/WB)
    Files are served at <API_BASE>/uploads/<filename>.
    """
    tmp_name = f"tmp_{uuid.uuid4().hex}"
    tmp_path = os.path.join(UPLOAD_DIR, tmp_name)
    bytes_written = 0

    try:
        # Stream to disk with size enforcement
        with open(tmp_path, "wb") as out:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > MAX_SIZE_BYTES:
                    raise HTTPException(status_code=413, detail="File too large")
                out.write(chunk)

        # ---- DNG path: convert to JPEG with better defaults for phone RAW ----
        if _looks_like_dng(tmp_path, file.filename or ""):
            try:
                import rawpy
                import numpy as np
                from PIL import Image, ImageOps, ImageEnhance
            except Exception:
                # Clean temp on failure to import
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
                raise HTTPException(
                    status_code=415,
                    detail="DNG not supported on server (rawpy/Pillow/numpy not installed)."
                )

            try:
                with rawpy.imread(tmp_path) as raw:
                    # Use camera WB, allow auto-bright (prevents very dark results),
                    # gentle threshold, recover highlights, and output sRGB 8-bit.
                    rgb = raw.postprocess(
                        use_camera_wb=True,                     # better for phone RAW
                        no_auto_bright=False,                   # ENABLE auto brightness
                        auto_bright_thr=0.05,                   # nudge thr a bit
                        output_color=rawpy.ColorSpace.sRGB,
                        gamma=(2.222, 4.5),
                        output_bps=8,
                        highlight_mode=rawpy.HighlightMode.Blend,
                        demosaic_algorithm=rawpy.DemosaicAlgorithm.AHD,
                    )

                # Optional: if still unusually dark, apply a light correction
                # (kept very conservative to avoid blowing highlights)
                mean_luma = float(np.array(rgb, dtype=np.float32).mean())
                img = Image.fromarray(rgb)
                if mean_luma < 70:  # 0..255 scale; tweak if desired
                    img = ImageOps.autocontrast(img, cutoff=1)
                    img = ImageEnhance.Brightness(img).enhance(1.12)

                final_name = f"{uuid.uuid4().hex}.jpg"
                final_path = os.path.join(UPLOAD_DIR, final_name)
                img.save(final_path, format="JPEG", quality=90, optimize=True)
            finally:
                # Remove temp DNG
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

            public_url = f"{_api_base_prefix()}/uploads/{final_name}"
            return JSONResponse({"url": public_url})

        # ---- Non-DNG path: accept common web raster formats as-is ----
        kind = imghdr.what(tmp_path)  # returns 'jpeg', 'png', 'gif', 'webp', etc.
        if kind not in ALLOWED_IMGHDR:
            try:
                os.remove(tmp_path)
            except Exception:
                pass
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported image type. Allowed: {', '.join(sorted(ALLOWED_IMGHDR))} or DNG (auto-converted)."
            )

        ext_map = {"jpeg": ".jpg", "png": ".png", "gif": ".gif", "webp": ".webp"}
        final_name = f"{uuid.uuid4().hex}{ext_map[kind]}"
        final_path = os.path.join(UPLOAD_DIR, final_name)
        os.replace(tmp_path, final_path)

        public_url = f"{_api_base_prefix()}/uploads/{final_name}"
        return JSONResponse({"url": public_url})

    except HTTPException:
        raise
    except Exception:
        # Best-effort cleanup
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        raise
