---
title: When Does Memory Help Multi-Trajectory Inference for Tool-Use LLM Agents?
来源: 'Xinzhe Li & Yaguang Tao, "When Does Memory Help Multi-Trajectory Inference for Tool-Use LLM Agents?", arXiv:2605.28224, RMIT University, 2026'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：组队解谜，要不要共享笔记？

想象你和四个朋友分头解同一道密室谜题，每人最多试五次，最后选**任意一人**的答案交卷。

- **各写各的（无记忆）**：每次从头摸索，A 已经发现「红钥匙开左门」，B 仍会再去试右门——浪费步数，但探索更分散。
- **只写失败复盘（Reflection）**：A 失败后总结「别先查右柜，会触发警报」；B 读到后换策略。这对**需要树状回溯**的解法（像下围棋）特别有用，但对「各试各的、最后挑最好」的简单模式未必明显。
- **只写环境事实（Fact Extraction）**：把「左柜有密码盘、表名是 Tournament_Results」记成原子事实；下一个人可以**跳过重复勘探**，步数变短，但容易大家都走同一条路。
- **同一节点里兄弟之间耳语（Raw Sibling）**：在**同一步**展开多个候选动作时，后生成的候选能看到前面兄弟刚试过的动作和观察——适合束搜索这种「一步要并排看多个分支」的场景。

这篇论文（Li & Tao, arXiv:2605.28224）问的核心问题不是「记忆有没有用」，而是：**在什么推理策略、什么任务结构下，哪种记忆抽象才真正帮上忙？** 它用统一框架把 Reflexion、LATS、mem0 式事实提取等散落做法，放到同一张实验矩阵里对照。

---

## 是什么

**工具调用（tool-use）LLM Agent** 会在多步交互里发出结构化调用（SQL 查询、Shell 命令、知识图谱 API 等），读环境返回的 observation，再决定下一步。

**多轨迹推理（multi-trajectory inference）** 指：对同一任务生成**多条完整推理轨迹**，再从中选出最好的一条——类似 pass@k / best-of-N、束搜索（beam search）、蒙特卡洛树搜索（MCTS）。

**记忆增强** 在这些轨迹之间（或同一展开内的兄弟候选之间）传递信息，让后续尝试不必从零开始。

论文贡献可以概括为三件事：

1. **统一框架**：沿两条正交轴分解记忆——**转移范围（scope）** 与 **内容抽象（abstraction）**。
2. **系统实验**：4 种记忆 × 3 种推理策略 × 4 个基准（WikiSQL、WikiTQ、KGQA、Terminal-Bench），在 **verifier-free** 设定下评估（验证器只在评测时用，推理过程中没有「单元测试通过/失败」这类在线信号）。
3. **三条结论（F1–F3）**：记忆收益强烈依赖推理策略；不同抽象在难任务上可能「效果相当」；事实提取常**不提高准确率**但显著**缩短轨迹**。

---

## 为什么重要

### 1. 过去的工作难以横向比较

Reflexion 用轨迹级反思、LATS 把反思嵌进 MCTS、mem0 类方法提取原子事实——它们往往在**单一任务 + 单一推理策略**下报告提升。你无法判断：增益来自「反思比事实好」，还是来自「MCTS 比 best-of-N 更适合吃这类记忆」。

### 2. 生产 Agent 大多是 verifier-free

很多论文在推理时用 inline verifier（答案 exact match、测试是否通过）。真实部署里，Agent 通常**不知道**当前轨迹对不对，只能凭 observation 继续试。论文刻意对齐这种 regime，结论更贴近实际系统。

### 3. 环境是否可序列化（serializable）决定能用哪种搜索

若环境状态**不能 fork**（例如真实 Shell、已执行的破坏性 SQL），则 beam search / MCTS 不可行，只剩 **best-of-N** 类独立采样。记忆设计必须和**可用搜索算法**一起考虑。

### 4. 「加记忆」不免费

Reflection 要额外调用 augmentor LLM；Fact 提取也有成本。WikiSQL 上 LiTS-Fact 把平均步数从 6.1 降到 4.9，策略 token 成本从 $2.20 降到约 $1.68——**效率收益**和**探索多样性损失**需要权衡。

---

## 核心概念

### 1. 形式化：上下文增强器

策略从 \(\pi_\theta(a \mid s)\) 变为 \(\pi_\theta(a \mid s, \mathcal{C})\)，其中：

\[
\mathcal{C} = \bigcup_{k=1}^{K} f_k(\mathcal{H}_k)
\]

- \(\mathcal{H}_k\)：第 \(k\) 个增强器能看到的**历史范围**
- \(f_k\)：把历史**变换**成可注入 prompt 的文本（反思、事实、原始 observation 等）

多个增强器可**组合**进同一条 prompt——论文发现组合并不总是更好（见下文「反思 vs 事实冲突」）。

