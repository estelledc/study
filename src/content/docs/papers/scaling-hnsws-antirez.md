---
title: Scaling HNSWs（antirez）— 把向量近邻图做成 Redis 级低延迟的工程实践
来源: https://antirez.com/news/156
日期: 2026-06-13
子分类: 检索与排序
分类: 信息检索
provenance: pipeline-v3
---

## 是什么

Salvatore Sanfilippo（antirez，Redis 原作者）在 2025 年 11 月写的博客 **《Scaling HNSWs》**，不是 HNSW 入门教程，而是他**花近一年从零实现 Redis Vector Sets** 后，关于「如何把 HNSW 做到 Redis 能接受的延迟与可运维性」的工程总结。

日常类比：HNSW 像一座**多层快捷通道商场**——顶层通道少、步子大，底层店铺密、走得细，帮你在百万件商品里快速找到「口味相近」的几样。antirez 这篇文章讲的是：**商场本身又占地方又慢**（指针多、向量胖、贪心搜索吃 CPU），Redis 却承诺「毫秒级响应」。他要在不牺牲太多召回的前提下，把这座商场**压缩体积、开多收银台、支持拆分店、还能真删商品而不留 ghost 铺位**。

文章对应 Redis 8 起的 **Vector Sets** 数据类型：`VADD` 加向量、`VREM` 删元素、`VSIM` 做相似搜索——把 HNSW 当作**一等数据结构**暴露，而不是 RediSearch 那种「挂在文档上的索引」。

## 为什么重要

若只读过 2018 年 HNSW 原论文，容易以为「调 M、ef 就够了」。antirez 补充的是**生产级缺口**：

- **内存**：每层指针 × 多层 × float32 向量，Word2Vec 300 维一条向量就可能占 1KB+（量化后）
- **延迟**：单线程插入 ~5000/s、查询 ~90k/s，和 Redis 其它结构差一个数量级
- **删除**：多数实现用 tombstone，图质量退化、内存难回收
- **加载**：若从磁盘只存「向量列表」再重建图，重启/主从复制要**数分钟**
- **扩展**：索引形态难水平分片；数据结构形态可以 `hash % N` 写多 key、并行 `VSIM` 再 merge

Simon Willison 等开发者把此文视为「**immersive trip through modern CS**」——因为代码在 `redis/modules/vector-sets/hnsw.c`，注释极多，算法改动可直接对照读。

## 核心概念

### 1. HNSW 在 Redis 语境下的「抗性」

HNSW 天然**吃内存、吃 CPU、写路径慢**。Redis 传统是单线程 + shared-nothing 多实例。antirez 的结论是：向量搜索**例外地值得线程化**——读多写少，且单次查询本身够重，多核并行有收益。

### 2. 内存：int8  per-vector 量化是最大甜点

三层空间开销来源：

| 来源 | 说明 |
|------|------|
| 邻居指针 | 每点 M=16~32 条边，64 位指针 8B |
| 多层结构 | 类似跳表，平均约 **1.3×** 指针开销（层概率 0.25 时） |
| 向量本体 | 300~3000 维 float32，每维 4B |

**int8 量化（默认）**：对每个向量单独算 `max_abs`，映射到 `[-127,127]`。余弦相似度与点积在归一化后等价，整数点积再乘 scale 回浮点：

```c
/* 简化自 Redis hnsw.c 的 vectors_distance_q8 思路 */
const float scale_product = (range_a / 127.0f) * (range_b / 127.0f);
int32_t dot0 = 0;
for (int i = 0; i < dim; i++)
    dot0 += (int32_t)x[i] * (int32_t)y[i];
float dotf = dot0 * scale_product;  /* 近似未量化点积 */
```

效果：**约 4× 向量体积缩小、约 4× 距离计算加速**，召回在真实 workload 里几乎不变。全精度与**二值量化**（只存符号，适合 yes/no 用户画像）也可选，但作者对非二值源数据用二值量化持怀疑态度。

指针压缩（高 32 位相同）是潜在优化，作者尚未默认启用——**时间换空间**的权衡。

### 3. 速度：线程、epoch、读写拆分

**读路径**：无写并发时，后台线程跑贪心搜索，结果回传阻塞客户端。

**visited 标记**：不用哈希表记「已访问」，而在每个节点存 `visited_epoch[]`——全局 epoch 递增，搜索时把当前 epoch 写入节点。多线程需要**每线程一个 epoch 槽**（`HNSW_MAX_THREADS`），空间换时间。

**写路径拆分**：

