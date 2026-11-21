---
name: factory
description: Use when the user supplies a feature or change spec for implementation, or asks to run Factory on an idea, a GitHub issue, or an existing GitHub PR. PR input defaults to diagnosis in chat. Build and explicitly requested PR review runs continue through review, fixes, and handoff.
metadata:
  version: "0.7.0"
---

# Factory

Coordinate the pipeline. Use `diagnose-issue` for the diagnosis, `clarify-idea` for the spec, `implement-spec` for the build, `summarize-changes` for its facts, a reviewer for findings, and `fix-issues` for triage and fixes. Load companion skills from the harness or their canonical `skills/<name>/SKILL.md` in the same skills release. If a required skill or capability is unavailable, report the blocked stage and how to resume.

## Select the path

- `$factory PR #1966` and `$factory diagnose PR #1966` select [Existing PR diagnosis](#existing-pr-diagnosis). A PR URL works in either form. Resolve bare numbers in the target repository when unambiguous. If the user separately and explicitly requests the review and fix pipeline on an existing PR, use [Existing PR review](#existing-pr-review) and its approval gate.
- An issue alone selects the [Issue path](#issue-path-without-a-pr).
- A spec supplied for implementation selects the [Supplied spec path](#supplied-spec-path). A rough feature or change idea selects the [Idea path](#idea-path).

## Existing PR diagnosis

1. Resolve the PR and record its URL, base and head repositories, refs, and exact commit SHAs. Give `diagnose-issue` the PR, any issue the user specified, and both SHAs. Use the PR's recorded base SHA as the baseline. Have it use the linked issue as the bug report, or the PR description if the linked-issue lookup establishes there is none. This path uses the PR as the entry point even when the report comes from a linked issue.
2. Run `diagnose-issue` in Factory mode using its existing-PR diagnosis instructions for the supported setup and comparison with the PR changes. Return the source report, baseline verdict, comparison result and tested revisions, setup and support evidence, what the patch changes, and proposed next step in chat. Stop after the diagnosis. Keep any checkpoint in task state or scratch space and leave the PR and issue untouched, including when resuming.

## Build and review pipeline

Factory build and explicit PR review requests authorize publishing a draft PR when building, pushing verified fixes as allowed by the selected path, posting pipeline comments and reviews, and marking the PR ready for review. Once the scope is approved under the selected path, proceed without routine user input. Keep draft PRs in draft through the internal review rounds and final handoff. Preserve an existing ready PR's status.

## Evidence trail

Make every stage auditable from the PR alone. Each stage publishes its own entry with Diagnostics; a ledger in the PR description indexes them.

- **Ledger** — a collapsed `<details><summary>Evidence trail</summary>` panel (closed by default, blank lines around its table) at the end of the PR description, between `<!-- evidence-trail:start -->` and `<!-- evidence-trail:end -->`. Append the marked panel when absent. Rewrite only between the markers, then re-read the description to verify. Batch writes after the entry path completes, after each round's review is posted (round 1 also writes the Summary 1 row), after the Final handoff, and after Ready. Keep pending rows in the checkpoint. Before marking the PR ready, the ledger must hold every row but Ready plus the run total. One table row per stage: `#`, stage, skill or agent, outcome, link (comment, review, or commit), models, tokens, cost; then a `Run total` row. Record Spec for idea and supplied spec inputs, Diagnosis for issue and existing PR inputs, Build when creating a PR (with the difficulty and the builder's model and effort in its outcome), then Summary 1, each review round, Final handoff, and Ready. Record spec and diagnosis approval in the outcome ("approved by user in chat at Nov 21 12:00 UTC").
- **Window** — windows are contiguous. Start the first stage at Factory invocation (Spec for idea and supplied spec inputs, Diagnosis for issue or existing PR inputs) and each later stage at the previous stage's recorded end. Record those times in the checkpoint as UTC ISO 8601 ending in `Z`. Before posting a stage's entry, run `node SKILL_DIR/scripts/usage-report.mjs --harness HARNESS --cwd LAUNCH_DIR --session-id ID --since START --until NOW` and keep the JSON. Use this skill's directory for `SKILL_DIR` and the session's original launch directory for `LAUNCH_DIR`, even if the checkout moved. Use the live session ID from the harness, such as `CODEX_THREAD_ID` for Codex when set. If the active ID cannot be verified, record diagnostics as unavailable.
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

### Idea path

Pass the idea and target repo to `clarify-idea` in pipeline mode. Wait for explicit user approval of the spec inside that skill. Continue at [Build](#build) when it returns the approved spec.

### Supplied spec path

Pass the user's spec and target repo to `clarify-idea` in pipeline mode as a supplied spec for implementation. Have it validate the spec against the repo, show a short spec summary, ask one focused question at a time about any gaps that affect the build, and wait for explicit user approval of the resulting spec inside that skill. Continue at [Build](#build) when it returns the approved spec.

### Build

Record the approval and the build estimate in the checkpoint, end the Spec stage at the approval, and run the usage report for its window. Pass the approved full spec, summary, approval record, difficulty, recommended model and effort (with any user override), and target repo to `implement-spec` in pipeline mode. Continue at [After the build](#after-the-build) when it returns a verified draft PR and build commit.

### Issue path without a PR

1. Resolve the supplied GitHub issue and run `diagnose-issue`. At the verdict, run the usage report for that window and keep it for the ledger. Present the verdict, evidence, and proposed next step and wait for the user's explicit diagnosis approval. For `CONFIRMED`, offer the full fix plan with the summary for approval together. For any other verdict, stop at the approved diagnosis. Keep any drafted issue reply in chat unless the user explicitly approves posting it. Factory's PR authorization applies only to the PR.
2. For an approved `CONFIRMED` diagnosis, pass the approved full plan and summary to `implement-spec` in pipeline mode as the approved spec, with the approval record, issue URL, baseline, and reproduction. `implement-spec` sizes the build when the plan has no estimate, and its builder confirms that the reproduction fails for the diagnosed reason before changing the implementation and passes with the fix. Build from the diagnosed base. If the base has moved and the diagnosis materially changes, return to diagnosis approval. Have it link the issue in the PR body without a closing keyword such as `Fixes`, so merging does not close it automatically.
3. When `implement-spec` returns the draft PR and build commit, continue at [After the build](#after-the-build).

### After the build

Use the returned checkout and PR refs for the rest of the run. Run the usage report for the build window (it includes subagents) and keep it for Summary 1. Add the ledger to the PR description with the Spec row for idea and supplied spec input, or the Diagnosis row for issue input, then the Build row. Then continue at [2. Post Summary 1](#2-post-summary-1).

### Existing PR review

1. Resolve the PR and record its status, comparison, head repository, and branch. Factory may push fixes when the head repository is the base repository or one the user owns. Any other head, such as a contributor's fork, needs the user's explicit approval to push at step 2 and GitHub write access to that branch.
2. Run `diagnose-issue` with the PR, any supplied issue, and the comparison's head SHA and merge base. Use an explicitly supplied baseline when given. For PR-only input, use the skill's automatic discovery of the linked issue. Present the source report, diagnosis, verification verdict, tested commits, and proposed next step. For a closed or merged PR, return this evidence in chat and stop. For an open PR, ask for explicit approval of the diagnosed scope and review plan if `VERIFIED`, or of the remaining fix plan if `NOT_FIXED`. For `INCONCLUSIVE`, report the missing evidence and stop before writing to the PR. State where fix commits would be pushed. Keep any issue reply in chat pending separate approval to post.
3. After approval, confirm the PR is open and its comparison matches the evidence. If the comparison changed, rerun verification using the same report and reproduction. Use the new merge base for a default baseline and keep an explicitly supplied baseline. Stop if the result is inconclusive and seek approval again if the diagnosis or planned work materially changes. Apply the same refresh and approval rules to unexpected comparison changes before review or handoff. Use the approved behavior and acceptance checks as the spec for review. Record the approved report, baseline, reproduction, tested comparison, verdict, and any remaining fix gap in the checkpoint.
4. Run the usage report for the Diagnosis window and add the Diagnosis row with the verification result and approval to the PR description's ledger. Continue at [2. Post Summary 1](#2-post-summary-1) with that PR and tested head.

## 2. Post Summary 1

Run `summarize-changes` through its facts stage against the target PR. Post the returned facts in a PR conversation comment titled `Summary 1`, with the build commit or tested existing PR head so the reader can identify the diff. Include the source report and available diagnosis and verification evidence with the tested SHAs. Use authenticated `gh` or the equivalent GitHub MCP conversation comment tool for PR comments. End the comment with Diagnostics blocks for any applicable `Spec`, `Diagnosis`, and `Build` stages, then for `Summary 1`. Record the Summary 1 row in the checkpoint (written to the ledger with round 1) and verify that the comment was posted before starting review.

## 3. Review the current PR head

Record the current PR comparison. On the existing PR path, apply the refresh rule in step 1 if the comparison changed unexpectedly. Use the harness reviewer (for example, `code-review`) when available, then a fresh review subagent, then direct diff review if neither is available. Give the reviewer the approved spec, PR URL, comparison, available reproduction evidence, and this brief:

> Review the PR diff against the approved spec and repo conventions. Look for concrete defects, regressions, and missing verification that could mask them. Return findings to Factory for publication. For each finding give the location, evidence, impact, and what needs to change. Report open questions separately and explicitly return an empty list for a clean review. Leave the checkout untouched.

Wait for evidence that the exact diff was reviewed before proceeding. If the reviewer already posted findings, read that round's review and threads and keep their links. Collect one deduplicated list, retaining the reviewer, location, and source when available. Include any approved fix gap that still reproduces on this head, along with its reproduction, observed result, and approved plan.

## 4. Fix the findings

Before passing a nonempty findings list to `fix-issues`, resolve the PR's head repository and branch and confirm that its current comparison still matches the reviewed comparison. Prepare and verify a clean checkout on that branch at the reviewed head SHA, preserving any existing edits and local commits. If the comparison changed, discard this review's findings and return to step 3 to review the new comparison as the same round. Do this at most once per round. If the comparison changes again or the exact checkout cannot be prepared safely, record the findings, report the blocker, and stop.

Run `fix-issues` in auto mode with the explicit findings list (even when empty) and the round number. Use its pasted-list workflow, which delegates verification and repair to `fix-issue` and leaves publication to Factory. Capture the verdicts, reasons, checks, and fix commits. Recheck the reviewed comparison before pushing fixes or posting a clean result. Apply the same retry rule if it changed and preserve any unpublished local commits. Push verified fix commits to the PR head branch before citing them. If the existing PR path's push rule does not allow that head, keep the commits local, describe them in the round review, and report them to the user. If the push fails or the fix skill cannot complete the round, record the blocker and resume here when it is resolved. Individual failed or deferred findings go in the handoff.

## 5. Post the round review

Post one concise GitHub review with the round number, reviewed comparison, and check summary, ending with the round's Diagnostics (review, fixes, and posting prep; reply threads carry none). Use the `COMMENT` review event, since GitHub rejects approvals and change requests from the PR author. Set the GitHub review's commit ID (`commit_id` in the REST API) to the reviewed head SHA when supported. Anchor findings inline on the reviewed diff where possible. Give the issue, impact, and disposition in one or two plain-language sentences for each finding. Cite its fix commit only after the push succeeds. For a finding the reviewer already published, reply with the outcome in the existing thread. When there is no usable thread, link to the existing finding and give its outcome in the review body. Put new findings in the review body when the tool cannot target the reviewed diff, there is no usable inline position, or GitHub rejects their anchors. For an empty round, post a brief clean result.

Verify the review and any replies on GitHub, record their links in the checkpoint, and write the ledger (round 1 includes the Summary 1 row) before advancing. If round 1 pushed fix commits, repeat steps 3–5 once against the updated PR head. Otherwise go to step 6. Keep both rounds' outcomes and note any work left for human review.

## 6. Post the final handoff

Record the final published PR comparison and run the facts stage of `summarize-changes` against it. On the existing PR path, apply the refresh rule in step 1 if the comparison changed unexpectedly. For issue and existing PR paths, use `diagnose-issue` with the approved report, baseline, reproduction, and final head SHA. Reuse evidence only when it covers the same commits and reproduction. Post a `Final handoff` PR conversation comment with the final comparison, facts, checks, the source report and verification evidence when applicable, and these sections:

- **Review verdicts** — a table with round, finding, verdict, and commit or reason. Link each round's review and any replies or source comments. Record a clean round explicitly.
- **Deferred items** — remaining work, including failures and why each item is still open.
- **Open questions** — decisions or verification still needed from the reviewer.
- **Where to look first** — the suggested review order from the facts and the key files to start with.
- **Diagnostics** — a table of each stage's models, tokens, and cost with the run total (the sum of the stages, which equals the usage report from the first start to now; if the run spanned sessions, use the sum), and a link to the ledger. Add the stage's own Diagnostics block.

Use `None` for empty sections except Diagnostics. Write the ledger with the Final handoff row and run total, verify publication, and keep the comment URL.

## 7. Mark the PR ready and notify

After verifying the final handoff, confirm the open PR still matches the comparison named in the handoff. If the comparison changed, report the mismatch and stop before changing the PR status. On diagnosis paths, require `VERIFIED` for that final comparison before marking a draft ready. If verification fails or is inconclusive, report the handoff link, current PR status, and blocker, then stop.

Unless the user asked to keep the PR in draft, mark it ready for review with authenticated `gh pr ready NUMBER` or the equivalent GitHub MCP operation. Skip the mutation if the PR is already ready. Verify the resulting status. If the transition fails, report the blocker and resume at this step when it is resolved. Then write the Ready row to the ledger (outcome and time only).

Send the user the PR and final handoff links with the verified PR status and the run total (tokens and cost, or why unavailable), using a push notification if the harness offers one and a chat update otherwise. Stop here and wait for interactive follow-up.

## 8. Stop and resume on a usage limit

Keep a checkpoint in harness task state or scratch space as the run progresses. Record the entry path, checkout, approved spec, build estimate and the builder's model and effort, branch and PR, last completed step, PR status, round and reviewed comparison, findings and fix outcomes, and links to reviews, replies, and conversation comments as they become available. For diagnosis paths, include the source report, approved diagnosis, reproduction, tested comparison or commits, and verification outcomes. Record the final handoff comparison and each stage's start and end timestamps, usage-report JSON, and ledger rows.

On a usage limit, stop starting new work. If the PR exists and the harness still permits a GitHub write, post a PR comment with the step and round where work stopped, the relevant comparison or findings, and the next step to resume. If the limit prevents posting or precedes PR creation, keep the notice in the checkpoint and surface it to the user when possible. On resume, post the notice once a PR and write access are available. Check current GitHub state and the checkpoint before retrying a push, review, comment, or ready-for-review transition. Before republishing a round, look for a review and replies for the same round and reviewed comparison. Record existing links and publish only missing results. Resume from the first incomplete step using the existing PR and approval.

Record the harness, live session ID, launch directory, and any explicit transcript paths with each usage window. If resuming in a new session, resolve its ID and split any interrupted stage at the resume time. Rebuild the earlier portion with the original session's source and report the later portion with the new session's source. Sum measured portions across sessions and keep incomplete stages and run totals marked incomplete. Check the ledger against the checkpoint and fix missing rows.
