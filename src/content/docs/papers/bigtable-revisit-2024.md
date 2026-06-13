---
title: Bigtable 回顾 — 一个分布式数据库 18 年生产经验的全盘复盘
来源: 'Steve Yegge, "Bigtable Then and Now", CIDR 2024'
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
难度: 中级
provenance: pipeline-v3
---

## 是什么

这篇论文是 Google 工程师 Steve Yegge 在 Bigtable 上线 18 年后写的生产复盘。它不是"Bigtable 怎么设计"（那是 2006 年原始论文的事），而是"Bigtable 在几十万台机器上跑了 18 年，什么东西坏了、什么东西一直好用"。

日常类比：像一位老船长在退休前写航行日志——"这艘船我开了 18 年，经历过风暴、修过引擎、载过不同乘客，现在告诉你哪些零件从没坏过，哪些每次风暴都得换"。

Bigtable 是 Google 内部几乎所有核心服务（搜索、地图、Gmail、YouTube、Google Analytics）的底层存储引擎。它像一个巨大的多维表格，数据按行键（row key）排序存储，支持海量写入和快速单行查询。18 年间，它从几百台机器扩展到百万台级别，QPS 从几千涨到几十亿，存储从 TB 级到 EB 级（百亿亿字节）。

这篇回顾的价值在于：它把"理论上设计得很好"和"实践中扛了 18 年还没倒"区分开了。很多系统设计论文告诉你"为什么这样设计"，这篇告诉你"这样设计 18 年后还对不对"。

## 为什么重要

不理解这篇回顾，下面这些事都没法解释：

- 为什么 Google 内部上百个服务共享同一个 Bigtable 集群却不会互相拖垮——多租户隔离的设计演进（从软 QoS 到硬隔离）是 18 年踩坑踩出来的
- 为什么一个分布式数据库的"恢复速度"（MTTR）比"不出故障"（MTTF）更重要——Google 发现：在大规模集群里，故障是常态，恢复速度决定可用性
- 为什么 Cloud Bigtable 的计费模型和 API 设计跟内部版本完全不同——从内部工具到卖钱的云产品，变化比技术本身更剧烈
- 为什么 SSTable 这个 2006 年的文件格式 18 年后还在用——好的存储格式设计能穿越技术周期

## 核心要点

Bigtable 18 年生产复盘可以拆成**三个核心主题**：

1. **可靠性 = MTTR，不是 MTTF**：在大规模集群里，每时每刻都有机器在坏。与其追求"永不故障"（不可能），不如追求"故障后 3 秒内恢复"。类比：你不是追求一辈子不感冒，而是感冒后一天就能好。Google 的 MTTR 优化包括：tablet 并行恢复（不是一台一台慢慢拉起，而是所有宕机的 tablet 同时开始恢复）、预分区（提前拆分好 tablet，避免运行时分裂风暴）、hot standby（热备节点，master 挂了秒级切换）。

    原始设计的一个盲点是：tablet server 挂了之后，新 tablet server 要从 GFS 读 SSTable 重建内存状态，这个过程要读大量磁盘数据。18 年里最关键的 MTTR 优化是让恢复过程"尽量不读盘"——通过多副本内存缓存和并行恢复机制。

2. **多租户必须硬隔离**：早期 Bigtable 用"尽力而为"的软 QoS——给每个服务分配权重，高优服务多用资源。但在极端场景下（某个服务突然爆发写入），软 QoS 不够快，高优服务仍然被拖慢。类比：自助餐厅里大家都是"自己控制分量"，但来了一群饿极了的人一抢而空，别人就只能饿着。18 年后 Bigtable 改成了硬隔离：CPU pin（CPU 亲和绑定）、IO 限流（cgroup 级磁盘带宽硬上限）、内存上限（每个服务的 memtable 大小有硬顶，超了就拒绝写入而不是 OOM 全集群）。

