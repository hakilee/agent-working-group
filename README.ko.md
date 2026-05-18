# Agent Working Group

[English](README.md) | [한국어](README.ko.md)

Agent Working Group(AWG)은 작은 에이전트 팀과 로컬 운영자를 위한 파일 기반 협업 계층입니다. 리드 에이전트와 하나 이상의 워커 에이전트가 공유 mailbox protocol을 사용해 지시를 보내고, 우선순위 메시지를 받고, 작업을 ack하고, stale 메시지를 retry하며, 서버 없이 큐 상태를 점검할 수 있게 합니다.

이 패키지는 현장에서 바로 쓰기 좋은 협업 흐름을 기준으로 설계되었습니다. 리드는 작업을 나누고, 워커는 제한된 범위의 작업을 검증하거나 구현하며, 메시지는 책임 추적성을 남기고, 큐 상태는 협업 과정을 눈으로 확인할 수 있게 합니다.

## 핵심 아이디어

- **파일 기반 큐:** 각 에이전트는 `inbox/`, `processing/`, `processed/`, `dead/` 디렉터리를 가집니다.
- **원자적 전달:** 메시지는 `tmp/`에 쓰인 뒤 수신자 inbox로 이동됩니다.
- **우선순위 메시지:** `blocker`가 가장 높고, 그 다음은 `question`, `answer`, `instruction`, `status`, `note`입니다.
- **명시적 책임:** `recv`는 메시지를 `processing/`으로 옮기고, `ack`가 완료 처리합니다.
- **Retry와 dead letters:** ack되지 않은 stale 메시지는 재큐잉하거나 retry 한도를 넘으면 `dead/`로 이동할 수 있습니다.
- **검사 가능한 운영:** `peek`, `status`, `processing`, `processed`, `dead`, `log`로 상태를 확인합니다.
- **데몬 불필요:** CLI는 수동으로, 에이전트가, 또는 cron/watchdog job에서 실행할 수 있습니다.
- **안전한 스케줄링:** observer는 작업을 소비하지 않고 큐를 inspect/recover할 수 있습니다.
- **큐 reconciliation 정책:** 오래된 inbox item은 향후 reconciliation 전에 증거가 필요합니다.
- **명시적 queue hook:** 로컬 argv-list adapter를 sent/pending 메시지 주변에서 dispatch할 수 있지만, hook이 큐 권한자가 되지는 않습니다.
- **신뢰 가능한 implementation runtime:** 선택적 helper가 active work state를 저장하고, tmux session을 보수적으로 감시하고, main branch를 보호하고, dashboard를 supervision합니다.

## 설치

저장소 루트에서:

```bash
python3 -m pip install -e .
```

설치 없이 실행하려면:

```bash
PYTHONPATH=src python3 -m agent_working_group.cli --help
```

## 빠른 시작

```bash
export AWG_ROOT=/tmp/awg-demo
awg init

awg send --from=lead --to=worker --kind=instruction --body="Inspect the repository and report risks."
awg recv --as=worker
awg ack --as=worker --id=<message-id>

awg send --from=worker --to=lead --kind=status --body="done: risk report written"
awg recv --as=lead --timeout=30
```

## Python API

```python
from agent_working_group import MessageQueue

queue = MessageQueue("/tmp/awg-demo")
queue.initialize(["lead", "worker"])

message_id = queue.send(
    "lead",
    "worker",
    "instruction",
    "Write a short report.",
    report_target="work-updates",
)
message = queue.receive("worker", timeout=30, report_target="work-updates")
if message is None:
    raise TimeoutError("worker inbox was empty")

queue.ack("worker", message_id)
status = queue.status("worker", tz="Asia/Seoul")
```

주요 메서드:

