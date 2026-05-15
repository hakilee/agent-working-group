# Worker Tmux Guide

This guide covers the opt-in tmux worker paths for code-related AWG
instructions. Two adapters are available today — Codex and Claude Code —
and they share the same executor bridge contract: the message body is
prompt data, never shell, and the bridge acknowledges only after a
structured `success` result.

AWG does not require Codex, Claude Code, or tmux for non-coding
workflows; local reports, office/admin outputs, and other artifact-only
tasks can use lighter output gates without code-worker preflight rules.

```text
AWG queue -> executor bridge -> agent adapter -> codex exec | claude -p
            -> structured result
```

Workers are manual bounded by default. They are not always-on daemons
unless an operator makes a separate operating decision. For the executor
architecture, the dual-agent dispatcher, the 429 fallback rules, and the
canonical environment variable table that applies to both adapters, see
[Dual-Agent Executor](executors.md). This guide focuses on the tmux
operational surface for each worker.

## Codex Worker

The Codex worker pairs `awg-codex-executor.sh` with a bounded tmux
session that runs the executor bridge until a limit is reached.

### Components

- `scripts/awg-codex-executor.sh`: reads one AWG message JSON file and
  invokes `codex exec` with the instruction body as prompt data.
- `scripts/awg-codex-worker-loop.sh`: repeatedly runs the executor
  bridge with the Codex adapter until a bound is reached.
- `scripts/awg-codex-worker-tmux.sh`: starts, inspects, stops, or kills
  the loop in a named tmux session.

The adapter acknowledges only after structured success through the
existing bridge. It does not move queue JSON directly.

### Required Work Metadata

A code instruction should include an explicit repository path in
`refs.repo` or `refs.workspace`. If the message does not include one,
the adapter can use `AWG_CODEX_REPO`. If no explicit repository is
available, the adapter asks a question and the instruction remains
unacknowledged.

Example send shape:

```bash
awg send \
  --from lead \
  --to worker \
  --kind instruction \
  --repo /path/to/repo \
  --workspace /path/to/repo \
  --correlation-id codex-worker-smoke-001 \
  --body "Make the smallest safe change and run focused verification."
```

### Manual Bounded Run

```bash
export AWG_ROOT=.agent-working-group
export WORKER=worker
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

### Branch and Worktree Prep

Use `scripts/awg-codex-prepare-worktree.sh --repo DIR` before dispatch
when you want a fast readiness report. The helper is read-only by
default: it reports the current branch, short HEAD, dirty state,
upstream relation when available, and whether the target is ready for
Codex worker dispatch. Passing `--branch NAME` verifies the current
branch without switching. Passing both `--branch NAME --create-branch`
is the explicit mutation path for creating and switching to a new
branch from a clean worktree. It never commits, pushes, opens PRs,
merges, deletes branches, or edits queue files.

## Claude Code Worker

The Claude Code worker pairs `awg-claude-executor.sh` with a parallel
bounded tmux session. By default it routes through the dual-agent
executor so a Claude 429 / rate-limit response automatically falls back
to Codex without re-queueing. See [Dual-Agent Executor](executors.md)
for the fallback rules and the full environment matrix.

### Components

- `scripts/awg-claude-executor.sh`: reads one AWG message JSON file and
  invokes `claude -p` with the instruction body as prompt data.
- `scripts/awg-claude-worker-loop.sh`: repeatedly runs the executor
  bridge through the dual-agent executor until a bound is reached.
- `scripts/awg-claude-worker-tmux.sh`: starts, inspects, stops, or
  kills the loop in a named tmux session.

The adapter acknowledges only after structured success through the
existing bridge. It does not move queue JSON directly.

### Required Work Metadata

A code instruction should include an explicit repository path in
`refs.repo` or `refs.workspace`. If the message does not include one,
the adapter can use `AWG_CLAUDE_REPO`. If no explicit repository is
available, the adapter asks a question and the instruction remains
unacknowledged.

Example send shape:

```bash
awg send \
  --from lead \
  --to worker \
  --kind instruction \
  --repo /path/to/repo \
  --workspace /path/to/repo \
  --correlation-id claude-worker-smoke-001 \
  --body "Make the smallest safe change and run focused verification."
