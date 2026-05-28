---
title: Chain-of-Thought Prompting (Wei et al. 2022) — reasoning trace 是涌现能力的钥匙
description: 8 个 few-shot 例子加上一段"想一下"的中间过程，让 540B 模型 GSM8K 从 18% 跳到 57%
sidebar:
  label: Chain-of-Thought (NeurIPS 2022)
  order: 3
---

| 字段 | 内容 |
|------|------|
| Venue / 年 | NeurIPS 2022（arXiv 2022.01 提交，2023.01 v6 终版） |
| 一作 | Jason Wei（Google Brain → 现 OpenAI），通讯作者 Denny Zhou（Google Brain） |
| 引用数 | 截至 2026-05，arXiv 列出 14000+ 引用——AI 领域过去 4 年最高被引论文之一 |
| 官方 repo | 无独立 repo——prompt 模板列在 Appendix G/H/I，可直接复制 |
| arXiv 版本 | v1 → v6，主要补充 commonsense 和 symbolic reasoning 实验，扩 ablation |
| 关键 figure | Figure 1（standard vs CoT prompt 并排）、Figure 2（GSM8K 18% → 57%）、Figure 4（emergent ability 曲线）、Figure 5（ablation 三条对照） |

## 一句话定位

**在 few-shot prompt 的每个例子里加一段"想一下"的自然语言推理过程，
就能让 ≥100B 参数的语言模型在多步推理任务上跨阶级提升——而且这种能力小模型完全没有，是 emergent。**
你今天看到的所有 LLM "先思考再回答"行为（包括 ChatGPT、Claude、ReAct、o1），
都是这个朴素 prompt trick 在不同方向的演化。

![Standard Prompting vs Chain-of-Thought Prompting](/study/papers/cot/01-standard-vs-cot.webp)

*图 1：CoT 论文 Figure 1 重制版。**左 Standard Prompting**（灰）：only "The answer is X"。
模型在第二题答错（cafeteria 题答 27，正确是 9）。
**右 Chain-of-Thought**（蓝）：each example 多了自然语言推理 trace（"5+6=11"），
high light 黄色。第二题正确推理出 23-20=3 → 3+6=9。
**底部数字**：GSM8K 上 PaLM-540B 标准 prompt 18% → CoT 57%（3× 提升）。
**emergent at ~100B 参数**——小模型用 CoT 反而变差。
**底部说明**：Section 3.3 的三个 ablation（equation-only / variable-compute / reasoning-after-answer）全都 fail，
**只有顺序自然语言推理才 work**。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2022 年初，让 LLM 做"多步推理"有两条路线，都不够：

- **Fine-tune 派**（Cobbe et al. 2021 GSM8K verifier 等）：标注大量"问题 + 推理步骤 + 答案"
  三元组训练。**贵**，每个新任务都要重标
- **标准 few-shot 派**（Brown et al. 2020 GPT-3 paper）：给几个 input-output 对，让模型直接输出答案。
  **多步推理上几乎没有 scale benefit**——Rae et al. 2021 在 Gopher 280B 上发现 prompt 性能不随
  规模显著提升

CoT 论文的 insight 异常朴素：**让 few-shot 例子里的输出从"直接答案"变成"自然语言推理步骤 + 答案"**。
不动模型权重、不动 fine-tune，只改 prompt。

最关键的发现写在 Section 3.2 第一句：
> "First, Figure 4 shows that chain-of-thought prompting is an emergent ability of model scale."

意思是：< 100B 参数的模型上 CoT 不只无效，往往**变差**（小模型生成 fluent but illogical chains）。
**只有跨过 ~100B 这个阈值，CoT 才开始压垮 standard prompting**。
这一发现是 emergent abilities 系列论文（Wei 2022b 等）的支点之一。

## 论文地形

