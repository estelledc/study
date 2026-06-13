---
title: Adopting Worst-Case Optimal Joins in Relational Database Systems — 把 WCO Join 搬进通用 RDBMS
来源: https://www.vldb.org/pvldb/vol13/p1891-freitag.pdf
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：找「三人共同好友」别先列出所有两两路径

想象你在三个社交 App 里各有一份好友列表，要找出 **A、B、C 三个人彼此都是好友** 的三角形。

笨办法（对应 **二元 Join 计划**）：

1. 先把 App1 和 App2 的好友关系两两配对 → 得到所有 **长度为 2 的路径**（A→B→?）；
2. 再拿这些路径去和 App3 匹配。

如果每人有 1000 个好友，第一步就可能产生 **百万级** 中间结果，而真正的三角形可能只有几千个。大量工作花在「枚举了最终用不上的路径」上。

聪明办法（对应 **最坏情况最优 Join，Worst-Case Optimal Join，WCOJ**）：

1. 先固定 A 的一个候选 id；
2. 在 A 的好友里找 B 的候选；
3. 再检查 B 和 C 是否互相关联；
4. 回溯，换下一个候选。

每一步只推进 **一个连接键**，且只对 **distinct 键值** 做交集，避免先物化巨大的中间表。论文把这类「按键回溯、多表同时参与」的算法，工程化地塞进了 **通用关系型数据库 Umbra**（HyPer 的后续，TUM 团队）。

---

## 这篇论文在解决什么问题

### 1. 二元 Join 的「中间结果爆炸」

传统 RDBMS 几乎都用 **二元 Join 树**：`R ⋈ S ⋈ T` 先算 `R ⋈ S`，再和 `T` 连接。当 Join 键 **不是主键/外键**、或出现 **自连接** 时，中间结果可以远大于最终答案。

经典例子：**三角形查询**（图上的 3-cycle）：

```sql
-- 三表结构相同，每条边 (v1, v2)
SELECT *
FROM R1
JOIN R2 ON R1.v2 = R2.v2
JOIN R3 ON R2.v3 = R3.v3 AND R3.v1 = R1.v1;
```

图有 `e` 条边时，长度为 2 的路径约 `O(e²)`，三角形约 `O(e^1.5)`。二元计划会先枚举路径，再过滤——**冗余工作量级差一个平方根**。

### 2. 已有 WCOJ 实现为何进不了「通用数据库」

| 障碍 | 典型系统 | 问题 |
|------|----------|------|
| 需要 **有序索引**（B+ 树、Leapfrog Triejoin） | EmptyHeaded、LevelHeaded | 属性排列组合太多，预建索引存储/维护成本极高 |
| 面向 **只读图分析** | 同上 | 大量预计算掩盖索引成本 |
| **可变数据 / HTAP** | LogicBlox 等 | 字典编码等结构难以在更新下维护 |
| 无爆炸中间结果时 **反而更慢** | 多种 WCO 系统 | TPCH、JOB 上常不如成熟二元 Join |

论文目标：**在支持 OLTP+OLAP 的通用 RDBMS 里**，(1) 按需使用 WCOJ，(2) 用 **查询执行期可线性构建** 的数据结构，(3) **不牺牲** 普通负载上的性能。

---

## 核心概念

### 1. 最坏情况最优（Worst-Case Optimal）

对自然连接查询 `Q = R1 ⋈ … ⋈ Rm`，用 **查询超图** `HQ = (V, E)` 描述：`V` 是属性 `{v1,…,vn}`，`E` 中每条超边 `Ej` 对应关系 `Rj` 的属性集。

**AGM 界**（Atserias–Grohe–Marx）：对任意 **分数边覆盖** `x = (x1,…,xm)`（每个 `xj > 0`，且每个属性 `vi` 被覆盖权重 ≥ 1），有：

```
|Q| ≤ ∏_j |Rj|^xj
```

算法若在时间 `Õ(∏_j |Rj|^xj)` 内完成（对最优 `x`），则称 **最坏情况最优**。三角形三表各 `n` 行时，最优覆盖 `(0.5, 0.5, 0.5)` 给出界 `n^1.5`，优于二元计划的 `n²` 级中间结果。

