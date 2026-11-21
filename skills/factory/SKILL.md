---
name: factory
description: Use when the user asks to run factory on a feature idea, or to take an idea through spec approval, a draft PR, automated review and fix rounds, and a final handoff on the PR.
metadata:
  version: "0.1.0"
---

# Factory

Coordinate the pipeline. Use `implement-idea` for the build, `summarize-changes` for its facts, a reviewer for findings, and `fix-issues` for triage and fixes. Load companion skills from the harness or their canonical `skills/<name>/SKILL.md` in the same skills release. If a required skill or capability is unavailable, report the blocked stage and how to resume.

Factory invocation authorizes publishing the draft PR, pushing its fixes, and posting the pipeline's PR comments. After spec approval, proceed through handoff without routine user input. Keep the PR in draft for final human review.

## 1. Build from an idea

Pass the idea and target repo to `implement-idea` in pipeline mode. Wait for explicit user approval of the spec inside that skill. Continue only after it returns a verified draft PR and build commit. Use its checkout and PR refs for the rest of the run.

## 2. Post Summary 1

Run `summarize-changes` through its facts stage against the draft PR. Post the returned facts in a PR conversation comment titled `Summary 1`, with the build commit so the reader can identify the diff. Use authenticated `gh` or the equivalent GitHub MCP conversation comment tool for PR comments. Verify that the comment was posted before starting review.

## 3. Review the current PR head

Use the harness's reviewer (for example, `code-review`) when available. Otherwise start a fresh review subagent for this round. Give the reviewer the approved spec, PR URL, base ref, current head SHA, and this brief:

> Review the PR diff against the approved spec and repo conventions. Look for concrete defects, regressions, and missing verification that could mask them. Return a list or post PR review comments. For each finding give the location, evidence, impact, and what needs to change. Report open questions separately and explicitly report an empty findings list when there are none. Leave the checkout untouched.

Wait for the result. If the reviewer posted comments, read that round's review and threads to collect the findings and keep their links. Pass the findings as one list, excluding duplicates and retaining the reviewer, location, and source when available. An unavailable or failed review blocks this step.

## 4. Fix the findings

Run `fix-issues` in auto mode with the explicit findings list (even when empty) and the round number, as a pasted-list run rather than a PR run, so the scope is this review's findings. `fix-issues` then commits without pushing or replying on the PR; factory owns publication. Capture the verdicts, reasons, checks, and fix commits. Push any new commits before using them in a review or report. If publication fails or the fix skill cannot complete the round, record the blocker and resume here when it is resolved. Individual failed or deferred findings go in the handoff.

If round 1 publishes any fix commits, repeat steps 3–4 exactly once as round 2 against the updated PR head. Otherwise go to step 5. Keep both rounds' outcomes and note any work left for human review.

## 5. Post the final handoff

Run the facts stage of `summarize-changes` again against the final published PR head. Post a `Final handoff` PR conversation comment with the final commit, facts, checks, and these sections:

- **Review verdicts** — a table with round, finding, verdict, and commit or reason. Link source comments where available. Record a clean round explicitly.
- **Deferred items** — remaining work, including failures and why each item is still open.
- **Open questions** — decisions or verification still needed from the reviewer.
- **Where to look first** — the suggested review order from the facts and the key files to start with.

Use `None` for empty sections. Verify publication and keep the comment URL.

## 6. Notify and wait

Send the user the draft PR and final handoff links, using a push notification if the harness offers one and a chat update otherwise. Stop here and wait for interactive follow-up.

## 7. Stop and resume on a usage limit

Keep a checkpoint in harness task state or scratch space as the run progresses. Record the checkout, approved spec, branch and PR, last completed step, round and reviewed SHA, findings and fix outcomes, and published comment links as they become available.

On a usage limit, stop starting new work. If the PR exists and the harness still permits a GitHub write, post a PR comment with the step and round where work stopped, the relevant SHA or findings, and the next step to resume. If the limit prevents posting or precedes PR creation, keep the notice in the checkpoint and surface it to the user when possible. On resume, post the notice once a PR and write access are available. Check current GitHub state and the checkpoint before retrying a push, review, or comment. Resume from the first incomplete step using the existing draft and approval.
