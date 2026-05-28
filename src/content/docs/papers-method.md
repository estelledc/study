---
title: 怎么消化一篇论文
description: 8 层论文阅读方法论——把 PDF 变成你能转述、复现、批判的判断力
sidebar:
  order: 3
---

> 这是这个站点所有论文笔记遵循的方法论。
> 项目笔记（[7 层](/study/method/)）回答"代码是怎么写的"；论文笔记回答"想法是怎么验证的"。
> 两边的硬底线相同：**不读源 / 原文，不写笔记**。

## 失败模式（先看这个）

不及格的论文笔记：

- abstract + contributions 翻译，没读过任何引用论文
- "方法"段照抄公式没解释**为什么这么定义**
- 没碰过代码 / 没看过 figure 的原始坐标
- "局限性"段抄作者的 limitations 章节，没加自己的怀疑
- 没有"敌人"——看不出这篇论文的前作是谁、被什么后作超越

任意一条 → 不及格，要重做。

## 项目笔记 vs 论文笔记的差异（为什么不直接搬 7 层）

| 维度 | 项目（7 层） | 论文（8 层） |
|---|---|---|
| "心脏"是什么 | 1-2 个核心源文件 | 1-2 张关键 figure + 一段方法/算法描述 |
| "改一处"对应什么 | 改一行跑测试 | 复现关键 baseline / 关键 figure |
| 横向对比找谁 | 哲学不同的竞品 | 前作（被它超越的）+ 后作（超越它的，2026 视角） |
| 作者意图哪里找 | manifesto / launch HN | related work 的措辞缝隙 + 一作的 talk / blog |
| 时效性 | 项目活着就有效 | 可能 6 个月就被超越——必须标"现在的位置" |

## 8 层结构（约 90 分钟一篇）

### Layer 0 · 身份扫描（5 分钟）

抓硬指标，建立尺度感。命令：

```bash
# 用 LightRead CLI
lr search "<title>" --limit 3 --format json | jq '.[] | {title, year, authors, citations}'

# 看是否有官方 repo（论文页面 / arXiv abs 页面通常有 link）
lr graph build "<arxiv-id>"  # 引用图谱

# 历年版本（v1 到 v3 的差别经常很大）
# 在 arxiv.org/abs/<id> 看 [v1] [v2] [v3]
```

输出到笔记顶部表格：

| 字段 | 内容 |
|---|---|
| Venue / 年 | NeurIPS 2023 / arXiv 2024.03 |
| 一作 | 名字 + 当时机构 |
| 引用数 | 截至读时（标日期） |
| 官方 repo | 有 / 无 / 第三方复现 |
| arXiv 版本 | v1 → v3 有过哪些大改 |

判断：

- 引用 < 50 且 > 1 年 → 影响力存疑，记笔记时标"小众但有意思" / 直接降级
- 一作是博士生 → 看导师是谁，能解释立场
- v3 大改过 → 在笔记里专门写"v1 vs v3 改了什么"，这往往就是审稿意见

### Layer 1 · 存在理由（10 分钟）

**关键问题**：这篇论文出现前，做 X 的人卡在哪？

操作：

1. 读 introduction 前 2 段（motivation）
2. 读 related work 的**第一段**——作者怎么界定"前人路线"
3. 找一作的 talk video / blog（搜 `<paper title> talk` / `<first author> blog`）

输出：3-5 句话，**用你自己的话**总结 "why this exists"。

拒绝写"本文提出了一个新的 X 方法"——这是 abstract 翻译。
要写："在这之前，做 X 的人都用 Y 路线，痛苦在 Z；这篇的核心 insight 是 W，关键 trick 是 V。"

### Layer 2 · 论文地形（10 分钟）

操作：

```bash
# 把 PDF 大纲列出来，标注每段角色
lr pdf outline "<paper.pdf>"  # 或手工读目录
```

输出："章节角色注释表"——每个 section 写一句它的角色：

