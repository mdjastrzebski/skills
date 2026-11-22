# agent-skills

A collection of agent skills for coding agents.

Each skill lives in its own directory under `skills/` (active skills are grouped below; retired ones live in `skills/legacy/`) and is designed to be installed individually with the [`skills` CLI](https://skills.sh/docs). Most skills are focused and task-specific; the [factory workflow](#factory-workflow) skills also compose into one pipeline, and each of them still works on its own.

## Install

Install an individual skill with `npx skills add` and the `--skill` flag:

```bash
npx skills add https://github.com/mdjastrzebski/skills --skill [skill]
```

The `skills` CLI runs with `npx`, so there is no separate global install step.

If you installed `story`, install `explain` and then remove `story`.

```bash
npx skills add https://github.com/mdjastrzebski/skills --skill explain
npx skills remove story
```

Add `--global` to both commands if your `story` installation is global.

To migrate the spec skill, install its new name and remove the old installation. Add `--global` to both commands for a global installation.

```bash
npx skills add https://github.com/mdjastrzebski/skills --skill prepare-spec
npx skills remove clarify-idea
```

For more on the CLI, see:

- [skills.sh documentation](https://skills.sh/docs)
- [skills.sh CLI reference](https://skills.sh/docs/cli)

## Factory Workflow

`prepare-spec` turns an idea or supplied spec into a summary for approval, then saves the full spec and build estimate. Cloud sessions use a GitHub issue. Locally, choose a working-tree `SPEC.md` or an issue. You can revise the saved spec and approve just the changed summary parts.

Run `$factory SPEC.md` or `$factory <spec issue URL>` in a fresh session. Factory checks the saved approval, builds a draft PR or adjusts the existing PR to match that revision, then reviews the changes and posts a handoff. An already matching PR needs no work. You can also give Factory an idea to prepare and build in one run, or a bug issue to diagnose.

Use `$factory PR #1966` or `$factory diagnose PR #1966` for an existing PR. Factory uses the linked issue or PR description, compares the base with the PR changes, and returns the diagnosis in chat. Request the review and fix pipeline explicitly to continue beyond diagnosis. To install the runtime skills in a repo or locally, install them together.

```bash
npx skills add https://github.com/mdjastrzebski/skills --skill factory diagnose-issue prepare-spec implement-spec summarize-changes review-flow fix-issues verify-and-fix
```

**Nested subagents.** Factory runs cheaper when subagents can launch subagents. In Claude Code, add `{"env": {"CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "3"}}` to the target repo's `.claude/settings.json` or set the variable in cloud environment or user settings. It applies to new sessions. In Codex, nesting works by default. Factory falls back automatically when nesting is unavailable and asks once about switching the orchestrator to the standard tier if it runs on another known tier.

The tree shows which skills call each other. Each stage skill can also be invoked directly.

```text
factory                  # orchestrates the run, posts the handoff, marks the PR ready
├── diagnose-issue       # diagnose reports and verify candidate fix PRs
├── prepare-spec         # create, revise, or validate a saved spec and size its build
├── implement-spec       # build in a sized subagent on a new or existing PR branch
├── summarize-changes    # facts for the Final handoff comment
└── review-flow          # run each review round: review, fix, and prepare the review
    └── fix-issues       # triage and fix the round's findings
        └── verify-and-fix   # verify and fix one finding
```

| Skill | Summary | Install |
| --- | --- | --- |
| `factory` | Build or adjust a PR to an approved spec, then review, fix, and hand off. Accept ideas, saved or supplied specs, and bug issues. Diagnose existing PRs in chat by default. | `npx skills add https://github.com/mdjastrzebski/skills --skill factory` |
| `diagnose-issue` | Diagnose a GitHub issue, verify a PR against its linked issue, or take both inputs explicitly. Compare the same reproduction on the baseline and PR head to verify the fix. | `npx skills add https://github.com/mdjastrzebski/skills --skill diagnose-issue` |
| `prepare-spec` | Create or revise a saved spec, approve its summary, and validate it for a later build. Recommends a builder model and effort. | `npx skills add https://github.com/mdjastrzebski/skills --skill prepare-spec` |
| `implement-spec` | Build an approved spec or fix plan in a subagent at the recommended model and effort, verify it, and report. Headless mode opens a draft PR or pushes the change to a supplied PR branch, and finds or adjusts the PR already built from a saved spec. | `npx skills add https://github.com/mdjastrzebski/skills --skill implement-spec` |
| `summarize-changes` | Summarize a PR, a branch, or your current changes (default: current branch against the default branch, including uncommitted changes) at the level of approach: neutral facts first (big blocks, structural decisions, assumptions, plus a suggested review order and where line-level review matters most), then a skeptical evaluation from a fresh subagent. Large changes follow a separate procedure (classify files, collapse mechanical edits, summarize blocks in parallel), with coverage stating what was read. Not a line-level review; offers to post the result as a PR comment. | `npx skills add https://github.com/mdjastrzebski/skills --skill summarize-changes` |
| `review-flow` | Review code when you ask to "review", "review my changes", or "review PR #N". Defaults to the current changes (uncommitted edits, else the current branch's open PR, else the branch against the default branch). Probes the diff to pick the reviewer's model and effort, then numbers the findings. Your own code gets the findings fixed through `fix-issues`; on someone else's PR you choose per finding to fix, comment on, or drop, and pushes to their branch need your yes. Also runs Factory's review rounds headless: review a pinned PR comparison, fix the findings, and return the review to publish. | `npx skills add https://github.com/mdjastrzebski/skills --skill review-flow` |
| `fix-issues` | Work through a list of issues, or the unresolved review comments on a GitHub PR, one by one: triage and order them (bugs first, then by severity), verify and fix each one or explain the verdict, commit each fix separately on the current branch, and summarize the results. For PR comments, interactive mode asks before fixing and before pushing and replying. Opt-in auto mode handles bugs and medium-or-higher improvements without prompts, defers low-severity improvements unless the caller rated them important, leaves findings tagged pre-existing for a follow-up change even when rated important, and posts a round summary. | `npx skills add https://github.com/mdjastrzebski/skills --skill fix-issues` |
| `verify-and-fix` | Verify one reported issue or review finding, make the smallest warranted fix, and report the verdict and checks. | `npx skills add https://github.com/mdjastrzebski/skills --skill verify-and-fix` |

To use `review-flow` on its own, install it with the skills its fix paths need:

```bash
npx skills add https://github.com/mdjastrzebski/skills --skill review-flow fix-issues verify-and-fix
```

### Cloud sessions

In Claude Code or Codex cloud environments, install the skills at user scope in every fresh container from the environment's setup script. The target repo then carries no Factory files, and skill updates reach the next session.

```bash
git clone --depth 1 https://github.com/mdjastrzebski/skills /opt/agent-skills
/opt/agent-skills/scripts/link-skills.sh
```

This links every skill into `~/.agents/skills` (Codex and other agents) and `~/.claude/skills` (Claude Code). Add it alongside the repo's own dependency install. To pin a release, add `--branch <tag>` to the clone; for a specific commit, clone without `--depth 1` and run `git -C /opt/agent-skills checkout <sha>`.

Factory publishes PRs, comments, and reviews, so the session needs GitHub write access to the target repo. Claude Code cloud provides it through its GitHub integration; on Codex cloud it depends on the environment's internet access and credential settings.

## Other Skills

Standalone skills that are not part of the factory workflow.

### Understand

| Skill | Summary | Install |
| --- | --- | --- |
| `explain` | Explain how a system, module, service, or unfamiliar codebase works by telling the story of the system: a few core concepts first, then more detail on request. | `npx skills add https://github.com/mdjastrzebski/skills --skill explain` |
| `index-codebase` | Study a whole repository and write durable agent docs to `docs/agents/` (architecture, area map, design decisions, where to look, configuration and extension, limitations, security, dev loop, contribution rules, release process), linked from `AGENTS.md`; checks and fixes any existing agent docs, and refreshes everything when the code changes. | `npx skills add https://github.com/mdjastrzebski/skills --skill index-codebase` |
| `index-github` | Assess a GitHub project before adopting or contributing to it (activity and responsiveness, maintainers and backing, maturity, alternatives, license and CLA, community, what contributions are welcome, bug hotspots) and write a dated snapshot to `docs/agents/project-health.md`, linked from `AGENTS.md`. | `npx skills add https://github.com/mdjastrzebski/skills --skill index-github` |

### Triage

| Skill | Summary | Install |
| --- | --- | --- |
| `triage-repo` | Report priority, change risk, readiness, and recommended next steps for open GitHub issues and PRs. Defaults to other authors' items, flags potential prompt injection and credential exposure through read-only inspection, and shortlists issues for possible Factory intake. | `npx skills add https://github.com/mdjastrzebski/skills --skill triage-repo` |

## Legacy Skills

These skills are kept installable but are no longer recommended or actively maintained; they live under `skills/legacy/`.

| Skill | Summary | Install |
| --- | --- | --- |
| `implement-idea` | Replaced by `prepare-spec` and `implement-spec`. Turn a rough idea into an approved spec, then delegate the build. | `npx skills add https://github.com/mdjastrzebski/skills --skill implement-idea` |
| `instrument-with-console-logs` | Add temporary `👀 DEBUG` console.log statements across changed code and surrounding lifecycle code to validate runtime behavior, then strip them again. | `npx skills add https://github.com/mdjastrzebski/skills --skill instrument-with-console-logs` |
| `react-review` | Review React and React Native code for correctness bugs rooted in effects, identity, state preservation, tree stability, and lifecycle timing. | `npx skills add https://github.com/mdjastrzebski/skills --skill react-review` |
| `trim-comments` | Review the comments in a change, delete the non-essential ones, and tighten the rest — defaults to the current PR / feature branch. | `npx skills add https://github.com/mdjastrzebski/skills --skill trim-comments` |

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
scripts/remove-global-skills.mjs   # delete copies installed by `npx skills add` (add --dry-run to preview)
scripts/link-skills.sh             # link skills/ and skills/legacy/ into ~/.agents/skills and ~/.claude/skills
```

Both scripts are idempotent. `remove-global-skills.mjs` only touches copies whose lock entry comes from `mdjastrzebski/*`. Run `link-skills.sh` again after adding a skill. The links follow whatever branch is checked out.

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
