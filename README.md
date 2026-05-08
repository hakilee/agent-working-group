# Agent Working Group

Agent Working Group is a tiny file-backed coordination layer for small teams of coding agents. It gives a lead agent and one or more worker agents a shared mailbox protocol: send instructions, receive prioritized messages, acknowledge work, retry stale messages, and inspect the queue without running a server.

The package is designed around a practical working pattern: a lead decomposes work, workers validate or implement bounded tasks, messages preserve accountability, and queue state makes collaboration inspectable.

## Core Ideas

- **File-backed queues:** each agent has `inbox/`, `processing/`, `processed/`, and `dead/` directories.
- **Atomic delivery:** messages are written to `tmp/` and moved into the recipient inbox.
- **Prioritized messages:** `blocker` outranks `question`, then `answer`, `instruction`, `status`, and `note`.
- **Explicit accountability:** `recv --require-ack` moves a message into `processing/`; `ack` finalizes it.
- **Retry and dead letters:** stale unacked messages can be requeued or moved to `dead/` after retry limits.
- **Inspectable operations:** `peek`, `status`, `processing`, `processed`, `dead`, and `log` expose state.
- **No daemon required:** the CLI can be run manually, by agents, or from cron/watchdog jobs.
- **Safe scheduling:** observers can inspect and recover queues without consuming work.

## Installation

From the repository root:

```bash
python3 -m pip install -e .
```

Or run without installation:

```bash
PYTHONPATH=src python3 -m agent_working_group.cli --help
```

## Quick Start

```bash
export AWG_ROOT=/tmp/awg-demo
awg init --agent leader --agent worker

awg send --from=leader --to=worker --kind=instruction --body="Inspect the repository and report risks."
awg recv --as=worker --require-ack
awg ack --as=worker --id=<message-id>

awg send --from=worker --to=leader --kind=status --body="done: risk report written"
awg recv --as=leader --timeout=30
```


## Python API

```python
from agent_working_group import MessageQueue

queue = MessageQueue("/tmp/awg-demo")
queue.initialize(["lead", "worker"])

message_id = queue.send("lead", "worker", "instruction", "Write a short report.")
message = queue.receive("worker", timeout=30, require_ack=True)
if message is None:
    raise TimeoutError("worker inbox was empty")

queue.ack("worker", message_id)
status = queue.status("worker", tz="Asia/Seoul")
```

Primary methods:

- `initialize(agents)`: create queue directories and log files.
- `send(sender, recipient, kind, body, reply_to=None) -> str`: send a message and return its id.
- `receive(agent, timeout=None, require_ack=False) -> dict | None`: receive one message, or `None` on timeout.
- `ack(agent, message_id)`: move a `processing/` message to `processed/`.
- `retry(agent, message_id)`: requeue a message from `processing/` or `processed/`.
- `requeue_stale(agent, older_than_sec=300, max_retries=None)`: requeue stale unacked messages or move them to `dead/`.
- `status(agent, tz="UTC")`, `peek(agent)`, `processing(agent)`, `processed(agent)`, `dead(agent)`: inspect queue state.
- `prune(agent=None, processed_keep=1000, include_processing=False, processing_keep=100, log_keep_lines=None, dry_run=False)`: archive old queue/log data.
- `cleanup_artifacts(dry_run=True, temp_file_min_age_sec=3600, stale_lock_min_age_sec=600)`: remove generated worker clutter without touching queue JSON.

## CLI Overview

```bash
awg init --agent leader --agent worker
awg send --from=leader --to=worker --kind=instruction --body="Do one clear task."
awg recv --as=worker --timeout=120 --require-ack
awg ack --as=worker --id=<message-id>
awg retry --as=worker --id=<message-id>
awg nack --as=worker --id=<message-id>
awg requeue-stale --as=worker --older-than-sec=300 --max-retries=3
awg peek --as=worker
awg pending --as=worker --json
awg processing --as=worker --limit=5
awg processed --as=worker --limit=5 --tz=Asia/Seoul
awg dead --as=worker --limit=5
awg status --as=worker --tz=Asia/Seoul
awg prune --as=worker --processed-keep=100 --include-processing --processing-keep=20 --log-keep-lines=1000 --dry-run
awg cleanup-artifacts --dry-run
awg log --tz=Asia/Seoul
```

