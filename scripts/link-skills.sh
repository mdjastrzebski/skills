#!/usr/bin/env bash
# Symlink every skill in this repo into the global skill folders, so edits
# in the working tree are live in every agent session.
#
#   ~/.agents/skills/<name>  ->  <repo>/skills/[legacy/]<name>
#   ~/.claude/skills/<name>  ->  ../../.agents/skills/<name>
#
# Agents that read ~/.agents/skills (Codex, Cursor, ...) pick the skill up
# through the first link; Claude Code through the second.
#
# A real (copied) folder already installed under a skill's name is left
# alone. Run scripts/remove-global-skills.sh first to clear those.
#
# Usage: scripts/link-skills.sh
# Override targets with AGENTS_SKILLS_DIR and CLAUDE_SKILLS_DIR.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
agents_dir="${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}"
claude_dir="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

mkdir -p "$agents_dir" "$claude_dir"

# link <target> <link path>: create or fix a symlink, never replace a real folder.
link() {
  local target="$1" path="$2"
  if [ -L "$path" ]; then
    if [ "$(readlink "$path")" = "$target" ]; then
      return 0
    fi
    rm "$path"
  elif [ -e "$path" ]; then
    echo "skip   $path is a real folder; run scripts/remove-global-skills.sh first" >&2
    return 1
  fi
  ln -s "$target" "$path"
  echo "link   $path -> $target"
}

status=0
for skill in "$repo"/skills/*/ "$repo"/skills/legacy/*/; do
  skill="${skill%/}"
  [ -f "$skill/SKILL.md" ] || continue
  name="$(basename "$skill")"

  link "$skill" "$agents_dir/$name" || { status=1; continue; }
  link "../../.agents/skills/$name" "$claude_dir/$name" || status=1
done

[ "$status" -eq 0 ] && echo "All skills linked from $repo"
exit "$status"
