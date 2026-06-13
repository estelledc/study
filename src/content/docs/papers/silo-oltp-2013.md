---
title: SILO — 多核内存数据库的快速事务
来源: https://www.cs.cmu.edu/~pavlo/courses/fall2013/static/papers/silo.pdf
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

SILO 是 **CMU 2013 年发表**的内存数据库论文（VLDB 2013），作者是 Jayadev Misra、Anusor、Pavlo 等人。它解决一个非常具体的问题：**当数据库所有数据都放在内存里，而且 CPU 有 32-64 个核心时，怎么让事务跑得更快？**

日常类比：想象一个餐厅后厨，以前只有一个厨师按顺序做菜——等前一道菜切完菜才能开始炒。SILO 的突破：发现很多菜根本不需要等——切土豆和炒肉用的是不同锅，完全可以同时进行，只需要在"装盘"那一刻对一下顺序就行。

传统数据库的瓶颈是**并发控制**（concurrency control）：事务要读写字段，数据库必须保证多个事务不会互相冲突、不会读到不一致的数据。以前的方案要么太保守（串行执行所有事务，浪费多核），要么太复杂（锁+版本控制+日志， overhead 太高）。SILO 的目标很朴素：**在纯内存场景下，用最简单的机制实现接近线性的多核加速。**

## 为什么重要

不理解 SILO，下面这些事都没法解释：

- 为什么 **MemSQL / SingleStore、VoltDB、Drizzle** 这一批内存数据库都采用了类似的"无锁并发控制"思路
- 为什么"乐观执行 + 延迟验证"会成为内存数据库的主流范式（后来被 CockroachDB 的乐观模式、TiDB 的乐观事务也继承了）
- 为什么 **Hekaton（SQL Server 的内存 OLTP）** 和 **Oracle TimesTen** 的并发控制设计能看到 SILO 的影子
- 为什么"多核利用率"这个事在 2013 年后从"数据库研究者的问题"变成了"每个数据库必须回答的工程问题"

SILO 的核心洞察：**大部分事务之间根本没有冲突，不需要锁。与其用锁拦住 95% 安全的事务，不如让它们先跑，只在最后"装盘"时检查冲突。**

## 核心要点

### 1. 乐观并发控制（OCC）+ 延迟锁（Late Locking）

传统事务像排队：进入前就拿到锁，做完再释放。SILO 反过来了——**先执行，执行过程中先不拿写锁，等要提交时才"延迟加锁"检查。**

```
传统锁：      拿锁 → 执行 → 检查冲突 → 提交 → 释锁
SILO：        执行 → 提交时延迟加锁 → 检查冲突 → 提交
```

类比：以前进厨房要先拿到锅的钥匙（拿锁），做完菜再还钥匙。SILO 的做法是——你可以直接用锅炒菜，但要端盘子上桌（提交）时，才去查"有没有别人也在用这个锅"。如果没有，直接上桌；如果有，菜倒掉重来。

**为什么这更快？** 因为读操作和写操作之间不需要等待。线程 A 在读数据行时，线程 B 也可以同时读或写其他行——不需要任何同步。

### 2. 两阶段分区（Partitioning）

SILO 把数据库按"表分区"（partition），每个分区独立运行。类比：餐厅分成"川菜区"和"粤菜区"，两个区的厨师互不干扰，各自管各自的锅。

```
分区 0          分区 1          分区 2
┌─────────┐    ┌─────────┐    ┌─────────┐
│ 订单表   │    │ 商品表   │    │ 用户表   │
│ 订单详情 │    │ 库存     │    │ 账户     │
└─────────┘    └─────────┘    └─────────┘
   核心 0-7        核心 8-15       核心 16-23
```

每个分区用独立的核心组执行事务，**分区内的并发控制**用延迟锁，**跨分区事务**用 2PC（两阶段提交）。因为大部分业务操作只涉及一个分区，跨分区事务很少——这是 SILO 性能的关键前提。

### 3. 无锁执行路径（Lock-Free Execution）

SILO 对**读操作几乎完全无锁**。线程读取数据时不需要获取任何锁，直接读。这是因为：

- 写操作产生的新值会先放在"修改日志"里，不会立刻改原始数据
- 只有提交时才把修改"合并"进主数据
- 读到旧值没关系——如果后续冲突了，回滚重来就行

```
线程 A 读订单 ID=100：          线程 B 写订单 ID=100：
─────────────────────          ─────────────────────
直接读取当前值                  修改放在日志中（未提交）
不需要任何同步                  不影响 A 的读取
返回余额 = 500                  B 的修改对 A 暂时不可见
                                等 B 提交时才合并
```

### 4. 延迟加锁（Late Locking）的具体实现

这是 SILO 最精妙的部分。提交时，SILO 按顺序拿每个被修改分区的锁：

```
// 伪代码：SILO 事务的提交阶段
function commit_transaction(txn) {
    // Phase 1: 按分区顺序获取锁
    for partition in txn.modified_partitions sorted by id:
        lock = get_partition_lock(partition)  // 延迟加锁！
        // 拿锁时才检查：有没有更晚开始的事务修改了我读过的数据？
        if txn.conflicts_with_later_transactions(partition):
            return ABORT  // 回滚，让后来的事务先提交

    // Phase 2: 所有锁都拿到了，提交
    for partition in txn.modified_partitions:
        merge_modifications_into_main_data(partition)

    return COMMIT
}
```

类比：餐厅上菜前，传菜口按菜系逐个检查——"川菜区的菜能上吗？粤菜区的能上吗？"如果川菜区有人插队了，你的菜就退回去等下一轮。

