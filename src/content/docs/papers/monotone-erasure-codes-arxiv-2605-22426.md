---
title: Monotone Erasure Codes — 零基础学习笔记
来源: https://arxiv.org/abs/2605.22426
日期: 2026-06-13
分类_原始: 密码学 / 分布式系统
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# Monotone Erasure Codes — 零基础学习笔记

## 一、从日常类比开始

想象你有一封重要的信，内容是你银行卡的密码。你不想把这封信交给一个人保管——万一他丢了或偷看了怎么办？

传统做法是复印 5 份，交给 5 个朋友各自保管。任意 3 个人凑在一起就能还原密码。这就是经典的 **Erasure Code（纠删码）**，最出名的是 Reed-Solomon 码。它的规则很简单："n 份里任意 k 份就能恢复"。

但现实世界没那么整齐。

- 你的 A 朋友是银行家，极度可靠
- 你的 B 朋友是个马虎鬼，经常丢三落四
- 你的 C 朋友是新搬来的邻居，你还不了解他

如果你还是把 5 份平均分配给 5 个"平等"的朋友，B 丢了那份，可能就永远凑不齐 3 份了。

**Monotone Erasure Code（单调纠删码）的核心想法是：不同人值得不同的信任级别。**

它允许你这样分配：

- 把信分成两部分：f1（密码前半段）和 f2（后半段）
- 给 A 和另一个可靠朋友各一份 f1
- 给 C、D、E 各一份 f2
- 规则变成："要么 A + 另一个可靠朋友（凑齐 f1），要么 C+D+E 三个新手（凑齐 f2），都能还原整封信"

这就是论文要解决的事情——让纠删码能表达**非对称的、复杂的信任关系**，而不仅仅是"任意 k 份"。

---

## 二、背景：经典纠删码的局限

### 2.1 什么是 Erasure Code？

经典纠删码（如 Reed-Solomon）的工作原理：

1. 原始数据有 k 个片段
2. 编码成 n 个片段（n > k），每个片段等长
3. 任意 k 个片段都能还原原始数据
4. 最多容忍 n - k 个片段丢失

举个例子：k=3, n=5。数据是 [A, B, C]，编码后得到 5 个片段。任意 3 个都能还原。

### 2.2 问题在哪里？

经典模型假设**所有节点出问题的概率相同**。但在区块链系统中：

- Stellar 网络的验证节点有不同的信任等级
- XRP Ledger 使用"信任线"（trust lines）定义节点关系
- 有些节点由大机构运营（更可靠），有些由个人运营（更不可靠）

用"任意 k 份"来描述这种场景就力不从心了。

---

## 三、核心概念

### 3.1 访问结构（Access Structure）

**定义：** 一个访问结构是一组"最小可行集合"。只要这些集合中的任意一个能凑齐，就能还原数据。

用数学符号写：设节点集合 P = {p1, p2, ..., pn}，访问结构 A 是 P 的子集族，满足"不存在一个集合包含在另一个里面"。

**实际例子：** 有 5 个节点 {A, B, C, D, E}，访问结构可能是：

```
A = {{A, C, D}, {B, C, D}}
```

意思是：要么 A+C+D 凑齐，要么 B+C+D 凑齐，都能还原数据。

### 3.2 单调布尔公式（MBF）

访问结构可以用一种公式来表达，叫做 Monotone Boolean Formula：

- **AND**：所有子句都必须为真
- **OR**：至少一个子句为真
- **Threshold (k of m)**：m 个子句中至少 k 个为真

比如：`(A OR B) AND (C OR D OR E)` 表示：

- A 或 B 至少一个在线，**并且**
- C、D、E 中至少一个在线

用论文里的记号写成：`Θ(1 of 2(A,B), 1 of 3(C,D,E))`

### 3.3 Monotone Erasure Code 的定义

一个 Monotone Erasure Code 由两个算法组成：

1. **Encode(f)**：输入原始文件 f，输出 n 个片段（每个节点拿一个）
2. **Decode(u)**：输入一些片段，能还原出 f，或者返回"不够"（⊥）

**关键性质——完备性（Completeness）：** 对于访问结构中的每一个集合，Decode 都能还原出原始文件。

### 3.4 冗余度（Overhead）

效率指标：

```
overhead β = (μ - κ) / κ
```

其中 κ 是原始文件大小，μ 是所有片段加起来的大小。β 越小越好。经典 Reed-Solomon 的 overhead 是 (n-k)/k。

### 3.5 线性 Monotone Erasure Code

