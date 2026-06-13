---
title: Hekaton SQL Server Memory-Optimized OLTP Engine
来源: https://www.microsoft.com/en-us/research/wp-content/uploads/2013/06/Hekaton-Sigmod2013-final.pdf
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# Hekaton — SQL Server 的内存优化 OLTP 引擎

> 论文：Cristian Diaconu 等人，Microsoft，SIGMOD 2013

## 1 一个日常类比：从纸质档案室到电子活页夹

想象你是一家大公司的档案管理员。传统的数据库就像**纸质档案室**：

- 文件存在硬盘里（文件柜）
- 每次要查文件，你得去文件柜里翻找（磁盘 I/O）
- 翻到一半有人也要用同一份文件，你得锁住它（锁 / latch）
- 要改一份文件，得先复制再改，不然别人会看到半成品（写前日志 WAL）

Hekaton 的想法很简单：**现在内存（RAM）便宜了，为什么不让所有文件都在桌面上？**

- 所有数据常驻内存（文件全摊在桌上）
- 不用去柜子里翻（零磁盘 I/O 查数据）
- 每个人都可以同时处理桌上的不同文件（无锁并发）
- 改文件时，不是原地改，而是新建一份新版本（多版本）

这样做的结果：原来做 1 万笔交易需要 10 秒，现在可能只要 0.1 秒。

## 2 核心概念

### 2.1 内存优化表（Memory-Optimized Table）

传统 SQL Server 的表存在磁盘上，按需加载到内存。Hekaton 引入了**内存优化表**——用 `MEMORY_OPTIMIZED = ON` 创建的表，整个表始终驻留在内存中。

用户用完全相同的 T-SQL 来查询和操作这些表，对应用程序几乎是透明的。

### 2.2 无锁数据结构（Latch-Free Data Structures）

传统数据库中，每个内存页面都需要一个 **latch**（轻量锁）来保护。当 100 个 CPU 核心同时访问同一个页面时，99 个必须等待。这是扩展性的最大敌人。

Hekaton 的所有内部数据结构——哈希表、范围索引、内存分配器、事务映射——都是**完全无锁**的。任何线程可以访问任何行，无需获取 latch 或锁。

**类比：** 传统锁机制就像一条单行道，所有车都得排队等绿灯。Hekaton 的无锁结构就像立交桥——每辆车都有自己的车道，互不干扰。

### 2.3 乐观 MVCC（Optimistic MVCC）

传统数据库使用**悲观锁**：先加锁，再操作，防止冲突。

Hekaton 使用**乐观并发控制**（OCC）+ **多版本**（MVCC）：

1. 先做操作，不锁任何东西
2. 提交时再检查有没有冲突
3. 如果有冲突，回滚重试；如果没有，提交成功

```
传统方式（悲观）：
  SELECT ... → 加锁 → 修改 → 提交解锁

Hekaton 方式（乐观）：
  SELECT ... → 修改（不锁）→ 提交时验证 → 成功则提交，失败则重试
```

多版本意味着：每次更新不是修改旧数据，而是创建新版本。旧版本仍然存在，只是标记为"过期"。这样不同事务可以同时看到不同时间点的数据快照。

### 2.4 编译到原生代码（Native Code Compilation）

传统 SQL Server 用**解释器**执行 SQL：每次查询都要经过解析、检查、调度等大量指令（即使是一条简单的查询也要几十万个 CPU 指令）。

Hekaton 把存储过程**编译成本地机器代码**：

- 生成的代码只包含实际需要的指令
- 大量决策在编译时完成（数据类型已知、权限已验证）
- 整个查询计划被折叠成**单个函数**，用 goto 连接各个操作符
- 避免函数调用开销

**类比：** 解释执行就像每个厨师读一本食谱（每一步都查书）；原生编译就像把食谱翻译成厨师母语并背下来（执行时直接照着做）。

### 2.5 Bw-Tree（Bw-Tree）

传统 B-Tree 索引在内存中使用时，每次修改都要加 latch 保护页面。Hekaton 使用 **Bw-Tree**——B-Tree 的无锁多版本变体。

