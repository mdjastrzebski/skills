# agent-skills

A collection of agent skills for coding agents.

Each skill lives in its own directory under `skills/` (active skills are grouped by purpose below; retired ones live in `skills/legacy/`) and is designed to be installed individually with the [`skills` CLI](https://skills.sh/docs). The repository currently includes focused, task-specific skills rather than a single bundled workflow.

## Install

Install an individual skill with `npx skills add` and the `--skill` flag:

```bash
npx skills add https://github.com/mdjastrzebski/skills --skill [skill]
```

The `skills` CLI runs with `npx`, so there is no separate global install step.

For more on the CLI, see:

- [skills.sh documentation](https://skills.sh/docs)
- [skills.sh CLI reference](https://skills.sh/docs/cli)

## Skills

### Build

| Skill | Summary | Install |
| --- | --- | --- |
| `implement-idea` | Turn a rough feature or fix idea into an approved spec through a one-question-at-a-time clarifying interview (max 20 questions, the rest decided as stated assumptions), then delegate the build to a subagent sized to the task's difficulty and report how to test it. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill implement-idea` |
| `fix-issue` | Verify one reported issue or review finding, make the smallest warranted fix, and report the verdict and checks. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill fix-issue` |
| `fix-issues` | Work through a list of issues, or the unresolved review comments on a GitHub PR, one by one: triage and order them (bugs first, then by severity), verify and fix each one or explain the verdict, commit each fix separately on the current branch, and summarize the results. For PR comments, interactive mode asks before fixing and before pushing and replying. Opt-in auto mode handles bugs and medium-or-higher improvements without prompts, defers low-severity improvements, and posts a round summary. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill fix-issues` |

### Understand

| Skill | Summary | Install |
| --- | --- | --- |
| `story` | Explain how a system, module, service, or unfamiliar codebase works by telling the story of the system: a few core concepts first, then more detail on request. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill story` |
| `summarize-changes` | Summarize a PR, a branch, or your current changes (default: current branch against the default branch, including uncommitted changes) at the level of approach: neutral facts first (big blocks, structural decisions, assumptions, plus a suggested review order and where line-level review matters most), then a skeptical evaluation from a fresh subagent. Large changes follow a separate procedure (classify files, collapse mechanical edits, summarize blocks in parallel), with coverage stating what was read. Not a line-level review; offers to post the result as a PR comment. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill summarize-changes` |
| `index-codebase` | Study a whole repository and write durable agent docs to `docs/agents/` (architecture, area map, design decisions, where to look, configuration and extension, limitations, security, dev loop, contribution rules, release process), linked from `AGENTS.md`; checks and fixes any existing agent docs, and refreshes everything when the code changes. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill index-codebase` |
| `index-github` | Assess a GitHub project before adopting or contributing to it (activity and responsiveness, maintainers and backing, maturity, alternatives, license and CLA, community, what contributions are welcome, bug hotspots) and write a dated snapshot to `docs/agents/project-health.md`, linked from `AGENTS.md`. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill index-github` |

### Legacy

These skills are kept installable but are no longer recommended or actively maintained; they live under `skills/legacy/`.

| Skill | Summary | Install |
| --- | --- | --- |
| `instrument-with-console-logs` | Add temporary `👀 DEBUG` console.log statements across changed code and surrounding lifecycle code to validate runtime behavior, then strip them again. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill instrument-with-console-logs` |
| `react-review` | Review React and React Native code for correctness bugs rooted in effects, identity, state preservation, tree stability, and lifecycle timing. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill react-review` |
| `trim-comments` | Review the comments in a change, delete the non-essential ones, and tighten the rest — defaults to the current PR / feature branch. | `npx skills add https://github.com/mdjastrzebski/agent-skills --skill trim-comments` |

## Repository Layout

```text
skills/
  <skill-name>/
    SKILL.md
    CHANGELOG.md
    references/        # optional
    scripts/           # optional
    agents/            # optional
  legacy/
    <skill-name>/      # same structure as above
```

- `skills/legacy/` holds retired skills that stay installable; `legacy` is a directory, not a skill.
- `SKILL.md` is the canonical instruction file for a skill.
- `CHANGELOG.md` lists what changed in each version of the skill.
- `references/` holds targeted supporting material that can be loaded on demand.
- `scripts/` holds optional helper scripts for deterministic work such as fetching and aggregating data.
- `agents/` holds optional agent-specific metadata or integration config.

## Local Development

Claude Code and Codex sessions opened in this repo, including Codex Cloud, discover active skills through the tracked links in `.claude/skills/` and `.agents/skills/`, respectively. On Windows, clone with `git clone -c core.symlinks=true <repo-url>` in a setup that allows symlink creation.

To use the working copy's skills in other projects, use the global scripts below.

```bash
scripts/remove-global-skills.sh   # delete copies installed by `npx skills add` (add --dry-run to preview)
scripts/link-skills.sh            # link skills/ and skills/legacy/ into ~/.agents/skills and ~/.claude/skills
```

Both scripts are idempotent. `remove-global-skills.sh` only touches copies whose lock entry comes from `mdjastrzebski/*`, and it needs `jq`. Run `link-skills.sh` again after adding a skill. The links follow whatever branch is checked out.

## Versioning

Each skill is versioned independently with semver in its `SKILL.md` frontmatter (`metadata.version`); see its `CHANGELOG.md` for what changed. `0.x` means the skill is still evolving. Bump rules and scripts are in [docs/agents/versioning.md](docs/agents/versioning.md).

## Authoring

This repository is primarily maintained through coding agents.

If you are adding or updating skills here, follow the repo playbook in [AGENTS.md](AGENTS.md).

After changing a skill, bump it and check versions:

```bash
scripts/bump-skill.sh <name> <patch|minor> -m "what changed"   # once per branch or push
scripts/check-versions.sh                                       # compares against origin/main
```
