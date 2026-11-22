---
name: implement-spec
description: Use when the user asks to build a spec or fix plan, or when `prepare-spec` or Factory hands off an approved spec to build. Runs the build in a subagent sized to the spec's difficulty. Interactive by default; use pipeline mode when Factory invokes the skill or the user explicitly requests a draft PR. Input that is not an approved spec goes through `prepare-spec` first.
metadata:
  version: "0.3.0"
---

# Implement Spec

Build an approved spec in a subagent of the right model and reasoning effort, verify the result, and deliver it. Do not write the code yourself and do not re-open the spec.

## Mode

- **Interactive (default):** build in the current checkout and report in chat.
- **Pipeline:** build on the supplied branch (or create one), publish to the supplied PR or open a draft, and return the new commits. See [Pipeline delivery](#pipeline-delivery).

## 1. Check the input

Require:

- the approved full spec, and its summary when one exists
- the approval record: who approved which version, and when
- the build estimate: difficulty and the recommended model and effort, with any user override

For a saved-spec locator (a `SPEC.md` path or spec issue), first have `prepare-spec` validate the stored text, branch, hash, and grounding commit. A file without a record, or a `Spec:` issue without one, needs approval. Use the validated revision it returns. When Factory instead passes the pinned spec text and its validated record, build from that handoff without reopening the store. A diagnosed fix plan with the caller's diagnosis approval keeps its existing path.

For other input that lacks approval for this version or has a material gap, use `prepare-spec` interactively with the reason it needs approval. In pipeline mode return `not_approved` to the caller (see [Pipeline stops](#pipeline-stops)). Reuse exact approval when it covers the input.

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

In pipeline mode, do step 1 of [Pipeline delivery](#pipeline-delivery) first, so the build happens on the target branch.

Give the subagent a self-contained brief — it does not see this conversation:

- the approved full spec, verbatim
- the relevant files, patterns, and conventions named in the spec
- how to run tests, lint, and typecheck, and the instruction to run them before finishing
- for a fix plan with a reproduction: add or copy the reproduction first, run it on the unchanged implementation, and confirm it fails for the diagnosed reason before changing code; after the fix, rerun it and confirm it passes. If it does not fail as diagnosed, stop and report instead of fixing.
- in pipeline mode, the checkout path and branch to work in; for Adjust, the existing PR, starting head, and difference between the built spec and the pinned full spec. Implement only that difference. Never stage or commit the working-tree-root `SPEC.md`.
- constraints: stay within scope, do not commit or push, do not ask the user questions — make the reasonable call and report it
- what to return: files changed, a summary of the change, any deviations from the spec and why, test results, reproduction results when applicable, and steps to try the feature manually

## 4. Verify and deliver

When the subagent finishes, verify its claims briefly: look at the diff, confirm the checks and any reproduction ran with the reported results. A deviation that changes behavior, scope, or acceptance checks needs fresh approval of the spec before delivery: in interactive mode, pass the spec and the proposed change to `prepare-spec` for approval and continue with the spec it returns; in pipeline mode, stop with reason `material_deviation`. If the builder reports that the reproduction did not fail as diagnosed, stop with reason `reproduction_mismatch` in pipeline mode, or report it in interactive mode.

In interactive mode, report concisely:

- **What changed:** two to four bullets, with key files
- **Deviations:** anything that differs from the spec, or "none"
- **Builder:** difficulty, and the model and effort that ran
- **Try it yourself:** the shortest concrete steps to see the feature working — a command to run, a screen to open, input to give, what to expect
- **Checks:** tests, lint, typecheck, and any reproduction, with their result

Keep it short. Don't paste the diff or repeat the spec. Do not commit or push unless the user asked.

### Pipeline delivery

1. Resolve the repository, base, and target branch. For an existing PR use its actual head repository, branch and exact head SHA. For a supplied feature branch with no PR, use that branch. Preserve existing edits and local commits, using an isolated checkout when needed. If no branch was supplied, create a clean feature branch from the requested base or repo default. Record the starting commit before launching the builder.
2. Verify the build. Stage only its approved changes, check the staged diff, commit and push to the resolved target branch. Never stage or commit the working-tree-root `SPEC.md`, including if already tracked. If an existing PR already implements the entire requested difference, verify the acceptance checks and return its unchanged head and an empty list of new commits. Otherwise return the blocker and last completed step if no build can be published or a required check or publication fails.
3. For a supplied PR verify its head contains the pushed commits and return it to Factory for review and description updates. Otherwise look for an existing PR for that head and base before creating or retrying. Open a draft with `gh pr create --draft --base <base> --head <branch> --title <title> --body-file <file>` or equivalent. For a saved spec, add a heading `## Spec rev N` followed by the pinned document body (title, summary, then full spec), omitting the hidden record. Preserve the text so Factory can compare it later. Use a collapsed full-spec section for issue specs and preserve the local document's wrapper choice for file specs. Add a standalone `Closes #N` for a spec issue. For directly supplied approved text, including a diagnosed fix plan, put the summary first when available, then the complete spec or plan inside `<details>` with `<summary>Full spec</summary>` and blank lines around the text. Add caller-supplied links as directed. For diagnosed fix plans, link the bug issue without a closing keyword. Keep scratch paths out of the PR and verify the draft and refs.
4. Return the PR number and URL, repository, base and head branches, starting head and new commit SHAs, checkout path, approved spec summary and full spec, revision when applicable, difficulty, the model and effort that ran, deviations, checks, reproduction results when applicable, and steps to try the build. For direct pipeline requests, return the same result to the user.

### Pipeline stops

When the build cannot be delivered without fresh approval, publish nothing and return to the caller:

- the reason: `not_approved` (input is not an approved spec or has a material gap), `material_deviation` (the build needs a change to behavior, scope, or acceptance checks), or `reproduction_mismatch` (the reproduction did not fail as diagnosed on the build base)
- the evidence: the gap, the proposed spec change and why, or the reproduction command, base SHA, and observed result
- the checkout path, branch, and any uncommitted build changes kept there, and the last completed step

The caller gets fresh approval and reruns this skill with the updated spec.
