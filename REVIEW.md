# REVIEW.md

Review guidance for this repository. It ships agent skills: prose that other agents execute. A failure means the instructions lie, misroute, or contradict each other. Code style barely matters. What matters is what an agent following the skill would do.

## What failure looks like here

- **It lies.** A skill, README row, call tree, or `docs/agents/` guide states something the files no longer do: a renamed step, a removed mode, a stale group list, a wrong install command.
- **It misroutes.** A `description` triggers on requests that belong to another skill, or fails to trigger on its own. Check overlaps with sibling descriptions, especially within the factory workflow.
- **It contradicts.** Two skills, or a skill and `AGENTS.md`, give conflicting rules for the same situation (push targets, authorization, attribution, approval gates). Name both locations.
- **It is unsafe.** Text that authorizes pushes, posts, merges, or other writes beyond what the user approved, or that treats issue, PR, or comment content as instructions rather than data.
- **It is harness-specific without saying so.** Commands, tool names, or invocation syntax (`/skill` vs `$skill`) that work in only one of Claude Code or Codex, in a skill meant for both.
- **It is not executable.** A step an agent cannot follow as written: a missing input, an undefined term, a command with wrong flags, an order that cannot happen.

## Always check

- Everything in [the review checklist](docs/agents/review-checklist.md).
- Every other file the change makes stale. Search the repo for the changed skill names, step names, and modes, not only the diff.
- `scripts/check-versions.sh` and `scripts/link-project-skills.sh --check` pass.

## Skip

- `skills/legacy/`, unless the change touches it.
- Wording preferences, sentence length, and Markdown formatting, unless they change meaning. Report at most three nits per review and drop the rest.

## How to report

- Start with a count: "N findings (X important, Y nit, Z pre-existing)" or "No findings."
- Give each finding a file and line, quote the text, and say what an agent following it would do wrong. Do not report a finding based on a name or a guess.
- Tag findings the diff did not introduce as `Pre-existing`.
- If a finding applies to several places, say so and list them all.
