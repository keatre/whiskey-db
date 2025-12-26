"""Utility to resolve a branch + commit-date display string."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def _git_safe_run(args: list[str], repo: Path) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(repo), "-c", f"safe.directory={str(repo)}", *args],
            encoding="utf-8",
            stderr=subprocess.DEVNULL,
        ).strip()
        return out
    except Exception:
        return None


def resolve_version_display() -> str:
    """Resolve a human-friendly version string."""
    repo_root = Path(__file__).resolve().parents[2]

    branch = _git_safe_run(["rev-parse", "--abbrev-ref", "HEAD"], repo_root)
    date = _git_safe_run(["show", "-s", "--format=%cd", "--date=format:%Y-%m-%d", "HEAD"], repo_root)

    if not branch or not date:
        return ""

    return f"{branch} ({date})"


if __name__ == "__main__":
    print(resolve_version_display())
