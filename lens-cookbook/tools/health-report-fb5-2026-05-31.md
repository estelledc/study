# lens-cookbook 健康度报告 v3（反馈环 #5）— 2026-05-31

> 输入：citation-meter v6 trimmed（6 lens 候选瘦身后） + dogfood 4 轮累积（v4 LG / v6 LG / v6 SaaS / v6 OSS-RAG） + 8 lens 完整 v6
> 对照：v1 alignment 55、v2 alignment 80、fb4 alignment 82

---

## 1. 瘦身 ROI（unmatched 砍前 vs 砍后）

| 维度 | 砍前（fb4 / full）| 砍后（trimmed）| Δ | 判读 |
|---|---|---|---|---|
| 6 lens table 未匹配总数 | 54 | 30 | -24 | 实砍 24 条 unmatched 候选 |
| 6 lens candidates_match_rate（均）| 69.1% | **75.0%** | +5.9pp | 接近 80% 但未达 |
| 全 8 lens coverage_pct | 12.53% | **13.71%** | +1.18pp | unique_slugs 81 → 116 |
| priority_hit_pct | 76.92% | **79.49%**（31/39） | +2.57pp | **差 0.51pp 到 80%** |
| dogfood useful_rate（v6 三场景均） | — | **0.74** | 新增 | 含本轮 OSS-RAG 0.56 |
| fm_dangling | 0 | 0 | 0 | 强制字段稳态 |

**ROI 评语**：瘦身是**局部改进、非质变**。砍 unmatched 让 candidates_match_rate 从 69% → 75%，但仍差 10pp 才到 85% 瘦身目标；priority_hit 上 2.57pp 但**仍卡 79.49% < 80% 一线**。最大的 ROI 信号是"砍掉 24 条 unmatched 没让任何 dogfood 步骤的 verdict 翻转"——证明这 24 条候选确实是噪声，删了不可惜。但要到 85% 还需要继续砍 frontend(6)、devops(13)、vllm(10) 三大表的 unmatched，或者把这些候选 force-写进 written 池。

---

## 2. 泛化稳态（3 v6 场景方差）

| 场景 | hit_rate | useful_rate | sufficient 步 | 主要盲区 |
|---|---|---|---|---|
| LangGraph 教学站 | 1.0 | **1.00** | 10/10 | 无 |
| SaaS dashboard | 1.0 | **0.67** | 6/9 | PDF / 邮件 / presigned 上传 |
| OSS RAG 工具 | **0.67** | **0.56** | 0/9 | CLI / 打包 / Release / 嵌入式向量库 / 本地 embed |
| 三场景均 | 0.89 | **0.74** | — | — |
| 三场景方差 | — | **0.035** | — | — |

useful_rate 方差 0.035（极差 0.44）。**仍然在 LangGraph 场景过拟合**——v6 paradigm 的 7 lens 训练语义空间是"agent + 流式 + 视频 + 多服务云端业务"，碰到"零预算单机分发"骨架直接掉到 0 sufficient。本轮 OSS-RAG 是**首次 hit_rate 跌破 1.0**（0.67），说明决策树 Q0 之后的子树**完全没覆盖嵌入式/CLI/分发横切面**。

**泛化结论**：未稳态。每跨一种新骨架就掉一档（1.0 → 0.67 → 0.56），递减斜率约 0.22。第 5 类骨架（mobile native / hardware-embedded）大概率会再掉到 ≤0.4。**不能声称"通用 cookbook"**。

---

## 3. 下一段：局部不过 → 定向 fix

三轨 KPI 复测：

| 轨 | 阈值 | 当前 | status |
|---|---|---|---|
| 1 Quality（candidates_match_rate）| ≥85% | 75.0% | **fail**（差 10pp） |
| 1' Quality（priority_hit）| ≥80% | 79.49% | **fail**（差 0.51pp） |
| 2 Dogfood（4 场景均 useful_rate）| ≥0.8 | 0.66 | **fail**（差 0.14） |
| 2' generalization_score | ≥8/10 | **3/5 = 6/10** | **fail**（差 2pp） |
| 3 Lens 数 | ≥8 完整 v6 | 8 | **pass** |

**AND 门禁：fail。不进真·使用阶段。**

定向 fix 优先级（按"打破当前最弱信号"排序）：

