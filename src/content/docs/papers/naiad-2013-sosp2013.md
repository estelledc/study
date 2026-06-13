---
title: "Naiad: A Timely Dataflow System"
title_zh: "Naiad：一种及时数据流系统"
来源: https://www.microsoft.com/en-us/research/wp-content/uploads/2013/11/naiad_sosp2013.pdf
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# Naiad：一种及时数据流系统

> **论文**: Naiad: A Timely Dataflow System
> **作者**: Derek G. Murray, Frank McSherry, Rebecca Isaacs, Michael Isard, Paul Barham, Martín Abadi
> **发表于**: SOSP 2013 (第二十四届 ACM 操作系统原理研讨会)

---

## 一、一个日常类比：流水线的"后悔药"

想象你在一家快餐店做汉堡。有三位员工：

1. **切菜员**负责把蔬菜切片
2. **烤肉员**负责煎肉饼
3. **组装员**负责把菜和肉拼成汉堡

这三个环节串成一条流水线，菜片从切菜员流向烤肉员，再流向组装员。这很像"数据流"的概念——数据像食物一样从一个处理节点流向下一个节点。

**传统系统的困境**：

- **批处理系统**（如 Hadoop MapReduce）：等一整个锅的菜全部切完，才端给烤肉员。效率低，但你保证每批数据是完整的、一致的。
- **流处理系统**（如 Storm）：每一片菜切好就马上送过去。响应快，但如果切菜员后来发现某片菜切坏了，前面的烤肉员已经没法"撤回"了。

**Naiad 的核心想法**：给每一个数据块贴上"时间戳"。如果后来发现前面的数据需要修正，系统能自动把修正后的数据重新送回去，甚至覆盖之前的结果。这就好比流水线上的传送带上贴了日期标签——如果 3 号切的菜有问题，系统会在 3 号这个时间点把修正后的菜重新送上去，并且通知后续环节"用新的 3 号菜替换旧的"。

这就是论文标题中 "Timely"（及时）的含义：不是越早越好，而是 **在正确的时间做正确的事**。

---

## 二、为什么需要 Naiad？

在 2013 年之前，处理大规模数据主要有三类系统：

| 系统类型 | 代表 | 优势 | 劣势 |
|---------|------|------|------|
| 批处理 | Hadoop MapReduce | 高吞吐、结果一致 | 延迟高，不适合迭代 |
| 流处理 | Apache Storm | 低延迟 | 结果可能不一致，不支持循环 |
| 图计算 | Pregel | 适合迭代计算 | 通用性差 |

这些系统各自擅长一部分场景。但现实中，很多任务同时需要：

- **高吞吐**（像批处理）
- **低延迟**（像流处理）
- **迭代计算**（如机器学习中的梯度下降）
- **增量更新**（数据变了只处理变化部分）

**Naiad 的目标**：在一个系统里同时做到这四点。

---

## 三、核心概念

### 3.1 及时数据流（Timely Dataflow）

这是 Naiad 提出的新计算模型。核心思想：

1. **计算是有向图**：节点表示计算步骤，边表示数据流动
2. **图可以有循环**：数据可以回到前面的节点，支持迭代
3. **每条消息带时间戳**：时间戳标记了数据属于哪个"时期"或"迭代轮次"
4. **节点在正确时机被通知**：当所有属于同一时间戳的数据都到达后，节点才知道"这一轮完成了"

### 3.2 时间戳结构

每条消息的时间戳由两部分组成：

```
(e, (c1, c2, ..., ck))
```

- `e` = 纪元（epoch），标记不同的输入批次
- `(c1, c2, ..., ck)` = 循环计数器列表，标记在哪个循环的第几轮

循环必须组织成嵌套结构，每个循环有三个特殊节点：

| 节点 | 作用 | 时间戳变化 |
|------|------|-----------|
| 入口（ingress） | 循环开始 | 追加计数器 `(e, <c1,...,ck>) → (e, <c1,...,ck,0>)` |
| 出口（egress） | 循环结束 | 移除计数器 `(e, <c1,...,ck,c{k+1}>) → (e, <c1,...,ck>)` |
| 反馈（feedback） | 循环回跳 | 递增计数器 `(e, <c1,...,ck>) → (e, <c1,...,ck+1>)` |

这就像给每个循环加了一个"计数器标签"，系统通过比较时间戳就知道哪些数据属于哪个迭代轮次。

### 3.3 顶点的两个回调

每个计算节点（vertex）实现两个核心方法：

```
OnRecv(边, 消息, 时间戳)  — 收到消息时调用
OnNotify(时间戳)          — 指定时间戳的数据全部到达后被调用
```

以及两个发送方法：

