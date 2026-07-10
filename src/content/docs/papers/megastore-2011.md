---
title: Megastore — 把数据切成"小数据库"换跨地域同步复制
来源: 'Baker et al., "Megastore: Providing Scalable, Highly Available Storage for Interactive Services", CIDR 2011'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

Megastore 是 Google 2011 年公开的一个**存储系统**，放在 Bigtable 之上，给 Gmail / AppEngine / Google+ 等"交互式服务"用。

日常类比：把一个超大的图书馆**切成无数个小柜子**。每个小柜子内部规规矩矩——你可以一次拿三本书还一本书，全部成功或全部失败（ACID 事务）。但**柜子和柜子之间**就不强求了——跨柜子要做"原子操作"得绕着走，慢且不保证瞬时一致。

换得的好处是：每个小柜子在**5 个不同城市的数据中心**都各有一份**实时同步**的拷贝。任何一个城市断网、机房着火，柜子里的数据**都不丢、还能继续读写**。

这个"小柜子"在论文里叫 **entity group**——一个用户的邮箱、一个相册、一笔订单 + 它的所有明细，就是一个 entity group。

## 为什么重要

Megastore 是 2011 年 Spanner 出来**之前**，Google 内部"全球级强一致存储"的标准答案。理解它，下面这些事就连得起来：

- 为什么 Spanner（2012）发明了 **TrueTime**——是为了**绕开 Megastore 的两大痛点**（单组写吞吐低 + 跨组事务弱）
- 为什么 Bigtable（2006）单独不够用——它只保证**单行**原子，没有事务、没有多副本同步、没有 schema
- 为什么互联网公司今天的"用户分片"思路（按 user_id 哈希切分）能扩——Megastore 把这个思路**形式化**成了 entity group
- "工程取舍"长什么样：论文最有价值的不是算法，而是**承认"跨组强事务做不到，那就别做"**这种工程克制

## 核心要点

Megastore 的设计可拆成**三层取舍**：

1. **数据切分：entity group**。系统让你**显式声明**哪些数据归属同一个 group（通过 schema 里的 parent-child 关系，靠 key 前缀嵌套）。组内允许**完整 ACID 事务**；组间默认**不保证**。
2. **组内复制：Paxos**。每个 entity group 在 5 个数据中心各一份副本，写入走 Paxos——**多数派确认**才算成功。读默认从本地副本读，但要先问 **coordinator**（每个数据中心一个）：本地副本是不是最新的？是 → 直接读；不是 → 走 Paxos 拿最新。
3. **组间事务：两条路**。要么用**异步队列**（写一个组，触发另一个组稍后处理，最终一致）；要么用 **2PC**（论文里写"支持但不推荐"）。

副产品：每个组自带 **schema + 二级索引**（罕见——大多数 NoSQL 不给）。

## 实践案例

### 案例 1：Gmail 怎么映射到 entity group

每个用户的邮箱 = 一个 entity group。这个 group 里包含：

- 用户的所有邮件
- 标签、分类、星标
- 草稿、过滤规则

用户 A 给用户 B 发邮件，跨了**两个 entity group**：

- A 的"已发送"加一封 → A 组内事务
- B 的"收件箱"加一封 → 通过**异步队列**触发 → B 组内事务

如果 B 那边宕机，队列会重试。最终用户 A 看到"已发送"，B 几秒后看到"收件箱"——**最终一致**，不是瞬时一致。但 Gmail 的产品需求里，这点延迟用户感知不到。

### 案例 2：Paxos 一轮往返代价多大

5 个副本分布在跨美国东西海岸 + 欧洲。Paxos 写一次需要 **多数派（3 个）确认**。最远两个副本之间网络往返 ~100ms。

实测：单个 entity group 的写吞吐 **每秒几次**（论文给的数据是"a few writes per second per entity group"）。

这就是为什么用户邮箱切成 entity group 没问题——一个用户每秒不会发几十封邮件。但**不能**把整个 Gmail 全用户当一个 group——那写吞吐立刻塌。

**这是 Megastore 最核心的取舍**：用"切片粒度"换"跨地域强一致"。

### 案例 3：coordinator 让本地读快起来

Paxos 默认读也要走多数派——慢。Megastore 的优化：每个数据中心跑一个 **coordinator** 进程，它内存里维护"本地副本对哪些 entity group 是最新的"。

- 客户端读：先问本地 coordinator → 是最新 → 直接读本地 Bigtable，**0 跨数据中心 RPC**
- 写：写完 Paxos 后，coordinator 标记其他数据中心"你那边过时了"

代价：coordinator 是**单点**（每数据中心一个），它挂了那个数据中心读全部退化为 Paxos 读。论文承认这是"故意的简化"。

### 案例 4：写一次的完整流程拆开看

用户给一封邮件加星标。用伪代码跟一遍：

```text
tx = begin(entity_group=user_A)
mail = tx.read(key=mail_id)          # 问本地 coordinator → 多数时候读本地 Bigtable
mail.starred = true
tx.commit(expected_version=mail.ver) # 打包变更 + 版本号 → Paxos leader
# leader: Prepare→Promise → Accept→Accepted（多数派，至少 1 次 WAN RTT）
# leader: 通知各 DC coordinator「该 group 可能过时」
# client: 收到 commit 确认
```

**关键：Paxos 至少一轮 WAN 往返**决定写吞吐天花板。论文优化是 leader 缓存上次 Promise，跳过 Prepare，把两轮压成一轮——但那一轮仍跑不掉。

