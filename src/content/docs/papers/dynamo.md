---
title: Dynamo — 让购物车永远能写入的分布式存储
来源: 'DeCandia et al., "Dynamo: Amazon''s Highly Available Key-value Store", SOSP 2007'
日期: 2026-05-29
分类: 分布式系统
难度: 高级
---

## 是什么

Dynamo 是亚马逊 2007 年公开的一套分布式键值存储系统，**它的设计目标就一句话：购物车永远能写进去**。日常类比：像急救室——病人推进来不能问"保险卡呢"，先抢救活，账单后面慢慢核。

传统数据库（MySQL / PostgreSQL）像保险公司：每条记录都要对得上，但跨数据中心写一条数据要等所有副本确认。Dynamo 反过来——**先让用户写成功，副本之间偶尔不一致也没关系，过几秒会自己对齐**。代价是：用户读到的可能是"几秒前的版本"，但绝不会"读不到 / 写不进"。

这套设计后来被叫作 **CAP 理论的 AP 路线**——在分区（网络故障）和强一致之间，Dynamo 永远选可用。

## 为什么重要

不理解 Dynamo，下面这些事都没法解释：

- 为什么 Cassandra / Riak / DynamoDB 这一代 NoSQL 数据库都长得很像——它们都是这篇论文的工程化变体
- 为什么"购物车系统"在分布式课里会单独讲——Amazon 用真实业务定义了一套全新的设计哲学
- 为什么"最终一致性（eventual consistency）"从一个学术词变成产品需求文档里的常见词——Dynamo 把它推到生产
- 为什么 CTO Werner Vogels 亲自挂名一篇技术论文——这在工业界极罕见，是"我们公司就这样做"的官方信号

## 核心要点

Dynamo 解决"高可用键值存储"的方法是 **4 件套** 组合，每件单独都是已知技术，但拼在一起是新东西：

1. **一致性哈希（Consistent Hashing）**：把所有节点摆在一个圆环上，数据按哈希值落到环上、顺时针找最近的节点存。日常类比：12 小时表盘上贴标签，加一个新人只挪它前后两个位置。**好处**：增删节点只影响相邻几段 key，不用全集重洗。

2. **向量时钟（Vector Clocks）**：每条数据带一张"小卡片"，记每个节点改过它几次。两个版本互不包含 → 并发冲突 → **交给应用层决定怎么合**（购物车做集合并集，计数器做加法）。日常类比：两个人同时编辑同一份 Google Doc，系统不强行覆盖，把两版都给你看。

3. **松散仲裁 + 提示移交（Sloppy Quorum + Hinted Handoff）**：本来该写到 A、B、C 三个节点，B 宕机了——系统找一个临时节点 D 顶上，并贴一张"这数据本该归 B"的便利贴。B 恢复后 D 自动把数据交回去。日常类比：朋友不在家，快递放邻居那里，朋友回来邻居转交。

4. **可调一致性（N, R, W）**：N = 副本数，R = 读时要的确认数，W = 写时要的确认数。**`R + W > N` 就是强一致；`R + W ≤ N` 就是最终一致**。应用自己根据业务选。

## 实践案例

### 案例 1：一致性哈希环上加节点

假设环上有 5 个节点 A、B、C、D、E，key `cart_42` 的哈希值落在 A 和 B 之间，按"顺时针找最近"的规则，B 是它的负责节点。再往后取 2 个节点 C、D，组成"副本列表 [B, C, D]"。

```
环：  A ─────── B ──── C ─── D ──── E ─── (回到 A)
                     ↑
              cart_42 落这里 → 找 B 当负责人
              副本：B, C, D
```

现在加一个节点 F 进来，假设它落在 D 和 E 之间：

```
环：  A ──── B ──── C ── D ── F ── E ── (回到 A)
```

**只有"D 到 F 之间"的 key 需要从 E 迁到 F**，其他 key 不动。这就是"加节点不洗全集"的来源——但注意，迁移量仍是 **总数据 / 总节点数**，不是宣传的"几乎零迁移"。

### 案例 2：向量时钟检测并发冲突

两个客户端 X 和 Y 同时往购物车加东西：

```
初始：cart = []，向量时钟 vc = {}

Client X 通过节点 Sx 加 "苹果"：
  → 版本 v1，vc = {Sx: 1}

Client Y 同时通过节点 Sy 加 "香蕉"（没看见 X 的写）：
  → 版本 v2，vc = {Sy: 1}
```