```

### Manual Bounded Run

```bash
export AWG_ROOT=.agent-working-group
export WORKER=worker
export LEAD=lead
export AGENT=claude
export AWG_FALLBACK=1
export MAX_TASKS=1
export MAX_IDLE_SECONDS=900
export AWG_CLAUDE_REPO=/path/to/repo
scripts/awg-claude-worker-tmux.sh start
```

Useful operations:

```bash
scripts/awg-claude-worker-tmux.sh status
scripts/awg-claude-worker-tmux.sh log
scripts/awg-claude-worker-tmux.sh stop
scripts/awg-claude-worker-tmux.sh kill
```

Set `AWG_FALLBACK=0` to disable the dual-agent fallback and run Claude
in single-agent mode. Set `AGENT=codex` to drive the Claude tmux wrapper
with Codex as primary instead — the wrapper does not pin the primary.

## Operator Flow

Use this sequence for a manual bounded code-worker run (Codex or
Claude). This is code-worker guidance, not a requirement for every
AWG task:

1. Prepare the target repository with
   `scripts/awg-codex-prepare-worktree.sh --repo DIR`. The helper is
   read-only by default and should report a clean worktree before
   dispatch. If a branch is needed, use `--branch NAME --create-branch`
   explicitly.
2. Send one instruction with explicit `--repo DIR` and `--workspace DIR`
   refs. The message body is prompt data only, not shell.
3. Start the worker with bounded limits such as `MAX_TASKS=1` and
   `MAX_IDLE_SECONDS=900`.
4. Run `scripts/awg-codex-worker-tmux.sh status` (or the matching
   `scripts/awg-claude-worker-tmux.sh status`) to inspect tmux state,
   queue state, and `latest_summary=PATH`.
5. Inspect the run summary first, then the log named by the summary or
   the wrapper's `log` subcommand.
6. Reconcile queue state only after reviewing evidence. Use
   reviewed-item primitives such as `ack-pending` for inbox
   reconciliation when appropriate; do not treat a summary or log file
   as automatic permission to ack, retry, or delete anything.

This flow stays manual and bounded. Summary and log files are
inspection artifacts, not worker control state.

## Safety Rules

These rules apply to both Codex and Claude workers:

- Treat the message body as prompt data, never as shell.
- Keep `MAX_TASKS` and `MAX_IDLE_SECONDS` set for bounded operation.
- Use `recv` through the executor bridge.
- Acknowledge only after the underlying CLI (`codex exec` or
  `claude -p`) exits with code `0` and the adapter emits structured
  `success`.
- Leave nonzero, timeout, missing repository, question, blocker,
  failed, and malformed outcomes unacknowledged for operator decision
  or retry.
- Use duplicate session and lock checks before starting tmux.
- Keep always-on daemon mode as a separate design and operating
  decision.

## Configuration

The Codex- and Claude-specific environment variables are documented in
[Dual-Agent Executor](executors.md) as the canonical reference. Common
operator pointers:

- Codex defaults: `AWG_CODEX_BIN`, `AWG_CODEX_REPO`,
  `AWG_CODEX_TIMEOUT_SECONDS`, `AWG_CODEX_ALLOW_DIRTY`.
- Claude defaults: `AWG_CLAUDE_BIN`, `AWG_CLAUDE_REPO`,
  `AWG_CLAUDE_TIMEOUT_SECONDS`, `AWG_CLAUDE_MAX_TURNS`,
  `AWG_CLAUDE_DANGEROUSLY_SKIP_PERMS`, `AWG_CLAUDE_ALLOW_DIRTY`.
- Dual-agent dispatch: `AGENT`, `AWG_FALLBACK`, `AWG_AGENT_TIMEOUT`.

These values are data values. Do not use shell command strings, pipes,
or redirections in executable variables.

## Repository Cleanliness

When the target path is a Git worktree, both adapters check
`git status --porcelain` before invoking the underlying CLI. The
default is fail-closed on uncommitted changes so a worker cannot
silently mix unrelated operator edits into an automated run. Use a
clean branch or a dedicated worktree for code-worker jobs. Set
`AWG_CODEX_ALLOW_DIRTY=1` or `AWG_CLAUDE_ALLOW_DIRTY=1` only for an
explicitly supervised run where mixing changes is intentional. These
clean-worktree rules are scoped to Codex/Git execution, not to
non-coding AWG tasks that simply produce local artifacts.

## Run Summaries

Each bounded loop writes a small JSON run summary under
`LOG_DIR/run-summaries` when it exits. The summary records worker
name, lead name, start and stop timestamps, duration, stop reason,
task count, and log location. Operators can use it as the first
artifact for post-run inspection without reading queue internals.

Status also reports `latest_summary=PATH` when a summary exists, or
`latest_summary=none` before the first summary. This is an inspection
pointer only; the wrapper does not parse summary contents or use them
for control flow.

Run summaries, logs, and status pointers are not queue authority: they cannot authorize `ack`, `ack-pending`, `retry`, `nack`, `requeue-stale`, `prune`, deletion, routing, or direct queue JSON edits by themselves.

## Stale Processing Recovery

Use observation before mutation when a code-worker run stops with work
still in `processing/`:

1. Confirm the tmux session is not running with
   `scripts/awg-codex-worker-tmux.sh status` (or the matching Claude
   wrapper), or intentionally stop it before recovery.
2. Inspect queue status for the worker and identify the exact
   processing item, including its age and message id.
3. Inspect `latest_summary=PATH` from status when present, then inspect
   the summary and log evidence. A summary or log is evidence, not authority to mutate queue state.
4. Decide whether the processing item is genuinely stale. Use a
   conservative threshold higher than expected agent execution and
   acknowledgement latency.
5. Recover only with an explicit operator action such as `requeue-stale` after evidence review. Do not use `recv`, direct queue JSON edits, deletion, pruning, bulk recovery, or automatic ack/retry as part of stale inspection.

If the worker may still be running, do not recover the item. Let the
bounded worker finish or stop it intentionally, then inspect again.

## Failure Handling

Both adapters map CLI outcomes into the executor bridge contract:

- exit `0`: `success`, then the bridge reports status and acknowledges.
- timeout: `retry`, then the bridge retries the instruction.
- missing executable or missing repository: `blocker` or `question`.
- nonzero exit: `failed`, remains in processing for operator decision.
- Claude 429 / rate-limit / overloaded / capacity output: `retry` with
  a rate-limit phrase. When `AWG_FALLBACK=1`, the dual-agent executor
  routes the same message to the other adapter automatically. See
  [Dual-Agent Executor](executors.md) for the exact fallback decision.

Use `requeue-stale` only after inspecting that a processing item is
genuinely stale and the worker is no longer running.
