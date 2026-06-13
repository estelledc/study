---
title: LoLKV — 不用日志也能线性一致性的键值存储
来源: https://www.usenix.org/conference/nsdi24/presentation/alquraan
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式存储
provenance: pipeline-v3
---

# LoLKV: 不用日志也能线性一致性的键值存储

## 1. 从"记事本"到"白板"——日志 vs 无日志

想象你在一家餐厅当经理。

**传统方式（日志-based）**：就像每个订单都先记在一个"订单日志本"上，服务员串行地写订单，等厨房确认"好，这个订单大家都看到了"，然后才正式把菜端上桌。这个日志本是串行访问的——多人同时写就要排队。

**LoLKV 的方式**：就像一面"共享白板"。每个厨师可以直接往白板上写自己的菜，写完就"贴"上去。大家都能看到最新的菜，不需要先经过一个日志本。

LoLKV（Logless Linearizable Key-Value Storage System）是 Waterloo 大学和 Oracle Labs 在 NSDI 2024 提出的一种新型分布式键值存储系统。它的核心思想很反直觉：**去掉复制日志（replicated log），直接用 RDMA 把数据写到其他节点的内存里**。

为什么去掉日志就能更快？因为日志本质上是一个"串行化点"——所有操作必须按顺序写入日志，多核 CPU 的并行能力就被浪费了。LoLKV 用锁-free 的多线程设计，让多个线程可以同时更新不同的数据。

## 2. 前置知识：RDMA 是什么？

RDMA（Remote Direct Memory Access）是一种网络技术，让一台计算机能**直接读写另一台计算机的内存，完全跳过对方的 CPU 和操作系统内核**。

日常类比：

- **传统 TCP/IP**：像在两个城市之间寄信。发信人写封信 → 邮局分拣 → 对方邮局 → 对方拆开读。每一步都要人（CPU）参与。
- **RDMA**：像两人之间有直达管道。你要读对方的内存，直接伸手过去拿，不需要对方任何人参与。

RDMA 有两种主要操作：
- **单侧操作（One-sided）**：发送方指定远程内存地址，直接写/读。接收方 CPU 不干活。
- **双侧操作（Two-sided）**：传统的 send/receive，双方 CPU 都参与。

LoLKV 用 RDMA 的单侧写（RC 传输协议）来复制数据，延迟在微秒级别。

## 3. LoLKV 的核心架构

### 3.1 两个关键数据结构

LoLKV 只有两个核心组件：

```
┌─────────────────────────────────────────────┐
│  Segment Store（段存储）                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Segment 1 │  │ Segment 2 │  │ Segment N │  │
│  │ <key,val> │  │ <key,val> │  │ <key,val> │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                             │
│  每个 Segment 是一块等大小的内存区域         │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  Hash Table（哈希表）                        │
│  ┌──────┬──────┐                             │
│  │ key1 │ ptr1 │ → 指向 Segment Store 中的   │
│  │ key2 │ ptr2 │   实际数据位置（偏移量）      │
│  │ key3 │ ptr3 │                             │
│  └──────┴──────┘                             │
│                                             │
│  哈希表只存指针，数据在 Segment Store 里      │
└─────────────────────────────────────────────┘
```

**类比**：哈希表就像图书馆的"索引卡"，只记录书在哪个架子上（指针）；真正的内容（书）在"书架"（Segment Store）上。

### 3.2 主从复制模型

LoLKV 也是主从（leader-follower）模型：

```
客户端请求 ──→ [ Leader 节点（多线程并行处理） ]
                  │
                  │ RDMA 单侧写（直接写入远程内存）
                  ↓
            [ Follower 节点（被动接收，CPU 不干活） ]
```

- **Leader**：只有一个 Shard，但内部是多线程的，可以用尽节点的所有 CPU 核心。
- **Follower**：完全被动。Leader 通过 RDMA 直接把数据写进 Follower 的内存，Follower 的 CPU 不参与处理。

## 4. 核心概念详解

### 4.1 段（Segment）—— 内存的"房间"

LoLKV 把内存切成等大小的"段"。每个段有一个元数据头：

```
SegmentMetadata {
    owner_id;      // 哪个线程拥有这个段（独占写权限）
    term_id;       // 当前"任期"编号（类似 Raft 的 term）
    status;        // free / active / sealed（空闲/活跃/已封条）
    seg_ver;       // 段的版本号
    object_size;   // 这个段里存放的对象大小
    tail_idx;      // 最后插入的条目索引
}
```

类比：每个 Segment 就像办公室里的一个"文件柜"。每个文件柜同一时间只属于一个员工（线程），他可以随时在里面放东西。文件柜满了就"封条"（sealed），之后谁也不能改。

### 4.2 对象条目（ObjectEntry）—— 实际存的数据

```
ObjectEntry {
    term_id;       // 写入时的任期号
    seq_num;       // 线程内的操作序列号（递增）
    incarnation;   // 原子计数器（防止并发冲突）
    key;           // 键
    value;         // 值（变长）
}
```

