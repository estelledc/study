---
title: Quake: Adaptive Indexing for Vector Search
来源: https://www.usenix.org/conference/osdi25/presentation/mohoney
日期: 2026-06-13
分类: 基础设施
子分类: 向量数据库
provenance: pipeline-v3
---

# Quake：为向量搜索而生的自适应索引系统

## 1 一个日常类比：图书馆的书架

想象一座巨型图书馆，馆里有上亿本书（每本书就是一向量）。你想找与某本书最相似的 k 本书。

**传统做法**是按主题把书分类摆放——科幻放一个区域，历史放一个区域。这就像大多数向量索引（HNSW、DiskANN）的做法：先把空间分好区，然后查询时只去最相关的那个区找。

问题来了：

- **新书不断进来**：图书馆每天都在收到新书（数据在动态更新）。
- **热门区域会变**：有时候突然大家爱看科幻小说，有时候又爱看历史（访问模式在变化）。
- **固定分类不够用了**：按一开始的分类找，越来越找不到最相似的书。

Quake 的核心思路是：**书架自己会调整**。它不是固定分区，而是动态地根据数据和查询模式来重新划分空间，确保每次查询都走"最短路"。

## 2 背景：向量搜索是什么

现代 AI 应用中，数据被表示为高维向量（比如一篇文章用 768 维向量表示）。向量搜索的任务是：

> 给定一个查询向量，在数据库中找出与它最"接近"的 k 个向量。

这在以下场景中无处不在：

- **RAG（检索增强生成）**：大模型需要先在知识库中找到相关的文档片段
- **推荐系统**：找到与用户喜好最相似的商品
- **图像/视频检索**：用向量表示图片内容，找相似图片

"接近"通常用欧氏距离或余弦相似度来衡量。

### 2.1 为什么动态场景下现有方法表现差

现有近似最近邻（ANN）索引（如 HNSW、DiskANN、SCANN）在**静态数据集**上表现很好。但当数据在动态更新、且访问模式不均匀时，它们面临三个核心问题：

1. **分区过时**：索引构建时划好的区域，随着新数据插入和查询模式变化，很快就不准了
2. **延迟飙升**：查询被引向错误的区域，不得不扫描更多数据，延迟上升
3. **更新成本高**：动态插入数据后，索引结构需要大量调整来维持质量

## 3 Quake 的三大核心创新

### 3.1 多层分区（Multi-level Partitioning）

Quake 的核心数据结构是多层分区树。每一层把向量空间递归切分：

```
第 0 层（根）：全部数据
    ├── 第 1 层左子分区：数据 A
    │   ├── 第 2 层左子分区：数据 A1
    │   └── 第 2 层右子分区：数据 A2
    └── 第 1 层右子分区：数据 B
        ├── 第 2 层左子分区：数据 B1
        └── 第 2 层右子分区：数据 B2
```

与传统方法的关键区别：

- 分区边界不是固定的，而是根据数据分布和查询频率**动态调整**
- 高频访问的区域会被进一步细分，低频区域保持粗略
- 新数据到来时，系统选择最合适的叶子节点插入，而不重建整个索引

### 3.2 成本模型驱动的调整（Cost-model Guided Adaptation）

Quake 有一个成本模型，用来预测查询延迟。它的核心思想是：

**查询某个分区的成本 = 该分区的数据量 × 访问频率的函数**

