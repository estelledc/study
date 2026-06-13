---
title: "Hekaton: SQL Server's Memory-Optimized OLTP Engine"
来源: https://www.microsoft.com/en-us/research/wp-content/uploads/2013/06/Hekaton-Sigmod2013-final.pdf
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

## Hekaton：让数据库住在内存里的 SQL Server

### 一、日常类比：图书馆 vs 书桌

想象一下你在一座巨大的图书馆里找书（这就是传统数据库）。

每一本书都放在某个书架上，书架在某个房间，房间在某栋楼。你要找一本书，得先在目录系统里查到编号，然后穿过走廊，上楼梯，找到那排书架，把那本书抽出来。翻完了再放回去。这个过程很快——但你要找一千本书，就需要跑一千趟。

现在换一种方式：把你今天**肯定要用的所有书**，全部摊开在你面前的书桌上。你不需要找，不需要跑，手一伸就拿到了。这就是 Hekaton 做的事——它把数据库的工作集（working set）全部放在内存里，而不是磁盘上。

但关键问题是：如果停电了（服务器崩溃了），书桌上的书不就丢了吗？Hekaton 的聪明之处就在于：它让你享受内存的速度，同时保证数据不会丢。

### 二、背景：为什么需要 Hekaton？

在 Hekaton 出现之前（SQL Server 2014 之前），所有的关系型数据库都有一个根本假设：**数据存在磁盘上，内存只是缓存**。

这个假设导致了很多开销：

- **日志写入（Log Write）**：每次修改数据，都要先写到磁盘上的事务日志里，确保崩溃能恢复。写磁盘很慢。
- **缓冲池（Buffer Pool）**：数据先在磁盘上，被访问时才从磁盘读到内存。每次访问都要先查缓冲池里有没有，没有再去读磁盘。
- **锁（Locks）**：两个事务同时修改数据，必须用锁来协调。锁的获取和释放本身就很耗性能。

Hekaton 的作者们做了一个根本性的设计决策：**不再把磁盘作为数据的默认存储位置，而是为 OLTP（在线事务处理）工作负载专门设计一套完全在内存中运行的引擎。**

这篇 SIGMOD 2013 论文《Hekaton: SQL Server's Memory-Optimized OLTP Processing Engine》由 Microsoft Research 的研究人员撰写，正式描述了这套系统。

### 三、核心概念

#### 3.1 内存优化表（Memory-Optimized Tables）

传统表存在磁盘上，Hekaton 引入了"内存优化表"——数据常驻内存，不经过缓冲池。

但数据不能只存在内存里就完事了，万一服务器重启呢？Hekaton 的做法是：**数据存在内存里保证速度，同时异步地把变更写到磁盘上的文件里保证持久化**。这就好比你的书桌（内存）上放着正在处理的工作，而文件柜（磁盘）里有完整的备份。

#### 3.2 乐观并发控制（Optimistic Concurrency Control）

传统数据库用"悲观锁"：两个人要修改同一行，先抢锁，抢到的人改，没抢到的人等。

Hekaton 用的是"乐观"方式：大家先各改各的，改完提交的时候再检查一下——有没有人在这期间动过我的数据？如果没有，恭喜通过；如果有，重试。

这就像两个人同时写一份文档：传统方式是每个人必须先拿到"写作权"才能写；乐观方式是你先在自己的副本上改，改完合并且如果发现别人也改了同一部分，就重新改一遍。

#### 3.3 无锁数据结构（Lock-Free Data Structures）

Hekaton 里的表用**链式哈希索引**（chain-hash index）来组织数据。多个线程可以同时遍历同一个索引结构，不需要互斥锁。具体做法是用一种叫"快照隔离"（Snapshot Isolation）的技术，每个读取者看到的是数据的一个一致快照。

#### 3.4 基于日志的恢复（Log-Based Recovery）

虽然数据主要在内存里，但 Hekaton 仍然用事务日志来保证持久化。每个修改操作都会被记录到日志中，重启时从日志恢复数据。和传统方式的区别在于：日志只存变更（redo log），恢复时直接从日志重做，不再需要缓冲池。

### 四、代码示例

#### 示例 1：创建内存优化表和持久化伙伴表

```sql
-- 第一步：为内存优化表创建一个容器（这本质上是磁盘上的文件组）
ALTER DATABASE MyDB ADD CONTAINER 'C:\Data\MyDB_CoM';

-- 第二步：创建一个内存优化的表
-- NATIVE_COMPILATION 表示用编译器编译成原生机器码，更快
CREATE TABLE dbo.Orders (
    OrderId       INT           NOT NULL    PRIMARY KEY NONCLUSTERED HASH WITH (BUCKET_COUNT = 1000000),
    CustomerId    INT           NOT NULL,
    OrderDate     DATETIME2     NOT NULL    DEFAULT SYSUTCDATETIME(),
    TotalAmount   DECIMAL(18,2) NOT NULL,
    Status        NVARCHAR(20)  NOT NULL    DEFAULT N'Pending',

    INDEX IX_CustomerId NONCLUSTERED (CustomerId)
)
WITH (MEMORY_OPTIMIZED = ON,
      DURABILITY = SCHEMA_AND_DATA);
-- DURABILITY = SCHEMA_AND_DATA 表示结构和数据都持久化
-- 如果设为 SCHEMA_ONLY，数据就像临时表，重启就丢
```

