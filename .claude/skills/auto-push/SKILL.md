---
name: auto-push
description: study 仓库 v3 自驱式批量写笔记系统。一次启动后主 CC 用 ScheduleWakeup 自循环：每 round 跑 ~8-120 slug 多阶段 pipeline → cherry-pick → finalize-round → push → wakeup 60s → 醒来读 checkpoint 启下一 round。直到 written ≥ 20000 / build 连续失败 / queue 见底 / user STOP_SIGNAL。
---

# /auto-push v3 — 自驱式多阶段批量写笔记系统

> 核心：每个 round 主 CC 派 N 个 subagent 各自跑 5-stage pipeline（Researcher / Writer / Reviewer×3 / Refiner），主 CC 不深度参与单 slug。round 末统一 finalize（regen + build + push），写 checkpoint，ScheduleWakeup 60s 后醒来重复。

## 用户入口

```
/auto-push           # 开新一轮（从当前 candidates / rewrite-pool 状态接力）
/auto-push 20        # 指定 round size = 20
/auto-push 120       # 满载 round（plan 默认）
```

中止：用户任意时刻执行 `touch /Users/jason/study/data/STOP_SIGNAL`，下个 round 边界 graceful 退出。

## 主 CC 在每个 wakeup 醒来时执行的固定流程

### 1. 检查锁 + exit conditions

```bash
# 检查是否前序 round 还在跑
LOCK_STATE=$(node /Users/jason/study/scripts/round-lock.mjs --check)
echo "$LOCK_STATE" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); exit(1 if d.get('locked') and not d.get('stale') else 0)" \
  && echo "lock free" \
  || { echo "前序 round 仍在跑，跳过本次 wakeup"; exit 0; }

# 退出条件检查
EC=$(node /Users/jason/study/scripts/exit-conditions.mjs)
echo "$EC"
SHOULD_EXIT=$(echo "$EC" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('should_exit'))")
if [[ "$SHOULD_EXIT" == "True" ]]; then
  REASON=$(echo "$EC" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('reason'))")
  echo "Exiting: $REASON"
  # 写 SESSION-HANDOFF
  # ... 见 §6
  exit 0
fi
```

### 2. 取锁 + 准备 round

```bash
ROUND_N=$(node /Users/jason/study/scripts/checkpoint.mjs --read | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('round_n') or 0) + 1)")
WORKFLOW_ID="wf_round_${ROUND_N}_$(date +%s)"

# 取锁
node /Users/jason/study/scripts/round-lock.mjs --acquire $ROUND_N $WORKFLOW_ID || exit 1

# 强制 sync 8 worktree
for w in study-refactor-{papers,papers-2,papers-3,papers-4,projects,projects-2,projects-3,projects-4}; do
  git -C "$HOME/$w" -c http.sslVerify=false fetch origin main >/dev/null 2>&1
  git -C "$HOME/$w" reset --hard origin/main >/dev/null 2>&1
  git -C "$HOME/$w" clean -fd >/dev/null 2>&1
done
```

### 3. Pick batch + 准备 ctx

```bash
# 默认 round size 20，可由 /auto-push 参数覆盖
ROUND_SIZE=${1:-20}
HALF=$((ROUND_SIZE / 2))

# 选 slug
node /Users/jason/study/scripts/pick-batch.mjs --count $ROUND_SIZE --rewrite $HALF --new $HALF > /tmp/round-${ROUND_N}-batch.json

# 为每个 slug build ctx
mkdir -p /tmp/round-${ROUND_N}
node -e "
const items = JSON.parse(require('fs').readFileSync('/tmp/round-${ROUND_N}-batch.json', 'utf8')).items;
for (const it of items) {
  console.log(JSON.stringify({ slug: it.slug, kind: it.kind, worktree_idx: it.worktree_idx }));
}
" > /tmp/round-${ROUND_N}/items.jsonl

# 调 run-pipeline 为每个 slug 渲染 prompt（context 写入 /tmp/pipeline-{slug}/）
while IFS= read -r line; do
  SLUG=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['slug'])")
  KIND=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['kind'])")
  IDX=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['worktree_idx'])")
  node /Users/jason/study/scripts/run-pipeline.mjs --slug "$SLUG" --kind "$KIND" --worktree $IDX > /tmp/round-${ROUND_N}/ctx-$SLUG.json 2>&1
done < /tmp/round-${ROUND_N}/items.jsonl
```

