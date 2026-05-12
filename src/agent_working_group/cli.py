from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from .hooks import dispatch_hooks, results_to_dicts
from .queue import MessageQueue, default_root, find_message_file, read_json
from .timeout import DEFAULT_PROCESSING_TIMEOUT_SEC, TimeoutChecker


def print_json(data) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def _scan_heartbeats(root: Path, timeout_seconds: int) -> list[dict]:
    alerts: list[dict] = []
    heartbeats_dir = root / "heartbeats"
    queues_dir = root / "queues"
    now = int(time.time())

    if heartbeats_dir.is_dir():
        for agent_dir in sorted(heartbeats_dir.iterdir()):
            if not agent_dir.is_dir():
                continue
            for ts_file in sorted(agent_dir.glob("*.ts")):
                if not ts_file.is_file():
                    continue
                session = ts_file.stem
                try:
                    raw = ts_file.read_text(encoding="utf-8").strip().splitlines()[0].strip()
                except (OSError, IndexError):
                    raw = ""
                if not raw.isdigit():
                    alerts.append({
                        "type": "heartbeat.stale",
                        "agent": agent_dir.name,
                        "session": session,
                        "age_seconds": 0,
                        "timeout_seconds": int(timeout_seconds),
                    })
                    continue
                age = now - int(raw)
                if age > timeout_seconds:
                    alerts.append({
                        "type": "heartbeat.stale",
                        "agent": agent_dir.name,
                        "session": session,
                        "age_seconds": int(age),
                        "timeout_seconds": int(timeout_seconds),
                    })

    if queues_dir.is_dir():
        for agent_dir in sorted(queues_dir.iterdir()):
            if not agent_dir.is_dir():
                continue
            processing = agent_dir / "processing"
            if not processing.is_dir():
                continue
            if not any(processing.glob("*.json")):
                continue
            agent_heartbeat_dir = heartbeats_dir / agent_dir.name
            if not agent_heartbeat_dir.is_dir() or not any(agent_heartbeat_dir.glob("*.ts")):
                alerts.append({
                    "type": "heartbeat.missing",
                    "agent": agent_dir.name,
                    "session": "",
                })
    return alerts


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
    send.add_argument("--work-id")
    send.add_argument("--parent-id")
    send.add_argument("--source-channel")
    send.add_argument("--report-target")
    send.add_argument("--repo")
    send.add_argument("--workspace")
    send.add_argument("--body", required=True)
    send.add_argument("--expected-response-within", type=int, help="Optional response contract: integer seconds within which a reply is expected.")
    send.add_argument("--dispatch-hooks", action="store_true", help="Run matching message.sent hooks after the message is durably enqueued.")
    send.add_argument("--hook-config", help="Path to hooks.json. Defaults to <AWG_ROOT>/hooks.json.")

    recv = sub.add_parser("recv")
    recv.add_argument("--as", required=True, dest="agent")
    recv.add_argument("--timeout", type=float)
    recv.add_argument("--require-ack", action="store_true")
    recv.add_argument("--report-target", help="Only receive messages whose refs.reportTarget matches this target; unmatched messages stay pending.")

    for name in ("peek", "processing", "processed", "dead"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--as", required=True, dest="agent")
        if name != "peek":
            cmd.add_argument("--limit", type=int)
        else:
            cmd.add_argument("--report-target", help="Only show pending messages matching this report target.")
        if name == "processed":
            cmd.add_argument("--local", action="store_true")
            cmd.add_argument("--tz", default="UTC")

    pending = sub.add_parser("pending")
    pending.add_argument("--as", required=True, dest="agent")
    pending.add_argument("--json", action="store_true")
    pending.add_argument("--report-target", help="Only count pending messages matching this report target.")

    status = sub.add_parser("status")
    status.add_argument("--as", required=True, dest="agent")
    status.add_argument("--local", action="store_true")
    status.add_argument("--tz", default="UTC")
    status.add_argument("--report-target", help="Only count/point at pending messages matching this report target.")

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

    dispatch = sub.add_parser("dispatch-hooks")
    dispatch.add_argument("--event", required=True, choices=("message.sent", "message.pending", "on_processing"))
    dispatch.add_argument("--as", required=True, dest="agent", help="Agent queue to inspect for matching pending messages.")
    dispatch.add_argument("--id", help="Limit dispatch to one pending message id.")
    dispatch.add_argument("--report-target", help="Only dispatch hooks for pending messages matching this report target.")
    dispatch.add_argument("--hook-config", help="Path to hooks.json. Defaults to <AWG_ROOT>/hooks.json.")
    dispatch.add_argument("--dry-run", action="store_true")

    log = sub.add_parser("log")
    log.add_argument("--follow", action="store_true")
    log.add_argument("--local", action="store_true")
    log.add_argument("--tz", default="UTC")

    heartbeat_write = sub.add_parser(
        "worker-heartbeat-write",
        help="Refresh $AWG_ROOT/heartbeats/{agent}/{session}.ts with the current epoch seconds.",
    )
    heartbeat_write.add_argument("--agent", help="Agent role. Defaults to $AWG_AGENT or $WORKER.")
    heartbeat_write.add_argument("--session", help="Session id. Defaults to $AWG_SESSION.")

    heartbeat_mon = sub.add_parser(
        "heartbeat-monitor",
        help="Read-only scan of $AWG_ROOT/heartbeats/ for stale or missing worker heartbeats.",
    )
    heartbeat_mon.add_argument("--timeout-seconds", type=int, help="Stale-heartbeat threshold. Defaults to $WORKER_HEARTBEAT_TIMEOUT or 300.")

    processing_mon = sub.add_parser(
        "processing-timeout-monitor",
        help="Read-only TimeoutChecker scan for stale processing/ items.",
    )
    processing_mon.add_argument("--timeout-seconds", type=int, help=f"Processing timeout. Default {DEFAULT_PROCESSING_TIMEOUT_SEC}.")
    processing_mon.add_argument("--notify-channel", help="Optional notify channel id; emits payload when set.")
    processing_mon.add_argument("--notify-target", help="Optional notify target/handle attached to payload.")

    sub.add_parser(
        "response-contract-monitor",
        help="Read-only TimeoutChecker scan for expectedResponseWithin breaches.",
    )

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
            message_id = queue.send(
                args.sender,
                args.recipient,
                args.kind,
                args.body,
                args.reply_to,
                correlation_id=args.correlation_id,
                work_id=args.work_id,
                parent_id=args.parent_id,
                source_channel=args.source_channel,
                report_target=args.report_target,
                repo=args.repo,
                workspace=args.workspace,
                expected_response_within=args.expected_response_within,
            )
            print(message_id)
            if args.dispatch_hooks:
                path = find_message_file(queue.paths(args.recipient).inbox, message_id)
                if not path:
                    raise FileNotFoundError(f"message not in inbox after send: {message_id}")
                results = dispatch_hooks(
                    root=queue.root,
                    config_path=Path(args.hook_config).expanduser() if args.hook_config else None,
                    event="message.sent",
                    message=read_json(path),
                )
                print_json({"messageId": message_id, "hooks": results_to_dicts(results)})
                if any(result.status in {"failed", "timeout", "invalid"} for result in results):
                    return 1
            return 0
        if args.command == "recv":
            message = queue.receive(args.agent, args.timeout, args.require_ack, args.report_target)
            if message is None:
                print(f"timeout: no messages for {args.agent}", file=sys.stderr)
                return 1
            print(json.dumps(message, ensure_ascii=False, separators=(",", ":")))
            return 0
        if args.command == "peek":
            print_json(queue.peek(args.agent, args.report_target))
            return 0
        if args.command == "pending":
            count = len(queue.peek(args.agent, args.report_target))
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
            print_json(queue.status(args.agent, "local" if args.local else args.tz, args.report_target))
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
        if args.command in {"retry"}:
            print(queue.retry(args.agent, args.id))
            return 0
        if args.command == "nack":
            print(queue.nack(args.agent, args.id))
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
        if args.command == "dispatch-hooks":
            if args.event == "on_processing":
                messages = queue.processing(args.agent)
            else:
                messages = queue.peek(args.agent, args.report_target)
            if args.id:
                messages = [message for message in messages if message.get("id") == args.id]
            results = []
            for message in messages:
                results.append({
                    "messageId": message.get("id"),
                    "hooks": results_to_dicts(dispatch_hooks(
                        root=queue.root,
                        config_path=Path(args.hook_config).expanduser() if args.hook_config else None,
                        event=args.event,
                        message=message,
                        dry_run=args.dry_run,
                    )),
                })
            print_json({"event": args.event, "agent": args.agent, "messages": results})
            if any(hook.get("status") in {"failed", "timeout", "invalid"} for item in results for hook in item["hooks"]):
                return 1
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
        if args.command == "worker-heartbeat-write":
            agent = args.agent or os.environ.get("AWG_AGENT") or os.environ.get("WORKER") or ""
            session = args.session or os.environ.get("AWG_SESSION") or ""
            if not agent:
                print("agent must be provided via --agent, $AWG_AGENT, or $WORKER", file=sys.stderr)
                return 1
            if not session:
                print("session must be provided via --session or $AWG_SESSION", file=sys.stderr)
                return 1
            heartbeat_dir = queue.root / "heartbeats" / agent
            heartbeat_dir.mkdir(parents=True, exist_ok=True)
            heartbeat_path = heartbeat_dir / f"{session}.ts"
            now = int(time.time())
            tmp_path = heartbeat_path.with_suffix(f".ts.{os.getpid()}.tmp")
            tmp_path.write_text(f"{now}\n", encoding="utf-8")
            os.replace(tmp_path, heartbeat_path)
            print(str(heartbeat_path))
            return 0
        if args.command == "heartbeat-monitor":
            timeout = args.timeout_seconds
            if timeout is None:
                timeout = int(os.environ.get("WORKER_HEARTBEAT_TIMEOUT") or 300)
            alerts = _scan_heartbeats(queue.root, timeout)
            for alert in alerts:
                print(json.dumps(alert, ensure_ascii=False))
            return 1 if alerts else 0
        if args.command == "processing-timeout-monitor":
            timeout = args.timeout_seconds
            if timeout is None:
                timeout = int(os.environ.get("AWG_PROCESSING_TIMEOUT") or DEFAULT_PROCESSING_TIMEOUT_SEC)
            checker = TimeoutChecker(queue.root)
            stale = checker.stale_processing(timeout_seconds=timeout)
            for item in stale:
                print(json.dumps({"type": "processing.timeout", **item.to_dict()}, ensure_ascii=False))
            notify_channel = args.notify_channel or os.environ.get("AWG_NOTIFY_CHANNEL") or ""
            notify_target = args.notify_target or os.environ.get("AWG_NOTIFY_TARGET") or ""
            if stale and notify_channel:
                payload = {
                    "type": "processing.timeout.notification",
                    "channel": notify_channel,
                    "target": notify_target,
                    "eventType": "awg.processing.timeout.v1",
                    "alertCount": len(stale),
                    "alerts": [item.to_dict() for item in stale],
                }
                print(json.dumps(payload, ensure_ascii=False))
            return 1 if stale else 0
        if args.command == "response-contract-monitor":
            checker = TimeoutChecker(queue.root)
            breaches = checker.response_contract_breaches()
            for breach in breaches:
                print(json.dumps({"type": "response.contract.breach", **breach.to_dict()}, ensure_ascii=False))
            return 1 if breaches else 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    parser.error(f"unhandled command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
