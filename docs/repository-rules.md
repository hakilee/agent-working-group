# Repository Rules For Commits And Pull Requests

Use this policy when choosing Git commit messages, pull request titles, and squash merge titles.

## Rule Priority

Repository rule first. If the target repository documents an explicit commit message or pull request title rule, follow that rule.

If no explicit repository rule exists, use Conventional Commits as the fallback.

Fallback format:

```text
<type>(scope): <description>

[optional body]

[optional footer(s)]
```

The `scope` is optional when it does not add useful context.

## What This Covers

Apply the same rule source to:

- Git commit messages
- pull request titles
- squash merge commit titles

When squash merging, keep the pull request title aligned with the intended squash commit title unless the repository's documented merge policy says otherwise.

## Discovery Order

Before choosing a commit message or pull request title, check for repository-specific rules in this order:

1. contribution docs, maintainer docs, or repository workflow docs
2. pull request templates or issue templates
3. commit lint, release, or changelog configuration
4. package, project, or tool configuration that states commit or title rules
5. branch protection, merge policy, or release policy docs
6. if no explicit rule is found, use Conventional Commits fallback

Record which rule source was used in review and close reports.

## Conventional Commits Fallback

Use clear, lower-case types such as:

- `feat`: user-visible capability or workflow addition
- `fix`: bug fix or behavioral correction
- `docs`: documentation-only change
- `test`: test-only change
- `chore`: maintenance that does not change behavior
- `refactor`: restructuring without behavior change

Examples:

```text
docs: add repository rule policy
feat(worker): add bounded queue runner
fix(cleanup): preserve fresh lock directories
```

Use a body when the change needs context, rationale, or risk notes. Use footers for issue references, breaking changes, or other repository-standard metadata.

## Review Gate

Pull request reviewers should check that:

- the pull request title follows the repository rule or Conventional Commits fallback
- the intended squash merge title follows the same rule source
- the rule source is documented when the review result or close report is written

Do not invent a repository rule. If no explicit rule is found, say so and use the fallback.

## Public Safety

Keep rule notes public-safe:

- use repository-relative references
- avoid private local paths
- avoid private agent names
- avoid private chat references
- avoid credentials or hidden workspace details
