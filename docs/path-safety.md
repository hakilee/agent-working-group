# Path Safety

Filesystem-facing AWG helpers should validate paths before moving, deleting, archiving, or reading operator-provided files. Use the path safety helper when code receives both an allowed base directory and a target path.

## Policy

- Resolve paths canonically before comparing them.
- Treat ambiguous input as invalid: `None`, empty strings, and unsupported types should fail closed.
- Reject any target that resolves outside the allowed base directory.
- Use path containment checks instead of string prefix checks.
- Treat symlinks as real paths after resolution, so a symlink inside the base that points outside the base is rejected.
- Do not use path validation to broaden deletion, cleanup, archive, or queue JSON handling scope.

## Allowed Base Policy

An allowed base is the explicit directory boundary an operator chooses for an artifact or workspace operation. Future helpers that move, write, or archive artifacts should require this boundary as configuration or an explicit argument before acting. Do not infer the boundary from the current working directory, a source file path, or a destination path.

Valid artifact bases are operational workspaces that are intended to hold shared Markdown artifacts, such as an `awg-ops/` tree with `active/`, `completed/`, and `archive/` subdirectories. Valid workspace bases are explicitly configured directories for a single workflow or repository. Queue directories are not valid artifact or workspace write targets.

When an allowed base is missing, empty, unsupported, or invalid, helpers should fail closed before writing or moving anything. When a target is supplied, resolve both the allowed base and the target canonically, then require the target to be contained by the resolved base. Use `require_contained_path()` for this check in Python code.

Allowed-base policy is advisory design guidance for existing helpers. It does not add an enforcement gate to current archive, cleanup, worker, executor, or queue commands.

## Python Helper

Use `agent_working_group.path_safety.require_contained_path(base, target)` when invalid input should raise an exception. It returns the resolved target path only when the target is contained by the resolved base.

Use `agent_working_group.path_safety.is_contained_path(base, target)` when a boolean is easier to compose.

```python
from agent_working_group.path_safety import require_contained_path

safe_target = require_contained_path(workspace_root, requested_artifact)
```

## Required Test Cases

Path safety changes should cover at least:

- a normal contained path
- `..` traversal outside the base
- a symlink under the base that points outside the base
- a sibling-prefix trap where the string starts similarly but is not inside the base
- ambiguous inputs such as `None`, empty strings, or unsupported types

## Queue State

Queue JSON files are live coordination state. Path containment helpers do not make it safe to move or delete queue JSON directly. Use queue-aware commands for queue state, and keep cleanup/archive helpers constrained to their documented scope.

## Archive Helpers

The repository archive helper is a small bash script and remains behavior-preserving for valid existing usage. Do not add an implicit containment boundary to that helper. If a future archive helper needs code-level containment, add explicit allowed-base inputs and tests for valid usage, traversal rejection, symlink escape rejection, destination containment, and queue JSON preservation.
