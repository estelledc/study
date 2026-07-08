---
title: PPC Preplan — 先想清楚题目类型再规划解法
来源: 'Shaojie Wang and Liang Zhang, "Knowing What to Solve Before How: Preplan Empowered LLM Mathematical Reasoning", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 中级
---

## 是什么

PPC（Preplan-Plan-CoT）是一种让大模型解数学题时先写"问题理解"，再写计划，最后展开推理的训练框架。

日常类比：做饭前不要一上来就开火，而是先看清楚今天做的是汤、炒菜还是烘焙；食材、火候、容易翻车的地方看明白后，菜谱步骤才不会走偏。

在 LLM 推理里，传统 CoT 是 question -> cot；计划型方法是 question -> plan -> cot。PPC 说中间还少了一步：question -> preplan -> plan -> cot。

preplan 不负责算答案，而是回答"这到底是什么题、该想到哪些工具、边界条件在哪里、常见坑是什么"。后面的 plan 才决定具体怎么走，execute 才真正计算。

## 为什么重要

不理解 PPC，下面这些事都很难解释：

- 为什么有些模型不是算错，而是从第一步就把题目类型看错了
- 为什么"先写计划"仍然会失败：计划和执行都在回答"怎么做"，没有人先回答"做什么"
- 为什么训练数据里不能让 preplan 偷偷计算：一旦偷算，它就退化成另一段 CoT
- 为什么 PPC 能在不增加推理 token 的情况下提升 maj@16 和 pass@16
- 为什么 prompt-only 的"先分析再求解"不够，论文里训练后的 PPC 才稳定领先

## 核心要点

1. **preplan 是体检单，不是手术单**。
   类比医生先判断是感冒、过敏还是肺炎；preplan 只列病因、检查点和风险，不直接开刀。论文把它定义为非计算的问题理解阶段。

2. **数据要防两种污染**。
   leakage 是 preplan 提前复述计划，spoiler 是 preplan 提前算出中间结果。PPC 用三阶段生成和 spoiler-score 过滤，把这些"偷跑"样本剔掉。

3. **奖励要逼 plan 真的听 preplan**。
   只奖励答案正确，模型可能把 preplan 写成装饰品。PPC 在 GRPO 里加入 plan-preplan adherence，让计划必须继承前面的问题理解。

## 实践案例

### 案例 1：同一道题，先理解再计划

没有 preplan 时，模型可能这样直接规划：

```txt
<plan>
1. 用判别式枚举参数。
2. 代入每个候选值。
3. 统计满足条件的解。
</plan>
```

加上 preplan 后，前面先出现一段不计算的诊断：

```txt
<preplan>
这是齐次二次形式，重点是识别可分解结构。
需要关注每个线性因子对应的是一族解，而不是一个点。
主要风险是把结构题误当成普通判别式枚举题。
</preplan>
```

**逐部分解释**：

- 第一段 plan 已经选了路线，但路线可能很脆
- preplan 先指出题目类型，减少后面选错工具的概率
- "不计算"很关键；它只提醒结构，不提前跑完整解法

### 案例 2：spoiler-score 像安检门

论文把 preplan 过一遍规则检查，防止它偷算：

```python
def spoiler_score(text):
    score = 0
    score += has_derivation_phrase(text)
    score += count_equal_signs(text) >= 3
    score += has_long_math_spans(text)
    score += has_large_standalone_number(text)
    score += has_answer_revealing_words(text)
    score += count_inline_math(text) >= 4
    return score
```

**逐部分解释**：

- 等号太多，常常说明已经在推导
- 大量长公式，常常说明已经从"看题"变成"解题"
- 只有 `score <= 2` 且最终答案正确的轨迹，才进入 SFT 数据

### 案例 3：复合奖励不是只看答对

PPC 在 GRPO 里把奖励拆成四块：

```python
reward = outcome
reward += 0.1 * adherence
reward += 0.3 * format_ok
reward -= 0.1 * style_penalty
```

