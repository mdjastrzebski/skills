# Changelog

## 0.2.0 (2026-11-22)

- Post reviews in Factory's Review Round layout (labelled bullets plus a Finding, Severity, Difficulty, Verdict and Commit table) with a collapsed Diagnostics block, and write finding IDs on GitHub as `F1` so GitHub does not link them to issues.
- Drop the attribution rule; harness tools add their own footers.
- Write **Checks:** as a bullet list, one check per bullet, with a `Not run:` bullet for skipped checks.
- Link table findings to their inline comments by updating the review body after submission, since GitHub assigns the comment URLs only then.

## 0.1.0 (2026-11-22)

- Initial release.