### 2. 轴一：记忆范围（Scope）

| 范围 | 含义 | 典型方法 |
|------|------|----------|
| **Cross-trajectory（跨轨迹）** | 完整轨迹结束后，把信息传给**下一次独立尝试** | Reflection、LiTS-Fact |
| **Cross-sibling（扩展内）** | 在同一搜索节点一次展开 \(N\) 个候选时，后采样的兄弟能看到**前面兄弟**的动作与观察 | Raw Sibling |

### 3. 轴二：内容抽象（Abstraction）

| 抽象级别 | 存什么 | 特点 |
|----------|--------|------|
| **Raw（原始）** | 工具返回的 observation 原文 | 信息最全，token 多 |
| **Reflection（反思）** | 自然语言总结：错在哪、下次怎么做 | 偏**程序性**计划，Agent 易「逐步照做」 |
| **Atomic facts（原子事实）** | 从轨迹抽出的短事实句 | 偏**陈述性**环境知识，利于跳过重复发现 |

### 4. 四种具体记忆方法

| 方法 | Scope | Abstraction | 说明 |
|------|-------|-------------|------|
| **No Memory** | — | — | 基线：各轨迹独立采样 |
| **Reflection** | 跨轨迹 | 反思 | 类似 Reflexion / LATS 的 verbal memory |
| **LiTS-Fact** | 跨轨迹 | 原子事实 | 适配 mem0 流水线到多尝试搜索 |
| **Raw Sibling** | 扩展内 | 原始 observation | 论文新提出的 instantiation |

### 5. 三种推理策略

| 策略 | 直觉 | 与记忆的典型关系 |
|------|------|------------------|
| **Best-of-N（Indep）** | 独立生成 N 条轨迹，选 PRM 最高 | 跨轨迹记忆有用；扩展内记忆**结构上不适用** |
| **Beam Search** | 每步保留 top-k 分支并行扩展 | 分支相似度高 → **多样性不足** → Raw Sibling 可能有用 |
| **MCTS** | 树搜索 + 回滚 + 价值估计 | 跨轨迹 Reflection 在难任务上**显著**；与 Raw Sibling 在 KGQA 上准确率可接近 |

### 6. 三个基准环境（四类任务）

- **WikiSQL / WikiTQ**：Text-to-SQL，环境相对可复用（表结构、列名）。
- **KGQA**：知识图谱问答，更难，步数更长。
- **Terminal-Bench**：CLI / Shell，环境常**不可序列化** → 许多搜索组合不可行。

---

## 三条核心发现（论文 F1–F3）

### F1：记忆对准确率的影响取决于搜索方法

- **Reflection** 的统计显著提升主要出现在 **MCTS** 下，在 **best-of-N** 下往往不显著。
- **Raw Sibling（扩展内注入）** 主要帮助 **多样性不足的 beam search**，对 MCTS 等其他策略帮助有限。
- 同一记忆方法、同一批样本，换推理策略后结果可以**统计上显著不同**——推理策略是重要**混淆变量**。

### F2：不同抽象在难任务上可能「效果打平」

在 KGQA 的 MCTS 上，**Reflection** 与 **Raw Sibling** 准确率统计上**无法区分**，尽管一个用高抽象反思、一个用原始 observation。说明：在足够难的搜索里，「有跨尝试信息通道」本身可能比「通道里装的是反思还是 raw」更关键——至少在该设定下如此。

### F3：事实提取偏效率，不偏准确率

**LiTS-Fact** 在具有**可复用环境结构**的任务上，常**不提高** pass@k，但能把轨迹长度缩短约 **19–26%**。WikiSQL 上 77% 的后继尝试会跳过 `list_tables` 这类重复发现步骤（无记忆时仅约 4%）。

### 额外机制：反思 + 事实同时注入会「打架」

事实说「表 Tournament_Results 已有列 A,B,C」→ Agent 本可跳过列清单；反思说「Step 1: list tables」→ Agent **字面执行计划**，仍去 list tables。WikiSQL 上 skip 率从 77%（仅事实）跌到 20%（事实+反思），pass@5 也会下降。**显式程序性记忆会压制隐式环境知识。**

---

## 代码示例 1：Best-of-N + 跨轨迹 Reflection（教学用骨架）

下面用 Python 伪代码展示 **verifier-free best-of-N**：轨迹之间只传反思，最终用过程奖励模型（PRM）选最优，**推理过程中不调 oracle**。

