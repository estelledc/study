---
title: H-Store 2008 — Stonebraker 的"传统数据库架构该重写"计划
来源: 'https://hstore.cs.brown.edu/papers/hstore-vldb.pdf'
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

## 是什么

H-Store 是 MIT、布朗大学、CMU、耶鲁和 Intel 联合做的一个**全内存、分布式、面向 OLTP 的数据库系统**。论文发表于 VLDB 2008，作者是 Robert Kallman 等人，Stonebraker 是总设计师。

日常类比：想象一家大型连锁超市。传统数据库像"一个超级大的仓库 + 一群搬运工"——所有商品堆在一个大仓库里，订单来了，搬运工们挤在同一个通道里抢货，经常要排队等锁。H-Store 的做法是：**把仓库拆成 N 个独立的小店**，每家小店只卖一部分商品（按某种规则分好），订单来了直接派到对应的那家店，各干各的，互不干扰。如果某家店忙不过来，就多加几家。

它**不是 MySQL**（不存磁盘、不做通用查询优化），也**不是 NoSQL**（它完全兼容 SQL 和 ACID）。它是第三种东西：**专为高并发事务设计的内存数据库**。

## 为什么重要

不理解 H-Store，下面这些事都没法解释：

- 为什么 2008 年后"内存数据库"突然火了——VoltDB、TiKV、CockroachDB 的祖先都是这条线
- 为什么"分区（partitioning）"成了分布式数据库的核心概念——H-Store 把每张表按 hash 切成碎片，每块放不同机器
- 为什么"存储过程"在 OLTP 场景重新被重视——H-Store 要求业务逻辑写成预编译的 stored procedure，而不是随便写 SQL
- 为什么"两阶段提交（2PC）"被重新审视——H-Store 证明了在分区场景下，2PC 可以做得非常轻量
- 为什么 VoltDB 是 H-Store 的商业版——论文团队后来把系统商业化，就是今天的 VoltDB

## 核心要点

H-Store 的设计建立在三个观察之上：

1. **OLTP 事务通常只访问少量数据行**——绝大多数交易只查或改几行，不会扫全表
2. **事务执行时间短、无用户交互**——一个事务在微秒到毫秒级完成，不需要停下来等用户输入
3. **事务类型有限且可预测**——电商系统的"下单""查库存""支付"是固定几种，不会无限增长

基于这三点，H-Store 做出了一个激进的设计选择：**把所有数据放进内存，放弃磁盘 I/O 优化，用分布式并行换取极致吞吐**。

### 1. 分区（Partitioning）——把数据切碎

H-Store 把每张表水平切分成多个片段（fragment/shard），按某个列的值做 hash 决定每行去哪个片段。相关的多个表的片段组成一个**分区（partition）**，每个分区分配给一个**执行站点（site）**。

```
表 Orders 按 order_id 哈希 → 10 个片段
表 OrderItems 按 order_id 哈希 → 10 个片段（同一 order_id 的行一定在同一分区）
表 Products 只有一份副本 → 存在于所有 10 个分区中（广播副本）

分区 0 = Orders[0] + OrderItems[0] + Products[全量副本]
分区 1 = Orders[1] + OrderItems[1] + Products[全量副本]
...
分区 9 = Orders[9] + OrderItems[9] + Products[全量副本]
```

日常类比：一个城市的 10 个派出所，每个派出所只管辖一部分居民（按身份证号 hash），但所有人的身份证照片都存在每个派出所——这样查身份不用跨所。

### 2. 存储过程（Stored Procedures）——业务逻辑预编译

H-Store 不支持随意写 SQL。所有的查询必须通过**预定义的存储过程**执行。每个存储过程由 Java 控制代码 + 参数化 SQL 语句组成，在编译时就确定了执行计划。

```java
// 定义一个"查询订单"的存储过程
public class GetOrder extends StoreProcedure {

    // 预编译 SQL 语句（编译时确定执行计划）
    private static SQLStmt getOrderSQL =
        new SQLStmt("SELECT * FROM Orders WHERE order_id = ?");

    // 运行时入口：传入参数，返回结果
    public VoltTable[] run(long orderId) {
        // 把 SQL 加入批处理，传入参数
        voltQueueSQL(getOrderSQL, orderId);
        // 执行并等待结果
        return voltExecuteSQL();
    }
}
```

