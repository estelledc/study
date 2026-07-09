---
title: 怎么消化一篇论文
description: 8 层论文方法论——把 PDF 变成你能转述、复现、批判的判断力
sidebar:
  order: 3
---

> 这是站点所有论文笔记的共同骨架。
> 项目笔记（[7 层](/study/method/)）回答"代码是怎么写的"；论文笔记回答"想法是怎么验证的"。
> 两边的硬底线相同：**不读源 / 原文，不写笔记**。

## 站点的论文体量

截至 2026-07，论文目录共 1014 篇笔记，覆盖：

- 分布式系统 76 篇（[[paxos-1998]] / [[raft]] / [[lamport-1978]] / [[spanner-2012]]）
- 编程语言 + 类型论 76 篇（[[hindley-milner]] / [[lambda-calculus]] / [[hoare-logic]]）
- 数据库 47 篇（[[bigtable-2006]] / [[aries-1992]]）
- 机器学习 / NLP 55 篇（[[attention]] / [[bert]]）
- 图形学 36 篇（[[3d-gaussian-splatting]]）
- 编译器 + 形式化方法 38 篇（[[llvm]] / [[hoare-logic]]）

旗舰反向链接最多的 4 篇是 [[hindley-milner]]（126）、[[attention]]（103）、[[paxos-1998]]（67）、[[raft]]（63）——
所有同方向后续笔记都汇到这几篇。**新写的论文笔记应主动 link 回这些根**，不要让节点孤立。

## 失败模式（先看这个）

不及格的论文笔记：

- abstract + contributions 翻译，没读过任何引用论文
- "方法"段照抄公式，没解释**为什么这么定义**
- 没碰过代码 / 没看过 figure 的原始坐标
- "局限性"段抄作者的 limitations 章节，没加自己的怀疑
- 没有"敌人"——看不出这篇论文的前作是谁、被什么后作超越
- 没复现任何东西（连最弱的降级路径都没走）

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
lr search "<title>" --limit 3 --format json | jq '.[] | {title, year, authors, citations}'
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

- 引用 < 50 且 > 1 年 → 影响力存疑，标"小众但有意思" / 直接降级
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
node scripts/mineru-extract-url.mjs \
  --url "<paper-url-or-pdf-url>" \
  --slug "<slug>" \
  --out /tmp/<slug>-mineru/full.md
