---
title: Cross-Component Interference in LLM Agent Scaffolding（LLM Agent 脚手架的跨组件干扰）
来源: 'Ming Liu, "More Is Not Always Better: Cross-Component Interference in LLM Agent Scaffolding", arXiv:2605.05716, Amazon, 2026'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：给新手厨师加太多「辅助装备」

想象你教一位新手做一道菜。你可以给他：

- **菜谱分解卡（Planning）**：先把任务拆成「备料 → 下锅 → 调味」
- **专用工具（Tool Use）**：温度计、计时器、搜索引擎查「这步该几度」
- **便签本（Memory）**：记录刚才试过的温度和结果
- **步骤模板（Structured Reasoning）**：强制写「观察 → 推理 → 行动」
- **复盘环节（Reflection）**：每做完一步就自问「刚才对不对？要不要改？」

直觉上，**装备越全越好**。但厨房台面就那么大，新手注意力也有限——五样东西同时占着台面，他反而可能：

- 一边读分解卡，一边翻便签，**忘了看锅**
- 复盘写太长，**挤掉真正该执行的步骤**
- 工具说明书和模板格式占满视野，**搜索到的关键信息被淹没**

论文 *More Is Not Always Better*（Liu, arXiv:2605.05716）把 LLM Agent 领域长期默认的「脚手架堆叠 = 更强 Agent」推上实验台，发现类似现象：**Cross-Component Interference（CCI，跨组件干扰）**——单独看每个组件都「合理」，组合在一起却可能**负边际收益**，全配齐的 All-In Agent 反而输给更小的子集。

---

## 是什么

**LLM Agent 脚手架（scaffolding）** 指围绕基础大模型加的一层「能力包装」：规划、工具调用、记忆、结构化推理、自我反思等。LangChain 一类框架鼓励自由组合，但很少系统回答：**该开哪几个开关？**

**Cross-Component Interference（CCI）** 是论文的操作性定义：对配置 \(C\) 和不在其中的组件 \(s\)，若

\[
\phi(C \cup \{s\}) < \phi(C)
\]

即「加上 \(s\) 后任务指标 \(\phi\) 下降」，则称发生 CCI。这里 \(\phi\) 可以是 HotpotQA 的 token-level \(F_1\)，或 GSM8K 的 exact-match 准确率。

论文在五类标准组件上做 **全因子实验（full factorial design）**：

| 符号 | 组件 | 作用（简化） |
|------|------|----------------|
| **P** | Planning | 系统级指令：把任务分解为子目标 |
| **T** | Tool Use | 函数调用接口 + 工具描述 |
| **M** | Memory | 跨步持久化的工作记忆 |
| **SR** | Structured Reasoning | Chain-of-Thought 式格式约束 |
| **R** | Reflection | 每步后的自我评估提示 |

共 \(2^5 = 32\) 种配置；在 HotpotQA（多跳检索 QA）与 GSM8K（数学推理）上，对 Llama-3.1-8B/70B、Qwen2.5-3B/7B、Claude Haiku 4.5 等模型做了 **118 个受控配置、32,000+ 次评测**。

---

## 为什么重要

### 1. 行业默认可能是错的

很多 Agent 模板默认「Planning + Tools + Memory + CoT + Reflection 全开」。论文在**每一个测试设定**里发现：**最优配置都是 All-In 的真子集**，五件套从未夺冠。

### 2. 「少即是多」不是 universal law

CCI 不是简单的「组件越少越好」：

- HotpotQA @ 8B：最优 \(k^* = 1\)，**只用 Tool Use** 最好
- GSM8K @ 8B：最优 \(k^* = 3\)，**T + SR + R** 组合最好
- 70B @ HotpotQA：在 8B 上「加组件就亏」的方向**部分反转**，但 All-In 仍输给最佳子集约 19%

### 3. 与模型能力耦合（capability gradient）

| 规模 | HotpotQA 上「最佳子集 vs All-In」差距（量级） |
|------|-----------------------------------------------|
| 8B | ~32%（T alone \(F_1=0.233\) vs All-In \(0.177\)，\(p=0.023\)） |
| 70B | ~19%（最佳子集 \(F_1=0.441\) vs All-In \(0.372\)） |
| Claude Haiku 4.5 | ~0%（32 种配置挤在窄区间内，但 All-In 仍非最优） |

**在 frontier 模型 demo 里「全开也没事」的结论，不能直接下放到 8B–14B 部署模型**——小模型协调容量更紧，CCI 更狠。

