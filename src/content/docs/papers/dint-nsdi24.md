---
title: DINT: Fast In-Kernel Distributed Transactions with eBPF
来源: https://www.usenix.org/conference/nsdi24/presentation/zhou-yang
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式系统
provenance: pipeline-v3
---

# DINT: 用 eBPF 在内核中实现高速分布式事务

## 一、一个日常类比：快递柜 vs 快递员上楼

想象你要寄一件快递。

**传统方式（内核协议栈）**：你把包裹交给小区门口的快递柜，快递柜管理员登记、盖章、转发给快递公司——每一步都合规安全，但层层中转很慢。

**内核旁路方式（kernel-bypass，如 RDMA/DPDK）**：快递员直接爬到你家窗户，把包裹塞进运输机——速度极快，但存在安全隐患，且一旦出错很难排查。

**DINT 的做法**：在快递柜内部安装了一个智能分拣机器人（eBPF），大部分包裹直接在柜子里面完成登记、盖章、转发，只有少数特殊包裹才需要人工处理。既保留了快递柜的安全性和可维护性，又达到了接近快递员上楼的速度。

## 二、问题背景：分布式事务为什么慢？

在现代数据中心里，分布式内存事务（比如银行转账：从 A 账户扣钱、往 B 账户加钱）是核心基础设施。随着电池备份 DRAM 和 NVRAM 等快速存储的出现，事务的性能瓶颈已经从存储转移到了**网络**。

现有高性能分布式事务系统（如 Caladan、FaSST、Janus）几乎都使用**内核旁路**技术（RDMA 或 DPDK）来绕过操作系统内核的网络协议栈，以获得极致性能。但这带来了一系列问题：

- **安全性差**：绕过内核意味着失去了内核提供的安全防护
- **隔离性弱**：不同应用之间缺乏有效隔离
- **难以维护和调试**：自定义内核模块与标准 Linux 内核脱节
- **资源浪费**：DPDK 需要占用整个 CPU 核心进行忙轮询（busy-polling），在按核心计费的公有云中成本很高

反过来，标准的内核网络协议栈虽然安全、可维护、支持按需 CPU 扩展，但性能很差——在一个典型 OLTP 负载下，64% 的 CPU 时间花在遍历内核网络协议栈，16% 花在使用户态-内核态切换，12% 花在中断处理上。

**DINT 的核心问题**：能不能在不修改内核代码、不加载自定义内核模块的前提下，利用现代 Linux 内核自带的 eBPF 技术，让内核协议栈达到接近内核旁路的性能？

## 三、eBPF 是什么？（零基础理解）

eBPF（extended Berkeley Packet Filter）是 Linux 内核的一个机制，允许用户在**不修改内核源码**的情况下，向内核中安全地运行自定义程序。

你可以把它理解为给 Linux 内核装了几个"插件接口"：

1. 你用类似 C 的语言写一段小程序
2. 编译器把它变成 eBPF 字节码
3. 内核先做一个"安全检查"（确保不会越界访问内存、保证一定会终止）
4. 检查通过后，字节码被编译成机器码，直接在内核里运行

eBPF 有两个主要的网络挂钩点（hook）：

- **XDP（eXpress Data Path）**：在网卡收到数据包后、进入内核协议栈之前触发——最快
- **TC（Traffic Control）**：在网卡驱动层和 TCP/UDP 层之间触发——适用于收发双向

eBPF 程序的状态不能存在局部变量里（因为每次调用都是独立的），而是存在**eBPF Maps**中——这是一种内核中的共享数据结构，类似哈希表或数组，可以被不同的 eBPF 程序和用户态进程共享。

## 四、DINT 的核心设计思想

DINT 的总体架构如图 2 所示。它的核心思路是：

> **把高频路径的操作卸载到内核（通过 eBPF），把低频路径的操作留在用户态作为后备。**

一个分布式事务通常涉及三个组件：锁管理器（Lock Manager）、键值存储（KV Store）、日志管理器（Log Manager）。DINT 尝试将这三个组件尽可能多地卸载到内核中。

### 4.1 锁管理器：用"锁共享"解决 eBPF 的限制

eBPF 有三个重要限制：
1. 不支持动态内存分配
2. 只支持有限次数的循环（静态确定的）
3. 没有高级同步原语（如 Mutex，只有低级的自旋锁）

传统的锁管理器用哈希表来索引锁状态，但哈希表处理冲突需要动态分配或无限循环——这在 eBPF 中几乎不可能。

**DINT 的解决方案：锁共享（Lock Sharing）**

