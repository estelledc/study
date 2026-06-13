---
title: "TreeSeeker — 树形试探、试错与回溯的深度搜索框架"
来源: https://arxiv.org/abs/2606.11662
日期: 2026-06-13
分类_原始: AI/LLM
分类: 机器学习
子分类: 搜索
provenance: pipeline-v3
---

# TreeSeeker — 树形试探、试错与回溯的深度搜索框架

## 一、一个日常类比：在图书馆找一本"不太确定名字"的书

你走进国家图书馆，想找到一本关于"某位经济学家的某本理论"的书。你只知道大致的关键词，但不确定具体名称。

你有两种做法：

**做法 A（贪心）：** 每次只看当前看起来最相关的方向，一条路走到黑。
→ 可能一直沿着错误的线索走，浪费了时间。

**做法 B（盲目探索）：** 到处乱翻，每看到一个相关关键词就继续。
→ 信息碎片化，找不到有用的证据。

**TreeSeeker 的做法：** 像一个有策略的侦探——同时追踪多个线索（分叉），在每个线索上标记"这个方向看起来有希望""这个方向已经走不通了"，走不通时就退回到上一个分叉点，换另一条路继续。这就是"分支-回溯"（branch-and-return）。

## 二、问题背景：Deep Search 的核心难点

### 2.1 什么是 Deep Search？

Deep Search 是指 AI Agent（智能体）回答复杂问题时，需要：
1. 多次网络搜索
2. 浏览搜索结果
3. 比较不同来源的证据
4. 综合得出答案

这与简单的"搜索一次 -> 返回答案"不同，Deep Search 是一个多步过程。

### 2.2 核心挑战：方向选择

当有多个看起来都有希望的方向时，Agent 面临一个决策问题：
- 贪婪地追当前最好的方向？→ 可能陷入"弱 continuation"（一条走不通的路延伸下去）
- 无纪律地探索所有方向？→ 浪费搜索预算，信息不聚焦

**TreeSeeker 的洞察：** 搜索不应该是一条直线，而应该是一棵树。每个分叉是一个"试探性方向"，每个叶子节点是"当前线索的终点"。

## 三、核心概念

### 3.1 树形状态（Tree-Structured States）

搜索过程被组织成一棵树：

```
                    [根：问题 "谁发明了X？"]
                   /          |           \
              [分支A]      [分支B]      [分支C]
             (搜索词1)    (搜索词2)    (搜索词3)
             /    \         |           |
        [叶A1]  [叶A2]   [叶B1]     [叶C1]
      (证据1)  (证据2)   (证据3)    (证据4)
```

每个分支代表一个子目标的试探性方向。

### 3.2 文本 UCB（Upper Confidence Bound）信号

UCB 原本是一个强化学习中的公式，用于在"探索"和"利用"之间平衡：

```
UCB = 平均值 + 探索项
```

TreeSeeker 将其改编为"文本版"——用自然语言描述每个分支的：
- **Value（价值）：** 这个方向看起来有多可能找到正确答案
- **Uncertainty（不确定性）：** 我们对这个方向的了解有多少
- **Risk（风险）：** 继续走这条路的风险有多大

### 3.3 三种操作

在每个搜索回合，TreeSeeker 决定：

| 操作 | 说明 | 类比 |
|------|------|------|
| **Exploit（利用）** | 继续走看起来最有希望的分支 | 这条线索看起来有希望，继续深挖 |
| **Explore（探索）** | 探索一个有不确定性但可能有惊喜的分支 | 这个方向不确定，值得一试 |
| **Prune & Return（剪枝与回溯）** | 放弃走不通的分支，回到上一个分叉点 | 这条路走不通了，退回换一条 |

### 3.4 TreeMem：分支记忆系统

TreeMem 是 TreeSeeker 的记忆组件。它把以下内容与分支关联：
- 证据（找到的资料）
- 不确定性（对当前结论的把握程度）
- 冲突（不同来源之间的矛盾）
- 进展（已经推进了多少）
- 失败线索（哪些方向证明走不通）

这样，每次试错的结果都可以指导后续决策。

## 四、代码示例

### 4.1 示例一：树形状态的数据结构

想象我们要用 Python 来表示 TreeSeeker 的搜索树：

