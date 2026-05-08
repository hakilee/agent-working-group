"""Path containment helpers for filesystem-facing AWG utilities."""

from pathlib import Path
from typing import Union

PathLike = Union[str, Path]


class PathSafetyError(ValueError):
    """Raised when a path is invalid or escapes an allowed base directory."""


def canonical_path(path: PathLike) -> Path:
    """Return a resolved absolute path, following symlinks when they exist.

    The helper fails closed for ambiguous inputs such as None, empty strings,
    or unsupported types. Missing leaf paths are still normalized relative to
    existing parents by pathlib's strict=False behavior.
    """

    if not isinstance(path, (str, Path)):
        raise PathSafetyError("path must be a string or Path")
    if isinstance(path, str) and path.strip() == "":
        raise PathSafetyError("path must not be empty")
    raw = Path(path)
    return raw.expanduser().resolve(strict=False)


def is_contained_path(base: PathLike, target: PathLike) -> bool:
    """Return True when target resolves inside base, otherwise False."""

    try:
        require_contained_path(base, target)
    except PathSafetyError:
        return False
    return True


def require_contained_path(base: PathLike, target: PathLike) -> Path:
    """Resolve target and require it to be contained inside resolved base.

    Containment uses Path.relative_to(), not string prefix checks, so similarly
    named sibling directories are rejected.
    """

    resolved_base = canonical_path(base)
    resolved_target = canonical_path(target)
    try:
        resolved_target.relative_to(resolved_base)
    except ValueError as exc:
        raise PathSafetyError(f"path escapes allowed base: {resolved_target}") from exc
    return resolved_target
