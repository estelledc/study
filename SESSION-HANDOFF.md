# Auto-push v3 — Session Handoff

> Last update: 2026-05-30 (Session R35-R46 = +74)
> 累计：406 → 480（main HEAD = 9d6384f，已 push origin）

## Progress Snapshot

- **total: 480 / 20000 (2.40%)** — papers 195 + projects 263 + meta
- Session 净增 74：R35-R46 共 12 round（每 round 8 slug）
- 各 round 净增：8/7/7/8/8/8/8/7/8/8/8/8（1 build 0 fail / 3 graveyard）
- Cherry-pick 累计成功率：93/96 = 96.9%
- Refiner 触发率：~7%（hardhat/lexical-r36/cousot/lottie/plane/dijkstra-goto/reps-ifds 等）
- queue: ~1430（papers 627 + projects 759）+ rewrite_pool ~120 = 1550 buffer ≈ 19 round
- graveyard: 3（lexical / lottie / plane — Layer 2 兜底拦下）

## 系统稳定性验证

跨 12 round 连续：
- **0 build fail** （npm run build 全 pass）
- **0 红线词进 main** （Layer 1 + Layer 2 双层有效）
- **R36 顺手清理 9 legacy 文件**（pre-commit hook 上线前老笔记 + about.md 品牌名泛化）
- **subagent failure modes 已知**：API 500 / turn budget 早断 / 谎报 lines / cherry-pick 内容污染——全部由 cherry-pick + Layer 2 + retry-loop 兜住

## Resume

新 session 直接接力：

```
/auto-push 8       # 跑 8-slug round
```

或主 CC 按流程跑（参考 `.claude/skills/auto-push/SKILL.md` §1-6）：
1. `node scripts/round-lock.mjs --check` 防踩踏
2. `node scripts/exit-conditions.mjs` 检查停止条件
3. sync 8 worktree → `pick-batch` → 渲染 ctx
4. 派 8 个 Task subagent 并行跑 5 stage
5. cherry-pick + `finalize-round.sh`
6. 写 checkpoint + 释放锁

## 已知踩坑（本 session 累积）

1. **Shell `for ... in $(cat jsonl)` 切错** — 含空格 JSON 行被切碎；用 `while IFS= read -r line` 或 Python 主控
2. **Subagent turn budget 早断** — 偶发出现 "Now Stage 2..." 但没 commit；prompt 里加 "target 完成而非完美 + 不长篇思考" 缓解
3. **API 500 偶发** — subagent 内部 fetch failed；重派单 slug 即可
4. **subagent 谎报 lines/verdict** — Layer 2 gate 拦下；3 起入 graveyard（lexical/lottie/plane）
5. **pick-batch 不排除 graveyard** — Python post-process swap
6. **legacy md 红线词** — 9 文件清理过（lampson-hints/sillito-questions/emotion/lexical/kubernetes/lucia/minisearch/pixi/yargs）+ about.md 品牌名泛化
7. **rewrite-pool ↔ candidates 状态同步** — 需要每 round build-rewrite-pool 重建，避免重选已 v3 重写的 legacy slug

## Resume 估算

按本 session 实测节奏：
- 1 round = 8 slug ≈ 12-19 min wall time
- 每 session 10-15 round → ~80-120 笔记
- 20000 目标 → 约 165-185 session（按 8/round）或 ~17 session（按 120/round 满载）
- 当前 480/20000 = 2.4%

## 完整 plan

`$HOME/.claude/plans/optimized-honking-dusk.md`