```python
import numpy as np

class QuakePartition:
    """Quake 的一个分区节点"""
    def __init__(self, partition_id, capacity=10000):
        self.partition_id = partition_id
        self.children = []          # 子分区列表
        self.data = []              # 该分区中的向量
        self.access_count = 0       # 被查询的次数
        self.data_size = 0          # 数据量
        self.capacity = capacity

    def estimate_query_cost(self, depth=0):
        """
        估算查询此分区的预期成本（延迟）。
        
        成本函数考虑两个因素：
        1. 分区大小（数据越多，扫描越慢）
        2. 访问频率（越热的分区越可能被优先细分）
        
        返回：预估成本值
        """
        if self.is_leaf():
            # 叶子节点的成本正比于数据量
            # 数据越多，线性扫描越慢
            base_cost = self.data_size * np.log(self.data_size + 1)
            return base_cost
        
        # 内部节点：递归计算所有子分区的加权成本
        total_cost = 0
        for child in self.children:
            # 每个子分区的权重 = 其访问频率
            # 访问越频繁的区域，在成本计算中权重越大
            weight = max(child.access_count, 1)
            total_cost += weight * child.estimate_query_cost(depth + 1)
        
        return total_cost

    def split(self, split_strategy='frequency'):
        """
        当分区过大或过于热门时，将其拆分为两个子分区。
        
        Args:
            split_strategy: 拆分策略
                - 'frequency': 按访问频率拆分，热门数据分到不同子分区
                - 'spatial': 按空间位置拆分（传统的空间切分）
                - 'hybrid': 综合考虑频率和空间分布（Quake 的默认策略）
        """
        if len(self.children) > 0 or self.data_size < 100:
            return  # 已经有子分区或数据太少，不拆分
        
        # 根据策略决定如何拆分
        if split_strategy == 'frequency':
            # 把访问最频繁的向量作为种子，做聚类拆分
            hot_vectors = self._get_most_accessed(2)
            clusters = kmeans_cluster(hot_vectors, k=2)
            self._split_by_cluster(clusters)
        elif split_strategy == 'hybrid':
            # Quake 的核心：结合空间分布和访问频率
            # 先在空间上粗分，再根据频率微调
            self._split_hybrid()
        
        # 初始化子分区
        self.children = [
            QuakePartition(f"{self.partition_id}.0"),
            QuakePartition(f"{self.partition_id}.1"),
        ]
```

### 3.3 自适应查询参数调节（Adaptive Query Tuning）

不同查询需要不同的搜索深度。Quake 有一个**召回率估算模型**，根据查询特征动态设定搜索参数：

```python
class QuakeQueryEngine:
    """Quake 的查询引擎"""
    
    def __init__(self, root_partition, target_recall=0.95):
        self.root = root_partition
        self.target_recall = target_recall  # 目标召回率
    
    def search(self, query_vector, k=10):
        """
        执行向量搜索。
        
        Quake 的核心查询流程：
        1. 根据 query_vector 的特征，估算需要搜索的深度和广度
        2. 按成本模型引导，优先搜索最可能有结果的分区
        3. 动态调整搜索参数，在达到目标召回率后停止
        """
        # Step 1: 估算当前查询需要的搜索预算
        search_budget = self._estimate_search_budget(query_vector)
        
        # Step 2: 从根节点开始，按优先级搜索分区
        candidates = []
        visited = set()
        
        # 使用优先队列，优先级 = 预估与 query 的距离
        priority_queue = [(0.0, self.root)]
        
        while priority_queue and search_budget > 0:
            # 取出距离预估最近的分区
            dist, partition = heapq.heappop(priority_queue)
            
            if partition.partition_id in visited:
                continue
            visited.add(partition.partition_id)
            search_budget -= 1
            
            # Step 3: 如果是叶子节点，扫描其中的向量
            if partition.is_leaf():
                for vec in partition.data:
                    actual_dist = cosine_distance(query_vector, vec)
                    candidates.append((actual_dist, vec))
            else:
                # 内部节点：计算每个子分区与 query 的距离
                for child in partition.children:
                    child_dist = partition_distance_to_query(child, query_vector)
                    heapq.heappush(priority_queue, (child_dist, child))
            
            # Step 4: 检查是否已达到目标召回率
            if len(candidates) >= k * 10:  # 保守策略：多找一些候选
                estimated_recall = self._estimate_recall(candidates, k)
                if estimated_recall >= self.target_recall:
                    break
        
        # 按距离排序，返回最接近的 k 个
        candidates.sort(key=lambda x: x[0])
        return [vec for dist, vec in candidates[:k]]
    
    def _estimate_search_budget(self, query_vector):
        """
        根据查询向量估算需要搜索的预算。
        
        这是 Quake 的"自适应"核心——不同查询消耗不同资源：
        - 容易匹配的查询（向量在密集区域）→ 预算少
        - 难匹配的查询（向量在稀疏区域）→ 预算多
        """
        # 估算 query 所在区域的向量密度
        density = self._estimate_local_density(query_vector)
        
        # 稀疏区域需要搜索更多分区
        budget = int(self._base_budget * (1.0 + 1.0 / (density + 0.001)))
        return min(budget, self._max_budget)
    
    def _estimate_recall(self, candidates, k):
        """
        估算当前候选集的召回率。
        
        Quake 的召回率估算模型基于：
        - 已搜索的分区覆盖率
        - 候选集大小与查询参数 k 的比例
        - 历史查询的召回率统计
        """
        coverage = len(set(p.partition_id for _, p in candidates)) / \
                   self._total_leaves
        candidate_ratio = len(candidates) / max(k, 1)
        
        # 简化的召回率估算公式
        recall = min(coverage * 0.7 + candidate_ratio * 0.3, 1.0)
        return recall
```