```python
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Trajectory:
    steps: list[dict[str, Any]] = field(default_factory=list)
    final_answer: str | None = None
    prm_score: float = 0.0


def run_tool(env, action: dict) -> dict:
    """env 可以是 SQL 连接、KG API、mock shell 等。"""
    return env.execute(action)


def reflect_on_trajectory(traj: Trajectory, llm) -> str:
    """跨轨迹抽象：把失败/低效轨迹压成自然语言反思。"""
    prompt = f"""
    任务已结束。轨迹步数={len(traj.steps)}，最终答案={traj.final_answer!r}。
    请用 3 条以内 bullet 总结：哪些工具调用是浪费的？下次应如何调整策略？
    轨迹摘要：{traj.steps[-8:]}
    """
    return llm.complete(prompt)


def agent_step(state: str, memory: str, llm) -> dict:
    """单步 tool-call：prompt = 系统记忆 + 当前 observation。"""
    system = f"跨轨迹记忆（反思）：\n{memory}\n" if memory else ""
    return llm.choose_tool(system + state)


def best_of_n_with_reflection(task: str, env, llm, prm, n: int = 5) -> Trajectory:
    memory = ""
    trajectories: list[Trajectory] = []

    for attempt in range(n):
        state = task
        traj = Trajectory()

        while not env.done(state):
            action = agent_step(state, memory, llm)
            obs = run_tool(env, action)
            traj.steps.append({"action": action, "obs": obs})
            state = env.render(state, obs)

        traj.final_answer = env.extract_answer(state)
        traj.prm_score = prm.score(task, traj)  # 仅用于选优，非 inline verifier
        trajectories.append(traj)

        # 跨轨迹：下一条尝试读取上一轮的 verbal reflection
        memory = reflect_on_trajectory(traj, llm)

    return max(trajectories, key=lambda t: t.prm_score)
```

**读代码时注意**：

- `memory` 在**每条轨迹结束后**才更新 → 典型的 **cross-trajectory + reflection**。
- `prm.score` 模拟论文里的过程奖励模型选轨迹；它**不是** SQL 执行结果的对错标签（那会是 inline verifier）。
- 论文结论：这种 Reflection 在 **best-of-N** 上提升常不显著；若换成 **MCTS + 回滚**，同一反思机制更容易显出收益（F1）。

---

## 代码示例 2：Scope × Abstraction 组合器 + Beam 扩展内 Raw Sibling

第二个例子展示论文公式 (1) 的**可组合增强器**，并实现 **Raw Sibling**：同一父节点展开多个候选时，后生成的候选看到前面兄弟的 `(action, observation)`。

```python
from abc import ABC, abstractmethod


class ContextAugmentor(ABC):
    @abstractmethod
    def analyze(self, history) -> str:
        ...


class ReflectionAugmentor(ContextAugmentor):
    """Scope: cross-trajectory | Abstraction: reflection"""

    def __init__(self, past_trajectories: list):
        self.past_trajectories = past_trajectories

    def analyze(self, history) -> str:
        if not self.past_trajectories:
            return ""
        last = self.past_trajectories[-1]
        return f"[Reflection] 上一轮共 {len(last)} 步，避免重复无效工具调用。"


class FactAugmentor(ContextAugmentor):
    """Scope: cross-trajectory | Abstraction: atomic facts (LiTS-Fact 简化版)"""

    def __init__(self, facts: list[str]):
        self.facts = facts

    def analyze(self, history) -> str:
        if not self.facts:
            return ""
        return "[Facts]\n" + "\n".join(f"- {f}" for f in self.facts)


class RawSiblingAugmentor(ContextAugmentor):
    """Scope: within expansion | Abstraction: raw (action, obs) pairs"""

    def __init__(self, siblings: list[tuple[dict, dict]]):
        self.siblings = siblings  # 当前节点已采样兄弟的 (action, observation)

    def analyze(self, history) -> str:
        if not self.siblings:
            return ""
        lines = []
        for i, (a, o) in enumerate(self.siblings, 1):
            lines.append(f"兄弟#{i} action={a} obs={o}")
        return "[Sibling context]\n" + "\n".join(lines)


def build_prompt(state: str, augmentors: list[ContextAugmentor], histories) -> str:
    chunks = [aug.analyze(histories[i]) for i, aug in enumerate(augmentors)]
    context = "\n\n".join(c for c in chunks if c)
    return f"{context}\n\n当前状态：{state}" if context else state


def beam_expand(parent_state, env, llm, beam_width: int = 3):
    """束搜索一步：后采样候选注入 Raw Sibling 记忆。"""
    candidates = []
    siblings: list[tuple[dict, dict]] = []

    for _ in range(beam_width):
        prompt = build_prompt(
            parent_state,
            augmentors=[RawSiblingAugmentor(siblings)],
            histories=[siblings],
        )
        action = llm.choose_tool(prompt)
        obs = env.execute(action)
        siblings.append((action, obs))  # 下一个兄弟能看到之前的
        next_state = env.render(parent_state, obs)
        candidates.append((next_state, obs, llm.score_state(next_state)))

    return sorted(candidates, key=lambda x: x[2], reverse=True)[:beam_width]
```

