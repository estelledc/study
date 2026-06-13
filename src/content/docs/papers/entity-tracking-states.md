---
title: Do Language Models Track Entities Across State Changes? — 零基础学习笔记
来源: https://arxiv.org/abs/2605.30233
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 从日常类比开始：仓库管理员 vs 考前突击翻笔记

想象你是仓库管理员，有 7 个箱子，每个箱子里放着若干物品。早上交接班时，同事一口气告诉你：

> 苹果在 0 号箱，桃子在 1 号箱，钟表和罐子在 2 号箱……

接着一整天又发生多件事：把手表放进 1 号箱、从 2 号箱拿走罐子、把 0 号箱的苹果移到 1 号箱……

下班前老板问：**「1 号箱里现在有什么？」**

人类通常会怎么做？两种策略：

1. **增量记账（incremental）**：每听到一条操作，就在脑子里更新一张「全局库存表」——7 个箱子各自装了什么，随时可查。
2. **延迟汇总（non-incremental）**：平时不维护完整表格；问题出现时，回头把相关句子在脑子里**并行翻一遍**，拼出答案。

**Do Language Models Track Entities Across State Changes?**（Tang 等，ICML 2026，arXiv:[2605.30233](https://arxiv.org/abs/2605.30233)）用机制可解释性方法证明：主流 Transformer 语言模型更像第二种——它们面对的是一个**本质上是顺序更新状态**的任务，却用**非顺序的「查询时再聚合」**策略来应付。

更扎心的是：`REMOVE`（移除）操作背后不是「从某个箱子精确删掉某物」，而是一种脆弱的**全局抑制标签（global suppression tag）**——对象一旦被标成「要删」，模型倾向于在**整个上下文**里都不再预测它。在原始 benchmark 上这常常「碰巧正确」，换几个刁钻场景就会翻车。

一句话：**模型会答题，不等于模型在心里维护了一张正确的世界状态表。**

---

## 这篇论文在解决什么问题

### 1. 实体追踪（Entity Tracking, ET）是什么

**实体追踪**：在叙述 unfolding 的过程中，持续知道「谁在哪里、有什么属性、状态如何变化」。它是下棋、长对话、多步推理、程序执行等能力的底层积木。

此前工作大量研究 **entity binding**（静态绑定）：「苹果在 1 号箱」→ 问「1 号箱里有____」时模型如何找回「苹果」。Kim & Schuster (2023) 的 **box dataset** 把任务扩展到 **PUT / REMOVE / MOVE** 等**会改变世界状态**的操作，但「真实规模预训练模型在自然语言里**如何实现**这些状态变更」仍不清楚。

### 2. 两条研究脉络的空白

| 脉络 | 典型工作 | 局限 |
|------|----------|------|
| 玩具模型 + 合成语言 | Merrill et al. 2024; Li et al. 2025 | 层数/token 极限分析，难直接迁移到 Llama/CodeLlama |
| 预训练模型 + binding 机制 | Prakash et al. 2024; Feng & Steinhardt 2023 | 多研究**无状态变更**的「look-back」电路 |

本文填补：**非玩具 LM + 自然语言 + 多种状态变更 + 行为与机制双向验证**。

### 3. 核心问题

- 模型是**逐 token / 逐层**累积世界状态，还是**等到 query 出现再一次性聚合**？
- `PUT`、`REMOVE`、`MOVE` 各自在残差流里如何实现？
- 机制分析能否**预测**标准测试里看不到的失败模式，并**干预修复**？

---

## 实验任务长什么样

论文沿用 Kim & Schuster (2023) 的 box 格式。一个完整样例：

```text
The apple is in Box 0, the peach is in Box 1, the clock and the jar is in Box 2,
the television is in Box 3, the brain is in Box 4, the book is in Box 5,
the pin is in Box 6.
Put the watch into Box 1.
Remove the jar from Box 2.
Move the apple in Box 0 to Box 1.
Box 1 contains the
```

结构拆成三段：

| 段落 | 含义 |
|------|------|
| **DESCRIPTION** | 初始世界：7 个箱子、最多每箱 3 个物体（从 100 个物体名池中采样） |
| **OPERATIONS** | 状态变更：`PUT` 放入新物、`REMOVE` 从某箱移除、`MOVE` 等价于移出+移入 |
| **QUERY** | 问指定箱子内容，模型需自回归补全物体列表 |

研究模型：**Gemma-2-2B**、**CodeLlama-13B**（机制分析主力）、**Llama-3.1-70B**（多操作行为）。代码开源：[PootieT/entity-tracking-mi](https://github.com/PootieT/entity-tracking-mi)。

---

## 核心发现一：非增量追踪（Non-incremental Tracking）

### 假设对照

**跨 token（H1 vs H2）**

- **H1（增量全局）**：从左到右读上下文时，最后一 token 的隐状态里编码了**所有箱子**的完整世界状态。
- **H2（查询时局部）**：只有被问到的箱子相关信息，在 **query 变得明确之后**才动态拼起来。

**方法**：在 query 前最后一个 token（`the`）的残差流上训练线性 probe：

- **Global probe**：对每个物体，预测它在哪个箱子（8 类，含「不在任何箱」）。
- **Local probe**：对每个物体，预测它**是否在被查询的箱子**里（二分类）。

**结果（CodeLlama-13B）**：Local probe 非平凡准确率接近 **0.9**；Global probe 仅约 **0.3**（随机约 0.12）。说明模型**没有**维护可解码的全局状态表，但**能**解码「当前问的这个箱子」的局部答案。

**跨层（H3 vs H4）**

- **H3**：若按层顺序处理多次局部操作，**更早的 prior state** 应在**更浅层**更可解码。
- **H4**：多次操作在**同一层段并行**聚合，prior 与 final state 的 probe 峰值层相近。

实验支持 **H4**：看不到「越早的状态越早出现在浅层」的清晰阶梯，而是 query 末尾**并行**整合。

### 直觉总结

```text
你以为：  DESCRIPTION → 更新状态 → OPERATION₁ → 更新 → … → QUERY → 读出
实际上：  DESCRIPTION + 所有 OPERATION →（几乎不维护表）→ QUERY 的 "the" → 并行捞信息 → 生成
```

这与「自回归 = 逐步推理」的朴素想象不一致：**显式提到实体名**时，模型更倾向 lazy aggregation，而非 simulation。

---

## 核心发现二：三种操作的机制

### PUT：像「实体绑定电路」的亲戚

`PUT` 往已有箱子里**加入新物体**。作者用 **path patching** 追踪注意力头，复现 Prakash et al. (2024) 的四组头 **A/B/C/D**：

| 组 | 位置与作用（简化） |
|----|-------------------|
| **A** | 末 token、深层：抬高目标物体 logit |
| **B** | 末 token、中层：把目标物体的 **order ID**（出现顺序）传给 A |
| **C** | query 里的 box ID、中层：传递位置信息给 B |
| **D** | 早期 box ID：扫 DESCRIPTION，绑定物体与箱子 |

**PUT 与 DESCRIPTION 共用功能等价的子空间**传递位置信息（DCM + 子空间 patching），但具体注意力头集合重叠有限——**机制相似，实现不同**。

### REMOVE：全局抑制标签（最反直觉）

正确 `REMOVE` 应让被删物体**不再被预测**。分析发现：

1. 有 `REMOVE` 时，上下文里多数物体 logit **整体上升**（模型在「抬高提到过的物体」）。
2. 被删物体的上升幅度**明显更小** → **相对排名下降** → 生成时被抑制。
3. 关键：**即使 REMOVE 针对的不是当前 query 的箱子**，被删物体仍被抑制 → **全局移除（Global Remove）**，而非「从某箱局部删除」。

作者用 **三元 probe** 在物体/box token 上探测 `{不存在, 存在, 已移除}` 状态，发现 **object token 上的 remove tag** 因果有效；对 box ID 干预往往无效。`MOVE` 可理解为：对源箱加 remove tag，对目标箱加 exist tag。

### 为什么原 benchmark 测不出 bug

原数据集约定：**每种物体在全仓库只出现一次**。全局删掉「罐子」与「从 2 号箱删掉罐子」在行为上等价——机制退化被数据设计**掩盖**了。

---

## 机制预测的新失败模式

论文设计三类**原 box 数据没有**的诊断场景：

| 场景 | 例子要点 | 全局 REMOVE 为何失败 |
|------|----------|----------------------|
| **No-op Remove** | 帽子在 3 号箱，却写「从 0 号箱移除帽子」 | 仍全局抑制帽子，问 3 号箱时答错 |
| **Shared-label** | 0 号与 3 号箱都有 pill，只应从 0 号移除 | 两个 pill 都被抑制 |
| **Re-introduce** | 移除桃子后又 PUT 回 0 号箱 | 标签强度衰减 + 忽略操作顺序 |

**Degeneration Rate (DR)** 在这些场景上很高（13B 上 No-op 约 **84%**）。对 object token 的 remove tag 做 **null-space 干预**可部分修复前两类（干预成功率 IS 约 **66–73%**），Re-introduce 更难（需正确排序多次操作）。

这也为 **Chain-of-Thought 改善 ET** 提供机制假说：CoT 把长上下文拆短，减轻 remove tag 随距离衰减（论文 Fig. 8：Box ID 条件 probe 准确率随操作链变长而下降）。

---

## 代码示例 1：用 Python 模拟 box 世界（正确 vs 全局 REMOVE）

下面是一个**教学用**的极简世界状态机，对比「局部正确 REMOVE」与论文描述的「全局错误 REMOVE」：

```python
from dataclasses import dataclass, field
from typing import Dict, Set, List

@dataclass
class BoxWorld:
    """增量维护：每个箱子一个集合 —— 人类/正确算法应有的样子。"""
    boxes: Dict[int, Set[str]] = field(default_factory=dict)

    def put(self, box: int, obj: str) -> None:
        self.boxes.setdefault(box, set()).add(obj)

    def remove_local(self, box: int, obj: str) -> None:
        if box in self.boxes:
            self.boxes[box].discard(obj)

    def query(self, box: int) -> List[str]:
        return sorted(self.boxes.get(box, set()))


class GlobalRemoveLM:
  """模仿论文中的退化机制：REMOVE 在物体名上打全局抑制标签。"""
    def __init__(self, world: BoxWorld):
        self.world = world
        self.globally_removed: Set[str] = set()

    def remove_global(self, box: int, obj: str) -> None:
        # 注意：忽略 box，只要提到 remove obj 就全局封禁
        self.globally_removed.add(obj)
        self.world.remove_local(box, obj)  # 局部也会删，但查询逻辑被全局集覆盖

    def query_logits(self, box: int) -> Dict[str, float]:
        scores = {o: 1.0 for o in self.world.query(box)}
        for o in list(scores):
            if o in self.globally_removed:
                scores[o] = -1e9  # 全局抑制：不管在哪个箱
        return scores


# Shared-label 场景
w = BoxWorld()
w.put(0, "pill")
w.put(3, "pill")

lm = GlobalRemoveLM(w)
lm.remove_global(0, "pill")  # 只想从 0 号箱移除

print("正确局部 query(3):", w.query(3))           # ['pill']
print("全局 REMOVE query(3) 存活:", "pill" in lm.query_logits(3))  # False — 退化
```

运行后你会看到：局部状态机认为 3 号箱仍有 `pill`，但「全局 REMOVE LM」在问 3 号箱时也会把 `pill` 压死——这正是论文 Table 1 中高 DR 的行为根源。

---

## 代码示例 2：线性 Probe 思路（概念复现）

论文用线性 probe 区分 global vs local 表征。零基础可以理解成：**在固定层、固定 token 的隐向量上训练 logistic 回归，看能否解码某种结构信息**。

```python
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# X[i]：第 i 条样本在「query 前 the」token、第 layer 层的残差向量（示意）
# y_global[i]：物体 j 在哪个箱子（0-7）
# y_local[i]：物体 j 是否在被查询的箱子里（0/1）

def train_probe(X, y, label: str) -> float:
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=0)
    clf = LogisticRegression(max_iter=1000, class_weight="balanced")
    clf.fit(X_tr, y_tr)
    acc = accuracy_score(y_te, clf.predict(X_te))
    print(f"{label} probe accuracy: {acc:.3f}")
    return acc

# 论文定性结论（CodeLlama-13B, layer 中段）可概括为：
# local  >>  global（约 0.9 vs 0.3 非平凡准确率）
rng = np.random.default_rng(42)
N, D = 500, 512
X_fake = rng.normal(size=(N, D))
y_local = rng.integers(0, 2, size=N)
y_global = rng.integers(0, 8, size=N)

train_probe(X_fake, y_local, "local (illustrative)")
train_probe(X_fake, y_global, "global (illustrative)")
```

真实实验需从模型 forward hook 提取残差流（仓库用 TransformerLens / NNsight）。要点不在绝对数字，而在**同一表征位置上 local 远强于 global**——这是拒绝 H1、支持 H2 的关键证据链。

---

## 方法工具箱（读论文时的「地图」）

| 工具 | 用途 | 本文中的角色 |
|------|------|----------------|
| **Linear probing** | 检测隐状态是否编码某变量 | Global/local/prior state、三元 remove tag |
| **Path patching** | 因果追踪注意力头对 logit 的贡献 | PUT/DESCRIPTION 电路 A–D |
| **DCM + 子空间 patching** | 找传递 order ID 的低维子空间 | PUT 与 DESCRIPTION 子空间重叠 |
| **Logit/rank diff** | 比较有无 REMOVE 时排名变化 | 发现全局抑制而非局部删除 |
| **Amnesic probing 干预** | 投影到 probe 零空间，抹除信号 | 验证 remove tag 因果性、部分修复 DR |

---

## 与相关工作的关系

```text
Kim & Schuster 2023 — box benchmark，证明 LM 有一定 ET 能力
        ↓
Kim et al. 2024 — 代码预训练显著提升 ET
        ↓
Prakash et al. 2024 — binding「look-back」电路（无状态变更）
        ↓
本文 2605.30233 — 状态变更 + 非增量聚合 + REMOVE 全局退化
        ↓
可延伸 — CoT/外部记忆/状态空间模型是否更接近增量 simulation？
```

玩具模型文献（Li et al. 2025）曾发现微调小模型可**按层**聚合置换状态；本文在**预训练大模型 + 显式实体名**设定下得到相反图景——说明**任务表述与训练分布**会根本改变内部算法。

---

## 对工程与应用的启示

### 1. 行为准确率 ≠ 可靠状态推理

在 box 类基准上「看起来会追踪」的模型，可能只是在 query 点做**启发式检索 + 标签抑制**，并未维护可复用的世界模型。部署到 Agent、游戏、机器人规划时，应用**机制启发的对抗样例**（no-op remove、重复标签、重新引入）做红队测试。

### 2. 长上下文多步操作的风险

Remove tag 随操作链变长而变弱（Box ID probe 线性下降），但 object token 上的退化信号相对稳定——模型更依赖**脆弱的物体级全局标签**。拆分子步骤（CoT）、缩短每段上下文、或引入**显式状态变量**（JSON/数据库/符号模块）可能更稳。

### 3. 训练与架构方向

论文讨论：是否在预训练中鼓励**潜式计算完整世界状态**（latent world states）、是否用**外部记忆**卸载 ET、以及 SSM/递归结构是否更适合真·增量追踪。对 RAG/Agent 设计者：不要把「LLM 读过就等于记住了正确状态」当作默认假设。

---

## 局限与开放问题

- 机制分析主力是 **CodeLlama-13B**；更大模型行为更好但退化仍在（70B Shared-label DR 仍约 **27%**）。
- **REMOVE 的完整电路**尚未像 PUT 那样被 path patching 精确定位（附录 H.14 负面结果）。
- 任务虽自然语言，但仍属**受控合成域**；国际象棋、真实对话中的 ET 是否同机制未知。
- 干预修复是 **proof-of-concept**，未形成可部署的推理时补丁。

---

## 一句话带走

| 维度 | 结论 |
|------|------|
| 任务 | 自然语言 box 世界中的 PUT/REMOVE/MOVE 实体追踪 |
| 策略 | **非增量**：query 末 token 并行聚合，非逐 token 建世界表 |
| PUT | 类似已知 binding 电路，共享 order-ID 子空间 |
| REMOVE | **全局 remove tag** 抑制物体，非按箱局部删除 |
| 价值 | 机制预测新失败 → 设计更强评测 + 可干预修复 |
| 元教训 | **行为与机制分析应闭环**：测得准不够，还要问「怎么实现的、会在哪翻车」 |

---

## 参考资料

- 论文：[arXiv:2605.30233](https://arxiv.org/abs/2605.30233) | [HTML 版](https://arxiv.org/html/2605.30233v1)
- 代码：[github.com/PootieT/entity-tracking-mi](https://github.com/PootieT/entity-tracking-mi)
- Box 基准：Kim & Schuster, *Entity Tracking in Language Models*, ACL 2023
- Binding 电路：Prakash et al., 2024/2025 look-back 系列
- ICML 2026 Poster：[icml.cc/virtual/2026/poster/64207](https://icml.cc/virtual/2026/poster/64207)
