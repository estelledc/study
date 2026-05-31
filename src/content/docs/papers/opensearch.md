---
title: OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉
来源: AWS 公告 2021-04-12 "Stepping up for a truly open source Elasticsearch"
日期: 2026-06-01
分类: 基础设施
难度: 入门
---

## 是什么

OpenSearch 是一个**开源搜索 + 日志 + 向量分析引擎**，由 AWS 在 2021 年从 Elasticsearch 7.10.2 分叉而来，配套的可视化前端叫 OpenSearch Dashboards（从 Kibana 7.10.2 分叉）。整个项目用 Apache 2.0 许可证。

日常类比：原本你用一家叫 Elastic 的公司开的"图书馆检索系统"，免费可商用。某天他们把规则改成"自己用可以、做成云服务卖给别人不行"。AWS 说"那我把上次还能自由用的版本拷一份，自己继续维护"。这份拷贝就叫 OpenSearch。

它能做的事和 Elasticsearch 几乎重叠：

- **全文检索**（网站搜索框、商品搜索）
- **日志聚合**（ELK 那套——现在叫 OpenSearch Stack）
- **指标 / 可观测性**（应用监控、APM）
- **向量检索**（k-NN 插件，给 RAG 当向量库）

## 为什么重要

OpenSearch 这个名字背后是 2021 年开源界一次**许可证地震**，理解它能解释：

- 为什么"开源"和"自由软件"不是一回事——SSPL / Elastic License 不是 OSI 认证开源
- 为什么云厂商（AWS / Aliyun）和原厂（Elastic / MongoDB / Redis）会撕破脸
- 为什么 2024 年 Elastic 又把 Elasticsearch 加回 AGPL——"打不过就回归"
- 为什么 Linux 基金会 2024 年成立 OpenSearch 软件基金会——AWS 把控制权交出去
- 为什么写日志架构 / 选向量库时，OpenSearch 突然成了一个"安全选项"

## 核心要点

OpenSearch 和 Elasticsearch 关系可以拆三层：

1. **代码层**：从 ES 7.10.2 分叉，初期高度兼容；之后两边各自迭代，API 慢慢分化（2.x 起索引/聚合大体可互换，但插件、安全模块、ML 功能差异变大）。

2. **许可证层**：OpenSearch 全部 Apache 2.0；Elasticsearch 在 7.11–8.x 用 SSPL/Elastic License，2024 年 8.x 加回 AGPLv3。

3. **治理层**：OpenSearch 起初由 AWS 单独主导，2024 年 9 月迁入 Linux 基金会下的 OpenSearch Software Foundation，治理上"洗白"成中立项目。

## 实践案例

### 案例 1：直接当 Elasticsearch 用

```bash
docker run -p 9200:9200 -e "discovery.type=single-node" \
  -e "OPENSEARCH_INITIAL_ADMIN_PASSWORD=Strong#Pass1" \
  opensearchproject/opensearch:2.13.0

curl -k -u admin:Strong#Pass1 https://localhost:9200/_cat/indices
```

API 路径、查询 DSL（`{ "query": { "match": { ... } } }`）和 ES 7.x 几乎一比一。已有 ES 客户端代码改个 endpoint 多半能跑。

### 案例 2：当向量库给 RAG 用

```python
from opensearchpy import OpenSearch

client = OpenSearch([{"host": "localhost", "port": 9200}], http_auth=("admin", "Strong#Pass1"), use_ssl=True, verify_certs=False)

client.indices.create(index="docs", body={
    "settings": {"index.knn": True},
    "mappings": {"properties": {
        "embedding": {"type": "knn_vector", "dimension": 768}
    }}
})
```

`knn_vector` 字段让你存 768 维向量并做 ANN（近似最近邻）检索。这是 OpenSearch 在 RAG 场景被选用的主要原因——Apache 2.0、全文检索 + 向量检索一锅端，不用再叠 Pinecone / Weaviate。

### 案例 3：当日志栈用（替代 ELK）

OpenSearch + OpenSearch Dashboards + Data Prepper（替代 Logstash）/ Fluent Bit 形成一套"OS 栈"。和 ELK 的差别：许可证更宽松，企业安全功能（细粒度权限、审计）默认免费，不用买 Platinum。

## 踩过的坑

1. **客户端别用错版本**：Elastic 官方 client 8.x 起会检查服务端版本号，连 OpenSearch 会被拒绝。要么用 `opensearchpy`/`opensearch-java`，要么用 `elasticsearch-py` 7.x（不带版本检查的版本）。

2. **API 兼容是有边界的**：OpenSearch 2.x 改了 ML、Security、Index State Management 插件，跟 ES 8.x 不互通。"7.10.2 兼容"指核心索引/查询/聚合，不是全部。

3. **认证默认开**：OpenSearch 2.12 起默认强制密码，初次启动忘设 `OPENSEARCH_INITIAL_ADMIN_PASSWORD` 会启动失败，第一次踩很懵。早期版本（1.x / 2.x 早期）可以裸跑，写脚本时不要假设老姿势还能用。

