# Reliable AWG Runtime

This document defines the reliability baseline for AWG implementation work.

## Operating Model

AWG has two separate workflows:

1. **Implementation mode**
   - Lead scopes work through the AWG queue.
   - Worker implements or independently verifies through queued work items.
   - The workflow ends when a pull request is created.
   - Do not merge, approve, or continue into review mode in the same workflow.

2. **Review mode**
   - A GitHub PR/Issue webhook mentions MATGUKNO in the Discord work channel.
   - That mention starts a new AWG workflow with review-specific scope.
   - Review mode can run PR checks, ask worker QA, request changes, or prepare merge.

This separation prevents a long implementation session from silently becoming its
own reviewer after compaction or context drift.

## Reliability Principles

- **Enforce, do not rely on memory.** Main must be protected so implementation
  work reaches main only through PRs.
- **Persist active state.** Long-running work records its branch, tmux sessions,
  PR URL, and latest status under `.agent-working-group/runtime/work-state/`.
- **Decouple completion detection.** tmux completion is detected by a watcher
  process that writes durable files, not by main-session cron/systemEvents.
- **Supervise the dashboard.** The dashboard is a production surface and must be
  managed by a process supervisor with restart-on-failure, not ad-hoc `nohup`.

## Required Helpers

- `scripts/github-protect-main.sh` applies baseline GitHub branch protection.
- `scripts/install-local-main-guard.sh` installs the tracked local pre-push guard.
- `scripts/awg-work-state.sh` records active work state and event history.
- `scripts/tmux-completion-watcher.sh` watches tmux sessions independently and
  writes completion evidence to `.agent-working-group/runtime/tmux-results/`.
- `scripts/awg-pr-create-and-stop.sh` pushes the implementation branch, creates
  the PR, records the PR URL, and stops implementation mode.
- `scripts/install-dashboard-launchd.sh` installs a macOS LaunchAgent that keeps
  the dashboard running after crashes, logout/login, or reboot.
- `scripts/awg-dashboard-healthcheck.sh` verifies `/api/status` and fails if the
  dashboard is unreachable or using an unsafe temporary root.

## Implementation Checklist

1. Create an implementation branch; never work directly on `main`.
2. Send the scope and exit criteria to the AWG queue.
3. Start persistent state:
   ```bash
   scripts/awg-work-state.sh start --id WORK_ID --title "..." --branch BRANCH --repo OWNER/REPO
   ```
4. Run code work in tmux and start the watcher. The safe default requires a new
   explicit marker such as `AWG_TMUX_DONE:WORK_ID` in pane output; it no longer
   treats generic historical `PASS`, `FAIL`, `DONE`, or prompt text as complete.
   ```bash
   scripts/tmux-completion-watcher.sh --sessions SESSION --state-id WORK_ID
   ```
5. Request worker QA through the AWG queue and record PASS/FAIL evidence.
6. Create the PR and stop:
   ```bash
   scripts/awg-pr-create-and-stop.sh --work-id WORK_ID --repo OWNER/REPO --title "..." --body-file /tmp/body.md
   ```
7. Wait for the GitHub webhook/mention to start review mode.

## Branch Protection

Apply once per repository:

```bash
scripts/github-protect-main.sh --repo OWNER/REPO
```

By default the helper fetches and preserves existing required status checks and
push restrictions. If GitHub rejects the read, fix permissions first or rerun
with `--replace-existing` only when intentionally creating a baseline policy from
scratch.

If GitHub rejects the request, the operator account lacks permission. Treat that
as a blocker because direct main push remains possible on GitHub.

Install the local safety net on every checkout used by agents:

```bash
scripts/install-local-main-guard.sh
```

The local guard is not a substitute for GitHub branch protection, but it prevents
this workstation from accidentally pushing `main` while repo-admin protection is
being enabled.

## Dashboard Supervision

Install the macOS LaunchAgent on the host that serves `awg.haklee.me`:

```bash
scripts/install-dashboard-launchd.sh
scripts/awg-dashboard-healthcheck.sh --url http://127.0.0.1:8000/api/status
```

The LaunchAgent runs `scripts/awg-dashboard-start.sh` with `RunAtLoad` and
`KeepAlive`, writing logs to `.agent-working-group/log/dashboard/`. Manual starts
remain available for debugging, but production use should rely on launchd so a
crash or reboot does not leave Cloudflare pointing at a dead local origin.
