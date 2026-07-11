---
title: Aurora — 把数据库的下半身换成日志机
来源: 'Verbitski et al., "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases", SIGMOD 2017'
日期: 2026-05-29
分类: 数据库系统
难度: 高级
---

## 是什么

Aurora 是 AWS 2014 年上线的**云原生关系数据库**。日常类比：传统 MySQL 像一家"自己进货 + 自己摆货架"的小店——店员（DB 实例）每卖一件还要亲自跑仓库把货架（page）摆好。Aurora 把仓库管理外包了——店员只发一张"卖了什么"的小纸条（redo log），仓库（存储层）自己照着纸条把货架摆好。

这个改动一句话叫 **"the log is the database"**——日志就是数据库本身，page 不再是 DB 实例的产物，而是日志的视图。SIGMOD 2017 这篇论文公开了这个反直觉决定背后的工程取舍。

你今天用的每一个 Aurora cluster、每一个 Neon serverless Postgres、每一次"读副本几乎零延迟看到主写"——背后都是这篇论文画的回路：**DB 只发 redo，存储自己 replay；写靠 quorum，读靠 quorum；崩溃恢复在存储不在 DB**。

## 为什么重要

不理解 Aurora，下面这些事都没法解释：

- 为什么 RDS for MySQL 上线 5 年（2009→2014）后，AWS 还要重做一个 Aurora
- 为什么 Aurora 写吞吐能到 MySQL 的 5 倍，但 SQL 语法和客户端协议完全一样
- 为什么 Aurora 副本的复制延迟可以 < 20ms——传统主从经常秒级
- 为什么 Snowflake / Neon / Lakebase 这批"分离存算"的系统都把 Aurora 当哲学起点

## 核心要点

Aurora 的设计可以拆成 **三步反直觉决定**：

1. **DB 只发日志，不发 page**：传统 DB 写一行要发 7 类东西（redo / undo / binlog / page image / commit / ...）。Aurora 只发 redo log，存储层自己重放出 page。类比：寄包裹时只寄"组装说明书"让收件人自己拼，比寄成品省 90% 体积。

2. **6 副本 + 4/6 写 + 3/6 读 quorum**：写要 6 个存储节点中 4 个 ACK 才算成功，读要 3 个节点回应才算可信。4 + 3 > 6 满足 R + W > N（quorum 不变式）。类比：6 个会计记账，4 个签字才生效；查账时 3 个互相对帐才信。

3. **崩溃恢复在存储层做，不在 DB**：传统 DB 重启要扫所有 redo log 做 redo + undo——dirty page 越多越慢。Aurora 重启时 DB 实例只读元数据问"VDL 到哪了"，存储层后台早就在 replay 了。类比：店员下班时不用清点货架——仓库自己一直在整理。

## 实践案例

### 案例 1：网络流量降一个数量级

论文 §3.1 Table 1 对比 MySQL Multi-AZ 与 Aurora 写一条记录的网络开销：

```
MySQL Multi-AZ:  redo + undo + binlog + page image + commit + ... ≈ 16 KB/写
Aurora:          只 redo log                                       ≈ 100 字节/写
节省：                                                              7.7x
```

这不是优化常数级，是**设计哲学改变**——网络放大问题在云端 OLTP 的瓶颈位置，被一次性消除。

### 案例 2：4/6 quorum 容忍"整个 AZ 挂"

伪代码模拟写路径：

```python
# 6 storage nodes across 3 AZs (2 per AZ)
nodes = [Node(az=1), Node(az=1), Node(az=2), Node(az=2), Node(az=3), Node(az=3)]

def write(lsn):
    acks = parallel_send(nodes, lsn)
    if sum(acks) >= 4:        # Vw = 4
        return COMMITTED
    return BLOCKED            # 宁可不可写，也不脏写
```

**测试**：杀掉整个 AZ-2（2 个节点），剩 4 个仍能凑 ACK——写不阻塞。再杀 1 个：3 < Vw=4，**写阻塞而不是脏写**。Aurora 选 C 不选 A：超过容忍边界就拒绝写入。

