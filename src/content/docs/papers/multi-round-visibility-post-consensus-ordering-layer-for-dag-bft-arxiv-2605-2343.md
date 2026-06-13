---
title: "Multi-Round Visibility: A Post-Consensus Ordering Layer for DAG-BFT"
来源: https://arxiv.org/abs/2605.23432
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# Multi-Round Visibility (MRV) — 零基础学习笔记

## 一、这篇论文在解决什么问题？

### 1.1 一个日常类比：排队结账

想象一个超市有 5 个收银台同时开放。顾客（交易）到达各个收银台，收银员（节点）决定谁先结账。问题是：

- 传统 BFT（如 PBFT）：只有一个收银台，排队顺序天然清晰。
- DAG-BFT（如 Narwhal/Tusk）：5 个收银台同时开，5 个队列一起走。系统最终要给出一个"最终执行顺序"，但这个顺序是怎么定的？是靠遍历规则还是靠某种公平证据？

这就是 DAG-BFT 的 **并发代价**：吞吐量高了，但顺序的证据变弱了。

### 1.2 DAG-BFT 的"顺序模糊"

在 Narwhal/Tusk 这样的 DAG-BFT 系统中：

1. 每个节点持续发出包含交易的"块"（称为 vertex/unit）
2. 每个块引用前一轮中至少 2f+1 个块的签名（quorum 引用）
3. 共识层选出某个"领袖块"，它指向的所有未提交块一起被提交
4. 这些被一起提交的块称为一个 **execution slice（执行片）**

问题在于：同一个 slice 内的多个块可能是**同时**被提交的，它们之间没有因果依赖。系统需要用某种规则（比如遍历顺序、确定性排序）给它们排个序。但这个顺序 **不是基于可验证的公平证据**，而是靠"怎么走遍历"决定的。

这就给 MEV（最大可提取价值）攻击开了门——攻击者可以操纵交易顺序获利。

## 二、MRV 的核心思想

MRV（Multi-Round Visibility）的核心理念非常简洁：

> **既然每个已提交的块都携带了创建者身份、轮次号和祖先引用——这些本身就是可验证的结构化证据——那为什么不直接用它们来决定顺序，而不是引入额外的公平 ordering 机制？**

换句话说：MRV 不改变共识过程，它只是在共识**之后**，对已提交的 DAG 做一层"结构化解释"，从中推导出公平的执行顺序。

### 2.1 三个关键设计点

1. **共识后解释层（Post-consensus Interpretation）**
   - MRV 运行在共识之后，不修改底层的传播、投票、提交规则
   - 它是一个即插即用的排序层

2. **AUF 级别的结构化证据**
   - AUF（Atomic Unit of Fairness）= 公平原子单元。在 Narwhal/Tusk 中，它就是一个已提交的主要块（primary vertex）
   - MRV 比较的是 AUF 之间的"可见性差距"，而不是原始交易的到达时间

3. **有界的证据认证**
   - MRV 只在 DAG 中积累有限轮次的可见性证据（bounded evidence horizon）
   - 证据不足时就暂停判断，用确定性方法填补缺失的顺序

## 三、核心概念详解

### 3.1 可见性计数（Visibility Count）

这是 MRV 最核心的概念。对每个 AUF `X`，MRV 要回答一个问题：

> **有多少个其他节点的块引用了 `X`（即 `X` 在它们的祖先链中）？**

公式如下：

```
C_X(t) = 满足以下条件的创建者 c 的数量：
  - c 在轮次 t 有一个已提交的 canonical AUF Y_{c,t}
  - X 在 Y_{c,t} 的祖先链中（X ∈ Anc(Y_{c,t})）
```

通俗理解：
- `C_X(t)` 表示"到第 t 轮为止，有多少个不同的节点'看到了' X"
- 看到的定义是：X 在它们的祖先链中（即它们的块引用了 X，或者引用了引用 X 的块）
- 因为按"创建者"计数，同一个节点多次引用 X 只算一次——防止有人通过重复引用"刷票"

### 3.2 成熟度（Maturity）

一个 AUF 被认定为"成熟"需要满足：

```
h_X = min( {t ≥ r(X) | C_X(t) ≥ 2f+1} ∪ {r(X) + W_max} )

mature(X) = true  当且仅当  C_X(h_X) ≥ 2f+1
```

解释：
- `h_X` 是 X 的"停止轮次"——要么看到 2f+1 个创建者引用了它（达到多数），要么到了最多观察 `W_max` 轮就停止
- `2f+1` 是拜占庭鲁棒性的门槛：只要大多数节点都"看到了" X，这个信号就不可伪造

### 3.3 结构性可见性优先（Structural Visibility Precedence, SVP）

这是 MRV 的公平性目标。对同一个 slice 中的两个 AUF（A 和 B）：