### 4.3 Put 操作的三步流程

以 `put(key, value)` 为例，流程如下：

```
Step 1: 创建阶段
  线程找到/申请一个空闲 Segment
  写入 ObjectEntry（包含 key, value, term_id, seq_num, incarnation）
  更新 tail_idx

Step 2: 复制阶段（Replication）
  Leader 通过 RDMA 单侧写，把 ObjectEntry 复制到多数派 Follower 的 Segment Store
  复制成功 = 提交（committed）

Step 3: 应用阶段（Application）
  Leader 更新自己的 Hash Table，让 key 指向新的 ObjectEntry
  通过 CAS（Compare-and-Swap）保证多线程安全
  返回成功给客户端
```

类比：你要修改图书馆里的一本书。
1. 你把新书放到书架上（创建）
2. 通知其他分馆"我放好了"，等多数分馆确认（复制）
3. 更新索引卡，指向新书的位置（应用）
4. 读者来借书时，直接读索引卡

### 4.4 为什么不用日志？

传统方案（如 DARE、APUS、Mu）的流程：

```
客户端请求 → 写入日志 → 复制到多数派日志 → 提交 → 应用到状态机
                          ↑ 串行锁！所有线程排队等日志
```

LoLKV 的流程：

```
客户端请求 → 直接写入 Segment Store → 通过 RDMA 复制到多数派 → 更新 Hash Table
               ↑ 多线程并行写！不同段互不干扰
```

关键区别：
- **没有日志锁**：不同线程可以写不同的 Segment，完全并行
- **没有额外拷贝**：数据只存一次，Hash Table 只存指针
- **Follower 不用重做**：数据直接写到了 Follower 的内存里

## 5. 代码示例

### 示例 1：简单的 KV 存储操作（概念实现）

```python
class LolKV:
    def __init__(self, num_threads=8):
        self.threads = [WorkerThread(i) for i in range(num_threads)]
        self.hash_table = {}        # key → 指向 SegmentStore 的偏移量
        self.segment_store = []     # 数组，每个元素是一个 Segment
        self.incarnation = [0] * 65536  # 原子计数器数组，用于排序并发写入

    def put(self, key, value):
        """
        多线程并行执行 put：
        1. 选择线程（不固定 key → 任何线程都能处理任何 key）
        2. 写入 Segment（线程独占某个段）
        3. RDMA 复制到多数派
        4. 更新 Hash Table（CAS）
        """
        # 选择任意可用线程（非固定 key 绑定）
        thread = self.threads[hash(key) % len(self.threads)]

        # 步骤 1: 创建 ObjectEntry
        obj = thread.write_object(key, value)

        # 步骤 2: RDMA 复制到多数派 Follower 节点
        committed = self.replicate_to_majority(obj)

        # 步骤 3: 更新 Hash Table（用 CAS 保证多线程安全）
        if committed:
            self.update_hash_table(key, obj.offset)
            return True

    def get(self, key):
        """
        Get 只在 Leader 本地完成。
        查 Hash Table → 拿到偏移量 → 从 Segment Store 读数据
        """
        offset = self.hash_table.get(key)
        if offset is not None:
            obj = self.segment_store.read_at(offset)
            return obj.value
        return None
```

### 示例 2：多线程并发的 Put 操作

```python
import threading
from atomic import AtomicCounter

class WorkerThread:
    """每个 WorkerThread 独立管理自己的 Segment，互不干扰"""

    def __init__(self, thread_id, incarnation_counters):
        self.thread_id = thread_id
        self.seq_num = 0           # 线程内递增序列号
        self.incarnation = incarnation_counters  # 共享原子计数器
        self.segments = []         # 本线程拥有的 Segment 列表

    def write_object(self, key, value):
        """
        线程私有操作：找段 → 写 → 更新元数据
        因为每个段同一时间只有一个线程拥有，所以不需要锁！
        """
        segment = self._find_or_create_segment(len(value))

        # 分配序列号（递增）
        self.seq_num += 1
        seq_num = self.seq_num

        # 计算并发冲突的 incarnation 值
        key_hash = hash(key) % len(self.incarnation)
        inc = self.incarnation[key_hash].increment()

        # 写入 ObjectEntry 到 Segment
        entry = ObjectEntry(
            term_id=self.current_term(),
            seq_num=seq_num,
            incarnation=inc,
            key=key,
            value=value
        )
        offset = segment.insert(entry)

        # 更新段元数据
        segment.metadata.tail_idx = offset
        return entry

    def _find_or_create_segment(self, size):
        """
        用 CAS 找一个空闲段：
        遍历段数组，找到 owner_id == -1 的段
        用 CAS 把自己的 thread_id 写入 owner_id
        """
        for seg in self.segments:
            if seg.metadata.status == "free":
                # CAS: 只有当 owner_id == -1 时才替换
                if seg.cas_owner(-1, self.thread_id):
                    seg.metadata.status = "active"
                    seg.metadata.term_id = self.current_term()
                    seg.metadata.tail_idx = 0
                    return seg

        # 没有空闲段，创建新的
        new_seg = Segment(owner_id=self.thread_id)
        self.segments.append(new_seg)
        return new_seg
```

