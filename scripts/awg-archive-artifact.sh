#!/usr/bin/env bash
set -euo pipefail

# Category: artifact
# Role: Move one operational artifact into a completed or archive directory (dry-run by default).

SOURCE=""
DEST_DIR=""
ALLOWED_BASE=""
APPLY=0

usage() {
  cat <<'USAGE'
Usage: scripts/awg-archive-artifact.sh --allowed-base DIR --source PATH (--completed-dir DIR | --archive-dir DIR) [--apply]

Move one operational artifact into a completed or archive directory.

Default mode is dry-run. Pass --apply to perform the move. This helper never
deletes files and never touches AWG queue JSON.

--allowed-base DIR defines the artifact workspace boundary. The helper validates
the source and resolved destination path before creating directories or moving files.
USAGE
}

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "$1 requires a non-empty value" >&2
    exit 64
  fi
}

reject_queue_path() {
  case "$1" in
    queues|queues/*|*/queues|*/queues/*|*/queues/*/*.json|*/queues/*/*/*.json)
      echo "refusing to move queue state; use AWG queue commands instead: $1" >&2
      exit 65
      ;;
  esac
}

validate_contained() {
  local label=$1
  local target=$2

  if [ -z "$ALLOWED_BASE" ]; then
    return 0
  fi

  if [ ! -d "$ALLOWED_BASE" ]; then
    echo "allowed base is not a directory: $ALLOWED_BASE" >&2
    exit 66
  fi

  local script_dir repo_root
  script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)

  # Reuse Python path semantics so containment is canonical, not string-prefix based.
  PYTHONPATH="$repo_root/src${PYTHONPATH:+:$PYTHONPATH}" python3 -c '
import sys
from agent_working_group.path_safety import PathSafetyError, require_contained_path

base, target, label = sys.argv[1:4]
try:
    require_contained_path(base, target)
except (PathSafetyError, OSError) as exc:
    print(f"{label} escapes allowed base: {exc}", file=sys.stderr)
    sys.exit(65)
' "$ALLOWED_BASE" "$target" "$label"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source) require_value "$1" "${2-}"; SOURCE=$2; shift 2 ;;
    --completed-dir|--archive-dir) require_value "$1" "${2-}"; DEST_DIR=$2; shift 2 ;;
    --allowed-base) require_value "$1" "${2-}"; ALLOWED_BASE=$2; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --dry-run) APPLY=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [ -z "$SOURCE" ] || [ -z "$DEST_DIR" ] || [ -z "$ALLOWED_BASE" ]; then
  echo "--allowed-base, --source, and a destination directory are required" >&2
  usage >&2
  exit 64
fi

if [ ! -f "$SOURCE" ]; then
  echo "source is not a file: $SOURCE" >&2
  exit 66
fi

reject_queue_path "$SOURCE"
reject_queue_path "$DEST_DIR"

DEST="$DEST_DIR/$(basename "$SOURCE")"
reject_queue_path "$DEST"
validate_contained "source" "$SOURCE"
validate_contained "destination" "$DEST"

mkdir -p "$DEST_DIR"

if [ -e "$DEST" ]; then
  echo "destination already exists: $DEST" >&2
  exit 73
fi

if [ "$APPLY" = "1" ]; then
  mv "$SOURCE" "$DEST"
  echo "moved $SOURCE -> $DEST"
else
  echo "dry-run: would move $SOURCE -> $DEST"
  echo "pass --apply to perform the move"
fi