```python
from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum

class BranchStatus(Enum):
    ACTIVE = "active"       # 活跃：正在推进
    PROMISING = "promising" # 有希望：值得继续
    DEAD_END = "dead_end"   # 死路：需要剪枝
    SUCCESS = "success"     # 成功：找到了答案

@dataclass
class Evidence:
    """一条证据"""
    content: str
    source: str
    confidence: float  # 置信度 0.0 - 1.0

@dataclass
class Branch:
    """搜索树中的一个分支"""
    subgoal: str            # 子目标：这个分支要验证什么
    status: BranchStatus    # 当前状态
    value: float            # UCB 价值分数
    uncertainty: float      # UCB 不确定性
    risk: float             # UCB 风险分数
    evidence: List[Evidence] = field(default_factory=list)
    children: List["Branch"] = field(default_factory=list)
    parent: Optional["Branch"] = None  # 指向父节点（支持回溯）

    def add_evidence(self, content: str, source: str, confidence: float):
        """添加证据到当前分支"""
        self.evidence.append(Evidence(content, source, confidence))

    def add_child(self, subgoal: str) -> "Branch":
        """创建子分支"""
        child = Branch(
            subgoal=subgoal,
            status=BranchStatus.ACTIVE,
            value=0.0,
            uncertainty=1.0,  # 新分支，不确定性最高
            risk=0.0,
            parent=self
        )
        self.children.append(child)
        return child

    def backtrack_to(self) -> "Branch":
        """回溯到父节点"""
        if self.parent is None:
            raise ValueError("已在根节点，无法回溯")
        return self.parent

    def pruned(self):
        """标记为死路"""
        self.status = BranchStatus.DEAD_END


# 构建一个简单的搜索树
# 目标：验证"谁发明了互联网协议 TCP"
root = Branch(
    subgoal="谁发明了 TCP？",
    status=BranchStatus.ACTIVE,
    value=1.0,
    uncertainty=1.0,
    risk=0.0
)

# 第一层分叉：三个可能的方向
branched_van_jeff = root.add_child("TCP 发明者 Jeff")
branched_postel = root.add_child("TCP 发明者 Postel")
branched_vint = root.add_child("TCP 发明者 Vint Cerf")

# 第二层：在每个方向上进一步探索
branched_van_jeff.add_evidence(
    content="Jeff van 是一位网络研究者",
    source="维基百科",
    confidence=0.6
)

branched_vint.add_evidence(
    content="Vint Cerf 与 Bob Kahn 共同设计了 TCP/IP 协议",
    source="ACM 论文",
    confidence=0.95
)

# 假设发现 Jeff van 方向没有足够证据
branched_van_jeff.pruned()

# 回溯到根节点，换另一个方向
current = branched_van_jeff.backtrack_to()  # 回到根
# 然后选择 branched_vint 继续深入
```

**关键点：**
- 每个 Branch 都有 parent 指针，支持回溯（return）
- 每个分支附带 value/uncertainty/risk 三个 UCB 信号
- Evidence 与分支绑定，试错结果可以复用

### 4.2 示例二：TreeSeeker 的决策循环

这个示例展示 TreeSeeker 在每个回合如何做决策：

