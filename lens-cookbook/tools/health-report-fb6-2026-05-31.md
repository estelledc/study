# lens-cookbook 健康度报告 v4（反馈环 #6）— 2026-05-31

> 输入：4 原 dogfood + 2 复跑（OSS-RAG v6.1 0.85 / SaaS v6.1 0.90）+ 9 lens 全 v6
> 对照：v1=55 / v2=80 / fb4=82 / fb5=78

---

## 1. 三场景泛化（双视角）

| 视角 | 集 | 平均 | 极差 | 方差 |
|---|---|---|---|---|
| 6 轮全量 | {0.40, 1.00, 0.67, 0.56, 0.85, 0.90} | **0.73** | 0.60 | 0.045 |
| v6.1 后最近一轮（每场景）| {LG 1.00, SaaS 0.90, OSS 0.85} | **0.917** | 0.15 | **0.0039** |

**vs fb5**：v6 三场景方差 0.035 → v6.1 三场景 0.0039（-89%），极差 0.44 → 0.15（-66%）。跨骨架掉档斜率 0.22/类 → 0.075/类。

**generalization_score**：fb5 6/10 → fb6 **8.5/10**。理由：4 类骨架（cloud-native + 教学 + OSS 桌面/CLI + SaaS 通用模块）已稳态、0 sufficient 场景从 1 → 0；第 5 类骨架（mobile/embedded）lens 已建未实测。要到 9.5/10 需补 mobile-native dogfood 实跑。

历史诚实：6 轮全量 0.73 < 0.85，前两条曲线（v4 0.40 + v6 未修 0.67/0.56）作为历史包袱保留。当前真实能力位是最近一轮 **0.917**。

---

## 2. 9 lens 饱和度

| 候选 | 现状 | 真缺否 |
|---|---|---|
| **lens-security** | OAuth/JWT/secrets 散在 backend/aieng/devops；威胁建模/合规缺 | **真缺**（高横切） |
| ml-research | aieng 边缘提及；HF Trainer/W&B 缺 | 弱缺，受众窄 |
| mobile-payment | mobile §10 一条；Stripe/Apple Pay 缺 | 弱缺，应作 mobile §子段 |
| iot-embedded | 完全缺 | 弱缺，应开"工具侧 cookbook"二范式 |
| data-engineering | data 含部分；Spark/Flink/批 ETL 缺 | 半缺，应在 data 内扩 §批处理 |

**结论**：9 → **10**（加 lens-security 一项），之后冻结。security 横切覆盖 6/9 现 lens（auth/secrets/network/输入校验/审计/密钥）；与第 5 类骨架（mobile + 支付）泛化挂钩，不补 dogfood 大概率掉 0.15-0.20。其他 4 个不动，避免范式分裂。

---

## 3. 下一段决策

| 条件 | 触发段 |
|---|---|
| dogfood 平均 ≥ 0.85 + 方差 < 0.15 | **ready_for_real_use** |
| 0.7-0.85 | 还有 fix |
| < 0.7 | paradigm 回炉 |

最近一轮均 **0.917** + 方差 **0.0039** → **ready_for_real_use 触发**。

**主路径**：用 cookbook 帮 Jason 真开 1 个项目，反向压测摩擦点。

候选（按反压强度）：

1. **lens-cookbook 自身的展示站**——压 frontend + backend + media-storage + devops，自吃自做反馈最密
2. RSS / 笔记同步 OSS 工具——首次跨骨架真使用，压 lens-devtool
3. mobile-native 单页应用——压 lens-mobile，把第 5 类骨架真测了

**强烈推荐 1**：Jason 已熟领域，摩擦点会被快速放大。

**并行**：写 lens-security。security 是真使用阶段最易踩坑的横切（OAuth callback / cookie / .env / 密钥 rotate），跟着真项目同步建效率最高。

