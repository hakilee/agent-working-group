#!/usr/bin/env bash
set -euo pipefail

# Category: dashboard-operation
# Role: Install a macOS LaunchAgent that keeps the AWG dashboard running.

LABEL=${LABEL:-me.haklee.awg-dashboard}
REPO_ROOT=${REPO_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
AWG_ROOT=${AWG_ROOT:-"${REPO_ROOT}/.agent-working-group"}
DASHBOARD_HOST=${DASHBOARD_HOST:-127.0.0.1}
DASHBOARD_PORT=${DASHBOARD_PORT:-8000}
LAUNCHD_PATH=${LAUNCHD_PATH:-"/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.local/bin:${HOME}/.asdf/shims"}
LOG_DIR=${LOG_DIR:-"${AWG_ROOT}/log/dashboard"}
PLIST_PATH=${PLIST_PATH:-"${HOME}/Library/LaunchAgents/${LABEL}.plist"}
DRY_RUN=0
LOAD=1

usage() {
  cat <<'USAGE'
Usage: install-dashboard-launchd.sh [options]

Options:
  --label LABEL          LaunchAgent label. Default: me.haklee.awg-dashboard.
  --repo-root PATH       AWG repository root. Default: parent of scripts/.
  --awg-root PATH        AWG runtime root. Default: $repo/.agent-working-group.
  --host HOST            Dashboard bind host. Default: 127.0.0.1.
  --port PORT            Dashboard bind port. Default: 8000.
  --plist PATH           Output plist path. Default: ~/Library/LaunchAgents/$LABEL.plist.
  --path PATH            PATH exposed to launchd job. Default includes common
                         Homebrew/asdf/local locations.
  --dry-run              Print plist only; do not write or load.
  --no-load              Write plist but do not bootstrap/restart it.

Installs a per-user macOS LaunchAgent with RunAtLoad and KeepAlive so the AWG
dashboard restarts after crashes, logout/login, or reboot. The service runs the
existing scripts/awg-dashboard-start.sh entrypoint and keeps its existing manual
usage intact.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL=${2:?}; shift 2 ;;
    --repo-root) REPO_ROOT=${2:?}; shift 2 ;;
    --awg-root) AWG_ROOT=${2:?}; shift 2 ;;
    --host) DASHBOARD_HOST=${2:?}; shift 2 ;;
    --port) DASHBOARD_PORT=${2:?}; shift 2 ;;
    --plist) PLIST_PATH=${2:?}; shift 2 ;;
    --path) LAUNCHD_PATH=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;; 
    --no-load) LOAD=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

START_SCRIPT="${REPO_ROOT}/scripts/awg-dashboard-start.sh"
if [[ ! -x "$START_SCRIPT" ]]; then
  echo "dashboard start script is not executable: $START_SCRIPT" >&2
  exit 66
fi

mkdir -p "$LOG_DIR"
plist=$(python3 - "$LABEL" "$START_SCRIPT" "$REPO_ROOT" "$AWG_ROOT" "$DASHBOARD_HOST" "$DASHBOARD_PORT" "$LOG_DIR" "$LAUNCHD_PATH" <<'PY'
import plistlib
import sys

label, start_script, repo_root, awg_root, host, port, log_dir, path = sys.argv[1:]
plist = {
    "Label": label,
    "ProgramArguments": [start_script],
    "WorkingDirectory": repo_root,
    "EnvironmentVariables": {
        "AWG_ROOT": awg_root,
        "DASHBOARD_ROOT": awg_root,
        "DASHBOARD_HOST": host,
        "DASHBOARD_PORT": port,
        "DASHBOARD_LOG_LEVEL": "info",
        "PATH": path,
    },
    "RunAtLoad": True,
    "KeepAlive": {"SuccessfulExit": False},
    "StandardOutPath": f"{log_dir}/launchd.out.log",
    "StandardErrorPath": f"{log_dir}/launchd.err.log",
}
sys.stdout.buffer.write(plistlib.dumps(plist, fmt=plistlib.FMT_XML, sort_keys=False))
PY
)

if [[ "$DRY_RUN" == 1 ]]; then
  printf '%s' "$plist"
  exit 0
fi

mkdir -p "$(dirname "$PLIST_PATH")"
printf '%s' "$plist" >"$PLIST_PATH"
chmod 644 "$PLIST_PATH"

if [[ "$LOAD" == 1 ]]; then
  uid=$(id -u)
  launchctl bootout "gui/${uid}" "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/${uid}" "$PLIST_PATH"
  launchctl kickstart -k "gui/${uid}/${LABEL}"
fi

printf 'installed dashboard LaunchAgent: %s\n' "$PLIST_PATH"
