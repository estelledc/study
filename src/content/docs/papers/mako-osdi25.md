---
title: "Mako: Speculative Distributed Transactions with Geo-Replication"
来源: https://www.usenix.org/conference/osdi25/presentation/shen-weihai
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式数据库
provenance: pipeline-v3
---

# Mako: 推测式分布式事务 + 地理复制

## 0. 一句话总结

Mako 让跨数据中心的事务**先跑起来，再复制**。传统系统必须等"复制完成"才算提交，Mako 把复制从关键路径中抽走，在后台慢慢复制，前台事务继续飞。

## 1. 日常类比：快递分拣中心

想象一个全国快递网络：

- **传统方式（如 Spanner）**：每个包裹从分拣中心发出前，必须先复制一份运单记录到所有分部。你取个包裹，要等"抄录"完成才给你——慢，因为每条记录都要跨城复制。
- **Mako 的方式**：分拣员先把包裹打包发出（推测执行），同时在后台慢慢抄录运单（背景复制）。如果你突然说"等等，这个包发错了"，分拣中心会回滚这个包裹，并连带回滚所有依赖它的后续包裹——但不会让整个仓库停摆。

关键区别：传统方式是串行化"执行 + 复制"，Mako 是流水线式——前台跑，后台追。

## 2. 问题背景

分布式事务系统（如 Spanner、CockroachDB）要保证三件事：

1. **高可用**：即使整个数据中心宕机，服务不中断
2. **强一致性**：序列化（Serializable）隔离级别
3. **水平扩展**：数据分片（Sharding），吞吐量随分片数线性增长

但现实很骨感——分布式事务的协调开销极大，一台高性能单机多核事务引擎能做到每秒百万级事务，但加上跨数据中心复制后，吞吐量暴跌几千倍。

为什么？因为**跨数据中心的网络延迟（RTT 几十毫秒）比 CPU-内存延迟（纳秒级）高出百万倍**。就算用 RDMA 或智能网卡等超低延迟技术，在跨城场景下也帮不上忙。

## 3. Mako 的架构总览

Mako 把**事务执行**和**事务复制**解耦：

```
前台（关键路径）：
  客户端请求 → 分片 Leader 执行 → 2PC 认证 → 推测写入
  ↑ 全程只在同一数据中心内，用 DPDK 加速网络

后台（非关键路径）：
  每个分片的每核运行 Paxos → 将事务日志复制到 Follower
  ↑ 跨数据中心，不阻塞前台
```

数据跨多个分片分布，每个分片有多个 Leader-Follower 副本分布在不同数据中心。业务上常一起访问的数据（如 Uber 中的"用户+司机+起点+终点"）会被安排在同一数据中心，减少跨城延迟。

## 4. 核心概念一：推测式 2PC

### 4.1 什么是 2PC？

两阶段提交（Two-Phase Commit）是分布式事务的经典协议：

- **Prepare 阶段**：协调者问每个分片"你能提交吗？"
- **Commit 阶段**：如果所有分片都回答"能"，协调者说"大家都提交吧"

### 4.2 Mako 的创新：推测式 2PC

传统 2PC 必须等所有分片都确认后，再把结果**复制到远程副本**，才算是真正的"提交"。

Mako 的做法：

```
阶段1 执行（Execution）：
  协调者向各分片 Leader 读取数据，缓存写入
  读到的是"已认证但未复制"的推测值

阶段2 认证（Certification）：用 4 步 RPC 完成
  Step 1 Lock     → 获取 WriteSet 中所有记录的锁
  Step 2 GetClock → 各分片返回逻辑时钟，合成向量时钟
  Step 3 Validate → 检查 ReadSet 中的键没被改过
  Step 4 Install  → 各分片"推测性地"安装写入结果
                    （旧版本不立即删除，以便回滚）

阶段3 复制（Replication）：
  每个分片的每核独立运行 Paxos，将事务日志
  复制到 Follower — 不跨分片协调，完全并行
  复制完成 → 通知客户端。至此事务真正完成
```

第 4 步的"安装"不叫"Commit"，因为事务还没被复制——如果此时分片宕机，结果就丢了，只能回滚。

### 4.3 代码示例 1：推测 2PC 的完整流程

