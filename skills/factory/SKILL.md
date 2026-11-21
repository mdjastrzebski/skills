---
name: factory
description: Use when the user asks to run factory on a feature idea or an owner-labeled GitHub issue. Takes the work through spec or diagnosis approval, a draft PR, automated review and fix rounds, and a final handoff on the PR.
metadata:
  version: "0.3.0"
---

# Factory

Coordinate the pipeline. Use `diagnose-issue` for the diagnosis, `implement-idea` for the build, `summarize-changes` for its facts, a reviewer for findings, and `fix-issues` for triage and fixes. Load companion skills from the harness or their canonical `skills/<name>/SKILL.md` in the same skills release. If a required skill or capability is unavailable, report the blocked stage and how to resume.

Factory invocation authorizes publishing the draft PR, pushing its fixes, and posting the pipeline's PR comments. After spec or diagnosis approval, proceed through handoff without routine user input. Keep the PR in draft for final human review.

## 1. Build

### Idea path

Pass the idea and target repo to `implement-idea` in pipeline mode. Wait for explicit user approval of the spec inside that skill. Continue only after it returns a verified draft PR and build commit. Use its checkout and PR refs for the rest of the run.

### Issue path

1. Resolve the supplied GitHub issue and verify a current label was applied by the repository owner. Read the issue's labels and GitHub label events (for example, `gh api repos/OWNER/REPO/issues/NUMBER/events --paginate` or the equivalent GitHub MCP timeline reader). If the user specified a label, check that one; otherwise check each current label. For each checked label, use its most recent `labeled`/`unlabeled` event: it must be `labeled`, and its actor must be the repository owner account or, for an organization-owned repository, an organization owner (for example, `gh api orgs/ORG/memberships/ACTOR` returns `role: admin`). If the owner-applied label cannot be verified, stop before diagnosis and explain the missing evidence.
2. Run `diagnose-issue`. Present the verdict, evidence, and proposed next step and wait for the user's explicit diagnosis approval. For `CONFIRMED`, offer the full fix plan with the summary for approval together. For any other verdict, stop at the approved diagnosis. Keep any drafted issue reply in chat unless the user explicitly approves posting it. Factory's PR authorization applies only to the PR.
3. For an approved `CONFIRMED` diagnosis, pass the approved full plan and summary to `implement-idea` in pipeline mode as the approved spec, including the issue URL, baseline, and reproduction. Build from the diagnosed base and verify that the reproduction fails for the diagnosed reason before changing the implementation. If the base has moved and the diagnosis materially changes, return to diagnosis approval. Verify that the same reproduction passes with the fix. Link the issue in the PR body without a closing keyword such as `Fixes`, so merging does not close it automatically.
4. When `implement-idea` returns the draft PR and build commit, continue at [2. Post Summary 1](#2-post-summary-1).

## 2. Post Summary 1

Run `summarize-changes` through its facts stage against the draft PR. Post the returned facts in a PR conversation comment titled `Summary 1`, with the build commit so the reader can identify the diff. Use authenticated `gh` or the equivalent GitHub MCP conversation comment tool for PR comments. Verify that the comment was posted before starting review.

## 3. Review the current PR head

Read the current head SHA and base ref from the draft PR. Use the harness reviewer (for example, `code-review`) when available, then a fresh review subagent, then direct diff review if neither is available. Review that exact head against the approved spec and base. Give the reviewer the approved spec, PR URL, base ref, head SHA, and this brief:

> Review the PR diff against the approved spec and repo conventions. Look for concrete defects, regressions, and missing verification that could mask them. Return findings to Factory for publication. For each finding give the location, evidence, impact, and what needs to change. Report open questions separately and explicitly return an empty list for a clean review. Leave the checkout untouched.

Wait for evidence that the exact diff was reviewed before proceeding. If the reviewer already posted findings, read that round's review and threads and keep their links. Collect one deduplicated list, retaining the reviewer, location, and source when available.

## 4. Fix the findings

Run `fix-issues` in auto mode with the explicit findings list (even when empty) and the round number. Use its pasted-list workflow, which delegates verification and repair to `fix-issue` and leaves publication to Factory. Capture the verdicts, reasons, checks, and fix commits. Push verified fix commits to the PR head branch before citing them. If the push fails or the fix skill cannot complete the round, record the blocker and resume here when it is resolved. Individual failed or deferred findings go in the handoff.

## 5. Post the round review

Post one concise GitHub review with the round number, reviewed SHA, and check summary. Set the GitHub review's commit ID (`commit_id` in the REST API) to the reviewed SHA when supported. Anchor findings inline on the reviewed diff where possible. Give the issue, impact, and disposition in one or two plain-language sentences for each finding. Cite its fix commit only after the push succeeds. For a finding the reviewer already published, reply with the outcome in the existing thread. When there is no usable thread, link to the existing finding and give its outcome in the review body. Put new findings in the review body when the tool cannot target the reviewed diff, there is no usable inline position, or GitHub rejects their anchors. For an empty round, post a brief clean result.

Verify the review and any replies on GitHub and record their links in the checkpoint before advancing. If round 1 pushed fix commits, repeat steps 3–5 once against the updated PR head. Otherwise go to step 6. Keep both rounds' outcomes and note any work left for human review.

## 6. Post the final handoff

Run the facts stage of `summarize-changes` again against the final published PR head. Post a `Final handoff` PR conversation comment with the final commit, facts, checks, and these sections:

- **Review verdicts** — a table with round, finding, verdict, and commit or reason. Link each round's review and any replies or source comments. Record a clean round explicitly.
- **Deferred items** — remaining work, including failures and why each item is still open.
- **Open questions** — decisions or verification still needed from the reviewer.
- **Where to look first** — the suggested review order from the facts and the key files to start with.

Use `None` for empty sections. Verify publication and keep the comment URL.

## 7. Notify and wait

Send the user the draft PR and final handoff links, using a push notification if the harness offers one and a chat update otherwise. Stop here and wait for interactive follow-up.

## 8. Stop and resume on a usage limit

Keep a checkpoint in harness task state or scratch space as the run progresses. Record the checkout, approved spec (and, on the issue path, the owner-label evidence and approved diagnosis), branch and PR, last completed step, round and reviewed SHA, findings and fix outcomes, and links to reviews, replies, and conversation comments as they become available.

On a usage limit, stop starting new work. If the PR exists and the harness still permits a GitHub write, post a PR comment with the step and round where work stopped, the relevant SHA or findings, and the next step to resume. If the limit prevents posting or precedes PR creation, keep the notice in the checkpoint and surface it to the user when possible. On resume, post the notice once a PR and write access are available. Check current GitHub state and the checkpoint before retrying a push, review, or comment. Before republishing a round, look for a review and replies for the same round and reviewed SHA. Record existing links and publish only missing results. Resume from the first incomplete step using the existing draft and approval.
