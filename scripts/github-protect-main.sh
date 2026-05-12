#!/usr/bin/env bash
set -euo pipefail

# Category: github-safety
# Role: Enable baseline main-branch protection for AWG PR-only implementation flow.

GH_CLI=${GH_CLI:-gh}
REPO=${REPO:-}
BRANCH=${BRANCH:-main}
REQUIRED_APPROVALS=${REQUIRED_APPROVALS:-1}
DRY_RUN=${DRY_RUN:-0}
REPLACE_EXISTING=${REPLACE_EXISTING:-0}
EXISTING_FILE=${EXISTING_FILE:-}

usage() {
  cat <<'USAGE'
Usage: github-protect-main.sh --repo OWNER/REPO [options]

Options:
  --branch NAME          Branch to protect. Default: main.
  --required-approvals N Required approving reviews. Default: 1.
  --dry-run              Print payload without applying.
  --existing-file PATH   Build payload from an existing protection JSON file.
  --replace-existing     Allow baseline replacement when existing protection is
                         unavailable. Without this, live apply preserves fetched
                         status checks and restrictions.

Applies branch protection that blocks direct main pushes by requiring PR review,
blocks force pushes/deletions, and requires conversation resolution. By default
it preserves existing required status checks and push restrictions instead of
sending null fields that can clear protections.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO=${2:?}; shift 2 ;;
    --branch) BRANCH=${2:?}; shift 2 ;;
    --required-approvals) REQUIRED_APPROVALS=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --existing-file) EXISTING_FILE=${2:?}; shift 2 ;;
    --replace-existing) REPLACE_EXISTING=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$REPO" ]]; then
  usage >&2
  exit 2
fi

if ! [[ "$REQUIRED_APPROVALS" =~ ^[0-9]+$ ]] || [[ "$REQUIRED_APPROVALS" -gt 6 ]]; then
  echo "--required-approvals must be an integer between 0 and 6" >&2
  exit 2
fi

encoded_branch=$(python3 - "$BRANCH" <<'PY'
from urllib.parse import quote
import sys
print(quote(sys.argv[1], safe=""))
PY
)

existing_json=""
if [[ -n "$EXISTING_FILE" ]]; then
  existing_json=$(cat "$EXISTING_FILE")
elif [[ "$DRY_RUN" != 1 && "$REPLACE_EXISTING" != 1 ]]; then
  if ! "$GH_CLI" auth status >/dev/null 2>&1; then
    echo "gh CLI is not authenticated" >&2
    exit 69
  fi
  if ! existing_json=$("$GH_CLI" api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "/repos/${REPO}/branches/${encoded_branch}/protection" 2>/dev/null); then
    echo "existing branch protection not found or not readable; rerun with --replace-existing to create a baseline policy" >&2
    exit 69
  fi
fi

payload=$(EXISTING_JSON="$existing_json" python3 - "$REQUIRED_APPROVALS" "$REPLACE_EXISTING" <<'PY'
import json
import os
import sys

approvals = int(sys.argv[1])
replace_existing = sys.argv[2] == "1"
raw = os.environ.get("EXISTING_JSON", "").strip()
existing = json.loads(raw) if raw else {}


def current_or_default(key, default):
    value = existing.get(key)
    if value is None:
        return default
    return value

if replace_existing:
    required_status_checks = None
    restrictions = None
else:
    # Dry-runs without a fetched policy use explicit empty objects so operators
    # can see fields that would otherwise be preserved during a live apply.
    required_status_checks = current_or_default(
        "required_status_checks",
        {"strict": False, "contexts": [], "checks": []},
    )
    restrictions = current_or_default(
        "restrictions",
        {"users": [], "teams": [], "apps": []},
    )

print(json.dumps({
    "required_status_checks": required_status_checks,
    "enforce_admins": True,
    "required_pull_request_reviews": {
        "dismiss_stale_reviews": True,
        "require_code_owner_reviews": False,
        "required_approving_review_count": approvals,
        "require_last_push_approval": True,
    },
    "restrictions": restrictions,
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

printf '%s\n' "$payload" | "$GH_CLI" api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/${REPO}/branches/${encoded_branch}/protection" \
  --input - >/dev/null

printf 'protected %s/%s: required PR review=%s, force-push/deletion disabled\n' "$REPO" "$BRANCH" "$REQUIRED_APPROVALS"
