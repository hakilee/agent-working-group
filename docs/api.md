# Python API Reference

The public API is intentionally small:

```python
from agent_working_group import MessageQueue, MessageKind, PRIORITIES
```

## MessageQueue

### Constructor

```python
MessageQueue(root=None)
```

- `root`: queue root directory. If omitted, uses `AWG_ROOT` or `./.agent-working-group`.

### Core Methods

- `initialize(agents=())`: create queue directories and `log/messages.jsonl`.
- `send(sender, recipient, kind, body, reply_to=None) -> str`: send a JSON message and return its UUID.
- `receive(agent, timeout=None, require_ack=False) -> dict | None`: receive one message. Returns `None` on timeout.
- `ack(agent, message_id) -> str`: acknowledge a message from `processing/`.
- `retry(agent, message_id) -> str`: requeue a message from `processing/` or `processed/`.
- `requeue_stale(agent, older_than_sec=300, max_retries=None) -> dict`: requeue stale processing messages.

### Inspection Methods

- `peek(agent) -> list[dict]`: inspect pending inbox messages without moving them.
- `processing(agent, limit=None) -> list[dict]`: inspect unacknowledged messages.
- `processed(agent, limit=None, tz="UTC") -> list[dict]`: inspect processed messages.
- `dead(agent, limit=None) -> list[dict]`: inspect dead-letter messages.
- `status(agent, tz="UTC") -> dict`: summarize queue counts and timestamps.
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

## MessageKind and PRIORITIES

`MessageKind` defines the supported kind strings. `PRIORITIES` maps kind strings to delivery priority.