## 踩过的坑

1. **2PC 跨组事务"能用但别用"**：论文明说支持，但不推荐——任何一个组卡住会**阻塞**所有参与组。Google 内部用的极少，Spanner 才把它正经做对。
2. **entity group 切分一旦定下很难改**：schema 里的 parent-child 关系绑死了 key 前缀。重新切分意味着**全量数据迁移**——和 Bigtable region split 是两回事。
3. **写吞吐天花板低**：每组每秒 few writes 是**硬上限**，因为 Paxos WAN 往返不可压缩。热点 entity group（比如某个名人的微博）会立刻顶到上限。
4. **二级索引一致性弱**：组内索引是 ACID，**跨组的全局索引**最终一致——查询可能读到"过时"的索引。

## 和邻居方案的对比

| 方案 | 跨地域同步 | 跨行/组事务 | 单分片写吞吐 | 出现年份 |
|------|-----------|-----------|------------|---------|
| Bigtable | 异步备份 | 单行原子 | 高 | 2006 |
| Sinfonia | 否（单数据中心） | mini-tx | 高 | 2007 |
| Percolator | 否（单数据中心） | 跨行强事务（乐观锁） | 中 | 2010 |
| Megastore | **是（同步）** | 组内强 / 组间弱 | **低**（每秒几次） | 2011 |
| Spanner | **是（同步）** | **跨组强事务** | 中-高 | 2012 |

读这张表的方式：**Megastore 是唯一一个在 Spanner 之前同时拿到"跨地域同步 + 组内 ACID"的**，代价就是单分片写吞吐塌到每秒几次。Spanner 用 TrueTime 把这个代价拿掉了。

## 适用 vs 不适用场景

**适用**：

- 用户数据天然能按"账号/对象"切分（邮箱、相册、订单、文档）
- 单切片写吞吐**不高**（每秒几次以内）
- 必须**跨数据中心同步**（机房挂了不能丢数据、不能停服务）
- 需要 schema + 二级索引（不是纯 KV）

**不适用**：

- 高写吞吐场景（广告点击日志、IoT）→ 用最终一致 NoSQL
- 跨组强事务是日常需求（银行转账、库存系统）→ 用 Spanner / TiDB / CockroachDB
- 数据无法切分成小组（社交图谱）→ 用图数据库或专用方案
- 延迟敏感的全球读（< 10ms）→ 用 CDN / 边缘缓存

## 历史小故事（可跳过）

Megastore 是 Google 2008 年左右开始用的**内部产品**，2011 年才在 CIDR 公开（CIDR 是工业界论文为主的会议，比 SIGMOD/VLDB 接受度更宽）。

它不是 Google 第一个尝试——之前 **Bigtable**（2006）只给单行原子，**Sinfonia**（2007）给了 mini-transactions 但不跨地域，**Percolator**（2010）给了跨行事务但用的乐观锁 + 时间戳，吞吐高但延迟也高。

Megastore 把"跨地域同步"放到**第一优先级**，是因为 Google 那几年遭过几次大机房断电，AppEngine 用户对"区域故障 = 数据不可用"非常不能忍。

但 Megastore 的两大痛点（写吞吐 + 跨组事务弱）困扰了 Google 三四年，直到 **Spanner（2012）** 用原子钟 + TrueTime 把"跨组外部一致事务"做对，Megastore 就慢慢被替换了。

## 学到什么

1. **承认做不到也是设计**——论文最值钱的不是 Paxos，而是"跨组强事务我们不做"这种工程克制
2. **切片粒度 = 一切扩展性的开关**——选对 entity group 边界比选对算法更重要
3. **同步复制 + 强一致 + 高吞吐"三选二"**——Megastore 选了前两个；Spanner 想三个都要，代价是 TrueTime 这种基础设施级投入
4. **理论 → 工程：不是 Paxos 不够好，是 Paxos 的 WAN 一轮往返决定了写吞吐天花板**——硬件物理决定算法上限
5. **优化往往是"加单点"换简单**——coordinator 是单点容错差，但论文承认并接受这个代价，没有为了完美而堆复杂度

## 延伸阅读

- 论文 PDF：[Megastore CIDR 2011](https://research.google.com/pubs/archive/36971.pdf)（12 页，schema 例子非常具体）
- 解读：[The Morning Paper — Megastore](https://blog.acolyer.org/2014/12/30/megastore-providing-scalable-highly-available-storage-for-interactive-services/)
- [[spanner-2012]] —— Megastore 的继任者，TrueTime 把跨组事务做对了
- [[percolator-2010]] —— 同期的另一种思路（跨行事务 + Bigtable，无跨地域同步）
- [[bigtable-2006]] —— Megastore 的存储底座

## 关联

- [[spanner-2012]] —— Spanner 解决了 Megastore 的两大痛点：写吞吐 + 跨组强事务
- [[percolator-2010]] —— 同期方案：选了"跨行事务"而不是"跨地域同步"
- [[paxos-1998]] —— 组内复制用的就是经典 Paxos
- [[bigtable-2006]] —— Megastore 的物理存储层
- [[sinfonia-2007]] —— mini-transactions 思路的前驱，但不跨地域
- [[brewer-cap-2000]] —— Megastore 选 CP（强一致 + 分区容忍），AP 不要
- [[aries-1992]] —— 组内事务日志机制的远祖

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
