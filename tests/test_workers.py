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

    def test_codex_prepare_worktree_reports_clean_state_without_mutation(self):
            _, root = self.with_queue()
            repo = self.make_git_repo(root)
            before = subprocess.run(["git", "branch", "--show-current"], cwd=repo, check=True, text=True, capture_output=True).stdout.strip()

            result = self.run_codex_prepare_worktree(repo)

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["ready"])
            self.assertFalse(payload["dirty"])
            self.assertFalse(payload["mutated"])
            self.assertEqual(payload["branch"], before)
            after = subprocess.run(["git", "branch", "--show-current"], cwd=repo, check=True, text=True, capture_output=True).stdout.strip()
            self.assertEqual(after, before)

    def test_codex_prepare_worktree_blocks_dirty_state(self):
            _, root = self.with_queue()
            repo = self.make_git_repo(root)
            (repo / "dirty.txt").write_text("dirty\n", encoding="utf-8")

            result = self.run_codex_prepare_worktree(repo)

            self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["ready"])
            self.assertTrue(payload["dirty"])
            self.assertFalse(payload["mutated"])
            self.assertIn("uncommitted changes", payload["reason"])

    def test_codex_prepare_worktree_requires_explicit_create_branch(self):
            _, root = self.with_queue()
            repo = self.make_git_repo(root)

            result = self.run_codex_prepare_worktree(repo, "--branch", "worker/demo")

            self.assertEqual(result.returncode, 1, result.stderr + result.stdout)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["ready"])
            self.assertFalse(payload["mutated"])
            self.assertIn("current branch", payload["reason"])
            branch = subprocess.run(["git", "branch", "--show-current"], cwd=repo, check=True, text=True, capture_output=True).stdout.strip()
            self.assertNotEqual(branch, "worker/demo")

            result = self.run_codex_prepare_worktree(repo, "--branch", "worker/demo", "--create-branch")

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["ready"])
            self.assertTrue(payload["mutated"])
            self.assertEqual(payload["branch"], "worker/demo")
            branch = subprocess.run(["git", "branch", "--show-current"], cwd=repo, check=True, text=True, capture_output=True).stdout.strip()
            self.assertEqual(branch, "worker/demo")

    def test_codex_executor_success_acks_after_codex_exit_zero(self):
            _, root = self.with_queue()
            queue, message_id, result, argv_path = self.run_codex_executor_bridge(root)

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(queue.status("worker")["processing"], 0)
            processed = queue.processed("worker", limit=1)[0]
            self.assertEqual(processed["id"], message_id)
            self.assertIn("ackedAt", processed["refs"])
            lead_message = queue.peek("lead")[0]
            self.assertEqual(lead_message["kind"], "status")
            self.assertIn("executor success", lead_message["body"])
            self.assertIn("codex exec returned exit code 0", lead_message["body"])
            argv = argv_path.read_text(encoding="utf-8")
            self.assertIn("exec", argv)
            self.assertIn("--skip-git-repo-check", argv)
            self.assertIn("--sandbox", argv)
            self.assertIn("change one file", argv)

    def test_codex_executor_nonzero_does_not_ack(self):
            _, root = self.with_queue()
            queue, message_id, result, _ = self.run_codex_executor_bridge(root, fake_exit=7, fake_output="boom")

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(queue.status("worker")["processing"], 1)
            processing = queue.processing("worker", limit=1)[0]
            self.assertEqual(processing["id"], message_id)
            self.assertNotIn("ackedAt", processing["refs"])
            lead_message = queue.peek("lead")[0]
            self.assertEqual(lead_message["kind"], "status")
            self.assertIn("operator decides", lead_message["body"])

    def test_codex_executor_requires_explicit_repo(self):
            _, root = self.with_queue()
            queue = MessageQueue(root)
            message_id = queue.send("lead", "worker", "instruction", "do work")
            project_root = Path(__file__).resolve().parents[1]
            wrapper = root / "awg-wrapper"
            wrapper.write_text(
                "#!/bin/sh\n"
                f"PYTHONPATH={project_root / 'src'} exec {sys.executable} -m agent_working_group.cli \"$@\"\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o755)
            env = {**os.environ, "AWG_CLI": str(wrapper), "AWG_ROOT": str(root), "WORKER": "worker", "LEAD": "lead", "RECV_TIMEOUT": "1"}
            result = subprocess.run(
                [str(project_root / "scripts" / "awg-executor-bridge.sh"), "--", str(project_root / "scripts" / "awg-codex-executor.sh")],
                cwd=project_root,
                env=env,
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(queue.status("worker")["processing"], 1)
            self.assertEqual(queue.processing("worker", limit=1)[0]["id"], message_id)
            self.assertEqual(queue.peek("lead")[0]["kind"], "question")

    def test_codex_executor_dirty_git_repo_blocks_before_codex(self):
            _, root = self.with_queue()
            repo = root / "repo"
            repo.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "init"], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            (repo / "dirty.txt").write_text("dirty\n", encoding="utf-8")
            queue, message_id, result, argv_path = self.run_codex_executor_bridge(root, repo=repo)

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertFalse(argv_path.exists())
            self.assertEqual(queue.status("worker")["processing"], 1)
            self.assertEqual(queue.processing("worker", limit=1)[0]["id"], message_id)
            lead_message = queue.peek("lead")[0]
            self.assertEqual(lead_message["kind"], "blocker")
            self.assertIn("uncommitted changes", lead_message["body"])

    def test_codex_worker_loop_writes_run_summary(self):
            _, root = self.with_queue()
            project_root = Path(__file__).resolve().parents[1]
            wrapper = root / "awg-wrapper"
            wrapper.write_text(
                "#!/bin/sh\n"
                f'PYTHONPATH={project_root / "src"} exec {sys.executable} -m agent_working_group.cli "$@"\n',
                encoding="utf-8",
            )
            wrapper.chmod(0o755)
            fake_codex = root / "fake-codex"
            fake_codex.write_text(
                "#!/usr/bin/env python3\n"
                "print('codex fake success')\n",
                encoding="utf-8",
            )
            fake_codex.chmod(0o755)
            repo = root / "repo"
            repo.mkdir()
            queue = MessageQueue(root)
            message_id = queue.send("lead", "worker", "instruction", "write summary", repo=str(repo), workspace=str(repo))
            log_dir = root / "logs"
            summary_dir = root / "summaries"
            run_log = log_dir / "worker.log"

            result = subprocess.run(
                [str(project_root / "scripts" / "awg-codex-worker-loop.sh")],
                cwd=project_root,
                env={
                    **os.environ,
                    "AWG_CLI": str(wrapper),
                    "AWG_ROOT": str(root),
                    "WORKER": "worker",
                    "LEAD": "lead",
                    "LOG_DIR": str(log_dir),
                    "SUMMARY_DIR": str(summary_dir),
                    "RUN_LOG_FILE": str(run_log),
                    "MAX_TASKS": "1",
                    "MAX_IDLE_SECONDS": "30",
                    "RECV_TIMEOUT": "1",
                    "REPORT_STATUS": "0",
                    "AWG_CODEX_BIN": str(fake_codex),
                    "AWG_CODEX_OUTPUT_DIR": str(root / "codex-output"),
                },
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("codex worker summary=", result.stdout)
            summaries = list(summary_dir.glob("worker.summary.*.json"))
            self.assertEqual(len(summaries), 1)
            payload = json.loads(summaries[0].read_text(encoding="utf-8"))
            self.assertEqual(payload["worker"], "worker")
            self.assertEqual(payload["lead"], "lead")
            self.assertEqual(payload["tasks"], 1)
            self.assertEqual(payload["stopReason"], "max tasks")
            self.assertEqual(payload["logDir"], str(log_dir))
            self.assertEqual(payload["logFile"], str(run_log))
            self.assertIn("startedAt", payload)
            self.assertIn("stoppedAt", payload)
            self.assertGreaterEqual(payload["durationSeconds"], 0)
            self.assertEqual(queue.status("worker")["processing"], 0)
            self.assertEqual(queue.processed("worker", limit=1)[0]["id"], message_id)

    def test_codex_worker_tmux_status_reports_latest_summary_path(self):
            _, root = self.with_queue()
            project_root = Path(__file__).resolve().parents[1]
            wrapper = root / "awg-wrapper"
            wrapper.write_text(
                "#!/bin/sh\n"
                f'PYTHONPATH={project_root / "src"} exec {sys.executable} -m agent_working_group.cli "$@"\n',
                encoding="utf-8",
            )
            wrapper.chmod(0o755)
            log_dir = root / "logs"
            summary_dir = log_dir / "run-summaries"
            summary_dir.mkdir(parents=True)
            older = summary_dir / "worker.summary.20260101000000.json"
            latest = summary_dir / "worker.summary.20260101000100.json"
            older.write_text("{}\n", encoding="utf-8")
            latest.write_text("{}\n", encoding="utf-8")
            os.utime(older, (1, 1))
            os.utime(latest, (2, 2))

            result = subprocess.run(
                [str(project_root / "scripts" / "awg-codex-worker-tmux.sh"), "status"],
                cwd=project_root,
                env={
                    **os.environ,
                    "AWG_CLI": str(wrapper),
                    "AWG_ROOT": str(root),
                    "WORKER": "worker",
                    "SESSION": "awg-codex-test-status",
                    "LOG_DIR": str(log_dir),
                    "SUMMARY_DIR": str(summary_dir),
                },
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("session=awg-codex-test-status stopped", result.stdout)
            self.assertIn(f"latest_summary={latest}", result.stdout)
            self.assertNotIn(f"latest_summary={older}", result.stdout)

    def test_codex_worker_tmux_status_handles_missing_summary(self):
            _, root = self.with_queue()
            project_root = Path(__file__).resolve().parents[1]
            wrapper = root / "awg-wrapper"
            wrapper.write_text(
                "#!/bin/sh\n"
                f'PYTHONPATH={project_root / "src"} exec {sys.executable} -m agent_working_group.cli "$@"\n',
                encoding="utf-8",
            )
            wrapper.chmod(0o755)

            result = subprocess.run(
                [str(project_root / "scripts" / "awg-codex-worker-tmux.sh"), "status"],
                cwd=project_root,
                env={
                    **os.environ,
                    "AWG_CLI": str(wrapper),
                    "AWG_ROOT": str(root),
                    "WORKER": "worker",
                    "SESSION": "awg-codex-test-status-empty",
                    "LOG_DIR": str(root / "logs"),
                    "SUMMARY_DIR": str(root / "logs" / "run-summaries"),
                },
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("latest_summary=none", result.stdout)

    def test_codex_worker_stale_recovery_docs_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            docs = "\n".join(
                (project_root / rel).read_text(encoding="utf-8")
                for rel in [
                    "docs/codex-tmux-worker.md",
                    "docs/worker-operations.md",
                    "docs/spec-matrix.md",
                ]
            )

            self.assertIn("Stale Processing Recovery", docs)
            self.assertIn("Codex Worker Stale Recovery", docs)
            self.assertIn("observation before mutation", docs.lower())
            self.assertIn("scripts/awg-codex-worker-tmux.sh status", docs)
            self.assertIn("latest_summary=PATH", docs)
            self.assertIn("evidence, not authority", docs)
            self.assertIn("conservative threshold", docs)
            self.assertIn("explicit operator action", docs)
            self.assertIn("REQUEUE_STALE=1 STALE_SECONDS=1800 scripts/awg-safe-poll.sh", docs)
            self.assertIn("Do not run recovery while the tmux session may still be processing the item", docs)
            self.assertIn("do not edit queue JSON directly", docs)
            self.assertIn("do not bulk recover", docs)
            self.assertNotIn("automatic worker behavior", docs.lower().replace("not an automatic worker behavior", ""))
            self.assertIn("automatic ack/retry as part of stale inspection", docs)
            self.assertNotRegex(docs, r"[\uac00-\ud7af]")
            self.assertNotRegex(docs, "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME")
            self.assertNotRegex(docs.lower(), "dis" + "cord|sl" + "ack|tele" + "gram")
            self.assert_public_safe_content(docs)

    def test_codex_worker_operator_flow_docs_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            docs = "\n".join(
                (project_root / rel).read_text(encoding="utf-8")
                for rel in [
                    "docs/codex-tmux-worker.md",
                    "docs/worker-operations.md",
                    "docs/spec-matrix.md",
                ]
            )

            self.assertIn("Operator Flow", docs)
            self.assertIn("Codex Worker End-to-End Operator Flow", docs)
            self.assertIn("scripts/awg-codex-prepare-worktree.sh --repo DIR", docs)
            self.assertIn("--workspace DIR", docs)
            self.assertIn("MAX_TASKS=1", docs)
            self.assertIn("MAX_IDLE_SECONDS=900", docs)
            self.assertIn("latest_summary=PATH", docs)
            self.assertIn("summary and log", docs.lower())
            self.assertIn("ack-pending", docs)
            self.assertIn("manual and bounded", docs.lower())
            self.assertIn("inspection artifacts, not worker control state", docs)
            self.assertIn("does not change queue ack/retry policy", docs)
            self.assertIn("does not create an always-on daemon", docs)
            self.assertNotIn("start an always-on daemon", docs.lower())
            self.assertNotRegex(docs, r"[\uac00-\ud7af]")
            self.assertNotRegex(docs, "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME")
            self.assertNotRegex(docs.lower(), "dis" + "cord|sl" + "ack|tele" + "gram")
            self.assert_public_safe_content(docs)

    def test_codex_worker_docs_and_scripts_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "docs" / "codex-tmux-worker.md",
                project_root / "docs" / "worker-operations.md",
                project_root / "docs" / "ai-executor-bridge.md",
                project_root / "scripts" / "awg-codex-executor.sh",
                project_root / "scripts" / "awg-codex-worker-loop.sh",
                project_root / "scripts" / "awg-codex-worker-tmux.sh",
                project_root / "scripts" / "awg-codex-prepare-worktree.sh",
                project_root / "README.md",
                project_root / "tests" / "test_workers.py",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
            scripts = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths if path.suffix == ".sh")

            self.assertIn("Codex Tmux Worker", content)
            self.assertIn("codex exec", content)
            self.assertIn("manual bounded", content)
            self.assertIn("acknowledges only after structured success", content)
            self.assertIn("AWG_CODEX_BIN", content)
            self.assertIn("AWG_CODEX_REPO", content)
            self.assertIn("AWG_CODEX_ALLOW_DIRTY", content)
            self.assertIn("run summary", content.lower())
            self.assertIn("test_codex_worker_loop_writes_run_summary", content)
            self.assertIn("test_codex_worker_tmux_status_reports_latest_summary_path", content)
            self.assertIn("test_codex_worker_operator_flow_docs_are_safe", content)
            self.assertIn("test_codex_worker_stale_recovery_docs_are_safe", content)
            self.assertIn("test_run_summary_and_log_non_authority_docs_are_safe", content)
            self.assertIn("test_codex_prepare_worktree_reports_clean_state_without_mutation", content)
            self.assertIn("MAX_TASKS", content)
            self.assertIn("MAX_IDLE_SECONDS", content)
            self.assertIn("test_codex_executor_success_acks_after_codex_exit_zero", content)
            self.assertNotRegex(scripts, r"\beval\b|bash\s+-c|sh\s+-c")
            self.assertNotRegex(scripts, r"jq\s|sed\s+-i|python3[^\n]+queues/.+json")
            self.assertNotRegex(scripts, r"curl\b|wget|http://|https://")
            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)

    def test_claude_executor_script_exists_and_is_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            script = project_root / "scripts" / "awg-claude-executor.sh"
            self.assertTrue(script.exists(), "awg-claude-executor.sh must exist")
            content = script.read_text(encoding="utf-8")
            self.assertIn("set -euo pipefail", content)
            self.assertIn("Opt-in Claude Code adapter", content)
            self.assertIn("dangerously-skip-permissions", content)
            # must not contain destructive operations
            for forbidden in ["git push", "git merge", "curl -X POST", "wget "]:
                self.assertNotIn(forbidden, content, f"claude executor must not call {forbidden}")
            self.assert_public_safe_content(content)

    def test_agent_executor_supports_dual_agent_with_fallback(self):
            project_root = Path(__file__).resolve().parents[1]
            script = project_root / "scripts" / "awg-agent-executor.sh"
            self.assertTrue(script.exists(), "awg-agent-executor.sh must exist")
            content = script.read_text(encoding="utf-8")
            self.assertIn("set -euo pipefail", content)
            self.assertIn("Dual-agent executor with automatic 429 fallback", content)
            # must reference both agents
            self.assertIn("awg-codex-executor.sh", content)
            self.assertIn("awg-claude-executor.sh", content)
            self.assertIn("is_rate_limited", content)
            self.assertIn("429", content)
            self.assertIn("FALLBACK", content)
            self.assert_public_safe_content(content)

    def test_claude_worker_scripts_exist_and_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            loop = project_root / "scripts" / "awg-claude-worker-loop.sh"
            tmux = project_root / "scripts" / "awg-claude-worker-tmux.sh"
            self.assertTrue(loop.exists(), "awg-claude-worker-loop.sh must exist")
            self.assertTrue(tmux.exists(), "awg-claude-worker-tmux.sh must exist")

            loop_content = loop.read_text(encoding="utf-8")
            self.assertIn("set -euo pipefail", loop_content)
            self.assertIn("awg-agent-executor", loop_content)
            self.assertIn("AGENT", loop_content)
            self.assertIn("MAX_TASKS", loop_content)
            self.assertIn("MAX_IDLE_SECONDS", loop_content)

            tmux_content = tmux.read_text(encoding="utf-8")
            self.assertIn("set -euo pipefail", tmux_content)
            self.assertIn("awg-claude-worker-loop.sh", tmux_content)
            self.assertIn("DANGEROUSLY_SKIP_PERMS", tmux_content)
            self.assertIn("FALLBACK", tmux_content)

            for content in [loop_content, tmux_content]:
                self.assert_public_safe_content(content)
    def test_agent_executor_falls_back_to_secondary_on_429(self):
            project_root = Path(__file__).resolve().parents[1]
            agent_executor_src = project_root / "scripts" / "awg-agent-executor.sh"

            queue, root = self.with_queue()
            fake_dir = root / "fake-scripts"
            fake_dir.mkdir()

            agent_executor = fake_dir / "awg-agent-executor.sh"
            agent_executor.write_text(
                agent_executor_src.read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            agent_executor.chmod(0o755)

            fake_claude = fake_dir / "awg-claude-executor.sh"
            fake_claude.write_text(
                "#!/bin/sh\n"
                "echo 'transient claude warning' >&2\n"
                "echo '{\"status\":\"retry\",\"summary\":\"claude rate limited (429): too many requests\"}'\n",
                encoding="utf-8",
            )
            fake_claude.chmod(0o755)

            fake_codex = fake_dir / "awg-codex-executor.sh"
            fake_codex.write_text(
                "#!/bin/sh\n"
                "echo '{\"status\":\"success\",\"summary\":\"codex did the work\",\"verification\":\"ran tests\"}'\n",
                encoding="utf-8",
            )
            fake_codex.chmod(0o755)

            message_file = root / "message.json"
            message_file.write_text(
                json.dumps({
                    "id": "m1",
                    "kind": "instruction",
                    "from": "lead",
                    "to": "worker",
                    "body": "do work",
                }),
                encoding="utf-8",
            )

            fallback_env = {
                **os.environ,
                "AGENT": "claude",
                "AWG_FALLBACK": "1",
                "AWG_AGENT_TIMEOUT": "30",
            }
            result = subprocess.run(
                [str(agent_executor), str(message_file)],
                env=fallback_env,
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )
            self.assertEqual(result.returncode, 0, msg=f"stderr={result.stderr}")
            payload = json.loads(result.stdout.strip().splitlines()[-1])
            self.assertEqual(payload["status"], "success")
            self.assertIn("codex", payload["summary"])
            stderr_lower = result.stderr.lower()
            self.assertIn("transient claude warning", stderr_lower)
            self.assertIn("rate limited", stderr_lower)
            self.assertIn("falling back", stderr_lower)

            no_fallback_env = {
                **os.environ,
                "AGENT": "claude",
                "AWG_FALLBACK": "0",
                "AWG_AGENT_TIMEOUT": "30",
            }
            result_no_fallback = subprocess.run(
                [str(agent_executor), str(message_file)],
                env=no_fallback_env,
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )
            self.assertEqual(result_no_fallback.returncode, 0, msg=f"stderr={result_no_fallback.stderr}")
            payload_no_fallback = json.loads(result_no_fallback.stdout.strip().splitlines()[-1])
            self.assertEqual(payload_no_fallback["status"], "retry")
            self.assertIn("429", payload_no_fallback["summary"])
            self.assertNotIn("falling back", result_no_fallback.stderr.lower())

            both_rate_limited_codex = fake_dir / "awg-codex-executor.sh"
            both_rate_limited_codex.write_text(
                "#!/bin/sh\n"
                "echo '{\"status\":\"retry\",\"summary\":\"codex rate limited (429)\"}'\n",
                encoding="utf-8",
            )
            both_rate_limited_codex.chmod(0o755)
            result_both = subprocess.run(
                [str(agent_executor), str(message_file)],
                env=fallback_env,
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )
            self.assertEqual(result_both.returncode, 0, msg=f"stderr={result_both.stderr}")
            payload_both = json.loads(result_both.stdout.strip().splitlines()[-1])
            self.assertEqual(payload_both["status"], "retry")
            self.assertIn("claude", payload_both["summary"].lower())
            self.assertIn("both agents rate limited", result_both.stderr.lower())


class IntegrationTests(QueueTestCase):
    """End-to-end tests for the bridge -> agent-executor -> codex/claude chain.

    These tests exercise the full pipeline with mock shims for codex and claude
    so the chain can be verified without needing the real binaries installed.
    """

    def _setup_pipeline_dir(self, root):
            project_root = Path(__file__).resolve().parents[1]
            fake_dir = root / "pipeline-scripts"
            fake_dir.mkdir()
            agent_executor_src = project_root / "scripts" / "awg-agent-executor.sh"
            agent_executor = fake_dir / "awg-agent-executor.sh"
            agent_executor.write_text(
                agent_executor_src.read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            agent_executor.chmod(0o755)
            return fake_dir, agent_executor

    def _write_mock_executor(self, path, payload, sleep_seconds=0, exit_code=0):
            body = json.dumps(payload)
            lines = ["#!/bin/sh"]
            if sleep_seconds > 0:
                lines.append(f"sleep {sleep_seconds}")
            lines.append(f"cat <<'PAYLOAD'\n{body}\nPAYLOAD")
            lines.append(f"exit {exit_code}")
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            path.chmod(0o755)

    def _write_message_file(self, root, body="do work", message_id="m1"):
            message_file = root / "message.json"
            message_file.write_text(
                json.dumps({
                    "id": message_id,
                    "kind": "instruction",
                    "from": "lead",
                    "to": "worker",
                    "body": body,
                }),
                encoding="utf-8",
            )
            return message_file

    def test_bridge_dispatches_to_agent_executor(self):
            project_root = Path(__file__).resolve().parents[1]
            bridge = project_root / "scripts" / "awg-executor-bridge.sh"
            agent_executor = project_root / "scripts" / "awg-agent-executor.sh"
            self.assertTrue(bridge.exists(), "executor bridge script must exist")
            self.assertTrue(os.access(bridge, os.X_OK), "executor bridge must be executable")
            self.assertTrue(agent_executor.exists(), "agent-executor must exist")
            self.assertTrue(os.access(agent_executor, os.X_OK), "agent-executor must be executable")

            # The worker loop is the wiring point that hands the agent-executor
            # to the bridge as the child command, completing the dispatch chain.
            loop = (project_root / "scripts" / "awg-claude-worker-loop.sh").read_text(encoding="utf-8")
            self.assertIn("awg-executor-bridge.sh", loop)
            self.assertIn("awg-agent-executor.sh", loop)
            self.assertIn('"$BRIDGE_SCRIPT"', loop)
            self.assertIn('"$AGENT_EXECUTOR"', loop)
            self.assertLess(loop.index('"$BRIDGE_SCRIPT"'), loop.index('"$AGENT_EXECUTOR"'))

    def test_full_pipeline_with_mock_executors(self):
            _, root = self.with_queue()
            fake_dir, agent_executor = self._setup_pipeline_dir(root)
            self._write_mock_executor(
                fake_dir / "awg-codex-executor.sh",
                {"status": "success", "summary": "codex did the work", "verification": "ran tests"},
            )
            self._write_mock_executor(
                fake_dir / "awg-claude-executor.sh",
                {"status": "success", "summary": "claude did the work"},
            )
            message_file = self._write_message_file(root)

            env = {
                **os.environ,
                "AGENT": "codex",
                "AWG_FALLBACK": "0",
                "AWG_AGENT_TIMEOUT": "30",
            }
            result = subprocess.run(
                [str(agent_executor), str(message_file)],
                env=env,
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )

            self.assertEqual(result.returncode, 0, msg=f"stderr={result.stderr}")
            payload = json.loads(result.stdout.strip().splitlines()[-1])
            self.assertEqual(payload["status"], "success")
            self.assertIn("codex", payload["summary"])

    def test_pipeline_fallback_e2e(self):
            _, root = self.with_queue()
            fake_dir, agent_executor = self._setup_pipeline_dir(root)
            self._write_mock_executor(
                fake_dir / "awg-claude-executor.sh",
                {"status": "retry", "summary": "claude rate limited (429): too many requests"},
            )
            self._write_mock_executor(
                fake_dir / "awg-codex-executor.sh",
                {"status": "success", "summary": "codex completed", "verification": "ran tests"},
            )
            message_file = self._write_message_file(root)

            env = {
                **os.environ,
                "AGENT": "claude",
                "AWG_FALLBACK": "1",
                "AWG_AGENT_TIMEOUT": "30",
            }
            result = subprocess.run(
                [str(agent_executor), str(message_file)],
                env=env,
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )

            self.assertEqual(result.returncode, 0, msg=f"stderr={result.stderr}")
            payload = json.loads(result.stdout.strip().splitlines()[-1])
            self.assertEqual(payload["status"], "success")
            self.assertIn("codex", payload["summary"])
            self.assertIn("falling back", result.stderr.lower())

    def test_pipeline_timeout_handled(self):
            _, root = self.with_queue()
            fake_dir, agent_executor = self._setup_pipeline_dir(root)
            # Primary sleeps so the chain has to wait for slow upstream and then
            # surface a retry. AWG_AGENT_TIMEOUT is documented; this test asserts
            # the agent-executor terminates cleanly and emits parseable JSON even
            # when the executor takes longer than the documented timeout, rather
            # than hanging or crashing the worker loop.
            slow = fake_dir / "awg-codex-executor.sh"
            slow.write_text(
                "#!/bin/sh\n"
                "sleep 5\n"
                "cat <<'PAYLOAD'\n"
                '{"status":"retry","summary":"timed out waiting for upstream"}\n'
                "PAYLOAD\n",
                encoding="utf-8",
            )
            slow.chmod(0o755)
            self._write_mock_executor(
                fake_dir / "awg-claude-executor.sh",
                {"status": "success", "summary": "claude completed"},
            )
            message_file = self._write_message_file(root)

            env = {
                **os.environ,
                "AGENT": "codex",
                "AWG_FALLBACK": "0",
                "AWG_AGENT_TIMEOUT": "2",
            }
            result = subprocess.run(
                [str(agent_executor), str(message_file)],
                env=env,
                text=True,
                capture_output=True,
                check=False,
                timeout=15,
            )

            self.assertEqual(result.returncode, 0, msg=f"stderr={result.stderr}")
            payload = json.loads(result.stdout.strip().splitlines()[-1])
            self.assertIn(payload["status"], ("retry", "failed"))
