---
title: Feast — 让训练和上线用同一份特征定义的开源 Feature Store
来源: Feast Documentation, https://docs.feast.dev/
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Feast（**Fea**ture **St**ore）是一套**让一份特征定义同时服务模型训练和模型在线推理**的开源系统，归属 Linux Foundation AI & Data。

日常类比：像一家连锁咖啡店的**中央配方手册**——总部仓库（离线）按配方批量备货供学徒练习，门店冰柜（在线）按同一份配方每天进新鲜原料供顾客点单。配方只写一次，两端拿到的味道一致。Feast 就是这本配方手册加两套仓库的中间层。

写起来是这样：

```python
from feast import Entity, FeatureView, Field, FileSource
from feast.types import Float32, Int64

driver = Entity(name="driver_id", join_keys=["driver_id"])
stats_source = FileSource(path="s3://bucket/driver_stats.parquet",
                          timestamp_field="event_timestamp")
driver_stats = FeatureView(
    name="driver_hourly_stats", entities=[driver],
    schema=[Field(name="trips_today", dtype=Int64),
            Field(name="avg_rating", dtype=Float32)],
    source=stats_source, ttl=timedelta(days=1),
)
```

一份 `FeatureView` 同时被训练管线（拼历史样本）和在线服务（取最新值）使用。

## 为什么重要

不理解 Feast，下面这些事就解释不通：

- 为什么 ML 团队故障复盘里反复出现『**训练-上线特征偏移**』（training-serving skew）——离线 SQL 算的均值和线上 Redis 取的字段不是同一个口径
- 为什么 2019 之后『Feature Store』变成 MLOps 平台的标配组件，与模型仓库、实验跟踪并列为三件套
- 为什么 Tecton、SageMaker Feature Store、Databricks Feature Store 都把 Feast 当对照基线——它定义了**轻量、纯 Python、声明式**这条路线
- 为什么 ADR 讨论 feature platform 时总要先表态『要不要 Feast 兼容』

## 核心要点

Feast 的世界由五件东西咬合：

1. **Entity**：业务主键（driver_id、user_id），是特征挂靠的对象。
2. **FeatureView**：一组特征 + 数据源 + TTL，是声明式的核心单元。**同一个 FeatureView 既能拼训练样本，也能取在线值**。
3. **Offline Store**：训练侧后端（BigQuery / Snowflake / Redshift / Parquet），按 SQL 拉历史。
4. **Online Store**：服务侧后端（Redis / DynamoDB / Bigtable / Postgres），按 key 毫秒级查最新值。
5. **Registry**：元数据中心（存于 S3/GCS 或 SQL），记录所有 Entity / FeatureView 定义，训练和服务都从这里读同一份。

**两条核心 API**：

- `get_historical_features(entity_df, features=...)`：训练时调用。entity_df 是带时间戳的样本表，Feast 拼出**该时刻可见**的特征——这叫 point-in-time correctness（时间点正确性），保证不把未来信息泄露到训练。
- `get_online_features(entity_rows, features=...)`：在线推理调用，从 Online Store 取最新值，毫秒级返回。

**Materialization**（物化）：定时任务把 Offline Store 的最新窗口同步进 Online Store，保证两端口径一致。

## 实践案例

### 案例 1：训练时拼特征

```python
entity_df = pd.DataFrame({
    "driver_id": [1001, 1002, 1003],
    "event_timestamp": pd.to_datetime(["2026-05-30 10:00", ...]),
})
training_df = store.get_historical_features(
    entity_df=entity_df,
    features=["driver_hourly_stats:trips_today",
              "driver_hourly_stats:avg_rating"],
).to_df()
```

Feast 翻译成 SQL，对每条样本按 `event_timestamp` 拉**当时**有效的特征值，结果作为训练集。

### 案例 2：上线时取特征

```python
features = store.get_online_features(
    features=["driver_hourly_stats:trips_today"],
    entity_rows=[{"driver_id": 1001}],
).to_dict()
```

走 Redis，10ms 量级返回。线上模型用这份输入做预测。**因为 FeatureView 定义和训练时同一份**，口径必然一致。

### 案例 3：物化任务

```bash
feast materialize-incremental 2026-05-31T00:00:00
```

Scheduler（Airflow 等）每天调一次，把 Parquet/BigQuery 的增量数据写进 Redis。这条命令是连接两侧的桥。

## 踩过的坑

