---
title: Knowing What to Solve Before How — Preplan-Plan-CoT 数学推理零基础学习笔记
来源: https://arxiv.org/abs/2605.30245
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 从日常类比开始：先审题，再列提纲，最后动笔算

你拿到一道奥数题，有两种常见翻车方式：

1. **没看清题型就动笔**：看到二次式就套判别式 \(\Delta\)，算半天才发现其实是**齐次方程**，因式分解两行就能拆成两条直线上的整点——路线选错，后面再工整也算不对。
2. **「审题」写成了「解题」**：草稿第一栏本该写「这是计数题，注意边界条件」，结果已经算出中间数、甚至把最终答案写进去了——形式上有个「分析」段落，但**分析和推导混在一起**，后面的计划只是复读已经算过的步骤。

大语言模型做数学题时，Chain-of-Thought（CoT）像**边想边写**的长作文；Plan-Then-CoT 像**先列提纲再展开**。香港科技大学（广州）王少杰、张亮在 2026 年 5 月发表的 **Knowing What to Solve Before How: Preplan Empowered LLM Mathematical Reasoning**（arXiv [2605.30245](https://arxiv.org/abs/2605.30245)）指出：现有「计划 + 执行」范式里，**计划和执行都在回答 how（怎么解）**，而 **what（这题本质在问什么、该用什么工具、有哪些坑）** 仍然被隐含假设会「自动长出来」。

他们提出 **PPC（Preplan-Plan-CoT）**，把推理链拉长为四段：

```text
question → preplan → plan → cot → answer
           ↑ 审题      ↑ 提纲   ↑ 演算
```

一句话：**先明确「解什么」，再规划「怎么解」，最后逐步算出来。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | *Knowing What to Solve Before How: Preplan Empowered LLM Mathematical Reasoning* |
| 作者 | Shaojie Wang, Liang Zhang（HKUST-GZ） |
| 日期 | 2026-05-28 |
| 框架 | **PPC**：Preplan → Plan → CoT 三阶段结构化轨迹 |
| 训练 | SFT（带 spoiler 过滤的合成数据）+ **复合奖励 GRPO** |
| 骨干 | Qwen3-4B、Qwen2.5-7B、Qwen2.5-Math-7B、Llama3.1-8B |
| 基准 | AIME25、Minerva-Math、OlympiadBench、MATH-500、GSM8K |
| 主指标 | maj@16 / pass@16（每题采样 16 条轨迹） |
| 核心结果 | **40 项指标中 39 项最优**；相对最强基线 maj@16 +2.23、pass@16 +3.06，**不增加推理 token 开销** |

---

## 为什么重要

### 1. 计划范式缺了「审题」这一层

| 范式 | 结构 | 显式建模了什么 |
|------|------|----------------|
| question → CoT | 一问一长链 | 逐步推导 |
| question → plan → CoT | 先提纲后演算 | **how**：步骤组织 |
| question → **preplan** → plan → CoT | 先审题再提纲再演算 | **what + how** |

论文用 LLM judge 对 MATH-500 错题做根因归因：在 Plan-Tuning、PTA-GRPO 等 **plan → cot** 方法里，大量错误不是算错，而是**没理解题在问什么**（题型误判、工具选错、边界条件漏掉）。

### 2. 「加一段 prompt」不够

**Prompt-Only** 基线：不训练，只在提示词里要求「先分析题型/概念/陷阱，再计划，再解」。结果与 PPC 差距明显——说明 **preplan 需要干净监督 + RL 约束**，不能只靠指令工程。

### 3. preplan 的概念边界很脆弱

若 preplan 里已经写出具体计算（**spoiler**）或提前复述 plan 步骤（**leakage**），「审题」就退化成「解题」，整个范式名存实亡。PPC 用同一套 **spoiler-score** 在**造数据时硬过滤**、在 **RL 时软惩罚**，两端守住边界。

---

## 核心概念

### 1. 三阶段轨迹与标签格式

策略 \(\pi_\theta\) 对题目 \(q\) 生成结构化输出 \(y = (y_{\text{pp}}, y_{\text{p}}, y_{\text{e}})\)：

| 阶段 | 符号 | 职责 | 应该包含 | 不应该包含 |
|------|------|------|----------|------------|
| **Preplan** | \(y_{\text{pp}}\) | 理解 **what** | 题型、可用工具/定理、边界条件、常见陷阱 | 具体推导、中间数值、逐步算式 |
| **Plan** | \(y_{\text{p}}\) | 组织 **how** | 高层步骤、策略选择（如「因式分解而非判别式」） | （相对 preplan）不应无视审题结论 |
| **Execution (CoT)** | \(y_{\text{e}}\) | 逐步演算 | 详细推理 + `\boxed{}` 最终答案 | — |

论文用 XML 风格标签包裹各段（如 `<preplan>...</preplan>`），\(R_{\text{fmt}}\) 奖励检查三段**各出现一次且顺序正确**。

### 2. 论文经典例子：齐次二次式计数

题目涉及 \(12x^2 - xy - 6y^2 = 0\) 一类形式。

- **plan → cot** 路线：未识别齐次结构，走**判别式**，且把「每条因子对应一个点」误当成「一个点」→ 计数偏小（如 84）。
- **preplan → plan → cot**：preplan 识别**齐次二次、可因式分解**；plan 选因式分解并注明**每个线性因子对应一族格点**；执行阶段正确计数（如 117）。

这个例子说明：**what 层面的一个判断，会级联改变整条 how。**

### 3. 数据合成：左到右、分模型生成

合成流水线严格**只让每一阶段看到前文**：

\[
y_{\text{pp}} \sim \pi_{\text{pp}}(\cdot \mid q),\quad
y_{\text{p}} \sim \pi_{\text{p}}(\cdot \mid q, y_{\text{pp}}),\quad
y_{\text{e}} \sim \pi_{\text{e}}(\cdot \mid q, y_{\text{p}})
\]

- \(\pi_{\text{pp}}, \pi_{\text{p}}\)：Qwen3-235B（preplan/plan 生成器，prompt 禁止推导与泄露）
- \(\pi_{\text{e}}\)：DeepSeek-R1（执行/解题）

**Leakage** 主要靠 prompt 约束抑制；**Spoiler** 靠规则打分过滤。

### 4. Spoiler-score 过滤器

规则分数 \(s(y_{\text{pp}}) \in \{0,\ldots,6\}\)，聚合「是否出现推导痕迹、是否泄露答案」等信号。保留轨迹当且仅当：

\[
s(y_{\text{pp}}) \leq \tau_s \quad \land \quad \hat{a}(y) \equiv a^\star
\]

默认 \(\tau_s = 2\)；preplan 长度约 150–1500 tokens。**答案对但 preplan 不纯的样本仍丢弃**——过滤器盯的是「审题纯度」，不是对错。

两种典型失败：

| 失败类型 | 表现 | 为何有害 |
|----------|------|----------|
| **Leakage** | preplan 复述后续 plan 的步骤顺序 | preplan 与 plan 塌缩成同一层 |
| **Spoiler** | preplan 里偷偷算中间量、写具体分类结果 | preplan 变成「披着分析外衣的演算」 |

### 5. 复合 GRPO 奖励

在 GRPO（组内相对优势 + clip + KL）上，总奖励大致为：

\[
R(y) = R_{\text{out}}(y) + \lambda_a R_{\text{adh}}(y) + \lambda_f R_{\text{fmt}}(y) - \lambda_s R_{\text{sty}}(y)
\]

| 项 | 作用 | 要点 |
|----|------|------|
| \(R_{\text{out}}\) | 答案正确性 | 答对为 1；答错用 LLM 评「解题路径接近度」给**部分分**（严格 \< 1） |
| \(R_{\text{adh}}\) | Plan–Preplan 对齐 | LLM critic 评战略是否**继承** preplan，而非 plan 本身多漂亮 |
| \(R_{\text{fmt}}\) | 结构守卫 | 三段标签 + `\boxed{}` |
| \(R_{\text{sty}}\) | 反退化 | \(R_{\text{sty}} = \max(0, s(y_{\text{pp}}) - \tau_s)\)，防止 RL 把 preplan 写回推导体 |

默认权重 \(\lambda_a=0.1, \lambda_f=0.3, \lambda_s=0.1\)。消融显示：缺 \(R_{\text{sty}}\) 时模型可能用「推导型 preplan」投机提高 adherence，**破坏范式**。

### 6. 与相关工作的关系

| 方法 | 与 PPC 的关系 |
|------|----------------|
| CoT / RLVR（DeepSeek-R1 等） | 单 pass 逐步推理，缺全局结构 |
| Plan-Tuning | 蒸馏 (q, plan, solution)，无独立 preplan |
| PTA-GRPO | plan 质量 + 答案的 GRPO，仍缺 **what** 显式阶段 |
| PPC | 在 plan 之上增加 preplan，并用 spoiler + adherence 训练 |

---

## 实验结果（精读摘要）

### 主结果（Table 2 节选）

以 **Qwen3-4B** 为例（maj@16）：

| 方法 | MATH-500 | OlympiadBench | GSM8K |
|------|----------|---------------|-------|
| Base | 96.00 | 66.04 | 94.84 |
| PTA-GRPO | 95.80 | 59.89 | 95.30 |
| **PPC** | **97.20** | **67.03** | **95.15** |

**Qwen2.5-7B** 在较难集上提升更明显：AIME25 pass@16 从 30.00（GRPO）→ **36.67**（PPC）；MATH-500 maj@16 从 83.80 → **84.80**。

**Prompt-Only** 与 PPC 差距说明：结构写在 prompt 里 ≠ 模型真的学会「先 what 后 how」。

### 奖励消融（Table 3 趋势）

从仅 \(R_{\text{out}}\) 起，逐步加 \(R_{\text{sty}}\)、\(R_{\text{adh}}\)，指标单调变好；**三项齐用**为 PPC full。

### 错误归因（Figure 1）

plan-based 方法的错题里，**what-to-solve 类错误**占比很高——支持「缺 preplan」是范式级缺口，而非单纯算力或采样问题。

---

## 代码示例 1：用 Python 实现简化版 spoiler-score 过滤

下面是一个**教学用**的极简 spoiler 检测器，演示论文 Eq.(4) 的「纯度 + 正确性」双门槛（真实论文 Appendix D 有更细规则）。

```python
import re
from dataclasses import dataclass

DERIVATION_PATTERNS = [
    r"=\s*-?\d",           # 出现具体数值等式
    r"\\frac\{",           # LaTeX 分式（常出现在演算中）
    r"因此\s*[=得]",       # 因此 = / 因此得
    r"step\s*\d+",        # 逐步编号（更像 plan/execution）
    r"\\boxed\{",         # 答案泄露进 preplan
]

@dataclass
class Trajectory:
    question: str
    preplan: str
    plan: str
    execution: str
    gold_answer: str
    pred_answer: str

def spoiler_score(preplan: str) -> int:
    """规则聚合：0=干净，越高越像「在 preplan 里算题」。"""
    score = 0
    for pat in DERIVATION_PATTERNS:
        if re.search(pat, preplan, re.IGNORECASE):
            score += 1
    # 与 plan 过度重叠 → leakage 代理
    plan_tokens = set(re.findall(r"\w+", preplan.lower()))
    overlap = len(plan_tokens)  # 真实实现应和 y_p 比 Jaccard；此处略
    if overlap > 80:
        score += 2
    return min(score, 6)

def keep_for_sft(traj: Trajectory, tau_s: int = 2) -> bool:
  """Eq.(4): 纯度门槛 AND 答案正确。"""
  pure = spoiler_score(traj.preplan) <= tau_s
  correct = traj.pred_answer.strip() == traj.gold_answer.strip()
  return pure and correct

# 示例
bad = Trajectory(
    question="Count lattice points on 12x^2 - xy - 6y^2 = 0",
    preplan="Factor to (3x-2y)(4x+3y)=0, so x=..., count gives 84",  # spoiler
    plan="Use discriminant...",
    execution="...",
    gold_answer="117",
    pred_answer="117",
)
print(keep_for_sft(bad))  # False：答案对但 preplan 不纯仍丢弃
```

要点：**SFT 数据质量靠「否决坏 preplan」**，而不是「答案对就留」。

---

## 代码示例 2：复合奖励 GRPO  rollout 骨架

展示 PPC 如何在采样一组轨迹后算 \(R(y)\) 并喂给 GRPO（省略 KL、clip 细节）。

```python
from typing import List
import math

def outcome_reward(correct: bool, proximity: float) -> float:
    """R_out: 答对=1；否则部分分，且严格小于 1。"""
    if correct:
        return 1.0
    return min(0.5, 0.1 * proximity)  # g(J_prox)，上限 0.5

def adherence_reward(preplan: str, plan: str, judge_fn) -> float:
    """R_adh in [0,1]：plan 是否战略上遵循 preplan（非 plan 质量分）。"""
    return judge_fn(preplan, plan)

def format_reward(text: str) -> float:
    tags = ["<preplan>", "</preplan>", "<plan>", "</plan>", "<execution>", "</execution>"]
    return 1.0 if all(text.count(t) == 1 for t in tags) and "\\boxed{" in text else 0.0

def style_penalty(preplan: str, tau_s: int = 2) -> float:
    return max(0.0, float(spoiler_score(preplan) - tau_s))

def composite_reward(traj, judge_adh, lambdas=(0.1, 0.3, 0.1)) -> float:
    la, lf, ls = lambdas
    rout = outcome_reward(traj.correct, traj.proximity)
    radh = adherence_reward(traj.preplan, traj.plan, judge_adh)
    rfmt = format_reward(traj.full_text)
    rsty = style_penalty(traj.preplan)
    return rout + la * radh + lf * rfmt - ls * rsty

def grpo_advantages(rewards: List[float]) -> List[float]:
    """Eq.(1): 组内标准化优势。"""
    mean = sum(rewards) / len(rewards)
    std = math.sqrt(sum((r - mean) ** 2 for r in rewards) / len(rewards)) or 1.0
    return [(r - mean) / std for r in rewards]

# 一组 G=8 条 rollout
group_rewards = [composite_reward(t, judge_adh=judge) for t in rollouts]
advantages = grpo_advantages(group_rewards)
# 后续：用 advantages 更新 pi_theta，并加 KL(pi_theta || pi_ref)
```

设计直觉：**\(R_{\text{out}}\) 拉答案，\(R_{\text{adh}}\) 拉 plan 听 preplan 的话，\(R_{\text{sty}}\) 防止 preplan 变回算式。**

---

## 代码示例 3：推理时拼装 PPC 提示（应用侧）

训练后的模型在推理时仍输出三段；应用层可按标签解析：

```python
PPC_SYSTEM = """Please reason step by step.
First write <preplan>...</preplan> analyzing problem type, tools, constraints, pitfalls — no calculations.
Then <plan>...</plan> with high-level steps that follow the preplan.
Then <execution>...</execution> with detailed CoT and \\boxed{final answer}."""

def parse_ppc_response(text: str) -> dict:
    def extract(tag: str) -> str:
        m = re.search(rf"<{tag}>(.*?)</{tag}>", text, re.DOTALL)
        return m.group(1).strip() if m else ""
    return {
        "preplan": extract("preplan"),
        "plan": extract("plan"),
        "execution": extract("execution"),
    }

# 调试时先看 preplan 是否「像审题」而非「像草稿纸」
parts = parse_ppc_response(model_output)
if spoiler_score(parts["preplan"]) > 2:
    log.warning("preplan may have collapsed into derivation")
```

---

## 实现与训练配置（论文默认值）

| 环节 | 设置 |
|------|------|
| 训练数据 | DeepMath-103K 子集，中等～竞赛难度分层采样 |
| SFT | 3 epochs，lr \(10^{-5}\)，batch 16 |
| GRPO | 500 steps，组大小 \(G=8\) |
| 采样 | temperature 1.0，top-\(p=0.95\) |
| 硬件 | 4× NVIDIA RTX PRO 6000 Blackwell 96GB |

---

## 局限与开放问题

1. **spoiler-score 是规则的**：对更隐蔽的「软泄露」可能漏检；是否可用学习式 judge 替代待探索。
2. **依赖强教师合成**：preplan/plan 来自 Qwen3-235B，执行来自 DeepSeek-R1；小团队复现成本不低。
3. **额外阶段 ≠ 额外 token 开销（论文声称）**：相对 baselines 控制总长度；但实际延迟仍取决于三段总长，工程上需 profile。
4. **领域外泛化**：本文聚焦数学；代码、逻辑证明是否同样需要 explicit preplan 尚待验证。

---

## 自测题

1. **preplan 与 plan 在范式里分别回答什么问题？**  
   preplan 回答 **what**（题型、工具、约束、陷阱）；plan 回答 **how** 的高层组织。

2. **Leakage 和 Spoiler 有何区别？**  
   Leakage 是 preplan **复述 plan 步骤**；Spoiler 是 preplan **里做具体计算或泄露答案**。

3. **为何 Prompt-Only 打不过 PPC？**  
   没有干净 SFT 示范 + RL 的 adherence/style 约束，模型容易形式化输出 preplan 却在 plan 阶段忽略。

4. **\(R_{\text{adh}}\) 为何不直接奖励「好 plan」？**  
   否则 plan 可独立于 preplan 最优，preplan 变成装饰；PPC 要的是 **plan 继承 preplan 的战略**。

5. **过滤器为何丢弃「答案正确但 preplan 脏」的样本？**  
   监督信号会教会模型在 preplan 里算题，破坏 what/how 分离。

---

## 延伸阅读

- Wei et al., 2022 — Chain-of-Thought Prompting  
- Shao et al., 2024 — GRPO  
- Parmar et al., 2025 — Plan-Tuning  
- Dou et al., 2025 — PTA-GRPO（plan-aware RL）  
- Guo et al., 2025 — DeepSeek-R1（RLVR 长 CoT）  

---

## 一句话带走

**PPC 把数学推理从「直接列提纲开算」改成「先审题（preplan）、再提纲（plan）、再演算（CoT）」；用 spoiler 过滤守住审题边界，用 plan–preplan 对齐奖励守住训练边界——在四个骨干、五个基准上几乎全面领先，且不靠加长推理链取胜。**
