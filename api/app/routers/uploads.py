# api/app/routers/uploads.py
import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError

from ..deps import require_admin
from ..settings import settings

router = APIRouter(prefix="/uploads", tags=["uploads"])

# Config from settings / .env
MAX_SIZE_BYTES = int(settings.UPLOAD_MAX_MB) * 1024 * 1024


def _resolve_upload_dir(configured: str) -> str:
    try:
        os.makedirs(configured, exist_ok=True)
        return configured
    except PermissionError:
        fallback = os.path.join(tempfile.gettempdir(), "whiskey_uploads")
        os.makedirs(fallback, exist_ok=True)
        return fallback


UPLOAD_DIR = _resolve_upload_dir(settings.UPLOAD_DIR)  # e.g., /data/uploads or temp fallback

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "GIF", "WEBP"}


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
                    limit_mb = float(settings.UPLOAD_MAX_MB)
                    wrote_mb = bytes_written / 1024 / 1024
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large ({wrote_mb:.2f} MB > {limit_mb} MB limit)",
                    )
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
        image_format = _identify_image(tmp_path)
        if not image_format:
            try:
                os.remove(tmp_path)
            except Exception:
                pass
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported image type. Allowed: {', '.join(sorted(ALLOWED_IMAGE_FORMATS))} or DNG (auto-converted)."
            )

        ext_map = {"JPEG": ".jpg", "PNG": ".png", "GIF": ".gif", "WEBP": ".webp"}
        final_name = f"{uuid.uuid4().hex}{ext_map[image_format]}"
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
def _identify_image(path: str) -> str | None:
    try:
        with Image.open(path) as img:
            fmt = (img.format or "").upper()
    except (UnidentifiedImageError, OSError):
        return None
    if fmt in ALLOWED_IMAGE_FORMATS:
        return fmt
    return None
