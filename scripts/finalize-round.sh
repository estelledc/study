#!/usr/bin/env bash
# Round 末聚合：regen-atlas + regen-backlinks + fix-frontmatter + npm run build
#                + amend regen 产物到最后 commit + optional push + sync 8 worktree
# 失败两段式回退：先丢 regen，再 reset --hard PREV_HEAD
#
# 用法：
#   bash scripts/finalize-round.sh                  # 本地 finalize + sync worktrees，不 push
#   PUSH_REMOTE=1 bash scripts/finalize-round.sh    # finalize + push origin main + sync
#   DRY_RUN=1 bash scripts/finalize-round.sh        # 列操作
#
# 由 workflow round 末调用（main 上已有若干 cherry-picked commits）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib/publish-main.sh"
DRY_RUN="${DRY_RUN:-0}"
PUSH_REMOTE="${PUSH_REMOTE:-0}"
SYNC_WORKTREES="${SYNC_WORKTREES:-1}"
PUBLISH_ALLOWED_IDENTITY="github.com/estelledc/study"
PUSH_SENT=false
REMOTE_HEAD_VERIFIED=false
DEPLOY_STATUS="not-requested"

if [[ -z "${HOME:-}" ]]; then
  echo "ERROR: HOME is required to locate study worktrees" >&2
  exit 2
fi

WORKTREES=(
  "$HOME/study-refactor-papers"
  "$HOME/study-refactor-papers-2"
  "$HOME/study-refactor-papers-3"
  "$HOME/study-refactor-papers-4"
  "$HOME/study-refactor-projects"
  "$HOME/study-refactor-projects-2"
  "$HOME/study-refactor-projects-3"
  "$HOME/study-refactor-projects-4"
)

REGEN_CHANGED_FILE_LIST="/tmp/finalize-regen-changed-$$.txt"
BUILD_LOG="/tmp/finalize-build-$$.log"
BUILD2_LOG="/tmp/finalize-build2-$$.log"
trap 'rm -f "$REGEN_CHANGED_FILE_LIST" "$BUILD_LOG" "$BUILD2_LOG"' EXIT

PREV_HEAD=$(git rev-parse HEAD)
echo "[finalize-round] PREV_HEAD=$PREV_HEAD"

preflight_error() {
  local message="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  WARN: $message (dry-run continues)"
    return
  fi
  echo "ERROR: $message" >&2
  exit 2
}

preflight() {
  echo "[finalize-round] preflight"
  local branch
  branch="$(git branch --show-current)"
  if [[ "$branch" != "main" ]]; then
    preflight_error "finalize-round must run on main, current branch is $branch"
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "  WARN: worktree is dirty (dry-run continues)"
    else
      echo "ERROR: worktree must be clean before finalize-round" >&2
      git status --short >&2
      exit 2
    fi
  fi

  local required_files=(
    "data/candidates.jsonl"
    "data/rewrite-pool.jsonl"
    "data/written.txt"
  )
  local f
  for f in "${required_files[@]}"; do
    [[ -f "$f" ]] || preflight_error "missing required data file: $f"
  done

  if [[ "$DRY_RUN" -eq 1 ]]; then
    node "$ROOT/scripts/worktree-doctor.mjs" || true
  else
    node "$ROOT/scripts/worktree-doctor.mjs" --json --strict >/dev/null || preflight_error "worktree doctor failed"
  fi
}

restore_regen_changes() {
  if [[ ! -s "$REGEN_CHANGED_FILE_LIST" ]]; then
    echo "  no recorded regen diff to restore"
    return
  fi
  echo "  restoring recorded regen changes:"
  sed 's/^/    /' "$REGEN_CHANGED_FILE_LIST"
  xargs -r git checkout -- < "$REGEN_CHANGED_FILE_LIST"
}