PDF 43 页（含 9 个 appendix），主体 12 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation + scaling 困境 + 两个先行 idea | 读 |
| 2. Chain-of-Thought Prompting | **方法定义只有 2 段** + 4 条 attractive properties | **精读** |
| 3. Arithmetic Reasoning | 5 个数学 benchmark + 三条 main takeaway | **精读** |
| 3.3 Ablation | **三个对照实验** —— 这一段决定 CoT 的归因强度 | **精读** |
| 3.4 Robustness | annotator A/B/C 互换 + GSM8K 自带 reasoning 例子 | 看 Figure 6 |
| 4. Commonsense Reasoning | 5 个常识数据集 + SayCan robot | 看 Figure 7 |
| 5. Symbolic Reasoning | last-letter / coin flip 两个 toy task + length generalization | 看 Figure 8 |
| 6. Discussion | "CoT does what" 的诚实讨论 | 读 |
| 7. Conclusion | 略 | 跳 |
| Appendix G/H/I | **完整 prompt 模板** | **当 reference**（要复用必看） |

**心脏物**有四个：

1. **Figure 1**（page 1）—— 整篇论文的"用一张图概括"，standard vs CoT 输入输出并排
2. **Figure 4**（page 4）—— GSM8K 上 LaMDA / GPT / PaLM 三家 × 3-4 个 scale 的曲线，emergent 现象的可视化
3. **Figure 5**（page 5）—— Section 3.3 的 4 路 ablation 对比，"CoT 的本体到底是什么"的关键证据
4. **Section 2 那 2 段方法定义** —— 没有公式、没有伪代码，全部用自然语言描述，这本身是论文的风格特征

## 核心机制

### 机制 1：方法定义只有"prompt 里加一段中间步骤"——简到让人怀疑

Section 2 整段翻译：

> "Specifically, we explore the ability of language models to perform few-shot prompting for
> reasoning tasks, given a prompt that consists of triples: ⟨input, chain of thought, output⟩.
> A chain of thought is a series of intermediate natural language reasoning steps that lead
> to the final output."

**就这。**

Figure 1 的 CoT prompt 长这样（论文 page 1 原文）：

```
Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls.
   Each can has 3 tennis balls. How many tennis balls does he have now?
A: Roger started with 5 balls. 2 cans of 3 tennis balls each is
   6 tennis balls. 5 + 6 = 11. The answer is 11.

Q: The cafeteria had 23 apples. If they used 20 to make lunch and
   bought 6 more, how many apples do they have?
A:  ← 这里让模型补全
```

而 standard prompt 是：

```
Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls.
   Each can has 3 tennis balls. How many tennis balls does he have now?
A: The answer is 11.

Q: The cafeteria had 23 apples. If they used 20 to make lunch and
   bought 6 more, how many apples do they have?
A:  ← 这里让模型补全
```

旁注：

- **唯一的差别就是 example answer 里多了一段"自然语言推理过程"**——没改 prompt 结构、没加任何指令
- 没有"Let's think step by step"这种关键词（那是 Kojima et al. 2022 zero-shot CoT 的发明，比 Wei 这篇晚半年）
- 论文用了 8 个手写的 chain-of-thought example（Annotator A）。Section 3.4 证明换其他 annotator 写、
  从 GSM8K 训练集随机抽 reasoning 例子，结果都比 standard 好——这个朴素度让人震惊

**怀疑 1**：这种"插中间步骤"的设计**有大量隐藏自由度**——例子写得多详细？数字之间用 `+` 还是写英文？
"the answer is" 还是"so we have"？论文 Section 3.4 的 robustness 测试只覆盖 annotator 风格 + 例子来源，
**没覆盖"句法风格"这一维**（如全用算式 vs 全用文字）。这也是 2024 年 Brittle Foundations of ReAct
那一类批判论文的源头怀疑。

### 机制 2：Section 3.3 的三个 ablation —— CoT 的"灵魂"在哪里

CoT 性能好可能有 4 个不同原因：

1. 让模型有了**生成中间公式**的机会（数学推理 → 算式更准）
2. 让模型有了**更多 token 算力**（intermediate computation budget）
3. 让模型在生成答案前**激活更多预训练知识**
4. **以上三者都不是**——CoT 的核心是"sequential natural-language reasoning"本身

论文 Section 3.3 设计了三个对照（Figure 5）：

| 对照 | 描述 | GSM8K 表现 |
|---|---|---|
| Equation only | 只让模型生成等式（去掉自然语言） | 比 standard 略好但远不如 CoT |
| Variable compute only | 让模型生成等长的 `...` 占位符 | 与 standard 持平 |
| Reasoning after answer | 先答案，再 chain of thought | 与 standard 持平 |

