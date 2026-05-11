from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .queue import normalize_target

SUPPORTED_EVENTS = {"message.sent", "message.pending", "on_processing"}
DEFAULT_CONFIG_NAME = "hooks.json"
MAX_HOOK_DEPTH = 1


@dataclass(frozen=True)
class HookResult:
    name: str
    event: str
    status: str
    returncode: int | None = None
    stdout: str = ""
    stderr: str = ""
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": self.name,
            "event": self.event,
            "status": self.status,
        }
        if self.returncode is not None:
            result["returncode"] = self.returncode
        if self.stdout:
            result["stdout"] = self.stdout
        if self.stderr:
            result["stderr"] = self.stderr
        if self.reason:
            result["reason"] = self.reason
        return result


class HookConfigError(ValueError):
    """Raised when hook configuration is invalid."""


def default_config_path(root: Path) -> Path:
    return root / DEFAULT_CONFIG_NAME


def load_hook_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "hooks": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HookConfigError(f"invalid hook config json: {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise HookConfigError("hook config must be a JSON object")
    hooks = data.get("hooks", [])
    if not isinstance(hooks, list):
        raise HookConfigError("hook config field 'hooks' must be a list")
    return data


def matching_hooks(config: dict[str, Any], event: str, message: dict[str, Any]) -> list[dict[str, Any]]:
    if event not in SUPPORTED_EVENTS:
        raise HookConfigError(f"unsupported hook event: {event}")
    matches = []
    for index, hook in enumerate(config.get("hooks", [])):
        if not isinstance(hook, dict):
            raise HookConfigError(f"hook #{index + 1} must be an object")
        if hook.get("enabled", True) is False:
            continue
        if hook.get("event") != event:
            continue
        if hook_filters_match(hook.get("filters", {}), message):
            matches.append(hook)
    return matches


def hook_filters_match(filters: object, message: dict[str, Any]) -> bool:
    if filters in (None, {}):
        return True
    if not isinstance(filters, dict):
        raise HookConfigError("hook filters must be an object")
    refs = message.get("refs") or {}
    checks = {
        "kind": message.get("kind"),
        "from": message.get("from"),
        "to": message.get("to"),
        "sourceChannel": refs.get("sourceChannel"),
        "reportTarget": normalize_target(refs.get("reportTarget")),
        "repo": refs.get("repo"),
        "workspace": refs.get("workspace"),
    }
    for key, expected in filters.items():
        actual = checks.get(key)
        if isinstance(expected, list):
            expected_values = [normalize_target(value) if key == "reportTarget" else value for value in expected]
            if actual not in expected_values:
                return False
            continue
        if key == "reportTarget":
            expected = normalize_target(expected)
        if actual != expected:
            return False
    return True


def dispatch_hooks(
    *,
    root: Path,
    config_path: Path | None,
    event: str,
    message: dict[str, Any],
    dry_run: bool = False,
    environ: dict[str, str] | None = None,
) -> list[HookResult]:
    config = load_hook_config(config_path or default_config_path(root))
    hooks = matching_hooks(config, event, message)
    results: list[HookResult] = []
    env_source = dict(os.environ if environ is None else environ)
    depth = int(env_source.get("AWG_HOOK_DEPTH", "0") or "0")
    payload = build_payload(root, event, message)

    for hook in hooks:
        name = str(hook.get("name") or hook.get("event") or "unnamed")
        command = hook.get("command")
        timeout = hook.get("timeoutSeconds", 10)
        try:
            argv = validate_command(command)
            timeout_value = validate_timeout(timeout)
        except HookConfigError as exc:
            results.append(HookResult(name, event, "invalid", reason=str(exc)))
            continue
        if depth >= MAX_HOOK_DEPTH and not hook.get("allowRecursion", False):
            results.append(HookResult(name, event, "skipped", reason="hook recursion blocked"))
            continue
        if dry_run:
            results.append(HookResult(name, event, "dry-run", reason="command not executed"))
            continue
        env = hook_environment(env_source, root, event, message, depth + 1)
        try:
            completed = subprocess.run(
                argv,
                input=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                text=True,
                capture_output=True,
                check=False,
                timeout=timeout_value,
                env=env,
            )
        except subprocess.TimeoutExpired as exc:
            results.append(HookResult(name, event, "timeout", stdout=exc.stdout or "", stderr=exc.stderr or "", reason=f"timed out after {timeout_value} seconds"))
            continue
        status = "success" if completed.returncode == 0 else "failed"
        results.append(HookResult(name, event, status, completed.returncode, completed.stdout, completed.stderr))
    return results


def build_payload(root: Path, event: str, message: dict[str, Any]) -> dict[str, Any]:
    return {
        "eventType": f"awg.hook.{event}.v1",
        "event": event,
        "root": str(root),
        "message": message,
    }


def validate_command(command: object) -> list[str]:
    if not isinstance(command, list) or not command:
        raise HookConfigError("hook command must be a non-empty argv list")
    argv = []
    for part in command:
        if not isinstance(part, str) or not part:
            raise HookConfigError("hook command entries must be non-empty strings")
        argv.append(part)
    return argv


def validate_timeout(timeout: object) -> float:
    try:
        value = float(timeout)
    except (TypeError, ValueError) as exc:
        raise HookConfigError("hook timeoutSeconds must be numeric") from exc
    if value <= 0 or value > 300:
        raise HookConfigError("hook timeoutSeconds must be greater than 0 and at most 300")
    return value


def hook_environment(base: dict[str, str], root: Path, event: str, message: dict[str, Any], depth: int) -> dict[str, str]:
    env = dict(base)
    env.update(
        {
            "AWG_ROOT": str(root),
            "AWG_HOOK_EVENT": event,
            "AWG_HOOK_DEPTH": str(depth),
            "AWG_MESSAGE_ID": str(message.get("id", "")),
            "AWG_MESSAGE_KIND": str(message.get("kind", "")),
            "AWG_MESSAGE_FROM": str(message.get("from", "")),
            "AWG_MESSAGE_TO": str(message.get("to", "")),
        }
    )
    refs = message.get("refs") or {}
    if refs.get("reportTarget"):
        env["AWG_REPORT_TARGET"] = str(refs["reportTarget"])
    if refs.get("sourceChannel"):
        env["AWG_SOURCE_CHANNEL"] = str(refs["sourceChannel"])
    if refs.get("workId"):
        env["AWG_WORK_ID"] = str(refs["workId"])
    if refs.get("correlationId"):
        env["AWG_CORRELATION_ID"] = str(refs["correlationId"])
    return env


def results_to_dicts(results: Iterable[HookResult]) -> list[dict[str, Any]]:
    return [result.to_dict() for result in results]