1. **先补 OSS 工具横切盲区**（generalization 杀手）：新增 lens-devtool（CLI / 打包 / Release / 离线 / 单机）+ lens-data / lens-backend / lens-aieng 加嵌入式分支。预期 OSS-RAG dogfood 0.56 → 0.85+，三场景均 useful_rate 拉到 0.85+。
2. **补 SaaS 通用模块盲区**（dogfood 0.67 复测能上 0.9+）：lens-backend 加 §文档生成 + §transactional 通知；lens-media-storage 加 ADR-5 大文件上传协议。
3. **继续瘦身 candidates table**：frontend / devops / vllm 三个表 unmatched ≥10，目标砍到 ≤2/lens；或把高优 unmatched 推进 written 池（A 类流转）。
4. **补一次 priority sync**：39 priority 中 8 条未引用，其中至少 4 条已写入 written——大概率是 ALIASES/wikilink 没对齐，加一轮 normalize 就过 80%。

**不推荐**：直接进真·使用阶段。当前 cookbook 在 OSS 桌面/CLI 骨架"0 sufficient"——Jason 真起一个新项目如果碰巧落进这个语义空间，cookbook 几乎帮不上忙，反向打击 dogfood 信心。

---

## 4. schema 是否再升 v7：累积 must_fix 分析

| dogfood 轮 | must_fix 数 | schema 字段问题 | 内容/范围问题 |
|---|---|---|---|
| v6 LangGraph | 4 | 0 | 4 |
| v6 SaaS | 6（3 高 + 2 中 + 1 低）| 0 | 6 |
| v6 OSS-RAG | 9（5 高 + 3 中 + 1 低）| 0 | 9 |
| 累积 | **19** | **0** | **19** |

**结论：不升 v7 schema**。

19 条 must_fix 全部是"内容范围"——新加 §段、新加 ADR、新加 lens、新加分支判据；schema v6 的字段（candidates / decision-tree / ADR 6 段 / open_questions / fm_wikilinks / hardware_assumption / provider_coverage_checklist）已经能装下所有 19 条。没有任何一条要求"加新字段类型"。

**判断信号一致性**：fb4 报告同样得出"4 条 must_fix 全是内容问题"，本轮 19 条累积下来仍 0 条 schema 问题——**schema v6 已稳定，再升 v7 是过度优化**。下一步是补内容（横切 lens-devtool + 嵌入式分支 + SaaS 通用模块），不是升字段。

---

## 5. alignment_score 重打

vs v1 (55) / v2 (80) / fb4 (82)：

**新分：78 / 100**（-4 vs fb4）。

调整明细：

| 因子 | delta vs fb4 | 理由 |
|---|---|---|
| OSS-RAG dogfood 0.56 暴露第二大盲区 | -6 | 4 轮以来首次 hit_rate < 1.0、首次 0 sufficient |
| candidates_match_rate 75.0% < 85% 目标 | -2 | 瘦身未达预期目标 |
| priority_hit 79.49% 卡 80% 一线 | -1 | 需要一次 ALIASES sync 才能过 |
| 瘦身后 unique_slugs 81 → 116 | +2 | 实质 +35 条引用入账 |
| schema v6 累积 19 must_fix 全 0 字段问题 | +2 | schema 稳态确认 |
| dogfood 4 轮均 0.66 < 0.8 目标 | -1 | 三轨之一 fail |
| generalization 6/10 vs 8/10 目标 | -2 | 泛化未达 |
| 瘦身 ROI 验证（24 unmatched 砍掉无 verdict 翻转）| +2 | 工具/决策正确性确认 |

**78 = cookbook 在 cloud-native 业务骨架内已成熟（≥8 完整 v6 lens、schema 稳定、教学场景 1.0），但在 OSS 桌面 / CLI / 嵌入式骨架上几乎裸奔，且瘦身/priority 两个数字 KPI 均卡阈值一线**。

下降原因不是退步，是**第 4 轮 dogfood 让真实泛化能力被首次量化**——前 3 轮高估了 cookbook 的覆盖面。78 是更诚实的分。

---

## 综合

- **health_path**：yellow-green（同 fb4，未上 green 因泛化未稳 + 三轨 fail）
- **alignment_score**：**78 / 100**
- **三轨 AND**：fail（Quality fail / Dogfood fail / Lens pass）
- **下一步**：定向 fix（lens-devtool 横切 + SaaS 通用模块 + 表瘦身 + ALIASES sync）；**不进真·使用阶段**；起反馈环 #6 复测。
- **schema v7**：不升，全 19 must_fix 是内容问题。
- **关键警示**：每跨一种新骨架 useful_rate 掉 0.22，第 5 类骨架（mobile/embedded）大概率到 0.4 以下。在补 lens-devtool 之前，"通用 cookbook" 不是真命题。
