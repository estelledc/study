---
title: "Skybridge: Bounded Staleness for Distributed Caches"
来源: "https://www.usenix.org/conference/osdi25/presentation/lyerly"
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式缓存
provenance: pipeline-v3
---

## 是什么

**Skybridge: Bounded Staleness for Distributed Caches** 是 Meta 在 OSDI 2025 上发表的论文，提出一种给分布式缓存"限时同步"的旁路方案。

日常类比：想象你开连锁超市，每个分店自己记账（异步复制），A 店收了客户 100 块钱，别店要很久才知道——这 100 块可能已经被花掉了。Skybridge 就像一条"加急短信专线"：主记账流程照旧慢同步，但 A 店每做一笔账，立刻通过专线发条加急短信告诉其他店"这笔发生了"，其他店在很短时间窗口内就能查到最新账目。主系统照常异步跑，Skybridge 只是给它们加了一个"时效保证"。

## 为什么重要

- Meta 全球多地域部署，异步复制是常态，但"数据过时"导致大量 bug
- 最终一致性太松（99.93% 写入在 2 秒内同步），业务需要更强保证
- 方案开销极小（0.54% 部署规模），性价比极高
- 对任何用异步复制 + 缓存的世界级系统都有参考价值

## 核心概念

### 1. Bounded Staleness（有界陈旧性）

分布式系统里，写操作在不同副本上可见的时间差叫"staleness"。Skybridge 的目标是让这个时间差 ≤ 2 秒（对 99.99998% 的写入而言），相比主复制管道（99.93% 的 2 秒可达率）提升 5 个数量级。

```python
# 概念示意：主复制管道 vs Skybridge 的可见性差异

# 时间轴（秒）
# 写入发生在 Region A

# 主复制管道（异步，最终一致）：
#   t=0    Region A: 写入完成
#   t=0.5  Region A: 写入可见
#   t=1.2  Region B: 写入可见（慢副本）
#   t=2.5  Region C: 写入可见（超出 2s 窗口！）
#   t=5.0  Region D: 写入可见（更慢）
#
#   2 秒内可见率: 99.93%
#   最大可见延迟: 可达数分钟（极端情况下）

# Skybridge（旁路，有界保证）：
#   t=0    Region A: 写入完成
#   t=0.01 Region A: 写入可见（本地）
#   t=0.5  Region B: Skybridge 送达，写入可见
#   t=0.8  Region C: Skybridge 送达，写入可见
#   t=1.5  Region D: Skybridge 送达，写入可见
#   t=2.0  Region C: 超时回退到主管道
#
#   2 秒内可见率: 99.99998%
#   最大可见延迟: ~2 秒（有硬性上限）
```

### 2. Out-of-Band Replication Stream（旁路复制流）

Skybridge 不侵入现有复制管道，而是利用 Meta 已有的"可靠投递流"。Meta 的系统内部本来就有数据复制通道，Skybridge 的核心洞察是：既然数据已经从一个节点流向另一个节点，那只要"实时转发"而不是"异步堆积"，就能提供有界延迟。

```python
# Skybridge 的架构示意

# 主复制管道（已有的、慢的异步复制）：
#
#   Region A (Writer)
#       |
#       v
#   [Replication Queue] ---> [Batch Flush] ---> [Region B/C/D Replicas]
#       ^                                    (数秒~分钟级)
#       |
#   批量提交、网络合并、批量应用

# Skybridge 旁路流（实时、轻量、有界延迟）：
#
#   Region A (Writer)
#       |
#       +---> [Skybridge Stream] ---> [Region B/C/D Replicas]
#            (单条实时转发)              (毫秒~秒级)
#
# 两者并行运行，互不干扰：
#   - Skybridge 负责"快"（bounded staleness）
#   - 主管道负责"准"（最终一致性的兜底保证）
#   - 如果 Skybridge 慢了，主管道兜底，没有单点故障
```

### 3. 互补而非替代

Skybridge 最巧妙的地方在于：它不试图替换现有复制机制，而是与之互补。这避免了关联故障（correlated failure）——如果 Skybridge 出了问题，主管道仍在运行；如果主管道慢了，Skybridge 已提供新鲜数据。

## 核心算法与流程

### Skybridge 数据流

