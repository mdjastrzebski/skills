---
name: fix-issues
description: Use when the user gives a list of issues, review findings, bug reports, or TODOs and asks to fix them, work through them, or "fix these issues" one by one. Also use when the user asks to "fix the PR comments", "address review comments/feedback", "fix comments on my PR", or "resolve the review"; the target is the PR given by number or URL, else the PR for the current branch. Triages and orders the list, then verifies and fixes each issue in its own subagent, with one commit per fixed issue on the current branch.
---

# Fix Issues

Work through a list of issues (pasted, or unresolved review comments on a GitHub PR) one at a time. The main agent triages and orders the list, then dispatches one subagent per issue, sequentially. Each subagent decides whether its issue is real and worth fixing, and fixes it if so. The main agent commits each fix separately and ends with a short summary.

The main agent coordinates. It does not investigate or fix issues itself.

## 1. Collect the issues

Take the issues the user gave: a pasted list, code-review output, GitHub issue links, a file, or review comments on a GitHub PR (see below). If there is no list and no PR request, ask for one and stop. Pasted issues and PR comments can be combined in one list.

Give each issue a short ID (`#1`, `#2`, ...) in the order the user gave them, and keep the user's wording. Split items that bundle several separate problems. Merge exact duplicates.

### From a GitHub PR

Use when the user asks to fix PR review comments. Target the PR the user named (number or URL); otherwise the PR for the current branch:

```bash
gh pr view [N] --json number,url,headRefName,baseRefName,author
```

If `gh` is missing, unauthenticated, or finds no PR, say so and stop; suggest pasting the comments instead. Fetch the feedback (read-only), replacing `N`:

```bash
# Inline review threads (add `pageInfo{hasNextPage endCursor}` and page with `after:` if over 100)
gh api graphql -F owner='{owner}' -F name='{repo}' -F number=N -f query='
query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){
  reviewThreads(first:100){nodes{id isResolved isOutdated path line
    comments(first:50){nodes{databaseId author{login __typename} body url}}}}}}}'
# Review bodies and PR conversation comments
gh api repos/{owner}/{repo}/pulls/N/reviews --paginate
gh api repos/{owner}/{repo}/issues/N/comments --paginate
```

Turn them into issues:

- **Inline threads:** one issue per thread with `isResolved == false`. Skip `isOutdated` threads and list them in the summary as skipped-outdated. Include every such thread whatever its author, human or bot.
- **Review bodies and conversation comments:** include only non-empty ones that ask for a concrete change (reviews in state `COMMENTED` or `CHANGES_REQUESTED`). Split each into one issue per requested change.
- **Review bots count as reviewers** (Copilot, CodeRabbit, Gemini Code Assist, Sourcery, Greptile, Cursor Bugbot, and the like). From a bot's review body or conversation comment, take only concrete, code-specific requests (such as CodeRabbit's actionable and nitpick items). Skip walkthroughs, PR summaries, diagrams, and "review skipped/paused" notices.
- **Exclude entirely:** non-review automation (CI/status, codecov, vercel/netlify previews, changesets, dependabot/renovate, and similar), resolved threads, approvals with no actionable text, and comments by the PR author. Replies inside a thread are context for that thread, not separate issues.
- If nothing is left, say so and stop.

