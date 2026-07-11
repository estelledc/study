---
title: Vitess — 给 MySQL 装上水平分片的代理层
来源: 'https://github.com/vitessio/vitess'
日期: 2026-05-31
分类: 数据库
难度: 中级
---

## 是什么

Vitess 是一套**让一群 MySQL 看起来像一台无限大 MySQL** 的中间件。日常类比：你家里装了一台冰箱（MySQL），东西多了塞不下，于是你雇了个管家（vtgate）专门帮你"放进哪台冰箱、从哪台拿出来"，外人看着以为还是一台。

它由 YouTube 在 2010 年内部做出来，2012 年开源，2018 年成为 CNCF 第 8 个毕业项目（前面是 Kubernetes、Prometheus、Envoy 等）。生产用户：Slack、Square、GitHub、Shopify、HubSpot、PlanetScale。

```
应用 → vtgate（代理）→ vttablet（边车）→ mysqld（真正的 MySQL）
                ↓
           topology（etcd/ZK 存元数据）
```

应用用普通 MySQL 协议连 vtgate，写 SQL 完全不变；vtgate 内部根据**分片键**把 SQL 路由到对应的 mysqld，跨分片 SQL 自动 scatter-gather（分发再合并）。这种"代理 + 边车 + 元数据中心"的三件套，后来在 Envoy / Istio 等微服务中间件里也能看到影子。

## 为什么重要

- **MySQL 单机扛不住几十亿行**——加从库只能扩读不能扩写，Vitess 把"水平分片"做成了能直接套上去的标准件
- **应用基本不改代码**——这是 Vitess 与 ShardingSphere、Citus 等竞品最大的区分点
- **CNCF 毕业 + 大厂背书**——证明"加代理层 + 元数据中心"是分片方案的工业级答案
- **是云原生数据库 SaaS 的前身**——PlanetScale 的核心就是 Vitess，Serverless MySQL 那一套都从这里发源

## 核心要点

Vitess 架构由**四块**拼起来：

1. **vtgate（无状态查询路由）**：接 MySQL 协议，把 SQL 解析成执行树，按分片键路由。类比：餐厅前台的领位员，看你要点什么菜决定带你去哪个后厨
2. **vttablet（每 mysqld 一个边车进程）**：连接池、查询缓存、健康检查、binlog 流。类比：每台后厨派一个传菜员，前台只跟传菜员打交道
3. **topology（etcd/ZooKeeper/consul）**：存"哪些 keyspace 有哪些 shard、哪些 tablet 现在是 master/replica"。类比：餐厅老板手里那张"今天哪个厨师在哪个灶台"的排班表
4. **VReplication（基于 binlog 的复制流引擎）**：reshard / 跨 keyspace 迁移 / 主从切换都靠它。类比：传送带，能把数据边流边重新分桶

`vschema.json` 是用户视角的"分片配置"，声明每张表用哪一列做分片键、用哪种 **vindex**（分片函数）。最常见两种：`hash`（把分片键打散到各 shard，像把快递按邮编分仓）和 `lookup`（另建一张索引表反查"这个值在哪个 shard"）。按表选不同 vindex，分片策略就能定制。

## 实践案例

### 案例 1：vschema 怎么声明分片

```json
{
  "sharded": true,
  "vindexes": {
    "hash": { "type": "hash" }
  },
  "tables": {
    "users": {
      "column_vindexes": [
        { "column": "user_id", "name": "hash" }
      ]
    }
  }
}
```

读法：`users` 表按 `user_id` 列做哈希分片。`hash` 是 Vitess 内置的 vindex（分片函数），把 `user_id` 散到 N 个 shard。应用写 `INSERT INTO users(user_id, name) VALUES(42, 'a')`，vtgate 算出 42 落在哪个 shard，转发过去。

### 案例 2：应用看到的还是普通 MySQL

```python
import pymysql
conn = pymysql.connect(host='vtgate.local', port=15306, user='vt', db='commerce')
cur = conn.cursor()
cur.execute("SELECT name FROM users WHERE user_id = 42")
print(cur.fetchone())
```

应用代码**和连普通 MySQL 完全一样**。连接对象指向 vtgate（不是 mysqld）。SELECT 命中 `user_id = 42` 时 vtgate 直接路由到一个 shard；如果写的是 `WHERE name = 'a'`（没带分片键），vtgate 退化成 **scatter-gather**——同时查所有 shard 再合并，性能掉一截。

### 案例 3：在线 reshard 不停机

前置：集群已跑着、`commerce` 的 vschema 已 Apply，源 shard 健康。目标是把 `users` 从 2 个 shard 扩到 4 个：

```bash
# 1) 建 workflow：按新分片规则开 VReplication 管道
vtctldclient Reshard --workflow=split commerce --source_shards=0,1 --target_shards=0,1,2,3
# 2) 等复制追上（VDiff 可校验源/目标一致）后再切读
vtctldclient SwitchTraffic --workflow=split --tablet_types=rdonly,replica
# 3) 最后切写；应用仍连 vtgate，SQL 不用改
vtctldclient SwitchTraffic --workflow=split --tablet_types=primary
```

**逐步读**：步骤 1 只开管道不切流量；步骤 2 先把只读流量挪到新 shard；步骤 3 再切主写。底层是读源端 binlog → 改写后写入目标，把 MySQL 复制变成可重路由的数据管道。耗时几小时到几天，取决于数据量——这是 Vitess 最难复现的能力。

