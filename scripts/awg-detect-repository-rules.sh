#!/usr/bin/env bash
set -euo pipefail

# Category: repository-utility
# Role: Advisory detection of commit/PR title/squash merge rules in a repository.

usage() {
  cat <<'USAGE'
Usage: awg-detect-repository-rules.sh [repository-dir]

Advisory-only helper that looks for documented commit message, pull request
title, and squash merge title rules in a local repository working tree.

The helper reads candidate files, prints repository-relative paths only, and
exits 0 whether rules are found or the Conventional Commits fallback applies.
USAGE
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if [ "$#" -gt 1 ]; then
  echo "error: expected zero or one repository directory" >&2
  usage >&2
  exit 2
fi

REPO_ARG="${1:-.}"
if [ ! -d "$REPO_ARG" ]; then
  echo "error: repository directory does not exist: $REPO_ARG" >&2
  exit 2
fi

REPO_ROOT=$(cd "$REPO_ARG" && pwd -P)
FOUND=0

has_rule_text() {
  file=$1
  grep -Eiq 'commit message|commit title|pull request title|pr title|squash merge|squash title|conventional commits|commitlint|semantic-release|release title|changelog' "$file"
}

report_source() {
  rel=$1
  reason=$2
  printf -- '- %s (%s)\n' "$rel" "$reason"
  FOUND=1
}

check_file_for_text() {
  rel=$1
  reason=$2
  file="$REPO_ROOT/$rel"
  if [ -f "$file" ] && has_rule_text "$file"; then
    report_source "$rel" "$reason"
  fi
}

check_config_file() {
  rel=$1
  reason=$2
  file="$REPO_ROOT/$rel"
  if [ -f "$file" ]; then
    report_source "$rel" "$reason"
  fi
}

check_package_json() {
  rel=package.json
  file="$REPO_ROOT/$rel"
  if [ -f "$file" ] && grep -Eiq 'commitlint|semantic-release|release-it|changeset|conventional-changelog|commitizen' "$file"; then
    report_source "$rel" "package or tool configuration with commit/title hints"
  fi
}

# Discovery order follows docs/repository-rules.md.
printf 'Repository rule detection report\n'
printf 'Advisory only: inspect these sources before choosing commit, pull request, or squash titles.\n\n'
printf 'Detected candidate rule sources:\n'

# 1. Contribution, maintainer, and workflow docs.
for rel in \
  CONTRIBUTING.md CONTRIBUTING.rst CONTRIBUTING.txt \
  MAINTAINING.md MAINTAINERS.md GOVERNANCE.md \
  docs/CONTRIBUTING.md docs/contributing.md docs/maintaining.md \
  docs/development.md docs/release.md docs/releases.md \
  docs/workflow.md docs/workflows.md docs/commit-messages.md \
  docs/pull-requests.md docs/repository-rules.md
 do
  check_file_for_text "$rel" "contribution, maintainer, or workflow documentation"
done

# 2. Pull request and issue templates.
for rel in \
  .github/PULL_REQUEST_TEMPLATE.md \
  .github/pull_request_template.md \
  .github/ISSUE_TEMPLATE.md \
  .github/issue_template.md \
  .gitlab/merge_request_templates/default.md
 do
  check_file_for_text "$rel" "pull request or issue template"
done
if [ -d "$REPO_ROOT/.github/PULL_REQUEST_TEMPLATE" ]; then
  for file in "$REPO_ROOT"/.github/PULL_REQUEST_TEMPLATE/*.md; do
    [ -f "$file" ] || continue
    rel=${file#"$REPO_ROOT/"}
    if has_rule_text "$file"; then
      report_source "$rel" "pull request template"
    fi
  done
fi
if [ -d "$REPO_ROOT/.github/ISSUE_TEMPLATE" ]; then
  for file in "$REPO_ROOT"/.github/ISSUE_TEMPLATE/*.md; do
    [ -f "$file" ] || continue
    rel=${file#"$REPO_ROOT/"}
    if has_rule_text "$file"; then
      report_source "$rel" "issue template"
    fi
  done
fi

# 3. Commit lint, release, or changelog configuration.
for rel in \
  .commitlintrc .commitlintrc.json .commitlintrc.yaml .commitlintrc.yml .commitlintrc.js \
  commitlint.config.js commitlint.config.cjs commitlint.config.mjs \
  .releaserc .releaserc.json .releaserc.yaml .releaserc.yml \
  release.config.js .versionrc CHANGELOG.md changelog.md
 do
  check_config_file "$rel" "commit lint, release, or changelog configuration"
done

# 4. Package, project, or tool configuration with commit/title hints.
check_package_json
for rel in \
  pyproject.toml package-lock.json pnpm-workspace.yaml \
  Cargo.toml go.mod .czrc .changeset/config.json
 do
  check_file_for_text "$rel" "package, project, or tool configuration with commit/title hints"
done

# 5. Branch protection, merge policy, or release policy docs.
for rel in \
  docs/branch-protection.md docs/merge-policy.md docs/release-policy.md \
  docs/releases.md docs/release.md .github/merge-policy.md .github/release.yml
 do
  check_file_for_text "$rel" "branch protection, merge, or release policy documentation"
done

if [ "$FOUND" -eq 0 ]; then
  printf -- '- no explicit repository rule found; use Conventional Commits fallback\n'
fi

exit 0
