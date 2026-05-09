import json
import os
import shutil
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


    def test_ack_pending_moves_inbox_to_processed_with_acked_at(self):
        queue, _ = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "do work")

        result = queue.ack_pending("worker", message_id)

        self.assertEqual(result, message_id)
        self.assertEqual(queue.status("worker")["pending"], 0)
        processed = queue.processed("worker", limit=1)
        self.assertEqual(processed[0]["id"], message_id)
        self.assertIn("ackedAt", processed[0]["refs"])

    def test_ack_pending_optional_expect_flags_match_and_cli_support(self):
        queue, root = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "do work")
        message = queue.peek("worker")[0]

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "agent_working_group.cli",
                "--root",
                str(root),
                "ack-pending",
                "--as",
                "worker",
                "--id",
                message_id,
                "--expect-kind",
                message["kind"],
                "--expect-from",
                message["from"],
                "--expect-to",
                message["to"],
                "--expect-created-at",
                message["createdAt"],
            ],
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), message_id)
        self.assertEqual(MessageQueue(root).status("worker")["processed"], 1)

    def test_ack_pending_missing_or_wrong_state_fails_without_moving(self):
        queue, _ = self.with_queue()
        missing_id = "missing-message"
        processing_id = queue.send("lead", "worker", "instruction", "processing")
        queue.receive("worker", timeout=0, require_ack=True)
        processed_id = queue.send("lead", "worker", "instruction", "processed")
        queue.receive("worker", timeout=0)
        dead_id = queue.send("lead", "worker", "instruction", "dead")
        queue.receive("worker", timeout=0, require_ack=True)
        queue.requeue_stale("worker", older_than_sec=0, max_retries=0)

        for message_id in (missing_id, processing_id, processed_id, dead_id):
            before = queue.status("worker")
            with self.assertRaises(FileNotFoundError):
                queue.ack_pending("worker", message_id)
            self.assertEqual(queue.status("worker"), before)

    def test_ack_pending_expect_flag_mismatches_fail_closed(self):
        cases = [
            ("expect_kind", "status", "expect-kind mismatch"),
            ("expect_from", "other", "expect-from mismatch"),
            ("expect_to", "other", "expect-to mismatch"),
            ("expect_created_at", "2000-01-01T00:00:00Z", "expect-created-at mismatch"),
        ]
        for option, wrong_value, message_text in cases:
            with self.subTest(option=option):
                queue, _ = self.with_queue()
                message_id = queue.send("lead", "worker", "instruction", "do work")
                before = queue.peek("worker")[0].copy()
                with self.assertRaisesRegex(ValueError, message_text):
                    queue.ack_pending("worker", message_id, **{option: wrong_value})
                after = queue.peek("worker")[0]
                self.assertEqual(after["id"], message_id)
                self.assertNotIn("ackedAt", after["refs"])
                self.assertEqual(after["kind"], before["kind"])
                self.assertEqual(after["from"], before["from"])
                self.assertEqual(after["to"], before["to"])
                self.assertEqual(after["createdAt"], before["createdAt"])

    def test_ack_pending_duplicate_inbox_id_fails_closed(self):
        queue, root = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "do work")
        paths = queue.paths("worker")
        original = next(paths.inbox.glob("*.json"))
        duplicate = paths.inbox / f"9999999999999_50_{message_id[:8]}_duplicate.json"
        duplicate.write_text(original.read_text(encoding="utf-8"), encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "multiple inbox files match id"):
            queue.ack_pending("worker", message_id)

        self.assertEqual(MessageQueue(root).status("worker")["pending"], 2)
        self.assertEqual(MessageQueue(root).status("worker")["processed"], 0)

    def test_ack_pending_without_expect_flags_preserves_message_fields_and_log(self):
        queue, _ = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "do work")
        original = queue.peek("worker")[0]
        log_before = queue.log_lines()

        queue.ack_pending("worker", message_id)

        processed = queue.processed("worker", limit=1)[0]
        for field in ("kind", "from", "to", "body", "createdAt", "priority"):
            self.assertEqual(processed[field], original[field])
        self.assertIn("ackedAt", processed["refs"])
        self.assertEqual(queue.log_lines(), log_before)

    def test_ack_still_requires_processing_not_inbox(self):
        queue, _ = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "do work")

        with self.assertRaises(FileNotFoundError):
            queue.ack("worker", message_id)

        self.assertEqual(queue.status("worker")["pending"], 1)
        self.assertEqual(queue.status("worker")["processed"], 0)

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

    def test_send_optional_correlation_refs_are_backward_compatible(self):
        queue, _ = self.with_queue()

        queue.send("lead", "worker", "note", "plain")
        self.assertEqual(queue.peek("worker")[0]["refs"], {})

        correlation_id = queue.send("lead", "worker", "note", "correlated", correlation_id="task-123")
        correlation_message = next(message for message in queue.peek("worker") if message["id"] == correlation_id)
        self.assertEqual(correlation_message["refs"], {"correlationId": "task-123"})

        parent_id = queue.send("lead", "worker", "note", "child", parent_id="parent-1")
        parent_message = next(message for message in queue.peek("worker") if message["id"] == parent_id)
        self.assertEqual(parent_message["refs"], {"parentId": "parent-1"})

        question_id = queue.send("lead", "worker", "question", "Need context?")
        reply_id = queue.send(
            "worker",
            "lead",
            "answer",
            "done",
            reply_to=question_id,
            correlation_id="task-123",
            parent_id=question_id,
        )
        reply = queue.peek("lead")[0]
        self.assertEqual(reply["id"], reply_id)
        self.assertEqual(reply["refs"]["replyTo"], question_id)
        self.assertEqual(reply["refs"]["correlationId"], "task-123")
        self.assertEqual(reply["refs"]["parentId"], question_id)
        self.assertNotIn("correlationId", queue.peek("worker")[0]["refs"])

    def test_send_optional_source_metadata_refs_are_backward_compatible(self):
        queue, _ = self.with_queue()

        plain_id = queue.send("lead", "worker", "note", "plain")
        plain = next(message for message in queue.peek("worker") if message["id"] == plain_id)
        self.assertEqual(plain["refs"], {})

        message_id = queue.send(
            "lead",
            "worker",
            "instruction",
            "do work",
            correlation_id="task-123",
            work_id="work-456",
            source_channel="work-intake",
            report_target="work-updates",
            repo="example/repo",
            workspace="repo-main",
        )
        message = next(message for message in queue.peek("worker") if message["id"] == message_id)
        self.assertEqual(message["refs"], {
            "correlationId": "task-123",
            "workId": "work-456",
            "sourceChannel": "work-intake",
            "reportTarget": "work-updates",
            "repo": "example/repo",
            "workspace": "repo-main",
        })
        self.assertNotIn("workId", message)
        self.assertNotIn("sourceChannel", message)
        self.assertNotIn("reportTarget", message)
        self.assertNotIn("repo", message)
        self.assertNotIn("workspace", message)

    def test_cli_send_optional_correlation_and_source_flags_write_refs_only(self):
        _, root = self.with_queue()
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
                "answer",
                "--body",
                "done",
                "--reply-to",
                "question-1",
                "--correlation-id",
                "task-123",
                "--work-id",
                "work-456",
                "--parent-id",
                "question-1",
                "--source-channel",
                "work-intake",
                "--report-target",
                "work-updates",
                "--repo",
                "example/repo",
                "--workspace",
                "repo-main",
            ],
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        message_id = result.stdout.strip()
        message = MessageQueue(root).peek("worker")[0]
        self.assertEqual(message["id"], message_id)
        self.assertEqual(message["refs"], {
            "replyTo": "question-1",
            "correlationId": "task-123",
            "workId": "work-456",
            "parentId": "question-1",
            "sourceChannel": "work-intake",
            "reportTarget": "work-updates",
            "repo": "example/repo",
            "workspace": "repo-main",
        })
        self.assertNotIn("correlationId", message)
        self.assertNotIn("parentId", message)
        self.assertNotIn("workId", message)
        self.assertNotIn("sourceChannel", message)
        self.assertNotIn("reportTarget", message)
        self.assertNotIn("repo", message)
        self.assertNotIn("workspace", message)

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
        self.assertIn("Allowed Base Policy", content)
        self.assertIn("explicit directory boundary", content)
        self.assertIn("Do not infer the boundary from the current working directory", content)
        self.assertIn("Queue directories are not valid artifact or workspace write targets", content)
        self.assertIn("fail closed before writing or moving anything", content)
        self.assertIn("does not add an enforcement gate", content)

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

    def test_archive_helper_path_safety_integration_is_opt_in_and_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "artifact-retention.md",
            project_root / "docs" / "path-safety.md",
            project_root / "docs" / "spec-matrix.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        script = project_root / "scripts" / "awg-archive-artifact.sh"
        script_content = script.read_text(encoding="utf-8")

        self.assertIn("supports opt-in allowed-base checks", content)
        self.assertIn("Without `--allowed-base`, existing valid usage remains backward-compatible", content)
        self.assertIn("uses a Python bridge to call `require_contained_path()`", content)
        self.assertIn("Do not add an implicit containment", content)
        self.assertIn("queue JSON preservation", content)
        self.assertIn("--allowed-base", script_content)
        self.assertIn("require_contained_path", script_content)
        self.assertIn("python3 -c", script_content)
        self.assertIn("mv \"$SOURCE\" \"$DEST\"", script_content)
        self.assertNotRegex(script_content, r"(^|[;&|])\s*rm\b|unlink")
        self.assertNotRegex(script_content, r"\beval\b|bash\s+-c|sh\s+-c")
        self.assertNotRegex(script_content, r"jq\s|sed\s+-i")
        self.assertNotRegex(script_content, r"\bcurl\b|wget|http://|https://")

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

    def run_archive_helper(self, *args):
        project_root = Path(__file__).resolve().parents[1]
        return subprocess.run(
            [str(project_root / "scripts" / "awg-archive-artifact.sh"), *map(str, args)],
            cwd=project_root,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_archive_helper_allowed_base_accepts_contained_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            ops = root / "awg-ops"
            active = ops / "active"
            completed = ops / "completed"
            active.mkdir(parents=True)
            source = active / "artifact.md"
            source.write_text("ok", encoding="utf-8")

            dry_run = self.run_archive_helper(
                "--allowed-base", ops,
                "--source", source,
                "--completed-dir", completed,
            )
            self.assertEqual(dry_run.returncode, 0, dry_run.stderr)
            self.assertIn("dry-run: would move", dry_run.stdout)
            self.assertTrue(source.exists())

            apply = self.run_archive_helper(
                "--allowed-base", ops,
                "--source", source,
                "--completed-dir", completed,
                "--apply",
            )
            self.assertEqual(apply.returncode, 0, apply.stderr)
            self.assertFalse(source.exists())
            self.assertEqual((completed / "artifact.md").read_text(encoding="utf-8"), "ok")

    def test_archive_helper_allowed_base_rejects_escapes_and_queue_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            ops = root / "workspace"
            active = ops / "active"
            completed = ops / "completed"
            active.mkdir(parents=True)
            source = active / "artifact.md"
            source.write_text("ok", encoding="utf-8")

            invalid_base = self.run_archive_helper(
                "--allowed-base", root / "missing",
                "--source", source,
                "--completed-dir", completed,
            )
            self.assertNotEqual(invalid_base.returncode, 0)
            self.assertTrue(source.exists())

            empty_base = self.run_archive_helper(
                "--allowed-base", "",
                "--source", source,
                "--completed-dir", completed,
            )
            self.assertEqual(empty_base.returncode, 64)
            self.assertTrue(source.exists())

            traversal = self.run_archive_helper(
                "--allowed-base", ops,
                "--source", source,
                "--completed-dir", ops / ".." / "outside",
            )
            self.assertNotEqual(traversal.returncode, 0)
            self.assertTrue(source.exists())
            self.assertFalse((root / "outside" / "artifact.md").exists())

            outside = root / "outside"
            outside.mkdir()
            outside_file = outside / "external.md"
            outside_file.write_text("external", encoding="utf-8")
            symlink = active / "linked.md"
            symlink.symlink_to(outside_file)
            symlink_escape = self.run_archive_helper(
                "--allowed-base", ops,
                "--source", symlink,
                "--completed-dir", completed,
            )
            self.assertNotEqual(symlink_escape.returncode, 0)
            self.assertTrue(outside_file.exists())

            sibling = root / "workspace-other"
            sibling.mkdir()
            sibling_source = sibling / "artifact.md"
            sibling_source.write_text("trap", encoding="utf-8")
            sibling_trap = self.run_archive_helper(
                "--allowed-base", ops,
                "--source", sibling_source,
                "--completed-dir", completed,
            )
            self.assertNotEqual(sibling_trap.returncode, 0)
            self.assertTrue(sibling_source.exists())

            queue_source = ops / "queues" / "worker" / "inbox" / "message.json"
            queue_source.parent.mkdir(parents=True)
            queue_source.write_text("{}", encoding="utf-8")
            queue_source_result = self.run_archive_helper(
                "--allowed-base", ops,
                "--source", queue_source,
                "--completed-dir", completed,
            )
            self.assertEqual(queue_source_result.returncode, 65)
            self.assertTrue(queue_source.exists())

            queue_dest_result = self.run_archive_helper(
                "--allowed-base", ops,
                "--source", source,
                "--completed-dir", ops / "queues" / "worker" / "processed",
            )
            self.assertEqual(queue_dest_result.returncode, 65)
            self.assertTrue(source.exists())

    def test_archive_helper_without_allowed_base_preserves_existing_usage(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            active = root / "active"
            completed = root / "completed"
            active.mkdir()
            source = active / "artifact.md"
            source.write_text("ok", encoding="utf-8")

            dry_run = self.run_archive_helper("--source", source, "--completed-dir", completed)
            self.assertEqual(dry_run.returncode, 0, dry_run.stderr)
            self.assertIn("dry-run: would move", dry_run.stdout)
            self.assertTrue(source.exists())
            self.assertTrue(completed.exists())

            apply = self.run_archive_helper("--source", source, "--completed-dir", completed, "--apply")
            self.assertEqual(apply.returncode, 0, apply.stderr)
            self.assertFalse(source.exists())
            self.assertTrue((completed / "artifact.md").exists())

    def test_queue_reconciliation_policy_docs_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "queue-reconciliation.md",
            project_root / "docs" / "queue-first-workflow.md",
            project_root / "docs" / "spec-matrix.md",
            project_root / "README.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        policy = (project_root / "docs" / "queue-reconciliation.md").read_text(encoding="utf-8")

        self.assertIn("Queue Inbox Reconciliation", policy)
        self.assertIn("Observe first, classify second, mutate only after an explicit operator decision", policy)
        self.assertIn("completed or archived operational artifact", policy)
        self.assertIn("merged pull request", policy)
        self.assertIn("close report", policy)
        self.assertIn("active", policy)
        self.assertIn("superseded", policy)
        self.assertIn("unknown", policy)
        self.assertIn("`recv` is unsafe", policy)
        self.assertIn("bulk acknowledge or bulk consume", policy)
        self.assertIn("move, edit, or delete queue JSON files directly", policy)
        self.assertIn("Queue state must move only through queue-aware commands", policy)
        self.assertIn("future mutation policy needs its own scope", policy)
        self.assertIn("lead", policy)
        self.assertIn("worker", policy)
        self.assertIn("reviewer", policy)
        self.assertIn("observer", policy)
        self.assertIn("Queue Inbox Reconciliation", content)
        self.assertIn("test_queue_reconciliation_policy_docs_are_safe", content)
        self.assertIn("evidence-first", content)
        self.assertIn("observation-only", content)

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)
        self.assertNotRegex(content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")

    def test_ack_pending_docs_and_spec_matrix_are_safe(self):
        queue_source = Path("src/agent_working_group/queue.py").read_text(encoding="utf-8")
        cli_source = Path("src/agent_working_group/cli.py").read_text(encoding="utf-8")
        docs = Path("docs/queue-reconciliation.md").read_text(encoding="utf-8")
        matrix = Path("docs/spec-matrix.md").read_text(encoding="utf-8")
        readme = Path("README.md").read_text(encoding="utf-8")

        self.assertIn("def ack_pending", queue_source)
        ack_pending_body = queue_source.split("def ack_pending", 1)[1].split("def retry", 1)[0]
        self.assertNotIn("receive(", ack_pending_body)
        self.assertIn("with self.lock(agent):", ack_pending_body)
        self.assertIn("find_message_file(paths.inbox", ack_pending_body)
        self.assertIn("find_message_files(paths.inbox", ack_pending_body)
        self.assertIn("refs", ack_pending_body)
        self.assertIn("ackedAt", ack_pending_body)
        self.assertIn("ack-pending", cli_source)
        self.assertIn("--expect-kind", cli_source)
        self.assertIn("--expect-from", cli_source)
        self.assertIn("--expect-to", cli_source)
        self.assertIn("--expect-created-at", cli_source)
        self.assertIn("ack-pending", docs)
        self.assertIn("not for normal worker processing", docs)
        self.assertIn("does not call `recv`", docs)
        self.assertIn("does not support bulk mode", docs)
        self.assertIn("test_ack_pending", matrix)
        self.assertIn("ack_pending", readme)

        combined = "\n".join([queue_source, cli_source, docs, matrix, readme])
        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "cl" + "aws",
            "happy" + "-" + "haki",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, combined.lower())
        local_path_pattern = "/" + "Users/" + r"[^\s`]+"
        self.assertNotRegex(combined, local_path_pattern)
        korean_pattern = "[" + "\\uac00" + "-" + "\\ud7af" + "]"
        self.assertNotRegex(combined, korean_pattern)

    def test_queue_reconciliation_action_policy_docs_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        policy_path = project_root / "docs" / "queue-reconciliation.md"
        template_path = project_root / "docs" / "templates" / "queue-reconciliation-action-audit.md"
        spec_matrix = project_root / "docs" / "spec-matrix.md"
        content = "\n".join(
            path.read_text(encoding="utf-8") for path in [policy_path, template_path, spec_matrix]
        )
        policy = policy_path.read_text(encoding="utf-8")
        template = template_path.read_text(encoding="utf-8")

        self.assertIn("Future Action Policy", policy)
        self.assertIn("Allowed future action categories are limited to", policy)
        self.assertIn("`ack`", policy)
        self.assertIn("`retry`", policy)
        self.assertIn("Do not use `nack`, `requeue-stale`, `prune`, deletion, or archive movement", policy)
        self.assertIn("queue-state report reference", policy)
        self.assertIn("completed or archived operational artifact path", policy)
        self.assertIn("merged pull request URL", policy)
        self.assertIn("per-item operator decision", policy)
        self.assertIn("target role and message id", policy)
        self.assertIn("Evidence must exist before action", policy)
        self.assertIn("item-by-item and role-scoped", policy)
        self.assertIn("Bulk actions are prohibited", policy)
        self.assertIn("Direct queue JSON reads, edits, moves, or deletion are prohibited", policy)
        self.assertIn("`recv` must not be used for reconciliation mutation", policy)
        self.assertIn("must not automatically classify messages as `superseded`", policy)
        self.assertIn("audit trail", policy)
        self.assertIn("Queue Reconciliation Action Audit", policy)
        self.assertIn("test_queue_reconciliation_action_policy_docs_are_safe", content)

        self.assertIn("Command category: `ack` or `retry`", template)
        self.assertIn("Queue-state report reference", template)
        self.assertIn("Completed or archived artifact, close report, or merged pull request", template)
        self.assertIn("Per-item operator decision", template)
        self.assertIn("Evidence exists before action", template)
        self.assertIn("Target role and message id", template)
        self.assertIn("Action is item-by-item, not bulk", template)
        self.assertIn("Action uses AWG CLI queue-aware command", template)
        self.assertIn("No direct queue JSON mutation", template)
        self.assertIn("No deletion of queue state", template)
        self.assertIn("No `recv` used for reconciliation", template)
        self.assertIn("No automatic superseded classification by tooling", template)
        self.assertIn("remaining risk", content.lower())

        self.assertNotRegex(policy, r"\b(nack|requeue-stale|prune)\b.*\ballowed\b")
        self.assertNotRegex(policy.lower(), r"bulk (ack|acknowledge|consume).*(allowed|safe|permitted)")
        self.assertIn("Age alone is not enough", policy)
        self.assertIn("treat old age as completion evidence", policy)
        self.assertNotRegex(template, r"\b(eval|bash\s+-c|sh\s+-c)\b")
        self.assertNotRegex(template, r"[|;&><].*AWG")

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        self.assertNotRegex(content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")

    def test_queue_reconciliation_report_helper_is_read_only(self):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "scripts" / "awg-queue-reconciliation-report.sh"
        docs = [
            project_root / "docs" / "queue-reconciliation.md",
            project_root / "docs" / "spec-matrix.md",
            project_root / "README.md",
        ]
        queue, root = self.with_queue()
        inbox_id = queue.send("lead", "worker", "instruction", "inbox item")
        processing_id = queue.send("lead", "worker", "question", "processing item")
        queue.receive("worker", timeout=0, require_ack=True)
        dead_id = queue.send("lead", "worker", "blocker", "dead item")
        queue.receive("worker", timeout=0, require_ack=True)
        queue.requeue_stale("worker", older_than_sec=-1, max_retries=0)

        before = queue.status("worker")
        wrapper_dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, wrapper_dir, ignore_errors=True)
        wrapper = wrapper_dir / "awg"
        wrapper.write_text(
            "#!/usr/bin/env bash\n"
            f"PYTHONPATH={project_root / 'src'} python3 -m agent_working_group.cli \"$@\"\n",
            encoding="utf-8",
        )
        wrapper.chmod(0o755)
        env = os.environ.copy()
        env.update({"AWG_CLI": "awg", "AWG_ROOT": str(root), "PATH": f"{wrapper_dir}{os.pathsep}{env.get('PATH', '')}"})

        result = subprocess.run(
            [str(script), "--role", "worker"],
            cwd=project_root,
            env=env,
            text=True,
            capture_output=True,
            check=True,
        )
        default_root_cwd = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, default_root_cwd, ignore_errors=True)
        default_queue = MessageQueue(default_root_cwd / ".agent-working-group")
        default_queue.initialize(["worker"])
        default_queue.send("lead", "worker", "note", "default root item")
        default_env = env.copy()
        default_env.pop("AWG_ROOT", None)
        default_result = subprocess.run(
            [str(script), "--role", "worker"],
            cwd=default_root_cwd,
            env=default_env,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("kind=note", default_result.stdout)
        after = queue.status("worker")

        self.assertEqual(before["pending"], after["pending"])
        self.assertEqual(before["processing"], after["processing"])
        self.assertEqual(before["dead"], after["dead"])
        self.assertIn(inbox_id, result.stdout)
        self.assertIn(processing_id, result.stdout)
        self.assertIn(dead_id, result.stdout)
        self.assertIn("## inbox", result.stdout)
        self.assertIn("## processing", result.stdout)
        self.assertIn("## dead", result.stdout)
        self.assertIn("kind=instruction", result.stdout)
        self.assertIn("from=lead", result.stdout)
        self.assertIn("to=worker", result.stdout)
        self.assertIn("created=", result.stdout)
        self.assertIn("queue-state-only", result.stdout)
        self.assertNotIn("superseded", result.stdout.lower())
        self.assertNotRegex(result.stdout, r"/" + "Users/|/" + "home/|~" + r"/")

        empty_result = subprocess.run(
            [str(script), "--role", "reviewer"],
            cwd=project_root,
            env=env,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("- none", empty_result.stdout)

        missing_role = subprocess.run(
            [str(script)],
            cwd=project_root,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(missing_role.returncode, 0)
        self.assertIn("missing required --role", missing_role.stderr)

        script_content = script.read_text(encoding="utf-8")
        content = script_content + "\n" + "\n".join(path.read_text(encoding="utf-8") for path in docs)
        self.assertIn("awg-queue-reconciliation-report.sh --role", content)
        self.assertIn("reports queue state only", content)
        self.assertIn("test_queue_reconciliation_report_helper_is_read_only", content)
        self.assertNotRegex(script_content, r"\brecv\b")
        self.assertNotRegex(script_content, r"\back\b|\bretry\b|\bnack\b|requeue-stale|\bprune\b")
        self.assertNotRegex(script_content, r"\beval\b|bash\s+-c|sh\s+-c")
        self.assertNotRegex(script_content, r"jq\s|sed\s+.*queues/.+json")
        self.assertNotRegex(script_content, r"\bcurl\b|wget|http://|https://")
        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)
        self.assertNotRegex(content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")


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
        processing_queue.receive("worker", timeout=0, require_ack=True)
        before = processing_queue.status("worker")
        processing_result = run_report(processing_root)
        after = processing_queue.status("worker")
        self.assertEqual(before, after)
        self.assertIn("category=active-processing", processing_result.stdout)
        self.assertIn(processing_id, processing_result.stdout)
        self.assertIn("## processing", processing_result.stdout)

        dead_queue, dead_root = self.with_queue()
        dead_id = dead_queue.send("lead", "worker", "blocker", "dead item")
        dead_queue.receive("worker", timeout=0, require_ack=True)
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
        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
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

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, docs_content.lower())
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

    def test_artifact_index_helper_outputs_markdown_and_json(self):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "scripts" / "awg-artifact-index.sh"
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "awg-ops"
            active = root / "active"
            completed = root / "completed"
            archive = root / "archive"
            active.mkdir(parents=True)
            completed.mkdir()
            archive.mkdir()
            active_file = active / "202605091200-example-scope.md"
            completed_file = completed / "202605091205-example-close-report.md"
            archive_file = archive / "untimestamped-note.md"
            active_file.write_text("# Example Scope\n\nBody\n", encoding="utf-8")
            completed_file.write_text("# Example Close Report\n", encoding="utf-8")
            archive_file.write_text("# Archived Note\n", encoding="utf-8")

            markdown = subprocess.run(
                [str(script), "--root", str(root), "--limit", "2"],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(markdown.returncode, 0, markdown.stderr)
            self.assertIn("# AWG Artifact Index", markdown.stdout)
            self.assertIn("`completed/202605091205-example-close-report.md`", markdown.stdout)
            self.assertIn("`active/202605091200-example-scope.md`", markdown.stdout)
            self.assertNotIn("untimestamped-note.md", markdown.stdout)

            json_run = subprocess.run(
                [str(script), "--root", str(root), "--format", "json"],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(json_run.returncode, 0, json_run.stderr)
            payload = json.loads(json_run.stdout)
            self.assertEqual(payload["count"], 3)
            by_path = {item["relativePath"]: item for item in payload["items"]}
            self.assertEqual(by_path["active/202605091200-example-scope.md"]["status"], "active")
            self.assertEqual(by_path["completed/202605091205-example-close-report.md"]["created"], "2026-05-09 12:05")
            self.assertEqual(by_path["archive/untimestamped-note.md"]["title"], "Archived Note")

    def test_artifact_index_helper_rejects_queue_roots_and_preserves_files(self):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "scripts" / "awg-artifact-index.sh"
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "awg-ops"
            completed = root / "completed"
            completed.mkdir(parents=True)
            artifact = completed / "202605091210-keep-me.md"
            original = "# Keep Me\n\nDo not mutate.\n"
            artifact.write_text(original, encoding="utf-8")

            ok = subprocess.run(
                [str(script), "--root", str(root), "--format", "json"],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(ok.returncode, 0, ok.stderr)
            self.assertEqual(artifact.read_text(encoding="utf-8"), original)
            self.assertTrue(artifact.exists())

            queue_root = Path(temp) / ".agent-working-group" / "queues" / "worker"
            queue_root.mkdir(parents=True)
            rejected = subprocess.run(
                [str(script), "--root", str(queue_root), "--format", "json"],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("refusing to index queue/runtime state", rejected.stderr)

    def test_artifact_index_docs_and_script_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "artifact-index.md",
            project_root / "docs" / "artifact-retention.md",
            project_root / "docs" / "spec-matrix.md",
            project_root / "README.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        script = (project_root / "scripts" / "awg-artifact-index.sh").read_text(encoding="utf-8")

        self.assertIn("read-only", content)
        self.assertIn("Artifact index generation is read-only", content)
        self.assertIn("stdout", content)
        self.assertIn("refuses queue/runtime roots", content)
        self.assertIn("Output goes to", script)
        self.assertNotRegex(script, r"\b(mv|rm|unlink|rmdir|cp)\b")
        self.assertNotRegex(script, r"\b(recv|ack|ack-pending|retry|nack|prune|requeue-stale)\b")
        self.assertNotRegex(script, r"curl|wget|http://|https://")
        self.assertNotRegex(script, r"eval|bash\s+-c|sh\s+-c")
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

    def test_queue_notifier_adapter_docs_and_script_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "queue-notifier-adapters.md",
            project_root / "docs" / "queue-notifier.md",
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
        self.assertIn("Queue notifier dispatch converts read-only notifier output", content)
        self.assertIn("--no-record", script)
        self.assertIn("NOTIFIER_ARGS", script)
        self.assertNotRegex(script, r"\b(recv|ack|ack-pending|retry|nack|prune|requeue-stale)\b")
        self.assertNotRegex(script, r"curl|wget|http://|https://")
        self.assertNotRegex(script, r"eval|bash\s+-c|sh\s+-c")
        self.assertNotRegex(script, r"rm\s+.*queue|unlink|mv\s+.*queues")

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

    def test_output_publish_gate_docs_are_general_and_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "output-publish-gate.md",
            project_root / "docs" / "queue-first-workflow.md",
            project_root / "docs" / "templates" / "task-spec.md",
            project_root / "docs" / "templates" / "close-report.md",
            project_root / "docs" / "codex-tmux-worker.md",
            project_root / "docs" / "worker-operations.md",
            project_root / "docs" / "spec-matrix.md",
            project_root / "README.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)

        self.assertIn("output or publish boundary", content)
        self.assertIn("Output Or Publish Gate", content)
        self.assertIn("Output/publish gate: fulfilled/skipped/not applicable", content)
        self.assertIn("local artifact", content)
        self.assertIn("office/admin output", content)
        self.assertIn("external send", content)
        self.assertIn("queue mutation", content)
        self.assertIn("worker execution", content)
        self.assertIn("AWG does not require pull requests, Codex, tmux, or coding-specific ceremony", content)
        self.assertIn("Codex and tmux workers are optional execution paths", content)
        self.assertIn("clean-worktree rules are scoped to Codex/Git execution", content)
        self.assertIn("non-trivial PR", content)
        self.assertIn("PR review gate: fulfilled", content)

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

    def test_pr_review_gate_docs_and_helper_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "pr-review-gate.md",
            project_root / "docs" / "templates" / "pr-review-request.md",
            project_root / "docs" / "templates" / "pr-review-result-comment.md",
            project_root / "docs" / "templates" / "close-report.md",
            project_root / "scripts" / "awg-pr-review-request.sh",
            project_root / "scripts" / "awg-pr-publish-gate-check.sh",
            project_root / "README.md",
            project_root / "docs" / "queue-first-workflow.md",
            project_root / "docs" / "protocol.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        script = (project_root / "scripts" / "awg-pr-review-request.sh").read_text(encoding="utf-8")
        gate_script = (project_root / "scripts" / "awg-pr-publish-gate-check.sh").read_text(encoding="utf-8")

        self.assertIn("queue-first", content)
        self.assertIn("never auto-merge or auto-approve", content.lower())
        self.assertIn("PR Review Result Comment", content)
        self.assertIn("PR review gate: fulfilled", content)
        self.assertIn("Public PR evidence comment URL", content)
        self.assertIn("skip reason", content.lower())
        self.assertIn("Pre-PR implementation QA", content)
        self.assertIn(" pr view ", script)
        self.assertIn(" pr diff ", script)
        self.assertIn(" pr checks ", script)
        self.assertIn("send --from", script)
        self.assertIn("pr_review_gate=fulfilled", gate_script)
        self.assertIn("pr_review_gate=skipped", gate_script)
        combined_scripts = script + "\n" + gate_script
        self.assertNotRegex(combined_scripts, r"gh\s+pr\s+merge")
        self.assertNotRegex(combined_scripts, r"gh\s+pr\s+review[^\n]*(--approve|approve)")
        self.assertNotRegex(combined_scripts, r"git\s+checkout|git\s+switch")
        self.assertNotRegex(combined_scripts, r"\b(make|pytest|npm|python3?)\s+(test|install|run|-)")

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

    def test_pr_publish_gate_check_requires_evidence_or_skip(self):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "scripts" / "awg-pr-publish-gate-check.sh"
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            fake_gh = temp_path / "gh"
            fake_gh.write_text(
                "#!/usr/bin/env bash\n"
                "set -euo pipefail\n"
                "if [ \"$1 $2\" = \"auth status\" ]; then exit 0; fi\n"
                "if [ \"$1 $2\" = \"pr view\" ]; then printf '%s\\n' \"${FAKE_GH_COMMENTS:-}\"; exit 0; fi\n"
                "echo unexpected gh invocation >&2\n"
                "exit 64\n",
                encoding="utf-8",
            )
            fake_gh.chmod(0o755)
            env = {**os.environ, "GH_CLI": str(fake_gh)}

            missing = subprocess.run(
                [str(script), "--repo", "owner/repo", "--pr", "123"],
                text=True,
                capture_output=True,
                env={**env, "FAKE_GH_COMMENTS": "looks good"},
                check=False,
            )
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn("missing PR review gate evidence", missing.stderr)

            fulfilled = subprocess.run(
                [str(script), "--repo", "owner/repo", "--pr", "123"],
                text=True,
                capture_output=True,
                env={**env, "FAKE_GH_COMMENTS": "## Review Verdict\nVerdict: PASS\n## Evidence Checked"},
                check=False,
            )
            self.assertEqual(fulfilled.returncode, 0, fulfilled.stderr)
            self.assertIn("pr_review_gate=fulfilled", fulfilled.stdout)

            skipped = subprocess.run(
                [str(script), "--repo", "owner/repo", "--pr", "123", "--skip-reason", "trivial docs typo"],
                text=True,
                capture_output=True,
                env={**env, "FAKE_GH_COMMENTS": ""},
                check=False,
            )
            self.assertEqual(skipped.returncode, 0, skipped.stderr)
            self.assertIn("pr_review_gate=skipped", skipped.stdout)

        script_content = script.read_text(encoding="utf-8")
        self.assertNotRegex(script_content, r"gh\s+pr\s+merge")
        self.assertNotRegex(script_content, r"gh\s+pr\s+review[^\n]*(--approve|approve)")
        self.assertNotRegex(script_content, r"git\s+checkout|git\s+switch")
        self.assertNotRegex(script_content, r"\b(recv|ack|retry|nack|prune|requeue-stale)\b")

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
        self.assertIn("Allowed Base For Artifact Automation", content)
        self.assertIn("artifact workspace root as an explicit allowed base", content)
        self.assertIn("helpers should not infer it from the current working directory", content)
        self.assertIn("Queue directories are live coordination state and are never valid artifact targets", content)
        self.assertIn("fail closed when the allowed base is missing or invalid", content)
        self.assertIn("does not make artifact movement automatic", content)
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

    def run_executor_bridge(
        self,
        root,
        status="success",
        body="do work",
        kind="instruction",
        executor_script="awg-fake-executor.sh",
        env_extra=None,
    ):
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
        env = {
            **os.environ,
            "AWG_CLI": str(wrapper),
            "AWG_ROOT": str(root),
            "WORKER": "worker",
            "LEAD": "lead",
            "RECV_TIMEOUT": "1",
            "FAKE_EXECUTOR_STATUS": status,
        }
        if env_extra:
            env.update(env_extra)
        result = subprocess.run(
            [
                str(project_root / "scripts" / "awg-executor-bridge.sh"),
                "--",
                str(project_root / "scripts" / executor_script),
            ],
            cwd=project_root,
            env=env,
            text=True,
            capture_output=True,
            check=False,
            timeout=10,
        )
        return queue, message_id, result

    def run_real_executor_template(self, root, mode=None, body="do work", kind="instruction"):
        env_extra = {}
        if mode is not None:
            env_extra["AWG_REAL_EXECUTOR_MODE"] = mode
        return self.run_executor_bridge(
            root,
            body=body,
            kind=kind,
            executor_script="awg-real-executor-template.sh",
            env_extra=env_extra,
        )

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


    def run_codex_executor_bridge(self, root, fake_exit=0, fake_output="codex fake success", body="change one file", repo=None):
        project_root = Path(__file__).resolve().parents[1]
        wrapper = root / "awg-wrapper"
        wrapper.write_text(
            "#!/bin/sh\n"
            f"PYTHONPATH={project_root / 'src'} exec {sys.executable} -m agent_working_group.cli \"$@\"\n",
            encoding="utf-8",
        )
        wrapper.chmod(0o755)
        fake_codex = root / "fake-codex"
        fake_codex.write_text(
            "#!/usr/bin/env python3\n"
            "import os, pathlib, sys\n"
            "pathlib.Path(os.environ['FAKE_CODEX_ARGV']).write_text('\\n'.join(sys.argv), encoding='utf-8')\n"
            "print(os.environ.get('FAKE_CODEX_OUTPUT', 'codex fake success'))\n"
            "raise SystemExit(int(os.environ.get('FAKE_CODEX_EXIT', '0')))\n",
            encoding="utf-8",
        )
        fake_codex.chmod(0o755)
        repo_path = repo or (root / "repo")
        repo_path.mkdir(parents=True, exist_ok=True)
        queue = MessageQueue(root)
        message_id = queue.send("lead", "codex-worker", "instruction", body, repo=str(repo_path), workspace=str(repo_path))
        env = {
            **os.environ,
            "AWG_CLI": str(wrapper),
            "AWG_ROOT": str(root),
            "WORKER": "codex-worker",
            "LEAD": "lead",
            "RECV_TIMEOUT": "1",
            "AWG_CODEX_BIN": str(fake_codex),
            "AWG_CODEX_OUTPUT_DIR": str(root / "codex-output"),
            "FAKE_CODEX_ARGV": str(root / "fake-codex.argv"),
            "FAKE_CODEX_OUTPUT": fake_output,
            "FAKE_CODEX_EXIT": str(fake_exit),
        }
        result = subprocess.run(
            [
                str(project_root / "scripts" / "awg-executor-bridge.sh"),
                "--",
                str(project_root / "scripts" / "awg-codex-executor.sh"),
            ],
            cwd=project_root,
            env=env,
            text=True,
            capture_output=True,
            check=False,
            timeout=20,
        )
        return queue, message_id, result, root / "fake-codex.argv"

    def make_git_repo(self, root):
        repo = root / "repo"
        repo.mkdir()
        subprocess.run(["git", "init"], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=repo, check=True)
        subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True)
        (repo / "README.md").write_text("ready\n", encoding="utf-8")
        subprocess.run(["git", "add", "README.md"], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return repo

    def run_codex_prepare_worktree(self, repo, *args):
        project_root = Path(__file__).resolve().parents[1]
        return subprocess.run(
            [str(project_root / "scripts" / "awg-codex-prepare-worktree.sh"), "--repo", str(repo), *args],
            cwd=project_root,
            text=True,
            capture_output=True,
            check=False,
            timeout=20,
        )

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
        self.assertEqual(queue.status("codex-worker")["processing"], 0)
        processed = queue.processed("codex-worker", limit=1)[0]
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
        self.assertEqual(queue.status("codex-worker")["processing"], 1)
        processing = queue.processing("codex-worker", limit=1)[0]
        self.assertEqual(processing["id"], message_id)
        self.assertNotIn("ackedAt", processing["refs"])
        lead_message = queue.peek("lead")[0]
        self.assertEqual(lead_message["kind"], "status")
        self.assertIn("operator decides", lead_message["body"])

    def test_codex_executor_requires_explicit_repo(self):
        _, root = self.with_queue()
        queue = MessageQueue(root)
        message_id = queue.send("lead", "codex-worker", "instruction", "do work")
        project_root = Path(__file__).resolve().parents[1]
        wrapper = root / "awg-wrapper"
        wrapper.write_text(
            "#!/bin/sh\n"
            f"PYTHONPATH={project_root / 'src'} exec {sys.executable} -m agent_working_group.cli \"$@\"\n",
            encoding="utf-8",
        )
        wrapper.chmod(0o755)
        env = {**os.environ, "AWG_CLI": str(wrapper), "AWG_ROOT": str(root), "WORKER": "codex-worker", "LEAD": "lead", "RECV_TIMEOUT": "1"}
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
        self.assertEqual(queue.status("codex-worker")["processing"], 1)
        self.assertEqual(queue.processing("codex-worker", limit=1)[0]["id"], message_id)
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
        self.assertEqual(queue.status("codex-worker")["processing"], 1)
        self.assertEqual(queue.processing("codex-worker", limit=1)[0]["id"], message_id)
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
        message_id = queue.send("lead", "codex-worker", "instruction", "write summary", repo=str(repo), workspace=str(repo))
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
                "WORKER": "codex-worker",
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
        summaries = list(summary_dir.glob("codex-worker.summary.*.json"))
        self.assertEqual(len(summaries), 1)
        payload = json.loads(summaries[0].read_text(encoding="utf-8"))
        self.assertEqual(payload["worker"], "codex-worker")
        self.assertEqual(payload["lead"], "lead")
        self.assertEqual(payload["tasks"], 1)
        self.assertEqual(payload["stopReason"], "max tasks")
        self.assertEqual(payload["logDir"], str(log_dir))
        self.assertEqual(payload["logFile"], str(run_log))
        self.assertIn("startedAt", payload)
        self.assertIn("stoppedAt", payload)
        self.assertGreaterEqual(payload["durationSeconds"], 0)
        self.assertEqual(queue.status("codex-worker")["processing"], 0)
        self.assertEqual(queue.processed("codex-worker", limit=1)[0]["id"], message_id)

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
        older = summary_dir / "codex-worker.summary.20260101000000.json"
        latest = summary_dir / "codex-worker.summary.20260101000100.json"
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
                "WORKER": "codex-worker",
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
                "WORKER": "codex-worker",
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
        forbidden_names = ("mat" + "dori", "mat" + "gukno", "happy" + "-" + "haki")
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, docs.lower())

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
        forbidden_names = ("mat" + "dori", "mat" + "gukno", "happy" + "-" + "haki")
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, docs.lower())


    def test_run_summary_and_log_non_authority_docs_are_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        checked_paths = [
            project_root / "docs" / "codex-tmux-worker.md",
            project_root / "docs" / "worker-operations.md",
            project_root / "docs" / "queue-reconciliation.md",
            project_root / "docs" / "spec-matrix.md",
            project_root / "README.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)

        self.assertIn("latest_summary=PATH", content)
        self.assertIn("Run summaries, logs, and status pointers are not queue authority", content)
        self.assertIn("Summary files, logs, and status pointers can be evidence references", content)
        self.assertIn("not queue authority", content)
        self.assertIn("not authority for `ack`, `ack-pending`, `retry`, `nack`, `requeue-stale`, `prune`, deletion, routing, or direct queue JSON edits", content)
        self.assertIn("Before any reviewed-item mutation, re-read live queue state", content)
        self.assertIn("Immediately before any reviewed-item mutation, re-read the live queue item", content)
        self.assertIn("compare expected metadata", content)
        self.assertIn("kind, from, to, and createdAt", content)
        self.assertIn("fail closed on drift without moving the message", content)
        self.assertIn("Drift or mismatch must fail closed without moving the message", content)
        self.assertIn("test_run_summary_and_log_non_authority_docs_are_safe", content)
        self.assertIn("test_ack_pending_expect_flag_mismatches_fail_closed", content)
        self.assertIn("message.id remains the canonical message identity", content)
        self.assertIn("processing/ remains the only durable active claim-like queue state", content)
        self.assertNotIn("retry_attempts", content)
        self.assertNotRegex(content, r"\bclaimed\b")
        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)
        self.assertNotRegex(content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")

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
            project_root / "tests" / "test_queue.py",
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
        forbidden_names = ("mat" + "dori", "mat" + "gukno", "happy" + "-" + "haki")
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
        self.assertIn("workId", content)
        self.assertIn("parentId", content)
        self.assertIn("sourceChannel", content)
        self.assertIn("reportTarget", content)
        self.assertIn("workspace", content)
        self.assertIn("--correlation-id", content)
        self.assertIn("--work-id", content)
        self.assertIn("--parent-id", content)
        self.assertIn("--source-channel", content)
        self.assertIn("--report-target", content)
        self.assertIn("optional conventions", content)
        self.assertIn("not required schema fields", content)
        self.assertIn("message.id remains the canonical message identity", content)
        self.assertIn("processing/ remains the only durable active claim-like queue state", content)
        self.assertIn("does not change delivery order", content)
        self.assertIn("does not change queue delivery", content)
        self.assertIn("queue selection", content)
        self.assertIn("automatic routing", content)
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


    def test_two_agent_example_workflow_is_runnable_and_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "examples" / "two_agent_loop.sh"
        docs = project_root / "examples" / "README.md"
        readme = project_root / "README.md"
        runbook = project_root / "docs" / "operator-runbook.md"
        spec_matrix = project_root / "docs" / "spec-matrix.md"
        content = "\n".join(
            path.read_text(encoding="utf-8") for path in (script, docs, readme, runbook, spec_matrix)
        )

        self.assertTrue(script.exists())
        self.assertTrue(docs.exists())
        self.assertTrue(script.stat().st_mode & 0o111)
        self.assertIn("examples/two_agent_loop.sh", content)
        self.assertIn("demo-task-001", content)
        self.assertIn("--source-channel", content)
        self.assertIn("--report-target", content)
        self.assertIn("--repo", content)
        self.assertIn("--workspace", content)
        self.assertIn("traceability-only", content)
        self.assertIn("Refusing to reset non-temporary demo root", content)
        self.assertIn("/tmp/agent-working-group-demo", content)
        self.assertIn("test_two_agent_example_workflow_is_runnable_and_safe", content)

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
        )
        for forbidden in forbidden_names:
            self.assertNotIn(forbidden, content.lower())
        local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
        self.assertNotRegex(content, local_path_pattern)
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)
        self.assertNotRegex(content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")

        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            awg_wrapper = temp_path / "awg-wrapper"
            awg_wrapper.write_text(
                "#!/usr/bin/env bash\n"
                "set -euo pipefail\n"
                f"cd {project_root}\n"
                "exec python3 -m agent_working_group.cli \"$@\"\n",
                encoding="utf-8",
            )
            awg_wrapper.chmod(0o755)
            demo_root = temp_path / "demo-root"
            blocked_root = temp_path / "not-under-tmp"
            env = os.environ.copy()
            env["PYTHONPATH"] = str(project_root / "src")
            env["AWG_BIN"] = str(awg_wrapper)

            blocked = subprocess.run(
                [str(script), str(blocked_root)],
                text=True,
                capture_output=True,
                env=env,
                check=False,
            )
            self.assertNotEqual(blocked.returncode, 0)
            self.assertIn("Refusing to reset non-temporary demo root", blocked.stderr)

            demo_root = Path("/tmp") / f"awg-example-test-{os.getpid()}"
            shutil.rmtree(demo_root, ignore_errors=True)
            try:
                result = subprocess.run(
                    [str(script), str(demo_root)],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                self.assertIn("sent task:", result.stdout)
                self.assertIn("reviewer final status", result.stdout)
                self.assertIn("lead final status", result.stdout)
                self.assertIn('"pending": 0', result.stdout)
                self.assertIn('"processing": 0', result.stdout)

                messages = list((demo_root / "queues" / "reviewer" / "processed").glob("*.json"))
                self.assertEqual(len(messages), 1)
                message = json.loads(messages[0].read_text(encoding="utf-8"))
                self.assertEqual(message["refs"]["correlationId"], "demo-task-001")
                self.assertEqual(message["refs"]["sourceChannel"], "local-demo")
                self.assertEqual(message["refs"]["reportTarget"], "terminal")
                self.assertEqual(message["refs"]["repo"], "example/project")
                self.assertEqual(message["refs"]["workspace"], "demo-main")
                self.assertIn("ackedAt", message["refs"])
            finally:
                shutil.rmtree(demo_root, ignore_errors=True)


    def test_operator_runbook_and_api_docs_are_current_and_safe(self):
        project_root = Path(__file__).resolve().parents[1]
        readme = project_root / "README.md"
        api = project_root / "docs" / "api.md"
        runbook = project_root / "docs" / "operator-runbook.md"
        spec_matrix = project_root / "docs" / "spec-matrix.md"
        queue_source = project_root / "src" / "agent_working_group" / "queue.py"
        content = "\n".join(
            path.read_text(encoding="utf-8") for path in (readme, api, runbook, spec_matrix)
        )

        self.assertTrue(runbook.exists())
        self.assertIn("Operator Runbook", content)
        self.assertIn("Clean Clone Setup", content)
        self.assertIn("What The Repository Provides", content)
        self.assertIn("What Operators Must Provide", content)
        self.assertIn("Queue Partitioning", content)
        self.assertIn("Default to one queue per role", content)
        self.assertIn("source_channel=None", content)
        self.assertIn("report_target=None", content)
        self.assertIn("repo=None", content)
        self.assertIn("workspace=None", content)
        self.assertIn("refs.sourceChannel", content)
        self.assertIn("refs.reportTarget", content)
        self.assertIn("traceability", content)
        self.assertIn("does not change delivery order", content)
        self.assertIn("credentials", content)
        self.assertIn("notification surfaces", content)
        self.assertIn("artifact", content.lower())
        self.assertIn("docs/operator-runbook.md", readme.read_text(encoding="utf-8"))
        self.assertIn("test_operator_runbook_and_api_docs_are_current_and_safe", spec_matrix.read_text(encoding="utf-8"))

        queue_text = queue_source.read_text(encoding="utf-8")
        self.assertIn("source_channel: object = None", queue_text)
        self.assertIn("report_target: object = None", queue_text)

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
        self.assertNotRegex(content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")


    def run_independent_analysis_helper(self, mode="all"):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "scripts" / "awg-independent-analysis-template.sh"
        return subprocess.run(
            [str(script), mode],
            text=True,
            capture_output=True,
            check=False,
        )

    def independent_section(self, content, heading):
        start = content.index(heading)
        rest = content[start:]
        next_heading = rest.find("\n## ", 1)
        return rest if next_heading == -1 else rest[:next_heading]

    def bullet_fields(self, section):
        return [line for line in section.splitlines() if line.startswith("- ")]

    def test_independent_analysis_template_helper_outputs_required_fields(self):
        project_root = Path(__file__).resolve().parents[1]
        task_template = (project_root / "docs" / "templates" / "task-spec.md").read_text(encoding="utf-8")
        review_template = (project_root / "docs" / "templates" / "review-result.md").read_text(encoding="utf-8")
        close_template = (project_root / "docs" / "templates" / "close-report.md").read_text(encoding="utf-8")

        expectations = {
            "task-spec": (
                "## Independent Analysis Requirement",
                self.independent_section(task_template, "## Independent Analysis Requirement"),
            ),
            "review-result": (
                "## Independent Analysis Comparison",
                self.independent_section(review_template, "## Independent Analysis Comparison"),
            ),
            "close-report": (
                "## Independent Analysis",
                self.independent_section(close_template, "## Independent Analysis"),
            ),
        }

        all_result = self.run_independent_analysis_helper("all")
        self.assertEqual(all_result.returncode, 0, all_result.stderr)
        self.assertIn("## Independent Analysis Requirement", all_result.stdout)
        self.assertIn("## Independent Analysis Comparison", all_result.stdout)
        self.assertIn("## Independent Analysis", all_result.stdout)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            marker = root / "marker.txt"
            marker.write_text("unchanged", encoding="utf-8")
            before = {str(path.relative_to(root)): path.read_bytes() for path in root.rglob("*") if path.is_file()}
            result = self.run_independent_analysis_helper("all")
            after = {str(path.relative_to(root)): path.read_bytes() for path in root.rglob("*") if path.is_file()}
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(before, after)

        for mode, (heading, template_section) in expectations.items():
            result = self.run_independent_analysis_helper(mode)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(heading, result.stdout)
            self.assertEqual(
                self.bullet_fields(template_section),
                self.bullet_fields(result.stdout),
            )
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(result.stdout, local_path_pattern)

    def test_independent_analysis_template_helper_is_safe_and_documented(self):
        project_root = Path(__file__).resolve().parents[1]
        script_path = project_root / "scripts" / "awg-independent-analysis-template.sh"
        checked_paths = [
            script_path,
            project_root / "docs" / "queue-first-workflow.md",
            project_root / "docs" / "spec-matrix.md",
            project_root / "README.md",
            project_root / "docs" / "templates" / "task-spec.md",
            project_root / "docs" / "templates" / "review-result.md",
            project_root / "docs" / "templates" / "close-report.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        script = script_path.read_text(encoding="utf-8")

        self.assertTrue(script_path.exists())
        self.assertTrue(os.access(script_path, os.X_OK))
        self.assertIn("#!/usr/bin/env bash", script)
        self.assertIn("set -euo pipefail", script)
        self.assertIn("--help", script)
        self.assertIn("stdout only", script)
        self.assertIn("does not decide whether independent", script)
        self.assertIn("task-spec|review-result|close-report|all", script)
        self.assertIn("scripts/awg-independent-analysis-template.sh", content)
        self.assertIn("advisory and stdout-only", content)
        self.assertIn("does not modify files", content)
        self.assertIn("must not become an enforcement gate", content)
        self.assertIn("test_independent_analysis_template_helper_outputs_required_fields", content)
        self.assertIn("test_independent_analysis_template_helper_is_safe_and_documented", content)
        self.assertIn("without forcing ceremony on trivial work", content)

        self.assertNotRegex(script, r"\beval\b|bash\s+-c|sh\s+-c")
        self.assertNotRegex(script, r"\bcurl\b|\bwget\b|https?://")
        self.assertNotRegex(script, r"jq\s|sed\s+-i|queues/.+json")

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
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


    def run_repository_rule_helper(self, repo_root):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "scripts" / "awg-detect-repository-rules.sh"
        return subprocess.run(
            [str(script), str(repo_root)],
            text=True,
            capture_output=True,
            check=False,
        )

    def snapshot_files(self, repo_root):
        snapshot = {}
        for path in sorted(Path(repo_root).rglob("*")):
            if path.is_file():
                snapshot[str(path.relative_to(repo_root))] = path.read_bytes()
        return snapshot

    def test_repository_rule_detection_helper_finds_sources_and_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            contributing = root / "CONTRIBUTING.md"
            contributing.write_text("Commit message policy: use Conventional Commits.\n", encoding="utf-8")
            result = self.run_repository_rule_helper(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("CONTRIBUTING.md", result.stdout)
            self.assertIn("contribution, maintainer, or workflow documentation", result.stdout)
            self.assertNotIn(str(root), result.stdout)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            template = root / ".github" / "PULL_REQUEST_TEMPLATE.md"
            template.parent.mkdir()
            template.write_text("PR title must follow the documented release policy.\n", encoding="utf-8")
            result = self.run_repository_rule_helper(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(".github/PULL_REQUEST_TEMPLATE.md", result.stdout)
            self.assertIn("pull request or issue template", result.stdout)
            self.assertNotIn(str(root), result.stdout)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = root / ".commitlintrc"
            config.write_text('{"extends":["@commitlint/config-conventional"]}\n', encoding="utf-8")
            result = self.run_repository_rule_helper(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(".commitlintrc", result.stdout)
            self.assertIn("commit lint, release, or changelog configuration", result.stdout)
            self.assertNotIn(str(root), result.stdout)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            package = root / "package.json"
            package.write_text('{"commitlint":{"extends":["@commitlint/config-conventional"]}}\n', encoding="utf-8")
            result = self.run_repository_rule_helper(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("package.json", result.stdout)
            self.assertIn("package or tool configuration with commit/title hints", result.stdout)
            self.assertNotIn(str(root), result.stdout)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "README.md").write_text("No rule here.\n", encoding="utf-8")
            before = self.snapshot_files(root)
            result = self.run_repository_rule_helper(root)
            after = self.snapshot_files(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(before, after)
            self.assertIn("no explicit repository rule found; use Conventional Commits fallback", result.stdout)
            self.assertNotIn(str(root), result.stdout)

    def test_repository_rule_detection_helper_is_safe_and_documented(self):
        project_root = Path(__file__).resolve().parents[1]
        script_path = project_root / "scripts" / "awg-detect-repository-rules.sh"
        checked_paths = [
            script_path,
            project_root / "docs" / "repository-rules.md",
            project_root / "docs" / "templates" / "pr-review-request.md",
            project_root / "docs" / "templates" / "close-report.md",
            project_root / "docs" / "spec-matrix.md",
            project_root / "README.md",
        ]
        content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
        script = script_path.read_text(encoding="utf-8")

        self.assertTrue(script_path.exists())
        self.assertTrue(os.access(script_path, os.X_OK))
        self.assertIn("#!/usr/bin/env bash", script)
        self.assertIn("set -euo pipefail", script)
        self.assertIn("--help", script)
        self.assertIn("Discovery order follows docs/repository-rules.md", script)
        self.assertIn("CONTRIBUTING.md", script)
        self.assertIn(".github/PULL_REQUEST_TEMPLATE.md", script)
        self.assertIn(".commitlintrc", script)
        self.assertIn("package.json", script)
        self.assertIn("docs/merge-policy.md", script)
        self.assertIn("no explicit repository rule found; use Conventional Commits fallback", script)
        self.assertIn("read-only and local-only", content)
        self.assertIn("repository-relative paths", content)
        self.assertIn("test_repository_rule_detection_helper_finds_sources_and_fallback", content)
        self.assertIn("test_repository_rule_detection_helper_is_safe_and_documented", content)

        self.assertNotRegex(script, r"\beval\b|bash\s+-c|sh\s+-c")
        self.assertNotRegex(script, r"\bcurl\b|\bwget\b|https?://")
        self.assertNotRegex(script, r"jq\s|sed\s+-i|queues/.+json")
        self.assertNotRegex(script, r"stat\s+-c|readlink\s+-f|xargs\s+-r")

        forbidden_names = (
            "mat" + "dori",
            "mat" + "gukno",
            "happy" + "-" + "haki",
            "cl" + "aws",
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
