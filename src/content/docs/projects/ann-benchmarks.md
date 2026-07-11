---
title: ANN-Benchmarks — 近似最近邻算法的统一擂台
来源: https://github.com/erikbern/ann-benchmarks
日期: 2026-05-31
分类: 数据检索 / 基础设施
难度: 中级
---

## 是什么

ANN-Benchmarks 是 Erik Bernhardsson（Spotify Annoy 的作者）维护的一套**给"近似最近邻算法"打分的统一擂台**。日常类比：你想知道哪款跑鞋跑步快，不是听厂商广告，而是把所有牌子拉到同一个塑胶跑道，同一双袜子、同一个天气、同一段距离，逐个测。

它做一件事：

- 把市面上所有声称"我能在亿万向量里快速找到最近邻"的算法（FAISS、HNSW、Annoy、ScaNN、DiskANN ...）
- 装进**一个 Docker 容器一个**，喂同样的数据集，跑同样的查询
- 画一张图：横轴**召回率（recall）**，纵轴**每秒能处理的查询数（QPS）**

这张图后来被称作"召回-延迟曲线"，是过去 7 年所有 ANN 论文 / 厂商对比的黄金标准。

## 为什么重要

不理解 ANN-Benchmarks 的位置，就理解不了向量检索整个生态怎么校准：

- **常用公开 benchmark**：FAISS、ScaNN、DiskANN 以及许多向量数据库（[[milvus]] / [[pgvector]] / qdrant）做横向对比时，都会参考这类召回-延迟曲线
- **厂商宣称的"翻译器"**：A 厂说"亚毫秒级查询"，B 厂说"99% 召回"，单看没法比；放到这张曲线上一秒看清谁在前
- **架构选型依据**：你做 RAG / 推荐 / 相似搜索，要选 HNSW 还是 IVF-PQ，看这张图比读 10 篇论文都快
- **filter 缺位是 open_question**：现实业务普遍要"召回最像 + 满足 WHERE 条件"，但这张图**不测**，是当前向量检索界公认的空白

## 核心要点

ANN-Benchmarks 的设计可以拆成 **三个轴 + 一条铁律**：

1. **三个轴的笛卡尔积**：
   - **数据集**：SIFT-128（1M 图像特征）/ GloVe-100（词向量）/ GIST-960 / Fashion-MNIST / NYTimes-256
   - **算法**：每个算法实现一个 `BaseANN` 接口，只要有 `fit(X)` 和 `query(v, n)` 两个方法
   - **距离度量**：欧氏（Euclidean）、角度（Angular，等价余弦）

2. **铁律：单线程 + Docker 隔离**：
   - 默认**单 CPU 线程**跑——多核很容易把单核劣势盖过去，单线程才是公平比较
   - 每个算法装在独立 Docker 镜像里，依赖冲突、Python 版本、BLAS 选型互不干扰

3. **唯一指标：recall@10 vs QPS**：
   - x 轴：top-10 召回率（暴力扫描的 10 个邻居里命中几个，0~1）
   - y 轴：每秒查询数，对数刻度
   - 同一个算法跑多组超参，连成一条曲线——曲线越靠**右上**越好

## 实践案例

### 案例 1：读懂这张图怎么用

```
QPS (log)
  10000 |  HNSW *
        |       \
   1000 |  ScaNN  *
        |        \   FAISS-IVF
    100 |         *--------*
        |                   \  Annoy
     10 |                    *---*
        +-------------------------> recall@10
        0.5     0.8     0.95   1.0
```

**怎么读**：

- 想要 95% 召回 → HNSW 能给你 1000 QPS，FAISS-IVF 只能 100 QPS
- 想要 99.9% 召回 → 所有算法都掉到 100 QPS 以下，没有"完美方案"
- 召回不重要（< 80%） → Annoy 也能跑得飞快，省内存

### 案例 2：自己跑一次（最少命令）

```bash
git clone https://github.com/erikbern/ann-benchmarks
cd ann-benchmarks
pip install -r requirements.txt

# 在 SIFT-128 上跑 HNSW
python run.py --dataset sift-128-euclidean --algorithm hnswlib

# 出图
python plot.py --dataset sift-128-euclidean
```

第一次跑会下数据 + 拉 Docker 镜像，**4 核机器一晚上**能跑完一个数据集 × 5 个算法。

### 案例 3：写一个新算法接入

```python
# ann_benchmarks/algorithms/my_algo.py
from .base import BaseANN

class MyAlgo(BaseANN):
    def __init__(self, metric, param):
        self.param = param
    def fit(self, X):
        # 建索引
        pass
    def query(self, v, n):
        # 返回 top-n 邻居 id
        return [...]
```

