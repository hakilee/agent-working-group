# Runtime-Neutral Notifier Contract

This contract defines the portable boundary for queue notification adapters. It is for operators who want the same AWG queue-notification semantics across different schedulers, chat tools, local agents, or webhook systems without making any one runtime part of the repository default.

## Scope

A runtime-neutral notifier has two parts:

- **Queue observer:** reads pending queue state and builds notification events.
- **Delivery adapter:** sends or displays those events through an operator-approved surface.

The observer and adapter may run in one wrapper, but they must keep the queue lifecycle boundary explicit.

## Observer Rules

The observer may:

- inspect pending work with `peek` or read-only status commands
- read message metadata such as `id`, `kind`, `from`, `to`, `refs.workId`, and a short summary
- write adapter-local duplicate-suppression state

The observer must not:

- call `recv`, `ack`, `ack-pending`, `retry`, `nack`, `prune`, or `requeue-stale`
- execute queued work
- edit, move, delete, or rewrite queue JSON directly
- treat notifier state, logs, scheduler output, or provider message ids as queue authority

## Event Shape

Provider-neutral notification payloads should use this event identity:

```json
{
  "eventType": "awg.notifier.pending.v1",
  "idempotencyKey": "reviewer:MESSAGE_ID",
  "role": "reviewer",
  "messageId": "MESSAGE_ID",
  "workId": "optional-work-id",
  "summary": "short human-readable summary",
  "text": "operator-facing notification text"
}
```

Rules:

- `eventType` identifies the notification contract version.
- `messageId` remains the AWG queue message identity.
- `idempotencyKey` should be `<role>:<messageId>` so adapters can suppress duplicates without changing queue state.
- `workId` is traceability-only and may be absent.
- `text` is presentation data, not an instruction to execute.

## Recording Semantics

Record duplicate-suppression state only after the selected delivery semantics are acceptable.

Recommended modes:

- **Dry-run or manual preview:** emit events and do not record.
- **Confirmed delivery wrapper:** send successfully, then record the emitted `idempotencyKey` or message id.
- **Best-effort scheduler:** record during the scheduler tick only when missed downstream delivery is an accepted and documented risk.

Deleting notifier state may duplicate alerts. It must not affect whether work exists, is claimed, or is complete.

## Runtime Boundary

Repository docs and helper scripts should stay runtime-neutral:

- no private agent names
- no private local paths
- no provider credentials, tokens, or webhook URLs
- no channel ids, user ids, or mention syntax in reusable examples
- no installed scheduler configuration as a repository default

Runtime-specific deployments belong in local operations artifacts. A repository may document example patterns, but installing a scheduler, enabling provider delivery, or cutting over from shadow mode is an operator decision with separate approval and evidence.

## Shadow And Cutover

A new runtime adapter should start in shadow mode:

1. Run the observer with no queue mutation and no production send.
2. Compare emitted events with queue state.
3. Verify duplicate suppression with a temporary or isolated state file.
4. Prove queue counts do not change.
5. Document failure behavior, retry behavior, and where secrets live.
6. Enable production delivery only after explicit approval.

Shadow-mode success does not imply approval for production delivery, webhook POSTs, queue execution, or replacing an existing notifier.

## Related Helpers

- `scripts/awg-queue-notifier.sh` observes pending queue items.
- `scripts/awg-queue-notifier-dispatch.sh` emits provider-neutral delivery payloads with `awg.notifier.pending.v1` identity.
- `scripts/awg-queue-notifier-sample-run.sh` demonstrates one safe no-install scheduler tick.

For scheduler safety, see [Safe Scheduling](safe-scheduling.md). For adapter payloads, see [Queue Notifier Adapters](queue-notifier-adapters.md).