```
1. Introduction      ← motivation + contribution 列表
2. Related work      ← 把对手分两堆：基于 X / 基于 Y
3. Method            ← 真正的肉，本文 2-3 个新东西
   3.1 Architecture  ← 把 figure 1 拆开讲
   3.2 Training      ← loss + 数据
4. Experiments       ← 4.1 main results / 4.2-4.4 ablation
5. Limitations       ← 通常被低估，藏着审稿意见痕迹
```

然后**找心脏段落**——通常是：

- 一张 method overview 图（Fig 1 或 Fig 2）
- 一段 algorithm box（如果是算法论文）
- main results 的核心表（Table 1）

记下这 2-3 个"心脏物"，下一层精读它们。

### Layer 3 · 关键 figure / 算法精读（20 分钟）

**最重要的一步**。选 1-2 张 figure 或 1 段算法通读。

操作：

1. 选定 figure / algorithm（来自 Layer 2）
2. **嵌入原图到笔记**（用 lr pdf 提图或截图）
3. 在笔记里写：
   - x 轴 / y 轴是什么单位
   - baseline 是谁，为什么选这几个 baseline
   - 数字差距是 absolute 还是 relative，统计显著性如何
   - 这张图作者**没画**的对照组是什么（藏 cherry-pick 的地方）

输出：3-5 段"机制揭秘"，每段含：

- 原图嵌入（带 caption 引用）
- 旁注：状态变化、关键 trade-off、为什么不用更直接的设计
- 至少 1 个"我对这张图的怀疑"

**禁止**：贴一张图就放那里不解释——读者自己去 arXiv 也能看到同样的图。

### Layer 4 · 复现一处（15 分钟）

**这一层是论文笔记的核心，不能跳。**

操作（按优先级降级）：

1. **有官方 repo**：clone，跑 README 给的 quick start，跑出 paper 里的 1 个数字
2. **只有第三方复现**：用第三方 repo，记下与原文数字的差距
3. **LLM 调用类论文（ReAct / Voyager / Reflexion 等）**：允许降级到"用 OpenAI / Claude API 跑 1 个完整 trajectory"——不一定能对齐论文 score（论文用的是 PaLM / GPT-3 时代的模型），但必须把 think-act-observe 循环里的每一步真的打印出来
4. **没 repo**：手算 toy 例子——找方法里的最小可执行单元，在 1-10 个数据点上算出来
5. **完全无法复现**（纯理论 / 大规模训练 → 任何路径都不可行）：**降级或换论文**——这个站点不收"只能纸面读"的论文

输出：1 个具体的"我跑了 X，得到 Y，和论文里的 Z 差了 W"。
带不上数字的复现 = 没复现。

### Layer 5 · 谱系对比（15 分钟）

找 2 篇：**1 篇前作**（被它超越的）+ **1 篇后作**（超越它的，2026 视角）。

例：

- ReAct → 前作 Chain-of-Thought（只 think 不 act）→ 后作 Reflexion（act 后还能反思）
- Raft → 前作 Paxos（不可读）→ 后作 Multi-Paxos / EPaxos
- A Prettier Printer → 前作 Hughes 的 functional pretty printing → 后作 Wadler-Leijen 修正版
- Copilot RCT (Peng 2023) → 前作 Xu et al. 2022 (in-IDE study) → 后作 SWE-bench / GAIA 评测

输出：对比表（不只是数字差异，还有**问题定义本身的差异**），加一句
"什么场景这篇仍然有价值，什么场景已经被超越"。

### Layer 6 · 与当前工作的连接（5 分钟）

写明 3 件事：

1. **今天就能用的部分**：你正在做的项目里，哪个决策能立刻被这篇论文影响
2. **下个月能用的部分**：需要一些重构准备的迁移路径
3. **不要用的部分**：这篇论文里有些设计不适合你的场景，明确标出来

输出：迁移路径（含优先级），以及"不要的"清单。

### Layer 7 · 怀疑 + 延伸阅读（10 分钟）

**3 件你最不信的事**：

不是"这个工作的 limitation 是什么"——这是空话。
要像：

- "Table 2 的 baseline 没有控制 prompt 长度变量，差距可能来自 prompt 工程而不是 method"
- "Section 4.3 的 ablation 只在 7B 上做，但 main results 用 70B——scale 上结论是否还成立？"
- "Limitations 段说 'we don't compare with X'，X 恰好是这条路线最强的对手"

