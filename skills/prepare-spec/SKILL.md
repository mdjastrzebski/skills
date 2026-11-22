---
name: prepare-spec
description: Use when the user wants a rough idea turned into an approved spec, says "grill me on this", "spec this out", "implement this idea", or "build this idea", asks to revise a saved spec ("revise #123", "change the spec", "update SPEC.md"), or Factory sends an idea or a supplied spec for approval. Interactive by default; use headless mode when Factory invokes the skill or the user explicitly requests it. Does not write code.
metadata:
  version: "0.5.0"
---

# Prepare Spec

Turn a rough idea into an approved spec, or validate a supplied spec and get it approved. Estimate how hard the build is and recommend the builder's model and reasoning effort. Do not write code. The build belongs to `implement-spec`.

## Intake and store

Work interactively by default. In headless mode, resolve routine implementation questions as stated assumptions and return the result to the caller. For an idea or supplied text, follow phases 1–5. For a saved spec, load its issue body or working-tree-root `SPEC.md`, run `node SKILL_DIR/scripts/spec-record.mjs check FILE` on those bytes, and keep its store. For an issue, fetch the body itself into a scratch file with the shell, for example `gh issue view N --repo OWNER/REPO --json body --jq .body > FILE`, without JSON quoting or CLI display formatting and without printing it. Without `gh`, launch a light-tier worker at medium effort that launches no agents, fetches the body with the available GitHub tool, writes it byte for byte to the given path, and returns only the path. When a caller needs pinned files, run `pin` (see [Pin a saved spec](#pin-a-saved-spec)) instead of `check`. Use the directory containing this SKILL.md for `SKILL_DIR`. Only this skill writes the store.

- **Create in cloud** (an ephemeral container, e.g. `CLAUDE_CODE_REMOTE=true` or a Codex cloud task): use a GitHub issue in the target repository, titled `Spec: <title>`, without a label. Create it only after approval. If issue creation or editing is unavailable, report the missing access, print the approved summary and full spec in chat, and stop. Do not fall back to a local file.
- **Create locally:** ask once with the approval summary whether to save to `SPEC.md` (recommended) or to a GitHub issue. If the session type is unclear, ask. Retain an explicit store choice.
- **Revise:** remember the loaded revision N. Ground and discuss only the requested change, one question at a time over as many turns as needed. Present only the changed summary parts against the loaded spec. Keep the current approved document until the user approves the change, except when they request a local draft. Save to the same file or issue at N+1 in phase 5. For a recordless draft, use the revision remembered from this conversation, else the `revision` in the `spec-built` block of the linked PR description (issue closing references or `Closes #N`, or current branch head for a file; [`built`](#spec-record-interface) reads it, and a legacy PR has a `## Spec rev N` heading instead). Increment that revision, or start at 1 if there is none.

### Local file and requested drafts

Use one `SPEC.md` at the root of this working tree. Before the first write, ask before overwriting a tracked file or a file without a top record that you did not write as a draft in this conversation. Keep it out of commits. Unless already ignored, add `/SPEC.md` to `info/exclude` under `git rev-parse --path-format=absolute --git-common-dir` so all worktrees ignore it. An exclude rule does not untrack an existing file.

Only on local request, write the draft as plain Markdown to `SPEC.md` without approval metadata. When drafting over an approved revision, retain N in conversation and remove the record from the file. Re-read user edits before approval, fold them into the summary and show the changes. A draft is unapproved.

### Validate a saved spec for a build

1. For a file with a nonempty `branch` different from the current branch, ask whether to switch or continue here. Resolve that choice first. An empty branch skips the guard.
2. A missing or incomplete approval record requires supplied-spec validation and summary approval. For a recorded hash mismatch, explain that the text changed after revision N, validate the current document as a supplied spec, show its current summary, and ask to approve revision N+1. Do not equate a matching hash alone with approval.
3. For an approved, hash-matching record, run `pin`. When it returns `ok`, use `meta.scope` as the files the spec touches, without reading the spec text: run `git diff --name-only <base_sha> <current> -- <scope…>` and confirm with `git ls-tree -r --name-only <current> -- <path>` that every scope path, or for a path that does not exist yet its nearest existing parent directory, exists at the current base. If the diff is empty and every path resolves, return the stored approval and pinned files immediately. Otherwise launch a standard-tier worker at medium effort that launches no agents, with the `full-spec.md` path and that diff, to return either `no material gap` or each gap with the summary line it affects (in inline mode, do this check directly). If `pin` escalates on document format or metadata, identify the files from the spec's text and the code and run the same `git diff`. If any files changed, or the recorded commit cannot be resolved after fetching, recheck the spec against the current code. For a material gap, ask only about it, then approve and save the resulting revision N+1. Otherwise pin the same approved revision with `--format legacy`, return its files with the original escalation reason, and report the revalidation commit when applicable. An explicit request to revise or reopen approval still follows the revision flow.

### Pin a saved spec

```sh
node SKILL_DIR/scripts/spec-record.mjs pin FILE --out DIR
```

`pin` runs on the fetched bytes and writes nothing unless it can verify all of them: an approved record whose hash matches, a `# Spec:` title, one `## Summary` containing exactly one `spec-meta` block, and one full spec (a `<details>` block with `<summary>Full spec</summary>` that closes the document, or a `## Full spec` heading). On success it writes `document.md` (the hashed body, without the record), `summary.md`, `full-spec.md` and `record.json` (record, `spec_sha256`, parsed `meta` and the hash of each file) to a fresh DIR, and prints `{"status":"ok",…}`. Otherwise it prints `{"status":"escalate","reason":…}`.

After resolving approval, branch and grounding for a saved spec that escalated on format or metadata, run `node SKILL_DIR/scripts/spec-record.mjs pin FILE --out DIR --format legacy` on the same file into a fresh directory and require `ok`. This still verifies the approval and hash. It writes the exact hashed document as both `document.md` and `full-spec.md` and writes `record.json` with their hashes and `meta: null`. Read the build estimate and any override from the approved text, using phase 3 to size the build if needed. Use the document itself to locate the summary when needed. Read the pinned files only where this skill needs the text.

Run the helper tests with `node SKILL_DIR/scripts/spec-record.test.mjs`.

### Spec record interface

This skill owns the spec document, its approval record, and the `spec-built` block a build PR carries. Other skills read them only through these commands, run as `node SKILL_DIR/scripts/spec-record.mjs <command> FILE` on a file the shell wrote, and consume the JSON they print. `stamp` and saving the store stay with this skill.

| Command | Output |
| --- | --- |
| `check FILE` | `{spec_sha256, record, hash_matches}`: the hash of the document body and the parsed `spec-record`, or a `null` record |
| `pin FILE --out DIR [--format legacy]` | `{"status":"ok", spec_sha256, record, meta, files}` with the pinned files, or `{"status":"escalate","reason":…}`, writing nothing |
| `built FILE` | for a PR description, `{"status":"ok","built":{revision, spec_sha256, issue}}`, or `{source, branch, document_sha256}` in place of `issue` for a local spec after checking its collapsed document, or `{"status":"escalate","reason":…}` with `legacy_section`, `built_missing`, `built_multiple`, `built_invalid`, `built_document_missing` or `built_hash_mismatch` |

Invalid arguments exit 2 and unreadable files exit 1. A changed or missing record, or a document `pin` or `built` cannot verify, is reported as data, not an error.

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
  - a pointer to the `spec-meta` block in the summary instead of repeating the build estimate
- **Summary** — the concise version the user reads, short enough to take in under a minute. It is a view of the full spec, never a separate document: the two must not disagree.

**Estimate the build.** Rate the difficulty from the spec and the code you read, and recommend the builder's model and reasoning effort:

| Difficulty | Signals | Recommend (Claude Code example) |
| --- | --- | --- |
| Simple | one or two files, clear pattern to copy, low risk (copy change, config flag, small UI tweak, obvious bug fix) | standard tier, low–medium effort — e.g. `sonnet` at low or medium; light tier (`haiku` at medium) only for a purely mechanical edit with an exact pattern to copy and a check that proves it |
| Moderate | several files in one area, new but conventional logic, some tests to write | standard tier at high effort, or strong tier at medium — e.g. `sonnet` at high |
| Hard | cross-cutting or architectural change, concurrency, data migrations, security-sensitive code, subtle algorithms, unfamiliar or poorly structured code | strong tier, high effort — e.g. `opus` at high |

When in doubt between two tiers, pick the higher one. Name the signals that drove the rating. Use the model names the current harness accepts.

Write the estimate as a `spec-meta` block in the summary, so the user approves it and the spec hash covers it:

````markdown
```spec-meta
difficulty: moderate   # several files in one area, new tests
builder: sonnet/high
override: none
scope:
  - src/sync/
  - test/sync/retry.test.ts
```
````

- `difficulty`: `simple`, `moderate` or `hard`, with the signals as a ` # ` comment.
- `builder`: `<model>/<effort>`, with effort `low`, `medium` or `high` by default. An explicitly requested higher effort (`xhigh`, `max` or `ultra`) requires a user override recorded below.
- `override`: `none`, or a short description of the user's override; `builder` then holds the overridden choice.
- `scope`: every file or directory the change reads for behavior or edits, repository-relative, one `  - path` per line, no globs, `..` or leading `/`. For a new file, list its parent directory. Prefer a directory when several files in it change; when unsure, list the directory. `scope` is the approval reuse scope: [Validate a saved spec for a build](#validate-a-saved-spec-for-a-build) reuses the approval without rereading the spec when nothing under it changed, so under-listing is the main risk.

Pick from three tiers, at the latest version the harness offers: **light** (Haiku level: Claude `haiku`, GPT `luna`), **standard** (Sonnet level: Claude `sonnet`, GPT `terra`), and **strong** (Opus level: Claude `opus`, GPT `sol`). Use light only for narrow, mechanical tasks whose output is easy to check, especially many small ones in parallel: locating files or call sites, collecting or summarizing data, describing a mechanical block of a diff, or a trivial edit with an exact pattern to copy. Never use light for specs, builds beyond trivial edits, reviews, judging findings, or security-sensitive work. Default to standard. Use low, medium, or high effort only; never `xhigh` or `max`. When a tier at high effort is not enough, move up a tier (`sonnet` → `opus`) instead of raising the effort. Strong at high effort is the ceiling. Use frontier models (Claude `fable`, GPT `astra`) or `xhigh` and higher effort only when the user explicitly asks for them in this run. A user override may choose either; record it as the user's request.

An override the user approves here and that is saved in the spec counts as an explicit request for the run that builds the spec.

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

**Build**
<the spec-meta block>

Say "show full spec" to read the draft in chat.
```

Highlight the key decisions and assumptions. Approve, edit, or reject — do not proceed until the user says go. The user may override the build estimate or the recommended model and effort; record the override in the `spec-meta` block. If the user asks to see the full spec, print it in full. If they correct something, update both versions and re-present only the changed parts of the summary.

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

The details wrapper is optional in a local file; without it, put the full spec under a `## Full spec` heading. A spec approved from an older revision without a `spec-meta` block gains one in this revision. Use the Node 18+ helper to write the approval record. Never write or calculate the hash by hand.

```sh
node SKILL_DIR/scripts/spec-record.mjs stamp FILE --revision N --approved-by WHO \
  --approved-at ISO8601Z --base-sha SHA [--branch NAME]
node SKILL_DIR/scripts/spec-record.mjs check FILE
```

Stamp revision 1 for a new spec, or the revision determined at intake. Give who/how the summary was approved, the UTC approval time, and the commit used to ground it. For a local file pass the current feature branch, or `--branch ''` on the default branch. Omit the option for issues. The helper prepends a hidden `spec-record` comment with `status: approved`, revision, approver, timestamp, base SHA, optional branch, and a SHA-256 of the normalized document body.

Save the stamped document to the chosen file, or use `gh issue create --title "Spec: <title>" --body-file FILE` / `gh issue edit N --body-file FILE` (or equivalent GitHub MCP). Before replacing a previously loaded document, check for concurrent edits and reconcile changed scope with the user. Before replacing an approved issue revision N, post the current issue body as an issue comment with `gh issue comment N --body-file FILE`: first line `Revision N — superseded by revision N+1`, a blank line, `<details><summary>Revision N</summary>`, a blank line, the exact previous body including its `spec-record`, a blank line, and `</details>`. If the comment cannot be posted, report it and leave the issue unchanged. Read the stored text back into a scratch file and run `check`, then `pin` into a fresh directory; require the expected revision, approved status, `hash_matches: true` and `pin` status `ok`. If GitHub changed the formatting and the hash differs, stamp the fetched body with the same approval fields, update once, and recheck. Material text changes need approval. Report a verification failure before any build.

- **Headless or another skill:** return the pinned paths, store location (issue URL or file path), revision, approval record, the parsed `meta` (difficulty, recommended model and effort, any override, scope), and assumptions. For a legacy pin, give the original escalation reason and the build estimate and any override explicitly. Include the revalidation commit when applicable. Callers read the spec from the pinned files.
- **Interactive:** report the saved location and the fresh-session command `$factory <issue URL>` or `$factory SPEC.md`. If the user asked to build now, hand off to Factory with the saved spec, or to `implement-spec` for an explicitly requested build without review.
