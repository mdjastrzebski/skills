#!/usr/bin/env bash
# Check that every skill's version and CHANGELOG.md agree with the git history.
#
# For each skills/<name>/ and skills/legacy/<name>/ it checks that:
#   - SKILL.md has metadata.version as MAJOR.MINOR.PATCH
#   - CHANGELOG.md exists and its first `## ` heading is that version
#   - a skill changed since the base branch is exactly one step above its base
#     version (or exactly 0.1.0 if the base has no version), and an unchanged
#     skill keeps its base version
#
# "Changed" compares the working tree, including uncommitted and untracked
# files, to the merge-base of HEAD and <base>. Moving a skill between skills/
# and skills/legacy/ counts as a change.
#
# The default base is origin/main (main if there is no such remote ref), so
# the same rule covers feature branches and direct commits to main: everything
# not yet pushed to origin/main, committed or not, is one unit with one bump.
#
# Usage: scripts/check-versions.sh [base]    (base defaults to origin/main)
# Exit codes: 0 all OK, 1 problems found, 2 base does not resolve.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo/scripts/skill-base-path.sh"
if [ $# -ge 1 ]; then
  base="$1"
elif git -C "$repo" rev-parse --verify --quiet "origin/main^{commit}" >/dev/null; then
  base="origin/main"
else
  base="main"
fi

git_() { git -C "$repo" "$@"; }

if ! git_ rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  echo "base '$base' does not resolve to a commit" >&2
  exit 2
fi
if ! base_commit="$(git_ merge-base HEAD "$base" 2>/dev/null)"; then
  echo "no merge-base between HEAD and '$base'" >&2
  exit 2
fi

version_re='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

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

total=0
bad=0
errors=0
skill_errors=0

err() {
  echo "error  $1: $2"
  errors=$((errors + 1))
  skill_errors=$((skill_errors + 1))
}

for dir in "$repo"/skills/*/ "$repo"/skills/legacy/*/; do
  dir="${dir%/}"
  [ -f "$dir/SKILL.md" ] || continue
  name="$(basename "$dir")"
  total=$((total + 1))
  skill_errors=0

  if [ "$(dirname "$dir")" = "$repo/skills/legacy" ] && [ -f "$repo/skills/$name/SKILL.md" ]; then
    err "$name" "exists in both skills/ and skills/legacy/"
  fi

  # Rule 1: version present and well-formed.
  cur="$(read_version < "$dir/SKILL.md")"
  cur_ok=0
  if [ -z "$cur" ]; then
    err "$name" "SKILL.md has no metadata.version"
  elif [[ ! "$cur" =~ $version_re ]]; then
    err "$name" "metadata.version '$cur' is not MAJOR.MINOR.PATCH"
  else
    cur_ok=1
  fi

  # Rule 2: changelog top entry matches.
  if [ ! -f "$dir/CHANGELOG.md" ]; then
    err "$name" "CHANGELOG.md is missing"
  else
    top="$(awk '/^## /{print; exit}' "$dir/CHANGELOG.md")"
    if [ -z "$top" ]; then
      err "$name" "CHANGELOG.md has no '## <version>' heading"
    elif [ "$cur_ok" -eq 1 ]; then
      top_version="$(printf '%s\n' "$top" | sed -E 's/^##[[:space:]]+([^[:space:]]+).*/\1/')"
      if [ "$top_version" != "$cur" ]; then
        err "$name" "CHANGELOG.md top entry is $top_version but metadata.version is $cur"
      fi
    fi
  fi

  # Rules 3 and 4: compare with the base version.
  if [ "$cur_ok" -eq 1 ]; then
    base_path="$(skill_base_path "$repo" "$base_commit" "${dir#"$repo"/}/SKILL.md")"
    base_ver=""
    if [ -n "$base_path" ]; then
      base_ver="$(read_version < <(git -C "$repo" show "$base_commit:$base_path"))"
    fi
    [[ "$base_ver" =~ $version_re ]] || base_ver=""

    changed=0
    paths=("skills/$name" "skills/legacy/$name")
    if [ -n "$(git_ diff --name-only --no-renames "$base_commit" -- "${paths[@]}")" ] \
      || [ -n "$(git_ ls-files --others --exclude-standard -- "${paths[@]}")" ]; then
      changed=1
    fi

    if [ "$changed" -eq 1 ]; then
      if [ -z "$base_ver" ]; then
        if [ "$cur" != "0.1.0" ]; then
          err "$name" "new or unversioned at $base; version must be 0.1.0, found $cur"
        fi
      else
        IFS=. read -r bx by bz <<< "$base_ver"
        patch="$bx.$by.$((bz + 1))"
        minor="$bx.$((by + 1)).0"
        major="$((bx + 1)).0.0"
        if [ "$cur" = "$base_ver" ]; then
          err "$name" "changed since $base but version is still $cur; run scripts/bump-skill.sh"
        elif [ "$cur" = "$major" ]; then
          echo "note   $name: major bump $base_ver -> $cur; confirm the user approved it"
        elif [ "$cur" != "$patch" ] && [ "$cur" != "$minor" ]; then
          err "$name" "version $cur is not one step above base $base_ver ($patch, $minor, or $major)"
        fi
      fi
    elif [ -n "$base_ver" ] && [ "$cur" != "$base_ver" ]; then
      err "$name" "unchanged since $base but version $cur differs from base $base_ver"
    fi
  fi

  [ "$skill_errors" -eq 0 ] || bad=$((bad + 1))
done

if [ "$errors" -eq 0 ]; then
  echo "All $total skills OK"
  exit 0
fi
echo "$errors problem(s) in $bad of $total skills"
exit 1
