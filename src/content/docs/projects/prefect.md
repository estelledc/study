---
title: Prefect — Python 原生编排，让数据流水线像写普通函数一样自然
来源: Prefect Documentation, https://docs.prefect.io/v3/
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

Prefect 是一套**用纯 Python 写工作流、运行时再决定怎么走的编排系统**。

日常类比：像一份**会随天气改主意的旅行计划**——不是一开始把全部景点钉死，而是带着规则上路：下雨改去博物馆、人多就排下家、路上看到好东西临时加一站。Prefect 就是这个边走边判断的导游。

写起来是这样：

```python
from prefect import flow, task

@task
def fetch(city): return get_weather(city)

@task
def alert(data): send_warning(data)

@flow
def daily_check(cities):
    for c in cities:
        w = fetch(c)
        if w.temp < 0:
            alert(w)
```

`@flow` 包外层、`@task` 包内层，**for / if 全是普通 Python**——这就是 Prefect 区别于 Airflow 的核心姿势。

## 为什么重要

不理解 Prefect，下面这些事就解释不通：

- 为什么 2018 之后『编排系统』从一统天下分裂成 Airflow / Prefect / Dagster 三家——Prefect 提出了**动态 DAG**这条路线
- 为什么 Prefect 创始人 Jeremiah Lowin 本来是 Airflow 早期核心提交者（PMC 成员）——他做 Prefect 的理由是『Airflow 的某些限制无法在原架构上修复』
- 为什么数据团队招聘要求里『熟悉 Prefect/Dagster 任一』越来越常见——Python 原生派系正在替代 Airflow Operator 派系
- 为什么同一份 task 函数能在多个 pipeline 里复用——`@task` 让它变成普通 Python 函数，import 就能跑

## 核心要点

Prefect 的世界由四个抽象咬合：

1. **`@task`**：普通 Python 函数加上『可缓存、可重试、可观察』的能力。每次调用进数据库一条记录，UI 可见。
2. **`@flow`**：把若干 task（和子 flow）组织成一次完整运行。**flow 内部就是普通 Python**——可以写 `for`、`if`、`while`、递归调用，运行时才决定调哪些 task。
3. **State（状态）**：每次 task/flow 运行都有一个状态对象——`Pending → Running → Completed/Failed/Cached`。状态可以被读、被改、被监听。
4. **Deployment（部署）**：把 flow 跟『调度规则 + 参数 + worker 资源』绑成一份运行规约。可以定时、可以纯事件触发、也可以完全手工。

**和 Airflow 三处关键差异**：

| 维度 | Airflow | Prefect |
|------|---------|---------|
| DAG 结构 | 必须静态画死，调度器才能扫 | 运行时才形成，flow 内部可写任何 Python 控制流 |
| 数据传递 | XCom：push/pull，序列化进 Postgres | 函数返回值直接传，自动追踪依赖 |
| Task 复用 | 绑死在某个 DAG 里，跨 DAG 复用要复制 | 普通 Python 函数，import 就能在多 flow 共用 |

第三点是『Airflow 不能解决』的核心——下面案例 3 展开。

## 实践案例

### 案例 1：动态分支（运行时根据数据决定走哪条路）

```python
@flow
def process_user(user_id):
    profile = fetch_profile(user_id)
    if profile.is_premium:
        send_premium_report(profile)
    else:
        send_basic_email(profile)
```

Airflow 要做这件事必须用 `BranchPythonOperator` 加上**静态画好两条分支**——分支再多就 DAG 爆炸。Prefect 直接 if/else，运行时才走。

### 案例 2：动态 fan-out（不知道几个并行任务）

```python
@flow
def crawl_site(start_url):
    pages = discover_links(start_url)
    for url in pages:
        scrape.submit(url)
```

`pages` 的长度运行时才知道。Airflow 2.3 有 dynamic task mapping 但要预先声明 mapped operator；Prefect 直接 for 循环里调 `submit`，调度器自然 fan-out。

### 案例 3：Task 跨 flow 复用（Airflow 真的做不到）

```python
# my_company/tasks/db.py
from prefect import task

@task(retries=3)
def upsert_user(row): ...

# pipeline_a.py
from my_company.tasks.db import upsert_user

@flow
def daily_sync(): upsert_user(...)

# pipeline_b.py（另一个仓库、另一个团队）
from my_company.tasks.db import upsert_user

@flow
def realtime_fix(): upsert_user(...)
```

`upsert_user` 是普通 Python 函数，可以做成 pip 包发布。Airflow 的 PythonOperator 也能 import 函数，但**重试策略、监控、缓存这些是绑在 Operator 实例上**——跨 DAG 复用要每个 DAG 重新配一遍。

