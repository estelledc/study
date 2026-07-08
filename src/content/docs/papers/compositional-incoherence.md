---
title: Compositional Incoherence — 多组件 LLM 拼出来的概率账单不守恒
来源: 'Anany Kotawala, "Locally Coherent, Globally Incoherent: Bounding Compositional Incoherence in Multi-Component LLM Agents", arXiv 2026'
日期: 2026-05-28
分类: 机器学习
难度: 中级
---

## 是什么

想象四个同学分头估算一顿饭里每个人该付多少钱：每个人只看自己那张小票时都算得很认真，但班长把四张小票一拼，发现总额变成了原账单的 250%。**Compositional Incoherence** 说的就是这种事：单个 LLM 组件的概率回答局部没毛病，组合成一个系统答案后却违反了全局概率规则。

这篇论文把这个问题命名为 **locally coherent, globally incoherent**。局部 coherent，意思是每个组件在自己看到的问题里像样；全局 incoherent，意思是拼在一起以后不再像一个合法概率分布。

作者给了一个可计算的报警器：组合残差 `epsilon*`。它衡量“拼好的概率向量”离最近的合法概率集合有多远；距离越大，系统越可能在下注、排序、资源分配里吃亏。

## 为什么重要

不理解它，下面这些事都很难解释：

- 为什么多个专家模型分别“校准”过，拼成 agent 以后仍然会给出互相打架的概率。
- 为什么 self-consistency、检索增强、让另一个 LLM 当聚合器，都不一定能修掉跨组件矛盾。
- 为什么“概率总和超过 1”不是小格式错误，而是可以被 Dutch book 利用的系统级风险。
- 为什么最便宜的修复不是多问几轮 LLM，而是把结果投影回合法概率空间。

## 核心要点

1. **局部正确不等于全局正确**。类比：每个快递员都按自己路线送对了包裹，但没人检查整栋楼的门牌是否重复。LLM agent 里，组件只看到自己的子问题，就看不到“这些子问题其实互斥、互补或相等”。

2. **`epsilon*` 是拼装后的验算距离**。类比：账单总额不对时，不只说“错了”，还量出离正确总额差多少。论文把合法概率集合看成一个围栏，`epsilon*` 就是当前答案到围栏的最短距离。

3. **修复靠投影，不靠祈祷模型更聪明**。类比：账单超了 100 元，先按规则把金额拉回总额，而不是让每个人重新猜。作者用 Boyle-Dykstra 投影，把组合后的概率确定性地拉回全局 coherent polytope。

## 实践案例

### 案例 1：四个候选项总概率超过 1

论文里最直观的例子是一个四选一预测。每个组件只判断一个候选项，所以它们都可能说“我这个挺可能”。

```python
quotes = [0.39, 0.73, 0.67, 0.71]
mass = sum(quotes)
epsilon = abs(mass - 1) / (len(quotes) ** 0.5)
print(mass, round(epsilon, 3))
```

**逐部分解释**：

- `quotes` 是四个 specialist 各自给出的概率。
- 四选一事件的总概率应该等于 1，但这里 `mass` 约等于 2.50。
- 在没有截断的 simplex 情况下，`epsilon` 约等于 0.749，正好对应论文的最大失败案例。

### 案例 2：两个否定事件也会拼坏

如果一个组件估 `P(A)=0.6`，另一个组件估 `P(not A)=0.6`，单看都像正常概率，合起来却超出 1。

```python
p_a = 0.6
p_not_a = 0.6
violation = p_a + p_not_a - 1
print(violation)
```

**逐部分解释**：

- `A` 和 `not A` 是互补事件，合法概率必须满足 `P(A) + P(not A) = 1`。
- 两个组件各自只回答一个 Bernoulli 问题，就可能看不到互补关系。
- `violation > 0` 表示系统整体已经不再是合法概率报价。

### 案例 3：上线时用阈值决定修不修

论文建议把 `epsilon*` 当运行时指标：小残差只记录，大残差触发修复或升级。

```python
def action(epsilon, tau=0.15):
    if epsilon > tau:
        return "project_or_escalate"
    return "log_only"

print(action(0.22))
```

