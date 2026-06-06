---
title: Metabase — 让非技术人查数
来源: https://github.com/metabase/metabase
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

Metabase 是一个**让不会写 SQL 的人也能在浏览器里点几下就拉出报表的开源 BI 工具**。日常类比：你公司里运营同学想看"上周新注册用户里付费转化率多少"，过去得排队找数据分析师写 SQL。Metabase 把这个动作变成"在网页上点一下表名 → 选过滤条件 → 选分组维度 → 出图"，全程不写一行代码。

它由 Sameer Al-Sakran 于 2015 年在 Expa Labs（旧金山的一个孵化器）做出来，同年 10 月开源，2018 年 Metabase Inc. 独立成公司，2021 年拿到 3000 万美元 B 轮，目前 GitHub ~39k stars，是开源 BI 里最适合**中小团队入门**的项目。

## 为什么重要

不理解 Metabase，下面这些事都没法解释：

- 为什么"不会 SQL 的运营/产品/CEO"也敢说"我自己拉数据"——Question Builder 把 SQL 翻译成点选界面
- 为什么很多公司从一个 jar 包就跑起来 BI——Metabase 自带 H2 元数据库，下载即用
- 为什么和 [[superset]] 同样开源 BI 但定位不同——Superset 给分析师，Metabase 给业务方
- 为什么 SaaS 创业公司喜欢嵌它——签名 JWT 把图表嵌进自己产品后台，5 分钟出"客户数据看板"

## 核心要点

Metabase 的世界只有两个核心概念：**Question**（问题）和 **Dashboard**（看板）。

1. **Question = 一个问题**：比如"过去 30 天每天注册多少人"。一个 Question 在底层是一条 SQL，但 UI 上有两种入门方式——
   - **Question Builder**：点表名、选列、加过滤器、选分组、选聚合函数（COUNT/SUM/AVG），界面上看起来像填表，背后 Metabase 自动生成 SQL
   - **Native SQL**：分析师直接写 SQL，结果照样保存为 Question

2. **Dashboard = 多个 Question 的画布**：把保存的 Question 拖进来，加全局过滤器（一个时间选择器同时控制所有图）、加文本说明、设权限。

3. **数据接入**：通过自家 driver 框架支持 20+ 种数据库——Postgres、MySQL、SQL Server、BigQuery、Snowflake、ClickHouse、MongoDB 都能接，填一个连接串就行。

4. **后端用 [[clojure]] 写**：这在 BI 工具里不常见。好处是函数式、易并发、JVM 生态成熟；代价是 Clojure 社区比 Python 小，二次开发门槛高。前端是 React。

## 实践案例

### 案例 1：5 分钟跑起来

```bash
wget https://downloads.metabase.com/v0.50.0/metabase.jar
java -jar metabase.jar
```

打开 `http://localhost:3000`，按向导建管理员账号、加一个数据源（Postgres / MySQL / 甚至 SQLite），就进主页了。这是 Metabase 比 [[superset]] 易上手的关键——**单 jar、零依赖**，连 Docker 都不强求。

### 案例 2：Question Builder 怎么"翻译"成 SQL

界面上你点：表 `orders` → 过滤 `created_at` 在过去 30 天 → 分组 `created_at` 按天 → 汇总 `count of rows`。

Metabase 自动生成：

```sql
SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
FROM orders
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;
```

界面右上有个 "View the SQL" 按钮，能让你看见自己点出来的 SQL——这是非常好的**SQL 入门教学工具**。很多团队让运营/产品先用 Question Builder 点几个月，慢慢过渡到自己写 SQL。

### 案例 3：X-Ray 自动探索

新接一个数据源，不知道该看什么。点表名 `users` → 选 "X-Ray this table"。Metabase 自动生成一组图表：每天新增、按城市分布、按渠道分布、最高/最低留存日。

底层逻辑：扫表的列类型（日期 / 类别 / 数值），按规则套模板生成 8-10 个 Question。这个功能对**新人接入数据**和**第一次开会前快速摸底**极有用。

### 案例 4：Pulse — 让看板"会发周报"

在 Dashboard 上配一个 Pulse："每周一早上 9 点把这个看板的截图发到 #growth Slack 频道、再附 PDF 发给 CEO 邮箱"。

技术上是 Quartz 调度 + headless 浏览器渲染截图 + SMTP/Slack webhook。这个功能让 BI 看板**主动找人**，而不是等人去登录看。Superset 有类似的 Alerts & Reports 模块但配置更繁琐。

### 案例 5：Embedded Analytics（嵌进自己产品）

SaaS 公司想给客户一个"自己的数据看板"。Metabase 提供两种嵌入：

- **公开链接**：一行 iframe，简单但人人能看
- **签名嵌入（JWT）**：后端用 secret key 签一个 JWT，里面声明"这个用户只能看 customer_id=123 的数据"，前端嵌 iframe 时带上 token，Metabase 把 JWT claims 自动拼到 SQL 的 WHERE 里

