---
title: "Horus: Granular In-Network Task Scheduler for Cloud Datacenters"
来源: https://www.usenix.org/conference/nsdi24/presentation/yassini
日期: 2026-06-13
分类: 分布式系统
子分类: 数据中心网络
provenance: pipeline-v3
---

# Horus: 数据中心细粒度在线网络任务调度器

## 一、日常类比：餐厅点餐系统

想象一家超级大的连锁餐饮集团，有几十家分店（数据中心），每家分店有十几个厨房（机架/rack），每个厨房里又有好几个厨师（worker/core）。

现在来了一波客人，每人点一道菜，而且每道菜做得非常快——只要几秒种（微秒级短任务）。问题是：

- 客人太多，每秒要处理上万个订单
- 如果总是把订单派给同一个厨房，那个厨房的厨师会忙不过来，排起长队
- 如果派单决策本身就要花好几秒，那比做菜还慢，完全没有意义

传统做法是找一个"中央调度员"（软件调度器），坐在办公室里看哪个厨房有空就派人下单。但这个调度员接到订单、查表、回复，来回一趟可能就要几毫秒——比做菜时间还长！

Horus 的创新在于：**不做中央调度员，而是把派单逻辑直接写进每家分店的收银台里**。收银台自己知道附近厨房的空闲情况，客人一到，瞬间就派出去，不用打电话问总部。

## 二、核心问题

现代数据中心运行着大量延迟敏感的应用（键值存储、多媒体处理、分布式分析等），这些应用被拆分成海量短任务：

- 每个任务执行时间：**几十到几百微秒**
- 调度频率要求：**每秒数亿次调度决策**
- 关键指标：**尾部响应时间**（最慢的那个任务决定了整体体验）

传统软件调度器（如 Borg、Twine）的调度延迟本身就达毫秒级，比任务执行时间还长，完全不适合。已有的网络内调度器（如 RackSched）只能在单个机架内工作，无法跨机架调度。

## 三、Horus 的核心洞察

**调度操作应该在不同时间尺度上运行：**

- 分配任务给 worker：微秒级（越快越好）
- 追踪 worker 负载：毫秒级（不需要实时更新）

基于这个洞察，Horus 把调度拆成两个独立组件：
1. **负载追踪组件**：收集、聚合、维护 worker 负载信息
2. **调度策略组件**：用维护的信息来决定把任务派给谁

两个组件都跑在网络交换机的数据平面中。

## 四、系统架构

Horus 采用叶脊（leaf-spine）拓扑，分为两层调度器：

- **叶调度器（Leaf Scheduler）**：运行在每个机架顶部的交换机上，负责跟踪本机架内所有 worker 的负载，直接把任务分配给具体 worker
- **脊调度器（Spine Scheduler）**：运行在脊层交换机上，负责把任务分配到具体的机架（即某个叶调度器）

工作流程：
1. 任务到达，被随机分发到某个脊调度器（按各机架 worker 数量加权）
2. 脊调度器根据机架负载信息，选择下游的叶调度器
3. 叶调度器将任务分配给具体的空闲 worker
4. worker 完成任务后，通过回复包将自己的负载信息传回叶调度器

## 五、核心算法

### 5.1 调度策略：空闲优先 + 两次幂

Horus 的调度策略非常简单有效：

**情况一：存在空闲节点**
- 直接把任务派给空闲节点
- 响应时间为零（不需要排队）

**情况二：所有节点都在忙**
- 使用"两次幂"（power-of-2）策略：随机选两个节点，派给队列较短的那个
- 随机采样避免了"任务蜂拥"（task herding）——即多个任务同时涌向同一个刚被标记为空闲的节点

### 5.2 空闲节点数据结构 idleNodes

Horus 设计了一个巧妙的数据结构来高效追踪空闲节点：

```
idleList[N]:  存储空闲节点的 ID，空闲节点总是连续排在列表顶部
p:           指向第一个非空闲位置的指针
idleIndex[X]: 记录节点 X 在 idleList 中的位置
```

不变式：**如果有空闲节点，它们一定连续存放在列表顶部。**

添加空闲节点（idleAdd）：
```
// 伪代码：收到"某节点变空闲"的消息
function ADD(pkt):
    p = readInc(p)              // 原子读取并递增 p
    idleList[p] = pkt.srcID     // 把节点 ID 写入 p 指向的位置
    idleIndex[pkt.srcID] = p    // 记录该节点在列表中的位置
```

