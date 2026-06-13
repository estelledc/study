---
title: "MileStone 学习笔记：用 AI 解决编译器优化排序问题"
来源: https://arxiv.org/abs/2605-23435
日期: 2026-06-13
分类_原始: 编译器
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# MileStone：用 AI 解决编译器优化排序问题

## 一、从做饭说起：什么是"优化排序"

想象你在做一道菜。你可以加盐、可以大火炒、可以切小块、可以慢炖——每一个步骤都叫一个"优化手段"（optimization pass）。

关键问题来了：**步骤顺序重要吗？**

- 先切小块再洗 vs. 先洗再切小块——结果完全不同
- 先大火炒再加盐 vs. 先加盐再大火炒——味道天差地别

编译器也是一样的。它把人类写的代码（比如 C、Rust）翻译成机器能跑的指令，中间要经过很多"优化步骤"：把循环展开、把函数内联、把变量合并……**这些步骤按什么顺序执行，直接决定程序跑得快不快、占不占内存、耗不耗电。**

传统编译器的做法是：给你几个固定选项，比如 `-O1`（轻度优化）、`-O2`（中度）、`-O3`（激进）。但这就像餐厅只给你"少盐、正常、多盐"三个选项——太粗糙了。

**MileStone 要解决的核心问题就是：给定一堆优化步骤，怎样排出一个最优顺序？**

## 二、为什么这个问题很难

### 2.1 搜索空间巨大

假设有 10 个优化步骤，它们能排出的顺序有 10! = 3,628,800 种。如果增加到 20 个步骤，就是 20! ≈ 2.4 × 10¹⁸ 种可能。这还没算每个步骤可以选"用"或"不用"，组合数会爆炸式增长。

### 2.2 目标之间会打架

你可能希望程序**跑得快**、**占内存小**、**耗电少**。但这三个目标经常互相矛盾：

- 把循环展开（loop unrolling）能让程序更快，但生成的代码会变长，占更多内存
- 开启向量优化（vectorization）能大幅提升速度，但会增加能耗

这就引出了一个重要概念：**帕累托最优（Pareto Optimal）**。

### 2.3 帕累托最优是什么？

想象你在挑手机，有两个维度：性能和电池续航。

- 手机 A：性能强但续航差
- 手机 B：性能弱但续航好
- 手机 C：性能和续航都不错

手机 C 就"碾压"了 A 和 B——A 和 B 被称为"被支配"的选项。而 A、B 之间没法简单说谁更好，因为它们各有各的优劣。所有这种"没法被碾压"的手机组成的集合，就叫**帕累托最优解集**。

MileStone 的目标不是找出唯一最优解，而是找出一组帕累托最优的排序方案，让用户根据自己的需求来选。

## 三、MileStone 的核心架构

MileStone 由四个模块组成，像一条流水线：

```
源代码 → Graph Generator → GNNPP（性能预测） → RLMOE（优化探索） → 最优排序方案
                   ↑                                        ↓
                   └──────────── RLDBG（自进化数据库） ←────┘
```

### 3.1 Graph Generator（图生成器）

编译器内部有一种中间表示（IR），叫 LLVM IR。MileStone 把 LLVM IR 转换成一种**图**（Control and Data Flow Graph, CDFG）：

- 图中的每个**节点**代表一条指令
- 图中的每条**边**代表指令之间的依赖关系

举个例子，这段简单的 C 代码：

```c
int a = 5;
int b = 10;
int c = a + b;
```

在 CDFG 中大致长这样：

```
  [alloca a] ──→ [store 5 → a] ──→ [load a] ──┐
                                                  → [add a, b → c]
  [alloca b] ──→ [store 10 → b] ─→ [load b] ──┘
```

这样做的好处是：编译器不再"看"代码的文本，而是"看"代码的结构——就像从看菜谱的文字描述，变成了看菜谱的流程图。

### 3.2 GNNPP（基于 GNN 的性能预测器）

**GNN** = Graph Neural Network（图神经网络）。

你可能听过 CNN（卷积神经网络），它擅长处理图片。但图片是规则的网格，而 CDFG 是不规则的图——每个节点的邻居数量不同，也没有固定的空间顺序。CNN 处理不了这种数据。

