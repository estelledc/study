---
title: Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
来源: https://github.com/manticoresoftware/manticoresearch
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Manticore Search 是一款用 **C++** 写的开源搜索引擎，特点是**让客户端用 MySQL 协议连进来**，同一个引擎里既做全文搜索（像 [[elasticsearch]]），又做列式分析（像 [[starrocks]]）。

日常类比：

- [[elasticsearch]] 像一台专业搜索机房——功能强、生态大、但启动慢、协议是 HTTP/JSON
- Manticore 像一台兼职工——白天跑 MySQL `SELECT` 风格的查询（你已有的代码不用改），夜里跑 OLAP 聚合，顺手再做全文搜索

它是 **Sphinx Search**（2001 年的老牌搜索引擎）2017 年的社区分支，由原核心团队 fork 出来后独立开发。今天 6.x 版本已经加上向量搜索、实时索引等新能力。

## 为什么重要

不理解 Manticore 的设计取舍，下面这些事会困惑：

1. **MySQL 协议**：你已经有 MySQL driver、有 JDBC、有 `mysql` 命令行——直接连过去就能搜，不用学 [[elasticsearch]] 的 DSL。零学习成本对接老系统
2. **搜索 + 分析合体**：传统做法要"MySQL 存事实表 + ES 做搜索 + ClickHouse/[[doris]] 做分析"三套基建。Manticore 一个引擎搞定中小规模场景
3. **官方说"比 ES 快 15 倍"**：在小数据集（百万级文档）上 Manticore 单机延迟和吞吐都明显占优。代价是生态远不如 ES
4. **Sphinx 系的延续**：很多 2010 年代用 Sphinx 做电商搜索的公司，迁移路径就是 Manticore——配置语法基本兼容

## 核心要点

Manticore 的"为什么能这样混搭"可以拆成三件事：

### 1. MySQL 协议是个兼容层，不是真 MySQL

Manticore 实现了 MySQL 的网络协议（认证握手 + 查询响应包），所以任何 MySQL 客户端都能连。但**它不是 MySQL**——背后跑的是搜索引擎自己的存储和执行器。

```sql
mysql> SELECT * FROM products WHERE MATCH('iphone case') LIMIT 10;
mysql> SELECT category, COUNT(*) FROM products GROUP BY category;
```

第一行是全文搜索（`MATCH` 是 Sphinx/Manticore 的关键字），第二行是 OLAP 聚合，**同一个连接**里都能跑。

### 2. 两种存储：行存（RT index）+ 列存（Columnar）

- **RT index**（实时索引）：行级 INSERT/UPDATE/DELETE 立刻可搜，像普通 OLTP 数据库一样灵活，但单文档大小敏感
- **Columnar**：依托 Manticore Columnar Library，分析类查询（`GROUP BY`、`SUM`、`AVG`）走列存，扫描快很多

一张表可以指定哪些字段走列存、哪些走传统行存。混合得好就既能搜又能聚合。

### 3. 倒排索引 + 向量索引（KNN）

6.x 加了 KNN 向量搜索，意味着可以做"BM25 全文打分 + 向量语义相似度"的混合检索（hybrid search）。这是 2023-2024 各家搜索引擎的标配，Manticore 跟上了。

## 实践案例

### 案例 1：电商商品搜索

商品数据本来在 MySQL。要加搜索功能，传统路径是装 ES、写同步脚本、学 ES DSL。用 Manticore 路径：

```sql
mysql -h manticore -P 9306
> CREATE TABLE products(title TEXT, price FLOAT, category STRING);
> INSERT INTO products VALUES('iphone 15 case', 19.9, 'accessory');
> SELECT * FROM products WHERE MATCH('iphone case') AND price < 30;
```

后端代码改动量约等于零——还是用同一套 MySQL driver。

### 案例 2：日志分析（搜索 + 聚合）

日志条目按天写入 Manticore。前端既要"按关键字搜某条 ERROR"，又要"按小时统计某 service 的错误数"。

```sql
SELECT level, COUNT(*) FROM logs
WHERE MATCH('timeout') AND ts > 1717200000
GROUP BY level;
```

一条 SQL 同时做了全文匹配 + 时间过滤 + 分组聚合。换成 ES 要写 `query` + `aggs` 两段 JSON。

### 案例 3：Percolate Query（反向搜索）

普通搜索是"文档已存，进来一个查询，返回匹配文档"。Percolate 是反过来：**查询先存进去，文档进来时返回它命中了哪些预存查询**。

适合舆情监控（先存好"关键词列表"，新文章进来报警）、广告匹配（先存好"投放规则"）、合规扫描（先存好"敏感词组合"，新内容进来逐条比对）。Manticore 内置 PQ 索引类型支持这种反向匹配。

### 案例 4：与 MySQL 共部署的混搭架构

电商场景常见做法：商品事实数据留在 MySQL，搜索字段（title / description / tags）双写一份到 Manticore。前端搜索请求打 Manticore（9306 端口），下单等事务请求打 MySQL（3306 端口）。两边都用同一个 driver，运维差异最小化。比起"MySQL + ES"组合，少了协议适配层，代码也少一套 SDK。

