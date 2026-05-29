---
name: auto-push
description: study 仓库自驱式批量写笔记系统入口。一次启动后主 CC 持续派 8 subagent 并行写笔记 + cherry-pick + regen + build + push，直到 session 接近上限或 queue 见底。用 /auto-push 启动新一轮，/auto-push --resume 从 SESSION-HANDOFF 接力。
---

# /auto-push — 自驱式批量写笔记

> 把 study 仓库（10000 papers + 10000 projects 目标）按保质模式（4 rewrite + 4 NEW，单笔记 150-200 行）持续推进。架构 + 决策见 `/Users/jason/.claude/plans/optimized-honking-dusk.md`。

## 使用

```
/auto-push           # 新启动一轮（从当前 candidates / rewrite-pool 状态接力）
/auto-push --resume  # 从 SESSION-HANDOFF 接力（与 /auto-push 行为相同，仅语义化）
/auto-push stop      # 主 CC 完成当前批后停止，写 handoff
```

## 主 CC 执行流程（每批）

### Step 1：检查前置状态

```bash
node /Users/jason/study/scripts/loop-status.mjs --summary
```

读返回的一行简报，确认：
- queue 充足（papers + projects 共 ≥ 8 queued）
- rewrite_pool 充足（≥ 4 available）；不够则本批用 8 NEW
- 上次 build OK（如果 fail 连续 2 次，停下报警）

### Step 2：sync 8 worktree（每批前必做）

```bash
for w in study-refactor-{papers,papers-2,papers-3,papers-4,projects,projects-2,projects-3,projects-4}; do
  git -C "$HOME/$w" -c http.sslVerify=false fetch origin main
  git -C "$HOME/$w" reset --hard origin/main
done
```

### Step 3：dispatch

```bash
node /Users/jason/study/scripts/dispatch-batch.mjs > /tmp/batch-N-prompts.json
```

如果 rewrite_pool 不够 4：用 `--rewrite 0 --new 8` 或动态调整。

把 8 个 assignment 拆成独立 job 文件：

```bash
mkdir -p /tmp/batch-N
for i in 0 1 2 3 4 5 6 7; do
  node -e "
const d = JSON.parse(require('fs').readFileSync('/tmp/batch-N-prompts.json', 'utf8'));
require('fs').writeFileSync('/tmp/batch-N/job-' + $i + '.json', JSON.stringify(d.assignments[$i], null, 2));
"
done
```

### Step 4：派 8 个 Task subagent 并行

**单条 message 多 Task call**（必须并行，不要串行）。每个 Task 的 prompt 形如：

```
你是 study 仓库笔记写手 subagent。读 /tmp/batch-N/job-X.json，把 prompt 字段当详细任务说明执行。

任务核心：<rewrite/new> <papers/projects> 笔记（slug=...），用零基础类比模板（参考 /Users/jason/study/src/content/docs/papers/hindley-milner.md），最终落到 worktree 内 commit。详细规则在 /Users/jason/study/prompts/base-rules.md。

执行完成后**只输出一行 JSON**：
- 成功：{"slug":"...","commit":"<short-hash>","worktree":"...","lines":<n>,"self_check":"pass"}
- 失败：{"slug":"...","status":"failed","reason":"..."}

self-check：node /Users/jason/study/scripts/quality-gate.mjs <output_path>
commit msg：rewrite: <slug> 用零基础模板重写  或  feat: <slug> 新建零基础笔记（<topic>）

工具可用：lr CLI（papers）、arxiv MCP（papers）、Bash、Read、Write、Edit、WebFetch
```

subagent_type: `general-purpose`，description 5 字。

### Step 5：等 8 JSON 返回，写 status.json

每个 JSON 大致 `{"slug":"...","commit":"abc1234","worktree":"...","lines":<n>,"self_check":"pass"}`。

写 `/Users/jason/study/data/status.json`：

```json
{
  "total": { "papers": <ls count>, "projects": <ls count> },
  "batch": {
    "n": <batch number>,
    "started_at": "<ISO>",
    "commits": [ <8 个 success entry，每个含 slug/commit/area/worktree/lines> ],
    "failed": [ <若有 failed 的 entry> ]
  },
  "queue": { "papers": <count>, "projects": <count> },
  "rewrite_pool": { "papers": <count>, "projects": <count> }
}
```

