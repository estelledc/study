---
title: Tigon: A Distributed Database for a CXL Pod
来源: https://www.usenix.org/conference/osdi25/presentation/huang-yibo
日期: 2026-06-13
分类: 基础设施
子分类: 分布式数据库
provenance: pipeline-v3
---

# Tigon：用 CXL 共享内存构建分布式数据库

## 一句话概括

Tigon 是第一分布式内存数据库，它用 CXL（Compute Express Link）共享内存代替传统网络，来加速跨主机的并发数据同步。在 TPC-C 和 YCSB 基准测试中，它比优化的共享无数据库快 2.5 倍，比基于 RDMA 的数据库快 18.5 倍。

---

## 日常类比：多厨房协作

假设一个餐厅有四个厨房（主机），每个厨房有自己的操作台（本地 DRAM）和一块共享的公共砧板区（CXL 内存）。

传统方式：当厨房 A 需要厨房 B 的食材时，它打电话让厨房 B 派人送过来——这很慢，来回跑好几趟。

Tigon 的方式：厨房 B 直接把食材放到公共砧板上，厨房 A 走过去自己取。大家用同一块砧板，不需要打电话、不需要派人，直接"走过去拿"就行。

这个"走过去拿"就是 Tigon 的核心想法：用 CXL 共享内存做同步，而不是通过网络发消息。

---

## 背景：什么是 CXL Pod？

**CXL（Compute Express Link）** 是一种基于 PCIe 5.0/6.0 的高速互联标准，允许 CPU 之间、CPU 与设备之间高速通信。

**CXL Pod** 指一组（通常 8-16 台）主机，它们直接连到一块共享的 CXL 内存模块上。每台主机都有：
- 自己的本地 DRAM（快，延迟约 111-117ns）
- 一块共享 CXL 内存（较慢，延迟约 214-394ns，带宽也更低）

关键约束：
- CXL 内存的延迟是本地 DRAM 的 2-3 倍
- CXL 内存的带宽只有本地 DRAM 的 1/5 到 1/10
- 硬件缓存一致性（HWcc）只覆盖 CXL 内存的一小部分（几十到几百 MB），其余部分需要用软件来维护一致性

---

## 核心概念一：跨主机活跃元组（CAT）

### 什么是 CAT？

Tigon 最关键的洞察是：

> 数据库可能很大（几 GB 到几 TB），但**同一时刻被多个主机同时读写的元组数量很少**。

举例说明。TPC-C 每个事务平均只访问 39 个元组，总共约 7KB。假设 1000 个 CPU 核心同时运行，同一时刻最多只有 39K 个活跃元组，约 7MB。

Tigon 把这少量的活跃元组集合称为 **CAT（Cross-host Active Tuples）**，并专门维护在 CXL 共享内存中。

### 为什么只维护 CAT？

因为：
- 每个事务只访问少量元组
- 非活跃元组留在本地 DRAM，享受低延迟
- CXL 内存带宽有限，不需要搬运全部数据

```
本地 DRAM（快，大量数据）
  ├── 只被本机访问的元组（大部分数据）
  └── （偶尔需要时才搬走）

CXL 共享内存（慢，少量数据）
  └── 被多机同时访问的元组 = CAT
```

---

## 核心概念二：HWcc 与 SWcc 双层区域

CXL 内存不是铁板一块。Tigon 把它分成两部分：

| 区域 | 全称 | 特性 | 存储内容 |
|------|------|------|----------|
| HWcc | Hardware Cache-Coherent | 硬件自动维护缓存一致性，容量小（几十 MB） | 高频同步的元数据：数据库 latch、锁、索引 |
| SWcc | Software Cache-Coherent | 软件模拟一致性，容量大 | 实际的数据元组 |

**核心设计理念**：按同步频率分层。需要跨主机频繁同步的元数据放 HWcc，其余数据放 SWcc。

```
共享 CXL 内存
├── HWcc 区域（硬件缓存一致性，小）
│   ├── Latch（数据库锁）
│   ├── 2PL Lock（两阶段锁）
│   └── Index 记录
│
└── SWcc 区域（软件缓存一致性，大）
    ├── 元组 A（值=6）
    ├── 元组 B（值=2）
    ├── 元组 C（值=9）
    └── 更多元组...
```

---

## 核心概念三：事务工作流

看一个具体例子。假设数据库存储键值对，有两个主机：

```
场景：事务1（在 Host 1）需要读 A，写 C；事务2（在 Host 2）需要读 C，写 D

步骤：
1. 事务1在 Host 1 获取元组 (A,6) 的读锁，从本地 DRAM 读到值
2. 事务1需要写 C，但 C 在 Host 2 上，于是发消息请求把 C 搬到 CXL 内存
3. Host 2 把 (C,0) 搬到共享 CXL 内存
4. 事务1在 CXL 内存中获取 C 的写锁，把它更新为 (C,9)
5. 整个过程不需要两阶段提交（2PC）
```

这就是 Tigon 比传统分布式数据库快的原因：**把网络消息交换变成了内存数据结构操作**。

---

## 核心概念四：避免两阶段提交（2PC）

传统分布式数据库中，跨分区事务需要 2PC——commit 前要在所有相关主机间反复确认。Tigon 通过两个洞察避免了 2PC：

1. **CAT 在 CXL 内存中**：一个主机可以完成事务的所有元组修改（通过在 CXL 中获取锁），不需要通知其他主机
2. **索引可以重建**：事务执行涉及的其他主机索引修改不需要记录日志，因为可以从元组中恢复

结果：一个主机执行所有操作并记录日志，本地 commit，不需要 2PC。

---

## 核心概念五：软件缓存一致性