## 踩过的坑

1. **MySQL 协议是兼容层**：很多 MySQL 内置函数（如 `DATE_FORMAT`、子查询）Manticore 不支持，或语义不同。把它当 MySQL 用会踩坑——它只是借了协议
2. **RT 索引内存敏感**：实时索引把新增数据先放内存，定期落盘。文档量大、字段多时内存涨得快，要规划 `rt_mem_limit`
3. **中文分词要手动配**：默认按空格切词对中文不友好。需要配 ICU 或集成 jieba，否则搜"苹果手机"匹配不到"苹果 手机"
4. **Percolate 性能曲线**：预存查询数量到几十万级时，单文档进来的匹配开销会上升。不能无脑当缓存用
5. **生态弱**：没有 Kibana 那种成熟可视化，监控 / dashboard / 日志栈都要自己拼

## 适用 vs 不适用场景

**适用**：

- 已有 MySQL 系统想"低改造成本加全文搜索"
- 中小规模（千万级文档以内）"搜索 + 聚合"混合负载
- Sphinx 老用户迁移
- 需要单二进制 / 单容器部署，不想运维 ES 集群

**不适用**：

- 海量日志检索（PB 级、跨数据中心）→ 还是 [[elasticsearch]] / [[opensearch]] 生态成熟
- 重度 OLAP 分析（复杂多表 JOIN、星型建模）→ [[starrocks]] / [[doris]] / ClickHouse 更专业
- 需要 Kibana / Logstash 等成熟工具栈 → ES 系
- 极简文档站搜索（不需要聚合、不需要 OLAP）→ [[meilisearch]] / [[minisearch]] 更轻

## 历史小故事（可跳过）

- **2001 年**：俄罗斯程序员 Andrew Aksyonoff 写了第一版 **Sphinx**——专门给 MySQL 加全文搜索的引擎，曾是 2000 年代电商搜索的事实标准
- **2017 年**：Sphinx 项目由于许可证收紧、社区方向分歧，原核心贡献者 fork 出来成立 **Manticore Software**，保留开源精神，独立演进
- **2020 年代**：加入 RT 索引、Columnar Library、KNN 向量搜索——从"Sphinx 改良版"变成完整的搜索 + 分析平台
- 同期老 Sphinx 项目活跃度下降，Manticore 成为 Sphinx 系的事实接班人

## 学到什么

1. **协议复用是降低迁移成本的杀手锏**——选用 MySQL wire protocol，让"用 ES 要改全栈"变成"换个连接串"。这一思路在数据库领域反复出现：Postgres 协议被 CockroachDB / YugabyteDB 复用，MySQL 协议被 [[doris]] / Manticore 复用
2. **行存 + 列存混合**是搜索引擎走向"搜索 + 分析"的通用思路（[[doris]] / [[starrocks]] 也是类似）。一张表内不同字段不同存储格式，按查询模式自动切换
3. **fork 不一定是分裂**——2017 的分叉让 Sphinx 系延续了下来，验证了"原班人马 + 开源治理"的活力；类似剧情见 OpenSearch fork ES、MariaDB fork MySQL
4. **OLAP 与全文搜索的边界在模糊**：传统认为是两类系统，Manticore / [[elasticsearch]] 都在向对方靠拢。未来"搜索引擎"和"分析数据库"可能会逐渐合并成同一类基础设施
5. **小而专的引擎仍有空间**——在 ES 占据巨头位置的市场里，Manticore 用"轻量 + 兼容老协议"找到差异化定位

## 延伸阅读

- 官网：[manticoresearch.com](https://manticoresearch.com/)
- GitHub：[manticoresoftware/manticoresearch](https://github.com/manticoresoftware/manticoresearch)
- 与 ES 对比基准：官方 [Manticore vs Elasticsearch](https://manticoresearch.com/blog/manticore-search-vs-elasticsearch/)（注意是引擎方自测，谨慎参考）
- 官方文档（Real-Time Index）：理解 RT 与传统 plain index 区别的入门必读
- Sphinx 的历史回顾：搜索引擎 2000 年代脉络中 Sphinx 占的位置
- [[elasticsearch]] —— 主流大型搜索引擎，对照学习
- [[meilisearch]] —— 轻量级开发者优先搜索引擎
- [[opensearch]] —— ES 7.x fork 出的开源版本

## 关联

- [[elasticsearch]] —— 大型工业搜索机房，与 Manticore 是同类不同流派
- [[meilisearch]] —— 极简搜索引擎，定位互补（Manticore 偏分析，Meili 偏前端体验）
- [[opensearch]] —— ES fork 出的开源版本，与 Manticore 都属于"避开 ES 许可证"的选择
- [[starrocks]] —— MPP 列存数据库，与 Manticore 在 OLAP 维度交集
- [[doris]] —— Apache Doris，同样支持 MySQL 协议的 OLAP 引擎，可对照"协议复用"这一思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[doris]] —— Apache Doris — MySQL 协议 MPP OLAP 数据库
- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[minisearch]] —— minisearch — 浏览器里的小型全文搜索引擎
- [[starrocks]] —— StarRocks — MPP 列存数据库

