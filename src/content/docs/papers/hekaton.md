---
title: Hekaton — SQL Server 内存优化 OLTP 引擎
来源: 'Diaconu et al., "Hekaton: SQL Server''s Memory-Optimized OLTP Engine", SIGMOD 2013'
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：给收银台换一套「内存工作台」

想象一家连锁超市的收银系统。传统 SQL Server 像**带保险柜的柜台**：每笔交易都要打开抽屉（页锁）、在账本里找页码（B-tree 页 latch）、写完后还得把整页抄进保险柜（刷盘）。顾客一多，大家就在抽屉和页锁前排长队——CPU 核心越多，抢同一把锁的人反而越多，吞吐上不去。

Hekaton 的思路是：**在柜台旁边加一张内存工作台**。热数据（订单行、库存扣减、会员积分）直接放在工作台上，用 T-SQL 照常操作；冷数据（历史报表、归档）仍留在保险柜里。工作台不抢页锁、不靠分区把顾客赶到不同窗口——任何收银员（线程）都能直接摸到任意一行，靠**乐观多版本**解决「两人同时改同一商品」的冲突。

更狠的一步：针对只碰内存表的 stored procedure，SQL Server 把 T-SQL **编译成原生机器码**——相当于把「查价 → 扣库存 → 打小票」写成一条专用流水线，而不是每步都走通用解释器。

论文发表于 SIGMOD 2013，产品化后成为 SQL Server 2014 的 **In-Memory OLTP** 功能。Hekaton 不是独立数据库，而是嵌在 SQL Server 里的第二套存储/执行引擎。

---

## 是什么

**Hekaton**（希腊语「百手巨人」）是 Microsoft 为 **OLTP + 大内存 + 多核** 设计的内存数据库引擎，核心主张：

1. **声明即用**：`CREATE TABLE ... MEMORY_OPTIMIZED`，无需换 DBMS。
2. **混合访问**：单条 SQL / 单事务可同时读写 Hekaton 表与传统磁盘表。
3. **原生编译**：只引用 Hekaton 表的 stored procedure 可编译为 C 再链接成 DLL，显著降低每请求指令数。
4. **高并发**：性能关键路径上**无 latch、无锁表**；用 latch-free 索引 + 乐观 MVCC。
5. **完整 ACID**：内存驻留但仍 durable——checkpoint + 日志，崩溃可恢复。

论文作者团队：Cristian Diaconu、Craig Freedman、Per-Åke Larson 等（Microsoft Research / SQL Server 组）。

---

## 为什么传统 SQL Server 不够

论文开篇做过「乐观上界」分析：即便把现有引擎的**扩展性**和 **CPI（每指令周期）** 都优化到极致，吞吐最多也就 **3–4×**；要 **10–100×** 必须换存储与执行模型。瓶颈来自：

| 瓶颈 | 表现 |
|------|------|
| **Latch / spinlock** | B-tree 页、缓冲池热点；核数 >6 时 CPU 利用率卡在 ~40% |
| **锁管理器** | 行锁/页锁竞争、锁表本身成为共享状态 |
| **日志尾** | 高并发写时 transaction log 末尾串行 |
| **解释执行** | 通用 T-SQL 路径指令多、分支多 |

Hekaton 的三板斧：**少指令**（原生编译）、**少等待**（latch-free + 无锁并发控制）、**数据在内存**（按行存储、索引为内存结构设计）。

设计还刻意**不做数据分区**来换扩展性——论文认为单机内存能放下时，不分区反而更快；扩展性靠无锁结构而非 sharding。

---

## 核心概念

### 1. 双引擎共存（Regular vs Hekaton）

- **Regular 表**：传统页式存储、B-tree、buffer pool、WAL。
- **Hekaton 表**：行存于内存；每表至少一个索引（**无堆表**）；支持 **hash 索引**（点查）和 **Bw-tree 范围索引**（范围扫描）。

用户可渐进迁移：先改最热的一张表，再编译最热的一个 procedure，其余不动。

### 2. 行格式与嵌入式索引链

Hekaton 每行物理上三段：

1. **用户列数据**
2. **索引链接列**：每个索引一列，把相同键的行串成链表（类似 Linux kernel 的 intrusive list）——更新索引时只改指针，不必像 B-tree 那样搬页
3. **MVCC 头**：逻辑 begin/end timestamp（版本可见区间）

读操作在索引链上扫描同键所有版本，只返回 begin ≤ 读时间戳 < end 的版本。

### 3. Latch-free 索引

Hash 与 Bw-tree 的实现保证多线程并发 insert/delete/lookup 时**不用 latch**。这与「无锁并发控制」不同：

- **Latch**：保护物理结构（页、桶）——短临界区，可阻塞
- **Lock**：保护逻辑事务隔离——Hekaton 在事务层不用传统锁表

### 4. 乐观多版本并发控制（O-MVCC）

更新 = **删除旧版本 + 插入新版本**（copy-on-write 语义）：

