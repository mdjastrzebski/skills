# Changelog

## 0.8.0 (2026-11-22)

- Accept an inline modifier that verifies and fixes issues in one context.
- Call verify-and-fix for single-issue verification and repair.

## 0.7.0 (2026-11-22)

- Run each fix worker on an explicit model and effort: Sonnet level at medium (high for subtle or cross-cutting issues), Opus level when high is not enough, never `xhigh` or `max`, and frontier models (`fable`, `astra`) only when you explicitly ask.
- Allow Haiku-level workers for nits whose verification and fix are mechanical, such as a typo, rename, formatting, or stale comment.

## 0.6.0 (2026-11-21)

- Auto mode records findings the caller tags as pre-existing as `FOLLOW_UP` instead of fixing them, even when rated `important`, so they land in a separate change.
- Auto mode dispatches findings the caller rates `important` and does not tag pre-existing instead of deferring them as low-severity improvements, so the reviewer's rating carries into what gets fixed.

## 0.5.0 (2026-11-21)

- Accept an explicit empty findings list in auto mode and return a zero-count round summary.
- Treat a findings list supplied by a calling workflow as a pasted-list run: no PR fetch, push, or replies, even when items link PR comments.

## 0.4.0 (2026-11-21)

- Read GitHub feedback and post replies through GitHub MCP when gh is unavailable.

## 0.3.0 (2026-11-21)

- Add opt-in auto mode with severity filtering, automatic PR replies, and round summaries.
- Auto mode round 2 skips threads and comments already handled in round 1, and auto-mode PR summaries list only PR-sourced items.

## 0.2.0 (2026-11-21)

- Delegate individual fixes to fix-issue, with inline instructions when the skill or subagents are unavailable.

## 0.1.0 (2026-11-20)

- Initial versioned release.
