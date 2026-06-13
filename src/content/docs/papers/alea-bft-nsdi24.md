---
title: Alea-BFT: Practical Asynchronous Byzantine Fault Tolerance
来源: https://www.usenix.org/conference/nsdi24/presentation/antunes
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式共识
provenance: pipeline-v3
---

# Alea-BFT: Practical Asynchronous Byzantine Fault Tolerance

## 一、前置知识：为什么要"共识"？

想象一个餐厅的后厨，有 4 位厨师（对应区块链中的"节点"或"副本"）。每位厨师都要做同样的菜，而且所有人做的菜顺序必须一模一样——不然上给客人的菜就会乱套。这就是**状态机复制**（State Machine Replication）的核心思想：让多个独立的计算机执行相同的操作序列，从而保证整个系统对外表现一致。

但有个问题：其中最多可能有 1 位厨师会故意捣乱（比如偷偷调换食材、不按菜谱做菜）。这就是**拜占庭故障**（Byzantine Fault）。Alea-BFT 解决的问题就是：在网络完全异步（消息可能延迟任意久）的情况下，如何让诚实的多数厨师达成一致，即使有坏人捣乱。

## 二、核心概念拆解

### 2.1 部分同步 vs 完全异步

- **部分同步**（Partially Synchronous）：传统 BFT 协议（如 PBFT）假设网络最终会稳定在一个"可预测延迟"的状态。基于这个假设，协议用一个"领导者"驱动执行，超时后换领导者。缺点是：网络抖动时就会频繁换 leader，性能暴跌。
- **完全异步**（Asynchronous）：不假设任何网络延迟上限，消息可能永远不到。协议依靠**随机化**来保证最终以极大概率达成一致。好处是：不怕网络差；代价是：不能 100% 保证终止，只能做到"几乎一定终止"。

### 2.2 Alea-BFT 的核心洞察

经典协议里有一个关键设计：**指定一个领导者来驱动某个请求的执行**。Alea-BFT 把这一设计从部分同步"借"了过来，但换了种用法——它不用超时来换领导者，而是用**轮询**（Round-Robin）的方式，让每个节点轮流当领导者。

> 类比：就像教室里发作业本，不是等某个人慢了才换人，而是按学号 1→2→3→...→n→1 依次发，每个人发完就传给下一个人。

### 2.3 两阶段流水线设计

Alea-BFT 把每个请求的执行拆成两个阶段，像流水线工厂一样并行工作：

1. **广播阶段**（Broadcast）：指定领导者用 VCBC（验证可检查广播）把所有节点提交的请求"广播"给所有人
2. **二元协议阶段**（Binary Agreement）：所有节点投票决定"这个请求要不要执行"

两个阶段**流水线并行**：广播阶段的结果排队等着，二元协议阶段随时处理队列里的下一个。这比 Dumbo-NG 等先前的异步协议简单得多——后者用复杂的多值拜占庭协议（MVBA），而 Alea-BFT 只用二元协议（ABA），实现更简洁。

## 三、关键构建模块

### 3.1 VCBC：验证可检查广播

VCBC 是一种广播原语，保证：
- 所有诚实节点收到的消息是一致的
- 如果发送者是诚实的，消息最终一定被送达
- 每条消息附带一个"证明"（proof），让接收者可以验证广播正确性

Alea-BFT 的实现扩展了 Echo Broadcast，加上**门限签名**（Threshold Signatures）来生成短小的证明。通信复杂度是 O(n) 条消息、O(n²) 比特。

### 3.2 ABA：异步二元协议

ABA 让所有节点就一个比特值（0 或 1）达成一致：
- **协议一致性**（Agreement）：所有诚实节点最终决定同一个值
- **终止性**（Termination）：每个诚实节点最终都会做出决定
- **有效性**（Validity）：如果所有诚实节点提议同一个值，决定的值一定是这个

因为 FLP 不可能定理告诉我们：在完全异步系统中，不存在确定性的一致协议。所以 ABA 是**概率性**的——决定需要多少轮是不确定的，但"不终止的概率"随着轮数增加**趋近于零**。

Alea-BFT 使用 Mostefaoui 等人提出的修改版协议，基于**门限签名**实现一个"随机硬币"（common coin）来生成随机性。

### 3.3 优先级队列：排队论

