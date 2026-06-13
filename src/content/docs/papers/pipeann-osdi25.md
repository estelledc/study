---
title: "Achieving Low-Latency Graph-Based Vector Search via Aligning Best-First Search Algorithm with SSD"
来源: https://www.usenix.org/conference/osdi25/presentation/guo
日期: 2026-06-13
分类: 基础设施
子分类: 向量搜索
provenance: pipeline-v3
---

# PipeANN：让 SSD 上的向量搜索快到飞起

## 一、从"去图书馆找书"说起

想象你去一个巨大的图书馆，想找和某本书最相似的 10 本书。图书馆的书按主题分布在不同的书架上，每本书旁边都贴着标签，告诉你"这本书和那本书很像"——这些标签就是图的边。

你在内存里搜索，就像把整本图书馆的地图存在脑子里，翻起来飞快。但如果图书馆太大了（几十亿本书），脑子装不下，只能把地图存在书架旁的电脑上（SSD）。每次查一条边，都得等电脑读取——这就慢了。

传统的做法（比如 DiskANN）是：一步一步地查，每一步都等上一步的结果出来再继续。就像你每翻一页书，都要等上一页完全读完才能翻页。结果就是大量时间在"等"。

PipeANN 的核心洞察是：**你不需要等上一页读完才能决定下一页读什么**。只要知道当前候选列表里有哪些邻居节点，就可以提前把它们的磁盘页异步读进来，同时并行计算距离。这就是"流水线"的思想。

## 二、核心概念拆解

### 2.1 什么是图-based 近似最近邻搜索（ANNS）

高维向量（比如几百维）之间的精确搜索会遭遇"维度诅咒"——计算量随维度指数增长。所以实际系统中都用近似方法：返回一个近似的前 k 近邻（top-k）。

图索引把向量组织成有向图：每个节点是一个向量，边表示"这两个向量很接近"。搜索时从起始节点出发，沿着边走，逐步逼近最近的邻居。

### 2.2 Best-First Search（最佳优先搜索）

这是 DiskANN 等系统用的搜索算法。它的流程如下：

```
算法：Best-First Search
1. 从起始节点 s 开始，候选池 P = {s}，已探索集合 E = {}
2. 当 P != E 时循环：
   a. 从 P 中选出离查询 q 最近的 W 个节点（未在 E 中的）
   b. 将这 W 个节点从内存/磁盘读入
   c. 将它们加入 E
   d. 对这 W 个节点的每个邻居，计算与 q 的距离，插入 P
3. 返回 P 中最近的 k 个节点
```

关键特征：

- **步骤间严格的计算-I/O 顺序**：必须先读完一批节点，算完距离，才能决定下一批读谁
- **同步 I/O**：每批 W 个节点的读取是同步等待完成的

### 2.3 SSD 的特性 vs Best-First 的矛盾

SSD 有两个关键特性：

1. **I/O 延迟远高于计算延迟**：SSD 读取延迟约 100us，而向量距离计算只需几纳秒。论文实测 I/O 延迟是计算的 7.43 倍
2. **支持并发异步 I/O**：SSD 可以同时处理多个 I/O 请求，带宽随并发数增加

但 Best-First Search 的问题是：

- 因为步骤间有严格顺序，I/O 时间大部分无法和计算重叠，白白浪费
- 同步读取导致 I/O 管线利用率低（论文实测只有 76%）

打个比方：Best-First 就像一个厨师，每切完一刀菜，必须等水烧开了才能炒下一锅。而 SSD 其实可以同时烧好几锅水——只是厨师不知道而已。

## 三、PipeSearch：打破顺序的流水线搜索

### 3.1 关键观察：伪依赖

论文发现 Best-First 的 I/O 和计算之间其实是**伪依赖**（pseudo-dependency）：

> 要决定下一批读哪些节点，只需要知道候选池 P 里的节点 ID 和它们的距离估计值。这些信息已经在内存中了，不需要等正在进行的 I/O 或计算完成。

这意味着：可以在等待 I/O 的同时，继续计算已读节点的距离，同时提前发出下一批 I/O 请求。

### 3.2 PipeSearch 算法

```python
# PipeSearch 核心思路（伪代码）

class PipeSearch:
    def __init__(self, graph, candidate_pool_size=100):
        self.graph = graph
        self.P = CandidatePool(capacity=candidate_pool_size)  # 候选池
        self.E = set()  # 已探索集合
        self.io_queue = []  # I/O 请求队列（流水线）
        self.pipeline_width = 4  # 初始管线宽度

    def search(self, query, start_node, k=10):
        # 初始化
        self.P.insert(start_node, distance=start_node, dist_to_query(query))
        self.E.clear()
        self.io_queue.clear()

        while not self.P.is_empty():
            # 步骤 1: 填充 I/O 管线（如果还有空间）
            # 关键：只依赖候选池中的信息，不等 I/O 或计算完成
            nodes_to_read = self.select_nodes_for_io()
            for node in nodes_to_read:
                self.issue_async_io(node)  # 异步发出 I/O，不等响应

            # 步骤 2: 处理已完成的 I/O
            completed = self.poll_completed_ios()
            for node_data in completed:
                self.explore_node(node_data)  # 计算距离 + 扩展邻居

            # 步骤 3: 将新发现的邻居加入候选池
            for neighbor in self.get_new_neighbors():
                dist = self.compute_distance(neighbor, query)
                self.P.insert(neighbor, dist)

        return self.P.top_k(k)

    def select_nodes_for_io(self):
        """从候选池中选 W 个最近的节点发起 I/O"""
        # 不等待任何 I/O 完成，直接从 P 中选
        candidates = self.P.get_nearest_not_in_E(self.pipeline_width)
        return [n for n in candidates if n not in self.E]

    def explore_node(self, node_data):
        """探索一个已读取的节点：计算距离并扩展邻居"""
        self.E.add(node_data.id)
        for neighbor_id in self.graph.get_neighbors(node_data.id):
            if neighbor_id not in self.E and neighbor_id not in self.P:
                dist = compute_l2_distance(node_data.vector, self.query)
                self.P.insert(neighbor_id, dist)
```

