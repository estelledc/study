---
title: Söze: One Network Telemetry Is All You Need for Per-flow Weighted Bandwidth Allocation at Scale
来源: https://www.usenix.org/conference/osdi25/presentation/wang-weitao
日期: 2026-06-13
分类: 网络协议
子分类: 数据中心网络
provenance: pipeline-v3
---

# Söze: 一条网络遥测数据，就够

## 什么是"加权带宽分配"？先从一个日常类比开始

想象你在一个小区里，有几条小路（网络链路）通向大门（服务器）。每条路上都有很多人在走（数据流）。如果完全公平，大家各走各的，谁先占用路谁就有优势——结果可能是一个人霸占了整条路。

"加权带宽分配"的意思是：小区管理员给每条路分配"优先级权重"。比如 A 路权重是 3，B 路权重是 1，那么在瓶颈处，A 能拿到 75% 的路权，B 只能拿 25%。

在数据中心里，这有什么用？

- 分布式训练时，重要层的数据传输需要更高权重
- Spark/Hadoop _shuffle 阶段，慢的流（straggler）需要更多带宽
- 不同任务之间按 SLA 公平分带宽

问题在于：数据中心有上百万条流、上千台交换机，怎么让每条流都"知道"自己该用多少带宽？传统方案要么需要集中式控制器（慢、开销大），要么依赖交换机硬件的精细队列（不够灵活）。

**Söze 的核心洞察：只需要一条网络遥测数据（排队延迟），就够让所有流收敛到正确的加权分配。**

---

## 核心概念 1：排队延迟 = 信息通道

交换机 ASIC 有一个叫 INT（In-Network Telemetry）的功能，可以在数据包头部插入交换机本地的信息，比如排队延迟（queueing delay）。

Söze 不做的是"监控"这个延迟，而是**利用它作为所有流之间的协调通道**。

类比：几辆车在路口等红灯。红灯时间长短（排队延迟）反映了路口的拥堵程度。所有司机都能看到同一个红灯时间，于是可以调整自己的车速——这就是一个隐式的信息通道。

具体机制：
1. 数据流经过瓶颈交换机时，交换机会测量排队延迟
2. 这个延迟值被写进数据包头部（forwarding path）
3. 接收方把这个延迟值附在 ACK 包头上传回发送方
4. 发送方根据这个延迟值调整自己的发送速率

---

## 核心概念 2：rate-per-weight 和 maxQD

Söze 的关键数学洞察：加权带宽分配等价于让所有流的 `rate/weight` 相等。

假设链路带宽 B = 100 Mbps，两条流权重分别为 3 和 1：
- 流 1 应该拿到 75 Mbps，流 2 应该拿到 25 Mbps
- 此时 `75/3 = 25`，`25/1 = 25`，两者相等

Söze 把 `rate/weight` 叫做 **rate-per-weight**。每个流独立计算自己的这个值，然后和从网络中"看到"的目标值比较，如果高了就减速，低了就加速。

对于多跳网络，Söze 用了 **maxQD**（最大排队延迟）：一条流经过多个交换机时，取所有交换机中最大的排队延迟值。因为瓶颈交换机产生的排队延迟总是最大的，所以 maxQD 自然指向了瓶颈。

---

## 核心概念 3：收敛算法（一行代码的理解）

Söze 的发送方算法极其简单：

```
每个 ACK 包到达时：
    从包里读出 maxQD（目标排队延迟）
    计算 rate_per_weight = current_rate / weight
    计算 ratio = inverse_target_delay(maxQD) / rate_per_weight
    更新发送速率：new_rate = current_rate * ratio
```

核心思想：target_delay 和 rate_per_weight 是**反向关系**——rate_per_weight 越大，目标延迟越小。发送方调整速率，让自己的实际 rate_per_weight 对应的目标延迟，等于从网络中观测到的延迟。

当所有流的 rate_per_weight 相等时，达到均衡，加权带宽分配完成。

---

## 代码示例

### 示例 1：主机端的速率调整（伪代码）

这是 Söze 在发送方主机上运行的核心算法：

```python
class SozeSender:
    """Söze 发送方：每个流一个实例"""

    def __init__(self, flow_id, weight):
        self.flow_id = flow_id
        self.weight = weight
        self.current_rate = 0          # 当前发送速率 (Mbps)
        self.last_update_time = 0

    def on_ack_received(self, maxqd, current_time):
        """收到 ACK 包时，根据 maxQD 调整速率"""
        # maxQD 是从数据包中读出的最大排队延迟（微秒）
        # rate_per_weight 是当前速率除以权重
        rate_per_weight = self.current_rate / self.weight

        # 目标延迟函数：rate_per_weight 越大 -> 目标延迟越小
        # 这是一个单调递减函数
        target_delay = self._target_function(rate_per_weight)

        # 如果目标延迟 > 观测延迟，说明速率太高，需要减速
        # 如果目标延迟 < 观测延迟，说明速率太低，可以加速
        ratio = self._calculate_ratio(target_delay, maxqd)

        # 更新速率
        self.current_rate *= ratio

    def _target_function(self, rate_per_weight):
        """
        目标延迟函数：将 rate_per_weight 映射到目标排队延迟
        参数：
          p = 20us（缩放因子）
          k = 3us（基础延迟）
          alpha = 最高 rate_per_weight
          beta = 最低 rate_per_weight
        """
        # target_delay = p * ln(alpha) / (ln(alpha) - ln(rate_per_weight)) + k
        # 当 rate_per_weight 很大时 -> target_delay 接近 k（很小）
        # 当 rate_per_weight 很小时 -> target_delay 很大
        import math
        alpha = 25e9 / 1   # 链路带宽 / 最小权重
        beta = 25e9 / 1000 # 链路带宽 / 最大权重
        ln_ratio = math.log(alpha) - math.log(beta)
        p = 20e-6  # 20 microseconds
        k = 3e-6   # 3 microseconds
        target = p * (math.log(alpha) - math.log(rate_per_weight)) / ln_ratio + k
        return target

    def _calculate_ratio(self, target_delay, observed_delay):
        """计算速率调整比例"""
        # ratio = (target_delay / observed_delay) ^ m
        # m = 0.25 是平滑参数：越小越稳定，越大越快收敛
        m = 0.25
        if observed_delay > 0:
            ratio = (target_delay / observed_delay) ** m
            # 限制比例范围，避免剧烈震荡
            return max(0.5, min(2.0, ratio))
        return 1.0
```