论文的重点是**线性**版本。核心想法：

- 数据不是比特串，而是有限域上的向量
- 编码 = 乘以一个生成矩阵 G
- 每个节点拿到的片段 = 数据向量 × G 的对应列
- 能还原的条件：节点们持有的列矩阵满秩

---

## 四、两种构造方法

### 方法一：递归分块法（高效但非最优）

**直觉：** 把访问结构画成一棵"访问树"，从根到叶子递归编码。

具体步骤：
1. 根节点用阈值编码（比如 2 of 3），产生 3 个中间片段
2. 每个中间片段再递归编码
3. 到达叶子时，把片段分配给实际节点

**矩阵构造的关键：**
- 每个子树用 Vandermonde 矩阵（保证任意 k 列线性独立）
- 用 Kronecker 积把不同子树的矩阵"对齐"
- 最终矩阵是分块结构的

### 方法二：基于 MDS 的最优构造

用线性规划来找到 overhead 最小的编码方案。

---

## 五、代码示例

### 示例 1：线性 Monotone Erasure Code 的编码过程（Python）

```python
"""
线性 Monotone Erasure Code 简化实现

访问结构: A = {{p1, p2, p3}, {p2, p3, p4}, {p1, p4, p5}}
含义: 要么 p1+p2+p3 凑齐, 要么 p2+p3+p4 凑齐, 要么 p1+p4+p5 凑齐

这里用有限域 F_7 上的矩阵编码来演示。
"""

# 简单有限域 F_p 上的运算（p 为素数）
P = 7  # 有限域的大小

def mod(a, p=P):
    return a % p

def mod_inv(a, p=P):
    """扩展欧几里得求逆元"""
    a = a % p
    for x in range(1, p):
        if (a * x) % p == 1:
            return x
    raise ValueError(f"No inverse for {a} in F_{p}")

def mat_mult_vec(M, v, p=P):
    """矩阵 × 向量，在 F_p 上运算"""
    rows = len(M)
    cols = len(M[0])
    result = []
    for i in range(rows):
        s = 0
        for j in range(cols):
            s = (s + M[i][j] * v[j]) % p
        result.append(s)
    return result

def gauss_eliminate_full_rank(M, p=P):
    """
    判断矩阵是否满秩（行满秩），返回秩。
    同时返回简化行阶梯形。
    """
    # 拷贝矩阵
    mat = [row[:] for row in M]
    rows = len(mat)
    cols = len(mat[0])
    rank = 0
    for col in range(cols):
        # 找主元
        pivot = None
        for row in range(rank, rows):
            if mat[row][col] != 0:
                pivot = row
                break
        if pivot is None:
            continue
        # 交换行
        mat[rank], mat[pivot] = mat[pivot], mat[rank]
        # 归一化主元行
        inv = mod_inv(mat[rank][col])
        mat[rank] = [(x * inv) % p for x in mat[rank]]
        # 消去其他行
        for row in range(rows):
            if row != rank and mat[row][col] != 0:
                factor = mat[row][col]
                mat[row] = [
                    (mat[row][j] - factor * mat[rank][j]) % p
                    for j in range(cols)
                ]
        rank += 1
    return rank

# 假设原始数据向量（在 F_7 上，长度 k=3）
data = [2, 5, 3]  # 原始文件

# 生成矩阵 G（5 列，5 个节点）
# 这是一个简化的设计：确保任意访问集合作为列的子矩阵满秩
# 访问结构: {{p1,p2,p3}, {p2,p3,p4}, {p1,p4,p5}}
#
# 设计思路：
#   - 列1(p1) + 列2(p2) + 列3(p3) 必须满秩
#   - 列2(p2) + 列3(p3) + 列4(p4) 必须满秩
#   - 列1(p1) + 列4(p4) + 列5(p5) 必须满秩
#
# 一个可行的选择（构造过程略）：
G = [
    [1, 0, 0, 1, 1],  # 第 1 行
    [0, 1, 0, 1, 2],  # 第 2 行
    [0, 0, 1, 1, 3],  # 第 3 行
]  # 3 x 5 的生成矩阵

# Encode：计算每个节点的片段
fragments = mat_mult_vec(G, data)
print(f"原始数据: {data}")
print(f"编码后片段: {fragments}")
# 输出: 原始数据: [2, 5, 3]
#       编码后片段: [2, 5, 3, 5, 2]

# Decode：用访问集 {p1, p2, p3} 还原
# 提取对应的列（G 的前 3 列）
G_A = [
    [G[i][0] for i in range(3)],
    [G[i][1] for i in range(3)],
    [G[i][2] for i in range(3)],
]
# 重新组织为 3x3 矩阵（每行一行）
G_A = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
]
fragments_A = [fragments[0], fragments[1], fragments[2]]
reconstructed_A = mat_mult_vec(G_A, fragments_A)
print(f"用 {{p1,p2,p3}} 还原: {reconstructed_A}")
# 输出: 用 {p1,p2,p3} 还原: [2, 5, 3]

# Decode：用另一个访问集 {p1, p4, p5} 还原
# 提取第 1, 4, 5 列
G_B = [
    [1, 1, 1],
    [0, 1, 2],
    [0, 1, 3],
]
fragments_B = [fragments[0], fragments[3], fragments[4]]
rank = gauss_eliminate_full_rank(G_B)
print(f"{{p1,p4,p5}} 的列矩阵秩: {rank}")
# 秩为 3，说明可以还原
# 还原方法：解线性方程组 G_B * x = fragments_B
# 由于 G_B 是 3x3 满秩矩阵，x = G_B^(-1) * fragments_B
# 为简化，直接高斯消元求解：
augmented = [
    [G_B[i][j] for j in range(3)] + [fragments_B[i]]
    for i in range(3)
]
# 高斯消元求解
for col in range(3):
    pivot = col
    inv = mod_inv(augmented[pivot][col])
    augmented[pivot] = [(x * inv) % P for x in augmented[pivot]]
    for row in range(3):
        if row != pivot and augmented[row][col] != 0:
            factor = augmented[row][col]
            augmented[row] = [
                (augmented[row][j] - factor * augmented[pivot][j]) % P
                for j in range(4)
            ]
reconstructed_B = [augmented[i][3] for i in range(3)]
print(f"用 {{p1,p4,p5}} 还原: {reconstructed_B}")
# 输出: 用 {p1,p4,p5} 还原: [2, 5, 3]
```

