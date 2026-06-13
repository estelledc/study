---
title: Apache Zeppelin — JVM 多语言笔记本
来源: https://github.com/apache/zeppelin
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 是什么

**Apache Zeppelin** 是 Apache 软件基金会旗下的**多语言交互式数据分析笔记本**：在浏览器里写段落（paragraph），用 `%spark`、`%flink`、`%python`、`%jdbc` 等**解释器（interpreter）**直连 Spark、Flink、Hive、Presto、Shell 等后端，适合数据平台团队做 ad-hoc 查询、ETL 原型和结果可视化。它跑在 **JVM** 上（Scala/Java 实现），Notebook 存成 **JSON**（`.zpln` 或导出格式），与企业 Hadoop/YARN/K8s 集群集成是设计重心——和 [[jupyter-notebook]] 的「单 kernel Python 优先」、[[pluto-jl]] 的「Julia reactive 单文件」是不同赛道。

日常类比：

> [[jupyterlab]] 像**个人实验室工作台**：你 mainly 绑一个 Python kernel，需要 Spark 时自己配 PySpark 或 Livy，扩展靠 pip/npm 插件。
> Zeppelin 像**数据中心的多语种同声传译室**：同一份 Note 里，上一段用 `%spark.sql` 查 Hive，下一段 `%pyspark` 做清洗，再一段 `%md` 写结论——每种语言背后是一个**可独立配置、可连不同集群**的解释器进程；管理员在 Interpreter 设置里配好 YARN 地址、jar 包、并发模式，分析师只管 `%` 选语言开写。

最小上手（Docker 最快，官方镜像自带 Spark Tutorial）：

```bash
docker run -p 8080:8080 --name zeppelin apache/zeppelin:0.12.0
# 浏览器打开 http://localhost:8080
# Notebook → Spark Tutorial → 逐段 Run
```

本机安装则需 **JDK 11**（0.12.0 官方要求）、下载 Zeppelin 二进制包、`bin/zeppelin-daemon.sh start`，并在 **Interpreter** 菜单里配置 Spark/Flink 的 `master` 与依赖 jar。

## 为什么重要

Zeppelin 在大数据栈里占一个独特位置：

- **多引擎统一 UI**：Spark、Flink、Hive、JDBC、Markdown、Shell 等同屏，适合数据平台「一个入口查天下」
- **Interpreter 插件模型**：新引擎通过实现 `org.apache.zeppelin.interpreter` 接入，经 **Apache Thrift** 与 Zeppelin Server 通信
- **企业部署形态成熟**：YARN client/cluster、Flink yarn-application、K8s、Livy 远程 Spark 等模式文档齐全
- **可视化内置**：查询结果可绑 Table、Bar、Pie、Scatter 等 **Zeppelin Visualization**，比纯文本输出更适合给业务方看
- **与 Jupyter 互补**：Jupyter 生态在 ML/AI、nbconvert、Colab 更强；Zeppelin 在 **已建好的 Spark/Flink 集群** 上交互更省事

不理解 Zeppelin，很难读懂很多公司的「数据开发平台」为什么 Notebook 模块选它而不是 Jupyter。

## 核心概念

Zeppelin 分三层，记牢就不迷路：

```text
浏览器 Frontend  ←REST/WebSocket→  Zeppelin Server (JVM)
                                        │
                          Thrift RPC    │  管理 Note / 调度 Paragraph
                                        ▼
                              Interpreter Process(es) (JVM，可多个)
                                        │
                                        ▼
                              Spark / Flink / Hive / … 集群
```

### 1. Note 与 Paragraph

- **Note**：一篇笔记本，含多个 **paragraph**（段落），可设默认 interpreter group
- **Paragraph**：最小执行单元，首行常用 `%spark`、`%spark.pyspark` 等声明语言；点 Run 或 Shift+Enter 执行
- 段落可 **隐藏代码只展示结果**、拖拽排序、导出 HTML/PDF；Note 可放文件夹、权限控制（需配置 Shiro/LDAP 等）

与 Jupyter cell 类似，但 Zeppelin **没有** Pluto/marimo 式全局 reactive——段落顺序与是否重跑由你手动控制，变量在**同一 interpreter session** 内共享（取决于 binding mode）。

