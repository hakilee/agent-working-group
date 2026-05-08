# AI Executor Bridge

The AI executor bridge is an opt-in helper that connects the AWG queue to an executor process. It is not the executor itself, and it is not part of `MessageQueue` core behavior.

Use it when a worker should keep an `instruction` message in `processing` while an external executor performs work and returns a structured outcome.

## Pipeline

```text
AWG queue -> bridge -> executor -> structured result -> queue-aware action
```

The bridge:

1. receives one message with `recv --require-ack`
2. accepts only `instruction` messages for execution
3. passes the received message file path to the executor
4. parses the executor's structured JSON result
5. acknowledges only `success`
6. reports retry, question, blocker, failed, or malformed outcomes without acknowledging the instruction

The bridge is an opt-in helper, not default worker behavior. Existing bounded workers and safe polling remain unchanged.

## Safety Rules

- Never execute message body as shell.
- Queue JSON must only move through queue-aware commands.
- Do not acknowledge before executor success is parsed.
- Do not auto-ack non-instruction messages.
- Keep failed, blocked, question, and malformed outcomes recoverable for an operator.

The bridge executes the configured executor command. It never treats the instruction body as a command.

## Executor Contract

The executor receives the message JSON file path as its first argument and writes one JSON object to stdout.

Supported statuses:

```json
{"status":"success","summary":"done","artifacts":[],"verification":"tests passed"}
{"status":"retry","summary":"temporary failure"}
{"status":"question","summary":"need input","question":"Which target should I use?"}
{"status":"blocker","summary":"unsafe request"}
{"status":"failed","summary":"execution failed"}
```

Missing optional fields are handled with safe defaults. Unknown statuses, invalid JSON, and executor non-zero exits are treated as safe failures and are not acknowledged.

## Queue Actions

- `success`: send status to lead, then `ack` the instruction.
- `retry`: send status to lead, then `retry` the instruction back to inbox.
- `question`: send question to lead with `replyTo`, leave instruction in processing.
- `blocker`: send blocker to lead with `replyTo`, leave instruction in processing.
- `failed`: send status to lead with `replyTo`, leave instruction in processing for operator decision.
- malformed output, unknown status, or executor error: send status to lead, leave instruction in processing.
- non-instruction message: return it to inbox with `retry`, do not execute and do not ack.

## Example

```bash
AWG_ROOT=.agent-working-group WORKER=worker LEAD=lead \
  scripts/awg-executor-bridge.sh -- scripts/awg-fake-executor.sh
```

The fake executor is deterministic and intended for tests and local smoke checks.

## Real Executor Adapter Template

`scripts/awg-real-executor-template.sh` is an opt-in adapter template for external AI executors. It is not used by default and does not make network calls. Use it as a private wrapper boundary: validate local configuration first, pass the message JSON file path to the real executor implementation, then print exactly one structured JSON object to stdout.

Adapter requirements:

- receive the message JSON file path as the first argument
- validate required configuration before attempting execution
- fail closed when configuration is missing by returning structured `failed` output
- keep the instruction body as data; never execute it as shell
- write exactly one JSON object to stdout for bridge parsing
- use the existing statuses: `success`, `retry`, `question`, `blocker`, or `failed`
- never read, write, or move queue directories directly

Deterministic template modes are controlled by `AWG_REAL_EXECUTOR_MODE` for tests and smoke checks. A private real adapter should replace the mode handler with provider-specific logic outside this repository while preserving the same contract.