GNN 的做法是：**让每个节点跟邻居"聊天"**。每一轮，节点收集邻居的信息，更新自己的"理解"。多聊几轮之后，每个节点就包含了周围很大范围的信息。

具体到 MileStone：

1. 每个节点被编码成一个 10 维向量
2. 第一维表示节点类型（基本块 or 指令）
3. 后九维用 one-hot 编码表示指令类型（加法、乘法、内存加载等）

```python
# 节点特征编码示例
# 一条 "add" 指令的节点特征
add_node_feature = [
    0,        # 不是基本块（是指令）
    0, 0, 0,  # alloca: no
    0, 0,     # load/store: no
    1, 0, 0   # add: yes (乘法、除法、icmp、call 都是 0)
]
```

GNN 经过多层"聊天"后，用**平均池化**（mean pooling）把图中所有节点的信息汇总成一个向量，这就是整个程序的"图嵌入"（graph embedding）。

最后，通过一个全连接网络，预测三个指标：代码大小、执行时间、能耗。MileStone 用了三个独立的 GNN 模型，每个预测一个指标。

### 3.3 RLMOE（基于强化学习的优化探索器）

这是 MileStone 的大脑部分。

**强化学习（RL）** 的核心概念：

| 概念 | 含义 | 类比 |
|------|------|------|
| State（状态） | 当前局面 | 做菜进行到哪一步了 |
| Action（动作） | 做出的决策 | 下一步放什么调料 |
| Reward（奖励） | 反馈分数 | 菜好不好吃 |
| Policy（策略） | 决策规则 | 你的做菜经验 |

RLMOE 把优化排序问题建模成一个**马尔可夫决策过程（MDP）**：

- **状态**：当前 CDFG 的图嵌入 + 元数据 + 用户指定的能耗约束
- **动作**：对当前节点应用哪个优化指令（比如"尝试内联"或"跳过"）
- **奖励**：只在最后一步给出，惩罚代码大小、惩罚执行时间、惩罚偏离目标能耗

奖励公式的核心思想：

```
奖励 = -(代码大小权重 × 代码大小) - (能耗偏差权重 × 能耗偏差) - (执行时间权重 × 执行时间)
```

奖励是负的，所以 RL 的目标就是让奖励"尽可能大"（也就是负得尽可能少，即代价尽可能小）。

MileStone 支持两种 RL 算法：

- **DQN**：学习"在每个状态下，哪个动作最好"
- **PPO**：直接学习"在某个状态下，选每个动作的概率"

实验表明，对于复杂的大型程序，PPO 比 DQN 效果更好。

### 3.4 RLDBG（自进化数据库）

RLMOE 在探索过程中，会把每次尝试的结果记录下来：

- 用了哪些优化步骤
- 排序是什么
- 最终代码大小、执行时间、能耗各是多少

这些数据形成数据库，反过来训练 GNNPP，让预测更准。预测更准了，RLMOE 探索得更快。这是一个正向循环。

## 四、代码示例

### 示例 1：GNNPP 的图嵌入流程

伪代码展示一个 CDFG 如何被变成性能预测：

```python
class GNNPP(nn.Module):
    """GNN 性能预测器"""

    def __init__(self, node_dim=10, hidden_dim=64):
        super().__init__()
        # GCN 层：让节点互相"聊天"
        self.gcn1 = GCNLayer(node_dim, hidden_dim)
        self.gcn2 = GCNLayer(hidden_dim, hidden_dim)
        # 预测头：三个独立的模型
        self.head_size = MLP(hidden_dim, 1)    # 预测代码大小
        self.head_time = MLP(hidden_dim, 1)    # 预测执行时间
        self.head_energy = MLP(hidden_dim, 1)  # 预测能耗

    def forward(self, adj, node_features):
        # 第一层 GCN：节点开始收集邻居信息
        h = self.gcn1(node_features, adj)
        h = leaky_relu(h)
        # 第二层 GCN：节点收集"邻居的邻居"的信息
        h = self.gcn2(h, adj)
        h = leaky_relu(h)
        # 平均池化：把所有节点信息压缩成一个向量
        graph_embedding = mean_pooling(h)
        # 分别预测三个指标
        code_size = self.head_size(graph_embedding)
        exec_time = self.head_time(graph_embedding)
        energy = self.head_energy(graph_embedding)
        return code_size, exec_time, energy
```