旁注：

- Equation only 失败 → 否定"CoT 只是数学公式"假说（推理 1）
- Variable compute only 失败 → 否定"CoT 只是 token budget"假说（推理 2）
- Reasoning after answer 失败 → 否定"CoT 只是激活知识"假说（推理 3）—— **CoT 的关键在于
  "sequential 推理 → 答案"的因果顺序**

这 3 行 ablation 是整篇论文最硬的证据。**没有这 3 行，CoT 就只是一个不可解释的现象。**

**怀疑 2**：但 ablation 只在 LaMDA 137B 和 PaLM 540B 上做了（Figure 5 caption）。
**没在小模型上做**——而 emergent claim 恰恰要求"小模型 CoT 也无效"，但论文没用 ablation 验证
"小模型上 equation-only / variable compute / reasoning-after 也失败"。这是一个被忽略的对照——
极端情况下，emergent 可能只是 small model 学不会任何 prompt 修饰，与 CoT 的"本体"无关。

### 机制 3：emergent ability —— scale 阈值现象

Figure 4（page 4）画 LaMDA（4B → 137B）/ GPT（350M → 175B）/ PaLM（8B → 540B）三家 × 3-4 size 的
GSM8K 准确率：

- 小模型上 standard prompting 和 CoT prompting **几乎重叠**，且都很低
- 模型 scale 跨过 ~100B 后，CoT 曲线**突然陡升**，standard 曲线仍然平坦
- 这不是平滑提升，是阶跃 —— **PaLM 8B 的 GSM8K solve rate 是 ~5%，PaLM 62B 是 ~17%，PaLM 540B 是 ~57%**

旁注：

- "emergent" 这个词在 Wei 2022b（"Emergent Abilities of Large Language Models" 同一组人）专门系统化
- 但 emergence 这一现象后来被 Schaeffer et al. 2023 ("Are Emergent Abilities a Mirage?") 挑战——
  他们论证很多 emergent 是**非线性 metric 的产物**（如 exact-match accuracy），换平滑 metric（如 perplexity）
  emergence 就消失
- GSM8K 的 metric 是 exact match，确实有 Schaeffer 担心的特征——CoT emergence 的"硬度"在 2026 年仍有争议
- 实践层面这点不重要：**事实是 GPT-4 / Claude 3+ / PaLM2+ 都能用 CoT，小模型不能**——指导生产决策足够

**怀疑 3**：Figure 4 把"emergent"作为论文核心叙事，但**没有给 baseline scaling law 拟合**——
即"如果用 standard prompting 继续 scale 到 1T, 10T，会不会自然超越 CoT 540B？"。这个问题
2024 年的 inference-time-compute 论文（OpenAI o1 系列、Anthropic 的 thinking）某种程度上回答了：
**post-training 的 RL 训练专门 reward "long chain of thought" 的能力**——CoT 不再是 emergent prompting trick，
是 base model 的内置 capability。

## 复现一处（L4）

按方法论 L4 路径 #3（LLM 调用类，跑 1 个完整对照 trajectory）。

我（Claude，2026 时代的现代 LLM）按论文 Appendix G 的 prompt 模板，对同一道 GSM8K 风格题
分别跑 standard 和 CoT 两个 prompt，记录两次输出的差别。

**测试题**（GSM8K 风格 multi-step word problem）：

> Q: Janet's ducks lay 16 eggs per day. She eats three for breakfast every morning and bakes
> muffins for her friends every day with four. She sells the remainder at the farmers' market
> daily for $2 per fresh duck egg. How much in dollars does she make every day at the farmers'
> market?

(Gold answer: 16 - 3 - 4 = 9, 9 × 2 = $18)

**Standard prompt**（用论文 8 example 的格式 + 这一题）：

```
[8 个 standard example: Q + 直接 answer]
Q: Janet's ducks lay 16 eggs per day. ... How much in dollars does she make every day at the farmers' market?
A:  ← Claude 在这里补全
```

我（Claude）补全的输出：

```
A: $18
```

