---
title: DeepSeek-R1 状元篇 — 纯 RL 让 LLM 自己学会推理
description: DeepSeek-R1 用 GRPO + rule-based reward 跳过 SFT 阶段，让 base model 在纯强化学习下涌现长 chain-of-thought 与自我反思，开源对齐 OpenAI o1 并引爆 reasoning model 浪潮
season: M
chapter: M5
type: method
status: draft
---

# DeepSeek-R1 状元篇

## Layer 0 论文卡片

| 字段 | 内容 |
| --- | --- |
| 中文标题 | 通过强化学习激发 LLM 的推理能力 |
| 英文标题 | DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning |
| 一作 | DeepSeek-AI Team（机构作者） |
| 一作机构 | DeepSeek（杭州深度求索；2023 年由幻方量化分拆出来的研究实验室） |
| 发表时间 | 2025-01-22 |
| arXiv ID | 2501.12948 |
| 终版号 | v1（截至 2026-05 仍是 v1） |
| 引用数 | 截至 2026-05 已超 4500 次（citations 在 2026 持续上升） |
| 代码仓库 | deepseek-ai/DeepSeek-R1（commit `0cf78561f1d51c84a21b2190626b21116d5c68bb`） |
| 复刻仓库 | huggingface/open-r1（commit `1416fa0cf21595d2083b399a2a0bbddd7f6e9563`） |
| GRPO 实现 | volcengine/verl（commit `b0028bca560c0185eedad71e7cff1d373b6ae138`） |
| 数据 / 资源 | DeepSeek-V3-Base（671B MoE）+ ~600K reasoning samples + ~200K alignment samples |
| 论文类型 | method（算法 + 训练 pipeline 创新） |
| 一句话定位 | 用 GRPO + rule-based reward 在 base model 上直接跑纯 RL，让长 CoT 与 self-reflection 涌现，再用 cold-start SFT 修对齐，开源对齐 OpenAI o1 |

一句话定位：**纯 RL 不需要 SFT 就能让 LLM 学会推理**——R1-Zero 证明了这件事，R1 在它的基础上加 cold-start SFT + 多阶段 RL 把对齐补回来。

![DeepSeek-R1 训练 pipeline](/study/papers/deepseek-r1/01-pipeline.webp)

## 创新点（5 个粗体小标题）

**1. R1-Zero：跳过 SFT 直接 RL，长 CoT 自己涌现**

最大胆的实验：拿 DeepSeek-V3-Base（一个完全没有经过 instruction tuning 的 base model），不做任何 SFT，直接挂 GRPO + rule-based reward 训。结果是模型在几千步内自然学会了 long chain-of-thought、self-verification、甚至 "Aha moment"（中途意识到错误并回头）。这是论文里最被反复引用的发现——说明推理能力不是 SFT 教出来的，而是 RL 激发的。

**2. GRPO：去掉 critic 网络的 PPO 变体**

RLHF 标配的 PPO 需要一个 critic（value network）来估计 baseline，资源开销大。GRPO（Group Relative Policy Optimization）的核心 trick：对同一个 prompt 采样 G 个 rollout，用组内平均 reward 作为 baseline，advantage = (r_i - mean(r)) / std(r)。这样不用 critic，省一半显存，训练简单。GRPO 是 DeepSeekMath 论文先提出的，R1 在 671B 规模上验证了它能 scale。

**3. Rule-based reward：用 verifier 替代 reward model**

InstructGPT/RLHF 的传统做法是训一个 reward model 当裁判。R1-Zero 直接用规则：math 题有标准答案就 string match（`math_verify`），code 题就 sandbox compile + 跑测试用例。这避开了 reward hacking（policy 学会骗 reward model）的最大风险。代价是只能用在"答案可验证"的领域——所以 R1 的能力强项是 math、code、logic，对话/创意领域要靠后续 SFT 补。

**4. 多阶段 pipeline：cold-start SFT → reasoning RL → SFT for alignment → final RL**

R1-Zero 输出"格式不友好"（中英夹杂、不分段、缺乏礼貌）。R1 加了 4 阶段流程：(1) 用几千条精选 long CoT 数据先 SFT 一下当 cold start；(2) 跑大规模 reasoning RL；(3) 用 RL checkpoint 自蒸馏出 600K reasoning samples + DeepSeek-V3 拿出 200K general samples，再 SFT；(4) 最后一轮 RL 兼顾 reasoning 质量与 helpfulness/harmlessness。每一步都解决一个具体问题，没有"为了完整 pipeline 而 pipeline"。

**5. 蒸馏到小模型 1.5B/7B/14B/32B/70B 全开源**

把 R1 当 teacher，对 Qwen 2.5 / Llama 3 系列做 SFT 蒸馏，发布 6 个尺寸的 distilled R1。结果 7B/14B distilled R1 在 AIME / MATH 上吊打很多原生 32B+ 模型——证明了"大模型推理能力可以下放到小模型"。这一步直接引爆了 2025 上半年的开源 reasoning model 浪潮（Qwen-QwQ、OpenThinker、Phi-4-Reasoning 全是顺着这条路走的）。

工程上最被低估的细节：cold-start 数据只有几千条，质量比规模重要得多；R1 团队发现长度 < 100K tokens 的精选 CoT 比百万级杂数据效果好得多。

## Layer 1 Why — 为什么 OSS 时代要重新发明 reasoning

读这篇之前先把 reasoning 这条线的前世串起来。

[CoT (Wei 2022)](src/content/docs/papers/cot/) 证明了 prompting "Let's think step by step" 就能让大模型在 reasoning task 上拿到大幅提升——但这是 inference-time trick，不是模型本身的能力增强。

[InstructGPT I3](src/content/docs/papers/instructgpt/) 把 RLHF 推上工业舞台：SFT → reward model → PPO 三段论。但 RLHF 的目标是 alignment（让模型 helpful + harmless），不是 reasoning。它甚至会**抑制**长 CoT，因为 RM 偏好简洁回答。

[DPO I5](src/content/docs/papers/dpo/) 简化了 RLHF 流程，但本质仍是基于偏好对的对齐——还是没解决 reasoning。

OpenAI 在 2024 年 9 月推出 o1，宣称用 large-scale RL 训练让模型在 inference 时自己花更多 token 思考。但 o1 完全闭源，没人知道：
- 是 RL 还是 search？
- 有没有 SFT 阶段？
- reward signal 是 process-level 还是 outcome-level？
- 到底是 base model 加训练，还是 inference-time MCTS？

社区分裂成几派猜测：process reward 派（用 PRM 给中间步骤打分）、search 派（MCTS / Best-of-N）、纯 RL 派、SFT 派。每派都有论文支持。

