import os
import sys
import tempfile
import time
import unittest
from dataclasses import dataclass
from unittest import mock
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agent_working_group import MessageQueue

SERVER_DIR = Path(__file__).resolve().parents[1] / "dashboard" / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from routers.queue import get_queue_item, list_queue  # noqa: E402
from routers.status import system_status  # noqa: E402
from routers.workers import get_worker, list_workers, request_worker_action  # noqa: E402
from services.awg_reader import AwgReader, default_root  # noqa: E402


@dataclass
class FakeSession:
    name: str
    created_at: int
    attached: bool
    windows: int


@dataclass
class FakeWindow:
    index: int
    name: str
    active: bool
    panes: int
    flags: str = ''


class FakeTmuxBackend:
    available = True

    def __init__(self, capture_text="terminal output"):
        self.capture_text = capture_text

    def list_windows(self, session):
        return [FakeWindow(0, 'main', True, 1), FakeWindow(1, 'review', False, 1)]

    def capture(self, session, lines=200, window=None):
        target = f"{session}:{window}" if window is not None else session
        return f"{self.capture_text}:{target}:{lines}"


class FakeTmuxMonitor:
    def __init__(self, sessions):
        self.backend = FakeTmuxBackend()
        self.sessions = sessions
        self._last_capture = {}

    def list_sessions(self):
        return self.sessions


def make_request(reader, monitor=None):
    return SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                awg_reader=reader,
                tmux_monitor=monitor or FakeTmuxMonitor([]),
                started_at=time.time(),
                version="test",
            )
        )
    )


class DashboardServerTests(unittest.TestCase):
    def make_reader(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        queue = MessageQueue(root)
        queue.initialize(["lead", "worker"])
        return queue, AwgReader(root), root

    def test_queue_list_and_detail_match_frontend_contract(self):
        queue, reader, _ = self.make_reader()
        message_id = queue.send(
            "lead",
            "worker",
            "instruction",
            "first line\nsecond line",
            correlation_id="dash-1",
        )

        listed = list_queue(make_request(reader), state="pending", agent="worker", limit=10)
        self.assertEqual(listed["total"], 1)
        item = listed["items"][0]
        self.assertEqual(item["id"], message_id)
        self.assertEqual(item["agent"], "worker")
        self.assertEqual(item["state"], "pending")
        self.assertEqual(item["from"], "lead")
        self.assertEqual(item["to"], "worker")
        self.assertIn("filename", item)
        self.assertIn("createdAtMs", item)

        detail = get_queue_item(make_request(reader), message_id)
        self.assertEqual(detail["body"], "first line\nsecond line")
        self.assertEqual(detail["refs"]["correlationId"], "dash-1")
        self.assertIn("message", detail)

    def test_status_exposes_queue_root_and_worker_summary(self):
        queue, reader, _ = self.make_reader()
        queue.send("lead", "worker", "note", "hello")
        monitor = FakeTmuxMonitor([
            FakeSession("awg-main", int(time.time()) - 12, False, 1),
            FakeSession("awg-review", int(time.time()) - 20, True, 2),
        ])

        status = system_status(make_request(reader, monitor))

        self.assertEqual(status["queuePath"], str(reader.queues_dir()))
        self.assertTrue(status["queuePathExists"])
        self.assertFalse(status["isTmpRoot"])
        self.assertEqual(status["workers"], {"total": 2, "attached": 1, "tmuxAvailable": True})
        self.assertEqual(status["counts"]["pending"], 1)
        self.assertEqual(status["totalQueueItems"], 1)
        self.assertEqual(status["agents"], ["lead", "worker"])
        self.assertEqual(status["recentActivity"][0]["state"], "pending")
        self.assertEqual(status["recentActivity"][0]["agent"], "worker")

    def test_recent_activity_badges_follow_queue_lifecycle(self):
        queue, reader, _ = self.make_reader()
        processed_id = queue.send("lead", "worker", "note", "default receive")
        queue.receive("worker")
        processing_id = queue.send("lead", "worker", "instruction", "durable work")
        queue.receive("worker", require_ack=True)

        status = system_status(make_request(reader))
        states = {entry["id"]: entry["state"] for entry in status["recentActivity"]}

        self.assertEqual(states[processed_id], "processed")
        self.assertEqual(states[processing_id], "processing")

    def test_workers_list_and_detail_match_frontend_contract(self):
        created = int(time.time()) - 65
        monitor = FakeTmuxMonitor([FakeSession("awg-worker", created, False, 3)])
        request = make_request(AwgReader(Path("/tmp/nonexistent-awg-test")), monitor)

        listed = list_workers(request)
        self.assertEqual(listed["total"], 1)
        self.assertTrue(listed["tmuxAvailable"])
        worker = listed["items"][0]
        self.assertEqual(worker["session"], "awg-worker")
        self.assertEqual(worker["status"], "running")
        self.assertFalse(worker["attached"])
        self.assertEqual(worker["windows"], 3)
        self.assertEqual([w["index"] for w in worker["windowItems"]], [0, 1])
        self.assertGreaterEqual(worker["uptimeSeconds"], 65)

        detail = get_worker(request, "awg-worker", lines=40, window=1)
        self.assertEqual(detail["recentOutput"], "terminal output:awg-worker:1:40")
        self.assertNotIn("awg-worker:1", monitor._last_capture)

    def test_worker_action_queues_instruction_instead_of_killing_tmux(self):
        queue, reader, root = self.make_reader()
        monitor = FakeTmuxMonitor([FakeSession("awg-worker", int(time.time()) - 65, False, 2)])
        request = make_request(reader, monitor)
        payload = SimpleNamespace(action="close-window", target="lead", reason="operator cleanup", window=1)

        with mock.patch("routers.workers.MessageQueue", return_value=queue):
            response = request_worker_action(request, "awg-worker", payload)

        self.assertTrue(response["queued"])
        queued = list((root / "queues" / "lead" / "inbox").glob("*.json"))
        self.assertEqual(len(queued), 1)
        body = queued[0].read_text(encoding="utf-8")
        self.assertIn("close-window", body)
        self.assertIn("Window: 1", body)

    def test_worker_action_rejects_unsafe_queue_target(self):
        _, reader, root = self.make_reader()
        monitor = FakeTmuxMonitor([FakeSession("awg-worker", int(time.time()) - 65, False, 2)])
        request = make_request(reader, monitor)
        payload = SimpleNamespace(action="close-session", target="../../tmp/escape", reason=None, window=None)

        with self.assertRaises(Exception) as raised:
            request_worker_action(request, "awg-worker", payload)

        self.assertEqual(getattr(raised.exception, "status_code", None), 400)
        self.assertFalse((root.parent / "tmp").exists())

    def test_default_root_prefers_repository_queue_before_tmp_fallback(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        repo = Path(temp.name)
        MessageQueue(repo / ".agent-working-group").initialize(["lead"])

        with patch.dict(os.environ, {"AWG_ROOT": ""}, clear=False), patch("pathlib.Path.cwd", return_value=repo):
            self.assertEqual(default_root(), repo / ".agent-working-group")


if __name__ == "__main__":
    unittest.main()