两个不同的锁 ID 可能映射到同一个锁状态槽位。这类似于停车场里两辆车共享一个车位编号——虽然增加了冲突概率，但避免了复杂的冲突处理机制。

如果发生死锁风险（同一事务的两个排他锁映射到同一个锁状态），DINT 会检查这两个锁是否来自同一个事务客户端，如果是就直接返回成功。

### 4.2 键值存储：内核缓存 + 用户态溢出

eBPF 不支持动态内存分配，所以不能像传统 KV 存储那样动态分配不同大小的值。

**DINT 的解决方案：集合关联缓存（Set-Associative Cache）**

每个内核桶（bucket）固定存储 4 个键值对，每个值的字段大小固定（能覆盖大多数事务对象）。溢出的键值对被"倾倒"到用户态的溢出桶中。

关键创新是**回写机制（Write-Back）**和**布隆过滤器（Bloom Filter）**：

- 每个内核桶中的键值对有一个"脏位（dirty bit）"，标记是否与用户态不一致
- GET 操作找不到键时，先查布隆过滤器——如果布隆过滤器说"不存在"，就保证一定不存在，直接返回
- 插入/更新操作优先在内核中完成，只有在必要时才"捎带（piggyback）"数据到用户态

### 4.3 日志管理器：每 CPU 环形缓冲区

DINT 为每个 CPU 核心分配一个环形日志缓冲区（使用 eBPF 的 per-CPU array map），这样不同核心的事务写入日志时不会互相竞争。

## 五、代码示例

### 示例 1：eBPF 锁获取（伪代码）

下面展示了 DINT 锁管理器中获取排他锁的核心逻辑。注意这里用的是 eBPF 原语 `__sync_val_compare_and_swap`，它在编译后会变成一条硬件原子指令（如 x86 的 CMPXCHG）：

```c
// DINT 锁管理器：获取排他锁的 eBPF 程序片段
// 绑定到 XDP hook，收到锁请求后在内核中直接处理

int lock_acquire_exclusive(struct tx_request *req) {
    // 1. 通过锁 ID 找到对应的锁状态槽位（使用 eBPF array map）
    long *lock_state = bpf_map_lookup_elem(&lock_table, &req->lock_id);
    if (!lock_state) return TX_LOCK_NOT_FOUND;

    // 2. 用 CAS 操作原子地测试并设置自旋锁位
    //    相当于：if (spinlock_bit == 0) spinlock_bit = 1;
    unsigned long expected = 0;
    unsigned long actual = __sync_val_compare_and_swap(
        &lock_state->spinlock_bit, 0, 1);

    if (actual != 0) {
        // 锁已被占用，返回失败让客户端重试
        return TX_LOCK_BUSY;
    }

    // 3. 检查是否是同一事务的递归锁获取（锁共享场景）
    if (lock_state->holder_client_id == req->client_id) {
        // 同一事务，直接返回成功，避免死锁
        return TX_LOCK_OK;
    }

    // 4. 检查锁是否已被独占持有
    if (lock_state->exclusive_flag) {
        // 锁已被其他事务独占，释放自旋锁后返回失败
        __sync_fetch_and_sub(&lock_state->spinlock_bit, 1);
        return TX_LOCK_BUSY;
    }

    // 5. 设置独占标志，返回成功
    lock_state->exclusive_flag = 1;
    lock_state->holder_client_id = req->client_id;
    return TX_LOCK_OK;
}
```

**逐行解释**：
- 第 5 行：从 eBPF map 中查找锁状态。这就像去停车场查某个车位的信息，直接在内存数组里找，不需要遍历哈希表
- 第 10-11 行：`__sync_val_compare_and_swap` 是一条原子指令，保证"检查并同时设置"这个操作不会被其他 CPU 打断。这是 eBPF 中实现并发控制的基础工具
- 第 18-21 行：锁共享的死锁检测——如果两个锁 ID 映射到同一个锁状态，但它们来自同一个事务，就认为是安全的（递归获取）
- 第 24-27 行：如果锁已经被其他事务独占，就释放刚才拿到的自旋锁并返回失败

### 示例 2：eBPF 键值存储的 GET 操作

