# Changelog

## 0.3.0 (2026-11-22)

- Add Round mode, a headless review round for a calling workflow: review a pinned PR comparison with strong-tier reviewers, fix the findings through `fix-issues` in auto mode, verify and push or keep the fixes, and return the `## Review Round N` review and thread replies for the caller to publish.
- Use one review layout for standalone reviews and review rounds, with a shared procedure for posting a review and linking its findings to their inline comments. A clean review says `No findings.` and skipped checks get a `Not run:` bullet.
- Build Diagnostics with the factory helpers when installed, without depending on Factory's own rules.

## 0.2.0 (2026-11-22)

- Post reviews in Factory's Review Round layout (labelled bullets plus a Finding, Severity, Difficulty, Verdict and Commit table) with a collapsed Diagnostics block, and write finding IDs on GitHub as `F1` so GitHub does not link them to issues.
- Drop the attribution rule; harness tools add their own footers.
- Write **Checks:** as a bullet list, one check per bullet, with a `Not run:` bullet for skipped checks.
- Link table findings to their inline comments by updating the review body after submission, since GitHub assigns the comment URLs only then.

## 0.1.0 (2026-11-22)

- Initial release.
