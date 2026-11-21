# Changelog

## 0.6.0 (2026-11-21)

- Auto mode records findings the caller tags as pre-existing as `FOLLOW_UP` instead of fixing them, so they land in a separate change.
- Auto mode dispatches findings the caller rates `important` instead of deferring them as low-severity improvements, so the reviewer's rating carries into what gets fixed.

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