- `initialize(agents)`: 큐 디렉터리와 로그 파일을 만듭니다.
- `initialize_default_roles()`, `roles()`: CLI가 사용하는 고정 role registry를 만들거나 확인합니다.
- `send(sender, recipient, kind, body, reply_to=None, *, correlation_id=None, work_id=None, parent_id=None, source_channel=None, report_target=None, repo=None, workspace=None, expected_response_within=None) -> str`: 메시지를 보내고 id를 반환합니다. 선택 관계/source metadata는 `refs` 아래에 저장되고, `expected_response_within`은 response monitoring용 top-level `expectedResponseWithin`으로 저장됩니다.
- `receive(agent, timeout=None, report_target=None) -> dict | None`: matching inbox 메시지 하나를 `processing/`으로 claim하거나 timeout 시 `None`을 반환합니다.
- `ack(agent, message_id)`: `processing/` 메시지를 `processed/`로 이동합니다.
- `ack_pending(agent, message_id, expect_kind=None, expect_from=None, expect_to=None, expect_created_at=None)`: 검토된 inbox 메시지 하나를 id로 명시적으로 acknowledge합니다.
- `retry(agent, message_id)`: `processing/` 또는 `processed/` 메시지를 다시 큐에 넣습니다.
- `requeue_stale(agent, older_than_sec=300, max_retries=None)`: stale unacked 메시지를 재큐잉하거나 `dead/`로 이동합니다. `max_retries=N`은 N회 재큐잉까지 허용하고, 그 다음 stale retry는 dead-letter 처리됩니다.
- `status(agent, tz="UTC")`, `peek(agent)`, `pending(agent)`, `processing(agent)`, `processed(agent)`, `dead(agent)`, `work_items(agent=None, report_target=None, tz="UTC")`, `log_lines(tz="UTC")`: 큐 상태를 mutation 없이 확인합니다.
- `prune(agent=None, processed_keep=1000, include_processing=False, processing_keep=100, log_keep_lines=None, dry_run=False)`: 오래된 큐/로그 데이터를 archive합니다.
- `cleanup_artifacts(dry_run=True, temp_file_min_age_sec=3600, stale_lock_min_age_sec=600)`: queue JSON을 건드리지 않고 생성된 worker clutter를 정리합니다.

전체 Python surface는 [Python API Reference](docs/api.md)를 참고하세요.

## CLI 개요

```bash
awg init
awg roles
awg send --from=lead --to=worker --kind=instruction --body="Do one clear task."
awg send --from=lead --to=reviewer --kind=instruction --body-file=review-request.md
printf "Review notes\n" | awg send --from=lead --to=reviewer --kind=instruction --body-file=-
awg send --from=lead --to=worker --kind=instruction --body="Notify then inspect." --dispatch-hooks
awg recv --as=worker --timeout=120
awg ack --as=worker --id=<message-id>
awg ack-pending --as=worker --id=<message-id> --expect-kind=instruction
awg retry --as=worker --id=<message-id>
awg nack --as=worker --id=<message-id>
awg requeue-stale --as=worker --older-than-sec=300 --max-retries=3  # 3회 재큐잉 허용, 4번째 stale recovery는 dead/로 이동
awg peek --as=worker
awg pending --as=worker --json
awg processing --as=worker --limit=5
awg processed --as=worker --limit=5 --tz=Asia/Seoul
awg dead --as=worker --limit=5
awg status --as=worker --tz=Asia/Seoul
awg work-items --as=worker --report-target=work-updates
awg dispatch-hooks --event message.pending --as=worker --dry-run
awg prune --as=worker --processed-keep=100 --include-processing --processing-keep=20 --log-keep-lines=1000 --dry-run
awg cleanup-artifacts --dry-run
scripts/awg-queue-reconciliation-report.sh --role worker
awg worker-heartbeat-write --agent worker --session tmux-worker-1
awg heartbeat-monitor --timeout-seconds=300
awg processing-timeout-monitor --timeout-seconds=600
awg response-contract-monitor
awg log --tz=Asia/Seoul
```

## 메시지 스키마

각 메시지는 JSON object입니다.

```json
{
  "id": "uuid-v4",
  "kind": "instruction",
  "from": "lead",
  "to": "worker",
  "body": "Do one clear task.",
  "refs": {
    "replyTo": "optional-message-id",
    "correlationId": "optional-task-or-thread-id",
    "workId": "optional-work-item-id",
    "receivedAt": "2026-05-07T15:30:48Z",
    "receivedAtMs": 1778167848812,
    "ackedAt": "2026-05-07T15:31:10Z",
    "retriedAt": "2026-05-07T15:32:00Z",
    "retryCount": 1
  },
  "priority": 50,
  "createdAt": "2026-05-07T15:30:00Z",
  "createdAtMs": 1778167800000
}
```

