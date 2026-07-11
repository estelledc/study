---
title: RethinkDB — 让数据库自己把更新推给客户端的先驱
来源: Slava Akhmechet 等, RethinkDB 项目（2009–2016, Linux Foundation 接管）
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

RethinkDB 是一个**开源文档数据库**，长得像 MongoDB，但把一个学术里早有、产品里少见的能力做成了开发者默认体验：**客户端可以订阅一条查询的结果，结果一变就被推过来**。

日常类比：传统数据库像点外卖——你点一次拿一次，下次想知道菜单更新就得再点一次。RethinkDB 像微信公众号——你关注一次，新内容自动推到手机。

写法长这样（JavaScript 驱动）：

```javascript
r.table('messages')
 .filter({room: 'lobby'})
 .changes()
 .run(conn, (err, cursor) => {
   cursor.each((err, change) => console.log(change))
 })
```

`.changes()` 是关键。这不是普通查询——它告诉服务端：**把这条查询挂着，一有命中行变化就把差量推给我**。聊天室、协作编辑、实时仪表盘，都不再需要前端轮询。

## 为什么重要

不理解 RethinkDB，下面这些事都没法解释：

- 为什么 Firebase / Supabase / Convex 都把『实时订阅』当卖点——同一道题的多条产品线，RethinkDB 是早期把查询订阅做进数据库内核的样本
- 为什么 Materialize / Noria 这些增量视图维护数据库会出现——把『订阅一条查询』推到 SQL 体系
- 为什么一个技术上做得很扎实的产品会**商业失败**——选错市场、错过窗口期
- 为什么 2026 年仍有人讨论它——失败案例的教学价值有时大于成功

## 核心要点

RethinkDB 把『查询』和『订阅』合二为一。这个设计可以拆成 **三层**：

1. **ReQL 把查询当函数链**：每个驱动语言（JS / Python / Ruby）里 ReQL 是嵌入式 DSL，链式调用——不像 SQL 拼字符串。`r.table(x).filter(y).changes()` 是真正的代码，编辑器能补全、能 lint。这个设计的副作用：查询能被组合、被高阶函数包装，比 SQL 灵活很多。

2. **服务端把活跃订阅当一等公民**：每个 changefeed 是一条长连接 + 服务端维护的过滤器 + 游标。写入命中过滤器时，服务端立刻把差量（旧值 + 新值）推下去。**不是轮询、不是触发器、不是 oplog 拉取**——是查询引擎本身的扩展。这一点是 RethinkDB 与 MongoDB 最本质的差别：MongoDB 的『实时』是事后给 oplog 套层壳，RethinkDB 是从查询引擎自下而上重写。

3. **集群层用 Raft 管元数据**：分片按主键范围切，副本之间用 Raft 同步配置变更（谁是 leader、表怎么分）。数据写入走自研 MVCC + B-tree 引擎。这一层和 [[spanner]] / [[raft]] 是一个家族——元数据要强一致，数据本身可以最终一致。

## 实践案例

### 案例 1：聊天室前端不再轮询

```javascript
r.table('messages').filter({room: 'lobby'}).changes()
```

每条新消息进库，前端立即收到 `{old_val: null, new_val: {...}}`。删除是 `{old_val: {...}, new_val: null}`。整个『推送基础设施』就是这一行查询。

### 案例 2：实时排行榜

```javascript
r.table('scores').orderBy({index: r.desc('score')}).limit(10).changes()
```

榜单一旦有人挤进前 10，服务端推 `{old_val: 旧第 10, new_val: 新进来的}`。前端收到差量直接更新 UI——不需要重新拉整张表。

### 案例 3：表级订阅 + 应用侧补查（join 不能直接 .changes）

官方 **不支持** `eqJoin(...).changes()`（join changefeed 一直未落地）。正确做法是订一张表，再在回调里补查另一张：

```javascript
r.table('orders').changes().run(conn, (err, cursor) => {
  cursor.each(async (err, change) => {
    const order = change.new_val
    if (!order) return // 删除
    const user = await r.table('users').get(order.user_id).run(conn)
    console.log({ order, user })
  })
})
```

逐步读：① 只对 `orders` 开 changefeed；② 每条差量取出 `new_val`；③ 用 `user_id` 再 `get` 一次用户。比 [[kafka]] 仍更高层——你订的是业务表上的过滤结果，不是裸日志流；但跨表一致性要自己拼。

### 案例 4：`includeInitial` 与 `squash` 实际做什么

```javascript
r.table('messages').filter({room: 'lobby'})
 .changes({ includeInitial: true, squash: true })
```

- `includeInitial: true`：连上时**先推当前命中行的快照**（每条像 `{old_val: null, new_val: ...}`），再推后续变更——不是把离线期间漏掉的每一跳差量补发回来。
- `squash: true`：短时间内多次写入合并成一条推送，降低刷屏。

断线重连要自己：重开 feed + `includeInitial` 对齐当前态，本地用版本号/时间戳消化缺口。Firebase Realtime 是**同期**另一条实时产品线，不是 RethinkDB『早做了几年』的徒弟。

## 踩过的坑

