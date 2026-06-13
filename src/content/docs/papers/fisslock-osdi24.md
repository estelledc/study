---
title: "FissLock — 用锁裂变管理百万级分布式锁"
来源: https://www.usenix.org/conference/osdi24/presentation/zhang-hanze
日期: 2026-06-13
分类: 基础设施
子分类: 分布式系统
provenance: pipeline-v3
---

# FissLock — 用锁裂变管理百万级分布式锁

## 一、从日常类比开始

想象一个大型图书馆的借阅系统。

每本书就是一个"锁"。每次借书或还书，就是"获取锁"或"释放锁"。如果两个人同时想借同一本《操作系统导论》，系统必须决定谁先谁后——这就是分布式锁的核心任务：**序列化并发访问**。

现在考虑三个不同规模的图书馆管理方案：

**方案 A：把所有借阅记录放在一个前台桌上（传统服务器方案）**

前台服务员（CPU）逐一处理借书/还书请求。人少时没问题，但如果有 100 万本书、每个读者同时借不同的书，前台就会排长队。每本书的借阅状态（谁借了、谁在等）都要记在一本大账本上，这个账本放在前台——桌子空间有限，根本放不下。

**方案 B：把热门书籍放在一个智能闸机里（NetLock 方案）**

闸机处理速度极快——每秒能处理几亿次请求。但它只有几 MB 的存储，只能记住几千本书的状态。热门书可以用，冷门书还得退回前台排队。

**方案 C：把每本书分成两个独立的管理机制（FissLock 方案）**

这就是本文的灵感：**锁裂变（Lock Fission）**。

## 二、核心概念：锁裂变

### 2.1 什么是锁裂变？

锁裂变的核心洞察非常简洁：

> **每次"借书"动作包含两个独立的部分：**
> 1. 先判断"这本书能不能借"——这是一个快速决策（看这本书当前是"无人借"还是"有人借"）
> 2. 再更新"谁借了这本书"——这是一个慢速维护（把借书人信息记到账本上）

这两个部分可以**分开处理**：

- **决策部分**（锁模式）：只有 2 比特——自由（00）、独占（10）、共享（11）。极小、固定大小。
- **维护部分**（持有者和等待队列）：可能几百字节——谁持有、谁在等、按什么顺序等。可变大小。

### 2.2 类比：火车站检票口

把火车站检票场景想象一下：

- **闸机（可编程交换机）**：负责"能不能通过"的决策。它只需要知道这扇门的状态（开放/关闭），不用管谁在等。
- **检票员（服务器上的 Agent）**：负责"谁通过了"的记录。他拿着完整的乘客名单。

闸机以线速（line-rate）处理通行决策——纳秒级。检票员在后台慢慢更新名单，不影响闸机的通行速度。

这就是 FissLock 的做法：**把锁管理器拆成两个角色，一个在交换机上做快速决策，一个在服务器上做慢速维护。**

## 三、系统架构

### 3.1 三个组件

```
应用 A ----> 锁客户端 (LC) ----> 可编程交换机上的决策器 (Decider)
                                          |
                                          v
                                    转发到对应的 Agent
                                          |
                                          v
                                    服务器上的 Agent 池 (Agent Pool)
```

- **锁客户端 (LC)**：嵌在应用里的库。调用 `acquire()` 和 `release()` 方法。
- **决策器 (Decider)**：跑在可编程交换机上。只存每个锁的**模式**（2 比特），负责快速判断能不能授予锁。
- **Agent 池**：跑在服务器上。每个锁一个 Agent，维护完整的锁信息（持有者、等待队列）。

### 3.2 关键设计：Agent 迁移

Agent 不是固定在哪台服务器的。它跟着锁的持有者走：

- 当 C 获得了锁 A，C 所在服务器的 Agent 池就创建/收到锁 A 的 Agent。
- 当 C 释放锁 A，如果下一个等待者是 D（在另一台服务器上），Agent 就"迁移"到 D 的服务器。
- 释放锁时，因为持有者和 Agent 通常在同一个服务器，**释放操作可以在本地完成**，不需要网络往返。

这大大减少了锁释放的网络开销。

## 四、代码示例