### 示例 2：RLMOE 的核心训练循环

伪代码展示强化学习探索器如何工作：

```python
def training_loop(cdfg_index, energy_target, episodes=3000):
    for episode in range(episodes):
        # 初始化：所有节点都还没有分配优化指令
        state = build_initial_state(cdfg_index, energy_target)

        for step in range(total_nodes):
            # RL 智能体观察当前状态，选择动作
            # DQN 用 ε-greedy 策略探索
            action = rl_agent.select_action(state)

            # 执行动作：把优化指令应用到当前节点
            next_state = apply_action(state, action)

            # 中间步骤没有奖励，只在最后一步评估
            if step == total_nodes - 1:
                # 用 GNNPP 快速预测性能指标
                code_size, exec_time, energy = gnnpp.predict(state)

                # 计算奖励（负值，越小越好）
                reward = -(
                    alpha * code_size +
                    beta * abs(energy - energy_target) +
                    lambda_ * exec_time
                )

            state = next_state

        # 用奖励更新 RL 智能体
        rl_agent.update(state, action, reward)
```

### 示例 3：帕累托最优的比较

假设 MileStone 为同一段代码找到了四种排序方案：

```
方案    执行时间    代码大小(KB)    能耗(J)
A       1.2s        200             5.0
B       1.4s        150             2.0
C       1.0s        300             8.0
D       2.0s        100             1.5
```

分析：
- A 比 D 更快，A 的能耗更低 → **D 被 A 支配**，排除 D
- B 和 A 比较：B 更慢但更小更省电，无法简单比较
- C 和 A 比较：C 更快但代码大得多、能耗高很多，无法简单比较
- B 比 D 更快、更大、更耗电 → **D 也被 B 支配**，排除 D

最终帕累托最优解集是：{A, B, C}。用户可以根据实际需求选择：嵌入式设备选 B，高性能服务器选 C。

## 五、实验结果

MileStone 在 PolyBench 基准测试上做了实验，关键结果：

| 指标 | MileStone-PPO | LLVM -O3 | 提升幅度 |
|------|---------------|----------|----------|
| 能耗约束匹配率 | 90-92% | 3-9% | 约 10-30 倍 |
| 同等能耗下的执行时间减少 | - | 基准 | **最多 45%** |
| 相比传统方法（GA/PSO） | - | 64-68% 匹配率 | 高出约 25% |

几个重要发现：

1. GNN 用 2 层 GCN 是最优的。层数再多会导致"过平滑"（oversmoothing）——节点的表示变得太相似，失去了区分度
2. PPO 在大型程序上优于 DQN，因为 DQN 的 critic 在状态空间变大时难以准确估计价值
3. 不同 μ 值（代码大小 vs 执行时间的权重）能灵活切换优化倾向

## 六、MileStone 的独特之处

把 MileStone 和其他方法对比：

| 方法 | 多目标优化 | 图表示 | 搜索空间 |
|------|-----------|--------|----------|
| **MileStone** | ✅ 是 | ✅ CDFG 图 | ✅ 无限制 |
| MiCOMP | ❌ 单目标 | ❌ 序列编码 | 有限 |
| POSET-RL | ❌ 单目标 | ❌ IR2Vec | 有限 |
| Shackleton | ❌ 单目标 | ❌ | ✅ 无限制 |

MileStone 是目前唯一一个同时具备**图表示 + 真正多目标优化 + 无限制搜索空间**的方法。

## 七、总结

MileStone 的核心思路可以浓缩成一句话：

> **用图神经网络理解程序结构，用强化学习探索优化排序，用多目标优化找到帕累托最优的平衡点。**

它把编译器优化从"工程师凭经验排步骤"变成了"AI 自动找最优解"，而且这个最优解不是单一的，而是一组可供用户选择的帕累托最优方案。

对于一个零基础的学习者来说，记住三个关键词就够了：

1. **图**——把代码变成节点和边的关系图
2. **GNN**——让 AI 从图中学习程序的结构特征
3. **强化学习**——让 AI 像玩游戏一样，试出最优的优化步骤排序

---

*参考论文：Amirhosein Sadr, Mehran Alidoost Nia. "MileStone: A Multi-Objective Compiler Phase Ordering Framework for Graph-based IR-Level Optimization." PLDI '26, arXiv:2605.23435.*
