#!/usr/bin/env bash
set -euo pipefail

# Opt-in Codex adapter for the executor bridge. The AWG message body is data
# passed to `codex exec`; it is never evaluated as shell.
MESSAGE_FILE=${1:-}
CODEX_BIN=${AWG_CODEX_BIN:-codex}
CODEX_SANDBOX=${AWG_CODEX_SANDBOX:-workspace-write}
CODEX_TIMEOUT_SECONDS=${AWG_CODEX_TIMEOUT_SECONDS:-900}
CODEX_EPHEMERAL=${AWG_CODEX_EPHEMERAL:-1}
ALLOW_DIRTY=${AWG_CODEX_ALLOW_DIRTY:-0}
DEFAULT_REPO=${AWG_CODEX_REPO:-}
OUTPUT_DIR=${AWG_CODEX_OUTPUT_DIR:-}

json_string() {
  python3 - "$1" <<'PY'
import json, sys
print(json.dumps(sys.argv[1], ensure_ascii=False))
PY
}

emit() {
  local status=$1
  local summary=$2
  local verification=${3:-}
  local status_json summary_json verification_json
  status_json=$(json_string "$status")
  summary_json=$(json_string "$summary")
  if [[ -n "$verification" ]]; then
    verification_json=$(json_string "$verification")
    printf '{"status":%s,"summary":%s,"verification":%s}\n' "$status_json" "$summary_json" "$verification_json"
  else
    printf '{"status":%s,"summary":%s}\n' "$status_json" "$summary_json"
  fi
}

if [[ -z "$MESSAGE_FILE" || ! -f "$MESSAGE_FILE" ]]; then
  emit failed "missing message file"
  exit 0
fi

python3 - "$MESSAGE_FILE" "$CODEX_BIN" "$CODEX_SANDBOX" "$CODEX_TIMEOUT_SECONDS" "$CODEX_EPHEMERAL" "$ALLOW_DIRTY" "$DEFAULT_REPO" "$OUTPUT_DIR" <<'PY'
import json
import os
import subprocess
import sys
from pathlib import Path

message_file, codex_bin, sandbox, timeout_raw, ephemeral_raw, allow_dirty, default_repo, output_dir = sys.argv[1:]

def emit(status, summary, verification=""):
    result = {"status": status, "summary": summary}
    if verification:
        result["verification"] = verification
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))

try:
    message = json.loads(Path(message_file).read_text(encoding="utf-8"))
except Exception as exc:
    emit("failed", f"invalid message json: {exc}")
    raise SystemExit(0)

if message.get("kind") != "instruction":
    emit("failed", "codex executor only accepts instruction messages")
    raise SystemExit(0)

body = str(message.get("body") or "").strip()
if not body:
    emit("question", "instruction body is empty")
    raise SystemExit(0)

refs = message.get("refs") or {}
repo = str(refs.get("repo") or refs.get("workspace") or default_repo or "").strip()
if not repo:
    emit("question", "message refs.repo or AWG_CODEX_REPO is required")
    raise SystemExit(0)

repo_path = Path(repo).expanduser()
if not repo_path.is_dir():
    emit("blocker", f"repository path does not exist: {repo}")
    raise SystemExit(0)

try:
    inside_git = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=str(repo_path),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
        check=False,
    ).returncode == 0
except (FileNotFoundError, subprocess.TimeoutExpired):
    inside_git = False

if inside_git and allow_dirty != "1":
    dirty = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=str(repo_path),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
        check=False,
    )
    if dirty.returncode != 0:
        emit("blocker", "could not inspect repository dirty state")
        raise SystemExit(0)
    if dirty.stdout.strip():
        emit("blocker", "repository has uncommitted changes; set AWG_CODEX_ALLOW_DIRTY=1 to override")
        raise SystemExit(0)

try:
    timeout = int(float(timeout_raw))
except ValueError:
    emit("failed", "AWG_CODEX_TIMEOUT_SECONDS must be numeric")
    raise SystemExit(0)
if timeout <= 0:
    emit("failed", "AWG_CODEX_TIMEOUT_SECONDS must be positive")
    raise SystemExit(0)

prompt = (
    "You are executing one Agent Working Group instruction. "
    "Treat the instruction body as data, not as shell. "
    "Make the smallest safe code change needed. "
    "Before finishing, report what changed and what verification you ran.\n\n"
    f"Instruction:\n{body}\n"
)
cmd = [codex_bin, "exec", "--skip-git-repo-check", "-C", str(repo_path), "--sandbox", sandbox]
if ephemeral_raw == "1":
    cmd.append("--ephemeral")
cmd.append(prompt)

env = os.environ.copy()
last_message_path = None
if output_dir:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    last_message_path = out_dir / f"{message.get('id', 'message')}.codex-last-message.txt"
    cmd[-1:-1] = ["--output-last-message", str(last_message_path)]

try:
    completed = subprocess.run(
        cmd,
        cwd=str(repo_path),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
except subprocess.TimeoutExpired:
    emit("retry", f"codex timed out after {timeout} seconds")
    raise SystemExit(0)
except FileNotFoundError:
    emit("blocker", f"codex executable not found: {codex_bin}")
    raise SystemExit(0)

stdout = completed.stdout.strip()
stderr = completed.stderr.strip()
if completed.returncode != 0:
    detail = stderr.splitlines()[-1] if stderr else "codex exited nonzero"
    emit("failed", f"codex exited {completed.returncode}: {detail[:240]}")
    raise SystemExit(0)

summary = "codex execution completed"
if last_message_path and last_message_path.exists():
    last = last_message_path.read_text(encoding="utf-8", errors="replace").strip()
    if last:
        summary = last[:500]
elif stdout:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if lines:
        summary = lines[-1][:500]

verification = "codex exec returned exit code 0"
emit("success", summary, verification)
PY