### 4. 贪心选组件会翻车

183/325 个可测三元组违反**次模性（submodularity）**（56.3%），中位次模比 \(\gamma_{med}=0.52\)。意味着：**单独有害的分量，放进特定组合里可能变有益**——「一个一个加直到不涨」的贪心策略不可靠。

---

## 核心概念

### 1. 配置与性能函数

- 配置 \(C \subseteq \{P, T, M, SR, R\}\)，\(K = |C|\)
- 性能 \(\phi(C)\)：同一 benchmark、同一模型、同一 prompt 模板下的指标
- **All-In**：\(C = \{P, T, M, SR, R\}\)，\(K=5\)

### 2. 最优组件数 \(k^*\)

\[
k^* = \arg\max_{K} \max_{|C|=K} \phi(C)
\]

任务决定 \(k^*\) 落在 1–4 之间，没有 universal 常数。

### 3. 机制直觉：共享单一「工作台」——上下文窗口

五个组件并不运行在五个独立进程里；它们都往**同一段 context** 里塞 token：

- Planning 轨迹
- 工具 schema 与返回
- Memory 条目
- CoT 格式要求
- Reflection 笔记

这与 **attention dilution（注意力稀释）**、**instruction interference（指令干扰）** 文献一致：约束越多，模型越难把容量留给「真正解题」的 token。论文的主效应回归 \(R^2=0.916\)，**优于** 16 参数 pairwise 交互模型（\(\Delta\text{BIC}=25.3\)），说明多数伤害来自**各组件独立的上下文成本**，而非某一对「天生相克」——尽管高阶三体协同（T+SR+R 在检索任务上）确实存在。

### 4. Shapley 分解：谁贡献、谁拖后腿

在 HotpotQA @ 8B 上精确计算 Shapley 值（32 个联盟全覆盖）：

| 组件 | Shapley 直觉 | 论文结论（量级） |
|------|--------------|------------------|
| **Tool Use (T)** | 脚手架价值的绝对主力 | 约占 scaffold 总价值的 **70%**（\(\phi \approx +0.177\)） |
| **Planning (P)** | 常帮倒忙 | **显著为负**；在 84% CCI 任务上添加 P 降分 |
| **Memory (M)** | 检索 QA 上偏负 | 约 68% 任务上添加 M 降分 |
| **SR / R** | 任务依赖 | 数学（GSM8K）上 SR+R 与 T 协同；纯检索上可能增噪 |

**没有 T 的配置**：HotpotQA @ 8B 上 \(F_1\) 均值约 **0.043**；有 T 的配置均值约 **0.204**——工具接口是「能不能做题」的分水岭，其余组件是在「会不会被互相拖累」。

### 5. 三体协同（ exploratory ）

Harsanyi 三阶交互 **T + SR + R** 在检索任务上有正残差（\(\text{INT}_3 \approx +0.175\)，BCa 95% CI 下界略大于 0），说明**高阶组合效应真实存在**，不能从 pairwise 完全还原——但论文也强调该发现待更多 seed 确认。

---

## 关键实验数字（零基础版速查）

### HotpotQA，Llama-3.1-8B，10 seeds

| 配置 | 组件数 \(K\) | Mean \(F_1\) | 相对 T alone |
|------|-------------|--------------|--------------|
| **T** | 1 | **0.233 ± 0.039** | 基线 |
| T+SR+R | 3 | 0.220 ± 0.027 | 略低 |
| All-In | 5 | **0.177 ± 0.049** | **低 32%**（\(p=0.023\)，\(d_z=0.87\)） |

从 T 出发的 6 种扩展里，**5/6 在 \(p<0.05\) 显著变差**（4/6 经 Holm–Bonferroni 校正仍显著）。

### GSM8K，Llama-3.1-8B

| 配置 | 准确率 | 备注 |
|------|--------|------|
| **T + SR + R**（\(k^*=3\)） | **~0.43** | 最优子集 |
| All-In | ~0.24 | 比最优低 **~79%**（\(p=0.010\)） |

数学推理需要格式（SR）与纠错（R），但 **Planning + Memory 全开仍可能过噪**。

---

## 代码示例 1：用位掩码枚举 32 种脚手架配置

论文的核心实验设计是 **全因子 sweep**。下面用 Python 教学骨架展示：如何用 bitmask 生成配置、跑 benchmark、检测 CCI。

