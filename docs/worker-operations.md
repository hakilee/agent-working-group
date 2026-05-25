# Worker Operations

This guide describes the optional bounded worker scripts in `scripts/`. They are generic queue runners for Agent Working Group. They do not run an AI model and they do not execute message bodies as commands.

Worker helpers are optional execution paths. AWG users doing non-coding local, office, or artifact-only work can use lighter output/publish gates without Codex, tmux, branch, or clean-worktree ceremony.

## Scripts

- `scripts/awg-worker-loop.sh`: receive one message at a time with `recv`, log it, and acknowledge it.
- `scripts/awg-worker-tmux.sh`: start, inspect, stop, or recover a bounded worker loop inside tmux.
- `scripts/awg-safe-poll.sh`: inspect status and optionally requeue stale processing messages without consuming the inbox.
- `scripts/awg-worker-state-report.sh`: print a read-only worker state and readiness snapshot for one role.

All scripts use `AWG_ROOT` and `awg --root`. If `AWG_ROOT` is unset, they use `.agent-working-group` under the current directory.

## Helper Environment Contract

Helper scripts run the AWG CLI through `AWG_CLI`, which is an executable name or executable path. It is not a shell command string. Helpers must invoke it as quoted `"$AWG_CLI"` and must not evaluate it through another shell.

Use a wrapper executable when setup needs interpreter flags, environment variables, or module invocation:

```bash
#!/usr/bin/env bash
exec python3 -m agent_working_group.cli "$@"
```

Point `AWG_CLI` at that wrapper executable. Do not put spaces, pipes, redirects, or chained shell operators in `AWG_CLI`.

`AWG_ROOT` is the queue root directory passed to `awg --root` when a helper needs an explicit non-default queue. Use an absolute path or a valid relative path. It is a path value, not a command. When `AWG_ROOT` is unset, the AWG CLI default root is `.agent-working-group/` in the current directory.

Current helper behavior:

- `scripts/awg-executor-bridge.sh`: requires an explicit `AWG_ROOT` value.
- `scripts/awg-pr-review-request.sh`: requires an explicit `AWG_ROOT` value.
- `scripts/awg-safe-poll.sh`: defaults `AWG_ROOT` to `.agent-working-group` under the current directory.
- `scripts/awg-worker-loop.sh`: defaults `AWG_ROOT` to `.agent-working-group` under the current directory.
- `scripts/awg-worker-tmux.sh`: defaults `AWG_ROOT` to `.agent-working-group` under the current directory.
- `scripts/awg-queue-reconciliation-report.sh`: supports unset `AWG_ROOT` and lets the AWG CLI use its default root.
- `scripts/awg-worker-state-report.sh`: supports unset `AWG_ROOT` and lets the AWG CLI use its default root.

All current helpers quote `"$AWG_CLI"`. Keep that pattern for future helpers.

## Operating Decision

Choose the worker mode before starting automation:

- **Manual or no worker:** default for planning, review, artifact-only, and office workflows. Use queue notifications and human or agent sessions to claim work explicitly.
- **Bounded worker:** default when a queue runner should process routine messages. Use explicit stop conditions, duplicate-worker protection, status reporting, and stale recovery review.
- **Always-on worker:** production operation only. Require a separate operating decision that names the owner, queue, restart policy, monitoring, recovery procedure, and shutdown path.

Do not let a notification bridge become an implicit worker. A notifier may wake a recipient, but a worker owns queue consumption and acknowledgement.

## Direct-Work Closeout

When an operator or chat session handles a queued item directly instead of through a worker loop, the queue lifecycle still needs an explicit closeout step. Before reporting the task as done, either:

- acknowledge the specific inbox item through `scripts/awg-reconcile-ack-pending.sh` with a PR, close report, or audit artifact as evidence, or
- leave it pending intentionally and record why it still needs a worker or reviewer.

Do not rely on chat replies, PR comments, or human memory to clear queue state. If work was completed outside `recv`, the corresponding inbox item remains pending until a reviewed `ack-pending` reconciliation moves it to `processed/`.

## Bounded Default

Bounded operation is the default when an operator chooses a worker. Do not run an always-on worker without an explicit operating decision.

Recommended defaults:

```bash
export WORKER=worker
export LEAD=lead
export MAX_TASKS=25
export MAX_IDLE_SECONDS=1800
export REPORT_STATUS=1
export MAX_RECV_ERRORS=3
scripts/awg-worker-tmux.sh start
```

Important bounds:

