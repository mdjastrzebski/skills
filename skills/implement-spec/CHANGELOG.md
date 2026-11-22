# Changelog

## 0.4.0 (2026-11-22)

- Take a pinned spec by path, brief the builder with the file instead of pasted text, and read the build estimate from `spec-meta`.
- Build and publish from a legacy pin and accept an approved diagnosis plan by path.
- Describe the implementation in the draft PR with `Closes #N` and a `spec-built` block instead of repeating an issue spec under `## Spec rev N`; a local `SPEC.md` is kept collapsed in the PR.
- Write **Checks:** as a bullet list, one check per bullet, with a `Not run:` bullet for skipped checks.

## 0.3.0 (2026-11-22)

- Pick the builder from the Haiku, Sonnet, and Opus tiers: Sonnet level for simple and moderate builds, Opus level at high effort for hard ones, never `xhigh` or `max`. A recommendation above this policy is capped to Opus level at high effort, and a Haiku-level pick for more than a trivial mechanical edit moves up to Sonnet level, unless you explicitly asked for it; the builder never inherits the session's model or effort.
- Allow a Haiku-level builder only for a purely mechanical edit with an exact pattern to copy and a check that proves it.

## 0.2.0 (2026-11-22)

- Build on a supplied feature branch or update an existing PR and return the new commits.
- Validate saved specs through `prepare-spec` and keep `SPEC.md` out of all build commits.
- Include the revision-labelled spec in the draft PR and link a spec issue with `Closes #N`.

## 0.1.0 (2026-11-21)

- Initial release.