### 示例 3：Leader 选举与数据整合

```python
class LeaderElection:
    """
    LoLKV 的 Leader 选举很特殊——不选"数据最全"的节点，
    而是选 seg_ver 最大的节点，然后让新 Leader 去整合数据。
    """

    def elect_leader(self, my_segments, all_nodes):
        """
        每个节点汇报自己最大的 <term_id, seg_ver>
        值最大的节点成为新 Leader
        """
        # 找到所有节点中 seg_ver 最大的
        best_node = max(
            all_nodes,
            key=lambda n: n.max_segment_version()
        )

        if best_node.ip != self.ip:
            return False  # 不是自己当选

        # ===== 数据整合阶段 =====
        # 新 Leader 向每个 Follower 询问：
        # "你每个线程最后做到第几条操作了？"
        thread_states = {}
        for follower in self.followers:
            state = follower.query_thread_states()
            thread_states[follower.ip] = state

        # 找出自己缺哪些操作
        for thread_id, follower_state in thread_states.items():
            for tid, highest_seq in follower_state.items():
                if self.thread_latest_seq[tid] < highest_seq:
                    # 向拥有最新数据的 Follower 请求缺失操作
                    missing_ops = follower.get_missing_operations(
                        thread_id,
                        self.thread_latest_seq[tid],
                        highest_seq
                    )
                    self.replicate_missing(missing_ops)

        # 补齐后，更新 Hash Table
        self.apply_committed_operations_to_hash_table()
        return True
```

## 6. Leader 选举——不选"数据最全"的节点

传统共识协议（如 Raft、Paxos）选举时，会选**数据最最新、最全**的那个节点当 Leader。这样新 Leader 可以立刻开始服务。

但 LoLKV 做不到这一点，因为：

> 多个线程独立运行，线程 A 可能把操作 1、3 复制给了多数派，线程 B 把操作 2、4 复制给了另一组多数派。没有一个节点同时拥有所有操作。

所以 LoLKV 的做法是：

1. 选 `seg_ver` 最大的节点当 Leader（不一定数据最全）
2. 新 Leader 主动找其他 Follower "借"缺失的数据
3. 补齐数据后，才开始对外服务

类比：公司断电后重启。新来的经理不一定知道所有项目的进度。他要逐个问每个团队成员"你最后做到哪了？"，收集齐信息后才开始工作。

## 7. 垃圾回收——被遗忘的"旧书"怎么办？

因为 LoLKV 不用日志，数据是直接写进存储的，旧的条目不会自动消失。当同一个 key 被多次写入时，旧的条目就成了"死数据"。

LoLKV 的垃圾回收：
- 定期检查被封条（sealed）的段
- 当段内"有效对象"的比例低于阈值时，把有效对象搬到新段
- 搬完后，旧段就可以释放了

## 8. 性能对比

论文评估显示 LoLKV 相比现有系统优势显著：

| 对比系统 | 吞吐提升 | 尾延迟降低 |
|---------|---------|----------|
| DARE    | 1.7–2.9× | 20–55%   |
| APUS    | 4–10×   | 56–92%   |
| Mu      | 4–10×   | 56–92%   |
| uKharon | 4–10×   | 56–92%   |

扩展性：4 节点集群达到 1800 万 ops/sec，是 DARE 的 4 倍、APUS 的 36 倍。

## 9. 总结

LoLKV 的核心创新可以用一句话概括：**去掉日志，直接写**。

| 维度 | 传统方案 | LoLKV |
|-----|---------|-------|
| 核心设计 | 复制日志（串行化点） | 直接写 Segment（无串行化） |
| 线程并行 | 锁竞争激烈 | 不同段独立，无锁 |
| 内存拷贝 | 日志存一份 → KV 存一份 | 只存一份，Hash Table 存指针 |
| Follower CPU | 需要重做操作 | 被动接收，不消耗 CPU |
| Leader 选举 | 选最完整的节点 | 选 seg_ver 最大的 + 数据整合 |
| 延迟 | 高负载下尾部延迟飙升 | 高负载下仍保持低延迟 |

LoLKV 证明了一个反直觉的结论：**分布式共识不一定需要日志**。在 RDMA 高速网络 + 锁-free 设计的加持下，去掉日志反而能获得更好的并发性能和更低的延迟。

## 10. 进一步阅读

- 原文 PDF: https://www.usenix.org/system/files/nsdi24-alquraan.pdf
- TLA+ 形式化验证: 论文第 5 节使用 TLA+ 模型检查工具验证了正确性
- 相关系统: DARE (Raft-based), APUS (Paxos-based), Mu (single-RTT consensus)