删除任意节点（idleRemove）——需要两遍处理：
```
// 第一遍：找到要删除的节点位置，以及最后一个空闲节点
function REMOVE_FIRST_PASS(pkt):
    p = readDec(p)
    lastNodeID = idleList[p]              // 最后一个空闲节点
    removedIdx = idleIndex[pkt.srcID]     // 要删节点的位置
    resubmit(lastNodeID, removedIdx)       // 重新进入流水线

// 第二遍：用最后一个节点填补空缺
function REMOVE_SECOND_PASS(lastNodeID, removedIdx):
    idleList[removedIdx] = lastNodeID     // 填补空缺
    idleIndex[lastNodeID] = removedIdx    // 更新索引
```

### 5.3 惰性状态更新（Lazy State Update）

这是 Horus 最精妙的设计。当所有节点都在忙时，需要比较它们的实际负载。但每次更新都同步到所有调度器开销太大。

Horus 把每个节点的实际队列长度 q 分解为两部分：
- **负载值 l**：调度器"认为"的负载（可能过期）
- **漂移值 d**：已经派了但还没反映到 l 的任务数

关系：`q = l + d`

调度时，随机选两个节点 m 和 n，比较它们的 l 值。只有满足以下条件时才重新同步状态：

```
dm > (ln - lm) + dn
```

简化实现中（不考虑 dn）：
```
dm > (ln - lm)
```

这意味着：**只要漂移量没有大到可能改变调度决策，就继续用旧数据做判断**。只有当旧数据可能导致错误决策时，才触发重新同步。

代码示例——惰性更新的决策逻辑：
```
// 伪代码：当所有节点都在忙时
function SCHEDULE_TASK_BUSY(pkt):
    // 从两份 loadList 副本中随机选两个节点
    m = random_node()
    n = random_node()
    lm = loadList[m]
    ln = loadList[n]

    // 选负载较小的那个
    if lm <= ln:
        sel = m
        diff = ln - lm
    else:
        sel = n
        diff = lm - ln

    // 检查漂移值是否大到可能影响决策
    drift = driftList[sel]
    if drift > diff:
        // 旧数据可能出错，重新同步状态
        resubmit_packet_to_update_state()
    else:
        // 直接用当前信息做决策，无需同步
        increment_drift_list(sel)
        forward_task_to(sel)
```

## 六、代码示例

### 示例 1：空闲节点调度的完整流程

```python
# 简化的 Horus 叶调度器核心逻辑

class LeafScheduler:
    def __init__(self, num_workers):
        self.idle_list = [0] * num_workers  # 空闲节点列表
        self.idle_index = {}                # 节点ID -> 在idle_list中的位置
        self.p = 0                          # 指向第一个非空闲位置
        self.load_list = [0] * num_workers  # 每个worker的负载值
        self.drift_list = [0] * num_workers # 每个worker的漂移值

    def on_worker_idle(self, worker_id):
        """worker完成任务变空闲时调用"""
        idx = self.p
        self.idle_list[idx] = worker_id
        self.idle_index[worker_id] = idx
        self.p += 1

    def on_worker_busy(self, worker_id):
        """worker开始处理任务时调用"""
        if worker_id in self.idle_index:
            self.remove_from_idle(worker_id)

    def remove_from_idle(self, worker_id):
        """从空闲列表中移除任意节点，保持空闲节点在顶部连续"""
        removed_idx = self.idle_index[worker_id]
        self.p -= 1
        last_node = self.idle_list[self.p]

        # 用最后一个节点填补空缺
        self.idle_list[removed_idx] = last_node
        self.idle_index[last_node] = removed_idx
        del self.idle_index[worker_id]

    def schedule_task(self, task):
        """调度一个任务"""
        if self.p > 0:
            # 有空闲节点：直接从列表顶部取
            worker_id = self.idle_list[self.p - 1]
            self.p -= 1
            del self.idle_index[worker_id]
            return worker_id
        else:
            # 全部忙碌：两次幂策略
            return self.power_of_two_schedule()

    def power_of_two_schedule(self):
        """所有节点忙碌时的调度"""
        import random
        m = random.randint(0, len(self.load_list) - 1)
        n = random.randint(0, len(self.load_list) - 1)

        lm = self.load_list[m] + self.drift_list[m]
        ln = self.load_list[n] + self.drift_list[n]

        if lm <= ln:
            # 检查是否需要惰性更新
            if self.drift_list[m] > (self.load_list[n] - self.load_list[m]):
                # 状态可能过时，先更新
                self.sync_state(m)
            self.drift_list[m] += 1
            return m
        else:
            if self.drift_list[n] > (self.load_list[m] - self.load_list[n]):
                self.sync_state(n)
            self.drift_list[n] += 1
            return n

    def sync_state(self, node_id):
        """同步节点的真实负载到调度器"""
        self.load_list[node_id] += self.drift_list[node_id]
        self.drift_list[node_id] = 0
```

