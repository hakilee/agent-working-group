from tests.helpers import *

from agent_working_group.hooks import dispatch_hooks, results_to_dicts


class QueueHookTests(QueueTestCase):
    def test_send_dispatch_hooks_runs_matching_argv_command_after_enqueue(self):
        queue, root = self.with_queue()
        project_root = Path(__file__).resolve().parents[1]
        capture = root / "hook-output.json"
        hook_script = root / "capture-hook.py"
        hook_script.write_text(
            "import json, os, pathlib, sys\n"
            "payload = json.loads(sys.stdin.read())\n"
            "pathlib.Path(sys.argv[1]).write_text(json.dumps({\n"
            "  'event': os.environ.get('AWG_HOOK_EVENT'),\n"
            "  'depth': os.environ.get('AWG_HOOK_DEPTH'),\n"
            "  'messageId': os.environ.get('AWG_MESSAGE_ID'),\n"
            "  'reportTarget': os.environ.get('AWG_REPORT_TARGET'),\n"
            "  'payloadEventType': payload['eventType'],\n"
            "  'body': payload['message']['body'],\n"
            "}, sort_keys=True), encoding='utf-8')\n"
            "print('captured')\n",
            encoding="utf-8",
        )
        config = root / "hooks.json"
        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hooks": [
                        {
                            "name": "capture-channel-work",
                            "event": "message.sent",
                            "command": [sys.executable, str(hook_script), str(capture)],
                            "filters": {"to": "worker", "reportTarget": "channel:working"},
                            "timeoutSeconds": 5,
                        },
                        {
                            "name": "ignored-other-target",
                            "event": "message.sent",
                            "command": [sys.executable, str(hook_script), str(root / "ignored.json")],
                            "filters": {"reportTarget": "channel:other"},
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "agent_working_group.cli",
                "--root",
                str(root),
                "send",
                "--from",
                "lead",
                "--to",
                "worker",
                "--kind",
                "instruction",
                "--report-target",
                "channel:working",
                "--body",
                "review this; touch should-not-exist",
                "--dispatch-hooks",
                "--hook-config",
                str(config),
            ],
            cwd=project_root,
            text=True,
            capture_output=True,
            check=False,
            env={**os.environ, "PYTHONPATH": str(project_root / "src")},
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.strip().splitlines()
        message_id = lines[0]
        hook_report = json.loads("\n".join(lines[1:]))
        self.assertEqual(hook_report["messageId"], message_id)
        self.assertEqual(hook_report["hooks"][0]["status"], "success")
        self.assertTrue(capture.exists())
        captured = json.loads(capture.read_text(encoding="utf-8"))
        self.assertEqual(captured["event"], "message.sent")
        self.assertEqual(captured["depth"], "1")
        self.assertEqual(captured["messageId"], message_id)
        self.assertEqual(captured["reportTarget"], "channel:working")
        self.assertEqual(captured["payloadEventType"], "awg.hook.message.sent.v1")
        self.assertIn("touch should-not-exist", captured["body"])
        self.assertFalse((project_root / "should-not-exist").exists())
        self.assertEqual(len(queue.peek("worker")), 1)
        self.assertEqual(queue.processed("worker"), [])
        self.assertFalse((root / "ignored.json").exists())

    def test_dispatch_hooks_pending_is_explicit_dry_run_and_read_only(self):
        queue, root = self.with_queue()
        hook_script = root / "capture-hook.py"
        capture = root / "should-not-run.json"
        hook_script.write_text("raise SystemExit('should not run in dry-run')\n", encoding="utf-8")
        config = root / "hooks.json"
        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hooks": [
                        {
                            "name": "pending-capture",
                            "event": "message.pending",
                            "command": [sys.executable, str(hook_script), str(capture)],
                            "filters": {"reportTarget": "channel:working"},
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        matching = queue.send("lead", "worker", "instruction", "matching", report_target="channel:working")
        queue.send("lead", "worker", "instruction", "other", report_target="channel:other")

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "agent_working_group.cli",
                "--root",
                str(root),
                "dispatch-hooks",
                "--event",
                "message.pending",
                "--as",
                "worker",
                "--report-target",
                "channel:working",
                "--dry-run",
            ],
            text=True,
            capture_output=True,
            check=False,
            env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1] / "src")},
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual([item["messageId"] for item in payload["messages"]], [matching])
        self.assertEqual(payload["messages"][0]["hooks"][0]["status"], "dry-run")
        self.assertFalse(capture.exists())
        self.assertEqual(queue.status("worker")["pending"], 2)
        self.assertEqual(queue.status("worker", report_target="channel:working")["pending"], 1)

    def test_hook_config_blocks_shell_strings_and_recursion_by_default(self):
        queue, root = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "do not run")
        message = queue.peek("worker")[0]
        config = root / "hooks.json"
        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hooks": [
                        {"name": "bad-shell-string", "event": "message.pending", "command": "echo unsafe"},
                        {"name": "recursive", "event": "message.pending", "command": [sys.executable, "-c", "print('no')"]},
                    ],
                }
            ),
            encoding="utf-8",
        )

        invalid = dispatch_hooks(root=root, config_path=config, event="message.pending", message=message)
        self.assertEqual(results_to_dicts(invalid)[0]["status"], "invalid")

        recursive = dispatch_hooks(
            root=root,
            config_path=config,
            event="message.pending",
            message=message,
            environ={"AWG_HOOK_DEPTH": "1"},
        )
        statuses = [result.status for result in recursive]
        self.assertIn("invalid", statuses)
        self.assertIn("skipped", statuses)
        self.assertEqual(queue.peek("worker")[0]["id"], message_id)

    def test_hook_timeout_expired_returns_timeout_status(self):
        queue, root = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "slow hook test")
        message = queue.peek("worker")[0]
        config = root / "hooks.json"
        slow_script = root / "slow-hook.py"
        slow_script.write_text(
            "import time, sys; sys.stdout.write('partial'); sys.stdout.flush(); time.sleep(30)\n",
            encoding="utf-8",
        )
        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hooks": [
                        {
                            "name": "slow-hook",
                            "event": "message.pending",
                            "command": [sys.executable, str(slow_script)],
                            "timeoutSeconds": 0.5,
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        results = dispatch_hooks(
            root=root,
            config_path=config,
            event="message.pending",
            message=message,
        )
        self.assertEqual(len(results), 1)
        result = results_to_dicts(results)[0]
        self.assertEqual(result["status"], "timeout")
        self.assertIn("0.5", result.get("reason", ""))
        self.assertEqual(queue.peek("worker")[0]["id"], message_id)

    def test_hook_failure_returns_nonzero_returncode(self):
        queue, root = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "fail hook test")
        message = queue.peek("worker")[0]
        config = root / "hooks.json"
        fail_script = root / "fail-hook.py"
        fail_script.write_text(
            "import sys; sys.stderr.write('hook error'); sys.exit(42)\n",
            encoding="utf-8",
        )
        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hooks": [
                        {
                            "name": "fail-hook",
                            "event": "message.pending",
                            "command": [sys.executable, str(fail_script)],
                            "timeoutSeconds": 5,
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        results = dispatch_hooks(
            root=root,
            config_path=config,
            event="message.pending",
            message=message,
        )
        self.assertEqual(len(results), 1)
        result = results_to_dicts(results)[0]
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["returncode"], 42)
        self.assertIn("hook error", result.get("stderr", ""))
        self.assertEqual(queue.peek("worker")[0]["id"], message_id)

    def test_on_processing_event_dispatch_runs_after_message_moves_to_processing(self):
        queue, root = self.with_queue()
        capture = root / "on-processing.json"
        hook_script = root / "on-processing-hook.py"
        hook_script.write_text(
            "import json, os, pathlib, sys\n"
            "payload = json.loads(sys.stdin.read())\n"
            "pathlib.Path(sys.argv[1]).write_text(json.dumps({\n"
            "  'event': os.environ.get('AWG_HOOK_EVENT'),\n"
            "  'messageId': os.environ.get('AWG_MESSAGE_ID'),\n"
            "  'payloadEventType': payload['eventType'],\n"
            "}, sort_keys=True), encoding='utf-8')\n",
            encoding="utf-8",
        )
        config = root / "hooks.json"
        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hooks": [
                        {
                            "name": "on-processing-capture",
                            "event": "on_processing",
                            "command": [sys.executable, str(hook_script), str(capture)],
                            "filters": {"to": "worker"},
                            "timeoutSeconds": 5,
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        message_id = queue.send("lead", "worker", "instruction", "process me")
        received = queue.receive("worker", timeout=0)
        self.assertEqual(received["id"], message_id)

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "agent_working_group.cli",
                "--root",
                str(root),
                "dispatch-hooks",
                "--event",
                "on_processing",
                "--as",
                "worker",
                "--hook-config",
                str(config),
            ],
            text=True,
            capture_output=True,
            check=False,
            env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1] / "src")},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["event"], "on_processing")
        self.assertEqual([item["messageId"] for item in payload["messages"]], [message_id])
        self.assertEqual(payload["messages"][0]["hooks"][0]["status"], "success")
        self.assertTrue(capture.exists())
        captured = json.loads(capture.read_text(encoding="utf-8"))
        self.assertEqual(captured["event"], "on_processing")
        self.assertEqual(captured["messageId"], message_id)
        self.assertEqual(captured["payloadEventType"], "awg.hook.on_processing.v1")
        # processing state is unchanged — read-only dispatch
        self.assertEqual(len(queue.processing("worker")), 1)

    def test_on_processing_event_is_supported_directly_via_dispatch_function(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "direct on_processing")
        message = queue.peek("worker")[0]
        config = root / "hooks.json"
        capture = root / "direct.json"
        hook_script = root / "noop-hook.py"
        hook_script.write_text(
            "import pathlib, sys; pathlib.Path(sys.argv[1]).write_text('ran', encoding='utf-8')\n",
            encoding="utf-8",
        )
        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hooks": [
                        {
                            "name": "direct-on-processing",
                            "event": "on_processing",
                            "command": [sys.executable, str(hook_script), str(capture)],
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        results = dispatch_hooks(
            root=root,
            config_path=config,
            event="on_processing",
            message=message,
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].status, "success")
        self.assertTrue(capture.exists())

    def test_hook_filters_match_list_values(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "match-a", report_target="channel:working")
        queue.send("lead", "worker", "instruction", "match-b", report_target="channel:status")
        queue.send("lead", "worker", "instruction", "no-match", report_target="channel:other")
        capture = root / "hook-output.txt"
        hook_script = root / "list-filter-hook.py"
        hook_script.write_text(
            "import pathlib, sys; pathlib.Path(sys.argv[1]).write_text('ran', encoding='utf-8')\n",
            encoding="utf-8",
        )
        config = root / "hooks.json"
        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "hooks": [
                        {
                            "name": "multi-target",
                            "event": "message.pending",
                            "command": [sys.executable, str(hook_script), str(capture)],
                            "filters": {"reportTarget": ["channel:working", "channel:status"]},
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        messages = queue.peek("worker")
        results = []
        for message in messages:
            results.extend(
                dispatch_hooks(
                    root=root,
                    config_path=config,
                    event="message.pending",
                    message=message,
                )
            )
        statuses = [result.status for result in results]
        self.assertEqual(statuses.count("success"), 2)
        self.assertEqual(statuses.count("skipped"), 0)
        self.assertEqual(len(results), 2)
        self.assertEqual(len(queue.peek("worker")), 3)