### 3.3 流水线对比图

```
Best-First Search（串行）:
Step 1: [计算][I/O等待][计算][I/O等待]
Step 2:                    [计算][I/O等待][计算][I/O等待]
Step 3:                                    [计算][I/O等待]...

PipeSearch（并行流水线）:
I/O:    [====I/O1====][====I/O2====][====I/O3====]
计算:          [计算1][计算2]       [计算3][计算4]
结果:  明显缩短，因为 I/O 和计算重叠了
```

论文实测 PipeSearch 相比 Best-First 搜索延迟降低约 50%。

## 四、PipeANN：解决吞吐量的两个技巧

PipeSearch 延迟低但吞吐量不够高，因为：

1. 固定管线宽度无法兼顾"窄管线的低浪费"和"宽管线的低延迟"
2. 宽管线 + 慢探索会导致"读了但没探索"的节点堆积

### 4.1 动态管线宽度

思路：搜索开始时管线窄，随着搜索推进逐渐加宽。

为什么可行？搜索后期，候选池中已经包含了很多最终的前 k 节点，此时读进来的节点"有用"的概率很高，浪费很少。所以可以大胆加宽。

```python
class DynamicPipeline:
    def adjust_pipeline_width(self, search_step, candidate_pool):
        """根据搜索阶段动态调整管线宽度"""
        total_candidates = len(candidate_pool)
        unexplored_top_k_count = candidate_pool.count_unexplored_top_k()

        # 早期：管线窄，减少浪费
        # 后期：管线宽，利用更多并发
        if search_step < 10:
            return 4
        elif search_step < 50:
            return 8
        else:
            # 后期候选池中有很多有用的 top-k 节点
            # 可以安全地加宽到 16 或更高
            ratio = unexplored_top_k_count / max(total_candidates, 1)
            if ratio > 0.3:
                return 16
            elif ratio > 0.15:
                return 12
            else:
                return 8
```

### 4.2 错过邻居上限（Missed Neighbor Bound）

思路：不追求管线始终满负荷，而是限制"已读但未探索"的节点数量上限。

当多个 I/O 同时完成时，不再一次性发出多个 I/O 来填满管线，而是交替执行"探索一个节点 + 发一个 I/O"。这样既保持了管线有一定利用率，又避免了节点堆积。

```python
class MissedNeighborBound:
    def __init__(self, max_missed=32):
        self.max_missed = max_missed  # 最多允许 32 个"读了但没探索"的节点

    def decide_io(self, completed_ios, io_queue, node_pool):
        """
        当多个 I/O 同时完成时，交替探索 + 发 I/O
        而不是全部探索完再发一堆 I/O
        """
        missed_count = len(io_queue)  # 管线中待完成的 I/O 数

        while completed_ios:
            # 先探索一个节点
            node_data = completed_ios.pop(0)
            self.explore_node(node_data)

            # 如果管线未满且错过邻居未超限，再发一个 I/O
            if missed_count < self.max_missed and len(io_queue) < self.max_missed:
                next_node = self.select_next_node()
                self.issue_async_io(next_node)
                missed_count += 1

        return completed_ios
```

### 4.3 效果对比

| 指标 | DiskANN | PipeANN | 改进 |
|------|---------|---------|------|
| 十亿级数据集延迟 | 1.0x | 0.35x | 降低 65% |
| 十亿级数据集吞吐 | 1.0x | 1.71x | 提升 71% |
| 0.9 recall 延迟 | 1.0x | <0.3x | 降低 70%+ |
| 相对内存版 Vamana | — | 1.14x-2.02x | 接近内存性能 |

## 五、总结

PipeANN 做的事情可以用一句话概括：**让搜索算法适应存储硬件，而不是让硬件适应算法**。

核心思想链条：

1. 图索引存 SSD 上慢，是因为 Best-First 搜索的串行 I/O 和计算无法重叠
2. 但 I/O 和计算之间只是伪依赖——候选池里的信息就够决定下一步读什么
3. 打破这个伪依赖，用异步流水线把 I/O 和计算重叠起来，延迟减半
4. 再用动态管线宽度和错过邻居上限两个技巧，把吞吐量拉回来

这篇论文的启示是：算法设计和硬件特性的对齐，有时候比算法本身的优化更重要。
