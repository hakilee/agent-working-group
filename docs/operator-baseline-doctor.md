# Operator Baseline Doctor

`awg-operator-baseline-doctor.sh` is a read-only helper for checking common AWG operating baseline signals before starting or closing a work slice.

It consolidates checks that operators otherwise run manually:

- local Git branch, head, upstream, and dirty file count
- optional read-only GitHub open pull request and issue counts
- optional AWG role queue status through the AWG CLI
- optional active artifact count for an operator artifact root

The helper is advisory. It does not decide whether work may start, close, or publish, and it is not queue authority or a PR gate.

## Usage

```bash
scripts/awg-operator-baseline-doctor.sh --repo . --role reviewer
scripts/awg-operator-baseline-doctor.sh --repo . --github-repo owner/project --role reviewer --format json
scripts/awg-operator-baseline-doctor.sh --repo . --queue-root .agent-working-group --role reviewer --artifact-root ops
```

Set `AWG_CLI` when the AWG CLI needs an environment wrapper:

```bash
AWG_CLI=./tools/awg-cli scripts/awg-operator-baseline-doctor.sh --role reviewer
```

## Output

Text output is meant for quick operator reading. JSON output is available for downstream tooling or later wrappers:

```bash
scripts/awg-operator-baseline-doctor.sh --format json --role reviewer
```

Missing optional configuration is reported as unavailable instead of turning into a fallback mutation. For example, if `--github-repo` is supplied but `gh` is not installed, GitHub fields are reported as unavailable and the local checks still run.

## Safety Boundary

The helper must not:

- run queue lifecycle mutation commands such as `recv`, `ack`, `ack-pending`, `retry`, `nack`, `prune`, or `requeue-stale`
- edit, delete, move, or classify queue JSON directly
- create branches, commits, tags, pushes, pull requests, comments, reviews, or merges
- install timers, start workers, call providers, send webhooks, or post external messages
- move, delete, archive, or enforce retention for artifacts
- treat active artifact counts, logs, or status output as queue authority

Use it as a pre-flight and close-readiness observation tool. Any follow-up mutation still needs the specific AWG workflow gate for that mutation.
