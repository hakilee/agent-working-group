# Working-Group Queue Protocol

This document describes the reusable coordination protocol behind Agent Working Group.

## Roles

AWG queue routing should use stable role names. The default roles are:

- **Lead:** decomposes work, assigns one task at a time, verifies outputs, and resolves blockers.
- **Worker:** receives instructions, reports progress, asks questions, produces deliverables, and acknowledges completed work.
- **Reviewer:** independently verifies outputs, reports findings, and records PASS/CONDITIONAL PASS/FAIL evidence.
- **Observer:** receives final reports or audit events without consuming work.

Agents are identified by queue names such as `lead`, `worker`, `reviewer`, or `observer`. Prefer role-based queue names in `from` and `to` fields. Personal agent names, chat handles, or human names belong in message body attribution or external notifications, not queue routing.

### Role Registry

`awg init` creates the canonical role queues and a local `roles.json` registry under the AWG root. `awg roles` prints the configured roles and aliases. If `roles.json` is absent, AWG uses the built-in default role registry instead of creating unregistered queues.

`awg send` validates both `--from` and `--to` against the active role registry. Unknown roles fail closed; add intentional custom roles to `roles.json` before routing work to them.

Aliases can map local profile or tool names to stable role queues. For example, a site-local alias may map a reviewer handle to `reviewer`. Aliases resolve to the canonical role queue at send time, and `refs.senderRoleResolution` or `refs.recipientRoleResolution` records the alias, target role, and `resolved` mode for audit.

```json
{
  "version": 1,
  "roles": {
    "lead": {"description": "scope, assignment, close"},
    "worker": {"description": "implementation or artifact production"},
    "reviewer": {"description": "independent verification"},
    "observer": {"description": "read-only monitoring"}
  },
  "aliases": {
    "local-reviewer-handle": "reviewer"
  }
}
```

The registry is routing hygiene, not a permission system; lifecycle authority still comes from queue files and explicit queue commands.

## Message Lifecycle

### Claim And Complete

```text
inbox -> processing -> processed
                 \-> inbox   (retry)
                 \-> dead    (nack or retry limit exceeded)
```

`recv` always claims one matching message into `processing/`. Work is not complete until the worker explicitly calls `ack`; `retry` returns a claimed item to `inbox/`, and `nack` or exhausted stale recovery moves it to `dead/`.

Reviewed historical inbox items may use the separate `ack-pending` reconciliation primitive, but that is an evidence-gated operator exception, not the default workflow.

## Priority Order

Delivery order is priority descending, then creation time ascending.

```text
blocker > question > answer > instruction > status > note
```

## Recommended Instruction Shape

Substantive instructions should be queue-first: put the full task spec, constraints, exit criteria, and requested output in the AWG queue message. Chat should only announce that a queue item exists. For repository implementation work, the implementation workflow should stop at PR creation/update; PR review is a separate queue-first workflow. See [Queue-First Workflow](queue-first-workflow.md), [Task Spec Template](templates/task-spec.md), [Output And Publish Gate](output-publish-gate.md), [PR Review Gate](pr-review-gate.md), and [Reliable AWG Runtime](reliable-awg-runtime.md).

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

`refs` may carry optional metadata for multi-message work and cross-surface traceability. These are conventions, not required schema fields.

- `refs.correlationId`: stable id shared by messages that belong to the same task, review, incident, or handoff.
- `refs.workId`: operator-defined durable work item id for grouping messages across a task, branch, artifact set, or review.
- `refs.parentId`: id of the message that directly caused this message when `replyTo` is not enough to describe the relationship.
- `refs.sourceChannel`: operator-defined source surface, intake path, or channel label for the request.
- `refs.reportTarget`: operator-defined destination where progress or final reports should be summarized.
- `refs.repo`: repository or project slug associated with the work.
- `refs.workspace`: workspace, checkout, or workstream label associated with the work.

Use this metadata primarily for traceability. `refs.reportTarget` can also be used as an opt-in receive filter: `awg recv --report-target <target>` skips pending messages whose normalized `refs.reportTarget` does not exactly match the requested target without moving them to `processing/` or `processed/`, then advances to the next matching message. Messages without `refs.reportTarget` do not match a filtered receive. This filter is routing/selection metadata, not a permission system. message.id remains the canonical message identity, and processing/ remains the only durable active claim-like queue state.

The CLI can set these optional refs when sending a message:

```bash
awg send --from=lead --to=worker --kind=instruction --body="Review the change" --correlation-id=task-123 --work-id=work-456 --source-channel=work-intake --report-target=work-updates --repo=example/repo --workspace=repo-main
awg recv --as=worker --report-target=work-updates
awg send --from=worker --to=lead --kind=status --body="done" --reply-to=<instruction-id> --correlation-id=task-123 --work-id=work-456 --parent-id=<instruction-id>
```

Omit these flags when no source or correlation metadata is needed. Messages without these refs remain valid.

## Work Item Summary

`awg work-items` provides a read-only, Kanban-like view over the existing queue files. It groups messages by `refs.workId`; messages without `refs.workId` remain visible as their own work item keyed by `message.id`. It also surfaces safe routing/evidence refs such as `correlationId`, `parentId`, `sourceChannel`, `reportTarget`, `repo`, and `workspace` so reviewers can trace handoffs without scraping prose.

The command derives status from queue locations instead of adding a new task database:

```text
dead item     -> any message in dead/
blocked item  -> pending or running blocker message
running item  -> any message in processing/
ready item    -> any message in inbox/
done item     -> only processed messages
```

`dead` intentionally has the highest priority. If one `workId` has a dead message plus running, ready, or done messages, the whole work item reports `dead` so operators see the unsafe branch first instead of treating partial progress as healthy.

This is intentionally not a dispatcher, profile spawner, separate board database, or lifecycle authority. The queue remains the source of truth, `processing/` remains the only active claim-like state, and `work-items` must not move, acknowledge, retry, delete, or edit queue JSON. AWG agents still use the normal queue commands; there is no Hermes-style model-only tool surface or gateway dispatcher hidden behind the summary.

```bash
awg work-items
awg work-items --as=worker --report-target=work-updates
```

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

Scheduled observers should inspect queues with non-consuming commands such as `status`, `pending`, `peek`, `processing`, `dead`, and `log`.

`requeue-stale` is a recovery command, not a read-only inspection command: it mutates stale `processing/` messages by moving them back to `inbox/` or into `dead/`. Schedule it only as explicit recovery with a configured retry limit.

Do not schedule `recv` unless a real processor is attached to the output. `recv` moves messages out of `inbox/`; a cron job that only prints the message can silently lose work. See [Safe Scheduling](safe-scheduling.md) for safe cron, timer, and watchdog patterns.

## Retry Semantics

`requeue-stale` scans `processing/` and compares the current time with `refs.receivedAtMs`. Messages older than `--older-than-sec` are requeued. Each retry records `refs.retriedAt` and increments `refs.retryCount`. If the next retry would exceed `--max-retries`, the message moves to `dead/`.

`--max-retries=N` means the message may be requeued up to N times. The next retry beyond N becomes dead-lettered.

## Pruning Semantics

`prune` never deletes processed queue files directly. It moves them to `log/pruned/`. Log pruning archives removed JSONL lines before truncating the active log.

## Time Semantics

Canonical timestamps are UTC. Local display fields are derived at read time with `--local` or `--tz=<IANA timezone>`.
