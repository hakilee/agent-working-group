# Queue-First Workflow

Agent Working Group is queue-first. Substantive work instructions, review requests, QA checklists, and handoff context must go through the AWG queue. Chat is only for short notifications that a queue item exists and for brief human-facing summaries.

Queue-first coordination keeps the full task context in one durable message. It prevents long chat messages from splitting, losing mentions, or becoming unavailable to agents that join later.

## When To Use The Queue

Use an `instruction` message for any work that has scope, constraints, exit criteria, or expected artifacts. This includes implementation tasks, review requests, QA checklist requests, release checks, and closure reports.

Use chat only to say that an AWG queue item was added, with a short message id and one-line summary. Do not rely on chat-only long specs for work that another planner, worker, or reviewer must execute.

## Roles

- **Lead:** creates the queue item, defines scope and exit criteria, tracks completion, and decides whether follow-up work is needed.
- **Worker:** receives one task, keeps the instruction in `processing` while working, reports progress, and acknowledges only after the requested output is complete.
- **Reviewer:** verifies output against the checklist, records findings in a file or queue status, and identifies blockers before closure.
- **Observer:** watches status or stale processing messages without consuming the inbox.

## Planner Responsibilities

Every substantive `instruction` should include:

- task goal
- scope and out-of-scope items
- constraints and safety rules
- exit criteria
- requested output artifact or location
- verification commands or evidence expected
- reply path for status, questions, blockers, and final report

Prefer one bounded task per queue item. If a task has multiple phases, define the current phase and the next decision point.

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

## Close Reports

Close reports should include completed artifacts, verification evidence, queue messages handled, and remaining risks. If the next safe follow-up is clear, create the next queue item instead of stopping at a chat-only "done" message.

## Safe Scheduling And Observers

Observers may run `status`, `pending`, `peek`, `processing`, `dead`, `log`, or conservative `requeue-stale`. Observers must not run `recv` unless they are the real processor for those messages.

Queue runners that automatically acknowledge messages are not task executors. Do not send substantive `instruction` messages to an auto-ack runner unless acknowledgement without execution is intentional.

## AWG Unavailable Fallback

If AWG is unavailable, write the handoff to a file, record why the queue-first loop was skipped, and include enough context for another agent to resume later. Add the queue item when AWG is available again.

## Templates

Use the templates in `docs/templates/` for repeatable handoffs:

- [Task Spec](templates/task-spec.md)
- [QA Checklist Request](templates/qa-checklist-request.md)
- [Review Result](templates/review-result.md)
- [Close Report](templates/close-report.md)
