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


class QueueTestCase(unittest.TestCase):
    def with_queue(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        queue = MessageQueue(root)
        queue.initialize(["lead", "worker"])
        return queue, root

    def run_archive_helper(self, *args):
            project_root = Path(__file__).resolve().parents[1]
            return subprocess.run(
                [str(project_root / "scripts" / "awg-archive-artifact.sh"), *map(str, args)],
                cwd=project_root,
                text=True,
                capture_output=True,
                check=False,
            )

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
