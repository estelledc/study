# Auto-push v3 — Session Handoff

> Last update: 2026-05-30 (Session R35-R45 +66)
> Session 累计: R35-R45 = +66 笔记（406 → 472），main HEAD = 6da3a8e

## Progress Snapshot

- main HEAD: `6da3a8e`
- **total: 472 / 20000**（papers 191 + projects 259 = **2.36%**）
- Session 净增：+66（R35:8, R36:7, R37:7, R38:8, R39:8, R40:8, R41:8, R42:7, R43:8, R44:8, R45:8）
- queue: ~1500（papers 627 + projects 769 后续递减）
- rewrite_pool: ~120 available
- graveyard: 3（lexical / lottie / plane — Layer 2 兜底拦截）

## 系统稳定性

- **0 build fail** 跨 11 round
- **0 红线词** 进 main（lexical/lottie/plane Layer 2 全拦下；R36 还清理了 9 legacy 文件）
- Refiner 触发率约 8%（hardhat/lexical/cousot/lottie/plane 各 1 次）
- Cherry-pick 失败率约 4%（3/88 = lexical/lottie/plane）

## Resume

下一 session 直接接力：

```
/auto-push 8       # 跑 8-slug round
```

或主 CC 直接照流程跑（参考 `.claude/skills/auto-push/SKILL.md` §1-6）：
1. `node scripts/round-lock.mjs --check` 防踩踏
2. `node scripts/exit-conditions.mjs` 检查停止条件
3. sync 8 worktree + `pick-batch` 选 slug + `run-pipeline` build ctx
4. 派 8 个 Task subagent 并行跑 5 stage
5. cherry-pick 各 slug + `finalize-round.sh`
6. 写 checkpoint + 释放锁 + 决定 continue 或 exit

**已知踩坑**：
- Shell `for ... in $(cat jsonl)` 会按空格切分含 JSON 字段的行 → 用 `while IFS= read -r line` 或 Python 主控
- subagent 偶发 API 500 → retry 即可
- Round 内 subagent turn budget 紧时会"提前断"（出现"Now Stage 2"短句但没 commit）→ 检查 worktree HEAD 判断真实状态，重派失败的
- pick-batch 不会自动排除 graveyard slug → Python 后处理 swap

## 完整 plan

`/Users/jason/.claude/plans/optimized-honking-dusk.md`

