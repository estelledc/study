# ADR 0001 — 内容体量治理策略

**状态**：已接受  
**日期**：2026-06-05

---

## 背景

study 仓库目前（2026-06）已有 726 个项目笔记 + 796 篇论文笔记 = 1522 篇，`.git` 目录约 129 MB，每次 `npm run build` 构建约 12-30 秒，全库 `quality-gate-all` 约 5-10 秒。

`auto-push v3` 流水线设计上可持续写入，单个 round 最多 120 slug。如果继续按原有 `TARGET=20000` 的量化目标，预计 3-6 个月内会达到 5000+ 篇。

## 决策

**当前（< 2500 篇）：单仓单构建，不拆分**

- 所有内容维持在同一 git 仓库
- build 预算断言：`npm run build` CI 用时 < 180s（ubuntu-latest）
- 每周 main push 触发全量 gate + build；PR 仅扫变更文件

**2500–5000 篇（触发评估阶段）**

评估以下方案之一：
1. **分目录子模块**：papers/projects 拆为独立 git submodule，build 并行化
2. **Astro Islands / 懒加载 atlas**：大型索引页按主题分页，减少单页构建时间
3. **分仓**：papers 和 projects 独立仓库，deploy 到同一 GitHub Pages 子路径

评估时用 `tests/build-budget.test.mjs` 断言结果。

**放弃 20000 篇 TARGET**

量化 KPI 改为：
- gate 通过率 = 100%（严格策略）
- L4 backfill queue 趋零（质量目标）
- build 时间 < 预算

## 后果

- 不触发拆仓行动，维持简单架构
- `exit-conditions.mjs` 已移除 `TARGET=20000`
- 下次体量评估时间点：papers+projects 总数 ≥ 2500 时
