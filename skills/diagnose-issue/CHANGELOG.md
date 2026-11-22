# Changelog

## 0.4.0 (2026-11-22)

- Replace the Factory-specific existing-PR rules with a generic headless PR mode: a caller passes a PR with pinned base and head SHAs and gets the report back, with the same supported-setup, integration, `NEEDS_INFO` and `INCONCLUSIVE` rules. Posting a reply still needs your explicit approval.

## 0.3.1 (2026-11-21)

- Hand `CONFIRMED` fix plans to `implement-spec`.

## 0.3.0 (2026-11-21)

- Start Factory PR diagnosis with a supported setup and compare the pinned base with the candidate changes.

## 0.2.0 (2026-11-21)

- Accept an issue, a PR, or both. Discover linked issues for PR-only input and verify the fix against the same reproduction on the baseline and PR head.

## 0.1.0 (2026-11-21)

- Initial release.