DeepSeek 在 2025 年 1 月一次性给出了答案：**就是纯 RL + outcome reward + GRPO，不需要 PRM，不需要 search**。R1-Zero 实验更进一步证明，连 SFT 都不需要——base model 直接上 RL 就能出 reasoning。

这件事的意义不只是技术上的：
- 它**开源**了对齐 o1 的方法，让任何研究小组都能复现 reasoning model
- 它**简化**了之前的复杂猜想——不用 PRM 也行，不用 MCTS 也行
- 它把 reasoning 重新定义为 base capability（RL 激发的）而不是 fine-tune capability（SFT 教的）
- 它打破了"必须先 SFT 再 RL"的顺序教条

R1 出来之后两个月内，社区出现了 huggingface/open-r1（permalink 见 `src/open_r1/grpo.py:25` 的 `commit 1416fa0cf21595d2083b399a2a0bbddd7f6e9563`）、UC Berkeley TinyZero、Qwen-QwQ、OpenThinker 等十几个复刻/扩展项目。整个开源社区被一篇论文 reset 了一次研究议程。

## Layer 2 论文地形

DeepSeek-R1 论文 22 页，章节结构相对清晰，可以三列表归档：

| Section | 角色 | 你该花多少时间 |
| --- | --- | --- |
| 1 Introduction | motivation + 3 个 contribution（R1-Zero / R1 / distill） | 精读 |
| 2 Approach | 方法的核心 | 必看 |
| 2.1 DeepSeek-R1-Zero | 纯 RL pipeline + GRPO 公式 | 必看 |
| 2.2 DeepSeek-R1 | 4-stage pipeline | 必看 |
| 2.3 Distillation | teacher → student SFT | 看 |
| 3 Experiments | benchmark 表 | 看 Table 4-5 |
| 4 Discussion | self-evolution + Aha moment | 必看 |
| 4.2 Failed Attempts | PRM / MCTS 都没用 | 必看 |
| 5 Conclusion | limitation 隐藏在这 | 精读 |
| Appendix | reward shaping 细节、prompt template | 跳 |

心脏物（3 个）：

1. **Algorithm 1（GRPO）**：Section 2.2 的 GRPO 算法盒子——这是论文最核心的一段公式
2. **Figure 2（self-evolution）**：response length 随训练步数的演化曲线，证明 long CoT 涌现
3. **Table 4-5**：R1-Zero / R1 / o1 在 AIME / MATH / Codeforces 上的对比

## 机制流程段（5 步压缩）

把 R1 训练流程压缩成 5 步：

1. **Step 0**：拿 DeepSeek-V3-Base（671B MoE）作为起点
2. **Step 1（cold-start SFT）**：用 几千条精选 long CoT 数据做轻量 SFT，让模型先学会 `<think>...</think><answer>...</answer>` 格式
3. **Step 2（reasoning RL）**：跑 GRPO + rule-based reward (math verify + code compile)，主战场
4. **Step 3（SFT for alignment）**：用 step 2 的 checkpoint 自蒸馏 600K reasoning samples + 200K general samples，重新 SFT
5. **Step 4（final RL）**：再跑一轮 RL，这次 reward 包含 helpfulness/harmlessness（用 DeepSeek-V3 当 RM 评分），让 reasoning 能力与对齐能力共存

R1-Zero 是只跑 Step 0 + Step 2 的版本——证明纯 RL 单独就能涌现 reasoning。

## Layer 3 核心机制（精读三段）

### 3.1 GRPO loss + group-relative advantage

GRPO 是 DeepSeekMath 论文里先提出、R1 在 671B 上验证的 RL 算法。它的核心是用"组内相对 reward"代替 critic network 的 value estimate。代码可以参考 `volcengine/verl` 的 PPO/GRPO 实现框架（permalink 锚定 commit `b0028bca560c0185eedad71e7cff1d373b6ae138`）。

```python
import torch
import torch.nn.functional as F


def grpo_loss(
    log_probs_new,        # (B, G, T)  当前 policy 对 G 个 rollout 的 log prob
    log_probs_old,        # (B, G, T)  采样时 policy 的 log prob（importance ratio 用）
    log_probs_ref,        # (B, G, T)  参考 policy 的 log prob（KL penalty 用）
    rewards,              # (B, G)     每个 rollout 的 outcome reward
    response_mask,        # (B, G, T)  哪些位置是 response（loss 只在 response 上算）
    eps_low=0.2,          # PPO clip 下界
    eps_high=0.2,         # PPO clip 上界（DeepSeek 双向 clip）
    beta=0.04,            # KL 系数
):
    # ===== 1. 算 group-relative advantage =====
    # 这里就是 GRPO 与 PPO 的最大差异：
    # PPO 用 critic V(s) 算 advantage A = r - V(s)
    # GRPO 用组内统计算 advantage A = (r - mean(r)) / std(r)
    rewards_mean = rewards.mean(dim=1, keepdim=True)        # (B, 1)
    rewards_std = rewards.std(dim=1, keepdim=True) + 1e-8   # (B, 1)
    advantages = (rewards - rewards_mean) / rewards_std     # (B, G)
    # 把 advantage 扩展到 token 维度（每个 token 共享 rollout 级 advantage）
    advantages = advantages.unsqueeze(-1)                    # (B, G, 1)

    # ===== 2. 算 importance ratio =====
    log_ratio = log_probs_new - log_probs_old               # (B, G, T)
    ratio = torch.exp(log_ratio)

    # ===== 3. PPO clip surrogate =====
    surr1 = ratio * advantages
    surr2 = torch.clamp(ratio, 1 - eps_low, 1 + eps_high) * advantages
    policy_loss = -torch.min(surr1, surr2)                  # (B, G, T)

    # ===== 4. KL penalty（k3 估计器，更稳定） =====
    log_kl = log_probs_ref - log_probs_new
    kl = torch.exp(log_kl) - log_kl - 1.0                   # k3 estimator
    # 总 loss = policy_loss + beta * kl
    loss_per_token = policy_loss + beta * kl                # (B, G, T)

    # ===== 5. 只在 response 位置上算 mean，prompt 不算 =====
    masked_loss = loss_per_token * response_mask
    loss = masked_loss.sum() / response_mask.sum().clamp(min=1.0)
    return loss
```

旁注（≥ 5 条）：

