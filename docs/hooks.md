# Queue Hooks

Queue hooks are explicit, local adapter entrypoints around queue messages. They are meant for wake-ups, indexing, local notifications, and operator-owned integrations that should happen near the queue lifecycle without becoming queue authority.

Hooks are not a daemon, plugin host, access-control layer, or remote callback system. They run only when an operator explicitly asks the CLI to dispatch them.

## Events

Supported events:

- `message.sent`: dispatched by `awg send --dispatch-hooks` after the message is durably written to the recipient inbox and log.
- `message.pending`: dispatched by `awg dispatch-hooks --event message.pending --as ROLE` for matching messages that are still pending in the inbox.

Both events pass the full message as JSON on stdin. Hook commands must treat the message body as data.

## Configuration

By default, hooks are read from `<AWG_ROOT>/hooks.json`. A caller can override this with `--hook-config PATH`.

```json
{
  "version": 1,
  "hooks": [
    {
      "name": "notify-reviewer",
      "event": "message.pending",
      "enabled": true,
      "command": ["/path/to/local-adapter", "--mode", "notify"],
      "filters": {
        "to": "reviewer",
        "kind": "instruction",
        "reportTarget": "channel:reviews"
      },
      "timeoutSeconds": 10
    }
  ]
}
```

`command` is an argv list, not a shell string. Pipes, redirects, chained commands, and shell evaluation are intentionally not supported by the hook runner.

Supported filters:

- `kind`
- `from`
- `to`
- `sourceChannel`
- `reportTarget`
- `repo`
- `workspace`

A filter value can be a scalar or a list. `reportTarget` uses the same normalization as queue selection, so `channel:name` and compatible channel target aliases match consistently.

## CLI Usage

Run send-time hooks after enqueue:

```bash
awg send \
  --from=lead \
  --to=reviewer \
  --kind=instruction \
  --report-target=channel:reviews \
  --body="Review the artifact." \
  --dispatch-hooks
```

Dispatch pending-message hooks without consuming work:

```bash
awg dispatch-hooks \
  --event message.pending \
  --as reviewer \
  --report-target channel:reviews \
  --dry-run
```

`--dry-run` reports matching hooks without executing commands. `dispatch-hooks` uses `peek` semantics: it does not move, acknowledge, retry, prune, or delete queue files.

## Payload And Environment

Each hook receives JSON on stdin:

```json
{
  "eventType": "awg.hook.message.pending.v1",
  "event": "message.pending",
  "root": "/queue/root",
  "message": {
    "id": "message-id",
    "kind": "instruction",
    "from": "lead",
    "to": "reviewer",
    "body": "Review the artifact.",
    "refs": {}
  }
}
```

The runner also sets conservative environment fields:

- `AWG_ROOT`
- `AWG_HOOK_EVENT`
- `AWG_HOOK_DEPTH`
- `AWG_MESSAGE_ID`
- `AWG_MESSAGE_KIND`
- `AWG_MESSAGE_FROM`
- `AWG_MESSAGE_TO`
- `AWG_REPORT_TARGET` when present
- `AWG_SOURCE_CHANNEL` when present
- `AWG_WORK_ID` when present
- `AWG_CORRELATION_ID` when present

## Safety Contract

- Hooks are opt-in per CLI invocation.
- Hook commands are argv arrays and are never evaluated through a shell.
- Hook commands receive message bodies as stdin JSON data only.
- Hook timeouts must be greater than zero and at most 300 seconds.
- Recursive hook dispatch is blocked by default through `AWG_HOOK_DEPTH`.
- Hook failures do not roll back an already-enqueued message.
- Hook dispatch is not access control and does not change queue priority or ownership.
- Queue lifecycle mutation remains the job of workers and explicit maintenance commands.

## Good Hook Uses

- Wake up a channel-bound worker when a matching `reportTarget` receives work.
- Record a local audit/index entry for new work items.
- Emit operator-owned notification payloads to a private adapter.
- Run a preflight checker before a bounded worker starts processing matching work.
- Attach PR or artifact gate checks to explicit publish flows.
- Summarize pending work by `repo`, `workspace`, `workId`, or `correlationId`.

## Bad Hook Uses

- Executing the message body as a shell command.
- Automatically acknowledging or retrying work from an observer hook.
- Treating `reportTarget` as a security boundary.
- Hiding provider credentials or destinations in public repository files.
- Running unbounded background workers from hook commands.

## Repository Script Patterns

These examples show how to wire existing repository scripts into hooks.json. Scripts are argv-list commands that receive message JSON on stdin.

### Pending Wake-Up Hook

Use `message.pending` + `dispatch-hooks --dry-run` to inspect pending work without consuming it:

```json
{
  "name": "wake-worker-on-pending",
  "event": "message.pending",
  "command": ["scripts/awg-queue-notifier.sh", "--role", "worker"],
  "filters": {"to": "worker"},
  "timeoutSeconds": 15
}
```

```bash
awg dispatch-hooks --event message.pending --as worker --dry-run
```

### Send-Time Notification Hook

Use `message.sent` + `send --dispatch-hooks` to run a local adapter after enqueue:

```json
{
  "name": "notify-on-send",
  "event": "message.sent",
  "command": ["scripts/awg-queue-notifier-dispatch.sh", "--mode", "notify"],
  "filters": {"kind": "instruction"},
  "timeoutSeconds": 10
}
```

```bash
awg send --from lead --to reviewer --kind instruction --body "Review the PR." --dispatch-hooks
```

### Artifact Index Hook

Index new artifacts when work is queued for a specific workspace:

```json
{
  "name": "index-artifacts",
  "event": "message.sent",
  "command": ["scripts/awg-artifact-index.sh", "--mode", "append"],
  "filters": {"kind": "result", "workspace": "main"},
  "timeoutSeconds": 10
}
```

### Multi-Target Filter

Match multiple report targets with a list:

```json
{
  "name": "multi-channel-notify",
  "event": "message.pending",
  "command": ["scripts/awg-queue-notifier-dispatch.sh"],
  "filters": {
    "reportTarget": ["channel:working", "channel:reviews"]
  }
}
```

All scripts listed here are existing repository helpers. Hooks connect them to queue events without changing the scripts or the queue lifecycle.
