#! /usr/bin/env bash
set -euo pipefail

python3 - "$@" <<'PY'
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace


def run(cmd, cwd=None, env=None):
    try:
        return subprocess.run(cmd, cwd=cwd, env=env, text=True, capture_output=True, check=False)
    except FileNotFoundError as exc:
        return SimpleNamespace(returncode=127, stdout="", stderr=str(exc))


def git_value(repo, args):
    result = run(["git", *args], cwd=repo)
    if result.returncode != 0:
        return None, result.stderr.strip() or result.stdout.strip()
    return result.stdout.strip(), None


def git_status(repo):
    branch, branch_err = git_value(repo, ["rev-parse", "--abbrev-ref", "HEAD"])
    head, head_err = git_value(repo, ["rev-parse", "--short", "HEAD"])
    upstream, _ = git_value(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
    porcelain, status_err = git_value(repo, ["status", "--porcelain"])
    return {
        "repo": str(repo),
        "branch": branch,
        "head": head,
        "upstream": upstream,
        "clean": porcelain == "" if porcelain is not None else None,
        "dirtyCount": len([line for line in (porcelain or "").splitlines() if line.strip()]),
        "warnings": [msg for msg in [branch_err, head_err, status_err] if msg],
    }


def github_status(github_repo):
    if not github_repo:
        return {"available": False, "reason": "not-requested"}
    gh = shutil.which("gh")
    if not gh:
        return {"available": False, "reason": "gh-not-found", "openPullRequests": None, "openIssues": None}
    pr = run([gh, "pr", "list", "--repo", github_repo, "--state", "open", "--json", "number", "--jq", "length"])
    issue = run([gh, "issue", "list", "--repo", github_repo, "--state", "open", "--json", "number", "--jq", "length"])
    return {
        "available": pr.returncode == 0 and issue.returncode == 0,
        "repo": github_repo,
        "openPullRequests": int(pr.stdout.strip()) if pr.returncode == 0 and pr.stdout.strip().isdigit() else None,
        "openIssues": int(issue.stdout.strip()) if issue.returncode == 0 and issue.stdout.strip().isdigit() else None,
        "warnings": [msg for msg in [pr.stderr.strip(), issue.stderr.strip()] if msg],
    }


def queue_status(awg_cli, queue_root, roles):
    env = os.environ.copy()
    if queue_root:
        env["AWG_ROOT"] = str(queue_root)
    statuses = []
    for role in roles:
        result = run([awg_cli, "status", "--as", role], env=env)
        if result.returncode != 0:
            statuses.append({"role": role, "available": False, "warning": result.stderr.strip() or result.stdout.strip()})
            continue
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            statuses.append({"role": role, "available": False, "warning": f"invalid status JSON: {exc}"})
            continue
        statuses.append({
            "role": role,
            "available": True,
            "pending": payload.get("pending"),
            "processing": payload.get("processing"),
            "processed": payload.get("processed"),
            "dead": payload.get("dead"),
            "next": payload.get("next"),
        })
    return statuses


def artifact_status(root):
    if not root:
        return {"available": False, "reason": "not-requested"}
    active = root / "active"
    if not active.exists():
        return {"available": True, "root": str(root), "activeCount": 0, "warning": "active-directory-missing"}
    files = sorted(path for path in active.glob("*.md") if path.is_file())
    return {"available": True, "root": str(root), "activeCount": len(files), "activeFiles": [path.name for path in files[:20]]}


def text_report(report):
    lines = ["AWG operator baseline doctor"]
    git = report["git"]
    lines.append(f"git: branch={git.get('branch')} head={git.get('head')} clean={git.get('clean')} dirtyCount={git.get('dirtyCount')}")
    github = report["github"]
    if github.get("available"):
        lines.append(f"github: repo={github.get('repo')} openPRs={github.get('openPullRequests')} openIssues={github.get('openIssues')}")
    else:
        lines.append(f"github: unavailable reason={github.get('reason', 'command-failed')}")
    for status in report["queues"]:
        if status.get("available"):
            lines.append(
                "queue: role={role} pending={pending} processing={processing} processed={processed} dead={dead}".format(**status)
            )
        else:
            lines.append(f"queue: role={status.get('role')} unavailable warning={status.get('warning')}")
    artifacts = report["artifacts"]
    if artifacts.get("available"):
        lines.append(f"artifacts: root={artifacts.get('root')} activeCount={artifacts.get('activeCount')}")
    else:
        lines.append(f"artifacts: unavailable reason={artifacts.get('reason', 'not-requested')}")
    warnings = report.get("warnings", []) + git.get("warnings", []) + github.get("warnings", [])
    for warning in warnings:
        lines.append(f"warning: {warning}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Read-only AWG operator baseline doctor")
    parser.add_argument("--repo", default=".", help="Git repository to inspect")
    parser.add_argument("--github-repo", help="GitHub owner/repo for read-only open PR/issue counts")
    parser.add_argument("--queue-root", help="AWG queue root for AWG_CLI status checks")
    parser.add_argument("--role", action="append", default=[], help="Role queue to inspect; repeatable")
    parser.add_argument("--artifact-root", help="Artifact root containing active/completed/archive")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    awg_cli = os.environ.get("AWG_CLI", "awg")
    report = {
        "git": git_status(repo),
        "github": github_status(args.github_repo),
        "queues": queue_status(awg_cli, Path(args.queue_root).resolve() if args.queue_root else None, args.role),
        "artifacts": artifact_status(Path(args.artifact_root).resolve() if args.artifact_root else None),
        "warnings": [],
    }
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(text_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
PY