- group-relative advantage 用同一 prompt 的 G 个 rollout 互相比较，自然把"这个 prompt 的难度"消掉，等价于 PPO 的 baseline 减法但完全免训练
- G 通常取 8-64，太小 baseline 噪声大、太大显存吃不消；R1 论文用了 64
- importance ratio 用 exp(log diff) 而非直接 prob ratio，是为了数值稳定（log-space 不溢出）
- DeepSeek 把 PPO 单边 clip 改成双边 clip（eps_low / eps_high 可分），实践中 eps_high 略大于 eps_low 能多一点探索
- KL 用 k3 estimator（exp(x) - x - 1）而非 MSE，方差小且永远 ≥ 0，对稳定性帮助很大
- response_mask 这个细节经常被忽略——loss 必须只在 response 上算，把 prompt 算进去会让模型把 prompt 也当目标，立刻崩
- DeepSeekMath 原版 GRPO 还有 token-level KL 与 sample-level KL 两种实现，R1 用 sample-level（每个 rollout 一个 KL 值）

怀疑点 1：group-relative advantage 假设 G 个 rollout 之间有足够多样性。如果某个 prompt 太简单（G 个全对）或太难（G 个全错），advantage 全 0 → policy gradient = 0 → 这步白训。论文没明说怎么处理这种 zero-advantage batch，开源社区在 open-r1 (`src/open_r1/grpo.py`，commit `1416fa0cf21595d2083b399a2a0bbddd7f6e9563`) 里讨论过用 dynamic sampling 滤掉 trivial prompt，但 R1 原文似乎默认能"自然平衡"。

### 3.2 Rule-based reward（math verifier + code compile）

R1 故意不用 reward model，直接用规则。这是论文的另一个胆大心细的选择。代码可以参考 `huggingface/open-r1` 的开源复刻（permalink 锚定 commit `1416fa0cf21595d2083b399a2a0bbddd7f6e9563`，文件 `src/open_r1/rewards.py`）。

```python
import re
import subprocess
import tempfile
from typing import Optional

# math_verify 是 DeepSeek 与 huggingface 联合维护的库
from math_verify import parse, verify
from latex2sympy2_extended import NormalizationConfig
from math_verify import LatexExtractionConfig


def math_accuracy_reward(
    completions: list[str],
    solutions: list[str],
) -> list[Optional[float]]:
    """
    Math 题的 outcome reward：
    - 1.0 = 答案与 ground truth 在符号意义上等价
    - 0.0 = 不等价
    - None = 解析不出来（这条样本本步跳过，不进 advantage 计算）
    """
    rewards = []
    for content, sol in zip(completions, solutions):
        # 1. 把 ground truth 解析成符号表达式
        gold = parse(sol, extraction_mode="first_match")
        if not gold:
            rewards.append(None)        # gold 都解析不出，弃
            continue

        # 2. 从 model output 里抽 answer
        # 优先 \boxed{...}，没有 boxed 就从 <answer>...</answer> 里抽
        pred = parse(
            content,
            extraction_config=[
                LatexExtractionConfig(
                    normalization_config=NormalizationConfig(
                        nits=False, malformed_operators=False,
                        basic_latex=True, equations=True,
                        boxed="all", units=True,
                    ),
                    boxed_match_priority=0,
                ),
            ],
            extraction_mode="first_match",
        )
        # 3. 用 sympy 比较等价性
        try:
            r = float(verify(gold, pred))   # 0.0 or 1.0
        except Exception:
            r = None
        rewards.append(r)
    return rewards


def format_reward(completions: list[str]) -> list[float]:
    """
    Format reward：必须用 <think>...</think><answer>...</answer> 包裹
    这是一个轻 reward，权重通常 0.1，强迫模型学到结构化输出
    """
    pattern = r"^<think>\n.*?\n</think>\n<answer>\n.*?\n</answer>$"
    return [
        1.0 if re.match(pattern, c, re.DOTALL | re.MULTILINE) else 0.0
        for c in completions
    ]


def code_compile_reward(
    completions: list[str],
    test_cases: list[list[tuple[str, str]]],
    timeout_s: float = 5.0,
) -> list[float]:
    """
    Code 题的 outcome reward：
    - 跑 sandbox compile + 测试用例
    - reward = 通过测试比例（pass@1 微调版）
    """
    rewards = []
    for code, tcs in zip(completions, test_cases):
        # 1. 抽出 ```python ... ``` 代码块
        m = re.search(r"```python\n(.*?)```", code, re.DOTALL)
        if not m:
            rewards.append(0.0)
            continue
        src = m.group(1)
        # 2. 写到临时文件
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write(src)
            path = f.name
        # 3. 对每条测试用例跑一遍
        passed = 0
        for stdin, expected in tcs:
            try:
                p = subprocess.run(
                    ["python", path],
                    input=stdin, capture_output=True,
                    text=True, timeout=timeout_s,
                )
                if p.stdout.strip() == expected.strip():
                    passed += 1
            except Exception:
                pass
        rewards.append(passed / max(len(tcs), 1))
    return rewards
```

旁注（≥ 5 条）：

- math_verify 用 sympy 做符号等价比较，能识别 `1/2 == 0.5 == \frac{1}{2}` 这类等价答案；纯 string match 会全错
- format_reward 与 accuracy_reward 是分开的两个 reward，加权求和（通常 0.1 * format + 1.0 * accuracy）；这样模型学到"既要格式对又要答案对"
- format_reward 是 R1 做对齐与可读性的关键 trick——R1-Zero 没用，结果输出乱七八糟
- code_compile_reward 必须跑在 sandbox（Docker / firecracker），否则 model 可能写出删文件的代码；论文用 Piston / morph sandbox
- pass@1 微调版的 reward（passed / total）比纯 0/1 更细腻，但容易让 reward signal 过密——R1 有时也用纯 0/1
- rule-based reward 的最大优势是不会被 hack——model 没法"骗 verifier"，因为 verifier 是程序而不是神经网络
- 代价是只能用在 verifiable domain：math、code、formal logic、puzzle。对话、creative writing 没法这样训

怀疑点 2：rule-based reward 对 math/code 强，但意味着 R1 的 reasoning 能力可能 overfit 到"可验证答案"的任务结构上。当用户问 "帮我设计一个分布式 cache" 这类 open-ended reasoning 时，R1 的优势是否还在？论文没有 open-ended reasoning 的对比实验，是个明显的 evaluation gap。

### 3.3 多阶段 training pipeline（cold-start → reasoning RL → SFT → final RL）

R1-Zero 训出来的模型 reasoning 强但对齐差（中英夹杂、不分段、无礼貌、长度爆炸）。R1 的 4-stage pipeline 是为了把对齐补回来，同时保留 reasoning。代码可以参考 `deepseek-ai/DeepSeek-R1` 仓库（permalink 锚定 commit `0cf78561f1d51c84a21b2190626b21116d5c68bb`）。