### 4. 派 N 个 subagent 并行跑完整 pipeline

主 CC 在**单条消息内**调 N 次 Task tool（`general-purpose` agent_type），每个 prompt 形如：

```
M{N} pipeline subagent。读 /tmp/round-{ROUND_N}/ctx-{SLUG}.json 拿 ctx，按其中字段顺序跑 5 stage：

1. Researcher: 读 /tmp/pipeline-{SLUG}/researcher.prompt.md 按 5 步流程，写 research.json
2. Writer: 读 /tmp/pipeline-{SLUG}/writer.prompt.md + research.json + /Users/jason/study/src/content/docs/papers/hindley-milner.md 模板，写 ctx.output_path（150-200 行 目标 170±10），quality-gate 通过后在 worktree commit `feat: {SLUG} 新建零基础笔记（{TOPIC}）` 或 `rewrite: {SLUG} 用零基础模板重写`
3. Reviewer panel: 顺序跑 zero-base / academic / engineer，各写独立 review JSON
4. 聚合: ≥2 reject → graveyard；0 reject + 平均 ≥4 + 全 pass → 通过；其他走 Refiner
5. Refiner（条件）: 定向修 ≤2 段，新 commit `refine: {SLUG} 第 1 轮（refiner 定向修复）`，needs-refine reviewer 复审

输出单行 JSON：
- 成功：{"slug":"...","status":"success","final_commit":"<hash>","lines":<n>,"verdict_aggregate":"pass|refine"}
- 失败：{"slug":"...","status":"failed","fail_stage":"...","reason":"..."}

不 push origin。红线词严。工具：lr CLI（papers）、arxiv MCP（papers）、Bash、Read、Write、Edit、WebFetch。
```

并行调 N 个 Task call（不要串行）。等所有返回。

### 5. 解析返回 + cherry-pick 单 slug + finalize-round

```bash
# 收集每个 subagent 的返回 JSON
RESULTS_FILE=/tmp/round-${ROUND_N}/results.jsonl
# (主 CC 把每个 Task 的返回 JSON 写入这个文件)

# Cherry-pick 每个成功的 slug
while IFS= read -r line; do
  STATUS=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status'))")
  SLUG=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin).get('slug'))")
  if [[ "$STATUS" != "success" ]]; then
    # graveyard 标记
    echo "$line" >> /Users/jason/study/data/graveyard.jsonl
    continue
  fi
  COMMIT=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin).get('final_commit'))")
  # 推断 area
  AREA=$(grep "\"slug\":\"$SLUG\"" /tmp/round-${ROUND_N}/items.jsonl | python3 -c "import json,sys; d=json.load(sys.stdin); print('papers' if d['kind'].endswith('paper') else 'projects')")
  node /Users/jason/study/scripts/sync-and-merge-single.mjs --slug "$SLUG" --commit "$COMMIT" --area "$AREA" --round $ROUND_N
done < $RESULTS_FILE

# Round 末聚合 finalize
bash /Users/jason/study/scripts/finalize-round.sh
```

### 6. 写 checkpoint + 释放锁 + 决定下一步

