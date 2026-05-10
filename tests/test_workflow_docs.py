from tests.helpers import *


class QueueWorkflowDocsTests(QueueTestCase):
    def test_operator_baseline_doctor_reports_git_queue_and_artifacts(self):
            project_root = Path(__file__).resolve().parents[1]
            doctor = project_root / "scripts" / "awg-operator-baseline-doctor.sh"
            with tempfile.TemporaryDirectory() as temp:
                temp_root = Path(temp)
                repo = temp_root / "repo"
                repo.mkdir()
                subprocess.run(["git", "init"], cwd=repo, text=True, capture_output=True, check=True)
                subprocess.run(["git", "config", "user.email", "operator@example.invalid"], cwd=repo, check=True)
                subprocess.run(["git", "config", "user.name", "Operator"], cwd=repo, check=True)
                (repo / "README.md").write_text("# Example\n", encoding="utf-8")
                subprocess.run(["git", "add", "README.md"], cwd=repo, check=True)
                subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, text=True, capture_output=True, check=True)

                queue_root = temp_root / "queues"
                queue = MessageQueue(queue_root)
                message_id = queue.send("lead", "reviewer", "instruction", "Review baseline.", work_id="baseline-1")
                artifact_root = temp_root / "ops"
                (artifact_root / "active").mkdir(parents=True)
                (artifact_root / "active" / "202605091200-example.md").write_text("# Example\n", encoding="utf-8")

                cli_wrapper = temp_root / "awg-cli"
                cli_wrapper.write_text(
                    f"#! /usr/bin/env bash\nPYTHONPATH={project_root / 'src'} {sys.executable} -m agent_working_group.cli \"$@\"\n",
                    encoding="utf-8",
                )
                cli_wrapper.chmod(0o755)
                env = {**os.environ, "AWG_CLI": str(cli_wrapper)}

                run = subprocess.run(
                    [
                        str(doctor),
                        "--repo",
                        str(repo),
                        "--queue-root",
                        str(queue_root),
                        "--role",
                        "reviewer",
                        "--artifact-root",
                        str(artifact_root),
                        "--github-repo",
                        "owner/project",
                        "--format",
                        "json",
                    ],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                )
                self.assertEqual(run.returncode, 0, run.stderr)
                payload = json.loads(run.stdout)
                self.assertEqual(payload["git"]["dirtyCount"], 0)
                self.assertTrue(payload["git"]["clean"])
                self.assertEqual(payload["queues"][0]["role"], "reviewer")
                self.assertEqual(payload["queues"][0]["pending"], 1)
                self.assertTrue(payload["queues"][0]["next"].endswith(".json"))
                self.assertEqual(payload["artifacts"]["activeCount"], 1)
                self.assertIn(payload["github"].get("available"), [True, False])
                self.assertEqual(len(queue.peek("reviewer")), 1)
                self.assertEqual(queue.peek("reviewer")[0]["id"], message_id)
                self.assertEqual(queue.processed("reviewer"), [])

                text_run = subprocess.run(
                    [str(doctor), "--repo", str(repo), "--queue-root", str(queue_root), "--role", "reviewer", "--artifact-root", str(artifact_root)],
                    text=True,
                    capture_output=True,
                    env=env,
                    check=False,
                )
                self.assertEqual(text_run.returncode, 0, text_run.stderr)
                self.assertIn("AWG operator baseline doctor", text_run.stdout)
                self.assertIn("queue: role=reviewer pending=1", text_run.stdout)
                self.assertIn("artifacts:", text_run.stdout)

    def test_operator_baseline_doctor_docs_and_script_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "docs" / "operator-baseline-doctor.md",
                project_root / "docs" / "spec-matrix.md",
                project_root / "README.md",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
            script = (project_root / "scripts" / "awg-operator-baseline-doctor.sh").read_text(encoding="utf-8")

            self.assertIn("read-only helper", content)
            self.assertIn("operator baseline doctor", content.lower())
            self.assertIn("optional read-only GitHub", content)
            self.assertIn("Missing optional configuration", content)
            self.assertIn("not queue authority", content)
            self.assertIn("Operator Baseline Doctor", content)
            self.assertIn("--github-repo", script)
            self.assertIn("gh-not-found", script)
            self.assertNotRegex(script, r"\b(recv|ack|ack-pending|retry|nack|prune|requeue-stale)\b")
            self.assertNotRegex(script, r"git\s+(add|commit|push|merge|branch|switch|checkout|tag)")
            self.assertNotRegex(script, r"gh\s+pr\s+(create|merge|comment|review|close)")
            self.assertNotRegex(script, r"gh\s+issue\s+(create|close|comment)")
            self.assertNotRegex(script, r"curl|wget|http://|https://")
            self.assertNotRegex(script, r"crontab|systemctl|launchctl|tmux")
            self.assertNotRegex(script, r"rm\s+|unlink|shutil\.rmtree|os\.remove|Path\.unlink|Path\.rename")
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

