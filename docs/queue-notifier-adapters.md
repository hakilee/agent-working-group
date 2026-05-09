# Queue Notifier Adapters

Queue notifier adapters turn read-only queue notification data into an operator-approved delivery action. They are intentionally separate from AWG queue authority.

The core rule is: **detect first, deliver outside the queue, record only after the chosen delivery semantics are acceptable.**

## Responsibility Split

- `scripts/awg-queue-notifier.sh` detects pending inbox items with `peek` and can maintain local duplicate-suppression state.
- `scripts/awg-queue-notifier-dispatch.sh` converts notifier output into provider-neutral delivery payloads.
- A site-local adapter may send those payloads to a configured delivery surface.
- The AWG queue remains the source of truth for task identity and lifecycle.

The dispatch helper does not send messages, call webhooks, or talk to provider APIs. It only prints JSON or text payloads that another approved tool can consume.

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

The default is no-record mode. This avoids marking an item as notified when the downstream delivery adapter has not actually delivered anything.

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

## Scheduler Pattern

A periodic scheduler can safely run the dispatch helper because it does not call consuming queue commands.

Before enabling a scheduler:

1. Run the dispatch helper manually with `--format json`.
2. Confirm the output contains the expected `messageId`, `workId`, role, destination, and text.
3. Confirm no queue counts changed except optional notifier-state behavior when `--record` is intentionally used.
4. Connect a site-local delivery adapter.
5. Document the scheduler interval, role map path, notifier state path, logs, and failure behavior.

Installing or enabling the actual scheduler is an operations decision, not a repository default.

## Safety Rules

Adapters and schedulers must not:

- consume queue items
- acknowledge or retry work
- edit queue JSON directly
- execute task bodies
- treat notification state as queue state
- embed provider credentials in repository files

If a team wants automatic execution, use a bounded worker design instead of extending the notifier adapter.
