---
title: Apache Airflow — 用 Python 代码画工作流图，让调度器替你按图施工
来源: Apache Airflow Documentation, https://airflow.apache.org/docs/
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Apache Airflow 是一套**用 Python 代码描述任务依赖、再由调度器按依赖顺序自动执行**的批处理工作流系统。

日常类比：像一份**装修施工日程表**——水电、防水、贴砖、油漆有先后顺序，工头每天看一眼表，谁的前置工序做完就派人开工，做完打勾、有问题就重派。Airflow 就是这个不睡觉的工头。

写起来是这样：

```python
from airflow.decorators import dag, task

@dag(schedule="@daily", start_date=...)
def daily_pipeline():
    @task
    def extract(): return load_csv()
    @task
    def transform(rows): return clean(rows)
    @task
    def load(rows): write_to_warehouse(rows)
    load(transform(extract()))
```

三个 `@task` 函数加变量传递，依赖图（DAG）就建好了。

## 为什么重要

不理解 Airflow，下面这些事就解释不通：

- 为什么 2014 之后『数据工程师』这个岗位突然爆发——因为 Airflow 把『拉数据 → 清洗 → 入仓 → 发报表』这条链路从一堆 cron 脚本统一进了图模型
- 为什么 Prefect / Dagster / Argo Workflows 都拿 Airflow 当对照基线——它定义了**任务为中心**这条路线的工业标准
- 为什么调度系统的 ADR（架构决策）总要先表态『task-centric 还是 asset-centric』——Airflow 选了前者
- 为什么数据团队的故障复盘里总出现『某个 DAG 卡住了』『XCom 把 Postgres 撑爆了』这种黑话

## 核心要点

Airflow 的世界由六个组件咬合：

1. **DAG**：一份 Python 文件，定义任务节点 + 依赖箭头。是**有向无环图**（不能形成循环），所以叫 DAG。
2. **Operator → Task**：Operator 是任务模板（BashOperator 跑命令、PythonOperator 跑函数、KubernetesPodOperator 起 Pod），实例化进 DAG 后叫 Task。
3. **Scheduler**：守护进程，几秒扫一次 DAG 文件夹，看哪个 task 的前置都完成了、到达执行时间了，就丢进队列。
4. **Executor**：决定任务跑在哪——`LocalExecutor`（同机进程）/ `CeleryExecutor`（分布式 worker）/ `KubernetesExecutor`（每个 task 起一个 Pod）。
5. **Webserver**：Flask UI，看图、看 log、点重跑。
6. **Metadata DB**：Postgres 或 MySQL，存 DAG 状态、每次运行的 TaskInstance、连接配置（数据库密码 / API key）。

**TaskFlow API**（2.0 引入）是 Airflow 现代写法的核心：

- 旧写法：定义 PythonOperator → 用 `>>` 显式连依赖 → 用 `xcom_push/pull` 传数据
- 新写法：函数加 `@task` 装饰器 → **变量传递即依赖**（`load(transform(extract()))` 自动建三条边）→ 返回值自动走 XCom

## 实践案例

### 案例 1：每天早上 8 点拉用户表入仓

```python
@dag(schedule="0 8 * * *", start_date=datetime(2026, 1, 1), catchup=False)
def user_etl():
    @task
    def fetch_users():
        return requests.get("https://api.example.com/users").json()
    @task
    def to_warehouse(users):
        df = pd.DataFrame(users)
        df.to_sql("users", warehouse_engine, if_exists="replace")
    to_warehouse(fetch_users())
```

读起来：每天 8:00（cron `0 8 * * *`），先 `fetch_users` 拉 JSON，结果通过 XCom 传给 `to_warehouse` 写库。

### 案例 2：补数（backfill）——给历史日期补跑

业务发现上周三的报表数据脏了。Airflow 不要求重写代码，直接：

```bash
airflow dags backfill -s 2026-05-20 -e 2026-05-20 user_etl
```

Scheduler 会以 `logical_date=2026-05-20` 重新跑一次整张图。**前提是 task 写成幂等**——重复执行同一个 logical_date 结果一致，不会插重复行。这是 Airflow 文化里最硬的约束。

### 案例 3：动态分支——按数据量决定走哪条路

```python
@task.branch
def pick_path(rows):
    return "heavy_path" if len(rows) > 10000 else "light_path"
```

`@task.branch` 返回下游 task 的 id，Scheduler 只激活被选中的分支，其他分支被标记为 `skipped`。这套机制叫 **branching**，是 Airflow 区别于普通 cron 的关键能力。

## 踩过的坑

1. **DAG 顶层写慢代码会拖垮 Scheduler**：Scheduler 每隔几秒 import 一次所有 DAG 文件解析图。如果文件顶层有 `requests.get(...)` 或大文件 IO，Scheduler 会卡，全集群跟着卡。规则：顶层只放声明，**所有 IO/计算都进 task 函数体**。