## 메시지 종류

| Kind | Priority | 용도 |
| --- | ---: | --- |
| `blocker` | 99 | 개입 없이는 작업을 진행할 수 없습니다. |
| `question` | 70 | 수신자가 답해야 작업을 계속할 수 있습니다. |
| `answer` | 60 | 질문에 대한 답변입니다. `--reply-to`를 포함하세요. |
| `instruction` | 50 | 하나의 제한된 작업을 할당합니다. |
| `status` | 30 | 진행 상황, 완료, 검증 보고입니다. |
| `note` | 10 | 낮은 우선순위의 context입니다. |

## 디렉터리 구조

```text
<AWG_ROOT>/
  queues/<agent>/inbox/       # pending messages
  queues/<agent>/processing/  # recv로 claim된 뒤 아직 acknowledge되지 않은 메시지
  queues/<agent>/processed/   # completed/acknowledged history
  queues/<agent>/dead/        # retry limit exceeded
  log/messages.jsonl          # append-only sent-message log
  log/pruned/                 # archived processed messages and pruned log lines
  tmp/                        # temporary writes and locks
```

## Lead / Worker 운영 루프

간단한 two-agent loop:

1. Lead가 worker에게 `instruction` 하나를 보냅니다.
2. Worker는 `recv`로 메시지를 claim하고 작업을 시작한 뒤 `status`를 보냅니다.
3. Worker는 정보가 부족해 막히면 `question`을 보냅니다.
4. Lead는 `answer --reply-to=<question-id>`로 답합니다.
5. Worker는 deliverable과 verification을 담아 `status`를 보냅니다.
6. Lead는 핵심 deliverable을 독립적으로 검증합니다.
7. Worker는 완료된 instruction을 `ack`합니다.
8. Lead는 다음 instruction을 보내거나 최종 보고합니다.