1. **changefeed 不是免费的**：服务端要为每个订阅维护活跃过滤器和游标，连接数线性增长成本。万级长连接时内存和 CPU 都吃紧——这是后来 Firebase / Supabase 设计时不得不解决的同一道题。

2. **顺序保证有限**：单分片内有序，跨分片**全局顺序不保证**。写复杂聚合订阅会踩这个——比如『按时间排序』如果跨分片，前端可能先看到第 5 条再看到第 3 条。

3. **2016 年公司倒闭**：代码转给 Linux Foundation 作为开源项目存活，社区版仍在维护，但**商业级运维支持几乎为零**。生产环境慎选——故障时没人兜底。

4. **ReQL 学习曲线非零**：和 SQL 思维不兼容，团队迁移成本高。新人来了要重新学一套查询语法，BI 工具基本不支持。

## 适用 vs 不适用场景

**适用**：

- 实时协作产品的快速原型——聊天、协作编辑、实时仪表盘
- 中小数据量 + 重订阅的场景——changefeed 是杀手锏
- 教学/研究——想理解『查询即订阅』思想的最直白样本
- 想做出 Notion / Figma 那种实时多人协作体验，但不想自己搓订阅基础设施

**不适用**：

- 需要强一致 ACID 跨行事务 → 看 [[spanner]] / Postgres
- 数据量到 PB 级 → 看 [[dynamo]] 系或云原生数据库
- 需要 SQL 生态（BI 工具、ORM 库）→ ReQL 不兼容
- 生产环境要厂商支持 → 没有商业实体了，出问题只能自己读源码

## 历史小故事（可跳过）

- **2009 年**：Slava Akhmechet 三人在 YC 创立，最初想做 SSD 优化的存储引擎
- **2012 年**：1.0 发布，叙事从『更快的存储』转向『实时数据库』
- **2015 年**：Hacker News 一片好评，技术上口碑顶峰，但收入一直起不来
- **2016 年 10 月**：公司倒闭。Slava 写了博客 *Why RethinkDB Failed*，复盘两个错——**选错市场**（开发者喜欢免费工具，但买单的是企业）和**优先正确性而牺牲默认就快的初印象**（每次基准测试都被 MongoDB 甩开）
- **2017 年起**：Linux Foundation 接管代码，社区维护至今

之后 [[differential-datalog]] / Materialize / Noria 等系统把『订阅一条查询』思想推到 SQL 和增量视图维护方向。Firebase / Supabase Realtime / Convex 在文档数据库这一支继承了它的实时基因。

## 学到什么

1. **查询可以是订阅对象，不只是一次性请求**——这是把数据库从拉取式变推送式的关键洞见，后来被无数实时基础设施继承
2. **技术做得对 ≠ 商业能成**——开源繁荣与商业失败可以同时存在；选错市场是个独立维度
3. **changefeed 是高层抽象**：比 Kafka 这类队列更贴近业务——队列只能告诉你『某行变了』，changefeed 告诉你『某条业务查询结果变了』
4. **失败案例的教学价值**：Slava 那篇 *Why RethinkDB Failed* 是产品决策的必读，比成功案例更能学到东西
5. **思想可以脱离实现存活**：RethinkDB 公司没了，但『查询即订阅』已被 Firebase / Convex / Materialize 等在各自产品线里继续跑下去

## 延伸阅读

- 失败复盘：[Slava — Why RethinkDB Failed](https://www.defmacro.org/2017/01/18/why-rethinkdb-failed.html)（产品 PM 必读，半小时读完受益终身）
- 官方 changefeed 文档：[RethinkDB Changefeeds](https://rethinkdb.com/docs/changefeeds/)（看完就能跑 demo）
- 源码：[github.com/rethinkdb/rethinkdb](https://github.com/rethinkdb/rethinkdb)（C++ 写的，有兴趣可以读 changefeed 实现）
- [[spanner]] —— 强一致分布式 SQL，另一种架构哲学
- [[kafka]] —— 队列式订阅，与 changefeed 对比
- [[raft]] —— RethinkDB 元数据层用的共识算法

## 关联

- [[spanner]] —— 同样用共识算法管元数据，但目标是强一致 SQL
- [[kafka]] —— 同样做『订阅』，但订阅对象是行变化而不是查询结果
- [[raft]] —— RethinkDB 集群元数据同步用的算法
- [[dynamo]] —— 同代分布式存储，走最终一致路线
- [[differential-datalog]] —— 把『订阅查询结果』思想推到 Datalog/SQL 体系

## 思想血脉（可选段）

把 RethinkDB 放进时间线看才能看清它的价值：

- **上游影响它的**：1990s 主动数据库（active database）研究、Datalog 增量维护、CEP（complex event processing）——学术先例早有；RethinkDB 的贡献是把『查询即订阅』包成普通开发者能用的产品形态
- **下游同题的**：Firebase Realtime（同期 KV 层订阅）、Supabase Realtime（Postgres + 订阅）、Convex（更彻底的查询即订阅）、Materialize（SQL + 增量视图维护）、Noria（学术原型，现已停止维护）、Linear / Replicache 这类同步引擎

它的位置：**把订阅做成查询引擎一等公民**的早期工业样本。这条线索一旦看清楚，再去看后辈就会觉得『哦，他们其实在解决同一道题』。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
