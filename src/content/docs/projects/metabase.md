---
title: Metabase — 让非技术人查数
来源: https://github.com/metabase/metabase
日期: 2026-06-01
分类: 数据可视化 / BI
难度: 入门
---

## 是什么

Metabase 是一个**让不会写 SQL 的人也能在浏览器里点几下就拉出报表的开源 BI 工具**。日常类比：你公司里运营同学想看"上周新注册用户里付费转化率多少"，过去得排队找数据分析师写 SQL。Metabase 把这个动作变成"在网页上点一下表名 → 选过滤条件 → 选分组维度 → 出图"，全程不写一行代码。

它由 Sameer Al-Sakran 于 2015 年在 Expa Labs（旧金山的一个孵化器）做出来，同年 10 月开源，2018 年 Metabase Inc. 独立成公司，2021 年拿到 3000 万美元 B 轮，目前 GitHub 约 48k stars，是开源 BI 里最适合**中小团队入门**的项目。

## 为什么重要

不理解 Metabase，下面这些事都没法解释：

- 为什么"不会 SQL 的运营/产品/CEO"也敢说"我自己拉数据"——Question Builder 把 SQL 翻译成点选界面
- 为什么很多公司从一个 jar 包就跑起来 BI——Metabase 自带 H2 元数据库，下载即用
- 为什么和 [[superset]] 同样开源 BI 但定位不同——Superset 给分析师，Metabase 给业务方
- 为什么 SaaS 创业公司喜欢嵌它——签名 JWT 把图表嵌进自己产品后台，几分钟出"客户数据看板"

## 核心要点

Metabase 的世界只有两个核心概念：**Question**（问题）和 **Dashboard**（看板）。

1. **Question = 一个问题**：比如"过去 30 天每天注册多少人"。底层是一条 SQL，入门有两条路——**Question Builder**（点表、过滤、分组、聚合，自动生成 SQL）和 **Native SQL**（分析师手写，结果照样存成 Question）。

2. **Dashboard = 多个 Question 的画布**：拖入已保存的 Question，加全局过滤器、文本说明、权限。还可配 **Dashboard Subscriptions**（曾叫 Pulse）：定时把看板截图发到 Slack / 邮箱。

3. **数据接入与沉淀**：自家 driver 支持 20+ 种库（Postgres、MySQL、BigQuery、Snowflake、ClickHouse、MongoDB 等）。**Model** 把常用查询存成"虚拟表"，**Metric** 把 KPI 表达式统一成一个定义，避免十个看板各算各的"活跃用户"。

4. **后端用 [[clojure]] 写**：函数式、易并发、JVM 成熟；代价是社区比 Python 小，二次开发门槛高。前端是 React。新表还可点 **X-Ray** 自动套模板出一组摸底图。

## 实践案例

### 案例 1：5 分钟跑起来

```bash
wget https://downloads.metabase.com/v0.50.0/metabase.jar
java -jar metabase.jar
# 浏览器打开 http://localhost:3000 ，按向导建管理员并加数据源
```

逐部分解释：

- `metabase.jar` 是官方发布的可执行包，内嵌 Jetty，不强制 Docker
- 首次启动会用本地 **H2** 存 Question/Dashboard 元数据（开发够用，生产要换 Postgres）
- 向导里可接 Postgres / MySQL / SQLite 等；进主页后就能开 Question Builder

这是 Metabase 比 [[superset]] 易上手的关键——**单 jar、零依赖**。

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

逐部分解释：

- `date_trunc` + `GROUP BY` 对应界面上的"按天分组"
- `WHERE ... INTERVAL` 对应时间过滤器
- 右上角 **View the SQL** 可对照点选与 SQL——很多团队用它当 SQL 入门教具

### 案例 3：签名嵌入（JWT）嵌进自己产品

SaaS 想给客户看"自己的数据看板"时，用签名嵌入而不是公开链接：

