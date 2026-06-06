---
title: hnswlib — HNSW 论文作者写的参考实现，业界向量库都基于它
来源: 'Yury Malkov & Dmitry Yashunin（HNSW 论文原作者），开源 https://github.com/nmslib/hnswlib'
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

hnswlib 是 HNSW 论文（TPAMI 2018，arXiv:1603.09320）两位作者亲手写的 C++ 参考实现，**纯头文件 + 零依赖 + Python 绑定**。它不是一个"功能丰富的向量数据库"，而是一段 4000 行左右、能直接嵌入任何 C++ 工程的算法内核。

日常类比：HNSW 论文像一本菜谱，hnswlib 是作者自己开的样板店——证明菜谱真的能落地。后来的 Milvus、Weaviate、Qdrant、pgvector、Elasticsearch 的 knn 模块、Faiss 的 IndexHNSW，要么直接复用它，要么按它的写法重写一遍。

也就是说：**当你用任何向量数据库时，底下转的多半是这段代码或它的二次实现**。

## 为什么重要

不理解 hnswlib 的存在价值，下面这些事都没法解释：

- 为什么向量数据库百花齐放，但底层 ANN 算法高度同质——大家都在跑同一份 HNSW
- 为什么作者用 C++ 头文件而不是写成共享库——便于嵌入、便于针对项目编译期优化
- 为什么算法论文作者亲自写代码很罕见但很重要——参数命名、默认值、踩坑提示都是论文里没写的工程经验
- 为什么 RAG 时代每个写 Python 的人都装过 `pip install hnswlib`，但很少有人意识到自己用的就是论文原作者的代码

## 核心要点

hnswlib 把 HNSW 算法落成可调用 API，关键设计点有 **三个**：

1. **header-only**：核心文件 `hnswalg.h` 一个头一切搞定。模板化让用户可以传任意距离函数、任意标量类型，编译器内联到极致。代价是包含它的 `.cpp` 编译变慢，但向量库这种长生命周期工具不在乎。

2. **空间抽象**：`space_l2.h` / `space_ip.h` 把"距离怎么算"抽出来，索引本身只关心"给两个 id 算距离"。换距离不用改图算法。这套抽象后来被 Faiss 等项目沿用。

3. **Python 绑定走 pybind11**：上层用户基本只看到一个 `hnswlib.Index(space, dim)`。建索引时传 `M`（每层最大邻居数）和 `ef_construction`（构建期搜索宽度），查询时调 `set_ef(ef)` 动态调精度。

加上一个工程关键点：**线程安全的并发插入**。`add_items` 内部用细粒度锁让多线程同时写入，配合 `num_threads` 参数能直接吃满多核——不需要用户自己去碰 GIL。

复杂度：构建 O(N log N)，查询期望 O(log N)，内存约 1.1 至 1.5 倍向量本体大小。这三个数字决定了它"几千万级向量、单机能跑"的甜蜜点。

直觉对照：
- 同样的 HNSW 算法，Faiss 自己的 IndexHNSW 实现 **更快**（针对 SIMD 调优过），但绑定更重
- hnswlib **更轻**（头文件、零依赖、易嵌入），适合作为底层组件被别人封装
- 学习 HNSW 算法读 hnswlib，做生产可能切到 Faiss / 直接用上层数据库

## 实践案例

### 案例 1：20 行 Python 跑通

```python
import hnswlib
import numpy as np

dim, num = 128, 100_000
data = np.random.rand(num, dim).astype(np.float32)

idx = hnswlib.Index(space='l2', dim=dim)
idx.init_index(max_elements=num, M=16, ef_construction=200)
idx.add_items(data, np.arange(num), num_threads=8)

idx.set_ef(50)  # 查询期搜索宽度，越大越准越慢
labels, distances = idx.knn_query(data[:5], k=10)
print(labels.shape)  # (5, 10)

idx.save_index('idx.bin')
```

**注意**：`max_elements` 是上限，超出要 `resize_index(new_max)`。`M` 和 `ef_construction` 一旦建好就不能改。

### 案例 2：cosine 相似度的隐藏坑

```python
idx = hnswlib.Index(space='cosine', dim=dim)
```

hnswlib 的 cosine 实际上是 **1 - inner_product**，向量必须先 L2 归一化才正确。文档里写了，但很多人没看：

```python
data = data / np.linalg.norm(data, axis=1, keepdims=True)
idx.add_items(data, ids)
```

不归一化会得到一堆"看起来很相似但其实不对"的结果。生产里一般用 `space='ip'` + 显式 normalize，更直白。

### 案例 3：增量插入与上限调整

```python
idx.init_index(max_elements=100_000, M=16, ef_construction=200)
idx.add_items(batch1)  # 假设填到 9 万
idx.resize_index(200_000)  # 扩容到 20 万
idx.add_items(batch2)  # 继续插
```

