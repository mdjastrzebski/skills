# Review Checklist

Use this guide before finishing changes to a skill.

## Checklist

- frontmatter is present and valid
- the description is specific enough to trigger well
- the instructions are concrete and usable
- the skill works on its own: it does not name a specific caller and has no `../` links to other skills
- the skill is short enough for a person to read in one sitting, and no procedure is duplicated from another skill
- steps better suited to a short script were suggested to the user, and any new script is `.mjs`, Node 20+, and portable
- optional folders exist only when they earn their keep
- any agent-specific metadata matches the skill
- adds, removals, and renames are reflected in the root `README.md` catalog, install commands, and discovery links; a rename includes migration instructions and continues the old version and changelog
- version bumped once on this branch at the right level, changelog entry written, `scripts/check-versions.sh` passes
- the skill is in the right place (`skills/` vs `skills/legacy/`) and README section (Factory Workflow for `factory` and its direct and indirect companion skills, Other Skills, or Legacy Skills), with the factory call tree, install command, and top-down order still accurate
- `.claude/skills/` and `.agents/skills/` links match `skills/` (`scripts/link-project-skills.sh --check` passes)
