---
title: Toolformer — 教 LLM 自主调用 API
来源: 'Schick et al., "Toolformer: Language Models Can Teach Themselves to Use Tools", NeurIPS 2023'
日期: 2026-05-29
分类: AI / Agent
难度: 中级
---

## 是什么

Toolformer 是 Meta 2023 年提出的方法——**让 LLM 通过自监督学习，自己学会"什么时候该调哪个 API"**，把计算器、搜索、翻译这些工具焊进模型生成过程。

日常类比：[[react]] 走的是**外部教练路线**——用 prompt 教 LLM "你想用工具时这么写"，模型权重不变；Toolformer 走的是**肌肉记忆路线**——把"调工具"当语言能力训练进权重里，让模型自己在合适位置吐出 API 调用。

模型推理时输出长这样（用论文里的 Calendar 工具举例）：

```
今天日期是 [Calendar() → 2026-05-29] 2026-05-29。
```

模型自己生成 `[Calendar()`，遇到 `→` 触发外部执行，结果填回，继续生成下文。**没有外部 controller，没有 prompt 喂示例**——一切焊在权重里。

## 为什么重要

不理解 Toolformer，下面这些事很难解释：

- 为什么 OpenAI Function Calling / Claude Tool Use 这些主流 API 设计长这样——它们在接口层吸收了"模型自己决定何时调工具"的内核
- 为什么 ToolBench / API-Bank / ToolLLM 这一整波后续工作都从 Toolformer 分叉——它打开了 fine-tune 路线
- 为什么"用 LM 生成训练数据再训自己"在 2023 后变成主流——Toolformer 是早期把 self-supervision 成功用在工具调用上的代表
- 为什么纯 prompt 的 plugins 路线很快被"训练时见过工具调用"的模型取代——业界普遍认为 frontier 模型在数据层吸收了同类思路（具体配方未公开）

## 核心要点

Toolformer 的全部魔法在 **三阶段流水线**：

1. **采样候选调用**：用 base LLM 读海量原文（CCNet 段落），在每个位置估"这里插入一个工具调用的概率"。挑前 5 个高概率位置，每个位置生成 5 个候选，比如 `[Calculator(23*47)`。**这一步只靠 in-context prompt 引导，不动权重**——像先让学生随手猜"这里该不该查表"。

2. **真执行 + Loss 过滤**：每个候选调真实 API 拿结果。然后比两道题的难度——"看到调用 + 结果后再猜后面的词" vs "看不到调用时猜后面的词"（这就是 next-token loss：预测下一个词有多难）。前者明显更容易，说明这次调用**真的帮到了下文**，保留；否则丢弃。**核心创新**：用 LM 自己当评分员，不要人工标注——这叫 self-supervision（自己出题自己判）。过滤阈值 τ_f 论文全局取 1.0。

3. **Fine-tune**：把保留下来的"插入了 API 调用的文本"当训练集，正常 next-token loss 训。训完后模型就学会了"什么场景该调什么工具"——焊进权重。

整个流程**人工成本 = 5 个工具 × 几个 demo prompt ≈ 25 行**，0 条 (text, correct_api_call) 标注。

一句话串起来：先猜哪里该调工具 → 真调一次看有没有帮到下文 → 只把有用的样本焊进权重。

## 实践案例

### 案例 1：训练样本长什么样

原始维基百科句子：

```
1879 年生于乌尔姆的科学家是爱因斯坦。
```

Toolformer 流水线生成的候选 + 过滤后保留的训练样本：

```
1879 年生于乌尔姆的科学家是 [QA("谁 1879 年生于乌尔姆？") → 爱因斯坦] 爱因斯坦。
```

模型从大量这种样本里学到："**事实查询场景下，生成 `[QA(...)→` 比硬编码事实更稳**"。

### 案例 2：推理时的 inline 触发

输入 prompt："请计算 23 乘以 47。答案是"

模型生成到 `→` 时停住：

```
答案是 [Calculator(23*47) →
```

外部代码（嵌在 sampling 循环里，不是独立 controller）检测到 `→`，从字符串里抓出 `Calculator(23*47)`，调真实计算器，拿到 `1081`，填回：

```
答案是 [Calculator(23*47) → 1081] 1081。
```

模型从 `]` 之后续写。**整个流程在 sampling loop 内部完成**，没有外部 agent framework。

### 案例 3：5 个工具的分工

| 工具 | 例子 | 适合场景 |
|------|------|---------|
| Calculator | `[Calculator(23*47) → 1081]` | 算术、数值推理 |
| QA | `[QA("法国首都") → 巴黎]` | 事实查询 |
| Wiki Search | `[WikiSearch("Toolformer") → ...]` | 长尾知识 |
| Translator | `[MT("hello", "zh") → 你好]` | 跨语言 |
| Calendar | `[Calendar() → 2026-05-29]` | 时间相关 |

