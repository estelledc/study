#!/usr/bin/env bash
# Round 末聚合：regen-atlas + regen-backlinks + fix-frontmatter + npm run build
#                + amend regen 产物到最后 commit + push origin main + sync 8 worktree
# 失败两段式回退：先丢 regen，再 reset --hard PREV_HEAD
#
# 用法：
#   bash scripts/finalize-round.sh                # 真跑
#   DRY_RUN=1 bash scripts/finalize-round.sh      # 列操作
#
# 由 workflow round 末调用（main 上已有若干 cherry-picked commits）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
DRY_RUN="${DRY_RUN:-0}"

PREV_HEAD=$(git rev-parse HEAD)
echo "[finalize-round] PREV_HEAD=$PREV_HEAD"

# Helper: emit pipeline event
emit() {
  local event_json="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [DRY] emit: $event_json"
    return
  fi
  node "$ROOT/scripts/pipeline-events.mjs" "$event_json"
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
fi

# 2. Build
echo "[finalize-round] npm run build (stage 1)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] npm run build"
  BUILD_OK=1
else
  if npm run build > /tmp/finalize-build-$$.log 2>&1; then
    BUILD_OK=1
  else
    BUILD_OK=0
    echo "  BUILD FAIL stage 1 — last 20 lines:"
    tail -20 /tmp/finalize-build-$$.log
  fi
fi

# 3. Build fail Stage 1 → 丢 regen 产物，重 build
if [[ "$BUILD_OK" -eq 0 ]]; then
  echo "[finalize-round] retry without regen artifacts"
  # 还原 regen 产物（只 reset 这些文件，不动 cherry-picked 笔记）
  git checkout -- src/content/docs/papers-atlas.md src/content/docs/projects-atlas.md 2>/dev/null || true
  git checkout -- src/content/docs/papers/ src/content/docs/projects/ 2>/dev/null || true
  # 重新只跑笔记 cherry-pick 的部分 + build
  if npm run build > /tmp/finalize-build2-$$.log 2>&1; then
    echo "  Stage 2 build OK (without regen)"
    BUILD_OK=1
    REGEN_DROPPED=1
  else
    BUILD_OK=0
    echo "  BUILD FAIL stage 2 — last 20 lines:"
    tail -20 /tmp/finalize-build2-$$.log
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

# 5. amend regen 产物到最后 cherry-picked commit
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] git diff --name-only | xargs git add && git commit --amend --no-edit"
else
  CHANGED=$(git diff --name-only)
  if [[ -n "$CHANGED" ]] || ! git diff --cached --quiet; then
    echo "$CHANGED" | xargs -r git add
    git commit --amend --no-edit
  else
    echo "  no regen diff to amend"
  fi
fi

# 6. push origin main
echo "[finalize-round] push origin main"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] git push origin main"
else
  git -c http.sslVerify=false push origin main
fi

# 7. Sync 8 worktree
echo "[finalize-round] sync 8 worktrees"
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
if [[ "$DRY_RUN" -eq 1 ]]; then
  for w in "${WORKTREES[@]}"; do echo "  [DRY] sync $w"; done
else
  # 并行同步所有 worktree（fetch 是网络 IO，串行 ~9s → 并行 ~1.5s）
  for w in "${WORKTREES[@]}"; do
    [[ -d "$w" ]] || { echo "  WARN: missing: $w"; continue; }
    (
      git -C "$w" -c http.sslVerify=false fetch origin main >/dev/null 2>&1
      git -C "$w" reset --hard origin/main >/dev/null 2>&1
      git -C "$w" clean -fd >/dev/null 2>&1
      echo "  synced $(basename $w)"
    ) &
  done
  wait
fi

# 8. sync-written 同步索引 + rebuild rewrite-pool（已 rewrite 的从 available 摘掉）
if [[ "$DRY_RUN" -eq 0 ]]; then
  node "$ROOT/scripts/sync-written.mjs" >/dev/null 2>&1
  node "$ROOT/scripts/build-rewrite-pool.mjs" --incremental >/dev/null 2>&1
fi

NEW_HEAD=$(git rev-parse --short HEAD)
emit "{\"event\":\"round-finalize-end\",\"build_ok\":true,\"new_head\":\"$NEW_HEAD\",\"regen_dropped\":${REGEN_DROPPED:-0}}"
echo "[finalize-round] DONE — main HEAD=$NEW_HEAD"