**设计对照表**（与论文 Table 9 思想一致）：

| 配置 | 探索多样性 | 跳过重复发现 |
|------|------------|--------------|
| 无记忆 | 高（i.i.d. 采样） | 低 |
| LiTS-Fact 全注入 | 降低（事实被当 ground truth） | 高 |
| Raw Sibling + Beam | 在**步内**差异化兄弟 | 中等 |

论文强调：**检索式**「只注入相似事实」难以同时保多样性与高效率——Pareto 前沿很窄；他们的 LiTS-Fact 走「全注入、高效率、低多样性」一端。

---

## 实验矩阵怎么读

论文评估的是 **memory × inference × benchmark** 单元格，部分组合因环境不可序列化而**结构性不可行**（Table 2 中 † 标记）。

| 维度 | 取值 |
|------|------|
| 记忆 | No Memory / Reflection / LiTS-Fact / Raw Sibling（及 Fact+Refl 组合） |
| 推理 | Best-of-N / Beam / MCTS |
| 任务 | WikiSQL(51) / WikiTQ(49) / KGQA(150 或 69 子集) / Terminal-Bench(89) |

**效率侧数据（Appendix P，best-of-N）**：

- WikiSQL 平均步数：No Memory 6.1 → LiTS-Fact 4.9；跳过 list_tables：4% → 77%。
- 成本：Reflection 因 augmentor 调用，总成本高于纯策略；Fact 在步数减少后**策略侧**更省。

整实验 API 成本约 **$1,384**（Bedrock 定价，Haiku/Sonnet 分工）。

---

## 给工程实践的 checklist

在给你的 tool-use Agent 加「多轨迹记忆」之前，可以按论文结论自问：

1. **推理策略是什么？** 若只有 best-of-N，别指望 Reflexion 式反思一定涨点；若用 MCTS，跨轨迹反思更值得试。
2. **环境能否 fork？** 不能则别设计依赖 beam/MCTS 的方案；记忆应服务**独立多次尝试**。
3. **任务有没有可复用的环境结构？** 有（SQL  schema、固定 API 面）→ 事实提取可能**省 token/步数**；无则记忆偏「避错」而非「跳过发现」。
4. **beam 是否多样性不足？** 是 → 考虑扩展内 Raw Sibling；否 → 收益可能不明显。
5. **是否混用反思与事实？** 小心显式计划覆盖环境事实，导致重复工具调用。
6. **是否 verifier-free？** 在线没有单元测试/答案校验时，论文设定更贴你的生产路径；别直接照搬带 inline verifier 的旧结论。

---

## 与相关工作的关系（简表）

| 方向 | 代表工作 | 本文差异 |
|------|----------|----------|
| 树搜索推理 | Tree-of-Thoughts, RAP, ReST-MCTS* | 聚焦**记忆抽象 × 搜索策略**交互，非新搜索算法 |
|  verbal 反思 | Reflexion, LATS | 统一进 scope×abstraction，并测 **何时** 显著 |
| 原子事实 | mem0, Holt et al. | LiTS-Fact + 与 Reflection 的**对照**与**组合**分析 |
| 不可序列化环境 | Zainullina et al. 2025 | 解释为何某些 benchmark 只能 best-of-N |

框架还可视为 RL **experience replay** 的推理期类比：经验不用于梯度，而是**写进 prompt**（in-context learning / hindsight 的一种形式）。

---

## 局限与开放问题

- **单一策略 LLM 族**：SQL 用 Haiku、KG 用 Sonnet；跨模型结论需谨慎外推。
- **Fact 检索策略**：论文主要评「全注入」；相似/相异检索仅为设计空间分析，未全量实验。
- **组合增强器**：Fact+Reflection 已显示冲突；更一般的组合规则仍开放。
- **负向事实**（「某表不存在」）与 **candidate-vs-truth  framing** 被提出作为缓解多样性–效率权衡的方向，需后续验证。

---

## 一句话总结

**记忆不是 tool-use Agent 多轨迹推理的万能插件：Reflection 更像给 MCTS 的「错题本」，LiTS-Fact 更像 SQL 任务的「环境速查表」，Raw Sibling 是给「步子太像的束搜索」加的「兄弟耳语」——先选对推理策略，再选记忆抽象，比堆更多记忆类型更重要。**

---

## 延伸阅读

- 论文 HTML：[arXiv:2605.28224](https://arxiv.org/html/2605.28224)
- Reflexion（跨轨迹反思原型）：Shinn et al., 2023
- LATS（MCTS + 反思）：Zhou et al., 2024
- 不可序列化环境与轨迹选择：Zainullina et al., 2025
- mem0（原子事实提取流水线）：Chhikara et al., 2025