```python
# Skybridge 的单条数据传播流程（伪代码）

class SkybridgeReplicator:
    """
    核心思路：利用已有的可靠复制通道，
    把"批量异步转发"改成"逐条实时转发"。
    """

    def on_write(self, key, value, version):
        """Region A 收到写入时的入口"""
        # 1. 本地先写成功
        self.local_store.set(key, value)

        # 2. 立刻通过旁路流发送（不阻塞写入）
        # 利用已有的可靠投递基础设施，零额外网络栈
        self.out_of_band_stream.send({
            'key': key,
            'value': value,
            'version': version,
            'timestamp': now()
        })

    def on_stream_message(self, msg):
        """Region B/C/D 收到旁路消息"""
        # 3. 接收方拿到消息后，直接更新本地缓存
        # 如果本地已有更新，跳过（处理乱序）
        if msg['version'] > self.local_store.get_version(msg['key']):
            self.local_store.set(msg['key'], msg['value'])
        else:
            # 本地已经更新了，旁路消息是旧数据，丢弃
            pass

    def fallback_on_timeout(self, key, timeout_ms=2000):
        """超时兜底：主管道最终会送达"""
        # 如果超过 2 秒 Skybridge 还没送达，
        # 主复制管道会异步把数据带过来
        # 此时本地可能已读到旧值，但最多 stale 2 秒
        pass
```

### 版本向量和过期控制

```python
# 处理消息乱序和过期的关键数据结构

class VersionTracker:
    """
    每个 Region 维护一个向量时钟式版本追踪，
    用于判断收到的 Skybridge 消息是否比本地新。
    """

    def __init__(self):
        self.region_versions = {}  # region_id -> version_number
        self.last_cleaned = 0
        self.cleanup_interval = 100  # 每处理 100 条消息清理一次

    def should_apply(self, msg_key, msg_version, local_version):
        """
        判断是否应该应用这条消息：
        - 如果消息版本 > 本地版本，应用
        - 如果消息版本 <= 本地版本，说明本地更更新，跳过
        - 如果消息太旧（超过清理窗口），直接丢弃
        """
        if msg_version > local_version:
            return True  # 有新数据，更新
        elif msg_version > (local_version - self.cleanup_interval):
            return False  # 旧数据但还在窗口内，跳过（静默）
        else:
            return 'discard'  # 太旧了，直接丢弃

    def cleanup(self):
        """
        定期清理过期的版本条目，防止版本信息无限增长。
        这是 Skybridge 开销极低的原因之一。
        """
        # 只保留最近 cleanup_interval 条版本记录
        cutoff = self.last_cleaned - self.cleanup_interval
        self.region_versions = {
            k: v for k, v in self.region_versions.items()
            if v > cutoff
        }
        self.last_cleaned = self.last_cleaned
```

## 关键数据

| 指标 | 主复制管道 | Skybridge |
|------|-----------|-----------|
| 2 秒内可见率 | 99.93% | 99.99998% |
| 部署开销 | 已有 | 主部署的 0.54% |
| 设计方式 | 主复制管道 | 旁路流（互补） |
| 故障影响 | 如果慢，数据陈旧 | 如果失败，主管道兜底 |

## 工程实现要点

- **复用已有基础设施**：Skybridge 不需要新建网络栈，Meta 的系统内部本来就有可靠的复制通道
- **轻量级**：0.54% 的部署开销意味着几乎免费
- **无侵入**：不改现有复制逻辑，只是多一条更快通道
- **兜底机制**：Skybridge 失败不影响最终一致性，主管道保证兜底

## 适用 vs 不适用场景

**适用**：
- 全球多地域部署的大型缓存系统
- 业务对数据新鲜度敏感，但不能承受同步复制的性能代价
- 已有可靠复制基础设施（如 Meta 内部系统）

**不适用**：
- 单机或少地域部署（没有异步复制问题）
- 强一致性要求（需要事务性复制，不是缓存级别）
- 没有已有复制基础设施的系统（要搭两套管道不划算）

## 学到的东西

- 系统设计的"旁路优先"思路：不替换核心管道，而是加一条更快的侧路
- 有界保证比绝对保证更实用——"最多慢 2 秒"比"最终一致"对业务更友好
- 互补设计避免关联故障，提高整体系统的韧性
- 最小开销验证：0.54% 的开销意味着几乎所有部署都值得试试

## 延伸阅读

- 原文：https://www.usenix.org/conference/osdi25/presentation/lyerly
- [[memcached-fb-2013]] — Scaling Memcache at Facebook
- [[tao-2013]] — Facebook 的图数据库
- [[f4-2014]] — Facebook 存储旧图片的冷数据系统
- [[fidge-1988]] — 向量时钟的早期工作

## 关联

- [[memcached-fb-2013]] —— Facebook 缓存扩展经验
- [[tao-2013]] — 同是 Meta 大规模数据服务
- [[f4-2014]] — Meta 冷数据管理
