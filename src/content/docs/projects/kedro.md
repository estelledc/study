---
title: Kedro — 把数据科学 notebook 改造成可复用模块化 pipeline
来源: Kedro Documentation, https://docs.kedro.org/
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Kedro 是一套**用纯 Python 函数描述数据处理步骤、再由框架自动拼成可重跑流水线**的数据科学项目模板，由 QuantumBlack（麦肯锡的 AI 咨询子品牌）2019 年开源，现归 LF AI & Data Foundation 托管。

日常类比：像**装修工地的施工标准化包**——以前每户人家工人自己带工具、自己定工序，做完就拆了，下一户从头来。Kedro 把『工序怎么命名』『材料堆在哪个仓』『水电气接口走哪』先定死，于是这一户做完的水电组件，下一户能直接搬过去用。

写起来像这样：

```python
# nodes.py — 纯函数，不读文件不写文件
def split(data, ratio):
    return data[: int(len(data) * ratio)], data[int(len(data) * ratio) :]

# pipeline.py — 用名字声明依赖
node(split, inputs=['raw_users', 'params:ratio'],
            outputs=['train_users', 'test_users'])
```

`raw_users` 物理上是 CSV 还是 Parquet、放本地还是 S3，由 `catalog.yml` 单独声明，函数本身**永远不知道也不需要知道**。

## 为什么重要

不理解 Kedro，下面这些事就解释不通：

- 为什么 2020 之后『把 notebook 工业化』变成数据团队的固定工序——Kedro 给了一套不需要每家自创的标准答案
- 为什么 Dagster / Metaflow 诞生时都要回答『跟 Kedro 比有什么不同』——它定义了**项目模板**这一层的工业基线
- 为什么 data scientist 交给 ML engineer 的代码经常被嫌弃——Kedro 在两边的中间画了一条契约线
- 为什么 cookiecutter-data-science 之后再没有一个轻量模板成事——Kedro 不只给目录结构，还把『数据 I/O 抽象』也给了

## 核心要点

Kedro 的世界由六个组件咬合：

1. **Node**：一个纯 Python 函数 + 输入名 + 输出名。**不直接读写文件**——这是和 Airflow Operator 最大的差别。
2. **Pipeline**：把若干 Node 拼起来。Kedro 看名字自动对齐：A 的输出叫 `clean_users`，B 的输入也叫 `clean_users`，依赖箭头自动建好。
3. **DataCatalog**：`conf/base/catalog.yml` 是数据字典——『`raw_users` 是 S3 上的 Parquet，按月分区，凭证在 prod 环境取』，函数里只用名字。
4. **ConfigLoader**：`conf/base/`（默认）+ `conf/local/`（本机开发，gitignore）+ `conf/prod/`（部署）三层，OmegaConfigLoader（0.19 起默认）支持插值和 schema 校验。
5. **Runner**：`SequentialRunner`（默认）/ `ParallelRunner`（多进程）/ `ThreadRunner`（IO 密集）。同一份 pipeline 换 runner 不改代码。
6. **Hooks**：`before_node_run` / `after_pipeline_run` 等生命周期点注入扩展，常用来接 MLflow 跟踪、Datadog 埋点。

设计哲学一句话：**计算（node）和数据位置（catalog）必须分离**。这条线划清楚之后，本地用 100 行 CSV 调通的 pipeline，部署到生产换上 1TB Parquet，**不改一行 Python**。

## 实践案例

### 案例 1：notebook 转 pipeline 的最小例子

数据科学家在 notebook 里写好了：

```python
df = pd.read_csv('users.csv')
df = df[df['age'] > 18]
df.to_parquet('clean.parquet')
```

转成 Kedro：

```python
# src/myproj/pipelines/clean/nodes.py
def filter_adult(df):
    return df[df['age'] > 18]

# src/myproj/pipelines/clean/pipeline.py
node(filter_adult, inputs='raw_users', outputs='clean_users')
```

```yaml
# conf/base/catalog.yml
raw_users: {type: pandas.CSVDataset, filepath: data/01_raw/users.csv}
clean_users: {type: pandas.ParquetDataset, filepath: data/02_intermediate/clean.parquet}
```

跑：`kedro run`。函数本身**没有任何 I/O**，所以单元测试直接喂 DataFrame 就行。

### 案例 2：多环境部署不改代码

本地开发：

```yaml
# conf/local/catalog.yml — 本机用小样本 CSV
raw_users: {type: pandas.CSVDataset, filepath: data/sample/users.csv}
```

生产部署：

```yaml
# conf/prod/catalog.yml — 生产读 S3 Parquet 分区
raw_users:
  type: pandas.ParquetDataset
  filepath: s3://prod-data/users/year=2026/
  credentials: aws_prod
```

切换：`kedro run --env=prod`。Python 代码零改动。

### 案例 3：用 Kedro-Viz 看血缘

```bash
kedro viz
```

