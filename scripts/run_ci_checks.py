#!/usr/bin/env python3
"""Bootstrap a local virtualenv and run repo lint/tests.

Steps:
1. Create (or reuse) .venv in repo root.
2. Install required Python deps (API requirements + tooling).
3. Run Ruff and pytest. Capture output to /logs/whiskey_db.log with a compile_test tag.
4. Exit non-zero on failure, log success otherwise.
"""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
VENV_DIR = REPO_ROOT / ".venv"
LOG_FILE = REPO_ROOT / "logs" / "whiskey_db.log"
LOG_TAG = "compile_test"

if platform.system() == "Windows":
    PYTHON_BIN = VENV_DIR / "Scripts" / "python.exe"
else:
    PYTHON_BIN = VENV_DIR / "bin" / "python"


def setup_logging() -> logging.Logger:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(LOG_TAG)
    logger.setLevel(logging.INFO)

    formatter = logging.Formatter("%(asctime)s [%(levelname)s] [%(name)s] %(message)s")

    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    return logger


def run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None, logger: logging.Logger, description: str) -> None:
    logger.info("[%s] running: %s", description, " ".join(cmd))
    completed = subprocess.run(cmd, cwd=cwd or REPO_ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if completed.stdout:
        for line in completed.stdout.strip().splitlines():
            logger.info("[%s] %s", description, line)
    if completed.returncode != 0:
        logger.error("[%s] command failed with exit code %s", description, completed.returncode)
        raise SystemExit(completed.returncode)


def ensure_venv(logger: logging.Logger) -> None:
    if not PYTHON_BIN.exists():
        logger.info("[%s] creating virtualenv at %s", LOG_TAG, VENV_DIR)
        subprocess.run([sys.executable, "-m", "venv", str(VENV_DIR)], check=True)

    run([str(PYTHON_BIN), "-m", "pip", "install", "--upgrade", "pip"], logger=logger, description="pip-upgrade")
    run([str(PYTHON_BIN), "-m", "pip", "install", "-r", "api/requirements.txt"], logger=logger, description="install-api-reqs")
    run([str(PYTHON_BIN), "-m", "pip", "install", "ruff", "pytest"], logger=logger, description="install-toxics")


def run_checks(logger: logging.Logger) -> None:
    run([str(PYTHON_BIN), "-m", "ruff", "check", "."], logger=logger, description="ruff")

    temp_upload_dir = tempfile.mkdtemp(prefix="pytest-uploads-")
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT.resolve())
    env["UPLOAD_DIR"] = temp_upload_dir
    try:
        run([str(PYTHON_BIN), "-m", "pytest", "api/tests", "-q"], logger=logger, description="pytest")
    finally:
        shutil.rmtree(temp_upload_dir, ignore_errors=True)


def main() -> None:
    logger = setup_logging()
    try:
        ensure_venv(logger)
        run_checks(logger)
    except SystemExit:
        logger.error("[%s] checks failed", LOG_TAG)
        raise
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("[%s] unexpected error: %s", LOG_TAG, exc)
        raise SystemExit(1) from exc
    else:
        logger.info("[%s] All tests passed successfully", LOG_TAG)


if __name__ == "__main__":
    main()
