from tests.helpers import *


class QueueWorkerExecutorTests(QueueTestCase):
    def test_worker_loop_auto_acks_instruction_without_execution(self):
            queue, root = self.with_queue()
            message_id = queue.send("lead", "worker", "instruction", "record the risk")
            wrapper = root / "awg-wrapper"
            project_root = Path(__file__).resolve().parents[1]
            wrapper.write_text(
                "#!/bin/sh\n"
                f"PYTHONPATH={project_root / 'src'} exec {sys.executable} -m agent_working_group.cli \"$@\"\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o755)

            result = subprocess.run(
                [str(project_root / "scripts" / "awg-worker-loop.sh")],
                cwd=project_root,
                env={
                    **os.environ,
                    "AWG_CLI": str(wrapper),
                    "AWG_ROOT": str(root),
                    "WORKER": "worker",
                    "LEAD": "lead",
                    "MAX_TASKS": "1",
                    "MAX_IDLE_SECONDS": "30",
                    "RECV_TIMEOUT": "1",
                    "REPORT_STATUS": "0",
                },
                text=True,
                capture_output=True,
                check=False,
                timeout=10,
            )

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("acknowledging without AI execution", result.stdout)
            self.assertEqual(queue.status("worker")["processing"], 0)
            processed = queue.processed("worker", limit=1)[0]
            self.assertEqual(processed["id"], message_id)
            self.assertIn("ackedAt", processed["refs"])

    def test_worker_idle_timeout_resets_after_message(self):
            queue, root = self.with_queue()
            wrapper = root / "awg-wrapper"
            project_root = Path(__file__).resolve().parents[1]
            wrapper.write_text(
                "#!/bin/sh\n"
                f"PYTHONPATH={project_root / 'src'} exec {sys.executable} -m agent_working_group.cli \"$@\"\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o755)

            process = subprocess.Popen(
                [str(project_root / "scripts" / "awg-worker-loop.sh")],
                cwd=project_root,
                env={
                    **os.environ,
                    "AWG_CLI": str(wrapper),
                    "AWG_ROOT": str(root),
                    "WORKER": "worker",
                    "LEAD": "lead",
                    "MAX_TASKS": "2",
                    "MAX_IDLE_SECONDS": "3",
                    "RECV_TIMEOUT": "1",
                    "REPORT_STATUS": "0",
                },
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.addCleanup(lambda: process.poll() is None and process.kill())

            time.sleep(2)
            first_id = queue.send("lead", "worker", "note", "first")
            time.sleep(2)
            second_id = queue.send("lead", "worker", "note", "second")
            stdout, stderr = process.communicate(timeout=10)

            self.assertEqual(process.returncode, 0, stderr + stdout)
            self.assertIn("reason=max tasks", stdout)
            processed_ids = {message["id"] for message in queue.processed("worker")}
            self.assertIn(first_id, processed_ids)
            self.assertIn(second_id, processed_ids)


    def test_worker_loop_report_target_leaves_unmatched_pending_and_processes_next(self):
            queue, root = self.with_queue()
            wrong_id = queue.send(
                "lead",
                "worker",
                "note",
                "wrong channel",
                report_target="channel:marketing",
            )
            right_id = queue.send(
                "lead",
                "worker",
                "note",
                "right channel",
                report_target="channel:working",
            )
            wrapper = root / "awg-wrapper"
            project_root = Path(__file__).resolve().parents[1]
            wrapper.write_text(
                "#!/bin/sh\n"
                f"PYTHONPATH={project_root / 'src'} exec {sys.executable} -m agent_working_group.cli \"$@\"\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o755)

            result = subprocess.run(
                [str(project_root / "scripts" / "awg-worker-loop.sh")],
                cwd=project_root,
                env={
                    **os.environ,
                    "AWG_CLI": str(wrapper),
                    "AWG_ROOT": str(root),
                    "WORKER": "worker",
                    "LEAD": "lead",
                    "MAX_TASKS": "1",
                    "MAX_IDLE_SECONDS": "30",
                    "RECV_TIMEOUT": "1",
                    "REPORT_STATUS": "0",
                    "AWG_REPORT_TARGET": "dis" + "cord:channel:working",
                },
                text=True,
                capture_output=True,
                check=False,
                timeout=10,
            )

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("report_target=" + "dis" + "cord:channel:working", result.stdout)
            self.assertEqual(queue.status("worker")["pending"], 1)
            self.assertEqual(queue.peek("worker")[0]["id"], wrong_id)
            self.assertEqual(queue.processed("worker", limit=1)[0]["id"], right_id)

    def test_worker_scripts_are_generic_and_portable(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "scripts" / "awg-worker-loop.sh",
                project_root / "scripts" / "awg-worker-tmux.sh",
                project_root / "scripts" / "awg-safe-poll.sh",
                project_root / "docs" / "worker-operations.md",
                project_root / "docs" / "safe-scheduling.md",
                project_root / "README.md",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)
            self.assertNotIn(".XXXXXX" + ".json", content)
            self.assertIn("mktemp \"${LOG_DIR}/${WORKER}.msg.XXXXXX\"", content)
            self.assertIn("MAX_RECV_ERRORS=0", content)
            self.assertIn("acknowledge them without doing the work", content)
            self.assertIn("Manual or no worker", content)
            self.assertIn("Always-on worker", content)
            self.assertIn("Do not let a notification bridge become an implicit worker", content)
            self.assertIn("worker decision, not as an observer", content)

    def test_worker_state_report_helper_is_read_only(self):
            project_root = Path(__file__).resolve().parents[1]
            script = project_root / "scripts" / "awg-worker-state-report.sh"
            docs = [
                project_root / "docs" / "worker-operations.md",
                project_root / "docs" / "queue-reconciliation.md",
                project_root / "docs" / "spec-matrix.md",
                project_root / "README.md",
            ]

            wrapper_dir = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, wrapper_dir, ignore_errors=True)
            wrapper = wrapper_dir / "awg"
            wrapper.write_text(
                "#!/usr/bin/env bash\n"
                f"PYTHONPATH={project_root / 'src'} python3 -m agent_working_group.cli \"$@\"\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o755)

            def run_report(queue_root, role="worker"):
                env = os.environ.copy()
                env.update({"AWG_CLI": "awg", "AWG_ROOT": str(queue_root), "PATH": f"{wrapper_dir}{os.pathsep}{env.get('PATH', '')}"})
                return subprocess.run(
                    [str(script), "--role", role],
                    cwd=project_root,
                    env=env,
                    text=True,
                    capture_output=True,
                    check=True,
                )

            idle_queue, idle_root = self.with_queue()
            before = idle_queue.status("worker")
            idle_result = run_report(idle_root)
            after = idle_queue.status("worker")
            self.assertEqual(before, after)
            self.assertIn("category=idle", idle_result.stdout)

            pending_queue, pending_root = self.with_queue()
            pending_id = pending_queue.send("lead", "worker", "instruction", "pending item")
            before = pending_queue.status("worker")
            pending_result = run_report(pending_root)
            after = pending_queue.status("worker")
            self.assertEqual(before, after)
            self.assertIn("category=ready-to-claim", pending_result.stdout)
            self.assertIn(pending_id, pending_result.stdout)
            self.assertIn("## inbox", pending_result.stdout)

            processing_queue, processing_root = self.with_queue()
            processing_id = processing_queue.send("lead", "worker", "question", "processing item")
            processing_queue.receive("worker", timeout=0)
            before = processing_queue.status("worker")
            processing_result = run_report(processing_root)
            after = processing_queue.status("worker")
            self.assertEqual(before, after)
            self.assertIn("category=active-processing", processing_result.stdout)
            self.assertIn(processing_id, processing_result.stdout)
            self.assertIn("## processing", processing_result.stdout)

            dead_queue, dead_root = self.with_queue()
            dead_id = dead_queue.send("lead", "worker", "blocker", "dead item")
            dead_queue.receive("worker", timeout=0)
            dead_queue.requeue_stale("worker", older_than_sec=-1, max_retries=0)
            before = dead_queue.status("worker")
            dead_result = run_report(dead_root)
            after = dead_queue.status("worker")
            self.assertEqual(before, after)
            self.assertIn("category=dead-letter-review", dead_result.stdout)
            self.assertIn(dead_id, dead_result.stdout)
            self.assertIn("## dead", dead_result.stdout)
            self.assertIn("advisory only", dead_result.stdout)
            self.assertNotIn("superseded", dead_result.stdout.lower())
            self.assertNotRegex(dead_result.stdout, r"/" + "Users/|/" + "home/|~" + r"/")

            missing_role = subprocess.run(
                [str(script)],
                cwd=project_root,
                env={"AWG_CLI": "awg", "PATH": f"{wrapper_dir}{os.pathsep}{os.environ.get('PATH', '')}"},
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(missing_role.returncode, 0)
            self.assertIn("missing required --role", missing_role.stderr)

            script_content = script.read_text(encoding="utf-8")
            content = script_content + "\n" + "\n".join(path.read_text(encoding="utf-8") for path in docs)
            self.assertIn("awg-worker-state-report.sh --role", content)
            self.assertIn("test_worker_state_report_helper_is_read_only", content)
            self.assertIn("message.id remains the canonical message identity", content)
            self.assertIn("processing/ remains the only durable active claim-like queue state", content)
            self.assertNotRegex(script_content, r"\brecv\b")
            self.assertNotRegex(script_content, r"\back\b|\bretry\b|\bnack\b|requeue-stale|\bprune\b")
            self.assertNotRegex(script_content, r"\beval\b|bash\s+-c|sh\s+-c")
            self.assertNotRegex(script_content, r"jq\s|sed\s+.*queues/.+json")
            self.assertNotRegex(script_content, r"\bcurl\b|wget|http://|https://")
            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)
            self.assertNotRegex(content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")

    def test_helper_environment_contract_is_documented_and_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            worker_docs = project_root / "docs" / "worker-operations.md"
            spec_matrix = project_root / "docs" / "spec-matrix.md"
            helper_scripts = [
                project_root / "scripts" / "awg-executor-bridge.sh",
                project_root / "scripts" / "awg-pr-review-request.sh",
                project_root / "scripts" / "awg-queue-reconciliation-report.sh",
                project_root / "scripts" / "awg-worker-state-report.sh",
                project_root / "scripts" / "awg-safe-poll.sh",
                project_root / "scripts" / "awg-worker-loop.sh",
                project_root / "scripts" / "awg-worker-tmux.sh",
            ]
            docs_content = worker_docs.read_text(encoding="utf-8") + "\n" + spec_matrix.read_text(encoding="utf-8")

            self.assertIn("Helper Environment Contract", docs_content)
            self.assertIn("AWG_CLI", docs_content)
            self.assertIn("executable name or executable path", docs_content)
            self.assertIn("not a shell command string", docs_content)
            self.assertIn('quoted `"$AWG_CLI"`', docs_content)
            self.assertIn("wrapper executable", docs_content)
            self.assertIn("exec python3 -m agent_working_group.cli", docs_content)
            self.assertIn("AWG_ROOT", docs_content)
            self.assertIn("queue root directory", docs_content)
            self.assertIn(".agent-working-group/", docs_content)
            self.assertIn("test_helper_environment_contract_is_documented_and_safe", docs_content)
            self.assertNotIn("PYTHONPATH", docs_content)
            self.assertNotRegex(docs_content, r"\b(eval|bash\s+-c|sh\s+-c)\b")
            self.assertNotRegex(docs_content, r"AWG_CLI=.*[|;&><]")

            for script in helper_scripts:
                content = script.read_text(encoding="utf-8")
                self.assertIn('"$AWG_CLI"', content, script.name)
                self.assertNotRegex(content, r"(?<!\")\$AWG_CLI(?!\")", script.name)
                self.assertNotRegex(content, r"\beval\b|bash\s+-c|sh\s+-c", script.name)

            self.assert_public_safe_content(docs_content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(docs_content, local_path_pattern)
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(docs_content.lower(), platform_pattern)
            self.assertNotRegex(docs_content, r"[\uac00-\ud7af]")
            self.assertNotRegex(docs_content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")

    def test_safe_poll_script_does_not_consume_worker_inbox(self):
            project_root = Path(__file__).resolve().parents[1]
            script = project_root / "scripts" / "awg-safe-poll.sh"
            content = script.read_text(encoding="utf-8")

            self.assertNotRegex(content, r"\brecv\b")
            self.assertIn("status --as", content)
            self.assertIn("send --from poller --to \"$LEAD\" --kind note", content)
            self.assertIn("requeue-stale --as \"$WORKER\"", content)

    def test_executor_bridge_success_acks_after_status(self):
            _, root = self.with_queue()
            queue, message_id, result = self.run_executor_bridge(root, status="success")

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(queue.status("worker")["processing"], 0)
            processed = queue.processed("worker", limit=1)[0]
            self.assertEqual(processed["id"], message_id)
            self.assertIn("ackedAt", processed["refs"])
            lead_message = queue.peek("lead")[0]
            self.assertEqual(lead_message["kind"], "status")
            self.assertIn("executor success", lead_message["body"])
            self.assertEqual(lead_message["refs"]["replyTo"], message_id)

    def test_executor_bridge_retry_requeues_without_ack(self):
            _, root = self.with_queue()
            queue, message_id, result = self.run_executor_bridge(root, status="retry")

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(queue.status("worker")["pending"], 1)
            self.assertEqual(queue.status("worker")["processing"], 0)
            pending = queue.peek("worker")[0]
            self.assertEqual(pending["id"], message_id)
            self.assertNotIn("ackedAt", pending["refs"])
            self.assertEqual(pending["refs"]["retryCount"], 1)
            self.assertIn("executor retry", queue.peek("lead")[0]["body"])

    def test_executor_bridge_question_blocker_failed_and_malformed_do_not_ack(self):
            expectations = {
                "question": ("question", "fake question?"),
                "blocker": ("blocker", "executor blocker"),
                "failed": ("status", "operator decides"),
                "malformed": ("status", "malformed"),
                "unknown": ("status", "unknown status"),
                "nonzero": ("status", "failed before structured success"),
            }
            for status, (lead_kind, body_fragment) in expectations.items():
                with self.subTest(status=status):
                    _, root = self.with_queue()
                    queue, message_id, result = self.run_executor_bridge(root, status=status)

                    self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                    self.assertEqual(queue.status("worker")["processing"], 1)
                    processing = queue.processing("worker", limit=1)[0]
                    self.assertEqual(processing["id"], message_id)
                    self.assertNotIn("ackedAt", processing["refs"])
                    lead_message = queue.peek("lead")[0]
                    self.assertEqual(lead_message["kind"], lead_kind)
                    self.assertIn(body_fragment, lead_message["body"])
                    self.assertEqual(lead_message["refs"]["replyTo"], message_id)

    def test_executor_bridge_non_instruction_returns_to_inbox_without_ack(self):
            for kind in ("note", "status", "question", "answer"):
                with self.subTest(kind=kind):
                    _, root = self.with_queue()
                    queue, message_id, result = self.run_executor_bridge(root, status="success", kind=kind)

                    self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                    self.assertEqual(queue.status("worker")["pending"], 1)
                    self.assertEqual(queue.status("worker")["processing"], 0)
                    pending = queue.peek("worker")[0]
                    self.assertEqual(pending["id"], message_id)
                    self.assertNotIn("ackedAt", pending["refs"])
                    self.assertEqual(pending["refs"]["retryCount"], 1)

    def test_executor_bridge_does_not_execute_message_body_as_shell(self):
            _, root = self.with_queue()
            marker = root / "body-was-executed"
            body = f"touch {marker}"
            queue, message_id, result = self.run_executor_bridge(root, status="success", body=body)

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertFalse(marker.exists())
            self.assertEqual(queue.processed("worker", limit=1)[0]["id"], message_id)

    def test_real_executor_template_success_acks_after_status(self):
            _, root = self.with_queue()
            queue, message_id, result = self.run_real_executor_template(root, mode="success")

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(queue.status("worker")["processing"], 0)
            processed = queue.processed("worker", limit=1)[0]
            self.assertEqual(processed["id"], message_id)
            self.assertIn("ackedAt", processed["refs"])
            lead_message = queue.peek("lead")[0]
            self.assertEqual(lead_message["kind"], "status")
            self.assertIn("executor success", lead_message["body"])
            self.assertIn("deterministic template verification passed", lead_message["body"])

    def test_real_executor_template_retry_requeues_without_ack(self):
            _, root = self.with_queue()
            queue, message_id, result = self.run_real_executor_template(root, mode="retry")

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(queue.status("worker")["pending"], 1)
            self.assertEqual(queue.status("worker")["processing"], 0)
            pending = queue.peek("worker")[0]
            self.assertEqual(pending["id"], message_id)
            self.assertNotIn("ackedAt", pending["refs"])
            self.assertEqual(pending["refs"]["retryCount"], 1)

    def test_real_executor_template_non_success_outcomes_do_not_ack(self):
            expectations = {
                "question": ("question", "Provide the missing executor input."),
                "blocker": ("blocker", "executor blocker"),
                "failed": ("status", "operator decides"),
                "malformed": ("status", "malformed"),
                "unknown": ("status", "unknown status"),
                "nonzero": ("status", "failed before structured success"),
            }
            for mode, (lead_kind, body_fragment) in expectations.items():
                with self.subTest(mode=mode):
                    _, root = self.with_queue()
                    queue, message_id, result = self.run_real_executor_template(root, mode=mode)

                    self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                    self.assertEqual(queue.status("worker")["processing"], 1)
                    processing = queue.processing("worker", limit=1)[0]
                    self.assertEqual(processing["id"], message_id)
                    self.assertNotIn("ackedAt", processing["refs"])
                    lead_message = queue.peek("lead")[0]
                    self.assertEqual(lead_message["kind"], lead_kind)
                    self.assertIn(body_fragment, lead_message["body"])

    def test_real_executor_template_missing_config_fails_closed(self):
            _, root = self.with_queue()
            queue, message_id, result = self.run_real_executor_template(root, mode=None)

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(queue.status("worker")["processing"], 1)
            processing = queue.processing("worker", limit=1)[0]
            self.assertEqual(processing["id"], message_id)
            self.assertNotIn("ackedAt", processing["refs"])
            lead_message = queue.peek("lead")[0]
            self.assertEqual(lead_message["kind"], "status")
            self.assertIn("missing adapter configuration", lead_message["body"])

    def test_real_executor_template_does_not_execute_message_body_as_shell(self):
            _, root = self.with_queue()
            marker = root / "real-template-body-was-executed"
            body = f"touch {marker}"
            queue, message_id, result = self.run_real_executor_template(root, mode="success", body=body)

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertFalse(marker.exists())
            self.assertEqual(queue.processed("worker", limit=1)[0]["id"], message_id)

    def test_executor_bridge_docs_and_scripts_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "docs" / "ai-executor-bridge.md",
                project_root / "scripts" / "awg-executor-bridge.sh",
                project_root / "scripts" / "awg-fake-executor.sh",
                project_root / "scripts" / "awg-real-executor-template.sh",
                project_root / "README.md",
                project_root / "tests" / "test_workers.py",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
            bridge = (project_root / "scripts" / "awg-executor-bridge.sh").read_text(encoding="utf-8")

            self.assertIn("Never execute message body as shell", content)
            self.assertIn("Queue JSON must only move through queue-aware commands", content)
            self.assertIn("opt-in helper", content)
            self.assertIn("not part of `MessageQueue` core", content)
            self.assertIn("bridge connects", content)
            self.assertIn("FAKE_EXECUTOR_STATUS", content)
            self.assertIn("AWG_REAL_EXECUTOR_MODE", content)
            self.assertIn("provider-neutral adapter template", content)
            self.assertIn("test_real_executor_template_missing_config_fails_closed", content)
            self.assertNotRegex(bridge, r"\beval\b|bash\s+-c|sh\s+-c")
            real_template = (project_root / "scripts" / "awg-real-executor-template.sh").read_text(encoding="utf-8")
            self.assertNotRegex(bridge + real_template, r"\beval\b|bash\s+-c|sh\s+-c")
            self.assertNotRegex(bridge + real_template, r"jq\s|sed\s+-i|python3[^\n]+queues/.+json")
            self.assertNotRegex(real_template, r"\bcurl\b|wget|http://|https://")
            self.assertIn("ack --as \"$WORKER\" --id \"$ID\"", bridge)
            self.assertLess(bridge.index("case \"$STATUS\""), bridge.index("ack --as \"$WORKER\" --id \"$ID\""))

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)



    """End-to-end tests for the bridge -> agent-executor -> codex/claude chain.

    These tests exercise the full pipeline with mock shims for codex and claude
    so the chain can be verified without needing the real binaries installed.
    """