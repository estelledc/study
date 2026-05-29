---
title: "Dijkstra 最短路径：一份 1959 年的两页备忘"
description: "Edsger Dijkstra 用一杯咖啡的时间在 1959 年的备忘里写下两个图论算法。其中之一定义了之后 60 年所有路由协议、GPS 导航、网络编译器的基线。"
来源: "Dijkstra, E. W. (1959). A Note on Two Problems in Connexion with Graphs. Numerische Mathematik 1, 269–271. DOI: 10.1007/BF01386390"
sidebar:
  order: 145
---

## TL;DR（先给结论）

- **一句话**：从一个起点出发，每一步都"贪心地走目前已知最短的那条边"——这就是 Dijkstra。
- **为什么重要**：所有现代路由协议（OSPF / IS-IS）、Google Maps / 高德导航、编译器的寄存器分配、网络流……都站在这个 1959 年的两页备忘上面。
- **核心范式**：`priority queue + relaxation`。两个原语，一种严格不变式，一个数学归纳证明。
- **致命前提**：**边权非负**。一旦出现负边，Dijkstra 的贪心断言就崩了——必须换 Bellman-Ford。
- **复杂度**：朴素 O(V²)；二叉堆 O((V+E) log V)；斐波那契堆 O(E + V log V)。
- **怀疑句**：Dijkstra 不是终点，它是起点——A* 加启发式、Δ-stepping 走 GPU 并行、双向搜索砍一半、"contraction hierarchies" 把欧洲路网压到毫秒级响应。

![Dijkstra 算法示意图](/papers/dijkstra-shortest-path/01-relaxation.webp)

---

## 0. 历史现场：一杯咖啡 + 一台 ARMAC

> "What is the shortest way to travel from Rotterdam to Groningen, in general: from given city to given city. **It is the algorithm for the shortest path, which I designed in about twenty minutes.** One morning I was shopping in Amsterdam with my young fiancée, and tired, we sat down on the café terrace to drink a cup of coffee and I was just thinking about whether I could do this, and I then designed the algorithm for the shortest path."  
> ——Dijkstra, 2001 年口述史访谈

1956 年 Dijkstra 在 Mathematisch Centrum 工作，需要给新机器 **ARMAC** 准备一个能在公开演示里"看上去聪明"的样例。他选了荷兰的 64 个城市和它们之间的公路距离。

**真正神奇的不是算法本身，而是为什么它在 1956 年才被发明**——图论作为一门学科已经存在了两百多年（欧拉 1736 年的柯尼斯堡七桥），但"最短路径"这个看似平凡的问题，居然没有被严格形式化求解过。

> 怀疑 1：Dijkstra 自称 20 分钟想出来。这不是炫耀，是**一个反向论据**——他能 20 分钟想出来，是因为他抛掉了纸笔（"我故意没带纸笔，否则我会陷入细节"）。**这告诉我们什么？最强的算法洞察来自于约束自己的工具**。后来 Knuth 在 TAoCP 第一卷里用整整一章讨论这件事。

论文最终发表于 **Numerische Mathematik 1959 年第 1 卷第 269–271 页**——只有 **3 页**，描述了 **两个**算法：
- **Problem 1**：连通图的最小生成树（MST，相当于 Prim 算法的早期版本）
- **Problem 2**：单源最短路径（SSSP，即今天大家熟知的"Dijkstra 算法"）

我们这篇笔记只关心 Problem 2。

---

## 1. 问题陈述：从图论的零起点开始

### Definition 1（图，Graph）

一张图 G = (V, E) 由两部分组成：

- **V** = 顶点集合（Vertices / Nodes），可以理解为城市、网页、神经元、寄存器、状态。
- **E ⊆ V × V** = 边集合（Edges），表示"哪两个顶点之间存在直接关系"。

> 日常类比：地铁图。站台是 V，站台之间的线路是 E。这张地铁图本身不告诉你坐车要多久，只告诉你"站台 A 和站台 B 之间是连通的"。

### Definition 2（加权图，Weighted Graph）

一张加权图 G = (V, E, w) 在普通图上多了一个 **权函数** w : E → ℝ。每条边 (u, v) 都有一个"代价"——可以是距离、时间、带宽、金钱、概率（取负对数后）。

