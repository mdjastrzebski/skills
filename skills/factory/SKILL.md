---
name: factory
description: Use when the user supplies a feature or change spec for implementation, or asks to run Factory on SPEC.md, a spec issue, an idea, a bug report, or an existing GitHub PR. Saved specs build or adjust their PR. PR input defaults to diagnosis in chat. Build and explicitly requested PR review runs continue through review, fixes, and handoff.
metadata:
  version: "0.9.0"
---

# Factory

Coordinate the pipeline. Use `diagnose-issue` for the diagnosis, `prepare-spec` for the spec, `implement-spec` for the build, `summarize-changes` for its facts, a reviewer for findings, and `fix-issues` for triage and fixes. Load companion skills from the harness or their canonical `skills/<name>/SKILL.md` in the same skills release. If a required skill or capability is unavailable, report the blocked stage and how to resume.

## Select the path

- `$factory PR #1966` and `$factory diagnose PR #1966` select [Existing PR diagnosis](#existing-pr-diagnosis). A PR URL works in either form. Resolve bare numbers in the target repository when unambiguous. If the user separately and explicitly requests the review and fix pipeline on an existing PR, use [Existing PR review](#existing-pr-review) and its approval gate.
- A `SPEC.md` path selects [Saved spec](#saved-spec). For a GitHub issue, read its title and body. A `Spec:` title plus a top `spec-record` selects Saved spec. A `Spec:` title without that record selects [Prepare the spec](#prepare-the-spec) with the issue as its store. Every other issue selects the existing [bug-issue path](#issue-path-without-a-pr).
- A rough idea or supplied spec text selects [Prepare the spec](#prepare-the-spec).

## Existing PR diagnosis

1. Resolve the PR and record its URL, base and head repositories, refs, and exact commit SHAs. Give `diagnose-issue` the PR, any issue the user specified, and both SHAs. Use the PR's recorded base SHA as the baseline. Have it use the linked issue as the bug report, or the PR description if the linked-issue lookup establishes there is none. This path uses the PR as the entry point even when the report comes from a linked issue.
2. Run `diagnose-issue` in Factory mode using its existing-PR diagnosis instructions for the supported setup and comparison with the PR changes. Return the source report, baseline verdict, comparison result and tested revisions, setup and support evidence, what the patch changes, and proposed next step in chat. Stop after the diagnosis. Keep any checkpoint in task state or scratch space and leave the PR and issue untouched, including when resuming.

## Build and review pipeline

Factory build and explicit PR review requests authorize publishing a draft PR when building, pushing verified fixes as allowed by the selected path, posting pipeline comments and reviews, and marking the PR ready for review. Once the scope is approved under the selected path, proceed without routine user input. Keep draft PRs in draft through the internal review rounds and final handoff. Preserve an existing ready PR's status on explicit PR review. Adjust converts a ready PR to draft for the build and internal review.

## Evidence trail

Make every stage auditable from the PR alone. Each stage publishes its own entry with Diagnostics; a ledger in the PR description indexes them.

- **Ledger** — a collapsed `<details><summary>Evidence trail</summary>` panel (closed by default, blank lines around its table) at the end of the PR description, between `<!-- evidence-trail:start -->` and `<!-- evidence-trail:end -->`. Append the marked panel when absent. Rewrite only between the markers, then re-read the description to verify. Batch writes after the entry path completes, after each round's review is posted (round 1 also writes the Summary 1 row), after the Final handoff, and after Ready. Keep pending rows in the checkpoint. Before marking the PR ready, the ledger must hold every row but Ready plus the run total. One table row per stage: `#`, stage, skill or agent, outcome, link (comment, review, or commit), models, tokens, cost; then a `Run total` row. Record Spec rev N for saved, supplied, and idea specs, Diagnosis for bug issues and explicit PR inputs, Build when creating or adjusting a PR (with the difficulty and the builder's model and effort in its outcome), then Summary 1, each review round, Final handoff, and Ready. Record spec and diagnosis approval in the outcome ("approved by user in chat at Nov 21 12:00 UTC").
- **Window** — windows are contiguous. Start the first stage at Factory invocation (Spec for saved specs, ideas, and supplied text, Diagnosis for bug issues or explicit PR inputs) and each later stage at the previous stage's recorded end. Record those times in the checkpoint as UTC ISO 8601 ending in `Z`. Before posting a stage's entry, run `node SKILL_DIR/scripts/usage-report.mjs --harness HARNESS --cwd LAUNCH_DIR --session-id ID --since START --until NOW` and keep the JSON. Use this skill's directory for `SKILL_DIR` and the session's original launch directory for `LAUNCH_DIR`, even if the checkout moved. Use the live session ID from the harness, such as `CODEX_THREAD_ID` for Codex when set. If the active ID cannot be verified, record diagnostics as unavailable.
- **Codex source and prices** — run the report where the active thread's rollout is readable. The workspace can use a supplied host export with `--transcript PATH` for the main rollout first and each contributing subagent rollout after it. Alternatively, point `CODEX_HOME` to a readable copy of the host's Codex directory so the script can discover descendants. If the host exposes no rollout, record that reason. Pass a configured `--prices FILE` on every report, including recovery. Show measured tokens when a rate is missing and label the cost unknown. For externally supplied rates, identify the rate source and date when available. Treat `totals.usage_complete: false` as unavailable for the stage and preserve the JSON and warnings in the checkpoint.
- **Times** — show every published date and time in UTC as `Nov 21 12:00` (month abbreviation, day, 24-hour time, no year or seconds), and a range as `Nov 21 12:00–12:45 UTC`, repeating the date only when it changes. Keep ISO 8601 with `Z` for the checkpoint and script arguments.
- **Diagnostics** — end the stage's comment or review with the block below. Cache write is `cache_write_5m + cache_write_1h`. Add a `Run total` row to the ledger and to the Final handoff table.

  ```
  <details><summary>Diagnostics — STAGE</summary>

  | Model | Input | Output | Cache read | Cache write | Cost (USD) |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | MODEL | … | … | … | … | … |
  | **Total** | … | … | … | … | **…** |

  Window: Nov 21 12:00–12:45 UTC · Source: Claude Code or Codex transcript (main + N subagents) · Prices as of DATE
  </details>
  ```

- Posting a stage's entry costs tokens that land in the next stage's window. The Final handoff covers everything up to its own posting; the Ready tail goes in the chat notice only.
- Add no harness or model attribution to anything Factory publishes: no "Generated by …" footers, 🤖 lines, session links, or `Co-Authored-By` trailers in the PR description, comments, reviews, or commits. The Diagnostics blocks already name the models.
- Never estimate. If the script fails, the harness is unsupported, or the transcript is missing, write `Diagnostics unavailable: REASON`. If a model has no price (`cost_usd` null), show its tokens with cost `unknown (no price for MODEL)`; `--prices FILE` supplies prices.

## 1. Establish the target and approved scope

Use the build or review path selected above. Resolve GitHub targets by URL or repository-qualified number. Use repository context for unambiguous bare numbers.

Identify each PR comparison by its head SHA, base ref, and effective merge-base SHA. Read the base ref and both commit SHAs from the same PR snapshot and compute the merge base from those commits. A base branch advance that leaves the merge base unchanged preserves the comparison.

### Prepare the spec

For an idea or supplied spec, run `prepare-spec` in pipeline mode. It grounds the spec, resolves material gaps, obtains explicit summary approval, and saves to the chosen store. Give it the original issue as the destination for a recordless `Spec:` issue. Continue with its verified return at Pin and find the PR. Factory itself never writes to a spec issue or `SPEC.md`.

### Saved spec

Pass the store location and current build base to `prepare-spec` for saved-spec validation. It checks the approval record and hash, asks about a nonempty mismatched local branch, and compares the files in scope with the recorded base. Reuse an approved unchanged spec without questions. For base drift, revalidate against current code and ask only about material gaps. Edited text requires approval as the next revision. A missing record needs supplied-spec approval. Use the verified revision returned by that skill.

### Pin and find the PR

Checkpoint the store location, revision N, `spec_sha256`, approved document text (including summary and full spec), approval record, and build estimate. Use this pinned copy in every subsequent stage, including on resume. Read the store again only at handoff. To switch revisions earlier the user stops this run and starts a new one.

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

  Verify every candidate by fetching its PR. When a connector exposes only PR search, search descriptions across all states for the exact closing line. A failed or incomplete lookup does not establish that no PR exists.
- **Local file:** list all PR states for the current branch with `gh pr list --head <current-branch> --state all` or equivalent. Match the head repository as well. Use the checkpointed feature branch on resume.

Read the `Spec rev N` section and its document body in the matching PR description. Exclude the closing line and evidence trail from the spec comparison. Use the record helper's body normalization for text comparisons.

| Matching PRs | Next step |
| --- | --- |
| No PR | Build. |
| Several open PRs | Ask which PR to use, then evaluate that PR. |
| One open PR built from an older revision | Adjust. |
| One open PR with the pinned revision and matching text | Report the PR and revision, and stop. |
| Closed or merged PRs only | Ask whether to start a new PR or stop. For a merged spec issue, usually start a new spec issue linking the old one. |
| Open PR with missing/unreadable spec, a newer revision, or different text at the same revision | Show the discrepancy and ask which spec or PR to use before publishing. |

### Build

For `SPEC.md`, use its current feature branch. If on the default branch, create a feature branch in this working tree first, preserving the untracked file, and record the new branch in the checkpoint only. For an issue spec, publish from a feature branch against the target base. End the Spec stage after validation, record its diagnostics, and run `implement-spec` in pipeline mode with the pinned full spec and summary, revision, store, approval record, difficulty, model/effort and override, repository, and target branch. The new draft PR includes the pinned document under `## Spec rev N` and a standalone `Closes #N` for a spec issue. Continue at [After the build](#after-the-build).

### Adjust

1. Record the selected open PR's head repository and branch, starting head SHA, base ref, and effective merge base. Check write access to its head and apply the existing PR push rule for another owner's fork. Diff the spec in its description against the pinned copy to identify exactly what changed. Preserve all existing evidence rows. Number Build and Round entries after their previous highest numbers (count an initial unnumbered Build as 1). Add `Spec rev N` and the next `Build K`; count the two review rounds within this run separately from their continuing published round numbers.
2. Record the Spec stage end and diagnostics as for Build. Move a ready PR to draft (`gh pr ready NUMBER --undo` or equivalent) and verify its status. For an issue spec, verify and restore the standalone `Closes #N` line if missing. Preserve unrelated description content and the prior spec section.
3. Pass the same pinned build inputs as for Build, plus the existing PR, exact starting head and the spec difference, to `implement-spec`. Build only that difference on the PR head branch. Verify the returned commits are on the selected PR. If no code changed, record the checks showing the existing head satisfies the revision and give the reviewer the empty range plus that evidence. Continue through After the build and steps 2–7 with that PR. Review the new commits with the full PR as context. Replace its spec section with the pinned revision at final handoff after the fix loop.

For a saved-spec Build or Adjust that stops with `not_approved`, `material_deviation`, or `reproduction_mismatch`, checkpoint the stopped build and report the reason and evidence. For a reproduction mismatch, recheck the command on the reported clean base and report the observed result. End this pinned run before changing scope. Route any necessary revision to `prepare-spec` and start a new run after approval. See [Reopened approval](#reopened-approval) for diagnosis retries.

### Issue path without a PR

1. Resolve the supplied GitHub issue and run `diagnose-issue`. At the verdict, run the usage report for that window and keep it for the ledger. Present the verdict, evidence, and proposed next step and wait for the user's explicit diagnosis approval. For `CONFIRMED`, offer the full fix plan with the summary for approval together. For any other verdict, stop at the approved diagnosis. Keep any drafted issue reply in chat unless the user explicitly approves posting it. Factory's PR authorization applies only to the PR.
2. For an approved `CONFIRMED` diagnosis, pass the approved full plan and summary to `implement-spec` in pipeline mode as the approved spec, with the approval record, issue URL, baseline, and reproduction. `implement-spec` sizes the build when the plan has no estimate, and its builder confirms that the reproduction fails for the diagnosed reason before changing the implementation and passes with the fix. Build from the diagnosed base. If the base has moved and the diagnosis materially changes, return to diagnosis approval before building. If `implement-spec` stops, return to step 1 with the returned evidence. For `reproduction_mismatch`, rerun `diagnose-issue`. For `material_deviation` or `not_approved`, fold the proposed change or gap resolution into the full plan and summary, rerunning `diagnose-issue` if the evidence questions the root cause. Present the changed parts for fresh diagnosis approval before rerunning this step. See [Reopened approval](#reopened-approval). Have it link the issue in the PR body without a closing keyword such as `Fixes`, so merging does not close it automatically.
3. When `implement-spec` returns the draft PR and build commit, continue at [After the build](#after-the-build).

### Reopened approval

For a diagnosed fix plan, when `implement-spec` stops, end that Build's window at the stop, record the time in the checkpoint, and run its usage report. A reopened Diagnosis stage starts at the stopped Build's end and gets its own ledger row (`Diagnosis 2`) with the stop reason and the new approval in its outcome. Record the stopped attempt as a Build row with the stop reason, and the rerun as the next Build row. Windows stay contiguous. Reopen at most once per stage; if the rerun stops again, report the reason and evidence to the user and stop.

### After the build

Use the returned checkout and PR refs for the rest of the run. Run the usage report for the build window (it includes subagents) and keep it for Summary 1. Append every new Spec or Diagnosis and Build row to the ledger in order, including stopped and reopened stages. Preserve earlier runs and their totals. Label repeated summaries and handoffs with their revision on Adjust. Then continue at [2. Post Summary 1](#2-post-summary-1).

### Existing PR review

1. Resolve the PR and record its status, comparison, head repository, and branch. Factory may push fixes when the head repository is the base repository or one the user owns. Any other head, such as a contributor's fork, needs the user's explicit approval to push at step 2 and GitHub write access to that branch.
2. Run `diagnose-issue` with the PR, any supplied issue, and the comparison's head SHA and merge base. Use an explicitly supplied baseline when given. For PR-only input, use the skill's automatic discovery of the linked issue. Present the source report, diagnosis, verification verdict, tested commits, and proposed next step. For a closed or merged PR, return this evidence in chat and stop. For an open PR, ask for explicit approval of the diagnosed scope and review plan if `VERIFIED`, or of the remaining fix plan if `NOT_FIXED`. For `INCONCLUSIVE`, report the missing evidence and stop before writing to the PR. State where fix commits would be pushed. Keep any issue reply in chat pending separate approval to post.
3. After approval, confirm the PR is open and its comparison matches the evidence. If the comparison changed, rerun verification using the same report and reproduction. Use the new merge base for a default baseline and keep an explicitly supplied baseline. Stop if the result is inconclusive and seek approval again if the diagnosis or planned work materially changes. Apply the same refresh and approval rules to unexpected comparison changes before review or handoff. Use the approved behavior and acceptance checks as the spec for review. Record the approved report, baseline, reproduction, tested comparison, verdict, and any remaining fix gap in the checkpoint.
4. Run the usage report for the Diagnosis window and add the Diagnosis row with the verification result and approval to the PR description's ledger. Continue at [2. Post Summary 1](#2-post-summary-1) with that PR and tested head.

## 2. Post Summary 1

Run `summarize-changes` through its facts stage against the target PR. Post the returned facts in a PR conversation comment titled `Summary 1`, with the build commit or tested existing PR head so the reader can identify the diff. Include the source report and available diagnosis and verification evidence with the tested SHAs. Use authenticated `gh` or the equivalent GitHub MCP conversation comment tool for PR comments. End the comment with Diagnostics blocks for each recorded `Spec`, `Diagnosis`, and `Build` stage in order, including stopped and reopened ones, then for `Summary 1`. Record the Summary 1 row in the checkpoint (written to the ledger with round 1) and verify that the comment was posted before starting review.

## 3. Review the current PR head

Record the current PR comparison. On the existing PR path, apply the refresh rule in step 1 if the comparison changed unexpectedly. Use the harness reviewer (for example, `code-review`) only when it can take the brief and guidance below; otherwise use a fresh review subagent given them, then direct diff review if neither is available. Prefer a reviewer with a context separate from the build. If only the building agent can review, say so in the round review.

Read the target repo's review guidance from the comparison's merge-base SHA: the root `REVIEW.md` when present, otherwise the repo's agent instructions (`AGENTS.md`, `CLAUDE.md`). Review any changes to these files at the PR head as part of the diff. Use only the merge-base versions to set the review's rules and scope. Give the reviewer the approved spec, PR URL, comparison, available reproduction evidence, the guidance contents and paths at that SHA, and this brief:

> Review the PR diff against the approved spec and the repo's review guidance. Follow the guidance's failure modes, required checks, skip list, and reporting rules. Look for concrete defects, regressions, and missing verification that could mask them, including other files the change makes stale. Return findings to Factory for publication. For each finding give the location, evidence, impact, and what needs to change, rate it `important` or `nit` under the guidance's rating rules, and tag findings the diff did not introduce as pre-existing. Report open questions separately and explicitly return an empty list for a clean review. Leave the checkout untouched.

Record which reviewer ran and which guidance files it used; the round review names both.

On Adjust, the first round reviews the range from the recorded pre-build head to the new head, with the full PR as context. Apply the base-ref, merge-base and ancestry rules below against the pre-build comparison; fall back to the full PR and explain if any check fails. On other paths the first round reviews the full PR diff in depth. For round 2 within the current run, compare the current base ref and merge-base SHA with its first round's reviewed comparison. Use the range from round 1's reviewed head SHA to the current head only when both base fields still match and the reviewed head is an ancestor of the current head. Give the reviewer that range and the full PR diff as context. Ask it to review what the range changed and look for the same class of problem wherever the range touches. If either base field or ancestry fails that check, review the current full PR diff in round 2 and explain why in the round review. If using a range and the harness reviewer cannot target it, use a fresh review subagent given the range and the full PR diff, and say so in the round review.

In either round 2 scope, check that each round 1 fix still resolves its finding without regressions. Report the current outcome of previously posted findings for their existing threads. Tag a finding as pre-existing only if the current PR's merge base already had the problem. If a newly reported problem was introduced by the PR and was already present in round 1's reviewed diff, mark it as missed by round 1 and keep it as a normal finding.

Run one reviewer by default, on the most capable model available. Add focused reviewers only when the user asks or the review guidance lists them (for example, under a `Review setup` heading in `REVIEW.md`). The user's request overrides the guidance, and the guidance overrides this default. Give each focused reviewer the same inputs and brief plus its focus. Merge all reviewers' findings into one list. Run at most three reviewers per round, and name each reviewer and its focus in the round review.

Wait for evidence that the exact diff was reviewed before proceeding. If the reviewer already posted findings, read that round's review and threads and keep their links. Collect one deduplicated list, retaining the reviewer, location, and source when available. Include any approved fix gap that still reproduces on this head, along with its reproduction, observed result, and approved plan. Keep each finding's rating and pre-existing tag.

## 4. Fix the findings

Before passing a nonempty findings list to `fix-issues`, resolve the PR's head repository and branch and confirm that its current comparison still matches the reviewed comparison. Prepare and verify a clean checkout on that branch at the reviewed head SHA, preserving any existing edits and local commits. If the comparison changed, discard this review's findings and return to step 3 to review the new comparison as the same round. Do this at most once per round. If the comparison changes again or the exact checkout cannot be prepared safely, record the findings, report the blocker, and stop.

Run `fix-issues` in auto mode with the explicit findings list (even when empty), each finding's rating and pre-existing tag, and the round number. `fix-issues` dispatches findings rated `important` instead of deferring them, unless they are tagged pre-existing; it records pre-existing findings as follow-ups without fixing them, even when rated `important`. Use its pasted-list workflow, which delegates verification and repair to `fix-issue` and leaves publication to Factory. Capture the verdicts, reasons, checks, and fix commits. Recheck the reviewed comparison before pushing fixes or posting a clean result. Apply the same retry rule if it changed and preserve any unpublished local commits. Push verified fix commits to the PR head branch before citing them. If the existing PR path's push rule does not allow that head, keep the commits local, describe them in the round review, and report them to the user. If the push fails or the fix skill cannot complete the round, record the blocker and resume here when it is resolved. Individual failed, deferred, or follow-up findings go in the handoff.

## 5. Post the round review

Post one concise GitHub review with the round number, reviewed comparison, reviewer and guidance used, and check summary, ending with the round's Diagnostics (review, fixes, and posting prep; reply threads carry none). Use the `COMMENT` review event, since GitHub rejects approvals and change requests from the PR author. Set the GitHub review's commit ID (`commit_id` in the REST API) to the reviewed head SHA when supported. Anchor findings inline on the reviewed diff where possible. Give the issue, impact, and disposition in one or two plain-language sentences for each finding, and mark pre-existing findings as follow-ups for a separate change. Cite its fix commit only after the push succeeds. For a finding the reviewer already published, reply with the outcome in the existing thread. When there is no usable thread, link to the existing finding and give its outcome in the review body. Put new findings in the review body when the tool cannot target the reviewed diff, there is no usable inline position, or GitHub rejects their anchors. For an empty round, post a brief clean result.

Verify the review and any replies on GitHub, record their links in the checkpoint, and write the ledger (round 1 includes the Summary 1 row) before advancing. If round 1 pushed fix commits, repeat steps 3–5 once against the updated PR head. Otherwise go to step 6. Keep both rounds' outcomes and note any work left for human review.

## 6. Post the final handoff

Record the final published PR comparison and run the facts stage of `summarize-changes` against it. On the existing PR path, apply the refresh rule in step 1 if the comparison changed unexpectedly. For bug-issue and existing PR diagnosis/review paths, use `diagnose-issue` with the approved report, baseline, reproduction, and final head SHA. Reuse evidence only when it covers the same commits and reproduction. For a pinned spec, re-read the store now and run the record check. Compare its current revision and computed body hash with the checkpoint (including a missing record or invalidated hash). If it moved, include “Built rev N; the spec is now at rev M. Run `$factory <spec>` to adjust.” in both the handoff and notification, filling in the actual revisions and location. Name an unapproved edit, missing record or unreadable store explicitly when its new revision cannot be established. Keep the pinned result. For Adjust, replace only the built spec section in the PR body with `## Spec rev N` and the pinned document, retaining the closing line, other content, and evidence trail. Verify the updated section.

Post a `Final handoff` PR conversation comment with the final comparison, facts, checks, the source report and verification evidence when applicable, and these sections:

- **Review verdicts** — a table with round, finding, verdict, and commit or reason. Link each round's review and any replies or source comments. Record a clean round explicitly.
- **Deferred items** — remaining work, including failures and why each item is still open.
- **Follow-ups** — pre-existing findings left for a separate change, each with its location, evidence, and the round that found it.
- **Open questions** — decisions or verification still needed from the reviewer.
- **Where to look first** — the suggested review order from the facts and the key files to start with.
- **Diagnostics** — a table of each stage's models, tokens, and cost with the run total (the sum of the stages, which equals the usage report from the first start to now; if the run spanned sessions, use the sum), and a link to the ledger. Add the stage's own Diagnostics block.

Use `None` for empty sections except Diagnostics. Write the ledger with the Final handoff row and run total, verify publication, and keep the comment URL.

## 7. Mark the PR ready and notify

After verifying the final handoff, confirm the open PR still matches the comparison named in the handoff. If the comparison changed, report the mismatch and stop before changing the PR status. On diagnosis paths, require `VERIFIED` for that final comparison before marking a draft ready. If verification fails or is inconclusive, report the handoff link, current PR status, and blocker, then stop.

Unless the user asked to keep the PR in draft, mark it ready for review with authenticated `gh pr ready NUMBER` or the equivalent GitHub MCP operation. Skip the mutation if the PR is already ready. Verify the resulting status. If the transition fails, report the blocker and resume at this step when it is resolved. Then write the Ready row to the ledger (outcome and time only).

Send the user the PR and final handoff links with the verified PR status and the run total (tokens and cost, or why unavailable), using a push notification if the harness offers one and a chat update otherwise. Stop here and wait for interactive follow-up.

## 8. Stop and resume on a usage limit

Keep a checkpoint in harness task state or scratch space as the run progresses. Record the entry path, checkout, approved spec, build estimate and the builder's model and effort, branch and PR, last completed step, PR status, each round's reviewed comparison (head SHA, base ref, and merge-base SHA), whether round 2 used a range or the full PR diff, each reviewer and its focus, the guidance files used, findings and fix outcomes, and links to reviews, replies, and conversation comments as they become available. For diagnosis paths, include the source report, approved diagnosis, reproduction, tested comparison or commits, and verification outcomes. Record the final handoff comparison and each stage's start and end timestamps, usage-report JSON, and ledger rows. For saved specs retain the pinned body, revision, hash, and location. For Adjust keep the original built spec, pre-build comparison, and published stage numbers. Resume the existing run from this checkpoint even if its PR description has already been updated.

On a usage limit, stop starting new work. If the PR exists and the harness still permits a GitHub write, post a PR comment with the step and round where work stopped, the relevant comparison or findings, and the next step to resume. If the limit prevents posting or precedes PR creation, keep the notice in the checkpoint and surface it to the user when possible. On resume, post the notice once a PR and write access are available. Check current GitHub state and the checkpoint before retrying a push, review, comment, or ready-for-review transition. Before republishing a round, look for a review and replies for the same round and reviewed comparison. Record existing links and publish only missing results. Resume from the first incomplete step using the existing PR and approval.

Record the harness, live session ID, launch directory, and any explicit transcript paths with each usage window. If resuming in a new session, resolve its ID and split any interrupted stage at the resume time. Rebuild the earlier portion with the original session's source and report the later portion with the new session's source. Sum measured portions across sessions and keep incomplete stages and run totals marked incomplete. Check the ledger against the checkpoint and fix missing rows.
