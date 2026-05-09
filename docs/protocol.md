# Working-Group Queue Protocol

This document describes the reusable coordination protocol behind Agent Working Group.

## Roles

The protocol does not require fixed names. Common roles are:

- **Lead:** decomposes work, assigns one task at a time, verifies outputs, and resolves blockers.
- **Worker:** receives instructions, reports progress, asks questions, produces deliverables, and acknowledges completed work.
- **Observer:** receives final reports or audit events.

Agents are identified by queue names such as `leader`, `worker`, `reviewer`, or `observer`.

## Message Lifecycle

### Default receive

```text
inbox -> processed
```

Default `recv` is backward-compatible and treats receipt as enough history for simple workflows.

### Durable receive

```text
inbox -> processing -> processed
                 \-> inbox   (retry/nack)
                 \-> dead    (retry limit exceeded)
```

Use `recv --require-ack` when the message should not be considered complete until the worker explicitly calls `ack`.

## Priority Order

Delivery order is priority descending, then creation time ascending.

```text
blocker > question > answer > instruction > status > note
```

## Recommended Instruction Shape

Substantive instructions should be queue-first: put the full task spec, constraints, exit criteria, and requested output in the AWG queue message. Chat should only announce that a queue item exists. See [Queue-First Workflow](queue-first-workflow.md), [Task Spec Template](templates/task-spec.md), and [PR Review Gate](pr-review-gate.md).

```text
[ROLE]
One-line role for this task.

[RESPONSIBILITIES]
- Responsibility 1
- Responsibility 2

[WORKSPACE]
Path or scope limits.

[FIRST TASK]
One concrete task.

[DELIVERABLE]
Exact file path, command output, or other completion criteria.

[REPORT]
- Send status when starting.
- Send status while progressing.
- Send status on completion with deliverables.
- Send blocker immediately if stuck.
```

## Error Handling

- Missing facts should become `question` or `blocker`, never guesses.
- `blocker` should be reserved for issues the receiver cannot solve locally.
- `question` should include enough context for a direct `answer`.
- `answer` should include `replyTo` so the original question can be traced.

## Source And Correlation Metadata Convention

`refs` may carry optional metadata for multi-message work and cross-surface traceability. These are conventions, not required schema fields, and older messages remain valid without them.

- `refs.correlationId`: stable id shared by messages that belong to the same task, review, incident, or handoff.
- `refs.workId`: operator-defined durable work item id for grouping messages across a task, branch, artifact set, or review.
- `refs.parentId`: id of the message that directly caused this message when `replyTo` is not enough to describe the relationship.
- `refs.sourceChannel`: operator-defined source surface, intake path, or channel label for the request.
- `refs.reportTarget`: operator-defined destination where progress or final reports should be summarized.
- `refs.repo`: repository or project slug associated with the work.
- `refs.workspace`: workspace, checkout, or workstream label associated with the work.

Use this metadata for traceability only. It does not change delivery order, priority, acknowledgement, retry, pruning, cleanup, dead-letter behavior, queue selection, or access control. Do not depend on it for permission checks or automatic routing. message.id remains the canonical message identity, and processing/ remains the only durable active claim-like queue state.

The CLI can set these optional refs when sending a message:

```bash
awg send --from=lead --to=worker --kind=instruction --body="Review the change" --correlation-id=task-123 --work-id=work-456 --source-channel=work-intake --report-target=work-updates --repo=example/repo --workspace=repo-main
awg send --from=worker --to=lead --kind=status --body="done" --reply-to=<instruction-id> --correlation-id=task-123 --work-id=work-456 --parent-id=<instruction-id>
```

Omit these flags when no source or correlation metadata is needed. Messages without these refs remain valid and backward-compatible.

Example multi-message task flow:

```json
{
  "kind": "instruction",
  "refs": {
    "correlationId": "task-20260508-spec-matrix",
    "workId": "work-spec-matrix"
  }
}
```

```json
{
  "kind": "status",
  "refs": {
    "correlationId": "task-20260508-spec-matrix",
    "workId": "work-spec-matrix",
    "parentId": "<instruction-message-id>",
    "replyTo": "<instruction-message-id>"
  }
}
```

```json
{
  "kind": "question",
  "refs": {
    "correlationId": "task-20260508-spec-matrix",
    "workId": "work-spec-matrix",
    "parentId": "<status-message-id>"
  }
}
```

## Scheduling Semantics

Scheduled observers should inspect queues with non-consuming commands such as `status`, `pending`, `peek`, `processing`, `dead`, `log`, and `requeue-stale`.

Do not schedule `recv` unless a real processor is attached to the output. `recv` moves messages out of `inbox/`; a cron job that only prints the message can silently lose work. See [Safe Scheduling](safe-scheduling.md) for safe cron, timer, and watchdog patterns.

## Retry Semantics

`requeue-stale` scans `processing/` and compares the current time with `refs.receivedAtMs`. Messages older than `--older-than-sec` are requeued. Each retry records `refs.retriedAt` and increments `refs.retryCount`. If the next retry would exceed `--max-retries`, the message moves to `dead/`.

`--max-retries=N` means the message may be requeued up to N times. The next retry beyond N becomes dead-lettered.

## Pruning Semantics

`prune` never deletes processed queue files directly. It moves them to `log/pruned/`. Log pruning archives removed JSONL lines before truncating the active log.

## Time Semantics

Canonical timestamps are UTC. Local display fields are derived at read time with `--local` or `--tz=<IANA timezone>`.