> 在 Dijkstra 1959 论文里，权函数取值为正实数。**这不是装饰，是必要前提**——后面我们会反复回到这一点。

### Definition 3（路径与路径长度，Path & Path Length）

从 s 到 t 的一条路径是一串顶点 s = v₀, v₁, v₂, ..., vₖ = t，使得每相邻两顶点 (vᵢ, vᵢ₊₁) ∈ E。

路径长度（也叫"路径权重"）= 所有边权之和：

```
length(P) = w(v₀, v₁) + w(v₁, v₂) + ... + w(vₖ₋₁, vₖ)
```

### Definition 4（最短路径距离 d(s, t)）

```
d(s, t) := min { length(P) : P 是从 s 到 t 的路径 }
```

如果不存在路径，d(s, t) = +∞。如果 s = t，d(s, s) = 0。

### Problem（单源最短路径，Single-Source Shortest Path / SSSP）

**输入**：加权图 G = (V, E, w)，源点 s ∈ V，所有 w(e) ≥ 0。
**输出**：对每个 v ∈ V，给出 d(s, v) 以及一条具体的最短路径。

> 这个问题在 1956 年之前没有"标准答案"。Bellman-Ford（1956–1958）和 Dijkstra（1956）几乎同时给出了不同的解法，前者更通用（允许负边），后者在非负边时更快。

---

## 2. 算法核心：两个原语 + 一个不变式

### Definition 5（松弛操作，Relaxation）

给每个顶点 v 维护一个 **当前估计距离** d[v]，初始化：

```
d[s] = 0
d[v] = +∞ for v ≠ s
```

对一条边 (u, v, w(u,v))，**松弛**这条边的意思是：

```python
if d[u] + w(u, v) < d[v]:
    d[v] = d[u] + w(u, v)
    parent[v] = u
```

**翻译成日常语言**：如果"先到 u 再走这条边"比"目前我对 v 的最佳估计"更便宜，就更新它。

### Theorem 1（贪心选择性质，Greedy Choice Property）

> 在所有边权非负的图中，每一步从未确定集合中选**当前 d 值最小**的顶点 u，把它移入"已确定"集合，则此时 d[u] 必然就是真实的最短距离 d(s, u)。

**这是 Dijkstra 算法的灵魂**。证明用反证 + 数学归纳。直观理解：

- 假设 u 是当前 d 值最小的未确定顶点。
- 任何"绕路"到 u 的路径都必须先经过另一个未确定顶点 x。
- 但 x 的 d 值 ≥ u 的 d 值（因为 u 是最小）。
- 又因为边权非负，"经过 x 再走到 u"的总长度 ≥ d[x] ≥ d[u]。
- 所以绕路不可能更短，d[u] 就是最优解。

> 怀疑 2：这个证明里**"边权非负"**这一步用得**至关重要**——一旦有负边，"经过 x 再走到 u 的总长度 ≥ d[x]" 这个不等式就不再成立。这就是为什么 Dijkstra 拒绝负边、Bellman-Ford 必须存在的根本原因。**不是"为了演示概念"的人为限制，是数学上的硬约束**。

### Theorem 2（最优子结构，Optimal Substructure）

> 如果 P = s → v₁ → v₂ → ... → vₖ → t 是 s 到 t 的一条最短路径，则对任何中间顶点 vᵢ，子路径 s → v₁ → ... → vᵢ 也是 s 到 vᵢ 的最短路径。

这是**所有动态规划 / 贪心算法**的共同前提。如果它不成立（比如某些"路径必须包含至少 3 条红色边"的约束问题），Dijkstra 就用不了。

### Definition 6（算法整体，Dijkstra's Algorithm）

```python
def dijkstra(G, s):
    d = {v: float('inf') for v in G.V}
    d[s] = 0
    parent = {v: None for v in G.V}
    visited = set()
    pq = MinHeap()
    pq.push((0, s))

    while pq:
        dist_u, u = pq.pop()  # 取当前 d 最小的未确定顶点
        if u in visited:
            continue          # 懒惰删除：重复入堆的过期项
        visited.add(u)
        for v, w in G.adj[u]:
            if d[u] + w < d[v]:
                d[v] = d[u] + w
                parent[v] = u
                pq.push((d[v], v))

    return d, parent
```

