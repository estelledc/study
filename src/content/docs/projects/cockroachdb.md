---
title: CockroachDB — 分布式 SQL 数据库
来源: https://github.com/cockroachdb/cockroach
日期: 2026-05-29
分类: 数据库 / 分布式
难度: 中级
---

## 是什么

CockroachDB 是一个**开源的分布式 SQL 数据库**——你写的是普通 SQL，它在背后帮你把数据存在多台机器上，挂掉一台也不影响读写。

日常类比：[[postgresql]] 像一家**单机医院**——所有病历都在一个柜子，柜子坏了今天就停诊；CockroachDB 像**连锁医院**——任何一家分院都能查到你的病历，关掉一家其他还在转。

它是 Google [[spanner]] 论文的开源实现思路：用 SQL 接口、跨多机/多区域强一致性事务、自动 sharding。名字取自蟑螂（cockroach）——"打不死"的隐喻。

## 为什么重要

不理解 CockroachDB，下面这些事很难解释：

- 为什么 2014 年之后会冒出"NewSQL"这一类——既要 SQL 的好用、又要 NoSQL 的横向扩展
- 为什么有些公司（Netflix / DoorDash / DigitalOcean）愿意把核心交易系统从 [[postgresql]] 迁到 CockroachDB
- 分布式数据库不靠 Google 私有的 TrueTime 硬件，怎么保证全球强一致
- 为什么"分布式 SQL"和"分库分表中间件"看起来像，本质完全不同

它和 TiDB / YugabyteDB 是分布式 SQL 的"三足鼎立"。三家都借鉴了 [[spanner]]，但实现路径不同。

## 核心要点

CockroachDB 的设计可以拆成 **三层**：

1. **SQL 层**——前台门面。兼容 PostgreSQL 协议，所以 PG 的驱动、ORM、客户端工具直接能用。这层把 SQL 翻译成更底层的"读 key / 写 key"操作。

2. **KV 层**——把整个数据库看成一个巨大的有序键值表。SQL 里 `users` 表的每一行，会变成 `/users/<主键>` 这种 key。整张表按 key 范围切成多段，每段叫 **Range**（默认 512MB）。

3. **Raft 层**——每个 Range 都有 3 个副本（默认）放在不同机器上，靠 [[raft]] 共识算法保证副本同步。任意一台机器宕机，剩下两个副本还能继续读写。

时钟是另一个关键：[[spanner]] 用 GPS + 原子钟硬件（TrueTime）保证全球时序；CockroachDB 用 **HLC（Hybrid Logical Clock）**——逻辑时钟 + 物理时钟混合，软件实现，普通服务器就能跑。代价是事务延迟略高于 Spanner。

## 实践案例

### 案例 1：本地起一个单节点跑起来

```bash
# 安装（macOS）
brew install cockroachdb/tap/cockroach

# 起单节点（开发用）
cockroach start-single-node --insecure --listen-addr=localhost

# 进 SQL shell（另一个终端）
cockroach sql --insecure
```

进去之后基本和 [[postgresql]] 一样：

```sql
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email STRING NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO users (email) VALUES ('alice@example.com');
SELECT * FROM users;
```

PostgreSQL 协议兼容意味着：`psql`、JDBC 驱动、Prisma、SQLAlchemy 直接连，应用层基本不用改代码。

### 案例 2：跨区域部署的"位置约束"

CockroachDB 的卖点是多区域。可以让某张表的副本固定在指定地区：

```sql
ALTER TABLE users CONFIGURE ZONE USING
  num_replicas = 3,
  constraints = '{+region=us-east: 1, +region=us-west: 1, +region=eu-west: 1}';
```

读这段：`users` 表有 3 个副本，分别强制放在美东、美西、欧西。任何一个区域整体宕机，其他两个副本还在，事务继续走。

### 案例 3：写延迟从哪来

跨区域强一致是有代价的。一次写要走 [[raft]]：

1. 客户端发写到 leader（假设在美东）
2. leader 把日志发给 follower（美西、欧西）
3. 等到至少 1 个 follower 确认（多数派 = 2 个，leader 自己算 1 个）
4. 提交，回客户端

如果客户端在美东、最近的 follower 在美西（往返 70ms），整个写至少要 70ms。这是分布式 SQL 的物理下限——光速决定的。

## 踩过的坑

1. **写延迟有物理下限**：每个跨区域事务都要 2 阶段提交（2PC）+ Raft 多数派，延迟 ≥ 跨区往返。本地数据库 1ms 的写，到这里可能 50-100ms。所以适合"读多写少 + 延迟容忍"的场景，不适合超低延迟交易系统。

2. **JOIN 优化器不如 PG 成熟**：基础查询没问题，复杂多表 JOIN 的执行计划有时不如 [[postgresql]] 的 planner。生产前要 `EXPLAIN ANALYZE` 验关键查询。

