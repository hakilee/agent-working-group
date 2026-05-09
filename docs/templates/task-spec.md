# Task Spec Template

Use this as the body of an AWG `instruction` message when assigning substantive work.

## Goal

State the outcome in one or two sentences.

## Scope

- In scope:
- Out of scope:

## Constraints

- Safety constraints:
- Compatibility constraints:
- Documentation constraints:

## Exit Criteria

- Required behavior:
- Required tests or checks:
- Required documentation:
- Required review or signoff:

## Independent Analysis Requirement

Use only for large, high-risk, or strategically important analysis/design work. Leave as `not required` for trivial one-step work or routine tasks.

- Required: yes/no/not required
- Lead analysis artifact or summary:
- Worker/reviewer analysis artifact or summary:
- Comparison required before closure: yes/no

## Workspace

Describe the repository, package, or artifact area. Use portable paths such as repository-relative paths when possible.

## Requested Output

- Artifact path or result location:
- Status report format:
- Evidence to include:

## Output Or Publish Gate

Choose the lightest gate that matches the work. Examples: pull request, local artifact, office/admin output, external send, queue mutation, worker execution, or not applicable.

- Gate type:
- Final output or destination:
- Required evidence:
- Required approval or reviewer signoff:
- Skip reason if not applicable or intentionally skipped:

## Reply Path

- Send `status` when starting.
- Send `question` with `replyTo` if information is missing.
- Send `blocker` if work cannot proceed locally.
- Send final `status` with artifacts, verification, and residual risks.
- Acknowledge the instruction only after the output is complete.
