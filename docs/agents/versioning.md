# Versioning

Use this guide when changing anything under `skills/`, or adding, moving, or retiring a skill.

## Where Versions Live

- Every skill has its own semver in `SKILL.md` frontmatter, as a quoted string after `description`:

```yaml
metadata:
  version: "0.1.0"
```

- Every skill has a `CHANGELOG.md` next to its `SKILL.md`, newest entry first. The first `## ` heading is the current version and must equal `metadata.version`:

```markdown
# Changelog

## 0.1.0 (2026-11-20)

- Initial versioned release.
```

- Use ISO dates. Write bullets for people who installed the skill: what changed in behavior, not which lines moved.
- There is no repo-wide version or changelog. Changes limited to `README.md`, `docs/agents/`, `scripts/`, `.claude/`, or `.agents/` require no skill version bump.

## Bump Levels

| Level | Pre-1.0 (`0.y.z`) | 1.0 and later |
| --- | --- | --- |
| major | user only: moving to `1.0.0` | user only: breaking change (changed default scope, output location, or a removed mode or step users rely on) |
| minor | behavior change: trigger or description scope, a new, removed, or reordered workflow step, a new mode or default, a changed output location or format, a new or removed supporting file or script, anything breaking | backwards-compatible new capability |
| patch | wording, clarification, typo, tightening without changing intended behavior, a script bug fix that keeps its interface | fixes and wording |

## Rules

- Bump once per unit of unpushed work, relative to `origin/main` (its merge-base with `HEAD`), at the highest level any change in that unit needs. On a feature branch the unit is the branch; committing directly to `main`, it is every commit not yet pushed plus uncommitted changes. Further changes in the same unit amend that bump (raise the level if needed) and add bullets to the same changelog entry. Never bump twice.
- Run `scripts/check-versions.sh` before every commit and push, on `main` too; it is the only guard before a skill change reaches `origin/main` unbumped.
- If a feature branch collides with a bump that already landed on `main` (same version picked twice), fetch, rebase, and re-run `scripts/bump-skill.sh` to move the bump on top.
- The version bump and changelog entry land in the same change as the skill edit.
- Agents pick patch or minor only. Major bumps, including `0.x` to `1.0.0`, are the user's call: if a change to a 1.0+ skill looks breaking, stop and ask.
- A new skill starts at `0.1.0` with an "Initial release." entry and gets no further bump on the branch that creates it.
- Moving a skill into or out of `skills/legacy/` is a patch bump with the bullet "Moved to legacy." or "Revived from legacy."
- A renamed skill continues its old version and changelog. Make a pure `git mv` commit (include the updated discovery links) before editing content so Git can detect the rename. Then minor-bump the new name and start its changelog entry with “Renamed from `<old-name>`.” The pure move alone correctly fails the version check until the follow-up bump, so run the check before that commit, record the expected failure, and verify the complete branch before publishing.

## Scripts

```bash
scripts/bump-skill.sh <name> <patch|minor|major> [-m "<bullet>"] [--user-approved] [--base <ref>]
scripts/check-versions.sh [base]
```

- Both scripts default the base to `origin/main`, falling back to `main` when there is no such remote ref. Pass another base when needed.
- `bump-skill.sh` computes the target from the skill's version at the merge-base with the base, so re-running it on the same branch raises the level or appends a bullet, never double-bumps. It updates `metadata.version` and the changelog together. `major` needs `--user-approved`, which only the user's explicit approval justifies.
- `check-versions.sh` compares every skill, including uncommitted and untracked files, against the merge-base and exits 1 on any problem: missing or malformed version, changelog out of sync, a changed skill not bumped by exactly one step, or an unchanged skill whose version moved.
- Run `scripts/check-versions.sh` before finishing any change to a skill.
