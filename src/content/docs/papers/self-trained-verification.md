---
title: Self-Trained Verification — 用「参考答案」教会模型当阅卷老师
来源: https://arxiv.org/abs/2605.30290
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 从日常类比开始：自己改作文，为什么总改不对？

你写完一篇数学证明，想自己检查有没有漏洞。常见两种结局：

1. **一眼觉得没问题**：推理链写得很顺、符号都对，但中间某步「悄悄用了一个不成立的引理」——自己很难发现，因为大脑会**补全**你认为合理的跳跃。
2. **对照标准答案再读一遍**：老师把参考答案放在旁边，你的任务从「独立解题」变成「**对照找茬**」——哪一步和参考路线不一致、哪个边界条件漏了，往往一眼就露馅。

大语言模型（LLM）做推理时面临同样困境。**验证-精炼循环（Verification-Refinement, V-R）** 很像「写一版 → 阅卷老师批注 → 按批注重写」：生成器 \(G\) 出答案，验证器 \(V\) 给判决（accept/reject）和自然语言反馈，\(G\) 再改。这在 IMO 级难题、前沿数学推理里已是主流范式。

但瓶颈始终在 **验证器**：

- 分数越打越高，**准确率却不涨**（reward hacking / 分数膨胀）；
- 反馈太泛：「你的解法似乎不对」——生成器不知道改哪；
- 自训练时把**错误样本**混进训练集，越训越歪。

