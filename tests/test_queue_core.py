from tests.helpers import *


class QueueCoreTests(QueueTestCase):
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

    def test_send_optional_correlation_refs_are_additive(self):
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

    def test_send_optional_source_metadata_refs_are_additive(self):
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

    def test_work_items_groups_messages_by_work_id_without_mutation(self):
            queue, _ = self.with_queue()
            first_id = queue.send("lead", "worker", "instruction", "start", work_id="work-1")
            second_id = queue.send(
                "worker",
                "reviewer",
                "status",
                "review",
                work_id="work-1",
                correlation_id="corr-1",
                parent_id=first_id,
                source_channel="channel:source",
                report_target="channel:review",
                repo="hakilee/agent-working-group",
                workspace="/work/repo",
            )
            queue.receive("worker", timeout=0, require_ack=True)
            queue.ack("worker", first_id)

            items = queue.work_items()

            item = next(item for item in items if item["workId"] == "work-1")
            self.assertEqual(item["status"], "ready")
            self.assertEqual(item["agents"], ["reviewer", "worker"])
            self.assertEqual(item["counts"], {"pending": 1, "running": 0, "done": 1, "dead": 0})
            self.assertEqual({message["id"] for message in item["messages"]}, {first_id, second_id})
            self.assertEqual(item["refs"]["correlationIds"], ["corr-1"])
            self.assertEqual(item["refs"]["parentIds"], [first_id])
            self.assertEqual(item["refs"]["sourceChannels"], ["channel:source"])
            self.assertEqual(item["refs"]["reportTargets"], ["channel:review"])
            self.assertEqual(item["refs"]["repos"], ["hakilee/agent-working-group"])
            self.assertEqual(item["refs"]["workspaces"], ["/work/repo"])
            message_refs = {message["id"]: message["refs"] for message in item["messages"]}
            self.assertEqual(message_refs[second_id]["correlationId"], "corr-1")
            self.assertNotIn("workId", message_refs[second_id])
            self.assertEqual(queue.status("reviewer")["pending"], 1)
            self.assertEqual(queue.status("worker")["processed"], 1)

    def test_work_items_supports_ungrouped_blocked_and_report_target_filters(self):
            queue, _ = self.with_queue()
            ungrouped_id = queue.send("lead", "worker", "note", "plain")
            blocked_id = queue.send(
                "lead",
                "worker",
                "blocker",
                "blocked",
                work_id="work-blocked",
                report_target="channel:ops",
            )
            queue.send(
                "lead",
                "worker",
                "instruction",
                "other",
                work_id="work-hidden",
                report_target="channel:elsewhere",
            )

            all_items = queue.work_items("worker")
            self.assertIn(ungrouped_id, {item["workId"] for item in all_items})

            filtered = queue.work_items("worker", report_target="discord:channel:ops")

            filtered_by_work = {item["workId"]: item for item in filtered}
            self.assertNotIn(ungrouped_id, filtered_by_work)
            self.assertIn("work-blocked", filtered_by_work)
            self.assertNotIn("work-hidden", filtered_by_work)
            self.assertEqual(filtered_by_work["work-blocked"]["status"], "blocked")
            self.assertEqual(filtered_by_work["work-blocked"]["messages"][0]["id"], blocked_id)

    def test_work_items_dead_status_takes_fail_closed_priority(self):
            queue, _ = self.with_queue()
            done_id = queue.send("lead", "worker", "instruction", "completed branch", work_id="work-dead")
            dead_id = queue.send("lead", "worker", "instruction", "failed branch", work_id="work-dead")
            queue.receive("worker", timeout=0, require_ack=True)
            queue.ack("worker", done_id)
            queue.receive("worker", timeout=0, require_ack=True)
            queue.nack("worker", dead_id)

            item = next(item for item in queue.work_items("worker") if item["workId"] == "work-dead")

            self.assertEqual(item["status"], "dead")
            self.assertEqual(item["counts"]["done"], 1)
            self.assertEqual(item["counts"]["dead"], 1)

    def test_work_items_does_not_create_missing_agent_queue_dirs(self):
            queue, root = self.with_queue()

            self.assertEqual(queue.work_items("missing-agent"), [])
            self.assertFalse((root / "queues" / "missing-agent").exists())

    def test_work_items_all_agents_ignores_non_queue_directories(self):
            queue, root = self.with_queue()
            queue.send("lead", "worker", "instruction", "real", work_id="real-work")
            dashboard_dir = root / "queues" / "dashboard"
            dashboard_dir.mkdir(parents=True)
            (dashboard_dir / "cache").mkdir()
            (dashboard_dir / "cache" / "not-a-message.json").write_text("{}", encoding="utf-8")

            items = queue.work_items()

            self.assertEqual([item["workId"] for item in items], ["real-work"])

    def test_cli_work_items_is_read_only_and_groups_by_work_id(self):
            queue, root = self.with_queue()
            message_id = queue.send("lead", "worker", "instruction", "do work", work_id="work-cli")

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "agent_working_group.cli",
                    "--root",
                    str(root),
                    "work-items",
                    "--as",
                    "worker",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            items = json.loads(result.stdout)
            self.assertEqual(items[0]["workId"], "work-cli")
            self.assertEqual(items[0]["status"], "ready")
            self.assertEqual(items[0]["messages"][0]["id"], message_id)
            self.assertEqual(MessageQueue(root).status("worker")["pending"], 1)

    def test_recv_is_not_safe_for_scheduling(self):
            queue, _ = self.with_queue()
            queue.send("lead", "worker", "instruction", "do work")

            message = queue.receive("worker", timeout=0)

            self.assertIsNotNone(message)
            self.assertEqual(queue.status("worker")["pending"], 0)
            self.assertEqual(queue.status("worker")["processed"], 1)

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

            self.assert_public_safe_content(content)
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
            self.assert_public_safe_content(combined)
            local_path_pattern = "/" + "Users/" + r"[^\s`]+"
            self.assertNotRegex(combined, local_path_pattern)
            korean_pattern = "[" + "\\uac00" + "-" + "\\ud7af" + "]"
            self.assertNotRegex(combined, korean_pattern)

    def test_queue_reconciliation_action_policy_docs_are_safe(self):
            project_root = Path(__file__).resolve().parents[1]
            policy_path = project_root / "docs" / "queue-reconciliation.md"
            template_path = project_root / "docs" / "templates" / "queue-reconciliation-action-audit.md"
            spec_matrix = project_root / "docs" / "spec-matrix.md"
            readme = project_root / "README.md"
            workflow = project_root / "docs" / "queue-first-workflow.md"
            content = "\n".join(
                path.read_text(encoding="utf-8") for path in [policy_path, template_path, spec_matrix, readme, workflow]
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
            self.assertIn("Queue Reconciliation Action Audit", content)
            self.assertIn("docs/templates/queue-reconciliation-action-audit.md", content)
            self.assertIn("templates/queue-reconciliation-action-audit.md", content)
            self.assertIn("remaining risk", content.lower())

            self.assertNotRegex(policy, r"\b(nack|requeue-stale|prune)\b.*\ballowed\b")
            self.assertNotRegex(policy.lower(), r"bulk (ack|acknowledge|consume).*(allowed|safe|permitted)")
            self.assertIn("Age alone is not enough", policy)
            self.assertIn("treat old age as completion evidence", policy)
            self.assertNotRegex(template, r"\b(eval|bash\s+-c|sh\s+-c)\b")
            self.assertNotRegex(template, r"[|;&><].*AWG")

            self.assert_public_safe_content(content)
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
            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)
            self.assertNotRegex(content.lower(), r"api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]")

    def test_reconcile_ack_pending_wrapper_requires_evidence_and_audits(self):
            project_root = Path(__file__).resolve().parents[1]
            script = project_root / "scripts" / "awg-reconcile-ack-pending.sh"
            queue, root = self.with_queue()
            message_id = queue.send("lead", "worker", "instruction", "completed elsewhere")

            wrapper_dir = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, wrapper_dir, ignore_errors=True)
            wrapper = wrapper_dir / "awg"
            wrapper.write_text(
                "#!/usr/bin/env bash\n"
                f"PYTHONPATH={project_root / 'src'} python3 -m agent_working_group.cli \"$@\"\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o755)
            audit_dir = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, audit_dir, ignore_errors=True)
            env = os.environ.copy()
            env.update({"AWG_CLI": "awg", "AWG_ROOT": str(root), "PATH": f"{wrapper_dir}{os.pathsep}{env.get('PATH', '')}"})

            missing_evidence = subprocess.run(
                [str(script), "--role", "worker", "--id", message_id, "--decision", "done"],
                cwd=project_root,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(missing_evidence.returncode, 0)
            self.assertIn("--evidence", missing_evidence.stderr)
            self.assertEqual(queue.status("worker")["pending"], 1)

            dry_run = subprocess.run(
                [
                    str(script),
                    "--role", "worker",
                    "--id", message_id,
                    "--evidence", "PR #1",
                    "--decision", "completed by reviewed artifact",
                    "--audit-dir", str(audit_dir),
                    "--dry-run",
                ],
                cwd=project_root,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            self.assertIn("dry-run", dry_run.stdout)
            self.assertEqual(queue.status("worker")["pending"], 1)

            result = subprocess.run(
                [
                    str(script),
                    "--role", "worker",
                    "--id", message_id,
                    "--evidence", "PR #1",
                    "--decision", "completed by reviewed artifact",
                    "--operator", "test-operator",
                    "--audit-dir", str(audit_dir),
                ],
                cwd=project_root,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )

            self.assertIn("acked role=worker", result.stdout)
            self.assertEqual(queue.status("worker")["pending"], 0)
            self.assertEqual(queue.status("worker")["processed"], 1)
            audits = list(audit_dir.glob("*.md"))
            self.assertEqual(len(audits), 1)
            audit = audits[0].read_text(encoding="utf-8")
            self.assertIn("Queue Reconciliation Action Audit", audit)
            self.assertIn("completed by reviewed artifact", audit)
            self.assertIn("ack-pending succeeded", audit)
            self.assertIn("kind: instruction", audit)
            self.assertIn("from: lead", audit)
            self.assertIn("to: worker", audit)

            script_content = script.read_text(encoding="utf-8")
            self.assertIn("--expect-kind", script_content)
            self.assertIn("--expect-from", script_content)
            self.assertIn("--expect-to", script_content)
            self.assertIn("--expect-created-at", script_content)
            self.assertNotIn("run_awg recv", script_content)
            self.assertNotRegex(script_content, r"\beval\b|bash\s+-c|sh\s+-c")
            self.assertNotRegex(script_content, r"\bcurl\b|wget|http://|https://")

    def test_receive_with_report_target_skips_unmatched_messages(self):
            queue, _ = self.with_queue()
            first = queue.send(
                "lead",
                "worker",
                "instruction",
                "wrong channel",
                report_target="channel:marketing",
            )
            second = queue.send(
                "lead",
                "worker",
                "instruction",
                "right channel",
                report_target="dis" + "cord:channel:working",
            )

            message = queue.receive("worker", timeout=0, require_ack=True, report_target="dis" + "cord:working")

            self.assertIsNotNone(message)
            self.assertEqual(message["id"], second)
            self.assertEqual(queue.status("worker")["pending"], 1)
            self.assertEqual(queue.status("worker", report_target="channel:working")["pending"], 0)
            self.assertEqual(queue.status("worker", report_target="channel:marketing")["pending"], 1)
            self.assertEqual(queue.peek("worker")[0]["id"], first)
            self.assertEqual(queue.processing("worker", limit=1)[0]["id"], second)

    def test_receive_with_report_target_times_out_without_moving_unmatched_messages(self):
            queue, _ = self.with_queue()
            message_id = queue.send(
                "lead",
                "worker",
                "instruction",
                "other channel",
                report_target="channel:marketing",
            )

            message = queue.receive("worker", timeout=0, require_ack=True, report_target="channel:working")

            self.assertIsNone(message)
            self.assertEqual(queue.status("worker")["pending"], 1)
            self.assertEqual(queue.status("worker")["processing"], 0)
            self.assertEqual(queue.peek("worker")[0]["id"], message_id)

    def test_cli_recv_report_target_skips_unmatched_messages(self):
            queue, root = self.with_queue()
            queue.send("lead", "worker", "instruction", "wrong", report_target="channel:marketing")
            expected = queue.send("lead", "worker", "instruction", "right", report_target="channel:working")

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "agent_working_group.cli",
                    "--root",
                    str(root),
                    "recv",
                    "--as",
                    "worker",
                    "--timeout",
                    "0",
                    "--require-ack",
                    "--report-target",
                    "dis" + "cord:channel:working",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["id"], expected)
            self.assertEqual(MessageQueue(root).status("worker")["pending"], 1)
            self.assertEqual(MessageQueue(root).status("worker")["processing"], 1)

    def test_default_role_registry_creates_canonical_roles_without_person_aliases(self):
        queue, root = self.with_queue()

        registry = queue.initialize_default_roles()

        self.assertTrue((root / "roles.json").is_file())
        self.assertEqual(sorted(registry["roles"]), ["lead", "observer", "reviewer", "worker"])
        self.assertEqual(registry["aliases"], {})
        for role in ("lead", "worker", "reviewer", "observer"):
            self.assertTrue((root / "queues" / role / "inbox").is_dir())

    def test_send_resolves_aliases_to_canonical_role_queues(self):
        queue, root = self.with_queue()
        queue.initialize_default_roles()
        registry_path = root / "roles.json"
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        registry["aliases"] = {"alice": "reviewer"}
        registry_path.write_text(json.dumps(registry), encoding="utf-8")

        message_id = queue.send("lead", "alice", "instruction", "review this")

        reviewer_messages = queue.peek("reviewer")
        self.assertEqual(len(reviewer_messages), 1)
        message = reviewer_messages[0]
        self.assertEqual(message["id"], message_id)
        self.assertEqual(message["from"], "lead")
        self.assertEqual(message["to"], "reviewer")
        self.assertEqual(
            message["refs"]["recipientRoleResolution"],
            {"alias": "alice", "targetRole": "reviewer", "mode": "resolved"},
        )
        self.assertEqual(queue.peek("alice"), [])

    def test_registry_fails_closed_for_unknown_roles(self):
        queue, _ = self.with_queue()
        queue.initialize_default_roles()

        with self.assertRaisesRegex(ValueError, "unknown recipient"):
            queue.send("lead", "alice", "instruction", "review this")
        with self.assertRaisesRegex(ValueError, "unknown sender"):
            queue.send("alice", "reviewer", "instruction", "review this")

    def test_missing_registry_uses_default_roles_and_rejects_unregistered_queues(self):
        queue, root = self.with_queue()

        message_id = queue.send("lead", "worker", "instruction", "role routing")

        self.assertEqual(MessageQueue(root).peek("worker")[0]["id"], message_id)
        self.assertFalse((root / "roles.json").exists())
        with self.assertRaisesRegex(ValueError, "unknown recipient"):
            queue.send("lead", "alice", "instruction", "unregistered routing")

    def test_cli_roles_init_and_alias_send(self):
        queue, root = self.with_queue()
        init = subprocess.run(
            [
                sys.executable,
                "-m",
                "agent_working_group.cli",
                "--root",
                str(root),
                "init",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(init.returncode, 0, init.stderr)
        registry_path = root / "roles.json"
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        registry["aliases"] = {"alice": "reviewer"}
        registry_path.write_text(json.dumps(registry), encoding="utf-8")

        roles = subprocess.run(
            [sys.executable, "-m", "agent_working_group.cli", "--root", str(root), "roles"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(roles.returncode, 0, roles.stderr)
        self.assertEqual(json.loads(roles.stdout)["aliases"], {"alice": "reviewer"})

        sent = subprocess.run(
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
                "alice",
                "--kind",
                "instruction",
                "--body",
                "review this",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(sent.returncode, 0, sent.stderr)
        self.assertEqual(sent.stderr, "")
        message = MessageQueue(root).peek("reviewer")[0]
        self.assertEqual(
            message["refs"]["recipientRoleResolution"],
            {"alias": "alice", "targetRole": "reviewer", "mode": "resolved"},
        )
        self.assertEqual(MessageQueue(root).status("alice")["pending"], 0)
