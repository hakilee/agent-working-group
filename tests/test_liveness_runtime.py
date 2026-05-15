from tests.helpers import *


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _run_script(name, env_extra, *, timeout=15):
    return subprocess.run(
        [str(PROJECT_ROOT / "scripts" / name)],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        env={**os.environ, **env_extra},
        check=False,
        timeout=timeout,
    )


def _run_cli(args, env_extra, *, timeout=15):
    cmd = [sys.executable, "-m", "agent_working_group.cli", *args]
    env = {**os.environ, "PYTHONPATH": str(PROJECT_ROOT / "src"), **env_extra}
    return subprocess.run(
        cmd,
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        env=env,
        check=False,
        timeout=timeout,
    )


class WorkerHeartbeatWriterTests(QueueTestCase):
    def test_heartbeat_writer_script_creates_file_with_epoch_seconds(self):
        _queue, root = self.with_queue()
        before = int(time.time())
        result = _run_script(
            "awg-worker-heartbeat-write.sh",
            {"AWG_ROOT": str(root), "AWG_AGENT": "worker", "AWG_SESSION": "alpha"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        path = root / "heartbeats" / "worker" / "alpha.ts"
        self.assertTrue(path.is_file())
        contents = path.read_text(encoding="utf-8").strip()
        self.assertTrue(contents.isdigit(), contents)
        ts = int(contents)
        self.assertGreaterEqual(ts, before)
        self.assertLessEqual(ts, int(time.time()) + 5)

    def test_heartbeat_writer_requires_agent_and_session(self):
        _queue, root = self.with_queue()
        result = _run_script(
            "awg-worker-heartbeat-write.sh",
            {"AWG_ROOT": str(root)},
        )
        self.assertEqual(result.returncode, 64)
        self.assertIn("AWG_AGENT", result.stderr)

    def test_cli_worker_heartbeat_write_uses_env_defaults(self):
        _queue, root = self.with_queue()
        result = _run_cli(
            ["--root", str(root), "worker-heartbeat-write"],
            {"AWG_AGENT": "worker", "AWG_SESSION": "beta"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        path = root / "heartbeats" / "worker" / "beta.ts"
        self.assertTrue(path.is_file())

    def test_cli_worker_heartbeat_write_overwrites_existing(self):
        _queue, root = self.with_queue()
        _run_cli(
            ["--root", str(root), "worker-heartbeat-write", "--agent", "worker", "--session", "gamma"],
            {},
        )
        first = (root / "heartbeats" / "worker" / "gamma.ts").read_text(encoding="utf-8").strip()
        time.sleep(1.1)
        _run_cli(
            ["--root", str(root), "worker-heartbeat-write", "--agent", "worker", "--session", "gamma"],
            {},
        )
        second = (root / "heartbeats" / "worker" / "gamma.ts").read_text(encoding="utf-8").strip()
        self.assertGreater(int(second), int(first))


class HeartbeatMonitorTests(QueueTestCase):
    def _write_heartbeat(self, root, agent, session, age_seconds):
        path = root / "heartbeats" / agent / f"{session}.ts"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{int(time.time()) - age_seconds}\n", encoding="utf-8")
        return path

    def test_fresh_heartbeat_exits_zero(self):
        _queue, root = self.with_queue()
        self._write_heartbeat(root, "worker", "alpha", age_seconds=10)
        result = _run_script(
            "awg-heartbeat-monitor.sh",
            {"AWG_ROOT": str(root), "WORKER_HEARTBEAT_TIMEOUT": "300"},
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_stale_heartbeat_emits_json_and_exits_one(self):
        _queue, root = self.with_queue()
        self._write_heartbeat(root, "worker", "alpha", age_seconds=3600)
        result = _run_script(
            "awg-heartbeat-monitor.sh",
            {"AWG_ROOT": str(root), "WORKER_HEARTBEAT_TIMEOUT": "300"},
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(len(lines), 1)
        payload = json.loads(lines[0])
        self.assertEqual(payload["type"], "heartbeat.stale")
        self.assertEqual(payload["agent"], "worker")
        self.assertEqual(payload["session"], "alpha")
        self.assertEqual(payload["timeout_seconds"], 300)
        self.assertGreaterEqual(payload["age_seconds"], 3600)

    def test_missing_heartbeat_detected_when_processing_items_exist(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "in-flight")
        queue.receive("worker", timeout=0)
        result = _run_script(
            "awg-heartbeat-monitor.sh",
            {"AWG_ROOT": str(root), "WORKER_HEARTBEAT_TIMEOUT": "300"},
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        payloads = [json.loads(line) for line in lines]
        missing = [p for p in payloads if p["type"] == "heartbeat.missing"]
        self.assertEqual(len(missing), 1)
        self.assertEqual(missing[0]["agent"], "worker")

    def test_cli_heartbeat_monitor_matches_script(self):
        _queue, root = self.with_queue()
        path = root / "heartbeats" / "worker" / "alpha.ts"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{int(time.time()) - 3600}\n", encoding="utf-8")
        result = _run_cli(
            ["--root", str(root), "heartbeat-monitor", "--timeout-seconds", "300"],
            {},
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(lines[0]["type"], "heartbeat.stale")
        self.assertEqual(lines[0]["agent"], "worker")
        self.assertEqual(lines[0]["session"], "alpha")


class ProcessingTimeoutMonitorTests(QueueTestCase):
    def test_processing_timeout_monitor_exits_zero_when_fresh(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "fresh")
        queue.receive("worker", timeout=0)
        result = _run_script(
            "awg-processing-timeout-monitor.sh",
            {"AWG_ROOT": str(root), "AWG_PROCESSING_TIMEOUT": "600"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_processing_timeout_monitor_emits_json_and_exits_one(self):
        queue, root = self.with_queue()
        message_id = queue.send("lead", "worker", "instruction", "stale")
        queue.receive("worker", timeout=0)
        time.sleep(1.5)
        result = _run_script(
            "awg-processing-timeout-monitor.sh",
            {"AWG_ROOT": str(root), "AWG_PROCESSING_TIMEOUT": "0"},
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        self.assertGreaterEqual(len(lines), 1)
        timeout_alert = next(line for line in lines if line["type"] == "processing.timeout")
        self.assertEqual(timeout_alert["agent"], "worker")
        self.assertEqual(timeout_alert["messageId"], message_id)

    def test_processing_timeout_monitor_emits_notify_payload(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "stale")
        queue.receive("worker", timeout=0)
        time.sleep(1.5)
        result = _run_script(
            "awg-processing-timeout-monitor.sh",
            {
                "AWG_ROOT": str(root),
                "AWG_PROCESSING_TIMEOUT": "0",
                "AWG_NOTIFY_CHANNEL": "ops-alerts",
                "AWG_NOTIFY_TARGET": "@oncall",
            },
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        payloads = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        notify = [p for p in payloads if p["type"] == "processing.timeout.notification"]
        self.assertEqual(len(notify), 1)
        self.assertEqual(notify[0]["channel"], "ops-alerts")
        self.assertEqual(notify[0]["target"], "@oncall")
        self.assertEqual(notify[0]["alertCount"], 1)
        self.assertEqual(notify[0]["eventType"], "awg.processing.timeout.v1")

    def test_cli_processing_timeout_monitor_matches_script(self):
        queue, root = self.with_queue()
        queue.send("lead", "worker", "instruction", "stale")
        queue.receive("worker", timeout=0)
        time.sleep(1.5)
        result = _run_cli(
            ["--root", str(root), "processing-timeout-monitor", "--timeout-seconds", "0"],
            {},
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(lines[0]["type"], "processing.timeout")


class ResponseContractMonitorTests(QueueTestCase):
    def test_response_contract_monitor_exits_zero_when_clean(self):
        queue, root = self.with_queue()
        queue.send(
            "lead", "worker", "instruction", "in window",
            expected_response_within=3600,
        )
        result = _run_script(
            "awg-response-contract-monitor.sh",
            {"AWG_ROOT": str(root)},
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_response_contract_monitor_emits_breach_json(self):
        queue, root = self.with_queue()
        message_id = queue.send(
            "lead", "worker", "instruction", "breach",
            expected_response_within=1,
        )
        time.sleep(2)
        result = _run_script(
            "awg-response-contract-monitor.sh",
            {"AWG_ROOT": str(root)},
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(lines[0]["type"], "response.contract.breach")
        self.assertEqual(lines[0]["agent"], "worker")
        self.assertEqual(lines[0]["messageId"], message_id)
        self.assertGreater(lines[0]["actualSeconds"], 1)

    def test_cli_response_contract_monitor_matches_script(self):
        queue, root = self.with_queue()
        queue.send(
            "lead", "worker", "instruction", "breach",
            expected_response_within=1,
        )
        time.sleep(2)
        result = _run_cli(
            ["--root", str(root), "response-contract-monitor"],
            {},
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(lines[0]["type"], "response.contract.breach")