为什么是 4/6 而不是 5/6 或 3/6？4/6 的写路径能容忍**一个 AZ 整挂**（剩 4 个 ACK）。如果再多挂 1 个节点，就只剩 3 个，写入会停住，但 3/6 读 quorum 仍能读到已经 durable 的数据。再激进一点（3/6）持久性不够，再保守一点（5/6）写延迟变差。

论文 §2 的 "tolerate AZ + 1 node failure" 指的是**不丢已提交数据、读路径仍有 quorum**，不是说这时还能继续写。这个边界正是副本数 6 × AZ 数 3 × 4/6 写 quorum × 3/6 读 quorum 的工程取舍。

### 案例 3：三条 LSN 水位线

Aurora 把"写到哪"细分为 3 个时间轴：

```
VCL (Volume Complete LSN)   = 存储层最高已收到连续 LSN（byte-level）
CPL (Consistency Point LSN) = mini-tx 边界（不能切开）
VDL (Volume Durable LSN)    = max(CPL ≤ VCL)，对外可见的"已提交"水位
```

类比：VCL 像快递员"已收件"，CPL 像"包裹已封箱"，VDL 像"客户能签收的最近一件已封箱包裹"。三者解耦让 Aurora 能在不阻塞写入的前提下推进可见性边界。

## 踩过的坑

1. **Aurora 不是 multi-master**：经典版本是单 writer + 多 reader。跨 region 同时写选 Spanner / CockroachDB / Aurora DSQL，不要把 Aurora 当 active-active 用——多 master 试验功能 2018 上过又被 deprecate。

2. **storage IO 不免费**：网络流量降 7.7x，但存储节点本地 IO 是 3 倍放大（持久化 WAL + replay → page + 上传 S3）。AWS 按 IOPS 单独收费就是这部分成本的 monetization。

3. **AZ 平衡靠 AWS 内部决策**：4/6 quorum 假设 3 个 AZ 同等可用，但 region 内 AZ 容量历史上有倾斜。客户没有 hint API 强制副本分布——这是论文 §2.2 的隐藏假设。

4. **大批量 DDL 仍是单点痛**：DDL 走 single writer 路径会阻塞所有写入。大表 ALTER 仍要 pt-online-schema-change / gh-ost——Aurora 没解决这个老问题。

## 适用 vs 不适用场景

**适用**：
- AWS 上单 region OLTP 高可用——3 AZ 4/6 quorum 是云上"足够好"的 sweet spot
- 读多写少 + 多副本同步分担读——Aurora 副本几乎零延迟
- 中等数据量（< 128 TB 早期、256 TB v3）+ MySQL / Postgres 兼容协议
- 需要 PITR 但不想自己维护备份——持续上传 S3 是 Aurora 设计的免费副产物
- AWS 内部从 Oracle 迁出 / 大客户从商业 DB 迁云——同协议无需改应用

**不适用**：
- 多 region active-active 写 → Spanner / CockroachDB / Aurora DSQL
- 极致低延迟 OLTP（< 1ms commit）→ 单机 Postgres / SQLite；Aurora 至少 4ms（4/6 中最慢节点决定）
- PB 级水平扩展 → TiDB / Yugabyte / Vitess
- 重 OLAP / 数据湖一体 → Snowflake Unistore / Databricks Lakebase
- 强一致跨 region（金融 / 全球账本）→ Spanner 仍是性价比上限

## 历史小故事（可跳过）

- **2009 年**：AWS 上线 RDS for MySQL，把单机 MySQL 装进 VM——写入吞吐受限于"page + binlog 同步"
- **2010–2013 年**：Amazon.com 想离开 Oracle，需要"像 MySQL 但跨 3 AZ 高可用"的东西
- **2014 年**：Aurora MySQL 商用上线，Verbitski 主导 storage layer，AWS 不公开架构细节
- **2017 年**：SIGMOD 工业 track 论文 12 页公开 "the log is the database" 哲学
- **2018 年**：续作 SIGMOD 2018 "Avoiding Distributed Consensus for I/Os" 补 quorum 与 gossip 细节
- **2021 年**：Neon 上线，OSS 实现了 Aurora 同哲学 + branching（git-like 数据分支）
- **2024 年**：Aurora DSQL 上线——AWS 自己承认经典版本不够多 region，开始走 Spanner 路线

