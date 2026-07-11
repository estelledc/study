---
title: DiskANN — 单机十亿向量近邻检索（图存 SSD）
来源: 'Subramanya et al., "DiskANN: Fast Accurate Billion-point Nearest Neighbor Search on a Single Node", NeurIPS 2019'
日期: 2026-05-30
分类: 数据库
难度: 高级
---

## 是什么

DiskANN 是一套**让一台普通服务器（64GB 内存）从十亿条向量里 5 毫秒内找出最相似 K 条**的近邻检索算法。

日常类比：图书馆有 10 亿本书，你想找"和这本最像的 10 本"。

- 旧办法（HNSW）：把所有书的索引卡片摊在桌面上对比 → 桌面（内存）放不下
- DiskANN：桌面只放每本书的"摘要小卡片"（压缩向量），完整卡片放在抽屉（SSD）里；先按摘要筛一轮，再开抽屉确认

核心两招：**Vamana 图**（一种特殊的近邻图）+ **图存 SSD、压缩向量留内存**。

## 为什么重要

不理解 DiskANN，下面这些事都没法解释：

- 为什么十亿级向量库还能在单机上做到毫秒级近邻检索——不必先堆一整机柜内存
- 为什么微软 Bing 等语义检索会走 SSD 图索引：论文在 16 核 + 64GB 机器上做到 >5000 QPS、<3ms 均值延迟、95%+ 1-recall@1
- 为什么 HNSW（2018）那么火却没解决"超大规模"——HNSW 必须全内存，1B 点要数百 GB 内存
- 为什么 2023 年后向量数据库赛道里"SSD 索引"成了关键词——DiskANN 验证了 SSD 路径可行；Pinecone / Milvus 等也可选同类思路，不等于它们都绑死 DiskANN

## 核心要点

DiskANN 解决两个问题，对应两个设计：

### 1. Vamana 图：怎么连边才能"跳得快"

近邻图就是把每个向量当节点，给每个节点连若干条到"相似邻居"的边。搜索时从一个起点出发，每步看当前节点的邻居哪个最接近查询，跳过去，直到不能更近。

**关键问题**：边怎么选？只连最近的邻居 → 全是短边，从一头到另一头要跳很多次。

Vamana 的招数叫 **RobustPrune（鲁棒剪枝）**，引入参数 **alpha ≥ 1**：

- 把候选邻居按距离排序
- 逐个加入：每加一条边 (p, p\*)，剔除所有"p\* 离它们比当前候选更近 / alpha"的候选
- alpha=1 时严格剪枝，只剩短边；alpha=1.2~2 时**故意保留长跳边**

类比：拼图你不光要知道相邻碎片，还要知道"对角斜跨那块在哪"——这样找远处目标几跳就到。

### 2. SSD 设计：哪些放内存、哪些放盘

| 数据 | 大小 | 放哪 | 为什么 |
|------|------|------|--------|
| 压缩向量（PQ，product quantization）| 每条 ~32B | 内存 | 选下一跳要算距离，必须快 |
| 全精度向量 + 邻居表 | 每条 ~660B | SSD（4KB 页）| 只在最后一步取用 |

**搜索流程**：

1. 从固定起点 s 开始，用内存里的压缩向量算近似距离，决定下一跳
2. 跳到候选节点 → 从 SSD 读对应 4KB 页（全精度向量 + 邻居表）
3. 重复 5-10 次 → 候选集稳定 → 用全精度向量重排，输出 top-K

NVMe SSD 一次 4KB 随机读约 0.1ms，5-10 次 ≈ 1ms，加上内存计算总共约 5ms。

### 3. 怎么建图（不让 64GB 内存爆）

1B 点的图直接建会爆内存，DiskANN 的招：

1. 用 k-means 把数据分成 ~40 个 shard，每 shard ~25M 点
2. 每个 shard 单独建 Vamana 内存图（25M × 660B ≈ 16GB，单机能装）
3. 把所有 shard 的边合并成一张全图（同一节点出现在多个 shard，邻居取并集去重）

全程 64GB 机器跑 ~5 天。建完写到 SSD 后再也不动。

## 实践案例

### 案例 1：搜索一次的伪代码

```python
def search(query, L=100):  # L 是候选集大小（beam）
    visited = set()
    candidates = {start_node}  # 固定起点；用 set 才能做差集
    while True:
        # 用内存里的 PQ 压缩向量，在「未访问候选」里找最近的下一跳
        frontier = candidates - visited
        if not frontier:
            break
        next_node = min(frontier, key=lambda n: pq_distance(query, n))
        # SSD 读 4KB：拿到 next_node 的全精度向量 + 邻居表
        page = ssd_read(next_node)
        candidates.update(page.neighbors)
        visited.add(next_node)
        if len(visited) > L:
            break
    # 用全精度向量重排候选，返回 top-K
    return top_k_by_full_distance(query, candidates)
```

教学口径：大约 5–10 次 SSD 随机读，延迟落在数毫秒量级（论文高召回配置常报 <5ms）。

### 案例 2：实测数据（SIFT-1B 数据集）

