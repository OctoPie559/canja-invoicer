#!/usr/bin/env bash
# PreToolUse gate: block merging a slice branch into staging or main unless
# the slice-verifier recorded a PASS for it (.claude/verifier-pass/<branch>).
# Non-slice branches (staging -> main, fix/*) pass through: verification
# happens where slice work first lands.
set -u

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# Only guard commands that actually contain a `git merge`.
printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+merge([[:space:]]|$)' || exit 0

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
current=$(git -C "$dir" branch --show-current 2>/dev/null || true)
case "$current" in
  main|master|staging) ;;
  *) exit 0 ;;  # not merging into a protected branch (or not a repo yet)
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

# Only slice branches need a verifier verdict (strip any remote prefix).
short="${branch##*/}"
case "$short" in
  slice-*) ;;
  *) exit 0 ;;
esac

marker="$dir/.claude/verifier-pass/$short"
if [ -f "$marker" ] && grep -q "PASS" "$marker"; then
  exit 0
fi

jq -n --arg reason "Merge of '$branch' into '$current' blocked: no slice-verifier PASS recorded at .claude/verifier-pass/$short. Run the slice-verifier subagent on this branch; if it passes, write its verdict to that file and retry the merge." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