```python
from dataclasses import dataclass
from itertools import combinations
from typing import Callable

# 五类组件与 LangChain / 自研 Agent 里的 prompt 块一一对应
COMPONENTS = {
    "P":  "planning",           # 子目标分解指令
    "T":  "tool_use",           # 工具 schema + 调用循环
    "M":  "memory",             # 跨步 observation 缓存
    "SR": "structured_reasoning",  # CoT 格式
    "R":  "reflection",         # 每步 self-critique
}
MASK = {name: 1 << i for i, name in enumerate(COMPONENTS)}


@dataclass(frozen=True)
class ScaffoldConfig:
    mask: int

    def has(self, key: str) -> bool:
        return bool(self.mask & MASK[key])

    def with_component(self, key: str) -> "ScaffoldConfig":
        return ScaffoldConfig(self.mask | MASK[key])

    def active(self) -> frozenset[str]:
        return frozenset(k for k in COMPONENTS if self.has(k))

    def __repr__(self) -> str:
        parts = [k for k in COMPONENTS if self.has(k)]
        return "+".join(parts) if parts else "Baseline"


def all_configs() -> list[ScaffoldConfig]:
    """论文中的 2^5 = 32 种配置。"""
    return [ScaffoldConfig(m) for m in range(32)]


def build_prompt_blocks(cfg: ScaffoldConfig) -> dict[str, str]:
    """每个组件映射到一段 system / tool / post-step 文本。"""
    blocks: dict[str, str] = {}
    if cfg.has("P"):
        blocks["planning"] = "先把问题分解为 2-4 个子目标，再逐步解决。"
    if cfg.has("T"):
        blocks["tools"] = "你可以调用 search(query) 检索 Wikipedia。"
    if cfg.has("M"):
        blocks["memory"] = "把每步 observation 写入 WORKING_MEMORY。"
    if cfg.has("SR"):
        blocks["cot"] = "每步按 Observation / Thought / Action 格式输出。"
    if cfg.has("R"):
        blocks["reflect"] = "每步结束后评估上一步是否正确。"
    return blocks


def detect_cci(
    scores: dict[ScaffoldConfig, float],
) -> list[tuple[ScaffoldConfig, str, float]]:
    """
    返回所有 (C, s) 满足 phi(C∪{s}) < phi(C) 的 CCI 实例。
    scores: 配置 -> HotpotQA F1 或 GSM8K accuracy
    """
    violations = []
    for cfg in all_configs():
        base = scores.get(cfg)
        if base is None:
            continue
        for key in COMPONENTS:
            if cfg.has(key):
                continue
            expanded = cfg.with_component(key)
            new = scores.get(expanded)
            if new is not None and new < base:
                delta = new - base
                violations.append((cfg, key, delta))
    return violations


def run_factorial_experiment(
    evaluate: Callable[[ScaffoldConfig], float],
) -> dict[ScaffoldConfig, float]:
    """对 32 种配置各跑 evaluate，复现论文 sweep 结构。"""
    return {cfg: evaluate(cfg) for cfg in all_configs()}


# --- 用法示意 ---
# scores = run_factorial_experiment(lambda c: hotpotqa_f1(build_agent(c), n=100))
# for cfg, comp, delta in sorted(detect_cci(scores), key=lambda x: x[2]):
#     print(f"CCI: {cfg} + {comp} -> {delta:+.3f}")
```

**读代码时注意**：

- `ScaffoldConfig` 与论文 coalition \(C\) 同构；`detect_cci` 直接实现 Definition 1。
- 真实实验还要固定 **model、temperature、max steps、benchmark split**；论文用 temperature=0.1，每题最多 4 步，每步最多 256 new tokens。
- 若只测 All-In vs T，会**漏掉** \(k^*=3\) 这类中间最优——全因子设计的价值正在于不遗漏交互结构。

---

## 代码示例 2：按任务选择脚手架子集（替代 All-In 默认）

下面展示一个**任务感知**的 scaffold 选择器：先根据任务类型给出 prior，再用验证集上的少量样本做 subset search——对应论文建议的 *interaction-aware subset selection*。

