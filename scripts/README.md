# AWG scripts

Operator-facing shell helpers for the agent-working-group (AWG) runtime.
All scripts are prefixed `awg-` and use Bash with `set -euo pipefail`.
Each script begins with a `# Category:` / `# Role:` header — this README
is generated from those headers.

## Naming conventions

Most scripts follow the pattern `awg-{category}-{detail}.sh`. The category
prefix groups related helpers (e.g. `awg-queue-*`, `awg-pr-*`, `awg-hook-*`).
Agent-specific scripts carry an agent prefix (`awg-codex-*`, `awg-claude-*`)
to distinguish them from agent-agnostic variants. The generic
`awg-worker-loop.sh` / `awg-worker-tmux.sh` pair runs any executor through
`awg-executor-bridge.sh`, while `awg-codex-worker-*` and `awg-claude-worker-*`
are convenience launchers wired to a specific adapter.

## Categories

### Agent executors

Adapters and bridges that turn AWG messages into one executor invocation.

- [awg-executor-bridge.sh](awg-executor-bridge.sh) — Bridge that receives one AWG instruction and runs an executor with structured-result ack.
- [awg-agent-executor.sh](awg-agent-executor.sh) — Dual-agent (codex/claude) executor with automatic 429 fallback.
- [awg-codex-executor.sh](awg-codex-executor.sh) — Opt-in Codex adapter for the executor bridge.
- [awg-claude-executor.sh](awg-claude-executor.sh) — Opt-in Claude Code adapter for the executor bridge.
- [awg-fake-executor.sh](awg-fake-executor.sh) — Deterministic fake executor for tests and harness checks.
- [awg-codex-prepare-worktree.sh](awg-codex-prepare-worktree.sh) — Codex worktree readiness check; reports Git state (read-only by default).

### Worker infrastructure

Bounded worker loops and tmux supervisors that drive executors.

- [awg-worker-loop.sh](awg-worker-loop.sh) — Generic bounded worker loop that delegates execution via the executor bridge (agent-agnostic).
- [awg-worker-tmux.sh](awg-worker-tmux.sh) — tmux supervisor for the generic worker loop (start/status/stop/kill/log/requeue-stale).
- [awg-codex-worker-loop.sh](awg-codex-worker-loop.sh) — Bounded worker loop that runs the Codex executor adapter via the executor bridge.
- [awg-codex-worker-tmux.sh](awg-codex-worker-tmux.sh) — tmux supervisor for the Codex worker loop (start/status/stop/kill/log).
- [awg-claude-worker-loop.sh](awg-claude-worker-loop.sh) — Bounded worker loop that runs the Claude executor adapter via the executor bridge.
- [awg-claude-worker-tmux.sh](awg-claude-worker-tmux.sh) — tmux supervisor for the Claude worker loop (start/status/stop/kill/log).

### Hooks

Read-only hook adapters that read a JSON event on stdin and exit with a
gate decision. Wire these into `settings.json` `hooks` entries.

- [awg-hook-worker-preflight.sh](awg-hook-worker-preflight.sh) — Hook adapter that runs a read-only preflight safety check for bounded worker spawns.
- [awg-hook-pr-publish-gate.sh](awg-hook-pr-publish-gate.sh) — Hook adapter that runs the PR publish-gate check on publish-intent events.

### Queue operations

Read-only observers, notifiers, and safe wrappers around the AWG CLI.

- [awg-queue-notifier.sh](awg-queue-notifier.sh) — Read-only pending-inbox notifier with state-file duplicate suppression.
- [awg-queue-notifier-dispatch.sh](awg-queue-notifier-dispatch.sh) — Build provider-neutral delivery payloads from read-only queue notifier output.
- [awg-queue-notifier-sample-run.sh](awg-queue-notifier-sample-run.sh) — Manual no-install notifier dispatch tick for operators (prints provider-neutral payloads).
- [awg-queue-reconciliation-report.sh](awg-queue-reconciliation-report.sh) — Read-only reconciliation report for one AWG role queue (observes; never mutates).
- [awg-reconcile-ack-pending.sh](awg-reconcile-ack-pending.sh) — Evidence-gated wrapper for acknowledging one reviewed inbox item.
- [awg-worker-state-report.sh](awg-worker-state-report.sh) — Read-only advisory worker-state report for one AWG role queue.
- [awg-safe-poll.sh](awg-safe-poll.sh) — Safe polling wrapper around `awg status` with optional requeue-stale.