Bw-Tree 的关键思想：

- 每个节点都有版本号
- 修改操作不是就地更新，而是创建新版本
- 用 CAS（比较并交换）原子操作来更新指针
- 删除用"墓碑"标记（tombstone），不真正删除

## 3 代码示例

### 3.1 创建内存优化表

```sql
-- 第一步：在数据库中添加文件组，用于存放内存优化数据
ALTER DATABASE MyDB
ADD FILEGROUP HekatonFG CONTAINS MEMORY_OPTIMIZED_DATA;

-- 第二步：添加文件到文件组
ALTER DATABASE MyDB
ADD FILE (NAME = 'hekaton_data', FILENAME = 'D:\HekatonData')
TO FILEGROUP HekatonFG;

-- 第三步：创建内存优化表（核心步骤）
CREATE TABLE Accounts (
    AccountId   INT         NOT NULL PRIMARY KEY NONCLUSTERED HASH
                          WITH (BUCKET_COUNT = 1000000),
    CustomerName NVARCHAR(50) NOT NULL,
    City         NVARCHAR(50) NOT NULL,
    Amount       DECIMAL(18, 2) NOT NULL,
    INDEX idx_City NONCLUSTERED (City)
)
WITH (MEMORY_OPTIMIZED = ON,
      DURABILITY = SCHEMA_AND_DATA);
```

**关键细节：**
- `HASH` 索引需要指定 `BUCKET_COUNT`——哈希桶的数量。设太小会导致冲突，设太大会浪费内存。一个经验法则是设为预期行数的 1-2 倍。
- `NONCLUSTERED` 表示这是非聚集索引（内存表中不支持聚集索引）。
- `SCHEMA_AND_DATA` 表示数据持久化（持久化模式也可以是 `SCHEMA_ONLY`，用于临时表）。

### 3.2 编译存储过程

```sql
-- 创建一个编译到原生代码的存储过程
-- 核心：添加 NATIVE_COMPILATION 和 SCHEMABINDING 两个选项
CREATE PROCEDURE TransferMoney
    @FromAccount INT,
    @ToAccount   INT,
    @Amount      DECIMAL(18, 2)
WITH NATIVE_COMPILATION, SCHEMABINDING, EXECUTE AS OWNER
AS
BEGIN ATOMIC
    WITH (
        ISOLATION LEVEL = SERIALIZABLE,
        LANGUAGE = N'English'
    )
    -- 验证余额充足
    IF (SELECT Amount FROM dbo.Accounts
        WHERE AccountId = @FromAccount) < @Amount
    BEGIN
        RAISERROR('余额不足', 16, 1);
        RETURN;
    END

    -- 转账：从源账户扣款
    UPDATE dbo.Accounts
    SET Amount = Amount - @Amount
    WHERE AccountId = @FromAccount;

    -- 转账：向目标账户加款
    UPDATE dbo.Accounts
    SET Amount = Amount + @Amount
    WHERE AccountId = @ToAccount;
END;
```

**关键细节：**
- `NATIVE_COMPILATION`：告诉 Hekaton 将此过程编译为原生机器代码。
- `SCHEMABINDING`：绑定到底层表结构。这意味着只要存储过程存在，它引用的表就不能被删除。这样做的好处是执行时不需要获取模式锁（schema stability lock），进一步减少开销。
- `BEGIN ATOMIC ... END`：定义了一个原子块，包含隔离级别。这是编译存储过程的强制要求。
- 编译存储过程**不能引用常规表**（在当前实现中），只能操作内存优化表。

### 3.3 验证性能对比

```sql
-- 对比实验：同一个查询，分别对传统表和内存优化表执行
-- 查询 100 万次随机查找并计算统计值

-- 对于传统表（使用解释器执行）
SET STATISTICS TIME ON;
DECLARE @i INT = 0, @total DECIMAL(18,2) = 0;
WHILE @i < 1000000
BEGIN
    SELECT @total = @total + Amount
    FROM dbo.AccountsTraditional
    WHERE AccountId = @i % 1000000;
    SET @i += 1;
END;
SET STATISTICS TIME OFF;

-- 对于内存优化表（使用编译存储过程执行）
-- 先创建一个批量查询的编译存储过程
CREATE PROCEDURE BatchLookup
    @Count INT
WITH NATIVE_COMPILATION, SCHEMABINDING
AS
BEGIN ATOMIC
    WITH (ISOLATION LEVEL = SERIALIZABLE)
    -- 使用循环在编译过程中处理
    ...
END;
```

