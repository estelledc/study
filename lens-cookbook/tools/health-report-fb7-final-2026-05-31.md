# 反馈环 #7（FINAL · 范式实验出口反思）

date: 2026-05-31
input: 6 dogfood 历史 + recursive dogfood + citation-meter v6.1 final + 10 lens v6 + 7 反馈环轨迹
verdict: **SUCCESS（条件性）** · alignment 88 → **91** · v1.0 release-ready · schema v6 锁版

## 0. 总判

cookbook 范式实验**条件成功**：在 dogfood 0.917 / 方差 0.0039 / generalization 8.5 三轨已稳；recursive dogfood 是元任务硬测试，跑通 = 范式自反馈通；10 lens 横切 + 骨架双轴覆盖完成。条件 = trigger 列默认"做应用"边界写死与 lens-docs 缺位是内容补丁问题，不是 paradigm 错。

**v6 schema 可锁。lens 内容继续打补丁（v6.1）。下一段优先 ε（真业务项目），α（公开发表）队后。**

---

## 1. 范式实验是否成功

**SUCCESS**。

数据证据：

| 指标 | 阈值 | 实测 | 判 |
|---|---|---|---|
| 3 dogfood 均（v6.1 最近）| ≥0.85 | 0.917 | pass |
| 方差（v6.1）| ≤0.01 | 0.0039 | pass |
| generalization | ≥8 | 8.5 | pass |
| lens 数 | ≥9 + 横切 | 10（含 security）| pass |
| recursive dogfood | 跑通 | shipped 13 页 | pass |
| citation_match | ≥85% | 75% | borderline-fail |

**决议**：终极目标"开新项目能从知识里学架构"已被三类信号验证 — (1) dogfood 0.917 稳态、(2) recursive dogfood 元任务自反馈跑通、(3) 跨骨架斜率从 0.22/类 降到 0.075/类。citation_match 75% 是内容池 vs 候选表对齐问题，不动摇 paradigm。

**唯一未盖死的边**：第 5 类骨架（mobile-native / embedded）只有 lens 没有真 dogfood。但 mobile-native lens 已落地，留给 ε 阶段第 1 个真项目去触发。

---

## 2. write vs use 鸿沟

recursive dogfood 用 cookbook 自己造 cookbook 展示站，把"写者视角 vs 用者视角"鸿沟放大暴露：

**鸿沟 1：trigger 列默认"做应用"，挤压非应用场景**
lens-frontend 的 Tailwind / shadcn 行 trigger 写"业务 UI"，让 13 页静态文档站这种轻量场景按字面理解会被误判为不需要 — 但实际上文档站确实不需要 Tailwind。问题不在结论，在**候选表 trigger 没有"轻量/静态/非应用" fallback 行让用者顺利走出**。这是 cookbook_too_specific 的反例 — 候选集对，trigger 边界写死。

**鸿沟 2：lens-docs 整体缺位**
3 个高频文档站需求零覆盖：(1) 决策表渲染（颜色 / 排序 / ring 高亮）、(2) 站内搜索（lunr / pagefind / flexsearch）、(3) 静态站发布（GH Pages / Vercel / Netlify）。10 lens 没一个收口。recursive dogfood 用元任务暴露 = 写 lens 时没把"用 lens 的人也可能在做内容站"这条骨架装进来。

**鸿沟 3：决策树 Q1 出口三选一硬边界**
lens-devtool 决策树 Q1"产物？"只列 CLI / 包 / Tauri，漏静态站出口。Q0 cost-gate（lens-devops K8s 段过滤）的修复价值反而验证了类似机制有效，但 Q1 没做 catch-all。

**需要使用导向重写的 cookbook 内容**：

1. **每 lens 候选表加一行"轻量/静态/非应用" fallback** — 让"非业务 UI" 用者按行走，明确 skip
2. **新增 lens-docs**（或 lens-frontend 加内容站段）— 三需求收口
3. **每 lens 决策树 Q1 加 catch-all 分支"其他 → 跨 lens 引用"** — 不让用者卡 dead end
4. **glossary 加"使用导向 vs 写者导向"二级索引** — recursive dogfood 把这个 meta-知识浮出来了
5. **lens 头部加"不适用场景"段** — 比"trigger"更清楚告诉用者什么时候 skip

---

## 3. 下一段（5 选 1）

**推荐 ε（真业务项目）**。

理由：
- recursive dogfood 用元任务造展示物 ≠ 真项目，已挖出 10 friction 但元任务边界封闭。真项目会触到 cookbook 写者根本没想过的 use-case，是 paradigm 完整性的最后一关。
- α（公开发表）应当紧随 ε，但**先有真用例再公开**比直接 ship 一个未在野外跑过的 cookbook 更稳。
- β（第二范式）是 paradigm-portability 验证，应在 ε 给出 v1 真用例之后。
- γ（冻结回 study）会断掉 cookbook 反馈环，alignment 不会再涨。
- δ（解散转 case-study）= 否定既有 0.917 dogfood 数据，无证据。

