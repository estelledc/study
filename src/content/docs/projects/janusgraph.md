---
title: JanusGraph — 可插拔后端的分布式图数据库
来源: https://github.com/JanusGraph/janusgraph
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

JanusGraph 是一个**分布式图数据库框架**——它本身不存数据，而是把"图模型 + 查询语言"这一层做好，把"真正存字节"的活外包给 [[cassandra]] / HBase / BerkeleyDB 这些成熟的存储引擎。Linux Foundation 2017 年从已停滞的 Titan 项目 fork 出来，IBM / Google / Hortonworks 联合维护，许可证 Apache 2.0，Java 写的。

日常类比：

- [[neo4j]] 像一家自营餐厅——食材采购、烹饪、服务全自己来，控制力强但要全套基础设施
- JanusGraph 像一家连锁餐厅总部——只设计菜单（图模型）和点菜流程（Gremlin 查询），具体哪家分店用什么厨房（Cassandra？HBase？）由你挑

举个直观例子。同样要存 10 亿个节点的社交关系，公司 A 已经在用 Cassandra 集群 → 直接接 JanusGraph，复用现有运维和容量；公司 B 用 HBase → 一样接 JanusGraph，换一个配置就行。**底层换了，上层 Gremlin 查询代码一行不动**。

## 为什么重要

不理解 JanusGraph 这一类"中间层图数据库"，下面这些事都没法解释：

- 为什么 IBM Watson Discovery / eBay 商品图选 JanusGraph 而不是 [[neo4j]]——它们已经有 Cassandra/HBase 集群
- 为什么 Gremlin 是图查询的事实标准（类似 SQL 之于关系库），跨越 Neo4j/JanusGraph/AWS Neptune/Azure Cosmos DB
- 为什么"可插拔后端"是一种常见架构模式——和 [[airflow]] 的 Executor、[[fastapi]] 的 ASGI server 一样，把"语义"和"基础设施"解耦
- 图数据库领域的三条路线：Neo4j（自建存储 + Cypher）/ [[dgraph]]（自研分布式 + GraphQL）/ JanusGraph（复用 KV 存储 + Gremlin）

## 核心要点

JanusGraph 的设计可以拆成 **三块**：

### 1. 数据模型：属性图（property graph）

节点和边都能挂"键值对"属性。比 RDF 三元组更直观。

```
节点 alice: {name: "Alice", age: 28}
节点 bob:   {name: "Bob",   age: 30}
边   alice -[friend, since: 2020]-> bob
```

类比：朋友圈的"用户主页"——用户本身有头像、昵称、生日（节点属性），加好友这件事还能记"什么时候加的""备注名"（边属性）。

### 2. 查询语言：Gremlin（TinkerPop 标准）

Gremlin 是 Apache TinkerPop 项目定的图遍历语言，长得像方法链：

```groovy
// 找 Alice 的朋友的朋友的名字
g.V().has("name", "Alice")
     .out("friend")
     .out("friend")
     .values("name")
```

读法：从所有节点 `V()` 开始 → 筛选 name=Alice → 顺着 `friend` 出边走一步 → 再走一步 → 取 name 属性。**每一步都是流水线**，像 Linux pipe。

### 3. 存储后端可插拔：图模型 → KV 翻译层

JanusGraph 不自己存数据，把"节点和边"翻译成 **rowkey + column** 的 KV 格式存到底层：

| 后端 | 适合场景 |
|------|---------|
| [[cassandra]] / ScyllaDB | 写多读多、需要跨数据中心 |
| HBase | 已有 Hadoop 生态、强一致 |
| BerkeleyDB | 单机开发测试 |
| FoundationDB | 需要 ACID 多键事务 |

为什么这么设计？图查询的核心是"顺着边走"，本质是 **按 rowkey 范围扫描**——KV 存储天然擅长这个。复用 Cassandra 已经解决的"复制 / 分区 / 故障恢复"，JanusGraph 只管图语义。

## 实践案例

### 案例 1：Docker 起一个 JanusGraph + Cassandra 组合

```yaml
# docker-compose.yml
services:
  janusgraph:
    image: janusgraph/janusgraph:1.0.0
    environment:
      janusgraph.storage.backend: cql
      janusgraph.storage.hostname: cassandra
    ports:
      - "8182:8182"   # Gremlin Server 端口
    depends_on:
      - cassandra
  cassandra:
    image: cassandra:4
```

```bash
docker compose up -d
```

启动后 Gremlin Server 在 8182 端口。任何 TinkerPop 客户端（Python gremlinpython / Java / Groovy）都能连。

### 案例 2：写入数据

```groovy
// 在 Gremlin Console 里
g = traversal().withRemote("conf/remote-graph.properties")

alice = g.addV("person").property("name", "Alice").property("age", 28).next()
bob   = g.addV("person").property("name", "Bob").property("age", 30).next()
g.V(alice).addE("friend").to(__.V(bob)).property("since", 2020).iterate()
```

