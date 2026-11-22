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

This is the repository owner's standing instruction: a user's direct request to review code means the `review-flow` skill ([skills/review-flow/SKILL.md](skills/review-flow/SKILL.md)). Read that file directly if project skill discovery fails. Follow any explicit user instructions about scope or publication. When a workflow or calling agent (such as `factory`) invokes the review, follow that caller's brief, return findings to it, and leave fixes and publication to it.