### 4.1 客户端：获取和释放锁

```python
# 伪代码：FissLock 客户端库

# 获取锁
def sslock_acquire(lid, mid, tid, mode):
    """
    lid: 锁 ID
    mid: 机器 ID
    tid: 任务 ID
    mode: 锁模式 (SHARED 或 EXCLUSIVE)
    """
    # 先看本地有没有这个锁的 Agent
    agent = agents.find(lid)
    if agent:
        # 本地 Agent，直接决定（快！）
        if agent.acquire(mode):
            return True
    else:
        # 远程 Agent，发消息给交换机决策器
        packet = {lid: lid, mid: mid, tid: tid, mode: mode}
        net_send("ACQUIRE", packet)

        # 等决策器的回复
        grant_pkt = net_recv("GRANT")

        if grant_pkt.agent:
            # 决策器回复说"可以借"，并且携带了 Agent
            grant(lid, grant_pkt.agent)
        return True


# 释放锁
def sslock_release(lid, mid, tid):
    agent = agents.find(lid)
    if agent:
        # 本地释放，最快路径
        agent.release(mid, tid)
    else:
        # Agent 在别的服务器上，需要网络调用
        packet = {lid: lid, mid: mid, tid: tid}
        net_send("RELEASE", packet)
```

**逐行解释：**
- 第 13 行的 `agents.find(lid)` 是一个哈希表查找，看看这台机器上有没有目标锁的 Agent。如果有了，说明锁的持有者也在这台机器上——这是最快路径。
- 第 19 行 `net_send("ACQUIRE", packet)` 把获取请求发给交换机。交换机在 1 微秒内就能判断能不能借。
- 第 22-25 行，如果决策器说"可以"，客户端就把收到的 Agent 注册到本地 Agent 池中。

### 4.2 决策器：交换机上的快速判断

```python
# 伪代码：交换机上的决策器（用 P4 语言实现）

def process_acquire(pkt):
    """
    收到 ACQUIRE 请求后的决策逻辑
    pkt.lid: 锁 ID
    pkt.mode: 请求的锁模式
    """
    meta = metas[pkt.lid]  # 从寄存器数组读取锁元数据

    if meta.mode == FREE:
        # 情况 1：锁是空闲的，直接授予！
        meta.mode = pkt.mode  # 更新锁模式
        grant_pkt = pkt.clone()
        net_forward("GRANT", pkt.mid, grant_pkt)  # 回复客户端

        # 同时把请求转发给对应锁的 Agent 做后续维护
        net_forward("ACQUIRE", meta.mid, pkt)

    elif meta.mode == SHARED and pkt.mode == SHARED:
        # 情况 2：锁是共享模式，且请求也是共享模式，可以叠加
        grant_pkt = pkt.clone()
        net_forward("GRANT", pkt.mid, grant_pkt)  # 授予

        # 转发给 Agent 记录新持有者
        net_forward("ACQUIRE", meta.mid, pkt)

    else:
        # 情况 3：锁不可用，需要等待
        # 把请求转发给 Agent，让 Agent 把请求加入等待队列
        net_forward("ACQUIRE", meta.mid, pkt)
```

**关键点：**
- 决策器只查 `meta.mode`——一个 2 比特的值。
- 如果锁空闲（FREE），**立即授予**，不等服务器回应。这就是"快速决策"的精髓。
- 后续的持有者记录由 Agent 异步完成，不阻塞授予流程。

### 4.3 Agent：服务器上的维护者

```python
# 伪代码：服务器上的 Agent

class Agent:
    def __init__(self):
        self.mode = FREE      # 锁模式
        self.holders = set()   # 持有者集合：{(machine_id, task_id), ...}
        self.wqueue = Queue()  # 等待队列：FIFO

    def acquire(self, mid, tid, mode):
        """尝试获取锁"""
        # 共享锁 + 共享锁 = 可以叠加
        if mode == SHARED and self.mode == SHARED:
            self.holders.add((mid, tid))
            return True  # 授予

        # 其他情况：加入等待队列
        self.wqueue.put((mid, tid, mode))
        return False  # 等待

    def release(self, mid, tid):
        """释放锁"""
        self.holders.remove((mid, tid))

        if not self.holders:
            # 没有持有者了，检查等待队列
            if not self.wqueue:
                # 没人等了，释放锁
                self.mode = FREE
                send_to_switch("FREE", self.lid)
            else:
                # 有人等，把锁和 Agent 一起移交给下一个等待者
                next_holder = self.wqueue.get()
                grant_pkt = {
                    "lid": self.lid,
                    "mid": next_holder.mid,
                    "tid": next_holder.tid,
                    "mode": next_holder.mode,
                    "agent": self,  # Agent 跟着锁走！
                }
                send_to_switch("GRANT", grant_pkt)
```