读取时系统发现：v1 的 vc `{Sx:1}` 和 v2 的 vc `{Sy:1}` **互不包含**——既不是 v1 来自 v2，也不是 v2 来自 v1。判定为并发冲突，把两个版本都返给应用。

应用层做合并（购物车场景做集合并集）：

```
最终 cart = ["苹果", "香蕉"]
新 vc = {Sx: 1, Sy: 1}（两边取最大值）
```

**关键**：系统不替你选哪个赢，因为它不懂业务（计数器、购物车、文档合并的逻辑都不一样）。

### 案例 3：松散仲裁顶替宕机节点

配置 N=3, W=2，写入 `cart_42`：

1. 副本列表是 [B, C, D]，但 B 宕机
2. 协调者发现只有 C、D 健康，凑不齐 W=2 的话本该写失败
3. **松散仲裁**启动：从环上找下一个健康的节点 E，把数据写到 [C, D, E]，给 E 加一张提示便条"这本该是 B 的"
4. 收到 W=2 个确认 → 返回成功
5. B 恢复后，E 检测到 B 上线，把数据 + 便条转交给 B，自己删掉

整个过程**用户那边永远是"写成功"**，没人感到 B 宕过。

## 踩过的坑

1. **一致性哈希"几乎零迁移"是营销语言**——加节点要拉走 1/N 的全集数据，并产生短暂热点（旧负责人还没交接完，新负责人已经接读请求）。

2. **向量时钟会无限膨胀**——一条数据被很多节点改过后，vc 里的条目越来越多，论文用"截断到 10 个"凑合，但截断后丢了完整因果信息，后来 Riak 用 dotted version vectors 替代才算解决。

3. **松散仲裁在长时间网络分区下会丢数据**——提示便条有过期时间（Cassandra 默认 3 小时），分区超过这个时间，便条被垃圾回收，那段时间的写就永久消失了。这违背"持久"承诺，论文没讲透。

4. **应用层做冲突合并对开发者太难**——论文 Section 6.3 自己都承认"开发者觉得设计合并函数很难"，结果大多数应用退化成"最后写的赢"（last-write-wins），等于放弃了向量时钟。Cassandra 干脆直接抛弃 vc，用 LWW 简化。

## 适用 vs 不适用场景

**适用**：

- 用户面数据，可以容忍短暂不一致（购物车 / 偏好设置 / 用户 session）
- 多数据中心 active-active（写入要在任何 DC 都能完成）
- 高吞吐 + 低尾延迟需求（避免跨节点强一致带来的等待）
- 商业损失低的写入场景（看错商品名 vs 等保险公司核单——选前者）

**不适用**：

- 钱相关数据（订单 / 支付 / 库存扣减）→ 必须强一致，用 Spanner / CockroachDB / 传统关系库
- 需要事务（多 key 原子操作）→ Dynamo 没事务，每个 key 独立
- 需要二级索引 / 复杂查询 → 纯键值模型，查询能力非常弱
- 团队不会写冲突合并 → 退化成 LWW 时反而不如直接用强一致

## 历史小故事（可跳过）

- **2004 年**：Amazon 圣诞节高峰期 Oracle 数据库扛不住，购物车出现"加了商品但用户看不到"的故障。商业损失推动内部立项。
- **2006 年**：Werner Vogels（CTO 2005-2024）拍板——存储系统下一代的设计目标是"永远可写入"，而不是"永远一致"。
- **2007 年 SOSP**：DeCandia 等 9 人发表 16 页论文。CTO 亲自挂名，工业论文罕见。
- **2008 年**：作者之一 Avinash Lakshman 跳到 Facebook，把 Dynamo 思想 + Bigtable 数据模型杂交，写出 Cassandra（开源后成主流）。
- **2012 年**：AWS 推出托管服务 DynamoDB——但**默认是强一致**，Dynamo 论文的 AP 哲学反而成了 opt-in。论文版和商业版是两个系统。
- **2022 年**：Vogels 等在 USENIX 公开 DynamoDB 内部架构，确认商业产品转向 CP 路线，AP 只在显式配置时启用。

## 学到什么

