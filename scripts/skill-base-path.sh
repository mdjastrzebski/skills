# Sourced by the version scripts. Print the SKILL.md path at the merge base.
skill_base_path() {
  local repo=$1 base=$2 path=$3 name candidate status old new
  name=${path%/SKILL.md}
  name=${name##*/}
  for candidate in "skills/$name/SKILL.md" "skills/legacy/$name/SKILL.md"; do
    if git -C "$repo" cat-file -e "$base:$candidate" 2>/dev/null; then
      echo "$candidate"
      return
    fi
  done

  # Git only detects renames to tracked files. An untracked skill reusing
  # a historical name is a new skill.
  git -C "$repo" ls-files --error-unmatch -- "$path" >/dev/null 2>&1 || return 0
  local -a paths=(':(glob)skills/*/SKILL.md' ':(glob)skills/legacy/*/SKILL.md')
  local state
  for state in worktree index; do
    local -a options=()
    if [[ $state == index ]]; then options=(--cached); fi
    candidate=$(git -C "$repo" diff -M --name-status "${options[@]}" "$base" -- "${paths[@]}" |
      awk -F '\t' -v dest="$path" '$1 ~ /^R/ && $3 == dest {print $2}')
    if [[ -n $candidate ]]; then
      echo "$candidate"
      return
    fi
  done

  # A committed pure move followed by a rewrite can lose all similarity in
  # both aggregate diffs. Walk the index and then individual commits back
  # from this file, stopping at an addition (the name may have been reused).
  while IFS=$'\t' read -r status old new; do
    if [[ $status == R* && $new == "$path" ]]; then path=$old; break; fi
    if [[ $status == A && $old == "$path" ]]; then return 0; fi
  done < <(git -C "$repo" diff -M --name-status --cached HEAD -- "${paths[@]}")
  while IFS=$'\t' read -r status old new; do
    if [[ $status == R* && $new == "$path" ]]; then path=$old; fi
    if [[ $status == A && $old == "$path" ]]; then return 0; fi
  done < <(git -C "$repo" log --follow -M --format= --name-status "$base..HEAD" -- "$path")
  if [[ $path =~ ^skills/(legacy/)?[^/]+/SKILL\.md$ ]] &&
     git -C "$repo" cat-file -e "$base:$path" 2>/dev/null; then
    echo "$path"
  fi
}