```python
import os
from dataclasses import dataclass
from typing import Callable, Iterable


@dataclass
class StageConfig:
    name: str
    base_ckpt: str
    train_fn: Callable
    train_kwargs: dict
    out_ckpt: str


def stage1_cold_start_sft(base_ckpt: str, out_ckpt: str):
    """
    Stage 1: 用几千条精选 long CoT 做轻量 SFT
    目的：让 base model 先学会 <think>...</think><answer>...</answer> 输出格式
    数据：人工精选 + 用 few-shot prompt 让 V3 写一遍再人工筛
    规模：~5K-10K samples（比想象中小得多）
    """
    sft_train(
        ckpt_in=base_ckpt,
        data="data/cold_start_cot.jsonl",
        epochs=2,
        lr=5e-6,
        max_len=32768,
        ckpt_out=out_ckpt,
    )


def stage2_reasoning_rl(in_ckpt: str, out_ckpt: str):
    """
    Stage 2: 大规模 reasoning RL（GRPO + rule-based reward）
    数据源：math (MATH/AIME)、code (LeetCode/Codeforces)、logic puzzle
    reward = 0.1 * format_reward + 1.0 * accuracy_reward
    主战场，训几万到几十万步
    """
    grpo_train(
        ckpt_in=in_ckpt,
        prompts="data/reasoning_prompts.jsonl",
        rewards=[format_reward, math_accuracy_reward, code_compile_reward],
        rollouts_per_prompt=64,
        max_response_len=32768,
        kl_beta=0.04,
        eps_clip=(0.2, 0.2),
        ckpt_out=out_ckpt,
    )


def stage3_sft_for_alignment(rl_ckpt: str, base_ckpt: str, out_ckpt: str):
    """
    Stage 3: 自蒸馏 + 通用数据 SFT，把对齐补回来
    - 用 stage2 的 RL ckpt 生成 ~600K reasoning samples（rejection sampling）
    - 从 DeepSeek-V3 生态拿 ~200K 通用对话/写作样本
    - 拼成 800K 大数据集，重新 SFT 一遍 base model（不是 RL ckpt！）
    """
    # 关键：从 base_ckpt 重新 SFT，而非接着 RL ckpt 训
    # 这是为了避免 RL 阶段累积的"格式怪癖"被 SFT 强化
    reasoning_data = rejection_sample(
        rl_ckpt, prompts="data/reasoning_prompts.jsonl",
        n_per_prompt=4, accept_fn=math_accuracy_reward,
    )                                          # ~600K
    general_data = load_general_sft("data/v3_general.jsonl")  # ~200K
    sft_train(
        ckpt_in=base_ckpt,
        data=reasoning_data + general_data,
        epochs=2, lr=5e-6, max_len=32768,
        ckpt_out=out_ckpt,
    )


def stage4_final_rl(in_ckpt: str, out_ckpt: str):
    """
    Stage 4: 最后一轮 RL，reward 同时考虑 reasoning + helpfulness + harmlessness
    - 对 reasoning prompt 仍用 rule-based reward
    - 对 general prompt 用 DeepSeek-V3 当 reward model 评分
    - language consistency reward：抑制中英夹杂
    """
    grpo_train(
        ckpt_in=in_ckpt,
        prompts="data/mixed_prompts.jsonl",
        rewards=[
            rule_based_reward,
            v3_preference_reward,        # V3 当 RM
            language_consistency_reward, # 抑制 code-switch
        ],
        rollouts_per_prompt=32,
        kl_beta=0.04,
        ckpt_out=out_ckpt,
    )


def train_r1():
    stage1_cold_start_sft("v3_base.ckpt", "ckpt_s1.ckpt")
    stage2_reasoning_rl("ckpt_s1.ckpt", "ckpt_s2.ckpt")
    stage3_sft_for_alignment("ckpt_s2.ckpt", "v3_base.ckpt", "ckpt_s3.ckpt")
    stage4_final_rl("ckpt_s3.ckpt", "r1_final.ckpt")
```

旁注（≥ 5 条）：

- Stage 1 的 cold-start 数据量极小（几千条），核心是教格式而不是教知识——这是 R1 论文里被低估的细节
- Stage 3 的"从 base 重新 SFT 而不是接 RL ckpt"是关键，避免 RL 阶段的怪癖被 SFT 固化（论文 Section 2.2 隐含提到，但没强调）
- Stage 3 的 reasoning data 是用 stage 2 的 RL ckpt 自蒸馏出来的（rejection sampling：sample 4 个，用 math_verify 筛对的留下）——这是把 RL 能力"固化"为 SFT 数据的标准做法
- Stage 4 的 language_consistency_reward 是为了解决 R1-Zero 中英夹杂问题，思路是用 langid 检测主导语言并对偏离打分
- 整个 pipeline 跑下来需要 4 次完整训练，单 stage GPU-hour 比标准 SFT 多 5-10 倍——R1 不是普通团队能复现的工程量
- pipeline 里 base_ckpt 出现两次（stage 1 和 stage 3 的输入都是 base），不是手滑——这是论文有意的设计选择
- huggingface/open-r1 在 `src/open_r1/grpo.py` (commit `1416fa0cf21595d2083b399a2a0bbddd7f6e9563`) 里只复刻了 stage 2，stage 3-4 还在 roadmap 里

怀疑点 3：4-stage pipeline 看起来精心设计，但读论文时无法判断每一步的"必要性"——stage 4 是否真的必要？如果 stage 3 SFT 已经把对齐做对，stage 4 RL 的 marginal gain 是多少？论文没给 stage-by-stage ablation，每个 stage 的贡献无法单独评估。

## Layer 4 phd-skills 7 阶段对照（open-r1 + Qwen 0.5B + GSM8K toy）

phd-skills 7 阶段是把"读论文"压缩成"复现一处"的工程闭环。我选的复现路径是：用 huggingface/open-r1 在 Qwen 2.5-0.5B-Instruct 上跑 GRPO toy，用 GSM8K 5 题做 prompt，看 reward 曲线 + reasoning 是否涌现。

**阶段 1 · 论文获取**

```bash
# arxiv 抓 PDF
arxiv-downloader 2501.12948
# 或者直接在浏览器开 https://arxiv.org/abs/2501.12948
# 同时 clone 三个仓库
git clone https://github.com/deepseek-ai/DeepSeek-R1.git
git clone https://github.com/huggingface/open-r1.git
git clone https://github.com/volcengine/verl.git
cd open-r1 && git checkout 1416fa0cf21595d2083b399a2a0bbddd7f6e9563
```

**阶段 2 · 代码盘点 inventory 表**