```js
const jwt = require("jsonwebtoken");
const token = jwt.sign(
  { resource: { dashboard: 7 }, params: { customer_id: 123 } },
  METABASE_SECRET_KEY,
  { expiresIn: "10min" }
);
const url = `${METABASE}/embed/dashboard/${token}#bordered=true`;
```

逐部分解释：

- `resource.dashboard` 指定嵌哪张看板；`params` 会进 SQL 的 WHERE（行级过滤）
- `METABASE_SECRET_KEY` 在 Metabase 管理后台的 Embedding 设置里生成
- 前端用 iframe 打开 `url`；token 短过期，降低泄露风险

公开链接人人能看；JWT 嵌入才能按客户隔离数据——这是常见商业卖点。

## 踩过的坑

1. **默认 H2 元数据库别上生产**：配置存在 H2 里，升级时偶发丢看板；生产必须切 Postgres。官方文档第一条警告。

2. **Question Builder 复杂查询写不出来**：多表 join、窗口函数、CTE 表达不了。口号是"80% 简单查询不用写 SQL"，不是"消灭 SQL"。

3. **直连业务库会拖垮服务**：不带索引的 GROUP BY 能卡死生产 [[postgresql]]。应接只读副本或数仓（[[clickhouse]] / BigQuery）。

4. **Clojure 二次开发门槛高**：改图表类型或权限逻辑要懂 Clojure + query processor；社区 PR 量明显少于 Superset。

## 适用 vs 不适用场景

**适用**：

- 中小团队第一次自建 BI，预算少、技术栈轻
- 业务方多、分析师少，需要"自助查数据"
- SaaS 产品需要给客户嵌简单数据看板（Embedded Analytics）

**不适用**：

- 重度 SQL、需要 50+ 种图表 → 用 [[superset]]
- 实时监控告警、毫秒刷新 → 用 [[grafana]]
- 复杂语义层 / 指标平台 → 看 Cube.dev 或 dbt Semantic Layer
- 大型企业精细 RBAC / SSO → 需要 Pro/Enterprise（收费）

## 历史小故事（可跳过）

- **2015**：Sameer Al-Sakran 在 Expa Labs 做内部工具，把"业务方每周问数据"变成自助。
- **2015-10**：开源在 GitHub，主打"5 分钟跑起来"。
- **2018**：Metabase Inc. 从 Expa 独立，专心做开源 + 托管。
- **2020**：Metabase Cloud 上线，托管版正式商业化。
- **2021**：Series B 3000 万美元，Insight Partners 领投。
- **2024**：Metabase 50 发布；Embedding SDK 与权限模型重写；Pulse 产品名收敛为 Subscriptions / Alerts。

## 学到什么

1. **BI 工具的定位差异在用户画像**：Metabase 服务非技术用户，Superset 服务分析师，Grafana 服务运维。
2. **Question + Dashboard 是极简模型**——新人几分钟就懂；Superset 的 Chart / Dataset / Dashboard / SQL Lab 认知负担更高。
3. **开源 + 嵌入式**是 BI 的另一条商业路径——不只卖托管，还卖"嵌进你产品的图表能力"。
4. **Clojure 在工业界确实存在**——Metabase 是少数用 Clojure 写后端、规模很大的开源项目。

## 延伸阅读

- 官方文档：[Metabase Documentation](https://www.metabase.com/docs/latest/)
- 看板订阅：[Dashboard subscriptions](https://www.metabase.com/docs/latest/dashboards/subscriptions)（原 Pulse）
- 源码地图：`src/metabase/` Clojure 后端、`frontend/src/metabase/` React 前端、`modules/drivers/` 各数据库 driver
- [[superset]] —— 同为开源 BI，对照看用户定位差异
- [[grafana]] —— 开源可视化第三家，定位时序监控

## 关联

- [[superset]] —— 开源 BI 双雄之一，定位偏分析师
- [[grafana]] —— 开源可视化，偏时序监控告警
- [[clickhouse]] —— Metabase 常接的列存数仓
- [[postgresql]] —— Metabase 元数据库的生产推荐选项
- [[clojure]] —— Metabase 后端语言，工业级 Lisp 方言

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[evidence]] —— Evidence — 把 Markdown + SQL 编译成静态报告站
- [[lightdash]] —— Lightdash — 寄生在 dbt 项目里的开源 BI