**逐行解释：**
- 第 7-10 行：如果请求共享锁、且锁当前是共享模式，直接把请求者加入持有者集合——授予成功。
- 第 13-14 行：如果锁忙（独占锁或队列里有人），把请求者加入 FIFO 等待队列。
- 第 21-28 行：当最后一个持有者释放锁时，如果队列有人，就把 Agent **连同锁**一起移交给下一个等待者。这就是"Agent 迁移"的核心。

## 五、为什么这个设计很聪明

### 5.1 内存效率

| 方案 | 每个锁的内存占用 | 一台交换机能管理多少锁 |
|------|-----------------|----------------------|
| NetLock | 几百字节 | ~10,000 |
| FissLock | 18 比特（约 2.25 字节） | **168 万** |

FissLock 在交换机上只存三个东西：
- `free` 标志：1 比特
- `r/w` 标志（共享/独占）：1 比特
- 持有者机器 ID：8 比特
- 版本检查计数器：8 比特

**每个锁只用 18 比特**，比前作少了两个数量级。

### 5.2 延迟优势

```
传统方案：  请求 -> 网络 RTT -> 服务器排队 -> CPU 处理 -> 回复
NetLock：   请求 -> 半 RTT（交换机）/ 剩余走服务器
FissLock：  请求 -> 交换机瞬间决策 -> 回复（锁已授予！）
```

FissLock 的锁授予延迟是**个位数微秒**，且稳定——没有排队延迟，因为决策在交换机上同步完成。

### 5.3 性能数据

实验结果（8 节点集群，1 百万锁）：

- 中位数锁授予延迟：比 NetLock 降低 **79.1%**（从 43.0 微秒降到更低）
- TATP 事务吞吐量：提升 **1.76 倍**
- TPC-C 事务吞吐量：提升 **2.28 倍**

## 六、细节：网络异常怎么处理

交换机和服务器之间的通信可能出现丢包、乱序、延迟。FissLock 设计了三种机制：

**机制 1：序列号防重复**

每个包带一个递增序列号。交换机记住每个服务器已处理的最大序列号，收到重复包时忽略。

**机制 2：重传机制**

服务器发出包后等待确认（ACK）。如果超时没收到，重新发送。

**机制 3：Incarnation（转世）检查**

每个锁有一个版本号。当共享锁被多个持有者获取时，版本号递增。如果交换机收到一个"旧版本"的包，它会拒绝并让服务器修复状态。

类比：就像微信消息——每条消息带一个序号。如果你发了三条消息"在吗""在吗""在吗"，最后一条到达时收信人看到你已经发过了，就会忽略。

## 七、总结

FissLock 的核心贡献可以概括为一句话：

> **把锁管理器的"决策"和"维护"拆开——决策跑在极快的交换机上（只查一个 2 比特值），维护跑在服务器上的 Agent 里（处理复杂的队列逻辑）。**

这个"锁裂变"的思想简单但威力巨大：
- 交换机只需存极少的元数据，就能管理**百万级锁**
- 锁授予是即时决策，没有排队延迟
- Agent 迁移让释放操作尽量在本地完成
- 不依赖工作负载的先验知识，鲁棒性强

FissLock 证明了：用可编程交换机加速分布式系统，关键不在于"把更多东西搬到交换机上"，而在于"找到正确的拆分点"。

---

**参考资料：**
- FissLock 原文：OSDI 2024, Zhang et al.
- 代码开源：https://github.com/SJTU-IPADS/fisslock
- 相关论文：NetLock (OSDI 2022), RedLock (Redis)