3 个 token，无推理过程。

**CoT prompt**（用论文 8 example 的格式 + 这一题）：

```
[8 个 CoT example: Q + chain of thought + answer]
Q: Janet's ducks lay 16 eggs per day. ... How much in dollars does she make every day at the farmers' market?
A:  ← Claude 在这里补全
```

我（Claude）补全的输出：

```
A: Janet's ducks lay 16 eggs per day. She eats 3 for breakfast and bakes 4 into muffins,
so she uses 3 + 4 = 7 eggs daily. That leaves 16 - 7 = 9 eggs to sell.
At $2 per egg, she makes 9 × 2 = 18 dollars. The answer is 18.
```

5 句完整推理。

**与论文数字的差距**：

- 我**两次都答对**（standard $18, CoT $18）。Claude 这种 2026 年模型在简单 GSM8K 题上，
  standard prompt 已经足够——这本身就是 CoT 论文 4 年后的有趣验证：**当年 PaLM 540B 的
  emergent ability，今天的中等模型已经"内化"了**
- 但**输出形态有显著差异**：standard 给 3 个 token，CoT 给 5 句话——这才是 prompt 真正控制的事
- 论文是在 GSM8K 上 standard prompting GPT-3 175B 仅 ~15% 正确率的环境下做的——2022 年的世界。
  我无法对齐这个绝对数字（Claude 远比 GPT-3 175B 强），但能复现 prompt 形态上的影响

**真正学到的**：

- **Prompt 不是"让模型答对"的开关**——是"让模型答案以何种形态呈现"的控制器。这个区分是
  prompt-engineering vs reasoning-engineering 的分水岭
- 现代 Claude 在 standard prompt 下也常常"自动 CoT"——RLHF 阶段奖励了详细回答的倾向。
  我特意约束自己只回答 "$18" 才能模拟 2022 GPT-3 行为
- **测试 CoT 真实影响**今天必须用难得多的题——比如 MATH 高中竞赛级、AIME、GPQA。GSM8K 在
  Claude 3+ 时代已经接近上限（~95%）

## 谱系对比

### 前作：Brown et al. 2020 (Language Models are Few-Shot Learners, GPT-3 paper)

CoT 的整个 prompting 范式继承自 GPT-3 paper：**few-shot in-context learning + 推理任务**。
GPT-3 paper 给出的 in-context demo 是 "input → output" 二元对，没有中间过程。CoT 的
所有创新就是在这个范式上加一个"中间字段"。**CoT 不是新的训练范式，是 GPT-3 prompt 形态的扩展。**

### 前作：Cobbe et al. 2021 (GSM8K verifier)

GSM8K 数据集的发布者 + GPT-3 + verifier 微调路线。CoT 的对手—— Figure 2 直接画了 PaLM 540B CoT
（57%）vs Cobbe 175B fine-tuned (~33%) 的对比。CoT 的关键 selling point 是"不用 fine-tune 就达到
fine-tune 效果"——但代价是必须有 ≥100B 模型。

### 后作：Self-Consistency (Wang et al. 2022)

不改 prompt，改 sampling 策略：跑 N 次 CoT 取**最频繁的最终答案**作为 ensemble 答案。GSM8K 上把
PaLM 540B CoT 从 57% 提到 74%。揭示一个深刻的 insight：CoT 的"思考过程"是**可变的**，但答案
往往收敛——majority vote 比 greedy 单次更优。这条路线后来成 OpenAI o1 推理时计算的雏形。

### 后作（同辈）：Zero-shot CoT (Kojima et al. 2022)

发现只在 prompt 末尾加一句 "Let's think step by step." 就能触发 CoT 行为，**不需要任何 example**。
这把 CoT 从 few-shot 推到 zero-shot——证明大模型已经"内置" CoT 能力，只需触发词。

### 后作（推理时计算路线）：OpenAI o1 (2024) / Claude thinking (2024)

把 "post-training reward 长 chain of thought" 当成训练目标，CoT 从 prompting trick 变成
模型内化能力。今天的 Claude 4.7 / GPT-5 类的 thinking 模式就是这一支的延续——CoT 论文是
inference-time-compute 这个新范式的根。

