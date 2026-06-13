---
title: Dynamo - Amazon 的高可用 KV 存储
来源: https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

## 1 什么是 Dynamo？

Dynamo 是 Amazon 在 2007 年发表的论文中描述的键值（Key-Value）存储系统。
它支撑了亚马逊电商平台上众多核心服务——购物车、会话状态、商品目录、用户偏好等。

**一句话概括：** 一个用"最终一致性"换取"永远在线"的去中心化 KV 存储。

### 1.1 为什么要写 Dynamo？（日常类比）

想象你经营一家全国连锁便利店。每个门店都有自己的小账本记录库存。

**如果用传统数据库：**
所有门店的账本都实时同步到一个中央会计室。某天会计室的服务器宕机了——所有门店没法下单、没法结账。这就是强一致性（ACID）的代价：可用性为零。

**如果用 Dynamo：**
每个门店都有自己的账本，顾客随时能在本地完成交易。不同门店之间会不定期交换账本信息，发现不一致时协商取最新版本。短期内 A 店和 B 店看到的库存可能不同，但最终都会趋于一致。这就是"最终一致性"。

Dynamo 的设计哲学是：**故障是常态，不是异常。** 在亚马逊的数万台服务器规模下，总有磁盘会坏、网络会抖动，系统必须永远可读可写。

---

## 2 核心概念

### 2.1 去中心化架构

Dynamo 没有中心协调节点（如 ZooKeeper、Consul 那样的元数据服务器）。
每个节点地位平等，通过 Gossip 协议互相交换信息来维护集群状态。

### 2.2 一致性哈希（Consistent Hashing）

传统哈希表在增减节点时会引发大量数据迁移。一致性哈希将 Key 映射到一个环形空间：

```
      ┌───────────────────────────── Ring ─────────────────────────────┐
      │  Node A    ●──────Key1──────●    Node B    ●────Key2────●     │
      │                                                                │
      │  Node C    ●──────────────────────────────────────●           │
      └────────────────────────────────────────────────────────────────┘
```

- 每个 Key 和每个节点都映射到环上的一个位置
- Key 顺时针找到的第一个节点就是它的归属
- 增加/删除节点只影响环上相邻的一段 Key，其余不变

### 2.3 Quorum 机制（N、R、W）

Dynamo 用一个简单的公式控制一致性和可用性：

| 参数 | 含义 |
|------|------|
| **N** | 每个数据片段复制几份（通常 2-4） |
| **R** | 读取时需要成功响应的副本数 |
| **W** | 写入时需要成功响应的副本数 |

规则：R + W > N 保证强一致性；R + W ≤ N 允许更高可用但可能读到旧数据。

**类比：** 你让 3 个朋友同时保管一个秘密（N=3）。
- W=3：必须所有朋友都确认收到你才离开（写确认高，但如果一个失联就写不了）
- W=2：两个朋友确认就行（写入更快，可用性更高）
- R=3 vs R=1：读到最新数据的概率不同

### 2.4 Vector Clock（向量时钟）

Dynamo 用向量时钟来检测冲突和追踪数据的"因果关系"。
每个副本维护一个版本号数组，记录每个节点最后写操作的序号。

```
向量时钟示例：
节点 A 写了第 3 次，节点 B 写了第 2 次
数据 V 的时钟 = {A:3, B:2}

如果两个副本分别变成 {A:4, B:2} 和 {A:3, B:3}，
它们互不可达——这就是"并发冲突"，需要应用层解决。
```

### 2.5 Gossip 协议

节点之间随机选择伙伴交换信息，类似"流言传播"。
几轮之后，所有节点都知道整个集群的成员变化和故障信息。
这避免了中心化心跳检测的瓶颈和单点故障。

---

## 3 代码示例

### 3.1 一致性哈希环的简化实现

以下是一个简化版的一致性哈希环，展示 Key 如何映射到节点：

