# Queue-First Workflow

Agent Working Group is queue-first. Substantive work instructions, review requests, QA checklists, and handoff context must go through the AWG queue. Chat is only for short notifications that a queue item exists and for brief human-facing summaries.

Queue-first coordination keeps the full task context in one durable message. It prevents long chat messages from splitting, losing mentions, or becoming unavailable to agents that join later.

## Queue Partitioning

Default to one role queue for low-volume coordination. Treat chat channels and other surfaces as notification and reporting locations, not as default queue partitions.

When work comes from several surfaces, keep the shared role queue but include source metadata on the message: `refs.sourceChannel`, `refs.reportTarget`, `refs.repo`, `refs.workspace`, and `refs.correlationId`. This keeps the queue durable while preserving where the work came from and where status should go.

Split queues by repository or workstream when tasks are substantial, concurrent, or need separate lifecycle ownership. Split queues by surface only when privacy, audience, retention, or permission boundaries require it.

## When To Use The Queue

Use an `instruction` message for any work that has scope, constraints, exit criteria, or expected artifacts. This includes implementation tasks, documentation updates, review requests, QA checklist requests, release checks, and closure reports.

Use chat or another delivery surface only to say that an AWG queue item was added, with a short message id and one-line summary. Do not rely on chat-only long specs for work that another planner, worker, or reviewer must execute. If missed wake-ups are likely, use the read-only [Queue Notifier](queue-notifier.md) instead of relying on memory.

## Roles

- **Lead:** creates the queue item, defines scope and exit criteria, tracks completion, and decides whether follow-up work is needed.
- **Worker:** receives one task, keeps the instruction in `processing` while working, reports progress, and acknowledges only after the requested output is complete.
- **Reviewer:** verifies output against the checklist, records findings in a file or queue status, and identifies blockers before closure.
- **Observer:** watches status or stale processing messages without consuming the inbox.

## Role Naming Convention

Queue routing uses role names, not personal agent names. This keeps ownership clear regardless of which specific agent instance fills a role.

Rules:
- **Queue `from`/`to` fields must use role names:** `lead`, `worker`, `reviewer`, `codex-worker`, `observer`.
- **Do not use personal agent names** (such as `matgukno`, `matdori`, or any other agent-specific name) as queue senders or recipients.
- **Personal names are for chat mentions and human-readable attribution only**, not queue routing.
- When creating queue items, always choose the role target intentionally.
- Align request, answer, and ack handling to the role, not the person filling it.
- If multiple workers share one role queue, include distinguishing metadata in `refs.workId` or `refs.correlationId` rather than creating person-named queues.

This convention applies to all queue operations: `awg send`, `awg recv`, `awg ack`, `awg ack-pending`, and programmatic API calls.

For new queue roots, run `awg init --default-roles` and inspect `awg roles`. When `roles.json` exists, `awg send` enforces the configured roles and aliases. If a local person, profile, or tool handle needs to receive work, add it as an alias to a stable role instead of creating a personal queue. Use `--allow-unregistered-role` only for an intentional custom role or migration case, and prefer declaring that role in `roles.json` afterward.

## Planner Responsibilities

Every substantive `instruction` should include:

- task goal
- scope and out-of-scope items
- constraints and safety rules
- exit criteria
- requested output artifact or location
- verification commands or evidence expected
- reply path for status, questions, blockers, and final report
- source metadata when the work crosses surfaces, repositories, or workstreams
- notification path when the recipient may not actively monitor the queue

Prefer one bounded task per queue item. If a task has multiple phases, define the current phase and the next decision point.

### Independent Lead Analysis

For large, high-risk, or strategically important analysis and design work, the lead should perform an independent worker-level analysis in addition to delegating review or investigation. The goal is to reduce planner-only blind spots before closure.

This rule is selective. Do not require it for trivial one-step work, urgent reversible checks, or routine tasks where the extra ceremony would not improve safety or confidence. When applying it, keep the analysis short enough to be useful: record only the conclusion, evidence, disagreement, and closure decision that another agent needs.

Use this lightweight comparison flow:

1. Lead records an independent analysis and evidence before relying on the worker or reviewer conclusion.
2. Worker or reviewer records their analysis, QA result, or findings.
3. Lead compares the conclusions before publishing or closing.
4. If conclusions disagree, record the disagreement, the resolution path, and whether follow-up work, retest, or explicit acceptance is required.
5. Close only after agreement is reached, the disagreement is resolved, or the remaining risk is explicitly accepted.

For copy-paste scaffolds that match the task spec, review result, and close report templates, run:

```bash
scripts/awg-independent-analysis-template.sh [task-spec|review-result|close-report|all]
```

