---
title: Spec-Bench — Speculative Decoding 的综合评测基准
来源: https://arxiv.org/abs/2401.07851
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 是什么

Spec-Bench 是论文 "Unlocking Efficiency in Large Language Model Inference: A Comprehensive Survey of Speculative Decoding" 中提出的一个**综合评测基准（benchmark）**，专门用来公平比较各种 Speculative Decoding（推测解码）方法的加速效果。

论文作者：Heming Xia（香港理工）、张哲（北大）、董清秀（百度）、王培毅（百度）、李永琪（港理工）、Tao Ge（微软亚洲研究院）、刘文杰（北大）、苏智芳（北大）。发表于 ACL 2024 Findings。

## 日常类比

想象你在写一篇文章，你有一个写作搭档：

- **普通模式（自回归解码）**：你写一个字，搭档看一遍，确认没问题，再写下一个字。每次都要搭档过目，很慢。
- **Speculative Decoding 模式**：你先把接下来 5 个字快速写好（这叫 **Drafting / 起草**），然后让搭档一次性检查这 5 个字——如果搭档觉得都对，全通过；如果发现第 3 个字不对，前 2 个保留，第 3 个由搭档重新写，后面作废。这样一次检查代替了 5 次逐个确认，效率大大提升。

Spec-Bench 就是用来**公平测试**各种"起草策略"到底快了多少的考试。

## 核心概念

### 1. 自回归解码（Autoregressive Decoding）

这是 LLM 生成文本的标准方式——一个字一个字地生成，每个字都要跑一遍整个大模型：

```
第 1 步: 大模型 → "今"
第 2 步: 大模型 → "天"
第 3 步: 大模型 → "天"
第 4 步: 大模型 → "气"
...
```

每个字都要做一次完整的模型前向传播，延迟和生成长度成正比。

### 2. 推测解码（Speculative Decoding）的 Draft-then-Verify 范式

先让一个**小模型（draft model）**快速起草多个token，再用**大模型（target LLM）**并行验证：

```
草稿阶段: 小模型 → ["今", "天", "好", "美", "丽"]  （快速，一次性出 5 个字）
验证阶段: 大模型 → 并行计算 6 个概率分布，逐个验证这 5 个字
         → ["今" ✓, "天" ✓, "好" ✓, "美" ✗]
修正:     大模型重新生成第 4 个 → "好"
结果:     "今天好" 三个词通过，第 4 个由大模型自己生成
```

### 3. 关键指标：加速比（Speedup Ratio）

Speedup = 自回归解码所需时间 / 推测解码所需时间

- 加速比 > 1 表示有加速效果
- 加速比越高越好

## Spec-Bench 的评测设计

Spec-Bench 覆盖了 6 个子任务，每个任务从公开数据集中随机选 80 条测试样本：

| 子任务 | 数据集 | 说明 |
|--------|--------|------|
| 多轮对话 | MT-bench | 模拟真实对话场景 |
| 翻译 | WMT14 DE-EN | 德语→英语翻译 |
| 摘要 | CNN/Daily Mail | 新闻摘要生成 |
| 问答 | Natural Questions | 知识型问答 |
| 数学推理 | GSM8K | 小学数学题 |
| 检索增强生成 | DPR | 基于检索文档生成答案 |

所有方法都在**同一台设备**（NVIDIA RTX 3090，24GB）和**同一模型**（Vicuna-7B-v1.3，FP16）上测试，保证公平对比。

## 代码示例

### 示例 1：推测解码的主循环

```python
# 简化版推测解码算法
def speculative_decode(target_model, draft_model, prompt, block_size=5):
    """
    target_model: 大模型（验证者）
    draft_model:  小模型（起草者）
    block_size:   每次草稿的 token 数量
    """
    output = prompt
    while not finished(output):
        # 阶段 1: 起草 — 小模型快速生成 K 个候选 token
        drafted_tokens = draft_model.generate(output, length=block_size)

        # 阶段 2: 验证 — 大模型并行计算所有候选 token 的概率
        # 一次前向传播同时算出 K+1 个分布
        distributions = target_model.batch_forward(output + drafted_tokens)

        # 阶段 3: 逐个验证，找到第一个不满足条件的 token
        accepted_count = 0
        for i, (drafted, dist) in enumerate(zip(drafted_tokens, distributions)):
            if verify(drafted, dist):  # 验证标准：概率分布足够接近
                output += drafted
                accepted_count += 1
            else:
                # 发现不匹配的 token，用它之后的所有草稿作废
                # 由大模型重新生成一个 token
                output += sample_from(distributions[i])
                break

        # 如果全部草稿都通过了，大模型再生成一个 token
        if accepted_count == block_size:
            output += sample_from(distributions[-1])

    return output
```

