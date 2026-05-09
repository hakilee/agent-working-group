#!/usr/bin/env bash
set -euo pipefail

ROOT=""
FORMAT="markdown"
LIMIT=""

usage() {
  cat <<'USAGE'
Usage: awg-artifact-index.sh --root DIR [--format markdown|json] [--limit N]

Generate a read-only index for an AWG ops artifact workspace. DIR must be an
artifact workspace containing active/, completed/, or archive/. Output goes to
stdout. This helper never writes, moves, deletes, or edits artifacts.
USAGE
}

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "$1 requires a non-empty value" >&2
    exit 64
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --root) require_value "$1" "${2-}"; ROOT=$2; shift 2 ;;
    --format) require_value "$1" "${2-}"; FORMAT=$2; shift 2 ;;
    --limit) require_value "$1" "${2-}"; LIMIT=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [ -z "$ROOT" ]; then
  echo "--root is required" >&2
  usage >&2
  exit 64
fi

case "$FORMAT" in
  markdown|json) ;;
  *) echo "--format must be markdown or json" >&2; exit 64 ;;
esac

python3 - "$ROOT" "$FORMAT" "$LIMIT" <<'PY'
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(sys.argv[1]).expanduser()
fmt = sys.argv[2]
limit_arg = sys.argv[3]

try:
    limit = None if not limit_arg else int(limit_arg)
except ValueError:
    print("--limit must be an integer", file=sys.stderr)
    sys.exit(64)
if limit is not None and limit < 0:
    print("--limit must be non-negative", file=sys.stderr)
    sys.exit(64)

try:
    resolved_root = root.resolve(strict=True)
except FileNotFoundError:
    print(f"artifact root does not exist: {root}", file=sys.stderr)
    sys.exit(66)

if not resolved_root.is_dir():
    print(f"artifact root is not a directory: {root}", file=sys.stderr)
    sys.exit(66)

parts = set(resolved_root.parts)
if ".agent-working-group" in parts or "queues" in parts:
    print(f"refusing to index queue/runtime state as artifacts: {root}", file=sys.stderr)
    sys.exit(65)

statuses = ("active", "completed", "archive")
if not any((resolved_root / status).is_dir() for status in statuses):
    print("artifact root must contain at least one of active/, completed/, or archive/", file=sys.stderr)
    sys.exit(66)

timestamp_re = re.compile(r"^(\d{12})-(.+)\.md$")

def created_from_name(name):
    match = timestamp_re.match(name)
    if not match:
        return ""
    raw = match.group(1)
    return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]} {raw[8:10]}:{raw[10:12]}"

def task_from_name(name):
    match = timestamp_re.match(name)
    stem = match.group(2) if match else Path(name).stem
    return stem.replace("-", " ")

def first_heading(path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if stripped.startswith("#"):
                    return stripped.lstrip("#").strip()
    except UnicodeDecodeError:
        return ""
    return ""

items = []
for status in statuses:
    directory = resolved_root / status
    if not directory.is_dir():
        continue
    for path in sorted(directory.glob("*.md")):
        stat = path.stat()
        items.append({
            "filename": path.name,
            "status": status,
            "task": task_from_name(path.name),
            "created": created_from_name(path.name),
            "relativePath": str(path.relative_to(resolved_root)),
            "sizeBytes": stat.st_size,
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
            "title": first_heading(path),
        })

items.sort(key=lambda item: (item["created"] or "0000-00-00 00:00", item["relativePath"]), reverse=True)
if limit is not None:
    items = items[:limit]

payload = {
    "root": str(resolved_root),
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "count": len(items),
    "items": items,
}

if fmt == "json":
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# AWG Artifact Index")
    print()
    print(f"Generated: {payload['generatedAt']}")
    print(f"Root: `{resolved_root}`")
    print(f"Count: {len(items)}")
    print()
    print("| Filename | Status | Task | Created | Notes |")
    print("| --- | --- | --- | --- | --- |")
    for item in items:
        title = item["title"].replace("|", "\\|")
        print(f"| `{item['relativePath']}` | {item['status']} | {item['task']} | {item['created']} | {title} |")
PY
