# Output And Publish Gate

AWG's general closure gate is not a pull request. It is the boundary where work becomes final, externally visible, irreversible, or handed off as an accepted artifact.

Use the lightest gate that gives enough evidence for the task. Office workflows, local-only cleanup, research summaries, and non-coding operations should not inherit code-specific pull request, Codex, tmux, branch, or clean-worktree ceremony unless their scope actually needs it.

## Default Rule

Before closing or publishing substantive work, record:

- what changed or was produced
- where the final output lives
- who or what reviewed it
- verification evidence appropriate to the work
- the publish, delivery, or closure decision
- remaining risks or explicit acceptance

For trivial one-step work, a short status may be enough. For non-trivial work, use the task spec, review result, and close report templates.

## Gate Types

Choose the gate that matches the output boundary:

- **Pull request gate:** for non-trivial GitHub or Git-hosted code/docs changes that will merge through a PR. Use the PR-specific review gate.
- **Local artifact gate:** for files, reports, exports, or local docs that stay outside a PR. Record artifact paths, changed files, checks, reviewer signoff, and retention location.
- **Office or admin output gate:** for summaries, spreadsheets, decisions, plans, or internal handoffs. Record the final artifact, source evidence, reviewer or owner signoff, and delivery status.
- **External send gate:** for email, public posts, customer messages, or other outbound actions. Record approval, final content reference, destination, send status, and any rollback or correction plan.
- **Queue mutation gate:** for ack/retry/reconciliation work. Record live reread evidence, expected metadata, command used, result, and audit artifact.
- **Worker execution gate:** for tmux, Codex, or other automated workers. Record run summary/log evidence, operator review, and whether queue reconciliation was performed.

A task can have more than one gate. For example, a code change may use a local implementation gate before opening a PR, then a PR gate before merge.

## PR-Specific Work

When the output is a non-trivial pull request, the PR gate remains strict:

1. Open or identify the PR.
2. Request PR-specific review through the AWG queue.
3. Post a public-safe evidence comment on the PR.
4. Run the local publish gate check when available.
5. Merge only after the gate is fulfilled or explicitly skipped with a reason.
6. Record the gate state in the close report.

Pre-PR implementation QA is useful evidence, but it is not a substitute for the PR object review unless the close report records a skip reason.

## Non-PR Work

When there is no PR, do not write a fake PR gate. Record `PR review gate: not applicable` and fill the output/publish gate instead.

Useful evidence examples:

- artifact path or repository-relative file path
- command output or static check result
- before/after summary
- reviewer artifact or signoff
- delivery record or destination
- approval record for external or irreversible actions
- audit record for queue mutation

## Codex And Tmux

Codex and tmux workers are optional execution paths, not AWG requirements.

Use strict code-worker rules only when the task is actually code or Git-worktree work. Clean worktree checks, branch preparation, PR titles, and sandboxed Codex execution are important for code changes, but they should not be imposed on a local research note, office summary, inbox triage, or other non-coding workflow.

For non-coding worker runs, keep the safety rules that matter generally:

- bounded execution
- clear owner and stop condition
- logs or run summary for inspection
- no shell evaluation of untrusted message bodies
- explicit approval before external sends or irreversible mutation
- reviewed queue reconciliation before ack/retry/recovery

## Close Report Guidance

Every close report should say which gate applied:

- `output/publish gate: fulfilled` when evidence is complete
- `output/publish gate: skipped` when the owner explicitly accepts skipping the gate
- `output/publish gate: not applicable` for trivial checks or read-only inspections with no final artifact

Use `PR review gate` only for PR workflows. Use `Output/Publish Gate` for everything else.