## 踩过的坑

1. **1.x → 2.x 不兼容大改写**：旧文档/旧博客大量失效。看到 `Flow(...)` 类构造而不是 `@flow` 装饰器的代码，基本是 1.x，全部要重写。
2. **动态 task 太多 UI 会卡**：每个 task run 都写一条数据库记录。爬 10 万页网站这种规模建议把『一批页面』包成一个 task，不要每页一个。
3. **@task 复用必须靠模块导入**：把 `@task` 函数定义在某个 flow 文件里，再从别处 import，函数本身能跑，但 Prefect 的元数据归属会乱。正确做法是放进独立模块。
4. **免费 Cloud 有限额**：Prefect Cloud 免费版有运行次数上限，超了要付费或自托管。自托管完全免费但要自己运维 Postgres + worker。
5. **状态钩子（state hooks）执行顺序**：on_failure / on_completion 钩子是异步的，依赖钩子做关键清理（关连接）容易漏，关键资源用 try/finally。

## 适用 vs 不适用场景

**适用**：

- ETL/ELT 需要根据数据**运行时分支**（高级用户走 A 流、普通用户走 B 流）
- 已有 Python 数据脚本，想**加一层调度/重试/可观察**而不重写
- Task 函数要做成**可复用 pip 包**给多团队共享
- **递归 / 不定深度**的工作流（爬虫深度抓取、树形数据处理）

**不适用**：

- 纯定时批处理 + 完全静态依赖 → Airflow 更成熟、社区/Operator 生态大得多
- 团队已深度绑定 Airflow 的 KubernetesPodOperator / PostgresOperator → 迁移成本高
- 需要**资产为中心**（asset-centric，按数据集而不是按任务追血缘） → 用 Dagster
- 实时流处理（毫秒级） → Prefect 是批处理编排，不是流引擎，用 Flink/Kafka Streams

## 历史小故事（可跳过）

- **2018 年**：Jeremiah Lowin 离开 Airflow PMC，创立 Prefect 公司。他公开表态『Airflow 的几个限制在原架构上修不了』——主要指 DAG 必须静态、XCom 性能差、调度器单点。
- **2018-2020 年**：Prefect 1.0（Core 系列）。仍然是 DAG-first，可以看作『改进版 Airflow』，没拉开本质差距。
- **2022 年**：Prefect 2.0（代号 Orion）。**删除 DAG 强制结构**，flow 内部就是普通 Python，运行时才形成执行图。这是 Prefect 真正区别于 Airflow 的转折点。
- **2024 年**：Prefect 3.0。性能大重写，官方称 runtime overhead 降低 90%。

## 学到什么

1. **静态 DAG 是历史包袱不是必然**——Airflow 选静态有 2014 年的算力理由（调度器要预扫描），现在可以运行时形成
2. **数据传递走函数返回值比走 XCom 自然**——这就是把『编排系统』从 DSL 拉回普通编程语言
3. **创始人换阵营做新一代**是基础设施领域常见模式：Lowin 离 Airflow 做 Prefect、Hadoop 创始人做 Cloudera/MapR
4. **三家路线分裂**：task-centric（Airflow / Prefect）vs asset-centric（Dagster）——选哪条看团队是按『干什么』还是按『产出什么』组织数据工作

## 延伸阅读

- 官方文档：[Prefect 3 docs](https://docs.prefect.io/v3/)（简洁，1 小时入门）
- 创始人访谈：[Jeremiah Lowin on Why Prefect Exists](https://www.prefect.io/blog/) (解释离开 Airflow 的设计动机)
- 对比深读：[Prefect vs Airflow vs Dagster](https://www.dagster.io/blog/dagster-airflow) (Dagster 写的，但三家对比客观)
- 源码入口：[github.com/PrefectHQ/prefect](https://github.com/PrefectHQ/prefect)（22.5k star，Python 79% / TS 20%）
- [[airflow]] —— 同领域前辈，task-centric 静态 DAG 路线
- [[python-decorators]] —— @flow / @task 的语言基础

## 关联

- [[airflow]] —— Prefect 直接对照基线，前者静态 DAG 后者动态
- [[dagster]] —— 同代竞品，asset-centric 路线，跟 Prefect 不在同一条路上
- [[celery]] —— Prefect 早期 Executor 之一，分布式任务队列
- [[python-decorators]] —— @flow / @task 装饰器的语言机制

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[airflow]] —— Apache Airflow — 用 Python 代码画工作流图，让调度器替你按图施工
- [[dagster]] —— Dagster — 把流水线想成数据资产图，不是任务序列
- [[kedro]] —— Kedro — 把数据科学 notebook 改造成可复用模块化 pipeline
