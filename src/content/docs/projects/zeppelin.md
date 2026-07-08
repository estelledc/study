---
title: Apache Zeppelin — JVM 多语言笔记本
来源: 'https://github.com/apache/zeppelin'
日期: 2026-07-08
分类: projects / editors
难度: 初级
---

## 是什么

Apache Zeppelin 是一个**给大数据分析用的网页笔记本**：一页里可以写 SQL、Scala、Python、R、Markdown，还能把结果直接变成表格、图和可分享的段落。

日常类比：它像一间会议室里的白板，但白板下面接着好几个厨房。你在某一段前面写 `%sql`，就是叫数据库厨房；写 `%spark`，就是叫 Spark 厨房；写 `%python`，就是叫 Python 厨房。

最小体验不是“新建一个工程”，而是在一个 paragraph 里写：

```python
%python
print("hello zeppelin")
```

运行后，输出会贴在这一段下面。下一段可以继续写 Markdown 解释“为什么这么算”，再下一段可以换成 `%sql` 查表。

所以 Zeppelin 不是单纯编辑器，也不是单纯 BI 看板。它更像“面向数据团队的可运行报告”：前半句给人看，后半句交给 Spark、Flink、JDBC 或 Python 去跑。

## 为什么重要

不理解 Zeppelin，下面这些事都没法解释：

- 为什么大数据团队不只需要 [[jupyter-notebook]]，还需要一个天然懂 Spark / Flink / JDBC 的协作笔记本
- 为什么同一份分析能从原始文件清洗、SQL 聚合、图表展示一路写到结论，而不用在 IDE、终端、BI 工具之间搬来搬去
- 为什么企业环境会关心 LDAP、多用户、YARN、Kerberos、解释器隔离这些“看起来不像笔记本”的能力
- 为什么一个 SQL 结果可以加输入框、下拉框、复选框，变成轻量 dashboard，而不是只能截图发给别人

## 核心要点

Zeppelin 的设计可以拆成 **三层**：

1. **paragraph 是最小工作台**：每一段都有代码区和结果区。类比：做实验时每一步单独写在一张卡片上，哪里错了就只重跑那张卡片，不必重做整本笔记。

2. **interpreter 是真正干活的人**：Zeppelin 自己负责网页、笔记和协作，具体计算交给解释器插件。类比：前台服务员只负责点单，后厨可以是 Spark、Flink、Python 或数据库。

3. **display system 把输出变成可读结果**：普通文本、表格、HTML、Markdown、图形和动态表单都可以嵌在段落里。类比：厨师不只把菜端出来，还能按盘子、餐盒或展示柜摆好。

这三层合起来，Zeppelin 的关键优势不是“能写代码”，而是把多语言计算、可视化、参数化交互和共享链接放在同一个数据工作台里。

## 实践案例

### 案例 1：用 SQL 做一个带输入框的年龄分布图

官方 SQL quickstart 里有一个 `bank` 表例子：

```sql
%sql
select age, count(1) value
from bank
where age < ${maxAge=30}
group by age
order by age
```

**逐部分解释**：

- `%sql` 告诉 Zeppelin：这一段交给 SQL 解释器，而不是 Python 或 Scala
- `select age, count(1)` 是按年龄分组数人数，结果天然适合画柱状图
- `${maxAge=30}` 会自动生成一个输入框，默认值是 `30`
- 你改输入框的值再运行，图表就跟着变，不需要改 SQL 文本

这个案例说明 Zeppelin 的一个核心习惯：不是先写完脚本再去 BI 工具画图，而是在笔记本里一边查、一边调参数、一边看结果。

### 案例 2：Python 读 DataFrame，再用 SQL 查它

官方 Python 文档给的用法是先在 `%python` 段落里创建 Pandas DataFrame：

```python
%python
import pandas as pd
rates = pd.read_csv("bank.csv", sep=";")
```

下一段可以直接用 `%python.sql` 查询这个 DataFrame：

```sql
%python.sql
SELECT * FROM rates WHERE age < 40
```

**逐部分解释**：

- `rates` 是 Python 里的 DataFrame，像一张内存表
- `%python.sql` 让你用 SQL 思维过滤 DataFrame，适合不熟 Python 链式调用的人
- 查询结果会走 Zeppelin 的表格展示系统，后续可以继续切换成图表
- 如果只想预览 DataFrame，也可以在 Python 解释器里用 `z.show(rates)`

这个案例很适合初学者：先用 Python 读文件，再用熟悉的 SQL 做筛选，最后让 Zeppelin 负责展示。

### 案例 3：Spark DataFrame 直接交给 Zeppelin 展示

官方 Spark / ZeppelinContext 文档强调：Spark 解释器会自动注入 `z` 这个上下文对象，可以把 DataFrame 送到 Zeppelin 表格系统。

```scala
%spark
val df = spark.read.csv("/path/to/csv")
z.show(df)
```

