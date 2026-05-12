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