论文实验结果（100,000 次查找，单核 2.67GHz Xeon）：

| 操作 | 传统 SQL Server | Hekaton | 加速比 |
|------|-----------------|---------|--------|
| 1 次查找 | 734K 周期 | 40K 周期 | 10.8X |
| 1000 次查找 | 20.1M 周期 | 1.06M 周期 | 18.9X |
| 10,000 次查找 | 201M 周期 | 9.85M 周期 | 20.4X |
| 1 次更新 | 910K 周期 | 45K 周期 | 20.2X |
| 100 次更新 | 8.17M 周期 | 260K 周期 | 31.4X |

## 4 事务与并发控制

### 4.1 版本可见性

每条记录有两个时间戳：

- **Begin**：创建此版本的交易的提交时间
- **End**：删除此版本的交易的提交时间（或无穷大 `inf` 表示仍然有效）

一个事务在逻辑读取时间 `RT` 下执行时，**只看见** `Begin <= RT <= End` 的版本。

```
版本 A: Begin=10, End=20   → 在时间 15 可见
版本 B: Begin=20, End=100  → 在时间 50 可见（版本 A 的更新）
版本 C: Begin=100, End=inf → 在时间 200 可见（版本 B 的更新）
```

### 4.2 提交时的验证（Validation）

可串行化事务在提交时需要验证两件事：

1. **读取稳定性**（Read Stability）：事务读过的版本在提交时仍然可见（没有被其他事务更新）。
2. **避免幻影**（Phantom Avoidance）：事务扫描过的范围没有新增版本。

如果验证失败，事务回滚并重试。因为 Hekaton 没有锁，验证可以在缓存中进行，开销很低。

### 4.3 提交依赖（Commit Dependencies）

当一个事务 T1 在验证期间读到另一个未提交事务 T2 创建或修改的版本时，T1 不能直接提交（因为 T2 可能回滚）。Hekaton 的解决方案：

- T1 记录对 T2 的**提交依赖**
- T1 被允许继续执行，但结果暂不返回给客户端
- 如果 T2 最终提交，T1 依赖计数减 1，可以提交
- 如果 T2 回滚，T1 也必须回滚（级联回滚）

这种方式保持了系统的**无阻塞性**。

## 5 持久化：日志和检查点

数据在内存中，宕机怎么办？Hekaton 用两种方式保证持久化：

### 5.1 事务日志

- 每个事务的修改在**提交时**才写入日志（不是写前日志 WAL）
- 一条日志记录包含一个事务的所有修改
- 只记录重做信息（redo），不记录撤销信息（undo）
- 索引操作不记日志——恢复时从数据重建索引

### 5.2 检查点

检查点是日志的**压缩表示**：

- **数据文件**：包含特定时间范围内的所有插入版本
- **增量文件**：记录哪些版本已被删除（用于过滤）
- 恢复时先加载数据文件，再用增量文件过滤已删除的版本
- 当数据文件的"活跃内容"低于阈值时，合并相邻的数据文件

### 5.3 恢复过程

1. 从日志中找到最近的检查点
2. **并行**加载所有数据/增量文件对
3. 每对文件由一个独立线程处理（一个核对应一个线程）
4. 用检查点之后的日志尾部做增量恢复

恢复过程充分利用多核并行，这是 Hekaton 设计的核心思想之一。

## 6 垃圾回收（Garbage Collection）

多版本意味着旧版本会堆积。Hekaton 需要回收那些对任何活跃事务都不可见的版本。

GC 的关键特性：

| 特性 | 说明 |
|------|------|
| 非阻塞 | GC 与事务并发执行，不阻塞任何事务 |
| 协作式 | 事务线程在扫描时遇到垃圾版本，可以顺手清理 |
| 增量式 | 可以暂停/恢复，避免消耗过多 CPU |
| 并行化 | 所有工作线程参与 GC，按 CPU 核心分区 |