### 2. Interpreter（解释器）

**Interpreter** = 某种语言/引擎的后端插件。每个 interpreter 属于一个 **Interpreter Group**（如 `spark` 组含 `%spark`、`%spark.pyspark`、`%spark.sql`）。

| 常见 Group | 段落前缀示例 | 用途 |
|------------|--------------|------|
| spark | `%spark`、`%spark.pyspark`、`%spark.sql` | Spark Scala / PySpark / Spark SQL |
| flink | `%flink`、`%flink.pyflink`、`%flink.ssql` | Flink Scala / PyFlink / 流批 SQL |
| jdbc | `%jdbc` | 连 PostgreSQL、MySQL 等 |
| python | `%python` | 本地 Python（非 Spark） |
| sh | `%sh` | Shell 命令 |
| md | `%md` | Markdown 说明 |

段落写法规则（官方 Overview）：

- `%spark` — 用 spark 组里第一个可用 interpreter
- `%spark.pyspark` — 指定组内具体 interpreter
- 可省略组名，仅 `%pyspark`（若默认组配置允许）
- 带本地属性：`%cassandra(outputFormat=cql, dateFormat="E, d MMM yy")`

**Interpreter Setting** 是一组 interpreter 的配置与生命周期单元：同一 Setting 里的 interpreter **共享一个 JVM 进程**（除非 isolated per note 开新进程）。配置项里全大写名（如 `SPARK_HOME`）会注入为环境变量。

### 3. Binding Mode（绑定模式）

决定「多份 Note / 多用户是否共享 SparkContext、Flink 集群连接」——这是 Zeppelin 运维最关键的概念之一。

| 模式 | 含义（per note scope 下） |
|------|---------------------------|
| **shared** | 所有 Note 共享同一 interpreter session（同一 SparkContext） |
| **scoped** | 每 Note 独立 session，但可仍共享同一 SparkApplication（fair scheduler 分作业） |
| **isolated** | 每 Note 独立 interpreter 进程 / 独立 SparkContext |

还有 **per user** vs **per note** 两个维度。生产上 Flink/Spark 文档常建议：默认 `globally shared` 容易互相抢资源，**interactive 开发用 `isolated per note`**，避免 A 分析师 Cancel 作业把 B 的集群会话干掉。不同 Note 仍可通过 **ResourcePool** 共享对象，但变量不会自动串台。

### 4. ZeppelinContext 与跨语言共享

Spark 组内，`%spark` 定义的 Scala 变量可通过 **ZeppelinContext**（代码里常写 `z`）暴露给 `%spark.pyspark`；反之 PySpark 的 `df` 也可在 `%spark.sql` 里当 temp view 用。这实现了「一段 Scala UDF、一段 Python 清洗、一段 SQL 聚合」的混排流水线——比在多份 Jupyter kernel 之间 export parquet 更短。

### 5. 可视化与 Dynamic Form

查询结果表格右侧可配置 **可视化**（柱状、折线、饼图等）。Paragraph 支持 **Dynamic Form**：

- 模板语法：`${name=default}` 运行前弹出输入框
- Note 级表单：`$${name=default}`（双 `$`）全 Note 段落可用
- 编程式：`z.textbox("name")`、`z.select(...)`（Spark / PySpark 段落）

适合参数化 SQL 而不改代码，或给运营一个「填数字就能查」的模板 Note。

### 6. 生命周期与恢复（0.8+）

- **TimeoutLifecycleManager**：空闲超过阈值（默认 1 小时）自动关闭 interpreter，省集群资源
- **Interpreter Process Recovery**（实验性）：重启 Zeppelin Server 时可尝试重连仍在跑的 interpreter 进程，避免长作业被误杀

### 7. 与 Jupyter / Pluto / marimo 对比

| 维度 | Zeppelin | Jupyter | Pluto.jl / marimo |
|------|----------|---------|-------------------|
| 主场景 | 大数据集群交互 | 通用计算 / ML | Reactive 探索 |
| 语言切换 | `%` 前缀多 interpreter | 通常单 kernel | 单语言 |
| 状态模型 | 手动 Run + session 共享 | 手动 Run + hidden state | 自动 reactive |
| 存储 | JSON Note | `.ipynb` | `.jl` / `.py` |
| 运行时 | JVM + 子 JVM interpreter | 多 kernel 进程 | Julia/Python 进程 |

