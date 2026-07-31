#!/usr/bin/env bash
set -euo pipefail

# Ensures a completion PR exists once a flow's task-identification script reports nothing left to
# do (or the max-iterations cap was hit) -- generic HARNESS behavior. Idempotent: checks for an
# existing PR from this branch first, so a subsequent run that still finds nothing to do doesn't
# create a duplicate.
#
# SUMMARY is a flow's own generated text (artifact slugs, file paths) -- read
# from the environment and only ever used as a printf argument below, never interpolated directly
# into a command line, so untrusted content in it can't get re-parsed as shell syntax.

SUMMARY="${SUMMARY:?SUMMARY env var required}"
BRANCH_NAME="${GITHUB_REF_NAME:?}"
WORKFLOW_NAME="${GITHUB_WORKFLOW:?}"

existing=$(gh pr list --head "$BRANCH_NAME" --base main --json number --jq '.[0].number // empty')
if [[ -z "$existing" ]]; then
  body=$(printf 'Automated by the "%s" workflow.\n\n%s\n\nNo auto-merge -- this loop never merges its own work; review and merge by hand when ready.\n' "$WORKFLOW_NAME" "$SUMMARY")
  gh pr create --base main --head "$BRANCH_NAME" \
    --title "$WORKFLOW_NAME: $BRANCH_NAME" \
    --body "$body"
  echo "opened a completion PR"
else
  echo "PR #$existing already exists -- nothing to do"
fi
