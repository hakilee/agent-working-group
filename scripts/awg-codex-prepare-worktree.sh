#!/usr/bin/env bash
set -euo pipefail

REPO=${AWG_CODEX_REPO:-}
BRANCH=${BRANCH:-}
CREATE_BRANCH=0
OUTPUT=json

usage() {
  cat <<USAGE
Usage: awg-codex-prepare-worktree.sh --repo DIR [--branch NAME --create-branch]

Checks whether a target is ready for Codex worker dispatch. By default this is
read-only: it reports Git state and does not create branches or worktrees.

Options:
  --repo DIR          Target repository or workspace path.
  --branch NAME      Branch name to verify or create with --create-branch.
  --create-branch    Explicitly create and switch to --branch when the repo is clean.
  -h, --help         Show this help.
USAGE
}

while (($#)); do
  case "$1" in
    --repo)
      REPO=${2:?--repo requires a value}
      shift 2
      ;;
    --branch)
      BRANCH=${2:?--branch requires a value}
      shift 2
      ;;
    --create-branch)
      CREATE_BRANCH=1
      shift
      ;;
    --json)
      OUTPUT=json
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$REPO" ]]; then
  echo "--repo or AWG_CODEX_REPO is required" >&2
  exit 2
fi

python3 - "$REPO" "$BRANCH" "$CREATE_BRANCH" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

repo_arg, requested_branch, create_branch = sys.argv[1:]
create_branch = create_branch == "1"
repo = Path(repo_arg).expanduser()


def run_git(args, check=False):
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        capture_output=True,
        check=check,
        timeout=10,
    )


def emit(payload, code=0):
    print(json.dumps(payload, indent=2, sort_keys=True))
    raise SystemExit(code)

payload = {
    "repo": str(repo),
    "requestedBranch": requested_branch or None,
    "createBranch": create_branch,
    "mutated": False,
}

if not repo.exists():
    payload.update({"status": "missing", "ready": False, "reason": "repo path does not exist"})
    emit(payload, 1)

inside = run_git(["rev-parse", "--is-inside-work-tree"])
if inside.returncode != 0 or inside.stdout.strip() != "true":
    payload.update({"status": "non_git", "ready": True, "reason": "target is not a Git worktree"})
    emit(payload)

top = run_git(["rev-parse", "--show-toplevel"], check=True).stdout.strip()
head = run_git(["rev-parse", "--short", "HEAD"], check=True).stdout.strip()
branch = run_git(["branch", "--show-current"], check=True).stdout.strip() or "HEAD"
dirty = run_git(["status", "--porcelain"], check=True).stdout
payload.update({
    "status": "git",
    "topLevel": top,
    "branch": branch,
    "head": head,
    "dirty": bool(dirty.strip()),
})

upstream = run_git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
if upstream.returncode == 0:
    upstream_name = upstream.stdout.strip()
    payload["upstream"] = upstream_name
    relation = run_git(["rev-list", "--left-right", "--count", f"{upstream_name}...HEAD"])
    if relation.returncode == 0:
        behind, ahead = relation.stdout.strip().split()
        payload["upstreamBehind"] = int(behind)
        payload["upstreamAhead"] = int(ahead)
else:
    payload["upstream"] = None

if payload["dirty"]:
    payload.update({"ready": False, "reason": "Git worktree has uncommitted changes"})
    emit(payload, 1)

if requested_branch:
    exists = run_git(["show-ref", "--verify", "--quiet", f"refs/heads/{requested_branch}"])
    payload["requestedBranchExists"] = exists.returncode == 0
    if create_branch:
        if payload["requestedBranchExists"]:
            payload.update({"ready": False, "reason": "requested branch already exists"})
            emit(payload, 1)
        subprocess.run(["git", "-C", str(repo), "switch", "-c", requested_branch], check=True, timeout=10)
        payload.update({
            "mutated": True,
            "branch": requested_branch,
            "requestedBranchExists": True,
            "ready": True,
            "reason": "created branch from clean worktree",
        })
        emit(payload)
    if branch != requested_branch:
        payload.update({"ready": False, "reason": "current branch does not match requested branch"})
        emit(payload, 1)

payload.update({"ready": True, "reason": "clean Git worktree is ready for Codex worker dispatch"})
emit(payload)
PY
