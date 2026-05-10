# Queue Notifier Adapters

Queue notifier adapters turn read-only queue notification data into an operator-approved delivery action. They are intentionally separate from AWG queue authority.

The core rule is: **detect first, deliver outside the queue, record only after the chosen delivery semantics are acceptable.**

## Responsibility Split

- `scripts/awg-queue-notifier.sh` detects pending inbox items with `peek` and can maintain local duplicate-suppression state.
- `scripts/awg-queue-notifier-dispatch.sh` converts notifier output into provider-neutral delivery payloads.
- A site-local adapter may send those payloads to a configured delivery surface.
- The AWG queue remains the source of truth for task identity and lifecycle.

The dispatch helper does not send messages, call webhooks, or talk to provider APIs. It only prints JSON or text payloads that another approved tool can consume. JSON deliveries use the `awg.notifier.pending.v1` event identity from [Runtime-Neutral Notifier Contract](runtime-neutral-notifier-contract.md).

## Role Map Contract

Use a small JSON role map when a site wants abstract destinations in dispatch output:

```json
{
  "roles": {
    "reviewer": {
      "destination": "reviewer-alerts",
      "label": "Reviewer Alerts"
    },
    "lead": {
      "destination": "lead-alerts",
      "label": "Lead Alerts"
    }
  }
}
```

`destination` is an opaque adapter value. It might represent a team channel, direct message, webhook target, email alias, local notification profile, or another site-specific route. AWG does not interpret it.

Do not put secrets, access tokens, or private provider identifiers in public examples. Keep real maps in deployment-specific storage.

## Dry-Run Dispatch

Preview delivery payloads without updating notifier state:

```bash
scripts/awg-queue-notifier-dispatch.sh \
  --role reviewer \
  --role-map ./local-role-map.json \
  --format json
```

The default is no-record mode. This avoids marking an item as notified when the downstream delivery adapter has not actually delivered anything. Each emitted JSON delivery includes an `idempotencyKey` in the `<role>:<messageId>` form so adapters can suppress duplicate sends without treating notifier state as queue state.

Text output is useful for logs:

```bash
scripts/awg-queue-notifier-dispatch.sh --role reviewer --format text
```

## Recording Semantics

Use `--record` only when the operator accepts that emitted payloads should be treated as notified for duplicate-suppression purposes.

Recommended operating choices:

- **Manual or dry-run:** omit `--record`; nothing is marked notified.
- **Single-process adapter:** deliver successfully, then run a second explicit recording step or use an approved wrapper that records only after delivery success.
- **Best-effort scheduler:** use `--record` only if occasional missed downstream delivery is acceptable and documented.

The notifier state is not queue authority. Losing or deleting it may duplicate alerts, but it must not change whether work exists, is claimed, or is complete.

## Send-Time Adapter Pattern

A send-time adapter can notify a destination immediately after an approved queue `send` succeeds. Use this when the sender already owns the handoff and wants faster wake-up than a periodic scan.

Before using a send-time adapter for production delivery:

1. Enqueue first, then build the notification from the returned queue message id.
2. Use a stable idempotency key such as `<role>:<messageId>` so downstream retries do not create duplicate alerts.
3. Keep endpoint URLs, tokens, destination ids, and mention targets in site-local secret storage.
4. Validate the provider payload in dry-run mode before making a real delivery call.
5. Verify delivery success before claiming the handoff was notified.
6. Confirm queue counts changed only by the intentional `send`; the adapter must not consume, acknowledge, retry, recover, execute, delete, or edit queue JSON.
7. Document rollback to manual notification or a periodic read-only notifier if send-time delivery fails.

Send-time delivery reduces missed wake-ups for new work, but it does not discover already-pending inbox items. Use a periodic read-only notifier when recipients may miss work created outside the approved send-time wrapper.

### Reliability Checklist

A production send-time adapter should document one reliability policy before use:

- **Confirmed delivery:** treat the handoff as notified only after the provider returns a successful delivery result. If delivery fails after enqueue, leave the queue item untouched and fall back to manual notification or a periodic read-only notifier.
- **Duplicate suppression:** use the same idempotency key for every retry of the same queue message. Duplicate alerts are acceptable; duplicate queue sends are not.
- **Retry boundary:** retry delivery outside the queue. Do not call queue `retry`, `ack`, `ack-pending`, `nack`, `prune`, or `requeue-stale` to repair a notification failure.
- **Rollback path:** keep a documented switch back to manual notification or shadow-mode dispatch, and verify queue counts before and after rollback.
- **Evidence:** record the queue message id, idempotency key, delivery result, and fallback action in site-local operations logs.

## Scheduler Pattern

A periodic scheduler can safely run the dispatch helper because it does not call consuming queue commands.

Before enabling a scheduler:

1. Run the dispatch helper manually with `--format json`.
2. Confirm the output contains the expected `messageId`, `workId`, role, destination, and text.
3. Confirm no queue counts changed except optional notifier-state behavior when `--record` is intentionally used.
4. Connect a site-local delivery adapter.
5. Document the scheduler interval, role map path, notifier state path, logs, and failure behavior.

Installing or enabling the actual scheduler is an operations decision, not a repository default. Keep runtime-specific scheduler configuration, credentials, channel ids, user ids, and production delivery state in local operations storage rather than repository examples.

## Safety Rules

Adapters and schedulers must not:

- consume queue items
- acknowledge or retry work
- edit queue JSON directly
- execute task bodies
- treat notification state as queue state
- embed provider credentials in repository files

If a team wants automatic execution, use a bounded worker design instead of extending the notifier adapter.
