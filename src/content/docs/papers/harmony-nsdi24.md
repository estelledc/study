---
title: "Harmony: A Congestion-free Datacenter Architecture"
来源: 'https://www.usenix.org/conference/nsdi24/presentation/agarwal-saksham'
日期: 2026-06-13
分类: 网络协议
子分类: 数据中心网络
provenance: pipeline-v3
---

## 是什么

**Harmony: A Congestion-free Datacenter Architecture** 提出：用一种完全分布式的设计，让数据中心网络在正常运行时永远不会发生因为缓冲区溢出导致的丢包，并且每个数据包在每个交换机处经历的排队时间都是有上限的。

日常类比：想象一个大型仓库的物流系统。传统网络像"先到先得"的共享传送带——人多时就堵，东西堆满就掉地上（丢包）。Harmony 的做法是：每个包裹在出发前先预约一条"专属通道"，交换机看到预约后确认"通道空闲"才放行。因为每个通道一次只给一个包裹用，传送带永远不会塞满，东西也不会掉地上。即使多个包裹共用同一条物理传送带，Harmony 会给每条传送带拆出多条"虚拟子通道"，让多个预约错开走，既保证不堵，又保证效率高。

## 为什么重要

- 数据中心延迟不可预测的根源是排队和丢包，Harmony 从架构层面消除这个问题
- 传统 RDMA/PFC 方案有队头阻塞、死锁、拥塞扩散等副作用，Harmony 不用 PFC 也能做到无损
- 现代链路带宽越来越大（100G→400G），BDP 变大导致拥塞控制越来越失效，Harmony 不依赖拥塞控制
- 为分布式系统提供可预测的网络延迟，可以简化故障检测、存储栈设计等多个上层系统

## 核心概念

### 1. 资源预约（RSVP）的思想

Harmony 的思想根源来自经典的 RSVP（Resource ReSerVation Protocol）。发送方发消息前先发控制包请求资源，接收方确认有空闲资源后才回复 RSVP，然后发送方才开始传数据。这保证了资源在数据到达之前就已经预留好了，不会出现"大家都来了，座位不够"的情况。

### 2. 主机插槽（Host Slots）

每条主机网卡连接带宽为 B。Harmony 把每条链路分成 K 个"插槽"，每个插槽带宽为 B/K。每个消息最少占用 1 个插槽，最多可以占用 K 个插槽。发送方和接收方各自维护 K 个插槽的分配状态。

### 3. 虚拟链路（Virtual Links）

每条物理链路（交换机之间的链路）也被分成 K 条"虚拟链路"，每条带宽 B/K。一个消息可以占用多条虚拟链路。交换机在做转发决策时，是从空闲的虚拟链路中随机选一条，而不是从物理链路中选。

### 4. 两个不变量（Invariants）

Harmony 靠维持两个不变量来保证"不拥塞"：

- 不变量一：每个交换机每条出向链路上的消息到达率 ≤ 链路带宽（不会持续积压）
- 不变量二：每条物理链路上最多同时有 K 个消息共享（排队有上限）

## 核心协议流程

Harmony 协议只用了四种控制包：request、rsvp、reject、complete。流程如下：

1. 发送方收到消息后，立即向接收方发送 `request` 控制包
2. 接收方如果有空闲插槽，就分配一个，然后向发送方回发 `rsvp`
3. 中间交换机收到 `rsvp` 后，随机选一条空闲虚拟链路转发
4. 发送方收到 `rsvp` 后，分配一个主机插槽，开始以 B/K 的速率发送数据
5. 数据传完后，发送方发送 `complete` 通知释放资源

## 代码示例

### 示例 1：Harmony 协议的状态机（伪代码）

```python
# ============ 发送方状态机 ============

class HarmonySender:
    def __init__(self, k_slots, link_bandwidth):
        self.k = k_slots
        self.b = link_bandwidth
        self.free_slots = list(range(k_slots))  # 空闲插槽列表
        self.active_messages = {}               # 消息ID -> 已分配插槽数

    def on_message_arrived(self, message):
        """消息到达，向接收方发起预约请求"""
        # 发送 request 控制包到接收方
        send_request_control(message)

    def on_rsvp_received(self, rsvp, message_id):
        """收到接收方的 RSVP 确认——说明网络路径已预留好"""
        if len(self.free_slots) > 0:
            # 分配一个插槽
            slot = self.free_slots.pop(0)
            # 分配一个虚拟链路
            self.active_messages[message_id] = \
                self.active_messages.get(message_id, 0) + 1
            # 开始以 B/K 的速率发送数据
            transmit_at_rate(self.b / self.k, message_id)
        else:
            # 没有空闲插槽了，回送 reject
            send_reject_to_receiver(message_id)

    def on_complete_received(self, complete, message_id):
        """收到接收方的完成通知——释放插槽"""
        self.free_slots.append(message_id)
        del self.active_messages[message_id]


# ============ 接收方状态机 ============

class HarmonyReceiver:
    def __init__(self, k_slots):
        self.k = k_slots
        self.free_slots = list(range(k_slots))
        self.pending_requests = []  # 等待中的请求队列

    def on_request_received(self, request, message_id):
        """收到发送方的预约请求"""
        if len(self.free_slots) > 0:
            # 有槽位：分配并回发 RSVP
            slot = self.free_slots.pop(0)
            send_rsvp_to_sender(message_id)
        else:
            # 没槽位：加入等待队列，启动计时器
            request.timer = start_timer(delta_admission)
            self.pending_requests.append(request)

    def on_slot_freed(self, message_id):
        """某个消息传输完成，释放一个插槽"""
        self.free_slots.append(message_id)
        # 从等待队列中选出计时器最长的请求来服务
        if self.pending_requests:
            best_request = max(self.pending_requests,
                             key=lambda r: r.timer.value)
            self.pending_requests.remove(best_request)
            send_rsvp_to_sender(best_request.message_id)

    def on_reject_received(self, reject, message_id):
        """收到 reject 通知——网络无法提供路径"""
        self.free_slots.append(message_id)
```

