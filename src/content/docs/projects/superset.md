---
title: Apache Superset — 开源 BI 平台
来源: https://github.com/apache/superset
日期: 2026-06-01
分类: 数据可视化 / BI
难度: 中级
---

## 是什么

Apache Superset 是一个**让你不用写前端、不用买 Tableau，靠浏览器就能拉数据画图做看板的开源 BI 平台**。日常类比：你公司里那个"每天导 Excel、做透视表、截图发周报"的同事，被换成一个网页——任何人打开浏览器选数据源、写 SQL 或拖字段，立刻出图表、出看板、能分享。

它由 Airbnb 工程师 Maxime Beauchemin 在 2015 年内部做出来（同一个人也是 [[airflow]] 的作者），2016 年开源，2017 年捐给 Apache 基金会孵化，2021 年毕业成顶级项目，目前 GitHub 约 6 万+ stars，是开源 BI 里最活跃的项目之一。

## 为什么重要

不理解 Superset，下面这些事都没法解释：

- 为什么很多公司开始**不再为 Tableau 付每人每年几百美元的 license**——Superset 免费 + 开源
- 为什么数据团队能给业务方一个"自助查询入口"——SQL Lab 让懂 SQL 的人直接在浏览器里查仓库
- 为什么"50+ 种可视化"听起来夸张但确实需要——不同业务（地理 / 漏斗 / 时序）需要不同图表语言
- 为什么 Preset.io（Maxime 自己开的公司）能做到累计融资约亿美元量级——开源 + 托管是 BI 的新商业模式

## 核心要点

Superset 的结构可以拆成 **四块**：

1. **数据源接入**：通过 [[sqlalchemy]] 抽象，**一次接入支持 40+ 种数据库**——Postgres / MySQL / BigQuery / Snowflake / Trino / [[clickhouse]] / [[druid]] / DuckDB 全打通。你只填一个连接串。

2. **SQL Lab（浏览器里的 SQL IDE）**：左边树形列表浏览数据库表，右边编辑器写 SQL，下面看结果。可以保存查询、把结果一键转成图表。这是 Superset 区别于纯看板工具的杀手锏。

3. **可视化层**：50+ 种图表，底层用 [[apache-echarts]]、Plotly、deck.gl 三家渲染。从最普通的折线 / 柱状 / 饼图，到桑基图、地理热力、3D 地图、漏斗、矩阵树图。每种图都是一个独立 React 组件。

4. **看板（Dashboard）**：把多个 Chart 拖到一个画布上，加交叉过滤（点一个柱子，其他图同时筛）、加时间范围控件、加权限控制。看板可以导出 JSON，用 git 版本管理。

后端是 Python [[flask]] + Celery（异步查询） + Redis（缓存），前端是 React + TypeScript。

## 实践案例

### 案例 1：5 分钟跑起来（教学向）

官方长期维护的是 **docker-compose 开发栈**；下面单容器流程适合本地试玩，若 `superset` 命令找不到，优先改用仓库里的 `docker-compose`。

1. **拉起镜像**（务必设 `SUPERSET_SECRET_KEY`，否则新版本会拒启动）：

```bash
docker run -d -p 8088:8088 \
  -e "SUPERSET_SECRET_KEY=$(openssl rand -hex 32)" \
  --name superset apache/superset
```

2. **建管理员** → **升级元数据库** → **初始化权限**：

```bash
docker exec -it superset superset fab create-admin \
  --username admin --firstname A --lastname B \
  --email a@b.c --password admin
docker exec -it superset superset db upgrade
docker exec -it superset superset init
```

3. 打开 `http://localhost:8088`，登录 admin/admin，加一个 SQLite/Postgres 数据源，到 SQL Lab 写 `SELECT 1`，再点 "Create Chart"。

### 案例 2：SQL Lab 怎么用

写一句 SQL：

```sql
SELECT date_trunc('day', created_at) AS day,
       COUNT(*) AS signups
FROM users
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;
```

点 Run，下面立刻出表格。点 "Explore"——Superset 把这个查询结果丢进 Chart Builder，你选 "Time-series Line Chart"，X 轴 `day`、Y 轴 `signups`，瞬间出折线图。再点 "Save"，把它扔到一个看板上，配上"过去 7 / 30 / 90 天"切换器，一个新人 onboarding 看板就做好了。

### 案例 3：Semantic Layer（语义层）

很多业务方不会写 SQL。Superset 让数据工程师**预先在 Dataset 上定义"指标"**：

```yaml
metric_name: monthly_active_users
expression: COUNT(DISTINCT user_id)
filter: last_seen > NOW() - INTERVAL '30 days'
```

业务方在 Chart Builder 里就只看到一个下拉项 "Monthly Active Users"，点一下、选维度（按城市 / 渠道分组）、出图。SQL 复杂性被工程师吸收了。这一层叫**语义层**，是 [[looker]] 也在主推的概念。

### 案例 4：交叉过滤（Cross-Filter）

看板上有四张图：销售额柱状图（按地区）、订单数饼图（按渠道）、退款时序、客单价分布。打开"交叉过滤"开关后，**点柱状图里"华东"的柱子**——其他三张图同时只显示"华东"的数据。

这种交互对业务方探索数据极重要："华东退款率为什么高？"——不用每张图都改筛选条件，点一下就联动。技术上，Superset 把过滤事件广播到看板里所有 Chart，每个 Chart 把自己原本的查询拼上一个 `WHERE region = '华东'`，重新拉数据。

