from __future__ import annotations

import fcntl
import json
import os
import shutil
import sys
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class MessageKind(str, Enum):
    BLOCKER = "blocker"
    QUESTION = "question"
    ANSWER = "answer"
    INSTRUCTION = "instruction"
    STATUS = "status"
    NOTE = "note"


PRIORITIES = {
    MessageKind.BLOCKER.value: 99,
    MessageKind.QUESTION.value: 70,
    MessageKind.ANSWER.value: 60,
    MessageKind.INSTRUCTION.value: 50,
    MessageKind.STATUS.value: 30,
    MessageKind.NOTE.value: 10,
}


def default_root() -> Path:
    return Path(os.environ.get("AWG_ROOT", Path.cwd() / ".agent-working-group")).expanduser()


def now_ms() -> int:
    return int(time.time() * 1000)


def utc_iso(ms: int) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ms / 1000))


def iso_from_ms(ms: object, tz: str = "UTC") -> object:
    if not ms:
        return None
    if tz == "UTC":
        return utc_iso(ms)
    if tz == "local":
        return time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(ms / 1000))
    try:
        return datetime.fromtimestamp(ms / 1000, ZoneInfo(tz)).isoformat()
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"unknown timezone: {tz}") from exc


def parse_filename(path: Path) -> tuple:
    parts = path.name.split("_", 2)
    try:
        timestamp_ms = int(parts[0])
        priority = int(parts[1])
    except (IndexError, ValueError):
        timestamp_ms = 0
        priority = 0
    return priority, timestamp_ms, path.name


def sorted_for_delivery(directory: Path) -> list:
    files = [path for path in directory.glob("*.json") if path.is_file()]
    return sorted(files, key=lambda path: (-parse_filename(path)[0], parse_filename(path)[1], parse_filename(path)[2]))


def sorted_by_time(directory: Path) -> list:
    files = [path for path in directory.glob("*.json") if path.is_file()]
    return sorted(files, key=lambda path: (parse_filename(path)[1], path.name))


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


@dataclass(frozen=True)
class QueuePaths:
    inbox: Path
    processing: Path
    processed: Path
    dead: Path