### PR / review operations

Helpers for the GitHub PR review-gate workflow.

- [awg-pr-publish-gate-check.sh](awg-pr-publish-gate-check.sh) — Validate that a PR has a public review-gate comment or an explicit skip reason.
- [awg-pr-review-request.sh](awg-pr-review-request.sh) — Send a PR review request to a reviewer queue with a checklist body.

### Artifacts

Workspace artifact management. Dry-run by default; never mutate queue JSON.

- [awg-archive-artifact.sh](awg-archive-artifact.sh) — Move one operational artifact into a completed or archive directory (dry-run by default).
- [awg-artifact-index.sh](awg-artifact-index.sh) — Generate a read-only index for an AWG ops artifact workspace.

### Repository utilities

Read-only diagnostics for the host repository and operator baseline.

- [awg-detect-repository-rules.sh](awg-detect-repository-rules.sh) — Advisory detection of commit/PR title/squash merge rules in a repository.
- [awg-operator-baseline-doctor.sh](awg-operator-baseline-doctor.sh) — Diagnostic doctor reporting operator baseline (Git, tools, env) health.

### Templates

Scaffolding emitters and adapter templates.

- [awg-independent-analysis-template.sh](awg-independent-analysis-template.sh) — Print Markdown scaffolds for independent analysis sections (stdout only).
- [awg-real-executor-template.sh](awg-real-executor-template.sh) — Opt-in adapter template for connecting the executor bridge to a real provider.

## Naming-consistency notes

The following inconsistencies were observed during the audit. None are
fixed by file rename here (renames would break callers, hooks, and
docs); they are documented so future cleanup can address them
deliberately.

- **`awg-worker-loop.sh` vs `awg-codex-worker-loop.sh` / `awg-claude-worker-loop.sh`** — the un-prefixed `awg-worker-*` pair is the *generic* bridge-based loop (it accepts any executor via `--`). A clearer name would be `awg-bridge-worker-loop.sh` / `awg-bridge-worker-tmux.sh`, freeing `awg-worker-*` to read as "any worker".
- **`awg-worker-state-report.sh`** — semantically a queue observation helper (reports state from a role queue), but the `worker-` prefix suggests worker infrastructure. Renaming to `awg-queue-worker-state-report.sh` (or `awg-queue-state-report.sh`) would match the sibling `awg-queue-reconciliation-report.sh`.
- **Verb-noun vs noun-noun ordering** — `awg-archive-artifact.sh` (verb-noun) sits next to `awg-artifact-index.sh` (noun-noun). Similarly `awg-detect-repository-rules.sh` (verb-noun) versus most other category-first names. Standardizing on category-first (`awg-artifact-archive.sh`, `awg-repository-rules-detect.sh`) would be consistent.
- **`awg-safe-poll.sh`** — has no category prefix. `awg-queue-safe-poll.sh` or `awg-worker-safe-poll.sh` would file it under an existing group.
- **`awg-codex-prepare-worktree.sh`** — the only `awg-{agent}-{verb}-{noun}` script (others use `awg-{agent}-{noun}-{detail}`). `awg-codex-worktree-prepare.sh` would match the pattern; alternatively, since it is read-only by default, `awg-codex-worktree-check.sh` reads more accurately.
- **`awg-operator-baseline-doctor.sh`** — `-doctor` suffix is unique. Acceptable as a deliberate name, but worth noting.

The audit added a `# Category:` / `# Role:` header to each script in
place, documenting classification without breaking call-sites.