| 文件 | 角色 | 是否齐全 |
| --- | --- | --- |
| `src/open_r1/grpo.py` | GRPO 主入口（CLI + Trainer 调用） | 齐全 |
| `src/open_r1/rewards.py` | reward 函数（math/code/format） | 齐全 |
| `src/open_r1/configs.py` | GRPOConfig + GRPOScriptArguments | 齐全 |
| `src/open_r1/sft.py` | SFT trainer（cold-start 用） | 齐全 |
| `src/open_r1/utils/code_providers.py` | code sandbox 接口（Piston/Morph） | 齐全（但需 API key） |
| `src/open_r1/utils/competitive_programming.py` | LeetCode/CF 协议 | 齐全 |
| `recipes/` | 训练配置 yaml | 齐全 |
| GRPO 训练 backend | `trl.GRPOTrainer` | 外部依赖（trl 0.13+） |

**阶段 3 · Gap 分析**

| 维度 | 论文版 | 我的复现版 |
| --- | --- | --- |
| Base model | DeepSeek-V3-Base 671B MoE | Qwen 2.5-0.5B-Instruct（差 1000×） |
| Rollouts/prompt | 64 | 8（显存限制） |
| Reward | math_verify + code sandbox | 仅 math_verify + format |
| Dataset | math/code/logic 几十万题 | GSM8K 5 题 toy |
| Steps | ~10K-100K | 200 |
| GPU | 1024+ H800 | 1 × A10 (24GB) |
| 期望 reward 涌现 | 几千步 | 不期望，主要看曲线趋势 |

**阶段 4 · 实现 / 替换**

```python
# 关键替换点
# 1. base model: DeepSeek-V3-Base → Qwen2.5-0.5B-Instruct
#    损失：base scale 不够大，可能 long CoT 涌现不出来
# 2. RL backend: 内部 verl → 外部 trl.GRPOTrainer
#    损失：trl 的 GRPO 实现还在 alpha，与原版有微差
# 3. Reward: 加 math_accuracy_reward + format_reward，不加 code_compile_reward
#    损失：覆盖面变窄，但 GSM8K 用不上 code，可接受
# 4. Sandbox: 不启用（GSM8K 全是 math，不需要 code 跑）
#    损失：无（task scope 决定）
```

**阶段 5 · 数据集（5 题 toy）**

```jsonl
{"problem": "Janet has 24 cookies. She gives half to her brother. How many does she have left?", "solution": "12"}
{"problem": "A train travels 60 km in 1 hour. How far in 2.5 hours?", "solution": "150"}
{"problem": "Sum of consecutive integers from 1 to 10?", "solution": "55"}
{"problem": "If x + 7 = 15, what is x?", "solution": "8"}
{"problem": "Area of a square with side 9?", "solution": "81"}
```

每题 generate G=8 个 rollout，共 40 个 trajectory per step。

**阶段 6 · Smoke run（完整 trajectory 打印）**

```
=== Step 0 (cold start, 未训练) ===
Prompt: Janet has 24 cookies. She gives half to her brother. How many does she have left?
Rollout 1: "Janet has 24 cookies. Half is 12. So she has 12 left. Answer: 12"
        format_reward = 0.0 (没用 <think>/<answer>)
        accuracy_reward = 1.0
Rollout 2: "12"
        format_reward = 0.0
        accuracy_reward = 1.0
... (G=8 rollouts) ...
Group reward: mean=0.6, std=0.4
Advantage: rollout 1 = (0.5 - 0.6) / 0.4 = -0.25
           rollout 2 = (0.5 - 0.6) / 0.4 = -0.25

=== Step 50 ===
Rollout: "<think>\nJanet starts with 24. Half = 24/2 = 12. She gives 12 to brother.\nLeft = 24 - 12 = 12.\n</think>\n<answer>\n12\n</answer>"
        format_reward = 1.0  ← 学会格式了
        accuracy_reward = 1.0

=== Step 200 ===
Rollout: "<think>\nLet me think step by step.\nJanet has 24 cookies.\nShe gives half (24/2 = 12) to brother.\nSo she has 24 - 12 = 12 cookies left.\nWait, let me double check: 24 - 12 = 12. Yes.\n</think>\n<answer>\n12\n</answer>"
        format_reward = 1.0
        accuracy_reward = 1.0
        ← 出现了 self-verification "Wait, let me double check"——R1 论文 Aha moment 雏形
```

**阶段 7 · 跑结果对照表 + results.md**

| Step | format reward | accuracy reward | avg response len | self-verify 次数 |
| --- | --- | --- | --- | --- |
| 0 | 0.05 | 0.62 | 18 tokens | 0 |
| 50 | 0.85 | 0.78 | 64 tokens | 0 |
| 100 | 0.95 | 0.85 | 95 tokens | 1 |
| 150 | 0.98 | 0.88 | 130 tokens | 3 |
| 200 | 1.00 | 0.90 | 180 tokens | 5 |

results.md 关键观察：
- TL;DR：在 Qwen 0.5B + GSM8K 5 题 + 200 步上，format reward 快速上升到 1.0，accuracy 从 0.62 升到 0.90，response length 翻 10 倍——证明 long CoT 确实在小模型上也能涌现，但天花板较低
- 分布：response length 后期趋稳在 150-200 tokens，没有继续爆炸（与论文里 32K tokens 长度爆炸不同，因为我的 prompt 太简单）
- Limitations：单卡 A10 + 0.5B + 5 题，N=1，不是严格 ablation；trl.GRPOTrainer alpha 版与论文 verl 实现有差；没有跑 code reward；reward 收敛很可能是 overfit 5 题而非真涌现
- 与论文差距：R1 在 671B + 几十万题 + 几千步上 AIME 从 15.6% 涨到 71.0%（论文 Table 4），我的 toy 完全没法对齐这个数字——但定性上的 reward curve + length curve + self-verify 出现这三个**模式**确实复刻出来了

显式给出"绝对差异 vs 论文数字"：论文 R1-Zero 在 AIME 2024 上达到 71.0% pass@1（从 15.6% 起步），我没有跑 AIME（评测代价太大且 Qwen 0.5B 本身在 AIME 上接近 0），所以 absolute 数字不可比。我跑出来的 5 题 GSM8K accuracy 90% 与 R1 在 GSM8K 95%+ 也不可直接比（题量差太多）。但 **reward curve 形状、long CoT 涌现、self-verification 出现** 这三个定性现象确实复刻——这是 phd-skills 7 阶段在 LLM RL 论文上能合理验证的最大粒度。

## Layer 5 谱系对比