`resize_index` 是真正在线扩容（不是重建），这点在文档浅尝辄止，但生产很关键——索引大小没法预先精确估算时不至于崩。

### 案例 4：删除是软删除

```python
idx.mark_deleted(label_id)
```

这只在节点上打个标记，让查询时跳过它。**空间不回收**，图结构也不重建。如果删除占比很大，最优解是周期性 `save_index → 重新 add_items` 重建。这是 HNSW 算法本身的局限——任何基于它的数据库都绕不开。

## 踩过的坑

1. **参数选错只能重建**：`M` 影响内存（越大越准越占内存），`ef_construction` 影响构建时间（越大建得越久越准）。建好之后这两个参数**冻结**。新人常常按默认建完才发现召回不够，只能从头来过。

2. **Python parallel 走 num_threads，不要用 multiprocessing**：底层是 C++ 多线程，绕过 GIL。用 `multiprocessing` 反而要复制整个索引到每个子进程，又慢又吃内存。

3. **save / load 二进制不跨架构**：保存的文件包含原始 byte order 的浮点和指针偏移，跨 x86 / ARM 或跨编译器版本可能读不出。生产环境最好把"保存的版本号"写进文件名。

4. **内存预算约 1.1 至 1.5 倍向量本体**：图结构本身占用约等于"每个点 M 个 4 字 (byte) 邻居 ID × 平均层数"。1000 万条 768 维 float32 向量本体约 30 GB，索引整体 33 至 45 GB——单机能不能塞下要先算。

5. **不支持 GPU**：作者明确说过 hnswlib 不打算做 GPU 版本。要 GPU 跑 HNSW 用 Faiss。

## 适用 vs 不适用场景

**适用**：
- 想把"向量近邻搜索"嵌进自己的 C++ 服务，不想拉一个数据库依赖
- 用 Python 做研究 / 原型，几百万到几千万条向量、单机够用
- 学习 HNSW 算法——读论文 + 读 hnswlib 是公认最快路径
- 需要"作者亲自维护、参数语义最权威"这个保证（写 paper / benchmark 时尤其重要）

**不适用**：
- 上亿条向量、需要分片 / 副本 / 高可用 → 用 Milvus / Vespa / 上层数据库
- 高频增删改、需要事务 → HNSW 算法本身不擅长，hnswlib 也没补
- 想用 GPU 加速 → Faiss IndexHNSWFlat
- 需要混合检索（向量 + 全文）→ Elasticsearch / Vespa / Qdrant 的上层封装

## 学到什么

1. **算法库的"小"是个特性**：4000 行 C++ 头文件能撑起整个向量数据库行业，证明优秀的核心算法实现不需要复杂工程
2. **作者写参考实现极有价值**：默认参数、命名、文档里那些"踩过的坑"是论文里读不到的
3. **HNSW 是事实标准**：如果你只想了解一种 ANN 算法，选 HNSW；如果只想会用一个库，选 hnswlib 或它的衍生品
4. **删除困境是图索引的通病**：选 HNSW 之前先想清楚业务删除频率，软删除积累到 30 percent 以上就该重建

## 延伸阅读

- 仓库主页：[nmslib/hnswlib](https://github.com/nmslib/hnswlib)（README 即最佳入门，5 分钟读完）
- 算法源码：[hnswalg.h](https://github.com/nmslib/hnswlib/blob/master/hnswlib/hnswalg.h)（800 行核心算法，对照论文逐段读）
- 性能对照：[ann-benchmarks](https://ann-benchmarks.com/)（HNSW / Faiss-HNSW / nmslib-HNSW 同台 PK）
- [[hnsw-2018]] —— hnswlib 实现的论文本体
- [[ann-benchmarks]] —— ANN 算法横向 benchmark 平台

## 关联

- [[hnsw-2018]] —— hnswlib 是这篇论文的官方参考实现
- [[annoy]] —— Spotify 的随机投影森林 ANN 库，跟 hnswlib 是不同算法路线（图 vs 树）
- [[faiss-2017]] —— Meta 的向量检索框架，IndexHNSW 子模块基于 hnswlib 思路重写
- [[milvus]] —— 国产开源向量数据库，HNSW 索引引擎走 hnswlib 路线
- [[qdrant]] —— Rust 写的向量数据库，HNSW 实现致敬 hnswlib

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ann-benchmarks]] —— ANN-Benchmarks — 近似最近邻算法的统一擂台
- [[annoy]] —— Annoy — Spotify 的随机森林近似最近邻索引
- [[faiss-2017]] —— FAISS 2017 — 用 GPU 在十亿向量里找最近邻
- [[hnsw-2018]] —— HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)
- [[milvus]] —— Milvus — 开源向量数据库
- [[qdrant]] —— Qdrant — Rust 向量数据库