```c
// DINT KV 存储：GET 操作的 eBPF 程序片段
// 绑定到 XDP hook，处理键值读取请求

int kv_get(struct tx_request *req) {
    // 1. 通过 key 的哈希值找到对应的内核桶
    uint32_t bucket_idx = req->key_hash % NUM_BUCKETS;
    struct kv_bucket *bucket = bpf_map_lookup_elem(
        &kv_table, &bucket_idx);
    if (!bucket) return TX_KV_ERROR;

    // 2. 尝试获取桶级别的锁
    int ret = bucket_lock_acquire(bucket);
    if (ret != OK) return ret;

    // 3. 在内核桶中线性查找 key（最多 4 个元素，循环次数固定）
    for (int i = 0; i < MAX_KEYS_PER_BUCKET; i++) {
        if (!bucket->valid_bits[i]) continue;  // 跳过空槽位
        if (memcmp(&bucket->keys[i], &req->key, KEY_SIZE) == 0) {
            // 找到了！直接从内核内存读取值，无需用户态参与
            req->value = bucket->values[i];
            req->version = bucket->versions[i];
            req->result = TX_KV_HIT;
            goto done;  // 频繁路径：在内核中直接返回
        }
    }

    // 4. 内核桶中没找到，查布隆过滤器
    if (!bloom_filter_contains(&bucket->bloom_filter, req->key_hash)) {
        // 布隆过滤器说"肯定不在"，那一定不存在
        req->result = TX_KV_MISS;
        goto done;
    }

    // 5. 布隆过滤器说"可能在"，说明溢出了，需要去用户态查
    //    先选一个要驱逐的键值对（优先选脏的）
    int evict_idx = find_evict_slot(bucket);
    if (evict_idx >= 0 && bucket->dirty_bits[evict_idx]) {
        // 捎带一个脏的键值对到用户态，让它先写回去
        req->piggyback_kv = bucket->values[evict_idx];
        req->piggyback_key = bucket->keys[evict_idx];
    }

    // 6. 把请求包发给用户态处理（罕见路径）
    req->result = TX_KV_MISS_USER;
    // ... 发送给用户态，用户态处理完后通过 UDP 返回响应
    // 响应包经过 TC egress hook 时，由另一个 eBPF 程序回填结果

done:
    bucket_unlock(bucket);
    return OK;
}
```

**关键设计点**：
- 第 14 行的 `for` 循环最多执行 4 次——因为每个桶固定存 4 个键值对，这满足了 eBPF 的"静态确定循环"要求
- 第 22 行的布隆过滤器查询是关键优化：对于不存在的 key 查询（在 TATP 工作中占最大表的 68.75% 的 GET 请求），可以直接在内核中返回，避免了昂贵的用户态切换
- 第 34 行的"捎带"机制：把即将被覆盖的脏数据一起带给用户态，让用户态在写入新数据的同时先把旧数据落盘，保证了数据一致性

## 六、DINT 的性能表现

DINT 在两个 OLTP 负载上进行了评估：

| 指标 | 结果 |
|------|------|
| 相比 DPDK-based Caladan 的吞吐量提升 | 最高 **2.6 倍** |
| 平均未负载延迟增加 | 最多 **10%** |
| 99 尾延迟增加 | 最多 **16%** |

DINT 甚至比 Caladan 更快，原因是 Caladan 为了提供高层连接抽象（`rt::UdpConn`），需要在网络缓冲区和应用缓冲区之间复制数据包，而 DINT 直接修改原始以太网数据包并转发回去，省去了拷贝开销。

## 七、DINT 的贡献总结

1. **第一个在内核协议栈 + 通用商用网卡上实现接近内核旁路性能的分布式事务系统**——核心思路是用 eBPF 做内核卸载
2. **设计了内核-用户态之间的键值缓存同步机制**——通过回写机制和布隆过滤器高效维护一致性
3. **实验证明了内核协议栈也能做到内核旁路级别的性能**——打破了"高性能必须内核旁路"的传统认知

## 八、局限性与思考

- DINT 目前只支持 UDP 不可靠传输，以简化 eBPF 中的数据包处理
- 主要针对小键值对（<9KB，能放入单个以太网帧），大值会被传递到用户态
- 尚未实现故障恢复功能（假设由独立配置管理器处理）
- eBPF 的编程模型限制意味着某些复杂操作（如动态内存分配、无界循环）无法在内核中完成

## 九、我的理解

DINT 给我最大的启发是：**不要认为"安全"和"性能"一定是互斥的**。传统观点认为，想要高性能就必须牺牲内核的安全性和可维护性（用 kernel-bypass），但 DINT 用 eBPF 证明了可以在内核内部实现高性能——关键是重新设计数据结构以适应 eBPF 的限制，而不是硬套用户态的设计。

这种"为频繁路径做优化、为罕见路径留后备"的思路，在很多系统中都有应用价值。