### 2. Generic Join（Algorithm 1）——概念上的回溯

Ngo et al. 的 **Generic Join** 递归地为每个属性 `vi` 赋值：

- 每次只处理 **一个** 连接键；
- 在参与该键的所有关系上求 **键值交集**；
- 过滤匹配元组，进入下一层递归；
- 最后一层对剩余元组做笛卡尔积并输出。

它在每个输入关系上诱导一棵 **Trie**：层对应 Join 键顺序，路径对应键前缀。实现 WCOJ 的关键是：Trie 上的 **集合交集** 必须足够快。

### 3. Hash Trie —— 论文的核心数据结构

先前系统用有序 Trie / Leapfrog，依赖 **比较** 和预排序。Freitag 等人提出 **Hash Trie**：

- 每一层 Trie 节点 = 一张 **哈希表**，键是 **Join 属性值的 hash**（如 AquaHash / MurmurHash），不是原始值；
- 子指针指向下层节点；叶节点挂 **元组链**；
- **Probe 阶段** 只在 hash 上求交集与 lookup，**推迟** 真实键比较到输出前（消除 hash 碰撞假阳性）；
- Build 可 **线性时间**，无需持久化有序索引。

优化：**singleton pruning**（单链路径压缩）、**lazy child expansion**（probe 时才建子表）、与 Umbra **morsel 并行** 的 radix 分区物化。

### 4. 混合优化器（Hybrid Optimizer）

不能全盘替换二元 Join——TPCH/JOB 上 WCOJ 常更慢。论文在 **已有 DP 二元 Join 树** 上做 **后序 refinement**（Algorithm 4）：

- 若某二元 Join 被估计为 **growing join**（输出基数 > max(左, 右)），或其子树已含 multi-way Join → **折叠** 为单个 WCOJ 节点；
- growing join 的祖先也一并折叠，避免重复键在后续二元 Join 中再次放大；
- Multi-way 节点内用 **Tributary Join** 的代价模型选 **属性顺序**；
- 配置名：**Umbra OHT**（On-demand Hash Trie）；对照 **Umbra EAG**（Eager All Generic，全 WCOJ）。

### 5. SQL Bag 语义 vs 理论 Set 语义

理论 WCOJ 多假设 **集合语义**（每个键一个元组）。SQL 是 **bag**。论文做法：在 **distinct 键值** 上做 WCOJ，最后再展开同一键上的多重元组；hash 碰撞在输出前过滤。

---

## 代码示例 1：三角形查询 —— 二元计划 vs WCOJ 思路

下面用 Python **模拟** 同一逻辑，对比「先两两 Join」与「按键回溯」的访问模式（非 Umbra 源码，便于零基础理解）。

```python
# 边表：每条 (src, dst) 表示有向边
R1 = [(0,1), (1,2), (1,3), (2,0), (2,3)]
R2 = R1[:]
R3 = R1[:]

def binary_join_triangles(R1, R2, R3):
    """二元计划：先 R1⋈R2，再 ⋈R3；中间 paths 可能很大"""
    paths = []
    for a, b in R1:
        for b2, c in R2:
            if b != b2:
                continue
            paths.append((a, b, c))          # 长度-2 路径 (中间结果)
    result = []
    for a, b, c in paths:
        for c2, a2 in R3:
            if c == c2 and a == a2:
                result.append((a, b, c))
    return result

def wco_backtrack_triangles(R1, R2, R3):
    """WCO 思路：固定 v1，再 v2，再 v3；每步只对 distinct 键求交"""
    result = []
    V1 = sorted({x for x, _ in R1} & {x for _, x in R3})
    for k1 in V1:
        V2 = sorted({y for x, y in R1 if x == k1} &
                    {y for y, _ in R2})
        for k2 in V2:
            V3 = sorted({z for _, z in R2 if z == k2} &
                        {z for z, x in R3 if x == k1})
            for k3 in V3:
                # 展开 bag：同一键可能有多条边
                for t1 in [t for t in R1 if t == (k1, k2)]:
                    for t2 in [t for t in R2 if t == (k2, k3)]:
                        for t3 in [t for t in R3 if t == (k3, k1)]:
                            result.append((t1, t2, t3))
    return result

assert set(binary_join_triangles(R1, R2, R3)) == \
       set(wco_backtrack_triangles(R1, R2, R3))
# 大图时 len(paths) >> len(result)，二元路径成为瓶颈
```

