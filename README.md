# Agent Working Group

Agent Working Group is a tiny file-backed coordination layer for small teams of agents and local operators. It gives a lead agent and one or more worker agents a shared mailbox protocol: send instructions, receive prioritized messages, acknowledge work, retry stale messages, and inspect the queue without running a server.

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
- **Queue reconciliation policy:** old inbox items require evidence before any future reconciliation action.

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
- `send(sender, recipient, kind, body, reply_to=None, *, correlation_id=None, parent_id=None, source_channel=None, report_target=None, repo=None, workspace=None) -> str`: send a message and return its id; optional metadata is stored only under `refs`.
- `receive(agent, timeout=None, require_ack=False) -> dict | None`: receive one message, or `None` on timeout.
- `ack(agent, message_id)`: move a `processing/` message to `processed/`.
- `ack_pending(agent, message_id, expect_kind=None, expect_from=None, expect_to=None, expect_created_at=None)`: explicitly acknowledge one reviewed inbox message by id.
- `retry(agent, message_id)`: requeue a message from `processing/` or `processed/`.
- `requeue_stale(agent, older_than_sec=300, max_retries=None)`: requeue stale unacked messages or move them to `dead/`.
- `status(agent, tz="UTC")`, `peek(agent)`, `pending(agent)`, `processing(agent)`, `processed(agent)`, `dead(agent)`, `log_lines(tz="UTC")`: inspect queue state.
- `prune(agent=None, processed_keep=1000, include_processing=False, processing_keep=100, log_keep_lines=None, dry_run=False)`: archive old queue/log data.
- `cleanup_artifacts(dry_run=True, temp_file_min_age_sec=3600, stale_lock_min_age_sec=600)`: remove generated worker clutter without touching queue JSON.

For the full Python surface, see [Python API Reference](docs/api.md).

## CLI Overview

```bash
awg init --agent leader --agent worker
awg send --from=leader --to=worker --kind=instruction --body="Do one clear task."
awg recv --as=worker --timeout=120 --require-ack
awg ack --as=worker --id=<message-id>
awg ack-pending --as=worker --id=<message-id> --expect-kind=instruction
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
scripts/awg-queue-reconciliation-report.sh --role worker
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
    "correlationId": "optional-task-or-thread-id",
    "workId": "optional-work-item-id",
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

This is intentionally simple and local-first. It does not require a broker, database, network service, or daemon. It is best suited for local agent orchestration, coding-agent experiments, office workflows, and small workflow projects.

For a clean-clone operator setup, see [Operator Runbook](docs/operator-runbook.md). It distinguishes the workflow that ships with this repository from environment-specific choices such as agent identities, notification surfaces, credentials, and private artifact locations. For a runnable queue lifecycle demo, see [Examples](examples/README.md).

For queue-first planning, handoff, review, and closure patterns, see [Queue-First Workflow](docs/queue-first-workflow.md). Substantive specs should go through AWG queue messages; external chat or issue trackers should only announce that a queue item was added.

For safety guarantees mapped to tests, see [Spec Matrix](docs/spec-matrix.md). For optional multi-message, work-item, and cross-surface traceability, see the `refs.correlationId`, `refs.workId`, `refs.parentId`, `refs.sourceChannel`, `refs.reportTarget`, `refs.repo`, and `refs.workspace` conventions in [Working-Group Queue Protocol](docs/protocol.md). `awg send` can set them with optional `--correlation-id`, `--work-id`, `--parent-id`, `--source-channel`, `--report-target`, `--repo`, and `--workspace` flags. These refs are optional conventions only: message.id remains the canonical message identity, and processing/ remains the only durable active claim-like queue state.

For filesystem containment rules used by helper code, see [Path Safety](docs/path-safety.md). Path helpers should resolve canonical paths, fail closed, and reject symlink or traversal escapes.

Reusable templates live in [docs/templates](docs/templates/): [Task Spec](docs/templates/task-spec.md), [QA Checklist Request](docs/templates/qa-checklist-request.md), [Review Result](docs/templates/review-result.md), [Close Report](docs/templates/close-report.md), [PR Review Request](docs/templates/pr-review-request.md), [PR Review Result Comment](docs/templates/pr-review-result-comment.md), [Artifact Index](docs/templates/artifact-index.md), and [Queue Reconciliation Action Audit](docs/templates/queue-reconciliation-action-audit.md). `scripts/awg-independent-analysis-template.sh` prints stdout-only independent-analysis section scaffolds aligned with the task spec, review result, and close report templates.

For the general output boundary model, see [Output And Publish Gate](docs/output-publish-gate.md). AWG does not require pull requests, Codex, tmux, or coding-specific ceremony for every workflow; choose the lightest gate that records final output, evidence, review, and remaining risk. For queue-first pull request review gates and public-safe PR comments, see [PR Review Gate](docs/pr-review-gate.md). Review results can be summarized back to the pull request, but the workflow must never auto-merge or auto-approve. Non-trivial PRs should record `PR review gate: fulfilled` with a public evidence comment URL, or `skipped` with an explicit reason.

For operational Markdown artifact lifecycle, timestamped filenames, and active/completed/archive retention, see [Artifact Retention](docs/artifact-retention.md). For read-only discovery across an ops workspace, see [Artifact Index](docs/artifact-index.md).

For the opt-in queue-to-executor bridge, see [AI Executor Bridge](docs/ai-executor-bridge.md). The bridge acknowledges only successful instruction execution and never executes message bodies as shell. `scripts/awg-real-executor-template.sh` provides a provider-neutral adapter template for private real executor wrappers. For code-related queue execution through Codex in a bounded tmux session, see [Codex Tmux Worker](docs/codex-tmux-worker.md). Codex and tmux are optional worker paths, not requirements for office, local artifact, or non-coding workflows.

For repository-first commit message and pull request title rules with Conventional Commits fallback, see [Repository Rules](docs/repository-rules.md). `scripts/awg-detect-repository-rules.sh` provides a read-only advisory scan for candidate rule sources.

For cron, timer, and watchdog patterns, see [Safe Scheduling](docs/safe-scheduling.md). Scheduled observers should not call `recv` unless a real processor is attached. For old inbox messages that may be superseded, see [Queue Inbox Reconciliation](docs/queue-reconciliation.md) and the read-only reconciliation report helper.

For read-only pending queue notifications, see [Queue Notifier](docs/queue-notifier.md), [Queue Notifier Adapters](docs/queue-notifier-adapters.md), [Runtime-Neutral Notifier Contract](docs/runtime-neutral-notifier-contract.md), and [Queue Notifier Scheduler Sample](docs/queue-notifier-scheduler-sample.md). Notifiers are channel-agnostic wake-up bridges; adapter helpers emit `awg.notifier.pending.v1` provider-neutral payloads and do not consume, execute, or send work.

For a read-only pre-work or close-readiness snapshot, use [Operator Baseline Doctor](docs/operator-baseline-doctor.md). It reports local Git status, optional GitHub counts, role queue status, and active artifact counts without mutating queues, repositories, artifacts, schedulers, or providers.

For bounded tmux worker scripts, safe-poll coexistence, read-only worker state reporting, and instruction auto-ack warnings, see [Worker Operations](docs/worker-operations.md). The worker scripts are queue runners, not AI executors; do not send `instruction` messages to an active queue runner unless acknowledging without execution is intentional.

For cleanup of worker temp files and stale worker lock directories, see [Cleanup Artifacts](docs/cleanup-artifacts.md). Cleanup jobs must not delete queue JSON directly.
