# Dual-Agent Executor

The dual-agent executor lets one AWG worker drive either the Codex CLI
or Claude Code adapter, and automatically falls back to the other when
the primary agent reports a 429 / rate-limit retry. Both adapters share
the existing executor bridge contract: the message body is prompt data,
never shell, and the bridge acknowledges only after a structured
`success` result.

The system is opt-in. Non-coding AWG workflows do not need Codex,
Claude Code, or tmux.

For operational usage — manual bounded runs, tmux wrapper commands,
operator flow, stale recovery, and per-adapter examples — see
[Worker Tmux Guide](codex-tmux-worker.md). This document is the
canonical reference for the executor architecture, fallback rules, and
environment variables.

## Architecture

```text
                 AWG queue (inbox)
                        |
                        v
              awg-executor-bridge.sh         <- queue-aware, owns ack/retry
                        |
                        v
              awg-agent-executor.sh          <- selects primary agent,
                /                  \             watches for 429
               v                    v
   awg-codex-executor.sh    awg-claude-executor.sh
               |                    |
               v                    v
            codex exec           claude -p
               |                    |
               +---------+----------+
                         |
                         v
            structured JSON status result
            (success | retry | question | blocker | failed)
```

The bridge sees a single executor (`awg-agent-executor.sh`). The
dual-agent executor handles primary/secondary selection internally and
forwards the chosen result back to the bridge unchanged. Queue JSON
moves only through the bridge.

## How Each Executor Works

### Codex executor — `scripts/awg-codex-executor.sh`

Reads one AWG message JSON file, validates that `kind == "instruction"`,
extracts `refs.repo` (or `refs.workspace`, or `AWG_CODEX_REPO`), checks
the repo is not dirty unless overridden, then invokes `codex exec` with
the instruction body as prompt data. Emits a JSON status line:

```json
{"status": "success", "summary": "...", "verification": "..."}
```

### Claude executor — `scripts/awg-claude-executor.sh`

Mirrors the Codex executor interface so the bridge can swap them
transparently. Differences:

- Uses `claude -p PROMPT --max-turns N` instead of `codex exec`.
- Accepts `--dangerously-skip-permissions` when
  `AWG_CLAUDE_DANGEROUSLY_SKIP_PERMS=1` (default for non-interactive
  runs).
- Recognises 429 / rate-limit / overloaded / capacity messages from the
  Claude CLI and reports `status=retry` with a rate-limit phrase in
  `summary` so the dual-agent executor can detect them.

### Dual-agent executor — `scripts/awg-agent-executor.sh`

Picks a primary agent based on `AGENT` (`codex` or `claude`), runs it,
and reads the JSON result:

- `success`, `question`, or `blocker` → return immediately, no fallback.
- `retry` with a 429 / rate-limit / overloaded / capacity phrase in the
  summary → log a fallback line to stderr and run the secondary agent.
- `retry` for any other reason, `failed`, or unparsable output → return
  as is. The bridge does not ack.
- If the secondary agent is also rate limited, return the primary
  result so the bridge surfaces the original error.

## How Fallback Works

1. `is_rate_limited` parses the executor's JSON output and returns true
   only when `status == "retry"` and the summary contains `429`,
   `rate limit`, `overloaded`, or `capacity`.
2. On a rate-limit retry from the primary, the dispatcher logs a single
   stderr line with timestamps and runs the secondary executor with the
   same message file.
3. The secondary result is returned to the bridge verbatim. The bridge
   still owns ack/retry/dead-letter behaviour — the dual-agent executor
   only chooses which adapter speaks.
4. Fallback can be disabled by setting `AWG_FALLBACK=0`. In that mode
   the primary's result is always returned.

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `AGENT` | Primary adapter: `codex` or `claude`. | `claude` |
| `AWG_FALLBACK` | Enable fallback to the other agent on 429. | `1` |
| `AWG_AGENT_TIMEOUT` | Per-agent timeout, seconds. | `900` |
| `AWG_CODEX_BIN` | Codex CLI executable. | `codex` |
| `AWG_CODEX_REPO` | Default repo when message lacks `refs.repo`. | unset |
| `AWG_CODEX_TIMEOUT_SECONDS` | Codex CLI timeout. | `900` |
| `AWG_CODEX_ALLOW_DIRTY` | Allow dirty Git worktree. | `0` |
| `AWG_CODEX_SANDBOX` | Codex `--sandbox` mode. | `workspace-write` |
| `AWG_CODEX_EPHEMERAL` | Pass `--ephemeral` to `codex exec`. | `1` |
| `AWG_CLAUDE_BIN` | Claude CLI executable. | `claude` |
| `AWG_CLAUDE_REPO` | Default repo when message lacks `refs.repo`. | unset |
| `AWG_CLAUDE_TIMEOUT_SECONDS` | Claude CLI timeout. | `900` |
| `AWG_CLAUDE_MAX_TURNS` | Claude `--max-turns`. | `30` |
| `AWG_CLAUDE_MODEL` | Optional `--model` value. | unset |
| `AWG_CLAUDE_DANGEROUSLY_SKIP_PERMS` | Pass `--dangerously-skip-permissions`. | `1` |
| `AWG_CLAUDE_ALLOW_DIRTY` | Allow dirty Git worktree. | `0` |

Both executors require an explicit repository path in `refs.repo`,
`refs.workspace`, or the matching default environment variable. If none
is present, the executor reports `status=question` and the bridge
leaves the message unacknowledged.

## One-Shot Dispatch Outside the Worker

The dual-agent executor can be invoked directly with a message file for
manual smoke tests:

```bash
AGENT=claude AWG_FALLBACK=1 scripts/awg-agent-executor.sh \
  /path/to/message.json
```

The output is a single JSON line on stdout, matching the bridge
contract. Queue JSON is not touched. For starting a bounded worker in a
tmux session that drives this executor, see
[Worker Tmux Guide](codex-tmux-worker.md).