3. **上云的变化比技术变化更难**：2015 年 Cloud Bigtable 发布时，团队以为"把内部系统打个包挂到公网卖就行了"。实际踩坑包括：计费模型（内部按"实际用量"粗算，外部要按"请求数 + 存储量 + 网络出流量"精确到分钱）、API 稳定性（内部可以随时改，外部一旦发布就不能 break）、权限模型（从几十个内部服务到上万个外部客户，cell-level ACL 彻底不够用）。

## 实践案例

### 案例 1：行键设计决定读写性能——两种方案对比

假设你存用户行为日志，有两种行键设计：

```
方案 A：user_id#timestamp  →  同一个用户的数据连续存储
方案 B：timestamp#user_id  →  同一秒的数据连续存储
```

在 Bigtable 里这是一个"选 A 还是选 B 就是选写性能还是选历史查询性能"的经典二选一：

- **方案 A** 让某用户的所有行为存在相邻位置，查询"用户 X 最近 30 天的行为"只需要一次连续扫描，很快。但如果某用户（比如名人账号）突然爆发大量写入，所有写请求打到同一台 tablet server，造成热点（hotspot）
- **方案 B** 让写入均匀分散到所有 tablet server，写入吞吐极高且无热点。但查询"用户 X 最近 30 天"需要扫描几乎全部数据

论文建议的折中方案是 **salting（加盐）**：在 user_id 前面加一个随机前缀（salt），比如 `hash(user_id) % 100 + "#" + user_id + "#" + timestamp`。哈希把写入打散到 100 个 tablet，查询时并发请求 100 个 tablet 再合并。

```python
# 没有加盐——写入热点
row_key = f"{user_id}#{timestamp}"
bigtable.write(row_key, data)

# 加盐后——写入均匀分散
salt = hash(user_id) % 100
row_key = f"{salt}#{user_id}#{timestamp}"
bigtable.write(row_key, data)
```

代价是：查询单个用户时需要并发扫描 100 个前缀，代码复杂度增加但换来了线性扩展的写入能力。

### 案例 2：时间序列数据——列族压缩 + TTL 自动淘汰

IoT 场景每秒收到数百万传感器读数。原始做法是每行一个时间点，但这样行数爆炸且压缩率低。Bigtable 的惯用做法是：

- **行键**：`sensor_id#day`（每个传感器每天一行）
- **列族**：一个列族存每秒读数，配置为 Snappy 压缩 + TTL 30 天

```python
# 行键按天聚合
row_key = f"{sensor_id}#{date}"

# 列名用秒级时间戳，Bigtable 会按列名排序存储
for reading in daily_readings:
    column = f"t_{reading.timestamp}"  # 列名排序后天然按时间
    bigtable.write(row_key, column, reading.value)

# 配置列族 TTL：30 天后自动删除
# gc_rule = max_age(datetime.timedelta(days=30))
```

Bigtable 的列族压缩对时间序列特别友好：相同传感器相邻秒的读数通常相近，压缩比可达 5-10 倍。TTL 让数据自动过期，不用写清理任务——这对运维来说是巨大的简化。

论文里特别提到：TTL 的 GC 是在 compaction（压缩合并）时执行的，不是实时删除。如果写入速度远大于 compaction 速度，磁盘空间会暂时膨胀，这是设计时就考虑到的取舍。

### 案例 3：多租户集群——防止吵闹邻居的具体策略

假设一个 Bigtable 集群同时服务三个业务：

| 服务 | 优先级 | 典型 QPS | 延迟要求 |
|------|--------|----------|----------|
| 支付系统 | 高 | 5K | p99 < 10ms |
| 用户画像 | 中 | 50K | p99 < 100ms |
| 日志分析 | 低 | 500K | p99 < 1s |

没有隔离时，日志分析的突发 500K QPS 可能挤占支付系统的 CPU 和 IO，让支付延迟从 5ms 飙升到 500ms——这是不可接受的。

