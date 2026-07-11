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
- **日志聚合**（ELK 那套——现在常叫 OpenSearch Stack）
- **指标 / 可观测性**（应用监控、APM）
- **向量检索**（k-NN 插件，给 RAG 当向量库）

## 为什么重要

OpenSearch 这个名字背后是 2021 年开源界一次**许可证地震**，理解它能解释：

- 为什么"开源"和"自由软件"不是一回事——SSPL / Elastic License 不是 OSI 认证开源
- 为什么云厂商（AWS / Aliyun）和原厂（Elastic / MongoDB / Redis）会撕破脸
- 为什么 2024 年 Elastic 又把 Elasticsearch 加回 AGPL——"打不过就回归"的叙事从何而来
- 为什么 Linux 基金会 2024 年成立 OpenSearch 软件基金会——AWS 把控制权交出去
- 为什么写日志架构 / 选向量库时，OpenSearch 突然成了一个"安全选项"

## 核心要点

OpenSearch 和 Elasticsearch 关系可以拆三层：

1. **代码层**：从 ES 7.10.2 分叉，初期高度兼容；之后两边各自迭代，API 慢慢分化（2.x 起索引/聚合大体可互换，但插件、安全模块、ML 功能差异变大）。

2. **许可证层**：OpenSearch 全部 Apache 2.0；Elasticsearch 在 7.11–8.x 用 SSPL/Elastic License，2024 年 8.x 加回 AGPLv3。

3. **治理层**：OpenSearch 起初由 AWS 单独主导，2024 年 9 月迁入 Linux 基金会下的 OpenSearch Software Foundation，治理上变成中立基金会项目。

## 实践案例

### 案例 1：直接当 Elasticsearch 用

```bash
docker run -p 9200:9200 -e "discovery.type=single-node" \
  -e "OPENSEARCH_INITIAL_ADMIN_PASSWORD=Strong#Pass1" \
  opensearchproject/opensearch:2.13.0

curl -k -u admin:Strong#Pass1 https://localhost:9200/_cat/indices
```

**逐部分解释**：

1. `single-node` 跳过集群发现，本机试玩够用
2. 2.12 起必须设初始管理员密码，否则容器起不来
3. `-k` 跳过自签证书校验；查询 DSL 与 ES 7.x 几乎一比一

### 案例 2：当向量库给 RAG 用

```python
from opensearchpy import OpenSearch

client = OpenSearch(
    [{"host": "localhost", "port": 9200}],
    http_auth=("admin", "Strong#Pass1"),
    use_ssl=True,
    verify_certs=False,
)

client.indices.create(index="docs", body={
    "settings": {"index.knn": True},
    "mappings": {"properties": {
        "embedding": {"type": "knn_vector", "dimension": 768}
    }},
})

client.search(index="docs", body={
    "size": 5,
    "query": {"knn": {"embedding": {"vector": [0.1] * 768, "k": 5}}},
})
```

**逐部分解释**：

1. `index.knn: true` 打开 k-NN 插件能力
2. `knn_vector` 存 768 维向量；`dimension` 必须和 embedding 模型一致
3. `query.knn` 做 ANN（近似最近邻）；全文 + 向量可同库，少叠一个专用向量库

### 案例 3：当日志栈用（替代 ELK）

可跟做的最小替换路径：

1. 用 OpenSearch 替 Elasticsearch 存日志索引（案例 1 的单节点即可试）
2. 起 OpenSearch Dashboards 连同一集群，看 Discover / Dashboard
3. 采集端用 Fluent Bit 或 Data Prepper（替 Logstash）把日志推进去

和 ELK 的关键差别：许可证更宽松；细粒度权限、审计等企业安全能力默认可用，不必买 Elastic Platinum。

## 踩过的坑

