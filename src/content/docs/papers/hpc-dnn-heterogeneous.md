---
title: HAP: SPMD DNN Training on Heterogeneous GPU Clusters with Automated Program Synthesis
来源: https://arxiv.org/abs/2401.05965
日期: 2026-06-13
分类: 其他
子分类: 分布式训练
provenance: pipeline-v3
---

# HAP: 用自动化程序综合实现异构 GPU 集群上的 DNN 训练

## 什么是 HAP 要解决的问题？

想象一个工厂，有 8 台工人。其中 4 台是高级工人（A100），另外 4 台是初级工人（T4）。你的任务是把一张巨大的拼图分发给所有人一起完成。

问题在于：如果让高级工人和初级工人做一样多的活，初级工人总是拖后腿（这就是"木桶效应"）。但让初级工人做太少，高级工人又闲着没事干。

在深度学习中，这对应的是：**训练大模型时，集群里往往混合了不同型号的 GPU**。传统做法是让所有 GPU 运行相同的程序（SPMD，Single-Program-Multiple-Data），然后简单地把模型数据平均分给每个 GPU。这在异构集群上效率很低。

HAP 就是来自动化地解决这个问题。

## 背景知识

### 单 GPU 训练（一个人做拼图）

在单个 GPU 上训练模型，你可以这样写：

```python
# 伪代码：单 GPU 训练
model = build_gpt_model()
data = load_dataset()

for batch in data:
    output = model(batch)          # 前向传播
    loss = compute_loss(output)    # 计算损失
    loss.backward()                # 反向传播
    optimizer.step()               # 更新参数
```

### 多 GPU 数据并行（四个人平均分拼图）

最简单的多 GPU 方法是"数据并行"。每个 GPU 持有完整的模型副本，但只处理一部分数据：

```python
# 伪代码：数据并行（简单平均分割）
model = build_gpt_model()
data = load_dataset()

for batch in data:
    # 把 batch 简单切成 4 份，每份给一个 GPU
    local_data = split_equally(batch, num_gpus=4)
    local_output = model(local_data)
    sync_gradients()               # 所有 GPU 对齐梯度
```

问题就在这里：**split_equally 在异构集群上是最差策略**。A100 的算力是 T4 的 3 倍以上，但被分配了同样多的活。

## HAP 的核心思路

HAP 做了一个关键转换：**把模型分割问题变成一个"程序综合"问题**。

程序综合（Program Synthesis）是什么？简单说就是：给定一个目标（"我要高效训练"）和一组工具（不同 GPU 的性能），自动生成一段最优的程序（每个 GPU 分多少活、怎么通信）。

HAP 的三个创新点：

1. 用 A* 搜索算法自动找到最优的模型分割方案
2. 把分割比例建模成线性规划（Linear Programming）问题来求解
3. 自动选择最优的 GPU 间通信方式

## 核心概念详解

### 1. 张量分片（Tensor Sharding）

神经网络中的每一个计算都可以表示为一个"张量操作"。HAP 不简单地按层切分模型，而是深入到**张量级别**，决定每个张量的哪些部分放在哪个 GPU 上。

日常类比：把一张大披萨切成不规则的块。不是简单地"每人一样大"，而是让胃口大的人多拿几块，胃口小的人少拿，但最终每个人完成的"拼图"总和是一样的。

### 2. 分布式指令集（Distributed Instruction Set）

HAP 定义了一套"分布式指令"，类似于 CPU 的汇编语言，但专门用于描述多 GPU 之间的计算和通信：

```python
# 伪代码：分布式指令集示例
# 在单个 GPU 上：
result = matmul(A, B)           # 矩阵乘法

# 在 HAP 的分布式指令集中，变成：
shard_result = SHARD_MATMUL(A, B, ratio=[0.4, 0.4, 0.2])
# 意思是：A100(0号)拿40%的活，A100(1号)拿40%，T4(2号)拿20%
# 然后自动插入通信指令
COMM_ALLREDUCE(shard_result)
```

### 3. A* 搜索算法

A* 是一种智能搜索算法，类似于导航软件找最短路径。它用"估计剩余距离 + 已走距离"来决定先探索哪个方向。

日常类比：在迷宫里找出口。BFS（广度优先）是"一层一层探索所有可能"，而 A* 是"先看哪个方向最接近出口"。在 HAP 中，搜索空间是"所有可能的模型分割方案"，代价函数是"训练一轮需要的时间"。

```python
# 伪代码：A* 搜索过程示意
open_set = PriorityQueue()
open_set.push(start_state, cost=0 + estimate(start))

while open_set not empty:
    current = open_set.pop()        # 取总代价最小的状态
    if is_optimal(current):
        return current              # 找到最优解！
    
    for next_state in expand(current):  # 探索所有可能的分割方式
        new_cost = current.cost + actual_cost(next_state)
        priority = new_cost + estimate(next_state)
        open_set.push(next_state, priority)
```

### 4. 线性规划求最优分片比例

一旦确定了模型怎么切（哪个张量在哪个 GPU 上），下一步就是算"具体切多少"。HAP 把它建模成线性规划（LP）问题：

```
目标：最小化总训练时间 = max(每个 GPU 的计算+通信时间)

约束：
  - 每个 GPU 上的分片比例之和 = 1（不能少分也不能多分）
  - 分片比例 >= 0（不能是负数）
  - 通信量 <= 网络带宽

求解：使用标准 LP 求解器得到最优的 [0.4, 0.4, 0.2] 这样的比例
```