**逐部分解释**：

- `tau` 是报警线，论文里高召回建议约 0.15。
- 超线时，用投影修复，或把案例交给更贵的流程。
- 不超线时只记录，避免把本来差不多 coherent 的答案越修越差。

## 踩过的坑

1. **把校准当成组合保证**：校准只约束单个问题的频率，原因是它不检查跨组件的互斥、包含和等式关系。

2. **以为平均所有模型就解决了**：平均确实能靠凸性回到合法集合，但原因是每个模型都要回答所有坐标，成本正好违背 specialist routing 的省钱初衷。

3. **把 prompt 修复当成确定性修复**：提示组件看见完整分区会降低残差，但原因是 LLM 仍会引入新质量，不保证每次都守恒。

4. **只看均值，不看实例级残差**：平均 Brier 可能变好，原因是高风险集中在少数大残差案例，部署时真正需要逐例报警。

## 适用 vs 不适用场景

**适用**：

- 多个 LLM 组件分别回答同一联合问题的不同部分。
- 输出是概率、置信度、候选项权重、投注比例这类可算约束的数值。
- 约束能被系统写出来，例如互斥分区、否定关系、合取、析取、共享字段相等。
- 修复成本需要低于重新调用一批 LLM 的场景。

**不适用**：

- 组件输出是开放文本，系统无法先抽出明确概率坐标。
- 跨组件约束藏在自由文本推理链里，暂时还没人把约束集合 `C` 抽出来。
- 模型本身对真实世界严重不校准；投影只能修“概率账法”，不能让错误事实变正确。
- 下游策略本身已经做了严格 coherent 化，此时额外收益会变小。

## 历史小故事（可跳过）

- **1937 年**：de Finetti 用 Dutch book 视角说明，不 coherent 的概率报价会被无风险套利。
- **1986 年**：Boyle 和 Dykstra 给出在多个凸集合交集上做投影的方法，后来成了这篇的修复工具。
- **2021 年**：conformal prediction 流行起来，大家更重视单个输出的分布无关保证。
- **2025 年**：Paleka 等人做语言模型 forecaster 的一致性检查，为这篇提供了可拆成 clique 的材料。
- **2026 年**：Kotawala 把问题推进到多组件 agent：每个组件都局部修过，组合层仍可能出错。

## 学到什么

- **agent 的风险会出现在组件之间**：单个模型没报错，不代表系统拼装没报错。
- **概率约束可以工程化**：把互斥、否定、合取这些关系写成 polytope，就能算残差和投影。
- **`epsilon*` 既是报警器也是修复量**：它告诉你离合法集合多远，也给出投影后能减少多少不一致。
- **prompt 不是万能胶**：检索、分区提示、LLM 聚合器都可能改善均值，但几何投影才是确定性兜底。

## 延伸阅读

- 论文 PDF：[Kotawala 2026 — Locally Coherent, Globally Incoherent](https://arxiv.org/pdf/2605.30335v1.pdf)。
- 相关基准：[Paleka et al. 2025 — Consistency checks for language model forecasters](https://arxiv.org/abs/2412.18544)。
- 修复工具：Boyle & Dykstra 1986，凸集合交替投影方法。
- 概率哲学源头：de Finetti 1937，Dutch book 和 coherent probability。
- [[self-consistency-2022]] —— 它修的是单题推理稳定性，不保证跨组件概率守恒。
- [[autogen]] —— 多 agent 编排越常见，越需要这种组合层检查。

## 关联

- [[code-as-agent-harness]] —— agent harness 负责把子调用拼起来，也是组合残差出现的位置。
- [[dspy]] —— DSPy 把 prompt 组织成模块，模块输出拼接后同样需要全局约束。
- [[cot]] —— CoT 关注推理过程，这篇关注多个推理结果能否组成合法概率。
- [[self-consistency-2022]] —— 多次采样能减少单模型噪声，但不能自动修跨组件约束。
- [[constitutional-ai]] —— 都是给 LLM 加外部规范；这里的规范是概率公理。
- [[debate-2018]] —— 多方模型互动不只要看谁说服谁，还要看合成答案是否 coherent。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

