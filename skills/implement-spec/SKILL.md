---
name: implement-spec
description: Use when the user asks to build a spec or fix plan, or when `clarify-idea` or Factory hands off an approved spec to build. Runs the build in a subagent sized to the spec's difficulty. Interactive by default; use pipeline mode when Factory invokes the skill or the user explicitly requests a draft PR. Input that is not an approved spec goes through `clarify-idea` first.
metadata:
  version: "0.1.0"
---

# Implement Spec

Build an approved spec in a subagent of the right model and reasoning effort, verify the result, and deliver it. Do not write the code yourself and do not re-open the spec.

## Mode

- **Interactive (default):** build in the current checkout and report in chat.
- **Pipeline:** build on a new branch, publish a draft PR, and return the result to the caller. See [Pipeline delivery](#pipeline-delivery).

## 1. Check the input

Require:

- the approved full spec, and its summary when one exists
- the approval record: who approved which version, and when
- the build estimate: difficulty and the recommended model and effort, with any user override

If the input is a rough idea, lacks approval for the submitted version, or has a gap that would change behavior, scope, or acceptance checks, run `clarify-idea` on it first with the reason it needs approval. For a supplied spec, require fresh approval even if an earlier approval record exists. Continue this run with the spec, approval record, and estimate it returns. `clarify-idea` asks questions only when something is unclear. Do not resolve material gaps here. In pipeline mode, stop with reason `not_approved` instead (see [Pipeline stops](#pipeline-stops)).

If the input has no build estimate (for example a diagnosed fix plan), rate it yourself with the table in step 2 and include the rating in your result.

## 2. Pick the builder

Use the recommended model and effort. A user override wins. Without a recommendation, size the build:

| Difficulty | Signals | Pick (Claude Code example) |
| --- | --- | --- |
| Simple | one or two files, clear pattern to copy, low risk (copy change, config flag, small UI tweak, obvious bug fix) | economical model, low–medium effort — e.g. `haiku`, or `sonnet` at medium |
| Moderate | several files in one area, new but conventional logic, some tests to write | `sonnet` at medium–high effort |
| Hard | cross-cutting or architectural change, concurrency, data migrations, security-sensitive code, subtle algorithms, unfamiliar or poorly structured code | most capable model, high effort — e.g. `opus` at high |

When in doubt between two tiers, pick the higher one.

Launch the subagent with that model and effort set explicitly on the subagent call. If the harness cannot set the model or the effort, use the closest available option and record the difference. If the agent has no subagent support, implement the spec yourself following the same brief and record that no sized subagent ran. Report the model and effort that actually ran, not only the one requested.

## 3. Brief the builder

In pipeline mode, do step 1 of [Pipeline delivery](#pipeline-delivery) first, so the build happens on the new branch.

Give the subagent a self-contained brief — it does not see this conversation:

- the approved full spec, verbatim
- the relevant files, patterns, and conventions named in the spec
- how to run tests, lint, and typecheck, and the instruction to run them before finishing
- for a fix plan with a reproduction: add or copy the reproduction first, run it on the unchanged implementation, and confirm it fails for the diagnosed reason before changing code; after the fix, rerun it and confirm it passes. If it does not fail as diagnosed, stop and report instead of fixing.
- in pipeline mode, the checkout path and branch to work in
- constraints: stay within scope, do not commit or push, do not ask the user questions — make the reasonable call and report it
- what to return: files changed, a summary of the change, any deviations from the spec and why, test results, reproduction results when applicable, and steps to try the feature manually

## 4. Verify and deliver

When the subagent finishes, verify its claims briefly: look at the diff, confirm the checks and any reproduction ran with the reported results. A deviation that changes behavior, scope, or acceptance checks needs fresh approval of the spec before delivery: in interactive mode, pass the spec and the proposed change to `clarify-idea` for approval and continue with the spec it returns; in pipeline mode, stop with reason `material_deviation`. If the builder reports that the reproduction did not fail as diagnosed, stop with reason `reproduction_mismatch` in pipeline mode, or report it in interactive mode.

In interactive mode, report concisely:

- **What changed:** two to four bullets, with key files
- **Deviations:** anything that differs from the spec, or "none"
- **Builder:** difficulty, and the model and effort that ran
- **Try it yourself:** the shortest concrete steps to see the feature working — a command to run, a screen to open, input to give, what to expect
- **Checks:** tests, lint, typecheck, and any reproduction, with their result

Keep it short. Don't paste the diff or repeat the spec. Do not commit or push unless the user asked.

### Pipeline delivery

1. Resolve the target GitHub repository and base branch (the caller's target or the repository default). Create a new branch from that base in a clean checkout. Use an isolated checkout if needed to preserve existing work. Keep the builder's restriction on committing and pushing.
2. After verifying the build, stage only the approved build changes, commit them, and push the branch. If there is no build to publish, or a required check or publication step fails, return the blocker and the last completed step to the caller.
3. Open a draft PR against the chosen base using authenticated `gh pr create --draft --base <base> --head <branch> --title <title> --body-file <file>` or the equivalent GitHub MCP operation. Put the approved spec summary first, then the complete approved spec inside `<details>` with a `<summary>Full spec</summary>` and blank lines around the spec. Add any links the caller supplies, such as a diagnosed issue, as the caller directs. Keep local scratch paths out of the PR. Verify the draft PR and its refs. Before retrying PR creation, look up an existing PR for the same head and base.
4. Return the PR number and URL, repository, base and head branches, build commit, checkout path, approved spec summary and full spec, difficulty, the model and effort that ran, deviations, checks, reproduction results when applicable, and steps to try the build. For direct pipeline requests, return the same result to the user.

### Pipeline stops

When the build cannot be delivered without fresh approval, publish nothing and return to the caller:

- the reason: `not_approved` (input is not an approved spec or has a material gap), `material_deviation` (the build needs a change to behavior, scope, or acceptance checks), or `reproduction_mismatch` (the reproduction did not fail as diagnosed on the build base)
- the evidence: the gap, the proposed spec change and why, or the reproduction command, base SHA, and observed result
- the checkout path, branch, and any uncommitted build changes kept there, and the last completed step

The caller gets fresh approval and reruns this skill with the updated spec.
