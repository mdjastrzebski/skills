#!/usr/bin/env bash
# Remove the copies of this repo's skills that `npx skills add` installed
# globally, so scripts/link-skills.sh can replace them with symlinks.
#
# For each skill in this repo that has a copied folder in ~/.agents/skills
# and a lock entry from mdjastrzebski/* in ~/.agents/.skill-lock.json, this:
#   - deletes the copied folder in ~/.agents/skills/<name>
#   - removes the lock entry, so `npx skills update` won't reinstall it
#   - removes the ~/.claude/skills/<name> symlink that pointed at the copy
#
# Symlinks (already linked skills) and skills installed from other sources
# are left alone.
#
# Usage: scripts/remove-global-skills.sh [--dry-run]
# Override targets with AGENTS_SKILLS_DIR, CLAUDE_SKILLS_DIR, SKILLS_LOCK_FILE.
# Requires jq.
set -euo pipefail

dry_run=0
[ "${1:-}" = "--dry-run" ] && dry_run=1

repo="$(cd "$(dirname "$0")/.." && pwd)"
agents_dir="${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}"
claude_dir="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
lock="${SKILLS_LOCK_FILE:-$HOME/.agents/.skill-lock.json}"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

run() {
  if [ "$dry_run" -eq 1 ]; then echo "would: $*"; else "$@"; fi
}

for skill in "$repo"/skills/*/ "$repo"/skills/legacy/*/; do
  skill="${skill%/}"
  [ -f "$skill/SKILL.md" ] || continue
  name="$(basename "$skill")"
  copy="$agents_dir/$name"

  if [ -L "$copy" ] || [ ! -e "$copy" ]; then
    continue
  fi

  source=""
  [ -f "$lock" ] && source="$(jq -r --arg n "$name" '.skills[$n].source // ""' "$lock")"
  case "$source" in
    mdjastrzebski/*) ;;
    *)
      echo "skip   $copy (lock source '${source:-none}' is not mdjastrzebski/*)" >&2
      continue
      ;;
  esac

  echo "remove $copy (installed from $source)"
  run rm -rf "$copy"

  if [ -L "$claude_dir/$name" ]; then
    run rm "$claude_dir/$name"
  fi

  if [ "$dry_run" -eq 1 ]; then
    echo "would: drop '$name' from $lock"
  else
    tmp="$(mktemp)"
    jq --arg n "$name" 'del(.skills[$n])' "$lock" > "$tmp" && cat "$tmp" > "$lock" && rm "$tmp"
  fi
done