The helper is advisory and stdout-only. It does not decide whether independent analysis is required, does not modify files, and must not become an enforcement gate.

## Worker Responsibilities

Workers should receive durable tasks with `recv --require-ack`. The message should remain in `processing` until the task is complete, intentionally superseded, or moved by the retry/dead-letter policy.

Use these outcomes:

- `ack`: only after the requested output and verification are complete.
- `retry` or `nack`: when the task should return to the inbox for another attempt.
- `question`: when missing information blocks a safe decision and the lead can answer it.
- `blocker`: when work cannot continue locally or requires intervention.
- `status`: for progress, completion evidence, or failed verification details.

Never acknowledge an `instruction` just because it was read. Reading starts accountability; completion ends it.

## Reviewer Responsibilities

Reviewers should record QA results in a file or queue status message. Avoid chat-only review findings for substantive work, because the next agent may not have full chat context.

A useful review result includes:

- checklist item results
- evidence inspected
- findings ordered by severity
- required fixes
- residual risks
- final verdict: `PASS`, `CONDITIONAL PASS`, or `FAIL`


## Output And Publish Gates

AWG's general gate is the output or publish boundary, not a pull request. Before closing substantive work, record the final output, appropriate evidence, review or owner signoff, the closure or delivery decision, and remaining risk. Use the lightest gate that fits the work: PR gate for GitHub PRs, artifact gate for local files, office/admin gate for reports or handoffs, external-send gate for outbound messages, queue-mutation gate for reconciliation, and worker-execution gate for tmux or Codex runs.

For implementation-mode code or repository documentation changes, the publish boundary is normally PR creation/update; review and merge should happen in a separate review-mode workflow. See [Reliable AWG Runtime](reliable-awg-runtime.md) for the branch protection, active work-state, tmux watcher, and dashboard supervision baseline.

Do not impose PR, branch, clean-worktree, Codex, or tmux rules on non-coding local work unless the task scope actually needs them. Conversely, when work is published through a non-trivial PR, the PR-specific gate remains required.

## Close Reports

Close reports should include completed artifacts, verification evidence, queue messages handled, and remaining risks. Store shared operational artifacts in a neutral workspace and prefer timestamped filenames such as `YYYYMMDDHHMM-short-description.md`. When work closes, move related artifacts from `active/` to `completed/` instead of deleting them. See [Artifact Retention](artifact-retention.md).

If the next safe follow-up is clear, create the next queue item instead of stopping at a chat-only "done" message.

If old inbox messages remain after closure, do not bulk consume them. Use the evidence-first policy in [Queue Inbox Reconciliation](queue-reconciliation.md): observe one queue at a time, link items to completed artifacts, merged pull requests, or close reports, and leave unknown items in place. When review or QA results arrive through chat first, backfill the substantive result into the queue before closing the workflow.

For commits, pull request titles, and squash merge titles, follow the target repository's documented rule first. If no explicit rule exists, use Conventional Commits. See [Repository Rules](repository-rules.md).

## Safe Scheduling And Observers

Observers may run `status`, `pending`, `peek`, `processing`, `dead`, or `log`. Conservative `requeue-stale` is recovery, not reconciliation. Observers must not run `recv` unless they are the real processor for those messages.

Queue runners that automatically acknowledge messages are not task executors. Do not send substantive `instruction` messages to an auto-ack runner unless acknowledgement without execution is intentional.

## AWG Unavailable Fallback

If AWG is unavailable, write the handoff to a file, record why the queue-first loop was skipped, and include enough context for another agent to resume later. Add the queue item when AWG is available again.

## Templates

Use the templates in `docs/templates/` for repeatable handoffs:

- [Task Spec](templates/task-spec.md)
- [QA Checklist Request](templates/qa-checklist-request.md)
- [Review Result](templates/review-result.md)
- [Close Report](templates/close-report.md)
- [PR Review Request](templates/pr-review-request.md)
- [PR Review Result Comment](templates/pr-review-result-comment.md)
- [Artifact Index](templates/artifact-index.md)
- [Queue Reconciliation Action Audit](templates/queue-reconciliation-action-audit.md)

For read-only queue wake-up notifications, see [Queue Notifier](queue-notifier.md). For general output and publish boundaries, see [Output And Publish Gate](output-publish-gate.md). For pull request review gates, see [PR Review Gate](pr-review-gate.md); non-trivial PRs should record a fulfilled gate with a public evidence comment URL or an explicit skip reason. For artifact lifecycle and retention, see [Artifact Retention](artifact-retention.md). For inbox reconciliation policy, see [Queue Inbox Reconciliation](queue-reconciliation.md). For commit and pull request title policy, see [Repository Rules](repository-rules.md).
