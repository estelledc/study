---
title: FoundationDB — 把事务、日志和存储拆开，再用仿真守住正确性
来源: 'Zhou et al., "FoundationDB: A Distributed Unbundled Transactional Key Value Store", SIGMOD 2021'
日期: 2026-05-29
分类: databases
难度: 高级
---

## 是什么

日常类比：传统数据库像一家小餐馆，点单、收钱、做菜、记账、盘库存都挤在一个柜台；FoundationDB 像把这些工种拆成前台、收银、厨房、仓库和质检，每个岗位只做一件事，但整套流程仍然保证账不会乱。

FoundationDB（简称 **FDB**）是一个**分布式、有序、事务型 key-value 数据库**。它对外看起来只是存取 key 和 value，但内部提供 ACID 事务、严格串行化、自动故障恢复和跨机器复制。

这篇论文的核心价值不只是“又一个分布式数据库”，而是展示三件工程能力怎么组合：**分层架构**让上层可以自己搭 SQL / 文档 / 记录模型，**事务 KV**给所有上层统一的强一致底座，**确定性仿真**把最难复现的分布式故障提前抓出来。

## 为什么重要

不理解 FoundationDB，下面这些事都没法解释：

- 为什么一个裸 KV 也能支撑 CloudKit、Record Layer、元数据服务这类强一致应用
- 为什么“事务系统”和“存储系统”可以拆成不同角色，而不是一定绑在同一个数据库进程里
- 为什么分布式系统的测试不只是单元测试，还要把网络、磁盘、时钟、故障都放进同一个可重放剧本
- 为什么 FDB 的恢复可以做到几秒级，因为恢复不用重放整座数据库的日志

## 核心要点

理解 FDB，先抓住三个词：**unbundled、OCC、simulation**。

1. **Unbundled（拆角色）**：Client、Proxy、Resolver、LogServer、StorageServer 各管一段流程。类比：快递公司把下单、分拣、运输、仓储分开，哪里忙就扩哪里，而不是把所有员工塞进一个窗口。

2. **OCC（乐观并发控制）**：读数据时不加锁，提交时再检查读过的范围有没有被别人改过。类比：你先拿购物清单去逛超市，结账时才确认货架价格有没有变；变了就重来，没变就付款。

3. **Simulation（确定性仿真）**：FDB 把真实数据库代码放进一个模拟世界里跑，网络延迟、进程宕机、磁盘错误都由 seed 决定。类比：消防演习不是口头问“如果着火怎么办”，而是在同一栋模型楼里反复重放同一场火灾。

这三点合在一起，形成一个强一致数据库工程体系：前台 API 很简单，内部职责拆得很细，正确性靠仿真长期兜底。

## 实践案例

### 案例 1：一次 FDB 事务长什么样

```python
import fdb
fdb.api_version(720)
db = fdb.open()

@fdb.transactional
def transfer(tr, src, dst, amount):
    a = int(tr[src].decode())
    b = int(tr[dst].decode())
    tr[src] = str(a - amount).encode()
    tr[dst] = str(b + amount).encode()
```

**逐部分解释**：

- `@fdb.transactional` 会把函数包进事务，失败时自动重试
- `tr[src]` 和 `tr[dst]` 是读取，客户端会记下“我读过哪些 key”
- 两次赋值只是先缓存在客户端，真正提交时才发给集群
- 如果提交时发现余额相关 key 被别人改过，事务会 abort 并从头重试

### 案例 2：Resolver 怎么判断要不要 abort

```text
T1: read_version = 100, read range = [user:1, user:9]
T2: commit_version = 105, write key = user:3

T1 commit:
  resolver 查最近 5 秒的写历史
  user:3 落在 [user:1, user:9] 里
  说明 T1 读过的范围已经被 T2 改过
  结果：T1 abort，客户端重试
```

**逐部分解释**：

- FDB 用 MVCC 给读请求一个稳定快照，所以读不需要挡住写
- Resolver 只检查“读范围”和“后来的写范围”是否重叠
- 这种做法省掉了锁管理，但代价是热点冲突时会有更多重试

### 案例 3：确定性仿真为什么有用

```bash
fdbserver -r simulation -s 12345
```

**逐部分解释**：

- `-r simulation` 表示不是连真实网络，而是在模拟网络里跑真实 FDB 代码
- `-s 12345` 是随机种子，同一个 seed 会生成同一串延迟、宕机和恢复事件
- 只要某次 CI 失败留下 seed，开发者就能在本机重放同一个 bug
- 这比“线上偶现一次，然后靠日志猜”可靠得多

