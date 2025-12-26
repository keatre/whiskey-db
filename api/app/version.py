"""Utility to resolve a branch + commit-date display string."""
from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text("utf-8").strip()
    except Exception:
        return None


def _resolve_git_dir(repo_root: Path) -> Path | None:
    git_path = repo_root / ".git"
    if git_path.is_dir():
        return git_path
    if git_path.is_file():
        content = _read_text(git_path) or ""
        if content.startswith("gitdir:"):
            rel = content.split("gitdir:", 1)[1].strip()
            return (repo_root / rel).resolve()
    return None


def _read_ref(git_dir: Path, ref_path: str) -> str | None:
    direct = _read_text(git_dir / ref_path)
    if direct:
        return direct.splitlines()[0].strip()
    packed = _read_text(git_dir / "packed-refs")
    if not packed:
        return None
    for line in packed.splitlines():
        if not line or line.startswith("#") or line.startswith("^"):
            continue
        try:
            sha, ref = line.split(" ", 1)
        except ValueError:
            continue
        if ref.strip() == ref_path:
            return sha.strip()
    return None


def _read_head_commit_date(git_dir: Path) -> str | None:
    log = _read_text(git_dir / "logs" / "HEAD")
    if not log:
        return None
    last_line = log.splitlines()[-1]
    left, _, _ = last_line.partition("\t")
    parts = left.split()
    if len(parts) < 6:
        return None
    try:
        ts = int(parts[-2])
    except ValueError:
        return None
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")


def resolve_version_display() -> str:
    """Resolve a human-friendly version string."""
    baked = Path(__file__).with_name("version.txt")
    baked_value = _read_text(baked)
    if baked_value:
        return baked_value

    repo_root = Path(__file__).resolve().parents[2]
    git_dir = _resolve_git_dir(repo_root)
    if not git_dir:
        return ""

    head = _read_text(git_dir / "HEAD") or ""
    branch = None
    if head.startswith("ref:"):
        ref_path = head.split("ref:", 1)[1].strip()
        if ref_path:
            branch = ref_path.split("/")[-1]
            _read_ref(git_dir, ref_path)
    elif head:
        branch = "detached"

    date = _read_head_commit_date(git_dir)
    if not branch or not date:
        return ""

    return f"{branch} ({date})"


if __name__ == "__main__":
    print(resolve_version_display())
