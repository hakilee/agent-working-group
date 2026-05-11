#!/usr/bin/env bash
set -euo pipefail

# Category: template
# Role: Print Markdown scaffolds for independent analysis sections (stdout only).

usage() {
  cat <<'USAGE'
Usage: awg-independent-analysis-template.sh [task-spec|review-result|close-report|all]

Print advisory Markdown scaffolds for independent analysis sections.
The helper writes to stdout only and does not decide whether independent
analysis is required for a task.
USAGE
}

mode="${1:-all}"

if [ "$mode" = "--help" ] || [ "$mode" = "-h" ]; then
  usage
  exit 0
fi

if [ "$#" -gt 1 ]; then
  echo "error: expected zero or one mode" >&2
  usage >&2
  exit 2
fi

print_task_spec() {
  cat <<'MARKDOWN'
## Independent Analysis Requirement

Use only for large, high-risk, or strategically important analysis/design work. Leave as `not required` for trivial one-step work or routine tasks.

- Required: yes/no/not required
- Lead analysis artifact or summary:
- Worker/reviewer analysis artifact or summary:
- Comparison required before closure: yes/no
MARKDOWN
}

print_review_result() {
  cat <<'MARKDOWN'
## Independent Analysis Comparison

Use when the task required independent lead analysis. Otherwise write `not applicable`.

- Lead analysis summary:
- Worker/reviewer analysis summary:
- Agreement:
- Disagreements:
- Resolution or required follow-up:
MARKDOWN
}

print_close_report() {
  cat <<'MARKDOWN'
## Independent Analysis

Use when the task required independent lead analysis. Otherwise write `not applicable`.

- Lead analysis completed: yes/no/not applicable
- Worker or reviewer analysis completed: yes/no/not applicable
- Comparison result:
- Disagreements found:
- Resolution before closure:
MARKDOWN
}

case "$mode" in
  task-spec)
    print_task_spec
    ;;
  review-result)
    print_review_result
    ;;
  close-report)
    print_close_report
    ;;
  all)
    print_task_spec
    printf '\n'
    print_review_result
    printf '\n'
    print_close_report
    ;;
  *)
    echo "error: unknown mode: $mode" >&2
    usage >&2
    exit 2
    ;;
esac
