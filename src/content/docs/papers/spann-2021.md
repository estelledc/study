---
title: SPANN — 内存放中心、SSD 放向量的十亿级近邻检索
来源: 'Chen et al., "SPANN: Highly-efficient Billion-scale Approximate Nearest Neighborhood Search", NeurIPS 2021'
日期: 2026-05-31
分类: 数据库
难度: 高级
---

## 是什么

SPANN 是微软 2021 年提出的**十亿向量近邻检索方案**，核心一句话：内存里只放"分组目录"，完整向量按组切片落到 SSD。查询时先翻目录定位几个组，再只读这几片磁盘。

日常类比：一座 10 亿本书的图书馆。

- 全内存方案（HNSW）：把每本书摊在地上，需要一个体育馆大小的地（100+ GB 内存）
- SPANN：内存里只放一张"楼层索引图"（几万个聚类中心），书按聚类放到不同抽屉（磁盘 posting list）。查询时看一眼索引图找最近的几个抽屉，只开那几个抽屉

跟同期的 [[diskann-2019]] 比，DiskANN 用**图**索引存 SSD，SPANN 用**倒排表**（inverted index）存 SSD——思路不同，工程权衡也不同。

## 为什么重要

不理解 SPANN，下面这些事都没法解释：

- 为什么微软 Bing 的向量检索能在单机服务十亿级数据——它的底层正是 SPANN（开源版叫 SPTAG）
- 为什么 1B 规模向量检索的内存能压到约原全量的一成量级——SPANN 把"完整向量"赶下了 SSD
- 为什么 2022 年后的向量数据库（Milvus / Vespa / Qdrant）都讨论"分层存储"——SPANN 给出了倒排表流派的工程范式
- 为什么"经典 IVF（FAISS）+ SSD"在 1B 规模会失效——posting list 严重不平衡，SPANN 的层次平衡聚类是核心修复

## 核心要点

SPANN 的整体结构可以拆成 **两层**：

1. **内存层（Centroid Index）**：把 1B 个向量聚成大量小簇，每簇取一个中心点，所有中心点放进一个内存索引（SPANN 用 SPTAG：像"先粗分再细分"的树形目录，BKT/KD-tree 只是两种分法）
2. **磁盘层（Posting Lists）**：每个簇的所有完整向量打成一个 posting list，落到 SSD

查询时三步：

1. 在内存索引里找最近的 **k 个**中心（典型上限几十到上百）
2. 只从 SSD 读这 k 个对应的 posting list
3. 在读到的向量里精排，返回 top-N

听起来朴素，但要在 1B 规模真跑起来，SPANN 解了**三个工程难题**：

- **层次平衡聚类（Hierarchical Balanced Clustering）**：朴素 k-means 在 1B 数据上会让某些簇有几百万点、有些只有几百，磁盘读极不均匀。SPANN 用递归平衡聚类，强制每簇大小接近
- **边界点复制（Closure Boundary Expansion）**：聚类边界附近的点，可能它的真实最近邻在邻簇里。SPANN 把这些点**复制**到邻簇 posting list，代价是磁盘空间膨胀，换召回率（recall，"该找到的有多少真找到了"）大幅提升
- **查询感知动态剪枝（Query-aware Dynamic Pruning）**：不是固定读 k 个 posting list，而是看查询点到中心的距离分布动态决定。距离骤增就停，避免无效磁盘读

## 实践案例

### 案例 1：1B SIFT 数据集上的内存对比

```text
全内存 HNSW 量级:  百 GB+（图 + 全部向量）
DiskANN / SPANN:   论文对齐约 32 GB 同内存预算对比
SPANN 内存里主要是: centroids（中心点目录）+ 导航元数据
```

向量按单精度浮点（fp32，每个数 4 字节）存约 480 GB（1B × 128 维 × 4）。SPANN 把完整向量赶到 SSD；论文在 SIFT1B 上约用 32 GB 内存（约原全量的 10%）达到 90% recall@10（前 10 个结果里对了九成）。

### 案例 2：层次平衡聚类长什么样

```text
顶层：大簇再均分成少数子簇
向下：每个子簇继续均分
...
直到每条 posting list 小到几次磁盘读就能装进内存
```

最终得到**百万级、大小相近**的叶簇（论文约按向量数的 10–12% 选 posting 数）。每个叶簇的中心进内存索引，叶簇本身落 SSD。

### 案例 3：边界复制为什么必要

```text
查询 q 落在簇 A 边界附近
真实最近邻 p 在隔壁簇 B
朴素 IVF：只读 A 的 posting list → 找不到 p

SPANN：建索引时把 p 同时复制到 A 和 B
      → 读 A 时就能命中 p
代价：p 在两个 posting list 里各存一份（约 1.5× 磁盘空间）
```

这一招让 SPANN 在 recall@10 = 0.9（前 10 命中九成）这条线上明显强于朴素 FAISS-IVF。

