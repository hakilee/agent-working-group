# Queue Reconciliation Action Audit

Created:
Operator:
Target role:
Message id:
Command category: `ack` or `retry`

## Evidence

- Queue-state report reference:
- Completed or archived artifact, close report, or merged pull request:
- Per-item operator decision:

## Pre-Action Checks

- Evidence exists before action:
- Target role and message id match the queue-state report:
- Action is item-by-item, not bulk:
- Action uses AWG CLI queue-aware command:
- No direct queue JSON mutation:
- No deletion of queue state:
- No `recv` used for reconciliation:
- No automatic superseded classification by tooling:

## Result

- Command category used:
- Outcome:
- Verification after action:

## Remaining Risk

- Known uncertainty:
- Follow-up required:
