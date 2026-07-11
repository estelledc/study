---
title: Redash — 浏览器里写 SQL、出图、做仪表板的开源 BI
来源: getredash/redash GitHub, https://github.com/getredash/redash
日期: 2026-06-01
分类: 基础设施
难度: 中级
---

## 是什么

Redash 是一套**让你在浏览器里直接连数据库写 SQL、把结果画成图、再拼成仪表板**的开源 BI 工具。

日常类比：像一台**多接口的咖啡机**——前面一个统一的操作面板（写 SQL、看图），背后接了 35+ 种豆子（PostgreSQL、MySQL、BigQuery、Snowflake、MongoDB、Elasticsearch...），不管底下是什么豆，磨出来的咖啡都端到同一个杯子里给你看。

典型用法：

1. 网页里粘一段 SQL，点运行 → 几秒后下面出表格
2. 切到 Visualization 标签 → 选『折线图、x=date、y=count』 → 出图
3. 把这张图拖进 Dashboard → 设定每小时刷新 → 早上打开就是最新的

不用本地装 BI 客户端、不用导出 CSV 给设计同学，整个流程都在浏览器里。

## 为什么重要

不理解 Redash，下面这些事就解释不通：

- 为什么 2014 之后中小团队的『数据看板』突然不再是 Excel 截图发群——Redash 把『连数据源 + 写 SQL + 画图 + 分享链接』压成一条点几下就走完的链路
- 为什么 Metabase / Superset / Redash 这三个开源 BI 总被一起讨论——它们代表三种思路（无 SQL / 拖拽探索 / SQL 优先），Redash 是最贴近『SQL 工程师日常』的那个
- 为什么 2020 年 Databricks 花钱收 Redash——它需要一个能挂在 Lakehouse 前面、给**会写 SQL 的分析师 / 数据科学家**用的查询 + 可视化入口
- 被收购后**仓库仍在 OSS 维护**，最新版本到 v26.x，社区还在发 release——这是少数『被收编但没死』的开源项目样本

## 核心要点

Redash 的运行时由五个角色咬合：

1. **Web Server**（Flask）：处理浏览器请求——保存 query、返回 dashboard JSON、转发『跑这个 SQL』给后台。
2. **Query Runner**：每个数据源一份适配器（`redash/query_runner/pg.py` 是 Postgres 的，`mysql.py` 是 MySQL 的），把 Redash 的统一调用翻译成具体数据库的连接。
3. **Celery Worker**：真正执行 SQL 的后台进程。Web 不直接连数据库，避免一条慢查询把整个网站卡死。
4. **PostgreSQL**：存元数据（用户、query 文本、dashboard 布局、调度计划），**不是**存查询结果。
5. **Redis**：当 Celery 的 broker（任务队列）+ 缓存查询结果。同样的 SQL 在 TTL 内再跑会直接从 Redis 拿。

调度和告警的关系：

- **Scheduler**：单独一个 Celery beat 进程，按你设的间隔（5 分钟 / 1 小时 / 每天）把『重跑这个 query』丢进队列
- **Alert**：每次 query 跑完后比对一次条件（『count > 100 就告警』），命中就走 Slack / Email / Webhook

## 实践案例

### 案例 1：一条 query 从点击到出图

拆成五步跟读：

1. 你点『运行』→ Web（Flask）把 SQL 记进元数据库 Postgres 的 `queries` 表
2. Web 发一个 Celery task 进 Redis 队列（Redis 在这里先当**任务经纪人**，不是结果仓库）
3. Worker 取出任务 → 按数据源找 `query_runner` 适配器 → 连真实库执行 SQL
4. 结果写入 Postgres 的 `query_results`（整份 JSON）→ 同时可进 Redis 做短 TTL 缓存
5. 前端轮询拿到结果 → React 渲染表格 / 图

下次另一个用户跑**同样的 SQL**（精确文本一致），可能命中缓存不再打业务库。改一个空格或加注释会换哈希，等于新查询。

### 案例 2：Dashboard 的『拼图』模型

Dashboard 不是独立实体，是**一组 widget 的布局信息**（每个 widget = 一个 query ID + 一种可视化 + 一组宽高坐标）。所以加一张新图 = 新建 query → 选可视化 → 拖进 dashboard。

这种『query 是一等公民、dashboard 是 query 的容器』的设计让分享链接很自然——把 query URL 发出去就行，对方不用打开 dashboard 也能看到这一张图。但代价是：**dashboard 本身不能筛选**，要做联动筛选得用 Parameters（query 内置变量），靠拼接 SQL 实现。

### 案例 3：Alert 的简单粗暴

Alert 不是流式系统，是『**每次 query 跑完看一眼**』的轮询模型。所以告警的及时性 = query 的调度频率。想要 1 分钟级响应，就把 query 设成每分钟跑——这是最被新人误解的点：『为什么我的 alert 延迟 1 小时』，因为 query 也是 1 小时一次。

代价是：高频 query × 数据源连接 × 多个 alert，会把数据源那边的连接数和 Redash 的 Celery 队列都吃满。一个常见反模式是『把 Redash 当 Prometheus 用』。

### 案例 4：Query Runner 的扩展点

加新数据源 = 在 `redash/query_runner/` 下放一个 Python 文件，骨架大致是：

```python
from redash.query_runner import BaseQueryRunner, register

class MyDB(BaseQueryRunner):
    def run_query(self, query, user):
        # 连库、执行 query，返回 (rows_json, error)
        ...
    def get_schema(self, get_stats=False):
        # 返回表/列列表给 UI 自动补全
        ...

register(MyDB)
```

实现 `run_query` / `get_schema` 后重启，UI 数据源列表就能选。社区靠这个扩展点堆到 35+ 连接器，不用改 Web / Celery 核心。

## 踩过的坑

1. **不要把 Redash 当数据仓库**——它只存 query 文本和最新一次结果，历史结果会被覆盖。要做时序分析得自己存到数据库。
2. **大结果集会撑爆 Postgres**——`query_results` 表存的是整份 JSON，跑一条 100 万行的 SELECT 就是一份 100MB 的 JSON 写进 Postgres。社区的常规建议是『SQL 里加 LIMIT、可视化用聚合后的小结果』。
3. **Celery worker 数 vs 数据源连接池要对齐**——worker 开太多，每个都连 Postgres / BigQuery，把数据源那边的连接数顶爆。
4. **升级前先备份元数据库**——schema 迁移过几次大版本，回滚不容易。Docker compose 起的小团队部署经常忘这一步。
5. **数据源密码用 SECRET_KEY 加密存 Postgres**——`SECRET_KEY` 一旦丢了所有 data source 凭证全部读不出来，需要重新输入。
6. **Parameters 默认是字符串拼接**——直接拼进 SQL，没做参数化绑定。意味着如果你把 query 共享给『可执行 query』权限的用户，对方能改参数注入危险 SQL。Redash 后来加了 dropdown / number 等强类型参数缓解，但默认 Text 类型仍是裸拼接。
7. **JS Visualization 已弃用**——老版本支持自定义 JS 画图，新版禁了（XSS 风险）。看老教程提到 Custom JS Visualization 时要意识到那是 v8 之前的功能。

## 适用 vs 不适用场景

**适用**：
- 公司内部分析师 / 数据工程师写 SQL 看板——Redash 的核心场景
- 需要『一份图随时分享 URL 给非技术同事』
- 数据源杂（既有 MySQL 又有 BigQuery 又有 ES），想要统一入口
- 中小数据量（结果集 < 10 万行）的轻量 BI

**不适用**：
- 大数据量探索（结果几百万行）→ 用专业 BI（Superset 还更合适）
- 无 SQL 自助分析（业务同学拖拽出图）→ Metabase 更轻
- 实时流告警（秒级）→ Grafana + Prometheus / 专业告警系统
- 复杂多表 join 可视化建模 → Looker / Tableau 这类商业 BI

## 部署形态（怎么把它跑起来）

最常见的三种部署：

