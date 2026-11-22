---
name: prepare-spec
description: Use when the user wants a rough idea turned into an approved spec, says "grill me on this", "spec this out", "implement this idea", or "build this idea", asks to revise a saved spec ("revise #123", "change the spec", "update SPEC.md"), or Factory sends an idea or a supplied spec for approval. Interactive by default; use pipeline mode when Factory invokes the skill or the user explicitly requests it. Does not write code.
metadata:
  version: "0.2.0"
---

# Prepare Spec

Turn a rough idea into an approved spec, or validate a supplied spec and get it approved. Estimate how hard the build is and recommend the builder's model and reasoning effort. Do not write code. The build belongs to `implement-spec`.

## Intake and store

Work interactively by default. In pipeline mode, resolve routine implementation questions as stated assumptions and return the result to the caller. For an idea or supplied text, follow phases 1–5. For a saved spec, load its issue body or working-tree-root `SPEC.md`, run `node SKILL_DIR/scripts/spec-record.mjs check FILE` on those bytes, and keep its store. For an issue, fetch the body itself into a scratch file (without JSON quoting or CLI display formatting). Use the directory containing this SKILL.md for `SKILL_DIR`. Only this skill writes the store.

- **Create in cloud** (an ephemeral container, e.g. `CLAUDE_CODE_REMOTE=true` or a Codex cloud task): use a GitHub issue in the target repository, titled `Spec: <title>`, without a label. Create it only after approval. If issue creation or editing is unavailable, report the missing access, print the approved summary and full spec in chat, and stop. Do not fall back to a local file.
- **Create locally:** ask once with the approval summary whether to save to `SPEC.md` (recommended) or to a GitHub issue. If the session type is unclear, ask. Retain an explicit store choice.
- **Revise:** remember the loaded revision N. Ground and discuss only the requested change, one question at a time over as many turns as needed. Present only the changed summary parts against the loaded spec. Keep the current approved document until the user approves the change, except when they request a local draft. Save to the same file or issue at N+1 in phase 5. For a recordless draft, use the revision remembered from this conversation, else the built revision in the linked PR description (issue closing references or `Closes #N`, or current branch head for a file). Increment that revision, or start at 1 if there is none.

### Local file and requested drafts

Use one `SPEC.md` at the root of this working tree. Before the first write, ask before overwriting a tracked file or a file without a top record that you did not write as a draft in this conversation. Keep it out of commits. Unless already ignored, add `/SPEC.md` to `info/exclude` under `git rev-parse --path-format=absolute --git-common-dir` so all worktrees ignore it. An exclude rule does not untrack an existing file.

Only on local request, write the draft as plain Markdown to `SPEC.md` without approval metadata. When drafting over an approved revision, retain N in conversation and remove the record from the file. Re-read user edits before approval, fold them into the summary and show the changes. A draft is unapproved.

### Validate a saved spec for a build

1. For a file with a nonempty `branch` different from the current branch, ask whether to switch or continue here. Resolve that choice first. An empty branch skips the guard.
2. A missing or incomplete approval record requires supplied-spec validation and summary approval. For a recorded hash mismatch, explain that the text changed after revision N, validate the current document as a supplied spec, show its current summary, and ask to approve revision N+1. Do not equate a matching hash alone with approval.
3. For an approved, hash-matching record, identify the files the spec touches from its scope and the code. Compare the recorded grounding commit to the current build base with `git diff --name-only <base_sha> <current> -- <files>`. If unchanged, return the stored approval immediately. If any changed, or the recorded commit cannot be resolved after fetching, recheck the spec against the current code. Without a material gap, return the same revision and report the revalidation commit. For a material gap, ask only about it, then approve and save the resulting revision N+1. An explicit request to revise or reopen approval still follows the revision flow.

## 1. Ground yourself first

Before the first question, read enough of the codebase to avoid asking what the code already answers: where the change would live, existing patterns it should follow, how tests and the dev loop work (`AGENTS.md`, `CLAUDE.md`, `README`, package scripts). Never ask the user something you can look up.

Then decide whether the idea is clear: list the open decisions that would change behavior, scope, or acceptance checks and that the code does not settle. If there are none, skip phase 2 and go to phase 3, recording the routine choices as assumptions. The summary and approval in phase 4 still apply. Otherwise grill in phase 2, whether the user asked only for a spec or also for the build.

### Validate a supplied spec

Ground the spec in the target codebase. Check that the goal, scope, expected behavior, applicable constraints and edge cases, and observable acceptance criteria give the builder and reviewer enough to work from. Look for conflicts with the codebase or within the spec. Use project conventions for routine implementation choices and record any assumptions that matter to the build.

Write the full spec (phase 3) from the supplied spec and those assumptions, and show its summary before asking any question. If a missing or conflicting decision could change the behavior, scope, or acceptance checks, ask about it using phase 2. Recheck the spec after each answer, update both versions, and re-present only the changed parts of the summary. Skip questioning when the spec has no such gaps. Then continue at phase 4.

## 2. Grill, one question at a time

Interview the user like a sharp senior engineer stress-testing the idea. Ask only about the open decisions from phase 1 and those they lead to.