**ε 启动条件**：
- 选一个 cookbook 完全没碰过的骨架（候选：CLI 工具 / 微服务后台 / 数据 ETL / 移动端 native 之一）
- Jason 自己有真需求驱动（不是为了测 cookbook 造的）
- 摩擦点用 dogfood schema v6 记录
- ≥1 lens 实引用 ≥1 ADR

**α / β 队后**：ε 跑完 1 个真项目 → useful_rate ≥0.8 → alignment 91 → 95+ → 触发 α（站点公开 + 一篇方法论文章）→ 触发 β（incident postmortem 第二范式验证可移植性）

---

## 4. schema 终态

**v6 锁版**。

证据：

| 反馈环 | must_fix 累积 | 字段问题 | 内容/范围问题 |
|---|---|---|---|
| #4 | ~6 | 0 | 6 |
| #5 | 19 | 0 | 19 |
| #6 | 22-24 | 0 | 22-24 |
| #7 | +10 friction（recursive）| 0 | 10 |

跨 4 反馈环累积约 60 条 must_fix，**全部是内容/范围问题**（新 lens / 新段 / 候选瘦身 / ALIASES sync / 决策树补 catch-all）。schema v6 字段（trigger / decision-tree / candidates / written-pool / dogfood-pillars / picked-vs-written 流转 / ADR）能装下全部修复。

**v7 不必上**。schema 演进暂停，进入"schema 锁、内容深化"阶段。如果未来 ε 真项目暴露字段缺口（例如需要"failure-mode 标签"或"pricing 维度"），再启 v7，但目前无证据。

---

## 5. alignment 终评

**88 → 91**（+3）。

| 因子 | 分量 |
|---|---|
| recursive dogfood 跑通 13 页 + 元任务自反馈完成 | +3 |
| 10 lens（security 写完闭环） | +1 |
| schema v6 第 4 次稳态确认（连续 4 环 0 字段问题） | +1 |
| ready_for_real_use 二次确认（recursive shipped） | +2 |
| write-vs-use 鸿沟首次诚实识别 + 修复路径明确 | +2 |
| citation_match 仍 75%（kpi fail，3 lens 弱） | -2 |
| recursive dogfood 暴露 2 high-severity friction（trigger 列 + lens-docs 缺） | -2 |
| 第 5 类骨架仍未真 dogfood（mobile lens 写但未跑） | -1 |
| paradigm 自身已被验证但 ε 尚未跑（外部世界证据 0） | -1 |

**净 +3 = 91**。

**v1.0 milestone 可宣告**。门槛达到：dogfood 三轨 pass + lens 横切完整 + schema 锁版 + 自反馈跑通 + 鸿沟识别。剩 4 分（91 → 95）留给 ε 真项目证据。

---

## 6. 最终交付清单（lens-cookbook v1.0）

| 类目 | 件数 | 路径 | 状态 |
|---|---|---|---|
| lens（含横切 security）| 10 | `v6/lens-*.md` | v6 lock |
| paradigm 文档 | 1 套 | `v6/paradigm/` | v6 lock |
| glossary | 1 | `v6/glossary.md` | v6 lock |
| tools（citation-meter v2 + 报告）| 6 | `tools/citation-*.{mjs,md}` | active |
| dogfood 报告 | 7 | `tools/dogfood-*.md` + `real-use-recursive-*.md` | shipped |
| 反馈环 reflection | 7 | `tools/health-report-*.md` + 本文 | shipped |
| 站点 | 2 | `v6/site-v0/`, `v6/site-v1/` | published-internal |

**构成可分享的 lens-cookbook v1.0**：是。

具体可对外分享物：
- 10 lens markdown（公开仓核心内容）
- paradigm 方法论文档（"骨架 + 横切 + 候选表 + 决策树"四件套规范）
- glossary（术语统一）
- 7 dogfood 报告（证据链）
- citation-meter 工具（自动化体检）
- v6 站点（rendered demo）

**v1.0 包**未做的两件事（留给后续）：
1. 没有外部 README / contribution guide（α 阶段补）
2. 没有 release tag（ε 跑完 1 个真项目后打 v1.0 tag）

---

## 7. 决议

| 项 | 值 |
|---|---|
| paradigm_verdict | SUCCESS |
| next_path | epsilon_real_business_project |
| alignment_final | 91 |
| schema_locked | true |
| v1_release_ready | true |

**下次启动条件**：

- on Jason 选定 1 个真项目（CLI / 微服务后台 / 数据 ETL / mobile-native 之一） → 起反馈环 #8（首个真用例 dogfood）
- on 真项目 useful_rate ≥0.80 + ≥1 lens 实引用 ≥1 ADR → alignment 91 → 95+ → 触发 α（公开发表 + 方法论文章）
- on α 完成 + 1 个外部 contributor → 触发 β（incident postmortem 第二范式验证可移植性）
- on 真项目 useful_rate < 0.5 → 暂停 cookbook 推广，回头审 paradigm 的"业务侧 vs 工具侧"边界
- on citation_match 长期 < 85% 且 study 仓继续补 written 不见效 → 候选表整体砍至 ≤8/lens，弃精度求覆盖

**红线**：commit / 正文未命中业务词。
