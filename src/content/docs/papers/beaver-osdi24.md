---
title: Beaver: Practical Partial Snapshots for Distributed Cloud Services
来源: https://www.usenix.org/conference/osdi24/presentation/yu
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式系统
provenance: pipeline-v3
---

# Beaver: Practical Partial Snapshots for Distributed Cloud Services

## 一、从"拍全家福"说起

想象你有一个团队，分布在不同的城市。你想拍一张"全员到齐且状态一致"的全家福——每个人都在照片里呈现的是同一时刻的样子。

传统的做法是让所有人同时停下手中的事，摆好姿势，然后一起拍照。这就是经典分布式快照算法（Chandy-Lamport）的思路：所有参与节点同时记录自己的状态。

但在云计算世界里，这个做法行不通了。

现代云服务通常由几十个甚至上百个微服务组成，有些是你自己写的，有些是别人提供的黑盒服务（比如 AWS SNS），还有一些是外部客户端。你无法让所有这些都停下来配合你拍照。

**Beaver 要解决的问题就是：当你只能控制一部分节点时，还能不能拍到一张因果一致的"全家福"？**

## 二、为什么传统方法不行

Chandy-Lamport 算法有一个关键前提：**快照参与者集合必须是封闭的**。换句话说，如果某个节点能和你系统中的节点通信，那它也必须参与快照协议。

这在隔离的实验环境里没问题，但在真实云环境中完全不现实：

- 你的服务可能依赖 AWS SNS 这样的托管消息服务，你没法往里面塞快照标记
- 外部客户端可能在快照期间继续发消息，引入隐藏的因果关系
- 即使你完全控制所有服务器，一个外部的 AI 聊天机器人用户发了"基于上一条回复的追问"，这就构成了跨请求的因果链

只要有一个不参与快照的外部实体能引入因果关系，整个快照就废了。

## 三、Beaver 的核心洞察

Beaver 做了一个大胆的妥协：**不再保证每次快照都成功，而是在快照成功时，保证它一定是因果一致的。**

这就像你拍照时允许偶尔"拍糊了"，但只要拍清楚了，就一定是真实的。拍糊了？重拍就行。

Beaver 的关键洞察有两点：

1. **只关心入站流量**：在判断快照因果一致性时，只有进入你系统的流量相关，出去的流量不引入外部因果关系
2. **利用云数据中心的固有特征**：所有主流云平台都有 L4 软件负载均衡器（SLB），而且服务器普遍有稳定的时钟源

## 四、核心概念：Optimistic Gateway Marking (OGM)

OGM 是 Beaver 的灵魂机制。它的核心思想是：

> 不主动去阻止外部流量干扰快照，而是**检测**是否有干扰发生。检测到干扰 → 快照作废 → 重试。没有检测到 → 快照可信。

具体怎么做呢？

每个参与快照的节点维护一个逻辑时间戳向量（类似 Lamport 时钟的增强版）。当节点发送出站消息时，它会记录当前的逻辑时间。当它收到入站消息时，检查这条消息的时间戳是否"晚于"快照的起始时间。如果是，说明这条消息是在快照开始之后才发出的，但它却出现在快照结果中——这就构成了因果不一致。

不过 Beaver 聪明地利用了 SLB 的特性：

- 所有从外部来的入站流量都必须经过 SLB（VIP → DIP 转换）
- SLB 会给每个连接分配唯一的标识
- 结合稳定时钟，节点可以推断哪些入站消息可能是"因果相关的"

## 五、代码示例

### 示例 1：快照发起与 OGM 检测