论文 Figure 1 的 5 边小图里，两种方法答案相同；差异在 **中间枚举量** 随边数增长的阶。

---

## 代码示例 2：Hash Trie 的 Build / Probe 骨架

对应论文 Section 3 的 Algorithm 2（build）与 Algorithm 3（probe）的 **教学级简化**（单层 hash + 递归），展示「hash 上交集、最后才验键」。

```python
from collections import defaultdict
from typing import Any

def h(x: Any) -> int:
    return hash(x) & ((1 << 32) - 1)

class HashTrieNode:
    def __init__(self):
        self.children = {}   # hash -> HashTrieNode | list[tuple]
        self.is_leaf = False

def build_hash_trie(tuples, attr_order, depth=0):
    """按 attr_order[depth] 属性递归建 trie"""
    node = HashTrieNode()
    if depth == len(attr_order):
        node.is_leaf = True
        node.children = list(tuples)
        return node
    attr = attr_order[depth]
    buckets = defaultdict(list)
    for t in tuples:
        buckets[h(t[attr])].append(t)
    for hv, group in buckets.items():
        node.children[hv] = build_hash_trie(group, attr_order, depth + 1)
    return node

def intersect_hashes(nodes):
    """Probe：各 trie 当前层 hash 集合求交（Generic Join 第 5 行）"""
    it = iter(nodes)
    common = set(next(it).children.keys())
    for n in it:
        common &= set(n.children.keys())
    return sorted(common)

def generic_join_probe(tries, attr_order, depth=0, bindings=None):
    bindings = bindings or {}
    if depth == len(attr_order):
        # 叶：笛卡尔积 + 真实 join 条件（消 hash 碰撞）
        chains = [n.children if n.is_leaf else [] for n in tries]
        for combo in _cartesian(chains):
            if all(combo[i][attr_order[j]] == combo[0][attr_order[j]]
                   for j in range(len(attr_order)) for i in range(1, len(combo))):
                yield combo
        return
    for hv in intersect_hashes(tries):
        child_tries = [n.children[hv] for n in tries]
        yield from generic_join_probe(child_tries, attr_order, depth + 1, bindings)

def _cartesian(lists):
    if not lists:
        yield []
        return
    for x in lists[0]:
        for rest in _cartesian(lists[1:]):
            yield [x] + rest

# 用法：R(v1,v2), S(v2,v3), T(v3,v1) — attr_order 如 ['v1','v2','v3']
R = [(0,1),(1,2),(1,3),(2,0),(2,3)]
S = [(1,2),(2,3),(2,0),(1,3)]
T = [(2,0),(0,1),(3,1),(3,2)]
trie_R = build_hash_trie(R, ['v1', 'v2'])
trie_S = build_hash_trie(S, ['v2', 'v3'])
trie_T = build_hash_trie(T, ['v3', 'v1'])
# generic_join_probe([trie_R, trie_S, trie_T], ['v1','v2','v3']) ...
```

Umbra 真实现还包含：64 位 hash、线性探测、**trie iterator** 接口（`up/down/next/lookup`）、编译期 **展开递归** 为嵌套循环、morsel 切分外层交集。

---

## 混合优化：何时从二元树变 Multi-way

论文 Algorithm 4 的决策逻辑可概括为：

```
后序遍历已优化的二元 Join 树：
  若 该 Join 输出基数 > max(左, 右)   [growing join]
  或 左/右子树已是 multi-way Join
    → 把整棵子树折叠为一个 WCOJ 算子
  否则
    → 保留二元 hash join
```

Figure 4 示意：一个 growing 的 `R1 ⋈ R2` 及其祖先被 **红色** 标出，最终合并成 **单个** 四表 WCOJ。这样优化器 **不重构全局搜索空间**，只在「Cardinality 估计说会炸」的地方 surgical 替换。

