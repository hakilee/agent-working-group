# Python API Reference

The public API is intentionally small:

```python
from agent_working_group import MessageQueue, MessageKind, PRIORITIES
from agent_working_group import dispatch_hooks
```

## MessageQueue

### Constructor

```python
MessageQueue(root=None)
```

- `root`: queue root directory. If omitted, uses `AWG_ROOT` or `./.agent-working-group`.

### Core Methods

- `initialize(agents=())`: create queue directories and `log/messages.jsonl`.
- `send(sender, recipient, kind, body, reply_to=None, *, correlation_id=None, work_id=None, parent_id=None, source_channel=None, report_target=None, repo=None, workspace=None, expected_response_within=None) -> str`: send a JSON message and return its UUID.
- `receive(agent, timeout=None, report_target=None) -> dict | None`: claim one matching inbox message into `processing/`. Returns `None` on timeout.
- `ack(agent, message_id) -> str`: acknowledge a message from `processing/`.
- `ack_pending(agent, message_id, expect_kind=None, expect_from=None, expect_to=None, expect_created_at=None) -> str`: acknowledge one reviewed inbox message by id without using `recv`.
- `retry(agent, message_id) -> str`: requeue a message from `processing/` or `processed/`.
- `nack(agent, message_id) -> str`: move a message from `processing/` to `dead/`.
- `requeue_stale(agent, older_than_sec=300, max_retries=None) -> dict`: requeue stale processing messages or move them to `dead/` after retry limits. `max_retries=N` allows N requeues; the next stale retry moves the item to `dead/`.

### Optional Send Metadata

`send(...)` stores optional relationship and source metadata under `message["refs"]` only:

- `correlation_id` -> `refs.correlationId`: stable id shared by related messages.
- `work_id` -> `refs.workId`: operator-defined durable work item id for grouping messages across a task, branch, artifact set, or review.
- `parent_id` -> `refs.parentId`: direct parent message id when `replyTo` is not enough.
- `source_channel` -> `refs.sourceChannel`: operator-defined source surface or intake path.
- `report_target` -> `refs.reportTarget`: operator-defined place where progress or final summaries should be reported.
- `repo` -> `refs.repo`: repository or project slug.
- `workspace` -> `refs.workspace`: checkout, workspace, or workstream label.

`expected_response_within` is separate from refs. When provided, it stores positive integer seconds in top-level `message["expectedResponseWithin"]` as an advisory response contract for timeout monitors.

These fields are optional conventions. They do not change delivery order, priority, acknowledgement, retry, pruning, cleanup, dead-letter behavior, or access control by default. When a caller opts into `report_target`, `receive`, `peek`, and `status` use `refs.reportTarget` as a queue selection filter and leave non-matching pending messages untouched. This is not automatic routing or access control. message.id remains the canonical message identity, and processing/ remains the only durable active claim-like queue state.

### Inspection Methods

- `peek(agent, report_target=None) -> list[dict]`: inspect matching pending inbox messages without moving them.
- `pending(agent, limit=None) -> list[dict]`: inspect pending inbox messages with optional limit.
- `processing(agent, limit=None) -> list[dict]`: inspect unacknowledged messages.
- `processed(agent, limit=None, tz="UTC") -> list[dict]`: inspect processed messages.
- `dead(agent, limit=None) -> list[dict]`: inspect dead-letter messages.
- `status(agent, tz="UTC", report_target=None) -> dict`: summarize queue counts and timestamps.
- `log_lines(tz="UTC") -> list[str]`: read JSONL log lines.

### Maintenance

```python
prune(
    agent=None,
    processed_keep=1000,
    log_keep_lines=None,
    dry_run=False,
    include_processing=False,
    processing_keep=100,
)
```

`prune` archives old processed queue files, optionally archives old processing files, and archives removed log lines before truncating the active log.

```python
cleanup_artifacts(
    dry_run=True,
    temp_file_min_age_sec=3600,
    stale_lock_min_age_sec=600,
)
```

`cleanup_artifacts` removes generated worker clutter without touching queue JSON.

## Hooks

```python
dispatch_hooks(root, config_path, event, message, dry_run=False, environ=None) -> list[HookResult]
```

`dispatch_hooks` loads a `hooks.json` config, filters hooks for one message, and runs matching commands with a JSON payload on stdin. Supported events are `message.sent` and `message.pending`. Commands must be argv lists, not shell strings. Recursive hook dispatch is blocked by default through `AWG_HOOK_DEPTH`, and hook failures do not roll back already-enqueued messages.

For the full hook contract and config format, see [Queue Hooks](hooks.md).

## MessageKind and PRIORITIES

`MessageKind` defines the supported kind strings. `PRIORITIES` maps kind strings to delivery priority.