1. **读半段**：找邻居候选（耗时长）
2. **提交半段**：加写锁，真正连边；若图已变则丢弃 stale 候选

删除 key 时先 **`wait for background ops`** 再释放内存，避免线程还在读已被删的图。

benchmark 数字（真实向量 workload，含 Redis 协议开销）：**~50k ops/s**；裸 HNSW 库更高。MacBook 上对 300 万 Word2Vec 的 `VSIM` 约 **48k ops/s**。

### 4. 真删除 vs tombstone

常见误解来自原论文表述不清：插入时候选节点**邻居已满**，很多实现只做**单向边**（新节点 → 旧节点），删除时无法找到所有入边，只能 tombstone。

Redis 实现**强制双向边**：A→B 则 B→A。插入时用启发式**挤掉**连通性更好的旧边。删除节点后，对孤儿邻居建**距离矩阵**，贪心配对重连，最小化平均距离——删到只剩 5% 节点时图仍可搜。

### 5. 水平扩展：数据结构 > 索引

```text
# 概念：同一 query 打 N 个 shard，客户端 merge top-K
VSIM shard:0 VALUES [...] WITHSCORES
VSIM shard:1 VALUES [...] WITHSCORES
...
# 写：hash(element) % N 选 key，多实例并行 ingest
```

还可「**每个用户一个小 Vector Set**」——索引模型很难表达，Redis key 模型 trivial。key 可设 TTL，和 Sorted Set 一样过期。

### 6. 加载：序列化图而非重插

 naive 方式：RDB 存 `(id, vector)`，启动时重新 `VADD` → 300 万词向量要很久。

正确方式：**序列化节点 ID + 邻居 ID + 量化向量**，加载时分配内存、把 ID 解析成指针 → **~100×** 加速。

安全加载：RDB 可能被篡改。第二遍扫描时用 **128 位 xor 累加器** 校验每条边是否双向——对每条无向边 `(A,B)` 算 `hash(salt||min(A,B)||max(A,B)||level)` 异或，全部 reciprocal 则累加器为 0，**O(节点数)** 几乎免费。

### 7. 混合搜索：贪心 + JSON FILTER

产品常要「相似 + 属性过滤」（如 1980–1990 年电影）。作者认为很多场景用**按年份分 key** 更省；仍实现了在贪心循环里挂 JSON 元数据 + 表达式过滤：

```text
VSIM movies VALUES ... FILTER '.year >= 1980 and .year < 1990'
```

洞察：先要**近**向量，不必为极少数匹配 filter 的远点扫全图；用户可设 **effort** 上限。

### 8. 对「H」是否必要的开放态度

多层相对单层约 1.3× 指针；早期实验显示**全在 layer 0** 时 seek 更慢但仍能到正确簇。作者在跟踪「flat HNSW」研究（见文未 arXiv:2412.01940），认为 HNSW **不是最后一句话**，删除、单层、磁盘变体仍有论文空间。

## 代码示例

### 示例 1：Python 模拟 int8 量化距离（理解 Redis 默认路径）

```python
import numpy as np

def quantize_int8(vec: np.ndarray) -> tuple[np.ndarray, float]:
    """Per-vector int8，与 antirez 描述一致：用 max_abs 定标"""
    max_abs = float(np.max(np.abs(vec)))
    if max_abs == 0:
        return np.zeros(len(vec), dtype=np.int8), 0.0
    q = np.clip(np.round(vec / max_abs * 127), -127, 127).astype(np.int8)
    return q, max_abs

def distance_q8(a: np.ndarray, b: np.ndarray) -> float:
    qa, ra = quantize_int8(a)
    qb, rb = quantize_int8(b)
    scale = (2 * ra / 127) * (2 * rb / 127)  # range = 2*max_abs
    dot = int(qa.astype(np.int32) @ qb.astype(np.int32))
    return dot * scale  # 与 float 点积近似；归一化向量时可当 cosine 相关

v1 = np.random.randn(300).astype(np.float32)
v2 = v1 + np.random.randn(300) * 0.01
print("float dot:", float(v1 @ v2))
print("q8 dot:   ", distance_q8(v1, v2))
```

### 示例 2：客户端分片查询 + merge（Scaling 多实例）

