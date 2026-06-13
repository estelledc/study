---
title: Bounded Priority-Aware Locking for Real-Time Kernels
来源: https://arxiv.org/abs/2605.27620
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

# Bounded Priority-Aware Locking for Real-Time Kernels

## 一、一个日常类比

想象你走进一个只有一扇门的会议室。门上有规则：一次只能进一个人，进去的人关上门开完会才能出来。这就是"锁"。

现在假设进来的人分三种：急症病人（高优先级）、普通病人（中优先级）、体检的人（低优先级）。

如果规则是"先到先进"（FIFO），那么一个低优先级的人抢在高优先级病人前面进门，高优先级病人就要多等一轮——这就是"优先级反转"。

如果规则是"谁急谁先"（Strict Priority），那所有低优先级的人都永远进不去——这就是"饥饿"。

BPL 方案说：我们把来的人分批次。同一批进来的人里，按紧急程度排；但先到的批次，比后到的批次优先。这样既照顾了紧急程度，又不会让谁饿死。

## 二、核心问题：实时系统中的锁

### 2.1 什么是实时系统

实时系统不是"越快越好"，而是"必须在截止时间前完成"。比如飞行控制、汽车刹车——错过了截止时间，后果严重。

### 2.2 多核时代的共享资源问题

现代实时系统通常有多个 CPU 核心。多个核心上的程序可能同时需要访问同一个共享资源（比如操作系统的内核数据）。为了保证安全，需要用锁来序列化访问。

关键挑战有两个：

1. **等待时间必须有上限**。系统需要知道"最坏情况下我等多久"，才能证明所有任务都能在截止时间前完成。
2. **高优先级任务不应该被低优先级任务无谓地拖慢**。

### 2.3 三种锁的对比

| 锁类型 | 高优先级任务等待 | 低优先级任务等待 | 等待时间有上限？ |
|---|---|---|---|
| 简单自旋锁 | 不确定，可能很长 | 不确定，可能很短 | 理论上有，但不考虑优先级 |
| FIFO 锁 | 和所有人一样 | 和所有人一样 | 有（m-1 轮临界区长度） |
| 严格优先级锁 | 最短 | 可能被饿死 | 没有（可能无限等） |
| **BPL** | 比普通 FIFO 短 | 有保证不会饿死 | 有（和 FIFO 一样的上限） |

## 三、BPL 的核心设计

BPL（Batched Priority Lock）分四个阶段让等待中的任务竞争锁：

**阶段 0（批处理）**：每个新来的任务获得一个批次号。最早到达的那个批次（批次号最小的）晋级到下一阶段。

**阶段 1（优先级排序）**：同一批次内，所有任务竞争，找出优先级最高的那个。

**最终阶段（自旋）**：批次号和优先级都确定后，任务用传统自旋锁竞争实际访问。

### 3.1 BPL 锁对象的内部状态

一个 BPL 锁维护以下几个关键状态：

- `num_waiters`：当前在等待的任务数量
- `curr_batch`：一个复合值，高几位是批次号，低几位是当前批次中有多少等待者
- `batch_barrier`：阶段 0 的"门控值"，记录最早到达的批次号
- `priority_barrier`：阶段 1 的"门控值"，记录当前批次中最高的优先级
- `settling`：一个位图数组，标记每个核心上的任务在哪个阶段
- `status`：锁是否被持有的标志

### 3.2 代码示例 1：加锁流程

下面用伪代码展示 BPL 的核心加锁逻辑。这个实现依赖于硬件提供的原子操作：CAS（比较并交换）、TAS（测试并设置）、FAA（获取并增加）。

