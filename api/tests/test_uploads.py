from pathlib import Path

from api.app.routers.uploads import _identify_image


def test_identify_image_fallback_accepts_truncated_jpeg(tmp_path: Path) -> None:
    target = tmp_path / "sample.jpg"
    target.write_bytes(b"\xFF\xD8\xFF\xE0" + b"\x00" * 8)

    assert _identify_image(str(target)) == "JPEG"


def test_identify_image_rejects_unknown_signature(tmp_path: Path) -> None:
    target = tmp_path / "not-an-image.bin"
    target.write_bytes(b"\x00" * 16)

    assert _identify_image(str(target)) is None