### 示例 2：Spec-Bench 评测脚本框架

```python
# 简化版 Spec-Bench 评测流程
import numpy as np

def run_specbench(method_name, target_model, draft_model, dataset):
    """
    在 Spec-Bench 的某个子任务上运行某个推测解码方法
    """
    samples = load_dataset(dataset)  # 加载 80 条测试样本
    latencies = []
    accepted_rates = []

    for sample in samples:
        prompt = sample["input"]
        expected = sample["output"]

        # 记录纯自回归的时间作为基准
        baseline_start = time.time()
        baseline_output = target_model.autoregressive_decode(prompt)
        baseline_latency = time.time() - baseline_start

        # 运行推测解码
        spec_start = time.time()
        spec_output = speculative_decode(target_model, draft_model, prompt)
        spec_latency = time.time() - spec_start

        # 计算加速比
        speedup = baseline_latency / spec_latency
        latencies.append(speedup)

        # 记录 token 接受率（验证阶段有多少草稿被接受）
        acceptance_rate = count_accepted(spec_output) / total_drafts(spec_output)
        accepted_rates.append(acceptance_rate)

    return {
        "method": method_name,
        "mean_speedup": np.mean(latencies),
        "std_speedup": np.std(latencies),
        "mean_acceptance_rate": np.mean(accepted_rates),
        "dataset": dataset
    }

# 在 Spec-Bench 的 6 个子任务上分别评测
subtasks = ["multi-turn", "translation", "summarization",
            "question-answering", "math-reasoning", "rag"]

results = []
for task in subtasks:
    result = run_specbench(
        method_name="EAGLE",
        target_model="vicuna-7b-v1.3",
        draft_model="vicuna-68m-v1.3",
        dataset=task
    )
    results.append(result)
    print(f"{task:20s} → 加速比: {result['mean_speedup']:.2f}x  "
          f"接受率: {result['mean_acceptance_rate']:.1%}")
```

## Spec-Bench 的主要发现

### 不同方法在 6 个子任务上的加速比对比

所有实验使用 Vicuna-7B-v1.3，在单张 RTX 3090 上，greedy 设置（温度=0）：

| 方法 | 多轮对话 | 翻译 | 摘要 | 问答 | 数学推理 | RAG | 平均 |
|------|----------|------|------|------|----------|-----|------|
| EAGLE | ~1.8× | ~1.7× | ~2.0× | ~1.9× | **~2.4×** | ~1.8× | ~2.0× |
| PLD | ~1.5× | ~1.2× | **~2.4×** | ~1.3× | ~1.4× | **~1.7×** | ~1.6× |
| Medusa | ~1.5× | ~1.4× | ~1.8× | ~1.5× | ~1.7× | ~1.6× | ~1.6× |
| SpS | ~1.6× | ~1.5× | ~1.6× | ~1.6× | ~1.8× | ~1.5× | ~1.6× |

**关键发现**：

1. **EAGLE 整体最佳**：在所有 6 个子任务上表现最稳定，数学推理加速比高达 2.4×。因为它复用 LLM 的 KV Cache 来生成草稿，大幅降低了起草的计算开销。

2. **PLD 在特定任务上领先**：PLD（Prompt Lookup Decoding）在"摘要"和"RAG"上加速比最高（2.4× 和 1.7×），因为这两个任务中输入和输出有大量文本重叠，可以直接从 prompt 中"抄"草稿。

3. **温度越高，加速效果越差**：采样温度（temperature）从 0 升到 1 时，所有方法的加速比都会下降。这是因为温度越高，草稿和验证之间的概率分布差异越大，接受率越低。

## 总结

Spec-Bench 的核心价值在于：在 Speculative Decoding 领域研究快速爆发、各家方法评测条件不一的背景下，提供了一个**统一、公平、覆盖多场景**的基准测试平台。它让研究者可以清楚地看到：不同方法在哪些场景下快、快多少、为什么快。

对初学者来说，理解 Spec-Bench 的关键是抓住一个词：**公平对比**——同样的模型、同样的硬件、同样的测试数据，不同方法一较高下。

## 下一步可以探索

这篇论文除了提出 Spec-Bench，还系统梳理了 Speculative Decoding 的整个技术体系，包括：

- **Drafting 策略分类**：独立起草（用小模型）vs 自起草（用同一个模型的不同部分，如 FFN Heads、Early Exiting）
- **Verification 策略分类**：贪心验证 vs 推测采样 vs Token Tree 验证
- **Alignment（对齐）**：如何让起草模型和目标模型的行为更一致，从而提高接受率
- **开放挑战**：批处理（batched）场景下的推测解码、与 vLLM 等优化技术的结合

如果你对 LLM 推理加速感兴趣，这篇论文是很好的起点。
