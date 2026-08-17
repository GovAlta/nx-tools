#!/usr/bin/env bash
set -euo pipefail

# Runs one iteration of a self-dispatching, one-session-at-a-time workflow: a continuous
# `copilot -p` session against a prompt supplied entirely by the caller, its own mid-session
# commits, incremental pushes as those land. Nothing here is specific to any one flow -- what the
# session should actually do lives entirely in $PROMPT, composed by whichever flow's own
# task-identification script produced it (e.g. scripts/task-identification.mjs). Swap that script
# to point the same harness at a different flow.
#
# Doesn't decide whether to continue -- only reports made_commits so the workflow can re-check
# readiness itself, right here in the same already-provisioned job, and dispatch the next
# iteration (or open the completion PR) only once that's confirmed. That decision needs a
# flow-specific readiness check, which this generic script has no business making.
#
# No PAT needed: actions/checkout's own credential helper (whatever token the job was given)
# stays configured for the whole job, so a plain `git push` works from any step, including this
# one's push-watcher below.

log() { printf '[agent-delivery-iteration] %s\n' "$*"; }

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "required command not found: $1"
    exit 1
  fi
}

require_command git
require_command copilot

PROMPT="${1:?usage: $0 <prompt text>}"
BRANCH_NAME="${GITHUB_REF_NAME:-$(git branch --show-current)}"

git config user.name "agent-delivery-iteration[bot]"
git config user.email "agent-delivery-iteration[bot]@users.noreply.github.com"

BEFORE_HEAD="$(git rev-parse HEAD)"
echo "before_head=$BEFORE_HEAD" >> "$GITHUB_OUTPUT"

# Push-watcher: runs alongside the copilot -p call below, pushing whenever HEAD moves, so a real,
# multi-commit session's progress survives even if something later fails, hangs, or the job gets
# cancelled -- rather than an all-or-nothing single push at the end.
PUSH_WATCHER_INTERVAL_SECONDS=60
(
  LAST_PUSHED="$BEFORE_HEAD"
  while true; do
    sleep "$PUSH_WATCHER_INTERVAL_SECONDS"
    CURRENT="$(git rev-parse HEAD 2>/dev/null || echo "$LAST_PUSHED")"
    if [[ "$CURRENT" != "$LAST_PUSHED" ]]; then
      if git push origin "HEAD:${BRANCH_NAME}" 2>&1; then
        LAST_PUSHED="$CURRENT"
      fi
    fi
  done
) &
PUSH_WATCHER_PID=$!
trap 'kill "$PUSH_WATCHER_PID" 2>/dev/null || true' EXIT

# `read`/`write`/`shell` below (bare words, no parens) are what grant each tool unscoped -- e.g.
# `shell(*)` is parsed as a literal, nonexistent command name and grants nothing, a real footgun
# if you're trying to narrow this. A session doing real multi-stage work needs unscoped `shell`;
# there's no single flag that scopes it to just a few named commands.
log "invoking copilot CLI for this iteration"
copilot -p "$PROMPT" \
  --no-ask-user \
  --allow-tool=read \
  --allow-tool=write \
  --allow-tool=shell

kill "$PUSH_WATCHER_PID" 2>/dev/null || true
wait "$PUSH_WATCHER_PID" 2>/dev/null || true
trap - EXIT

AFTER_HEAD="$(git rev-parse HEAD)"

if [[ "$BEFORE_HEAD" == "$AFTER_HEAD" ]]; then
  log "no new commits produced this iteration -- nothing to push"
  echo "made_commits=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

log "$(git rev-list --count "${BEFORE_HEAD}..${AFTER_HEAD}") commit(s) this iteration -- final push for anything since the watcher's last check"

# Unlike the watcher's best-effort push above, this one must not lose this iteration's work if
# it's rejected -- most likely a human pushing to this same branch mid-session, which the
# workflow's own trigger comment treats as expected, supported use (see agent-delivery-
# iteration.yml's `on:` block). Fetch + rebase onto whatever's now on the branch and retry; a real
# content conflict can't be resolved unattended, so as a last resort push to a clearly-named
# recovery branch instead of silently discarding commits that only exist in this ephemeral
# checkout.
PUSH_RETRIES=5
pushed=false
for ((attempt = 1; attempt <= PUSH_RETRIES; attempt++)); do
  if git push origin "HEAD:${BRANCH_NAME}"; then
    pushed=true
    break
  fi
  log "push rejected (attempt ${attempt}/${PUSH_RETRIES}) -- fetching origin/${BRANCH_NAME} and rebasing onto it"
  git fetch origin "${BRANCH_NAME}"
  if ! git rebase "origin/${BRANCH_NAME}"; then
    git rebase --abort
    log "rebase onto origin/${BRANCH_NAME} conflicted -- can't auto-resolve unattended"
    break
  fi
done

if [[ "$pushed" != true ]]; then
  RECOVERY_BRANCH="${BRANCH_NAME}-agent-delivery-recovery-$(git rev-parse --short HEAD)"
  log "could not push to ${BRANCH_NAME} -- pushing this iteration's work to ${RECOVERY_BRANCH} instead so it isn't lost"
  git push origin "HEAD:${RECOVERY_BRANCH}"
  log "recover it by merging or rebasing ${RECOVERY_BRANCH} onto ${BRANCH_NAME} by hand, then re-push ${BRANCH_NAME} to resume the loop"
  echo "made_commits=false" >> "$GITHUB_OUTPUT"
  exit 1
fi

echo "made_commits=true" >> "$GITHUB_OUTPUT"