## 踩过的坑

1. **把 FDB 当普通 SQL 数据库用**：原因是 FDB 只提供有序 KV，SQL、索引和 schema 通常要由上层 layer 提供。

2. **忘记 5 秒 MVCC 窗口**：原因是 Resolver 和 StorageServer 只保留短时间多版本数据，长事务会变成 `too_old`。

3. **低估热点 key 冲突**：原因是 OCC 在低冲突时很快，但所有事务都改同一个 key 时会反复 abort。

4. **以为确定性仿真等于模型检查**：原因是仿真跑的是真实实现和大量随机场景，但它不保证穷尽所有状态。

## 适用 vs 不适用场景

**适用**：

- 强一致元数据、索引、配额、任务队列这类小事务高可靠场景
- 需要在 KV 之上搭自己的数据模型，例如 Record Layer、文档层或业务专用层
- 团队愿意把事务重试、热点拆分、长任务切片写进应用逻辑
- 分布式系统团队希望用确定性仿真提高发布信心

**不适用**：

- 只想开箱即用写 SQL 和 ORM 的普通业务系统
- 单机 PostgreSQL 已经够用的小规模应用
- 大批量 OLAP 扫描、长事务迁移或跨小时数据处理
- 高冲突计数器、秒杀库存这类所有请求都打同一个 key 的负载

## 历史小故事（可跳过）

- **2009 年**：FoundationDB Inc. 开始研发，目标是做一个分布式 ACID KV。
- **2013 年**：FoundationDB 早期产品发布，确定性仿真已经是核心开发方法。
- **2015 年**：Apple 收购 FoundationDB，公司产品暂停公开下载，技术转入内部使用。
- **2018 年**：Apple 将 FoundationDB 以 Apache-2.0 许可证开源，社区重新开始围绕它搭 layer。
- **2021 年**：SIGMOD 论文系统公开 unbundled 架构、事务流程、恢复设计和仿真测试经验。

## 学到什么

1. **强一致不只靠一个协议**：FDB 同时使用版本分配、OCC 冲突检测、日志复制和 MVCC，拼起来才形成严格串行化。

2. **架构拆分会改变扩展方式**：Proxy、Resolver、LogServer、StorageServer 分开后，读、写、冲突检测和持久化可以按瓶颈分别扩容。

3. **恢复路径越短，可用性越高**：FDB 把日志回放放在后台正常路径里做，所以故障恢复主要是选出新事务系统和确定恢复版本。

4. **测试能力也是系统设计的一部分**：如果代码一开始就要求确定性，网络、磁盘、时间都能被模拟，很多生产事故会提前变成可复现测试。

## 延伸阅读

- 论文 PDF：[FoundationDB: A Distributed Unbundled Transactional Key Value Store](https://www.foundationdb.org/files/fdb-paper.pdf)（SIGMOD 2021，工业系统论文）
- 官方仓库：[apple/foundationdb](https://github.com/apple/foundationdb)（真实实现、Flow actor 和 simulation 都在里面）
- 视频：[Testing Distributed Systems w/ Deterministic Simulation](https://www.youtube.com/watch?v=4fFDFbi3toc)（理解 FDB 测试哲学的好入口）
- [[gray-1981-transaction]] —— 先理解事务为什么要提供 ACID，再看 FDB 怎么把它分布式化
- [[spanner-2012]] —— 对照另一条强一致数据库路线：TrueTime、2PC 和全球复制

## 关联

- [[spanner-2012]] —— Spanner 用时间 API 做全球一致性，FDB 用单调版本和 OCC 做事务排序
- [[calvin-2012]] —— Calvin 先给事务排队再执行，FDB 则先读快照、提交时检测冲突
- [[percolator-2010]] —— Percolator 在 Bigtable 上叠事务，FDB 则把事务能力做成底层 KV 能力
- [[aurora]] —— Aurora 也拆日志和存储，但它仍服务 SQL 数据库；FDB 选择更底层的 KV 抽象
- [[bigtable-2006]] —— Bigtable 提供可扩展有序表，FDB 在类似 KV 直觉上补齐跨 key 事务
- [[paxos-1998]] —— FDB 的协调元数据依赖 quorum 思想，Paxos 是理解这类容错复制的基础
- [[sqlite]] —— FDB StorageServer 曾用 SQLite B-tree 落盘，说明复杂系统也会复用成熟小组件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库
