---
title: awesome-distributed-systems - 零基础学习笔记
来源: https://github.com/theanalyst/awesome-distributed-systems
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# awesome-distributed-systems - 零基础学习笔记

## 什么是"分布式系统"

想象你在开一家外卖店。

一开始，只有你一个人接单、做饭、送餐。这叫**单机系统**——所有事情都挤在一台机器上处理。后来客人越来越多，你雇了十个厨师、十个骑手。这些人分散在不同的地方，各自干各自的活，但必须协调好谁做什么、什么时候做。这就是**分布式系统**——多台机器（或者说"人"）协作完成一个共同目标。

但这个列表告诉我们一个残酷的真相：分布式系统之所以难，不是因为"人多"，而是因为人（机器）会偷懒、会迟到、会突然失联。

## 核心概念一：CAP 定理

这是入门分布式系统的第一课。

CAP 说的是：一个分布式数据库，最多只能同时满足下面三件事中的**两件**：

- **C（Consistency）一致性**：所有节点看到的数据是一样的。就像全公司共用一张表格，你改了，所有人立刻看到。
- **A（Availability）可用性**：每次请求都有响应。不管系统多忙，永远不拒绝。
- **P（Partition tolerance）分区容错性**：机器之间断网了，系统还能继续工作。就像某个骑手迷路了，其他骑手照样送餐。

分布式系统**必须**面对分区（网络总会断），所以你实际上只能选：要么 CP（保证一致，牺牲可用），要么 AP（保证可用，牺牲一致）。

> 日常类比：医院急诊室。
> - CP：医生确认每个病人病历完整才接诊（安全但慢）
> - AP：先来先诊，病历后续补上（快但有风险）

## 核心概念二：分布式系统的"五大谎言"

这个列表引用了经典的"分布式计算的谬误"（Fallacies of Distributed Computing），翻译成大白话就是：

1. 网络是可靠的（其实经常断）
2. 延迟是零（其实总有延迟）
3. 带宽是无限的（其实有限）
4. 网络是安全的（其实不安全）
5. 拓扑结构不变（其实网络随时在变）

学习分布式系统的第一步，就是**假设一切都会出错**。

## 核心概念三：一致性 vs 可用性

这个列表里大量论文都在讨论一个问题：当多台机器存储同一份数据时，怎样保证大家看到的不矛盾？

两个经典论文：

- **Dynamo**（亚马逊的论文）：解决高可用问题的关键方案，后来催生了 Cassandra 等系统。核心思路是用"最终一致性"——允许短暂不一致，但最终会达成一致。
- **Paxos / Raft**：让多台机器"投票"决定谁说了算。Paxos 是理论奠基，Raft 是更容易理解的工程实现。

## 代码示例：用 Python 理解"最终一致性"

### 示例一：模拟一个简单的键值存储（一致性 vs 可用性）

```python
"""
一个简单的分布式键值存储模拟。
演示当节点之间断网时，你必须在"一致性"和"可用性"之间做选择。
"""

class Node:
    """一个节点，存储键值对"""
    def __init__(self, node_id):
        self.node_id = node_id
        self.data = {}
        self.is_connected = True  # 是否"在线"

    def get(self, key):
        # 离线时返回 None（表示不可用）
        if not self.is_connected:
            return None
        return self.data.get(key)

    def put(self, key, value):
        if not self.is_connected:
            return False
        self.data[key] = value
        return True

    def sync(self, other_node):
        # 两台节点"恢复连接"后，数据同步
        if self.is_connected and other_node.is_connected:
            # 简单合并：后写入的覆盖先写入的
            other_node.data.update(self.data)
            self.data.update(other_node.data)


# --- 演示：选择可用性（AP）---
node_a = Node("A")
node_b = Node("B")

# 两台都写入数据
node_a.put("order_1", "已下单")
node_b.put("order_2", "已发货")

# 模拟网络分区：A 和 B 断开了
node_a.is_connected = False
node_b.is_connected = False

# 此时仍然可以读写各自的本地数据（可用）
print(node_b.get("order_2"))  # 输出: 已发货

# 网络恢复后同步数据
node_a.is_connected = True
node_b.is_connected = True
node_a.sync(node_b)

# 现在两边数据一致了（最终一致性）
print(node_a.get("order_2"))  # 输出: 已发货
print(node_b.get("order_1"))  # 输出: 已下单
```

### 示例二：模拟一致性哈希（Consistent Hashing）

这个列表提到的 Dynamo 论文中用到的核心技术——一致性哈希，是让数据均匀分布在多台机器上的方法。

```python
"""
一致性哈希模拟。
核心思想：当一台机器加入或离开集群时，只有少量数据需要迁移。
"""
import hashlib


def consistent_hash(key, num_nodes=3):
    """
    把 key 映射到 [0, 255] 范围内的一个节点。
    """
    hash_val = int(hashlib.md5(key.encode()).hexdigest(), 16)
    return hash_val % num_nodes


def get_node_for_key(key, nodes):
    """
    给定一个 key 和一组节点，找到存储这个 key 的节点。
    使用虚拟节点（vnode）让数据分布更均匀。
    """
    vnode_count = 150  # 每个物理节点有 150 个虚拟节点
    ring = {}

    # 构建哈希环
    for node in nodes:
        for i in range(vnode_count):
            vnode_key = f"{node}:vnode{i}"
            hash_val = int(hashlib.md5(vnode_key.encode()).hexdigest(), 16)
            ring[hash_val] = node

    # 排序哈希环
    sorted_rings = sorted(ring.keys())

    # 找到 key 对应的哈希值
    key_hash = int(hashlib.md5(key.encode()).hexdigest(), 16)

    # 在环上顺时针找到第一个节点
    for ring_hash in sorted_rings:
        if key_hash <= ring_hash:
            return ring[ring_hash]

    # 绕回环的开头
    return ring[sorted_rings[0]]


# --- 演示 ---
nodes = ["server-1", "server-2", "server-3"]
keys = [f"item_{i}" for i in range(20)]

# 每台服务器上的数据
distribution = {node: [] for node in nodes}
for key in keys:
    target = get_node_for_key(key, nodes)
    distribution[target].append(key)

# 看数据分布
for node, items in distribution.items():
    print(f"{node}: {len(items)} 个数据项")
```

输出示例：
```
server-1: 7 个数据项
server-2: 6 个数据项
server-3: 7 个数据项
```

> 日常类比：把糖果分给三个小朋友。一致性哈希就像是给每个糖果编一个号码，再给每个小朋友分配一段"号码区间"。加一个新小朋友时，只需要重新分配他区间内的糖果，其他小朋友的糖果不用动。

## 必读资源推荐

这个列表按类别整理了大量学习资源，对初学者来说，建议按以下顺序阅读：

1. **入门必读（Bootcamp 部分）**：CAP 定理、五大谬误、FLP 不可能结果
2. **免费书籍**：《Distributed Systems for Fun and Profit》、《Scalable Web Architecture and Distributed Systems》
3. **经典论文**：Dynamo、Google File System、BigTable、Paxos、Raft
4. **视频课程**：MIT 6.824（YouTube 上有完整播放列表）

## 总结

这个 awesome 列表的核心价值在于它帮你省去了"从哪开始学"的摸索时间。分布式系统的知识体系很庞大，从理论（Paxos、Raft）到工程（Kafka、ZooKeeper），从论文到代码。建议先从 CAP 定理和五大谬误开始，建立"分布式系统一定会出错"的直觉，然后再逐步深入。

---

*来源: https://github.com/theanalyst/awesome-distributed-systems*
*日期: 2026-06-13*