```python
import asyncio
import numpy as np
from dataclasses import dataclass

@dataclass
class Hit:
    key: str
    score: float  # cosine distance，越小越相似

async def vsim(redis, shard_key: str, query: list[float], k: int) -> list[Hit]:
    # 伪代码：对应 Redis VSIM ... WITHSCORES
    raw = await redis.execute_command(
        "VSIM", shard_key, "VALUES", *query, "WITHSCORES", "COUNT", k
    )
    # raw 形如 [elem1, score1, elem2, score2, ...]
    return [Hit(raw[i], float(raw[i + 1])) for i in range(0, len(raw), 2)]

async def vsim_sharded(clients, shard_keys, query, k=10):
    """并行查 N 个 Redis 实例，merge 全局 top-k（最小 distance）"""
    chunks = await asyncio.gather(
        *[vsim(r, key, query, k) for r, key in zip(clients, shard_keys)]
    )
    merged = sorted((h for part in chunks for h in part), key=lambda h: h.score)
    return merged[:k]

def pick_shard(element: str, n: int) -> int:
    return hash(element) % n  # 写路径：元素落哪个 key
```

### 示例 3：简化贪心搜索 + filter（理解 FILTER 插入点）

```python
import heapq

def greedy_search(entry, query, graph, k, ef, pred):
    """
    graph[u] -> list of neighbor ids
    pred(node) -> bool  类似 VSIM FILTER
    """
    candidates = [(-dist(query, entry), entry)]  # max-heap by neg dist
    results = []
    visited = set()

    while candidates and len(candidates) <= ef:
        d, c = heapq.heappop(candidates)
        c = -c if False else c  # 示意：应用 max-heap 取最近
        _, c = heapq.heappop(candidates)
        if results and d > -results[0][0]:
            break
        for nb in graph[c]:
            if nb in visited:
                continue
            visited.add(nb)
            if not pred(nb):
                continue
            nd = dist(query, nb)
            heapq.heappush(candidates, (-nd, nb))
            if len(results) < k:
                heapq.heappush(results, (-nd, nb))
            elif nd < -results[0][0]:
                heapq.heapreplace(results, (-nd, nb))
    return [id for _, id in sorted(results, reverse=True)]

def dist(q, node):
    return 1.0  # 占位：实际为 cosine / L2
```

## 性能与内存速查

| 场景 | 数量级（作者实测/自述） |
|------|-------------------------|
| 单线程插入 Word2Vec 300 维 | ~5k 元素/s |
| 单线程查询 | ~90k QPS |
| redis-benchmark 真实向量 workload | ~50k ops/s |
| 300 万 Word2Vec，int8 默认 | ~3GB RAM，~1KB/条 |
| 图结构 RDB 加载 vs 重插 | ~100× 更快 |

## 与 RediSearch / 其它实现的对比

| 维度 | RediSearch 向量索引 | Redis Vector Sets（此文） |
|------|---------------------|---------------------------|
| 抽象 | 文档字段上的二级索引 | 独立 key 类型，类似 Sorted Set |
| 组合性 | 绑定搜索 schema | 任意 payload；多 key 分片自然 |
| 删除 | 依赖具体引擎 | 真删 + 重连邻居 |
| 过滤 | 索引侧能力 | 贪心内 JSON FILTER + effort 上限 |

## 局限与作者态度

- **内存**：in-memory 是设计选择；极大规模冷数据应用磁盘友好结构（Microsoft DiskANN 等），热集仍可能放 RAM。
- **研究未完成**：指针压缩、层数策略、flat vs hierarchical 仍在探索。
- **采用曲线**：作者预期像 Redis Streams 一样，**要很多年**用户才充分挖掘向量能力——「不只是 RAG」。

## 延伸阅读

- HNSW 原论文与基础笔记：本库 [`hnsw-2018.md`](./hnsw-2018.md)
- Vector Sets 设计说明：[redis/modules/vector-sets README](https://github.com/redis/redis/tree/unstable/modules/vector-sets)
- 实现源码：[hnsw.c](https://github.com/redis/redis/blob/unstable/modules/vector-sets/hnsw.c)
- 「H 层是否必要」：[arXiv:2412.01940](https://arxiv.org/abs/2412.01940)
- 更早一篇：Vector Sets 入 Redis 公告 [antirez news/149](https://antirez.com/news/149)（双向边、线程化 VSIM 动机）

## 小结

**Scaling HNSWs** 的价值在于：把学术论文里的近似近邻图，翻译成 **Redis 可运维、可扩展、可删可载** 的具体决策——int8 量化、per-thread epoch、读写半段、双向边真删除、图序列化、分 key 水平扩展、贪心内过滤。零基础读者应先掌握 HNSW 贪心与 M/ef 含义，再读此文作为**工程进阶**；有实现经验者可直接对照 `hnsw.c` 当「带注释的 design doc」。
