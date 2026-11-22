# Changelog

## 0.5.0 (2026-11-22)

- Rename pipeline mode to headless mode; behavior is unchanged.
- Document `check`, `pin` and `built` as the interface other skills use to read specs and build records, with their JSON output.
- Describe `scope` as the approval reuse scope and use a neutral example.

## 0.4.0 (2026-11-22)

- Write the build estimate and scope as a visible `spec-meta` block in the summary, covered by the approval hash.
- Add `spec-record.mjs pin`, which verifies a saved spec and splits it into summary, full-spec and record files, and `built`, which reads a PR's `spec-built` block. Pin the complete document and record for revalidated legacy specs without usable `spec-meta`. Explicit user overrides can record builder efforts above high in `spec-meta`.
- Require a complete approval record before pinning a saved spec.
- Ignore embedded spec headings and build marker examples when parsing outer document structure.
- Reuse an approval without rereading the spec when nothing under `scope` changed, and post the outgoing revision as a collapsed issue comment before saving a new one.

## 0.3.0 (2026-11-22)

- Build recommendations now follow the Haiku, Sonnet, and Opus tiers: Sonnet level for simple and moderate builds, Opus level at high effort for hard ones, never `xhigh` or `max`, and frontier models (`fable`, `astra`) only when you explicitly ask.
- Allow a Haiku-level recommendation only for a purely mechanical edit with an exact pattern to copy and a check that proves it.

## 0.2.0 (2026-11-22)

- Renamed from `clarify-idea`.
- Save the full spec after summary approval to a GitHub issue in cloud sessions, or to the local user’s choice of `SPEC.md` or an issue.
- Write a plain local draft on request and fold user edits into the summary before approval.
- Stamp and check the approval record with the bundled helper. Revise a saved spec in place and validate its hash, branch, and grounding commit before a build.

## 0.1.0 (2026-11-21)

- Initial release.
