# lens-cookbook 项目健康度报告 v2 2026-05-31

> 输入：citation-meter v4 → v6 对比 + dogfood v4 → v6 对比 + 5 lens schema v6 验收 + commit 03d82ae
> 对照：v1（2026-05-31 上午，alignment 55，verdict red-yellow）

---

## 1. 重构 ROI（v4 → v6）

| 指标 | v4 | v6 | Δ | 判读 |
|---|---|---|---|---|
| dogfood useful_rate | 0.4 | 1.0 | +0.6 | **质变**：cookbook_partially_works → cookbook_works_for_real_project |
| dogfood blockers | 5 | 0 | -5 | 5 个核心阻塞全清 |
| coverage_pct | 9.85% | 12.53% | +2.68pp | 上升但未达 stretch 15% |
| unique_slugs_cited | 81 | 106 | +25 | **跨过 100 阈值**（dogfood 健康线）|
| priority_hit_pct | 73.33% | 76.92% | +3.59pp | 接近 80% 但未达 |
| priority_actually_cited | 22 | 30 | +8 | 队列方向持续对 |
| ADR 段落抓取 | 无 | context/decision/consequences/rollback/alternatives/rationale 全维度 | 新增能力 | meter v6 新增段 grep |
| fm_wikilinks_total | 0 | 59 | +59 | 强制字段生效，零 dangling |
| lens 数 | 5（含 vllm-fixed v3）| 7（5 升 v6 + media-storage 新增 + vllm/data 留 v3/v4） | +2 实质，+1 新切分 | 前端 + 媒体存储两块大肉补上 |

**ROI 评语**：D 段重构是高 ROI 决策。dogfood useful_rate 从 0.4 拉到 1.0 表示「cookbook 真能拿来做一个新项目」的门槛跨过；coverage 与 priority_hit 虽未达 stretch，但 written.txt 同期增长 24 条稀释了分母 + priority picked 同期 30 → 39 新增项尚未进 lens，**不是退步，是分母/分子同时扩**。

---

## 2. schema v6 是否再升 v7

**结论：不升**。

dogfood v6 verdict = `cookbook_works_for_real_project`，blockers = 0，零阻塞。must_fix_v7 4 条全部是 **内容/范围** 问题，不是 schema 字段问题：

| must_fix 条目 | 类型 | 严重度 |
|---|---|---|
| lens-aieng ADR-5「工具数 ≤5」阈值文档化为 open_question | **内容补强**（已在 ADR 文本里，需提到 open_questions 段） | 低 |
| lens-media-storage Bunny 50×10min 月费实测 | **外部实测数据** | 低（已挂 open_questions） |
| lens-frontend RSC streaming 跟踪 2026Q4 review | **时间型 review item** | 低 |
| 跨 lens 教学站 preset（6 lens × 决策树脚手架）| **新工件**，不是 schema | 中（建站前置） |

schema v6（candidates / decision-tree / ADR ctx-decision-conseq-rollback-alt-rationale / open_questions / fm_wikilinks）已经能装下所有 4 条 must_fix。**v7 是过度优化**。

---

## 3. 下一段策略（D 已完 → A 还是 B）

**推荐：先 B（建站），不等 ws5e8tvqe fb3**。

逻辑链：
- v1 报告里「先 B 后 D 是把半成品端出去」的判断前提是 useful_rate=0.4。**v6 useful_rate=1.0，前提失效**。
- 对照 fb3 的旧框架（A/B/C/D 四选）：D 已完成，A 推 quality 到 165 unique_slugs 是 **数字驱动**，但 dogfood 已说 cookbook 够用——继续灌 quality 不解决新问题。
- B 建站（cookbook 公开）的真实价值是 **教学站 preset 这个 must_fix 的载体**。dogfood must_fix 第 4 条「跨 lens 教学站 preset」本质就是建站的初始内容。**B 与 must_fix 第 4 条同源**。
- 是否等 fb3：**不等**。fb3 旧框架基于 v4 数据（useful 0.4），数据已过期。等它跑完拿到的建议大概率还是「先 D 后 A」——v6 重构已经把它的逻辑前提抽空。