### 示例 2：脊调度器的机架间负载均衡

```python
# 简化的 Horus 脊调度器核心逻辑

class SpineScheduler:
    def __init__(self, num_racks):
        self.rack_idle_list = [0] * num_racks
        self.rack_idle_index = {}
        self.p = 0
        self.rack_load_list = [0] * num_racks  # 每个机架的平均负载
        self.rack_drift_list = [0] * num_racks

    def on_rack_idle(self, rack_id):
        """机架内有worker变空闲"""
        idx = self.p
        self.rack_idle_list[idx] = rack_id
        self.rack_idle_index[rack_id] = idx
        self.p += 1

    def on_rack_full(self, rack_id):
        """机架内所有worker都在忙"""
        if rack_id in self.rack_idle_index:
            removed_idx = self.rack_idle_index[rack_id]
            self.p -= 1
            last_rack = self.rack_idle_list[self.p]
            self.rack_idle_list[removed_idx] = last_rack
            self.rack_idle_index[last_rack] = removed_idx
            del self.rack_idle_index[rack_id]

    def schedule_to_rack(self, task):
        """将任务分配到机架"""
        if self.p > 0:
            # 有空闲机架，直接分配
            rack_id = self.rack_idle_list[self.p - 1]
            # 注意：脊调度器不立即从空闲列表中移除，
            # 因为一个机架还有其它worker可能空闲
            return rack_id
        else:
            # 所有机架都在忙：两次幂策略
            return self.power_of_two_select_rack()

    def power_of_two_select_rack(self):
        import random
        m = random.randint(0, len(self.rack_load_list) - 1)
        n = random.randint(0, len(self.rack_load_list) - 1)

        actual_m = self.rack_load_list[m] + self.rack_drift_list[m]
        actual_n = self.rack_load_list[n] + self.rack_drift_list[n]

        if actual_m <= actual_n:
            sel = m
        else:
            sel = n

        # 选择后增加漂移值
        self.rack_drift_list[sel] += 1
        return sel
```

## 七、状态分发机制

### 7.1 叶层状态更新

- worker 完成任务后，在回复包的头部附加最新的负载信息
- 叶调度器收到回复包，更新本地状态
- 如果 worker 变空闲，发送 idleAdd 消息给脊调度器
- 如果机架内所有 worker 都忙，发送 idleRemove 消息

### 7.2 脊层状态更新——惰性聚合

叶调度器不会每次都把负载变化通知脊调度器。它本地维护当前平均值和上次发送的值，**只有差值达到 1 以上时才发送更新**。这大幅减少了通信开销。

## 八、实验结果

### 测试环境
- Intel Tofino 可编程交换机
- RocksDB 和 TPC-C 真实工作负载

### 关键数据

| 指标 | Horus vs RackSched |
|------|-------------------|
| 单机架尾部响应时间 | 降低最多 75% |
| 吞吐量 | 提升最多 1.9 倍 |
| 跨机架尾部响应时间 | 比扩展版 RackSched 低 50% |
| 跨机架吞吐量 | 最高提升 3.2 倍 |
| 调度延迟 | 所有任务 < 1.6 微秒 |

### 大规模模拟（27,648 台服务器）
- 1,152 个叶交换机 + 1,152 个脊交换机
- 685,000 个并发 worker
- Horus 在所有工作负载和指标上都显著优于 RackSched 及其扩展

## 九、总结

Horus 的核心贡献可以概括为三点：

1. **首次实现数据中心级别的在线网络任务调度**——突破了 RackSched 只能在一个机架内工作的限制
2. **设计了三种新颖的数据结构**——idleNodes（常量时间增删查）、双副本 loadList（绕过交换机内存访问限制）、惰性漂移列表（减少同步开销）
3. **提出了惰性状态更新算法**——只在旧数据可能导致错误调度决策时才触发同步，在保证调度质量的同时最小化了通信开销

Horus 展示了把调度逻辑下沉到网络交换机的巨大潜力，为未来的细粒度计算（granular computing）平台奠定了基础。
