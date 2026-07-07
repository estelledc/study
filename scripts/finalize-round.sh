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

# 6. push origin main（失败时自动 rebase 再试一次，但不让失败阻断后续 sync-written）
echo "[finalize-round] push origin main"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] git push origin main"
else
  if ! git -c http.sslVerify=false push origin main 2>&1; then
    echo "  push rejected, attempt fetch + rebase + retry"
    git -c http.sslVerify=false fetch origin main 2>&1 | tail -3 || true
    if git rebase origin/main 2>&1 | tail -3; then
      git -c http.sslVerify=false push origin main 2>&1 | tail -3 || echo "  WARN: push still failing, continuing anyway"
    else
      echo "  WARN: rebase failed, aborting and continuing"
      git rebase --abort 2>/dev/null || true
    fi
  fi
fi

# 7. Sync 8 worktree
echo "[finalize-round] sync 8 worktrees"
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