### Step 6：sync-and-merge

```bash
cd /Users/jason/study && bash scripts/sync-and-merge.sh
```

这一步原子化：cherry-pick 8 + Layer 2 quality gate 兜底 + regen-atlas + regen-backlinks + fix-frontmatter + npm run build + amend + push origin main + sync 8 worktree。

失败处理：
- cherry-pick conflict / quality-gate fail：单 commit drop，slug 标 failed，本批降级（不补位）
- npm run build fail：整批回退到 PREV_HEAD，全部 slug 标 failed，**暂停 loop**

### Step 7：状态同步 + 简报

```bash
cd /Users/jason/study && node scripts/sync-written.mjs && node scripts/loop-status.mjs
```

`sync-written` 会把 candidates.jsonl 和 rewrite-pool.jsonl 中 claimed → written（针对成功 commit 的 slug）。`loop-status` 输出一行简报 + 重写 STATUS.md。

将状态变更 commit + push（小提交，不会污染 atlas 主线）：

```bash
cd /Users/jason/study && git add data/candidates.jsonl data/rewrite-pool.jsonl data/written.txt
git commit -m "chore: batch <N> 状态同步" 2>&1 | tail -3
git -c http.sslVerify=false push origin main 2>&1 | tail -3
```

### Step 8：判断是否继续

继续下一批（回到 Step 1）的条件：
- queued + rewrite_available ≥ 8
- 主 CC context 健康（没接近 80%）
- 上次 build OK
- 没收到用户 `/auto-push stop`

否则进入终止流程（Step 9）。

### Step 9：终止 / 写 handoff

不论正常结束还是异常停下，主 CC 必须更新 `/Users/jason/study/SESSION-HANDOFF-2026-05-29.md`（或当前日期文件）：

```markdown
# Study 自驱接力状态

> 最后更新：<ISO timestamp>
> 上一 session 主 CC：<short identifier>

## 进度

- main HEAD: <git rev-parse --short HEAD>
- total: <papers + projects>
- last batch: <N>
- queue: <queued count>
- rewrite_pool: <available count>

## 本 session 跑了几批

| Batch | net new | failed | 备注 |
| ... |

## 已知 fail / 待处理

- <slug>: <reason>

## 下一步

- /auto-push --resume 即可接力
- 注意 <如有 specific issue>
```

提交 handoff：
```bash
git add SESSION-HANDOFF-2026-05-29.md && git commit -m "chore: handoff <date> session <id>" && git -c http.sslVerify=false push origin main
```

## 中止条件（任意命中即停）

| 条件 | 动作 |
|---|---|
| 用户说 `/auto-push stop` | 完成当前批 + 写 handoff + 退出 |
| context 接近 80% | 同上 |
| Build fail 连续 2 次 | 停 loop + print 错误日志 last 30 行 + 等用户介入 |
| queue + rewrite_pool 全空 | 触发 `node scripts/expand-pool.mjs --target 100`；如果扩展后还 < 50，停 loop + 询问启动 ontology agent |
| 红线词连续 3 批触发 | 停 loop + 提示检查候选池新混入 |
| Cherry-pick 连续 4 个失败 | 停 loop + 检查模板 / worktree 状态 |

## 节奏估算

- 每批 wall time：subagent 并行 ~7 min + sync-and-merge ~3-5 min ≈ 10-12 min
- 每批 net new：4（保质 4R+4N）；rewrite 池空后 8 NEW 每批 net new = 8
- session 19h 上限：理论 ~95 批 = ~380 net new；实际 30-50 批比较稳（context 限制）

## 关键文件

- 数据：`/Users/jason/study/data/{candidates,rewrite-pool}.jsonl`、`written.txt`、`status.json`
- 脚本：`/Users/jason/study/scripts/{extract-candidates,sync-written,build-rewrite-pool,dispatch-batch,quality-gate,sync-and-merge,expand-pool,loop-status}`
- prompts：`/Users/jason/study/prompts/{base-rules,new-paper,rewrite-paper,new-project,rewrite-project}.md`
- 模板源：`/Users/jason/study/src/content/docs/papers/hindley-milner.md`（唯一 SoT）
- 完整 plan：`/Users/jason/.claude/plans/optimized-honking-dusk.md`