# 读 /tmp/<slug>-mineru/full.md 的标题层级；不要用 lr pdf 解析全文
```

输出"章节角色注释表"——每个 section 写一句它的角色：

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
2. **嵌入原图到笔记**：先用 MinerU `full.md` 定位 figure / caption；需要图片时手工从 PDF 截图，或引用论文官网 / 作者公开图源。不要用 `lr pdf` 提图或解析全文
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

### Layer 4 · 复现一处（15-30 分钟）

**论文笔记的核心**。这一层下面整理了完整的降级清单，按论文类型选路径。

#### 4.0 · 总原则

- 带不上数字的复现 = 没复现
- 数字可以小（5 题 / 1 trajectory / 1 个 toy 推导），但必须**比论文少**且**和论文同维度**
- 复现差距要写成"我跑了 X，得到 Y，论文是 Z，差距来自 W"——四个量都不能省

下面分四类降级清单。先按论文类型选大类，再按可用资源选具体路径。

#### 4.1 · LLM / Agent / NLP 论文（如 [[attention]] / [[bert]] / ReAct / Voyager）

| 路径 | 触发 | 怎么做 | 数字怎么对 |
|---|---|---|---|
| A. 跑官方 repo | 有 repo + GPU 够 | 跑 README quick start，复现 1 个数字 | 直接对 paper Table |
| B. 跑第三方复现 | 官方无 repo / 跑不动 | huggingface / labml.ai / annotated 系列 | 标"vs 原文差 X%" |
| C. 换 backend 跑 1 trajectory | 论文用 PaLM / GPT-3 时代模型 | 用 Claude / Llama 替代，**完整打印** think-act-observe 三元组 | 数字必然对不上，但流程必须能走通 |
| D. Toy 数据集 self-replicate | 没法跑全 benchmark | 在 5-10 题 dev split 上跑，记 EM / F1 / step count | 5 题对 paper 的 100 题，标"小样本 vs 全集" |
| E. 手画 attention map | 纯架构论文（attention 类） | 取 1 个句子，手算 / 跑代码画 attention 权重热图 | 与论文 figure 同位置对照 |

**禁止降级到**：只读 README 不跑 / 只贴 paper 数字不打印自己的 trajectory。

#### 4.2 · 经典 algorithm 论文（如 [[paxos-1998]] / [[raft]] / [[hindley-milner]] / [[lambda-calculus]] / [[aries-1992]]）

| 路径 | 触发 | 怎么做 | 验证形式 |
|---|---|---|---|
| A. 写 ≤ 200 行实现 | 算法可压缩 | Raft leader election / HM 推断 / Paxos single-decree | 用 paper 的"trace example"作单测 |
| B. 跑 reference impl | 有教学版（mit-6.824 / labml.ai） | 跑作业代码 / lab solution | 通过 paper 描述的 invariant 检查 |
| C. 手推 trace | 纯算法 / 协议描述 | 在 3-5 个节点的小例子上手画状态序列 | 复现 paper 的 Figure / Example N |
| D. 形式化模型 | 协议论文 | TLA+ / Alloy / Coq 写关键 invariant | 跑 model checker 验证 1 个安全性属性 |
| E. 反例构造 | 找 paper 假设的边界 | 改一个假设，看算法什么时候挂 | 写出"如果去掉 quorum，会发生 X" |

**经典算法的硬底线**：路径 C 是最低降级。即使是 80 年代纯理论论文，
"在 3 节点小例子上手推一遍 [[paxos-1998]] 的 prepare/promise/accept"也必须做。

#### 4.3 · 系统论文（如 [[spanner-2012]] / [[bigtable-2006]] / GFS / Dynamo / [[llvm]]）

系统论文通常没有可复现的"数字"——你拿不到 Google 的机房。降级目标变成
"找一个**可观测的等价物**"。

| 路径 | 触发 | 怎么做 | 替代数字 |
|---|---|---|---|
| A. 跑开源克隆 | 有公认开源对应物 | Spanner→CockroachDB / Bigtable→HBase / GFS→HDFS / Dynamo→Cassandra | 在小规模上跑 paper 关键 workload，记 latency / throughput |
| B. 文档对照 | 闭源系统 | 把 paper 的架构图 vs 开源克隆 README 的架构图，列差异表 | "克隆比 paper 多/少了什么组件" |
| C. 单组件 demo | 关键技术可隔离 | 只复现 Spanner 的 TrueTime 思想（用 NTP 模拟）/ Bigtable 的 SSTable 写一个 mini 版 | 在 100 行内打印 1 个 read/write |
| D. failure 注入 | 容错论文 | 杀 leader / 断网 / 时钟漂移，看系统行为是否符合 paper claim | 复现 paper 的"failure scenario N" |
| E. 体量对照 | 实在跑不动 | 列 paper 的体量数字（节点数 / QPS / 数据量）vs 你能跑的体量，明确比例 | "我 3 节点 100 QPS vs paper 万节点百万 QPS，比例 1:33000" |

**禁止降级到**：抄 paper 的架构图当自己的复现。架构图只是输入，复现要有可观测变化。

#### 4.4 · 纯理论 / 形式化论文（如 [[hoare-logic]] / [[lambda-calculus]]）

| 路径 | 触发 | 怎么做 | 验证形式 |
|---|---|---|---|
| A. 手算 toy 实例 | 任何定理 | ≥ 3 个不同实例（小数 / corner case / 极限情况） | 推导步骤完整写出 |
| B. 反例构造 | 寻找定理边界 | 打破 1 个假设，看结论失效在哪 | 写出"如果去掉前提 X，反例是 Y" |
| C. 形式化助手 | 有现成 Coq / Lean 库 | 跑 software-foundations / mathlib 对应章节 | 让 type checker 通过 |
| D. 关联到工程 | 纯抽象的论文 | 找现实里的实现（[[hoare-logic]] → Dafny / SPARK / Frama-C） | "工程实现把这条 rule 写成代码 Y" |

#### 4.5 · 任何类型都通用的"撞墙清单"

如果以上路径全都跑不通，**不要硬写笔记**。考虑：

- 换论文（这个站点宁缺勿滥，已经 1014 篇够多了）
- 标"待复现"放进 inbox，等条件成熟再做
- 退到"读后感"格式（明确不是论文笔记，不放进 papers/ 目录）

记住：站点的论文笔记的价值在于"我真的碰过它"。**不能复现的论文 → 不进 papers/**。

### Layer 5 · 谱系对比（15 分钟）

找 2 篇：**1 篇前作**（被它超越的）+ **1 篇后作**（超越它的，2026 视角）。

例：

- ReAct → 前作 Chain-of-Thought（只 think 不 act）→ 后作 Reflexion（act 后还能反思）
- [[raft]] → 前作 [[paxos-1998]]（不可读）→ 后作 Multi-Paxos / EPaxos
- [[attention]] → 前作 RNN seq2seq + content-based attention → 后作 Flash-Attention / Linear Attention
- [[hindley-milner]] → 前作 Curry simple types → 后作 System F / 多态类约束系统
- [[bigtable-2006]] → 前作 GFS（无结构化）→ 后作 [[spanner-2012]]（强一致性 + SQL）

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

不是"这个工作的 limitation 是什么"——这是空话。要像：

- "Table 2 的 baseline 没有控制 prompt 长度变量，差距可能来自 prompt 工程而不是 method"
- "Section 4.3 的 ablation 只在 7B 上做，但 main results 用 70B——scale 上结论是否还成立？"
- "Limitations 段说 'we don't compare with X'，X 恰好是这条路线最强的对手"

**延伸阅读**：精读完这篇后，下一步该读哪 2-3 篇，按什么顺序，回答什么问题。
**优先选站点已有笔记**——能链回旗舰节点（[[paxos-1998]] / [[attention]] / [[hindley-milner]]）的链接最有价值。

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
（Layer 4 输出：跑了什么，得到什么数字，与论文差距；类型选 4.1-4.4 一类）

## 谱系对比
（Layer 5 输出：前作 + 后作 + 选型建议；尽量 link 旗舰）

## 与你当前工作的连接
（Layer 6 输出：今天/下月/不要 三段）

## 怀疑 + 延伸阅读
（Layer 7 输出）
```

