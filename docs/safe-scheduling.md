# Safe Scheduling

Scheduled jobs are useful for observing queues, sending reminders, and recovering stale work. They are also one of the easiest ways to lose tasks if they consume messages without a real processor attached.

The rule is simple: observers never consume.

## Problem

`recv` is a consuming claim operation. It moves a message from `inbox/` to `processing/` and leaves it there until `ack`, `retry`, or `nack` is called.

That behavior is correct when an agent or worker process is ready to handle the received message and complete the lifecycle. It is unsafe when a cron job, timer, or watchdog calls `recv` only to print the message to logs.

A scheduler that claims without processing creates stuck work: the queue says the message is running, but no processor owns the task. Stale recovery may eventually requeue or dead-letter it even though no real processing happened.

## Safe Pattern

Scheduled observers should use non-consuming commands:

- `status --as=<agent>` reads queue counts and timestamps.
- `pending --as=<agent>` counts inbox messages.
- `peek --as=<agent>` lists inbox messages without moving them.
- `processing --as=<agent>` lists unacknowledged messages.
- `dead --as=<agent>` lists dead-lettered messages.
- `log --tz=<zone>` reads append-only message history.
- `send --kind=note` can notify a lead about pending work.
- `requeue-stale --as=<agent>` can recover stale processing messages when retry limits are configured.

A safe observer can check state, send a rate-limited reminder, and requeue stale work without consuming new instructions. The repository includes `scripts/awg-safe-poll.sh` as a generic template for this pattern.

```bash
#!/usr/bin/env bash
set -euo pipefail

worker_pending=$(awg pending --as=worker)

awg status --as=worker --tz=UTC
awg status --as=lead --tz=UTC

if [ "$worker_pending" -gt 0 ]; then
  awg send --from=observer --to=lead --kind=note \
    --body="reminder: worker has $worker_pending pending messages"
fi

awg requeue-stale --as=worker --older-than-sec=600 --max-retries=3
```

Rate-limit reminder messages with a timestamp file, scheduler state, or an external notification policy. A reminder loop that sends a new note every tick can bury the real work it is trying to protect.

## Unsafe Pattern

Never schedule `recv` unless a real processor owns the output and completes the task lifecycle.

```cron
# UNSAFE: claims messages without processing them.
*/5 * * * * awg recv --as=worker --timeout=0
```

This job moves work from `inbox/` to `processing/`, writes the JSON to cron output, and then exits. If no agent reads and acts on that output, the task is stuck until stale recovery requeues or dead-letters it.

`recv` is safe only when the same worker path owns the message output and later calls `ack`, `retry`, or `nack`.

## Verification

Before scheduling any observer script:

1. Confirm it does not call `recv`.
2. Run it manually once.
3. Compare `pending`, `processing`, and `processed` counts before and after.
4. Confirm any reminder is rate-limited.
5. Confirm stale recovery uses an explicit retry limit.

A simple check is:

```bash
grep -c 'recv' ./safe-observe.sh
```

Expected result: `0`.

If a scheduled job must call `recv`, document the attached processor, its log path, its stop condition, and how it calls `ack`, `retry`, or `nack`. Treat that scheduler as a worker decision, not as an observer. See [Worker Operations](worker-operations.md#operating-decision) before enabling it.

Do not use cron/systemEvent reminders as the completion detector for tmux-driven implementation work. Use `scripts/tmux-completion-watcher.sh` from [Reliable AWG Runtime](reliable-awg-runtime.md) so completion state is tied to a run-scoped marker and durable status files.


## Queue Notification Scheduling

Use a periodic read-only notifier when queue recipients may miss send-time notifications. The notifier should inspect pending inbox items and emit provider-neutral notification data. A dispatch helper can produce adapter payloads without sending externally or marking notifications as delivered. Record local duplicate-suppression state only when the chosen delivery semantics are acceptable. Runtime-specific schedulers and delivery adapters should start in shadow mode and stay outside repository defaults until explicitly approved. The notifier path must not receive, acknowledge, retry, prune, recover, execute, or edit queue JSON. See [Queue Notifier](queue-notifier.md), [Queue Notifier Adapters](queue-notifier-adapters.md), [Runtime-Neutral Notifier Contract](runtime-neutral-notifier-contract.md), and [Queue Notifier Scheduler Sample](queue-notifier-scheduler-sample.md).
