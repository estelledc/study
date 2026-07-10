#!/usr/bin/env bash
# Legacy batch merge wrapper.
#
# The production path is now:
#   1. npm run round:merge-one -- --slug ... --commit ... --area ... <provenance flags>
#   2. bash scripts/finalize-round.sh
#
# This wrapper keeps dry-run/status checks available while refusing real legacy
# batch mutation by default.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN="${DRY_RUN:-0}"
ALLOW_LEGACY_BATCH_MERGE="${ALLOW_LEGACY_BATCH_MERGE:-0}"
STATUS_JSON="$ROOT/data/status.json"

fail_or_warn() {
  local message="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  WARN: $message (dry-run continues)"
    return
  fi
  echo "ERROR: $message" >&2
  exit 2
}

validate_status_json() {
  if [[ ! -f "$STATUS_JSON" ]]; then
    fail_or_warn "$STATUS_JSON not found"
    return
  fi
  node --input-type=module - "$STATUS_JSON" <<'NODE'
import fs from 'node:fs';

const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const commits = data?.batch?.commits;
if (!Array.isArray(commits)) {
  throw new Error('status.json must contain batch.commits array');
}
for (const [index, entry] of commits.entries()) {
  if (!entry.slug || !entry.commit || !entry.area) {
    throw new Error(`batch.commits[${index}] must contain slug, commit, and area`);
  }
}
NODE
}

preflight() {
  echo "[sync-and-merge] preflight"
  local branch
  branch="$(git branch --show-current)"
  [[ "$branch" == "main" ]] || fail_or_warn "sync-and-merge must run on main, current branch is ${branch:-detached}"

  if [[ -n "$(git status --porcelain)" ]]; then
    fail_or_warn "worktree must be clean before legacy batch merge"
  fi

  validate_status_json

  if [[ "$DRY_RUN" -eq 1 ]]; then
    node "$ROOT/scripts/worktree-doctor.mjs" || true
  else
    node "$ROOT/scripts/worktree-doctor.mjs" --json --strict >/dev/null || fail_or_warn "worktree doctor failed"
  fi
}

preflight

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[sync-and-merge] legacy batch merge is disabled"
  echo "  [DRY] use npm run round:merge-one with assignment provenance per commit"
  echo "  [DRY] then run bash scripts/finalize-round.sh"
  exit 0
fi

if [[ "$ALLOW_LEGACY_BATCH_MERGE" -ne 1 ]]; then
  echo "ERROR: legacy batch merge is disabled by default." >&2
  echo "Use round:merge-one (or round:auto-advance); the single-entry script is internal." >&2
  exit 2
fi

echo "ERROR: legacy batch merge implementation has been retired." >&2
echo "Use round:merge-one (or round:auto-advance); the single-entry script is internal." >&2
exit 2
