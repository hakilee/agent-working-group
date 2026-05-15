from tests.helpers import *


class QueueArtifactSafetyTests(QueueTestCase):
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

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)

    def test_archive_helper_path_safety_integration_requires_allowed_base(self):
            project_root = Path(__file__).resolve().parents[1]
            checked_paths = [
                project_root / "docs" / "artifact-retention.md",
                project_root / "docs" / "path-safety.md",
                project_root / "docs" / "spec-matrix.md",
            ]
            content = "\n".join(path.read_text(encoding="utf-8") for path in checked_paths)
            script = project_root / "scripts" / "awg-archive-artifact.sh"
            script_content = script.read_text(encoding="utf-8")

            self.assertIn("requires explicit allowed-base checks", content)
            self.assertNotIn("Without `--allowed-base`", content)
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

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)

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

    def test_archive_helper_without_allowed_base_fails_closed(self):
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                active = root / "active"
                completed = root / "completed"
                active.mkdir()
                source = active / "artifact.md"
                source.write_text("ok", encoding="utf-8")

                dry_run = self.run_archive_helper("--source", source, "--completed-dir", completed)
                self.assertEqual(dry_run.returncode, 64)
                self.assertTrue(source.exists())
                self.assertFalse(completed.exists())

                apply = self.run_archive_helper("--source", source, "--completed-dir", completed, "--apply")
                self.assertEqual(apply.returncode, 64)
                self.assertTrue(source.exists())
                self.assertFalse((completed / "artifact.md").exists())

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
            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")

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

            self.assert_public_safe_content(content)
            local_path_pattern = "/" + "Users/|" + "/" + "home/|~" + r"/|\$" + "HOME"
            self.assertNotRegex(content, local_path_pattern)
            self.assertNotRegex(content, r"[\uac00-\ud7af]")
            platform_pattern = "dis" + "cord|sl" + "ack|tele" + "gram"
            self.assertNotRegex(content.lower(), platform_pattern)
