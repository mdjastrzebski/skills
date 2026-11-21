---
name: setup-factory
description: Use when the user asks to set up or check Factory in a GitHub repository. Defaults to installing Factory and its companion skills in the current checkout. Supports a read-only check, optional issue intake, and a setup PR on request.
metadata:
  version: "0.1.0"
---

# Setup Factory

Prepare a GitHub repository for interactive `factory` runs. Setup installs the skills and fills gaps in the repo's agent instructions. The first Factory run still requires the user's approval of the spec or diagnosis.

- `$setup-factory` prepares the current checkout. Accept a checkout path or GitHub repository as a target.
- `$setup-factory check` reports readiness without cloning, fetching, installing, editing files, or writing to GitHub. If there is no local checkout, check what you can read remotely and report local checks as unavailable.
- `$setup-factory and open a draft setup PR` also publishes the portable setup changes. Issue intake is optional. Accept a named existing label or an explicit request to create one. Publish the PR and create the label only when each operation was separately requested. When a request combines `check` with setup, publication, or label creation, run only the read-only check.

## 1. Resolve the target and check access

1. Identify the checkout root, GitHub host and repository, default branch, and fetch and push remotes. Compare the supplied target with the remote URLs, including any different push URL. Use host-specific GitHub metadata (for example, `gh repo view HOST/OWNER/REPO --json nameWithOwner,defaultBranchRef,isFork,parent,hasIssuesEnabled,viewerPermission`) or confirm the Git default branch with `git ls-remote --symref REMOTE HEAD`. In a fork, identify both the fork and its upstream and verify which one is the intended target. Ask only if intent is still ambiguous. Verify the target and default branch before writing. In setup mode only, create an isolated clone when there is no matching checkout and report its path.
2. Read the repo's agent instructions, contributor docs, manifests and CI. Identify prerequisites, working directories, install and check commands, branch and PR conventions, and project skill directories. Default to the current agent harness. Check that the workspace can support an isolated Git checkout and a build branch from the target base. In check mode, use read-only inspection, including `git --no-optional-locks status --short`, and skip build commands and installers.
3. Verify Git transport and GitHub API access separately. Read the target ref over Git and identify the account used by authenticated `gh` (for example, `gh api --hostname HOST user --jq .login`) or the available GitHub integration. Use that route to check repository visibility, the identity's reported access, and branch or organization restrictions where visible. Factory needs to push a branch and to create draft PRs, edit PR descriptions, post comments, reviews and replies, and mark PRs ready. Treat repository roles and token or integration capabilities as evidence, and mark any write that cannot be verified read-only as unverified. Create no test branch, PR, comment or label. An API or write-access gap can still leave local setup usable.
4. For issue intake, also check whether Issues is enabled, whether a requested label exists, and whether the available GitHub route can read issue label events and verify the owner's identity. Use an existing issue or organization owner supplied by the user for more specific read-only checks when available. For example, read `repos/OWNER/REPO/issues/NUMBER/events` with `gh api --paginate` and, for an organization, check that `orgs/ORG/memberships/ACTOR` returns `role: admin`. Report issue-specific gaps separately so they do not block idea setup.
5. In setup mode, if the user requested a setup PR, use a dedicated branch in an isolated checkout before installing or editing. Start from a verified existing setup PR head you can safely update, or from the target's default or explicitly requested base. Verify the head and base repositories and refs, and leave the original checkout intact. If setup already ran locally, use its verified bundle revision and carry forward only the intended portable changes. If publication is blocked but local setup is possible, complete the local setup and report the blocker.

## 2. Install and verify the project bundle

Use the target repo's established installation convention. Inventory the runtime skills and their resources in the discovery paths of the requested harnesses. Use the same source revision for `factory`, `diagnose-issue`, `implement-idea`, `summarize-changes`, `fix-issues`, and `fix-issue`. Reuse a complete, verified bundle unless the user asks to upgrade. Repair an incomplete installation from its recorded revision when it can be verified. For a mix of unmodified releases, align them to the requested revision or the source repo's default-branch commit. Inspect existing files, links, provenance and local changes before installing or reconciling. If a path or shared lockfile conflicts with existing changes or a custom installation, preserve it, report what conflicts, and continue with independent setup work.

In check mode, report what's missing or inconsistent and skip to the handoff. For a new install without a repo convention, use the project scope of the `skills` CLI. Resolve the requested revision, or the skills repo's default-branch commit, once. Replace `COMMIT_SHA` with that full commit ID and set `--agent` to the requested harness or harnesses (`codex`, `claude-code`, or both in this example). Run from the target repo root.

```bash
npx --yes skills add mdjastrzebski/skills@COMMIT_SHA \
  --skill factory diagnose-issue implement-idea summarize-changes fix-issues fix-issue \
  --agent codex claude-code --yes
```

Verify the six installed `SKILL.md` files and supporting files resolve in each selected harness's project discovery paths. Check the source revisions in the installer record when available, or compare the installed files with the chosen source. Include resources such as `factory/scripts/usage-report.mjs` when present in that revision. After a partial failure, inspect what installed before retrying from the same revision. Use a fresh agent session when the harness discovers skills only at startup.

## 3. Set up issue intake when requested

Reuse the requested label and its current description. If the user wants a dedicated label but has not named it, suggest `factory-ready`. Verify Issues is enabled and check the exact label through authenticated `gh` or GitHub tools. Distinguish a confirmed missing label from a failed read. Only create a missing label when the user explicitly asked to create it and the available identity can do so. Use `gh label create LABEL --repo HOST/OWNER/REPO` or the equivalent GitHub operation, then re-read it. If a retry or concurrent run finds the label already exists, reuse it. Label creation is independent of the setup PR.

Explain who must apply the label. Factory checks the most recent label event on the issue. The actor must be the repository owner for a personal repository or an organization owner for an organization repository. Give the explicit invocation `$factory ISSUE_URL using label LABEL`. Leave applying the label to an eligible owner.

## 4. Fill documentation gaps

Reuse the repo's agent instructions or linked contributor docs. Add missing, confirmed install and check commands, working directories, or branch and PR expectations where maintainers already look. Add a short Factory invocation example if it helps. Include the exact label once verified if issue intake was requested. Preserve existing content and skip edits that would duplicate it. Mark commands or prerequisites you could not verify as unverified.

Factory's usage diagnostics need Node and access to the live session's transcript or a verified export. A missing transcript or unavailable runtime leaves diagnostics unavailable. Keep transcripts and credentials out of the repo and PR. GitHub Actions, webhooks, and changes to branch protections, credentials, organization settings or permissions are outside setup.

## 5. Publish if requested and report

For a requested setup PR, stage only the portable setup changes. Follow the repo's convention for tracking skill files or installer lockfiles. Check that any tracked symlink resolves within the checkout. Keep unrelated changes and machine-specific paths out of the commit. Check the remote head and look again for an open PR for the same head repository, branch and base before pushing or retrying PR creation. Reuse an existing matching PR and preserve its draft or ready status. If there is no portable change to share, skip creating a PR. Otherwise, push only the setup branch to its verified remote and open a draft if needed. Verify the PR's refs and draft status with authenticated `gh` or equivalent GitHub tools. On a failed push or PR write, keep the completed local setup and report the blocker and the next step.

Report the target and checkout, source revision and six skills' discovery status, changed files, and checks. State idea readiness and, if requested, issue readiness. Distinguish verified access from unverified operations, link the PR or label if applicable, and give one next invocation, such as `$factory <feature idea>`. If the harness needs a fresh session to discover the skills, say so.