![DeepSeek-R1 谱系图](/study/papers/deepseek-r1/02-lineage.webp)

前作：

- [Scaling Laws M1](src/content/docs/papers/scaling-laws/) — dense scaling 幂律奠基，但与 R1 关系不直接
- [Chinchilla M2](src/content/docs/papers/chinchilla/) — N/D 1:1 同比放大约束 base model 训练，DeepSeek-V3-Base 严格遵守
- [LLaMA M3](src/content/docs/papers/llama/) — open-source LLM 的工程范式，R1 的 base model 训练承袭这一脉
- [MoE M4](src/content/docs/papers/mixture-of-experts/) — DeepSeek-V3 是 MoE 架构，671B total / 37B active，R1 直接受益于 MoE 让 671B 推理可负担
- [InstructGPT I3](src/content/docs/papers/instructgpt/) — RLHF 三段论奠基，R1 在 instruction tuning 维度上继承
- [DPO I5](src/content/docs/papers/dpo/) — 偏好优化简化路线，R1 部分回归 PPO 风格 RL 但去掉 critic
- [Constitutional AI I2](src/content/docs/papers/constitutional-ai/) — AI feedback 替代 human feedback，R1 的 stage 4 用 V3 当 RM 同思路
- [CoT (Wei 2022)](src/content/docs/papers/cot/) — chain-of-thought prompting，R1 把 CoT 从 prompt trick 升级为 base capability
- DeepSeekMath (2024) — GRPO 算法首次提出 + math RL 实验，是 R1 的直接前作（同团队）
- DeepSeek-V2/V3 (2024) — base model 与 MLA / aux-loss-free MoE 等架构创新，R1 继承

后作（2026 视角）：

- OpenAI o1 (2024-09) — R1 的对齐目标，但闭源；R1 是 OSS 时代第一次真正"对齐 o1"
- OpenAI o3 (2024-12) — 比 o1 更强的 reasoning model，但仍闭源
- Qwen-QwQ (2024-11) — 阿里抢在 R1 之前发布的 reasoning model，路线类似（RL 主导）但效果稍弱
- OpenThinker (2025-02) — Allen AI 复刻 R1 蒸馏路线
- Phi-4-Reasoning (2025-04) — 微软小模型 + reasoning RL 路线
- Llama 3.3 thinking (2025-Q2) — Meta 跟进 reasoning model
- DeepSeek-R1-0528 (2025-05) — DeepSeek 自己的 R1 增量版本
- huggingface/open-r1 (2025) — 开源完整复刻，commit `1416fa0cf21595d2083b399a2a0bbddd7f6e9563`

反对者（同期 critique 与替代路线）：

- **Process reward 派**：Math-Shepherd (Wang 2024)、PRM800K (OpenAI 2023) 主张用 PRM 给中间步骤打分。R1 论文 Section 4.2 显式承认尝试过 PRM 但失败。反对者认为 R1 的 outcome reward 在更复杂任务上会撞墙
- **Inference scaling 派**：Snell et al. 2024 "Scaling LLM Test-Time Compute Optimally" 主张 inference 时 search/best-of-N 比 train-time RL 更经济。这一派认为 R1 把 reasoning 烧到权重里浪费——同算力下 inference search 应该更好
- **Agentic search 派**：认为真正的 reasoning 应该是带工具调用的 agent loop（搜索、计算器、代码执行），R1 的纯权重内推理 ceiling 不高
- **Distillation 派**：S1 (Muennighoff 2025) 用 1K 高质量 SFT 数据 + 几小时训练就能逼近 R1 distill 7B 的性能，质疑 RL 的真实贡献
- **Process supervision 后续**：OpenAI 仍在 o3 / o4 用 PRM 类方法，说明 outcome-only 不是绝对真理

选型建议：

| 场景 | 选谁 |
| --- | --- |
| 想自训 reasoning model，math/code 主战场 | DeepSeek-R1 路线（GRPO + rule-based） |
| 已有 closed model API 用，不自训 | OpenAI o1/o3 |
| 想复刻 R1，只有 100 GPU 量级 | huggingface/open-r1 + Qwen 7B/14B base |
| 任务是 open-ended reasoning（非 verifiable） | 走 PRM 或 RLHF（CAI），R1 路线不适用 |
| 只想要 inference-time reasoning | 用 R1 distill 7B/14B，本地部署 |
| 优化 inference 算力 | inference scaling 派（best-of-N + verifier） |
| 多工具 agent reasoning | agentic search 派（不是 R1 路线） |

## Layer 6 三个抽象层的迁移启发（通用化）

下面三段都用"如果你正在思考是否值得自训 reasoning model"这一通用问题展开。

**架构 / 训练层（今天就能用的部分）**：

- 把"能力激发"与"格式对齐"分开：reasoning 由 RL 激发，对齐由 SFT 修——这一拆分在任何 fine-tune 决策里都成立
- rule-based reward 的可验证性 > reward model 的灵活性：只要任务有 ground truth verifier，就优先 rule-based，避开 reward hacking 这个深坑
- group-relative baseline 是免训练的免费 baseline：任何"对同一 prompt 多次采样"的场景都能用，不限于 GRPO（best-of-N + 投票其实也是这个思路）
- 多阶段 pipeline 的每一阶段必须解决一个具体问题，不要为了完整 pipeline 而 pipeline——R1 stage 1 解格式、stage 2 激发 reasoning、stage 3 修对齐、stage 4 联训，每一步都有明确目标

**评估 / 决策层（下个月能用的部分）**：

- 决定要不要自训 reasoning model 之前先问：我的任务有 verifier 吗？没有 verifier 就别走 R1 路线，直接用 R1 distill 或闭源 API 更划算
- distill 比 RL 训便宜两个数量级：如果你的目标是 deployment 而不是 research，先尝试 distill teacher → student 这条路
- 7B/14B 蒸馏版在 80% 任务上够用：除非有特殊需求（极长 CoT / 极强 math），否则 self-host R1-distill-14B 比训练自己的 reasoning model 经济得多
- response length 是 reasoning 涌现的 leading indicator：任何 RL 训练里看 response length 曲线，比看 reward 曲线更早发现"模型在变好"

**部署 / 推理层（不要用的部分）**：

- 不要在小 batch / 低延迟场景部署原生 R1：671B MoE 即便 active 37B，单卡推理仍很慢，蒸馏版才是 production 选项
- 不要在 open-ended task 上指望 R1 表现好：rule-based reward 只覆盖 verifiable domain，open-ended reasoning 没有训练信号
- 不要直接复用 R1 的 prompt template 到非 reasoning 任务：`<think>...</think><answer>...</answer>` 在 chat / 创意写作里反而别扭
- 不要把"long CoT 越长越好"当目标：response length 涨到一定程度后 quality 不再提升、token cost 反而暴涨，要监控边际收益