三轨 KPI 状态：dogfood **pass** / generalization **pass** / lens **pass**；Quality（candidates_match_rate / priority_hit）需重跑 citation-meter v6.1 trimmed 复测。

---

## 4. schema v7 是否需要

| 轮 | must_fix | 字段问题 | 内容/范围 |
|---|---|---|---|
| v6 LG | 4 | 0 | 4 |
| v6 SaaS | 6 | 0 | 6 |
| v6 OSS-RAG | 9 | 0 | 9 |
| v6.1 OSS-RAG（估）| 2-3 | 0 | 2-3 |
| v6.1 SaaS（估）| 1-2 | 0 | 1-2 |
| **累积** | **~22-24** | **0** | **22-24** |

**结论：不升 v7**。22+ 条 must_fix 全部是"内容范围"问题（新 ADR / 新 §段 / 新 lens / 新分支 / 候选瘦身 / ALIASES sync）；schema v6 字段（candidates / decision-tree / ADR 6 段 / open_questions / fm_wikilinks / hardware_assumption / provider_coverage_checklist）已能装下全部。**0 条要求加字段或改字段类型**。

升 v7 触发信号：未来 3 轮 dogfood 累积出现 ≥3 条字段类问题，才考虑；当前维持 v6。

---

## 5. alignment_score 重打：78 → **88**（+10）

| 因子 | Δ | 理由 |
|---|---|---|
| v6.1 双复跑双过阈值（0.85 / 0.90）| +6 | OSS 桌面 + SaaS 通用两盲区一次补完 |
| 方差 0.035 → 0.0039（-89%）| +3 | 跨骨架收敛是"通用性"真信号 |
| generalization 6/10 → 8.5/10 | +4 | 4 类骨架稳态 |
| 9 lens 横切+骨架双覆盖 | +2 | devtool + mobile 完整 |
| 拟加 lens-security 闭环 | +1 | 真使用阶段刚需 |
| ready_for_real_use 首次触发 | +3 | 跨过工具→真使用相变点 |
| schema v6 稳态二次确认（22+ 全 0 字段）| +1 | 框架成熟度 |
| 6 轮全量 avg 0.73 < 0.85 | -3 | 历史包袱保留诚实 |
| Quality 两轨待复测未确认 | -2 | 75.0% / 79.49% 未过门槛 |
| 第 5 类骨架（mobile/embedded）未实测 | -2 | 8.5/10 非 9.5 的主因 |
| lens-security 已识别未写 | -3 | 真使用前最该补的横切仍空 |

**88 = 跨过工具阶段**：v6.1 paradigm 在 4 类骨架稳态、9 lens 横切骨架双覆盖、schema v6 经 22+ must_fix 验证不需改字段。**未到 95+**：第 5 类骨架未实测 + Quality 两轨待复测 + lens-security 仍空缺。

下次跨档（88 → 92+）触发：mobile-native dogfood ≥ 0.80 + lens-security 写完且 1 真项目实引用 ≥1 ADR + citation-meter v6.1 trimmed candidates_match_rate ≥ 85% + priority_hit ≥ 80%。

---

## 综合

- **health_path**：green（首次离开 yellow-green）
- **alignment_score**：**88 / 100**（+10 vs fb5）
- **quality_status**：borderline（dogfood/generalization/lens 三 pass，Quality 两轨待复测）
- **overall_status**：**ready_for_real_use**（dogfood 0.917 + 方差 0.0039 触发）
- **schema v7**：不升（22+ must_fix 累积 0 字段问题）
- **lens 数**：9 → 10（加 lens-security 后冻结，进入纯内容深化）
- **关键里程碑**：方差降 89% / 跨骨架斜率 0.22→0.075 / dogfood 首过 0.85
- **下一动作**：起 lens-cookbook 自身展示站作真项目（纯个人/OSS 语境），并行写 lens-security；同时重跑 citation-meter v6.1 trimmed 把 Quality 两轨补完