큐 라우팅에는 개인 에이전트 이름이 아니라 역할 이름(`lead`, `worker`, `reviewer`)을 사용합니다. 전체 convention은 [Queue-First Workflow](docs/queue-first-workflow.md#role-naming-convention)를 참고하세요.

## 유지보수 흐름

모든 enhancement에는 이 흐름을 사용하세요.

1. 운영 문제와 기대 동작을 정의합니다.
2. 범위가 정해진 문제를 해결하는 가장 작은 공통 변경을 `src/agent_working_group/`, `scripts/`, `dashboard/`, 또는 docs에 구현합니다.
3. 동작이 바뀌면 `README.md`, protocol/API docs, runtime docs, 또는 script docs를 영어로 업데이트합니다.
4. `tests/`에 테스트를 추가하거나 갱신합니다.
5. 저장소 루트에서 가장 작은 의미 있는 verification을 먼저 실행하고, shared behavior에 영향이 있으면 더 넓은 테스트를 실행합니다.
6. public API와 문서를 명확성 관점에서 검토합니다.
7. 그 다음에만 enhancement 완료를 보고합니다.

이 흐름은 구현, 문서, 테스트를 함께 맞춥니다.

## Claude Code Worker

코드 관련 instruction에는 Claude Code adapter가 기존 Codex adapter와 함께 executor bridge를 구동할 수 있습니다. Dual-agent executor는 둘 다 감쌉니다. primary agent를 먼저 시도하고, 429/rate-limit retry가 발생하면 bridge의 ack-on-structured-success contract를 바꾸지 않고 다른 agent로 자동 fallback합니다.

```bash
export AWG_ROOT=.agent-working-group
export WORKER=worker
export LEAD=lead
export AGENT=claude              # primary; "codex" is also supported
export AWG_FALLBACK=1            # 1 = enable cross-agent fallback
export AWG_CLAUDE_REPO=/path/to/repo
scripts/awg-claude-worker-tmux.sh start
scripts/awg-claude-worker-tmux.sh status
scripts/awg-claude-worker-tmux.sh stop
```

Claude worker는 opt-in이며 `MAX_TASKS`와 `MAX_IDLE_SECONDS`로 제한됩니다. 메시지 body를 prompt data로만 취급하고, JSON run summary를 `log/claude-worker/run-summaries/` 아래에 씁니다. 구조, fallback rule, 전체 environment matrix는 [Dual-Agent Executor](docs/executors.md)를 참고하세요.

## 현재 범위

AWG는 의도적으로 단순하고 local-first입니다. broker, database, network service, daemon이 필요 없습니다. 로컬 에이전트 orchestration, coding-agent experiment, office workflow, 작은 workflow project에 적합합니다.

clean-clone operator setup은 [Operator Runbook](docs/operator-runbook.md)을 참고하세요. 이 문서는 저장소에 포함된 workflow와 agent identity, notification surface, credential, private artifact location 같은 환경별 선택을 구분합니다. 실행 가능한 queue lifecycle demo는 [Examples](examples/README.md)를 참고하세요.

queue-first planning, handoff, review, closure pattern은 [Queue-First Workflow](docs/queue-first-workflow.md)를 참고하세요. 실질적인 spec은 AWG queue message로 보내고, 외부 chat이나 issue tracker에는 queue item이 추가됐다는 짧은 알림만 남기는 것이 좋습니다. implementation-mode reliability, PR boundary, active work state, tmux completion watching, branch protection, dashboard supervision은 [Reliable AWG Runtime](docs/reliable-awg-runtime.md)을 참고하세요.

테스트에 매핑된 safety guarantee는 [Spec Matrix](docs/spec-matrix.md)를 참고하세요. optional multi-message, work-item, cross-surface traceability는 [Working-Group Queue Protocol](docs/protocol.md)의 `refs.correlationId`, `refs.workId`, `refs.parentId`, `refs.sourceChannel`, `refs.reportTarget`, `refs.repo`, `refs.workspace` convention을 따릅니다. `awg send`는 `--correlation-id`, `--work-id`, `--parent-id`, `--source-channel`, `--report-target`, `--repo`, `--workspace` flag로 이를 설정할 수 있습니다. `awg recv`, `peek`, `pending`, `status`는 `--report-target` filtering을 opt-in할 수 있어 channel-bound worker가 non-matching message를 pending 상태로 두고 matching work로 진행할 수 있습니다. `message.id`는 canonical message identity이고, `processing/`은 유일한 durable active claim-like queue state입니다.

helper code의 filesystem containment rule은 [Path Safety](docs/path-safety.md)를 참고하세요. Path helper는 canonical path를 resolve하고, fail closed하며, symlink 또는 traversal escape를 거부해야 합니다.

재사용 가능한 template은 [docs/templates](docs/templates/)에 있습니다: [Task Spec](docs/templates/task-spec.md), [QA Checklist Request](docs/templates/qa-checklist-request.md), [Review Result](docs/templates/review-result.md), [Close Report](docs/templates/close-report.md), [PR Review Request](docs/templates/pr-review-request.md), [PR Review Result Comment](docs/templates/pr-review-result-comment.md), [Artifact Index](docs/templates/artifact-index.md), [Queue Reconciliation Action Audit](docs/templates/queue-reconciliation-action-audit.md). `scripts/awg-independent-analysis-template.sh`는 task spec, review result, close report template과 맞춘 stdout-only independent-analysis section scaffold를 출력합니다.

일반 output boundary model은 [Output And Publish Gate](docs/output-publish-gate.md)를 참고하세요. AWG는 모든 workflow에 pull request, Codex, tmux, coding-specific ceremony를 요구하지 않습니다. final output, evidence, review, remaining risk를 기록하는 가장 가벼운 gate를 선택하세요. queue-first pull request review gate와 public-safe PR comment는 [PR Review Gate](docs/pr-review-gate.md)를 참고하세요. Review result는 pull request에 요약할 수 있지만, workflow는 절대 auto-merge 또는 auto-approve해서는 안 됩니다. non-trivial PR은 public evidence comment URL과 함께 `PR review gate: fulfilled`를 기록하거나, explicit reason과 함께 `skipped`를 기록해야 합니다.

운영용 Markdown artifact lifecycle, timestamped filename, active/completed/archive retention은 [Artifact Retention](docs/artifact-retention.md)을 참고하세요. Ops workspace 전체의 read-only discovery는 [Artifact Index](docs/artifact-index.md)를 참고하세요.

opt-in queue-to-executor bridge는 [AI Executor Bridge](docs/ai-executor-bridge.md)를 참고하세요. Bridge는 instruction execution이 성공한 경우에만 acknowledge하고, message body를 shell로 실행하지 않습니다. `scripts/awg-real-executor-template.sh`는 private real executor wrapper를 위한 provider-neutral adapter template을 제공합니다. 429 fallback이 있는 Codex + Claude Code dual-agent executor 구조는 [Dual-Agent Executor](docs/executors.md)를 참고하세요. Codex Tmux Worker와 Claude Code Worker 운영 사용법, 즉 manual bounded run, tmux command, operator flow, stale recovery는 [Worker Tmux Guide](docs/codex-tmux-worker.md)를 참고하세요. Codex, Claude Code, tmux는 선택적 worker path이며 office, local artifact, non-coding workflow의 필수 조건이 아닙니다.

repository-first commit message와 pull request title rule, 그리고 Conventional Commits fallback은 [Repository Rules](docs/repository-rules.md)를 참고하세요. `scripts/awg-detect-repository-rules.sh`는 candidate rule source를 read-only로 advisory scan합니다.

cron, timer, watchdog pattern은 [Safe Scheduling](docs/safe-scheduling.md)을 참고하세요. Scheduled observer는 실제 processor가 붙어 있지 않으면 `recv`를 호출하면 안 됩니다. 이미 superseded됐을 수 있는 오래된 inbox message는 [Queue Inbox Reconciliation](docs/queue-reconciliation.md)과 read-only reconciliation report helper를 참고하세요.

pending queue notification은 [Queue Notifier](docs/queue-notifier.md), [Queue Notifier Adapters](docs/queue-notifier-adapters.md), [Runtime-Neutral Notifier Contract](docs/runtime-neutral-notifier-contract.md), [Queue Notifier Scheduler Sample](docs/queue-notifier-scheduler-sample.md)를 참고하세요. Repository notifier helper는 channel-agnostic wake-up bridge입니다. `awg.notifier.pending.v1` provider-neutral payload를 emit하며 work를 consume, execute, send하지 않습니다. Site-local send-time wrapper는 operator가 repository 밖에서 secret, destination, delivery verification, rollback을 구성한 뒤 enqueue 후 external delivery할 수 있습니다.

명시적 local hook dispatch는 [Queue Hooks](docs/hooks.md)를 참고하세요. Hook은 CLI invocation별 opt-in이고, shell string 대신 argv-list command를 사용하며, message payload를 JSON data로 받고, 기본적으로 recursion을 막고, notification/observer code를 queue authority로 만들지 않습니다.

read-only pre-work 또는 close-readiness snapshot은 [Operator Baseline Doctor](docs/operator-baseline-doctor.md)를 사용하세요. 이 도구는 queue, repository, artifact, scheduler, provider를 mutate하지 않고 local Git status, optional GitHub count, role queue status, active artifact count를 보고합니다.

bounded tmux worker script, safe-poll coexistence, read-only worker state reporting, instruction auto-ack warning은 [Worker Operations](docs/worker-operations.md)를 참고하세요. Automation을 시작하기 전에 manual/no worker, bounded worker, always-on worker 중 하나를 명시적 운영 결정으로 선택하세요. Worker script는 queue runner이지 AI executor가 아닙니다. execution 없이 acknowledge하는 것이 의도된 상황이 아니라면 active queue runner에 `instruction` message를 보내지 마세요.

worker temp file과 stale worker lock directory cleanup은 [Cleanup Artifacts](docs/cleanup-artifacts.md)를 참고하세요. Cleanup job은 queue JSON을 직접 삭제하면 안 됩니다.