GC 线程定期扫描全局事务映射，找到最老的活跃事务，所有被它之后删除的版本都可以安全回收。

## 7 架构总览

```
┌──────────────────────────────────────────────────────┐
│                   SQL Server                          │
│  ┌────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │  Metadata   │  │ Query     │  │  High Avail.   │  │
│  │  (常规目录) │  │ Optimizer │  │  (AlwaysOn)    │  │
│  └─────┬──────┘  └─────┬─────┘  └────────┬───────┘  │
│        │               │                  │          │
│  ┌─────▼───────────────▼──────────────────▼───────┐  │
│  │              Hekaton 引擎                       │  │
│  │  ┌────────────┐ ┌───────────┐ ┌─────────────┐  │  │
│  │  │ 存储引擎    │ │ 编译器     │ │ 运行时       │  │  │
│  │  │ (表/索引)  │ │ (T-SQL→机器码) │ (集成库) │  │  │
│  │  └─────┬──────┘ └───────────┘ └──────┬──────┘  │  │
│  └────────┼──────────────────────────────┼─────────┘  │
│           │                              │            │
│  ┌────────▼────────┐          ┌──────────▼───────┐   │
│  │ 哈希索引 (无锁)  │          │  Bw-Tree 索引     │   │
│  │ + 范围索引      │          │ (无锁多版本 B-Tree)│   │
│  └─────────────────┘          └──────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ 乐观 MVCC 并发控制  │  无锁数据结构 │ 本机编译  │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
           │                    │
    ┌──────▼──────┐    ┌───────▼────────┐
    │ SQL Server  │    │ FileStream     │
    │ 事务日志     │    │ (检查点文件)    │
    └─────────────┘    └────────────────┘
```

## 8 为什么不做分区？

同时期的很多内存数据库系统（H-store, VoltDB, HyPer）采用**数据分区**策略：把数据按核心分区，每个核心独占一个分区。

Hekaton 团队认真评估了分区方案后选择了**不做分区**。原因：

- 如果负载本身不好分区（一个事务需要访问多个分区），性能急剧下降
- 跨分区查询需要发送请求到其他核心并等待结果，开销远大于直接查共享哈希表
- 不分区更稳健，能处理各种复杂的工作负载

## 9 性能实验总结

### 可扩展性（核心数 vs 吞吐量）

在 12 核机器上的订单录入系统测试：

| 引擎 | 2 核 | 12 核 | 扩展倍数 |
|------|------|-------|----------|
| 传统 SQL Server（有锁） | 984 TPS | 2,312 TPS | 2.3X |
| SQL Server（无锁分区） | 1,153 TPS | 5,834 TPS | 5.1X |
| Hekaton（InterOp） | 1,518 TPS | 7,709 TPS | 5.1X |
| Hekaton（原生编译） | 7,078 TPS | **36,375 TPS** | **5.1X** |

关键发现：传统引擎的扩展性被 latch 争用限制在 2.3X。Hekaton 原生编译方案实现了 15.7X 的绝对性能提升，并且保持了完美的线性扩展。

## 10 一句话总结

**Hekaton 的核心思想就三件事：把所有东西放内存里、不用任何锁、把 SQL 编译成机器代码。** 这三件事叠加在一起，产生了 10-30 倍的性能提升和近乎线性的多核扩展性。

## 11 进一步阅读

- [Bw-Tree: A B-Tree for New Hardware Platforms](https://www.microsoft.com/en-us/research/publication/bw-tree-b-tree-new-hardware-platforms/) — Levandoski 等，ICDE 2013
- [High-Performance Concurrency Control Mechanisms for Main-Memory Databases](https://www.microsoft.com/en-us/research/publication/high-performance-concurrency-control-mechanisms-for-main-memory-databases/) — Larson 等，PVLDB 2012
- 微软已将该引擎正式命名为 **SQL Server In-Memory OLTP**，并集成到 SQL Server 2016 及更高版本中
