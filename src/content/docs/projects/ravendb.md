---
title: RavenDB — .NET 生态首选的 ACID 文档数据库
来源: https://github.com/ravendb/ravendb
日期: 2026-05-31
分类: 数据库 / 文档存储
难度: 中级
---

## 是什么

RavenDB 是 2010 年由 Oren Eini（笔名 Ayende Rahien，NHibernate 核心贡献者）在以色列公司 Hibernating Rhinos 启动的**开源文档数据库**——一句话定位：**.NET 友好、跨文档 ACID、自带全文索引的 [[mongodb]] 替代品**。

日常类比：[[mongodb]] 像一个特别擅长收纳的衣柜，每件衣服（文档）单独取放都很快，但你想"把这件外套放进 A 柜的同时把围巾放进 B 柜，要么一起成功要么一起失败"，它说"做不到，我只保证单件的原子性"。RavenDB 多了一把锁——你可以告诉它"这两件得绑成一个事务"，要么都进去要么都不进。

GitHub 约 3.5k star，AGPLv3 + 商业双授权，是 .NET 圈对标 [[mongodb]] 的主选项。

## 为什么重要

- **跨文档 ACID 在文档数据库里是稀有特性**：[[mongodb]] 直到 4.0（2018）才支持，且性能损失明显；RavenDB 从 v1 起就是默认行为
- **.NET 优先**：客户端是 C# / LINQ 写的，索引可以直接用 LINQ 表达式声明，写起来像查 List 而不是拼字符串
- **预计算索引**：查询优先走索引、靠动态索引补洞——和 [[elasticsearch]] 同源（都用过 Lucene），但 OLTP 更友好
- **集群一致性可调**：单文档默认异步多主复制；标了 cluster-wide 的事务走 [[raft]] 严格一致，让你按业务挑

## 核心要点

### 1. 文档 + metadata 的存储模型

每条文档是 JSON，外加一份 metadata：

```json
{
  "@metadata": {
    "@id": "users/1-A",
    "@collection": "Users",
    "@change-vector": "A:23-xyz, B:11-pqr",
    "@last-modified": "2026-05-31T08:00:00Z"
  },
  "Name": "Jason",
  "Age": 30
}
```

`@change-vector` 是 RavenDB 特色——它不是单调递增的版本号，而是"每个节点各自的计数器拼起来"，让多主复制能识别出"这条文档在 A、B 两节点都被改过，需要冲突解决"。这是分布式系统里向量时钟的工业实现。

### 2. 索引是写入时预计算的

很多数据库的索引是"查询时按 BTree 找一遍"，RavenDB 反过来——你声明索引（LINQ 表达式），引擎在写入时增量把文档映射成索引项：

```csharp
public class Users_ByAge : AbstractIndexCreationTask<User> {
    public Users_ByAge() {
        Map = users => from u in users
                       where u.Age > 18
                       select new { u.Age };
    }
}
```

代价：索引会**异步**更新（毫秒级延迟），所以默认查询是"最终一致"。要强一致需显式 `WaitForNonStaleResults`。

好处：查询优先走索引；没匹配索引时会自动建动态索引，而不是默默全表扫——逼你把查询路径显式化。

### 3. RQL 长得像 SQL，跑的是 Lucene/Corax

```sql
from Users
where Age > 25 and search(Bio, "machine learning")
order by Age desc
limit 10
```

底层长期走 Lucene 索引（和 [[elasticsearch]] 同根）；v6（2023）起可选自研 **Corax**（与 Lucene 并存）——按 RavenDB 工作负载特化，官方测速常报数倍提升。

### 4. 集群：多主异步 + Raft 严格一致

RavenDB 集群由若干节点组成，默认是**多主异步复制**——任何节点都能写，写完返回，再背景同步到其他节点。冲突用 `@change-vector` 检测，可以脚本化解决（"取最新"、"合并字段"等）。

如果业务需要严格一致（库存、转账），打开 `cluster-wide transaction`：写入要走 [[raft]] 共识，多数节点确认才算成功。代价是延迟从毫秒升到几十毫秒。

### 5. Subscriptions：数据库推给你

订阅一个查询，服务器主动把匹配的文档流推给客户端，断线重连后从断点续传：

```csharp
var sub = store.Subscriptions.Create<Order>(
    o => o.Status == "Pending");
worker.Run(batch => {
    foreach (var order in batch.Items) ProcessOrder(order.Result);
});
```

适合事件源 / CQRS 架构——投影服务订阅"领域事件"集合，数据库当消息队列用。

### 6. ETL 内置

RavenDB 自带把数据同步到外部的 ETL 任务：到 SQL Server、到 Kafka、到 ElasticSearch、到另一个 RavenDB。配置一段 JS 转换脚本即可，省掉 Debezium / Airbyte 这一层。

## 实践案例

### 案例 1：电商订单 + 库存的强一致

下单要同时扣库存和写订单。两步：① 开 `ClusterWide` 会话；② 同事务改库存并 `Store` 订单，`SaveChanges` 经 Raft 提交。

