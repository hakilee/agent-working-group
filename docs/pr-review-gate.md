# PR Review Gate

Use this workflow when a pull request needs independent review before merge. The review request is queue-first: the lead creates an AWG `instruction` for the reviewer with the PR, scope, checks, and expected output. Chat should only announce that the queue item was added.

## Flow

1. Lead opens or identifies a pull request.
2. Lead sends an AWG `instruction` to a reviewer using the [PR Review Request Template](templates/pr-review-request.md).
3. Reviewer receives the instruction with `recv --require-ack` and writes the full QA result to a file or AWG `status`.
4. Lead verifies any required fixes or conditions.
5. Lead posts a concise public-safe summary to the pull request using the [PR Review Result Comment Template](templates/pr-review-result-comment.md).
6. Lead merges only after `PASS` or after an accepted conditional resolution has been fixed and rechecked.

## Lead Responsibilities

- Put the full review request in the AWG queue, not a chat-only message.
- Include repository, PR number or URL, branch, scope, checklist path, expected checks, and requested output path.
- Keep the PR comment concise and public-safe.
- Do not merge while the review verdict is `FAIL` or unresolved `CONDITIONAL PASS`.
- Record any accepted risk before merge.

## Reviewer Responsibilities

- Treat the AWG instruction as the source of truth.
- Review the diff, docs, tests, and requested checks without relying on chat-only context.
- Write full findings to a file or AWG `status` message.
- Use `PASS`, `CONDITIONAL PASS`, or `FAIL`.
- Leave the instruction unacknowledged until the requested QA result is complete.

The lead should post the PR comment. This keeps public comments deliberate and avoids leaking private workspace context from raw review notes.

## PR Comment Policy

PR comments are public artifacts. They should include only information safe for a repository audience:

- verdict
- evidence checked
- findings or resolved conditions
- residual risks
- next action

Do not include private agent names, local paths, private chat references, credentials, or hidden workspace details.

## Merge Gate

- `PASS`: merge is allowed after the lead confirms required checks.
- `CONDITIONAL PASS`: merge is blocked until listed conditions are fixed or explicitly accepted and documented.
- `FAIL`: merge is blocked. Fix blockers and request review again.

Never auto-merge or auto-approve from this workflow. Review comments are evidence, not an automatic approval mechanism.

## Helper Script

`scripts/awg-pr-review-request.sh` is an optional helper for creating a queue-first PR review request. It reads pull request metadata with `gh`, collects a file list and check summary when available, and sends one AWG `instruction` to the reviewer.

The helper is opt-in. It must not merge, approve, checkout, build, test, or execute pull request code. It only reads PR metadata and sends a queue message.

## Failure Handling

If `gh` is unavailable or unauthenticated, record a `blocker` or write the review request as a file. Keep the review artifacts in AWG or files until the PR comment can be posted safely.

If AWG is unavailable, write the review request to a file and record why queue-first delivery was skipped. Add the queue item when AWG is available again.

## Related Templates

- [PR Review Request](templates/pr-review-request.md)
- [PR Review Result Comment](templates/pr-review-result-comment.md)
- [Review Result](templates/review-result.md)
- [Close Report](templates/close-report.md)
