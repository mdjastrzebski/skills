# Skill Authoring

Use this guide when writing or editing `SKILL.md`.

## Principles

1. **Loosely coupled skills.** Each skill is a small, self-contained ball of mud, not a node in one big one.
   - A skill must work on its own. It never names a specific caller, such as `factory`, and never links to another skill's folder (`../`).
   - Where skills cooperate, each exposes a generic contract (inputs, return payload, stop reasons) that any caller can use. The skill that has the knowledge owns the procedure; other skills call it by name instead of copying it.
   - A format or procedure lives in exactly one skill. Do not duplicate it across skills.
   - Before adding a reference from one skill to another, ask whether the first skill still works if the second is not installed.
2. **Short and readable by humans.** A person must be able to read a `SKILL.md` in one sitting and say what it does.
   - Prefer short sections, lists, and direct instructions. Cut rules the model would follow anyway.
   - When a skill grows large, split a focused skill off or move detail into `references/` (see [Supporting Files](supporting-files.md)) instead of adding more text.
   - Do not hide a second skill inside a first: a long "mode" section is a sign that it should be its own skill.
3. **Prefer code to agent work where it fits.** While authoring or reviewing a skill, look for steps a short script does better than the agent: parsing, counting, diffing, validating, fetching and aggregating data, rendering a fixed layout, or any step that must give the same result every time.
   - Suggest each candidate to the user, with what the script would take and print. Do not silently write the script or silently leave the step to the agent.
   - Keep judgment, summarizing, and decisions with the agent.
   - Follow [Scripts](supporting-files.md#scripts) when writing the script.

## Required Frontmatter

Every `SKILL.md` must include:

- `name`
- `description`
- `metadata.version` (quoted semver string; see [Versioning](versioning.md))

## Writing Rules

- The `description` is a trigger condition, not a summary: lead with the situations that should invoke the skill, in the user's words.
  - Write: `Use when the user asks to ... , or says ... .`
  - Not: `Reviews X and produces Y.`
  - State the default scope or mode, so the skill triggers on requests that omit it.
  - Cut anything a reader would already assume.
- Prefer concrete tasks, technologies, and use cases over vague claims like "best practices" or "general help."
- Keep instructions actionable.
- Prefer direct guidance, checklists, heuristics, and named workflows over broad advice.

## What the Skill Must Make Clear

- what the skill is for
- when to use it
- what workflow or decision process to follow
- what to avoid spending time on, when relevant

## Default Direction

- Prefer durable guidance over references to temporary project details.
