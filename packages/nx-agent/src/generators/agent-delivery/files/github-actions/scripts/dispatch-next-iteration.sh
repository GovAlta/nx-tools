#!/usr/bin/env bash
set -euo pipefail

# Dispatches the next iteration once a post-iteration readiness check confirms real work remains
# -- generic HARNESS behavior; the check that decides whether to call this is flow-specific.

NEXT_ITERATION="$(( "${ITERATION:?}" + 1 ))"
echo "[agent-delivery-iteration] dispatching iteration $NEXT_ITERATION on ${GITHUB_REF_NAME:?}"
gh workflow run "${WORKFLOW_FILE:-agent-delivery-iteration.yml}" --repo "${GITHUB_REPOSITORY:?}" --ref "${GITHUB_REF_NAME:?}" \
  -f iteration="$NEXT_ITERATION"