### 后作（批判性）：Are Emergent Abilities a Mirage? (Schaeffer et al. NeurIPS 2023)

挑战 CoT 论文的 emergent claim：很多 emergent 现象是**非线性 metric**（如 exact-match）的副作用，
换平滑 metric（如 likelihood）就消失。但 CoT 在多步推理上的实际效果不是 mirage——是真的有用。
这篇论文修正的是叙事，不是事实。

### 选型建议

| 场景 | 选 |
|---|---|
| 需要 LLM 做多步推理（数学/逻辑/规划） | 现代模型自动 CoT，零 shot 触发即可 |
| 需要可控的"思考过程"长度 | Claude 4.7 thinking / OpenAI o1 类——把 CoT 内化 |
| 需要 ensemble 提升正确率 | Self-Consistency（多次采样取众数） |
| 需要 agent 用工具同时推理 | ReAct（CoT + acting，[已读](/study/papers/react/)） |
| 需要"让答案形态变成步骤式" | 用论文原版 few-shot CoT prompt（仍然有效） |

## 与你当前工作的连接

### 今天就能用

任何"答案不是单点 fact，而是需要中间推理"的 LLM 调用都该考虑 CoT prompt——
但不要直接复制 8-shot demo，2026 年大多数任务用 zero-shot CoT（"think step by step" 触发词）就够。

更重要的连接：理解 CoT 后，你看任何 LLM 输出都会有"这段 reasoning 是 prompt 引导的还是模型自发？"
的本能。这是 prompt-engineering 这件事的真正起点。

### 下个月能用

任何"多步 LLM 工作流"（评测 / 文档生成 / 代码审查 agent）回头审视：

- prompt 里 example 的"中间过程详细度"是否合适？过简单走向 standard，过复杂可能 token 浪费
- 是否需要 Self-Consistency（多次采样取众数）来提升关键决策的稳定性？
- 设计 ablation：把 prompt 分别去掉某一段，看哪段在贡献效果——CoT 论文的 Figure 5 就是范本

### 不要用的部分

- **不要在小模型（< 7B）上用 8-shot CoT**——论文明确指出 emergent 阈值在 ~100B，小模型上 CoT 会**变差**
- **不要把 CoT prompt 当成 universal 优化**——Section 3.2 提到 CoT 在简单单步任务上**改善很小甚至负**
  （SingleOp 那条）
- **不要相信 CoT 输出的 reasoning 真的反映模型内部推理**——后续论文（Turpin et al. 2023 "Language
  Models Don't Always Say What They Think"）证明 CoT 可能是 post-hoc rationalization，模型内部
  决策可能在写 reasoning 之前就完成了

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **Annotator robustness 不彻底**（Section 3.4）：A/B/C 三个 annotator 都是论文作者，可能有
   隐含的"风格趋同"。真正的 robustness 应该让外部志愿者随机重写
2. **Ablation 的 scale 单一**（Section 3.3）：只在 137B/540B 跑了 ablation，没有"小模型上 ablation
   行为是否相同"的对照——和 emergent claim 之间有逻辑漏洞
3. **CoT 与 fine-tune 的真正对照不公平**（Figure 2）：fine-tune GPT-3 175B 用了 7.5K GSM8K 训练集，
   CoT 用了 8 个手写 example——但 CoT 的 8 个 example **是从 GSM8K 训练集风格学的**。这不是
   "zero-domain 比较"

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Wei et al. 2022b (Emergent Abilities of Large Language Models) | "emergent" 这个概念的系统化论文 —— CoT 是其中一个 case |
| 2 | Wang et al. 2022 (Self-Consistency Improves Chain of Thought) | CoT 的最重要后续优化 —— ensemble 路线 |
| 3 | Turpin et al. 2023 (Language Models Don't Always Say What They Think) | **批判 CoT 的硬论文** —— reasoning 可能是事后合理化，不是真因果 |

读完这 3 篇 + CoT 本身 + [ReAct](/study/papers/react/)，你就拥有"LLM reasoning"这个领域
2022-2024 演化的完整地图。

---

**Layer 0-7 完成。约 510 行，100 分钟（含 PDF 读 + 双 prompt 复现 + 笔记书写）。**
