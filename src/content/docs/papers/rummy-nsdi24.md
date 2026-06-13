---
title: Fast Vector Query Processing for Large Datasets Beyond GPU Memory with Reordered Pipelining
来源: https://www.usenix.org/conference/nsdi24/presentation/zhang-zili-pipelining
日期: 2026-06-13
分类: 其他
子分类: 向量搜索
provenance: pipeline-v3
---

# RUMMY：用"重新排序流水线"让 GPU 处理超大向量集

## 一、从快递分拣说起：为什么 GPU 处理向量查询会慢？

想象一个大型快递分拣中心。

每天有 100 万个包裹（向量数据）要从货车卸下来，分拣到对应区域，再装上去往不同城市的车。分拣中心的传送带速度极快（这就是 GPU 的计算能力），但货车停靠的月台只有 4 个（这就是 GPU 和 CPU 之间的内存带宽）。

问题出现了：

1. 包裹太多，月台放不下所有货车的货——必须分批卸
2. 同一个包裹被多个分拣任务重复要求，每次都要从月台搬一次
3. 传送带上有时空着没人用（计算资源浪费），有时又堆满来不及处理（资源瓶颈）

**RUMMY 要解决的就是这个问题。** 它来自北京大学，发表在 USENIX NSDI 2024。

## 二、什么是向量查询？

先说基本概念。

"向量"就是一串数字。比如一个词可以表示为 `[0.23, -0.51, 0.87, ...]`（几百到几千个数字）。找"最相似"的词，就是在一堆向量里找"距离最近"的那个。这叫做**近似最近邻搜索**（ANNS）。

应用非常多：
- 推荐系统：找到和你喜好最像的用户
- 搜索引擎：找到语义最接近的文档
- 图像识别：找到最相似的图片

**传统做法：** 如果向量数据集太大，放不下 GPU 的显存，就只能用 CPU 来处理。CPU 慢，但内存大。GPU 快，但显存小。

RUMMY 的第一句话就是：**"我们让 GPU 能处理比它显存还大的数据集。"**

## 三、核心概念：流水线 + 重新排序

### 3.1 什么是流水线？

流水线就是把一个任务拆成好几步，让每一步同时做不同的部分。

```
时间 →

查询 1 的数据传输: |=======|
查询 1 的 GPU 计算:      |===========|
查询 1 的结果返回:               |===|

查询 2 的数据传输:              |=======|
查询 2 的 GPU 计算:                   |===========|
查询 2 的结果返回:                          |===|

（这是"串行"做法——每一步做完才做下一步）
```

理想做法是让传输和计算**重叠**（overlap）：

```
查询 1 传输: |=======|
查询 1 计算:      |===========|

查询 2 传输:             |=======|
查询 2 计算:                   |===========|

（查询2 传输的时候，查询1 的 GPU 计算已经在跑了——这就叫重叠！）
```

### 3.2 关键洞察：查询是有规律的

RUMMY 发现了一个重要事实：**同一批次的查询（batch），处理的是同一份向量数据集的"同一部分"。**

向量数据集通常先用"聚类"（Clustering）方法预先分好组。比如 1 亿个向量分成 1000 个簇（cluster），每个簇 10 万个向量。

一个查询只需要检查几个最接近的簇里的向量。如果同一批次的 64 个查询都指向同一个簇，那这个簇的数据就被重复传输了 64 次——这 63 次是浪费！

这就是 RUMMY 的核心思路：**把需要相同数据的查询"重新排序"，让它们排在一起做，这样数据只需传一次。**

## 四、RUMMY 的三个核心技术

### 4.1 基于簇的改造（Cluster-based Retrofitting）

**目的：** 消灭重复传输。

**原理：**
1. 预处理时，把向量数据集按聚类结果分成"簇块"（cluster blocks）
2. 每个查询到达时，先查它需要哪些簇
3. 同一批次的查询中，如果多个查询需要同一个簇，只传一次到 GPU
4. 后续查询直接复用已传输的数据

```python
# 伪代码：RUMMY 如何避免重复传输

class RummyBatchProcessor:
    def __init__(self):
        # GPU 显存中缓存已传输的簇
        self.gpu_cache = {}  # cluster_id -> tensor on GPU

    def process_batch(self, queries):
        """一次处理一批查询"""
        # 1. 分析这批查询各自需要哪些簇
        needed_clusters = set()
        for q in queries:
            needed_clusters.update(q.required_clusters)

        # 2. 只在 GPU 上缓存还没传输的簇
        for cluster_id in needed_clusters:
            if cluster_id not in self.gpu_cache:
                # 从 CPU 内存传输到 GPU 显存（只传一次！）
                data = load_cluster_from_cpu(cluster_id)
                self.gpu_cache[cluster_id] = data.to("cuda")

        # 3. 所有查询共享 GPU 上的簇数据，直接计算
        for q in queries:
            result = self.gpu_compute(q, self.gpu_cache)

        return results
```

### 4.2 动态内核填充 + 簇平衡（Dynamic Kernel Padding & Cluster Balancing）