## 代码示例

### 示例 1：SILO 风格的乐观事务执行

对比传统锁机制和 SILO 的延迟锁机制：

```python
# ===== 传统方式：悲观锁 =====
def transfer_money_pessimistic(from_acc, to_acc, amount):
    lock(from_acc)           # 提前拿锁，阻塞别人
    lock(to_acc)
    balance = read(from_acc) # 执行
    if balance >= amount:
        write(from_acc, balance - amount)
        write(to_acc, read(to_acc) + amount)
    unlock(to_acc)
    unlock(from_acc)       # 释放锁

# ===== SILO 方式：乐观执行 + 延迟锁 =====
def transfer_money_silo(from_acc, to_acc, amount):
    read_set = {}            # 先执行，记录读了什么
    write_set = {}

    balance = read(from_acc)  # 不需要任何锁！
    read_set[from_acc] = balance
    write_set[from_acc] = balance - amount

    to_balance = read(to_acc) # 也不需要锁！
    read_set[to_acc] = to_balance
    write_set[to_acc] = to_balance + amount

    # --- 提交阶段：延迟加锁 ---
    if try_acquire_locks(from_acc, to_acc):  # 这时才尝试拿锁
        # 检查冲突：读过的值被别的事务改过吗？
        if read_set[from_acc] != current(from_acc) or \
           read_set[to_acc] != current(to_acc):
            return ABORT  # 冲突了，回滚
        # 合并修改
        write(from_acc, write_set[from_acc])
        write(to_acc, write_set[to_acc])
        return COMMIT
    else:
        return ABORT  # 锁被占，等重试
```

### 示例 2：分区并发控制

```python
# SILO 的分区模型
# 数据库被拆成多个分区，每个分区由一组核心专属管理

class Partition:
    def __init__(self, partition_id):
        self.id = partition_id
        self.lock = threading.Lock()
        self.data = {}          # 分区内的 KV 数据
        self.write_log = []     # 未提交的修改暂存这里

    def execute(self, txn):
        """执行属于本分区的事务"""
        # 1. 执行阶段：无锁直接读
        txn.read_set = {}
        for key in txn.read_keys:
            txn.read_set[key] = self.data.get(key)

        # 写操作先暂存，不改主数据
        txn.write_set = {}
        for key, value in txn.writes:
            txn.write_set[key] = value

    def commit(self, txn):
        """提交阶段：延迟加锁 + 冲突检查"""
        with self.lock:                     # 延迟加锁！
            # 冲突检测：我读过的数据被别人改了吗？
            for key, old_value in txn.read_set.items():
                if self.data.get(key) != old_value:
                    return ABORT  # 读-写冲突

            for key, new_value in txn.write_set.items():
                if key in txn.read_set:
                    old_read = txn.read_set[key]
                    if self.data.get(key) != old_read:
                        return ABORT  # 读-写冲突

            # 合并写入
            for key, value in txn.write_set.items():
                self.data[key] = value

            return COMMIT
```

## 核心公式

SILO 的性能可以简单理解为：

**吞吐量 = 单核吞吐 × 核心数 × (1 - 冲突率)**

- 单核吞吐：由延迟锁的 overhead 决定（比传统锁低）
- 核心数：由分区数决定（理想情况 = 核心数）
- 冲突率：由业务模式和分区粒度决定（越细越好）

当冲突率低时（大多数实际业务如此），SILO 能达到接近线性的多核加速——32 核跑 25-28x 吞吐。

## 实践案例

### 案例 1：电商下单（单分区场景）

```
用户下单：

1. 读订单表（分区 0）→ 获取当前最大订单号
2. 写订单表（分区 0）→ 插入新订单记录
3. 写库存表（分区 1）→ 扣减商品库存

步骤 1-2 在分区 0 执行，步骤 3 在分区 1 执行
两个分区独立加锁，互不阻塞
```

```python
# 在 SILO 中，这几乎零等待
order_txn = begin()
order_txn.read("orders", key="max_id")       # 分区 0，无锁
order_txn.write("orders", "next_id", 10001)   # 分区 0，暂存

inventory_txn = begin()
inventory_txn.read("inventory", "widget_42")  # 分区 1，无锁
inventory_txn.write("inventory", "widget_42", -1) # 分区 1，暂存

# 提交时分别拿两个分区的锁
order_txn.commit()     # 拿分区 0 的锁
inventory_txn.commit() # 拿分区 1 的锁
```

### 案例 2：跨分区转账（2PC 场景）

```
A 用户（分区 0）转 100 给 B 用户（分区 2）：

begin()
  → 读分区 0 的 A 余额    [事务 T1]
  → 写分区 0 的 A 余额     [T1]
  → 读分区 2 的 B 余额    [事务 T2]
  → 写分区 2 的 B 余额     [T2]

# 跨分区协调者启动 2PC
prepare(T1, T2)  → 两个分区分别预提交
commit(T1, T2)   → 两个分区都确认后正式提交
```

跨分区事务需要 2PC 是因为两个分区各自独立，没有一个全局协调者能同时控制两块内存。

## 局限与代价

- **写-写冲突回滚**：两个事务同时改同一分区，后到的会被 abort。高写入竞争时性能下降
- **内存占用**：数据全在内存，不能持久化到磁盘（后来版本加了 checkpoint）
- **写放大**：每次写都先写日志再合并，内存用量更大

## 总结一句话

SILO 用最简单的思路——**先跑再说，提交时检查**——在多核内存数据库上实现了接近线性的事务加速，证明"乐观并发控制 + 延迟锁"在正确场景下比传统悲观锁简单且高效得多。
