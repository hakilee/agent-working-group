#!/usr/bin/env bash
set -euo pipefail

# Category: github-safety
# Role: Enable baseline main-branch protection for AWG PR-only implementation flow.

GH_CLI=${GH_CLI:-gh}
REPO=${REPO:-}
BRANCH=${BRANCH:-main}
REQUIRED_APPROVALS=${REQUIRED_APPROVALS:-1}
DRY_RUN=${DRY_RUN:-0}

usage() {
  cat <<'USAGE'
Usage: github-protect-main.sh --repo OWNER/REPO [options]

Options:
  --branch NAME          Branch to protect. Default: main.
  --required-approvals N Required approving reviews. Default: 1.
  --dry-run              Print payload without applying.

Applies branch protection that blocks direct main pushes by requiring PR review,
blocks force pushes/deletions, and requires conversation resolution. This is the
GitHub-side guard for the AWG rule: implementation workflow ends at PR creation;
review/merge happens in a later webhook-triggered review workflow.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO=${2:?}; shift 2 ;;
    --branch) BRANCH=${2:?}; shift 2 ;;
    --required-approvals) REQUIRED_APPROVALS=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$REPO" ]]; then
  usage >&2
  exit 2
fi

payload=$(python3 - "$REQUIRED_APPROVALS" <<'PY'
import json
import sys
approvals = int(sys.argv[1])
print(json.dumps({
    "required_status_checks": None,
    "enforce_admins": True,
    "required_pull_request_reviews": {
        "dismiss_stale_reviews": True,
        "require_code_owner_reviews": False,
        "required_approving_review_count": approvals,
        "require_last_push_approval": True,
    },
    "restrictions": None,
    "allow_force_pushes": False,
    "allow_deletions": False,
    "block_creations": False,
    "required_conversation_resolution": True,
    "lock_branch": False,
    "allow_fork_syncing": True,
}, indent=2))
PY
)

if [[ "$DRY_RUN" == 1 ]]; then
  printf '%s\n' "$payload"
  exit 0
fi

if ! "$GH_CLI" auth status >/dev/null 2>&1; then
  echo "gh CLI is not authenticated" >&2
  exit 69
fi

printf '%s\n' "$payload" | "$GH_CLI" api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/${REPO}/branches/${BRANCH}/protection" \
  --input - >/dev/null

printf 'protected %s/%s: required PR review=%s, force-push/deletion disabled\n' "$REPO" "$BRANCH" "$REQUIRED_APPROVALS"
