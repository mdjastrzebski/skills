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

Add `skills/<skill-name>/scripts/` for deterministic work the model would otherwise do by hand and get wrong, or that a short script does more cheaply and repeatably, such as fetching and aggregating data, parsing, validating, or computing statistics. Keep each script small. If it grows large, it probably does too much.

When adding `scripts/`:

- ship self-contained `.mjs` files in `skills/<skill-name>/scripts/` using only Node 20+ built-ins such as `node:fs`, `node:child_process`, and `node:path`. Invoke them as `node <skill-dir>/scripts/<name>.mjs`. They require no additional dependencies and no build step.
- make scripts portable: they must run the same on Linux, macOS, and Windows.
  - Build paths with `node:path` and `node:url` (`fileURLToPath(import.meta.url)`), never string concatenation with `/` or `\`.
  - Do not depend on a shell, shell syntax, or platform tools (`grep`, `sed`, `awk`). Call `git` or `gh` through `child_process` with an argument array, not a command string.
  - Accept both `\n` and `\r\n` line endings, and never assume a home directory or temp path. Use `os.homedir()` and `os.tmpdir()`.
  - Do not use APIs newer than Node 20.
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
