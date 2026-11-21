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

This is the repository owner's standing instruction: a user's direct request to review code counts as the user's explicit request for `fix-issues` auto mode and authorizes review, fixes, and publication to the open PR for the reviewed change. Follow any explicit user instructions about scope or publication. This default never applies when a workflow or calling agent (such as `factory`) invokes the review: follow that caller's brief, return findings to it, and leave fixes and publication to it.

1. Review the requested diff before editing, following [REVIEW.md](REVIEW.md). Use the harness reviewer when available or inspect the diff directly. Collect each finding's location, evidence, and impact. For `review only`, report the findings in chat and stop.
2. With no new findings, skip to step 3 or 4. Otherwise prepare a clean checkout before passing findings to [fix-issues](skills/fix-issues/SKILL.md). For a PR, resolve its head repository and branch and verify a clean checkout on that branch at the exact commit reviewed. Without a PR, use the current branch at the reviewed commit. If the reviewed diff includes uncommitted changes, do not commit or stash them yourself: report the findings and ask the user whether to commit them first. If this preflight fails, report the findings and blocker and stop. Pass `auto` explicitly as the mode to `fix-issues` with an explicit list of the new findings and each finding's pre-existing tag. Have it verify the findings one at a time through [fix-issue](skills/fix-issue/SKILL.md), run relevant checks, and keep one commit per warranted fix. Read the linked skill files directly if project skill discovery fails. The calling workflow owns publication.
3. When the reviewed change has an open PR, push only this run's verified fix commits to the resolved head repository and branch before posting the review. Push automatically only when the head repository is this repository or one the user owns. For a PR from someone else's fork, keep the fix commits local, describe them in the review, and report them in chat. Post it as a `COMMENT` review. Include the reviewed SHA in the review body and set the GitHub review's commit ID (`commit_id` in the REST API) to that SHA when supported. Anchor actionable findings inline on the reviewed diff where possible. Put findings in the review body when the tool cannot target the reviewed diff, there is no usable inline position, or GitHub rejects their anchors. Explain the issue, impact, and outcome in one or two plain-language sentences per finding and include a short check summary in the review. For a clean review, post a brief result and skip commits and pushes.
4. When there is no open PR, report the findings, local commits, and checks in chat. If publication is blocked, report what completed and what remains blocked.