```csharp
using var session = store.OpenSession(new SessionOptions {
    TransactionMode = TransactionMode.ClusterWide
});
var stock = session.Load<Stock>("stocks/sku-123");
if (stock.Quantity < 1) throw new OutOfStockException();
stock.Quantity--;
session.Store(new Order { Sku = "sku-123", Qty = 1 });
session.SaveChanges(); // 多数节点确认，要么都成功要么都失败
```

### 案例 2：博客全文搜索 + 文档过滤合一

步骤：① 声明含 `search` 字段的索引；② 用 RQL 一次过滤年龄并搜 Bio；③ 不必外挂搜索集群。

```csharp
// Map 索引把 Bio 送进全文字段后：
// from Users where Age > 25 and search(Bio, "machine learning")
var users = session.Advanced.DocumentQuery<User>()
    .WhereGreaterThan(u => u.Age, 25)
    .Search(u => u.Bio, "machine learning")
    .ToList();
```

### 案例 3：Subscription 当迷你消息队列

步骤：① 按谓词创建订阅；② `Run` 拉批次处理；③ 断线后从续传点接着消费——适合 CQRS 投影。

```csharp
var id = store.Subscriptions.Create<Order>(o => o.Status == "Pending");
var worker = store.Subscriptions.GetSubscriptionWorker<Order>(id);
await worker.Run(batch => {
    foreach (var item in batch.Items) ProcessOrder(item.Result);
});
```

## 踩过的坑

1. **AGPLv3 是真的"传染"**：嵌入闭源产品要么开源，要么买商业授权——商用前先和法务对齐
2. **索引异步更新带来"读自己写不到"**：刚 `SaveChanges` 立刻按条件查可能旧；要 `WaitForNonStaleResults`，或按 ID 重读（按 ID 强一致）
3. **探索型 ad-hoc 不友好**：习惯 [[mongodb]] 随便 `find` 的人会撞上自动索引/声明索引门槛
4. **生态小**：约 3.5k star vs [[mongodb]] 量级差距，冷门问题多靠官方文档或 Ayende 博客

## 适用 vs 不适用场景

**适用**：

- .NET 项目想要"文档库 + 事务 + 全文搜索"一站式后端
- 事件源 / CQRS 架构，subscriptions 当事件总线
- 中小规模数据（百 GB 到几 TB），需要强一致但又不想用关系数据库

**不适用**：

- 需要 PB 级水平扩展 → [[mongodb]] / Cassandra 生态成熟得多
- 全栈非 .NET 的项目 → 客户端体验在 Java / Go / Node 不如 .NET 顺滑
- 需要复杂分析 / OLAP → [[elasticsearch]] 或专用列存更合适
- 极简 KV 缓存 → 用错地方，Redis 之类更轻

## 历史小故事（可跳过）

- **2010 年**：Oren Eini 受够 ORM 阻抗失配，发布 RavenDB 1.0（跨文档 ACID）
- **v3（2014）**：引入自研存储引擎 **Voron**（LMDB 思路的 B+ Tree）
- **v4（2018）**：Voron 成为唯一引擎，跨平台；随后 4.1 加 cluster-wide 事务
- **v5（2020）**：时间序列与分布式计数器
- **v6（2023）**：自研 **Corax** 索引引擎可选上线（与 Lucene 并存）
- **v7（2025）**：原生向量搜索，拥抱 RAG

## 学到什么

1. **跨文档 ACID 在文档库里要付出复杂度代价**——RavenDB 选择把这个复杂度内化在引擎里（默认事务），[[mongodb]] 选择把它暴露给用户（4.0 后才加，要显式 `startTransaction`）
2. **预计算索引 vs 查询时索引** 是文档库的两条路：[[elasticsearch]] / RavenDB 走预计算，[[mongodb]] / [[postgresql]] 走查询时——前者写慢查快，后者反过来
3. **Voron / Corax 都是"不重新发明轮子，但按工作负载重写"**——LMDB 已有 B+ Tree、Lucene 已有倒排索引，但通用版总有不合身的地方，自己写一份按业务场景特化是工业数据库常见路线
4. **创始人长期写技术博客**（Ayende.com）是 RavenDB 区别于其他闭源产品的关键——存储引擎设计细节都公开，让用户敢用

## 延伸阅读

- 官方文档：[RavenDB Documentation](https://ravendb.net/docs)（.NET / Java / Node 客户端教程）
- 创始人博客：[Ayende @ Rahien](https://ayende.com/blog)（深入存储引擎、Voron 设计、Raft 实现）
- [[mongodb]] —— 文档库标准答案，对比看跨文档事务的不同实现
- [[elasticsearch]] —— 同样基于 Lucene，对比看 OLTP vs 分析侧重
- [[raft]] —— RavenDB 的 cluster-wide 事务底层协议

## 关联

- [[mongodb]] —— 同领域最大对手，对比看事务和索引模型
- [[couchdb]] —— 都讲 MVCC + 复制，CouchDB 没跨文档事务
- [[elasticsearch]] —— 共享 Lucene 血统，定位互补
- [[postgresql]] —— JSONB 路线的关系派对手
- [[raft]] —— cluster-wide 事务底层共识
- [[neo4j]] —— 邻居领域（图）做对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
