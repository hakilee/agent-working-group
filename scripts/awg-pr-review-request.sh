#!/usr/bin/env bash
set -euo pipefail

# Category: pr-review
# Role: Send a PR review request to a reviewer queue with a checklist body.

AWG_CLI=${AWG_CLI:-awg}
GH_CLI=${GH_CLI:-gh}
AWG_ROOT=${AWG_ROOT:-.agent-working-group}
LEAD=${LEAD:-lead}
REVIEWER=${REVIEWER:-reviewer}
CHECKLIST=${CHECKLIST:-docs/templates/pr-review-request.md}
OUTPUT=${OUTPUT:-docs/review-result.md}
REPO=${REPO:-}
PR=${PR:-}
DRY_RUN=${DRY_RUN:-0}

usage() {
  cat <<'USAGE'
Usage: scripts/awg-pr-review-request.sh --repo OWNER/REPO --pr NUMBER [options]

Options:
  --lead NAME        Sender queue name (default: lead)
  --reviewer NAME    Reviewer queue name (default: reviewer)
  --checklist PATH   Checklist path to include in the request
  --output PATH      Requested review output path
  --dry-run          Print the AWG instruction body without sending

This helper is opt-in. It reads pull request metadata and sends one AWG
instruction. It never merges, approves, checks out, builds, tests, or executes
pull request code.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo) REPO=${2:?}; shift 2 ;;
    --pr) PR=${2:?}; shift 2 ;;
    --lead) LEAD=${2:?}; shift 2 ;;
    --reviewer) REVIEWER=${2:?}; shift 2 ;;
    --checklist) CHECKLIST=${2:?}; shift 2 ;;
    --output) OUTPUT=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [ -z "$REPO" ] || [ -z "$PR" ]; then
  echo "--repo and --pr are required" >&2
  usage >&2
  exit 64
fi

if ! command -v "$GH_CLI" >/dev/null 2>&1; then
  echo "gh CLI not found; send a blocker and keep the review request in a file" >&2
  exit 69
fi

if ! "$GH_CLI" auth status >/dev/null 2>&1; then
  echo "gh CLI is not authenticated; send a blocker and keep the review request in a file" >&2
  exit 69
fi

PR_JSON=$("$GH_CLI" pr view "$PR" --repo "$REPO" --json number,title,url,headRefName,baseRefName,state,mergeStateStatus 2>/dev/null) || {
  echo "failed to read pull request metadata; send a blocker with the gh error context" >&2
  exit 69
}

FILES=$("$GH_CLI" pr diff "$PR" --repo "$REPO" --name-only 2>/dev/null || true)
CHECKS=$("$GH_CLI" pr checks "$PR" --repo "$REPO" 2>/dev/null || true)

TMP_DIR="$AWG_ROOT/tmp/pr-review-request"
mkdir -p "$TMP_DIR"
BODY_FILE=$(mktemp "$TMP_DIR/body.XXXXXX")

cat > "$BODY_FILE" <<EOF_BODY
Task: Review pull request before merge.

Queue-first note: this AWG instruction is the source of truth for the review. Do not rely on chat-only context for substantive findings.

Repository: $REPO
PR: $PR
Metadata:
$PR_JSON

Changed files:
${FILES:-No changed-file list available.}

Check summary:
${CHECKS:-No check summary available.}

Checklist:
$CHECKLIST

Requested output:
$OUTPUT

Review requirements:
- Write the full QA result to the requested output path or AWG status.
- Draft a concise public-safe PR comment using docs/templates/pr-review-result-comment.md.
- Verdict must be PASS, CONDITIONAL PASS, or FAIL.
- Do not include private names, local paths, private chat references, credentials, or hidden workspace details in the PR comment.
- Do not merge, approve, checkout, build, test, or execute PR code from this helper flow.
- Send blocker if PR metadata or required evidence cannot be inspected.
- Acknowledge this instruction only after the review output is complete.
EOF_BODY

if [ "$DRY_RUN" = "1" ]; then
  cat "$BODY_FILE"
  exit 0
fi

"$AWG_CLI" --root "$AWG_ROOT" send --from "$LEAD" \
  --to "$REVIEWER" \
  --kind instruction \
  --body-file "$BODY_FILE" \
  --repo "$REPO" \
  --work-id "pr-$PR-review" \
  --correlation-id "pr-review-$REPO-$PR"