```python
import time
from dataclasses import dataclass, field
from typing import Dict, Set, Optional
from enum import Enum


class EventType(Enum):
    LOCAL = "local"
    SEND = "send"
    RECEIVE = "receive"


@dataclass
class LocalState:
    """节点的本地状态——快照要记录的就是这个"""
    variables: Dict[str, object] = field(default_factory=dict)
    event_log: list = field(default_factory=list)

    def record_event(self, event_type: EventType, details: str = ""):
        self.event_log.append({"type": event_type.value, "details": details})


@dataclass
class SnapshotContext:
    """快照上下文——OGM 机制的核心数据结构"""
    snapshot_id: int
    start_logical_time: int
    received_messages: Dict[int, list] = field(default_factory=dict)
    sent_messages: Dict[int, int] = field(default_factory=dict)  # msg_id -> logical_time
    gateway_markers: Set[int] = field(default_factory=set)  # 被标记为"可疑"的连接
    is_valid: bool = True


class BeaverNode:
    """Beaver 协议的一个节点实现"""

    def __init__(self, node_id: int):
        self.node_id = node_id
        self.state = LocalState()
        self.logical_clock = 0
        self.snapshots: Dict[int, SnapshotContext] = {}
        self.current_snapshot: Optional[SnapshotContext] = None

    def increment_clock(self):
        self.logical_clock += 1

    def take_snapshot(self, snapshot_id: int) -> SnapshotContext:
        """发起快照——记录当前本地状态"""
        self.increment_clock()
        ctx = SnapshotContext(
            snapshot_id=snapshot_id,
            start_logical_time=self.logical_clock,
        )
        self.current_snapshot = ctx
        self.snapshots[snapshot_id] = ctx
        # 记录本地状态
        self.state.record_event(EventType.LOCAL, f"snapshot #{snapshot_id}")
        return ctx

    def send_message(self, msg_id: int, target: int):
        """发送消息——记录发送时的逻辑时间"""
        self.increment_clock()
        self.state.record_event(EventType.SEND, f"msg={msg_id} to={target}")
        # OGM: 记录这条消息发送时的逻辑时间
        if self.current_snapshot:
            self.current_snapshot.sent_messages[msg_id] = self.logical_clock

    def receive_message(self, msg_id: int, sender_time: int):
        """接收消息——OGM 在这里做因果一致性检测"""
        self.increment_clock()
        self.state.record_event(EventType.RECEIVE, f"msg={msg_id} from={self.node_id}")

        if self.current_snapshot:
            snap = self.current_snapshot
            # OGM 检测：如果收到的消息携带的逻辑时间大于快照起始时间，
            # 说明这条消息是快照开始后发出的，但出现在了快照结果中
            if sender_time > snap.start_logical_time:
                # 这是一个潜在的因果违规！标记为可疑
                snap.gateway_markers.add(msg_id)
                snap.is_valid = False

    def validate_snapshot(self, snapshot_id: int) -> bool:
        """验证快照是否因果一致"""
        ctx = self.snapshots.get(snapshot_id)
        if not ctx:
            return False
        # 如果没有 gateway marker，快照有效
        return len(ctx.gateway_markers) == 0
```

### 示例 2：完整的快照流程演示