**目的：** 让 GPU 的计算资源不被浪费。

GPU 上跑的计算叫"内核"（kernel）。如果一次只算 10 个查询，GPU 的 10000 个核心可能只用了 100 个——99% 闲置。

RUMMY 的做法：
1. **动态填充：** 如果批次里查询不够填满 GPU，就"填充"（padding）虚拟查询来凑数
2. **簇平衡：** 调整批次内的查询分布，让每个 GPU 线程块（thread block）的工作量尽量均衡

```python
# 伪代码：动态填充策略

class DynamicKernelPadding:
    def __init__(self, gpu_block_size=256):
        self.block_size = gpu_block_size

    def pad_batch(self, queries, clusters_on_gpu):
        """如果查询数不够填满 GPU，就填充到最近的倍数"""
        original_count = len(queries)
        # 向上取到 block_size 的倍数
        padded_count = ((original_count + self.block_size - 1) //
                        self.block_size) * self.block_size

        if padded_count > original_count:
            # 创建虚拟查询（返回结果会被丢弃）
            padding_queries = [DummyQuery()
                             for _ in range(padded_count - original_count)]
            queries.extend(padding_queries)

        # 簇平衡：调整查询顺序，让同一簇的查询聚集
        queries = self.balance_clusters(queries)

        return queries

    def balance_clusters(self, queries):
        """把需要相同簇的查询排在一起"""
        # 按所需簇 ID 排序查询
        queries.sort(key=lambda q: min(q.required_clusters))
        return queries
```

### 4.3 查询感知重排序（Query-aware Reordering & Grouping）

**目的：** 最优地重叠"数据传输"和"GPU 计算"。

这是 RUMMY 最核心的创新。它不只是简单地把查询排好，而是**同时考虑传输和计算的时间**，找到一个最优的排序，让两者重叠最大化。

```
传统做法（不按需排序）：

传输簇 A: |====|
GPU 算查询1:     |==========|
传输簇 B:               |====|
GPU 算查询2:                   |==========|

（传输和计算有重叠，但不完美——有时要等传输，有时要等计算）

RUMMY 做法（查询感知重排序）：

传输簇 A: |====|
GPU 算查询1:     |==========|
                  传输簇B:    |====|
GPU 算查询2:                    |==========|

（传输 B 的时间正好落在计算 1 的时间窗口内——完美重叠！）
```

```python
# 伪代码：查询感知调度器

class QueryAwareScheduler:
    def schedule(self, queries, cluster_data):
        """
        输入：一批查询 + 每个簇的数据大小和传输时间
        输出：最优的查询执行顺序
        """
        # 1. 计算每个簇的传输时间
        cluster_transfer_time = {}
        for cluster_id, data in cluster_data.items():
            cluster_transfer_time[cluster_id] = len(data) / BANDWIDTH

        # 2. 计算每个查询的 GPU 计算时间
        query_compute_time = {}
        for q in queries:
            query_compute_time[q.id] = self.estimate_compute(q)

        # 3. 构建调度图：找出最优的查询排列
        #    让每个查询的传输时间落在前一个查询的 GPU 计算时间内
        scheduled_order = self.graph_optimize(
            queries,
            cluster_transfer_time,
            query_compute_time
        )

        return scheduled_order
```

## 五、附加优化：GPU 内存管理

RUMMY 还做了两件小事但很关键的优化：

1. **减少显存碎片：** 向量查询的簇大小不统一，频繁分配释放会导致显存碎片。RUMMY 用内存池（memory pool）技术，预分配大块显存再按需分配小块。

2. **减少缓存未命中：** GPU 缓存（L1/L2 cache）命中率高，计算就快。RUMMY 在传输数据时考虑 GPU 缓存的行大小（cache line），尽量按 cache line 对齐传输。

## 六、效果

论文里的实验数据（用 10 亿级向量数据集测试）：

- 比 IVF-GPU（基于 CUDA 统一内存的方案）快 **135 倍**
- 比 64 核 CPU 方案快 **23.1 倍**
- 成本效益高 **37.7 倍**

## 七、核心公式

RUMMY 的"重新排序优化目标"可以形式化地写成：

```
最大化：∑ overlap(query_i_transfer, query_{i-1}_compute)

约束条件：
  - 每个查询恰好被执行一次
  - 同一簇数据只传输一次
  - GPU 计算资源不被超额分配
```

用大白话说就是：**找到一种查询排列方式，让"正在传数据"和"正在算查询"这两个动作尽可能同时发生。**

## 八、一句话总结

RUMMY 的做法可以类比成**餐厅厨房**：

传统做法：来了一个订单就从头开始切菜、炒菜、装盘。
RUMMY 做法：把需要相同食材的订单"重新排序"排在一起，切一次菜搞定所有订单，同时让炒菜的人和切菜的人同时干活。

这就是"重新排序流水线"——通过**理解数据访问模式**来**重新排列执行顺序**，从而让数据传输和 GPU 计算完美重叠。