1. **客户端别用错版本**：Elastic 官方 client 8.x 会检查服务端版本，连 OpenSearch 常被拒。用 `opensearchpy` / `opensearch-java`，或旧的 `elasticsearch-py` 7.x。
2. **API 兼容有边界**：OpenSearch 2.x 的 ML、Security、ISM 与 ES 8.x 不互通。"7.10.2 兼容"主要指核心索引/查询/聚合。
3. **认证默认开**：2.12 起强制密码；忘设 `OPENSEARCH_INITIAL_ADMIN_PASSWORD` 会启动失败。
4. **配置 key 别照抄 ES**：不少项从 `elasticsearch.*` 改成 `opensearch.*`；`xpack.*` 行会被忽略。
5. **别和 macOS/Firefox 的 OpenSearch 描述协议混**：那是 2005 年搜索引擎元数据格式（`opensearch.xml`），同名不同物。
6. **k-NN 引擎要压测**：插件支持 nmslib / faiss / Lucene，性能和内存差很多。

## 适用 vs 不适用场景

**适用**：

- 已经在 AWS 上 → Amazon OpenSearch Service 托管省事
- 需要 Apache 2.0 严格开源（合规、二次分发、SaaS 转售）
- 日志 + 全文 + 向量三合一，想少装一个组件
- 现有 ES 7.x 想升级又不想被 SSPL 锁定

**不适用**：

- 已深度绑定 Elastic APM / Fleet / Beats 高级特性 → 迁移代价大
- 纯向量且 QPS 极高 → Milvus / Qdrant 通常更快
- 小数据量纯关键词 → SQLite FTS5 / Postgres `tsvector` 更轻
- 需要最新 ES 8.x ML / ES|QL 等 Elastic 独家特性

## 历史小故事（可跳过）

- **2010 年**：Shay Banon 发布 Elasticsearch，Apache 2.0
- **2015 年**：AWS 推出 Amazon Elasticsearch Service，托管 ES
- **2021 年 1 月**：Elastic 宣布 7.11 起改 SSPL/Elastic License
- **2021 年 4 月**：AWS 等从 7.10.2 分叉为 OpenSearch；同年 7 月 1.0 GA
- **2022 年 4 月**：OpenSearch 2.0，正式和 ES 分道
- **2024 年 8 月**：Elastic 把 8.x 加回 AGPLv3；9 月 OpenSearch 进入 Linux 基金会

四年时间，开源 → 许可证收紧 → 分叉 → 双方都"再开源"。后续 Redis→Valkey、Terraform→OpenTofu 几乎同构重演。

## 学到什么

1. **"开源"是法律概念不是感觉**：SSPL 不被 OSI 认证；Apache 2.0 / AGPL 是
2. **云厂商 vs 原厂的结构性矛盾**：谁拿托管利润，往往决定许可证战争
3. **分叉不是一定打回去**：Elastic 回归 AGPL，部分原因是 OpenSearch 抢走了开源叙事
4. **基金会托管 = 中立信号**：单家公司项目转入基金会，通常意味着治理更稳
5. **选型时把许可证当一等指标**：功能可追上，许可证锁喉是结构性风险

## 延伸阅读

- AWS 原始公告：[Forking Elasticsearch](https://www.opensearch.org/blog/keynote/2021/04/forking-elasticsearch-and-kibana/)
- Elastic 反观点：[License change clarification](https://www.elastic.co/blog/license-change-clarification)
- 2024 回归：[Elasticsearch is Open Source, Again](https://www.elastic.co/blog/elasticsearch-is-open-source-again)
- 官方文档：[opensearch.org/docs](https://opensearch.org/docs/)
- Linux 基金会接管：[OpenSearch Software Foundation](https://www.linuxfoundation.org/press/aws-transfers-opensearch-to-the-linux-foundation)
- [[elasticsearch]] —— 分叉源头
- [[lucene]] —— 底层倒排索引引擎

## 关联

- [[lucene]] —— OpenSearch 底层倒排索引引擎，ES 也用它
- [[elasticsearch]] —— OpenSearch 的源头，2021 年改许可证后双方分家
- [[faiss]] —— OpenSearch k-NN 插件可选后端之一
- [[hnsw]] —— OpenSearch 向量检索常用算法
- [[apache-2]] —— OpenSearch 许可证；理解为什么"宽松开源"对云厂商重要

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
