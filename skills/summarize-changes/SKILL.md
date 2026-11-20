---
name: summarize-changes
description: Use when the user asks to summarize, explain, or get an overview of a PR, branch, or their current changes — "what does this PR do", "summarize my branch", "big picture of these changes", "is this the right approach" — before or instead of a detailed code review. Defaults to the current branch against the default branch, including uncommitted changes; also takes a PR number or URL, or a branch name. Not for line-level code review.
---

# Summarize Changes

Summarize a change at the level of approach: what it does in the big picture, which structural decisions it makes, and what it assumes. The goal is to let a reader (reviewer or author, same output) judge whether the big blocks are right before any line-level review.

Two sequential stages. The main agent writes the neutral **facts**. Then a fresh subagent writes a skeptical **evaluation**, because whoever described the decisions tends to rationalize them.

This is not a code review. No style, naming, typos, small bugs, or test nitpicks. If the user wants those, suggest the `code-review` skill. The skill is read-only: it never edits the working tree, commits, or pushes.

## 1. Resolve the target

- **PR number or URL:** `gh pr view N --json number,title,body,baseRefName,headRefName,url,closingIssuesReferences` for intent and refs, then `gh pr diff N` (or fetch the head and diff against the merge-base). If `gh` is missing or unauthenticated, ask for the branch name instead.
- **Branch name:** diff `merge-base(<default branch>, <branch>)..<branch>`.
- **Nothing given:** the current branch against its merge-base with the default branch, plus uncommitted changes (staged, unstaged, and untracked files; list untracked files and read the relevant ones). Find the default branch with `git symbolic-ref refs/remotes/origin/HEAD`, falling back to `main`, then `master`. On the default branch with no commits ahead, summarize only the uncommitted changes.
- If the current branch has an open PR (`gh pr view` succeeds), use its description as intent and allow the PR comment offer (step 4).
- Include uncommitted changes only for the local checkout of the target branch, never for a PR you are not on.
- If there are no changes at all, say so and stop.

**Intent sources:** PR title and description, linked issues if referenced, commit messages. If there are none, say the intent is inferred from the code.

## 2. Stage 1: facts (main agent)

Read the shape first: `git diff --stat -M` and `git diff --name-status -M` (added, modified, deleted, renamed), plus the commit list. Group files into 2 to 6 big blocks by purpose, not by directory. Read enough of each block (the diff plus surrounding code where needed) to understand what it does structurally. Skim or skip lockfiles, generated files, snapshots, and vendored code, and mention them in one line. On large diffs, prioritize new modules, public interfaces, data and schema changes, config, and deleted code. Do not try to read every line.

Write the facts neutrally: no judgments. Emphasize approach, big blocks, structural decisions, and assumptions over details. Mark each decision and assumption as **stated** (in the PR or commits) or **inferred** (from the code). Keep it readable in about two minutes.

**Block diagram (optional):** add a small Mermaid `flowchart` only when there are 4 or more blocks with real data or control flow between them. One node per block, edges labeled with what passes between them, no file-level nodes. Skip it when the blocks are independent or the paragraph already makes the flow obvious.

**For the code review:** end the facts with two navigation aids, still neutral:

- **Read in this order:** one line ordering the blocks for a line-level reviewer, usually contracts first (schemas, types, public APIs), then the code that implements them, then callers and tests.
- **Look closely at:** 3 to 5 places where line-level review matters most, named by what they touch, not by whether they look wrong: data migrations, auth or permissions, concurrency or ordering, public API or wire-format changes, deleted or changed behavior, security-sensitive input handling. Each with a file reference. Write "none" if nothing qualifies.

Track coverage as you go: which files you read in depth, which you skimmed, and which you collapsed or skipped. It goes on the **Coverage** line of the output.

The facts must serve two readers: the human, and the evaluator in stage 2. Finalize them before starting stage 2.

### Large changes

Switch to large mode when the change touches more than ~30 files or ~1,500 changed lines, not counting generated files, lockfiles, snapshots, and vendored code.

1. **Classify every file** from the name-status list: core logic, interfaces and types, schema and config, tests, generated, or mechanical (renames, codemods, formatting, import moves). Spot-check a few mechanical files, then collapse each mechanical pattern into one line, e.g. "212 files: import path `a` → `b`". Note any file that breaks the pattern, and read it as core.
2. **Use commits as blocks when the history is clean.** If commit messages tell a story ("add model", "wire API", "migrate callers"), walk them in order with `git log --reverse --stat <base>..<head>`. If the history is noise ("wip", "fix"), ignore it and group by purpose.
3. **Map per block, then reduce.** Spawn one subagent per big block (at most 6, in parallel). Give each its file list, the diff refs, and the intent sources, and ask for exactly: what the block does, its interface to the rest of the change, structural decisions, assumptions (stated or inferred), and files read in depth vs. skimmed. Write the facts from those block summaries; read code yourself only where blocks conflict or connect. Without subagent support, do the blocks one at a time and keep a short note per block before moving on.
4. **Read by priority within a budget.** Within each block: new public interfaces, types, and schemas first, then deleted code, then entry points, then core logic. Stop when the block's picture stops changing, and record what was left unread.

