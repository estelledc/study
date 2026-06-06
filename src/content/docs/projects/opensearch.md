---
title: OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉
来源: https://github.com/opensearch-project/OpenSearch
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

OpenSearch 是一个**从 [[elasticsearch]] 7.10 拷贝出来另起一棵的搜索引擎**，由 AWS 在 2021-04 牵头开源，许可证是 Apache 2.0。

日常类比：

- 一家咖啡馆原本无偿放出自家配方，五年后突然加了一条「云厂商不许用我家配方做生意」
- 几位顾客拿走旧配方本（合法的最后一版），自己另开一家叫 OpenSearch，配方继续无偿放
- 两家从此分流：一家叫 [[elasticsearch]]，一家叫 OpenSearch

代码同源、API 同源，但 1.0 之后两边各自演化，4 年后已经不能互连。

## 为什么重要

- **2021 年开源许可证转折点的产物**：Elastic 把 ES 从 Apache 2.0 改成 SSPL，事实排除云厂商免费托管，AWS 当月宣布 fork。这是过去十年开源许可争议中最大的一起，影响了之后 [[mongodb]] / Redis / Confluent 的策略
- **AWS 现网默认搜索引擎**：Amazon Elasticsearch Service 在 2021-09 直接改名 Amazon OpenSearch Service，AWS 现役大客户的搜索流量基本都跑在它上面
- **比 ES 早把高级功能默认开**：alerting、anomaly detection、SQL、账号体系（security plugin）这些在 ES 里要付费的功能，OpenSearch 第一天就在主仓库
- **2024 年治理转折**：Linux Foundation 接手成立 OpenSearch Software Foundation，AWS 失去单一控股，社区成 SAP / Oracle / Aiven 等多方共治

不理解 OpenSearch 的来历，就读不懂 2021 之后整个搜索 / 文档数据库圈的许可博弈。

## 核心要点

OpenSearch 和 [[elasticsearch]] 的内核基本同构（倒排索引、分片副本、Query DSL），下面只列**它独有或不一样的地方**。

### 与 ES 的兼容边界

- **代码起点**：ES 7.10.2 + Kibana 7.10.2 这个具体快照
- **能互通**：用 ES 7.10 的客户端连 OpenSearch 任意版本，开箱即用
- **不能互通**：ES 8.x 客户端会做版本号握手，发现不是 ES 就主动断开。要连 OpenSearch 得用 OpenSearch 自家 SDK 或社区 compatibility patch
- **API 路径几乎相同**，但 `_xpack/*` 下的 ES 商业功能在 OpenSearch 里走 `_plugins/*` 重新组织

### 三个默认就有的「ES 付费才有」功能

1. **Security（账号体系）**：账号 + 角色 + TLS + 审计日志全部默认在主仓库，开箱用
2. **Alerting（告警）**：用 DSL 写「当 5 分钟内 5xx 超过 100 次就发钉钉」之类规则，ES 商业版才有
3. **Anomaly Detection（异常检测）**：内建机器学习算法（RCF — Random Cut Forest）做时序异常打分

### k-NN 向量搜索（早 ES 上线）

OpenSearch 1.0 就把 nmslib / faiss / Lucene 三种向量索引整进了主仓库，2022 年起被一线公司大量用作「便宜版 [[pinecone]]」。ES 直到 8.0 才内置同等能力。

### 治理结构

2024-09 之前：AWS 占 PMC 多数席位，对争议提案有事实否决权
2024-09 之后：Linux Foundation 旗下 OpenSearch Software Foundation 接管，AWS / SAP / Aiven / Uber / Logz.io / Oracle 等多家会员投票，AWS 不再单一控股

## 实践案例

### 案例一：本地启一个单节点

```bash
docker run -p 9200:9200 -p 9600:9600 \
  -e "discovery.type=single-node" \
  -e "OPENSEARCH_INITIAL_ADMIN_PASSWORD=Strong#Pass123" \
  opensearchproject/opensearch:2.18.0
```

注意几点：

- 9200 是 REST API，9600 是性能分析（performance analyzer）端口
- 2.12 之后**强制要求**首次启动设置 admin 密码，否则容器拒绝启动（这是和 ES 不一样的安全默认）
- 想要类 ES 的「无认证裸跑」体验，加 `DISABLE_SECURITY_PLUGIN=true`，但仅限本地玩具

### 案例二：从 ES 客户端无缝切换

```python
# 原本连 ES 7.10
from elasticsearch import Elasticsearch
es = Elasticsearch("http://localhost:9200")
es.search(index="products", body={"query": {"match_all": {}}})
```