每个节点维护 n 个优先级队列，每个队列对应一个其他节点提交的一组请求。队列的作用像"等待区"——广播阶段把请求放进去，二元协议阶段从队头一个一个处理：

```python
class PriorityQueue:
    """节点间的请求排队管理"""
    
    def __init__(self):
        self.slots = {}        # slot_id -> (value, status)
        self.head_pointer = 0  # 指向下一个要处理的 slot
        
    def enqueue(self, value, slot_id):
        """把请求放入指定 slot"""
        if slot_id not in self.slots:
            self.slots[slot_id] = (value, "empty")
            
    def dequeue(self):
        """从队头取出并处理一个请求"""
        head = self.head_pointer
        if head in self.slots and self.slots[head][1] == "delivered":
            self.head_pointer += 1
            return self.slots.pop(head, None)
        return None
        
    def peek_head(self):
        """查看队头是什么，但不取出"""
        head = self.head_pointer
        if head in self.slots:
            return self.slots[head][0]
        return None
```

## 四、协议执行流程

### 4.1 整体流程示意

```
请求从客户端进入 → 本地排序 → VCBC 广播 → 二元协议投票 → 决定执行 → 交付
                                                              ↑
                                                              |
                    下一个领导者的请求进入队列 ─────────────────┘
                    （流水线并行，不需要等当前轮完全结束）
```

### 4.2 详细代码示例

下面是一个简化的 Alea-BFT 核心流程模拟，帮助理解两轮之间的交互：

```python
import random
from collections import deque

class AleaBFTNode:
    """简化版 Alea-BFT 节点模拟"""
    
    def __init__(self, node_id, total_nodes):
        self.node_id = node_id
        self.total_nodes = total_nodes
        # 每个节点维护其他节点的请求队列
        self.queues = {i: deque() for i in range(total_nodes)}
        # 已交付的消息
        self.delivered = set()
        # 当前轮次的领导者（轮询）
        self.view = 0
        
    def get_leader(self):
        """轮询选择当前轮次的领导者"""
        return self.view % self.total_nodes
    
    def submit_request(self, request):
        """客户端提交请求到本地队列"""
        leader = self.get_leader()
        self.queues[leader].append(request)
        print(f"  [Node {self.node_id}] 请求 '{request}' 提交到领导者 Node {leader} 的队列")
        
    def vcbc_broadcast(self, batch):
        """广播阶段：领导者批量广播请求"""
        leader = self.get_leader()
        if self.node_id != leader:
            print(f"  [Node {self.node_id}] 收到领导者 Node {leader} 广播的批次: {batch}")
            return batch
        print(f"  [Node {leader}] 领导者发起 VCBC 广播: {batch}")
        return batch
        
    def binary_agreement(self, value):
        """二元协议阶段：投票决定该请求是否执行"""
        # 模拟：以高概率（95%）达成一致，模拟异步环境中的随机性
        agree = random.random() < 0.95
        if self.node_id == 0:
            status = "✅ 同意执行" if agree else "❌ 拒绝执行"
            print(f"  [Node {self.node_id}] 二元协议结果: {status} (值={value})")
        return agree
        
    def run_round(self, request):
        """执行一个完整的轮次"""
        print(f"\n--- 轮次 {self.view} (领导者: Node {self.get_leader()}) ---")
        
        # 步骤1: 提交请求
        self.submit_request(request)
        
        # 步骤2: VCBC 广播阶段
        leader = self.get_leader()
        batch = [self.queues[leader].popleft()] if self.queues[leader] else []
        broadcast_result = self.vcbc_broadcast(batch)
        
        # 步骤3: 二元协议阶段
        if broadcast_result:
            for req in broadcast_result:
                if req not in self.delivered:
                    decided = self.binary_agreement(req)
                    if decided:
                        self.delivered.add(req)
                        print(f"  [Node {self.node_id}] 交付请求: '{req}'")
        
        # 步骤4: 进入下一轮
        self.view += 1
        print(f"  [Node {self.node_id}] 进入下一轮 (view={self.view})")

# 演示：4 个节点，依次提交 5 个请求
nodes = [AleaBFTNode(i, 4) for i in range(4)]
requests = ["tx_A", "tx_B", "tx_C", "tx_D", "tx_E"]

for req in requests:
    # 所有节点都提交同一个请求（模拟真实场景）
    for node in nodes:
        node.run_round(req)
```

