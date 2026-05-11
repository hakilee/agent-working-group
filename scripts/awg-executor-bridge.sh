#!/usr/bin/env bash
set -euo pipefail

# Category: agent-executor
# Role: Bridge that receives one AWG instruction and runs an executor with structured-result ack.

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${WORKER:-worker}
LEAD=${LEAD:-lead}
RECV_TIMEOUT=${RECV_TIMEOUT:-5}
AWG_REPORT_TARGET=${AWG_REPORT_TARGET:-}
LOG_DIR=${LOG_DIR:-"${AWG_ROOT}/log/executor-bridge"}

usage() {
  cat <<'USAGE'
Usage: scripts/awg-executor-bridge.sh [--worker NAME] [--lead NAME] [--root DIR] [--timeout SEC] -- EXECUTOR [ARGS...]

Receive one AWG instruction with require-ack, run an executor, and ack only
when the executor returns structured JSON with status=success.

This helper is opt-in. It never executes the message body as shell and never
edits queue JSON directly.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worker) WORKER=${2:?}; shift 2 ;;
    --lead) LEAD=${2:?}; shift 2 ;;
    --root) AWG_ROOT=${2:?}; shift 2 ;;
    --timeout) RECV_TIMEOUT=${2:?}; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    --) shift; break ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [[ $# -eq 0 ]]; then
  echo "executor command is required" >&2
  usage >&2
  exit 64
fi

mkdir -p "$LOG_DIR"
TMP_BASE=$(mktemp "${LOG_DIR}/${WORKER}.bridge.XXXXXX")
MSG_FILE="${TMP_BASE}.json"
ERR_FILE="${TMP_BASE}.recv.err"
OUT_FILE="${TMP_BASE}.executor.out"
EXEC_ERR_FILE="${TMP_BASE}.executor.err"
mv "$TMP_BASE" "$MSG_FILE"

send_to_lead() {
  local kind=$1
  local body=$2
  local reply_to=${3:-}
  if [[ -n "$reply_to" ]]; then
    "$AWG_CLI" --root "$AWG_ROOT" send --from "$WORKER" --to "$LEAD" --kind "$kind" --reply-to "$reply_to" --body "$body" >/dev/null || true
  else
    "$AWG_CLI" --root "$AWG_ROOT" send --from "$WORKER" --to "$LEAD" --kind "$kind" --body "$body" >/dev/null || true
  fi
}

json_get() {
  local file=$1
  local field=$2
  python3 - "$file" "$field" <<'PY'
import json, sys
path, field = sys.argv[1:3]
try:
    data = json.load(open(path, encoding="utf-8"))
except Exception:
    sys.exit(2)
value = data.get(field, "")
if isinstance(value, (dict, list)):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
elif value is None:
    print("")
else:
    print(str(value))
PY
}

RECV_ARGS=(--root "$AWG_ROOT" recv --as "$WORKER" --require-ack --timeout "$RECV_TIMEOUT")
if [[ -n "$AWG_REPORT_TARGET" ]]; then
  RECV_ARGS+=(--report-target "$AWG_REPORT_TARGET")
fi

if ! "$AWG_CLI" "${RECV_ARGS[@]}" >"$MSG_FILE" 2>"$ERR_FILE"; then
  if grep -qi 'timeout: no messages' "$ERR_FILE"; then
    rm -f "$MSG_FILE" "$ERR_FILE"
    exit 0
  fi
  cat "$ERR_FILE" >&2 || true
  exit 1
fi

ID=$(json_get "$MSG_FILE" id)
KIND=$(json_get "$MSG_FILE" kind)

if [[ "$KIND" != "instruction" ]]; then
  send_to_lead status "executor bridge skipped non-instruction message: id=${ID} kind=${KIND}" "$ID"
  "$AWG_CLI" --root "$AWG_ROOT" retry --as "$WORKER" --id "$ID" >/dev/null
  exit 0
fi

if ! "$@" "$MSG_FILE" >"$OUT_FILE" 2>"$EXEC_ERR_FILE"; then
  send_to_lead status "executor failed before structured success: id=${ID}" "$ID"
  exit 0
fi

if ! STATUS=$(json_get "$OUT_FILE" status); then
  send_to_lead status "executor returned malformed output: id=${ID}" "$ID"
  exit 0
fi

SUMMARY=$(json_get "$OUT_FILE" summary || true)
[[ -n "$SUMMARY" ]] || SUMMARY="executor returned status=${STATUS}"
VERIFICATION=$(json_get "$OUT_FILE" verification || true)
QUESTION=$(json_get "$OUT_FILE" question || true)

case "$STATUS" in
  success)
    BODY="executor success: ${SUMMARY}"
    [[ -n "$VERIFICATION" ]] && BODY="${BODY}; verification: ${VERIFICATION}"
    send_to_lead status "$BODY" "$ID"
    "$AWG_CLI" --root "$AWG_ROOT" ack --as "$WORKER" --id "$ID" >/dev/null
    ;;
  retry)
    send_to_lead status "executor retry: ${SUMMARY}" "$ID"
    "$AWG_CLI" --root "$AWG_ROOT" retry --as "$WORKER" --id "$ID" >/dev/null
    ;;
  question)
    [[ -n "$QUESTION" ]] || QUESTION="$SUMMARY"
    send_to_lead question "$QUESTION" "$ID"
    ;;
  blocker)
    send_to_lead blocker "executor blocker: ${SUMMARY}" "$ID"
    ;;
  failed)
    send_to_lead status "executor failed: ${SUMMARY}; operator decides retry or dead-letter" "$ID"
    ;;
  *)
    send_to_lead status "executor returned unknown status: ${STATUS}; id=${ID}" "$ID"
    ;;
esac