## Message Schema

Each message is a JSON object:

```json
{
  "id": "uuid-v4",
  "kind": "instruction",
  "from": "leader",
  "to": "worker",
  "body": "Do one clear task.",
  "refs": {
    "replyTo": "optional-message-id",
    "receivedAt": "2026-05-07T15:30:48Z",
    "receivedAtMs": 1778167848812,
    "ackedAt": "2026-05-07T15:31:10Z",
    "retriedAt": "2026-05-07T15:32:00Z",
    "retryCount": 1
  },
  "priority": 50,
  "createdAt": "2026-05-07T15:30:00Z",
  "createdAtMs": 1778167800000
}
```

## Message Kinds

| Kind | Priority | Use |
| --- | ---: | --- |
| `blocker` | 99 | Work cannot proceed without intervention. |
| `question` | 70 | The receiver must answer before work continues. |
| `answer` | 60 | Reply to a question; include `--reply-to`. |
| `instruction` | 50 | Assign one bounded task. |
| `status` | 30 | Progress, completion, or verification reports. |
| `note` | 10 | Low-priority context. |

## Directory Layout

```text
<AWG_ROOT>/
  queues/<agent>/inbox/       # pending messages
  queues/<agent>/processing/  # received with --require-ack, not yet acknowledged
  queues/<agent>/processed/   # completed or non-ack receive history
  queues/<agent>/dead/        # retry limit exceeded
  log/messages.jsonl          # append-only sent-message log
  log/pruned/                 # archived processed messages and pruned log lines
  tmp/                        # temporary writes and locks
```

## Lead / Worker Operating Loop

A practical two-agent loop:

1. Lead sends one `instruction` to a worker.
2. Worker receives with `--require-ack`, starts work, and sends `status`.
3. Worker asks `question` if blocked by missing information.
4. Lead answers with `answer --reply-to=<question-id>`.
5. Worker sends `status` with deliverables and verification.
6. Lead independently verifies key deliverables.
7. Worker `ack`s the instruction when complete.
8. Lead sends the next instruction or final report.

## Maintenance Flow

Use this flow for every enhancement:

1. Define the operational problem and expected behavior.
2. Implement the smallest generic change in `src/agent_working_group/`.
3. Update `README.md` and protocol/API docs in English.
4. Add or update tests in `tests/`.
5. Run the test suite from the project root.
6. Review the public API and docs for clarity.
7. Only then report the enhancement as complete.

This keeps implementation, documentation, and tests aligned.

## Current Scope

This is intentionally simple and local-first. It does not require a broker, database, network service, or daemon. It is best suited for local agent orchestration, coding-agent experiments, and small workflow projects.

For queue-first planning, handoff, review, and closure patterns, see [Queue-First Workflow](docs/queue-first-workflow.md). Substantive specs should go through AWG queue messages; chat should only announce that a queue item was added.

Reusable templates live in [docs/templates](docs/templates/): [Task Spec](docs/templates/task-spec.md), [QA Checklist Request](docs/templates/qa-checklist-request.md), [Review Result](docs/templates/review-result.md), and [Close Report](docs/templates/close-report.md).

For cron, timer, and watchdog patterns, see [Safe Scheduling](docs/safe-scheduling.md). Scheduled observers should not call `recv` unless a real processor is attached.

For bounded tmux worker scripts, safe-poll coexistence, and instruction auto-ack warnings, see [Worker Operations](docs/worker-operations.md). The worker scripts are queue runners, not AI executors; do not send `instruction` messages to an active queue runner unless acknowledging without execution is intentional.

For cleanup of worker temp files and stale worker lock directories, see [Cleanup Artifacts](docs/cleanup-artifacts.md). Cleanup jobs must not delete queue JSON directly.