## 旗舰参考（写新论文笔记前先读）

按方向找一篇高质量笔记当尺子：

| 方向 | 参考 | 反向链接 | 当尺子的理由 |
|---|---|---|---|
| Transformer / NLP | [[attention]] | 103 | 零基础友好 + 已写完整 8 层 |
| 类型论 / PL | [[hindley-milner]] | 126 | 全站 PL 链都汇到这 |
| 分布式共识 | [[paxos-1998]] | 67 | 后续 [[raft]] / spanner / chubby 全反向引 |
| 工程化共识 | [[raft]] | 63 | 复现路径写得最完整 |
| PL 理论 | [[lambda-calculus]] | 64 | 与 [[hindley-milner]] / [[hoare-logic]] 三角支撑 |
| 形式化方法 | [[hoare-logic]] | 63 | 跨 PL + 验证两条线 |
| 分布式时序 | [[lamport-1978]] | 56 | 时钟和因果关系所有讨论的根 |
| 编译器 / IR | [[llvm]] | 50 | 工业基础设施门面 |
| 数据库 / 全球分布 | [[spanner-2012]] | 48 | 强一致 + 时钟 |
| 数据库 / 列式存储 | [[bigtable-2006]] | 46 | 后续 KV / 列存全反向引 |
| NLP 预训练 | [[bert]] | 42 | 与 [[attention]] 一起读 |
| 图形学 / 3D | [[3d-gaussian-splatting]] | 41 | 近 2 年最大冲击的渲染论文 |

写新笔记前对照这些尺度——如果你的论文笔记结构、复现深度、链接密度都比这些差不少，
要么是论文确实小众（在 Layer 0 就该标），要么是笔记没写到位。

## 时间分配的取舍

完整 8 层做完约 90 分钟，对应一篇 500-800 行 markdown。

如果时间紧（45 分钟轻量版）：

- 跳 Layer 5 后作（只找前作）
- Layer 7 减到 2 个怀疑
- **绝不跳 Layer 4**

不复现的论文笔记没有价值——这是站点的硬底线。

## 工具栈

| 任务 | 命令 |
|---|---|
| 搜论文 | `lr search "<query>" --year 2022-2026 --min-citations 50` |
| 看推荐 | `lr papers` |
| 引用图谱 | `lr graph build "<arxiv-id>"` |
| 解析 PDF 全文 | `node scripts/mineru-extract-url.mjs --url "<url>" --slug "<slug>" --out /tmp/<slug>-mineru/full.md` |
| 定位 / 提取 figure | 读 MinerU `full.md` 的 figure / caption；图片用手工截图或作者公开图源，不走 `lr pdf` |
| Agent 综述（多轮检索） | `lr agent "<topic>"` |

## 质量门：状元篇 Checklist

8 层是底线骨架；状元篇 Checklist 是高水位标准。完整版按论文类型分四个分支：

- **method / algorithm paper**（如 [[attention]] / [[raft]]）→ phd-skills 7 阶段全走 + GitHub permalink
- **empirical study paper** → stimuli inventory + self-replication + N=1 声明
- **benchmark paper** → 在 dev split 子集上跑现成 model + 对照 baseline
- **theory paper**（如 [[hoare-logic]] / [[lambda-calculus]]）→ ≥ 3 toy 推导 + 反例构造

每类的具体 P0 条目（行数底线 / Figure 数 / 锚定数 / 怀疑数）见 [状元篇 Checklist v1.1](#)（待迁移到独立页）。
站点 1014 篇论文里目前满足完整状元标准的不到 5%——大部分仍在向状元篇加固的路上，这是正常进度。

## 这套方法的来源

不是凭空发明，参考了：

- "How to read a paper" by Srinivasan Keshav（three-pass 法）
- Andrew Ng 的"读 5 篇 vs 读 50 篇"建议
- Karpathy 的"读论文先复现关键 figure"实践
- 项目笔记 7 层方法论的迁移与改造
- DeepPaperNote 的"显式怀疑 + 限制段"风格
