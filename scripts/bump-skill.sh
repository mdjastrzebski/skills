#!/usr/bin/env bash
# Bump a skill's version and update its CHANGELOG.md, once per branch.
#
# The target version is computed from the skill's version at the merge-base
# with the base branch, not from the current version. So running it again on
# the same branch never double-bumps: it raises the level if needed, renames
# the top changelog entry, and appends the bullet to it.
#
#   - not yet bumped on this branch: set the new version, add a new entry
#   - already bumped, level now higher: raise the version, rename the entry
#   - already bumped, same or lower level: keep the version, append the bullet
#
# A skill with no version at the base (new or pre-versioning) gets 0.1.0.
# `major` (including 0.x -> 1.0.0) is for the user only: it needs
# --user-approved, and agents must not pass it without the user's say-so.
#
# Usage: scripts/bump-skill.sh <name> <patch|minor|major> [-m "<changelog bullet>"]
#                              [--user-approved] [--base <ref>]
# The skill is found in skills/<name> or skills/legacy/<name>. --base defaults
# to origin/main (main if there is no such remote ref), so unpushed commits on
# main count as one branch. Without -m a new entry gets a "TODO: describe
# change" bullet.
# Exit codes: 0 ok, 1 usage or validation error.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo/scripts/skill-base-path.sh"
version_re='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

die() { echo "$*" >&2; exit 1; }
usage() { die "usage: scripts/bump-skill.sh <name> <patch|minor|major> [-m \"<bullet>\"] [--user-approved] [--base <ref>]"; }

name="" level="" message="" approved=0 base="main"
if git -C "$repo" rev-parse --verify --quiet "origin/main^{commit}" >/dev/null; then
  base="origin/main"
fi
positional=0
while [ $# -gt 0 ]; do
  case "$1" in
    -m) [ $# -ge 2 ] || usage; message="$2"; shift 2 ;;
    --base) [ $# -ge 2 ] || usage; base="$2"; shift 2 ;;
    --user-approved) approved=1; shift ;;
    -h|--help) usage ;;
    -*) usage ;;
    *)
      positional=$((positional + 1))
      case "$positional" in
        1) name="$1" ;;
        2) level="$1" ;;
        *) usage ;;
      esac
      shift
      ;;
  esac
done
[ -n "$name" ] && [ -n "$level" ] || usage
case "$level" in patch|minor|major) ;; *) die "level must be patch, minor, or major" ;; esac
if [ "$level" = "major" ] && [ "$approved" -ne 1 ]; then
  die "major bumps need the user's approval; ask the user, then pass --user-approved"
fi

# Locate the skill.
active="$repo/skills/$name"
legacy="$repo/skills/legacy/$name"
if [ -f "$active/SKILL.md" ] && [ -f "$legacy/SKILL.md" ]; then
  die "ambiguous: $name exists in both skills/ and skills/legacy/"
elif [ -f "$active/SKILL.md" ]; then
  dir="$active"
elif [ -f "$legacy/SKILL.md" ]; then
  dir="$legacy"
else
  die "skill '$name' not found in skills/ or skills/legacy/"
fi
skill_md="$dir/SKILL.md"
changelog="$dir/CHANGELOG.md"

# read_version: print metadata.version from SKILL.md frontmatter on stdin.
read_version() {
  awk '
    NR == 1 { if ($0 !~ /^---[ \t\r]*$/) exit; next }
    /^---[ \t\r]*$/ { exit }
    /^metadata:[ \t\r]*$/ { inmeta = 1; next }
    inmeta && /^[^ \t]/ { inmeta = 0 }
    inmeta && /^[ \t]+version:/ {
      v = $0
      sub(/^[ \t]+version:[ \t]*/, "", v)
      sub(/[ \t\r]+$/, "", v)
      print v
      exit
    }
  ' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# bump_version <version> <level>
bump_version() {
  local x y z
  IFS=. read -r x y z <<< "$1"
  case "$2" in
    patch) echo "$x.$y.$((z + 1))" ;;
    minor) echo "$x.$((y + 1)).0" ;;
    major) echo "$((x + 1)).0.0" ;;
  esac
}

# version_gt <a> <b>: true when a is strictly greater than b.
version_gt() {
  local ax ay az bx by bz
  IFS=. read -r ax ay az <<< "$1"
  IFS=. read -r bx by bz <<< "$2"
  [ "$ax" -ne "$bx" ] && { [ "$ax" -gt "$bx" ]; return; }
  [ "$ay" -ne "$by" ] && { [ "$ay" -gt "$by" ]; return; }
  [ "$az" -gt "$bz" ]
}

