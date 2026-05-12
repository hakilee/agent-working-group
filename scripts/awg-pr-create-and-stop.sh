#!/usr/bin/env bash
set -euo pipefail

# Category: pr-workflow
# Role: Create a PR and persist AWG state, then stop implementation-mode work.

GH_CLI=${GH_CLI:-gh}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STATE_SCRIPT=${STATE_SCRIPT:-"${SCRIPT_DIR}/awg-work-state.sh"}
WORK_ID=${WORK_ID:-}
REPO=${REPO:-}
TITLE=${TITLE:-}
BODY_FILE=${BODY_FILE:-}
BASE=${BASE:-main}
DRAFT=${DRAFT:-0}

usage() {
  cat <<'USAGE'
Usage: awg-pr-create-and-stop.sh --work-id ID --repo OWNER/REPO --title TEXT --body-file PATH [options]

Options:
  --base BRANCH    Base branch. Default: main.
  --draft          Create draft PR.

This helper encodes the AWG implementation-mode boundary: push branch, create
PR, persist the PR URL, and stop. It does not merge, approve, or review. A later
GitHub webhook/mention should start a separate AWG review-mode workflow.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --work-id) WORK_ID=${2:?}; shift 2 ;;
    --repo) REPO=${2:?}; shift 2 ;;
    --title) TITLE=${2:?}; shift 2 ;;
    --body-file) BODY_FILE=${2:?}; shift 2 ;;
    --base) BASE=${2:?}; shift 2 ;;
    --draft) DRAFT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$WORK_ID" || -z "$REPO" || -z "$TITLE" || -z "$BODY_FILE" ]]; then
  usage >&2
  exit 2
fi
if [[ ! -f "$BODY_FILE" ]]; then
  echo "body file not found: $BODY_FILE" >&2
  exit 66
fi
if [[ $(git branch --show-current) == "$BASE" ]]; then
  echo "refusing to create implementation PR from base branch '$BASE'" >&2
  exit 65
fi

branch=$(git branch --show-current)
if [[ -z "$branch" ]]; then
  echo "not on a branch" >&2
  exit 65
fi

if ! "$GH_CLI" auth status >/dev/null 2>&1; then
  echo "gh CLI is not authenticated" >&2
  exit 69
fi

git push -u origin "$branch"

existing=$(
  "$GH_CLI" pr list --repo "$REPO" --head "$branch" --json url --jq '.[0].url // ""'
)
if [[ -n "$existing" ]]; then
  pr_url=$existing
else
  args=(pr create --repo "$REPO" --base "$BASE" --head "$branch" --title "$TITLE" --body-file "$BODY_FILE")
  if [[ "$DRAFT" == 1 ]]; then
    args+=(--draft)
  fi
  pr_url=$("$GH_CLI" "${args[@]}")
fi

if [[ -x "$STATE_SCRIPT" ]]; then
  AWG_ROOT="$AWG_ROOT" "$STATE_SCRIPT" finish --id "$WORK_ID" --status pr-created --pr "$pr_url" --detail "implementation mode stopped at PR creation" >/dev/null || true
fi

printf '%s\n' "$pr_url"
printf 'AWG implementation-mode complete: PR created. Stop here until GitHub webhook starts review mode.\n' >&2
