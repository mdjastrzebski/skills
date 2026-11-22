#!/usr/bin/env bash
# Exercise both version scripts in a disposable repository, including staged
# moves and the prescribed pure-move commit followed by a content rewrite.
set -euo pipefail
scripts="$(cd "$(dirname "$0")" && pwd)"
repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT
cd "$repo"
git init -q -b main
git config user.email test@example.invalid
git config user.name Test
mkdir scripts
cp "$scripts"/{bump-skill,check-versions,skill-base-path}.sh scripts/

write_skill() {
  mkdir -p "skills/$1"
  cat > "skills/$1/SKILL.md" <<SKILL
---
name: $1
description: $1 example
metadata:
  version: "$2"
---

$3
SKILL
  printf '# Changelog\n\n## %s (2026-11-22)\n\n- Example.\n' "$2" > "skills/$1/CHANGELOG.md"
}

must_fail() {
  local output
  if output=$(scripts/check-versions.sh 2>&1); then
    echo "Unexpected success: $output" >&2
    exit 1
  fi
  [[ $output == *"$1"* ]] || { echo "Unexpected failure: $output" >&2; exit 1; }
}

write_skill original 0.4.2 'Old instructions.'
git add .
git commit -qm base
git switch -qc change
git mv skills/original skills/renamed
must_fail 'changed since main but version is still 0.4.2'
scripts/bump-skill.sh renamed minor -m 'Renamed.'
scripts/check-versions.sh
# Make the move its own commit. Then replace nearly every byte, before and
# after staging/committing, so an aggregate diff alone cannot detect it.
git restore skills/renamed
git commit -qm move
write_skill renamed 0.4.2 "$(seq 1000)"
must_fail 'changed since main but version is still 0.4.2'
git add skills/renamed
must_fail 'changed since main but version is still 0.4.2'
scripts/bump-skill.sh renamed minor -m 'Renamed.'
grep -qx '  version: "0.5.0"' skills/renamed/SKILL.md
scripts/check-versions.sh
git add skills/renamed
git commit -qm rewrite
scripts/check-versions.sh

write_skill fresh 0.2.0 'New instructions.'
must_fail 'new or unversioned at main; version must be 0.1.0'
write_skill fresh 0.1.0 'New instructions.'
scripts/check-versions.sh
# A subsequent deletion ends the lineage, even when the name is reused.
git rm -qr skills/renamed
git commit -qm remove
write_skill renamed 0.1.0 "$(seq 2000 3000)"
scripts/check-versions.sh
git add skills/renamed
scripts/check-versions.sh
git commit -qm replacement
scripts/check-versions.sh