论文 **Self-Trained Verification for Training- and Test-Time Self-Improvement**（Chen Henry Wu, Aditi Raghunathan；arXiv [2605.30290](https://arxiv.org/abs/2605.30290)）的核心洞察是：

> 模型**单独**很难给自家错误解法写诊断；但**同时看到参考答案**时，找逻辑漏洞容易得多。把这一「特权信息不对称」蒸馏成监督，就能训出**测试时不需要参考答案**的验证器。

方法叫 **STV（Self-Trained Verification）**；进一步用 STV 验证器在训练里带着生成器做 V-R，叫 **ViL（Verifier-in-the-Loop Training）**。

一句话：**不是让模型更会做题，而是让模型更会「对照标准答案找错」，再把这项能力内化。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | *Self-Trained Verification for Training- and Test-Time Self-Improvement* |
| 作者 | Chen Henry Wu, Aditi Raghunathan（CMU 等） |
| 日期 | 2026-05-28 |
| 官网 | [ar-forum.github.io/stv-webpage](https://ar-forum.github.io/stv-webpage) |
| 基座模型 | 主实验 Qwen3-8B（生成器与验证器可同模不同 prompt） |
| 训练数据 | DAPO 难题（Hard / Hardest）、SciKnowEval 科学推理 |
| 核心方法 | STV（验证器自蒸馏）+ ViL（生成器环内 RL） |
| 对比基线 | 无训练、Verdict-RL、Meta-verifier RL、SFT、prefix-conditioning、延长 RLVR |

---

## 为什么重要

### 1. 测试时与训练时自改进，卡在同一个瓶颈

| 场景 | 做法 | 验证器差时的症状 |
|------|------|------------------|
| **测试时** | V-R 多轮精炼 | 多算力 ≠ 更高正确率；接受率涨、精度不涨 |
| **训练时** | 自训练 / RLVR | 坏样本入库；RL 收敛后再加算力无收益 |

STV 同时改善两端：Hard 数学上最终轮 pass@1 约 **2×**；SciKnowEval Hardest 从 **1.5% → 21.0%**（约 **14×**）。

### 2. 「小验证器 + 强 STV」可替代「大生成器裸跑」

STV 引导的 8B 在 Hardest 上 **5.5%**，超过无验证的 **Qwen3-32B（2.7%）**；科学推理上 8B+STV 甚至超过 **Qwen3-235B**。说明在极难题上，**会找错的验证器** 比单纯放大生成器更划算。

### 3. ViL 突破 RLVR 平台期，且收益可「内化」

从已 RLVR 收敛的生成器继续训 ViL：

- 有验证器时最终轮 pass@1 **+33%**（相对）；
- **第 0 轮**（测试时完全不用验证器）pass@1 **+30%**（相对）；
- 同等算力继续纯 RLVR：**零增益**。

这意味着：在环里学「如何听诊断改写法」，会反哺**第一稿**质量——不只是测试时外挂。

---

## 核心概念

### 1. 验证-精炼（V-R）循环

给定题目 \(x\)、标准答案 \(y^\star(x)\)：

```text
Round 0:  y₀ ~ G(· | x)
Round r:  (vᵣ, fᵣ) ~ V(· | x, yᵣ₋₁)     # 判决 + 反馈
          若 reject: yᵣ ~ G(· | x, yᵣ₋₁, fᵣ)
          若 accept 或达最大轮数 R: 结束
```

\(v \in \{\text{accept}, \text{reject}\}\)，\(f\) 是自然语言诊断（哪步错、为何错、怎么改）。

### 2. 监督缺口：能判对错，不会找茬

仅用「最终答案对错」训验证器（Verdict-RL），能学会 **outcome judgment**，但学不会指出「看似合理证明里的隐藏漏洞」——这正是 V-R 最需要的能力，却**没有直接可验证标签**。

### 3. STV：参考答案条件下的教师

定义两个 prompt 下的同一底座：

- **学生验证器** \(V_\theta(\cdot \mid x, y_{r-1})\)：测试时部署，**看不到** \(y^\star\)
- **教师验证器** \(V^\star(\cdot \mid x, y_{r-1}, y^\star(x))\)：训练时特权，**看得到**参考答案

教师输出 \((v, f)\) 分布；学生用 **On-Policy Distillation（OPD）** 对齐教师，并加一项 **Verdict-RL** 强化判决准确率：

\[
\mathcal{L}_{\text{STV}}(\theta) = \mathcal{L}_{\text{OPD}}(\theta) + \lambda \cdot \mathcal{L}_{\text{RL}}(\theta)
\]

\(\mathcal{L}_{\text{OPD}}\) 用 \(\alpha=0.5\) 的 \(\alpha\)-散度（Jensen-Shannon）匹配完整响应序列分布；\((x, y_{r-1})\) 来自生成器 **on-policy** rollout。

**为何 OPD 优于 SFT？** SFT 在教师轨迹上训，测试时学生自己采样会 **分布漂移**；OPD 让学生在自己会走到的前缀上对齐教师。

### 4. ViL：冻结 STV，只训生成器

多轮 V-R 展开成一条 episode，**奖励**仍是最终 \(y_r\) 与 \(y^\star\) 的可验证正确性；只更新 \(G\)，\(V_\theta\) 冻结。与「把模型自己的错解当监督」不同：反馈只是帮助 \(G\) 最大化**可验证奖励**的上下文，信号不脏。

### 5. STV 为何有效（论文分解）

| 机制 | 无训练验证器 | STV 验证器 |
|------|-------------|-----------|
| **分数校准** | 轮次↑、分数↑、准确率停滞 | 接受精度随覆盖率提升 |
| **反馈质量** | 泛泛否定 | 可定位具体逻辑断点 |
| **vs Best-of-N** | 更像「多抽几次选好的」 | V-R **重塑**分布，非单纯锐化 |

Pass@k 在前 ~10 轮往往提升，说明不是塌缩到单一模式；精炼在匹配算力下通常优于 BoN resampling。

### 6. Weak-to-Strong

STV 后的 **Qwen3-4B** 验证器可接近 **8B STV**；**1.7B STV** 可匹配未训练的 8B 自验证——小模型专精「找错」性价比高。

---

## 代码示例 1：最小 V-R 循环（概念实现）

下面用 Python 伪代码展示测试时 V-R 的数据流（非论文官方代码，便于理解接口）：

```python
from dataclasses import dataclass
from typing import Literal

Verdict = Literal["accept", "reject"]

@dataclass
class VerifyResult:
    verdict: Verdict
    feedback: str

def vr_loop(
    generator,
    verifier,
    problem: str,
    max_rounds: int = 20,
) -> str:
    """Verification-Refinement：生成 ↔ 验证，直到 accept 或达上限。"""
    solution = generator.solve(problem)  # y_0

    for r in range(1, max_rounds + 1):
        result: VerifyResult = verifier.check(problem, solution)
        if result.verdict == "accept":
            return solution
        # reject：把诊断反馈喂回生成器
        solution = generator.refine(
            problem,
            draft=solution,
            feedback=result.feedback,
        )
    return solution  # 超时返回最后一版
```

STV 训练的是 `verifier.check`：在**没有** `y_star` 时，仍输出接近「看过参考答案的教师」那样的 \((v, f)\)。

---

## 代码示例 2：STV 训练数据构造（教师蒸馏）

训练时教师能看见参考答案；学生只见题目与候选解：

```python
import random

def sample_stv_training_pair(generator, teacher_verifier, problem, y_star):
  """
  从生成器 on-policy 采样候选解，用参考答案条件下的教师打标签。
  返回用于 OPD / SFT 的 (student_context, teacher_target)。
  """
  y_attempt = generator.sample_solution(problem)

  # 教师：特权 prompt，上下文含 y_star
  teacher_out = teacher_verifier.sample(
      prompt=teacher_verifier.prompt_with_reference(
          problem=problem,
          attempt=y_attempt,
          reference=y_star,
      )
  )
  # teacher_out = (verdict, feedback_text)

  student_context = {
      "problem": problem,
      "attempt": y_attempt,
      # 注意：不含 y_star —— 与部署一致
  }
  return student_context, teacher_out


def stv_opd_batch(problems, generator, teacher, batch_size=32):
  """构造一个 OPD mini-batch（示意）。"""
  batch = []
  for _ in range(batch_size):
      x, y_star = random.choice(problems)
      ctx, target = sample_stv_training_pair(generator, teacher, x, y_star)
      batch.append((ctx, target))
  return batch
  # 实际训练：最小化 D_alpha(V_theta(·|ctx) || teacher(·|ctx,y_star))
  # 并加 verdict RL: reward = 1[verdict == is_correct(y_attempt, y_star)]
```

要点：

1. **Rollout 必须 on-policy**：\(y_{attempt}\) 来自当前 \(G\)，不是静态数据集里的旧解。
2. **教师与学生同底座、不同 prompt**——不需要更大的外部模型。
3. 测试时 `teacher_verifier.prompt_with_reference` 整条路径**下线**，只留学生 \(V_\theta\)。

---

## 代码示例 3：ViL 单 episode 奖励（生成器 RL）

```python
def vil_episode_reward(generator, frozen_stv_verifier, problem, y_star, max_rounds=5):
    """
    ViL：展开多轮 V-R，仅用最终答案可验证性作 reward。
    反传只更新 generator 参数。
    """
    y = generator.solve(problem)
    for _ in range(max_rounds):
        verdict, feedback = frozen_stv_verifier.check(problem, y)
        if verdict == "accept":
            break
        y = generator.refine(problem, draft=y, feedback=feedback)
    return 1.0 if grade_equal(y, y_star) else 0.0
```

论文令人意外的发现：即使 reward 只看**最终**对错，\(G\) 的 **round-0** pass@1 也会涨——说明诊断反馈教会了更一般的推理习惯，而不只是「依赖多轮补救」。

---

## 实验结果速览

### 数学（DAPO，Qwen3-8B 生成器）

| 设置 | Hardest pass@1（量级） | 备注 |
|------|------------------------|------|
| 无验证 | ~0%（基座） | Hardest 上基座为 0 |
| 无训练自验证 | 停滞 | 分数涨、准确率不涨 |
| **STV 验证器** | **~5.5%**（Hardest 最终轮） | **~2×** 于未训练验证器 |
| Qwen3-32B 无验证 | 2.7% | 4× 参数仍落后 STV+8B |

### 科学推理（SciKnowEval）

| 设置 | Hardest | Hard |
|------|---------|------|
| 无验证 | 1.5% | 11.5% |
| 无训练验证 | 2.1% | 11.4% |
| **STV** | **21.0%** | **42.4%** |
| Qwen3-235B 无验证 | 8.0% | 23.6% |

### ViL（从 RLVR 收敛点继续）

| 指标 | Hardest | Hard |
|------|---------|------|
| RLVR 收敛 round-0 | 10.7% | 36.7% |
| **ViL round-0** | **14.7% (+37%)** | **47.7% (+30%)** |
| 同算力延长 RLVR | 无提升 | 无提升 |
| ViL 最终轮 + STV@test | 27.3% vs 16.1% | — |

---

## 与相关工作的关系

```text
                    测试时算力              训练时自改进
                         │                        │
    Best-of-N / 自一致 ──┤                        │
    均匀自修正(Refine) ──┤  缺结构化反馈          ├── RLVR / STaR / ReST
                         │                        │
    V-R 多轮精炼 ────────┼── 需要好验证器 ◄──────┼── ViL（本文）
                         │                        │
    Meta-verifier+人标 ──┤  贵、难扩展            ├── Prefix-conditioning
    外部强模型反馈 ──────┤                        │   （不如 ViL+STV）
                         │                        │
                    ★ STV：参考答案特权蒸馏，无需人标反馈质量
```

- **Process Reward Model（PRM）**：逐步打分；STV 产出**可操作的文本诊断**，直接驱动改写。
- **Prefix-conditioning**：把参考答案前缀拼进生成上下文；论文 ablation 显示不如 ViL+STV 的诊断反馈。
- **On-policy distillation**：STV 把「特权信息蒸馏」用在**以前缺监督的验证器反馈质量**上。

---

## 局限与开放问题

1. **训练 STV 仍需标准答案 \(y^\star\)**（与 RLVR 同类监督），不是无监督；开放问题是能否用多参考、环境反馈等替代。
2. **数据域**：主实验为数学 + 科学选择题式推理；代码、开放问答泛化待验证。
3. **算力分配**：生成器 RL、验证器 STV、测试时轮数 \(R\) 的最优三角尚未闭合。
4. **自举循环**：更强验证器 → 更好 ViL 生成器 → 更难负样本 → 再训验证器；论文指出这是迭代自改进路线，但多轮外推未充分展开。
5. **反馈滥用**：若验证器仍不够准，多轮 V-R 仍可能收敛到「听起来对」的错解——STV 缓解但未消除。

---

## 心智模型：一张图串起来

```text
  训练阶段（有 y*）                         测试阶段（无 y*）
  ─────────────────                         ─────────────────
  G 生成错误尝试 y                          G 生成 y₀
       │                                         │
       ▼                                         ▼
  V*（教师，看见 y*）──蒸馏──► Vθ（学生）    Vθ 诊断 (v,f)
       │                           │              │
       └─ 学会「对照找茬」─────────┘              ▼
                                            G 按 f 精炼 → …
  ViL：冻结 Vθ，用最终正确性 RL 训 G
        → round-0 也会变强
```

---

## 读后自检（零基础友好）

1. **V-R 和 Best-of-N 的本质区别？** BoN 独立采样再挑选；V-R **依赖反馈改写**同一条推理轨迹，能探索单样本 resampling 到不了的模式。
2. **STV 的监督从哪来？** 同模型在「看见参考答案」时更容易写诊断；把这个分布蒸馏给「看不见参考答案」的学生验证器。
3. **为什么 SFT 不够、要 OPD？** 验证器测试时自己采样，off-policy SFT 遇未见前缀会崩；OPD 在学生自己的 rollout 上对齐教师。
4. **ViL 为何能提升 round-0？** 多轮诊断反馈作为训练上下文，迫使 \(G\) 内化推理习惯，不只学会「最后一轮蹭对」。
5. **我想复现第一步该做什么？** 固定 \(G\)，用带 \(y^\star\) 的 prompt 跑教师打 \((v,f)\) 标签，on-policy 采样 attempt，OPD + 轻量 verdict RL 训 \(V_\theta\)，再接 V-R 评测。

---

## 参考

- 论文：[arXiv:2605.30290](https://arxiv.org/abs/2605.30290)
- 项目页：[STV Webpage](https://ar-forum.github.io/stv-webpage)
- 训练集来源：DAPO（[Yu et al., 2025](https://arxiv.org/abs/2501.00000)）、SciKnowEval
- 相关：RLVR、V-STaR、Shao et al. meta-verifier、on-policy distillation（Agarwal et al., 2023）