### 3.4 NUMA 感知并行（NUMA-aware Parallelism）

Quake 还针对现代多核 CPU 的 NUMA（非统一内存访问）架构做了优化。简单来说：

- 不同 CPU 核心访问不同内存区域的延迟不同
- Quake 在搜索时将任务分配给"就近"的核心，减少跨 NUMA 节点的内存访问

```python
import multiprocessing as mp
from numba import njit

@njit(parallel=True)
def numa_parallel_scan(partial_candidates, partition_data, query_vector):
    """
    在每个 NUMA 节点上并行扫描该节点管理的分区数据。
    
    传统做法：所有线程都访问同一块内存，带宽瓶颈
    Quake 做法：每个线程组访问本地 NUMA 节点的内存，
               充分利用总内存带宽
    """
    num_threads = mp.cpu_count()
    numa_nodes = detect_numa_nodes()  # 检测 NUMA 节点数
    candidates_per_node = [[] for _ in range(numa_nodes)]
    
    for i in prange(len(partition_data)):
        # 确定数据所在的 NUMA 节点
        node_id = get_numa_node(i, numa_nodes)
        dist = compute_distance(partition_data[i], query_vector)
        candidates_per_node[node_id].append((dist, i))
    
    # 每个 NUMA 节点独立收集候选结果
    # 最后再合并所有节点的结果
    return candidates_per_node
```

## 4 系统整体架构

Quake 的系统架构由三个组件构成：

```
                    ┌─────────────────────────┐
                    │     Query Engine         │
                    │  - Adaptive query params │
                    │  - Recall estimation     │
                    │  - NUMA parallel search  │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   Cost Model            │
                    │  - Predict latency      │
                    │  - Guide partitioning   │
                    │  - Trigger splits       │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   Multi-level Index     │
                    │  - Dynamic partitions   │
                    │  - Adaptive granularity │
                    │  - No full rebuild      │
                    └─────────────────────────┘
```

## 5 性能对比

Quake 在动态工作负载上的表现显著优于现有索引：

| 对比指标 | vs SVS | vs DiskANN | vs HNSW | vs SCANN |
|----------|--------|------------|---------|----------|
| 查询延迟降低 | 1.5× | 更多 | 最多 38× | 更多 |
| 更新延迟降低 | 4.5× | 更多 | 最多 126× | 更多 |

关键实验设置：

- **Wiki 向量搜索工作负载**：论文基于 Wikipedia 构建了一个真实的向量搜索工作负载，具有动态数据更新和变化的访问模式
- **自定义负载生成器**：论文还开发了一个工作负载生成器，可以配置不同的访问模式和更新频率

## 6 总结

Quake 解决了向量搜索中一个被长期忽视的问题：**当数据和查询模式都在变化时，如何保持索引的高效性？**

三个核心贡献：

1. **多层动态分区**——分区边界随数据和查询模式自适应调整，不是固定不变的
2. **成本模型 + 召回率估算**——用模型驱动决策，在查询延迟和更新延迟之间自动找到平衡
3. **NUMA 感知并行**——充分利用现代 CPU 的内存架构

回到图书馆的类比：Quake 不是一家"按初始分类摆放图书"的图书馆，而是一家**每时每刻都在重新排列书架**的图书馆——热门区域越分越细，冷门区域保持粗略，新书自动归入最合适的格子，而你找书时总能被引导到最可能找到的那个区域。

## 参考资料

- OSDI '25 Paper: https://www.usenix.org/system/files/osdi25-mohoney.pdf
- Slides: https://www.usenix.org/sites/default/files/conference/protected-files/osdi25_slides_mohoney_jason.pdf
- Presentation: https://www.usenix.org/conference/osdi25/presentation/mohoney
- Authors: Jason Mohoney, Devesh Sarda, Mengze Tang, Shihabur Rahman Chowdhury, Anil Pacaci, Ihab F. Ilyas, Theodoros Rekatsinas, Shivaram Venkataraman
