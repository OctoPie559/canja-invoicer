#!/usr/bin/env bash
# PreToolUse gate: block `git merge` into main/master unless the slice-verifier
# recorded a PASS for the branch being merged (.claude/verifier-pass/<branch>).
set -u

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# Only guard commands that actually contain a `git merge`.
printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+merge([[:space:]]|$)' || exit 0

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
current=$(git -C "$dir" branch --show-current 2>/dev/null || true)
case "$current" in
  main|master) ;;
  *) exit 0 ;;  # not merging into the protected branch (or not a repo yet)
esac

# First non-flag word after "merge" is the branch being merged.
branch=""
seen=0
for w in $cmd; do
  if [ "$seen" -eq 1 ]; then
    case "$w" in
      -*) continue ;;
      *) branch="$w"; break ;;
    esac
  fi
  [ "$w" = "merge" ] && seen=1
done
# No branch argument (e.g. `git merge --continue`): nothing to evaluate.
[ -n "$branch" ] || exit 0

marker="$dir/.claude/verifier-pass/$branch"
if [ -f "$marker" ] && grep -q "PASS" "$marker"; then
  exit 0
fi

jq -n --arg reason "Merge of '$branch' into '$current' blocked: no slice-verifier PASS recorded at .claude/verifier-pass/$branch. Run the slice-verifier subagent on this branch; if it passes, write its verdict to that file and retry the merge." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