Coverage matters most here: a reader can work with a partial summary only if they know which parts are partial.

If the blocks are unrelated to each other (for example a refactor, a feature, and a dependency bump), state that plainly in the one-paragraph summary.

## 3. Stage 2: evaluation (fresh subagent)

Spawn one subagent, after the facts are final. Brief it with:

- the facts section, verbatim
- how to get the diff: base and head refs, PR number, and whether uncommitted changes are included (and that they are in the working tree)
- the intent sources: PR text, linked issues, commit messages, or "none, intent is inferred"
- these instructions:

```text
You are evaluating the approach of a change, not reviewing its lines. You are given a neutral summary of the change. It may be wrong or flattering.

1. Get the diff as described and verify each listed structural decision and assumption against the code before judging it. Read the files relevant to each claim, not the whole diff. If a fact is wrong, correct it and flag the correction.
2. Compare against existing patterns in the repo: does the change fit how this codebase already does similar things?
3. Compare the stated intent against what the code does.
4. Stay at approach level. No line-level findings: no style, naming, typos, small bugs, or test nitpicks.

Reply with exactly these sections, writing "none" for an empty one rather than inventing content:
- Overall: one or two sentences. Does the approach fit the stated goal and the codebase?
- Concerns: at most 5, most important first. Each: what, why it matters, evidence (file reference). If the blocks are unrelated and the change would review better as separate PRs, make "Consider splitting" one of the concerns.
- Intent vs. code: mismatches between what the PR says and what the code does (scope creep, missing pieces).
- Questions for the author: worth discussing before line-level review.
- Corrections to the facts: anything you found wrong, or "none".
```

**No subagent support:** do stage 2 inline, as a deliberate separate pass after the facts are finalized. Re-read the code for each decision and assumption with a skeptical stance, and follow the same instructions.

Fold any corrections into the facts you present.

## 4. Present

Print in chat, using this template. Label the evaluation as opinion. Aim for one to two screens; prefer fewer, sharper points.

```markdown
## Summary: <target>

### Facts
**Target:** <PR # / branch>, base `<base>`, head `<head>`, uncommitted <included | not included>, N files, +X/−Y
**Coverage:** <read in depth: N files; skimmed: N; collapsed as mechanical: N (<patterns>); skipped: N (generated, lockfiles)> — or "all files read" for small changes
**In one paragraph:** <what the change does and why; stated or inferred intent>

**Big blocks**
1. **<name>**: <what it does, how it fits the others>. Key files: `a`, `b`.

<optional mermaid flowchart of the blocks, only for 4+ connected blocks>

**Structural decisions**
- <decision> (<stated | inferred>). Rejects: <alternative, when obvious>.

**Assumptions**
- <what must be true for this to work> (<stated | inferred>)

**Not in this change**
- <expected but absent, stated neutrally>

**For the code review**
- Read in this order: <block> → <block> → <block>
- Look closely at: <what it touches> (`file`); …

### Evaluation (opinion, from a separate pass)
**Overall:** <...>
**Concerns**
1. <what>: <why it matters>. Evidence: `file`.
**Intent vs. code:** <...>
**Questions for the author**
- <...>
```

Then, if the target is or has a GitHub PR, offer once to post the summary as a PR comment, saying the evaluation is left out unless they want it included. Post only on an explicit yes. By default the comment contains only the **Facts** section. Include the evaluation only if the user asks for it, and then head it "AI evaluation (opinion, not verified by the author of this comment)". Write the comment to a temp file outside the repo and run `gh pr comment N --body-file <file>`. Never edit the PR description. If there is no PR, or the user declines, stop.

After presenting, the main agent can go deeper on any block on request.

## Avoid

- Line-level review or a file-by-file tour.
- Judgments in the facts section, or facts presented as certain when they are inferred.
- Letting the evaluation simply endorse the facts; it must check them against the code.
- Padding. A short, accurate "none" beats an invented concern.
- Turning "Look closely at" into findings: it says where review matters, not what is wrong.
- Diagrams for simple changes, or diagrams that restate the block list.