Bigtable 的硬隔离策略分三层：

```python
# 1. CPU 隔离——支付系统独享 4 个核心
# (Bigtable server 配置，非用户代码)
cpu_pin(service="payment", cores=[0, 1, 2, 3])

# 2. IO 带宽硬上限——日志分析最多用 200MB/s
# 超了就排队而非抢占
io_throttle(service="logs_analytics", max_mbps=200)

# 3. Memtable 内存硬顶——日志分析 memtable 超过 2GB
# 就拒绝新写入（返回 RESOURCE_EXHAUSTED），而不是 OOM 全集群
memtable_limit(service="logs_analytics", max_gb=2)
```

日志分析的写入被拒绝后，客户端应该退避重试；支付系统的写入不受任何影响。论文强调：硬隔离比软 QoS 的运维成本低，因为"给每个服务一个确定的边界"比"动态调整权重"更容易预测和排查。

## 踩过的坑

1. **热 tablet 让集群的有效吞吐远低于理论值**：单行被频繁访问时，所有请求打到同一 tablet server，其余几十台机器全在旁观——行键设计差会让"分布式"变成"单机"。论文建议在开发阶段就用负载测试暴露热行。

2. **tablet 分裂风暴导致级联性能降级**：某个 tablet 突然膨胀到几十 GB，触发分裂后又触发 compaction，compaction 的 IO 又拖慢正常读写——像一个堵车口引发整个城市交通瘫痪。解法是预估写入量，提前划分好 tablet 边界（预分区），不要让系统自动修补。

3. **多租户软 QoS 在极端场景下失效**：权重和优先级算法是"平均情况"优化的，但在某个服务突然爆发（比如内部测试脚本写了一个死循环）时，软 QoS 的反应速度以秒计，而高优服务受影响只需毫秒——等你反应过来用户已经投诉了。

4. **Cloud Bigtable 的计费模型从"随便用"到"按量付费"的转变比技术挑战更痛苦**：内部 Bigtable 不收钱（只要不超团队配额），外部客户每一个请求都要精确计量和计费。论文透露：计费系统的 bug 比数据库本身的 bug 更让客户愤怒——多收一毛钱比性能慢 10% 的用户投诉多 100 倍。

## 适用 vs 不适用场景

**适用**：

- 海量时间序列数据（IoT 传感器、日志、监控指标）——行键按时间范围设计 + 列族 TTL 自动淘汰
- 需要单行强一致性的场景——Bigtable 同一行的读写是原子的，不需要分布式事务
- 写入远多于读取的场景（写多读少）——LSM 树结构对写入极度友好
- 数据规模在 TB 以上、需要自动分片的场景——tablet 分裂/合并是内置能力，不需要手动 shard

**不适用**：

- 需要复杂 SQL 查询（JOIN、聚合、子查询）——Bigtable 是 NoSQL，没有 SQL 层（Google 内部用 Dremel/BigQuery 补这个能力）
- 需要跨行事务——Bigtable 只保证单行原子性，跨行一致性需要上层系统（Megastore、Spanner）
- 小数据量（< 100GB）——Bigtable 的运维复杂度在这个量级不值得，用 PostgreSQL / SQLite 更合适
- 需要全文搜索——Bigtable 没有倒排索引，需要外挂 Elasticsearch 或 Google 内部的搜索系统

## 历史小故事（可跳过）

- **2004 年**：Google 的爬虫索引系统用 MySQL 分库分表（sharding），但维护越来越痛苦。Jeff Dean 和 Sanjay Ghemawat 开始设计 Bigtable——灵感来自"一个巨大的、排序的、多维的 map"。名字来源于"Big"（大）+ "Table"（表），直白但准确。

- **2006 年**：OSDI 发表 Bigtable 论文（Chang, Dean, Ghemawat 等 12 位作者），成为分布式系统领域引用最高的论文之一。论文里描述的 SSTable 格式至今仍是 Google 内部存储的基石。