stage_finalize_generated_changes() {
  local changed_file
  while IFS= read -r changed_file; do
    [[ -n "$changed_file" ]] || continue
    case "$changed_file" in
      src/content/docs/papers-atlas.md|src/content/docs/projects-atlas.md|src/content/docs/papers/*.md|src/content/docs/projects/*.md)
        git add "$changed_file"
        ;;
      *)
        echo "  skip non-finalize diff: $changed_file"
        ;;
    esac
  done
  return 0
}

preflight

# Helper: emit pipeline event
emit() {
  local event_json="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [DRY] emit: $event_json"
    return
  fi
  node "$ROOT/scripts/pipeline-events.mjs" "$event_json"
}

assert_finalize_head() {
  local stage="$1"
  local actual_head
  actual_head="$(git rev-parse HEAD)"
  if [[ "$actual_head" != "$LOCAL_HEAD" ]]; then
    emit "{\"event\":\"round-finalize-fail\",\"stage\":\"$stage\",\"reason\":\"local-head-drift\",\"expected_head\":\"$LOCAL_HEAD\",\"actual_head\":\"$actual_head\"}"
    echo "[finalize-round] STOPPED — HEAD drift at $stage (expected $LOCAL_HEAD, got $actual_head)" >&2
    return 1
  fi
  return 0
}

emit "{\"event\":\"round-finalize-start\",\"prev_head\":\"$PREV_HEAD\"}"

# 1. Regen
echo "[finalize-round] regen-atlas + regen-backlinks + fix-frontmatter"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] node scripts/regen-atlas.mjs && regen-backlinks.mjs && fix-frontmatter.mjs"
else
  node "$ROOT/scripts/regen-atlas.mjs"
  node "$ROOT/scripts/regen-backlinks.mjs"
  node "$ROOT/scripts/fix-frontmatter.mjs" 2>/dev/null || echo "  WARN: fix-frontmatter non-fatal"
  git diff --name-only > "$REGEN_CHANGED_FILE_LIST"
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  : > "$REGEN_CHANGED_FILE_LIST"
fi

# 2. Build
echo "[finalize-round] npm run build (stage 1)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] npm run build"
  BUILD_OK=1
else
  if npm run build > "$BUILD_LOG" 2>&1; then
    BUILD_OK=1
  else
    BUILD_OK=0
    echo "  BUILD FAIL stage 1 — last 20 lines:"
    tail -20 "$BUILD_LOG"
  fi
fi

# 3. Build fail Stage 1 → 丢 regen 产物，重 build
if [[ "$BUILD_OK" -eq 0 ]]; then
  echo "[finalize-round] retry without regen artifacts"
  # 还原本轮 regen 产生的变更，不按目录扫掉 cherry-picked 笔记。
  restore_regen_changes
  # 重新只跑笔记 cherry-pick 的部分 + build
  if npm run build > "$BUILD2_LOG" 2>&1; then
    echo "  Stage 2 build OK (without regen)"
    BUILD_OK=1
    REGEN_DROPPED=1
  else
    BUILD_OK=0
    echo "  BUILD FAIL stage 2 — last 20 lines:"
    tail -20 "$BUILD2_LOG"
  fi
fi

# 4. Build 完全失败 → 整批回退
if [[ "$BUILD_OK" -eq 0 ]]; then
  echo "[finalize-round] full rollback to $PREV_HEAD"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [DRY] git reset --hard $PREV_HEAD"
  else
    git reset --hard "$PREV_HEAD"
    emit "{\"event\":\"round-finalize-end\",\"build_ok\":false,\"action\":\"rollback\"}"
  fi
  exit 3
fi
emit "{\"event\":\"round-finalize-build-success\",\"local_build_ok\":true,\"publish_requested\":$([[ "$PUSH_REMOTE" -eq 1 ]] && echo true || echo false)}"

# 5. amend regen 产物到最后 cherry-picked commit
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] git diff --name-only | whitelist generated docs && git commit --amend --no-edit"
else
  CHANGED=$(git diff --name-only)
  if [[ -n "$CHANGED" ]] || ! git diff --cached --quiet; then
    echo "$CHANGED" | stage_finalize_generated_changes
    if ! git diff --cached --quiet; then
      git commit --amend --no-edit
    else
      echo "  no whitelisted finalize diff to amend"
    fi
  else
    echo "  no regen diff to amend"
  fi
fi

# 6. Optional remote publish. Default stays local so production preview can run
# without violating the "no push unless explicitly requested" rule.
if [[ "$DRY_RUN" -eq 0 ]] && [[ -n "$(git status --porcelain)" ]]; then
  emit "{\"event\":\"round-finalize-fail\",\"stage\":\"local-state\",\"reason\":\"worktree-dirty-after-amend\"}"
  echo "[finalize-round] STOPPED — local worktree differs from the commit that was built" >&2
  git status --short >&2
  exit 40
fi
LOCAL_HEAD=$(git rev-parse HEAD)
if [[ "$PUSH_REMOTE" -eq 1 ]]; then
  echo "[finalize-round] publish origin/main (fetch -> fast-forward proof -> push -> remote SHA proof)"
else
  echo "[finalize-round] push origin main (skipped; set PUSH_REMOTE=1 to publish)"
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  if [[ "$PUSH_REMOTE" -eq 1 ]]; then
    echo "  [DRY] git fetch --no-tags origin main"
    echo "  [DRY] verify origin fetch/push URLs resolve to $PUBLISH_ALLOWED_IDENTITY"
    echo "  [DRY] reject disabled TLS verification and HTTP redirects"
    echo "  [DRY] git merge-base --is-ancestor FETCH_HEAD $LOCAL_HEAD"
    echo "  [DRY] git push --porcelain --no-follow-tags origin $LOCAL_HEAD:refs/heads/main"
    echo "  [DRY] git ls-remote --exit-code --refs origin refs/heads/main && compare full SHA"
  else
    echo "  [DRY] skip git push origin main"
  fi
elif [[ "$PUSH_REMOTE" -eq 1 ]]; then
  emit "{\"event\":\"round-publish-start\",\"expected_head\":\"$LOCAL_HEAD\",\"remote\":\"origin\",\"branch\":\"main\"}"
  if publish_main \
      "$ROOT" "$LOCAL_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" \
      origin main "$PUBLISH_ALLOWED_IDENTITY"; then
    PUSH_SENT=true
    REMOTE_HEAD_VERIFIED=true
    DEPLOY_STATUS="not-verified"
    emit "{\"event\":\"round-publish-success\",\"expected_head\":\"$LOCAL_HEAD\",\"local_head\":\"$LOCAL_HEAD\",\"push_sent\":true,\"remote_head_verified\":true,\"remote_head\":\"$PUBLISH_REMOTE_SHA\",\"deploy_status\":\"not-verified\"}"
  else
    PUBLISH_EXIT=$?
    emit "{\"event\":\"round-publish-fail\",\"stage\":\"$PUBLISH_FAILURE_STAGE\",\"expected_head\":\"$LOCAL_HEAD\",\"push_sent\":$PUBLISH_PUSH_SENT,\"remote_head_verified\":false,\"deploy_status\":\"not-verified\"}"
    echo "[finalize-round] STOPPED — publish failed at $PUBLISH_FAILURE_STAGE; local HEAD remains $LOCAL_HEAD" >&2
    exit "$PUBLISH_EXIT"
  fi
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  assert_finalize_head "before-worktree-sync" || exit 46
fi

# 7. Sync 8 worktree
if [[ "$DRY_RUN" -eq 0 ]] && [[ "$PUSH_REMOTE" -eq 1 ]] && [[ "$REMOTE_HEAD_VERIFIED" != true ]]; then
  echo "[finalize-round] STOPPED — refusing to sync before remote HEAD proof" >&2
  exit 44
fi
if [[ "$SYNC_WORKTREES" -eq 1 ]]; then
  SYNC_TARGET="$LOCAL_HEAD"
  echo "[finalize-round] sync 8 worktrees to $SYNC_TARGET"
else
  echo "[finalize-round] sync 8 worktrees (skipped; set SYNC_WORKTREES=1 to sync)"
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  if [[ "$SYNC_WORKTREES" -eq 1 ]]; then
    for w in "${WORKTREES[@]}"; do echo "  [DRY] sync $w -> $SYNC_TARGET"; done
  else
    echo "  [DRY] skip worktree sync"
  fi
elif [[ "$SYNC_WORKTREES" -eq 1 ]]; then
  # 远端发布已在上一步证明 full SHA；这里不再访问网络。
  SYNC_PIDS=()
  for w in "${WORKTREES[@]}"; do
    [[ -d "$w" ]] || { echo "  WARN: missing: $w"; continue; }
    (
      if git -C "$w" reset --hard "$SYNC_TARGET" >/dev/null 2>&1 &&
         git -C "$w" clean -fd >/dev/null 2>&1; then
        echo "  synced $(basename "$w")"
      else
        echo "  ERROR: failed to sync $(basename "$w")" >&2
        exit 1
      fi
    ) &
    SYNC_PIDS+=("$!")
  done
  SYNC_FAILED=0
  for pid in "${SYNC_PIDS[@]}"; do
    wait "$pid" || SYNC_FAILED=1
  done
  if [[ "$SYNC_FAILED" -ne 0 ]]; then
    emit "{\"event\":\"round-finalize-sync-fail\",\"sync_target\":\"$SYNC_TARGET\"}"
    echo "[finalize-round] STOPPED — one or more worktrees failed to sync" >&2
    exit 45
  fi
  assert_finalize_head "after-worktree-sync" || exit 46
else
  :
fi

# 8. sync-written 同步索引 + rebuild rewrite-pool（已 rewrite 的从 available 摘掉）
if [[ "$DRY_RUN" -eq 0 ]]; then
  node "$ROOT/scripts/sync-written.mjs" >/dev/null 2>&1
  node "$ROOT/scripts/build-rewrite-pool.mjs" --incremental >/dev/null 2>&1
  assert_finalize_head "after-runtime-rebuild" || exit 46
  if [[ -n "$(git status --porcelain)" ]]; then
    emit "{\"event\":\"round-finalize-fail\",\"stage\":\"after-runtime-rebuild\",\"reason\":\"worktree-dirty\",\"expected_head\":\"$LOCAL_HEAD\"}"
    echo "[finalize-round] STOPPED — runtime rebuild left uncommitted state" >&2
    git status --short >&2
    exit 47
  fi
fi

NEW_HEAD=$(git rev-parse HEAD)
if [[ "$DRY_RUN" -eq 0 ]] && [[ "$NEW_HEAD" != "$LOCAL_HEAD" ]]; then
  emit "{\"event\":\"round-finalize-fail\",\"stage\":\"final-head-cas\",\"reason\":\"local-head-drift\",\"expected_head\":\"$LOCAL_HEAD\",\"actual_head\":\"$NEW_HEAD\"}"
  echo "[finalize-round] STOPPED — final HEAD differs from the published/finalized object" >&2
  exit 46
fi
emit "{\"event\":\"round-finalize-end\",\"local_build_ok\":true,\"expected_head\":\"$LOCAL_HEAD\",\"local_head\":\"$NEW_HEAD\",\"push_sent\":$PUSH_SENT,\"remote_head_verified\":$REMOTE_HEAD_VERIFIED,\"remote_head\":\"${PUBLISH_REMOTE_SHA:-}\",\"deploy_status\":\"$DEPLOY_STATUS\",\"new_head\":\"$NEW_HEAD\",\"regen_dropped\":${REGEN_DROPPED:-0}}"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[finalize-round] DRY RUN COMPLETE — no remote operation was executed"
else
  echo "[finalize-round] LOCAL FINALIZE COMPLETE — main HEAD=$NEW_HEAD"
  if [[ "$REMOTE_HEAD_VERIFIED" == true ]]; then
    echo "[finalize-round] REMOTE HEAD VERIFIED — origin/main=$NEW_HEAD"
    echo "[finalize-round] Pages deploy status: NOT VERIFIED (check the Pages workflow separately)"
  fi
fi
