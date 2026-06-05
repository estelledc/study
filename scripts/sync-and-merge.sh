#!/usr/bin/env bash
# Cherry-pick 8 个 worktree commit 到 main → 兜底 quality gate → regen → build → amend + push → sync 8 worktree
#
# 输入：data/status.json 的 batch.commits 数组（dispatch + subagent 完成后由主 CC 填）
# 用法：
#   bash scripts/sync-and-merge.sh           # 真跑
#   DRY_RUN=1 bash scripts/sync-and-merge.sh # 列出操作不执行
#
# 失败策略：
#   - cherry-pick 冲突 / quality-gate fail → 单个 drop，本批降级（不补位）
#   - npm run build fail → 整批回退到 PREV_HEAD，slug 全标 failed

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN="${DRY_RUN:-0}"
STATUS_JSON="$ROOT/data/status.json"

if [[ ! -f "$STATUS_JSON" ]]; then
  echo "ERROR: $STATUS_JSON not found. Main CC must write status.json first." >&2
  exit 2
fi

PREV_HEAD=$(git rev-parse HEAD)
echo "[sync-and-merge] PREV_HEAD=$PREV_HEAD"

# 提取 commits 数组（每个 entry 是 {slug, commit, area, ...}）
COMMITS_JSON=$(node -e '
const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const commits = (data.batch && data.batch.commits) || [];
console.log(JSON.stringify(commits));
' "$STATUS_JSON")

COUNT=$(echo "$COMMITS_JSON" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).length)')
echo "[sync-and-merge] $COUNT commits to cherry-pick"

if [[ "$COUNT" -eq 0 ]]; then
  echo "ERROR: batch.commits is empty" >&2
  exit 2
fi

# Helper: mark slug failed in status.json
mark_failed() {
  local slug="$1"
  local reason="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [DRY] would mark $slug failed: $reason"
    return
  fi
  node -e '
const fs = require("fs");
const file = process.argv[1];
const slug = process.argv[2];
const reason = process.argv[3];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
data.batch = data.batch || { failed: [] };
data.batch.failed = data.batch.failed || [];
data.batch.failed.push({ slug, reason, at: new Date().toISOString() });
fs.writeFileSync(file, JSON.stringify(data, null, 2));
' "$STATUS_JSON" "$slug" "$reason"
}

# Helper: read i-th commit info
get_commit_field() {
  local idx="$1"
  local field="$2"
  echo "$COMMITS_JSON" | node -e '
const arr = JSON.parse(require("fs").readFileSync(0, "utf8"));
const idx = parseInt(process.argv[1], 10);
const field = process.argv[2];
console.log(arr[idx][field] || "");
' "$idx" "$field"
}

# 1. 顺序 cherry-pick
PICKED_COUNT=0
DROPPED=()

for ((i=0; i<COUNT; i++)); do
  HASH=$(get_commit_field "$i" "commit")
  SLUG=$(get_commit_field "$i" "slug")
  AREA=$(get_commit_field "$i" "area")

  if [[ -z "$HASH" || -z "$SLUG" ]]; then
    echo "[sync-and-merge] skip entry $i (missing commit/slug)"
    continue
  fi

  echo "[sync-and-merge] [$((i+1))/$COUNT] cherry-pick $HASH ($AREA/$SLUG)"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [DRY] git cherry-pick $HASH"
    echo "  [DRY] node scripts/quality-gate.mjs <last-changed-file>"
    PICKED_COUNT=$((PICKED_COUNT + 1))
    continue
  fi

  if ! git cherry-pick -X theirs "$HASH" 2>&1; then
    echo "  cherry-pick conflict, abort + skip"
    git cherry-pick --abort 2>/dev/null || true
    mark_failed "$SLUG" "cherry-pick-conflict"
    DROPPED+=("$SLUG:conflict")
    continue
  fi

  # Layer 2 quality gate（找 cherry-pick 改的最后一个 .md 文件）
  CHANGED_FILE=$(git diff-tree --no-commit-id --name-only -r HEAD | grep -E '^src/content/docs/(papers|projects)/.*\.md$' | head -1 || true)
  if [[ -n "$CHANGED_FILE" ]]; then
    if ! node scripts/quality-gate.mjs "$ROOT/$CHANGED_FILE" >/tmp/qgate-$$.json 2>&1; then
      REASONS=$(node -e 'try { console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).reasons.join(";")); } catch (e) { console.log("parse-fail"); }' /tmp/qgate-$$.json)
      echo "  quality gate FAIL: $REASONS"
      git reset --hard HEAD~1
      mark_failed "$SLUG" "quality-gate:$REASONS"
      DROPPED+=("$SLUG:gate")
      rm -f /tmp/qgate-$$.json
      continue
    fi
    rm -f /tmp/qgate-$$.json
  else
    echo "  WARN: no .md change in commit $HASH"
  fi

  PICKED_COUNT=$((PICKED_COUNT + 1))
done

echo "[sync-and-merge] picked $PICKED_COUNT/$COUNT, dropped: ${DROPPED[*]:-none}"

if [[ "$PICKED_COUNT" -eq 0 ]]; then
  echo "[sync-and-merge] no commits picked, abort"
  exit 1
fi

# 2. Regen + fix-frontmatter
echo "[sync-and-merge] classify-notes + regen-atlas + regen-backlinks + fix-frontmatter"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] classify-notes --apply && regen-atlas && regen-backlinks && fix-frontmatter"
else
  node scripts/classify-notes.mjs --apply
  node scripts/regen-atlas.mjs
  node scripts/regen-backlinks.mjs
  node scripts/fix-frontmatter.mjs 2>/dev/null || echo "  WARN: fix-frontmatter.mjs missing or failed (non-fatal)"
fi

# 3. Build
echo "[sync-and-merge] npm run build"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] npm run build"
else
  if ! npm run build > /tmp/build-$$.log 2>&1; then
    echo "  BUILD FAIL — last 30 lines:"
    tail -30 /tmp/build-$$.log
    echo "  整批回退 to $PREV_HEAD"
    git reset --hard "$PREV_HEAD"
    # 标全部为 failed
    for ((i=0; i<COUNT; i++)); do
      mark_failed "$(get_commit_field "$i" "slug")" "build-fail"
    done
    rm -f /tmp/build-$$.log
    exit 3
  fi
  rm -f /tmp/build-$$.log
fi

# 4. Amend regen 产物到最后一个 cherry-pick commit
echo "[sync-and-merge] amend regen artifacts"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] git add -A && git commit --amend --no-edit"
else
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git add -A
    git commit --amend --no-edit
  else
    echo "  no regen diff to amend"
  fi
fi

# 5. Push
echo "[sync-and-merge] push origin main"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [DRY] git push origin main"
else
  git -c http.sslVerify=false push origin main
fi

# 6. Sync 8 worktree
echo "[sync-and-merge] sync 8 worktrees to origin/main"
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

for w in "${WORKTREES[@]}"; do
  if [[ ! -d "$w" ]]; then
    echo "  WARN: worktree missing: $w"
    continue
  fi
  echo "  sync $w"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "    [DRY] fetch + reset --hard origin/main"
  else
    git -C "$w" -c http.sslVerify=false fetch origin main
    git -C "$w" reset --hard origin/main
  fi
done

echo "[sync-and-merge] DONE — picked $PICKED_COUNT, dropped ${#DROPPED[@]}"
