# Worker Operations

This guide describes the optional bounded worker scripts in `scripts/`. They are generic queue runners for Agent Working Group. They do not run an AI model and they do not execute message bodies as commands.

## Scripts

- `scripts/awg-worker-loop.sh`: receive one message at a time with `recv --require-ack`, log it, and acknowledge it.
- `scripts/awg-worker-tmux.sh`: start, inspect, stop, or recover a bounded worker loop inside tmux.
- `scripts/awg-safe-poll.sh`: inspect status and optionally requeue stale processing messages without consuming the inbox.
- `scripts/awg-codex-worker-loop.sh`: run the executor bridge with the Codex adapter under manual bounded limits.
- `scripts/awg-codex-worker-tmux.sh`: start, inspect, stop, or recover a bounded Codex worker loop inside tmux.
- `scripts/awg-worker-state-report.sh`: print a read-only worker state and claim-readiness snapshot for one role.

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

## Bounded Default

Bounded operation is the default. Do not run an always-on worker without an explicit operating decision.

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
- `MAX_RECV_ERRORS=0` disables recv-error shutdown. Use it only intentionally because a broken `awg` command can loop on errors until another bound, such as `MAX_IDLE_SECONDS`, stops the worker.

## Instruction Auto-ack Risk

The generic worker loop is a queue runner, not an AI executor. It acknowledges every supported message kind after logging it, including `instruction`. The Codex worker is different: it uses the executor bridge and acknowledges only after structured success from the Codex adapter.

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

Use `scripts/awg-worker-state-report.sh --role <role>` when an operator needs a read-only claim-readiness snapshot before starting or assigning work. The helper observes one role with non-consuming commands (`status`, `peek`, `processing`, and `dead`) and prints counts, message summaries, and one advisory category.

Advisory categories:

- `idle`: no pending, processing, or dead messages are observed.
- `ready-to-claim`: pending messages exist and no processing or dead messages are observed.
- `active-processing`: processing messages exist, so a worker may already own work.
- `dead-letter-review`: dead-letter messages exist and need operator review.

The category is not queue authority. It must not be used to decide completion, supersession, acknowledgement, retry, cleanup, routing, or access control. message.id remains the canonical message identity, and processing/ remains the only durable active claim-like queue state.

## Cleanup

The worker writes generated logs under `<AWG_ROOT>/log/worker-sessions/` and lock directories under `<AWG_ROOT>/tmp/locks/`. Use `awg cleanup-artifacts --dry-run` before deleting generated worker clutter. Cleanup must not delete queue JSON directly.

## Codex Worker End-to-End Operator Flow

For code work, keep the Codex worker path explicit and bounded:

1. Run `scripts/awg-codex-prepare-worktree.sh --repo DIR` and confirm the target is ready. Dirty Git worktrees fail closed in the Codex adapter unless `AWG_CODEX_ALLOW_DIRTY=1` is set for an explicitly supervised exception.
2. Send an `instruction` with explicit `--repo DIR` and `--workspace DIR` refs so the adapter does not infer the target.
3. Start `scripts/awg-codex-worker-tmux.sh start` with bounds such as `MAX_TASKS=1`, `MAX_IDLE_SECONDS=900`, and a clear `SESSION` name.
4. Use `scripts/awg-codex-worker-tmux.sh status` to see session state, queue state, and `latest_summary=PATH` when a run summary exists.
5. Inspect the summary and log evidence. The summary points to `logFile` when available; otherwise use the tmux wrapper `log` command.
6. Reconcile queue state only after evidence review. Use safe reviewed-item operations, not direct queue JSON edits, and do not assume a summary or log is enough to ack, retry, or delete work.

This sequence does not create an always-on daemon, does not auto-dispatch work, and does not change queue ack/retry policy.

## Codex Worker Stale Recovery

Stale recovery for Codex worker processing items is an operator decision, not an automatic worker behavior. Follow this decision tree:

1. Check `scripts/awg-codex-worker-tmux.sh status` and confirm the session is stopped, missing, or intentionally stopped for recovery.
2. Review worker queue status and identify the exact processing item before considering any mutation.
3. Use `latest_summary=PATH` and the worker log as evidence. They do not authorize ack, retry, delete, prune, or direct queue edits by themselves.
4. Choose a conservative stale threshold that is higher than expected Codex runtime and bridge acknowledgement latency.
5. Run recovery only as an explicit operator action after review, such as `REQUEUE_STALE=1 STALE_SECONDS=1800 scripts/awg-safe-poll.sh` for a generic worker queue when the threshold and target worker are appropriate.

Do not run recovery while the tmux session may still be processing the item. Do not call `recv` for inspection, do not edit queue JSON directly, and do not bulk recover items without reviewing each affected message.

## Codex Worker Repository Preflight

Codex worker jobs should target a clean Git worktree. `scripts/awg-codex-executor.sh` checks `git status --porcelain` when the target is inside Git and returns a blocker before `codex exec` if uncommitted changes are present. Operators can set `AWG_CODEX_ALLOW_DIRTY=1` for an explicitly supervised exception.

## Codex Worker Run Summaries

The Codex worker loop writes one JSON summary per run under `LOG_DIR/run-summaries`. The file includes worker, lead, start and stop timestamps, duration, stop reason, task count, and log location. This is an inspection artifact only; it does not change queue acknowledgement or retry behavior.

Status reports `latest_summary=PATH` when a summary exists, or `latest_summary=none` before the first summary. Use this as a pointer from session status to run evidence; do not treat summary contents as worker control state.

## Codex Worker Branch and Worktree Prep

Run `scripts/awg-codex-prepare-worktree.sh --repo DIR` before dispatching a Codex job when you want an operator-facing readiness report. The default mode is read-only and reports branch, HEAD, dirty state, upstream relation when available, and readiness. Use `--branch NAME` to require a specific current branch. Use `--branch NAME --create-branch` only when you explicitly want the helper to create and switch to a new branch from a clean worktree. The helper does not commit, push, open PRs, merge, delete branches, or mutate queue JSON.