1. **Docker Compose 单机版**：仓库自带 `docker-compose.yml`，一条 `docker compose up` 起 5 个容器（server / scheduler / worker / postgres / redis），适合小团队 < 50 用户。
2. **Kubernetes Helm**：社区维护 helm chart，Web / Scheduler / Worker 各自 Deployment，用 ManagedRedis / ManagedPostgres 替换内置容器，适合中大型团队。
3. **托管服务**：被 Databricks 收购前有 redash.io 托管版，被收后整合进 Databricks SQL，原 OSS 仍可自部署。

容器之间的通信全走 Postgres + Redis，所以**水平扩 worker** 是最常见的伸缩动作（高峰期慢 query 多就多起几个 worker 容器）。

## 历史小故事（可跳过）

- **2013**：Arik Fraimovich 在以色列做内部工具时痛感『分析师每天导 CSV』，开源了 Redash 雏形
- **2015 前后**：成立同名公司，提供托管版，但仓库一直 BSD-2 开源
- **2020 年 6 月**：Databricks 收购 Redash，目标是给 Lakehouse 配一个 SQL 分析前端
- **被收购后**：原以为会停更，但 OSS 仓库继续发版（v25、v26...），社区贡献者维护

『被大公司收购后开源版本还活着』在 BI 工具里很少见——Looker 被 Google 收完闭源，Mode 被 ThoughtSpot 收完闭源，Redash 是反例。

可能的解释：Redash 已经积累了庞大的社区部署量，强行闭源会让大量用户迁去 Metabase / Superset，反而损失生态影响力。Databricks 选择『让 OSS 继续跑、把核心能力嵌进商业 SQL Analytics』，两边收益都更稳。

## 学到什么

1. **Query Runner 抽象** = 把 35+ 种数据源压成一个统一接口，是 BI 工具的核心扩展点
2. **元数据 / 结果落 Postgres，Redis 当队列 + 短缓存** = 查询文本、布局、`query_results` 在 Postgres；Redis 主要是 Celery broker，顺带缓存热结果
3. **轮询 + 缓存** 是简单有效的『近实时』方案——不用 WebSocket / 流式系统，小团队够用
4. **Dashboard 是 query 的容器**，不是独立实体——『一等公民 + 容器』在很多内部工具里通用
5. **OSS + 商业版双轨**也能共存——商业版深耕 Lakehouse 集成，OSS 守住自托管查询体验

## 与 Metabase / Superset 的快速对比

三个开源 BI 经常被一起讨论，但定位不同：

| 维度 | Redash | Metabase | Superset |
|------|--------|----------|----------|
| 主用户 | SQL 工程师 / 分析师 | 业务同事（不会 SQL） | 数据工程师 + 分析师 |
| 核心交互 | 写 SQL 出图 | 拖拽问问题 | SQL Lab + 拖拽并存 |
| 可视化丰富度 | 中 | 中 | 高（Apache 生态） |
| 数据源数 | 35+ | 25+ | 50+ |
| 学习曲线 | 会 SQL 就能用 | 几乎为零 | 较陡 |

选型经验：『团队只有几个人都会 SQL』选 Redash；『要给业务部门用』选 Metabase；『重度数据团队、要做大屏』选 Superset。

## 延伸阅读

- 仓库与 Wiki：[getredash/redash](https://github.com/getredash/redash)（README + Local development setup wiki）
- 收购公告：[Databricks Acquires Redash, June 2020](https://www.databricks.com/blog/2020/06/24/redash-joins-databricks.html)
- 同类对比：[[airflow]] —— 任务调度与 BI 调度的边界差异
- [[starrocks]] —— Redash 常用的 OLAP 后端之一
- [[doris]] —— 另一个常被接到 Redash 前端的 MPP 数据库

## 关联

- [[airflow]] —— Airflow 跑 ETL，Redash 看 ETL 出来的结果，常配套出现
- [[doris]] / [[starrocks]] —— Redash 的典型查询后端：MPP 列存数据库
- [[fastapi]] —— Redash 用 Flask，FastAPI 是同类 Python web 路线的现代选择
- [[redis]] —— Redash 用 Redis 做 Celery broker 与结果短缓存
- [[postgresql]] —— 元数据与 `query_results` 的落地点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
