---
title: Dgraph — 分布式图数据库
来源: https://github.com/hypermodeinc/dgraph
日期: 2026-05-29
分类: 数据库 / 图
难度: 中级
---

## 是什么

Dgraph 是一个**原生分布式图数据库**——专门用来存"东西之间的关系"，而且天生支持多机部署。Manish Jain（前 Google 工程师）2016 年用 Go 写的开源项目，许可证是 Apache 2.0。

日常类比：

- [[postgresql]] 像 Excel 表——有行有列，数据按表格摆，跨表查要 JOIN
- Dgraph 像一张关系网——每个东西是节点，关系是连线，"Alice 的朋友的朋友"直接顺着线走过去就行

举个直观例子。查"Alice 的朋友的朋友的朋友"（社交网络三度人脉）：PostgreSQL 要写三次 self-join，数据量大时性能急剧下降；Dgraph 顺着 `friend` 边走三步，几毫秒返回。

## 为什么重要

不理解 Dgraph 这一类图数据库，下面这些事都没法解释：

- 为什么 LinkedIn / Facebook 不用 PostgreSQL 存社交关系——三度人脉的 SQL 查询能让数据库跪下
- 为什么知识图谱（Google Knowledge Graph、维基数据）天生需要图模型——实体关系本身就是图
- 为什么"推荐系统"喜欢图数据库——"和你看过同一部电影的人还看了什么"是图遍历问题
- 图数据库领域为什么会形成 Neo4j vs Dgraph 两强：Neo4j 单机起家、走 Cypher 查询语言；Dgraph 分布式起家、直接用 GraphQL 当查询语言

## 核心要点

Dgraph 的设计可以拆成 **三块**：

### 1. 数据模型：RDF 三元组

每条数据都是一个"主语 - 谓语 - 宾语"的三元组。读起来像句子：

```
_:alice <name> "Alice"     // alice 的名字 是 "Alice"
_:alice <friend> _:bob     // alice 的朋友 是 bob
_:bob <age> "30"           // bob 的年龄 是 30
```

`_:alice` 是一个内部 ID 占位符，`<name>` 和 `<friend>` 是**谓词**（predicate），右边是值或另一个节点。

类比：朋友圈的"动态" = 一条三元组，"谁 / 做了什么 / 对什么"。

### 2. 查询语言：DQL（Dgraph Query Language）

DQL 是 GraphQL 的增强版本——长得像 GraphQL，但支持图遍历、过滤、聚合。

```graphql
query {
  me(func: eq(name, "Alice")) {
    name
    friend {
      name
      friend {
        name
      }
    }
  }
}
```

读法：找名字等于 "Alice" 的节点 → 列出它的朋友 → 再列出朋友的朋友。**没有 JOIN**，直接顺着边走。

### 3. 分布式架构：按 Predicate 分片 + Raft 共识

- **分片单位**：不是按"行"分，而是按**谓词**分。比如所有 `<friend>` 边放在一个组，所有 `<name>` 放另一个组
- **共识**：每个分组（group）由 3 个节点组成 Raft 集群，保证写入强一致
- **协调器**：Zero 节点负责分配 ID、做负载均衡

为什么这么设计？因为图查询往往沿着同一种边走（"找朋友的朋友"全是 `<friend>` 边），把同类边放一起 = 单机就能查完一段，少跨网络。

## 实践案例

### 案例 1：Docker 起一个 Dgraph 集群

```yaml
# docker-compose.yml
services:
  dgraph:
    image: dgraph/standalone:latest
    ports:
      - "8080:8080"   # HTTP / GraphQL 端口
      - "9080:9080"   # gRPC 端口
```

```bash
docker compose up -d dgraph
```

浏览器打开 `http://localhost:8080` 就有个叫 Ratel 的可视化界面（类似 PostgreSQL 的 pgAdmin）。

### 案例 2：写入数据（mutation）

```graphql
mutation {
  set {
    _:alice <name> "Alice" .
    _:alice <age> "28" .
    _:bob <name> "Bob" .
    _:alice <friend> _:bob .
  }
}
```

执行后：Alice 和 Bob 两个节点诞生，Alice → Bob 之间有一条 `<friend>` 边。**注意行末的点号**——这是 RDF 语法要求。

### 案例 3：查询朋友的朋友

```graphql
query {
  me(func: eq(name, "Alice")) {
    name
    friend {
      name
      friend {
        name
      }
    }
  }
}
```

返回 JSON：

```json
{
  "data": {
    "me": [{
      "name": "Alice",
      "friend": [{
        "name": "Bob",
        "friend": [{ "name": "Carol" }]
      }]
    }]
  }
}
```

如果用 PostgreSQL 实现同样查询，需要写两层 self-join，并且 Alice 朋友很多时性能直线下降。

## 踩过的坑

1. **Schema 改动需要 alter 操作**：直接 mutation 加新字段会报错，要先发 alter 请求声明 schema。schema 文件长这样：

   ```
   name: string @index(exact) .
   friend: [uid] @reverse .
   ```

   `@index(exact)` 让 `eq(name, ...)` 能走索引；`@reverse` 让"谁是 Alice 的朋友"反向查询能走

2. **大批量导入用 live loader**：写百万条数据时不要循环发 mutation——单条 mutation 走的是事务路径，慢。用 `dgraph live` 命令导入 RDF 文件，速度 10x+

3. **Predicate 数量过多影响分片均衡**：如果谓词太多（比如几千个），按 predicate 分片会导致某些组节点空闲、某些组爆满。设计 schema 时尽量复用谓词

4. **2024 年被 Hypermode 收购**：Dgraph Labs 公司被 Hypermode 收购，仓库从 `dgraph-io/dgraph` 迁到 `hypermodeinc/dgraph`。许可证目前还是 Apache 2.0，但商业策略可能调整——选型时关注

## 适用 vs 不适用场景

**适用**：社交网络、知识图谱、推荐系统、反欺诈（账号-设备-IP 关系网络）

**不适用**：

- 简单 OLTP → [[postgresql]] 更合适
- 全文搜索 → 用 Elasticsearch
- 数据规模小（< 100 万节点）→ PostgreSQL + 递归 CTE 也够用

## 历史小故事（可跳过）

- **2015-16**：Manish Jain 离开 Google 创立 Dgraph Labs，开源 v0.1
- **2018-2020**：v1.0 生产可用；版本号改用年份命名（v20.03 起）
- **2024**：被 Hypermode 收购，仓库迁到 `hypermodeinc/dgraph`

Neo4j 是图数据库老大哥（2007，单机+Cypher）；Dgraph 主打"分布式+GraphQL+全开源"两条路线各占市场。

## 学到什么

1. **数据模型决定查询效率**：朋友的朋友—关系模型 JOIN 三次，图模型走三步边
2. **GraphQL 不止是 API 协议**：Dgraph 当查询语言用；分片策略贴近查询模式

## 延伸阅读

- 官方文档：[Dgraph Docs](https://dgraph.io/docs)；[[postgresql]] / [[chroma]] —— 两种"特化数据库"对照

## 关联

- [[postgresql]] —— 关系模型代表，与图模型形成对比
- [[chroma]] —— 同属特化数据库路线（向量 vs 图）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[graphology]] —— Graphology — 浏览器里的图数据结构与算法库
- [[janusgraph]] —— JanusGraph — 可插拔后端的分布式图数据库
- [[kuzu]] —— Kùzu — 把图数据库做成 DuckDB
- [[nebula]] —— NebulaGraph — 国产分布式图数据库
- [[pebble]] —— Pebble — CockroachDB 自研 LSM