**逐行解读：**

- `PRIMARY KEY NONCLUSTERED HASH`：Hekaton 的索引是基于哈希的。`BUCKET_COUNT` 是哈希表的桶数，建议设为表中最大行数的 1.5 到 2 倍。
- `INDEX IX_CustomerId`：除了主键哈希索引，还可以建普通非聚簇索引用于范围查询。
- `DURABILITY = SCHEMA_AND_DATA`：这是关键选项。`SCHEMA_ONLY` 意味着只有表结构持久化，数据不持久（适合缓存场景）。`SCHEMA_AND_DATA` 则数据也持久化。

#### 示例 2：内存优化存储过程（Natively Compiled）

```sql
-- 创建一个原生编译的存储过程
-- 这意味着它被编译成了机器码，不需要解释执行，速度快得多
CREATE PROCEDURE dbo.InsertOrder
    @OrderId   INT,
    @CustomerId INT,
    @Amount    DECIMAL(18,2)
WITH NATIVE_COMPILATION, SCHEMABINDING
AS
BEGIN ATOMIC
    WITH (TRANSACTION ISOLATION LEVEL SNAPSHOT,
          LANGUAGE = N'english')

    -- 直接插入，走内存路径，不走缓冲池
    INSERT INTO dbo.Orders (OrderId, CustomerId, TotalAmount, Status)
    VALUES (@OrderId, @CustomerId, @Amount, N'Pending');

END;
GO

-- 调用这个存储过程
EXEC dbo.InsertOrder @OrderId = 1001, @CustomerId = 500, @Amount = 99.99;
```

**逐行解读：**

- `NATIVE_COMPILATION`：存储过程被编译成原生代码（XQuery 解释执行 vs 直接编译成机器码），比传统解释执行快很多。
- `BEGIN ATOMIC`：定义了一个原子块。块内的所有语句要么全部成功，要么全部失败。里面设定了事务隔离级别为 SNAPSHOT。
- 这种原生编译的存储过程，是 Hekaton 性能提升的关键来源之一。

#### 示例 3：传统表到内存优化表的对比查询

```sql
-- 传统表：数据在磁盘上，每次查询都要走缓冲池
SELECT * FROM dbo.TraditionalOrders WHERE CustomerId = 500;

-- 内存优化表：数据直接在内存里，跳过缓冲池
SELECT * FROM dbo.Orders WHERE CustomerId = 500;

-- 注意：内存优化表的查询语法完全一样，都是 T-SQL
-- 应用程序不需要改代码，这是 SQL Server 的重要设计
```

### 五、关键性能数据（论文中报告）

Hekaton 团队在论文中做了大量实验，核心结论：

- 在典型 OLTP 工作负载（如订单处理）下，性能比传统 SQL Server 快 **10 到 100 倍**
- 内存开销：每个内存优化表会额外消耗一些元数据空间，但数据本身不再需要缓冲池缓存
- 并发性能：由于锁竞争大大减少，并发事务数增加时性能下降很平缓

### 六、后续发展

- **SQL Server 2014**：Hekaton 以"In-Memory OLTP"功能首次正式发布
- **SQL Server 2016 / 2017**：增强了文件组管理、范围索引支持
- **SQL Server 2019**：继续优化哈希索引和原生编译
- **Azure SQL Database**：完全支持内存优化
- **更名为 "SQL Server In-Memory OLTP"**：现在官方名称已不再叫 Hekaton（Hekaton 是希腊语"百"的意思，寓意"百倍性能提升"）

### 七、学习总结

Hekaton 的核心思想其实非常简洁：**如果数据能全部放进内存，为什么要每次都在磁盘和内存之间折腾？**

但它解决了一系列复杂问题：

1. **持久化**：内存是易失的，怎么保证重启不丢数据？→ 异步日志 + 检查点
2. **并发**：多线程同时访问怎么办？→ 乐观并发 + 链式哈希 + 快照隔离
3. **恢复**：崩溃后怎么恢复到一致状态？→ 基于日志的重做
4. **兼容**：怎么让现有应用程序不用改代码？→ 完全兼容 T-SQL

这篇论文是数据库系统领域的一个里程碑——它证明了针对特定工作负载做深度优化，可以带来数量级级别的性能提升，同时保持接口的兼容性。

### 思考题

1. 乐观并发控制在什么场景下反而比悲观锁更慢？为什么？
2. 哈希索引适合范围查询吗？Hekaton 是如何解决这个问题的？（提示：论文中提到了非聚簇索引）
3. 如果一张表数据量远大于可用内存，Hekaton 的表现会怎样？
