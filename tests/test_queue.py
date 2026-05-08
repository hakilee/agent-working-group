import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from agent_working_group import MessageQueue


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
        self.assertNotRegex(content, r"/Users/|/home/|~/|\$HOME")
        self.assertNotRegex(content, r"[\uac00-\ud7af]")
        platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
        self.assertNotRegex(content.lower(), platform_pattern)
        self.assertNotIn(".XXXXXX" + ".json", content)
        self.assertIn("mktemp \"${LOG_DIR}/${WORKER}.msg.XXXXXX\"", content)
        self.assertIn("MAX_RECV_ERRORS=0", content)
        self.assertIn("acknowledge them without doing the work", content)

    def test_safe_poll_script_does_not_consume_worker_inbox(self):
        project_root = Path(__file__).resolve().parents[1]
        script = project_root / "scripts" / "awg-safe-poll.sh"
        content = script.read_text(encoding="utf-8")

        self.assertNotRegex(content, r"\brecv\b")
        self.assertIn("status --as", content)
        self.assertIn("send --from poller --to \"$LEAD\" --kind note", content)
        self.assertIn("requeue-stale --as \"$WORKER\"", content)


if __name__ == "__main__":
    unittest.main()