```python
from dataclasses import dataclass


@dataclass
class TaskProfile:
    name: str
    needs_tools: bool
    needs_math_format: bool
    needs_multi_hop: bool


# 论文经验先验：HotpotQA 偏检索，GSM8K 偏推理+反思
TASK_PRIORS: dict[str, set[str]] = {
    "hotpotqa": {"T"},                    # k*=1 @ 8B
    "gsm8k":    {"T", "SR", "R"},         # k*=3 @ 8B
}


def scaffold_score(
    active: set[str],
    profile: TaskProfile,
    val_metric: float,
) -> float:
    """
    综合验证集指标与复杂度惩罚。
    val_metric: 在 held-out 100 题上的 F1 或 accuracy
    """
    complexity_penalty = 0.02 * len(active)  # 每多一个组件，略罚过拟合/上下文成本
    missing_tool = profile.needs_tools and "T" not in active
    if missing_tool:
        return -1.0
    return val_metric - complexity_penalty


def best_subset_search(
    profile: TaskProfile,
    evaluate_subset: callable,
    candidates: list[set[str]] | None = None,
) -> set[str]:
    """
    evaluate_subset(active_components) -> float
    candidates 默认从 TASK_PRIORS 出发，再尝试增删分量。
    """
    if candidates is None:
        base = set(TASK_PRIORS.get(profile.name, {"T"}))
        keys = ["P", "T", "M", "SR", "R"]
        candidates = [base]
        # 尝试 base 的单点增删（教学版；论文用完整 32 格 + Shapley）
        for k in keys:
            candidates.append(base | {k})
            candidates.append(base - {k})
        candidates.append(set(keys))  # All-In，用于对照而非默认

    best_active: set[str] = {"T"}
    best_score = -1.0
    for active in candidates:
        if profile.needs_tools and "T" not in active:
            continue
        metric = evaluate_subset(frozenset(active))
        score = scaffold_score(active, profile, metric)
        if score > best_score:
            best_score = score
            best_active = set(active)
    return best_active


class AgentRunner:
    """把选中的组件真正拼进 prompt / loop。"""

    def __init__(self, active: set[str], llm, tools):
        self.active = active
        self.llm = llm
        self.tools = tools

    def run_episode(self, question: str, max_steps: int = 4) -> str:
        memory: list[str] = []
        state = question

        for step in range(max_steps):
            messages = [state]

            if "P" in self.active and step == 0:
                messages.insert(0, "Planning: 列出子目标。")
            if "M" in self.active and memory:
                messages.append("Memory:\n" + "\n".join(memory[-5:]))
            if "SR" in self.active:
                messages.append("按 Observation/Thought/Action 输出。")

            if "T" in self.active:
                action = self.llm.act_with_tools(messages, self.tools)
            else:
                action = self.llm.complete(messages)

            obs = self.tools.execute(action) if "T" in self.active else ""
            if "M" in self.active:
                memory.append(f"step={step} obs={obs[:200]}")

            if "R" in self.active:
                critique = self.llm.complete(f"评估上一步: {action}\n{obs}")
                messages.append(f"Reflection: {critique}")

            state = f"{state}\n{action}\n{obs}"
            if self._is_final(action):
                break
        return self._extract_answer(state)

    def _is_final(self, action: str) -> bool:
        return "FINAL_ANSWER" in action

    def _extract_answer(self, state: str) -> str:
        return state.split("FINAL_ANSWER:")[-1].strip()


# --- 部署伪代码 ---
# profile = TaskProfile("hotpotqa", needs_tools=True, needs_math_format=False, needs_multi_hop=True)
# best = best_subset_search(profile, lambda s: dev_f1(AgentRunner(s, llm, tools)))
# assert best != {"P","T","M","SR","R"}, "论文：All-In 几乎从不最优"
```

**工程启示**：

1. **不要把 LangChain 默认模板当最优解**——先用小验证集 sweep 或至少对照 `T` vs All-In。
2. **HotpotQA 类检索任务 @ 小模型**：优先试 **仅 Tool Use**；Planning/Memory 可能是负贡献。
3. **GSM8K 类数学 @ 小模型**：试 **T+SR+R**，而非五件套。
4. 模型变大后 CCI **减弱但不消失**——仍应选 best subset，只是差距缩小。
5. 与 Microsoft Research 提出的 **tool-space interference**（工具名冲突、工具过多）是相邻问题：CCI 管「prompt 组件」，tool-space 管「MCP 工具生态」——两者都会让小模型「装太多」。

---

## 实验协议细节（复现时必读）

| 维度 | 论文设定 |
|------|----------|
| 模型 | Llama-3.1-8B/70B-Instruct（70B 用 4-bit NF4）、Qwen2.5-3B/7B、Claude Haiku 4.5 |
| Benchmark | HotpotQA（\(F_1\)）、GSM8K（exact match） |
| 每配置题量 | 100 题；关键配置 10 seeds × 100 题 |
| 推理步数 | 最多 4 steps |
| 采样 | temperature=0.1, top-p=0.9, max 256 new tokens/step |
| 统计 | paired t-test + Wilcoxon；报告 Cohen's \(d_z\)；Bayesian BF\(_{10}\) |