- DELETE：先把 end timestamp 设为事务 ID（未提交），提交后改为 commit timestamp
- INSERT：begin timestamp 同样先写事务 ID，提交后定稿
- 读可能依赖未提交版本 → 记录 **commit dependency**；依赖方 abort 会级联

隔离级别映射：

| 提交前校验 | 隔离级别 |
|------------|----------|
| 不校验 phantom / read stability | Snapshot |
| 校验 read stability | Repeatable Read |
| 两者都校验 | Serializable |

每个事务有 **read timestamp**（通常 = begin timestamp）和 **commit timestamp**；提交时验证 read set 仍有效，并按 scan set 重扫以防 phantom。

### 5. 原生编译（Native Compilation）

流程：T-SQL → 查询优化器 → **MAT**（Mixed Abstract Syntax Tree，混合元数据/命令式/表达式/计划）→ **PIT**（Pure Imperative Tree）→ C 代码 → 编译链接进引擎。

关键优化：

- 查询计划编译成**单个函数**，算子用 **label + goto** 串联，避免递归调用栈
- 编译期类型已知 → 消除动态 dispatch
- 仅 Hekaton 表、固定 schema、单事务内的 procedure 可 natively compile；复杂算子（sort、部分内置函数）仍走解释路径

### 6. 持久化：无 WAL 页刷、有日志与 Checkpoint

内存表不刷「数据页」，但仍 durable：

- **Log stream**：每事务提交写**一条**记录（批量刷盘）
- **Checkpoint stream**：**data stream**（某逻辑时间段内所有 insert）+ **delta stream**（同段内 delete 的版本 ID）
- 索引操作**不记日志**——恢复时重建索引，把 bulk 成本挪到 recovery

恢复时并行处理 data/delta 对。

### 7. 垃圾回收（GC）

版本变垃圾当：

1. 创建它的 transaction rollback；或
2. 已被 delete，且所有活跃事务的 read timestamp 都晚于 delete 时间

- **Online GC**：索引扫描时顺手 unlink 垃圾版本（热路径自清理）
- **Offline GC**：后台线程周期性扫「冷角落」，与事务处理交错以免堆积

---

## 代码示例

### 示例 1：创建内存优化表与索引

SQL Server 2014+ 语法（论文思想的直接产品化；具体选项随版本略有差异）：

```sql
-- 需要先启用数据库级 In-Memory OLTP 文件组（略）
CREATE TABLE dbo.OrderLine (
    OrderId   INT           NOT NULL,
    LineNo    INT           NOT NULL,
    ProductId INT           NOT NULL,
    Qty       INT           NOT NULL,
    UnitPrice DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_OrderLine PRIMARY KEY NONCLUSTERED
        HASH (OrderId, LineNo) WITH (BUCKET_COUNT = 1000000)
) WITH (
    MEMORY_OPTIMIZED = ON,
    DURABILITY = SCHEMA_AND_DATA   -- 或 SCHEMA_ONLY（无持久化，更快）
);

-- 范围索引：按 ProductId 查某商品所有订单行
CREATE NONCLUSTERED INDEX IX_OrderLine_Product
    ON dbo.OrderLine (ProductId)
    WITH (BUCKET_COUNT = 500000);
```

要点：

- 必须有 **PRIMARY KEY**（hash 或 range）
- `BUCKET_COUNT` 影响 hash 冲突与内存；过小则链变长
- `DURABILITY = SCHEMA_ONLY` 适合纯缓存型数据（论文中的非 durable 场景）

### 示例 2：原生编译 Stored Procedure

```sql
CREATE PROCEDURE dbo.PlaceOrder
    @OrderId INT,
    @ProductId INT,
    @Qty INT,
    @UnitPrice DECIMAL(10,2)
WITH NATIVE_COMPILATION, SCHEMABINDING, EXECUTE AS OWNER
AS
BEGIN ATOMIC WITH (
    TRANSACTION ISOLATION LEVEL = SNAPSHOT,
    LANGUAGE = N'us_english'
)
    DECLARE @LineNo INT;

    SELECT @LineNo = ISNULL(MAX(LineNo), 0) + 1
    FROM dbo.OrderLine
    WHERE OrderId = @OrderId;

    INSERT INTO dbo.OrderLine (OrderId, LineNo, ProductId, Qty, UnitPrice)
    VALUES (@OrderId, @LineNo, @ProductId, @Qty, @UnitPrice);
END;
GO
```

约束（与论文一致）：

- `NATIVE_COMPILATION` + `SCHEMABINDING` + `BEGIN ATOMIC`：整个 procedure 在一个编译单元、单事务内
- 只能访问 **memory-optimized 表**；引用磁盘表则退化为 interpreted interop
- 隔离级别在 procedure 头声明；编译器针对 snapshot 等路径生成专用代码

### 示例 3：混合事务（Hekaton + Regular）

Interop 是论文强调的产品优势——迁移不必一步到位：

```sql
BEGIN TRAN;

    -- 内存表：高频订单行
    UPDATE dbo.OrderLine WITH (SNAPSHOT)
    SET Qty = Qty - 1
    WHERE OrderId = @OrderId AND ProductId = @ProductId;

    -- 磁盘表：审计日志（低频、可归档）
    INSERT INTO dbo.AuditLog (EventTime, OrderId, Action)
    VALUES (SYSUTCDATETIME(), @OrderId, N'decrement');

COMMIT;
```

