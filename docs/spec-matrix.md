# Spec Matrix

This matrix maps Agent Working Group safety and behavior guarantees to the tests that protect them. Keep it current whenever a queue, worker, executor, or public documentation invariant changes.

## Queue Lifecycle

| Guarantee | Test coverage |
| --- | --- |
| Durable receive keeps work in `processing/` until an explicit `ack`, `retry`, or stale requeue action moves it. | `tests/test_queue.py::MessageQueueTests.test_send_receive_ack_retry_and_dead`, `tests/test_queue.py::MessageQueueTests.test_ack_moves_processing_to_processed` |
| Default `recv` remains backward-compatible and records simple received messages as processed. | `tests/test_queue.py::MessageQueueTests.test_recv_is_not_safe_for_scheduling` |
| `ack` moves a processing message to `processed/` and records `refs.ackedAt`. | `tests/test_queue.py::MessageQueueTests.test_ack_moves_processing_to_processed` |
| `retry` and stale requeue preserve message identity, increment `refs.retryCount`, and dead-letter after the configured retry limit. | `tests/test_queue.py::MessageQueueTests.test_send_receive_ack_retry_and_dead` |
| `replyTo` references let questions and answers remain traceable without changing delivery order. | `tests/test_queue.py::MessageQueueTests.test_peek_reply_to_log_and_nack` |
| Pruning archives processed queue files and log lines instead of deleting active coordination state directly. | `tests/test_queue.py::MessageQueueTests.test_prune_archives_processed_and_log_lines`, `tests/test_queue.py::MessageQueueTests.test_prune_can_include_processing` |
| Artifact cleanup preserves queue JSON in `inbox/`, `processing/`, `processed/`, and `dead/`. | `tests/test_queue.py::MessageQueueTests.test_cleanup_artifacts_preserves_queue_json_in_dry_run` |
| Inbox reconciliation is evidence-first, observation-only until an explicit future mutation policy exists, and must not use unsafe `recv`, direct queue JSON mutation, deletion, or bulk consume behavior. | `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_policy_docs_are_safe`, `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_report_helper_is_read_only`, `tests/test_queue.py::MessageQueueTests.test_helper_environment_contract_is_documented_and_safe` |
| The queue reconciliation report helper is read-only, scoped to one role, reports queue state only, and does not classify messages as superseded. | `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_report_helper_is_read_only`, `tests/test_queue.py::MessageQueueTests.test_helper_environment_contract_is_documented_and_safe` |

## Worker And Scheduling Safety

| Guarantee | Test coverage |
| --- | --- |
| Scheduled observers must not consume the worker inbox with `recv`. | `tests/test_queue.py::MessageQueueTests.test_safe_poll_script_does_not_consume_worker_inbox`, `tests/test_queue.py::MessageQueueTests.test_recv_is_not_safe_for_scheduling` |
| The bounded worker loop is a queue runner, not an AI executor, and warns when it acknowledges an `instruction` without doing the work. | `tests/test_queue.py::MessageQueueTests.test_worker_loop_auto_acks_instruction_without_execution`, `tests/test_queue.py::MessageQueueTests.test_worker_scripts_are_generic_and_portable` |
| `MAX_IDLE_SECONDS` is idle time since the last received message, not process max runtime. | `tests/test_queue.py::MessageQueueTests.test_worker_idle_timeout_resets_after_message` |
| Worker helper scripts and public worker docs stay generic and portable. | `tests/test_queue.py::MessageQueueTests.test_worker_scripts_are_generic_and_portable` |
| Helper environment variables use a safe contract: `AWG_CLI` is a quoted executable name or path, wrappers carry interpreter setup, and `AWG_ROOT` is a queue root path. | `tests/test_queue.py::MessageQueueTests.test_helper_environment_contract_is_documented_and_safe` |

## Executor Bridge Safety

| Guarantee | Test coverage |
| --- | --- |
| The executor bridge is opt-in and is not part of `MessageQueue` core behavior. | `tests/test_queue.py::MessageQueueTests.test_executor_bridge_docs_and_scripts_are_safe` |
| The bridge acknowledges an `instruction` only after a structured `success` result. | `tests/test_queue.py::MessageQueueTests.test_executor_bridge_success_acks_after_status` |
| Retry results return the original message to the inbox without `ack`. | `tests/test_queue.py::MessageQueueTests.test_executor_bridge_retry_requeues_without_ack` |
| Question, blocker, failed, malformed, unknown, and nonzero executor outcomes remain unacknowledged for operator decision. | `tests/test_queue.py::MessageQueueTests.test_executor_bridge_question_blocker_failed_and_malformed_do_not_ack` |
| Non-instruction messages are returned to the inbox without `ack` and are not executed. | `tests/test_queue.py::MessageQueueTests.test_executor_bridge_non_instruction_returns_to_inbox_without_ack` |
| Message bodies are never executed as shell commands. | `tests/test_queue.py::MessageQueueTests.test_executor_bridge_does_not_execute_message_body_as_shell`, `tests/test_queue.py::MessageQueueTests.test_executor_bridge_docs_and_scripts_are_safe` |
| Queue JSON moves only through queue-aware commands, not direct JSON mutation by bridge scripts. | `tests/test_queue.py::MessageQueueTests.test_executor_bridge_docs_and_scripts_are_safe` |
| The real executor adapter template is opt-in, provider-neutral, deterministic in tests, fails closed without config, and preserves the same no-shell-execution/no-ack-before-success contract. | `tests/test_queue.py::MessageQueueTests.test_real_executor_template_success_acks_after_status`, `tests/test_queue.py::MessageQueueTests.test_real_executor_template_retry_requeues_without_ack`, `tests/test_queue.py::MessageQueueTests.test_real_executor_template_non_success_outcomes_do_not_ack`, `tests/test_queue.py::MessageQueueTests.test_real_executor_template_missing_config_fails_closed`, `tests/test_queue.py::MessageQueueTests.test_real_executor_template_does_not_execute_message_body_as_shell`, `tests/test_queue.py::MessageQueueTests.test_executor_bridge_docs_and_scripts_are_safe` |

