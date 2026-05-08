from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from .queue import MessageQueue


def print_json(data) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="awg")
    parser.add_argument("--root", help="Working-group root directory. Defaults to AWG_ROOT or ./.agent-working-group.")
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init")
    init.add_argument("--agent", action="append", default=[])

    send = sub.add_parser("send")
    send.add_argument("--from", required=True, dest="sender")
    send.add_argument("--to", required=True, dest="recipient")
    send.add_argument("--kind", required=True)
    send.add_argument("--reply-to")
    send.add_argument("--correlation-id")
    send.add_argument("--parent-id")
    send.add_argument("--source-channel")
    send.add_argument("--report-target")
    send.add_argument("--repo")
    send.add_argument("--workspace")
    send.add_argument("--body", required=True)

    recv = sub.add_parser("recv")
    recv.add_argument("--as", required=True, dest="agent")
    recv.add_argument("--timeout", type=float)
    recv.add_argument("--require-ack", action="store_true")

    for name in ("peek", "processing", "processed", "dead"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--as", required=True, dest="agent")
        if name != "peek":
            cmd.add_argument("--limit", type=int)
        if name == "processed":
            cmd.add_argument("--local", action="store_true")
            cmd.add_argument("--tz", default="UTC")

    pending = sub.add_parser("pending")
    pending.add_argument("--as", required=True, dest="agent")
    pending.add_argument("--json", action="store_true")

    status = sub.add_parser("status")
    status.add_argument("--as", required=True, dest="agent")
    status.add_argument("--local", action="store_true")
    status.add_argument("--tz", default="UTC")

    for name in ("ack", "retry", "nack"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--as", required=True, dest="agent")
        cmd.add_argument("--id", required=True)

    ack_pending = sub.add_parser("ack-pending")
    ack_pending.add_argument("--as", required=True, dest="agent")
    ack_pending.add_argument("--id", required=True)
    ack_pending.add_argument("--expect-kind")
    ack_pending.add_argument("--expect-from")
    ack_pending.add_argument("--expect-to")
    ack_pending.add_argument("--expect-created-at")

    stale = sub.add_parser("requeue-stale")
    stale.add_argument("--as", required=True, dest="agent")
    stale.add_argument("--older-than-sec", type=float, default=300)
    stale.add_argument("--max-retries", type=int)

    prune = sub.add_parser("prune")
    prune.add_argument("--as", dest="agent")
    prune.add_argument("--processed-keep", type=int, default=1000)
    prune.add_argument("--include-processing", action="store_true")
    prune.add_argument("--processing-keep", type=int, default=100)
    prune.add_argument("--log-keep-lines", type=int)
    prune.add_argument("--dry-run", action="store_true")

    cleanup = sub.add_parser("cleanup-artifacts")
    cleanup.add_argument("--dry-run", action="store_true")
    cleanup.add_argument("--temp-file-min-age-sec", type=float, default=3600)
    cleanup.add_argument("--stale-lock-min-age-sec", type=float, default=600)

    log = sub.add_parser("log")
    log.add_argument("--follow", action="store_true")
    log.add_argument("--local", action="store_true")
    log.add_argument("--tz", default="UTC")
    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    queue = MessageQueue(args.root)

    try:
        if args.command == "init":
            queue.initialize(args.agent)
            return 0
        if args.command == "send":
            print(queue.send(
                args.sender,
                args.recipient,
                args.kind,
                args.body,
                args.reply_to,
                correlation_id=args.correlation_id,
                parent_id=args.parent_id,
                source_channel=args.source_channel,
                report_target=args.report_target,
                repo=args.repo,
                workspace=args.workspace,
            ))
            return 0
        if args.command == "recv":
            message = queue.receive(args.agent, args.timeout, args.require_ack)
            if message is None:
                print(f"timeout: no messages for {args.agent}", file=sys.stderr)
                return 1
            print(json.dumps(message, ensure_ascii=False, separators=(",", ":")))
            return 0
        if args.command == "peek":
            print_json(queue.peek(args.agent))
            return 0
        if args.command == "pending":
            count = len(queue.peek(args.agent))
            print_json({"agent": args.agent, "pending": count}) if args.json else print(count)
            return 0
        if args.command == "processing":
            print_json(queue.processing(args.agent, args.limit))
            return 0
        if args.command == "processed":
            tz = "local" if args.local else args.tz
            print_json(queue.processed(args.agent, args.limit, tz))
            return 0
        if args.command == "dead":
            print_json(queue.dead(args.agent, args.limit))
            return 0
        if args.command == "status":
            print_json(queue.status(args.agent, "local" if args.local else args.tz))
            return 0
        if args.command == "ack":
            print(queue.ack(args.agent, args.id))
            return 0
        if args.command == "ack-pending":
            print(queue.ack_pending(
                args.agent,
                args.id,
                expect_kind=args.expect_kind,
                expect_from=args.expect_from,
                expect_to=args.expect_to,
                expect_created_at=args.expect_created_at,
            ))
            return 0
        if args.command in {"retry", "nack"}:
            print(queue.retry(args.agent, args.id))
            return 0
        if args.command == "requeue-stale":
            print_json(queue.requeue_stale(args.agent, args.older_than_sec, args.max_retries))
            return 0
        if args.command == "prune":
            print_json(queue.prune(
                args.agent,
                args.processed_keep,
                args.log_keep_lines,
                args.dry_run,
                args.include_processing,
                args.processing_keep,
            ))
            return 0
        if args.command == "cleanup-artifacts":
            print_json(queue.cleanup_artifacts(
                args.dry_run,
                args.temp_file_min_age_sec,
                args.stale_lock_min_age_sec,
            ))
            return 0
        if args.command == "log":
            if args.follow:
                log_path = queue.root / "log" / "messages.jsonl"
                log_path.parent.mkdir(parents=True, exist_ok=True)
                log_path.touch(exist_ok=True)
                return subprocess.run(["tail", "-f", str(log_path)], check=False).returncode
            for line in queue.log_lines("local" if args.local else args.tz):
                print(line)
            return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    parser.error(f"unhandled command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