大部分 CXL 内存没有硬件缓存一致性支持。Tigon 引入了软件缓存一致性协议来解决这个问题。

核心想法是：**利用数据库本身已有的并发控制机制来代替硬件缓存一致性**。

数据库已经有锁（2PL）和 latch 机制来保护元组完整性，所以 Tigon 把这些机制与软件缓存一致性协议协同设计，减少了同步开销。

---

## 代码示例

### 示例一：CAT 管理的数据结构

Tigon 内部用这种结构来管理活跃元组的生命周期：

```rust
// 简化版：Tigon 中的元组记录结构

// 每个活跃元组在 CXL 内存中都有一个 HWcc 记录
struct HWccRecord {
    // 本地 DRAM 中该元组的指针（shortcut pointer），
    // 避免每次都要去 CXL 索引中查找
    shortcut_ptr: Pointer,
    // 是否在 CXL 内存中有效
    is_valid: bool,
    // 2PL 锁（8 字节）
    lock: TwoPhaseLock,
    // latch 位（1 字节，用于硬件缓存一致性）
    hwcc_latch: u8,
    // 下一个 key 标志（防止幻读）
    has_next_key: bool,
}

// SWcc 区域中的实际元组行
struct SWccRow {
    // 指向 CXL 中 HWccRecord 的指针
    hwcc_record_ptr: Pointer,
    // 元组数据本身（键值对）
    key: [u8; 32],
    value: [u8; 256],
    // 版本戳，用于软件一致性
    epoch_version: u64,
    // 脏位：是否在本地 DRAM 中被修改过
    is_dirty: bool,
    // SWcc 位图，管理一批元组
    bitmap: u16,
}
```

这段代码展示了一个简单的元组管理结构。HWccRecord 放在硬件缓存一致性区域（小，但同步快），SWccRow 放在软件缓存一致性区域（大，装实际数据）。

---

### 示例二：事务执行流程

```rust
// 简化版：Tigon 中一个事务的执行流程

fn execute_transaction(&mut self, txn: Transaction) -> Result<()> {
    // 步骤 1：处理本机持有的分区数据
    for op in txn.local_ops {
        match op {
            Op::Read(key) => {
                // 本地 DRAM 直接读，不需要跨主机同步
                let tuple = self.local_dram.get(&key);
                self.cache.insert(key, tuple);
            }
            Op::Write(key, new_value) => {
                // 获取 2PL 锁（本地 latch 保护）
                self.latch_lock(key);
                let tuple = self.local_dram.get_mut(&key);
                tuple.value = new_value;
                tuple.is_dirty = true;
                self.latch_unlock(key);
            }
        }
    }

    // 步骤 2：处理需要跨主机访问的数据
    for op in txn.remote_ops {
        match op {
            Op::RemoteRead(key) | Op::RemoteWrite(key, _) => {
                // 检查这个元组是否已经在 CAT（CXL 内存）中
                let mut hwcc = self.hwcc_region.lock();
                if let Some(record) = hwcc.get(&key) {
                    // 已在 CAT 中，直接通过 shortcut_ptr 快速访问
                    let tuple = record.shortcut_ptr.as_ref();
                    // 获取锁并操作
                    self.acquire_lock(&key);
                    // ... 执行读/写 ...
                    self.release_lock(&key);
                } else {
                    // 不在 CAT 中，请求远程主机搬移到 CXL 内存
                    let remote_host = self.lookup_host(&key);
                    remote_host.request_move_to_cxl(&key);
                    // 等待搬移完成
                    self.wait_for_cxl_migration(&key);
                    // 现在可以像上面一样通过 CAT 访问了
                }
            }
        }
    }

    // 步骤 3：本地 commit
    // 不需要 2PC！所有修改都在本主机完成
    self.log_changes(&txn);
    self.local_commit(txn.id);

    Ok(())
}
```

这个简化代码展示了 Tigon 的核心流程：
1. 本机数据直接读本地 DRAM
2. 远程数据先搬到 CXL 内存的 CAT 中
3. 通过 shortcut_ptr 快速定位 CAT 中的元组
4. 本地 commit，不需要 2PC

---

## 性能数据

论文在真实硬件上测试了 Tigon：

- **TPC-C 基准测试**：比优化的共享无数据库快 2.5 倍
- **YCSB 基准测试**：比优化的共享无数据库快 2.5 倍
- **对比 RDMA 数据库**：快达 18.5 倍

这些数字之所以这么高，是因为 Tigon 把跨主机通信从"网络消息"变成了"内存操作"，省去了大量的消息传递和协议开销。

---

## 设计哲学总结

Tigon 的设计体现了三个核心原则：

1. **按同步频率分层存储**：高频同步的元数据用硬件缓存一致性，低频数据用软件模拟
2. **把 CAT 放在 CXL 内存中**：只共享真正需要共享的数据，不共享全部数据
3. **用数据结构代替消息**：用 CXL 内存中的原子操作和锁结构，替代传统分布式数据库的网络消息交换

---

## 延伸思考

Tigon 代表了数据库架构的一个重要趋势：**硬件架构的变化正在重塑数据库设计**。CXL 内存虽然比本地 DRAM 慢，但它提供的"共享内存"语义让跨主机同步的成本大幅降低。当硬件继续演进（更多硬件缓存一致性支持），Tigon 这类系统还会有更大的提升空间。

---

## 参考

- 论文：Tigon: A Distributed Database for a CXL Pod (OSDI 2025)
- 作者：Yibo Huang, Haowei Chen, Newton Ni (UT Austin); Yan Sun (UIUC); Vijay Chidambaram, Dixin Tang, Emmett Witchel (UT Austin)
- 代码：https://github.com/ut-datasys/tigon