```python
# 简化版：Mako 的事务认证流程
class Transaction:
    def __init__(self, txid, readset, writerset):
        self.txid = txid
        self.readset = readset   # {shard_id: [key, ...], ...}
        self.writerset = writerset  # {shard_id: [(key, value), ...], ...}
        self.version_clock = None
        self.state = "EXECUTING"

    def execute(self, shard_leaders):
        """阶段1: 执行 — 读取各分片数据，缓存写入"""
        for shard_id, keys in self.readset.items():
            leader = shard_leaders[shard_id]
            for key in keys:
                # 读到"已认证但未复制"的推测值
                value = leader.read(key, include_certified=True)
                self.read_values[key] = value

        # 缓存写入
        for shard_id, writes in self.writerset.items():
            self.buffed_writes[shard_id] = writes

    def certify(self, shard_leaders):
        """阶段2: 认证 — 4步推测式 2PC"""

        # Step 1: Lock — 并行获取所有写锁
        lock_responses = parallel_call(
            shard_id, keys
            for shard_id, keys in self.writerset.items()
            lambda sid: shard_leaders[sid].lock(keys)
        )
        if any(r.failed for r in lock_responses):
            self.state = "ABORTED"
            return False

        # Step 2: GetClock — 获取向量时钟
        clocks = {}
        for shard_id in self.writerset:
            clocks[shard_id] = shard_leaders[shard_id].increment_clock()

        # Step 3: Validate — 检查 ReadSet 是否被修改
        for shard_id, keys in self.readset.items():
            for key in keys:
                latest_version = shard_leaders[shard_id].get_version(key)
                if latest_version != self.read_versions[key]:
                    self.state = "ABORTED"
                    return False

        # Step 4: Install — 推测性安装写入
        for shard_id, writes in self.writerset.items():
            shard_leaders[shard_id].install_speculatively(writes)

        self.version_clock = clocks
        self.state = "CERTIFIED"
        return True

    def replicate(self, followers):
        """阶段3: 复制 — 后台 Paxos 复制，完成后通知客户端"""
        for shard_id in self.writerset:
            followers[shard_id].replicate_log(
                self.txid, self.writerset[shard_id],
                self.version_clock
            )
        self.state = "COMMITTED"
        notify_client(self.txid, "committed")
```

## 5. 核心概念二：向量时钟 + 向量水印

### 5.1 向量时钟：追踪"谁依赖谁"

推测式执行最大的风险是**级联回滚**：

```
T0 写入 A = 100  → 被复制
T1 读取 A = 100  → 推测性地基于 T0 的结果继续执行
T2 读取 A = 100  → 推测性地基于 T0 的结果继续执行

如果 T0 复制失败需要回滚：
  T1 必须回滚（因为它读了 T0 的数据）
  T2 必须回滚
  如果 T1 的写入被 T3 读了... T3 也要回滚...
  这就是级联回滚——可能无限蔓延
```

Mako 用**向量时钟**做粗粒度的依赖追踪：

```python
# 向量时钟 = [分片0的计数器, 分片1的计数器, 分片2的计数器, ...]
# 每个事务被分配一个向量时钟，表示它的序列化位置

T0 = (1, 0, 0)   # 第1分片的第1个事务
T1 = (1, 1, 0)   # 第1分片第2个，第2分片第1个
T2 = (1, 2, 1)   # ...
T3 = (0, 3, 0)

# 关键不变量（Key Invariant）：
# 如果 T2（间接）读了 T1 的写入，则 T2 的向量时钟
# 在成对比较中一定大于 T1 的时钟

def dominates(clock_a, clock_b):
    """clock_a >= clock_b 当且仅当每个分量都 >="""
    return all(a >= b for a, b in zip(clock_a, clock_b))

# T1(1,1,0) dominates T0(1,0,0) → T1 依赖 T0
# T2(1,2,1) dominates T1(1,1,0) → T2 依赖 T1
# T3(0,3,0) 与 T2(1,2,1) 不可比较 → 无依赖
```

这个不变量保证了：只要时钟不满足支配关系，就一定不会因级联回滚而失控。

### 5.2 向量水印：安全重放的门槛

Follower 重放（Replay）必须保证：重放前，所有依赖的事务都已经复制到位。

**向量水印（Vector Watermark）**：
```
向量水印 = [分片0的水印, 分片1的水印, 分片2的水印]

每个分片独立计算自己的水印 = 所有 Worker 线程 Paxos 时钟的最小值
然后各分片通过后台 gossip 交换水印

当向量水印的每个分量都超过了某个事务的向量时钟时，
该事务就可以安全地重放
```