```python
import hashlib
import sortedcontainers

class ConsistentHashRing:
    """简化的一致性哈希环"""

    def __init__(self, num_replicas=150):
        # 环上每个点 = (哈希值, 节点ID)
        self.ring = sortedcontainers.SortedDict()
        self.num_replicas = num_replicas
        self.nodes = set()

    def add_node(self, node_id):
        if node_id in self.nodes:
            return
        self.nodes.add(node_id)
        # 每个物理节点对应多个虚拟节点，均匀分布在环上
        for i in range(self.num_replicas):
            key = self._hash(f"{node_id}:{i}")
            self.ring[key] = node_id

    def remove_node(self, node_id):
        if node_id not in self.nodes:
            return
        self.nodes.remove(node_id)
        # 移除该节点对应的所有虚拟节点
        for i in range(self.num_replicas):
            key = self._hash(f"{node_id}:{i}")
            self.ring.pop(key, None)

    def get_node(self, key):
        """顺时针找到第一个节点"""
        if not self.ring:
            return None
        hash_val = self._hash(key)
        # 二分查找顺时针第一个位置
        for ring_key, node_id in self.ring.items():
            if ring_key >= hash_val:
                return node_id
        # 绕回环的开头
        return self.ring[self.ring.keys()[0]]

    def _hash(self, key):
        return int(hashlib.md5(key.encode()).hexdigest(), 16)


# 使用示例
ring = ConsistentHashRing(num_replicas=150)
ring.add_node("node-A")
ring.add_node("node-B")
ring.add_node("node-C")

# Key "shopping-cart:user-42" 落在哪个节点？
key = "shopping-cart:user-42"
assigned_node = ring.get_node(key)
print(f"Key '{key}' → {assigned_node}")

# 增加节点时，只有环上一小段 Key 需要迁移
ring.add_node("node-D")
print(f"增加 node-D 后，Key '{key}' → {ring.get_node(key)}")
```

### 3.2 Vector Clock 冲突检测

Dynamo 用 Vector Clock 来判断两个写操作是否冲突，并交给应用层解决：

```python
class VectorClock:
    """向量时钟——Dynamo 的冲突检测核心"""

    def __init__(self, node_id):
        self.clock = {}  # {node_id: sequence_number}
        self.node_id = node_id

    def increment(self):
        """当前节点写操作计数 +1"""
        self.clock[self.node_id] = self.clock.get(self.node_id, 0) + 1

    def update(self, other_clock):
        """合并其他节点的时钟（取每个节点的最大值）"""
        for node_id, seq in other_clock.clock.items():
            self.clock[node_id] = max(self.clock.get(node_id, 0), seq)

    def happens_before(self, other):
        """self 是否发生在 other 之前（因果关系）"""
        # self <= other：self 所有值都不超过 other
        all_leq = all(
            self.clock.get(nid, 0) <= other.clock.get(nid, 0)
            for nid in set(self.clock) | set(other.clock)
        )
        # 且不能相等
        return all_leq and self.clock != other.clock

    def is_concurrent(self, other):
        """两个时钟是否并发（互不可达 → 冲突）"""
        return (not self.happens_before(other)
                and not other.happens_before(self)
                and self.clock != other.clock)

    def to_dict(self):
        return dict(self.clock)


# 使用示例：模拟两个节点并发写入同一 Key
vc1 = VectorClock("node-A")
vc1.increment()  # {A:1}

vc2 = VectorClock("node-B")
vc2.increment()  # {B:1}

# 两个节点同时对 "product:12345" 做了不同修改
print(f"VC1 (node-A): {vc1.to_dict()}")
print(f"VC2 (node-B): {vc2.to_dict()}")
print(f"是否并发: {vc1.is_concurrent(vc2)}")  # True → 冲突！
print(f"VC1 < VC2: {vc1.happens_before(vc2)}")  # False
print(f"VC2 < VC1: {vc2.happens_before(vc1)}")  # False

# Dynamo 的策略：保留两个版本，交给应用层决定怎么合并
# 应用可以是：最后写入者赢（LWW）、业务逻辑合并、或者手动修复
```

### 3.3 读写操作的 Quorum 逻辑

```python
class DynamoStore:
    """简化版 Dynamo 读写逻辑，展示 N/R/W 机制"""

    def __init__(self, n=3, r=2, w=2):
        self.n = n  # 复制份数
        self.r = r  # 读确认数
        self.w = w  # 写确认数
        # 模拟副本存储：{key: [{data, vector_clock}, ...]}
        self.replicas = {}

    def write(self, key, value, vector_clock):
        """写入：至少 W 个副本确认才返回"""
        nodes = [f"replica-{i}" for i in range(self.n)]
        successful = 0
        for node in nodes:
            # 模拟写入（真实场景是网络 RPC）
            if key not in self.replicas:
                self.replicas[key] = []
            self.replicas[key].append({
                "data": value,
                "clock": vector_clock.to_dict()
            })
            successful += 1
            if successful >= self.w:
                break  # W 个已够，提前返回

        if successful >= self.w:
            return True, f"写入成功，{successful}/{self.n} 副本确认"
        return False, f"写入失败，仅 {successful}/{self.w} 副本确认"

    def read(self, key):
        """读取：至少 R 个副本响应，返回最新版本"""
        if key not in self.replicas:
            return None, "Key 不存在"

        # 从 N 个副本中取 R 个
        responses = self.replicas[key][:self.r]
        if len(responses) < self.r:
            return None, f"副本不足，需要 {self.r} 个，只有 {len(responses)} 个"

        # 找最新版本（基于 Vector Clock）
        latest = max(responses, key=lambda x: str(x["clock"]))
        return latest["data"], f"读取成功，{len(responses)}/{self.n} 副本响应"


# 使用示例
store = DynamoStore(n=3, r=2, w=2)
vc = VectorClock("node-1")
vc.increment()

# 写入购物车数据
ok, msg = store.write("cart:user-1001", {"items": ["book", "pen"]}, vc)
print(ok, msg)

# 读取购物车数据
data, msg = store.read("cart:user-1001")
print(msg, "→", data)
```