## 实践案例

### 案例 1：Spark SQL + PySpark 混排

```sql
%spark.sql

-- 段落 1：注册或查询（session 内 temp view 可跨段落）
CREATE OR REPLACE TEMP VIEW orders AS
SELECT * FROM parquet.`/data/orders`;

SELECT country, COUNT(*) AS cnt
FROM orders
GROUP BY country
ORDER BY cnt DESC
LIMIT 10;
```

```python
%spark.pyspark

# 段落 2：用 PySpark 读上一段逻辑产出的 view（同一 scoped session）
df = spark.table("orders")
from pyspark.sql import functions as F

top = (
    df.groupBy("country")
      .agg(F.sum("amount").alias("total"))
      .orderBy(F.desc("total"))
      .limit(5)
)
top.show()
```

若 binding 是 **shared**，Note A 里注册的 `orders` 可能被 Note B 看见或覆盖——团队共用实例时要选 **scoped/isolated per note**。

### 案例 2：Dynamic Form 参数化 SQL

```sql
%spark.sql

-- ${table=orders} ${limit=100} 运行前弹出表单
SELECT country, SUM(amount) AS revenue
FROM ${table=orders}
GROUP BY country
ORDER BY revenue DESC
LIMIT ${limit=100}
```

```scala
%spark

// 编程式表单：适合 Scala 段落
val name = z.textbox("name", "world")
println(s"Hello, $name")
```

第一段给业务方「选表 + 限制行数」；第二段演示 `ZeppelinContext` API。表单值在重跑该段落时生效，不会自动级联更新下游——改参数后需手动 Run 依赖段落。

### 案例 3：Flink 流 SQL 段落

```text
%flink.ssql

-- 段落 1：Flink 1.15+，local 或 remote 集群由 Interpreter 配置决定
CREATE TABLE clicks (
  user_id STRING,
  url STRING,
  ts TIMESTAMP(3),
  WATERMARK FOR ts AS ts - INTERVAL '5' SECOND
) WITH (
  'connector' = 'kafka',
  'topic' = 'clickstream',
  'properties.bootstrap.servers' = 'kafka:9092',
  'format' = 'json'
);

SELECT window_start, window_end, COUNT(*) AS pv
FROM TABLE(
  TUMBLE(TABLE clicks, DESCRIPTOR(ts), INTERVAL '1' MINUTE)
)
GROUP BY window_start, window_end;
```

Flink interpreter 在 Zeppelin 侧是 **Flink Client**：编译 SQL、提交 job、展示进度；真正执行在 MiniCluster / Standalone / YARN / K8s。Cancel 段落会尝试取消对应 Flink job。

### 案例 4：Markdown 文档 + Shell 准备数据

```markdown
%md

## 日报：活跃用户数
下方段落从 HDFS 拉取昨日分区，Spark SQL 聚合。
```

```bash
%sh

hdfs dfs -ls /data/users/dt=$(date -d yesterday +%Y-%m-%d) | head
```

```sql
%spark.sql

SELECT COUNT(DISTINCT user_id) AS dau
FROM users
WHERE dt = date_sub(current_date(), 1);
```

## 安装与上手

**Docker（零基础推荐）：**

```bash
docker run -p 8080:8080 --rm --name zeppelin apache/zeppelin:0.12.0
# 持久化 notebook 与 logs：
docker run -u $(id -u) -p 8080:8080 --rm \
  -v $PWD/notebook:/notebook -v $PWD/logs:/logs \
  -e ZEPPELIN_NOTEBOOK_DIR=/notebook -e ZEPPELIN_LOG_DIR=/logs \
  --name zeppelin apache/zeppelin:0.12.0
```

**本机二进制：**

```bash
# 需 JDK 11，设置 JAVA_HOME
tar xzf zeppelin-0.12.0-bin-all.tgz
cd zeppelin-0.12.0-bin-all
bin/zeppelin-daemon.sh start
# 浏览器 http://localhost:8080
# 远程访问：conf/zeppelin-site.xml 里 zeppelin.server.addr 改为 0.0.0.0
```

