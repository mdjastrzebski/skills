---
name: implement-spec
description: Use when the user asks to build a spec or fix plan, or when `prepare-spec` or a calling workflow hands off an approved spec to build. Runs the build in a subagent sized to the spec's difficulty. Interactive by default; use headless mode when a calling workflow invokes the skill or the user explicitly requests a draft PR, including to find or adjust the PR already built from a saved spec. Input that is not an approved spec goes through `prepare-spec` first.
metadata:
  version: "0.5.0"
---

# Implement Spec

Build an approved spec in a subagent of the right model and reasoning effort, verify the result, and deliver it. Do not write the code yourself and do not re-open the spec.

## Mode

- **Interactive (default):** build in the current checkout and report in chat.
- **Headless:** build on the supplied branch (or create one), publish to the supplied PR or open a draft, and return the new commits. See [Headless delivery](#headless-delivery). For a saved spec, a caller first runs [Locate an existing build](#locate-an-existing-build), and later [Update the build record](#update-the-build-record) when the PR should claim the pinned revision. Neither asks the user anything; each returns its result or stop to the caller.

### Spec records

`prepare-spec` owns the spec and build-record formats. This skill only consumes its documented commands and their JSON output: `check FILE` (the document's `spec_sha256` and record) and `built FILE` (a PR description's `spec-built` block: `{"status":"ok","built":{revision, spec_sha256, …}}` or `{"status":"escalate","reason":…}`). Run them as `node PREPARE_SPEC_DIR/scripts/spec-record.mjs <command> FILE`, where `PREPARE_SPEC_DIR` is the loaded `prepare-spec` skill's directory, on files written by the shell without printing them. Never compute or retype a spec hash.

## 1. Check the input

Require:

- the approved full spec and its available summary. For a saved spec, take the pinned set from `prepare-spec` (`full-spec.md`, `document.md`, `record.json`, and `summary.md` when available). Check the `full-spec.md` hash against `record.json` (for example with `sha256sum`) before briefing; a mismatch is `not_approved`. The legacy set keeps the entire approved document in `full-spec.md`. Accept a directly approved spec or plan as text or by scratch path. Read the files only where the steps below need their contents.
- the approval record: who approved which version, and when
- the build estimate: difficulty and the recommended model and effort, with any user override. Use `meta.difficulty`, `meta.builder_model`/`meta.builder_effort` and `meta.override` when available. For a legacy pin, take the estimate and any override from the caller's explicit return.

For a saved-spec locator (a `SPEC.md` path or spec issue), first have `prepare-spec` validate the stored text, branch, hash, and grounding commit. A file without a record, or a `Spec:` issue without one, needs approval. Use the validated revision it returns. When a caller passes the pinned files and validated record, build from that handoff without reopening the store. For a diagnosed fix plan, use the caller's diagnosis approval.

For other input that lacks approval for this version or has a material gap, use `prepare-spec` interactively with the reason it needs approval. In headless mode return `not_approved` to the caller (see [Headless stops](#headless-stops)). Reuse exact approval when it covers the input.

If the input has no build estimate (for example a diagnosed fix plan), rate it yourself with the table in step 2 and include the rating in your result.

## 2. Pick the builder

Use the recommended model and effort. A user override wins. A recommendation outside the policy below is adjusted unless the user explicitly asked for it, including an override the user approved and recorded in the spec being built, which counts as explicit for this run. Cap a pick above the policy at strong at high effort. Move a light pick for a build beyond a trivial mechanical edit up to standard at the table's effort for the build's difficulty. Record the change in both cases. Without a recommendation, size the build:

| Difficulty | Signals | Pick (Claude Code example) |
| --- | --- | --- |
| Simple | one or two files, clear pattern to copy, low risk (copy change, config flag, small UI tweak, obvious bug fix) | standard tier, low–medium effort — e.g. `sonnet` at low or medium; light tier (`haiku` at medium) only for a purely mechanical edit with an exact pattern to copy and a check that proves it |
| Moderate | several files in one area, new but conventional logic, some tests to write | standard tier at high effort, or strong tier at medium — e.g. `sonnet` at high |
| Hard | cross-cutting or architectural change, concurrency, data migrations, security-sensitive code, subtle algorithms, unfamiliar or poorly structured code | strong tier, high effort — e.g. `opus` at high |

When in doubt between two tiers, pick the higher one.

Pick from three tiers, at the latest version the harness offers: **light** (Haiku level: Claude `haiku`, GPT `luna`), **standard** (Sonnet level: Claude `sonnet`, GPT `terra`), and **strong** (Opus level: Claude `opus`, GPT `sol`). Use light only for narrow, mechanical tasks whose output is easy to check, especially many small ones in parallel: locating files or call sites, collecting or summarizing data, describing a mechanical block of a diff, or a trivial edit with an exact pattern to copy. Never use light for specs, builds beyond trivial edits, reviews, judging findings, or security-sensitive work. Default to standard. Use low, medium, or high effort only; never `xhigh` or `max`. When a tier at high effort is not enough, move up a tier (`sonnet` → `opus`) instead of raising the effort. Strong at high effort is the ceiling. Use frontier models (Claude `fable`, GPT `astra`) or `xhigh` and higher effort only when the user explicitly asks for them in this run.

Launch the subagent with that model and effort set explicitly on the subagent call. Never let the builder inherit the session's model or effort. If the harness cannot set the model or the effort, use the closest option within the policy and record the difference. If the agent has no subagent support, implement the spec yourself following the same brief and record that no sized subagent ran. Report the model and effort that actually ran, not only the one requested.

## 3. Brief the builder

In headless mode, do step 1 of [Headless delivery](#headless-delivery) first, so the build happens on the target branch.

Give the subagent a self-contained brief — it does not see this conversation:

- the approved full spec: when supplied by path, give the path and any recorded file hash with "Read this file in full before starting; it is the approved full spec". When supplied as text, give it verbatim.
- the relevant files, patterns, and conventions named in the spec
- how to run tests, lint, and typecheck, and the instruction to run them before finishing
- for a fix plan with a reproduction: add or copy the reproduction first, run it on the unchanged implementation, and confirm it fails for the diagnosed reason before changing code; after the fix, rerun it and confirm it passes. If it does not fail as diagnosed, stop and report instead of fixing.
- in headless mode, the checkout path and branch to work in; for Adjust, the existing PR, starting head, and difference between the built spec and the pinned full spec (see [Adjust](#adjust)). Implement only that difference. Never stage or commit the working-tree-root `SPEC.md`.
- constraints: stay within scope, do not commit or push, do not ask the user questions — make the reasonable call and report it
- what to return: files changed, a summary of the change, any deviations from the spec and why, test results, reproduction results when applicable, and steps to try the feature manually

## 4. Verify and deliver

When the subagent finishes, verify its claims briefly: look at the diff, confirm the checks and any reproduction ran with the reported results. A deviation that changes behavior, scope, or acceptance checks needs fresh approval of the spec before delivery: in interactive mode, pass the spec and the proposed change to `prepare-spec` for approval and continue with the spec it returns; in headless mode, stop with reason `material_deviation`. If the builder reports that the reproduction did not fail as diagnosed, stop with reason `reproduction_mismatch` in headless mode, or report it in interactive mode.

In interactive mode, report concisely:

- **What changed:** two to four bullets, with key files
- **Deviations:** anything that differs from the spec, or "none"
- **Builder:** difficulty, and the model and effort that ran
- **Try it yourself:** the shortest concrete steps to see the feature working — a command to run, a screen to open, input to give, what to expect
- **Checks:** tests, lint, typecheck, and any reproduction, with their result

Keep it short. Don't paste the diff or repeat the spec. Do not commit or push unless the user asked.

### Headless delivery

1. Resolve the repository, base, and target branch. For an existing PR use its actual head repository, branch and exact head SHA. For a supplied feature branch with no PR, use that branch. Preserve existing edits and local commits, using an isolated checkout when needed. If no branch was supplied, create a clean feature branch from the requested base or repo default. Record the starting commit before launching the builder.
2. Verify the build. Stage only its approved changes, check the staged diff, commit and push to the resolved target branch. Never stage or commit the working-tree-root `SPEC.md`, including if already tracked. If an existing PR already implements the entire requested difference, verify the acceptance checks and return its unchanged head and an empty list of new commits. Otherwise return the blocker and last completed step if no build can be published or a required check or publication fails.
3. For a supplied PR verify its head contains the pushed commits and return it to the caller for review and description updates. Otherwise look for an existing PR for that head and base before creating or retrying. Open a draft with `gh pr create --draft --base <base> --head <branch> --title <title> --body-file <file>` or equivalent. For a saved spec, use the [saved-spec layout](#saved-spec-pr-description), including for a legacy pin. For a directly approved spec or plan, put the summary first when available, then the complete spec or plan inside `<details>` with `<summary>Full spec</summary>` and blank lines around the text. Use the approved file contents verbatim when supplied by path. Add caller-supplied links as directed. For diagnosed fix plans, link the bug issue without a closing keyword. Keep scratch paths out of the PR and verify the draft and refs.
4. Return the PR number and URL, repository, base and head branches, starting head and new commit SHAs, checkout path, the approved spec and summary paths when supplied (or their text when given as text), revision when applicable, difficulty, the model and effort that ran, deviations, checks, reproduction results when applicable, and steps to try the build. For Adjust, also return the spec difference used, or `adjust without spec diff: <reason>`. For direct headless requests, return the same result to the user.

### Adjust

Adjust builds only what changed between the revision an open PR was built from and the pinned revision, on that PR's head branch. Use the built document that [Locate an existing build](#locate-an-existing-build) returned: diff it against the pinned `document.md` to identify exactly what changed, and brief the builder with that difference. If the built document could not be found or did not match, give the builder the pinned full spec and the PR's code with the instruction to implement what the code does not yet satisfy, and return `adjust without spec diff: <reason>`. Verify the returned commits are on the selected PR. Leave the PR description, including the prior `spec-built` block or legacy spec section and unrelated content, unchanged until the caller runs [Update the build record](#update-the-build-record).

### Saved-spec PR description

The spec issue is the spec's home, so the PR does not repeat it. Write, in this order:

````markdown
## Summary

- <what changed, two to five bullets with key files>

**Try it:** <shortest steps>

**Checks:**

- <one check and its result per bullet: tests, lint, typecheck, reproduction>
- Not run: <skipped checks, when any>

Closes #42

```spec-built
issue: #42
revision: 2
spec_sha256: <spec_sha256 from record.json>
```
````

- Take the summary from the builder's return and the issue number or feature branch from the verified target. Fill the `spec-built` revision and hash from `record.json` with the shell, never by retyping the hash.
- For a local `SPEC.md`, omit `Closes #N`, write `source: SPEC.md` and `branch: <name>` in place of `issue:`, and after the block append `<details>`, `<summary>Spec</summary>`, a blank line, the exact `document.md` (`cat` it), a blank line, and `</details>`. The file is never committed, so the PR holds its only copy on GitHub.
- Never add a `## Spec rev N` heading.
- Before opening the draft, run `prepare-spec`'s `built` command on the body file and require `ok` with the pinned revision and hash (see [Spec records](#spec-records)).

### Headless stops

When the build cannot be delivered without fresh approval, publish nothing and return to the caller:

- the reason: `not_approved` (input is not an approved spec or has a material gap), `material_deviation` (the build needs a change to behavior, scope, or acceptance checks), or `reproduction_mismatch` (the reproduction did not fail as diagnosed on the build base)
- the evidence: the gap, the proposed spec change and why, or the reproduction command, base SHA, and observed result
- the checkout path, branch, and any uncommitted build changes kept there, and the last completed step

The caller gets fresh approval and reruns this skill with the updated spec.

## Locate an existing build

Before a saved spec is built, find whether a PR already carries it. Inputs: the pinned set, the store (spec issue, or `SPEC.md` and its feature branch; on resume, the branch the caller recorded), and the target repository. Read GitHub only, write nothing, and return one decision with its evidence: `build`, `adjust`, `noop`, or `ask` with the options to put to the user.

**Find the candidates.**

- **Spec issue:** inspect `gh issue view N --json closedByPullRequestsReferences` or equivalent. Check the state and body of linked PRs. If the repository can target non-default bases or the closing-reference lookup is unavailable, search the repository's open PR descriptions for a standalone `Closes #N`. Non-default bases may lack closing references even when a default-branch PR is linked. Combine both sources and deduplicate by PR URL before counting open matches. Check the actual issue number and repository to avoid substring or cross-repo matches. Include closed and merged references or body matches when no open PR exists. If the installed `gh issue view` lacks the field, use the paginated GraphQL connection:

  ```sh
  gh api graphql --paginate -f owner="$owner" -f repo="$repo" -F number="$number" -f query='
    query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          closedByPullRequestsReferences(first: 100, after: $endCursor, includeClosedPrs: true) {
            nodes { number url state }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }'
  ```

  Verify every candidate by fetching its PR. When a connector exposes only PR search, search descriptions across all states for the exact closing line. A failed or incomplete lookup does not establish that no PR exists: return `ask` with the gap rather than `build`.
- **Local file:** list all PR states for the feature branch with `gh pr list --head <branch> --state all` or equivalent. Match the head repository as well.

**Compare each candidate.** Write its description to a scratch file with the shell (`gh pr view N --json body --jq .body > FILE`), without printing it, and run `built` on it. Compare its `revision` and `spec_sha256` with the pinned record: the same hash is the pinned revision with matching text, a lower revision is an older revision, and the same revision with a different hash is different text. On `legacy_section`, the PR predates `spec-built`: extract its `Spec rev N` section and document body to scratch, excluding the closing line and any marked block another tool appended (such as a collapsed diagnostics panel or a legacy Evidence trail), and compare the `spec_sha256` from `check`. Any other escalation counts as a missing or unreadable spec.

| Matching PRs | Decision |
| --- | --- |
| No PR | `build` |
| Several open PRs | `ask`: which PR to use. Rerun the comparison on the chosen PR. |
| One open PR built from an older revision | `adjust` |
| One open PR with the pinned revision and matching text | `noop`: the PR and revision |
| Closed or merged PRs only | `ask`: start a new PR or stop. For a merged spec issue, usually start a new spec issue linking the old one. |
| Open PR with missing/unreadable spec, a newer revision, or different text at the same revision | `ask`: show the discrepancy, and which spec or PR to use before publishing |

**For `adjust`, find the built document.** For an issue spec, use the issue comment whose first line is `Revision <built revision> — superseded…`, with the body inside its `<details>` extracted to scratch by the shell. For a local spec, use the collapsed `Spec` document in the PR description. For a legacy PR, use its `Spec rev N` section. Run `check` on it and require the `spec_sha256` from the build record. Otherwise record why it cannot be used. Also save to scratch the exact spans [Update the build record](#update-the-build-record) will replace: the `spec-built` block and a local spec's collapsed document, or a legacy PR's `## Spec rev N` heading and its exact old spec body.

Return the decision, every candidate's URL, state and build record or escalation reason, the lookup sources and any gaps, and for `adjust` the selected PR, its head repository, branch and head SHA, the built document path or the reason it is missing, and the saved span paths.

## Update the build record

Run this when the PR should claim the pinned revision. For Adjust, the caller runs it after its own review of the new commits, and at the start of Adjust for the closing line only. Inputs: the PR description saved to scratch, the pinned set, the store, and the span paths saved by Locate. Prepare each edit as a file pair, the exact old span and its replacement, and return them with the evidence identifying each old span:

- the new `spec-built` block with the pinned revision and hash, filled from `record.json` by the shell
- for a local spec, the collapsed `<details><summary>Spec</summary>` document from `document.md`
- for a legacy PR, the [saved-spec layout](#saved-spec-pr-description) in place of its `## Spec rev N` section. A legacy spec section is a verbatim document that can contain headings equal to or higher than its own heading, so take the span from that heading through the exact saved old spec body, never by heading level.
- for an issue spec, a standalone `Closes #N` line when it is missing

Whoever may edit the PR description applies the edits: re-read the current description, confirm each old span matches exactly once, apply only those replacements, and run `built` on the result, requiring `ok` with the pinned revision and hash. Preserve `Closes #N`, unrelated content and blocks other tools maintain, such as a marked diagnostics panel. If the description already matches on resume, verify it and continue.