把客户端换成 `opensearch-py`，**业务代码不用动**：

```python
from opensearchpy import OpenSearch
client = OpenSearch("http://localhost:9200", http_auth=("admin", "Strong#Pass123"))
client.search(index="products", body={"query": {"match_all": {}}})
```

API 形状一致——这就是 fork 同源的福利。

### 案例三：用 k-NN 做向量搜索

```http
PUT /docs
{
  "settings": { "index.knn": true },
  "mappings": {
    "properties": {
      "embedding": { "type": "knn_vector", "dimension": 384 }
    }
  }
}
```

写入时把 384 维向量塞进 `embedding`，查询时用 `knn` 子句，OpenSearch 走 HNSW 索引找最近 k 条。比起把 [[pinecone]] / [[milvus]] 单独部署，少一套基础设施。

## 踩过的坑

### 客户端选错版本互相不识别

ES 8.x SDK 直连 OpenSearch 会报 `The client noticed that the server is not Elasticsearch and we do not support this unknown product`。**对策**：用 opensearch-py / opensearch-java，或用 ES 7.17 这一最后兼容版本。

### Security plugin 默认开但证书是自签名

新人启动后用浏览器访问 9200，看到证书警告就以为坏了。其实是默认带的 demo 自签证书。生产必须换成自家 CA 签的，**否则吊销策略走不通**。

### 索引模板从 ES 复制过来「老 API 路径」失效

ES 6 的 `_template` 在 ES 7 已 deprecated，OpenSearch 沿用新 API `_index_template`。从老 ES 集群迁过来的脚本经常踩这个雷。

### 升级跨版本兼容矩阵复杂

OpenSearch 1.x → 2.x 不能滚动升级，必须 reindex。社区文档「rolling upgrade」一节看着像可以，实际有几个 breaking change（比如 `type` 彻底删除）会卡住。**对策**：跨大版本上线前一定在影子集群跑过一遍 _reindex。

## 适用 vs 不适用场景

**适用**：

- 必须开源 / 必须 Apache 2.0 / 不接受 SSPL 风险（金融、政务、合规要求高的甲方）
- 已经在 AWS 上跑，托管服务最便宜的选择
- 需要内置 alerting / anomaly detection 不想再装 X-Pack
- k-NN 向量搜索是主要负载

**不适用**：

- 已重度绑定 ES 8.x 的新特性（ESQL、reciprocal rank fusion、最新 ML 模型）
- 需要 [[elasticsearch]] 商业版才有的「跨集群 search 同步」企业级功能（OpenSearch 也在做但不成熟）
- 团队已经熟悉 Kibana，迁 OpenSearch Dashboards 切换成本未必小

## 历史小故事

- 2021-01：Elastic 宣布把 ES + Kibana 从 Apache 2.0 改成 SSPL + Elastic License v2
- 2021-04：AWS 宣布 fork 7.10.2，命名 OpenSearch + OpenSearch Dashboards
- 2021-07：OpenSearch 1.0 GA，从此与 ES 协议层逐步分化
- 2021-09：Amazon Elasticsearch Service 改名 Amazon OpenSearch Service
- 2022：k-NN、SQL、anomaly detection 一起进 1.x 主仓库
- 2024-09：Linux Foundation 接手成立 OpenSearch Software Foundation，AWS 不再单一控股
- 2024-11：Elastic 又把 ES 重新加回 AGPL 三选一，但 OpenSearch 生态已成独立棋

## 学到什么

1. **开源许可证可以决定一个项目的命运**：SSPL 给 ES 带来短期收入，也直接催生了一个体量相近的对手
2. **同源 fork 头三年最难**：API 看着一样，但每加一个新特性、改一个默认值，两边就再分一寸
3. **fork 的成功依赖治理而不是代码**：OpenSearch 真正稳下来不是 1.0 GA，是 2024 转给 Linux Foundation 那一刻
4. **「默认就有」是产品力**：把 ES 收费的安全 / 告警 / SQL 默认开启，是 OpenSearch 在中型公司里赢 ES 的最大原因

## 关联

- [[elasticsearch]] —— 同源祖先；2021 改许可证后才有 OpenSearch 这棵树
- [[lucene]] —— 共同的底层倒排索引引擎，两边都在用
- [[mongodb]] —— 最早用 SSPL 的项目，没遇到 fork；OpenSearch 是反例
- [[grafana]] —— 监控可视化常对接 OpenSearch；Grafana Labs 自己也是 AGPL 路线
- [[prometheus]] —— 时序监控生态里和 OpenSearch 互补：Prometheus 存指标，OpenSearch 存日志
