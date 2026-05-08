import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from agent_working_group import MessageQueue
from agent_working_group.path_safety import PathSafetyError, canonical_path, is_contained_path, require_contained_path


class MessageQueueTests(unittest.TestCase):
    def with_queue(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        queue = MessageQueue(root)
        queue.initialize(["lead", "worker"])
        return queue, root

    def test_send_receive_ack_retry_and_dead(self):
        queue, _ = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "do work")
        message = queue.receive("worker", timeout=0, require_ack=True)

        self.assertIsNotNone(message)
        self.assertEqual(message["id"], message_id)
        self.assertEqual(queue.status("worker")["processing"], 1)

        queue.retry("worker", message_id)
        retried = queue.peek("worker")[0]
        self.assertIn("retriedAt", retried["refs"])
        self.assertEqual(retried["refs"]["retryCount"], 1)
        self.assertEqual(queue.status("worker")["pending"], 1)

        message = queue.receive("worker", timeout=0, require_ack=True)
        self.assertIsNotNone(message)
        queue.requeue_stale("worker", older_than_sec=0, max_retries=0)

        dead = queue.dead("worker", limit=1)[0]
        self.assertIn("retriedAt", dead["refs"])
        self.assertEqual(dead["refs"]["retryCount"], 2)
        self.assertEqual(queue.status("worker")["dead"], 1)

    def test_ack_moves_processing_to_processed(self):
        queue, _ = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "do work")
        queue.receive("worker", timeout=0, require_ack=True)
        queue.ack("worker", message_id)

        processed = queue.processed("worker", limit=1)
        self.assertEqual(len(processed), 1)
        self.assertEqual(processed[0]["id"], message_id)
        self.assertIn("ackedAt", processed[0]["refs"])

    def test_prune_archives_processed_and_log_lines(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "note", "one")
        queue.receive("worker", timeout=0)
        queue.send("lead", "worker", "note", "two")
        queue.receive("worker", timeout=0)

        result = queue.prune("worker", processed_keep=1, log_keep_lines=1)
        self.assertEqual(result["queueFiles"], 1)
        self.assertEqual(result["logLines"], 1)
        self.assertEqual(len(queue.processed("worker")), 1)
        self.assertTrue(list((root / "log" / "pruned").glob("*messages_pruned.jsonl")))

    def test_status_timezone_fields(self):
        queue, _ = self.with_queue()
        queue.send("lead", "worker", "note", "hello")

        status = queue.status("worker", tz="Asia/Seoul")
        self.assertEqual(status["pending"], 1)
        self.assertTrue(status["nextAt"].endswith("Z"))
        self.assertIn("+09:00", status["nextAtLocal"])

    def test_prune_can_include_processing(self):
        queue, _ = self.with_queue()
        first = queue.send("lead", "worker", "instruction", "one")
        second = queue.send("lead", "worker", "instruction", "two")
        queue.receive("worker", timeout=0, require_ack=True)
        queue.receive("worker", timeout=0, require_ack=True)

        result = queue.prune(
            "worker",
            processed_keep=1000,
            dry_run=False,
            include_processing=True,
            processing_keep=1,
        )

        self.assertEqual(result["queueFiles"], 1)
        self.assertEqual(queue.status("worker")["processing"], 1)

    def test_peek_reply_to_log_and_nack(self):
        queue, _ = self.with_queue()
        question_id = queue.send("lead", "worker", "question", "Need context?")
        reply = queue.send("worker", "lead", "answer", "Yes", reply_to=question_id)

        self.assertEqual(queue.peek("lead")[0]["refs"]["replyTo"], question_id)
        self.assertTrue(any(reply in line for line in queue.log_lines()))

        message = queue.receive("lead", timeout=0, require_ack=True)
        self.assertIsNotNone(message)
        queue.retry("lead", reply)
        self.assertEqual(queue.status("lead")["pending"], 1)

    def test_recv_is_not_safe_for_scheduling(self):
        queue, _ = self.with_queue()
        queue.send("lead", "worker", "instruction", "do work")

        message = queue.receive("worker", timeout=0)

        self.assertIsNotNone(message)
        self.assertEqual(queue.status("worker")["pending"], 0)
        self.assertEqual(queue.status("worker")["processed"], 1)

    def test_cleanup_artifacts_preserves_queue_json_in_dry_run(self):
        queue, root = self.with_queue()
        paths = queue.paths("worker")
        for index, directory in enumerate((paths.inbox, paths.processing, paths.processed, paths.dead), start=1):
            message = directory / f"000000000000{index}_10_test{index}.json"
            message.write_text(
                '{"id":"test-%d","kind":"note","from":"lead","to":"worker","body":"state","refs":{},"priority":10}\n' % index,
                encoding="utf-8",
            )

        log_dir = root / "log" / "worker-sessions"
        log_dir.mkdir(parents=True)
        temp_file = log_dir / "worker.msg.old.json"
        temp_file.write_text("{}", encoding="utf-8")
        old = time.time() - 7200
        os.utime(temp_file, (old, old))

        result = queue.cleanup_artifacts(dry_run=True)

        self.assertIn(str(temp_file), result["candidates"])
        self.assertEqual(result["queueJsonPreserved"], 4)
        self.assertEqual(len(list((root / "queues" / "worker" / "inbox").glob("*.json"))), 1)
        self.assertEqual(len(list((root / "queues" / "worker" / "processing").glob("*.json"))), 1)
        self.assertEqual(len(list((root / "queues" / "worker" / "processed").glob("*.json"))), 1)
        self.assertEqual(len(list((root / "queues" / "worker" / "dead").glob("*.json"))), 1)

    def test_cleanup_artifacts_handles_stale_active_and_nonempty_locks(self):
        queue, root = self.with_queue()
        locks = root / "tmp" / "locks"
        stale = locks / "worker-worker-loop.lockdir"
        active = locks / "active-worker-loop.lockdir"
        nonempty = locks / "manual-worker-loop.lockdir"
        stale.mkdir()
        active.mkdir()
        nonempty.mkdir()
        (nonempty / "owner").write_text("pid", encoding="utf-8")
        old = time.time() - 7200
        os.utime(stale, (old, old))
        os.utime(nonempty, (old, old))

        result = queue.cleanup_artifacts(dry_run=True, stale_lock_min_age_sec=600)

        self.assertIn(str(stale), result["candidates"])
        self.assertTrue(any(item["path"] == str(active) for item in result["preserved"]))
        self.assertTrue(any(item["path"] == str(nonempty) for item in result["manualReview"]))

        result = queue.cleanup_artifacts(dry_run=False, stale_lock_min_age_sec=600)

        self.assertFalse(stale.exists())
        self.assertTrue(active.exists())
        self.assertTrue(nonempty.exists())
        self.assertIn(str(stale), result["removed"])

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

    def test_worker_scripts_are_generic_and_portable(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "scripts" / "awg-worker-loop.sh",
            project_root / "scripts" / "awg-worker-tmux.sh",
            project_root / "scripts" / "awg-safe-poll.sh",
            project_root / "docs" / "worker-operations.md",
            project_root / "README.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)
        self.assertNotIn(".XXXXXX" + ".json", content)
        self.assertIn("mktemp \"${LOG_DIR}/${WORKER}.msg.XXXXXX\"", content)
        self.assertIn("MAX_RECV_ERRORS=0", content)
        self.assertIn("acknowledge them without doing the work", content)

    def test_path_safety_helper_rejects_escapes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base = root / "workspace"
            base.mkdir()
            contained = base / "artifact.md"
            contained.write_text("ok", encoding="utf-8")
            outside = root / "outside"
            outside.mkdir()
            outside_file = outside / "secret.md"
            outside_file.write_text("no", encoding="utf-8")

            self.assertEqual(require_contained_path(base, contained), canonical_path(contained))
            self.assertTrue(is_contained_path(base, contained))
            self.assertFalse(is_contained_path(base, base / ".." / "outside" / "secret.md"))

            symlink = base / "escape-link"
            symlink.symlink_to(outside_file)
            self.assertFalse(is_contained_path(base, symlink))
            with self.assertRaises(PathSafetyError):
                require_contained_path(base, symlink)

            sibling = root / "workspace-other" / "file.md"
            sibling.parent.mkdir()
            sibling.write_text("trap", encoding="utf-8")
            self.assertFalse(is_contained_path(base, sibling))

            for bad in (None, "", object()):
                with self.subTest(bad=repr(bad)):
                    self.assertFalse(is_contained_path(base, bad))
                    with self.assertRaises(PathSafetyError):
                        canonical_path(bad)

    def test_path_safety_docs_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "path-safety.md",
            project_root / "docs" / "spec-matrix.md",
            project_root / "README.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)

        self.assertIn("Path Safety", content)
        self.assertIn("fail closed", content)
        self.assertIn("symlink", content)
        self.assertIn("traversal", content)
        self.assertIn("sibling-prefix", content)
        self.assertIn("Queue JSON files are live coordination state", content)
        self.assertIn("test_path_safety_helper_rejects_escapes", content)

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)

    def test_safe_poll_script_does_not_consume_worker_inbox(self):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "scripts" / "awg-safe-poll.sh"
        content = script.read_text(encoding="utf-8")

        self.assertNotRegex(content, r"\brecv\b")
        self.assertIn("status --as", content)
        self.assertIn("send --from poller --to \"$LEAD\" --kind note", content)
        self.assertIn("requeue-stale --as \"$WORKER\"", content)

    def test_pr_review_gate_docs_and_helper_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "pr-review-gate.md",
            project_root / "docs" / "templates" / "pr-review-request.md",
            project_root / "docs" / "templates" / "pr-review-result-comment.md",
            project_root / "scripts" / "awg-pr-review-request.sh",
            project_root / "README.md",
            project_root / "docs" / "queue-first-workflow.md",
            project_root / "docs" / "protocol.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        script = (project_root / "scripts" / "awg-pr-review-request.sh").read_text(encoding="utf-8")

        self.assertIn("queue-first", content)
        self.assertIn("never auto-merge or auto-approve", content.lower())
        self.assertIn("PR Review Result Comment", content)
        self.assertIn(" pr view ", script)
        self.assertIn(" pr diff ", script)
        self.assertIn(" pr checks ", script)
        self.assertIn("send --from", script)
        self.assertNotRegex(script, r"gh\s+pr\s+merge")
        self.assertNotRegex(script, r"gh\s+pr\s+review[^\n]*(--approve|approve)")
        self.assertNotRegex(script, r"git\s+checkout|git\s+switch")
        self.assertNotRegex(script, r"\b(make|pytest|npm|python3?)\s+(test|install|run|-)" )

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)

    def test_artifact_retention_docs_and_helper_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "artifact-retention.md",
            project_root / "docs" / "templates" / "artifact-index.md",
            project_root / "docs" / "templates" / "close-report.md",
            project_root / "scripts" / "awg-archive-artifact.sh",
            project_root / "README.md",
            project_root / "docs" / "queue-first-workflow.md",
            project_root / "docs" / "pr-review-gate.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        script = (project_root / "scripts" / "awg-archive-artifact.sh").read_text(encoding="utf-8")

        self.assertIn("awg-ops/", content)
        self.assertIn("active/", content)
        self.assertIn("completed/", content)
        self.assertIn("archive/", content)
        self.assertIn("YYYYMMDDHHMM-short-description.md", content)
        self.assertIn("Delete artifacts only when an explicit retention rule says deletion is safe", content)
        self.assertIn("Queue JSON files are live coordination state", content)
        self.assertIn("dry-run", script)
        self.assertIn("mv \"$SOURCE\" \"$DEST\"", script)
        self.assertNotRegex(script, r"\brm\b|unlink")
        self.assertRegex(script, r"queues/.+json")

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)

    def run_executor_bridge(self, root, status="success", body="do work", kind="instruction"):
        project_root = Path(__file__).resolve().parents[1]
        wrapper = root / "awg-wrapper"
        wrapper.write_text(
            "#!/bin/sh\n"
            f"PYTHONPATH={project_root / 'src'} exec {sys.executable} -m agent_working_group.cli \"$@\"\n",
            encoding="utf-8",
        )
        wrapper.chmod(0o755)
        queue = MessageQueue(root)
        message_id = queue.send("lead", "worker", kind, body)
        result = subprocess.run(
            [
                str(project_root / "scripts" / "awg-executor-bridge.sh"),
                "--",
                str(project_root / "scripts" / "awg-fake-executor.sh"),
            ],
            cwd=project_root,
            env={
                **os.environ,
                "AWG_CLI": str(wrapper),
                "AWG_ROOT": str(root),
                "WORKER": "worker",
                "LEAD": "lead",
                "RECV_TIMEOUT": "1",
                "FAKE_EXECUTOR_STATUS": status,
            },
            text=True,
            capture_output=True,
            check=False,
            timeout=10,
        )
        return queue, message_id, result

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

    def test_executor_bridge_docs_and_scripts_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "ai-executor-bridge.md",
            project_root / "scripts" / "awg-executor-bridge.sh",
            project_root / "scripts" / "awg-fake-executor.sh",
            project_root / "README.md",
            project_root / "tests" / "test_queue.py",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        bridge = (project_root / "scripts" / "awg-executor-bridge.sh").read_text(encoding="utf-8")

        self.assertIn("Never execute message body as shell", content)
        self.assertIn("Queue JSON must only move through queue-aware commands", content)
        self.assertIn("opt-in helper", content)
        self.assertIn("not part of `MessageQueue` core", content)
        self.assertIn("bridge connects", content)
        self.assertIn("FAKE_EXECUTOR_STATUS", content)
        self.assertNotRegex(bridge, r"\beval\b|bash\s+-c|sh\s+-c")
        self.assertNotRegex(bridge, r"jq\s|sed\s+-i|python3[^\n]+queues/.+json")
        self.assertIn("ack --as \"$WORKER\" --id \"$ID\"", bridge)
        self.assertLess(bridge.index("case \"$STATUS\""), bridge.index("ack --as \"$WORKER\" --id \"$ID\""))

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)

    def test_spec_matrix_and_correlation_docs_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        spec_matrix = project_root / "docs" / "spec-matrix.md"
        protocol = project_root / "docs" / "protocol.md"
        readme = project_root / "README.md"
        content = "\n".join(path.read_text(encoding="utf-8") for path in (spec_matrix, protocol, readme))

        self.assertTrue(spec_matrix.exists())
        self.assertIn("Spec Matrix", content)
        self.assertIn("test_send_receive_ack_retry_and_dead", content)
        self.assertIn("test_worker_loop_auto_acks_instruction_without_execution", content)
        self.assertIn("test_executor_bridge_does_not_execute_message_body_as_shell", content)
        self.assertIn("test_pr_review_gate_docs_and_helper_are_safe", content)
        self.assertIn("test_artifact_retention_docs_and_helper_are_safe", content)
        self.assertIn("test_repository_rules_docs_and_templates_are_safe", content)
        self.assertIn("correlationId", content)
        self.assertIn("parentId", content)
        self.assertIn("optional conventions", content)
        self.assertIn("not required schema fields", content)
        self.assertIn("does not change delivery order", content)
        self.assertIn("does not change queue delivery", content)
        self.assertIn("backward-compatible", content)

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)

    def test_independent_lead_analysis_docs_and_templates_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "queue-first-workflow.md",
            project_root / "docs" / "templates" / "task-spec.md",
            project_root / "docs" / "templates" / "review-result.md",
            project_root / "docs" / "templates" / "close-report.md",
            project_root / "docs" / "spec-matrix.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        workflow = (project_root / "docs" / "queue-first-workflow.md").read_text(encoding="utf-8")
        task_spec = (project_root / "docs" / "templates" / "task-spec.md").read_text(encoding="utf-8")
        review_result = (project_root / "docs" / "templates" / "review-result.md").read_text(encoding="utf-8")
        close_report = (project_root / "docs" / "templates" / "close-report.md").read_text(encoding="utf-8")

        self.assertIn("Independent Lead Analysis", workflow)
        self.assertIn("large, high-risk, or strategically important analysis and design work", workflow)
        self.assertIn("trivial one-step work", workflow)
        self.assertIn("This rule is selective", workflow)
        self.assertIn("If conclusions disagree", workflow)
        self.assertIn("record the disagreement", workflow)
        self.assertIn("Close only after agreement is reached", workflow)

        self.assertIn("Independent Analysis Requirement", task_spec)
        self.assertIn("Lead analysis artifact or summary", task_spec)
        self.assertIn("Worker/reviewer analysis artifact or summary", task_spec)
        self.assertIn("Comparison required before closure", task_spec)
        self.assertIn("Independent Analysis Comparison", review_result)
        self.assertIn("Lead analysis summary", review_result)
        self.assertIn("Worker/reviewer analysis summary", review_result)
        self.assertIn("Disagreements", review_result)
        self.assertIn("Resolution or required follow-up", review_result)
        self.assertIn("Lead analysis completed", close_report)
        self.assertIn("Worker or reviewer analysis completed", close_report)
        self.assertIn("Comparison result", close_report)
        self.assertIn("Disagreements found", close_report)
        self.assertIn("Resolution before closure", close_report)

        self.assertIn("test_independent_lead_analysis_docs_and_templates_are_safe", content)
        self.assertIn("without forcing ceremony on trivial work", content)

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)

    def test_repository_rules_docs_and_templates_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "repository-rules.md",
            project_root / "docs" / "templates" / "pr-review-request.md",
            project_root / "docs" / "templates" / "close-report.md",
            project_root / "docs" / "pr-review-gate.md",
            project_root / "docs" / "queue-first-workflow.md",
            project_root / "README.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        repository_rules = (project_root / "docs" / "repository-rules.md").read_text(encoding="utf-8")
        pr_review_gate = (project_root / "docs" / "pr-review-gate.md").read_text(encoding="utf-8")
        close_report = (project_root / "docs" / "templates" / "close-report.md").read_text(encoding="utf-8")
        pr_request = (project_root / "docs" / "templates" / "pr-review-request.md").read_text(encoding="utf-8")

        self.assertIn("Repository rule first", repository_rules)
        self.assertIn("If no explicit repository rule exists, use Conventional Commits", repository_rules)
        self.assertIn("<type>(scope): <description>", repository_rules)
        self.assertIn("Git commit messages", repository_rules)
        self.assertIn("pull request titles", repository_rules)
        self.assertIn("squash merge commit titles", repository_rules)
        self.assertIn("keep the pull request title aligned with the intended squash commit title", repository_rules)
        self.assertIn("1. contribution docs", repository_rules)
        self.assertIn("6. if no explicit rule is found", repository_rules)
        self.assertIn("Record which rule source was used", repository_rules)

        self.assertIn("Intended squash merge title", pr_request)
        self.assertIn("Commit/title rule source", pr_request)
        self.assertIn("PR title and intended squash title follow", pr_request)
        self.assertIn("Rule source", close_report)
        self.assertIn("Final commit message", close_report)
        self.assertIn("Final pull request title", close_report)
        self.assertIn("Final squash merge title", close_report)
        self.assertIn("Check that the pull request title and intended squash merge title", pr_review_gate)
        self.assertIn("including pull request title and intended squash title policy", pr_review_gate)
        self.assertIn("Repository Rules", content)

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)


if __name__ == "__main__":
    unittest.main()
