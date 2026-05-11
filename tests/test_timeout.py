from tests.helpers import *

from agent_working_group.timeout import TimeoutChecker


class TimeoutCheckerTests(QueueTestCase):
    def test_stale_processing_reports_items_past_timeout(self):
        queue, root = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "stale me")
        queue.receive("worker", timeout=0, require_ack=True)

        # Pretend "now" is well past the timeout window.
        future_now = time.time() + 7200
        checker = TimeoutChecker(root, now=future_now)
        stale = checker.stale_processing(timeout_seconds=600)
        self.assertEqual(len(stale), 1)
        self.assertEqual(stale[0].agent, "worker")
        self.assertEqual(stale[0].message_id, message_id)
        self.assertGreater(stale[0].age_seconds, 600)
        self.assertEqual(stale[0].timeout_seconds, 600)

    def test_stale_processing_returns_empty_when_fresh(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "fresh")
        queue.receive("worker", timeout=0, require_ack=True)

        checker = TimeoutChecker(root)
        self.assertEqual(checker.stale_processing(timeout_seconds=600), [])

    def test_stale_processing_uses_processing_since_field_when_present(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "with explicit ts")
        queue.receive("worker", timeout=0, require_ack=True)
        processing_dir = root / "queues" / "worker" / "processing"
        path = next(processing_dir.glob("*.json"))
        message = json.loads(path.read_text(encoding="utf-8"))
        old_ms = int((time.time() - 3000) * 1000)
        message["processingSince"] = old_ms
        path.write_text(json.dumps(message), encoding="utf-8")

        checker = TimeoutChecker(root)
        stale = checker.stale_processing(timeout_seconds=600)
        self.assertEqual(len(stale), 1)
        self.assertEqual(stale[0].timestamp_source, "processingSince")
        self.assertGreaterEqual(stale[0].age_seconds, 3000 - 5)

    def test_to_dict_shape(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "shape")
        queue.receive("worker", timeout=0, require_ack=True)
        checker = TimeoutChecker(root, now=time.time() + 10000)
        stale = checker.stale_processing(timeout_seconds=60)
        self.assertEqual(len(stale), 1)
        data = stale[0].to_dict()
        self.assertEqual(
            set(data.keys()),
            {"agent", "messageId", "file", "ageSeconds", "timeoutSeconds", "timestampSource"},
        )

    def test_processing_timeout_check_script_exits_zero_when_fresh(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "fresh")
        queue.receive("worker", timeout=0, require_ack=True)
        project_root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            [str(project_root / "scripts" / "awg-processing-timeout-check.sh")],
            cwd=project_root,
            text=True,
            capture_output=True,
            env={**os.environ, "AWG_ROOT": str(root), "AWG_PROCESSING_TIMEOUT": "600"},
            check=False,
            timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_processing_timeout_check_script_exits_one_when_stale(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "stale")
        queue.receive("worker", timeout=0, require_ack=True)
        # Sleep briefly so age >= 1s, then use timeout=0 to flag it.
        time.sleep(1.5)
        project_root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            [str(project_root / "scripts" / "awg-processing-timeout-check.sh")],
            cwd=project_root,
            text=True,
            capture_output=True,
            env={**os.environ, "AWG_ROOT": str(root), "AWG_PROCESSING_TIMEOUT": "0"},
            check=False,
            timeout=15,
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("STALE", result.stdout)
        self.assertIn("agent=worker", result.stdout)


class ResponseContractTests(QueueTestCase):
    def test_send_stores_expected_response_within_in_message_json(self):
        queue, root = self.with_queue()
        message_id = queue.send(
            "lead", "worker", "instruction", "with contract",
            expected_response_within=120,
        )
        peeked = queue.peek("worker")[0]
        self.assertEqual(peeked["id"], message_id)
        self.assertEqual(peeked["expectedResponseWithin"], 120)

    def test_send_omits_contract_field_when_not_specified(self):
        queue, _root = self.with_queue()
        queue.send("lead", "worker", "instruction", "no contract")
        peeked = queue.peek("worker")[0]
        self.assertNotIn("expectedResponseWithin", peeked)

    def test_response_contract_breaches_detect_overdue_items(self):
        queue, root = self.with_queue()
        message_id = queue.send(
            "lead", "worker", "instruction", "overdue",
            expected_response_within=60,
        )
        checker = TimeoutChecker(root, now=time.time() + 3600)
        breaches = checker.response_contract_breaches()
        self.assertEqual(len(breaches), 1)
        breach = breaches[0]
        self.assertEqual(breach.agent, "worker")
        self.assertEqual(breach.message_id, message_id)
        self.assertEqual(breach.expected_seconds, 60)
        self.assertGreater(breach.actual_seconds, 60)
        self.assertEqual(breach.location, "inbox")

    def test_response_contract_breaches_check_processing_too(self):
        queue, root = self.with_queue()
        queue.send(
            "lead", "worker", "instruction", "moves to processing",
            expected_response_within=60,
        )
        queue.receive("worker", timeout=0, require_ack=True)
        checker = TimeoutChecker(root, now=time.time() + 3600)
        breaches = checker.response_contract_breaches()
        self.assertEqual(len(breaches), 1)
        self.assertEqual(breaches[0].location, "processing")

    def test_response_contract_breaches_skipped_when_within_window(self):
        queue, root = self.with_queue()
        queue.send(
            "lead", "worker", "instruction", "in window",
            expected_response_within=600,
        )
        checker = TimeoutChecker(root)
        self.assertEqual(checker.response_contract_breaches(), [])

    def test_response_contract_check_script_exits_zero_when_clean(self):
        queue, root = self.with_queue()
        queue.send(
            "lead", "worker", "instruction", "in window",
            expected_response_within=3600,
        )
        project_root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            [str(project_root / "scripts" / "awg-response-contract-check.sh")],
            cwd=project_root,
            text=True,
            capture_output=True,
            env={**os.environ, "AWG_ROOT": str(root)},
            check=False,
            timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_response_contract_check_script_reports_breach(self):
        queue, root = self.with_queue()
        queue.send(
            "lead", "worker", "instruction", "breached",
            expected_response_within=1,
        )
        # Sleep long enough to exceed the 1s contract.
        time.sleep(2)
        project_root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            [str(project_root / "scripts" / "awg-response-contract-check.sh")],
            cwd=project_root,
            text=True,
            capture_output=True,
            env={**os.environ, "AWG_ROOT": str(root)},
            check=False,
            timeout=15,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("BREACH", result.stdout)
        self.assertIn("agent=worker", result.stdout)