Write each PR issue as: the comment text verbatim (keep any ```suggestion block or proposed diff), `file:line` for inline threads, the reviewer login, and the thread or comment URL. Append later replies in a thread as context. Record its source (thread node `id`, or comment/review URL) for Step 7.

## 2. Preflight

- Note the current branch. Commit to it. Do not create or switch branches, and do not push (except Step 7, after the user says yes).
- For PR issues: if the PR's `headRefName` is not the current branch, stop and tell the user both branch names.
- Check `git status`. If there are uncommitted changes, ask the user whether to commit, stash, or stop before going on. Do not mix them into issue commits.
- Find the repo's fast checks (lint, typecheck, relevant tests) and its commit message style (`git log --oneline -20`). Pass both to every subagent.

## 3. Triage and order

Before dispatching anything, classify each issue from its description and a quick look at the code it names. Do not analyze it deeply; that is the subagent's job.

- **Kind:** `bug` (wrong behavior, crash, security, data loss, regression) or `improvement` (refactor, performance, cleanup, docs, style).
- **Severity:** `critical` (security, data loss or corruption, crash in a common path), `high` (wrong result in a common path), `medium` (edge case, degraded behavior), `low` (cosmetic, minor).

Order:

1. All bugs before all improvements.
2. Within each kind, higher severity first.
3. Ties: issues that others depend on first, then smaller blast radius first.

**Pasted-list runs:** print the ordered plan as a short table (`ID | kind | severity | one-line issue`), then start dispatching without waiting for approval.

**Runs with any PR issue:** add columns `Reviewer` (login, so human and bot are visible), `About` (one plain-words line on what the comment asks for), and `Fix?` (`yes`, `no`, or `unsure`, plus a few-word reason, e.g. "no — style preference, conflicts with lint config"). Base `Fix?` on a quick look at the comment and the code it names. Then stop and wait: the user approves as-is or toggles items ("skip #3, fix #5"). Dispatch only approved items, with `unsure` items counting as approved. Record dropped items as `SKIPPED_BY_USER`; they get no subagent and no commit. In mixed runs the wait covers the whole list.

## 4. Dispatch, one issue at a time

For each issue in order, spawn one subagent and wait for it to finish before starting the next. Never run issue subagents in parallel: each one must see the code as earlier fixes left it.

Subagent prompt (fill in the brackets):

```text
You are handling one issue in [repo] on branch [branch]. Earlier issues in this batch may already be fixed and committed.

Issue [ID] ([kind], [severity]):
[issue text as the user gave it]
[PR issues only: Source: [file:line], reviewer [login], [URL]. If the reviewer is a bot or the text has a suggested diff, treat it as a hint: verify it, do not apply it blindly.]

1. Analyze. Read the relevant code and confirm or refute the issue. Reproduce it when practical (a failing test, a script, or a traced code path).
2. Decide one verdict:
   - VALID: the issue is correct as stated and worth fixing.
   - PARTIAL: part of it is wrong, overstated, or misdiagnosed, but a real problem remains. Write the corrected issue definition, then fix that.
   - ALREADY_FIXED: the problem no longer exists, e.g. an earlier fix covered it.
   - INVALID: the issue is not real.
   - NOT_WORTH_FIXING: real, but the fix costs more than it gains (risk, churn, scope, or out of this repo's control).
3. If VALID or PARTIAL, fix it:
   - Make the smallest change that fully fixes the issue. No unrelated refactors or reformatting.
   - Add or update a test when the repo has tests for that area.
   - Run these checks on what you changed: [fast checks].
   - Do not commit, push, or switch branches.
   - If you cannot fix it cleanly or the checks fail, revert your changes and report FAILED.

Reply with exactly:
VERDICT: VALID | PARTIAL | ALREADY_FIXED | INVALID | NOT_WORTH_FIXING | FAILED
ISSUE: [the issue as stated, or the corrected definition if PARTIAL]
REASON: [1-3 sentences: evidence for the verdict, or why it is not worth fixing, or why it failed]
CHANGES: [files changed and what changed, or "none"]
CHECKS: [commands run and results, or "none"]
COMMIT: [one-line commit subject in the repo's style: [style]]
```

## 5. Commit after each issue

After each subagent returns:

- **VALID or PARTIAL:** check `git status` and `git diff`. The changes must match the reported CHANGES and stay within the issue. If the subagent left unrelated edits, revert them. Then stage only those files and make one commit on the current branch. Use the subagent's subject; for PARTIAL, add the corrected issue definition to the body.
- **Any other verdict:** make sure the working tree is clean (revert anything left over) and record the reason. No commit.

Never squash, amend, or combine commits across issues.

## 6. Summary

After the last issue, print a concise summary in triage order:

```text
| ID | Verdict | Commit | Note |
| #3 | VALID   | a1b2c3d fix: ... | |
| #1 | PARTIAL | d4e5f6a fix: ... | real cause was X, not Y |
| #2 | NOT_WORTH_FIXING | — | why |
```

When PR issues are present, add a `Source` column (comment link or `file:line`). Also list skipped-outdated threads and `SKIPPED_BY_USER` items.

Then one line with counts: fixed, partial, skipped (already fixed, invalid, not worth fixing, by user), failed. List failed issues with the reason so the user can follow up.

## 7. Reply on the PR (optional)

Only when any issue came from a PR. Ask the user once: "Push and reply on N threads/comments?" Do nothing without an explicit yes. If they decline, stop; the summary links let them reply manually.

On yes:

1. `git push` the current branch (the one push this skill makes).
2. Reply to each inline thread, once per thread:
   ```bash
   gh api graphql -f query='mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{url}}}' -f id=THREAD_ID -f body='...'
   ```
3. For review-body and conversation items, post one PR comment listing each item with its outcome: `gh pr comment N --body '...'`.

Reply text: `Fixed in <sha>` for fixed issues (plus a short note for PARTIAL); the verdict and reason for other verdicts; "not addressed in this pass" for `SKIPPED_BY_USER`. Do not resolve threads; leave that to the reviewer.
