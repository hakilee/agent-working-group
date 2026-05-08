#!/usr/bin/env bash
set -euo pipefail

SOURCE=""
DEST_DIR=""
APPLY=0

usage() {
  cat <<'USAGE'
Usage: scripts/awg-archive-artifact.sh --source PATH (--completed-dir DIR | --archive-dir DIR) [--apply]

Move one operational artifact into a completed or archive directory.

Default mode is dry-run. Pass --apply to perform the move. This helper never
deletes files and never touches AWG queue JSON.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source) SOURCE=${2:?}; shift 2 ;;
    --completed-dir|--archive-dir) DEST_DIR=${2:?}; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --dry-run) APPLY=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [ -z "$SOURCE" ] || [ -z "$DEST_DIR" ]; then
  echo "--source and a destination directory are required" >&2
  usage >&2
  exit 64
fi

if [ ! -f "$SOURCE" ]; then
  echo "source is not a file: $SOURCE" >&2
  exit 66
fi

case "$SOURCE" in
  */queues/*/*.json|*/queues/*/*/*.json)
    echo "refusing to move queue JSON; use AWG queue commands instead" >&2
    exit 65
    ;;
esac

mkdir -p "$DEST_DIR"
DEST="$DEST_DIR/$(basename "$SOURCE")"

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