- `MAX_TASKS` stops the loop after a fixed number of acknowledged messages.
- `MAX_IDLE_SECONDS` stops the loop after no messages are received for that many seconds. The timer resets after each received message.
- `REPORT_STATUS=1` sends start/stop status messages to `LEAD`; set `0` for quiet operation.
- `MAX_RECV_ERRORS=3` stops after repeated real `recv` failures. Timeouts with no messages are not counted.
- `AWG_REPORT_TARGET=<target>` scopes `recv`, `status`, and bounded helper startup checks to queue messages whose `refs.reportTarget` matches that target. Non-matching messages stay pending for another worker/session.
- `MAX_RECV_ERRORS=0` disables recv-error shutdown. Use it only intentionally because a broken `awg` command can loop on errors until another bound, such as `MAX_IDLE_SECONDS`, stops the worker.

## Instruction Auto-ack Risk

The generic worker loop is a queue runner, not an AI executor. It acknowledges every supported message kind after logging it, including `instruction`. Executor-aware worker loops (Codex, Claude Code) are different: they use the executor bridge and acknowledge only after structured success from the adapter.

While a bounded worker is active, send operational `note`, `status`, or `question` messages to it. Do not send new `instruction` messages unless you intentionally want the queue runner to acknowledge them without doing the work. Stop the worker and handle instructions directly when real task execution is required.

The loop prints a warning when it receives an `instruction`, but the message is still acknowledged by design.

## Duplicate Worker Safety

The loop creates a per-worker lock directory at:

```text
<AWG_ROOT>/tmp/locks/<WORKER>-worker-loop.lockdir
```

If the lock already exists, the loop exits with code `70`. The tmux helper refuses to start when the lock exists and exits with code `71` so operators can inspect the state first.

## Shutdown Reporting

With `REPORT_STATUS=1`, the worker sends status messages for startup and shutdown. Shutdown reasons include:

- `max tasks`
- `idle timeout`
- `signal`
- `recv errors`

The tmux helper records pre-start `awg status --as=$WORKER` output in the worker log before launching so the initial pending and processing counts are visible during debugging.

## mktemp Portability

The worker uses a macOS/BSD-compatible pattern:

```bash
tmp_base=$(mktemp "${LOG_DIR}/${WORKER}.msg.XXXXXX")
tmp_msg="${tmp_base}.json"
mv "$tmp_base" "$tmp_msg"
```

Do not place the final extension after the random marker in the `mktemp` template. Some implementations can treat that suffix pattern differently and leave literal template text in the filename.

## Safe-poll Coexistence

`scripts/awg-safe-poll.sh` is an observer. It does not call `recv` and does not touch the worker inbox.

Safe uses:

```bash
scripts/awg-safe-poll.sh
REQUEUE_STALE=1 STALE_SECONDS=600 scripts/awg-safe-poll.sh
SEND_REMINDER=1 scripts/awg-safe-poll.sh
```

Rules:

- `status` is safe while a worker is active.
- `requeue-stale` is safe only with a conservative threshold higher than expected worker ack latency, such as `STALE_SECONDS=600`.
- reminders go to `LEAD` as `note` messages and do not consume worker messages.
- never use a scheduler that calls `recv` unless it is the real processor for those messages.

## Worker State Report

Use `scripts/awg-worker-state-report.sh --role <role>` when an operator needs a read-only readiness snapshot before starting or assigning work. The helper observes one role with non-consuming commands (`status`, `peek`, `processing`, and `dead`) and prints counts, message summaries, and one advisory category.

Advisory categories:

- `idle`: no pending, processing, or dead messages are observed.
- `ready-to-claim`: pending messages exist and no processing or dead messages are observed.
- `active-processing`: processing messages exist, so a worker may already own work.
- `dead-letter-review`: dead-letter messages exist and need operator review.

The category is not queue authority. It must not be used to decide completion, supersession, acknowledgement, retry, cleanup, routing, or access control. message.id remains the canonical message identity, and processing/ remains the only durable active claim-like queue state.

## Cleanup

The worker writes generated logs under `<AWG_ROOT>/log/worker-sessions/` and lock directories under `<AWG_ROOT>/tmp/locks/`. Use `awg cleanup-artifacts --dry-run` before deleting generated worker clutter. Cleanup must not delete queue JSON directly.

## Run Summaries

The worker loop may write one JSON summary per run under `LOG_DIR/run-summaries`. Status reports `latest_summary=PATH` when a summary exists, or `latest_summary=none` before the first summary. This is an inspection artifact only; it does not change queue acknowledgement or retry behavior. Summary files, logs, and status pointers are not authority for `ack`, `ack-pending`, `retry`, `nack`, `requeue-stale`, `prune`, deletion, routing, or direct queue JSON edits. Before any reviewed-item mutation, re-read live queue state, compare expected metadata such as kind, from, to, and createdAt, and fail closed on drift without moving the message.