---

## 4 Dynamo 的关键设计选择

### 4.1 为什么放弃 ACID？

ACID 中的 **C（一致性）** 和 **A（可用性）** 在分布式系统中存在根本矛盾——这就是著名的 CAP 定理。

Dynamo 选择了 AP（可用 + 分区容忍），放弃了强一致性：
- **ACID 数据库**：数据丢了不可恢复 → 但宕机期间无法服务
- **Dynamo**：允许短暂不一致 → 但永远可读可写

对于购物车、会话管理这类业务，用户看到旧数据远比看到"系统忙"要好。

### 4.2 应用辅助冲突解决（Application-Assisted Conflict Resolution）

这是 Dynamo 最具创新性的设计之一。它不自己做"最后写入者赢"（LWW）的默认决策，而是：

1. 发现冲突 → 返回所有冲突版本给客户端
2. 客户端的应用代码决定怎么合并（比如购物车合并两个版本的商品列表）

这把"怎么解决冲突"的决定权交给了最懂业务的应用层。

### 4.3 异步复制与反冲突（Anti-Entropy）

后台会有一个异步的反冲突协议，定期在全量副本之间同步数据，最终让所有副本达成一致。
这个过程是"背对背"运行的——不阻塞任何读写操作。

---

## 5 实际效果

论文中的数据很有说服力：

- **Shopping Cart Service**：一天处理 300 万次结账请求
- **Session 管理**：同时维护数十万个活跃会话
- **高峰负载**：假日购物季（Black Friday 等）期间零停机
- **延迟**：99.9 百分位延迟在毫秒级

---

## 6 对后续系统的影响

Dynamo 的设计直接催生了许多后来著名的系统：

| 系统 | 受 Dynamo 影响的方面 |
|------|---------------------|
| **Cassandra** | 将 Dynamo 与 Bigtable 的理念结合 |
| **Riak** | 几乎直接基于 Dynamo 架构 |
| **Amazon S3** | 同样运行在 Dynamo 基础设施之上 |
| **Azure Cosmos DB** | 提供可调一致性的 KV 存储 |
| **DynamoDB** | 名称即来自此论文 |

Cassandra 甚至有个外号叫 "Dynamo + Bigtable"——取了 Dynamo 的可用性设计和 Bigtable 的列族存储设计。

---

## 7 总结

Dynamo 的核心贡献不在于发明了什么新技术，而在于**巧妙地组合了已有技术**：

- 一致性哈希 → 数据分片
- Gossip 协议 → 去中心化故障检测
- Vector Clock → 冲突检测
- Quorum 机制 → 可调一致性与可用性的权衡
- 异步反冲突 → 最终一致性保证

这五个零件拼在一起，造就了一个"永远在线"的键值存储。

对于一个零基础的学习者来说，Dynamo 最值得记住的一句话是：

> **在分布式系统中，没有"完美一致"和"永远可用"同时存在的魔法。Dynamo 做了一个诚实的选择：告诉开发者"数据可能旧几秒"，换来的是"系统永远可用"。**

---

## 8 思考题

1. 如果 R + W > N 保证强一致性，R + W ≤ N 可能读到旧数据，那你认为 R=1, W=1, N=3 的设定适合什么场景？
2. Vector Clock 能检测并发冲突，但如果冲突太多（比如 10 个节点同时写），应用层要处理多少种合并策略？
3. Dynamo 没有中心协调节点，如果某个节点长时间离线又突然上线，Gossip 协议怎么处理这个"脑裂"问题？

（这些问题没有唯一正确答案，带着它们去重新读论文的原文，会有不同的体会。）