**运行结果示意**：

```
--- 轮次 0 (领导者: Node 0) ---
  [Node 0] 请求 'tx_A' 提交到领导者 Node 0 的队列
  [Node 0] 领导者发起 VCBC 广播: ['tx_A']
  [Node 1] 收到领导者 Node 0 广播的批次: ['tx_A']
  [Node 0] 二元协议结果: ✅ 同意执行 (值=tx_A)
  [Node 0] 交付请求: 'tx_A'
  [Node 0] 进入下一轮 (view=1)

--- 轮次 1 (领导者: Node 1) ---
  [Node 1] 请求 'tx_B' 提交到领导者 Node 1 的队列
  [Node 1] 领导者发起 VCBC 广播: ['tx_B']
  [Node 0] 收到领导者 Node 1 广播的批次: ['tx_B']
  [Node 0] 二元协议结果: ✅ 同意执行 (值=tx_B)
  [Node 0] 交付请求: 'tx_B'
  [Node 0] 进入下一轮 (view=2)
```

### 4.3 流水线并行的意义

在真实实现中，Alea-BFT 的广播阶段和二元协议阶段是**同时运行**的：

```
时间线 →

广播阶段:  [VCBC轮0] ──→ [VCBC轮1] ──→ [VCBC轮2] ──→
二元协议:        [ABA轮0] ──→ [ABA轮1] ──→ [ABA轮2] ──→

          ←─────── 流水线重叠，不需要等前一轮完全结束 ──────→
```

这意味当轮次 1 的广播在进行时，轮次 0 的二元协议可以同时在投票。这种重叠让吞吐量大幅提升。

## 五、性能与实战

### 5.1 性能对比

论文的实验显示：

| 指标 | Alea-BFT | Dumbo-NG | HBBFT |
|------|----------|----------|-------|
| 延迟 | 最低 | 较高 | 中等 |
| 吞吐量 | 数百~数千 tx/s | 更高 | ~15k tx/s |
| 通信复杂度 | O(n²) | O(n) | O(n²) |

- **延迟**：Alea-BFT 在所有测试中都比 Dumbo-NG 更好
- **吞吐量**：Dumbo-NG 略高，因为用了 MVBA（一次可以接受多个批次），但 Alea-BFT 的 O(n²) 复杂度已经足够实用
- **fault 场景**：Ale-BFT 在有故障节点时表现稳定，没有 Dumbo-NG 那种 30% 的吞吐骤降

### 5.2 真实世界部署

Alea-BFT 是目前第一个在真实系统中被广泛部署的异步 BFT 协议：

1. **SSV (SSV Network)**：以太坊分布式验证器（Distributed Validator），用于把多个验证者密钥分散到多个节点
2. **Filecoin Subnets**：Filecoin 子网的实验性共识层
3. **另一个以太坊分布式验证器**：也在路线图中集成了 Alea-BFT

### 5.3 优化手段

论文还提到了几个重要优化：

- **Input Unanimity**：如果所有节点给同一轮提供相同的输入，可以立即终止，不需要等满协议轮次
- **Pipelining Prediction**：节点根据历史 VCBC 完成时间，预测何时该发下一轮投票，减少等待
- **延迟优化**：客户端直接把请求发给即将成为领导者的节点，减少等待时间
- **门限签名 + BLS 聚合**：减小消息体积，让 O(n²) 的通信量在实际中更可接受

## 六、为什么 Alea-BFT 能成功？

之前的异步 BFT 协议（如 HoneyBadgerBFT、Dumbo-NG）性能不错，但一直没被大规模采用。Alea-BFT 成功的关键在于：

1. **设计简洁**：只用 VCBC + ABA 两个简单原语，不像 Dumbo-NG 需要 MVBA 这种复杂的子协议
2. **代码量小**：约 5,000 行代码，比竞争对手更容易理解和审查
3. **保留经典智慧**：大胆从 PBFT 等经典协议借用了"领导者驱动"的思想，但用轮询代替超时，消除了部分同步假设
4. **不追求理论最优**：O(n²) 复杂度不是渐近最优，但在实际系统中已经够好了

> 一句话总结：Alea-BFT 告诉我们，在工程世界里，"简单且够好"往往比"复杂但理论上更优"更有价值。
