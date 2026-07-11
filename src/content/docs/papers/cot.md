---
title: Chain-of-Thought Prompting
来源: 'Wei et al., "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", NeurIPS 2022'
日期: 2026-05-29
分类: AI / LLM
难度: 中级
---

## 是什么

Chain-of-Thought（**CoT**，思维链）是一种**让大语言模型在给出答案前先写出"中间思考过程"**的提示方法。日常类比：考数学题不写步骤直接写答案常常错；写出"先把 A 转成 B，再 C..."就对得多。

你问 GPT：

```
Q: 食堂有 23 个苹果，用了 20 个做午餐，又买了 6 个，现在有几个？
A: 27    ← 错
```

直接答常错。但你给它几个"先思考再回答"的示例：

```
Q: ...
A: 23 - 20 = 3，3 + 6 = 9。答案是 9。
```

模型立刻学会"先推后答"，正确率暴涨。

这种"在 prompt 里写思考过程示例"的简单技巧，是 ChatGPT 时代所有"先思考再回答"行为（包括 Claude 的 thinking、OpenAI o1）的源头。

## 为什么重要

不理解 CoT，下面这些事都没法解释：

- 为什么 GPT-3 在小学数学（GSM8K）上从 **17% 飙到 56%**——不改模型不微调，只改 prompt
- 为什么 LLM 有"**涌现能力**"——小模型加 CoT 反而变差，跨过 100B 参数才有效
- 为什么 ChatGPT / Claude 默认会"先解释再答"——RLHF 阶段把 CoT 习惯内化进了模型
- 为什么后来的 **Tree of Thought / Reflexion / OpenAI o1** 全是 CoT 的扩展
- Agent 范式（[[react]]：思考 → 行动 → 观察）的根就是 CoT

## 核心要点

CoT 论文之后演化出**三个变体**，按"用起来多省事"排序：

1. **Few-shot CoT**（原版）：在 prompt 里塞 8 个"问 + 推理过程 + 答"示例，再让模型补全新问题。要手写示例，但效果最稳。

2. **Zero-shot CoT**（半年后 Kojima 发现）：不用任何示例，prompt 末尾加一句 **"Let's think step by step."**——大模型会自动展开推理。一句话魔法。

3. **Self-Consistency**（同年 Wang 提出）：让模型多次采样，取出现频率最高的答案做投票。比单次 CoT 再涨 5-10 个百分点，代价是算力 ×N。

三者本质都是"给模型展开思考的空间"，区别只是触发方式和算力预算。

## 实践案例

### 案例 1：数学题——一行示例换 3 倍正确率

不加 CoT 示例（标准 prompt）：

```
Q: 5 + 6 = ?
A: 11

Q: 23 + 47 = ?
A:    ← 复杂多步常错
```

加 CoT 示例：

```
Q: 5 + 6 = ?
A: 先看个位 5 + 6 = 11，进 1。答案是 11。

Q: 23 + 47 = ?
A:    ← 模型按示例格式补全推理过程
```

唯一改动：示例答案里多写了一行"思考过程"。GSM8K 上 PaLM 540B 从 17.9% 提到 56.9%——3 倍提升。

### 案例 2：Zero-shot 的一句话魔法

```
Q: 我有 5 个苹果，吃了 2 个，又买了一袋（袋里 8 个）。还有几个？
A: Let's think step by step.
   ← 模型自动展开：先 5 - 2 = 3，再 3 + 8 = 11
```

不要任何示例，仅靠这句"咒语"在 GPT-3 上把 GSM8K 从 17% 提到 43%。

这告诉我们：**大模型其实"会"推理，只是默认习惯直接答；prompt 起的是"触发"作用，不是"教学"作用。**

### 案例 3：CoT vs ReAct——只思考 vs 思考 + 行动

CoT 让模型在脑内推理，但**碰到"我需要查某个事实"就卡住**。ReAct 把 CoT 扩展为：

```
Thought: 我需要知道 Paris 的人口。
Action:  search("Paris population")
Observation: 2.1 million
Thought: 那答案就是 2.1 million。
```

CoT 解决纯推理任务，ReAct 解决"推理 + 调用工具"任务。今天所有 agent 框架（LangChain / Claude tool use）都是 ReAct 路线，而 ReAct 里的"Thought"那一步就是 CoT。

## 踩过的坑

1. **小模型上 CoT 反而变差**：< 100B 参数的模型用 CoT 不只无效，往往**让回答更乱**——小模型生成"看似流畅但逻辑错的链"。本地跑 7B 模型时别直接套 CoT 示例。

2. **CoT 的"思考过程"不一定是真因果**：Turpin 2023 证明模型可能是先决定答案再编理由（事后合理化）。在 prompt 里植入 bias 测试时，CoT 模型仍按 bias 给答案，但 reasoning 完全不提 bias 存在。**别把 CoT 输出当作模型真实的内部推理过程**。

3. **简单题别强加 CoT**：单步任务（"2 + 2 = ?"）加 CoT 效果反而下降，浪费 token。CoT 是"多步推理任务的开关"，不是 universal 优化。

4. **示例风格混乱也能 work**：原论文 8 个示例算式风格不一致（有的 `5+6=11` 有的 `5 + 6 = 11`），仍然有效。但不同人写的示例之间有 ~5% 标准差——CoT 的稳定性比想象的低。