```
Δ(A, B, t) = C_A(t) - C_B(t)
```

A 在 B 之前（A ▷_SVP B）的条件：

1. A 和 B 都成熟了
2. 存在某个观察轮次 t，使得 Δ(A, B, t) ≥ f+1（A 比 B 多被至少 f+1 个不同创建者"看到"）
3. 不存在某个观察轮次 t，使得 Δ(B, A, t) ≥ f+1（B 没有对等的优势）

翻译成人话：
- 两个 AUF 都要有足够的"被引用数"
- 如果 A 明显被更多人引用（差距超过 f+1，足以排除恶意节点的影响），那么 A 排在 B 前面
- 如果两边各有优势或者差距不够大——MRV 就" abstain（ abstain ）"，不做证据性判断

### 3.4 执行流程：三个步骤

```
┌─────────────────────────────────────────────────┐
│  输入: 已提交的执行片 S                           │
│  输出: S 内 AUF 的确定性总序 ≺_S                  │
├─────────────────────────────────────────────────┤
│                                                  │
│  步骤 1: 证据提取 (Evidence Extractor)             │
│    → 对 S 中每个 AUF，积累多轮可见性计数           │
│    → 达到 2f+1 阈值或 W_max 轮后停止              │
│                                                  │
│  步骤 2: 成对比较 (Pairwise Comparator)            │
│    → 等 A、B 都成熟后，比较 Δ(A,B,t)              │
│    → 只在一边有明显优势时冻结判决                  │
│                                                  │
│  步骤 3: 图组装 (Graph Assembler)                  │
│    → 构建 precedence graph G_S                    │
│      - 因果边（hard causal constraints）          │
│      - SVP 边（证据支持的优先关系）               │
│    → 缩并 SCC → 拓扑排序 → 确定性补全             │
│                                                  │
└─────────────────────────────────────────────────┘
```

## 四、代码示例

### 4.1 示例一：可见性计数的计算

假设我们有 4 个节点（N1-N4），其中最多 f=1 个是恶意的。一个执行片 S 包含两个 AUF：`tx_a` 和 `tx_b`。

```python
# 模拟 MRV 的可见性积累过程

# 系统参数
F = 1                        # 最多 1 个拜占庭节点
QUORUM_THRESHOLD = 2 * F + 1 # = 3，需要 3 个不同创建者"看到"才成熟
W_MAX = 5                    # 最多观察 5 轮

# 每个 AUF 的创建信息
auf_a = {"id": "tx_a", "creator": "N1", "round": 3}
auf_b = {"id": "tx_b", "creator": "N2", "round": 3}

# 假设到第 8 轮时，各节点对该 AUF 的引用情况
# 键是创建者 ID，值是该节点是否在祖先链中包含了该 AUF
visibility_data = {
    "round_5": {
        "N1": True,   # N1 创建了 A，当然引用了自己
        "N2": False,  # N2 的块没有引用 A
        "N3": True,   # N3 引用了 A
        "N4": True,   # N4 引用了 A
    },
    "round_6": {
        "N1": True,
        "N2": True,   # N2 开始引用 A
        "N3": True,
        "N4": True,
    },
    "round_7": {
        "N1": True,
        "N2": True,
        "N3": True,
        "N4": True,
    },
}

# 计算 AUF 在每轮的可见性计数
def count_visibility(round_data):
    """计算可见性计数：有多少不同的创建者引用了这个 AUF"""
    return sum(1 for was_visible in round_data.values() if was_visible)

# AUF_A 的可见性积累
c_a_round5 = count_visibility(visibility_data["round_5"])  # 3
c_a_round6 = count_visibility(visibility_data["round_6"])  # 4
c_a_round7 = count_visibility(visibility_data["round_7"])  # 4

print(f"C_A(5) = {c_a_round5}")  # 3 ≥ 2f+1 → A 在第 5 轮就成熟了！
print(f"C_A(6) = {c_a_round6}")
print(f"C_A(7) = {c_a_round7}")

# BUF_B 的可见性积累（假设 B 被引用得慢一些）
visibility_b = {
    "round_5": {"N1": True, "N2": True, "N3": False, "N4": False},  # 2
    "round_6": {"N1": True, "N2": True, "N3": False, "N4": False},  # 2
    "round_7": {"N1": True, "N2": True, "N3": True,  "N4": False},  # 3
    "round_8": {"N1": True, "N2": True, "N3": True,  "N4": True},   # 4
}

c_b_round5 = count_visibility(visibility_b["round_5"])  # 2
c_b_round7 = count_visibility(visibility_b["round_7"])  # 3
c_b_round8 = count_visibility(visibility_b["round_8"])  # 4

print(f"C_B(5) = {c_b_round5}")  # 2 < 3 → 还没成熟
print(f"C_B(7) = {c_b_round7}")  # 3 ≥ 3 → B 在第 7 轮成熟了
print(f"C_B(8) = {c_b_round8}")

# 判断成熟度
def is_mature(c_at_stop, threshold):
    return c_at_stop >= threshold

print(f"A 成熟: {is_mature(c_a_round5, QUORUM_THRESHOLD)}")  # True
print(f"B 成熟: {is_mature(c_b_round7, QUORUM_THRESHOLD)}")  # True

# 比较可见性差距
# 在 round_7（两者都成熟后），Δ(A,B,7) = C_A(7) - C_B(7)
delta_at_round7 = c_a_round7 - c_b_round7  # 4 - 3 = 1
print(f"Δ(A, B, 7) = {delta_at_round7}")

# 判断 SVP 优先关系
SVP_THRESHOLD = F + 1  # = 2
if delta_at_round7 >= SVP_THRESHOLD:
    print(f"A ▷_SVP B: 可见性差距 {delta_at_round7} ≥ {SVP_THRESHOLD}，A 优先")
else:
    print(f"无法确定 SVP 顺序: 可见性差距 {delta_at_round7} < {SVP_THRESHOLD}，差距不够大")
```