加一个 Dockerfile + 一份 YAML 配置（写超参网格），就能进擂台。这种**低门槛接入**是它能聚拢所有算法的关键。

## 踩过的坑

1. **单线程不等于生产场景**：真实业务一台机器开 16 线程批量查询，多核扩展性、内存带宽冲突、缓存争用都是新变量。曲线第一名换到生产可能不是第一。

2. **recall@10 不测排序质量**：召回出 10 个邻居里命中 9 个算 0.9，但你作为用户更在乎"最接近的那个"是不是真的第一名。要测排序得用 mAP / nDCG，这套 benchmark 不覆盖。

3. **数据集偏小**：主流数据集只到 1M 向量，DEEP-image 也只到 1B 子集。**10B+ 规模**（云厂商常见）的内存换盘策略（DiskANN）没法在这里完整对比。

4. **filter 完全缺位**：现实查询常带 WHERE（`category = 'shoes' AND price < 100`），ANN-Benchmarks **不测带过滤的检索**。这是当前向量数据库竞争的真正主战场，但没有公共标尺。

5. **Docker 镜像漂移**：跨年比较时，base image / BLAS / glibc 都会变。2020 年的曲线和 2026 年的曲线**不能直接拼**，要看是不是同一次"集中跑"产生的。

## 适用 vs 不适用场景

**适用**：

- 选型阶段对比候选 ANN 算法 / 库 / 数据库
- 写 ANN 论文时找 baseline + 公平对照
- 看自己实现的索引比业界主流差多少
- 教学：把"召回-延迟"权衡可视化

**不适用**：

- 评估带 filter 的混合查询（这是空白）
- 评估超大规模（10B+）磁盘索引
- 评估多线程 / 批量查询的实际吞吐
- 评估排序质量（mAP / nDCG）
- 评估更新 / 删除的成本（这套只测**静态**索引）

## 历史小故事（可跳过）

- **2015 年前后**：Spotify 的 Erik Bernhardsson 在 Annoy 之后开始整理公开 ANN 对比工具，核心目标是把"同机同数据"变成默认姿势。
- **2017-2019 年**：HNSW、FAISS、ScaNN、DiskANN 等路线快速迭代，ANN-Benchmarks 的召回-延迟图成为论文和工程博客常见背景板。
- **2020 年之后**：向量数据库兴起，大家开始发现 benchmark 缺少 filter、增删改、多租户等生产维度。
- **今天**：它仍然适合做算法层面的第一轮校准，但不能替代真实业务压测。

## 学到什么

1. **统一接口 + Docker 隔离**是搞 benchmark 的两根支柱——少一根就会被"我环境不一样"挡回去
2. **召回-延迟曲线**是这个领域的"血压计"，所有讨论都从这张图开始
3. **铁律是公平**：单线程、同数据、同硬件——只要让算法**看起来不公平**就毫无信息量
4. **缺什么**比"测什么"更值得看：filter / 多线程 / 排序质量都是当前 ANN 系统的真实痛点

## 延伸阅读

- 在线结果：[ann-benchmarks.com](https://ann-benchmarks.com)（持续维护的公开结果）
- 代码仓库：[erikbern/ann-benchmarks](https://github.com/erikbern/ann-benchmarks)
- HNSW 原论文：Malkov & Yashunin 2018，"Efficient and robust approximate nearest neighbor search using HNSW"
- DiskANN 论文：Subramanya 2019，把 ANN 索引扩展到磁盘
- [[faiss]] —— Facebook 出的 ANN 库，是 ANN-Benchmarks 的常驻顶尖选手
- [[pgvector]] —— PG 扩展，间接基于 hnswlib

## 关联

- [[faiss]] —— Facebook ANN 库，ANN-Benchmarks 上的常驻第一梯队
- [[pgvector]] —— PostgreSQL 的向量扩展，HNSW 实现来自 hnswlib
- [[milvus]] —— 专门向量数据库，对外宣传引用 ANN-Benchmarks 数据
- [[qdrant]] —— Rust 写的向量数据库，filter-aware 检索是它的差异化
- [[hnswlib]] —— HNSW 的参考实现，ANN-Benchmarks 上长期 SOTA

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[salton-vsm-1975]] —— Salton VSM 1975 — 把文档变成向量再用余弦比相似度
- [[faiss]] —— FAISS — 向量检索的标准件库
- [[hnswlib]] —— hnswlib — HNSW 论文作者写的参考实现，业界向量库都基于它
- [[lancedb]] —— LanceDB — 嵌入式向量库（进程内 + 对象存储）
- [[lm-evaluation-harness]] —— lm-evaluation-harness — LLM 基准评测底座
- [[locust]] —— Locust — 用 Python 写压测脚本的分布式负载工具