```
SendBy(边, 消息, 时间戳)  — 发送消息（带时间戳）
NotifyAt(时间戳)          — 注册一个通知请求
```

### 3.4 进度跟踪协议

Naiad 在分布式环境下维护一个关键不变量：**如果一个时间戳在某个节点的本地"前沿"（frontier）上，它也在整个系统的 global frontier 上**。这意味着：

- 每个 Worker 维护本地计数（某个时间戳还有多少消息等待处理）
- Worker 之间通过协议同步这些计数
- 当所有前置时间戳都处理完了，当前时间戳就可以被推进

---

## 四、代码示例

### 示例 1：一个简单的数据流图

下面是一个伪代码级别的例子，展示如何用 Naiad 的及时数据流模型构建一个三节点的计算图：

```rust
// 定义三个节点的消息类型
struct AddOneMessage {
    value: u64,
    timestamp: Timestamp,
}

struct MultiplyMessage {
    value: u64,
    timestamp: Timestamp,
}

// 节点 A: 对输入加 1
struct AddOneNode {
    proxy: DataflowProxy,
}

impl Vertex for AddOneNode {
    fn OnRecv(&mut self, edge: Edge, msg: AddOneMessage, ts: Timestamp) {
        let new_value = msg.value + 1;
        // 发送给下一个节点，时间戳增加 1
        self.proxy.SendBy(edge::TO_MULTIPLY, MultiplyMessage {
            value: new_value,
            timestamp: ts,
        });
    }
}

// 节点 B: 对输入乘以 2
struct MultiplyNode {
    proxy: DataflowProxy,
}

impl Vertex for MultiplyNode {
    fn OnRecv(&mut self, edge: Edge, msg: MultiplyMessage, ts: Timestamp) {
        let new_value = msg.value * 2;
        // 如果有循环，时间戳会在反馈节点递增
        self.proxy.SendBy(edge::TO_OUTPUT, new_value, ts);
    }
}

// 节点 C: 输出结果并注册通知
struct OutputNode {
    proxy: DataflowProxy,
}

impl Vertex for OutputNode {
    fn OnRecv(&mut self, edge: Edge, value: u64, ts: Timestamp) {
        println!("Epoch {:?} 计算结果: {}", ts.epoch, value);
    }

    fn OnNotify(&mut self, ts: Timestamp) {
        println!("纪元 {:?} 的所有数据已处理完毕", ts.epoch);
    }
}
```

在这个例子中：
- 数据从 `AddOneNode` → `MultiplyNode` → `OutputNode` 单向流动
- 每条消息携带时间戳，记录它属于哪个纪元
- `OutputNode` 在 `NotifyAt(ts)` 注册后，会在该纪元所有数据到达时收到 `OnNotify` 回调

### 示例 2：带循环的迭代计算——求平均值

这是 Naiad 更擅长的场景：**有反馈循环的迭代算法**。比如求一组数字的平均值：

```rust
// 迭代求平均值的示例
// 初始猜一个值，不断迭代直到收敛

struct IterativeAverageNode {
    proxy: DataflowProxy,
    sum_channel: Receiver<(u64, Timestamp)>,  // 接收新的总和
    feedback_channel: Receiver<(f64, Timestamp)>,  // 接收上一轮的猜测值
}

impl Vertex for IterativeAverageNode {
    fn OnRecv(&mut self, edge: Edge, msg: Message, ts: Timestamp) {
        match edge {
            edge::TO_SUM => {
                // 收到新的数据点，累加到总和
                let (value, _) = msg;
                self.total_sum += value;
            }
            edge::FROM_FEEDBACK => {
                // 收到上一轮的猜测值
                let (guess, _) = msg;
                // 本轮的迭代：用旧猜测值计算新的平均值
                let new_average = calculate_average(self.total_sum, guess);
                // 通过反馈边发送回去，时间戳递增表示下一轮迭代
                self.proxy.SendBy(edge::FEEDBACK, new_average, ts);
                // 同时发送到输出
                self.proxy.SendBy(edge::TO_OUTPUT, new_average, ts);
            }
        }
    }

    fn OnNotify(&mut self, ts: Timestamp) {
        // 检查是否收敛（与前一轮的差别小于阈值）
        if is_converged(self.last_value, self.current_value) {
            println!("迭代在第 {:?} 轮收敛", ts.loop_counters);
        }
        // 如果不是最后一轮，通知下一轮可以开始了
        let next_ts = increment_loop_counter(ts);
        self.proxy.NotifyAt(next_ts);
    }
}

// 主程序：构建数据流图
fn build_average_graph() {
    let mut builder = DataflowBuilder::new();

    // 创建循环上下文
    let loop_ctx = builder.loop_context("averaging_iteration");

    // 输入节点：从外部读取数据
    let input = builder.source("data_input", |sender| {
        // 假设输入 [10, 20, 30, 40]
        for &v in &[10u64, 20, 30, 40] {
            sender.send(v, loop_ctx.entering_ts());
        }
    });

    // 累加节点
    let sum_node = builder.vertex("accumulator", |_ctx, input, output| {
        let mut total = 0u64;
        for msg in input.take() {
            total += msg.value;
            output.send((total, msg.timestamp));
        }
    });

    // 反馈循环：求平均值并回传
    let avg_node = builder.vertex("iterative_avg", |_ctx, input, feedback, output| {
        // feedback 是循环中的反馈通道
        for (guess, ts) in feedback.take() {
            let (total, _) = input.take().first().unwrap();
            let avg = *total as f64 / 4.0;
            output.send((avg, ts));
            // 发送回反馈通道，进入下一轮
            feedback.send((avg, increment_loop_counter(ts)));
        }
    });

    // 输出节点
    let output = builder.sink("result", |_ctx, input| {
        for (avg, ts) in input.take() {
            println!("平均值 = {:.2} (迭代 {:?})", avg, ts.loop_counters);
        }
    });

    // 连接：input -> sum -> avg -> feedback(loop) + output
    builder.connect(input, sum_node);
    builder.connect(sum_node, avg_node);
    builder.connect_feedback(avg_node, avg_node);  // 循环
    builder.connect(avg_node, output);

    // 启动数据流
    builder.run();
}
```