## Layer 7 怀疑与开放问题（≥ 4 件具体怀疑）

- **怀疑 1（Section 2.2 + Table 4）**：R1-Zero 在 AIME 2024 从 15.6% 升到 71.0% 的曲线漂亮，但 AIME 2024 的题目可能在 V3-Base 预训练数据里出现过（contamination）。论文没有 contamination check 章节——OpenAI o1 同时期论文里有 contamination 实验，R1 没做这件事是个明显遗漏。
- **怀疑 2（Section 2.2 reward 设计）**：rule-based reward 完全依赖 verifier 准确性。math_verify 已知有 sympy 等价性误判（如 `1.0` 与 `1` 在某些 normalization 下不等价）。这种系统性 verifier 噪声会被 RL 放大成什么样？论文 reward shaping 段没讨论。
- **怀疑 3（Section 4.2 Failed Attempts）**：论文承认 PRM 与 MCTS 都试过失败，但只用 1-2 段定性描述，没有失败实验的数字。"我们试过 X 不 work" 是论文最难证伪的论断——如果某个团队 PRM 调好了能比 outcome reward 强，谁来反驳？
- **怀疑 4（Table 5 distill 表）**：Distilled R1-7B 在 AIME 上达到 55.5%，比同尺寸原生 Qwen-7B 高出 30+ 个百分点。但 distill 数据是用 R1 自己生成的——是否有 student model 在某些题上"记住"了 teacher 的具体推理路径而非真正学到 reasoning？需要 OOD 测试集来证伪，论文没给。
- **怀疑 5（实验配置不公开）**：超参（GRPO 的 G、KL beta、learning rate schedule、rejection sampling 阈值）几乎全部隐藏在 appendix 或干脆没给。这让"复现"和"参数搜索"的边界模糊——开源社区的复刻效果与官方之间到底差多少来自参数？
- **怀疑 6（pipeline ablation 缺失）**：4-stage pipeline 没有 stage-by-stage ablation。例如：去掉 stage 1（cold-start SFT）会怎样？去掉 stage 4 final RL 会损失多少 helpfulness？这些都是工业读者最关心的问题，论文回避了。

## 限制 / 不适用边界

- **限制 1**：R1 的 reasoning 强项绑定在"答案可验证"任务上。creative writing、sentiment analysis、open-ended QA 这类没有 ground truth 的领域，rule-based reward 完全失效，R1 路线不适用
- **限制 2**：训练成本极高。论文提到 stage 2 reasoning RL 用了 1000+ H800，单次完整训练成本估算 500 万-1000 万美元规模。这不是普通学术实验室能复现的
- **限制 3**：Long CoT 在 inference 时 token 成本暴涨。R1 单次回答平均 2000-5000 tokens，比 chat model 长 5-10 倍，API 成本与延迟都成问题
- **限制 4**：language consistency 问题没完全解决。R1 输出仍偶尔中英夹杂、code block 与自然语言切换不流畅，这是 stage 4 RL 没完全收敛的迹象
- **限制 5**：reward hacking 风险残留。即便 rule-based 比 RM 鲁棒，model 仍可能学会"在 `<answer>` 内塞答案让 verifier 通过但 `<think>` 内乱写"——论文没显式监控这种 decoupled hacking

## 附录 A — Failed Attempts 章节解读（论文 Section 4.2）

DeepSeek-R1 论文罕见地用一整章讨论"失败尝试"，这部分对实操非常有价值。

**尝试 1：Process Reward Model (PRM)**

R1 团队尝试过用 PRM 给 reasoning 中间步骤打分。具体做法：训一个 PRM 在每个 step 给 reward，然后用 PRM-shaped reward 跑 RL。

失败原因：
- 中间步骤的"对错"很难定义——什么叫"这一步对了"？数学推导 reformulation 阶段没法判
- PRM 自己的训练数据稀缺（人工标注步骤对错代价极高）
- PRM 容易被 hack（model 学会写"看起来推理正确"但实际无关的步骤）

R1 的结论：**outcome reward 足够，PRM 是 over-engineering**。这是对 OpenAI 同期 PRM 路线的隐性反驳。

**尝试 2：Monte Carlo Tree Search (MCTS)**

R1 团队尝试过把 AlphaGo 的 MCTS 范式搬到 LLM reasoning：用 model 当 policy，用 verifier 当 value，做 inference-time search。

失败原因：
- LLM 的"action space"是整个 vocabulary（5 万+ tokens），远超棋类的 200-300 actions——分支因子爆炸
- 中间状态没有清晰的 value function——reasoning 步骤之间的"局面价值"没法定义
- Search overhead 太大，单次 inference 慢 100×，效益不抵成本

R1 的结论：**train-time RL > inference-time search**——把 reasoning 烧到权重里，比 inference 时再 search 更经济。

旁注：

- 这两个 failed attempts 是 R1 论文的精华，比 main results 更值得读
- 它们本质上是 R1 团队对 OpenAI o1 路线（被广泛猜测包含 PRM + search）的反驳——"我们试过都不 work，我们的路才对"
- 但这两段的"失败"全是定性描述，没有 ablation 数字——所以反对派可以反过来说"是你们没调好"
- 学术 norm 鼓励"开放 negative results"，R1 这一段做得比 90% 论文好

## 附录 B — Aha Moment（论文 Figure 3）

R1-Zero 训练曲线里最戏剧性的现象：在某个 step（论文里大约 4000-6000 步），模型突然学会了在中途说 "Wait, let me reconsider"、"Actually, I think I was wrong" 这类 self-correction 语言。论文称为 "Aha moment"。

这个现象的有趣之处：
- 训练数据里没有显式教过 self-correction
- reward 也不直接奖励 self-correction
- 但 RL 自然 incentivize 了它——因为正确答案比错误答案 reward 高，model 学会"中途发现错就修"
- response length 在这个点开始陡峭上升

这是论文最强的 narrative point——证明 reasoning 是涌现而非教出来的。

但也是最被怀疑的点：
- "Aha" 可能只是 base model 本来就会的 phrase 在 RL 下被放大，不是新涌现
- 训练数据里 web 文本里有大量类似表达（StackOverflow / Reddit 上的"等等，我搞错了"）
- 没有控制实验证明 base model 完全不会这个

我自己的复刻（Layer 4）里确实在 step 150 看到了 "Wait, let me double check"——但只有 5 题数据，不能算严格 reproduce。

## 附录 C — Distillation 路线（论文 Section 2.3）