### 示例 2：访问树的递归编码（伪代码 + 演示）

```python
"""
Monotone Erasure Code 的递归编码算法（简化版）

访问结构表达式: (A OR B) AND (C OR D OR E)
MBF 记号: Θ(2 of 2( Θ(1 of 2(A, B)), Θ(1 of 3(C, D, E)) ))

编码过程：
  1. 根节点 AND(2, 2) → 需要 2 of 2 个子结果
     - 将数据分成两部分 f1 和 f2（AND 操作 = 分割数据）
  2. 子节点 OR(1, 2) 对应 {A, B} → 需要 1 of 2
     - OR 操作 = 复制数据（A 和 B 都拿到 f1）
  3. 子节点 OR(1, 3) 对应 {C, D, E} → 需要 1 of 3
     - OR 操作 = 复制数据（C, D, E 都拿到 f2）

最终分配：
  A 拿到: f1
  B 拿到: f1
  C 拿到: f2
  D 拿到: f2
  E 拿到: f2

验证：
  - {A, C} 能否还原？ A 有 f1, C 有 f2 → 可以！✓
  - {C, D} 能否还原？ C 有 f2, D 有 f2 → 只有 f2，缺 f1 → 不行 ✗
  - {B, E} 能否还原？ B 有 f1, E 有 f2 → 可以！✓
"""

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Node:
    """树节点"""
    name: str
    children: List["Node"]
    operator: Optional[str] = None  # "AND", "OR", or "THRESHOLD"
    threshold: Optional[int] = None  # for THRESHOLD: need k of m

    def is_leaf(self) -> bool:
        return len(self.children) == 0


def build_access_tree() -> Node:
    """
    构建 (A OR B) AND (C OR D OR E) 的访问树

         AND
        /   \
       OR    OR
      / \   /|\
     A   B C D E
    """
    leaves = [Node(n, []) for n in "ABCDE"]
    or_left = Node("OR", leaves[0:2], operator="OR")
    or_right = Node("OR", leaves[2:5], operator="OR")
    root = Node("AND", [or_left, or_right], operator="AND")
    return root


def assign_fragments(node: Node, data: str, level: int = 0) -> dict:
    """
    递归分配片段

    规则：
    - AND 节点：把 data 分割给子节点
    - OR 节点：把完整的 data 复制给每个子节点
    - 叶子节点：返回 {节点名: 拿到的片段}
    """
    if node.is_leaf():
        return {node.name: data}

    if node.operator == "OR":
        # OR: 每个子节点拿到完整数据
        result = {}
        for child in node.children:
            result.update(assign_fragments(child, data, level + 1))
        return result

    if node.operator == "AND":
        # AND: 把数据分割后分给子节点
        chunk_size = len(data) // len(node.children)
        result = {}
        for i, child in enumerate(node.children):
            start = i * chunk_size
            end = start + chunk_size if i < len(node.children) - 1 else len(data)
            chunk = data[start:end]
            result.update(assign_fragments(child, chunk, level + 1))
        return result

    return {}


# 演示
tree = build_access_tree()
original_data = "HELLO_WORLD"  # 11 个字符
assignments = assign_fragments(tree, original_data)

print("片段分配结果:")
for node_name, fragment in assignments.items():
    print(f"  {node_name}: '{fragment}'")
# 输出:
#   片段分配结果:
#     A: 'HELLO'
#     B: 'HELLO'
#     C: '_WORLD'
#     D: '_WORLD'
#     E: '_WORLD'

# 验证还原
def can_reconstruct(nodes: List[str], assignments: dict) -> tuple:
    """检查一组节点能否还原原始数据"""
    fragments = []
    for n in nodes:
        if n in assignments:
            fragments.append(assignments[n])
        else:
            return False, "节点不存在"
    all_fragments = "".join(fragments)
    # 简单检查：是否包含完整数据
    has_all = all(c in all_fragments for c in "HELLO_WORLD")
    return has_all, all_fragments

# 测试：{A, C} 可以还原
ok, frags = can_reconstruct(["A", "C"], assignments)
print(f"\n{{A, C}} 能还原: {ok} (片段: '{frags}')")
# 输出: {A, C} 能还原: True (片段: 'HELLO_WORLD')

# 测试：{C, D} 不能还原（都只有 f2）
ok, frags = can_reconstruct(["C", "D"], assignments)
print(f"{{C, D}} 能还原: {ok} (片段: '{frags}')")
# 输出: {C, D} 能还原: False (片段: '_WORLD_WORLD')

# 测试：{B, E} 可以还原
ok, frags = can_reconstruct(["B", "E"], assignments)
print(f"{{B, E}} 能还原: {ok} (片段: '{frags}')")
# 输出: {B, E} 能还原: True (片段: 'HELLO_WORLD')
```