- **2008-2014 年**：Bigtable 成为 Google 内部"一切服务的存储层"。Crawler（爬虫）、Google Earth、Google Analytics、YouTube 的元数据全部跑在上面。这段时间 Bigtable 的集群规模增长了 1000 倍，MTTR 从分钟级优化到了 10 秒级。

- **2015 年**：Google Cloud Bigtable 正式上线，但第一个版本"基本是把内部系统打了个包"，权限模型、计费系统、API 稳定性都是后来花了 3-4 年才补上的。

- **2018 年**：一次大规模故障让团队决定彻底重写恢复流程——并行 tablet 恢复 + 预分区在这个时间点成为标准配置，MTTR 降到 3 秒以内。

## 学到什么

1. **恢复速度比不出故障更重要**：在百万台机器级别，"每一秒都有机器在坏"不是夸张而是日常。系统的可用性不由"多久坏一次"决定，而由"坏了多久能好"决定。Bigtable 把 MTTR 从分钟压到秒级，18 年里这是对可用性贡献最大的单一优化。

2. **多租户的正确答案是硬隔离，不是智能调度**：Google 踩了 10 年坑的结论——在大规模下，确定性边界（每个服务最多用多少 CPU/IO/内存）比动态权重调度更可预测、更容易运维、更少出诡异问题。

3. **存储格式比存储引擎活得久**：SSTable 文件格式 2006 年定义，18 年后仍然在用——而上面跑的 tablet server 代码已经重写了至少 5 遍。好的数据格式设计是"向后兼容 + 向前扩展"的艺术。

4. **产品化比技术化难**：把内部系统变成云服务（Cloud Bigtable），最难的不是"怎么更快"而是"怎么计费""怎么定 SLA""怎么保证 API 不 break"——这些问题 2006 年的论文完全没提，但 2024 年成了最大挑战。

## 延伸阅读

- 原始论文：[Chang et al., "Bigtable: A Distributed Storage System for Structured Data", OSDI 2006](https://static.googleusercontent.com/media/research.google.com/en//archive/bigtable-osdi06.pdf)（14 页，零基础可读，先看 2006 版再回来看 2024 回顾）
- 视频讲解：[CMU 15-721 课堂讨论 Bigtable](https://15721.courses.cs.cmu.edu/spring2024/)（Andy Pavlo 的高级数据库课程，Bigtable 是阅读作业之一）
- [[bigtable-2006]] —— 原始 Bigtable 论文笔记，理解"Then"的部分再看"Now"
- [[gfs]] —— Bigtable 底层依赖的分布式文件系统，两者设计哲学一脉相承
- [[lsm-tree-1996]] —— LSM 树是 Bigtable 存储引擎的理论基础，理解它才能理解为什么 Bigtable 写入快

## 关联

- [[bigtable-2006]] —— 2006 年原始论文，描述 Bigtable 的设计初衷；2024 回顾是它 18 年后的成绩单
- [[gfs]] —— Bigtable 的持久化存储层，SSTable 文件存在 GFS 上，故障恢复也依赖 GFS 的多副本
- [[chubby]] —— Bigtable 用 Chubby 做 master 选举和 tablet 位置管理，Chubby 的可用性直接影响 Bigtable 的 MTTR
- [[mapreduce]] —— Google 早期的批量数据处理框架，常和 Bigtable 搭配使用：MapReduce 产出结果写入 Bigtable
- [[spanner]] —— Google 的"下一代"分布式数据库，在 Bigtable 之上加了 SQL + 强一致性 + 跨数据中心事务
- [[dynamo-amazon-2007]] —— Amazon 的分布式 KV 存储，和 Bigtable 同年诞生，代表了"高可用写入优先" vs "强一致读取优先"两种哲学
- [[lsm-tree-1996]] —— LSM 树的理论基础，Bigtable 的 SSTable + memtable 架构是 LSM 树最著名的工程实现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