```python
def ucb_score(branch: Branch) -> float:
    """
    计算文本 UCB 分数，用于在"利用"和"探索"之间平衡。

    公式：UCB = value + c * uncertainty / (1 + visits) - risk

    参数：
      value:      当前分支的"价值"（看起来有多可能找到答案）
      uncertainty: 不确定性（越不确定，越值得探索）
      risk:       风险（风险越高，分数越低）
      visits:     该分支已被探索的次数
      c:          探索系数（越大越倾向于探索未知）
    """
    c = 1.4  # 探索系数，可调
    visits = len(branch.evidence)
    risk_penalty = branch.risk * 0.5  # 风险折扣

    return branch.value + c * branch.uncertainty / (1 + visits) - risk_penalty


def tree_seeker_select_branch(trees: List[Branch]) -> Branch:
    """
    从所有子目标树中选择下一个要处理的分支。

    策略：
    1. 计算每个 ACTIVE/PROMISING 分支的 UCB 分数
    2. 选择分数最高的分支
    3. 如果所有分支都是 DEAD_END，回溯到上一个分叉点

    参数：
      trees: 所有当前活跃的分支列表

    返回：
      下一个要处理的分支
    """
    # 过滤掉死路
    candidates = [
        b for b in trees
        if b.status in (BranchStatus.ACTIVE, BranchStatus.PROMISING)
    ]

    if not candidates:
        # 没有活跃分支了 -> 回溯
        raise StopIteration("所有分支已耗尽，搜索结束")

    # 按 UCB 分数排序
    scored = [(ucb_score(b), b) for b in candidates]
    scored.sort(key=lambda x: x[0], reverse=True)

    best_score, best_branch = scored[0]

    # 判断策略类型
    if best_branch.uncertainty > 0.8:
        print(f"  [探索] 选择 {best_branch.subgoal} (不确定性高: {best_branch.uncertainty})")
    elif best_branch.value > 0.7:
        print(f"  [利用] 选择 {best_branch.subgoal} (价值高: {best_branch.value})")
    else:
        print(f"  [平衡] 选择 {best_branch.subgoal} (UCB: {best_score:.2f})")

    return best_branch


def prune_dead_branch(branch: Branch, trees: List[Branch]):
    """
    剪枝死路分支，并尝试回溯。

    如果当前分支没有新证据且风险高，标记为死路，
    然后回溯到父节点，将父节点的其他未探索分支加入候选。
    """
    if len(branch.evidence) == 0 or branch.risk > 0.8:
        branch.pruned()
        print(f"  [剪枝] 放弃分支: {branch.subgoal}")

        # 回溯
        parent = branch.backtrack_to()
        print(f"  [回溯] 回到父节点: {parent.subgoal}")

        # 在父节点的其他子分支中找下一个
        if parent.children:
            for child in parent.children:
                if child.status == BranchStatus.ACTIVE:
                    ucb = ucb_score(child)
                    if ucb > branch.value:  # 如果其他分支分数更高
                        return child  # 选择它
    return branch


# --- 模拟一次完整的搜索回合 ---
print("=== TreeSeeker 搜索模拟 ===\n")

# 初始化三个子目标分支
trees = [
    Branch("TCP 发明者是谁", BranchStatus.ACTIVE, 0.6, 1.0, 0.2),
    Branch("TCP/IP 协议历史", BranchStatus.ACTIVE, 0.5, 0.8, 0.3),
    Branch("互联网协议发明者", BranchStatus.ACTIVE, 0.4, 0.9, 0.4),
]

for round_num in range(1, 4):
    print(f"\n--- 第 {round_num} 回合 ---")
    try:
        chosen = tree_seeker_select_branch(trees)
        print(f"  选中分支: {chosen.subgoal}")

        # 模拟：如果是"TCP 发明者 Jeff"分支，发现证据不足，剪枝
        if "Jeff" in chosen.subgoal:
            chosen = prune_dead_branch(chosen, trees)

    except StopIteration:
        print("  搜索完成！")
        break
```

## 五、实验与效果

TreeSeeker 在三个基准测试上验证了效果：

| 基准测试 | 说明 | 结果 |
|----------|------|------|
| **XBench-DeepSearch** | 深度搜索能力评测 | 持续优于基线 |
| **BrowseComp** | 浏览器搜索能力评测 | 持续优于基线 |
| **BrowseComp-ZH** | 中文浏览器搜索能力 | 持续优于基线 |

核心发现：**显式的"分支-回溯"控制** 可以增强（complement）更强的推理和工具执行能力。也就是说，TreeSeeker 不是替代更好的模型，而是让模型更好地"组织"自己的搜索过程。

## 六、TreeSeeker 与相关方法的对比

| 方法 | 搜索结构 | 试错能力 | 回溯能力 |
|------|----------|----------|----------|
| **Chain of Thought (CoT)** | 线性链 | 弱 | 无 |
| **Tree of Thoughts (ToT)** | 树 | 中 | 有限 |
| **React** | 线性 | 弱 | 无 |
| **TreeSeeker** | 树 + UCB 信号 | 强 | 显式支持 |

TreeSeeker 的核心贡献不是"用树来组织搜索"（ToT 已经做了），而是：
1. 用**文本 UCB 信号**（价值、不确定性、风险）来做智能的分支选择
2. 用 **TreeMem** 把试错结果与分支绑定，实现可复用的经验
3. 显式的**分支-回溯循环**，支持"走不通就退回"的纪律性

## 七、总结：TreeSeeker 教会我们的一件事

**好的搜索不是"一直往前冲"，而是"知道什么时候该退"。**

TreeSeeker 把人类解决问题的策略形式化了：
1. 同时追踪多个线索（分支）
2. 用证据评估每条线索的价值（UCB）
3. 走不通时，有纪律地退回（prune & return）
4. 记住哪些路已经试过（TreeMem）

这种"分支-试探-回溯"的模式，不仅适用于 AI Agent 的搜索，也适用于我们日常的学习和问题解决——当你发现一条学习路线走不通时，不要硬扛，退回上一个知识点，换一条路继续。
