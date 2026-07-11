---
title: Reasoning with Sampling — 在关键决策点重采样推理过程
来源: 'Felix Zhou, Anay Mehrotra & Quanquan C. Liu, "Reasoning with Sampling: Cutting at Decision Points", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 中级
---

## 是什么

Reasoning with Sampling: Cutting at Decision Points 是一篇研究**不用重新训练模型，也能让基础模型更会推理**的论文。
日常类比：你写数学题时，真正决定成败的往往不是第 37 行算式，而是开头选了“代数法”还是“几何法”。

这篇论文说：如果一个推理回答已经写了一半，要重试，不要随便从任意字重新写。
更聪明的做法是回到“刚开始有很多路可选”的位置，再让模型重新续写。

它提出的算法叫 Entropy-Cut Metropolis-Hastings。
名字很长，但核心很朴素：用模型下一步预测的熵，找到推理里的关键岔路口，然后在这些地方切开并重采样。

## 为什么重要

不理解这篇论文，下面这些事会很难解释：

- 为什么“多采样几次”有时有效，有时只是把同一个错误换一种说法。
- 为什么低温采样不等于真正的“挑整体更可信的答案”。
- 为什么强化学习后的推理模型，可能只是把基础模型原本会的路径排得更靠前。
- 为什么推理时的关键资源不是 token 数，而是能否重新打开几个真正的决策点。

## 核心要点

1. **目标是完整回答，不是单个 token**。
   类比：评作文不是只看每个字顺不顺，而是看整篇文章是否可信。
   论文用 power distribution 把完整推理轨迹按基础模型概率重新加权，让高概率完整答案更容易被抽到。

2. **Metropolis-Hastings（MH）负责“抽难抽的分布”**。
   类比：你不知道整座城市每条路的总热度，但可以比较两条路线哪条更像常走路线；再掷一次骰子，决定要不要换成新路线。
   MH 的接受率只用概率比值，所以不用算那个指数级大的归一化常数。

3. **Entropy-Cut 只改“从哪里重写”**。
   类比：改作文时先改论点，不先改标点。
   论文保留原来的 MH 目标分布，只把随机切 token 改成更常切在熵突然升高的位置。

## 实践案例

### 案例 1：把完整回答按概率“变尖”

```python
def power_weight(trace_prob, alpha=4):
    return trace_prob ** alpha
```

**逐部分解释**：

- `trace_prob` 是模型给一整段推理轨迹的概率，不是某一个词的概率。
- `alpha` 越大（论文常用约 4），原本稍微更可信的完整轨迹会被放大得越明显。
- 真正难点是所有轨迹太多，不能直接枚举后归一化。

### 案例 2：从熵跳变处选切点

```python
def entropy_jump(prev_entropy, now_entropy):
    return max(0, now_entropy - prev_entropy)
```

**逐部分解释**：

- 熵高表示模型觉得下一步有多种合理选择。
- 只看“变高的那一下”，是为了抓住岔路开始的位置。
- 如果只看熵本身，可能会在一长段混乱推导里到处切，反而错过真正的入口。

### 案例 3：端到端重采样一步

```python
def entropy_cut_step(trace, alpha=4):
    cut = pick_entropy_jump(trace)          # 1. 找岔路口
    prefix, _ = trace[:cut], trace[cut:]
    proposal = resample_suffix(prefix)      # 2. 只重写后缀
    old_s, new_s = power_weight(p(trace), alpha), power_weight(p(proposal), alpha)
    if random() < min(1.0, new_s / old_s):  # 3. MH：掷骰子决定换不换
        return proposal
    return trace
```

**逐部分解释**：

- 真实接受率还会乘上提议分布和切点分布的校正项；这里只保留“新轨迹更尖就更容易留下”的直觉。
- 关键是 Entropy-Cut 改的是切点提议，不是偷偷换最终要采样的目标分布。
- 论文实验里这类 MH 步常跑约 10 次（`N_MCMC≈10`），用多次小重写换一条更稳的完整答案。

## 踩过的坑

1. **把低温采样当成 power sampling**：低温只局部压尖下一词分布，power distribution 压尖的是完整轨迹，所以两者可能选出完全不同的第一步。