```python
def demo_partial_snapshot():
    """
    演示 Beaver 如何处理部分参与的快照。

    场景：
    - Node A 和 Node B 参与快照
    - Node C 是外部服务（不参与快照）
    - 外部客户端通过 SLB 向 A 发送请求

    关键在于：Beaver 不需要 C 做任何特殊处理。
    """
    node_a = BeaverNode(node_id=1)
    node_b = BeaverNode(node_id=2)
    # node_c 是外部黑盒服务，不参与快照

    # --- 阶段 1：正常操作 ---
    node_a.send_message(msg_id=101, target=2)  # A -> B
    node_a.increment_clock()  # 模拟一些本地计算
    node_a.increment_clock()

    # --- 阶段 2：A 发起快照 ---
    snap_ctx = node_a.take_snapshot(snapshot_id=42)

    # --- 阶段 3：快照期间，外部流量到达 ---
    # 外部客户端通过 SLB 发消息给 A，这条消息的逻辑时间是 5
    # （在快照开始之后才发出）
    node_a.receive_message(msg_id=201, sender_time=5)
    # OGM 检测到 sender_time(5) > start_logical_time(3)，标记违规

    # --- 阶段 4：B 也记录自己的状态 ---
    node_b.increment_clock()
    node_b.state.record_event(EventType.LOCAL, "snapshot captured")

    # --- 阶段 5：验证快照 ---
    is_valid = node_a.validate_snapshot(42)
    print(f"快照 42 是否有效: {is_valid}")
    # 输出: 快照 42 是否有效: False
    # 因为 OGM 检测到了来自外部流量的因果违规

    # --- 阶段 6：如果没有违规，快照就有效 ---
    node_a2 = BeaverNode(node_id=1)
    node_a2.increment_clock()  # t=1
    node_a2.increment_clock()  # t=2
    node_a2.take_snapshot(snapshot_id=100)  # start_logical_time = 2

    # 快照期间收到的消息，其 sender_time <= 2，不会触发 OGM 检测
    node_a2.receive_message(msg_id=301, sender_time=1)
    is_valid_100 = node_a2.validate_snapshot(100)
    print(f"快照 100 是否有效: {is_valid_100}")
    # 输出: 快照 100 是否有效: True


demo_partial_snapshot()
```

## 六、Beaver 如何利用数据中心基础设施

Beaver 的设计之所以可行，是因为它"寄生"在云数据中心的两个固有特征上：

| 基础设施特征 | Beaver 如何使用 |
|---|---|
| **L4 软件负载均衡器（SLB）** | 所有入站流量必须经过 SLB，SLB 做 VIP→DIP 转换，这为 Beaver 提供了一个天然的"检查点" |
| **稳定时钟源** | 服务器通常接入低时间层级的时钟源（如 NTP/PTP），频率漂移很小，使得逻辑时间比较是可靠的 |

注意：Beaver 不需要精确的时钟同步，只需要单个机器的频率漂移有界就够了。这比 Spanner 那种要求全网时钟严格同步的方案轻量得多。

而且，Beaver **不阻塞任何用户流量**。它不做缓冲、不做延迟，所有数据包照常转发。这使得它对用户流量的开销接近零。

## 七、与传统快照算法对比

| 特性 | Chandy-Lamport | Beaver |
|---|---|---|
| 参与范围 | 所有节点必须参与 | 只需部分节点参与 |
| 外部干扰 | 不允许任何外部通信 | 容忍外部流量，检测违规 |
| 阻塞 | 可能需要缓冲消息 | 零阻塞 |
| 成功率 | 100%（理论上） | 可能失败，但成功时保证正确 |
| 部署成本 | 需要改造所有节点 | 只需改造参与节点 |
| 适用场景 | 隔离系统 | 现代云微服务架构 |

## 八、实际应用场景

Beaver 提供的因果一致快照可以用于：

- **死锁检测**：在分布式系统中检测跨节点的循环等待
- **检查点与恢复**：为微服务集群创建一致的恢复点
- **网络遥测**：收集一致的网络状态用于分析和调试
- **分布式调试**：重现特定时刻的系统状态

## 九、总结

Beaver 的核心贡献在于重新思考了分布式快照的前提条件：

1. 经典算法假设"所有节点都参与"，但云环境做不到
2. Beaver 放弃了"每次都成功"的保证，换来了"部分参与也能工作"的能力
3. 通过 OGM 机制，Beaver 只在必要时重试，平时对用户流量零影响
4. 它巧妙利用了云数据中心的 SLB 和时钟这两个现成基础设施，几乎不需要额外改造

这种"乐观检测 + 失败重试"的思路，在工程实践中往往比"严格保证"更实用。毕竟在分布式系统中，重试本来就是常态。

## 十、延伸阅读

- 原始论文：[Beaver PDF](https://www.usenix.org/system/files/osdi24-yu.pdf)
- 参考算法：[Chandy-Lamport 1985](./chandy-lamport-1985.md)
- 代码实现：https://github.com/eniac/Beaver