Hekaton 路径走 O-MVCC；磁盘表仍走传统锁与 WAL——优化器/事务协调器负责统一 commit。

---

## 架构一图

```text
                    ┌─────────────────────────────────┐
                    │         T-SQL / ODBC            │
                    └───────────────┬─────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
     │  Interpreted   │   │ Native Compiled│   │  Regular Engine│
     │  (interop)     │   │  Procedures    │   │  (disk tables) │
     └────────┬───────┘   └────────┬───────┘   └────────┬───────┘
              │                    │                    │
              └──────────┬─────────┘                    │
                         ▼                              │
              ┌──────────────────────┐                  │
              │   Hekaton Engine     │◄── cross-engine ─┘
              │  latch-free indexes  │     transactions
              │  O-MVCC + row store  │
              └──────────┬───────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ In-mem   │   │ Log /    │   │ Checkpoint│
   │ indexes  │   │ durable  │   │ streams   │
   └──────────┘   └──────────┘   └──────────┘
```

---

## 实验结果（论文 §9 摘要）

测试环境：Xeon X5650，最高 12 核；表约 6 列 × 2000 万行。

### CPU 效率（RandomLookups / RandomUpdates）

| 场景 | 相对传统引擎 |
|------|----------------|
| 每次 10+ 次点查 | ~**20×** 更少 CPU cycles（约 5%  cycles） |
| 单次点查 | ~10.8× |
| 每次 100+ 行更新 | ~**30×** |
| 绝对吞吐 | 单核 ~270 万次 lookup/s；~190 万次 update/s（写缓存开启测 CPU，非磁盘延迟） |

Hekaton 日志量在该更新基准上比 regular 少约 **57%**（行级、无页镜像）。

### 扩展性（高争用 OLTP 模拟）

| 配置 | 12 核吞吐 (txn/s) | 相对 regular |
|------|-------------------|--------------|
| Regular SQL Server | ~2,312 | 1×（2→12 核仅 2.3×） |
| Hekaton interop | ~7,709 | ~3.3× |
| Hekaton + native compile | ~**36,375** | ~**15.7×** |

Hekaton 在 2→12 核上约 **5.1×** 线性扩展；regular 受 latch 限制明显。

---

## 与后续技术的关系

| 论文概念 | 后续影响 |
|----------|----------|
| 嵌入式双引擎 | SQL Server 2014 **In-Memory OLTP** |
| Bw-tree | 微软后续多篇 Bw-tree 论文；影响 main-memory 索引设计 |
| 原生编译 T-SQL | 限制较多但成为「极致 OLTP」卖点 |
| 无分区扩展 | 与 NewSQL 分片路线对比；Hekaton 主打** scale-up** |
| O-MVCC + 无锁结构 | 与 Silo、LMDB 等内存 OLTP 设计同代；商业产品少见地完整落地 |

读 Hekaton 有助于理解：**为什么「内存数据库」在 2010 年代必须重新做索引和并发控制，而不是只把 buffer pool 变大**。

---

## 局限与论文未覆盖点

- **容量**：受单机内存限制；超大 working set 仍需 regular 表或分库。
- **Native procedure 约束**：schema 固定、算子子集、单事务——复杂 ETL 仍用 interpreted。
- **索引重建恢复**：缩短日志但拉长 recovery；适合 OLTP 短恢复窗口假设。
- **2013 年后硬件**：NVMe、持久内存、RDMA 等未在本文讨论。

---

## 自检清单（零基础读完应能回答）

1. Hekaton 与「单独买一个内存数据库」相比，集成进 SQL Server 的四个产品级好处是什么？
2. **Latch-free** 与 **lock-free 事务（无锁表）** 分别解决哪类竞争？
3. 为什么 UPDATE 在 Hekaton 里是 delete + insert？对索引链表有什么影响？
4. 原生编译为什么用 goto 串计划而不是函数调用树？
5. 若只把表改成 `MEMORY_OPTIMIZED` 但不编译 procedure，论文实验里大约能拿到多少倍吞吐提升？

---

## 延伸阅读

- 同会议 / 同期：Bw-tree 原始论文（Levandoski et al.）
- 对比阅读：Silo（MIT，decomposition of OLTP）、H-Store / VoltDB 分区 OLTP
- 产品文档：Microsoft Docs — In-Memory OLTP (Memory-Optimized Tables)
- 论文 PDF：[ACM DOI 10.1145/2463676.2463710](https://doi.org/10.1145/2463676.2463710)

---

## 一句话总结

**Hekaton 把 OLTP 热路径搬进内存、去掉 latch 与传统锁、用乐观 MVCC 保隔离，并把 T-SQL 编译成机器码——在不换 DBMS 的前提下，让 SQL Server 在 multicore 上从「抢锁排队」变成「多收银员共用一个无抽屉锁的工作台」。**