4. **集群名 / 节点名别照抄 ES**：OpenSearch 把不少配置 key 从 `elasticsearch.*` 改成 `opensearch.*`。`elasticsearch.yml` 里的 `cluster.name: my-app` 拷过来仍然能跑，但 `xpack.*` 相关行会被忽略。配置文件改名清干净比较省事。

5. **写"OpenSearch" 别和 macOS/Firefox 的 OpenSearch 描述协议混**：那是 2005 年 A9.com 提出的搜索引擎元数据格式（`opensearch.xml`），同名不同物。

6. **k-NN 不是 HNSW 唯一选择**：OpenSearch 的 k-NN 插件支持 nmslib / faiss / Lucene 三种引擎，性能和内存差很多，迁移生产要压测。

## 适用 vs 不适用场景

**适用**：

- 已经在 AWS 上 → 直接用 Amazon OpenSearch Service，托管省事
- 需要 Apache 2.0 严格开源（合规、二次分发、SaaS 转售）→ ES 不能用，OpenSearch 是直系替代
- 日志 + 全文 + 向量三合一，想少装一个组件
- 现有 ES 7.x 集群想升级但又不想被 SSPL 锁定

**不适用**：

- 已在 Elastic 生态深度绑定（用了 Elastic APM、Fleet、Beats 高级特性）→ 迁移代价大
- 纯向量场景且 QPS 极高 → 专门向量库（Milvus / Qdrant）通常更快
- 小数据量纯关键词搜索 → SQLite FTS5 / Postgres `tsvector` 更轻
- 需要最新 ES 8.x ML / ES|QL 这种 Elastic 独家特性

## 历史小故事（可跳过）

- **2010 年**：Shay Banon 发布 Elasticsearch，Apache 2.0
- **2015 年**：AWS 推出 Amazon Elasticsearch Service，托管 ES，Elastic 公司没拿到分成
- **2019 年**：Elastic 把一些高级模块（Security、ML）放进自家 X-Pack，许可证收紧
- **2021 年 1 月**：Elastic 宣布 Elasticsearch 7.11 起改 SSPL/Elastic License 双许可，理由"防止云厂商白嫖"
- **2021 年 4 月**：AWS 联合 Logz.io 等宣布从 7.10.2 分叉为 OpenSearch
- **2021 年 7 月**：OpenSearch 1.0 GA
- **2022 年 4 月**：OpenSearch 2.0 发布，正式和 ES 分道
- **2024 年 8 月**：Elastic 把 Elasticsearch 8.x 加回 AGPLv3（仍非 Apache 2.0），Shay Banon 写文 "Elasticsearch is Open Source, Again"
- **2024 年 9 月**：AWS 把 OpenSearch 捐给 Linux 基金会，成立 OpenSearch Software Foundation
- **2025 年起**：双方进入"并行宇宙"——同一份代码祖先，两套版本号、两套文档、两套客户端

四年时间，开源 → 闭源 → 分叉 → 双方都"再开源"，给后来者上了一课："基础设施类项目改许可证，几乎一定会被分叉"。后续案例（Redis 2024 改 SSPL → Valkey 分叉、Terraform 改 BSL → OpenTofu 分叉）几乎一比一重演。

## 学到什么

1. **"开源"是法律概念不是感觉**：SSPL 不被 OSI 认证为开源，Apache 2.0 / AGPL 是。许可证选择决定能不能商用、能不能转售
2. **云厂商 vs 原厂的结构性矛盾**：原厂做产品，云厂商做托管，谁拿主要利润决定了许可证战争
3. **分叉不是一定打回去**：Elastic 三年后回归 AGPL，部分原因就是 OpenSearch 抢回了开源叙事
4. **基金会托管 = 中立信号**：项目从单家公司转入基金会通常意味着治理稳定，CNCF / Apache / Linux Foundation 是常见目的地
5. **选型时把许可证当一等指标**：性能 / 功能可以追上，许可证锁喉是结构性风险，往往一夜之间打破整套架构假设

## 延伸阅读

- AWS 原始公告：[Stepping up for a truly open source Elasticsearch](https://www.opensearch.org/blog/keynote/2021/04/forking-elasticsearch-and-kibana/)
- Elastic 反观点：[Elastic License 2.0 announcement](https://www.elastic.co/blog/license-change-clarification)
- 2024 回归：[Elasticsearch is Open Source, Again](https://www.elastic.co/blog/elasticsearch-is-open-source-again)
- 官方文档：[opensearch.org/docs](https://opensearch.org/docs/)
- Linux 基金会接管：[OpenSearch Software Foundation 公告](https://www.linuxfoundation.org/press/aws-transfers-opensearch-to-the-linux-foundation)
- [[starrocks]] —— 同样是分叉路线（从 Doris 分出）的 OLAP 引擎
- [[doris]] —— Apache Doris，被 StarRocks 分叉前的源头

## 关联

- [[lucene]] —— OpenSearch 底层倒排索引引擎，ES 也用它
- [[elasticsearch]] —— OpenSearch 的源头，2021 年改许可证后双方分家
- [[faiss]] —— OpenSearch k-NN 插件可选后端之一
- [[hnsw]] —— OpenSearch 向量检索默认算法
- [[apache-2]] —— OpenSearch 许可证；理解为什么"宽松开源"对云厂商重要

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
