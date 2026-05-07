# Evolution Flow

Use this flow whenever the package evolves.

## Goals

- Keep working-group workflows useful for real agent coordination.
- Keep the project generic, documented, and importable.
- Avoid leaking local identities or private workspace details into the project.

## Per-Feature Loop

1. **Need appears**
   - Capture the operational problem in the working group.
   - Define the expected behavior and pass criteria.

2. **Implement**
   - Implement the smallest generic change in `src/agent_working_group/`.
   - Smoke-test it with isolated queues.
   - Ask another agent to verify from the worker perspective when useful.
   - Keep the CLI and Python API aligned.

3. **Document**
   - Update `README.md` for user-facing usage.
   - Update `docs/protocol.md` for protocol semantics.
   - Record any user-facing tradeoff.

4. **Test**
   - Add or update tests in `tests/`.
   - Run the test suite.
   - Run at least one CLI smoke test.

5. **Review**
   - Have a second agent review docs and behavior.
   - Fix ambiguity before reporting completion.

6. **Report**
   - Summarize implementation, deliverables, verification, and residual risks.

## Naming Rules

- Do not use local agent names.
- Do not reference private Discord channels or local project paths in public docs.
- Prefer role names: `lead`, `worker`, `reviewer`, `observer`.
