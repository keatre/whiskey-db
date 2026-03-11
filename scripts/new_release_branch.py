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
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

GIT = "git"
PRIVATE_LOCAL_FILES = ("docker-compose.yml",)


@dataclass(frozen=True)
class FileSnapshot:
    relative_path: str
    backup_path: str


def run(cmd: list[str], *, check: bool = True, capture_output: bool = False, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, capture_output=capture_output, text=text)


def start_ssh_agent(lifetime_seconds: int = 7200) -> None:
    try:
        proc = run(["ssh-agent", "-s", "-t", str(lifetime_seconds)], capture_output=True)
    except FileNotFoundError:
        sys.exit("ssh-agent not found; install OpenSSH client tools.")
    output = proc.stdout.strip()
    env_updates: dict[str, str] = {}
    for line in output.splitlines():
        if ";" in line:
            line = line.split(";", 1)[0]
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in {"SSH_AUTH_SOCK", "SSH_AGENT_PID"}:
            env_updates[key] = value
    if not env_updates.get("SSH_AUTH_SOCK") or not env_updates.get("SSH_AGENT_PID"):
        sys.exit(f"Unable to parse ssh-agent output:\n{output}")
    os.environ.update(env_updates)
    print(f"[ssh-agent] started (keys expire in {lifetime_seconds // 3600}h).")
    add_proc = run(["ssh-add"], check=False)
    if add_proc.returncode != 0:
        sys.exit("ssh-add failed; ensure your SSH key is available.")


def ensure_clean_worktree() -> None:
    res = run([GIT, "status", "--porcelain"], capture_output=True)
    if res.stdout.strip():
        sys.exit("Working tree is dirty. Commit, stash, or discard changes first.")


def get_repo_root() -> Path:
    res = run([GIT, "rev-parse", "--show-toplevel"], capture_output=True)
    return Path(res.stdout.strip())


def is_tracked(path: str) -> bool:
    return run([GIT, "ls-files", "--error-unmatch", "--", path], check=False).returncode == 0


def snapshot_private_files(repo_root: Path, paths: tuple[str, ...]) -> list[FileSnapshot]:
    snapshots: list[FileSnapshot] = []
    for rel_path in paths:
        target = repo_root / rel_path
        if not target.exists() or not target.is_file():
            continue
        fd, tmp_path = tempfile.mkstemp(prefix="whiskey-preserve-", suffix=f"-{target.name}")
        os.close(fd)
        shutil.copy2(target, tmp_path)
        snapshots.append(FileSnapshot(relative_path=rel_path, backup_path=tmp_path))
        print(f"🛟 Snapshotted private local file: {rel_path}")
    return snapshots


def restore_private_files(repo_root: Path, snapshots: list[FileSnapshot]) -> None:
    for snapshot in snapshots:
        target = repo_root / snapshot.relative_path
        if target.exists():
            print(f"ℹ️ Preserved file already present: {snapshot.relative_path}")
        elif is_tracked(snapshot.relative_path):
            print(f"⚠️ Skipping restore for tracked path: {snapshot.relative_path}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(snapshot.backup_path, target)
            print(f"🔁 Restored private local file: {snapshot.relative_path}")
        try:
            os.remove(snapshot.backup_path)
        except FileNotFoundError:
            pass


def checkout_main() -> None:
    run([GIT, "checkout", "main"])


def fast_forward_main() -> None:
    try:
        run([GIT, "fetch", "origin", "--prune"])
        run([GIT, "pull", "--ff-only", "origin", "main"])
    except subprocess.CalledProcessError as exc:
        sys.exit(f"Failed to update main: {exc}")


def branch_exists_remotely(branch: str) -> bool:
    ref = f"refs/remotes/origin/{branch}"
    return run([GIT, "show-ref", "--verify", "--quiet", ref], check=False).returncode == 0


def remove_stale_dev_branches(*, keep: set[str]) -> None:
    res = run(
        [GIT, "for-each-ref", "refs/heads", "--format=%(refname:short)"],
        capture_output=True,
    )
    branches = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    stale_branches: list[str] = []
    for branch in branches:
        if branch in keep:
            continue
        if not branch.startswith("dev/"):
            continue
        if branch_exists_remotely(branch):
            continue
        stale_branches.append(branch)

    for branch in stale_branches:
        run([GIT, "branch", "-D", branch])
        print(f"🧹 Removed stale local branch {branch}")


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
    start_ssh_agent()
    ensure_clean_worktree()
    repo_root = get_repo_root()
    snapshots = snapshot_private_files(repo_root, PRIVATE_LOCAL_FILES)
    try:
        checkout_main()
        fast_forward_main()
        remove_stale_dev_branches(keep={"main"})
        version = prompt_version()
        branch = f"dev/v{version}"
        tag = f"v{version}"
        ensure_ref_absent(branch, ref_type="Branch")
        ensure_ref_absent(tag, ref_type="Tag")
        create_branch(branch)
        create_tag(tag)
        run([GIT, "checkout", branch])
        print(f"✅ Created branch {branch} and tag {tag}. You're now on {branch}.")
        run([GIT, "fetch", "origin", "--prune"])
        branches = run([GIT, "branch", "-a"], capture_output=True)
        print(branches.stdout.rstrip())
    finally:
        restore_private_files(repo_root, snapshots)

if __name__ == "__main__":
    main()
