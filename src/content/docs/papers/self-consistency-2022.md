---
title: Self-Consistency — 让模型把同一道题做 40 遍再投票
来源: 'Wang et al., "Self-Consistency Improves Chain of Thought Reasoning in Language Models", ICLR 2023 (arXiv:2203.11171)'
日期: 2026-06-01
分类: AI / LLM
难度: 入门
---

## 是什么

Self-Consistency（**SC**，自一致性）是一种**让模型把同一道推理题做很多遍，再用"答得最多的那个"作为最终答案**的提示方法。日常类比：考试估分时不放心一遍算的结果，再算两遍取多数；考场上学霸也常这么干。

CoT（思维链）是只让模型"先思考再答"，但**只采样一次**：

```
Q: 食堂有 23 个苹果，用了 20 个，又买了 6 个，现在有几个？
A: 23 - 20 = 3，3 + 6 = 9 → 9       ← 这次对
A: 23 - 20 = 3，再用 6 → 答案是 -3   ← 换种心情可能错
```

Self-Consistency 把"采样一次"换成"**采样 40 次 + 投票**"：

```python
answers = [llm.sample(prompt, temperature=0.7) for _ in range(40)]
final = Counter(extract_answer(a) for a in answers).most_common(1)[0][0]
```

代码就这么短，但在 GSM8K（小学数学题）上把 PaLM-540B 从 **56.5% 拉到 74.4%**（+17.9 个百分点）。

## 为什么重要

- **inference-time compute 的早期硬实证**：不改模型、不训练、只多花推理算力，就能拿大幅提升。直接催生了后来的 Tree-of-Thoughts、OpenAI o1 这类"花更多算力换更好答案"的范式
- **把多数票聚合推到推理评测主流**：代码生成里的 pass@k（Codex/HumanEval，2021）更早，但 SC 让"多样本 + 多数票"成为算术/常识推理评测的标配
- **简单到不可思议**：一行 `Counter().most_common(1)` 就是核心逻辑，但作者用充分实验证明了它在多个模型、多个任务上都稳赢

## 核心要点

为什么"多采样 + 投票"会比"采样一次"更准？作者给的直觉是：

1. **复杂推理题通常有多条不同路径到达同一正确答案**——比如 `(23-20)+6 = 9` 和 `23+6-20 = 9` 是不同推理但同一答案
2. **正确路径彼此一致，错误路径彼此分散**——算错的人 A 错成 -3、B 错成 27、C 错成 16，但算对的全是 9。一致即正确
3. **temperature 采样制造多样性**——把模型想象成会从多个候选里抽词的人，每次抽到的"思路"不同，但只要它真"会做"这题，多数路径会回到同一答案

把这三条合起来，就是"采样 N 条 + 聚合答案"。论文正式写法是对推理路径做 marginalization（可按路径概率加权）；实践里最常用、也最好复现的是**无权重多数票**（majority vote）。

实现细节也极简：

- 采 N=40 条（典型值），temperature 0.5-0.7
- 用正则或简单解析从每条 CoT 里抽出最终答案
- `numpy.bincount` 或 `Counter` 投票（多数票特例）

**没有训练、没有 verifier、没有架构改动**。

## 实践案例

### 案例 1：GSM8K 小学数学题（最经典对照）

| 模型 | Greedy CoT | Self-Consistency (40 samples) | 提升 |
|---|---|---|---|
| PaLM-540B | 56.5% | 74.4% | +17.9pp |
| LaMDA-137B | 17.1% | 27.7% | +10.6pp |
| GPT-3 (code-davinci-002) | 60.1% | 78.0% | +17.9pp |

这种"换个 decoding 策略，正确率涨 17 个百分点"的事在 ML 历史上极少见。

### 案例 2：你能五分钟自己跑一遍

```python
import openai
from collections import Counter
import re

def extract_answer(text):
    m = re.search(r"答案是\s*([\-\d.]+)", text)
    return m.group(1) if m else None

prompt = "..."  # CoT 示例 + 题目；英文题把正则改成 The answer is
answers = []
for _ in range(40):
    # 旧 SDK 示意；新版用 openai.OpenAI().chat.completions.create(...)
    r = openai.ChatCompletion.create(
        model="gpt-4", messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    a = extract_answer(r.choices[0].message.content)
    if a: answers.append(a)

final = Counter(answers).most_common(1)[0][0]
```

跑一次 40 个 sample，比 greedy 稳得多。代价是 API 调用费 × 40。

### 案例 3：什么时候投票失灵

```
Q: "What is your favorite color?"
A: "blue"  / "red" / "green" / "purple" / "yellow" ...
```

开放式生成里每个采样都不一样，没法投票。SC **只对答案是离散值**（数字、选项 A/B/C/D、是/否）的题有效。