```python
# 简化版：Follower 的重放逻辑
class ShardFollower:
    def __init__(self, num_shards):
        self.vector_watermark = [0] * num_shards
        self.log_buffer = []  # 待重放的事务日志

    def advance_watermark(self, shard_id, new_value):
        """更新某个分片的水印"""
        self.vector_watermark[shard_id] = new_value

    def can_replay(self, tx_clock):
        """检查事务是否可以安全重放"""
        for shard_id, clock_val in enumerate(tx_clock):
            if self.vector_watermark[shard_id] < clock_val:
                return False
        return True

    def replay(self):
        """推进向量水印，重放所有安全的事务"""
        ready = []
        remaining = []
        while self.log_buffer:
            tx = self.log_buffer[0]
            if self.can_replay(tx.vector_clock):
                ready.append(self.log_buffer.pop(0))
            else:
                break

        for tx in ready:
            self.apply_write(tx.writerset)
```

## 6. 核心概念三：故障恢复与有限回滚

### 6.1 问题

如果 Leader 在复制完成前宕机：
- 该事务的日志可能部分丢失
- 已推测执行的事务需要回滚
- 依赖这些事务的事务也需要回滚
- 但不应该让整个系统停摆

### 6.2 Mako 的方案：Epoch + 终止向量水印

```
每个"纪元"（Epoch）对应一组事务：

1. 健康分片主动"关闭"旧纪元：
   - 完成所有在途事务
   - 向所有 Paxos 流发送特殊标记（INF），表示
     "该纪元的所有事务均已复制，无丢失依赖"

2. 计算终止向量水印（FVW）：
   - 各分片交换最终水印 → 形成全局一致的 FVW
   - 在旧纪元中，时钟超过 FVW 的事务全部回滚
   - 回滚数量是**有界的**——不会无限蔓延

3. 健康分片不需要等新纪元关闭就可以继续处理
   不涉及失败分片的事务 — 系统不会整体冻结
```

```python
# 简化的故障恢复流程
def recover_from_failure(failed_shards, healthy_shards):
    """
    恢复流程：不冻结整个系统，只回滚受影响的事务
    """
    # Step 1: 各健康分片关闭旧纪元
    final_watermarks = {}
    for shard in healthy_shards:
        shard.close_old_epoch()  # 完成在途事务 + 发送 INF 标记
        final_watermarks[shard.id] = shard.finalized_watermark

    # Step 2: 计算终止向量水印 (FVW)
    fvw = pairwise_min(final_watermarks.values())
    # fvw = [min(w0), min(w1), min(w2)]

    # Step 3: 回滚所有时钟超过 FVW 的事务
    for shard in all_shards:
        rolled_back = []
        for tx in shard.certified_transactions:
            if not dominates(tx.version_clock, fvw):
                tx.abort_forever()
                rolled_back.append(tx)
        assert len(rolled_back) > 0  # 有界，不会无限增长

    # Step 4: 健康分片可以立即继续服务
    # 不涉及失败分片的事务不受影响
```

## 7. 性能亮点

在 Azure 上的评测：
- **3.66M TPC-C 事务/秒**（10 分片，每分片 24 线程）
- 比最接近的地理复制优化系统高 **8.6 倍**
- 相比 Calvin（预排序方案），吞吐量高出更多——因为 Mako 保留了多核 Leader 的并行执行能力，不受预排序限制

## 8. 与传统方案的对比

| 方案 | 复制在关键路径？ | 推测执行？ | 级联回滚可控？ |
|------|------|------|------|
| Spanner | 是 | 否 | N/A |
| Calvin | 是（预排序日志） | 否 | 无（重放顺序固定） |
| Silo | 不适用（单机） | 否 | N/A |
| **Mako** | **否（解耦）** | **是** | **向量时钟 + 有界** |

## 9. 核心要点回顾

1. **解耦执行和复制**：Mako 最大胆的想法是把复制从关键路径中踢出去
2. **推测 2PC**：4 步 RPC 完成认证，不等待复制，前台事务不停
3. **向量时钟做粗依赖追踪**：够用、轻量、不会拖垮百万 TPS
4. **向量水印做安全重放门槛**：让 Follower 并行复制、有序重放
5. **有限级联回滚**：Epoch + FVW 保证回滚有界，不会级联到新纪元
6. **健康分片不受影响**：一个分片故障不会冻住整个系统

## 10. 思考题（自测）

Q: 如果所有分片的 Leader 都在同一个数据中心，Mako 的优势还明显吗？

提示：想想关键路径里还有多少次跨数据中心通信。