**延伸阅读**：精读完这篇后，下一步该读哪 2-3 篇，按什么顺序，回答什么问题。

## 笔记输出结构（按层映射）

```markdown
---
title: <一句话定位>
description: ...
sidebar:
  label: <短标题>
  order: <序号>
---

| 字段 | 内容 |
|------|------|
| Layer 0 数据填这里 |

## 一句话定位
（Layer 1 输出）

## Why（这篇出现前世界缺什么）
（Layer 1 输出，3-5 句）

## 论文地形
（Layer 2 输出：章节角色表 + 心脏物标识）

## 核心机制
（Layer 3 输出：2-3 张 figure / algorithm 精读，每段含原图 + 旁注 + 怀疑）

## 复现一处
（Layer 4 输出：跑了什么，得到什么数字，与论文差距）

## 谱系对比
（Layer 5 输出：前作 + 后作 + 选型建议）

## 与你当前工作的连接
（Layer 6 输出：今天/下月/不要 三段）

## 怀疑 + 延伸阅读
（Layer 7 输出）
```

## 时间分配的取舍

完整 8 层做完约 90 分钟，对应一篇 500-800 行 markdown。

如果时间紧（45 分钟轻量版）：跳 Layer 5 后作（只找前作），但**绝不跳 Layer 4**。
不复现的论文笔记没有价值——这是这个站点的硬底线。

## 工具栈

| 任务 | 命令 |
|---|---|
| 搜论文 | `lr search "<query>" --year 2022-2026 --min-citations 50` |
| 看推荐 | `lr papers` |
| 引用图谱 | `lr graph build "<arxiv-id>"` |
| 提 PDF 里的图 | `lr pdf image "<paper.pdf>" -p <page>` |
| Agent 综述（多轮检索） | `lr agent "<topic>"` |

## 这套方法的来源

不是凭空发明，参考了：

- "How to read a paper" by Srinivasan Keshav (three-pass 法)
- Andrew Ng 的"读 5 篇 vs 读 50 篇"建议
- Karpathy 的"读论文先复现关键 figure"实践
- 项目笔记 7 层方法论的迁移与改造

---

## 状元篇 Checklist v1

> "状元篇"是这个站点对论文笔记的高水位标准——参考样本 [ReAct](/study/papers/react/)
> （1100 行 + 3 张 sketchnote + 完整 7 阶段 reproduce）。
> 这是 8 层方法论之上的可量化加固层，按层挂钩。
> 对齐项目版 [状元篇 Checklist](/study/method/) 但有论文专属条目。

### 严格度分级

- **P0 必填**：缺则不及格，状元篇必须全部满足
- **P1 推荐**：影响"状元"评级，应该满足
- **P2 加分**：高阶项，做到额外加分

### Frontmatter (P0)

- [ ] `title` 含一句话定位（如 "ReAct — agent loop 的祖宗：think × act 的最小可执行三元组"）
- [ ] `description` 1 行实质性叙事，禁 abstract 翻译
- [ ] `sidebar.label` ≤ 25 字符 + 含 Venue/年（如 "ReAct (NeurIPS 2022)"）

### Layer 0 · 核心信息表 (P0：≥ 9 字段)

- [ ] 标题（英文）+ 标题翻译（中文）
- [ ] 作者列表
- [ ] 一作机构（含"当时 → 现在"，如 "Princeton NLP（Yao 时为博士生 → 现 OpenAI）"）
- [ ] 发表时间 + 渠道
- [ ] arXiv ID + 终版号（v1/v3）
- [ ] 代码 repo + commit hash + star 数 + 读时日期
- [ ] 数据 / 资源
- [ ] 论文类型（method / benchmark / theory / survey）

### 创新点段 (P0：method 里没要求，状元加的)

- [ ] 3-5 个 numbered 创新点，每点粗体小标题 + 1-2 段解释
- [ ] 至少 1 处 `path:line` 锚定（如 `wikienv.py:153-154`）
- [ ] 至少 1 处指出"工程上最被低估的细节"

### 一句话总结 + Hero figure (P0)

