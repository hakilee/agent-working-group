# Artifact Retention

Use this guide for operational Markdown artifacts produced by Agent Working Group workflows: task specs, QA requests, review results, implementation reports, PR comment drafts, and close reports.

This is separate from queue retention. Queue JSON files are live coordination state and must be managed with queue-aware commands such as `ack`, `retry`, `prune`, and `cleanup-artifacts`.

## Neutral Workspace

Use a neutral operations workspace for shared artifacts. Do not use a reviewer-specific or worker-specific folder as the default source of truth.

Recommended structure:

```text
awg-ops/
  active/
  completed/
  archive/
```

- `active/`: current specs, QA requests, implementation reports, and review results that are still part of open work.
- `completed/`: closed work artifacts kept for audit and future handoff.
- `archive/`: older completed artifacts retained but no longer part of routine review.

Use repository-relative paths or deployment-specific configuration to choose where this workspace lives. Public docs should not assume a local absolute path.

## Allowed Base For Artifact Automation

Artifact automation should treat the artifact workspace root as an explicit allowed base. Operators or configuration choose that base; helpers should not infer it from the current working directory.

For the structure above, the allowed base is the `awg-ops/` directory. `active/`, `completed/`, and `archive/` are valid artifact targets only when their resolved paths remain inside that base. Queue directories are live coordination state and are never valid artifact targets.

If a future helper receives an allowed base and a source or destination path, it should fail closed when the allowed base is missing or invalid, then verify containment before writing or moving files. Use the path safety guidance in [Path Safety](path-safety.md) for traversal, symlink escape, and sibling-prefix protections.

This policy does not make artifact movement automatic. Moving a close report from `active/` to `completed/` remains an operator decision unless a future workflow explicitly scopes and tests automation for that action. Deletion remains an explicit exception, not a default cleanup behavior.

## Timestamped Filenames

Name new Markdown artifacts with a local or agreed project timestamp:

```text
YYYYMMDDHHMM-short-description.md
```

Examples:

```text
202605081212-artifact-retention-scope.md
202605081245-pr-review-result.md
```

The timestamp makes creation order visible even when files move between `active/`, `completed/`, and `archive/`.

## Lifecycle

1. Create new shared specs and QA requests in `active/`.
2. Keep implementation results and review results in `active/` while the task is still open.
3. When the task closes, move the related artifacts to `completed/`.
4. Move older completed artifacts to `archive/` only through an explicit retention policy.
5. Delete artifacts only when an explicit retention rule says deletion is safe.

Archive is the default cleanup action for completed work. Deletion is an exception.

## What This Does Not Clean

Do not use this artifact lifecycle for queue state:

```text
<AWG_ROOT>/queues/<agent>/inbox/*.json
<AWG_ROOT>/queues/<agent>/processing/*.json
<AWG_ROOT>/queues/<agent>/processed/*.json
<AWG_ROOT>/queues/<agent>/dead/*.json
```

Use queue-aware commands instead:

- `ack`, `retry`, and `nack` for processing messages
- `requeue-stale` for stale processing recovery
- `prune` for processed queue/log retention
- `cleanup-artifacts --dry-run` for generated worker clutter

`prune` archives queue/log data. `cleanup-artifacts` removes generated worker temp files and stale empty lock directories. Neither command is a Markdown close-report organizer.

## Public-Safe Artifacts

Operational artifacts may later be copied into public documentation, pull request comments, or issue comments. Keep them safe by default:

- use role names such as `lead`, `worker`, and `reviewer`
- avoid private agent names
- avoid private chat references
- avoid local absolute paths
- avoid credentials, secrets, and hidden workspace details

## Helper Script

`scripts/awg-archive-artifact.sh` is an optional helper for moving one artifact into `completed/` or `archive/`. It is dry-run by default and never deletes files.

Use it to make artifact movement explicit:

```bash
scripts/awg-archive-artifact.sh --source awg-ops/active/202605081212-example.md --completed-dir awg-ops/completed
scripts/awg-archive-artifact.sh --source awg-ops/active/202605081212-example.md --completed-dir awg-ops/completed --apply
```

The helper requires an explicit source and destination directory. It creates the destination directory if needed.

### Path Safety Integration

The archive helper is intentionally kept as a small bash script. It is not wired directly to the Python path-safety module because that would require a shell-to-Python bridge or a script rewrite, and this helper must preserve current valid usage.

For custom archive helpers or future revisions that add explicit allowed-base options, use the path safety guidance in [Path Safety](path-safety.md). A code-level integration should include tests for:

- valid source and destination behavior staying compatible
- `..` traversal rejection
- symlink escape rejection
- destination containment
- queue JSON preservation

Do not add implicit containment around the current working directory. If containment is needed, expose the allowed base explicitly so operators can choose the artifact workspace boundary.