- 数据：10 亿条 128 维向量（SIFT1B / bigann）
- 机器：单台 64GB 内存 + SSD（论文实验机 16 核）
- 结果：95%+ 1-recall@1，均值延迟 <3ms，吞吐 >5000 QPS（16 核）

对比同内存预算下的 FAISS 等压缩方案：论文指出它们 1-recall@1 常停在约 50% 一带；DiskANN 在高召回区还能比纯内存图索引多装约 5–10× 点数/节点。

### 案例 3：alpha 参数怎么影响图

alpha=1：每个节点只连最近的 K 个邻居 → 图很"局部"，从一头到另一头要 50+ 跳
alpha=1.2：少量长跳边被保留 → 平均 8-10 跳到目标
alpha=2：很多冗余远跳边 → 跳数少但每跳邻居多，单跳成本高

论文实测 alpha=1.2 在召回/延迟上最甜——这是个工程超参，没数学最优解。

## 踩过的坑

1. **PQ 压缩是召回天花板**：图再好，PQ 选错下一跳就再也救不回来。维度高（>500）或数据分布不均时 PQ 压缩损失明显，要么换 OPQ 要么加大码本（牺牲内存）。

2. **必须 NVMe SSD**：SATA SSD 随机读 0.5ms+，5 次就 2.5ms，整体延迟翻 5 倍。论文实验全在 NVMe 上。

3. **构建慢且不能增量**：1B 点建索引 5 天，每天新增 100 万也很难直接插进去。生产环境得做"主索引 + 增量小索引 + 定期合并"，DiskANN 论文没解决这块（SPANN 2021 接着做）。

4. **alpha 选错图就废**：调小（=1）搜索深度爆炸，调大（>2）每跳要看 200 个邻居，CPU 和 SSD 都吃不消。

## 适用 vs 不适用场景

**适用**：

- **大规模向量库**（10M-1B+）、内存装不下
- **延迟可接受 5-20ms** 的语义检索（搜索引擎、RAG、推荐召回）
- 有 NVMe SSD，能容忍**几小时到几天的离线建索引**

**不适用**：

- ≤10M 向量 → HNSW（全内存）通常更快也更简单
- 要求**实时插入大量新数据** → 图结构改动代价高，用 SPANN 或 Filtered DiskANN
- GPU 加速场景 → DiskANN 是 CPU+SSD 设计；GPU 上用 RAFT / cuVS
- 维度极高（>1000）且需要精确召回 → PQ 损失大，考虑全精度方案

## 历史小故事（可跳过）

- **2018 年**：HNSW 横扫向量检索，但全内存路径在 1B 规模时撞墙
- **2019 年 NeurIPS**：微软研究院印度组提交 DiskANN，证明 SSD 路径可行——一台普通机器顶以前一个集群
- **2020 年**：微软开源 DiskANN，Bing 搜索切换到这套引擎做语义检索
- **2021-2023 年**：SPANN（增量更新）、Filtered DiskANN（带属性过滤）相继提出；RAG 火起来后 Pinecone / Milvus / LanceDB 等向量库都把 DiskANN 列为底层选项

## 学到什么

1. **"内存全装下" 不是检索唯一路径** —— SSD + 分层数据布局能在不损失召回的前提下把成本降一个数量级
2. **图的"长跳边"很重要** —— RobustPrune 的 alpha 参数本质是"在邻近精度和搜索深度之间做权衡"，是图算法里反复出现的设计
3. **构建分片 + 边合并** 是处理超大规模图的通用招数，远不止 ANN
4. **工程超参没有银弹** —— alpha=1.2 是实测出来的，没数学最优；这种"现实参数"在系统论文里很常见

## 延伸阅读

- 论文 PDF：[DiskANN NeurIPS 2019](https://suhasjs.github.io/files/diskann_neurips19.pdf)（11 页，算法和实验都很清晰）
- 微软开源代码：[microsoft/DiskANN](https://github.com/microsoft/DiskANN)（C++，含 Python 绑定）
- 后续工作：[SPANN, NeurIPS 2021](https://arxiv.org/abs/2111.08566)（增量插入）、[Filtered DiskANN, SIGMOD 2023](https://harsha-simhadri.org/pubs/Filtered-DiskANN23.pdf)（带属性过滤）
- [[hnsw-2018]] —— 内存版近邻图，DiskANN 的直接对手
- [[product-quantization]] —— PQ 压缩，DiskANN 内存层的关键

## 关联

- [[hnsw-2018]] —— 全内存近邻图；DiskANN 是它的"上 SSD 版"
- [[bigtable-2006]] —— 同样是"分片建立、合并查询"的大规模数据系统范式
- [[b-tree-1972]] —— 经典磁盘索引；DiskANN 是向量空间的"图版 B-tree"
- [[shannon-1948]] —— 信息论奠定相似度/距离的数学基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[milvus-2021]] —— Milvus 2021：把向量搜索做成数据库
- [[salton-vsm-1975]] —— Salton VSM 1975 — 把文档变成向量再用余弦比相似度
- [[scann-2020]] —— ScaNN — 让向量量化只精修「客户会看到的那一面」
- [[spann-2021]] —— SPANN — 内存放中心、SSD 放向量的十亿级近邻检索