A 不放弃，但放在 B 之后并行：建站过程中如果发现某个 lens 在公开教学场景下论据弱，**定向补 quality**（不是盲灌 165）。

---

## 4. 长循环 KPI 改写

**旧 KPI**：study 笔记 → 20000。
- 问题：单一数量指标，与「能否开新项目」零相关性。822 → 846 涨 24 条但 dogfood 翻倍，**说明数量不是瓶颈**。

**新 KPI（三轨并行）**：

| 轨 | 指标 | 阈值 | 当前 | 距离 |
|---|---|---|---|---|
| Quality | unique_slugs_cited / written_count | ≥ 70%（这是 dogfood 阈值，不是 70% coverage 全笔记）| 12.53% | 还远，但语义不是「全笔记必须被引」，应改为 `cited_in_lens / total_lens_candidates ≥ 70%` |
| Dogfood | useful_rate（每次新增 lens 后跑一次）| ≥ 0.8 | 1.0 | **达成**，维持 |
| Lens 数 | 完整 v6 lens（含 ADR 6 段 + open_questions + fm_wikilinks）| ≥ 8 | 5（不计 vllm-v3 / data-v4）| 差 3 |

**KPI 修订要点**：
- `cited / 笔记 ≥ 70%` 这个原始定义在 lens-cookbook 场景下不合理（有些笔记永远不会被任何 lens 引用，比如个人 daily）。应改为 **「lens 候选表里被实际引用的比例」**——这才是「ADR 是否有实证支撑」的真信号。
- dogfood ≥ 0.8 已达，**改为「每新增 lens 必跑一次 dogfood，跌破 0.8 就修不进 v7」**——质量门禁化。
- Lens ≥ 8：留 3 个槽位。候选：`lens-data-v6`（升级老版本）、`lens-vllm-v6`（升级老版本）、`lens-mobile`（移动端尚未覆盖）、`lens-search-recommend`（搜推工程也是空白）。

---

## 5. alignment_score 重新打

**v1 给的 55**（cookbook_partially_works，5 大 blocker，前端/媒体两块裸奔）。

**v2 重新打：80 / 100**。

加分项：
- +15 dogfood useful_rate 0.4 → 1.0（cookbook_works_for_real_project，已跨「开新项目能学架构」的实证门槛）
- +5 lens 切分补全（前端 + 媒体存储不再裸奔，决策树覆盖 PaaS 起点）
- +3 schema v6 ADR 6 段全维度（context/decision/consequences/rollback/alternatives/rationale）
- +2 fm_wikilinks 强制机制生效，未来 meter 度量更准

未到 90+ 的扣分项：
- -10 lens 数 5/8（差 3 个，data/vllm 老版本未升级，mobile / search-recommend 未起）
- -5 教学站 preset 未做（must_fix 第 4 条），cookbook 仍停留在「单 agent 自用」未到「公开传授」
- -5 priority_hit 76.92% 未到 80%，coverage 12.53% 未到 15%（数据驱动的 stretch 仍差）

**80 = cookbook 已经能用，但还没有公开发表的成熟度**。

---

## 综合

- **health_path: yellow-green**（v1 是 red-yellow；dogfood 跨阈值 + schema 稳定 + lens 切分补全，整体上一档；未到 green 因为 lens 数和教学站 preset 仍差）
- **alignment_score: 80 / 100**
- **下一步**：B（建站 / 教学站 preset），不等 ws5e8tvqe fb3。建站过程中按需定向补 quality，不盲推 165。同时把 lens-data / lens-vllm 排队升 v6 + 起 lens-mobile 或 lens-search-recommend 凑齐 8 个。
- **新 KPI**：三轨并行（lens 内引用率 ≥ 70% + dogfood useful_rate ≥ 0.8 每 lens 必跑 + lens 数 ≥ 8），废弃「study 笔记 → 20000」单一数量目标。
