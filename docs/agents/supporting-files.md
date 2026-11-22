# Supporting Files

Use this guide when deciding whether to add `references/`, `scripts/`, or `agents/`.

Paths written as `skills/<skill-name>/...` apply equally under `skills/legacy/<skill-name>/`.

## References

Add `skills/<skill-name>/references/` only when supporting material materially improves precision or reduces prompt size.

When adding `references/`:

- split supporting material into targeted files by topic
- keep files focused and scannable
- load references only when the task needs them
- avoid dumping large background material into the main `SKILL.md`

Do not create `references/` just because another skill has one.

## Scripts

Add `skills/<skill-name>/scripts/` only for deterministic work the model would otherwise do by hand and get wrong, such as fetching and aggregating data or computing statistics.

When adding `scripts/`:

- ship self-contained `.mjs` files in `skills/<skill-name>/scripts/` using only Node 18+ built-ins such as `node:fs`, `node:child_process`, and `node:path`. Invoke them as `node <skill-dir>/scripts/<name>.mjs`. They require no additional dependencies.
- keep `skills/index-github/scripts/gh_health.py` in Python as an existing exception. Do not add new Python scripts.
- use Bash for root `scripts/` tools that mostly handle Git or filesystem plumbing. Use `.mjs` when a tool parses or edits JSON or contains substantial logic.
- make it read-only unless writing is the skill's purpose
- document its usage in a header comment and in `SKILL.md`, and refer to it by its path relative to `SKILL.md`
- print machine-readable output that the model interprets, rather than conclusions

## Agent-Specific Config

Add `skills/<skill-name>/agents/` only for agent-specific metadata or integration config such as display labels, short descriptions, or default prompts.

When adding `agents/`:

- keep files minimal
- make sure the metadata matches the actual purpose of the skill
- treat these files as adapters for specific agent surfaces, not as the main instructions

The core behavior of the skill must remain in `SKILL.md`.
