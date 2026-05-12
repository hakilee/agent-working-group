import json
import os
import subprocess
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]


def run_script(*args: str, env: Optional[dict] = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(
        [str(ROOT / "scripts" / args[0]), *args[1:]],
        cwd=ROOT,
        env=merged_env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )


def test_work_state_persists_active_state(tmp_path: Path) -> None:
    awg_root = tmp_path / ".agent-working-group"
    run_script(
        "awg-work-state.sh",
        "start",
        "--id",
        "work-1",
        "--title",
        "Reliable test",
        "--branch",
        "infra/test",
        "--repo",
        "owner/repo",
        env={"AWG_ROOT": str(awg_root)},
    )
    run_script(
        "awg-work-state.sh",
        "update",
        "--id",
        "work-1",
        "--status",
        "tmux-watching",
        "--tmux",
        "awg-test",
        env={"AWG_ROOT": str(awg_root)},
    )

    active = json.loads((awg_root / "runtime" / "work-state" / "active.json").read_text())
    assert active["work-1"]["status"] == "tmux-watching"
    assert active["work-1"]["branch"] == "infra/test"
    assert active["work-1"]["tmuxSessions"] == ["awg-test"]

    events = (awg_root / "runtime" / "work-state" / "events.jsonl").read_text().splitlines()
    assert len(events) == 2


def test_branch_protection_dry_run_payload_is_valid_json() -> None:
    result = run_script(
        "github-protect-main.sh",
        "--repo",
        "owner/repo",
        "--dry-run",
    )
    payload = json.loads(result.stdout)
    assert payload["required_pull_request_reviews"]["required_approving_review_count"] == 1
    assert payload["allow_force_pushes"] is False
    assert payload["allow_deletions"] is False


def test_pr_create_helper_refuses_base_branch_help_is_available() -> None:
    result = run_script("awg-pr-create-and-stop.sh", "--help")
    assert "implementation-mode boundary" in result.stdout


def test_tmux_completion_watcher_help_mentions_state_id() -> None:
    result = run_script("tmux-completion-watcher.sh", "--help")
    assert "--state-id" in result.stdout
    assert "cron/systemEvents" in result.stdout


def test_work_state_corrupt_active_fails_closed(tmp_path: Path) -> None:
    awg_root = tmp_path / ".agent-working-group"
    run_script(
        "awg-work-state.sh",
        "start",
        "--id",
        "work-1",
        "--title",
        "Important work",
        env={"AWG_ROOT": str(awg_root)},
    )
    active = awg_root / "runtime" / "work-state" / "active.json"
    active.write_text("{bad json", encoding="utf-8")

    result = subprocess.run(
        [str(ROOT / "scripts" / "awg-work-state.sh"), "update", "--id", "work-2", "--status", "running"],
        cwd=ROOT,
        env={**os.environ, "AWG_ROOT": str(awg_root)},
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    assert result.returncode != 0
    assert active.read_text(encoding="utf-8") == "{bad json"
    assert list((awg_root / "runtime" / "work-state").glob("active.corrupt-*"))


def test_branch_protection_dry_run_does_not_emit_null_for_preserved_fields() -> None:
    result = run_script(
        "github-protect-main.sh",
        "--repo",
        "owner/repo",
        "--dry-run",
    )
    payload = json.loads(result.stdout)
    assert payload["required_status_checks"] is not None
    assert payload["restrictions"] is not None


def test_branch_protection_replace_existing_can_emit_baseline_nulls() -> None:
    result = run_script(
        "github-protect-main.sh",
        "--repo",
        "owner/repo",
        "--dry-run",
        "--replace-existing",
    )
    payload = json.loads(result.stdout)
    assert payload["required_status_checks"] is None
    assert payload["restrictions"] is None


def test_dashboard_launchd_dry_run_contains_keepalive(tmp_path: Path) -> None:
    result = run_script(
        "install-dashboard-launchd.sh",
        "--dry-run",
        "--repo-root",
        str(ROOT),
        "--awg-root",
        str(tmp_path / ".agent-working-group"),
    )
    assert "<key>KeepAlive</key>" in result.stdout
    assert "awg-dashboard-start.sh" in result.stdout
    assert "DASHBOARD_ROOT" in result.stdout


def test_tmux_watcher_requires_new_explicit_completion_marker(tmp_path: Path) -> None:
    if subprocess.run(["sh", "-c", "command -v tmux"], stdout=subprocess.DEVNULL).returncode != 0:
        return
    session = f"awg-test-false-positive-{os.getpid()}"
    result_dir = tmp_path / "tmux-results"
    subprocess.run(
        ["tmux", "new-session", "-d", "-s", session, "printf 'PASS preliminary\\n'; sleep 3; printf 'AWG_TMUX_DONE:test-run\\n'; exec sh"],
        check=True,
    )
    try:
        result = subprocess.run(
            [
                str(ROOT / "scripts" / "tmux-completion-watcher.sh"),
                "--sessions",
                session,
                "--interval",
                "1",
                "--timeout",
                "1",
                "--result-dir",
                str(result_dir),
                "--keep-sessions",
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        assert result.returncode != 0
        assert subprocess.run(["tmux", "has-session", "-t", session], check=False).returncode == 0
    finally:
        subprocess.run(["tmux", "kill-session", "-t", session], check=False)


def test_tmux_watcher_ignores_stale_marker_without_current_watch_id(tmp_path: Path) -> None:
    if subprocess.run(["sh", "-c", "command -v tmux"], stdout=subprocess.DEVNULL).returncode != 0:
        return
    session = f"awg-test-stale-marker-{os.getpid()}"
    result_dir = tmp_path / "tmux-results"
    completed = result_dir / "completed"
    completed.mkdir(parents=True)
    (completed / f"{session}.old-watch.done").write_text("", encoding="utf-8")
    subprocess.run(
        ["tmux", "new-session", "-d", "-s", session, "sleep 3; printf 'AWG_TMUX_DONE:test-run\\n'; exec sh"],
        check=True,
    )
    try:
        result = subprocess.run(
            [
                str(ROOT / "scripts" / "tmux-completion-watcher.sh"),
                "--sessions",
                session,
                "--interval",
                "1",
                "--timeout",
                "1",
                "--result-dir",
                str(result_dir),
                "--keep-sessions",
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        assert result.returncode != 0
        assert subprocess.run(["tmux", "has-session", "-t", session], check=False).returncode == 0
    finally:
        subprocess.run(["tmux", "kill-session", "-t", session], check=False)


def test_branch_protection_rejects_invalid_required_approvals() -> None:
    result = subprocess.run(
        [
            str(ROOT / "scripts" / "github-protect-main.sh"),
            "--repo",
            "owner/repo",
            "--required-approvals",
            "7",
            "--dry-run",
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert result.returncode == 2
    assert "between 0 and 6" in result.stderr


def test_tmux_watcher_refuses_missing_session_by_default(tmp_path: Path) -> None:
    if subprocess.run(["sh", "-c", "command -v tmux"], stdout=subprocess.DEVNULL).returncode != 0:
        return
    session = f"awg-test-missing-{os.getpid()}"
    result = subprocess.run(
        [
            str(ROOT / "scripts" / "tmux-completion-watcher.sh"),
            "--sessions",
            session,
            "--interval",
            "1",
            "--timeout",
            "1",
            "--result-dir",
            str(tmp_path / "tmux-results"),
            "--keep-sessions",
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert result.returncode == 2
    assert "missing sessions at startup" in result.stderr


def test_tmux_watcher_completes_on_current_watch_id_marker(tmp_path: Path) -> None:
    if subprocess.run(["sh", "-c", "command -v tmux"], stdout=subprocess.DEVNULL).returncode != 0:
        return
    session = f"awg-test-current-marker-{os.getpid()}"
    result_dir = tmp_path / "tmux-results"
    watch_id = f"test-watch-{os.getpid()}"
    subprocess.run(
        [
            "tmux",
            "new-session",
            "-d",
            "-s",
            session,
            f"sleep 1; printf 'AWG_TMUX_DONE:{watch_id}\\n'; exec sh",
        ],
        check=True,
    )
    try:
        result = subprocess.run(
            [
                str(ROOT / "scripts" / "tmux-completion-watcher.sh"),
                "--sessions",
                session,
                "--interval",
                "1",
                "--timeout",
                "5",
                "--result-dir",
                str(result_dir),
                "--keep-sessions",
            ],
            cwd=ROOT,
            env={**os.environ, "WATCH_ID": watch_id},
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        assert result.returncode == 0
        status = json.loads((result_dir / "status.json").read_text(encoding="utf-8"))
        assert status["status"] == "complete"
        assert status["expectedCompletionMarker"] == f"AWG_TMUX_DONE:{watch_id}"
        assert (result_dir / f"{session}-output.txt").exists()
    finally:
        subprocess.run(["tmux", "kill-session", "-t", session], check=False)