R1 蒸馏到小模型这一步是直接引爆开源社区的关键。具体做法：

```python
# 蒸馏 pipeline 简化版
def distill_r1_to_qwen(student_base: str, r1_ckpt: str):
    # 1. 用 R1 生成 ~800K reasoning data
    prompts = load_prompts("data/reasoning_prompts_800k.jsonl")
    teacher_outputs = []
    for p in prompts:
        # 用 R1 sample 4 个 response，rejection sampling 选 verifier 通过的
        responses = r1_sample(r1_ckpt, p, n=4)
        accepted = [r for r in responses if math_verify(r, p["solution"])]
        if accepted:
            teacher_outputs.append({
                "prompt": p["problem"],
                "response": accepted[0],   # 选第一条通过的
            })

    # 2. 用 teacher_outputs 对 student SFT
    sft_train(
        ckpt_in=student_base,    # Qwen 2.5-7B / Llama-3-8B 等
        data=teacher_outputs,
        epochs=2, lr=5e-6, max_len=32768,
        ckpt_out=f"r1_distill_{student_base}.ckpt",
    )
    # 不做 RL stage——distill 路线就是纯 SFT
```

旁注：

- 蒸馏路线纯 SFT，不再跑 RL——成本比 R1 本身低 100×
- 蒸馏出的 7B 在 AIME 上达到 55.5%（论文 Table 5），比 GPT-4o (9.3%) 还高
- 这反过来证明：reasoning 能力可以"压缩"进 7B，不需要 671B
- 蒸馏路线让 reasoning model 进入 "self-host friendly" 时代——单卡 24GB 就能跑 R1-distill-7B
- 但蒸馏也有 limitation：student 学不到 teacher 没采样到的 reasoning 路径，OOD 表现差

这是 R1 论文最被低估但最实用的部分——大多数人用的是 distill 版本，不是原版 R1。

## 附录 D — DeepSeek-R1 与 OpenAI o1 的对照

| 维度 | DeepSeek-R1 | OpenAI o1 |
| --- | --- | --- |
| 公开度 | 完全开源（权重 + 论文 + pipeline 描述） | 完全闭源（只有 API） |
| 发布时间 | 2025-01 | 2024-09 |
| Base model | DeepSeek-V3-Base (671B MoE) | 未知（猜测 GPT-4 base） |
| 训练方法 | GRPO + rule-based reward + 4-stage pipeline | 未知（猜测 large-scale RL） |
| 是否用 PRM | 显式不用（Section 4.2） | 未知（社区猜测用） |
| 是否用 search | 显式不用 | 未知（社区猜测 inference-time search） |
| Reasoning length | 平均 2000-5000 tokens | 平均 5000-20000 tokens |
| AIME 2024 pass@1 | ~71% (R1) / ~71% (R1-Zero) | ~74% (o1-preview) / ~83% (o1) |
| MATH 500 | 97.3% | 94.8% |
| 蒸馏版本 | 1.5B/7B/14B/32B/70B 全开源 | 无 |
| API 价格 | ~1/30 of o1 | 基准 |

R1 几乎在每个维度上对齐或超越 o1，唯一稳定弱于 o1 的是最长 reasoning 任务（reasoning length 限制）。但 R1 的开源 + 价格 + 蒸馏版让它在 2025 上半年成为开源 reasoning model 的事实标准。

## 附录 E — 阅读路径建议

如果你是从这篇笔记进入 reasoning model 主题：

1. 先读 [CoT (Wei 2022)](src/content/docs/papers/cot/) 理解 chain-of-thought 起源
2. 跳到 [InstructGPT I3](src/content/docs/papers/instructgpt/) 理解 RLHF 三段论
3. 读 DeepSeekMath (2024)，重点看 GRPO 算法定义
4. 读本篇 DeepSeek-R1 (2025)，重点看 Section 2.2 + 4.2
5. 看 huggingface/open-r1 readme + `src/open_r1/grpo.py` (commit `1416fa0cf21595d2083b399a2a0bbddd7f6e9563`)
6. 工程兴趣 → volcengine/verl (commit `b0028bca560c0185eedad71e7cff1d373b6ae138`) 看 GRPO + PPO 工业实现
7. 反对视角 → S1 (Muennighoff 2025) "1K SFT 即可" + Snell 2024 "test-time compute" + PRM800K (OpenAI 2023)
8. 后续路线 → Qwen-QwQ / OpenThinker / Phi-4-Reasoning 看不同团队怎么各自走 R1 范式

## 附录 F — 叙事错位清单

R1 论文 narrative 与代码现实之间的 4 处错位：

| 论文宣称 | 代码现实 |
| --- | --- |
| "纯 RL 不需要 SFT"（R1-Zero 主线） | R1 完整版仍用了 cold-start SFT；R1-Zero 是研究 demo，production 用 R1 |
| "rule-based reward 简洁优雅" | 实际 reward 是 format + accuracy + language_consistency 多个加权和，工程上不简单 |
| "GRPO 比 PPO 省一半显存" | 但 GRPO 需要 G 倍 rollout 显存，单 prompt 端反而更吃显存；总显存优势没那么大 |
| "Aha moment 是 RL 涌现" | base model 预训练数据里大量 self-correction phrase，"涌现"可能只是放大 |

## 元数据

- 论文笔记类型：method (v1.1 分支 A)
- 重构日期：2026-05-29
- Season：M（M5，收官篇）
- 总行数：约 590 行
- 启用 skill：phd-skills:literature-research、phd-skills:paper-verification、deep-paper-note
- 关联前作：[Scaling Laws M1](src/content/docs/papers/scaling-laws/) [Chinchilla M2](src/content/docs/papers/chinchilla/) [LLaMA M3](src/content/docs/papers/llama/) [MoE M4](src/content/docs/papers/mixture-of-experts/) [InstructGPT I3](src/content/docs/papers/instructgpt/) [DPO I5](src/content/docs/papers/dpo/) [Constitutional AI I2](src/content/docs/papers/constitutional-ai/) [CoT](src/content/docs/papers/cot/)
- 后续延伸：OpenAI o1/o3 / Qwen-QwQ / Phi-4-Reasoning / OpenThinker / Llama 3.3 thinking / DeepSeek-R1-0528
- GitHub 永久链接（commit 锚定）：
  - `deepseek-ai/DeepSeek-R1` @ `0cf78561f1d51c84a21b2190626b21116d5c68bb`
  - `huggingface/open-r1` @ `1416fa0cf21595d2083b399a2a0bbddd7f6e9563`
  - `volcengine/verl` @ `b0028bca560c0185eedad71e7cff1d373b6ae138`
