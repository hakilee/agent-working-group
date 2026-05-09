# Artifact Index

`awg-artifact-index.sh` builds a read-only index for an AWG operations artifact workspace.

Use it when `active/`, `completed/`, and `archive/` contain enough Markdown artifacts that manual evidence lookup becomes slow.

## Usage

```bash
scripts/awg-artifact-index.sh --root awg-ops
scripts/awg-artifact-index.sh --root awg-ops --format json
scripts/awg-artifact-index.sh --root awg-ops --limit 25
```

The helper writes only to stdout. Redirect output yourself if you want to keep a snapshot:

```bash
scripts/awg-artifact-index.sh --root awg-ops > awg-ops/artifact-index.md
```

## Root Shape

The root must be an artifact workspace with at least one of these directories:

```text
active/
completed/
archive/
```

Each Markdown file under those directories becomes one index item. The helper records:

- relative path
- status from the containing directory
- task name inferred from the filename
- creation time inferred from `YYYYMMDDHHMM-*.md` when present
- file size and modification time in JSON output
- first Markdown heading as the note/title

## Safety

This is discovery tooling, not retention enforcement.

The helper must not:

- delete, move, archive, or edit artifacts
- inspect or mutate AWG queue JSON
- install schedulers or workers
- send notifications or call external providers

The helper refuses roots that point inside `.agent-working-group` or `queues` because queue files are live coordination state, not Markdown artifacts.

Use [Artifact Retention](artifact-retention.md) for lifecycle policy and [Queue Inbox Reconciliation](queue-reconciliation.md) for queue state decisions.
