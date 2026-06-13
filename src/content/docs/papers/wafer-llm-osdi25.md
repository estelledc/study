---
title: WaferLLM: Large Language Model Inference at Wafer Scale
来源: https://www.usenix.org/conference/osdi25/presentation/he
日期: 2026-06-13
分类: 基础设施
子分类: 大规模系统
provenance: pipeline-v3
---

# WaferLLM: 晶圆级大语言模型推理

## 一、日常类比：从"一个大厨房"到"一整块砧板"

想象你在做一顿超级大餐，需要切很多菜。

**传统 GPU 的做法**：有一个大厨房（GPU），里面有很多厨师（计算核心），所有厨师共用一个很大的冰箱（显存）。厨师之间要取调料时，得跑到同一个冰箱前拿东西——冰箱就在眼前，所以跑得很快。但当菜非常大、厨师非常多的时候，冰箱的门就变成了瓶颈：几十个厨师同时挤在冰箱前排队，谁也干不快。

**晶圆级芯片（Cerebras WSE）的做法**：不是"一个大厨房"，而是把**一整块硅晶圆**（约 850 平方厘米）都变成了计算芯片。想象一下——不是在一个厨房里有厨师，而是**整张砧板本身就是刀**，每一小块区域都是一把刀。这些"刀"之间用非常短的通道连接，数据不需要跑很远。整个晶圆的总显存达到数十 GB，带宽达到 PB/s 级别。

**WaferLLM 要解决的核心问题**：现有的 LLM 推理系统（如 vLLM、SGLang）是为 GPU 设计的，假设所有核心共享一块内存。但在晶圆级芯片上，内存是**分布式的**——每个核心有自己的局部内存，邻居之间才能快速通信。就像你不能用"大家挤在同一个冰箱前"的方式，来指挥一整砧板上的刀。

## 二、核心概念

### 2.1 晶圆级芯片 vs GPU

| 特性 | NVIDIA A100 GPU | Cerebras WSE-2 |
|------|----------------|----------------|
| 计算核心数 | ~6000 | ~400,000 |
| 芯片间内存 | 共享（HBM） | 分布式片上 SRAM |
| 总显存 | 40-80 GB | 21 GB（分布在核心上） |
| 内存带宽 | ~2 TB/s | ~21 PB/s（片上） |
| 核心间通信 | 通过共享内存 | 通过邻居直接通信 |

关键区别：GPU 的核心通过**共享总线**访问内存；晶圆级芯片的核心通过**网格（Mesh）拓扑**只和邻居通信。

### 2.2 PLMR 模型（"Plummer" 模型）

PLMR = **P**rocessor（处理器）+ **L**ink（链路）+ **M**emory（内存）+ **R**outing（路由）。

这是一个硬件建模框架，用来描述晶圆级芯片的四个维度：
- **Processor**：每个 AI 核心的计算能力
- **Link**：核心之间通道的带宽和延迟
- **Memory**：每个核心的局部 SRAM 容量
- **Routing**：数据在网格中如何从起点走到终点

传统 GPU 模型不需要 Link 和 Routing 维度，因为 GPU 核心通过共享内存通信。但晶圆级芯片必须考虑"数据走哪条路、花多少时间"。

### 2.3 LLM 推理的两个阶段

LLM 推理分为两个阶段：

1. **Prefill（预填充）**：一次性处理用户的完整输入prompt。本质是矩阵乘法（GEMM：General Matrix Multiply）。
2. **Decode（解码）**：逐个 token 地生成回复。本质是矩阵向量乘法（GEMV：General Matrix-Vector Multiply）。

在 Decode 阶段，每次只生成一个 token，所以是"一个向量 × 大矩阵"的计算。这个模式在传统 GPU 上已经效率不高了，在晶圆级芯片上更需要新的优化方案。

## 三、WaferLLM 的三个关键技术

### 3.1 Wafer-Scale LLM Parallelism（晶圆级 LLM 并行）

把一个大模型"切块"，分散到 40 万个核心上同时计算。

类比：一个人搬 100 箱书很慢；40 万人每人搬一箱，同时开始——瞬间搬完。

关键挑战：切完之后，数据怎么在各个核心之间分发？计算结果怎么汇总？这需要精心设计通信路由。

### 3.2 MeshGEMM：晶圆级矩阵乘法

GEMM 是 LLM 中 Prefill 阶段的核心运算：C = A × B + C。

传统 GPU 上的做法是把矩阵切成分块（tiling），每个核心算一小块。但晶圆级芯片的核心数太多、分布太广，不能简单套用 GPU 的方法。

WaferLLM 提出了一种基于 **SUMMA 算法**（Scalable Unified Matrix Multiplication Algorithm）的分布式矩阵乘法方案：

