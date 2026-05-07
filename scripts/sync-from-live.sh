#!/usr/bin/env bash
set -euo pipefail

cat <<'MSG'
This project is intentionally maintained through explicit review steps.

Recommended maintenance loop:
1. Define the behavior and pass criteria.
2. Implement the smallest generic change in src/agent_working_group/.
3. Update README.md and docs/protocol.md.
4. Add tests.
5. Run: PYTHONPATH=src python3 -m unittest discover -s tests -v
6. Ask another agent to review the public docs/API when useful.

Avoid copying local agent names or private paths into this repository.
MSG