### 案例 5：异步查询（Celery + Redis）

数仓里一条 SQL 跑 10 分钟很常见：若浏览器同步死等，会超时。思路是——**查询丢给后台工人（Celery），前端轮询状态，跑完再从 Redis 取结果**：

```python
# superset_config.py 关键配置
RESULTS_BACKEND = RedisCache(host='localhost', port=6379, db=1)
class CeleryConfig:
    broker_url = 'redis://localhost:6379/0'
    imports = ('superset.sql_lab',)
```

配上 [[trino]] 这种长查询场景，体验才可用。

## 踩过的坑

1. **OLTP 数据库直查会卡死**：Superset 是个查询前端，不存数据。如果直接连生产 [[postgresql]]，业务方一个不带索引的 GROUP BY 就能把数据库压垮。生产部署**必须接数仓**（[[clickhouse]] / Snowflake / BigQuery）或加一层只读副本。

2. **看板加载慢就是查询慢**：看板 = N 个图 = N 条 SQL 并发。一个看板 20 张图 = 20 条查询同时打数据库。解决方案：开 Redis 查询缓存（默认关）+ 给数据集加 thumbnail cache + 物化预聚合表。

3. **权限模型从 Flask-AppBuilder 继承，复杂**：Superset 的角色 / 权限来自底层的 Flask-AppBuilder，新人配 RBAC 经常配错——把 "can read on Database" 当成"能看所有表"，其实还要单独给 Schema 级权限。生产部署强烈建议先读官方 RBAC 文档。

4. **每个 Chart 类型是独立 React 包，升级要小心**：Superset 把每种图表（line / bar / sankey）拆成独立 npm 包，升级主版本时某个 chart 的 props 可能不兼容，导致已有看板里的图 "白屏"。回归测试要覆盖。

## 适用 vs 不适用场景

**适用**：

- 自建 BI 平台、不想付 Tableau / Looker license 的中小公司
- 数据团队需要给业务方一个**自助 SQL + 看板**入口
- 已经有数仓（[[clickhouse]] / Snowflake / BigQuery / Trino），需要前端可视化

**不适用**：

- 实时监控告警（毫秒级刷新、阈值告警） → 用 [[grafana]]，它是为时序监控生的
- 需要复杂数据建模（cube / 多维 OLAP） → 看 Cube.dev / dbt + 上层
- 重度自定义可视化（科研级 D3 自由画） → Superset 的 50 种图是"多但定型"，超出就要自己写 plugin
- 离线分析报告（pdf / 邮件订阅）→ 内置订阅功能弱，要接 Alerts & Reports 模块外加 SMTP

## 历史小故事（可跳过）

- **2015**：Maxime Beauchemin 在 Airbnb 数据团队，受不了把数据从 Hive 导出 → CSV → Tableau 的循环，自己写了个内部工具叫 "Caravel"。
- **2016**：开源到 GitHub，半年涨 1 万 star。
- **2017-06**：进 Apache 孵化器，改名 "Apache Superset"（避免 Caravel 商标问题）。
- **2018**：Maxime 离开 Airbnb，创立 Preset.io，做托管版 Superset，累计融资约亿美元量级。
- **2021-01**：Apache 顶级项目毕业，治理彻底社区化。

## 学到什么

1. **BI 平台 = SQL 抽象 + 可视化抽象 + 多用户协作**——Superset 用 SQLAlchemy / ECharts / Flask-AppBuilder 三个开源库各负责一块，自己只做"粘合"
2. **开源 + 托管是新商业模式**——Maxime 把 Airflow（送给 ASF 然后开 Astronomer）和 Superset（送给 ASF 然后开 Preset）连续做了两次
3. **"自助 BI" 听着好但需要数据治理**——给业务方 SQL 入口的前提是数仓干净 + 权限到位 + 指标统一定义，否则 100 个人写 100 种 DAU 定义
4. **可视化是个庞大的工程问题**——50+ 种图表、跨浏览器、跨数据源、还要交互联动；Superset 的代码量主要在前端 plugin 体系

## 延伸阅读

- 官方文档：[Apache Superset Documentation](https://superset.apache.org/docs/intro)
- 视频导览：[Superset in 30 Minutes — Preset.io](https://www.youtube.com/results?search_query=apache+superset+intro)（搜索 Preset 官方频道）
- 源码地图：`superset/` 是 Python 后端，`superset-frontend/` 是 React，`superset-frontend/plugins/` 是 50+ 个图表插件
- [[airflow]] —— Maxime 的另一个项目，理解他的设计偏好
- [[grafana]] —— 同样是开源可视化，但定位是时序监控不是 BI

## 关联

- [[airflow]] —— 同一个作者 Maxime Beauchemin，对照看其设计哲学
- [[grafana]] —— 开源可视化双雄，一个偏 BI 一个偏监控
- [[clickhouse]] —— Superset 最常接的列存数仓
- [[postgresql]] —— Superset 元数据库的默认选项
- [[sqlalchemy]] —— Superset 接 40+ 数据源的抽象层
- [[apache-echarts]] —— Superset 主要图表渲染引擎
- [[flask]] —— Superset 后端 Web 框架
- [[looker]] —— 商业 BI 对手，语义层做得更深
- [[celery]] —— Superset 异步查询的任务队列

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