### 示例 2：交换机转发 RSVP 的决策逻辑

```python
# ============ 交换机转发逻辑 ============

class HarmonySwitch:
    def __init__(self, ports, k_virtual_links):
        self.k = k_virtual_links
        # 每个端口的空闲虚拟链路数
        self.free_vlinks = {port: k_virtual_links for port in ports}

    def on_rsvp_received(self, rsvp, ingress_port):
        """收到 RSVP 包，决定从哪个出端口转发"""
        # 找出到目标的所有最短路径
        paths = find_shortest_paths(rsvp.destination)

        for path in paths:
            egress_port = path[0]  # 下一跳端口
            if self.free_vlinks[egress_port] > 0:
                # 有空闲虚拟链路：分配一条，嵌入路径标识
                self.free_vlinks[egress_port] -= 1
                embed_path_identifier(rsvp, path)
                forward_rsvp(rsvp, egress_port)
                return

        # 所有最短路径都没空余虚拟链路 → 转为 reject
        reject = convert_rsvp_to_reject(rsvp)
        forward_reject(reject, rsvp.sender, rsvp.receiver)

    def on_complete_received(self, complete, port):
        """传输完成，释放虚拟链路"""
        self.free_vlinks[port] += 1
        forward(complete, next_hop(port))

    def on_reject_received(self, reject, port):
        """收到 reject（路径不可用），释放虚拟链路"""
        self.free_vlinks[port] += 1
        # reject 沿原路返回，沿途每跳都释放虚拟链路
        forward_reject(reject, next_hop(port))
```

## 理论分析

### 排队上限定理

Harmony 证明了以下结论：设 H 是最长路径经过的交换机数量，K 是每条物理链路的虚拟链路数，B 是链路带宽，p 是最大数据包大小。则：

- 每个数据包在每个交换机处的最大排队量：`Q ≤ H × (K - 1) × p`
- 每个数据包在所有交换机上的总排队延迟：`δ ≤ H × (H + 1) × (K - 1) × p / (2B)`

关键直觉：K 条虚拟链路共享一条物理链路，最坏情况下最多有 K-1 条同时有数据到达，造成排队。但这个排队是"有界的"，不会像传统网络那样无限增长。

### 效率分析

当 K=1（只用 1 条虚拟链路）时，Harmony 的成功分配数只有最优值的约 63%。增加 K 后效率快速逼近最优。实践中 K=8 就已足够好。

## Harmony 实现要点

- 使用可编程交换机（P4）+ DPDK 用户态网络栈实现
- 控制包用优先级隔离：数据包和 RSVP/Complete 用最高优先级，Request/Reject 用第二优先级
- 支持最佳努力（best-effort）流量共存：用第三优先级，不影响 Harmony 的排队保证
- 利用可预测的延迟可以做快速故障检测——如果预期的 RSVP 没在预期时间内到，一定是出故障了

## 踩过的坑

1. **不是所有应用都适合**：Harmony 在低负载时引入了微小的额外延迟（因为要走预约流程），小包场景下这个开销相对更明显
2. **需要网络设备支持**：需要可编程交换机来嵌入路径标识、基于标识转发、支持虚拟链路计数——虽然现代交换机基本都支持
3. **只保证网络层**：Harmony 只保证交换机队列有界，主机侧的排队和处理延迟需要额外工作
4. **K 参数要权衡**：K 越大吞吐量越高，但排队上限也越大，需要按场景选择

## 适用 vs 不适用场景

**适用**：
- 对延迟上限有严格要求的分布式系统（如共识协议、分布式数据库）
- 需要替代 PFC 实现无损网络的 RDMA 场景
- CPU 效率敏感的存储栈（如 NVMe-over-Fabrics）
- 需要精确故障检测的分布式系统

**不适用**：
- 海量小包、超低延迟优先的场景（预约开销相对更明显）
- 不支持可编程交换机的老旧网络
- 应用层不在乎网络延迟波动的场景

## 学到什么

- "零拥塞"不一定需要集中式调度——分布式 RSVP + 虚拟链路也能逼近最优
- 排队不一定有害，"有界的排队"比"无界的零排队"更实用
- 网络架构的进步（可编程交换机）让以前做不到的事情变得可行
- 从 RSVP 到 Harmony：经典思想在新硬件平台上焕发新生

## 延伸阅读

- Harmony 技术报告：https://github.com/communication-harmony/tech-report
- Fastpass（集中式零队列方案）：USENIX NSDI 2014
- dcPIM（近最优分布式传输）：ACM SIGCOMM 2022
- PFC（优先级流控）：IEEE 802.1Qbb

## 关联

- [[hpcc-osdi2019]] —— HPCC：高精度拥塞控制
- [[dcvim]] —— dcViM：近最优数据中心调度
- [[swift-delay-is-simple]] —— Swift：简单的低延迟拥塞控制
- [[pFabric]] —— pFabric：最小化近最优数据中心传输

## 维护备注

- 引用格式保持单引号包裹来源字段。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