浏览器打开能看到完整 DAG：每个 node 是方块、每条边写着数据集名，点 node 看输入输出 schema、点边看上次运行的体积。**给业务方解释 pipeline 时不用画 PPT**——这是 QuantumBlack 咨询出身留下的 DNA。

## 踩过的坑

1. **把 Kedro 当调度器用**：Kedro **不管时间、不管重试、不管监控告警**。生产里 cron 定时、失败重跑、SLA 监控全部要外挂 Airflow / Prefect / Argo。Kedro 只管『代码怎么组织』。

2. **在 node 函数里写 `pd.read_csv`**：直接读文件就破坏了 catalog 抽象，部署时想换 S3 / Snowflake 必须改 Python。规则：**node 函数只接收 DataFrame、只返回 DataFrame**，I/O 全部交给 catalog。

3. **catalog.yml 写死生产路径**：`conf/base/catalog.yml` 应该写**默认或开发版本**，生产路径放 `conf/prod/catalog.yml`，本机敏感凭证放 `conf/local/credentials.yml`（gitignore）。新人常把 S3 路径直接塞进 base，导致本地一跑就报凭证错误。

4. **Pipeline 之间用全局变量传状态**：Kedro 的可重跑保证建立在『node 是纯函数』之上。一旦在模块顶层写 `cache = {}` 让 node 之间偷偷传东西，重跑就不再幂等。要传中间结果就**显式声明成 dataset**，让 catalog 替你管落盘。

## 适用 vs 不适用场景

**适用**：
- PoC notebook 要交付给工程团队工业化（data scientist → ML engineer 的对接）
- 中小数据科学团队的项目模板（替代 cookiecutter-data-science）
- 需要 reproducibility 又不想自创规范的咨询/外包/研究项目
- 和 Airflow / Databricks / SageMaker / Argo 部署管道对接的**代码层**

**不适用**：
- 流处理 / 实时推理 → Kedro 是批处理框架
- 纯 SQL 转换 → 用 dbt，Kedro 在 SQL-only 场景过重
- 单脚本一次性分析 → 直接 notebook，上 Kedro 反而拖慢节奏
- 强一致事务工作流 → Temporal / Cadence

## 历史小故事（可跳过）

- **2017 年**：QuantumBlack 在咨询项目里反复吃『每个客户都重写一套数据 pipeline』的亏，内部立项做模板。
- **2019 年 5 月**：GitHub 开源，定位『data science 版本的 Django』——给一套有 opinion 的项目脚手架。
- **2021 年**：加入 Linux Foundation AI & Data，从『一家公司的工具』转成社区基金会项目。
- **2024 年**：0.19 把 OmegaConfigLoader 设为默认，`kedro-datasets` 拆出独立 PyPI 包以便单独迭代。
- **2026 年 5 月**：1.4.0 发布，跨过 1.0 心理门槛，star ~10.9k。

整条故事线和 Airflow 形成对照：Airflow 来自 Airbnb 数据团队，解决的是**调度**；Kedro 来自咨询团队，解决的是**交付**。两个团队的痛点不同，做出的工具也就不在同一层。

## 学到什么

1. **代码和数据位置必须分离**——这是 Kedro 最硬的一条原则。一旦混在一起，pipeline 就只能在它被写出来的那台机器上跑。
2. **项目模板是一种产品**。cookiecutter-data-science 给目录结构，Kedro 给目录结构 + 数据抽象 + Runner，于是后者活下来了。给一个『有 opinion 的脚手架』比给一堆零散最佳实践有用得多。
3. **框架和调度器是不同层**。Kedro 不和 Airflow 竞争，它们是上下游：Kedro 写 pipeline，Airflow / Prefect 调度它跑。混淆这条线就会两头都做不好。
4. **咨询出身的工具有共同 DNA**：自带可视化、自带文档生成、自带交付模板。因为他们的客户每次都换一拨人，必须把『让外人看懂』烙进框架。

## 延伸阅读

- 官方文档（首选）：[Kedro Documentation](https://docs.kedro.org/)
- 官方教程：[Spaceflights tutorial](https://docs.kedro.org/en/stable/tutorial/spaceflights_tutorial.html)（30 分钟把整套概念走一遍）
- 设计哲学博文：[QuantumBlack — Introducing Kedro](https://medium.com/quantumblack/introducing-kedro-the-open-source-library-for-production-ready-machine-learning-code-d1c6d26ce2cf)
- 对照阅读：[[airflow]] —— 调度层；[[dagster]] —— asset-centric 替代品；[[mlflow]] —— 跟踪层常配套

## 关联

- [[airflow]] —— 上游调度器，常负责定时触发 `kedro run`
- [[prefect]] —— 调度层另一选项，与 Kedro 各管一层
- [[dagster]] —— asset-centric 替代路线，对照 Kedro 的 task-centric
- [[dbt-core]] —— SQL 转换层，与 Kedro Python 转换层经常组合使用
- [[mlflow]] —— 实验跟踪和模型注册，常通过 Hook 接入 Kedro 生命周期
