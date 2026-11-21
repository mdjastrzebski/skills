# Changelog

## 0.4.0 (2026-11-21)

- Add an evidence-trail ledger to the PR description that links every stage's comment, review, or commit with its outcome.
- Add per-stage Diagnostics (models, tokens, cost) to each comment and review, and a run total to the final handoff and notification, computed by the new `scripts/usage-report.mjs` from Claude Code and Codex transcripts. Never estimates missing data; unknown model prices are reported as unknown. Factory records its session id and passes it to the script so concurrent sessions in one repo are not mixed up.

## 0.3.0 (2026-11-21)

- Post a GitHub review after each completed review-and-fix round, with the reviewed commit, findings, and checks.
- Fall back from the harness reviewer to a fresh review subagent, then to a direct diff review.
- If the PR head moves before fixes start, re-review the new head once within the same round, then stop.
- Mark the PR ready for human review after the internal rounds and verified final handoff.

## 0.2.0 (2026-11-21)

- Add an owner-labeled issue path with diagnosis approval and a reproduction-first build.

## 0.1.0 (2026-11-21)

- Initial release.