5 个工具 × ~100k 过滤后样本 fine-tune GPT-J 6B，在**算术与部分 QA 等任务上** zero-shot 超过 175B GPT-3——证明"教会用工具"在这些任务上比"做大模型"更经济。

## 踩过的坑

1. **复现困难**：Meta 不开源训练代码。社区第三方复现（lucidrains/toolformer-pytorch）README 直接写"训完效果不达 paper"——论文里有未明说的工程 trick，单看方法跑不出来。

2. **τ_f = 1.0 是 magic number**：过滤阈值全局取 1.0，不分工具。但 calculator 的"对错"很黑白（loss 差很大），QA 的"好坏"很连续（loss 差小但有用）。论文不做 sensitivity 分析，某些工具上 self-supervision 可能并不真的工作。

3. **inline 格式输给了 structured 格式**：Toolformer 的 `[API(arg)→r]` 是文本流内嵌的，但 production 系统全用 OpenAI Function Calling / Claude Tool Use 那种结构化 JSON——停在 tool boundary，外部决定下一步。**架构上 ReAct 那派赢了**。

4. **多 turn 没解**：论文只展示 single-turn completion。多轮对话里 user 中途打断、partial output、retry 怎么处理，论文不答——这是它没被产品化的硬原因。

## 适用 vs 不适用场景

**适用**：
- 学术 research——理解 self-supervised 工具学习的范式
- pretrain / SFT 阶段合成工具调用数据——frontier 模型大概率在数据层用同类思路（配方未公开）
- 数据合成——"用 LM 生成训练数据 + LM loss 过滤"这套范式可移植到很多任务

**不适用**：
- production agent 系统——直接用 OpenAI Function Calling / Claude Tool Use / MCP，别复刻 inline 格式
- 工具频繁变动的场景——Toolformer 把工具焊进权重，加新工具要重训
- 多轮 / 长流程 agent——用 ReAct 范式或 LangGraph 这种 state machine

## 历史小故事（可跳过）

- **2022 年**：ReAct（prompt-only 派）和 MRKL（最早的 modular tool 概念）让大家相信 LLM 能用工具；但都靠人工标 (text, call) pair 或精心设计 prompt——成本天花板。
- **2023-02**：Schick 等人在 Meta 提 Toolformer，**核心创新是用 LM loss 当 unsupervised judge**——把人工标注成本干掉。论文 24 页，方法部分 Section 3 是核心。
- **2023-06**：OpenAI 出 Function Calling，把"何时调工具"接口化——训练数据是否直接抄 Toolformer 未公开，但问题设定高度同构。
- **2024 年**：Claude Tool Use 上线；Anthropic 后来推 MCP（Model Context Protocol）成行业标准。**接口层学的是 ReAct，训练数据层常被拿来和 Toolformer 对照**。

Toolformer 是论文里"**方法被吸收、接口被淘汰**"的经典案例。

## 学到什么

1. **self-supervision 不一定要无意义代理任务**——Toolformer 把"工具调用是否有用"这个真实判据，转成 LM loss 自己能算的 unsupervised 信号。这种"真问题伪装成预训练"的 trick 值得抄。
2. **方法和接口是两件事**——一篇论文的"方法论"可能存活 10 年（被吸收到 frontier 训练数据），"接口"可能 1 年就被淘汰（structured JSON 取代 inline 格式）。读论文要分开看。
3. **"用 LM 当 judge"是 2023 后大潮的源头**——RLAIF / Constitutional AI / synthetic data 全在这条线上，Toolformer 是早期代表。
4. **复现达不到 paper 效果是常态**——论文宣称的 self-supervision 简洁性背后，往往有一堆没明说的工程 trick。读论文时对"全靠方法本身工作"要保持警惕。

## 延伸阅读

- 论文 PDF：[arxiv 2302.04761](https://arxiv.org/abs/2302.04761)（24 页，方法部分 Section 3 是核心，附录 A 给 5 工具的完整 prompt）
- 第三方复现：[lucidrains/toolformer-pytorch](https://github.com/lucidrains/toolformer-pytorch)（star ~2k；核心算法齐全但训出来效果不达 paper）
- 后续工作：[Gorilla](https://arxiv.org/abs/2305.15334)（扩到 1600+ HF/TF API） / [ToolLLM](https://arxiv.org/abs/2307.16789)（扩到 16k RapidAPI）
- 对位论文：ReAct (Yao et al. 2022) —— prompt-only 路线，理解两条路线对照必读

## 关联

- [[react]] —— 同期对位法（prompt-only vs fine-tune）；架构上 ReAct 派赢了产品化
- [[gpt-3]] —— Toolformer 对比基线之一；6B+工具在部分任务上超过 175B 纯文本 GPT-3
- [[reflexion]] —— prompt-only 派后续：用反思环改进工具调用，不改权重
- Gorilla / ToolLLM —— 顺着 Toolformer 思路把工具数扩到 1600+ / 16000+
- MRKL / WebGPT —— Toolformer 之前的工具调用尝试，但靠人工标注或精心 prompt

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

