#!/usr/bin/env python3
"""Automate branch + tag creation for new versions.

Workflow:
1. Verify clean working tree.
2. Switch to main, fetch, and fast-forward from origin.
3. Prompt for a semantic version (e.g., 1.2.7).
4. Create `dev/v<version>` from main and push to origin.
5. Tag the same commit as `v<version>` and push the tag.
6. Checkout the new branch so you can continue working there.

No changes are made if any step fails.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

GIT = "git"


def run(cmd: list[str], *, check: bool = True, capture_output: bool = False, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, capture_output=capture_output, text=text)


def ensure_clean_worktree() -> None:
    res = run([GIT, "status", "--porcelain"], capture_output=True)
    if res.stdout.strip():
        sys.exit("Working tree is dirty. Commit, stash, or discard changes first.")


def checkout_main() -> None:
    run([GIT, "checkout", "main"])


def fast_forward_main() -> None:
    try:
        run([GIT, "fetch", "origin"])
        run([GIT, "pull", "--ff-only", "origin", "main"])
    except subprocess.CalledProcessError as exc:
        sys.exit(f"Failed to update main: {exc}")


def prompt_version() -> str:
    parser = argparse.ArgumentParser(description="Create dev/vX.Y.Z branch and vX.Y.Z tag")
    parser.add_argument("version", nargs="?", help="Semantic version like 1.2.7")
    args = parser.parse_args()
    version = args.version
    if not version:
        try:
            version = input("Enter release version (e.g. 1.2.7): ").strip()
        except EOFError:
            version = ""
    if not version:
        sys.exit("Version is required.")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        sys.exit("Version must look like 1.2.7")
    return version


def ensure_ref_absent(ref: str, *, ref_type: str) -> None:
    # local
    if run([GIT, "rev-parse", "--verify", "--quiet", ref], check=False).returncode == 0:
        sys.exit(f"{ref_type} {ref} already exists locally.")
    # remote
    if run([GIT, "ls-remote", "--quiet", "--exit-code", "origin", ref], check=False).returncode == 0:
        sys.exit(f"{ref_type} {ref} already exists on origin.")


def create_branch(branch: str) -> None:
    run([GIT, "checkout", "-b", branch])
    run([GIT, "push", "-u", "origin", branch])


def create_tag(tag: str) -> None:
    run([GIT, "checkout", "main"])
    run([GIT, "tag", tag])
    run([GIT, "push", "origin", tag])


def main() -> None:
    ensure_clean_worktree()
    checkout_main()
    fast_forward_main()
    version = prompt_version()
    branch = f"dev/v{version}"
    tag = f"v{version}"
    ensure_ref_absent(branch, ref_type="Branch")
    ensure_ref_absent(tag, ref_type="Tag")
    create_branch(branch)
    create_tag(tag)
    run([GIT, "checkout", branch])
    print(f"✅ Created branch {branch} and tag {tag}. You're now on {branch}.")


+if __name__ == "__main__":
+    main()