class MessageQueue:
    """File-backed queue for a small group of cooperating agents."""

    def __init__(self, root: object = None):
        self.root = Path(root).expanduser() if root else default_root()

    def paths(self, agent: str) -> QueuePaths:
        base = self.root / "queues" / agent
        paths = QueuePaths(
            inbox=base / "inbox",
            processing=base / "processing",
            processed=base / "processed",
            dead=base / "dead",
        )
        for path in paths.__dict__.values():
            path.mkdir(parents=True, exist_ok=True)
        return paths

    def initialize(self, agents: Iterable = ()) -> None:
        (self.root / "log").mkdir(parents=True, exist_ok=True)
        (self.root / "tmp" / "locks").mkdir(parents=True, exist_ok=True)
        (self.root / "log" / "messages.jsonl").touch(exist_ok=True)
        for agent in agents:
            self.paths(agent)

    @contextmanager
    def lock(self, agent: str):
        lock_dir = self.root / "tmp" / "locks"
        lock_dir.mkdir(parents=True, exist_ok=True)
        lock_path = lock_dir / f"{agent}.lock"
        with lock_path.open("w", encoding="utf-8") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def send(
        self,
        sender: str,
        recipient: str,
        kind: str,
        body: str,
        reply_to: object = None,
        *,
        correlation_id: object = None,
        parent_id: object = None,
        source_channel: object = None,
        report_target: object = None,
        repo: object = None,
        workspace: object = None,
    ) -> str:
        if kind not in PRIORITIES:
            raise ValueError(f"unknown kind: {kind}")
        self.initialize([recipient])
        message_id = str(uuid.uuid4())
        created_ms = now_ms()
        priority = PRIORITIES[kind]
        refs: dict = {}
        if reply_to:
            refs["replyTo"] = reply_to
        if correlation_id:
            refs["correlationId"] = correlation_id
        if parent_id:
            refs["parentId"] = parent_id
        if source_channel:
            refs["sourceChannel"] = source_channel
        if report_target:
            refs["reportTarget"] = report_target
        if repo:
            refs["repo"] = repo
        if workspace:
            refs["workspace"] = workspace
        message = {
            "id": message_id,
            "kind": kind,
            "from": sender,
            "to": recipient,
            "body": body,
            "refs": refs,
            "priority": priority,
            "createdAt": utc_iso(created_ms),
            "createdAtMs": created_ms,
        }
        filename = f"{created_ms:013d}_{priority:02d}_{message_id[:8]}.json"
        tmp_dir = self.root / "tmp"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        tmp_path = tmp_dir / filename
        final_path = self.paths(recipient).inbox / filename
        write_json(tmp_path, message)
        shutil.move(str(tmp_path), str(final_path))
        with (self.root / "log" / "messages.jsonl").open("a", encoding="utf-8") as handle:
            json.dump(message, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        return message_id

    def receive(self, agent: str, timeout: object = None, require_ack: bool = False) -> dict | None:
        paths = self.paths(agent)
        start = time.monotonic()
        while True:
            with self.lock(agent):
                files = sorted_for_delivery(paths.inbox)
                if files:
                    path = files[0]
                    message = read_json(path)
                    target_dir = paths.processing if require_ack else paths.processed
                    if require_ack:
                        received_ms = now_ms()
                        refs = message.setdefault("refs", {})
                        refs["receivedAt"] = utc_iso(received_ms)
                        refs["receivedAtMs"] = received_ms
                        write_json(path, message)
                    shutil.move(str(path), str(target_dir / path.name))
                    return message
            if timeout is not None and time.monotonic() - start >= timeout:
                return None
            time.sleep(0.5)

    def peek(self, agent: str) -> list:
        return load_messages(sorted_for_delivery(self.paths(agent).inbox))

    def processing(self, agent: str, limit: object = None) -> list:
        return self._load_limited(self.paths(agent).processing, limit)

    def processed(self, agent: str, limit: object = None, tz: str = "UTC") -> list:
        messages = self._load_limited(self.paths(agent).processed, limit)
        if tz != "UTC":
            enrich_times(messages, tz)
        return messages

    def dead(self, agent: str, limit: object = None) -> list:
        return self._load_limited(self.paths(agent).dead, limit)

    def _load_limited(self, directory: Path, limit: object) -> list:
        files = sorted_by_time(directory)
        if limit is not None:
            files = files[-limit:]
        return load_messages(files)

    def status(self, agent: str, tz: str = "UTC") -> dict:
        paths = self.paths(agent)
        pending_files = sorted_for_delivery(paths.inbox)
        processing_files = sorted_by_time(paths.processing)
        processed_files = sorted_by_time(paths.processed)
        next_ms = parse_filename(pending_files[0])[1] if pending_files else None
        last_ms = parse_filename(processed_files[-1])[1] if processed_files else None
        return {
            "agent": agent,
            "pending": len(pending_files),
            "processing": len(processing_files),
            "processed": len(processed_files),
            "dead": len(sorted_by_time(paths.dead)),
            "next": pending_files[0].name if pending_files else None,
            "nextAt": iso_from_ms(next_ms),
            "nextAtLocal": iso_from_ms(next_ms, tz),
            "lastProcessed": processed_files[-1].name if processed_files else None,
            "lastProcessedAt": iso_from_ms(last_ms),
            "lastProcessedAtLocal": iso_from_ms(last_ms, tz),
        }

    def ack(self, agent: str, message_id: str) -> str:
        paths = self.paths(agent)
        with self.lock(agent):
            path = find_message_file(paths.processing, message_id)
            if not path:
                raise FileNotFoundError(f"message not in processing: {message_id}")
            message = read_json(path)
            message.setdefault("refs", {})["ackedAt"] = utc_iso(now_ms())
            write_json(path, message)
            shutil.move(str(path), str(paths.processed / path.name))
        return message_id

    def ack_pending(
        self,
        agent: str,
        message_id: str,
        expect_kind: str | None = None,
        expect_from: str | None = None,
        expect_to: str | None = None,
        expect_created_at: str | None = None,
    ) -> str:
        paths = self.paths(agent)
        with self.lock(agent):
            path = find_message_file(paths.inbox, message_id)
            if not path:
                raise FileNotFoundError(f"message not in inbox: {message_id}")
            matches = find_message_files(paths.inbox, message_id)
            if len(matches) > 1:
                raise ValueError(f"multiple inbox files match id {message_id}")

            message = read_json(path)
            if message.get("id") != message_id:
                raise FileNotFoundError(f"message not in inbox: {message_id}")

            expected = {
                "kind": expect_kind,
                "from": expect_from,
                "to": expect_to,
                "createdAt": expect_created_at,
            }
            for field, value in expected.items():
                if value is None:
                    continue
                actual = message.get(field)
                if actual != value:
                    option = field.replace("createdAt", "created-at")
                    raise ValueError(
                        f"expect-{option} mismatch: expected={value} actual={actual} for message {message_id}"
                    )

            message.setdefault("refs", {})["ackedAt"] = utc_iso(now_ms())
            write_json(path, message)
            shutil.move(str(path), str(paths.processed / path.name))
        return message_id

    def retry(self, agent: str, message_id: str) -> str:
        paths = self.paths(agent)
        with self.lock(agent):
            path = find_message_file(paths.processing, message_id) or find_message_file(paths.processed, message_id)
            if not path:
                raise FileNotFoundError(f"message not found for retry: {message_id}")
            message = read_json(path)
            refs = message.setdefault("refs", {})
            refs["retriedAt"] = utc_iso(now_ms())
            refs["retryCount"] = int(refs.get("retryCount", 0)) + 1
            write_json(path, message)
            shutil.move(str(path), str(paths.inbox / path.name))
        return message_id

    def requeue_stale(self, agent: str, older_than_sec: float = 300, max_retries: object = None) -> dict:
        paths = self.paths(agent)
        cutoff = now_ms() - int(older_than_sec * 1000)
        requeued = 0
        dead = 0
        with self.lock(agent):
            for path in sorted_by_time(paths.processing):
                message = read_json(path)
                refs = message.setdefault("refs", {})
                stale_ms = int(refs.get("receivedAtMs") or parse_filename(path)[1])
                if stale_ms > cutoff:
                    continue
                retry_count = int(refs.get("retryCount", 0)) + 1
                refs["retryCount"] = retry_count
                refs["retriedAt"] = utc_iso(now_ms())
                write_json(path, message)
                if max_retries is not None and retry_count > max_retries:
                    shutil.move(str(path), str(paths.dead / path.name))
                    dead += 1
                else:
                    shutil.move(str(path), str(paths.inbox / path.name))
                    requeued += 1
        return {"agent": agent, "requeued": requeued, "dead": dead}

    def prune(
        self,
        agent=None,
        processed_keep: int = 1000,
        log_keep_lines=None,
        dry_run: bool = False,
        include_processing: bool = False,
        processing_keep: int = 100,
    ) -> dict:
        queue_files = []
        queues_dir = self.root / "queues"
        agents = [agent] if agent else [path.name for path in queues_dir.iterdir() if path.is_dir()] if queues_dir.exists() else []
        for name in agents:
            paths = self.paths(name)
            queue_files.extend(files_to_prune(sorted_by_time(paths.processed), processed_keep))
            if include_processing:
                queue_files.extend(files_to_prune(sorted_by_time(paths.processing), processing_keep))
        log_removed = self._prune_log(log_keep_lines, dry_run) if log_keep_lines is not None else 0
        if not dry_run:
            archive = self.root / "log" / "pruned"
            archive.mkdir(parents=True, exist_ok=True)
            for path in queue_files:
                destination = archive / f"{now_ms()}_{path.parent.parent.name}_{path.parent.name}_{path.name}"
                shutil.move(str(path), str(destination))
        return {"dryRun": dry_run, "queueFiles": len(queue_files), "logLines": log_removed}

    def _prune_log(self, keep_lines: int, dry_run: bool) -> int:
        log_path = self.root / "log" / "messages.jsonl"
        if not log_path.exists():
            return 0
        lines = log_path.read_text(encoding="utf-8").splitlines(True)
        removed = max(0, len(lines) - keep_lines)
        if removed and not dry_run:
            archive = self.root / "log" / "pruned"
            archive.mkdir(parents=True, exist_ok=True)
            archive_path = archive / f"{now_ms()}_messages_pruned.jsonl"
            archive_path.write_text("".join(lines[:removed]), encoding="utf-8")
            log_path.write_text("".join(lines[-keep_lines:]), encoding="utf-8")
        return removed

    def log_lines(self, tz: str = "UTC") -> list[str]:
        log_path = self.root / "log" / "messages.jsonl"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.touch(exist_ok=True)
        if tz == "UTC":
            return log_path.read_text(encoding="utf-8").splitlines()
        lines: list[str] = []
        for line in log_path.read_text(encoding="utf-8").splitlines():
            message = json.loads(line)
            if message.get("createdAtMs"):
                message["createdAtLocal"] = iso_from_ms(message["createdAtMs"], tz)
            lines.append(json.dumps(message, ensure_ascii=False, separators=(",", ":")))
        return lines

    def cleanup_artifacts(
        self,
        dry_run: bool = True,
        temp_file_min_age_sec: float = 3600,
        stale_lock_min_age_sec: float = 600,
    ) -> dict:
        """Remove generated clutter without touching queue state."""
        now = time.time()
        worker_log_dir = self.root / "log" / "worker-sessions"
        locks_dir = self.root / "tmp" / "locks"
        candidates: list[Path] = []
        removed: list[str] = []
        preserved: list[dict[str, str]] = []
        manual_review: list[dict[str, str]] = []

        for pattern in ("*.msg.*.json", "*.msg.*.json.err"):
            if worker_log_dir.exists():
                for path in worker_log_dir.glob(pattern):
                    if not path.is_file():
                        continue
                    age = now - path.stat().st_mtime
                    if age >= temp_file_min_age_sec:
                        candidates.append(path)
                    else:
                        preserved.append({"path": str(path), "reason": "worker temp file is too new"})

        if locks_dir.exists():
            for path in locks_dir.glob("*-worker-loop.lockdir"):
                if not path.is_dir():
                    continue
                age = now - path.stat().st_mtime
                if age < stale_lock_min_age_sec:
                    preserved.append({"path": str(path), "reason": "worker lock directory is too new"})
                    continue
                if any(path.iterdir()):
                    manual_review.append({"path": str(path), "reason": "worker lock directory is not empty; refusing rm -rf"})
                    continue
                candidates.append(path)

        queue_json = [str(path) for path in (self.root / "queues").glob("*/*/*.json") if path.is_file()] if (self.root / "queues").exists() else []

        if not dry_run:
            for path in candidates:
                if path.is_dir():
                    try:
                        path.rmdir()
                        removed.append(str(path))
                    except OSError:
                        manual_review.append({"path": str(path), "reason": "rmdir failed; refusing rm -rf"})
                else:
                    path.unlink(missing_ok=True)
                    removed.append(str(path))

        return {
            "dryRun": dry_run,
            "candidates": [str(path) for path in candidates],
            "removed": removed,
            "preserved": preserved,
            "manualReview": manual_review,
            "queueJsonPreserved": len(queue_json),
        }



def files_to_prune(files, keep: int):
    if keep == 0:
        return list(files)
    if keep > 0:
        return list(files[:-keep])
    return []


def load_messages(paths: list) -> list:
    messages: list = []
    for path in paths:
        try:
            message = read_json(path)
            message["_file"] = path.name
            messages.append(message)
        except json.JSONDecodeError as exc:
            messages.append({"error": "invalid json", "file": path.name, "detail": str(exc)})
    return messages


def enrich_times(messages: list, tz: str) -> None:
    for message in messages:
        if message.get("createdAtMs"):
            message["createdAtLocal"] = iso_from_ms(message["createdAtMs"], tz)


def find_message_file(directory: Path, message_id: str) -> Path | None:
    matches = find_message_files(directory, message_id)
    return matches[0] if matches else None


def find_message_files(directory: Path, message_id: str) -> list[Path]:
    matches: list[Path] = []
    for path in directory.glob("*.json"):
        if message_id in path.name:
            matches.append(path)
            continue
        try:
            if read_json(path).get("id") == message_id:
                matches.append(path)
        except json.JSONDecodeError:
            continue
    return matches