```bash
# 写 checkpoint（自动从仓库统计 + 手动覆盖 last_round_stats）
SUCCESS_COUNT=$(grep -c '"status":"success"' /tmp/round-${ROUND_N}/results.jsonl 2>/dev/null || echo 0)
FAILED_COUNT=$(grep -c '"status":"failed"' /tmp/round-${ROUND_N}/results.jsonl 2>/dev/null || echo 0)

node /Users/jason/study/scripts/checkpoint.mjs --auto-update \
  --round_n $ROUND_N \
  --next_action "start-round-$((ROUND_N + 1))" \
  --last_round_stats.slugs_attempted $ROUND_SIZE \
  --last_round_stats.slugs_committed $SUCCESS_COUNT \
  --last_round_stats.graveyard_added $FAILED_COUNT

# 释放锁
node /Users/jason/study/scripts/round-lock.mjs --release

# Re-check exit conditions
EC=$(node /Users/jason/study/scripts/exit-conditions.mjs)
SHOULD_EXIT=$(echo "$EC" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('should_exit'))")

if [[ "$SHOULD_EXIT" == "True" ]]; then
  # 写 SESSION-HANDOFF + exit
  REASON=$(echo "$EC" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('reason'))")
  cat > /Users/jason/study/SESSION-HANDOFF.md <<HEOF
# Auto-push Session Handoff

> Last update: $(date -Iseconds)
> Exit reason: $REASON

## State
- Round: $ROUND_N
- Total: $(node /Users/jason/study/scripts/checkpoint.mjs --read | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['total']['papers'] + d['total']['projects'])") / 20000
- Queue + rewrite pool: see checkpoint.json
- Graveyard size: $(wc -l < /Users/jason/study/data/graveyard.jsonl 2>/dev/null || echo 0)

## Resume
\`\`\`
/auto-push --resume
\`\`\`
HEOF
  cd /Users/jason/study && git add SESSION-HANDOFF.md && git commit -m "chore: handoff round $ROUND_N — $REASON" && git -c http.sslVerify=false push origin main
  echo "exited"
else
  # ScheduleWakeup 60s 启下一 round
  # 主 CC 在自己的 turn 里调 ScheduleWakeup tool，prompt 字段见下
  echo "scheduling next wakeup..."
fi
```

ScheduleWakeup prompt（self-contained，主 CC 醒来不依赖记忆）：

```
/auto-push --resume

按 .claude/skills/auto-push/SKILL.md §1-6 流程执行 round $((ROUND_N + 1))。前序 round $ROUND_N 已 commit + push 到 main，checkpoint 已写。读 /Users/jason/study/data/checkpoint.json 拿状态后启下一 round。
```

调用：

```js
ScheduleWakeup({
  delaySeconds: 60,
  reason: `round ${ROUND_N + 1} continuation`,
  prompt: "/auto-push --resume\n\n按 .claude/skills/auto-push/SKILL.md §1-6 流程执行 round " + nextN + "..."
})
```

## 异常告警条件

| 条件 | 动作 |
|---|---|
| Build fail 连续 2 次 | exit-conditions 返回 build-broken，主 CC 写 handoff exit |
| queue + rewrite_pool < 8 | exit-conditions 返回 queue-empty，触发 expand-pool（M4 实装），失败则 exit |
| 红线词连续 3 batch 触发 | （M4 实装：retro 监控 + 暂停）|
| Cherry-pick 连续 4 失败 | sync-and-merge-single 返回 fail，下 round 跳过这些 slug |

## 节奏估算

- Round size 20：subagent ~7-10 min 并行 + finalize ~3 min ≈ 12-15 min/round
- Round size 120（满载）：subagent ~7-10 min（cap 10 并发，120 篇分 12 波串行 ~30-40 min）+ finalize ~5 min ≈ 35-45 min/round
- 24h 长跑（M5）：~32-40 round（size 20）≈ ~640-800 net new；或 ~30-35 round（size 120）≈ ~3000+ net new

## 关键文件

- Plan：`/Users/jason/.claude/plans/optimized-honking-dusk.md` （v3 完整设计）
- 数据：`data/checkpoint.json` / `data/round-lock.json` / `data/pipeline-events.jsonl` / `data/graveyard.jsonl`
- 脚本：`scripts/{run-pipeline,checkpoint,exit-conditions,pick-batch,round-lock,sync-and-merge-single,pipeline-events,quality-gate}.mjs` + `scripts/finalize-round.sh`
- Prompts：`prompts/{researcher,writer,reviewer-zero-base,reviewer-academic,reviewer-engineer,refiner}.md` + `base-rules.md`

## 红线词清单（不能漏）

`blindbox / quanzhiping / video-eval-agent / 6 件套 / sankuai / friday / cagent / aigc.sankuai / 美团 / mis.sankuai / cagent_fe_h5_blindbox / LongCat`

每篇笔记入 main 前都被 quality-gate Layer 1 + Layer 2 双扫。