这个例子展示了 Naiad 处理迭代计算的能力：

1. **入口节点**（ingress）进入循环时，时间戳追加 `(..., 0)`，表示第 0 轮
2. **计算节点**用上一轮的结果计算新的平均值
3. **反馈节点**（feedback）将结果送回循环开头，时间戳递增为 `(..., 1)`、`(..., 2)` 以此类推
4. **出口节点**（egress）退出循环时，时间戳恢复为外层形式

系统自动确保：**同一轮次的所有数据在推进到下一轮之前全部处理完毕**。

---

## 五、工程实现要点

### 5.1 分布式架构

Naiad 将逻辑数据流图编译为物理数据流图：

- **Worker** 负责消息传递和节点调度
- 每个顶点单线程运行，同一 Worker 内的顶点可以立即转移控制权
- Worker 之间通过 **全局进度跟踪协议** 协调

### 5.2 微拖延（Micro-stragglers）的处理

微拖延是指某些节点比同组其他节点稍微慢一点的现象（可能来自 TCP 开销、GC、数据倾斜等）。Naiad 采用多种机制来缓解：

- 消息按时间戳批次处理，避免单个慢节点阻塞整个系统
- 局部计数与全局计数分离，减少同步开销

### 5.3 容错

状态性顶点实现 `Checkpoint()` 和 `Restore()` 方法，Naiad 通过全局检查点机制实现容错。

---

## 六、Naiad 的影响与遗产

Naiad 的学术和技术遗产深远：

1. **Microsoft Dryad / Azure Data Lake**：Naiad 直接启发了微软后续的数据处理平台
2. **Microsoft Orleans**：虚拟 actor 模型受到了 Naiad 的启发
3. **Apache Arrow / DataFusion**：现代列式数据处理系统的设计哲学与 Naiad 一脉相承
4. **Frank McSherry 后续的 Differential Dataflow**：在 Naiad 的基础上引入了"差分数据流"，进一步简化了增量计算

---

## 七、关键收获

用一句话总结 Naiad 的核心贡献：

> **给数据流计算引入"时间"这个维度，让系统能够同时高效地处理批处理、流处理、迭代计算和增量更新。**

具体来说：

- **时间戳即逻辑时钟**：不需要真时钟，用 `(纪元, 循环计数器)` 就够了
- **循环不是禁区**：通过入口/出口/反馈三个特殊节点组织循环，系统能安全地推进迭代
- **通知机制解耦了"计算"和"同步"**：节点只需关心自己的数据，进度跟踪由系统底层自动完成

---

## 八、思考题

1. 如果 Naiad 的时间戳结构只包含纪元 `e`，不包含循环计数器 `(c1,...,ck)`，会带来什么限制？
2. 为什么 Naiad 选择让每个顶点单线程运行，而不是多线程？这种设计的 trade-off 是什么？
3. 对比 MapReduce 的"每次全量重新计算"和 Naiad 的"增量推进"，在什么场景下 Naiad 的优势最明显？

---

*本文基于 Murray 等人在 SOSP 2013 发表的论文 "Naiad: A Timely Dataflow System" 编写。*
