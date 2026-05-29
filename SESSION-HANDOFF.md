# Auto-push v3 — Session Handoff

> Last update: 2026-05-30 00:51
> Session 涵盖：v1 batch 25-31 收尾 + v3 M1/M2/M3 全部完成 + Round 33-34 真跑

## Progress Snapshot

- main HEAD: `2a5afec`
- **total: 406 / 20000**（papers 167 + projects 239 = **2.03%**）
- 本 session 共 +43 笔记（v1 batch 25-31: +26，v3: +17）
- last batch: 34（连续 0 build fail / 0 红线词命中）
- queue: 1430（papers 641 + projects 789）
- rewrite_pool: 146 available + 29 written
- graveyard: 0

## v3 系统已全部就位

### 脚本（10 个）

| 脚本 | 状态 |
|---|---|
| `scripts/run-pipeline.mjs` | ✅ 单 slug 5-stage driver，dump prompt 到 /tmp/pipeline-{slug}/ |
| `scripts/pipeline-events.mjs` | ✅ append-only 事件流（O_APPEND 原子写） |
| `scripts/quality-gate.mjs` | ✅ 7 项 Layer 1+2 检查（ESM export validate） |
| `scripts/sync-and-merge-single.mjs` | ✅ 单 slug cherry-pick + Layer 2 兜底，自动 resolve modify/delete 冲突 |
| `scripts/finalize-round.sh` | ✅ regen + build + push + sync 8 worktree，build 失败两段式回退 |
| `scripts/checkpoint.mjs` | ✅ read/write data/checkpoint.json，支持 --auto-update 自动从仓库统计 |
| `scripts/exit-conditions.mjs` | ✅ 6 条退出判定（target / agent-budget / build / queue / context / user-stop） |
| `scripts/pick-batch.mjs` | ✅ 跨 area + topic 轮询选 slug（rename from dispatch-batch） |
| `scripts/round-lock.mjs` | ✅ 防 wakeup 排队踩踏，90 min 超时强制释放 |
| v1 兼容脚本 | ✅ extract-candidates / sync-written / build-rewrite-pool / regen-* / loop-status 全部保留 |

### Prompts（6 个新 + base-rules）

- `prompts/researcher.md` — lr search + arxiv MCP + lr graph 5 步
- `prompts/writer.md` — 12 段 150-200 行 + frontmatter 单引号示例 + 行数预算指南（170±10）
- `prompts/reviewer-zero-base.md` — 类比 / 术语 / 案例可读性
- `prompts/reviewer-academic.md` — 事实 / 引用 / 无扭曲
- `prompts/reviewer-engineer.md` — 代码 / 踩坑 / 适用
- `prompts/refiner.md` — 定向修 ≤2 段 + fix_hints 选取规则 + 复审清单
- `prompts/base-rules.md` — 12 段结构 + 红线词 + YAML（v1 沿用）

### Skill

`.claude/skills/auto-push/SKILL.md` 重写为 v3 入口。**关键发现**：ScheduleWakeup 仅在 `/loop` 模式下可用，普通 session 不暴露。改用**主 CC 直接接力**（每 round 末不退出，同 turn 启下一 round），靠 CC auto-compaction 在 60-80% 自动压缩。

## 验证里程碑

| MS | 范围 | 验收 | 实际产出 |
|---|---|---|---|
| **M1** | 单 slug 5-stage e2e | gadt-pjones 全 pass + 154 行 + commit 3deac83 | ✅ +1 |
| **M2** | 8 slug 并行 + 拆 single/finalize | 8/8 通过，3 走 Refiner，0 build fail | ✅ +9 |
| **M3** | 真 round + Layer 2 兜底实测 | Round 33: 7/8 通过，**1 Layer 2 拦截（lexical 旧版未真改动）**，0 build fail | ✅ +7 |
| **Round 34** | 重测 rewrite 真改动 | 8/8 通过，1 Refiner（game-semantics-pcf），0 拦截 | ✅ +8 |

**关键质量信号**：
- Refiner 触发率约 50%（M2: 3/8、M3: 3/8、R34: 1/8）
- Layer 2 兜底有效（M3 lexical 命中 4 项 fail：lines/red-line/h2/permalink）
- Reviewer panel 平均分 4.0-4.6
- 0 build fail，0 红线词最终入仓
- 5 stage wall time ~12 min/round（8 slug 并行 cap 8）

## Resume

下个 session 直接接力：

```
/auto-push 8           # 跑一个 round（默认 size 8 适合 session 内手动驱动）
# 或
/auto-push 120         # 满载 round（plan v3 设计）
```

主 CC 按 `.claude/skills/auto-push/SKILL.md` 流程执行：
1. `node scripts/round-lock.mjs --check` 防踩踏
2. `node scripts/exit-conditions.mjs` 检查停止条件
3. sync 8 worktree + `pick-batch` 选 slug + `run-pipeline` build ctx
4. 派 N 个 Task subagent 并行跑 5 stage
5. cherry-pick 各 slug + `finalize-round.sh`
6. 写 checkpoint + 释放锁 + 决定 continue 或 exit

**STOP_SIGNAL**：用户任意时刻 `touch /Users/jason/study/data/STOP_SIGNAL`，下个 round 边界 graceful 退出。

## 已知问题（可继续优化）

1. **rewrite-pool ↔ candidates 状态同步**：sync-written 当前只把 `claimed → written`，不会把"已 v3 重写过的 legacy slug"自动标 written（导致 pick-batch 偶尔重选）。修法：build-rewrite-pool 加 `--incremental` 已实装，但 sync-written 还需配合（M3 跑时手动重建过一次）
2. **subagent 写 rewrite 时未真改动**：M3 lexical 没保留 existing 的好类比但又写回 worktree（导致 Layer 2 拦截）。Writer prompt 已加"行数 150-200 + delete legacy frontmatter"约束，但 subagent 仍可能漏。Layer 2 兜底拦得住，质量损失为零
3. **ScheduleWakeup 不可用**：`/loop` 模式才暴露。主 CC 直接接力路径已验证可行，不阻塞
4. **M4 retro / ontology / citation expansion 未实装**：candidate 见底前还有 1430 + 146 = 1576 容量（约 15+ rounds buffer），不紧急

## 完整 plan

`/Users/jason/.claude/plans/optimized-honking-dusk.md`
