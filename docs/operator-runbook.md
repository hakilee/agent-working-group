# Operator Runbook

This runbook describes the workflow that ships with Agent Working Group from a clean clone. It avoids private local paths, private agent names, provider credentials, and notification-surface assumptions.

## What The Repository Provides

- A Python package with the `awg` console command.
- File-backed queues under an operator-selected `AWG_ROOT`.
- Message lifecycle commands: `send`, `recv`, `ack`, `ack-pending`, `retry`, `nack`, `requeue-stale`, inspection commands, pruning, and cleanup.
- Worker helper scripts for bounded local loops and tmux sessions.
- Public workflow docs, safety policies, review templates, and reconciliation guidance.

## What Operators Must Provide

- Agent role names that fit their team, such as `lead`, `reviewer`, and `worker`.
- A queue root path suitable for their environment.
- Any notification surface or issue tracker used to announce work.
- Runtime-specific scheduler, webhook, or delivery adapter configuration.
- Credentials for external systems, kept outside AWG messages and outside this repository.
- Artifact storage conventions for task specs, QA results, close reports, and audits.

## Clean Clone Setup

```bash
git clone https://github.com/OWNER/agent-working-group
cd agent-working-group
python3 -m pip install -e .
awg --help
```

To run without installing:

```bash
PYTHONPATH=src python3 -m agent_working_group.cli --help
```

Choose a queue root explicitly:

```bash
export AWG_ROOT=/tmp/awg-example
awg init --agent lead --agent reviewer --agent worker
```

## Queue Partitioning

Default to one queue per role. Treat notification surfaces and issue trackers as intake or reporting surfaces, not as default queue partitions.

Use optional refs to keep cross-surface and workstream context visible. This metadata is traceability-only: it does not change delivery order, queue selection, routing, or access control.


```bash
awg send \
  --from lead \
  --to reviewer \
  --kind instruction \
  --body "Review the implementation and report blockers." \
  --correlation-id task-123 \
  --source-channel work-intake \
  --report-target work-updates \
  --repo example/project \
  --workspace project-main
```

Split queues by repository or workstream when substantial concurrent work needs separate lifecycle ownership. Split by surface only when privacy, audience, retention, or permission boundaries require it.

## Manual Lead And Reviewer Loop

1. Lead creates a bounded task spec and sends it as an `instruction`.
2. Reviewer receives with `recv --require-ack` only when ready to own that message.
3. Reviewer returns `status`, `question`, `blocker`, or a review result with concrete evidence.
4. Lead verifies the result independently before closing or publishing.
5. Reviewer or lead acknowledges completed work with `ack` after `recv --require-ack`.
6. For reviewed historical inbox items, use `ack-pending` only with explicit per-item evidence and expected metadata.

## Bounded Worker Scripts

The helper scripts are optional. They are useful when an operator wants a bounded local queue runner.

```bash
AWG_ROOT=/tmp/awg-example \
WORKER=reviewer \
LEAD=lead \
MAX_TASKS=3 \
MAX_IDLE_SECONDS=300 \
scripts/awg-worker-loop.sh
```

For tmux:

```bash
AWG_ROOT=/tmp/awg-example \
WORKER=reviewer \
LEAD=lead \
SESSION=awg-reviewer \
MAX_TASKS=3 \
MAX_IDLE_SECONDS=300 \
scripts/awg-worker-tmux.sh start
```

The worker loop is a queue runner, not an AI executor. Do not send `instruction` messages to an active queue runner unless acknowledging without execution is intentional. Use the executor bridge docs for opt-in execution adapters.

## Review And Publish Gate

For code or documentation changes:

1. Define scope and exit criteria.
2. Implement the smallest safe change.
3. Update docs and tests in the same slice.
4. Run verification from the repository root.
5. Request independent review through the queue.
6. Fix findings and rerun verification.
7. Publish only after evidence is captured.
8. Write a close report with merged change, tests, queue messages handled, and remaining risks.

Keep public pull request comments generic and repository-relative. Do not include private local paths, credentials, runtime deployment details, or notification-surface details.

## Artifacts

A simple artifact layout works well:

```text
ops-artifacts/
  active/      # in-progress specs, checklists, and results
  completed/   # closed work with evidence
  archive/     # older retained artifacts
```

Use accurate timestamped Markdown filenames such as `YYYYMMDDHHMM-short-description.md`. Move completed artifacts from `active/` to `completed/`; do not delete evidence unless a separate retention policy says to.

## Related Docs

- [Examples](../examples/README.md)
- [Queue-First Workflow](queue-first-workflow.md)
- [Working-Group Queue Protocol](protocol.md)
- [Python API Reference](api.md)
- [Worker Operations](worker-operations.md)
- [PR Review Gate](pr-review-gate.md)
- [Artifact Retention](artifact-retention.md)
- [Queue Inbox Reconciliation](queue-reconciliation.md)
- [Queue Notifier](queue-notifier.md)
- [Runtime-Neutral Notifier Contract](runtime-neutral-notifier-contract.md)
- [Spec Matrix](spec-matrix.md)