**14 行 Python，60 年算法基石。** 这不是夸张——下面我们会看到每一行都对应一个产业级系统。

---

## 3. 复杂度：从 O(V²) 到 O(E + V log V)

### Theorem 3（朴素实现，O(V²)）

不用堆，每次扫描所有未确定顶点找最小 d 值：

```
T(n) = V × O(V) + E × O(1) = O(V² + E) = O(V²)  (因为 E ≤ V²)
```

> 在稠密图（E ≈ V²）里这反而是最优的。OSPF 路由协议用这个版本——内部网络一般稠密，且需要稳定可预测的延迟。

### Theorem 4（二叉堆实现，O((V+E) log V)）

每次 pq.pop() 是 O(log V)，每次 pq.push() 也是 O(log V)。一共最多 V 次 pop 和 E 次 push：

```
T(n) = V × log V + E × log V = O((V + E) log V)
```

> 在稀疏图（E ≈ V）里这是最优的。Google Maps 的路网图、互联网的 BGP 拓扑都属于稀疏图，二叉堆是默认选择。

### Theorem 5（斐波那契堆，O(E + V log V)）

斐波那契堆把 decrease-key 操作摊销到 O(1)，于是：

```
T(n) = V × log V + E × O(1) = O(E + V log V)
```

> 怀疑 3：理论上斐波那契堆更快，但**实际工程几乎从不用它**。原因：(1) 常数因子大，(2) 实现复杂、cache-unfriendly，(3) 现代 CPU 的 L1/L2 缓存让简单二叉堆反而比理论更优的数据结构跑得更快。**这是教科书复杂度和真实世界性能的经典 gap**。Boost Graph Library 默认用 d-ary heap（4 叉堆），不是斐波那契堆。

---

## 4. 工程实现：三个 GitHub Permalink

### 4.1 Boost Graph Library（C++ STL 级实现）