- **One question per message.** Wait for the answer before asking the next. Never batch.
- **Most important first.** Order by how much the answer changes the build: goal and success criteria → scope (what's in, what's explicitly out) → user-facing behavior → data and interfaces → edge cases and errors → non-functional (performance, security, compatibility) → polish.
- **Make every question cheap to answer.** Offer 2–4 concrete options and mark your recommendation, e.g. "Should failed syncs retry? (a) no, surface the error (b) 3 retries with backoff — recommended, matches `fetchWithRetry` (c) retry forever in background". Use a structured question tool if the agent has one.
- **Adapt.** Let each answer reshape the remaining questions. Skip anything an earlier answer already settled. Push back when an answer conflicts with an earlier one or with the codebase.
- **For an initial idea, cap the interview at 20 questions.** Stop earlier once the remaining unknowns would not change the design. Most ideas need 3–10.
- **Decide the rest yourself.** For every detail not asked, pick the most reasonable option given the codebase and the answers so far, and record it as an assumption.
- If the user says "you decide" or "just build it", stop asking and move to phase 3.

## 3. Write the spec and size the build

Write two versions of the spec:

- **Full spec** — the detailed version a builder works from without seeing this conversation. Draft it in memory or scratch space outside the repo, except for a requested local draft. It contains:
  - goal, scope in and out, and every decision and assumption with its reasoning
  - concrete behavior per case: inputs, outputs, states, error and empty cases, edge cases raised in the interview
  - interfaces and data shapes: function signatures, props, API contracts, schema or config changes
  - the planned approach: where each piece lives, which existing code to reuse or extend, what to leave untouched
  - acceptance criteria as testable checks, and which tests to add
  - the relevant files, patterns, and conventions from phase 1, and how to run tests, lint, and typecheck
  - the build estimate below
- **Summary** — the concise version the user reads, short enough to take in under a minute. It is a view of the full spec, never a separate document: the two must not disagree.

**Estimate the build.** Rate the difficulty from the spec and the code you read, and recommend the builder's model and reasoning effort:

| Difficulty | Signals | Recommend (Claude Code example) |
| --- | --- | --- |
| Simple | one or two files, clear pattern to copy, low risk (copy change, config flag, small UI tweak, obvious bug fix) | economical model, low–medium effort — e.g. `haiku`, or `sonnet` at medium |
| Moderate | several files in one area, new but conventional logic, some tests to write | `sonnet` at medium–high effort |
| Hard | cross-cutting or architectural change, concurrency, data migrations, security-sensitive code, subtle algorithms, unfamiliar or poorly structured code | most capable model, high effort — e.g. `opus` at high |

When in doubt between two tiers, pick the higher one. Name the signals that drove the rating. Use the model names the current harness accepts.

## 4. Present the spec for approval

Show the summary, give the user an easy way to see the full version, and stop until the user approves:

```markdown
## Spec: <title>

**Goal:** <one or two sentences — what changes and why>

**Scope**
- In: …
- Out: …

**Behavior**
- <concrete, testable statements of what the result does>

**Key decisions** (from your answers)
- <decision> — <short reason>

**Assumptions** (decided by me — correct any)
- <assumption> — <short reason>

**Acceptance criteria**
- <how we'll know it works>

**Build estimate:** <simple | moderate | hard> — <main signals> → <recommended model> at <effort> effort

Say "show full spec" to read the draft in chat.
```

Highlight the key decisions and assumptions. Approve, edit, or reject — do not proceed until the user says go. The user may override the build estimate or the recommended model and effort; record the override in both versions. If the user asks to see the full spec, print it in full. If they correct something, update both versions and re-present only the changed parts of the summary.

## 5. Save, verify, and return

After explicit summary approval, expand the full spec with implementation detail. If any new choice affects behavior, scope, or acceptance, show the changed summary line and obtain approval again before saving. Include no secrets or scratch paths. Assemble the document in scratch space:

```markdown
# Spec: <title>

## Summary

<approved summary>

<details>
<summary>Full spec</summary>

<full spec>

</details>
```

The details wrapper is optional in a local file. Use the Node 18+ helper to write the approval record. Never write or calculate the hash by hand.

```sh
node SKILL_DIR/scripts/spec-record.mjs stamp FILE --revision N --approved-by WHO \
  --approved-at ISO8601Z --base-sha SHA [--branch NAME]
node SKILL_DIR/scripts/spec-record.mjs check FILE
```

Stamp revision 1 for a new spec, or the revision determined at intake. Give who/how the summary was approved, the UTC approval time, and the commit used to ground it. For a local file pass the current feature branch, or `--branch ''` on the default branch. Omit the option for issues. The helper prepends a hidden `spec-record` comment with `status: approved`, revision, approver, timestamp, base SHA, optional branch, and a SHA-256 of the normalized document body.

Save the stamped document to the chosen file, or use `gh issue create --title "Spec: <title>" --body-file FILE` / `gh issue edit N --body-file FILE` (or equivalent GitHub MCP). Before replacing a previously loaded document, check for concurrent edits and reconcile changed scope with the user. Read the stored text back and run `check`; require the expected revision, approved status and `hash_matches: true`. If GitHub changed the formatting and the hash differs, stamp the fetched body with the same approval fields, update once, and recheck. Material text changes need approval. Report a verification failure before any build.

- **Pipeline or another skill:** return full spec, summary, store location (issue URL or file path), revision, approval record, difficulty, recommended model and effort, any override, and assumptions. Include the revalidation commit when applicable.
- **Interactive:** report the saved location and the fresh-session command `$factory <issue URL>` or `$factory SPEC.md`. If the user asked to build now, hand off to Factory with the saved spec, or to `implement-spec` for an explicitly requested build without review.