首次登录建议顺序：跑 **Spark Tutorial** → 打开 **Interpreter** 页看 spark 组 → 新建 Note 写 `%md` + `%spark.sql` 三段落。

## 部署与运维要点

| 主题 | 建议 |
|------|------|
| 日志 | Server：`logs/zeppelin-*.log`；Interpreter：`logs/zeppelin-interpreter-*.log` |
| 资源隔离 | 生产用 **isolated per note** 或 per user；慎用的 globally shared |
| 依赖 jar | Interpreter 设置里配 `spark.jars` / `%spark(dep=...)` 或 `%spark(addjar=...)` |
| 并发 SQL | `zeppelin.spark.concurrentSQL=true` + fairscheduler 池 |
| 认证 | 配置 Shiro、LDAP、Knox 等（企业版常接 SSO） |
| 凭证 | Interpreter 开启 `injectCredentials` 后，Note 里 `{ENTITY.user}` 可替换为托管密码 |

## 局限与踩坑

1. **不是 reactive notebook**——改上一段不会自动重跑下游；和 [[pluto-jl]]、[[marimo]] 心智不同
2. **JSON Note diff 噪声大**——Git CR 不如纯 `.py` / `.jl` 友好
3. **JVM 栈偏重**——轻量 Python ML 探索不如 Jupyter + venv 顺手
4. **Interpreter 配置门槛高**——Spark/Flink 版本、Scala 二进制、YARN queue 配错则全 Note 失败
5. **多用户共享实例**——binding mode 选错会导致变量串台或误 Cancel 他人 job
6. **版本耦合**——Flink interpreter 需 Flink 1.15+（见 0.12 文档）；老集群需对齐 Zeppelin 发行版

## 学习路径建议

1. `docker run apache/zeppelin:0.12.0` → 跑通 **Spark Tutorial** 文件夹里所有 Note
2. 在 Interpreter 页观察 **spark** 组有哪些子 interpreter，改 binding mode 为 scoped per note 再对比 session
3. 写一个三段落 Note：`%md` 说明 + `%spark.sql` 聚合 + `%spark.pyspark` 画图
4. 练习 Dynamic Form：`${limit=10}` 与 `z.textbox` 各写一段
5. 若有 Flink 集群，按官方 Flink interpreter 文档配 remote/yarn 模式，跑 `%flink.ssql`
6. 与团队确认生产规范：谁管 Interpreter Setting、Note 是否允许 `%sh`

## 小结

Apache Zeppelin 是**面向大数据平台的多语言笔记本**：用 `%` 解释器把 Spark、Flink、SQL、Shell 拼在同一 Note，用 binding mode 控制集群资源隔离，用内置可视化与 Dynamic Form 给业务看结果。它不适合替代 Jupyter 做通用 AI 实验，也不提供 Pluto 式 reactive；但在 **「集群已经有了，分析师要在浏览器里交互式写 Spark/Flink」** 这一环，Zeppelin 仍是常见选型。

---

## 参考资料

- 官方文档：[zeppelin.apache.org/docs/latest](https://zeppelin.apache.org/docs/latest/)
- 源码：[github.com/apache/zeppelin](https://github.com/apache/zeppelin)
- 安装：[Install](https://zeppelin.apache.org/docs/latest/quickstart/install.html)
- Interpreter 概览：[Overview](https://zeppelin.apache.org/docs/latest/usage/interpreter/overview.html)
- Binding Mode：[interpreter_binding_mode](https://zeppelin.apache.org/docs/latest/usage/interpreter/interpreter_binding_mode.html)
- Dynamic Form：[intro](https://zeppelin.apache.org/docs/latest/usage/dynamic_form/intro.html)
- Spark Interpreter：[spark.html](https://zeppelin.apache.org/docs/latest/interpreter/spark.html)
- Flink Interpreter：[flink.html](https://zeppelin.apache.org/docs/latest/interpreter/flink.html)
- 相关笔记：[[jupyter-notebook]]、[[jupyterlab]]、[[pluto-jl]]、[[marimo]]
