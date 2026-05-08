# Queue Inbox Reconciliation

Queue reconciliation is the operator process for deciding what to do with old inbox messages that may be superseded by completed work. It is not a cleanup job, not an observer loop, and not a replacement for normal worker processing.

This policy is intentionally advisory. It defines the evidence required before a future queue-aware action can be considered, but it does not add an enforcement gate or change queue behavior.

## Core Rule

Observe first, classify second, mutate only after an explicit operator decision.

A message in `queues/<role>/inbox/` remains active work until there is evidence that it is superseded or completed. Age alone is not enough. A message that looks stale but has no evidence stays `unknown` and must not be consumed by cleanup tooling.

## Evidence Gates

Before any future reconciliation action is permitted, the operator must link the inbox item to at least one concrete evidence source:

- a completed or archived operational artifact that clearly covers the request
- a merged pull request connected to the request
- a close report showing completion, verification, and remaining risk

If none of those links exists, the item stays active or unknown. Do not infer completion only from a short notification, a filename that looks similar, or the message age.

## Classification

Use these categories when reviewing one queue at a time:

- `active`: the message still needs a worker, reviewer, or lead decision
- `superseded`: completion evidence exists and points to a later artifact, merged change, or close report
- `unknown`: the message may be old, but the evidence is missing or ambiguous

Only `superseded` items are candidates for a future explicit reconciliation action. `active` and `unknown` items stay in place.

## Safe Observation

Observation must use non-consuming commands only, such as:

```bash
awg status --as=<role>
awg pending --as=<role>
awg peek --as=<role>
awg processing --as=<role>
awg dead --as=<role>
awg log
```

For reconciliation review, `recv` is unsafe because it consumes work. Default `recv` moves a message out of `inbox/`, and `recv --require-ack` moves it into `processing/`. Those operations are correct only when a real processor owns the output and will complete the message lifecycle.

## Prohibited Actions

Reconciliation must not do any of the following:

- bulk acknowledge or bulk consume all inbox messages
- call `recv` only to inspect or clean up messages
- move, edit, or delete queue JSON files directly
- delete queue state
- use direct filesystem moves inside `queues/<role>/...`
- treat old age as completion evidence

Queue state must move only through queue-aware commands, and any future mutation policy needs its own scope, checklist, tests, and operator approval.

## Public-Safe Reporting

Use role names and generic queue structure in public docs and reports:

- `lead`, `worker`, `reviewer`, `observer`
- `queues/<role>/inbox/`, `processing/`, `processed/`, `dead/`

Do not include local absolute paths, private agent names, chat identifiers, credentials, or hidden workspace details in public artifacts.

## Read-Only Report Helper

Use the optional helper when an operator needs a queue-state-only snapshot for one role:

```bash
scripts/awg-queue-reconciliation-report.sh --role <role>
```

The helper is read-only. It reports `inbox`, `processing`, and `dead` messages with `id`, `kind`, `from`, `to`, and `created` fields. It does not accept evidence paths, does not classify messages as superseded, and does not decide whether reconciliation is safe. The operator still applies the evidence gates manually.

The helper must not call `recv`, `ack`, `retry`, `nack`, `requeue-stale`, or `prune`. It must not move, edit, or delete queue JSON files.

## Future Helper Boundary

A future helper may be useful if it remains read-only and scoped to one role at a time. The first helper should list and categorize messages without changing queue state. Mutation, including `ack`, `retry`, `nack`, `requeue-stale`, or archive movement, must remain a separate slice with its own checklist.