## 踩过的坑

1. **跨分片事务不是真分布式事务**——默认 best-effort 2PC（两阶段提交），协调器挂掉会留半提交，需要应用层做幂等兜底
2. **vschema 改分片键 = 一次重大手术**——VReplication 跑数小时到数天，期间双写流量切换很容易踩到边界
3. **复杂 SQL 在分片下会碰壁**——解析大多能过，但跨 shard 的子查询 / 复杂 JOIN 常被拒绝或退化成 scatter-gather，p99 直接崩
4. **topology 抖动 = 全集群路由失效**——etcd/ZK 一卡，vtgate 就找不到 master，可用性上限受元数据中心拖累
5. **运维曲线陡**——出问题要同时会看 mysqld 慢查询、vttablet 连接池、vtgate 路由日志、topology 元数据四层
6. **schema 变更要走 OnlineDDL**——直接 ALTER 大表会卡死单 shard，必须用 Vitess 内置的 gh-ost 风格在线 DDL

## 适用 vs 不适用场景

**适用**：

- 已经在用 MySQL 且写入接近单机上限（约数万～十万 QPS，或单表 TB 级）
- 团队希望"分片"对应用透明，不想重写 ORM
- 需要在线 reshard / 不停机迁移的能力
- 跑在 K8s 上，希望分片层也能容器化（Vitess Operator 成熟）

**不适用**：

- 单机 MySQL 完全够用——加 Vitess 反而引入 vtgate + topology 两层故障点
- 需要真正的全局分布式事务 → 直接选 [[cockroachdb-2020]] / [[spanner-2012]] / [[tidb-2020]]
- 团队不熟 MySQL 运维 —— Vitess 出问题要同时会看 mysqld + vttablet + topology 三层日志
- 多模数据库需求（图 / 文档 / 时序）——Vitess 只管 MySQL

## 历史小故事（可跳过）

- **2010 年**：YouTube 工程师 Sugu Sougoumarane、Mike Solomon、Anthony Yeh 在内部启动，目标解决 MySQL 写入扩容
- **2012 年**：Google 把 Vitess 开源到 GitHub
- **2018 年**：成为 CNCF 第 8 个毕业项目（在 Kubernetes、Prometheus、Envoy、CoreDNS、containerd、Fluentd、Jaeger 之后）
- **2019 年**：GitHub 完成 MySQL → Vitess 迁移并写出长篇技术博客
- **2020 年起**：PlanetScale 把 Vitess 包装成 Serverless MySQL SaaS，让"分片"变成一键开关
- **2022 年**：v14 起 VReplication 支持 MoveTables 跨 keyspace 迁移，扩展为"任意拓扑变更"通用引擎
- **2024 年起**：继续推内置拓扑等"自包含"试验，减少对外置 etcd/ZK 的硬依赖
- **现在**：主线仍在活跃演进，仍是云原生 MySQL 分片的事实标准

## 学到什么

1. **分片不一定要重写应用**——加一层协议兼容代理（vtgate），让分片对客户端透明，是工程上最省事的路径
2. **元数据中心是分布式数据库的脊梁**——topology 抖一下整个集群就路由不出去；选型时元数据可用性 = 整体上限
3. **在线 reshard 是 Vitess 的护城河**——其他中间件多数要停机，VReplication 把 binlog 流当成可重路由的数据管道
4. **CNCF 毕业不等于易用**——Vitess 上手成本高，但解决的问题（MySQL 水平扩展）足够刚需，仍是首选
5. **代理 + 边车 + 元数据中心** 这套结构具有普适性——后来的服务网格（Envoy/Istio）和大模型推理路由（vLLM router）几乎照搬

## 延伸阅读

- 官网：[vitess.io](https://vitess.io)
- 仓库：[vitessio/vitess](https://github.com/vitessio/vitess)
- 入门文档：[Vitess Docs — Get Started](https://vitess.io/docs/get-started/)
- GitHub 迁移博客：[Partitioning GitHub's relational databases to handle scale](https://github.blog/2021-09-27-partitioning-githubs-relational-databases-scale/)
- 视频：[Vitess: The Data Plane Behind Slack and Square (CNCF KubeCon 2019)](https://www.youtube.com/results?search_query=vitess+kubecon)
- 论文级背景：[[spanner-2012]] / [[f1-2013]] —— Google 的"超大规模 SQL"另一支技术路线对照看

## 关联

- [[mysql-server]] —— Vitess 的承载底座，每个 shard 还是一台原生 mysqld
- [[tidb-2020]] —— 同样是 MySQL 协议兼容的分片方案，但底层是 RocksDB+Raft 不是 MySQL
- [[cockroachdb-2020]] —— "原生分布式 SQL"路线，和 Vitess "代理 + MySQL"路线对照
- [[spanner-2012]] —— Google 的全球分布式 SQL 始祖，Vitess 是 YouTube 内部的"穷人版"
- [[f1-2013]] —— 同样是 Google 在 Spanner 之上的 SQL 层，与 Vitess 思想接近但是托管 Spanner 而不是 MySQL
- [[kubernetes]] —— Vitess Operator 让分片层也能 K8s 原生部署
- [[consistent-hashing-1997]] —— vindex 的 hash 类型本质是一致性哈希思想

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
