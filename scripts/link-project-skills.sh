#!/usr/bin/env bash
# Keep the project skill links for Claude Code and Codex in sync.
# Usage: scripts/link-project-skills.sh [--check]
set -euo pipefail
shopt -s nullglob dotglob

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != --check ]; }; then
  echo "Usage: scripts/link-project-skills.sh [--check]" >&2
  exit 2
fi
check=false
if [ "$#" -eq 1 ]; then
  check=true
fi

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"
status=0

active_skill() {
  [ "$1" != legacy ] && [ -f "skills/$1/SKILL.md" ]
}

for project in .claude .agents; do
  dir="$project/skills"
  if [ -L "$project" ] || [ -L "$dir" ]; then
    echo "skip $dir has a symlink in its directory path" >&2
    status=1
    continue
  fi
  if { [ -e "$project" ] && [ ! -d "$project" ]; } ||
    { [ -e "$dir" ] && [ ! -d "$dir" ]; }; then
    echo "skip $dir is not a directory" >&2
    status=1
    continue
  fi
  if ! "$check"; then
    mkdir -p "$dir"
  fi

  for path in "$dir"/*; do
    name="${path##*/}"
    if [ ! -L "$path" ]; then
      echo "skip $path is not a symlink" >&2
      if active_skill "$name"; then
        status=1
      fi
    elif ! active_skill "$name"; then
      if "$check"; then
        echo "stale $path" >&2
        status=1
      else
        rm "$path"
        echo "unlink $path"
      fi
    fi
  done

  for skill in skills/*; do
    name="${skill##*/}"
    active_skill "$name" || continue
    path="$dir/$name"
    target="../../skills/$name"

    if [ -L "$path" ]; then
      [ "$(readlink "$path")" != "$target" ] || continue
      problem=wrong
    elif [ -e "$path" ]; then
      continue
    else
      problem=missing
    fi

    if "$check"; then
      echo "$problem $path (expected $target)" >&2
      status=1
    else
      if [ "$problem" = wrong ]; then
        rm "$path"
        echo "unlink $path"
      fi
      ln -s "$target" "$path"
      echo "link $path -> $target"
    fi
  done
done

exit "$status"