```python
# MeshGEMM 伪代码：矩阵分块并行乘法
# 假设有 R 行 × C 列 个处理单元网格

def mesh_gemm(A, B, R, C, rank_i, rank_j):
    """
    rank_i, rank_j: 当前处理单元在网格中的坐标 (i, j)
    A: 输入矩阵的第 i 行块
    B: 输入矩阵的第 j 列块
    """
    # 第 1 步：列方向广播 A 的块
    # 每一行的所有 PE 共享同一个 A 块
    for step in range(C):
        # 当前列的 PE 把 A 块广播到整行
        if step == rank_j:
            broadcast_A_row(A[rank_i])
        sync_barrier()

        # 第 2 步：行方向广播 B 的块
        # 每一列的所有 PE 共享同一个 B 块
        for step in range(R):
            if step == rank_i:
                broadcast_B_col(B[rank_j])
            sync_barrier()

            # 第 3 步：每个 PE 计算一小块结果
            local_C[rank_i][rank_j] += A_local @ B_local

    return local_C
```

核心思路：利用网格的二维结构，让数据沿行和列分别广播，每个核心只计算自己负责的那一小块乘积。

### 3.3 MeshGEMV：晶圆级矩阵向量乘法

GEMV 是 Decode 阶段的核心运算：y = W × x + y。其中 W 是巨大的权重矩阵，x 是当前输入的向量。

这是 WaferLLM 的亮点。传统 GPU 上，GEMV 的访存开销远大于计算开销（因为向量太小，核心大部分时间在等数据）。WaferLLM 提出：

```python
# MeshGEMV 伪代码：向量-矩阵向量乘的分布式实现
# 权重矩阵 W 按行分布在 R 行 PE 上
# 输入向量 x 在所有 PE 上都有副本

def mesh_gemv(W_rows, x, R, C, rank_i, rank_j):
    """
    W_rows: 当前 PE 负责的权重矩阵行块
    x: 输入向量（全局副本）
    R: PE 网格的行数
    C: PE 网格的列数
    """
    # 第 1 步：每个 PE 计算本地 dot product
    local_result = W_rows[rank_j] @ x

    # 第 2 步：沿行方向归约求和（All-Reduce 的行部分）
    # 把同一列不同行的结果累加到一起
    row_sum = all_reduce_sum(local_result, axis='row')

    # 第 3 步：沿列方向归约求和
    final_result = all_reduce_sum(row_sum, axis='col')

    return final_result
```

核心思路：先用 SIMD 方式在每个 PE 内部算 dot product，然后通过网格的二维归约把所有结果加起来。利用晶圆级芯片的 PB/s 级片上带宽，这个归约过程非常快。

### 3.4 Prefill 和 Decode 的统一调度

WaferLLM 还需要解决一个调度问题：哪些模型层放在哪些核心上？数据怎么在层与层之间流转？

系统采用了一种**分层并行策略**：
- 模型的不同层分配到不同的核心区域
- 层间数据通过网格路由传递
- 利用 PLMR 模型预测最优的数据布局

## 四、性能数据

在 Cerebras WSE-2 上运行 WaferLLM 的结果：

- **加速器利用率**：比现有方法最高提升 **200 倍**
- **GEMV 运算速度**：比 NVIDIA A100 快 **606 倍**
- **GEMV 能效**：比 A100 高出 **16 倍**
- **完整 LLM 推理**：比 A100 GPU 集群（运行 SGLang/vLLM）快 **10-20 倍**

这些数字说明：晶圆级芯片不是"稍微好一点"，而是"完全不在一个量级"。

## 五、关键启发

1. **架构决定设计**。你不能把为 GPU 写的推理引擎直接搬到晶圆级芯片上——就像你不能把自行车的传动系统装到飞机上。不同的硬件拓扑需要不同的算法。

2. **分布式内存不是"慢一点的共享内存"**。在 GPU 上，共享内存对所有核心是一样的；在晶圆级芯片上，"离你近"和"离你远"的数据速度差异巨大。算法设计必须尊重这种非均匀性。

3. **Decode 阶段是瓶颈**。LLM 推理的大部分时间花在逐个生成 token 的 Decode 阶段。谁能把 GEMV 算得更快，谁就掌握了推理加速的关键。

4. **PLMR 模型的通用性**。这种"处理器-链路-内存-路由"的四维建模方法，理论上可以适配任何新型加速器架构。

## 六、思考题

1. 如果 GEMV 快了 606 倍，那整个 LLM 推理为什么只快了 10-20 倍？（提示：想一想 Prefill 阶段的 GEMM 和其他开销）
2. 晶圆级芯片的 40 万个核心中，如果 1% 的核心在制造过程中有缺陷，系统怎么处理？（提示：WaferLLM 是否支持失效核心？论文中提到容错了吗？）
3. 假设你是一个 LLM 推理系统的工程师，你会如何把 WaferLLM 的设计思路迁移到当前的 GPU 架构上？哪些优化是通用的，哪些是晶圆级特有的？

## 七、延伸阅读

- 论文原文：https://www.usenix.org/conference/osdi25/presentation/he
- 开源代码：https://github.com/MeshInfra/WaferLLM
- Cerebras WSE-3 技术文档：https://www.cerebras.ai/developers/sdk-request
- 相关论文：vLLM、SGLang 等 LLM 推理框架的架构对比