2. **以为随机切 token 足够公平**：均匀切点公平对待每个 token，但推理里的每个 token 重要性并不公平，很多位置只是执行细节。

3. **把熵高理解成答案更差**：这里的高熵不是直接判错，而是提示“这里可能有多个方向”，适合回到此处重新试。

4. **忘了 MH 校正项**：只偏向高熵切点会改变提议分布，必须在接受率里校正，才能保持目标分布不变。

## 适用 vs 不适用场景

**适用**：

- 数学、代码、科学问答这类有长推理链的任务（论文覆盖 MATH500、HumanEval、GPQA、AIME26）。
- 想在推理时提升表现，但不想重新训练、标数据或训练 verifier；常用设定约 `α≈4`、`N_MCMC≈10`。
- 基础模型已经偶尔能做对，只是普通采样不稳定地抽不到好路径的场景。

**不适用**：

- 只需要一句短回答、几乎没有中间决策的任务。
- 基础模型完全不会做、正确轨迹概率几乎为零的任务。
- 对延迟极敏感、只能承受一次普通前向的线上服务（每次 MH 步都要再跑前向）。
- 需要工具调用、环境交互、多人协作状态的系统，除非额外设计切点和状态恢复方式。

## 历史小故事（可跳过）

- **1953 年**：Metropolis 等人提出用随机游走加接受/拒绝来抽复杂分布。
- **1970 年**：Hastings 把这个思路推广成更通用的 Metropolis-Hastings 框架。
- **2025 年前后**：推理模型的强化学习效果引出一个争论：模型是真的学会新推理，还是把原有好路径排到前面。
- **2026 年**：Karan 和 Du 用 power sampling 支持“基础模型本来更聪明”的视角，但均匀切点还不够高效。
- **2026 年**：这篇论文把切点改到熵跳变处，让采样更像“回到关键岔路重做选择”。

## 学到什么

- 推理采样的单位可以是完整轨迹，而不只是一个个 next token。
- 好的重试不是多写几遍，而是回到真正影响后续路径的地方。
- 熵可以当作便宜的决策点探针，因为它在模型遇到多种可行续写时会升高。
- 采样算法的优雅之处在于：提议可以更聪明，但目标分布仍由 MH 校正守住。
- 实验材料覆盖 MATH500、HumanEval、GPQA Diamond 和 AIME26，不只是在单一数学集上调参。
- 论文还检查了多样性：pass@k 没有明显崩掉，说明更高 pass@1 不是简单把所有样本压成同一个答案。

这让我把“推理时计算”看成两层：第一层是多花算力，第二层是把算力花在能改变路线的位置。
Entropy-Cut 的贡献主要在第二层。

## 延伸阅读

- 论文 PDF：[Zhou, Mehrotra & Liu 2026](https://arxiv.org/pdf/2605.30327v1.pdf)。
- 前置论文：[Reasoning with Sampling: Your Base Model is Smarter Than You Think](https://arxiv.org/abs/2510.14901v1)。
- 相关熵分支：[Entropy-Gated Branching for Efficient Test-Time Reasoning](https://arxiv.org/abs/2503.21961v3)。
- 相关熵观察：[Beyond the 80/20 Rule: High-Entropy Minority Tokens Drive Effective Reinforcement Learning for LLM Reasoning](https://arxiv.org/abs/2506.01939v2)。
- [[self-consistency-2022]] —— 也是推理时多采样，但主要靠最终答案投票。
- [[cot]] —— 这篇论文默认处理的是链式推理轨迹。

## 关联

- [[cot]] —— Entropy-Cut 要切开的对象就是 chain-of-thought 轨迹。
- [[self-consistency-2022]] —— self-consistency 多抽答案再投票，本文关注怎样更有效地抽。
- [[deepseek-r1]] —— 强化学习推理模型是本文讨论的背景之一。
- [[rlhf-christiano]] —— 都关心训练后模型行为如何被偏好或奖励重排。
- [[vllm]] —— 论文实验实现依赖高吞吐推理框架来跑多次采样。
- [[metropolis-hastings]] —— 合理预测会存在的采样算法笔记，本文的核心校正机制来自这里。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ppc-preplan]] —— PPC Preplan — 先想清楚题目类型再规划解法
- [[self-trained-verification]] —— Self-Trained Verification — 让模型先看标准答案学会挑错