### 3. 单线程执行引擎（Single-Threaded Execution Engine）——没有锁竞争

每个分区由一个**单线程的执行引擎**管理。因为只有一个线程在操作一份数据，**根本不需要锁**！这是 H-Store 最快的地方。

```java
// 定义一个"下订单"的存储过程（跨表事务）
public class PlaceOrder extends StoreProcedure {

    private static SQLStmt checkStockSQL =
        new SQLStmt("SELECT quantity FROM Products WHERE product_id = ?");
    private static SQLStmt deductStockSQL =
        new SQLStmt("UPDATE Products SET quantity = quantity - ? WHERE product_id = ?");
    private static SQLStmt insertOrderSQL =
        new SQLStmt("INSERT INTO Orders (order_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)");

    public VoltTable[] run(long productId, int quantity, long orderId, double totalPrice) {
        // 第一步：查库存
        voltQueueSQL(checkStockSQL, productId);
        VoltTable[] results = voltExecuteSQL();

        // 第二步：检查库存是否足够
        VoltTable stockRow = results[0];
        if (stockRow.getRowCount() == 0 || stockRow.getShort(0) < quantity) {
            // 库存不足，抛出异常让事务回滚
            throw new AbortEvent("Insufficient stock");
        }

        // 第三步：扣库存 + 插入订单（同一个事务，原子执行）
        voltQueueSQL(deductStockSQL, quantity, productId);
        voltQueueSQL(insertOrderSQL, orderId, productId, quantity, totalPrice);
        return voltExecuteSQL();
    }
}
```

### 4. 分布式事务与两阶段提交（2PC）

单分区事务直接在本地执行，零网络开销。多分区事务走**轻量级两阶段提交**：

```
事务 T 要同时修改分区 3 和分区 7 的数据：

阶段一（Prepare）：
  协调器 → 分区 3: "你要参与这个事务吗？"
  协调器 → 分区 7: "你要参与这个事务吗？"
  分区 3 → 协调器: "准备好了"
  分区 7 → 协调器: "准备好了"

阶段二（Commit/Abort）：
  协调器 → 分区 3: "提交！"
  协调器 → 分区 7: "提交！"
```

### 5. 主备复制（Replication）——容错

H-Store 用 **k-safety** 机制保证可用性：每个分区有 k 个备份，分布在不同的物理节点上。主分区处理请求，备用分区同步接收所有命令日志。主节点挂了，备用节点秒级接管。

## 性能数据

VLDB 2008 论文中的基准测试（AuctionMark）：

| 系统 | 吞吐量 (tpmC) | 说明 |
|------|--------------|------|
| 传统数据库（如 PostgreSQL） | ~数千 | 受限于磁盘 I/O 和锁竞争 |
| H-Store（8 节点） | **数百万** | 全内存 + 并行 + 无锁 |

H-Store 在相同硬件上比传统数据库快 **100 倍以上**。这个数字的核心原因很简单：省去了磁盘 I/O、锁管理和复杂查询优化器的开销。

## 代价与局限

H-Store 的设计不是免费的，它有几个明显代价：

1. **内存成本高**——所有数据必须在 RAM 里，不能 spill 到磁盘。适合数据集能塞进内存的场景
2. **灵活性低**——只能执行预定义的存储过程，不能像传统数据库那样随时写 SQL 探索数据
3. **跨分区事务有网络开销**——单分区事务极快（微秒级），但多分区事务要走 2PC，延迟上升
4. **数据倾斜问题**——如果 hash 不均匀，某些分区会特别忙，成为瓶颈

## 后续影响

- **VoltDB**：H-Store 的商业化版本，至今仍在活跃维护，支持更多 SQL 特性
- **S-Store**：在 H-Store 基础上加了流处理（stream processing）
- **Peloton**：H-Store 团队成员毕业后做的下一代系统，探索了更多混合负载
- 整个"内存 OLTP"赛道：From 2008 到今天，Redis、MemSQL (SingleStore)、YugabyteDB 等都受到这条设计思路的影响

## 一句话总结

H-Store 的回答是：**别在传统数据库架构上修修补补了，从头设计一个为 OLTP 优化的系统——全内存、全分区、全并行、用存储过程代替自由 SQL。** 它证明了这种激进设计在正确场景下可以比传统系统快 100 倍以上。
