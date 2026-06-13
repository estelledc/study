---
title: Dagster — 把流水线想成数据资产图，不是任务序列
来源: Dagster Labs, https://docs.dagster.io/
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Dagster 是一套**数据流水线编排系统**。和 Airflow / Prefect 同类，但**心智模型完全不同**：它让你写"我要哪些数据资产"，不写"我要按顺序跑哪些任务"。

日常类比：传统编排像菜谱（"先洗菜、再切菜、再下锅"——按步骤），Dagster 像菜单（"我要一盘宫保鸡丁"——告诉系统结果，它自己倒推该做什么）。

你写：

```python
@dg.asset
def daily_sales() -> None:
    # 拉今日订单写到表里
    ...

@dg.asset(deps=[daily_sales])
def weekly_sales() -> None:
    # 基于 daily_sales 聚合到周
    ...
```

Dagster 自动得出："weekly_sales 依赖 daily_sales"，画一张资产图，按图调度。

## 为什么重要

数据团队三大老问题，资产模型一次性框住：

- **血缘看不见**：表 A 来自表 B 来自表 C——Airflow 不知道，Dagster 把 deps 写在代码里，UI 直接画图
- **重跑成本高**：哪个资产坏了？只重跑下游就行，Dagster 知道边界；Airflow 要人手算
- **测试难**：Airflow 任务跟调度耦合，本地难跑；Dagster 资产函数就是普通 Python，本地直接调 + 单测

现代数据栈（dbt + 仓库 + ML 流水线）需要一个**统一调度层**——dbt 模型、Python 训练脚本、SQL 表都能当资产挂在同一张图上。

## 核心要点

四个概念吃透就能上手：

1. **Software-Defined Asset（SDA，软件定义资产）**：一个资产 = 一段 Python 函数 + 一个唯一 key + 上游依赖。函数运行结果就是这个资产的"内容"。

2. **Materialization（物化）**：跑一次资产函数，结果写到存储里。Dagster 记录每次物化的元数据（code_version、时间、输入哈希），下次想重跑能溯源。

3. **IO Manager**：资产**存在哪里**（S3、Snowflake、本地文件）由 IO Manager 决定，业务函数不关心存储细节。换存储只换配置，不改业务代码。

4. **Asset Graph**：所有资产组成一张有向图。UI 里看一眼就知道："这张表坏了，下游 5 个报表都受影响"。

辅助概念：

- **Partitions**：按时间/地区切片同一个资产（每天的 daily_sales 是独立分区），支持回填
- **Asset Checks**：物化时跑数据质量校验（行数 / null 比例 / 唯一性）
- **Sensors / Schedules**：定时或事件触发资产刷新

## 实践案例

### 案例 1：从 task 思维切到 asset 思维

Airflow 写法（任务）：

```python
def extract(): ...
def transform(): ...
def load(): ...

dag = DAG(...)
extract_task >> transform_task >> load_task
```

你定义的是**步骤的顺序**。系统不知道每一步产生了什么。

Dagster 写法（资产）：

```python
@dg.asset
def raw_orders(): return fetch_orders()

@dg.asset
def cleaned_orders(raw_orders): return clean(raw_orders)

@dg.asset
def daily_revenue(cleaned_orders): return aggregate(cleaned_orders)
```

你定义的是**三张表**，依赖是函数参数自动推出来的。系统知道每张表的内容、版本、来源。

### 案例 2：Partitions 让回填变简单

每日订单表按 date 分区：

```python
@dg.asset(partitions_def=DailyPartitionsDefinition(start_date='2024-01-01'))
def daily_orders(context):
    date = context.partition_key
    return fetch_orders_for(date)
```

UI 里可以选 "2025-03-01 到 2025-03-15" 一键回填这 15 天。不用写循环、不用手算日期。

### 案例 3：dbt + Python ML 同图编排

dbt 模型可以批量导入成资产：

```python
@dbt_assets(manifest=Path('target/manifest.json'))
def my_dbt_assets(...): ...

@dg.asset(deps=[my_dbt_assets])
def churn_model():
    # 基于 dbt 产出的特征表训练模型
    ...
```

SQL 转换 + Python 训练在同一张资产图上调度，血缘连通。

## 踩过的坑

1. **心智模型转换有成本**：Airflow 用户头三天会想"我的 task 在哪"——Dagster 没有 task 概念（有 op，但平时不用）。要硬切到"我有什么数据"。

2. **IO Manager 第一次写容易踩坑**：`@asset` 函数 `return df` 之后，df 存哪里？默认是本地 pickle。生产环境要换成 S3 或 Snowflake，不配 IO Manager 就静默写到 `/tmp`。

3. **资产数量爆炸 UI 卡**：超过 1000 个资产时 UI 加载慢，需要拆 **Asset Group** 或多 **Code Location**（多个 Python 进程加载不同的资产集）。

4. **多维 Partitions 容易跑错**：(date, region) 二维分区有 365×50 = 18250 个组合，回填范围算错就跑爆机器。先用小范围试。

5. **OSS 和 Cloud 不完全一致**：Dagster Cloud（托管）有些功能 OSS 没有（branch deployment、insights），文档偶尔混着写，看的时候要分清版本。

## 适用 vs 不适用场景

**适用**：

- 数据仓库 ETL/ELT，需要血缘和回填
- ML 流水线（特征 → 训练 → 评估 → 上线），各阶段产出物需要追溯
- dbt 编排 + 数据质量监控
- 需要把 SQL / Python / Spark 任务统一调度

**不适用**：

- 纯任务编排，没有"数据产物"概念（如部署流程、CI 任务）→ 用 Airflow / GitHub Actions 更轻
- 极简场景一两个 cron 脚本 → 直接 cron 别上重型框架
- 实时流处理（毫秒级）→ Dagster 是批/微批，要实时用 Flink / Kafka Streams

## 历史小故事（可跳过）

- **2018 年**：Nick Schrock（前 Facebook 工程总监，GraphQL 联合创造者）创立 Elementl，开源 Dagster
- **2022-08**：v1.0 发布，正式稳定 API
- **2024 年起**：CEO 由 Pete Hunt（早期 React 团队成员）接任，公司更名 Dagster Labs

## 学到什么

1. **抽象层级影响一切**：把"步骤"换成"产物"，整个调度、血缘、测试、回填的体验都变了——这就是好抽象的力量
2. **声明式 > 命令式**：声明"我要什么"让系统帮你倒推；命令式"按这个顺序跑"把决策推给人
3. **跟 dbt 互补**：dbt 是 SQL 资产层，Dagster 是统一编排层，两者一起组成现代数据栈
4. **可测试性来自解耦**：业务函数不依赖调度器，本地能直接跑，这是 Airflow 时代的痛点

## 延伸阅读

- 官方文档：[docs.dagster.io](https://docs.dagster.io/)
- 入门：[What & Why Dagster](https://docs.dagster.io/getting-started/what-why-dagster)
- 源码：[dagster-io/dagster](https://github.com/dagster-io/dagster)
- [[airflow]] —— 任务编排前辈，对照看清楚资产模型的差异
- [[dbt]] —— SQL 资产层，常和 Dagster 一起用

## 关联

- [[airflow]] —— Dagster 之前最主流的编排器，task 模型代表
- [[prefect]] —— Python-first 编排，2.x 后部分向资产靠拢
- [[dbt]] —— SQL 转换层，Dagster 可把 dbt 模型当资产管
- [[graphql]] —— 同一作者（Nick Schrock）的另一个声明式系统