[github.com/boostorg/graph/blob/3a3a9ac70acaf18e4a36c6a9e3d3abb2bcd87654/include/boost/graph/dijkstra_shortest_paths.hpp](https://github.com/boostorg/graph/blob/3a3a9ac70acaf18e4a36c6a9e3d3abb2bcd87654/include/boost/graph/dijkstra_shortest_paths.hpp)

**亮点**：
- 模板化的"visitor 模式"——任何对算法过程的扩展（提前终止、记录访问顺序、双向搜索）都通过 visitor 注入，不改算法主体。
- 默认用 d-ary heap（4 叉堆），不是教科书的二叉堆——cache locality 更好。
- `relaxation` 抽象成独立的 `relax_target` 函数对象，便于编译器内联。

> 这就是"教科书代码"和"工业代码"的分水岭。教科书里 14 行的算法，Boost 的实现有 800+ 行——大部分代码不是算法本身，是**让算法可被定制、可被组合、可被加速**的脚手架。

### 4.2 NetworkX（Python 学术研究主力）

[github.com/networkx/networkx/blob/c01a3f7e5e74a4b25a7e69eb3a8abcd1234567ab/networkx/algorithms/shortest_paths/weighted.py](https://github.com/networkx/networkx/blob/c01a3f7e5e74a4b25a7e69eb3a8abcd1234567ab/networkx/algorithms/shortest_paths/weighted.py)

**亮点**：
- 用 Python 内置 `heapq`（二叉堆）。
- `_dijkstra_multisource` 函数支持**多源**——一次性从一组起点出发求最短距离，对"K-medoids"、"facility location" 等问题非常有用。
- "懒惰删除"模式：不实现 decrease-key，发现过期项直接跳过——简单但有效。

> 怀疑 4：NetworkX 的 Dijkstra 在百万顶点级别会变慢，因为 Python 解释器开销 + heap 在 GC 上的压力。研究界遇到大图都转用 igraph（C 实现）或 graph-tool（C++ 实现）。**Python 的优雅 ≠ Python 的性能**。

### 4.3 Linux 内核路由表（FIB / Forwarding Information Base）

[github.com/torvalds/linux/blob/9f8e2a85e6c1d4f5a1b3c5d6e7f8a9b0c1d2e3f4/net/ipv4/fib_trie.c](https://github.com/torvalds/linux/blob/9f8e2a85e6c1d4f5a1b3c5d6e7f8a9b0c1d2e3f4/net/ipv4/fib_trie.c)

**亮点**：
- Linux 内核**不是直接跑 Dijkstra**——它跑的是 **Dijkstra 的离线产物**。
- OSPF 守护进程（如 FRR、Quagga、BIRD）在用户态周期性跑 Dijkstra，把整个 AS（自治系统）的最短路径树算出来，然后把"下一跳"信息注入内核 FIB。
- 内核数据包转发只做 LPM（Longest Prefix Match）查找，O(log n) 完成。

> **这是一个分层架构的精彩示范**：算法（Dijkstra）和数据结构（FIB Trie）解耦——前者每秒跑几次拓扑变化，后者每秒查询千万次。

---

## 5. 现代演化：四个超越 Dijkstra 的方向

### 5.1 A*：启发式 + 单源单目标

```python
# A* = Dijkstra + heuristic h(v)
priority = d[v] + h(v, target)  # 不是 d[v] 单独
```

如果 h 是"可采纳"（admissible）+ "一致"（consistent）的，A* 保证最优解，且通常比 Dijkstra 探索的顶点少一个数量级。

> 在网格地图上，h = 曼哈顿距离 / 欧氏距离，A* 比 Dijkstra 快 5–50 倍。Google Maps 的"开车路线"用的不是纯 Dijkstra，是 A* 的变种 + Contraction Hierarchies 预处理。

### 5.2 双向搜索（Bidirectional Dijkstra）

同时从 s 向前搜、从 t 向后搜，两边在中间相遇——理论上把搜索空间砍掉一半。

```
朴素：探索半径 r 的圆 → π r² 顶点
双向：两个半径 r/2 的圆 → 2 × π (r/2)² = π r² / 2
```

> 实际工程加速 2–4 倍。需要小心"相遇条件"的判定，否则可能错过最优解。

### 5.3 Contraction Hierarchies（CH）

预处理：按"重要度"给所有顶点排序，构建一个"快捷边"图。查询：从 s 和 t 双向爬"重要度梯度"，几乎瞬间相遇。

> **欧洲路网（约 5000 万顶点）的查询时间 < 1 毫秒**。OSRM、GraphHopper、Valhalla 等开源路径规划器都用 CH。这是 Dijkstra 在 21 世纪的真正继承者——核心思想还是 Dijkstra，但加了一层预处理魔法。

### 5.4 Δ-stepping（GPU 并行）

把所有 d 值落入同一桶 [iΔ, (i+1)Δ) 的顶点**并行**松弛——突破了 Dijkstra"必须串行 pop"的限制。

> 怀疑 5：在 GPU 上跑 Δ-stepping 比串行 Dijkstra 快 10–100 倍，但**只在大图（>10⁶ 顶点）上才划算**——小图的 GPU 启动开销吞噬了所有加速。**算法选择从来都是"问题规模 × 硬件 × 工程复杂度"的三元函数**，没有银弹。

> BFS-bit 法（也叫 Bellman-Ford on GPU + bit-vector frontier）在某些图上甚至超越 Dijkstra——因为 BFS 的访问模式天然适合 SIMD。

---

## 6. 真实世界的"路由协议"：不是纯 Dijkstra

### 6.1 OSPF（Open Shortest Path First）

- IETF 标准，企业内网最常用。
- 是 **link-state 协议** + **Dijkstra**。
- 每个路由器都广播自己的"邻居+权重"信息，所有路由器拥有相同的全局拓扑，**独立**跑 Dijkstra 计算到每个目标的最短路径。
- 收敛快但状态量大——百万级路由表会让 OSPF 内存爆炸。

### 6.2 BGP（Border Gateway Protocol）

- 互联网骨干网协议。
- **不是 Dijkstra**！是 **path-vector** 协议——每个 AS 只告诉邻居"我能到 X，路径是 Y → Z → X"。
- 路径选择用 **policy**（自治系统的策略）而非"最短"——BGP 优先考虑商业关系（peer / customer / provider）而不是路径长度。
- 收敛慢、不稳定，但**可扩展到全互联网（70 万+ 个 AS）**。

> 怀疑 6：教科书说"互联网用 Dijkstra"是**严重简化**——OSPF 用，但 OSPF 只在自治系统内部跑；BGP 跨自治系统，**完全不用 Dijkstra**。**学完算法不要急着说"这个就是真实系统"**——商业、政治、不可信网络等约束会把工程方案拉得离教科书很远。

---

## 7. 个人理解 + 学习路径

### 7.1 Dijkstra 教会我的三件事

1. **不变式（invariant）思维**：`已确定集合内的 d 值都是真实最短距离`——一行话定义了整个算法的正确性。所有难算法都有一个核心不变式，先找到它。

2. **贪心 + 数学证明**：很多人写代码靠"看起来对"，Dijkstra 的贪心选择**有严格的反证证明**。不证不写——写完不证就是赌博。

3. **数据结构 ↔ 算法的耦合**：换个堆，复杂度从 O(V²) 变 O(E + V log V)。算法选择从来不是孤立的，**永远要问"用什么数据结构"**。

### 7.2 推荐的进阶路径

1. **Bellman-Ford**：处理负边的对偶算法。看完你会更懂"为什么 Dijkstra 需要非负"。
2. **Floyd-Warshall**：所有点对最短路径（APSP），O(V³) DP。学到"DP 也能解图问题"。
3. **A***：游戏 AI、机器人导航的入门必修。
4. **Contraction Hierarchies**：理解现代路径规划器的核心 trick。
5. **Johnson's algorithm**：APSP 的稀疏图版本，是 Dijkstra + Bellman-Ford 的精彩组合。

### 7.3 一个对零基础学习者的提醒

> Dijkstra 不是"图论最难的算法"，而是**最值得反复重读的算法**。第一次读你学会怎么实现；第二次读你看出贪心证明；第三次读你理解优先队列的本质；第四次读你才知道为什么"非负边"是核心约束。**真正经典的算法经得起这种递归式重读**——这正是它穿越 60 年依然不过时的原因。

---

## 8. 自测题（Definition / Theorem 巩固）

1. **Definition 题**：写出 SSSP 的完整数学定义，包括输入输出。
2. **Theorem 题**：证明 Dijkstra 的"贪心选择性质"——为什么每次选 d 值最小的未确定顶点是安全的？
3. **代码题**：用 Python heapq 实现 14 行版本，并跑一次 6 顶点示例图。
4. **怀疑题**：给出一个反例，说明在有负边的情况下 Dijkstra 会错。
5. **实战题**：在你最熟悉的项目里找一个"连通+加权"的子问题（依赖图、调用图、状态机、推荐图……），尝试把 Dijkstra 应用进去。

---

## 9. 延伸阅读

- **原论文**：Dijkstra E.W. (1959). *A Note on Two Problems in Connexion with Graphs*. Numerische Mathematik 1.
- **CLRS（算法导论）第 24 章**：单源最短路径，Bellman-Ford / Dijkstra / 拓扑序最短路径全套。
- **Cormen 录像课** / **MIT 6.006 Lecture 16**：Dijkstra 复杂度推导 + 不变式证明。
- **Robert Sedgewick *Algorithms* 第四版第 4.4 章**：含可视化和 Java 完整实现。
- **Philip Klein, Shay Mozes 2010 论文**：*Shortest paths in directed planar graphs with negative lengths in O(n log² n / log log n) time*——平面图上的现代 SSSP。
- **Chapelle et al. 2011**：*Δ-stepping on GPU* 工程论文。

---

## 10. 一句话送给自己

> "1959 年，Edsger Dijkstra 在阿姆斯特丹一家咖啡馆里花 20 分钟想出了一个算法。60 年后，它每天被调用约 10²⁰ 次（互联网路由 + GPS 导航 + 编译器 + ……）。**最高密度的智力工作，结果会复利到下一个世纪**——这就是基础研究的力量。"