```js
const jwt = require("jsonwebtoken");
const token = jwt.sign(
  { resource: { dashboard: 7 }, params: { customer_id: 123 } },
  METABASE_SECRET_KEY,
  { expiresIn: "10min" }
);
const url = `${METABASE}/embed/dashboard/${token}#bordered=true`;
```

这是 Metabase 的商业卖点之一——很多 SaaS 公司不想自己写图表，直接嵌一个 Metabase 当"客户数据中心"。

### 案例 6：Models 与 Metric — 把"重复的查询"沉淀下来

数据团队发现 10 个看板都在算"活跃用户"，每个写法略不同——有人 30 天活跃，有人 7 天活跃。Metabase 的解法：

- **Model**：保存一个查询当"虚拟表"，比如 `active_users_30d` = 一段 SQL；其他人在 Question Builder 里就把它当普通表用
- **Metric**：定义一个 KPI 表达式，比如 `MAU = COUNT(DISTINCT user_id WHERE last_seen > now() - 30d)`；图表里直接选这个 Metric

效果：全公司"活跃用户"只有一个定义，避免每个看板各算各的。

## 踩过的坑

1. **默认 H2 元数据库别上生产**：Metabase 启动后 Question/Dashboard 配置存在 H2（内嵌文件数据库）里。开发够用，生产必须切到 Postgres，否则升级版本时偶尔丢看板。官方文档第一条警告。

2. **Question Builder 复杂查询写不出来**：多表 join、窗口函数、CTE 这些 GUI 表达不了。一旦业务方提"我要看月环比"，必须切 Native SQL。所以 Metabase 的口号是"让 80% 简单查询不用写 SQL"，不是"消灭 SQL"。

3. **直连业务库会拖垮服务**：和 Superset 同样的坑——Metabase 不存数据，业务方一个不带索引的 GROUP BY 就能让生产 [[postgresql]] 卡住。生产部署应该接只读副本或数仓（[[clickhouse]] / BigQuery）。

4. **Clojure 二次开发门槛高**：想加一个自定义图表类型或改权限逻辑，要懂 Clojure + Metabase 内部的 query processor 架构。社区贡献的 PR 数量比 Superset 少很多就是这个原因。

## 适用 vs 不适用场景

**适用**：

- 中小团队第一次自建 BI，预算少、技术栈轻
- 业务方多、分析师少，需要"自助查数据"的场景
- SaaS 产品需要给客户嵌一个简单数据看板（Embedded Analytics）

**不适用**：

- 重度 SQL 分析团队、需要 50+ 种图表 → 用 [[superset]]
- 实时监控告警、毫秒刷新 → 用 [[grafana]]
- 复杂语义层 / 指标平台 → 看 Cube.dev 或 dbt Semantic Layer
- 大型企业的精细 RBAC / SSO 集成 → 需要 Pro/Enterprise 版（收费）

## 历史小故事（可跳过）

- **2015**：Sameer Al-Sakran 在 Expa Labs（Garrett Camp 创办的孵化器）做内部工具，把"业务方每周问数据"变成自助。
- **2015-10**：开源在 GitHub，主打"5 分钟跑起来"。
- **2018**：Metabase Inc. 从 Expa 独立，专心做开源 + 托管。
- **2020**：Metabase Cloud 上线，托管版正式商业化。
- **2021**：Series B 3000 万美元，Insight Partners 领投。
- **2024**：Metabase 50 发布，Embedding SDK 和权限模型重写。

## 学到什么

1. **BI 工具的定位差异在用户画像**：Metabase 服务非技术用户，Superset 服务分析师，Grafana 服务运维。同样画图，UI 抽象差远了。
2. **Question + Dashboard 是个极简模型**——把一切操作都归到这两个名词，新人 5 分钟就懂。Superset 的 Chart / Dataset / Dashboard / SQL Lab 四件套，认知负担更高。
3. **开源 + 嵌入式**是 BI 的另一条商业路径——不只卖托管，还卖"嵌进你产品的图表能力"。
4. **Clojure 在工业界确实存在**——Metabase 是少数几个用 Clojure 写后端、规模上千万用户的开源项目。

## 延伸阅读

- 官方文档：[Metabase Documentation](https://www.metabase.com/docs/latest/)
- 视频导览：[Metabase 5-min intro](https://www.youtube.com/results?search_query=metabase+intro)（官方频道）
- 源码地图：`src/metabase/` Clojure 后端、`frontend/src/metabase/` React 前端、`modules/drivers/` 各数据库 driver
- [[superset]] —— 同为开源 BI，对照看用户定位差异
- [[grafana]] —— 开源可视化第三家，定位时序监控

## 关联

- [[superset]] —— 开源 BI 双雄之一，定位偏分析师
- [[grafana]] —— 开源可视化，偏时序监控告警
- [[clickhouse]] —— Metabase 常接的列存数仓
- [[postgresql]] —— Metabase 元数据库的生产推荐选项
- [[clojure]] —— Metabase 后端语言，工业级 Lisp 方言