**逐部分解释**：

- `%spark` 表示这段代码跑在 Spark 解释器里，可以使用 SparkSession
- `spark.read.csv(...)` 读的是分布式数据入口，不是浏览器本地文件
- `z.show(df)` 把 Spark DataFrame 转成交互表格，而不是只打印一堆纯文本
- 同一个 notebook 后面还可以接 `%sql` 或 `%pyspark`，用不同语言继续分析

这个案例体现 Zeppelin 和普通 Notebook 的差异：它不是只服务单机 Python，而是把大数据计算引擎当成一等公民。

## 踩过的坑

1. **关掉网页不等于计算资源安全释放**：解释器进程、Spark job 或数据库查询可能仍在后台跑，要在界面或集群侧确认状态。

2. **解释器配置比 cell 代码更容易出错**：JDBC URL、Spark home、Flink home、依赖包和用户身份配错，代码本身再简单也跑不起来。

3. **本地模式和集群模式不是一回事**：本机 demo 能跑，不代表 YARN、Kubernetes、Kerberos、多用户隔离都已经准备好。

4. **旧教程截图可能对不上新 UI**：从 0.12.0 开始 classic UI 变成可选项，照着旧文档点按钮时要先确认自己用的是哪套界面。

## 适用 vs 不适用场景

**适用**：

- 数据工程师需要在同一份笔记里混合 Spark、SQL、Python 和解释文字
- 团队已经有 Hadoop / Spark / Flink / Hive / JDBC 数据源，需要一个浏览器入口给大家探索
- 临时分析、教学演示、数据排查，希望每一步都留下可运行记录
- 轻量 dashboard：查询参数不多，但希望业务方能改输入框自己看图

**不适用**：

- 纯 Python 个人学习，且不碰分布式数据时，[[jupyter-notebook]] 或 [[jupyterlab]] 更轻
- 严格生产流水线，应该交给 [[airflow]]、调度系统、测试和版本化脚本
- 面向很多业务用户的稳定 BI 门户，[[superset]] 这类专门 BI 工具更合适
- 需要强代码审查、模块边界和 CI 的长期工程，不应把核心逻辑困在 notebook 段落里

## 历史小故事（可跳过）

- **2013 年**：Zeppelin 起源于 NFLabs 的数据分析产品，早期目标就是让大数据查询和可视化更像交互式笔记。
- **2014 年 12 月**：项目进入 Apache Incubator，开始按 Apache 社区方式治理。
- **2016 年**：Zeppelin 毕业为 Apache 顶级项目，定位从公司内部产品变成社区项目。
- **2020s**：Zeppelin 继续围绕 Spark、Flink、Python、JDBC、多用户部署和安全修复演进。
- **现在**：GitHub 约 6.6k stars，官网主打 SQL、Scala、Python、R 以及 20+ interpreters。

## 学到什么

1. **Zeppelin 的核心不是“会写很多语言”**，而是用 interpreter 把不同计算后端接到同一种 notebook 体验里。
2. **大数据 notebook 比个人 notebook 更关心部署**：用户身份、集群模式、依赖管理和资源回收都是主线问题。
3. **动态表单让 SQL 从静态查询变成交互入口**：`${maxAge=30}` 这种小语法，背后是“分析给别人复用”的思路。
4. **可运行报告有边界**：探索和解释很舒服，但稳定生产逻辑还是要沉淀到脚本、任务和服务里。

## 延伸阅读

- 官方仓库：[apache/zeppelin](https://github.com/apache/zeppelin)
- 官方首页：[Apache Zeppelin](https://zeppelin.apache.org/)
- 安装与启动：[Install](https://zeppelin.apache.org/docs/latest/quickstart/install.html)
- SQL 例子：[SQL with Zeppelin](https://zeppelin.apache.org/docs/latest/quickstart/sql_with_zeppelin.html)
- Python 解释器：[Python Interpreter](https://zeppelin.apache.org/docs/latest/interpreter/python.html)
- Spark 解释器：[Spark Interpreter](https://zeppelin.apache.org/docs/latest/interpreter/spark.html)
- [[jupyter-notebook]] —— 对照理解“个人数据科学 notebook”和“大数据协作 notebook”的差异

## 关联

- [[jupyter-notebook]] —— 同样是 notebook，但默认服务单机 Python 生态
- [[jupyterlab]] —— 更像通用 IDE，Zeppelin 更偏数据平台入口
- [[pandas]] —— Zeppelin Python 解释器里最常见的 DataFrame 工具
- [[matplotlib]] —— Python 可视化可以在 Zeppelin 中内嵌展示
- [[superset]] —— 都能做数据展示，但 Superset 更偏稳定 BI 看板
- [[druid]] —— Zeppelin 常连接的实时分析数据库之一
- [[kafka]] —— 流式数据进入 Spark / Flink 后，可在 Zeppelin 中交互分析

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