```c
// BPL 锁对象的内存布局
struct bpl {
    uint32_t num_waiters;     // 当前等待者数量
    uint32_t curr_batch;      // 批次号 + 批次内计数（合并在一个整数中）
    uint32_t batch_barrier;   // 阶段 0 门控：最早批次号
    uint32_t priority_barrier;// 阶段 1 门控：最高优先级
    uint64_t settling[2];     // 位图：标记各核心在哪个阶段
    uint8_t  status;          // 0 = 空闲, 1 = 被持有
};

// 加锁函数
void bpl_lock(struct bpl *lock, uint32_t task_priority, int core_id) {
    // ---- 快速路径：没人等的时候直接拿到锁 ----
    if (lock->num_waiters == 0) {
        // 尝试把 curr_batch 清零，说明锁完全空闲了
        if (CAS(&lock->curr_batch, old, 0)) {
            // 用 TAS 尝试获取锁，成功就直接进入临界区
            if (!TAS(&lock->status)) {
                return; // 拿到了！
            }
        }
    }

    // ---- 有人竞争：进入正式流程 ----

    // 1. 增加等待者计数
    INC(&lock->num_waiters);

    // 2. 获取批次号：FAA 原子地增加 curr_batch 并返回旧值
    //    右移 k 位得到批次号（低 k 位是批次内计数）
    uint32_t batch = FAA(&lock->curr_batch, 1) >> k;

    // 3. 阶段 0：批处理 —— 只有最早到达的批次能通过
    SET(&lock->settling[0], core_id); // 标记自己在阶段 0

    read_batch_barrier:
    uint32_t prev = lock->batch_barrier;
    if (batch <= prev) {
        // 自己的批次号 <= 当前门控批次号，尝试成为新的门控
        if (CAS(&lock->batch_barrier, prev, batch)) {
            RESET(&lock->settling[0], core_id); // 晋级，清除标记
            goto stage_1;
        }
    } else {
        // 有人批次号更早，等等再试
        goto read_batch_barrier;
    }

    // 如果 batch > batch_barrier，说明自己不是最早的一批，
    // 等当前批次的人都到齐后再试
    RESET(&lock->settling[0], core_id);
    while (lock->settling[0] != 0) {
        if (lock->batch_barrier != batch) {
            goto read_batch_barrier; // 批次变了，重新排队
        }
    }

    // 4. 阶段 1：优先级排序 —— 同一批次里，最高优先级的通过
    stage_1:
    SET(&lock->settling[1], core_id); // 标记自己在阶段 1

    read_priority_barrier:
    prev = lock->priority_barrier;
    if (lock->batch_barrier != batch) {
        // 批次号变了，重新排队
        STORE(&lock->priority_barrier, 0xFFFFFFFF);
        RESET(&lock->settling[1], core_id);
        goto stage_0;
    }

    // 数值越小 = 优先级越高，所以尝试把自己的优先级"压低"
    if (task_priority <= prev) {
        if (CAS(&lock->priority_barrier, prev, task_priority)) {
            RESET(&lock->settling[1], core_id); // 晋级，清除标记
            goto final_stage;
        }
    } else {
        goto read_priority_barrier;
    }

    RESET(&lock->settling[1], core_id);
    while (lock->settling[1] != 0) {
        if (lock->priority_barrier != task_priority) {
            // 批次号变了或优先级变了，重排
            goto stage_1;
        }
    }

    // 5. 最终阶段：真正的自旋锁竞争
    final_stage:
    if (lock->priority_barrier != task_priority) {
        goto stage_1; // 批次变了，回到优先级排序
    }
    if (lock->batch_barrier != batch) {
        STORE(&lock->priority_barrier, 0xFFFFFFFF);
        goto stage_0; // 批次变了，回到批处理阶段
    }

    // 尝试获取锁
    if (!TAS(&lock->status)) {
        return; // 拿到了！
    } else {
        goto final_stage; // 没拿到，继续自旋
    }

    // 拿到锁后，进入临界区...
    // --- 临界区 ---
    // ...

    // 解锁时重置批次计数，开始新的一批
    unlock(lock);
}
```

### 3.3 代码示例 2：解锁流程

解锁看起来很简单，但有一个关键操作：重置批次计数。