1. **以为 Feast 会替你算特征**：Feast 不是计算引擎，**只管定义和搬运**。原始 Parquet 必须由你的上游管线（Spark/SQL/dbt）算好。新人常以为写完 FeatureView 就能自动聚合，结果发现 source 是空的。

2. **Online/Offline schema 不同步**：手动改了 Online Store 表结构、忘了更新 FeatureView 定义，导致 `get_online_features` 报字段缺失。规则：**只通过 `feast apply` 改结构**，registry 是唯一真相。

3. **TTL 设短了在线丢值**：FeatureView 的 TTL 控制 Online Store 多久过期。设 1 小时但物化只跑日更，到点直接读不到。debug 看到 None 值要先查 TTL vs materialize 频率。

4. **point-in-time join 慢**：训练样本上百万行时，Feast 的 SQL 模板对每条样本做 as-of join 会很慢。生产实践是先把 entity_df 按天分桶、Push 到 Offline Store 表里再 join，而不是直接传 DataFrame。

## 适用 vs 不适用场景

**适用**：

- 模型同时有离线训练和在线推理，特征口径必须一致
- 多个团队复用同一组特征（avoid duplicate pipelines）
- 需要 point-in-time correctness 的时序样本
- 已有数仓（BigQuery/Snowflake）+ KV 存储（Redis）的栈，想加一层中间件而不重建

**不适用**：

- 纯离线场景（只跑批、没有在线服务）→ 直接 Parquet/SQL 够用
- 端到端流式特征（毫秒级窗口聚合）→ Feast 不算流计算引擎，需配合 Flink/Bytewax
- 需要复杂特征加工 DAG（链式聚合、复杂 backfill）→ Tecton 商业版更对口
- 团队没有数仓 + KV 双栈 → 上 Feast 收益不抵复杂度

## 历史小故事（可跳过）

- **2018 年**：Gojek（印尼出行平台）和 Google Cloud 合作，为内部 ML 团队解决训练-上线偏移，原型叫 Feast。
- **2019 年 1 月**：Gojek + Google 在 Google Cloud Next 联合宣布开源。
- **2020 年 9 月**：捐给 Linux Foundation AI（后改名 LF AI & Data），治理中立化。
- **2021 年**：Tecton（前 Uber Michelangelo 团队创立的商业 Feature Store）开始主导 Feast 开源贡献，0.10 起架构大改——从 Kubernetes-first 改为纯 Python SDK + 可选服务端。
- **2023 年**：Feast 0.30 推出 Web UI、Python feature server，部署门槛进一步降低。
- **2024 年**：开始集成 vector embeddings 和向量检索，跟上 RAG 时代。

『Feature Store』这个品类名词的流行，跟 Uber 2017 的 Michelangelo 博文一起，定义了 MLOps 这一层基础设施的边界。

## 学到什么

1. **一份定义、两套存储、两条 API** 是 Feature Store 的基本范式。Feast 把这个范式做成了开源最小公约数。
2. **Point-in-time correctness** 不是细节是底线。训练里掺一点未来信息，模型上线必崩——Feast 把这个约束变成 first-class API 强制兑现。
3. **声明式 + Registry 中心化** 让多团队协作可能。没有 registry 就退回到每个团队自己拼 SQL，特征口径必然漂移。
4. **基础设施的好坏看『不让你做错什么』**。Feast 不让你绕过 registry 改 schema、不让你用未对齐的时间戳取训练数据——这些『不让』比新功能更值钱。

## 延伸阅读

- 官方文档（首选）：[Feast Documentation](https://docs.feast.dev/)
- 快速上手：[Feast Quickstart](https://docs.feast.dev/getting-started/quickstart)
- 概念背景：[Uber Michelangelo 博文](https://www.uber.com/blog/michelangelo-machine-learning-platform/)
- 对照阅读：[[tecton]] —— Feast 商业版同源；[[mlflow]] —— 模型仓库同层基础设施

## 关联

- [[airflow]] —— 常用调度器，触发 Feast materialize 增量物化
- [[mlflow]] —— 模型仓库层，与 Feature Store 分工的 MLOps 三件套之一
- [[redis]] —— 默认 Online Store 之一，毫秒级取值的承担者
- [[kedro]] —— 数据管线框架，可与 Feast 配合做特征计算 + 注册
- [[ray]] —— 分布式计算后端，可作为 Feast materialize 的执行器