运行结果：
```
C_A(5) = 3
C_A(6) = 4
C_A(7) = 4
C_B(5) = 2
C_B(7) = 3
C_B(8) = 4
A 成熟: True
B 成熟: True
Δ(A, B, 7) = 1
无法确定 SVP 顺序: 可见性差距 1 < 2，差距不够大
```

这说明：虽然 A 和 B 都成熟了，但它们的可见性差距只有 1，没有达到 f+1=2 的门槛，所以 MRV 不会做出证据性判断，留给确定性补全。

### 4.2 示例二：Precedence Graph 构建与拓扑排序

当 MRV 收集完所有 SVP 判决后，需要把它们整合成一个完整的排序。

```python
from collections import defaultdict, deque

# 模拟：一个执行片 S 中有 5 个 AUF
auf_ids = ["tx_a", "tx_b", "tx_c", "tx_d", "tx_e"]

# 步骤 1: 构建 precedence graph
# 边表示"必须排在前面"的关系
precedence_graph = defaultdict(set)

# 因果依赖（hard causal constraints）：
# 比如 tx_c 在因果上依赖 tx_a（tx_c 的块引用了 tx_a 所在的块）
precedence_graph["tx_a"].add("tx_c")   # tx_a 必须在 tx_c 之前
precedence_graph["tx_b"].add("tx_d")   # tx_b 必须在 tx_d 之前

# SVP 判决（evidence-backed precedence）：
# 从 MRV 的两两比较中得到
precedence_graph["tx_a"].add("tx_b")   # A ▷_SVP B: A 可见性更多
precedence_graph["tx_b"].add("tx_e")   # B ▷_SVP E: B 可见性更多

# 步骤 2: 缩并 SCC（强连通分量）
# 如果 A→B→A 形成环，说明有冲突，这些节点被缩并为一个"超级节点"
def find_sccs(graph, nodes):
    """用 Kosaraju 算法找 SCC"""
    # 第一遍 DFS，记录完成顺序
    visited = set()
    order = []

    def dfs1(node):
        stack = [(node, False)]
        while stack:
            n, processed = stack.pop()
            if processed:
                order.append(n)
                continue
            if n in visited:
                continue
            visited.add(n)
            stack.append((n, True))
            for neighbor in graph.get(n, []):
                if neighbor not in visited:
                    stack.append((neighbor, False))

    for node in nodes:
        if node not in visited:
            dfs1(node)

    # 反向图
    rev_graph = defaultdict(set)
    for src, dsts in graph.items():
        for dst in dsts:
            rev_graph[dst].add(src)

    # 第二遍 DFS
    visited.clear()
    sccs = []

    def dfs2(node):
        component = []
        stack = [node]
        while stack:
            n = stack.pop()
            if n in visited:
                continue
            visited.add(n)
            component.append(n)
            for neighbor in rev_graph.get(n, []):
                if neighbor not in visited:
                    stack.append(neighbor)
        return component

    for node in reversed(order):
        if node not in visited:
            comp = dfs2(node)
            if comp:
                sccs.append(comp)

    return sccs

sccs = find_sccs(precedence_graph, auf_ids)
print(f"SCC 分组: {sccs}")
# 输出: SCC 分组: [['tx_e'], ['tx_d'], ['tx_b'], ['tx_c', 'tx_a']]
# 或者类似的分组 —— 如果 tx_a→tx_c 且没有 tx_c→tx_a，
# 则它们不在同一个 SCC

# 步骤 3: 对缩并后的 DAG 做拓扑排序
def topological_sort(graph, sccs):
    """对缩并后的超级节点进行拓扑排序"""
    # 建立超级节点到其内容的映射
    node_to_scc = {}
    for i, scc in enumerate(sccs):
        for node in scc:
            node_to_scc[node] = i

    # 构建超级节点间的边
    scc_graph = defaultdict(set)
    scc_in_degree = [0] * len(sccs)

    for src, dsts in graph.items():
        src_scc = node_to_scc.get(src)
        for dst in dsts:
            dst_scc = node_to_scc.get(dst)
            if src_scc is not None and dst_scc is not None and src_scc != dst_scc:
                if dst_scc not in scc_graph[src_scc]:
                    scc_graph[src_scc].add(dst_scc)
                    scc_in_degree[dst_scc] += 1

    # Kahn 算法
    queue = deque()
    for i in range(len(sccs)):
        if scc_in_degree[i] == 0:
            queue.append(i)

    result = []
    while queue:
        scc_idx = queue.popleft()
        result.append(sccs[scc_idx])
        for neighbor in scc_graph[scc_idx]:
            scc_in_degree[neighbor] -= 1
            if scc_in_degree[neighbor] == 0:
                queue.append(neighbor)

    return result

sorted_sccs = topological_sort(precedence_graph, sccs)
print(f"拓扑排序: {sorted_sccs}")

# 步骤 4: 确定性补全（deterministic completion）
# 对于 SCC 内部的节点（有冲突或无证据的），按创建者 ID + 轮次 排序
def deterministic_fill(sorted_sccs):
    """SCC 内部按创建者 ID 和轮次做确定性排序"""
    # 按创建者 ID 字母序作为确定性打破平局的方式
    creator_order = {
        "tx_a": ("N1", 3),
        "tx_b": ("N2", 3),
        "tx_c": ("N1", 4),
        "tx_d": ("N2", 4),
        "tx_e": ("N3", 5),
    }

    final_order = []
    for scc in sorted_sccs:
        # SCC 内部按 (creator_id, round) 排序
        scc.sort(key=lambda x: creator_order.get(x, (x, 999)))
        final_order.extend(scc)
    return final_order

final_order = deterministic_fill(sorted_sccs)
print(f"最终执行顺序: {final_order}")
```

