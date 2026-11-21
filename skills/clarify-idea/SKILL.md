---
name: clarify-idea
description: Use when the user wants a rough idea turned into an approved spec, says "grill me on this", "spec this out", "implement this idea", or "build this", or Factory sends an idea or a supplied spec to clarify and approve. Interactive by default; use pipeline mode when Factory invokes the skill or the user explicitly requests it. Does not write code.
metadata:
  version: "0.1.0"
---

# Clarify Idea

Turn a rough idea into an approved spec, or validate a supplied spec and get it approved. Estimate how hard the build is and recommend the builder's model and reasoning effort. Do not write code. The build belongs to `implement-spec`.

## Mode

- **Interactive (default):** follow phases 1–5. Phase 2 runs only when the idea is unclear.
- **Pipeline:** for a rough idea, ground it as usual, resolve routine questions as stated assumptions, and ask only about a choice that prevents a viable spec. For a supplied spec, follow [Validate a supplied spec](#validate-a-supplied-spec). Always keep the approval gate in phase 4, then return the result in phase 5 to the caller.

Any material change after approval needs fresh approval.

## 1. Ground yourself first

Before the first question, read enough of the codebase to avoid asking what the code already answers: where the change would live, existing patterns it should follow, how tests and the dev loop work (`AGENTS.md`, `CLAUDE.md`, `README`, package scripts). Never ask the user something you can look up.

Then decide whether the idea is clear: list the open decisions that would change behavior, scope, or acceptance checks and that the code does not settle. If there are none, skip phase 2 and go to phase 3, recording the routine choices as assumptions. Otherwise grill in phase 2, whether the user asked only for a spec or also for the build.

### Validate a supplied spec

Ground the spec in the target codebase. Check that the goal, scope, expected behavior, applicable constraints and edge cases, and observable acceptance criteria give the builder and reviewer enough to work from. Look for conflicts with the codebase or within the spec. Use project conventions for routine implementation choices and record any assumptions that matter to the build.

Write the full spec (phase 3) from the supplied spec and those assumptions, and show its summary before asking any question. If a missing or conflicting decision could change the behavior, scope, or acceptance checks, ask about it using phase 2. Recheck the spec after each answer, update both versions, and re-present only the changed parts of the summary. Skip questioning when the spec has no such gaps. Then continue at phase 4.

## 2. Grill, one question at a time

Interview the user like a sharp senior engineer stress-testing the idea. Ask only about the open decisions from phase 1 and those they lead to.

- **One question per message.** Wait for the answer before asking the next. Never batch.
- **Most important first.** Order by how much the answer changes the build: goal and success criteria → scope (what's in, what's explicitly out) → user-facing behavior → data and interfaces → edge cases and errors → non-functional (performance, security, compatibility) → polish.
- **Make every question cheap to answer.** Offer 2–4 concrete options and mark your recommendation, e.g. "Should failed syncs retry? (a) no, surface the error (b) 3 retries with backoff — recommended, matches `fetchWithRetry` (c) retry forever in background". Use a structured question tool if the agent has one.
- **Adapt.** Let each answer reshape the remaining questions. Skip anything an earlier answer already settled. Push back when an answer conflicts with an earlier one or with the codebase.
- **Hard cap: 20 questions.** Stop earlier once the remaining unknowns would not change the design. Most ideas need 3–10.
- **Decide the rest yourself.** For every detail not asked, pick the most reasonable option given the codebase and the answers so far, and record it as an assumption.
- If the user says "you decide" or "just build it", stop asking and move to phase 3.

## 3. Write the spec and size the build

Write two versions of the spec:

- **Full spec** — the detailed version a builder works from without seeing this conversation. Save it to a file outside the repo's tracked files (the agent's scratch or temp directory; otherwise `.clarify-idea/<slug>.md` and make sure it is git-ignored). It contains:
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

**Full spec:** <path to file> — or say "show full spec" to see it here
```

Highlight the key decisions and assumptions. Approve, edit, or reject — do not proceed until the user says go. The user may override the build estimate or the recommended model and effort; record the override in both versions. If the user asks to see the full spec, print it in full. If they correct something, update both versions and re-present only the changed parts of the summary.

## 5. Return the approved spec

Record when and how the user approved (for example "approved by user in chat at Nov 21 12:00 UTC").

- **Pipeline:** return the full spec, summary, full-spec path, difficulty, recommended model and effort, any user override, assumptions, and the approval record to the caller.
- **Interactive:** report the full-spec path. If the user asked to build it ("implement this idea", "grill me, then build it"), hand the approved spec, the recommended model and effort, and the approval record to `implement-spec`. Otherwise offer to build it with `implement-spec`, or with `factory` to add review rounds and a draft PR.
