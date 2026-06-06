---
title: Milvus — 为向量检索而生的数据库
来源: 'Wang et al. "Milvus: A Purpose-Built Vector Data Management System". SIGMOD 2021'
日期: 2026-06-06
分类: 数据库
子分类: 存储与查询
难度: 中级
---

## 是什么

Milvus 是一个 **专门为「找最相似的向量」** 设计的数据管理系统（向量数据库）。你把图片、文本、音频编码成高维向量存进去，它能在毫秒级从十亿条里找出 Top-K 最像的。

日常类比：传统数据库像图书馆按书名编号找书；Milvus 像「以图搜图」——你不记得书名，只拿一张封面，它按**视觉相似度**把相关书找出来。RAG、推荐、人脸识别都靠这个能力。

核心设计：**存算分离**（存储和查询可独立扩容）、**多索引混合**（IVF、HNSW、DiskANN 按场景选）、**标量+向量混合过滤**。

## 为什么重要

不懂 Milvus 这类系统，下面这些事说不清：

- 为什么 RAG 不能把 embedding 全塞 PostgreSQL——维度高、ANN 检索不是 B-Tree 擅长的
- 为什么 [[clip]] / [[siglip-2023]] 产出的向量需要专门的存储层
- 为什么「先向量检索再业务过滤」和「过滤下推」性能差一个数量级
- 为什么 2021 年后向量数据库从「库」变成独立品类

## 核心要点

1. **Purpose-built**：不为通用 CRUD 优化，只为 **近似最近邻（ANN）** 优化。类比：赛车不为拉货设计。

2. **存算分离**：数据节点管持久化，查询节点管检索，各自水平扩展。云原生部署的基础。

3. **多索引引擎**：HNSW 低延迟、IVF 省内存、DiskANN 扛十亿级——按数据规模和 SLA 切换，而不是一种索引打天下。

## 实践案例

### 案例 1：RAG 文档入库与检索

```python
from pymilvus import connections, Collection

connections.connect("default", host="localhost", port="19530")
coll = Collection("docs")
# 插入：文本 → embedding 模型 → 768 维向量
coll.insert([{"id": 1, "embedding": vec, "source": "manual.pdf"}])
coll.flush()
coll.load()
# 检索：问题向量 → Top-5 相似段落
hits = coll.search([query_vec], "embedding", param={"metric_type": "IP", "params": {"nprobe": 16}}, limit=5)
```

### 案例 2：混合标量+向量过滤

```python
# 只要 category=shoes 且与 query 最像的 10 条
expr = 'category == "shoes"'
hits = coll.search(
    [query_vec], "embedding",
    expr=expr,  # 标量过滤下推到索引层
    limit=10
)
```

**解释**：过滤下推避免「取出百万向量再在应用层筛」的内存灾难。

### 案例 3：索引选型决策

```text
数据量 < 100万、要低延迟  → HNSW
数据量 百万~千万、要省内存 → IVF_FLAT / IVF_PQ
数据量 > 10亿、磁盘友好    → DiskANN
```

Milvus 允许同一 collection 试验不同索引，按 benchmark 切换。

生产环境建议为 embedding 模型单独建 collection：换 [[siglip-2023]] 到 CLIP 时维度与 metric 可能不同，混 collection 会导致检索语义错乱。迁移时双写一段时间再切读流量。

监控三项：P99 检索延迟、召回率@K（用抽样标注集）、compaction 队列深度。向量库慢往往是索引未 load 或 segment 过多未合并，而非单纯 QPS 不够。

RAG 场景典型参数：`nprobe=16`（IVF）、`ef=64`（HNSW）只是起点；应用要以自己的 query 分布做网格搜索，Milvus 支持 A/B 索引而不改业务代码。

## 踩过的坑

1. **不 rebuild 就改 HNSW 参数**：`efConstruction` 改了但旧图结构不变，召回率诡异下降。

2. **metric 类型搞错**：COSINE vs IP vs L2 要和训练 embedding 时一致，否则相似度语义反了。

3. **忘记 load collection**：插入后没 `load()`，查询报空或极慢。

4. **把 Milvus 当主事务库**：它没有复杂事务；元数据仍应放 PostgreSQL 等 OLTP。

## 适用 vs 不适用场景

**适用**：
- RAG、语义搜索、推荐召回、以图搜图
- 十亿级向量 + 毫秒级 ANN
- 需要标量属性与向量联合过滤

**不适用**：
- 强事务、复杂 JOIN 的 OLTP
- 精确匹配查询（用 Elasticsearch / SQL）
- 极小数据量（<1 万条）——内存 dict 就够


## 进阶话题（可跳过）

这一节把前文和工业落地再绑紧一点，方便你读完就能动手选型或读论文。

1. **混合查询计划**：标量过滤选择性高时先过滤再 ANN；选择性低时先 ANN 再过滤——Milvus 优化器会下推，但应用侧应用 `expr` 表达清楚意图。
2. **多租户**：按业务线分 collection，避免单库十亿向量难运维。
3. **备份与恢复**：segment 级快照 + 对象存储；embedding 重建成本高，备份策略要提前定。
4. **与 LLM 栈集成**：chunk→embed→insert 管道要和 [[siglip-2023]]/CLIP 版本锁定。
## 历史小故事（可跳过）

- **2019**：Zilliz 开源 Milvus，填补向量检索系统空白。
- **2021**：SIGMOD 论文发表，提出 purpose-built 向量 DB 设计范式。
- **2023+**：RAG 爆发，Milvus 与 Pinecone、Weaviate 成三足鼎立。
- **今天**：云原生 2.x 架构，存算分离成行业标准。

## 学到什么

1. **向量检索是独立问题域**，不值得硬塞进通用 RDBMS
2. **索引选择比调参更重要**——数据结构决定上限
3. **过滤下推是混合查询的性能关键**
4. **embedding 模型和向量库要配对设计**（见 [[siglip-2023]]）

## 延伸阅读

- 论文 PDF：[SIGMOD21 Milvus](https://www.cs.purdue.edu/homes/csjgwang/pubs/SIGMOD21_Milvus.pdf)
- 官方文档：[milvus.io](https://milvus.io/docs)
- [[haystack-2010]] —— 另一类「专用存储」：小文件海量存
- [[clip]] —— 产生向量的经典视觉-语言模型
- [[siglip-2023]] —— 2024 MLLM 常用的视觉 encoder

## 关联

- [[haystack]] —— Facebook 小文件专用存储，同属 purpose-built 思路
- [[clip]] —— RAG 视觉侧常配的 embedding 来源
- [[siglip-2023]] —— 更高效的 CLIP 变体，向量维度和 metric 要匹配
- [[milvus]] —— 对应开源项目文档（projects 侧）


- 入门路径：先读「是什么」+「核心要点」，跑通一个最小案例后再翻「进阶话题」。
- 复习抓手：把「为什么重要」四条用自己的话复述一遍，能讲给同事即算掌握。
- 与仓库其他笔记：用文内 [[wikilink]] 跳到已写条目，别孤立读单篇。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[haystack-2010]] —— Haystack — Facebook 十亿张照片怎么存
- [[siglip-2023]] —— SigLIP — 用 Sigmoid 损失训练图文对齐