### 案例 4：动态剪枝怎么决定读几个 posting list

```text
查询 q 找到的最近 64 个中心，按距离排序：
  c1: 0.12   c2: 0.15   c3: 0.16   ...
  c20: 0.45  c21: 0.92  c22: 1.10  ...

dist(c1) 到 dist(c20) 平稳上升 → 都值得读
dist(c20) 到 dist(c21) 突变 → 后面这些远到没意义,停

SPANN 用一条简单阈值（基于已读 posting list 的最差距离）
平均把 64 个候选剪到约 8-16 个，磁盘 IO 降 4-8×
```

这一步对延迟影响最大——不剪枝的 SPANN 延迟跟 FAISS-IVF 差不多，剪枝后才显出优势。

## 踩过的坑

1. **机械硬盘上 SPANN 退化严重**：SPANN 假设 SSD 随机读 IOPS 高（NVMe 约 100K+ IOPS）。换成 HDD（约 100 IOPS），单查询要等 30+ 秒
2. **聚类数选不好两头吃亏**：簇太少 → posting list 太大磁盘读放大；簇太多 → 内存里 centroid 索引膨胀。论文按每条 list 体积上限与约向量数 10–12% 的 posting 数来选
3. **边界复制不是免费的**：磁盘与 build 成本上升（每点最多若干副本）。若允许低 recall（例如 0.7），可减弱这步省成本
4. **构建时间长**：1B 数据建一次索引要几小时到一天。增量更新需要额外设计（论文未详细处理）

## 适用 vs 不适用场景

**适用**：

- 数据量 >= 100M，且全内存方案放不下 → SPANN / DiskANN 二选一
- 有 SSD（最好 NVMe），随机读 IOPS 充足
- 召回率要求 0.85-0.95（top-k recall），延迟容忍约 1–10ms（论文约 1ms 可达 90% recall）
- 静态或半静态数据，更新频率低（每天 / 每周 rebuild）

**不适用**：

- 数据量 < 10M，纯内存方案（HNSW / FAISS-HNSW）反而更简单
- 高频更新（每秒新增）→ SPANN 增量支持有限，考虑 Milvus / Vespa 这类带 segment 的系统
- HDD 环境 → 退化严重，必须 SSD
- 亚毫秒硬实时且内存够用 → 全内存图索引更合适

## 历史小故事（可跳过）

- **2017**：FAISS（Facebook）把 IVF + PQ 推到工程极致，但在 1B 规模 posting list 失衡问题暴露
- **2018**：[[hnsw-2018]] HNSW 算法封神，但要求全内存，1B 数据需要 100+ GB
- **2019**：[[diskann-2019]] 微软提出 DiskANN，第一次证明"图 + SSD"能扛 1B
- **2021**：同样微软的另一组人提出 SPANN，走"倒排表 + SSD"路线。开源为 SPTAG 项目，进入 Bing 生产线
- **2022 后**：向量数据库百花齐放（Milvus / Qdrant / Vespa），分层存储成为标配

## 学到什么

1. **分层存储是大数据系统的本能**：内存放索引（小、热）、SSD 放数据（大、冷），SPANN 把这一原则用到了向量检索
2. **k-means 在大规模数据上会不平衡**：层次平衡聚类是非常通用的修复，可以迁移到任何"按聚类切片"的系统
3. **复制换召回是值得的**：有限磁盘膨胀换几个点 recall，工业上几乎总是划算
4. **同期同公司的两篇论文路线不同**：DiskANN（图）vs SPANN（倒排），说明"哪个更好"看场景，不存在银弹

## 延伸阅读

- 论文 PDF：[arXiv 2111.08566](https://arxiv.org/abs/2111.08566)
- 开源实现：[microsoft/SPTAG](https://github.com/microsoft/SPTAG)（C++ 版，Bing 同款）
- 对比博文：[Pinecone — SPANN vs DiskANN vs HNSW](https://www.pinecone.io/learn/series/faiss/)（系列文章）
- [[diskann-2019]] —— 同样十亿级、同样微软，但用图索引
- [[hnsw-2018]] —— 全内存图，SPANN 想解决它的内存瓶颈
- [[faiss-2017]] —— 经典 IVF+PQ，SPANN 的对照组

## 关联

- [[hnsw-2018]] —— SPANN 想替代的全内存方案
- [[diskann-2019]] —— SPANN 的同期对手，思路不同（图 vs 倒排）
- [[faiss-2017]] —— SPANN 在 IVF 路线上做的下一代改进
- [[scann-2020]] —— Google 走的是量化压缩路线，与 SPANN 的分层路线正交，可以叠加

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[diskann-2019]] —— DiskANN — 单机十亿向量近邻检索（图存 SSD）
- [[faiss-2017]] —— FAISS 2017 — 用 GPU 在十亿向量里找最近邻
- [[hnsw-2018]] —— HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)
- [[scann-2020]] —— ScaNN — 让向量量化只精修「客户会看到的那一面」