```c
// 解锁函数
void bpl_unlock(struct bpl *lock) {
    // 清除 curr_batch 低 k 位（批次内计数归零）
    // 然后高 k 位加 1（新的批次号）
    uint32_t new_val = lock->curr_batch;
    new_val = new_val & ~((1 << k) - 1);  // 清零低 k 位
    new_val = new_val + (1 << k);          // 批次号 +1

    STORE(&lock->curr_batch, new_val);

    // 释放锁
    RESET(&lock->status, 0);
}
```

每次解锁都产生一个新批次号，等待中的任务全部被"打回"阶段 0 重新排队。这样确保了：先到的批次优先获得服务，同一批次内优先级高的优先获得服务。

### 3.4 工作流程图解

用一个 3 核心的例子来看 BPL 是如何工作的：

```
时刻 t=1: 任务 τb (中优先级) 持有锁，在 Core 1 上运行

时刻 t=2: 任务 τc (低优先级) 在 Core 2 上请求锁 -> 进入阶段0，批次0
         任务 τa (高优先级) 在 Core 0 上请求锁 -> 进入阶段0，批次0

时刻 t=3: τb 释放锁 -> curr_batch 批次号+1，status 清零
         τa 发现自己是批次0中优先级最高的 -> 晋级到最终阶段 -> 拿到锁
         τc 因为批次0的锁已被 τa 拿走 -> 回退到阶段1，等下一轮

结果：高优先级的 τa 只等了一个临界区的长度，而不是像 FIFO 那样
      必须等 τc 也完成才能轮到。但 τc 不会被饿死，因为它和 τa 同批。
```

## 四、为什么 BPL 比现有方案好

### 4.1 释放优先级锁（Release-prioritized）

这种方案用 FIFO 排队，但释放锁时，持有锁的任务要遍历整个等待队列找最高优先级的。问题：**这延长了临界区的实际执行时间**，因为释放操作本身变慢了。

### 4.2 获取优先级锁（Acquire-prioritized）

这种方案用优先级队列，任务在申请锁时就按优先级排好。问题：**插入优先级队列的操作本身可能有不可预测的延迟**，在最坏情况下可能导致无限等待。

### 4.3 BPL 的折中

BPL 的关键洞察是：**不需要在加锁或释放的单个步骤中完成全局优先级排序**。相反，它把排序分散到多个阶段，每个阶段的局部竞争都是常数级开销。结果是：

- 快速路径下，无竞争时性能等同简单自旋锁
- 有竞争时，高优先级任务的平均等待时间比 FIFO 短
- 所有任务的等待时间都有上限，上限值与 FIFO 锁相同

## 五、关键术语表

- **自旋锁（Spinlock）**：等待锁时不停循环检查，不释放 CPU，适合短时间等待
- **临界区（Critical Section）**：需要互斥访问的代码段
- **优先级反转（Priority Inversion）**：高优先级任务被低优先级任务间接阻塞
- **FIFO 锁**：先到先服务的锁，保证等待时间有上限但不区分优先级
- **饥饿（Starvation）**：某个任务永远等不到锁
- **CAS**：Compare-and-Swap，一种原子硬件指令
- **TAS**：Test-and-Set，另一种原子硬件指令
- **FAA**：Fetch-and-Add，原子地读取并增加一个值

## 六、思考

BPL 的设计哲学是"分批处理"而非"全局排序"。这类似于生活中的取号排队：你在银行取了一个号（批次号），窗口叫号时，同一批次内先看谁的紧急程度更高。你不需要知道所有人的情况，只需要和本批次的人竞争。

这种设计在 m 核系统中（m 通常较小，比如 8-64 核），既能保证可预测的 worst-case 等待时间，又能让高优先级任务获得更好的平均性能。

**一个值得思考的问题**：如果核数非常大（比如 1000+ 核），BPL 的 k 位拆分策略还会高效吗？因为 k = ceil(log2(m))，核数越多，用于批次数值的比特位就越少，能容纳的批次就越有限。这是一个可以进一步研究的方向。