40 年 OLTP 数据库哲学在这点分流：**算 + 存绑死** vs **算 + 存解耦**。Aurora 是后者的工业标杆。

## 学到什么

1. **瓶颈位置随技术迁移**：磁盘从机械盘到 SSD，CPU 从单核到多核——Aurora 看到下一个瓶颈在 DB 与 storage 之间的网络，于是从那里下刀
2. **改设计哲学比优化常数级有效一个数量级**：把"DB 发 page"改成"DB 发 log"不是局部优化，是重新定义边界
3. **quorum 给的承诺比 sync standby 更硬**：4/6 容忍整 AZ 挂；sync standby 只能跨 AZ 一份镜像、单点失败仍暴露
4. **"日志即真值"是云原生系统的共同哲学**：Kafka / Aurora / git / WAL-shipping replication 都是同一思路的不同实例
5. **崩溃恢复要在设计阶段决策，不是事后补丁**：Aurora 把"谁负责 recovery"前置到了存储层——这种选择后续不可逆。设计自己系统时，第一天就要问"谁负责 recovery"

## 延伸阅读

- 论文原文：[Aurora SIGMOD 2017 PDF](https://web.stanford.edu/class/cs245/readings/aurora.pdf)（12 页，工业 track 措辞较 industry-friendly）
- 续作：[Aurora SIGMOD 2018 — Avoiding Distributed Consensus for I/Os](https://dl.acm.org/doi/10.1145/3183713.3196937)（补 quorum + gossip 协议细节）
- OSS 锚点：[neondatabase/neon](https://github.com/neondatabase/neon)（Rust + Postgres 兼容，同哲学的开源实现）
- AWS 官方深度博客：[Amazon Aurora under the hood — quorum and correlated failure](https://aws.amazon.com/blogs/database/amazon-aurora-under-the-hood-quorum-and-correlated-failure/)
- [[kafka]] —— "log is everything" 哲学的另一头工程化
- [[spanner]] —— Aurora 的哲学反面：分布式共识 + 多 region 强一致

## 关联

- [[kafka]] —— "日志即真值"的另一头：Kafka 把 broker 做成 log-only，Aurora 把 storage 做成 log-replayer
- [[spanner]] —— 同期分布式 SQL 的两条路线：Aurora（单 writer + 共享存储）vs Spanner（shared-nothing + Paxos per range）
- [[dynamo]] —— quorum 哲学的奠基；Aurora 的 4/6 + 3/6 是 Dynamo R + W > N 不变式在 OLTP 上的落地
- [[gfs]] —— "存储层独立 + 多副本写"思路的源头，Aurora 把它从分布式文件搬到分布式 SQL
- [[bigtable]] —— 共享日志 + LSM 存储的工业先驱，Aurora 是关系世界的对应物
- [[snowflake]] —— 同期分离存算 OLAP 系统；Aurora 反过来用同思路做 OLTP
- [[paxos]] —— Aurora 选 quorum 而非 Paxos，就是为了避免"chatty recovery"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[azure-storage-2011]] —— Windows Azure Storage 2011 — 云对象存储第一次在工业界做到强一致
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[cockroachdb-2020]] —— CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[foundationdb-2021]] —— FoundationDB 2021 — 把数据库拆成五个角色，再用一个 seed 烧十年 bug
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[memcached-fb-2013]] —— Scaling Memcache at Facebook — 万台缓存怎么不被踩塌
- [[paxos]] —— Paxos — 分布式共识算法
- [[pnuts-2008]] —— PNUTS — 介于强一致与最终一致之间的实用一致性
- [[rocksdb-2017]] —— RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[tao-2013]] —— TAO — Facebook 给十亿人好友列表造的专用图数据库
- [[tidb-2020]] —— TiDB 2020 — 给 Raft 加一个"旁听生"，让一份数据同时跑事务和分析
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账