这个示例展示了 MRV 的第三个阶段——图组装——是如何把因果约束和 SVP 判决整合成一个完整排序的。关键理解：

1. **因果边**和 **SVP 边**混在一个图中
2. 如果有环（SCC），说明这些节点之间的顺序没有足够的证据支持
3. 先对外部做拓扑排序，再对每个 SCC 内部做确定性补全（按创建者 ID + 轮次）

## 五、MRV 的关键优势

### 5.1 不在共识关键路径上

传统方案（如 Themis、DoD）把公平排序嵌入共识流程：
- 领袖要收集全局交易排序信息
- 构建依赖图，验证，再提交易
- **增加了共识路径的延迟和通信负担**

MRV 的方案：
- 共识照旧，什么也不改
- 共识提交后，MRV 才读取已提交的 DAG，做排序
- **共识关键路径的延迟完全不受影响**

### 5.2 不需要额外的传播消息

MRV 利用的是 DAG 中**已有的**元数据：创建者 ID、轮次号、祖先引用。不需要额外的交易级传播，也不需要客户端向所有节点广播交易。

### 5.3 保守的故障模式

MRV 只在证据充分时才做出排序判断。证据不够时——
- 不假装有一个"公平"顺序
- 保留"残留不确定性"（residual ambiguity）
- 用确定性方法填补，但不会声称这是"证据支持的"顺序

## 六、评估结果

论文在 Narwhal/Tusk 原型上实现了 MRV，评估结果：

| 场景 | 节点数 | 吞吐量 |
|------|--------|--------|
| 本地部署 | 50 节点 | ~210K TPS |
| 不同 fault 设置 | 5-50 节点 | 吞吐量基本保持 |
| 不同 batch 大小 | 变化 | 影响有限 |

关键结论：MRV 的"共识后"设计确实实现了预期——**不影响共识的高吞吐特性**，同时提供了结构化的公平排序保证。

## 七、个人思考：MRV 的"保守"哲学

MRV 最令人欣赏的设计选择是它的 **保守主义**：

1. **不假设，只看证据**——只有 DAG 结构明确支持时才做排序判断
2. **不说谎**——证据不足就 abstain，不做虚假的公平性声明
3. **不改协议**——对已有的共识层保持最大程度的尊重和不打扰

这就像法庭审判：
- 传统方案：法官（领袖）自己决定谁先谁后
- Themis/DoD：法官要收集所有证人的证词再决定
- MRV：**陪审团（DAG 结构）在审判后投票**——如果多数陪审员看到某个"信号"，就记录这个信号；如果意见分歧大，就承认"证据不足"

这种"证据优先，不确定的地方留给确定性补全"的设计哲学，在分布式系统中是非常珍贵的。