2. **用 XCom 传大对象会撑爆 metadata DB**：XCom 默认存 Postgres 一行 BLOB，传 GB 级数据会让数据库膨胀、备份变慢、UI 加载超时。正确做法：大数据落 S3 / 对象存储，task 之间传**路径字符串**。

3. **start_date + schedule_interval 反直觉**：DAG 第一次跑的时间不是 `start_date`，而是 `start_date + 一个 interval`。`start_date=2026-01-01, schedule="@daily"` 第一次运行实际在 `2026-01-02 00:00`，logical_date 才是 `2026-01-01`。新人常等半天以为坏了。

4. **把 Airflow 当 ETL 引擎用**：Airflow **只是调度器**。在 PythonOperator 里跑 pandas 处理 10GB 数据，worker 内存会炸。正确做法：Operator 触发 Spark/dbt/Snowflake 任务，自己只负责『派活 + 等结果』。

## 适用 vs 不适用场景

**适用**：
- 批处理 ETL（每天 / 每小时拉数清洗入仓）
- 跨系统编排（拉 API → 写 S3 → 触发 Spark → 发邮件 → 更新报表）
- ML 训练流水线的定时调度
- 需要**补数 / 重跑 / 按图重试**这些能力的场景

**不适用**：
- 流处理 / 秒级实时 → 用 Flink / Spark Streaming
- 强一致事务工作流（订单状态机、跨服务 saga）→ 用 Temporal / Cadence
- 简单单文件 cron 够用 → 直接 crontab 别上 Airflow
- 资产（数据集）作为一等公民的语义 → Dagster 比 Airflow 更直接

## 历史小故事（可跳过）

- **2014 年 10 月**：Maxime Beauchemin 在 Airbnb 写第一版，前身参考 Spotify 的 Luigi，但加了 web UI 和分布式 Executor。
- **2015 年 6 月**：Airbnb 开源 Airflow，GitHub 立刻收到大量 PR——数据团队都被一堆 cron 脚本折磨过。
- **2016 年 3 月**：进入 Apache 孵化器，命名空间从 `airflow` 改为 `apache-airflow`。
- **2019 年 1 月**：从孵化器毕业为 Apache 顶级项目。
- **2020 年 12 月**：2.0 发布——Scheduler 支持高可用（多活而非单点）、TaskFlow API、REST API 正式版。
- **2025 年 4 月**：3.0 发布——Task SDK 把执行环境从 Scheduler 解耦、DAG 版本化、Edge Executor 支持远程站点。

『数据工程师』这个岗位名词的流行，跟 Beauchemin 2017 的博文 *The Rise of the Data Engineer* 一起，把 Airflow 推成了行业默认。

## 学到什么

1. **任务为中心 vs 资产为中心**是调度系统第一道分叉。Airflow 选『任务』，Dagster 选『资产』，权衡的是『描述动作』还是『描述数据状态』哪个更接近团队的心智模型。
2. **DAG 是 Python 代码不是配置文件**——这是 Airflow 区别于 Luigi 之前那一代『XML / YAML 工作流』的关键。代码意味着可以循环生成 task、可以单元测试、可以走 git review。
3. **幂等 + 补数**是数据工程的基本功。Airflow 把这两件事变成 first-class 概念，**强迫**写 pipeline 的人按这个姿势思考。
4. **调度器不是计算引擎**。这个边界划清楚之后，整套架构才能横向扩展——Scheduler 只关心图和时间，重活全交给外部系统。

## 延伸阅读

- 官方文档（首选）：[Apache Airflow Documentation](https://airflow.apache.org/docs/)
- TaskFlow 教程：[Working with TaskFlow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/taskflow.html)
- Beauchemin 2017 博文：[The Rise of the Data Engineer](https://maximebeauchemin.medium.com/the-rise-of-the-data-engineer-91be18f1e603)
- 实证研究：[Yasmin et al. 2024 — 1,000 个 Stack Overflow 帖子里 Airflow 开发者的真实痛点](https://arxiv.org/abs/2406.00180)
- 对照阅读：[[dagster]] —— 资产为中心的另一条路；[[prefect]] —— Airflow 前贡献者重写的版本

## 关联

- [[dagster]] —— 资产为中心的对照基线，与 Airflow 的 task-centric 形成 ADR 第一道分叉
- [[prefect]] —— 强调本地体验和动态 DAG 的后继者
- [[argo-workflows]] —— K8s 原生 YAML 工作流，部署模型差异点
- [[temporal]] —— 强一致事务工作流的另一极，处理 Airflow 不擅长的状态机
- [[dbt]] —— 数据转换层常被 Airflow 调度，分工边界的典型案例
- [[spark]] —— Operator 触发的下游计算引擎之一