# Base version, from the merge-base with <base>.
git -C "$repo" rev-parse --verify --quiet "$base^{commit}" >/dev/null \
  || die "base '$base' does not resolve to a commit"
base_commit="$(git -C "$repo" merge-base HEAD "$base" 2>/dev/null)" \
  || die "no merge-base between HEAD and '$base'"

base_path="$(skill_base_path "$repo" "$base_commit" "${dir#"$repo"/}/SKILL.md")"
base_ver=""
if [ -n "$base_path" ]; then
  base_ver="$(read_version < <(git -C "$repo" show "$base_commit:$base_path"))"
fi
[[ "$base_ver" =~ $version_re ]] || base_ver=""

if [ -n "$base_ver" ]; then
  target="$(bump_version "$base_ver" "$level")"
else
  target="0.1.0"
fi

cur="$(read_version < "$skill_md")"
[[ "$cur" =~ $version_re ]] || cur=""

# Bullet text: strip a leading "- " so it is not doubled.
bullet=""
if [ -n "$message" ]; then
  bullet="- ${message#- }"
fi

# Decide what to do.
#   new     set version, add a new changelog entry
#   rename  set version, rename the top changelog entry, append bullet
#   append  keep version, append bullet to the top entry
if [ -z "$cur" ] || [ "$cur" = "$base_ver" ]; then
  action="new"
  new_ver="$target"
elif [ -z "$base_ver" ] && [ "$cur" != "$target" ]; then
  action="rename"
  new_ver="$target"
elif version_gt "$target" "$cur"; then
  action="rename"
  new_ver="$target"
else
  action="append"
  new_ver="$cur"
fi

# Without a usable top entry there is nothing to rename or append to.
if [ "$action" != "new" ] && { [ ! -f "$changelog" ] || ! grep -q '^## ' "$changelog"; }; then
  action="new"
fi
if [ "$action" = "new" ] && [ -z "$bullet" ]; then
  bullet="- TODO: describe change"
fi

today="$(date +%Y-%m-%d)"

# Rewrite metadata.version in SKILL.md, adding the block if missing.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk -v vline="  version: \"$new_ver\"" '
  NR == 1 && /^---[ \t\r]*$/ { fm = 1; print; next }
  fm == 1 {
    if ($0 ~ /^---[ \t\r]*$/) {
      if (!done) {
        if (!hasmeta) print "metadata:"
        print vline
        done = 1
      }
      fm = 2
      print
      next
    }
    if ($0 ~ /^metadata:[ \t\r]*$/) { hasmeta = 1; inmeta = 1; print; next }
    if (inmeta && $0 ~ /^[^ \t]/) {
      if (!done) { print vline; done = 1 }
      inmeta = 0
    }
    if (inmeta && !done && $0 ~ /^[ \t]+version:/) { print vline; done = 1; next }
    print
    next
  }
  { print }
' "$skill_md" > "$tmp"
cat "$tmp" > "$skill_md"

# Edit CHANGELOG.md: new entry, rename the top entry, or append to it.
[ -f "$changelog" ] || printf '# Changelog\n' > "$changelog"
awk -v mode="$action" -v version="$new_ver" -v date="$today" -v bullet="$bullet" '
  { L[NR] = $0 }
  END {
    n = NR; top = 0; nxt = n + 1
    for (i = 1; i <= n; i++) {
      if (L[i] ~ /^## /) {
        if (!top) top = i
        else { nxt = i; break }
      }
    }
    if (mode == "new") {
      ins = top ? top : n + 1
      for (i = 1; i < ins; i++) print L[i]
      if (!top && n > 0 && L[n] != "") print ""
      print "## " version " (" date ")"
      print ""
      print bullet
      if (top) {
        print ""
        for (i = top; i <= n; i++) print L[i]
      }
    } else {
      if (mode == "rename") sub(/^##[ \t]+[^ \t]+/, "## " version, L[top])
      last = top
      for (i = top + 1; i < nxt; i++) if (L[i] != "") last = i
      for (i = 1; i <= last; i++) print L[i]
      if (bullet != "") {
        if (last == top) print ""
        print bullet
      }
      for (i = last + 1; i <= n; i++) print L[i]
    }
  }
' "$changelog" > "$tmp"
cat "$tmp" > "$changelog"

shown_old="${cur:-none}"
if [ "$action" = "append" ]; then
  echo "$name: already at $cur on this branch"
else
  echo "$name: $shown_old -> $new_ver"
fi
echo "changelog: ${changelog#"$repo"/}"