## 踩过的坑

1. **答案抽取（answer extraction）才是工程难点**：模型输出不一定整齐写"答案是 9"，可能写"所以是 9 个"、"九"、"9.0"。投票前必须做归一化（数字字符串、繁简、单复数）
2. **N 越大边际收益越小**：N=10 已经接近 N=40 的大部分收益；超过 N=40 几乎不动了，但成本线性涨。生产里通常 N=10-20 折中
3. **systematic bias 不被投票修正**：如果模型对某类题"全部 40 个采样都同犯一类错"，投票出的也是错的——典型例子是单位换算题、负号题
4. **temperature 太低 = 退化成 greedy**：T=0.1 时 40 个采样几乎一样，投票毫无意义。T=0.7 是经验最优区间
5. **答案是连续值时不能直接投票**：物理题答案 9.81 和 9.80 算不算同一个？需要先离散化（如保留两位小数）再投票

## 适用 vs 不适用场景

**适用**：

- 数学题（GSM8K、MATH、SVAMP）、多选题（ARC、AQuA）、常识问答有明确答案的（StrategyQA）
- 任何"最终答案是离散值 + 中间过程多样"的任务
- 离线评测、需要追求最高准确率的场景（论文 benchmark、产品里关键决策）

**不适用**：

- 开放式生成（写作、翻译、代码补全）——每个采样都不同没法投票
- 答案空间极大的任务（自由问答 long-form）
- 延迟敏感的场景（聊天补全要 200ms 出第一个 token，跑 40 次至少 4 秒）
- 已经 99% 准确率的任务，没有提升空间

## 历史小故事（可跳过）

- **2022 年 1 月**：Wei 等发表 CoT 论文（NeurIPS 2022），把"先思考再答"做成主流，但用的是 greedy decoding
- **2022 年 3 月**：Wang 等同组的人把 CoT 的 decoding 换成 sampling+vote，发现 GSM8K 直接涨 18pp，arXiv 上挂出 Self-Consistency
- **2023 年 5 月**：ICLR 2023 录用，被 Tree-of-Thoughts、Verifier-based reasoning 大量引用
- **2024 年 9 月**：OpenAI o1 发布，把"采样多 + 聚合"范式扩展到"采样 + RL 训练 + reasoning trace"——SC 是这条路线的起点

## 学到什么

1. **decoding 策略本身就是研究方向**：不是只有"训练数据/模型架构"才能拉性能；选 greedy 还是 sample+vote 可能差 18pp
2. **简单方法 + 充分实验 = 顶会论文**：SC 的核心算法两行代码，但作者跑了 PaLM/LaMDA/GPT-3/Codex × GSM8K/SVAMP/AQuA/ARC/StrategyQA 矩阵，证明了它**到处都赢**
3. **inference-time compute 是新维度**：模型固定后，多花推理算力换准确率，是 2022 后 LLM 优化的重要方向
4. **多样性 + 一致性是搜索空间的一对约束**：太集中（greedy）丢搜索空间，太发散（高 T）失去信号；SC 用中等 T + vote 平衡两者

## 延伸阅读

- 论文 PDF：[arXiv:2203.11171](https://arxiv.org/abs/2203.11171)（22 页，实验密集）
- 视频讲解：[Yannic Kilcher — Self-Consistency](https://www.youtube.com/watch?v=zKzQXmOK-rQ)（30 分钟逐图解释）
- [[cot]] —— Self-Consistency 的前置；只采一条 CoT
- [[tree-of-thoughts-2023]] —— SC 的扩展：从"投票"升级到"树搜索 + 评估"
- [[react-2022]] —— 推理 + 行动结合的另一种 CoT 增强

## 关联

- [[cot]] —— 直接前驱，SC 把 CoT 的 decoding 从 greedy 换成 sample+vote
- [[tree-of-thoughts-2023]] —— 后续工作，把"投票"换成"带评估的树搜索"
- [[toolformer]] —— 另一种 CoT 增强方向：让模型调外部工具
- [[gpt-3]] —— SC 的实验主要在 GPT-3/PaLM 等大模型上做

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chain-of-thought]] —— Chain-of-Thought — 让大模型先写步骤再回答
- [[compositional-incoherence]] —— Compositional Incoherence — 多组件 LLM 拼出来的概率账单不守恒
- [[ppc-preplan]] —— PPC Preplan — 先想清楚题目类型再规划解法
- [[reasoning-with-sampling]] —— Reasoning with Sampling — 在关键决策点重采样推理过程
- [[rim-latent-reasoning]] —— RiM Latent Reasoning — 给 LLM 一块不用说出口的工作记忆
- [[self-trained-verification]] —— Self-Trained Verification — 让模型先看标准答案学会挑错