**稳健性**：换 prompt  paraphrase 三种变体，All-In 仍非最优；换 Qwen 家族，CCI 方向复现；长度匹配对照表明差距不是简单「context 变长」 artifact（差距仍达 6–9×）。

---

## 与相关工作的关系

| 方向 | 代表工作 | 与 CCI 论文的差异 |
|------|----------|-------------------|
| 单组件展示 | ReAct, Reflexion, Voyager | 证明「某组件有用」，未系统测 **组合** |
| 消融 | 常见 one-at-a-time ablation | 看不到 **高阶交互** 与次模违反 |
| Prompt 干扰 | instruction interference, paradoxical interference | 多为 **成对** 目标冲突；CCI 给出 **32 格全景观** |
| 组件回归 | Lauziere et al. 2026 pairwise 模型 | 同模型类；本文主效应更 parsimonious，并算 Shapley / Harsanyi |
| 工具生态 | Microsoft tool-space interference | MCP 工具过多、重名；CCI 管 **脚手架 prompt 块** |

同一时期还有 *When Does Memory Help Multi-Trajectory Inference for Tool-Use LLM Agents?*（Li & Tao, arXiv:2605.28224）从 **记忆 × 搜索策略** 二维分解记忆收益——与 CCI **正交**：CCI 问「开哪些组件」，记忆论文问「在已开组件下，记忆怎么传、传什么抽象」。

---

## 实践 checklist（给 Agent 开发者）

1. **建立 baseline 网格**：至少跑 `{T}`, `{T,SR,R}`, All-In 三种，而不是只跑 demo 最炫的全套。
2. **按任务选 \(k^*\)**：检索 QA 倾向少组件；符号推理倾向 T+SR(+R)。
3. **按模型规模调整预期**：8B 上 CCI 大，70B 上可适度加组件，但 **All-In 仍 rarely optimal**。
4. **慎用 Planning + Memory 叠在小模型检索 Agent 上**：Shapley 与 disrupt 比例都指向负贡献。
5. **别贪心堆组件**：56% 次模违反 → 用验证集 **subset search** 或 Shapley 指导，而非「有用就加」。
6. **监控 context 构成**：每组件增加了多少 token？主效应模型暗示这是主要伤害机制。
7. **记录配置向量**：生产日志里保存 `{P,T,M,SR,R}`  bitmask，方便 offline 复现 factorial 分析。

---

## 局限与开放问题

- **五个组件** 覆盖主流 taxonomy，但不含 multi-agent、code interpreter、RAG 管线粒度等。
- **两个 benchmark、有限步数**——SWE-bench 等更长程任务上 \(k^*\) 可能上移。
- **三体协同 INT₃** 标记为 exploratory，需更多 seed 与任务外推。
- 论文聚焦 **prompt-based scaffolding**，不包含 fine-tune 或 RL 训出的策略——CCI 是否存在于训后 Agent 仍待研究。
- Claude Haiku 上差距接近噪声，**不等于**「 frontier 上 All-In 最优」——只是「差距小」，All-In 仍未夺冠。

---

## 一句话总结

**LLM Agent 脚手架不是「功能越多越好」的自助餐，而是一道有交互副作用的配方题。** Cross-Component Interference 说的是：Planning、Memory 等模块会争抢同一 context 里的模型注意力；在 Llama-3.1-8B 上，HotpotQA 只要 Tool Use 就能比五件套高 32% \(F_1\)，GSM8K 则是精简的三组件组合比 All-In 高 79%。**默认全开 All-In，在论文测试的每一个设定里都是 suboptimal 的选择**——应用侧应改为任务感知、模型感知、交互感知的 **subset selection**。

---

## 延伸阅读

- 原文：[arXiv:2605.05716](https://arxiv.org/abs/2605.05716)
- 反模式梳理：[AgentPatterns — Cross-Component Interference](https://agentpatterns.ai/anti-patterns/cross-component-interference/)
- 相邻问题：[Microsoft Research — Tool-space Interference](https://www.microsoft.com/en-us/research/video/tool-space-interference-an-emerging-problem-for-llm-agents/)
- 记忆维度补充：本库笔记 [When Does Memory Help Multi-Trajectory Inference for Tool-Use LLM Agents?](/docs/papers/memory-tool-use-agents)
