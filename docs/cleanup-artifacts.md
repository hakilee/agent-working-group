# Cleanup Artifacts

`awg cleanup-artifacts` removes generated worker clutter without touching queue state.

Use it for files created by smoke tests, worker sessions, and stale worker locks. Do not use raw filesystem cleanup for queue messages.

## Quick Start

Preview cleanup candidates first:

```bash
awg cleanup-artifacts --dry-run
```

Remove eligible artifacts after reviewing the dry-run output:

```bash
awg cleanup-artifacts
```

The command uses the same root selection as the rest of `awg`:

```bash
awg --root /path/to/.agent-working-group cleanup-artifacts --dry-run
```

## What It Can Remove

The command only targets generated artifacts:

- old worker temp files under `log/worker-sessions/`
- empty stale worker lock directories under `tmp/locks/`

Worker temp files must be older than `--temp-file-min-age-sec` before they become candidates. The default is `3600` seconds.

Worker lock directories must be older than `--stale-lock-min-age-sec` before they become candidates. The default is `600` seconds.

```bash
awg cleanup-artifacts --dry-run --temp-file-min-age-sec 7200 --stale-lock-min-age-sec 1800
```

## What It Never Removes Directly

Queue JSON files are live coordination state. `cleanup-artifacts` reports how many queue JSON files it preserved, but it does not select them for raw deletion.

Never delete these paths with generic cleanup scripts:

- `queues/<agent>/inbox/*.json`
- `queues/<agent>/processing/*.json`
- `queues/<agent>/processed/*.json`
- `queues/<agent>/dead/*.json`
- `log/messages.jsonl`

Use queue-aware commands instead:

- `awg requeue-stale` for stale `processing/` messages
- `awg ack`, `awg retry`, or `awg nack` for in-flight messages
- `awg prune` for processed message and log retention

## Stale Lock Handling

There are two lock families:

- Queue lock files: `tmp/locks/<agent>.lock`
- Worker lock directories: `tmp/locks/<agent>-worker-loop.lockdir`

Queue lock files are normal and can remain after successful queue operations. Do not delete them just because they exist.

Worker lock directories are different: a stale one can block worker startup. `cleanup-artifacts` only considers empty worker lock directories that are older than the configured threshold.

If a worker lock directory is not empty, the command marks it for manual review and refuses to escalate to recursive deletion. This keeps `rm -rf` out of the cleanup path.

## Dry-Run Output

The command returns JSON:

```json
{
  "dryRun": true,
  "candidates": ["..."],
  "removed": [],
  "preserved": [
    {"path": "...", "reason": "worker lock directory is too new"}
  ],
  "manualReview": [
    {"path": "...", "reason": "worker lock directory is not empty; refusing rm -rf"}
  ],
  "queueJsonPreserved": 4
}
```

Fields:

- `candidates`: artifacts that would be removed, or were eligible for removal
- `removed`: artifacts removed during non-dry-run execution
- `preserved`: artifacts intentionally kept with a reason
- `manualReview`: artifacts that need a human decision
- `queueJsonPreserved`: queue JSON files observed and protected from raw cleanup

## Required Safety Tests

Before changing cleanup behavior, run tests that prove queue state is preserved:

1. Create a test root.
2. Put one message in each queue state: `inbox`, `processing`, `processed`, and `dead`.
3. Create an old worker temp file.
4. Run `awg cleanup-artifacts --dry-run`.
5. Verify the temp file is a cleanup candidate.
6. Verify no queue JSON file is a cleanup candidate.
7. Verify all four queue state files still exist.

Also test worker lock handling:

- stale empty worker lock directory becomes a candidate
- fresh worker lock directory is preserved
- non-empty stale worker lock directory goes to `manualReview`

These tests are part of the project test suite.

## Safety Rule

Observers and cleanup jobs must not consume messages. `cleanup-artifacts` must never call `recv` or move queue JSON files directly.