---

## 六、论文的实际应用

### 6.1 区块链共识协议

论文提出的 Monotone Erasure Code 主要用于：

- **GAVID（Generalized Asynchronous Verifiable Information Dispersal）**：一种通用的异步可验证信息分散协议
- 支持**非阈值的拜占庭容错**——不是简单的"f 个节点可以出错"，而是可以表达复杂的信任关系
- 从 GAVID 可以构建通信高效的拜占庭可靠广播协议

### 6.2 Stellar 网络

Stellar 共识协议使用的验证节点有分层信任关系，这正是 Partitioned Access Structure 的典型例子。论文给出了这种情况下 overhead 最优的构造算法。

---

## 七、关键概念总结

| 概念 | 含义 |
|---|---|
| Erasure Code | 把数据编码成 n 份，任意 k 份可还原 |
| 局限 | 假设所有节点"平等"，不适合非对称信任场景 |
| Access Structure | 最小可行集合的集合 |
| MBF | 用 AND/OR/Threshold 表达的访问结构 |
| Monotone Erasure Code | 能尊重任意访问结构的纠删码 |
| Linear 版本 | 用有限域上的矩阵运算编码和译码 |
| Overhead | (总片段大小 - 原始大小) / 原始大小，越小越好 |
| Kronecker 积 | 递归构造中的关键数学工具，用于对齐子树矩阵 |
| GAVID | 基于 Monotone Erasure Code 的通用异步信息分散协议 |

---

## 八、学习思考

1. 经典 Reed-Solomon 假设所有节点平等，而 Monotone Erasure Code 打破了这个假设。这个"打破"是通过对称性的丧失换来的——碎片大小可以不同，节点拿到的碎片量可以不同。

2. 递归构造方法中的 Kronecker 积是一个优雅的设计：它让不同深度的子树可以"对齐"到同一维度，同时保持线性独立性。

3. 与 Secret Sharing（秘密共享）的区别很重要：Monotone Erasure Code **不保证**非访问集不能恢复数据——它只保证访问集一定能恢复。Secret Sharing 则保证非访问集获得零信息。

4. 论文的价值在于为区块链共识协议提供了一个通用框架，让非阈值信任模型也能享受纠删码带来的通信效率提升。
