# Queue Notifier Scheduler Sample

`awg-queue-notifier-sample-run.sh` is a no-install sample for running one queue notification check safely.

Use it before any real scheduler or delivery adapter exists. It demonstrates the operator boundary without installing timers, starting workers, or sending externally.

## Usage

```bash
scripts/awg-queue-notifier-sample-run.sh --role reviewer
scripts/awg-queue-notifier-sample-run.sh --role reviewer --format text
scripts/awg-queue-notifier-sample-run.sh --role reviewer --log-file notifier-sample.log
```

The sample calls `scripts/awg-queue-notifier-dispatch.sh` and preserves its default no-record behavior. That means it does not mark notifications as delivered before an operator-approved downstream wrapper exists.

## Local Log

`--log-file` appends the provider-neutral output to a local operator log. The log is evidence that a sample run happened; it is not queue authority and is not delivery confirmation.

Do not place the log inside queue directories. Queue state remains authoritative only through AWG queue commands.

## Approval Boundary

The sample is safe to run manually because it is one-shot and local-only.

Separate approval is required before adding any of these around it:

- installed timer configuration
- always-on process supervision
- provider delivery adapter
- external notification send
- queue-consuming worker

## Safety

The sample must not:

- send externally
- execute queued work
- change queue lifecycle state
- edit queue JSON directly
- mark notifier state by default

Use [Queue Notifier](queue-notifier.md) for the read-only notifier, [Queue Notifier Adapters](queue-notifier-adapters.md) for provider-neutral payloads, [Runtime-Neutral Notifier Contract](runtime-neutral-notifier-contract.md) for event identity and shadow-mode boundaries, and [Safe Scheduling](safe-scheduling.md) for observer rules.
