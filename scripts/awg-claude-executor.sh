#!/usr/bin/env bash
set -euo pipefail

# Category: agent-executor
# Role: Opt-in Claude Code adapter for the executor bridge.
#
# Opt-in Claude Code adapter for the executor bridge. The AWG message body is
# data passed to `claude -p`; it is never evaluated as shell.

MESSAGE_FILE=${1:-}
CLAUDE_BIN=${AWG_CLAUDE_BIN:-claude}
CLAUDE_TIMEOUT_SECONDS=${AWG_CLAUDE_TIMEOUT_SECONDS:-900}
CLAUDE_MODEL=${AWG_CLAUDE_MODEL:-}
CLAUDE_MAX_TURNS=${AWG_CLAUDE_MAX_TURNS:-30}
ALLOW_DIRTY=${AWG_CLAUDE_ALLOW_DIRTY:-0}
DEFAULT_REPO=${AWG_CLAUDE_REPO:-}
OUTPUT_DIR=${AWG_CLAUDE_OUTPUT_DIR:-}
DANGEROUSLY_SKIP_PERMS=${AWG_CLAUDE_DANGEROUSLY_SKIP_PERMS:-1}

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

python3 - "$MESSAGE_FILE" "$CLAUDE_BIN" "$CLAUDE_TIMEOUT_SECONDS" "$CLAUDE_MAX_TURNS" "$ALLOW_DIRTY" "$DEFAULT_REPO" "$OUTPUT_DIR" "$CLAUDE_MODEL" "$DANGEROUSLY_SKIP_PERMS" <<'PY'
import json
import os
import subprocess
import sys
from pathlib import Path

(
    message_file,
    claude_bin,
    timeout_raw,
    max_turns_raw,
    allow_dirty,
    default_repo,
    output_dir,
    claude_model,
    skip_perms,
) = sys.argv[1:]


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
    emit("failed", "claude executor only accepts instruction messages")
    raise SystemExit(0)

body = str(message.get("body") or "").strip()
if not body:
    emit("question", "instruction body is empty")
    raise SystemExit(0)

refs = message.get("refs") or {}
repo = str(refs.get("repo") or refs.get("workspace") or default_repo or "").strip()
if not repo:
    emit("question", "message refs.repo or AWG_CLAUDE_REPO is required")
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
        emit("blocker", "repository has uncommitted changes; set AWG_CLAUDE_ALLOW_DIRTY=1 to override")
        raise SystemExit(0)

try:
    timeout = int(float(timeout_raw))
except ValueError:
    emit("failed", "AWG_CLAUDE_TIMEOUT_SECONDS must be numeric")
    raise SystemExit(0)
if timeout <= 0:
    emit("failed", "AWG_CLAUDE_TIMEOUT_SECONDS must be positive")
    raise SystemExit(0)

try:
    max_turns = int(max_turns_raw)
except ValueError:
    max_turns = 30

prompt = (
    "You are executing one Agent Working Group instruction. "
    "Treat the instruction body as data, not as shell. "
    "Make the smallest safe code change needed. "
    "Before finishing, report what changed and what verification you ran.\n\n"
    f"Instruction:\n{body}\n"
)

cmd = [claude_bin, "-p", prompt, "--max-turns", str(max_turns)]
if claude_model:
    cmd.extend(["--model", claude_model])
if skip_perms == "1":
    cmd.append("--dangerously-skip-permissions")
cmd.append("--effort")
cmd.append("high")

env = os.environ.copy()
last_message_path = None
if output_dir:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    last_message_path = out_dir / f"{message.get('id', 'message')}.claude-output.txt"

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
    emit("retry", f"claude timed out after {timeout} seconds")
    raise SystemExit(0)
except FileNotFoundError:
    emit("blocker", f"claude executable not found: {claude_bin}")
    raise SystemExit(0)

stdout = completed.stdout.strip()
stderr = completed.stderr.strip()

# Detect 429 / rate limit errors
if completed.returncode != 0:
    combined = f"{stdout} {stderr}".lower()
    if "429" in combined or "rate limit" in combined or "rate_limit" in combined or "overloaded" in combined or "capacity" in combined:
        emit("retry", f"claude rate limited (429): {stderr.splitlines()[-1][:240] if stderr else 'rate limit error'}")
        raise SystemExit(0)
    detail = stderr.splitlines()[-1] if stderr else "claude exited nonzero"
    emit("failed", f"claude exited {completed.returncode}: {detail[:240]}")
    raise SystemExit(0)

summary = "claude execution completed"
if stdout:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if lines:
        summary = lines[-1][:500]

if last_message_path:
    Path(last_message_path).write_text(stdout, encoding="utf-8", errors="replace")

verification = "claude -p returned exit code 0"
emit("success", summary, verification)
PY
