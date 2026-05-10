from tests.helpers import *


class QueueNotifierTests(QueueTestCase):
    def test_queue_notifier_emits_unnotified_pending_without_consuming(self):
            project_root = Path(__file__).resolve().parents[1]
            script = project_root / "scripts" / "awg-queue-notifier.sh"
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp) / "awg"
                queue = MessageQueue(root)
                first = queue.send("lead", "reviewer", "instruction", "Review the artifact.\nDetails", work_id="review-1")
                second = queue.send("lead", "reviewer", "note", "FYI only")
                state = Path(temp) / "notifier-state.json"
                cli_wrapper = Path(temp) / "awg-cli"
                cli_wrapper.write_text(
                    f"#! /usr/bin/env bash\nPYTHONPATH={project_root / 'src'} {sys.executable} -m agent_working_group.cli \"$@\"\n",
                    encoding="utf-8",
                )
                cli_wrapper.chmod(0o755)
                env = {**os.environ, "AWG_CLI": str(cli_wrapper), "AWG_ROOT": str(root)}

                first_run = subprocess.run(
                    [str(script), "--role", "reviewer", "--state-file", str(state), "--format", "json"],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                )
                self.assertEqual(first_run.returncode, 0, first_run.stderr)
                payload = json.loads(first_run.stdout)
                ids = {item["id"] for item in payload["notifications"]}
                self.assertEqual(ids, {first, second})
                self.assertEqual(len(queue.peek("reviewer")), 2)
                self.assertEqual(queue.processed("reviewer"), [])

                second_run = subprocess.run(
                    [str(script), "--role", "reviewer", "--state-file", str(state), "--format", "json"],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                )
                self.assertEqual(second_run.returncode, 0, second_run.stderr)
                self.assertEqual(json.loads(second_run.stdout)["notifications"], [])

                no_record = subprocess.run(
                    [str(script), "--role", "reviewer", "--state-file", str(Path(temp) / "other-state.json"), "--no-record"],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                )
                self.assertEqual(no_record.returncode, 0, no_record.stderr)
                self.assertIn(f"id={first}", no_record.stdout)
                self.assertIn("workId=review-1", no_record.stdout)

    def test_queue_notifier_docs_and_script_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "docs" / "queue-notifier.md",
                project_root / "docs" / "queue-first-workflow.md",
                project_root / "docs" / "safe-scheduling.md",
                project_root / "docs" / "spec-matrix.md",
                project_root / "README.md",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
            script = (project_root / "scripts" / "awg-queue-notifier.sh").read_text(encoding="utf-8")

            self.assertIn("durable inboxes, not wake-up channels", content)
            self.assertIn("Channel-Agnostic Delivery", content)
            self.assertIn("provider-neutral", content)
            self.assertIn("duplicate suppression", content)
            self.assertIn("Queue notification is a read-only wake-up bridge", content)
            self.assertIn("peek --as", script)
            self.assertIn("queue-notifier-state.json", script)
            self.assertNotRegex(script, r'"\$AWG_CLI"[^\n]*(recv|ack|ack-pending|retry|nack|prune|requeue-stale)')
            self.assertNotRegex(script, r"rm\s+.*queue|unlink|mv\s+.*queues")
            self.assertNotRegex(script, r"curl|wget|http://|https://")
            self.assertNotRegex(script, r"eval|bash\s+-c|sh\s+-c")

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)

    def test_queue_notifier_dispatch_builds_payloads_without_recording(self):
            project_root = Path(__file__).resolve().parents[1]
            dispatch = project_root / "scripts" / "awg-queue-notifier-dispatch.sh"
            notifier = project_root / "scripts" / "awg-queue-notifier.sh"
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp) / "awg"
                queue = MessageQueue(root)
                first = queue.send("lead", "reviewer", "instruction", "Review the adapter contract.", work_id="adapter-1")
                state = Path(temp) / "notifier-state.json"
                role_map = Path(temp) / "role-map.json"
                role_map.write_text(
                    json.dumps({"roles": {"reviewer": {"destination": "reviewer-alerts", "label": "Reviewer Alerts"}}}),
                    encoding="utf-8",
                )
                cli_wrapper = Path(temp) / "awg-cli"
                cli_wrapper.write_text(
                    f"#! /usr/bin/env bash\nPYTHONPATH={project_root / 'src'} {sys.executable} -m agent_working_group.cli \"$@\"\n",
                    encoding="utf-8",
                )
                cli_wrapper.chmod(0o755)
                env = {
                    **os.environ,
                    "AWG_CLI": str(cli_wrapper),
                    "AWG_ROOT": str(root),
                    "NOTIFIER": str(notifier),
                }

                first_run = subprocess.run(
                    [
                        str(dispatch),
                        "--role",
                        "reviewer",
                        "--role-map",
                        str(role_map),
                        "--state-file",
                        str(state),
                        "--format",
                        "json",
                    ],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                )
                self.assertEqual(first_run.returncode, 0, first_run.stderr)
                payload = json.loads(first_run.stdout)
                self.assertEqual(len(payload["deliveries"]), 1)
                delivery = payload["deliveries"][0]
                self.assertEqual(delivery["messageId"], first)
                self.assertEqual(delivery["eventType"], "awg.notifier.pending.v1")
                self.assertEqual(delivery["idempotencyKey"], f"reviewer:{first}")
                self.assertEqual(delivery["destination"], "reviewer-alerts")
                self.assertEqual(delivery["workId"], "adapter-1")
                self.assertIn("AWG queue notification", delivery["text"])
                self.assertFalse(state.exists())
                self.assertEqual(len(queue.peek("reviewer")), 1)
                self.assertEqual(queue.processed("reviewer"), [])

                text_run = subprocess.run(
                    [str(dispatch), "--role", "reviewer", "--state-file", str(state), "--format", "text"],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                )
                self.assertEqual(text_run.returncode, 0, text_run.stderr)
                self.assertIn(f"messageId={first}", text_run.stdout)
                self.assertIn("destination=reviewer", text_run.stdout)

    def test_queue_notifier_sample_run_outputs_without_recording_and_can_log(self):
            project_root = Path(__file__).resolve().parents[1]
            sample = project_root / "scripts" / "awg-queue-notifier-sample-run.sh"
            dispatch = project_root / "scripts" / "awg-queue-notifier-dispatch.sh"
            notifier = project_root / "scripts" / "awg-queue-notifier.sh"
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp) / "awg"
                queue = MessageQueue(root)
                message_id = queue.send("lead", "reviewer", "instruction", "Review the scheduler sample.", work_id="sample-1")
                state = Path(temp) / "notifier-state.json"
                log_file = Path(temp) / "logs" / "notifier-sample.log"
                cli_wrapper = Path(temp) / "awg-cli"
                cli_wrapper.write_text(
                    f"#! /usr/bin/env bash\nPYTHONPATH={project_root / 'src'} {sys.executable} -m agent_working_group.cli \"$@\"\n",
                    encoding="utf-8",
                )
                cli_wrapper.chmod(0o755)
                env = {
                    **os.environ,
                    "AWG_CLI": str(cli_wrapper),
                    "AWG_ROOT": str(root),
                    "NOTIFIER": str(notifier),
                }

                run = subprocess.run(
                    [
                        str(sample),
                        "--role",
                        "reviewer",
                        "--state-file",
                        str(state),
                        "--dispatch",
                        str(dispatch),
                        "--log-file",
                        str(log_file),
                    ],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                )
                self.assertEqual(run.returncode, 0, run.stderr)
                payload = json.loads(run.stdout)
                self.assertEqual(payload["deliveries"][0]["messageId"], message_id)
                self.assertEqual(payload["deliveries"][0]["workId"], "sample-1")
                self.assertFalse(state.exists())
                self.assertEqual(len(queue.peek("reviewer")), 1)
                self.assertEqual(queue.processed("reviewer"), [])
                self.assertTrue(log_file.exists())
                log_content = log_file.read_text(encoding="utf-8")
                self.assertIn("awg queue notifier sample run", log_content)
                self.assertIn(message_id, log_content)

    def test_queue_notifier_scheduler_sample_docs_and_script_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "docs" / "queue-notifier-scheduler-sample.md",
                project_root / "docs" / "queue-notifier.md",
                project_root / "docs" / "safe-scheduling.md",
                project_root / "docs" / "spec-matrix.md",
                project_root / "README.md",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
            script = (project_root / "scripts" / "awg-queue-notifier-sample-run.sh").read_text(encoding="utf-8")

            self.assertIn("no-install", content)
            self.assertIn("one-shot", content)
            self.assertIn("no-record behavior", content)
            self.assertIn("local operator log", content)
            self.assertIn("approval", content.lower())
            self.assertIn("no-install notifier scheduler sample", content)
            self.assertIn("--log-file", script)
            self.assertNotIn("--record", script)
            self.assertNotRegex(script, r"\b(recv|ack|ack-pending|retry|nack|prune|requeue-stale)\b")
            self.assertNotRegex(script, r"curl|wget|http://|https://")
            self.assertNotRegex(script, r"eval|bash\s+-c|sh\s+-c")
            self.assertNotRegex(script, r"crontab|systemctl|launchctl|tmux")
            self.assertNotRegex(script, r"rm\s+.*queue|unlink|mv\s+.*queues")

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")

    def test_queue_notifier_adapter_docs_and_script_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "docs" / "queue-notifier-adapters.md",
                project_root / "docs" / "queue-notifier.md",
                project_root / "docs" / "runtime-neutral-notifier-contract.md",
                project_root / "docs" / "safe-scheduling.md",
                project_root / "docs" / "spec-matrix.md",
                project_root / "README.md",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
            script = (project_root / "scripts" / "awg-queue-notifier-dispatch.sh").read_text(encoding="utf-8")

            self.assertIn("Queue notifier adapters", content)
            self.assertIn("provider-neutral delivery payloads", content)
            self.assertIn("default is no-record mode", content)
            self.assertIn("destination", content)
            self.assertIn("awg.notifier.pending.v1", content)
            self.assertIn("idempotencyKey", content)
            self.assertIn("Send-Time Adapter Pattern", content)
            self.assertIn("Enqueue first, then build the notification from the returned queue message id", content)
            self.assertIn("credentials site-local", content)
            self.assertIn("Site-local send-time wrappers may enqueue first and then deliver externally", content)
            self.assertIn("Queue Notifier Adapters](queue-notifier-adapters.md#send-time-adapter-pattern)", content)
            self.assertIn("Queue notifier dispatch converts read-only notifier output", content)
            self.assertIn("Reliability Checklist", content)
            self.assertIn("If delivery fails after enqueue, leave the queue item untouched", content)
            self.assertIn("Duplicate alerts are acceptable; duplicate queue sends are not", content)
            self.assertIn("retry delivery outside the queue", content)
            self.assertIn("rollback to manual or shadow-mode notification", content)
            self.assertIn("delivery result", content)
            self.assertIn("--no-record", script)
            self.assertIn("NOTIFIER_ARGS", script)
            self.assertNotRegex(script, r"\b(recv|ack|ack-pending|retry|nack|prune|requeue-stale)\b")
            self.assertNotRegex(script, r"curl|wget|http://|https://")
            self.assertNotRegex(script, r"eval|bash\s+-c|sh\s+-c")
            self.assertNotRegex(script, r"rm\s+.*queue|unlink|mv\s+.*queues")

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)

    def test_runtime_neutral_notifier_contract_docs_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "docs" / "runtime-neutral-notifier-contract.md",
                project_root / "docs" / "queue-notifier-adapters.md",
                project_root / "docs" / "safe-scheduling.md",
                project_root / "docs" / "operator-runbook.md",
                project_root / "docs" / "spec-matrix.md",
                project_root / "README.md",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
            script = (project_root / "scripts" / "awg-queue-notifier-dispatch.sh").read_text(encoding="utf-8")

            self.assertIn("Runtime-Neutral Notifier Contract", content)
            self.assertIn("awg.notifier.pending.v1", content)
            self.assertIn("idempotencyKey", content)
            self.assertIn("<role>:<messageId>", content)
            self.assertIn("shadow mode", content)
            self.assertIn("runtime-specific", content)
            self.assertIn("local operations storage", content)
            self.assertIn("no production send", content)
            self.assertIn("explicit approval", content)
            self.assertIn('"eventType": "awg.notifier.pending.v1"', script)
            self.assertIn('"idempotencyKey": f"{role}:{note.get(\'id\')}"', script)
            self.assertNotRegex(script, r"\b(recv|ack|ack-pending|retry|nack|prune|requeue-stale)\b")
            self.assertNotRegex(script, r"curl|wget|http://|https://")
            self.assertNotRegex(script, r"eval|bash\s+-c|sh\s+-c")
            self.assertNotRegex(script, r"rm\s+.*queue|unlink|mv\s+.*queues")

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)
