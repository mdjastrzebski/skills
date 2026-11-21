# AGENTS.md

This repository is a collection of installable agent skills.

Read only the guide relevant to your task:

- [Skill Structure](docs/agents/skill-structure.md)
- [Skill Authoring](docs/agents/skill-authoring.md)
- [Supporting Files](docs/agents/supporting-files.md)
- [README Catalog](docs/agents/readme-catalog.md)
- [Versioning](docs/agents/versioning.md)
- [Review Checklist](docs/agents/review-checklist.md)

Repo-wide notes:

- No non-default package manager, build, or typecheck commands are currently defined in this repository.
- If your task adds, removes, or renames a skill, also read [README Catalog](docs/agents/readme-catalog.md).
- If your task adds, removes, renames, retires, or revives a skill, run `scripts/link-project-skills.sh` and commit the resulting `.claude/skills/` and `.agents/skills/` changes in the same change. Run `scripts/link-project-skills.sh --check` before finishing.
- If your task changes a skill, also read [Versioning](docs/agents/versioning.md) and run `scripts/check-versions.sh`.

## Code review

A request to review code authorizes review, fixes, and publication to the open PR for the reviewed change. Follow any explicit user instructions about scope or publication.

1. Review the requested diff before editing. Use the harness reviewer when available or inspect the diff directly. Collect each finding's location, evidence, and impact. For `review only`, report the findings in chat and stop.
2. For a PR with new findings, resolve the PR's head repository and branch. Prepare and verify a clean checkout on that branch at the exact commit reviewed before passing findings to [fix-issues](skills/fix-issues/SKILL.md). If this preflight fails, report the findings and blocker and stop. Run `fix-issues` in auto mode with an explicit list of the new findings, including an empty list for a clean review. Have it verify the findings one at a time through [fix-issue](skills/fix-issue/SKILL.md), run relevant checks, and keep one commit per warranted fix. Read the linked skill files directly if project skill discovery fails. The calling workflow owns publication.
3. When the reviewed change has an open PR, push only this run's verified fix commits to the resolved head repository and branch before posting the review. Anchor actionable findings inline on the reviewed diff where possible. Explain the issue, impact, and outcome in one or two plain-language sentences per comment and include a short check summary in the review. For a clean review, post a brief result and skip commits and pushes.
4. When there is no open PR, report the findings, local commits, and checks in chat. If publication is blocked, report what completed and what remains blocked.
