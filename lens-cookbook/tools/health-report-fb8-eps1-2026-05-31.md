# 反馈环 #8 — ε 阶段首轮 (embodied-ai-research) 健康检查

> 日期：2026-05-31 · cookbook 版本：v6（10 lens, schema locked）· 输入：1 真项目 dogfood × 3 项改进 × 6 决策步 = 18 决策步样本

---

## 1. ε 首轮信号判读

### useful_rate vs 历史平均

| 轮次 | useful_rate | friction | high |
|---|---|---|---|
| v6.1 SaaS / OSS-RAG / LG 平均 | **0.917** | 中 | 1-2 |
| ε 首轮 embodied-ai | **0.55** | 14 | **4** |
| 落差 | **-0.367 (-40%)** | +4 | ×2 |

### 落差归因（按决策步拆）

- **cost-gate（Q0）**：1.0 → 1.0，**保持** carry。三项均 Q0 同向收敛（个人/0 预算/单机），稳。
- **候选拉取**：~0.0。3 项里 Pagefind / KaTeX / 单组件 TOC pattern 全 0 命中。
- **立场列**：~0.2。对 Pagefind / 数学渲染 / 单组件 pattern 全沉默。
- **ADR**：~0.4。无直接覆盖，全靠"借精神/借阈值/借哲学"平移，且 #10 outline 借 ADR-3（RSC 上下文）有错位风险。
- **决定**：1.0。三项最终方案全部成立、可落地。

**结论**：paradigm 链路（路由 → cost-gate → 立场 → ADR → 决定）**没断**，是 coverage 在 doc-site 子域薄。这是 fb#7 SUCCESS_conditional 暗藏的"业务侧 vs 工具侧"边界**首次显化**。

### new_lens_gaps 严重度

- **真盲区（约 60%）**：lens-docs 整体缺位 / lens-frontend 缺单组件 pattern 横切层 / lens-devtool 缺文档站搜索 + 公式渲染类目 / lens-data 缺中文分词在静态索引的位置。这些是**横切类目级**缺失，不是写得不细。
- **cookbook_too_abstract（约 40%）**：KaTeX 字体回退链、IO rootMargin、measure 保护 68ch、sticky offset 等参数级缺失。这些只要补 §节就好。

### paradigm verdict

**SUCCESS_borderline**（条件性 / 边界子域显化）。理由：
- paradigm 5 步链路在新子域**未崩**（cost-gate carry，最终决定全成立）
- 但 coverage 在 doc-site 子域不足，0.55 单点不足以判"普遍下滑"还是"子域特例"
- 不到 NEEDS_FIX（链路没坏），不到 SUCCESS_confirmed（dogfood 单点 < 0.7）

---

## 2. embodied-ai-research 作 ε 1/N 的合适度

### 决策步丰富度：**够**

- 3 项改进 × 6 步 = **18 决策步**（> 12 步阈值）
- 4 friction_type 全覆盖：lens_missing × 4、cookbook_silent × 4、cookbook_too_abstract × 3、cookbook_too_specific × 2、cookbook_misled × 1
- 验出 4 项 high severity，样本暴露率合格

### 跨 lens 覆盖：**偏窄**

- 三项均落 frontend / devtool / data 三 lens（doc-site 子域内）
- 未触达 backend / aieng / mobile / vllm / media-storage / security 共 6 lens
- 单项目天然受子域约束，不是项目问题，是 N=1 的固有局限

### ε 阶段建议轮数：**5 轮**（不是 3 / 不是 10）

- 3 太少：无法覆盖第 5 类骨架的多分支（CLI / ETL / mobile-native / 微服务 / IaC），结论易被单子域绑架
- 10 太多：过拟合 + 边际信息递减；后期 friction 重复率会高
- 5 恰好：5 项目对应 5 个未覆盖子域，均匀采样。建议序列：
  1. doc-site（已跑，embodied-ai-research）
  2. CLI 工具（lens-devtool 主场，验业务侧 vs 工具侧）
  3. 数据 ETL（lens-data 主场）
  4. mobile-native（lens-mobile 主场，generalization 8.5 → 9.5 的最后一块拼图）
  5. 微服务 / IaC（lens-backend + lens-devops + lens-security 联动）

5 轮全跑完，dogfood 矩阵 5 项目 × 8.5 历史 平均能算出"子域 × paradigm carry 度"二维表，比单点 0.55 信息量高一个数量级。

---

## 3. lens 体系是否还需修

### synth 给的 lens_to_extend（来自 dogfood 报告）

- **lens-frontend** 加 §单组件 pattern / §字体排版 / §a11y 默认
- **lens-devtool** 加 §文档站搜索 / §数学公式渲染 / ADR『CDN 第三方脚本与 markdown 管线协作』
- **lens-data** 加 §中文/小语种静态索引
- **新增 lens-docs**（强烈建议）或 lens-frontend 下开 `subtype: ui-pattern`

