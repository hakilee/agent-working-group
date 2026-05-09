#!/usr/bin/env bash
set -euo pipefail

GH_CLI=${GH_CLI:-gh}
REPO=${REPO:-}
PR=${PR:-}
SKIP_REASON=${SKIP_REASON:-}
SKIP_FILE=${SKIP_FILE:-}

usage() {
  cat <<'USAGE'
Usage: scripts/awg-pr-publish-gate-check.sh --repo OWNER/REPO --pr NUMBER [options]

Options:
  --skip-reason TEXT   Explicit reason for skipping the PR-specific review gate
  --skip-file PATH     File containing an explicit skip reason

This read-only helper checks that a pull request has either a public evidence
comment from the PR review gate or an explicit skip reason. It never comments,
reviews, approves, merges, checks out, builds, tests, or mutates queue state.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo) REPO=${2:?}; shift 2 ;;
    --pr) PR=${2:?}; shift 2 ;;
    --skip-reason) SKIP_REASON=${2:?}; shift 2 ;;
    --skip-file) SKIP_FILE=${2:?}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [ -z "$REPO" ] || [ -z "$PR" ]; then
  echo "--repo and --pr are required" >&2
  usage >&2
  exit 64
fi

if [ -n "$SKIP_FILE" ]; then
  if [ ! -f "$SKIP_FILE" ]; then
    echo "skip file not found: $SKIP_FILE" >&2
    exit 66
  fi
  SKIP_REASON=$(cat "$SKIP_FILE")
fi

if [ -n "${SKIP_REASON//[[:space:]]/}" ]; then
  printf 'pr_review_gate=skipped\n'
  printf 'reason=%s\n' "$SKIP_REASON"
  exit 0
fi

if ! command -v "$GH_CLI" >/dev/null 2>&1; then
  echo "gh CLI not found; cannot verify PR review gate evidence" >&2
  exit 69
fi

if ! "$GH_CLI" auth status >/dev/null 2>&1; then
  echo "gh CLI is not authenticated; cannot verify PR review gate evidence" >&2
  exit 69
fi

COMMENTS=$(
  "$GH_CLI" pr view "$PR" --repo "$REPO" --json comments \
    --jq '.comments[].body' 2>/dev/null
) || {
  echo "failed to read pull request comments" >&2
  exit 69
}

if printf '%s\n' "$COMMENTS" | grep -Eq '(^|[^A-Za-z])(Review Verdict|Verification Evidence|Evidence Checked)([^A-Za-z]|$)'; then
  printf 'pr_review_gate=fulfilled\n'
  printf 'evidence=public-pr-comment\n'
  exit 0
fi

echo "missing PR review gate evidence: add a public-safe evidence comment or pass an explicit skip reason" >&2
exit 1
