#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

before="$(git status --porcelain=v1)"

if DRY_RUN=0 bash scripts/finalize-round.sh >/dev/null 2>&1; then
  echo "expected non-dry legacy finalizer to fail" >&2
  exit 1
fi

if DRY_RUN=1 PUSH_REMOTE=1 bash scripts/finalize-round.sh >/dev/null 2>&1; then
  echo "expected publish flag to fail" >&2
  exit 1
fi

if DRY_RUN=1 SYNC_WORKTREES=1 bash scripts/finalize-round.sh >/dev/null 2>&1; then
  echo "expected worktree-sync flag to fail" >&2
  exit 1
fi

DRY_RUN=1 PUSH_REMOTE=0 SYNC_WORKTREES=0 bash scripts/finalize-round.sh >/dev/null

after="$(git status --porcelain=v1)"
if [[ "$before" != "$after" ]]; then
  echo "retired finalizer changed the worktree" >&2
  exit 1
fi

echo "finalize-round retired-entrypoint tests passed"
