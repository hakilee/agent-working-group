# Queue Notifier

AWG queues are durable inboxes, not wake-up channels. Sending an `instruction` to another role stores the work, but it does not guarantee that the recipient notices immediately unless a human, agent session, worker, scheduler, or notification bridge checks that inbox.

Use a queue notifier when roles need reliable awareness without automatically consuming or executing work.

## Recommended Pattern

Keep these responsibilities separate:

- **Queue:** source of truth for task body, refs, priority, and message identity.
- **Notifier:** read-only bridge that notices new pending inbox items and emits a short notification.
- **Chat or delivery provider:** optional surface that delivers the notification to a person or agent.
- **Worker:** optional executor that consumes work; this is a separate, higher-risk decision.

Do not treat notification as completion. Notification only says that a queue item exists.

## Channel-Agnostic Delivery

The notifier is provider-neutral. It emits text or JSON that an operator can route to any configured delivery surface, such as team chat, direct message, email, webhook, or a local desktop alert.

Provider-specific mention syntax belongs in the outer delivery adapter or scheduler, not in AWG queue data. For example, one environment might map `reviewer` to a chat mention, another might map it to a mobile notification, and a local-only setup might print the notification in a terminal.

## Helper Script

`scripts/awg-queue-notifier.sh` inspects one or more role inboxes with `peek`, emits not-yet-notified pending items, and records emitted message ids in a local state file for duplicate suppression.

Example:

```bash
scripts/awg-queue-notifier.sh --role reviewer --role lead --format text
```

JSON output for an external adapter:

```bash
scripts/awg-queue-notifier.sh --role reviewer --format json
```


For provider-neutral dispatch payloads and role maps, see [Queue Notifier Adapters](queue-notifier-adapters.md).

Dry inspection without updating notification state:

```bash
scripts/awg-queue-notifier.sh --role reviewer --no-record
```

## No-Install Scheduler Sample

Use `scripts/awg-queue-notifier-sample-run.sh` for a one-shot, no-install scheduler sample. It calls the provider-neutral dispatch helper, keeps no-record behavior by default, and can append output to a local operator log when explicitly requested. It does not install timers, start workers, send externally, or consume queue work. See [Queue Notifier Scheduler Sample](queue-notifier-scheduler-sample.md).

## Safety Rules

The notifier must remain read-only with respect to queue state:

- allowed: `peek`, local notification state writes
- forbidden: `recv`, `ack`, `ack-pending`, `retry`, `nack`, `prune`, `requeue-stale`, direct queue JSON edits, deletion, or worker execution

The local notification state is not queue authority. It only suppresses duplicate alerts. If a downstream delivery fails after the notifier records an item, remove the affected id from the notifier state or run with a separate state file to retry notification.

## Scheduler Options

Choose the lightest scheduler for the environment:

- **Send-time discipline:** after `send --to ROLE`, also notify the recipient on the chosen surface with message id and work id.
- **Periodic notifier:** run the read-only notifier every few minutes and route new notifications through a provider adapter.
- **Bounded worker:** only when the role should actually execute or review work automatically; keep `MAX_TASKS` and idle limits.

For most teams, periodic notifier plus send-time discipline is safer than an always-on worker. It fixes missed wake-ups without taking ownership of the work.

## Close And Audit

When a queued task closes, the close report should record the queue message id and whether notification was manual, notifier-generated, or not applicable. This helps diagnose missed handoffs without treating chat as the source of truth.