**逐部分解释**：

- `outcome` 仍然最大，保证模型不是只会写漂亮结构
- `adherence` 检查 plan 是否真的沿用 preplan
- `format_ok` 要求 `<preplan><plan><execute>` 顺序正确
- `style_penalty` 防止 preplan 训练后又滑回推导式文字

## 踩过的坑

1. **把 preplan 写成步骤清单**：原因是步骤清单已经在决定怎么做，会和 plan 抢同一个职责。

2. **只用 prompt 模仿 PPC**：原因是模型会写出形式，但不一定在后续计划里真的使用这些分析。

3. **只奖励最终答案**：原因是答案正确不能证明 preplan 干净，也不能证明 plan 继承了 preplan。

4. **以为多一段就一定更慢**：原因是 preplan 会减少错误路线和冗余展开，论文里 PPC 反而比普通 GRPO 更短。

## 适用 vs 不适用场景

**适用**：

- 数学竞赛题、奥数题、复杂代数题这类需要先识别题型的任务
- 已经有 CoT 或 plan-based reasoning，但经常选错路线的模型
- 可以用 verifier 或规则检查最终答案的 RL 训练场景
- 想把"问题理解"从"执行推理"里拆出来观察和约束的研究

**不适用**：

- 单步事实问答，先写 preplan 只会浪费输出
- 没有明确正确答案、也没有可用 judge 的开放写作任务
- preplan 本身必须包含大量公式推导的领域，因为它会触发 spoiler 规则
- 只做一次性 prompt demo、不准备训练或评测的轻量场景

## 历史小故事（可跳过）

- **2022 年**：CoT 证明"写出中间步骤"能显著提高大模型数学推理。
- **2023 年**：Plan-and-Solve、Tree of Thoughts 等方法把"先计划"放到 CoT 前面。
- **2025 年**：DeepSeek-R1 一类 RL 推理模型让 GRPO 和可验证奖励成为主流训练工具。
- **2026 年**：PPC 提出问题：计划之前还要不要先理解题目本身。
- **同年实验**：它在四个 backbone、五个数学 benchmark 上拿到 39/40 个最佳指标。

## 学到什么

- PPC 的核心不是"多写一段"，而是把 what-to-solve 和 how-to-solve 分开训练。
- 干净的 preplan 必须只描述题型、工具、约束和坑，不能提前算。
- RL 奖励要覆盖答案、结构、风格和继承关系，才能避免模型钻空子。
- 论文最有价值的证据不是单个分数，而是 mismatched preplan 会让性能大幅崩掉，说明模型确实在用它。

## 延伸阅读

- 论文 PDF：[Wang & Zhang 2026 — PPC Preplan](https://arxiv.org/pdf/2605.30245v1.pdf)
- [[cot]] —— PPC 是在 CoT 前面再加问题理解层
- [[self-consistency-2022]] —— 论文的 maj@16 / pass@16 指标来自多采样评测传统
- [[deepseek-r1]] —— PPC 的 RL 阶段使用了同一类可验证奖励思路
- [[tree-of-thoughts-2023]] —— 同样关注推理前的结构化搜索，但它偏推理时展开
- [Plan-and-Solve Prompting](https://aclanthology.org/2023.acl-long.147/) —— question -> plan -> cot 路线的重要前身

## 关联

- [[cot]] —— 原始范式是 question -> cot，PPC 在它前面补问题理解
- [[self-consistency-2022]] —— maj@k 和 pass@k 帮论文衡量多次采样下的稳定性
- [[tree-of-thoughts-2023]] —— 都在解决单条 CoT 容易走错路的问题
- [[deepseek-r1]] —— GRPO 和可验证奖励是 PPC 训练阶段的基础工具
- [[ppo]] —— GRPO 可以看作 PPO 家族里更省 critic 的变体
- [[reasoning-with-sampling]] —— 都把推理过程拆开，在关键位置控制搜索和选择

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

