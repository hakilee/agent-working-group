# Artifact Index Template

Use this file to track operational artifacts in an AWG ops workspace.

## Index

| Filename | Status | Task | Created | Owner Role | Notes |
| --- | --- | --- | --- | --- | --- |
| `YYYYMMDDHHMM-example.md` | active / completed / archive | Short task name | YYYY-MM-DD HH:MM | lead / worker / reviewer | Short note |

## Status Values

- `active`: still needed for open work.
- `completed`: closed work kept for audit or future handoff.
- `archive`: older completed work retained by policy.

## Rules

- Prefer timestamped filenames: `YYYYMMDDHHMM-short-description.md`.
- Move completed artifacts to `completed/` instead of deleting them.
- Move older completed artifacts to `archive/` by explicit retention policy.
- Delete only when an explicit retention rule says deletion is safe.
- Keep entries generic and public-safe.