- [ ] 醒目加粗的核心总结句
- [ ] 视觉冲击式总结句（"你今天用的每一个 X 背后都是这个论文画的回路"）
- [ ] Hero 位置嵌入 ≥ 1 张 sketchnote 风 figure（webp，13-15× 压缩，路径 `/papers/<slug>/01-*.webp`）
- [ ] caption 标注图中元素 + 关键 hyperparameter + 画风注明

### Layer 1 · Why 段 (P0)

- [ ] 3-5 句话用自己的话总结"前世界缺什么"
- [ ] 把对手分成两堆（如 reasoning 派 vs acting 派）
- [ ] 至少 1 处 `path:line` 引用关键代码细节

### Layer 2 · 论文地形 (P0)

- [ ] 三列表：`Section / 角色 / 你该花多少时间`
- [ ] 阅读策略动词（读 / 精读 / 看 Table X / 跳 / 必看）
- [ ] "心脏物 N 个"清单（通常 2-3 项）

### 机制流程段 (P1：method paper 必须，theory paper 可省)

- [ ] 把方法压缩成 N 步（通常 3-5 步）
- [ ] 配 figure 解释关键接口或路径

### Layer 3 · 核心机制 (P0：≥ 3 段独立小节)

- [ ] 每段 GitHub 永久链接（commit hash 锚定）
- [ ] 每段 ≥ 20 行真实代码片段（不是伪代码）
- [ ] 每段 ≥ 5 个旁注子弹
- [ ] 每段尾 ≥ 1 个 "怀疑 N: ..." 显式段

### Layer 4 · 复现 (P0：phd-skills 7 阶段全走)

- [ ] 阶段 1 论文获取（命令 + arxiv id）
- [ ] 阶段 2 代码盘点 inventory 表（文件 / 角色 / 是否齐全）
- [ ] 阶段 3 Gap 分析表（论文版 vs 代码 / 推测）
- [ ] 阶段 4 实现/替换说明（用什么 backend 替换原 LLM 或参考实现）
- [ ] 阶段 5 数据集（≥ 5 题 toy 或真 dev split 子集）
- [ ] 阶段 6 Smoke run（≥ 1 条完整 trajectory 打印）
- [ ] 阶段 7 跑结果对照表（n_steps / EM / label 等，≥ 5 行）
- [ ] 阶段 7 补 results.md（TL;DR / 分布 / Limitations）
- [ ] 显式给出"绝对差异 vs 论文数字"的解释

### Layer 5 · 谱系对比 (P0 + figure P1)

- [ ] ≥ 1 篇前作 + ≥ 1 篇后作
- [ ] ≥ 1 篇"反对者"（同期 critique 论文，如有）
- [ ] 选型建议表：场景 → 选谁
- [ ] (P1) 1 张演化树 sketchnote（figure 3）

### Layer 6 · 与当前工作连接 (P0)

- [ ] "今天就能用" / "下个月能用" / "不要用的部分" 三段，每段 ≥ 4 子弹

### Layer 7 · 怀疑 + 延伸 (P0)

- [ ] 3-5 件具体怀疑，每件锚定 paper 位置（Table X / Section Y）
- [ ] "接下来读哪 N 篇"表

### 限制段 (P0：DeepPaperNote 风格)

- [ ] ≥ 4 条独立限制，禁抄 paper limitations

### 附录：叙事错位清单 (P2 加分)

- [ ] 论文宣称 vs 代码现实对比表，≥ 4 行

### 结尾元数据 (P1)

- [ ] 标记重构日期 + 总行数 + 启用 skill / 工具

### 量化总指标

| 维度 | 底线 | 标杆（ReAct） |
|---|---|---|
| 行数 | 500 | 1100 |
| Figure 数（webp） | 2（hero + 演化树） | 3 |
| GitHub 永久链接 | 3 | 5+ |
| 显式怀疑 | 4 | 7+ |
| `path:line` 引用 | 1 | 多处 |

### 版本

- **v1** (2026-05-28) — 基于 ReAct 反推首版 checklist
- 修订规则：未来加新条目升 v2，原 v1 条目不删，只标 deprecated