### 真盲区 vs cookbook_too_abstract 占比

- 真盲区（横切类目级）：4 项 high 中 3 项是 lens_missing / cookbook_silent → 必须补 §或新 lens
- 写得不够细：1 项 mid（KaTeX 字体回退）+ 1 项 low → 补 §就够
- **比例约 6:4 真盲区**

### 修不修？怎么修？

**结论**：需要修，但**不要现在大手术**。理由：

- 1 子域数据（doc-site）就上 lens-docs 风险**过拟合**——可能这个 lens 对 CLI/ETL/mobile 子域 ROI 极低
- 应等 ε 跑完 ≥ 3 子域，看哪些缺口**反复出现**（cross-project recurrence）再决策
- 现在能做的**低风险动作**：lens-frontend / lens-devtool 加 §子段（决策树叶子层），不动 lens 总数

**修的优先级**（先后顺序）：
1. lens-frontend 加 §单组件 pattern（candidates + 立场列）— 最高 ROI，TOC/banner/footnote 是任何 web 项目都用
2. lens-devtool 加 §文档站搜索（Pagefind / lunr / MiniSearch / FlexSearch / Algolia 候选表）
3. **暂缓**新建 lens-docs（等 ε 第 3-5 轮看是否反复缺）

---

## 4. 下一段路径选择

### 4 选 1 评估

| 路径 | 优势 | 风险 | 决策 |
|---|---|---|---|
| α: 实施 3 项 → round-2 dogfood | 验 synth 推荐准不准 | 同子域 round-2 是**内生**验证，不能区分"真改进"还是"已知答案"。1 子域单点不足以代表泛化 | **否** |
| β: ε 第 2 项目（CLI/ETL/mobile）扩样本 | 直接验 0.55 是 doc-site 特例还是普遍下滑；2 子域数据点比同子域 round-2 信息量高 | 推迟实施收益（KaTeX/Pagefind 真有用） | **是** |
| γ: synth 暴露盲区严重 → 先补 cookbook | — | **致命**：1 子域单点就改 lens 体系 = 过拟合。可能补出来的 lens-docs 在 CLI/ETL 子域 ROI 接近 0 | **否** |
| δ: ε 跑通了 → 宣告 SUCCESS, 进 α (publish) | — | **过度乐观**：dogfood 0.55 远低于 0.85 阈值，宣告 SUCCESS 不诚实 | **否** |

### 推荐：**β** + 弱 α（背景实施）

- **主路径 β**：选 ε 第 2 项目（建议 CLI 工具，因 lens-devtool 是其主场，能直接验 cookbook 在工具侧子域的 carry 度）。跑 dogfood 看 useful_rate ≥ 0.7。
- **背景 α**：KaTeX / Pagefind 实施仍做（真有用且 ROI 高），但**不专门**为 round-2 dogfood 跑——做完即可，作为 dogfood 副产物自然出 round-2 数据，不强求门槛。
- **明确不做 γ**：lens 体系**不动**，等 ε 第 3 轮看是否真盲区反复出现。
- **明确不做 δ**：v1.0 milestone 维持 fb#7 的"条件性 SUCCESS"，不升级为 confirmed。

### next_immediate_action

**Jason 选定 ε 第 2 真项目并启动 dogfood**。优先级建议：CLI 工具 > 数据 ETL > mobile-native。任何 1 个均可，关键是与 doc-site 不同子域。

---

## 5. alignment_score 重打

### 与 fb#7 final = 91 对比的 delta

- **-3** ε 首轮 useful_rate 0.55 vs 之前 0.917 平均，单点显著下滑
- **-2** doc-site 子域暴露 lens 真缺口（lens-docs / 单组件 pattern 横切层），fb#7 未识别
- **-1** high friction 4 项（vs 之前 1-2 项），翻倍
- **+1** paradigm 链路在新子域**未崩**（cost-gate carry，最终决定全成立）
- **+1** 真盲区被精确定位（lens_missing × 4 / cookbook_silent × 4 / cookbook_too_abstract × 3 / cookbook_too_specific × 2 / cookbook_misled × 1）—— 不是 paradigm 错，是 coverage 拓展任务，可修
- **+1** schema 在新子域仍 **0 字段问题**（v6 第 5 次稳态确认）

净 delta：**-3** → **88**

### 评分意涵

88（=fb#6 等位）说明：
- ε 启动让我们诚实暴露了 fb#7 91 分里的"乐观成分"（"条件性 SUCCESS"在第 1 个真子域就显化了边界）
- 但下降幅度小（91 → 88，3 分），证明 paradigm 本身仍稳，是子域 coverage 待扩
- 88 是**信息含量更高**的分数，不是退步

---

## 输出元信息

- 字数：~2380 字
- 红线词检查：commit / 正文均未命中业务词
- 下一段 trigger 同时落 `/tmp/long-loop-state.md` "## 反馈环 #8 (ε-1) 2026-05-31"