## Review, Artifact, And Repository Policy

| Guarantee | Test coverage |
| --- | --- |
| Pull request review requests are queue-first and never auto-merge or auto-approve. | `tests/test_queue.py::MessageQueueTests.test_pr_review_gate_docs_and_helper_are_safe` |
| Operational Markdown artifacts use active/completed/archive retention, and helpers do not delete queue JSON. | `tests/test_queue.py::MessageQueueTests.test_artifact_retention_docs_and_helper_are_safe` |
| Repository-specific commit, pull request title, and squash title rules take precedence over fallback conventions. | `tests/test_queue.py::MessageQueueTests.test_repository_rules_docs_and_templates_are_safe` |
| The repository rule detection helper is advisory-only, read-only, local-only, reports repository-relative sources, and falls back explicitly when no rule is found. | `tests/test_queue.py::MessageQueueTests.test_repository_rule_detection_helper_finds_sources_and_fallback`, `tests/test_queue.py::MessageQueueTests.test_repository_rule_detection_helper_is_safe_and_documented` |
| Important analysis/design work records independent lead analysis, worker or reviewer analysis, comparison, disagreement handling, and closure decision without forcing ceremony on trivial work. | `tests/test_queue.py::MessageQueueTests.test_independent_lead_analysis_docs_and_templates_are_safe` |
| The independent-analysis scaffold helper is advisory, stdout-only, backward-compatible with existing template fields, and does not force ceremony on trivial work. | `tests/test_queue.py::MessageQueueTests.test_independent_analysis_template_helper_outputs_required_fields`, `tests/test_queue.py::MessageQueueTests.test_independent_analysis_template_helper_is_safe_and_documented` |
| Filesystem helper code uses canonical containment checks that fail closed for traversal, symlink escape, sibling-prefix traps, and ambiguous inputs. | `tests/test_queue.py::MessageQueueTests.test_path_safety_helper_rejects_escapes`, `tests/test_queue.py::MessageQueueTests.test_path_safety_docs_are_safe` |
| Artifact/workspace automation uses explicit allowed-base design, fails closed when the base is missing or invalid, excludes queue directories, and does not infer containment from the current working directory. | `tests/test_queue.py::MessageQueueTests.test_path_safety_docs_are_safe`, `tests/test_queue.py::MessageQueueTests.test_artifact_retention_docs_and_helper_are_safe` |
| The archive artifact helper preserves existing usage without `--allowed-base`, and opt-in allowed-base mode rejects traversal, symlink escape, sibling-prefix traps, invalid bases, and queue paths before any move. | `tests/test_queue.py::MessageQueueTests.test_archive_helper_allowed_base_accepts_contained_paths`, `tests/test_queue.py::MessageQueueTests.test_archive_helper_allowed_base_rejects_escapes_and_queue_paths`, `tests/test_queue.py::MessageQueueTests.test_archive_helper_without_allowed_base_preserves_existing_usage` |

## Correlation Metadata Convention

| Guarantee | Test coverage |
| --- | --- |
| `refs.correlationId` and `refs.parentId` are optional conventions for grouping related messages, not required schema fields. | `tests/test_queue.py::MessageQueueTests.test_spec_matrix_and_correlation_docs_are_safe`, `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_policy_docs_are_safe`, `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_report_helper_is_read_only`, `tests/test_queue.py::MessageQueueTests.test_helper_environment_contract_is_documented_and_safe` |
| Correlation metadata is backward-compatible and does not change queue delivery, priority, acknowledgement, retry, or pruning behavior. | `tests/test_queue.py::MessageQueueTests.test_spec_matrix_and_correlation_docs_are_safe`, `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_policy_docs_are_safe`, `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_report_helper_is_read_only`, `tests/test_queue.py::MessageQueueTests.test_helper_environment_contract_is_documented_and_safe` |

## Public Safety

| Guarantee | Test coverage |
| --- | --- |
| Public docs and helper scripts avoid private names, private local paths, platform-specific chat references, credentials, and non-English private workspace content. | `tests/test_queue.py::MessageQueueTests.test_worker_scripts_are_generic_and_portable`, `tests/test_queue.py::MessageQueueTests.test_pr_review_gate_docs_and_helper_are_safe`, `tests/test_queue.py::MessageQueueTests.test_artifact_retention_docs_and_helper_are_safe`, `tests/test_queue.py::MessageQueueTests.test_executor_bridge_docs_and_scripts_are_safe`, `tests/test_queue.py::MessageQueueTests.test_repository_rules_docs_and_templates_are_safe`, `tests/test_queue.py::MessageQueueTests.test_spec_matrix_and_correlation_docs_are_safe`, `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_policy_docs_are_safe`, `tests/test_queue.py::MessageQueueTests.test_queue_reconciliation_report_helper_is_read_only`, `tests/test_queue.py::MessageQueueTests.test_helper_environment_contract_is_documented_and_safe` |

## Maintenance Rule

When a new invariant is added, update this matrix in the same change as the implementation or documentation. If the invariant is behavioral, add or update an executable test. If the invariant is documentation-only, add or update a static documentation test.
