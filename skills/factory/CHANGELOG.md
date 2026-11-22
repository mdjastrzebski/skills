# Changelog

## 0.11.0 (2026-11-22)

- Use stage owners when the harness supports nested subagents, with automatic flat and inline fallbacks.
- Prepare stage diagnostics, checkpoints, comparisons, commit verification, and publishing files with a local helper.
- Use verify-and-fix for hard findings and handle routine findings together.
- Resume interrupted fixes from saved verdicts and verified local commits in every execution mode.
- Assign round IDs after splitting compound findings and merging duplicate reports.
- Recover a completed push and its review inputs if the round stops before publication.
- Recover corrective commits and verify that the final diff retains only the in-scope edits.

## 0.10.0 (2026-11-22)

- Set an explicit model and effort policy for every subagent and reviewer Factory launches: Sonnet level (`sonnet`/`terra`) by default, Opus level (`opus`/`sol`) at high effort for the reviewer, never `xhigh` or `max`, and frontier models (`fable`, `astra`) only when you explicitly ask.
- Allow Haiku-level models (`haiku`/`luna`) only for narrow, mechanical, easily checked subtasks; never for specs, reviews, or judging findings.

## 0.9.0 (2026-11-22)

- Use a saved spec to build a draft PR, adjust its existing PR, or report that the PR already matches.
- Pin the approved revision for build and review. At handoff, report any newer spec.
- Find PRs by their spec issue or local feature branch. Link issue specs with `Closes #N` and preserve the evidence trail across adjustments.
- Delegate all writes to the spec store to `prepare-spec`.

## 0.8.0 (2026-11-21)

- Give the reviewer the repo's review guidance (root `REVIEW.md`, else `AGENTS.md` or `CLAUDE.md`) from the PR's merge base so proposed changes to guidance cannot set their own review rules. Prefer a reviewer separate from the build, tag pre-existing findings, and name the reviewer and guidance in each round review.
- Round 2 reviews the fix commits from round 1 with the full PR diff as context when the reviewed head is an ancestor and the base ref and merge base still match. Otherwise it reviews the current full PR diff and rechecks the round 1 fixes. The handoff lists pre-existing findings under Follow-ups for a separate change.
- Run one reviewer by default, on the most capable model available. Add up to three focused reviewers only when the user or the repo's review guidance asks for them, and name each reviewer and focus in the round review.
- Round 2 uses a fresh review subagent given the range and full PR diff when the harness reviewer cannot target a commit range, and says so in the round review. The resume checkpoint records each round's reviewed comparison, round 2's scope, each reviewer and its focus, and the guidance files used.
- Round 2 tags a finding as pre-existing only when the PR's merge base already had the problem. A problem the PR introduced that round 1 missed stays a normal finding, marked missed by round 1, instead of becoming a follow-up.
- Use the harness reviewer only when it can take the brief and the review guidance; otherwise use a fresh review subagent given them, so the repo's guidance always reaches the reviewer.
- The reviewer rates each finding `important` or `nit`, and Factory passes the rating to `fix-issues` so findings rated important are verified and fixed rather than deferred.

## 0.7.0 (2026-11-21)

- Split the build stage: `clarify-idea` produces the approved spec and build estimate, and `implement-spec` builds it in a subagent at the recommended model and effort. The ledger records a separate Spec stage for idea and supplied spec inputs, and the Build outcome names the builder's model and effort.
- When `implement-spec` stops for fresh approval (unapproved input, a material deviation, or a reproduction that no longer fails), reopen spec or diagnosis approval and record the stage in the ledger. Recheck a reproduction mismatch on the build base before asking for approval of a revised fix plan. Rerun the build after the user approves the updated plan.
- Record stopped and reopened Build, Spec, and Diagnosis stages in the ledger and Summary 1, and on the issue path fold a build's proposed change into the fix plan before asking for fresh approval.

## 0.6.0 (2026-11-21)

- Validate supplied implementation specs, show a short spec summary, clarify gaps that affect the build, and continue through the build pipeline after the user approves the spec.
- Drop the owner-applied label check from the issue path: a user's Factory request selects the issue.
- Return existing-PR diagnosis in chat by default. Run the PR review and fix pipeline on explicit request.

## 0.5.0 (2026-11-21)

- Run Factory on an existing PR and discover its linked issue. Route remaining fix gaps through review and verify the final commit before marking a draft ready.

## 0.4.0 (2026-11-21)

- Add an evidence-trail ledger to the PR description that links every stage's comment, review, or commit with its outcome. The ledger is rewritten in batches (after Build, each review round, the final handoff, and Ready) to limit PR description rewrites. It sits in a collapsed panel, and published times use the UTC `Nov 21 12:00` format.
- Factory adds no harness or model attribution ("Generated by …" footers, 🤖 lines, session links, `Co-Authored-By` trailers) to its PR description, comments, reviews, or commits.
- Add per-stage Diagnostics (models, tokens, cost) to each comment and review, and a run total to the final handoff and notification, computed by the new `scripts/usage-report.mjs` from Claude Code and Codex transcripts. Never estimates missing data; unknown model prices are reported as unknown. Stage windows are contiguous, from factory invocation, so the run total equals the sum of the stages. Factory records its session id and passes it to the script so concurrent sessions in one repo are not mixed up. Claude messages over the 100K-token prompt tier of Haiku 5.5 are priced at its long-context rates, and fast-mode messages are reported as `<model> (fast)` and priced at fast input and output rates (built in for Opus 5.5 and Fable 5.2; otherwise unknown). Fast cache rates are not published, so fast messages with cache tokens are unknown unless `--prices` supplies them.
- Codex fork rollouts (`forked_from_id`) no longer double count the parent: token_count events before the fork's own `session_meta` timestamp are ignored and the first remaining total is only a baseline. Usage-report `--since`/`--until` must be UTC (`Z`, `±HH:MM`) or a date only; a date-time without an offset is rejected.
- Codex discovery now counts subagents of subagents (all transitive descendants of the main session), matching the Claude adapter. A forked Codex session (`forked_from_id` only) can now be picked as the main session; only spawned subagents are excluded from main candidates and counted as descendants.
- Bind usage reports to the live session, including after a resume. Accept verified Codex rollout exports and configured prices, and report unreadable usage as unavailable.

## 0.3.0 (2026-11-21)

- Post a GitHub review after each completed review-and-fix round, with the reviewed commit, findings, and checks.
- Fall back from the harness reviewer to a fresh review subagent, then to a direct diff review.
- If the PR head moves before fixes start, re-review the new head once within the same round, then stop.
- Mark the PR ready for human review after the internal rounds and verified final handoff.

## 0.2.0 (2026-11-21)

- Add an owner-labeled issue path with diagnosis approval and a reproduction-first build.

## 0.1.0 (2026-11-21)

- Initial release.