---

## 实验结论（Section 5 摘要）

| 场景 | Umbra OHT（混合） | 要点 |
|------|-------------------|------|
| **TPCH SF30、JOB** | 相对纯二元 Umbra **几乎无退化**（中位数 ≈ 1×） | 混合策略关键；Umbra EAG（全 WCOJ）明显变慢 |
| **图 3/4-clique**（Wiki、Orkut、Twitter 等） | 比 EmptyHeaded、MonetDB、商业 **DBMS X** 快 **数量级** | Hash trie 构建便宜；EmptyHeaded 预计算可占 99% 时间 |
| **vs Leapfrog（Umbra LFT）** | Hash trie 在动态/on-the-fly 场景更均衡 | 有序数组 Leapfrog 在静态预排序上快，但构建贵 |

硬件：双路 Xeon E5-2680 v4（28 核 / 56 线程），256 GiB RAM；超时 1 小时。

---

## 与相关工作的关系

| 工作 | 关系 |
|------|------|
| **Ngo et al. 2012 Generic Join** | 理论奠基；本文 Algorithm 1 特例 |
| **Leapfrog Triejoin (Veldhuizen 2013)** | 有序 Trie 上的 WCOJ；本文对比基线 Umbra LFT |
| **EmptyHeaded / LevelHeaded** | 预建有序索引的 WCO 系统；通用性/更新弱 |
| **Morsel-Driven Parallelism (2014)** | 同团队；本文 build/probe 接入 morsel 并行 |
| **Free Join (2023)** | 后续统一 WCO 与传统 Join 框架 |

---

## 实现要点清单（读源码/做系统时可对照）

1. **Build**：物化到连续 buffer → radix 按首键 hash 分区 → Algorithm 2 递归建 hash 表 → 可选 lazy / singleton pruning。
2. **Probe**：编译器展开 Algorithm 3 → 选 **最小** hash 表扫描 → 对其每个 hash 在其他 trie 上 `lookup` → `down` 递归 → 输出前验证等值。
3. **并行**：最外层交集循环切 morsel；work-stealing（继承 Umbra）。
4. **自连接**：检测相同 pipeline 的重复 hash trie，**只 build 一次**。
5. **优化器**：DP 二元树 → Algorithm 4 refinement → Tributary 定 attribute order。

---

## 局限与后续

- **Growing join 检测** 依赖基数估计；估计错了会误用 WCOJ 或漏用。
- **非等值 Join、外连接** 不能随意折叠成 WCOJ（论文只处理等值内连接变换）。
- **Hash 碰撞** 理论上存在；靠输出前验证；64 位 hash 在实践可忽略。
- 工业界后续：SAP HANA multi-way aware optimizer (VLDB 2020)、Free Join 等继续缩小 WCO 与二元 Join 的鸿沟。

---

## 一句话总结

这篇 PVLDB 2020 论文回答：**WCO Join 不是只能活在图数据库里**——用 **Hash Trie + 查询期构建 + 混合优化器**，可以在 HTAP 通用 RDBMS（Umbra）中 **在需要时** 获得 WCOJ 的渐近优势，**在不需要时** 保持与传统二元 Join 同档性能。对学习者：先理解 **三角形 / 多表非键 Join** 为何让二元计划中间结果爆炸，再理解 **Generic Join 回溯 + Trie 交集**，最后看 **Hash 延迟比较** 如何降低工程开销。

---

## 参考资料

- 原文：[Adopting Worst-Case Optimal Joins in Relational Database Systems (PVLDB 2020)](https://www.vldb.org/pvldb/vol13/p1891-freitag.pdf)
- DOI：[10.14778/3407790.3407797](https://doi.org/10.14778/3407790.3407797)
- 理论背景：Ngo, Porat, Ré, Rudra — *Worst-case Optimal Join Algorithms* (2012)
- 同团队并行框架：[[morsel-driven-2014]]
- Wikipedia：[Worst-case optimal join algorithm](https://en.wikipedia.org/wiki/Worst-case_optimal_join_algorithm)
