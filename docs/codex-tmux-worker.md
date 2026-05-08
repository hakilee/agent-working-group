# Codex Tmux Worker

The Codex tmux worker is an opt-in path for code-related AWG instructions. It
combines the existing executor bridge with a Codex adapter and a bounded tmux
runtime.

```text
AWG queue -> executor bridge -> Codex adapter -> codex exec -> structured result
```

The worker is manual bounded by default. It is not an always-on daemon unless an
operator makes a separate operating decision.

## Components

- `scripts/awg-codex-executor.sh`: reads one AWG message JSON file and invokes
  `codex exec` with the instruction body as prompt data.
- `scripts/awg-codex-worker-loop.sh`: repeatedly runs the executor bridge with
  the Codex adapter until a bound is reached.
- `scripts/awg-codex-worker-tmux.sh`: starts, inspects, stops, or kills the loop
  in a named tmux session.

The adapter acknowledges only after structured success through the existing
bridge. It does not move queue JSON directly.

## Required Work Metadata

A code instruction should include an explicit repository path in `refs.repo` or
`refs.workspace`. If the message does not include one, the adapter can use
`AWG_CODEX_REPO`. If no explicit repository is available, the adapter asks a
question and the instruction remains unacknowledged.

Example send shape:

```bash
awg send \
  --from lead \
  --to codex-worker \
  --kind instruction \
  --repo /path/to/repo \
  --workspace /path/to/repo \
  --correlation-id codex-worker-smoke-001 \
  --body "Make the smallest safe change and run focused verification."
```

## Manual Bounded Run

```bash
export AWG_ROOT=.agent-working-group
export WORKER=codex-worker
export LEAD=lead
export SESSION=awg-codex-worker
export MAX_TASKS=1
export MAX_IDLE_SECONDS=900
export AWG_CODEX_TIMEOUT_SECONDS=900
scripts/awg-codex-worker-tmux.sh start
```

Useful operations:

```bash
scripts/awg-codex-worker-tmux.sh status
scripts/awg-codex-worker-tmux.sh log
scripts/awg-codex-worker-tmux.sh stop
scripts/awg-codex-worker-tmux.sh kill
```

## Safety Rules

- Treat the message body as prompt data, never as shell.
- Keep `MAX_TASKS` and `MAX_IDLE_SECONDS` set for bounded operation.
- Use `recv --require-ack` through the executor bridge.
- Acknowledge only after `codex exec` exits with code `0` and the adapter emits
  structured `success`.
- Leave nonzero, timeout, missing repository, question, blocker, failed, and
  malformed outcomes unacknowledged for operator decision or retry.
- Use duplicate session and lock checks before starting tmux.
- Keep always-on daemon mode as a separate design and operating decision.

## Configuration

- `AWG_CODEX_BIN`: Codex executable path or name, default `codex`.
- `AWG_CODEX_REPO`: fallback repository path when message refs are absent.
- `AWG_CODEX_SANDBOX`: Codex sandbox mode, default `workspace-write`.
- `AWG_CODEX_TIMEOUT_SECONDS`: maximum Codex run duration, default `900`.
- `AWG_CODEX_EPHEMERAL`: set `1` to add `--ephemeral`, default `1`.
- `AWG_CODEX_OUTPUT_DIR`: directory for Codex last-message files.
- `AWG_CODEX_ALLOW_DIRTY`: set `1` to allow execution in a dirty Git worktree; default is fail-closed when dirty.

These values are data values. Do not use shell command strings, pipes, or
redirections in executable variables.

## Repository Cleanliness

When the target path is a Git worktree, the adapter checks `git status --porcelain` before invoking Codex. The default is fail-closed on uncommitted changes so a worker cannot silently mix unrelated operator edits into an automated run. Use a clean branch or a dedicated worktree for worker jobs. Set `AWG_CODEX_ALLOW_DIRTY=1` only for an explicitly supervised run where mixing changes is intentional.

## Failure Handling

The adapter maps Codex outcomes into the executor bridge contract:

- exit `0`: `success`, then the bridge reports status and acknowledges
- timeout: `retry`, then the bridge retries the instruction
- missing executable or missing repository: `blocker` or `question`
- nonzero exit: `failed`, remains in processing for operator decision

Use `requeue-stale` only after inspecting that a processing item is genuinely
stale and the worker is no longer running.