执行后：Cassandra 里多了几行数据，但你看不到 SQL 表——JanusGraph 把这些 KV 行翻译成"两个节点、一条 friend 边"。

### 案例 3：查询朋友的朋友

```groovy
g.V().has("person", "name", "Alice")
     .out("friend").out("friend")
     .values("name")
     .toList()
// => ["Carol", "Dave"]
```

如果用关系库实现同样查询，需要两层 self-join，并且数据量大时退化严重；JanusGraph 顺着 `friend` 边走两步即可。

## 踩过的坑

1. **后端选错性能差 10 倍**：BerkeleyDB 只适合开发测试（单机、单线程友好），生产环境用 Cassandra / HBase / ScyllaDB。新人常拿 BerkeleyDB 做压测得出"JanusGraph 慢"的错误结论

2. **Schema 必须先声明再用**：直接写 `addV("person").property("foo", 1)` 会自动建 schema，但生产环境推荐先用 `mgmt.makePropertyKey("foo").dataType(Integer.class).make()` 显式声明，否则后期改类型会很痛苦

3. **没建索引就 `g.V().has(...)` 是全图扫**：默认遍历全图，10 亿节点会跑死。要用 `mgmt.buildIndex("byName", Vertex.class).addKey(name).buildCompositeIndex()` 建组合索引，或挂 Elasticsearch / Solr 做全文索引

4. **Titan 时代的代码不能直接用**：包名从 `com.thinkaurelius.titan` 改到 `org.janusgraph`，配置项前缀也变了。从 Titan 迁移要走文档里的 migration guide

5. **Gremlin 学习曲线比 Cypher 陡**：方法链式 + 命令式风格，不像 SQL/Cypher 那样声明式。新人前两周经常写出"看起来对但跑不动"的查询——不熟悉 `__`（匿名遍历）和 `match` 模式

## 适用 vs 不适用场景

**适用**：

- 已有 Cassandra / HBase 集群，想加图能力
- 数据量超过单机（10 亿节点以上）
- 需要 Gremlin 标准（团队会其他 TinkerPop 系产品）
- 知识图谱、反欺诈、推荐系统、网络拓扑

**不适用**：

- 单机数据量小（< 1 亿节点）→ [[neo4j]] 性能更好、运维更简单
- 不想运维分布式存储 → 选 [[neo4j]] 或 [[dgraph]]（自带集群）
- 团队只熟 GraphQL/DQL → 选 [[dgraph]]
- 简单 OLTP → 关系库 + 递归 CTE 就够

## 历史小故事（可跳过）

- **2012 年**：Aurelius 公司发布 Titan，第一个支持 Cassandra/HBase 后端的分布式图数据库
- **2015 年**：Aurelius 被 DataStax（Cassandra 商业公司）收购，Titan 开发停滞，社区焦虑
- **2017 年**：Linux Foundation 接手，从 Titan 1.0 fork 出 JanusGraph 0.1。IBM、Google、Hortonworks、Expero 联合维护，社区治理透明
- **2020 年起**：稳定迭代，0.6 / 1.0 版本相继发布，成为开源分布式图数据库的主流选项之一

为什么强调这段历史？因为它说明**开源项目治理结构会决定生死**——Titan 被单一公司控股就停滞，JanusGraph 转到中立基金会就活下来。选型时这是隐性风险。

## 学到什么

1. **可插拔架构是把"语义"和"基础设施"解耦**——JanusGraph 复用 Cassandra/HBase 的复制和分区，只做图语义。这种模式在 [[airflow]]、[[fastapi]] 都能看到
2. **图查询本质是 KV 范围扫描**——为什么 KV 存储能当图后端？因为顺着边走 = 按 rowkey 前缀扫描
3. **标准化的查询语言比方言重要**——Gremlin 跨多个图数据库，让团队技能可迁移
4. **开源项目的治理结构是隐性风险**——单公司控股 vs 基金会托管，对长期可持续性影响很大

## 延伸阅读

- 官方文档：[JanusGraph Docs](https://docs.janusgraph.org/)
- TinkerPop / Gremlin：[Apache TinkerPop](https://tinkerpop.apache.org/)
- [[cassandra]] —— JanusGraph 最常用的存储后端
- [[neo4j]] —— 单机图数据库代表，与 JanusGraph 形成对比
- [[dgraph]] —— 自研分布式图数据库，另一条技术路线

## 关联

- [[cassandra]] —— 主流后端，理解它就理解了 JanusGraph 的存储层
- [[neo4j]] —— 同领域不同路线（自营 vs 外包存储）
- [[dgraph]] —— 同领域不同路线（GraphQL vs Gremlin）
- [[airflow]] —— 同样的"可插拔后端"架构思想（Executor 抽象）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dgraph]] —— Dgraph — 分布式图数据库
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[graphology]] —— Graphology — 浏览器里的图数据结构与算法库
- [[kuzu]] —— Kùzu — 把图数据库做成 DuckDB
- [[memgraph]] —— Memgraph — 内存图数据库
- [[neo4j]] —— Neo4j — 主流图数据库