1. **CAP 不是三选二，是分层选择**——不同业务在 AP 和 CP 之间不同位置，购物车选 AP，订单选 CP
2. **"永远可写"是商业承诺反向定义系统设计**——技术论文不只讲算法，讲"业务约束如何长成系统"
3. **应用层冲突合并听上去美，实际工程化失败**——80% 用户回退到 LWW，技术正确不等于工程正确
4. **可调一致性（N,R,W）的灵活性是过度设计**——论文 Section 6 自承 90% 应用用 (3,2,2)，AWS DynamoDB 商业版直接隐藏这些 knob 反而更成功

## 延伸阅读

- 论文 PDF：[Dynamo SOSP 2007](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)（16 页，Section 4 + 6 是核心）
- Werner Vogels 的博客文章：[Eventually Consistent — Revisited](https://www.allthingsdistributed.com/2008/12/eventually_consistent.html)（论文作者通俗版讲解）
- 视频：[MIT 6.824 Distributed Systems — Lecture 18 Cassandra/Dynamo](https://www.youtube.com/watch?v=en9DT3QmuSk)（1 小时课堂版，有动画）
- DynamoDB 2022 论文：[Amazon DynamoDB: A Scalable, Predictably Performant, and Fully Managed NoSQL Database Service](https://www.usenix.org/conference/atc22/presentation/elhemali)（看 15 年后商业演化）
- [[lamport-1978]] —— 向量时钟的理论根源
- [[crdt-json]] —— 比 vector clock 更现代的并发数据结构方案

## 关联

- [[lamport-1978]] —— Lamport 的逻辑时钟是 vector clock 的祖先；Dynamo 引用了 Mattern/Fidge 的扩展但跳过 Lamport
- [[gfs]] —— Google File System，CP 路线的同时代典型；和 Dynamo 形成"两种哲学"对照
- [[bigtable]] —— GFS 之上的键值存储，走 CP 路线（Chubby 协调）；Cassandra 是"Dynamo + Bigtable"的杂交
- [[paxos]] —— 强一致共识协议；Dynamo 显式选择不用，因为它要 AP
- [[chubby]] —— Google 的分布式锁服务，Bigtable 用它，Dynamo 不用——是 AP/CP 分歧的具体体现
- [[crdt-json]] —— 把"应用层做冲突合并"这件事数学化，是对 Dynamo 第 4 件套坑的正面回答
- [[kafka]] —— 同样面向"高吞吐 + 可分区"的现代分布式系统，借鉴 Dynamo 的环上分区思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[azure-storage-2011]] —— Windows Azure Storage 2011 — 云对象存储第一次在工业界做到强一致
- [[bayou-1995]] —— Bayou — 离线先改本地，再回来和别人合并
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[calvin]] —— Calvin — 先排队再执行的分布式事务系统
- [[cap-12-years-later-2012]] —— CAP 十二年后 — Brewer 自己承认"三选二"是误读
- [[chord-2001]] —— Chord — 让上万台机器排成圈，查任何 key 都只走 log N 步
- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[cops-2011]] —— COPS — 大规模跨地域存储如何用得起的代价拿到因果一致
- [[papers/couchdb]] —— CouchDB — 把 HTTP + 多版本 + 多主复制揉成离线优先数据库
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[crdt-json-2017]] —— CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法
- [[f4-2014]] —— f4 — Facebook 把 90 天前的旧图片搬到一个省 40% 存储的仓库
- [[gilbert-lynch-2002]] —— Gilbert-Lynch 2002 — 把 CAP 从口号写成数学定理
- [[helland-2007]] —— Life Beyond Distributed Transactions — 大规模系统下放弃跨机事务的宣言
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[kademlia-2002]] —— Kademlia — 用 XOR 当距离的 P2P 路由表
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[pastry-2001]] —— Pastry — 用 nodeId 的前缀一位一位逼近目标
- [[pnuts-2008]] —— PNUTS — 介于强一致与最终一致之间的实用一致性
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tao-2013]] —— TAO — Facebook 给十亿人好友列表造的专用图数据库
- [[vogels-eventual-2009]] —— Eventually Consistent 2009 — 给互联网规模存储一套'放弃强一致'的官方词汇
- [[dragonfly]] —— Dragonfly — 多线程 Redis 替代
- [[rethinkdb]] —— RethinkDB — 让数据库自己把更新推给客户端的先驱