## 适用 vs 不适用场景

**适用**：

- 多步数学题 / 逻辑推理 / 规划任务（订机票、查路径）
- 需要"看到模型怎么想"的解释性场景（教学、debug）
- 大模型（≥ 100B 参数，或经过 RLHF / RL 训练的现代模型）

**不适用**：

- 单步事实问答（"巴黎是哪个国家首都？"）—— 浪费 token
- 小模型（< 7B 原始预训练模型）—— 反而变差
- 需要严格可解释的医疗 / 法律决策 —— CoT 输出可能只是事后合理化

## 历史小故事（可跳过）

- **2022-01**：Jason Wei 等人在 Google Brain 发现"在 few-shot 示例里加推理过程"能戏剧性提升性能，论文上传 arXiv
- **2022-03**：Wang et al. 提出 **Self-Consistency**——多次采样投票
- **2022-05**：Kojima et al. 发现 **"Let's think step by step."** 一句话就够，不用任何示例
- **2022-10**：Yao et al. 把 CoT 扩展为 [[react]]——把"思考"和"行动"交错
- **2023-05**：Tree of Thought 把"线性链"变"树形搜索"，在 24 点游戏上爆 CoT
- **2024-09**：OpenAI **o1** 用强化学习把 CoT 训进模型权重——从 prompt trick 变成模型内置能力
- **2025-01**：DeepSeek **R1** 公开 RL-CoT 全流程，让 7B 小模型也能有 CoT 推理——部分推翻"涌现能力 100B 阈值"叙事

CoT 论文从 prompt 小技巧，4 年内长成了整个"推理时计算"范式的根。

## 学到什么

1. **prompt 不只是问问题，还能改变模型回答的"形态"**——从"直接答"到"先推再答"，仅靠示例引导
2. **大模型里有很多隐藏能力，需要正确的 prompt 触发**——这是 prompt-engineering 整门学问的起点
3. **方法硬度来自对照实验**——原论文做了三个对照（只留算式 / 用 dot 占位符 / 答案前置），全失败，才证明"自然语言 + 推理 → 答案"这个组合不可拆
4. **从 prompt 到 RL training**：技术演化常常是"先发现现象（2022 prompt），再训练成内置能力（2024 o1）"

## 延伸阅读

- 论文 PDF：[arXiv:2201.11903](https://arxiv.org/abs/2201.11903)（43 页含 9 个附录，主体 12 页）
- Zero-shot CoT 原文：[arXiv:2205.11916](https://arxiv.org/abs/2205.11916)
- 反对者论文：[Turpin et al. 2023](https://arxiv.org/abs/2305.04388)——CoT 输出可能不是真推理
- [[react]] —— CoT + 工具调用，agent 范式的源头
- [[scaling-laws]] —— 模型规模如何决定能力涌现
- [[deepseek-r1]] —— RL 训练 CoT，部分推翻 100B 阈值

## 关联

- [[react]] —— ReAct 的"Thought"就是 CoT，扩展为推理 + 行动
- [[scaling-laws]] —— 涌现能力的理论解释
- [[constitutional-ai]] —— RLHF 训练让模型"内化" CoT 习惯
- [[induction-heads]] —— in-context learning 的机制基础，CoT 依赖它
- [[deepseek-r1]] —— RL-CoT 训练，从 prompt trick 到模型权重

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ccopd-distillation]] —— CCOPD — 让多轮对话别被自己的旧话带偏
- [[chain-of-thought]] —— Chain-of-Thought — 让大模型先写步骤再回答
- [[compositional-incoherence]] —— Compositional Incoherence — 多组件 LLM 拼出来的概率账单不守恒
- [[debate-2018]] —— AI safety via debate — 让两个 AI 互辩，人类只当评委
- [[entity-tracking-states]] —— Entity Tracking States — 语言模型不是一路记账，而是最后临时汇总
- [[loong-doc-mt]] —— Loong DocMT — 长文档翻译里的会挑上下文的代理
- [[mira-rubric]] —— MIRA Rubric — 给混合训练数据先定评分尺再筛选
- [[ppc-preplan]] —— PPC Preplan — 先想清楚题目类型再规划解法
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[projection-bench]] —— ProjectionBench — 用逐步揭示信息测试科学假说生成
- [[papers/react]] —— ReAct — Reasoning and Acting
- [[react-agent]] —— ReAct Agent — 推理和行动交替的工具使用范式
- [[reasoning-with-sampling]] —— Reasoning with Sampling — 在关键决策点重采样推理过程
- [[reflexion]] —— Reflexion — 让 LLM 自我反思
- [[rim-latent-reasoning]] —— RiM Latent Reasoning — 给 LLM 一块不用说出口的工作记忆
- [[schgen-pcb]] —— SchGen PCB — 把一句需求变成可编辑电路原理图
- [[self-consistency-2022]] —— Self-Consistency — 让模型把同一道题做 40 遍再投票
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[tree-of-thoughts-2023]] —— Tree of Thoughts — 让 LLM 像下棋一样多想几步再答
- [[voyager]] —— Voyager — LLM 终身学习智能体