### 示例 2：交换机端的遥测采集（P4 伪代码）

Söze 在交换机上只用了约 9 行代码。这里用 P4 语言模拟 Tofino 交换机上的实现：

```p4
// 交换机端：采集排队延迟并附加到数据包头部
// 约 9 行 P4 代码

control inject_queue_delay {
    // 1. 定义低通滤波器，平滑排队延迟
    bit<32> lpf_queue;

    // 2. 每个数据包出队时，测量时间差（即排队时间）
    action inject_maxqd() {
        // eg_intr_md.deq_timedelta = 数据包在队列中等待的时间
        bit<32> queue_input = (bit<32>) eg_intr_md.deq_timedelta;

        // 3. 用低通滤波得到平滑后的排队延迟
        bit<32> smoothed_delay = lpf_queue.execute(queue_input, 0);

        // 4. 将排队延迟写入数据包头部（2 字节字段）
        // 5. 与当前头部中的值比较，保留最大值
        if (smoothed_delay > pkt_hdr.maxqd) {
            pkt_hdr.maxqd = smoothed_delay;
        }
    }

    // 6. 在出口端口应用这个控制
    apply {
        inject_maxqd();
    }
}
```

### 示例 3：完整工作流程（端到端）

```python
def soze_workflow():
    """
    一个数据包的完整 Söze 生命周期：
    发送方 -> 交换机1(采集) -> 交换机2(采集max) -> 接收方 -> ACK回传 -> 发送方调整
    """

    # === 发送方 ===
    sender = SozeSender(flow_id="A-B", weight=3)
    sender.current_rate = 10.0  # Mbps

    # === 数据转发路径 ===
    # 交换机1: 排队延迟 = 5us
    maxqd = 5        # 初始化 maxQD

    # 交换机2（瓶颈）: 排队延迟 = 12us
    maxqd = max(maxqd, 12)  # maxQD = 12us

    # 数据包到达接收方
    # 接收方将 maxQD = 12us 写入 ACK 包头部

    # === ACK 返回发送方 ===
    ack_maxqd = 12   # 12 microseconds

    # === 发送方调整速率 ===
    rate_per_weight = sender.current_rate / sender.weight
    # rate_per_weight = 10.0 / 3 = 3.33 Mbps

    target_delay = sender._target_function(rate_per_weight)
    # 假设 target_delay = 15us（因为 rate_per_weight 较低）

    ratio = (target_delay / ack_maxqd) ** 0.25
    # ratio = (15 / 12) ** 0.25 ≈ 1.06

    new_rate = sender.current_rate * ratio
    # new_rate = 10.0 * 1.06 ≈ 10.6 Mbps

    print(f"速率从 {sender.current_rate} 调整为 {new_rate:.2f} Mbps")
    # 速率上升，因为目标延迟(15us) > 观测延迟(12us)
    # 说明流有权重空间，可以增加速率

    # 经过多次迭代后，所有流收敛到 rate/weight 相等
    # 最终：流 A (weight=3) 获得 75Mbps，流 B (weight=1) 获得 25Mbps
```

---

## Söze 的优势总结

| 维度 | 传统方案 | Söze |
|------|----------|------|
| 需要拓扑知识 | 需要 | 不需要 |
| 需要路由信息 | 需要 | 不需要 |
| 需要集中控制器 | 通常需要 | 完全分布式 |
| 更新粒度 | 按 RTT | 按包 |
| 交换机要求 | 需要可编程开关 | 普通交换机即可 |
| 交换机代码量 | 复杂调度逻辑 | ~9 行 |
| 主机代码量 | 复杂控制器 | ~241 行（Linux 模块） |

---

## 实验结果亮点

- **TPC-H 查询加速**：平均完成时间降低 0.79×，最高 0.59×
- **关键路径加速**：优先重要流后，作业完成时间从 117 秒降到 96 秒
- **Straggler 缓解**：动态调整权重让慢速流赶上，减少 coflow 完成时间
- **公平隔离**：同一瓶颈上的不同作业之间，只要权重和不变，互不干扰

---

## 我的理解（一句话）

Söze 把排队延迟从"监控数据"变成了"控制信号"——交换机只需要记录最大的排队延迟，发送方看到这个延迟值就知道自己该快还是该慢，所有流在没有协调的情况下自发收敛到加权公平分配。一条线上的遥测数据，解决了一个分布式系统问题。
