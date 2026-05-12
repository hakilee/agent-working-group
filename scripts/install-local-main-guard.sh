#!/usr/bin/env bash
set -euo pipefail

# Category: git-safety
# Role: Install tracked git hooks that block accidental direct main pushes.

HOOKS_DIR=${HOOKS_DIR:-.githooks}

if [[ ! -x "${HOOKS_DIR}/pre-push" ]]; then
  chmod +x "${HOOKS_DIR}/pre-push"
fi

git config core.hooksPath "$HOOKS_DIR"
printf 'installed local git hooks: core.hooksPath=%s\n' "$HOOKS_DIR"
printf 'direct pushes to main are now blocked on this checkout\n'
