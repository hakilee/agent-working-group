# Examples

These examples are runnable from a clean clone after installing the package:

```bash
python3 -m pip install -e .
examples/two_agent_loop.sh
```

To run without installing the console script, point `AWG_BIN` at a small wrapper or use `PYTHONPATH` with `python3 -m` from your shell.

## Two-Agent Review Loop

`examples/two_agent_loop.sh` creates a temporary queue root, initializes `lead` and `reviewer`, sends one review instruction, receives it with explicit acknowledgement, sends a status response, acknowledges the instruction, and prints final queue status.

The demo also shows optional source metadata refs:

- `refs.correlationId`: `demo-task-001`
- `refs.sourceChannel`: `local-demo`
- `refs.reportTarget`: `terminal`
- `refs.repo`: `example/project`
- `refs.workspace`: `demo-main`

These refs are traceability-only. They do not change queue selection, delivery order, routing, or access control.

By default, the script uses `/tmp/agent-working-group-demo` and resets that directory. If you pass a custom root, it must be under `/tmp` or `/var/tmp` so the demo does not remove project or home-directory data by accident.

```bash
examples/two_agent_loop.sh /tmp/my-awg-demo
```