3. **2019 年 BSL、2024 年自托管许可再收紧**：CockroachDB 19.2 起从 Apache 2.0 转到 BSL，主要限制云厂商把它直接包装成商业 DBaaS；24.3 起自托管大客户进入 CockroachDB Software License / Enterprise 模式。选型时别只看旧 README，要按当前版本、收入规模和部署方式核对许可。

4. **DDL 不阻塞读但要 staged**：改表结构（`ALTER TABLE`）的机制和 PG 不同——CockroachDB 把 schema 改动拆成多步、慢慢推开，不锁全表。好处是不停服改表，坏处是 DDL 完成时间不确定，迁移脚本要等。

5. **Range split 抖动**：Range 满 512MB 自动切分。流量集中写某个 key 范围（比如时间戳递增的日志表）会导致单个 Range 反复 split + 数据搬迁，性能毛刺。解决：主键设计避免热点（比如 hash 前缀）。

## 适用 vs 不适用场景

**适用**：
- 跨区域 / 全球部署的 OLTP（在线交易）
- 需要"挂掉一台机器/一个数据中心继续转"的高可用核心系统
- 已经在用 [[postgresql]]、想横向扩展但不想换 SQL 思维
- 多租户 SaaS（用 zone 把不同客户数据钉在不同区域，满足合规）

**不适用**：
- 超低延迟交易（< 10ms 写）→ 用单机 [[postgresql]] / Redis
- 重 OLAP / 数据仓库 → 用 [[clickhouse]] / Snowflake
- 流量很小、单机够用 → 直接 PostgreSQL，分布式带来的复杂度不值
- 强依赖 PG 高级特性（某些扩展、某些函数）→ CockroachDB 兼容性虽高但不是 100%

## 历史小故事（可跳过）

- **2014 年**：3 名 ex-Google 工程师（Spencer Kimball、Peter Mattis、Ben Darnell）创办 Cockroach Labs，目标"做一个开源版的 [[spanner]]"——他们在 Google 用过 Spanner，知道这是未来。
- **2015 年**：开源第一版，名字"Cockroach"取自蟑螂——核灾难都打不死的隐喻，对应"挂多少台都能恢复"的设计。
- **2017 年**：1.0 GA 发布。
- **2019 年**：Series C 融资后继续扩张；同年宣布 19.2 起采用 BSL，防止云厂商直接拿核心产品做商业托管。
- **2020 年**：完成 Series D 融资，疫情和云迁移让分布式数据库需求升温。
- **2021 年**：Series E / F 把公司估值推到数十亿美元级，CockroachDB Cloud 成为重点增长线。
- **2024 年起**：自托管产品合并到新的 Enterprise 许可模型，个人、小团队和较小企业仍有免费使用口径，大客户要重新算商业成本。

## 学到什么

1. **NewSQL = SQL 接口 + 分布式底盘**：不是"分库分表中间件"那种把分布式逻辑塞进应用层的做法，而是数据库本身就是分布式的
2. **HLC 是软件版 TrueTime**：不依赖原子钟硬件、靠协议保证时序，工程上更可复制
3. **强一致的代价是延迟**：物理上跨区域往返是硬下限，没法绕开。设计决策——"延迟换一致性"——必须想清楚
4. **开源 → 商业化的剧本**：BSL 是这几年的趋势（CockroachDB / Elastic / Redis / HashiCorp 都走过），开源拉用户、企业版变现

## 延伸阅读

- 官方架构文档：[CockroachDB Architecture](https://www.cockroachlabs.com/docs/stable/architecture/overview)（每一层都讲清楚）
- 论文风格的设计文档：[CockroachDB: The Resilient Geo-Distributed SQL Database](https://www.cockroachlabs.com/guides/the-cockroachdb-paper/)（SIGMOD 2020）
- [[spanner]] —— CockroachDB 的精神原型，必读
- [[raft]] —— 副本同步用的共识算法
- [[postgresql]] —— SQL 层兼容的目标

## 关联

- [[spanner]] —— 论文级原型；CockroachDB 是它的开源后辈
- [[raft]] —— Range 副本同步的共识算法
- [[postgresql]] —— 协议兼容目标；很多团队从 PG 迁过来
- [[clickhouse]] —— 互补关系：OLTP 用 CockroachDB，OLAP 用 ClickHouse

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cascades-1995]] —— Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[gray-1978-notes]] —— Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[projects/badger]] —— Badger — Go 写的键值分离 LSM
- [[mongo]] —— MongoDB — 文档数据库代表
- [[pebble]] —— Pebble — CockroachDB 自研 LSM
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[tidb]] —— TiDB — HTAP 分布式数据库
