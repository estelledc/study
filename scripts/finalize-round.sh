#!/usr/bin/env bash
# Retired legacy finalizer retained only for deterministic dry-run diagnostics.
# It cannot publish, reset, clean, merge, or synchronize worktrees.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN="${DRY_RUN:-0}"
PUSH_REMOTE="${PUSH_REMOTE:-0}"
SYNC_WORKTREES="${SYNC_WORKTREES:-0}"

if [[ "$DRY_RUN" -ne 1 ]]; then
  echo "ERROR: finalize-round is retired; use round:final-gate for local verification." >&2
  exit 2
fi

if [[ "$PUSH_REMOTE" -ne 0 || "$SYNC_WORKTREES" -ne 0 ]]; then
  echo "ERROR: retired finalizer refuses publish and worktree synchronization flags." >&2
  exit 2
fi

node scripts/audit-operation-entrypoints.mjs
echo "[finalize-round] DRY: retired entrypoint performs no mutation; use npm run round:final-gate."