## 代码示例

### 示例 1：HAP 的输入与输出

假设你有一个 7B 参数的 Transformer 模型，集群有 2 张 A100 和 2 张 T4：

```python
# HAP 的输入：模型定义 + 集群拓扑
cluster = {
    "devices": [
        {"id": 0, "type": "A100", "compute": 312, "memory": 80},   # TFLOPS, GB
        {"id": 1, "type": "A100", "compute": 312, "memory": 80},
        {"id": 2, "type": "T4",    "compute": 84,  "memory": 16},
        {"id": 3, "type": "T4",    "compute": 84,  "memory": 16},
    ],
    "bandwidth": 25,  # GB/s (NVSwitch)
}

model = GPT2Like(layers=32, hidden=4096, heads=32)
```

HAP 运行后自动输出最优分割方案：

```python
# HAP 的输出：最优分片方案
{
    "embedding":   {"device": 0, "ratio": 1.0},          # 嵌入层全放 A100(0)
    "layer_0":     {"device": 0, "ratio": 0.35},        # 第 0 层：35% 在 A100(0)
                   {"device": 1, "ratio": 0.35},         #              35% 在 A100(1)
                   {"device": 2, "ratio": 0.15},         #              15% 在 T4(2)
                   {"device": 3, "ratio": 0.15},         #              15% 在 T4(3)
    "layer_1":     {"device": 0, "ratio": 0.33},
                   {"device": 1, "ratio": 0.33},
                   {"device": 2, "ratio": 0.17},
                   {"device": 3, "ratio": 0.17},
    # ... 第 2-31 层同理
    "communication": {
        "strategy": "tree_allreduce",    # 自动选择的通信原语
        "broadcast_factor": 0.5,         # 因子广播技术参数
    }
}
```

注意：A100 获得了大约 T4 的两倍计算量，这和它们的算力比（312:84 ≈ 3.7:1）大致成比例，而不是简单的 25%/25%/25%/25%。

### 示例 2：HAP 生成的分布式程序

HAP 把模型训练"编译"成一段在分布式指令集上的程序：

```python
# 伪代码：HAP 生成的分布式训练程序（简化版）

def hap_distributed_forward(x):
    # 嵌入层
    x = EMBEDDING(x, shard_on=0)            # 全放在 device 0
    
    for layer_id in range(32):
        # 获取当前层的分片方案
        ratios = get_shard_ratios(layer_id)  # 如 [0.35, 0.35, 0.15, 0.15]
        
        # 自注意力计算：按张量维度分片
        q, k, v = SPLIT_ATTENTION(x, ratios)
        
        # 各 GPU 独立计算注意力
        scores = MATMUL(q, k.T, ratios)
        attn = SOFTMAX(scores, ratios)
        output = MATMUL(attn, v, ratios)
        
        # 通信：All-Reduce 对齐结果
        output = ALL_REDUCE(output, ratios, method="tree_allreduce")
        
        # 前馈网络
        ff = RELU(MATMUL(output, W1, ratios), ratios)
        ff = MATMUL(ff, W2, ratios)
        ff = ALL_REDUCE(ff, ratios, method="tree_allreduce")
        
        # 残差连接 + 层归一化
        x = LAYER_NORM(x + ff, ratios)
    
    # 输出层
    logits = SOFTMAX(LINEAR(x, W_out), ratios=[1.0, 0, 0, 0])
    return logits

def hap_backward(logits, labels):
    # 反向传播同理，每个算子按分片方案执行
    # 梯度通过 All-Reduce 同步
    loss = CROSS_ENTROPY(logits, labels)
    grads = BACKWARD(loss)
    ALL_REDUCE(grads, method="tree_allreduce")
    return grads
```

关键观察：
- 同一个 `MATMUL` 操作，在不同 GPU 上的数据量不同（由 ratios 决定）
- 通信操作 `ALL_REDUCE` 是 HAP 自动插入的，程序员不需要手动管理
- 通信方式（tree_allreduce vs ring_allreduce）由 HAP 根据集群带宽自动选择

## HAP 的技术贡献总结

| 贡献 | 说明 |
|------|------|
| 程序综合视角 | 首次将模型分割建模为程序综合问题，用 A* 搜索自动探索解空间 |
| 线性规划分片 | 将分片比例推导建模为 LP 问题，保证理论最优 |
| 通信优化集成 | 自动选择集体通信原语（All-Reduce 等），结合因子广播技术 |
| 实验结果 | 在异构集群上最高达到 2.41 倍加速 |

## 学习要点回顾

1. **为什么需要 HAP**：异构 GPU 集群中，简单平均分摊导致性能浪费
2. **核心创新**：把"模型怎么切"变成"自动生成最优程序"
3. **A* 搜索**：智能探索分割方案空间，找到成本最低的
4. **线性规划**：精确计算每个 GPU 该分多少活
5. **通信优化**：自动选择最优的 GPU 间通信方式

## 延伸阅读

- SPMD 并行模式：DeepSpeed、Megatron-LM 的同类型工作
- 分布式训练中的 All-Reduce：Ring-AllReduce、Tree-AllReduce
- 程序综合领域：Cobra、Unity 等编译器工作
