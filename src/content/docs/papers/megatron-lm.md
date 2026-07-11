---
title: Megatron-LM — NVIDIA 大规模训练框架
来源: 'Shoeybi et al., "Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism", 2019'
日期: 2026-05-29
分类: NLP / 分布式训练
难度: 中级
---

## 是什么

Megatron-LM 是 NVIDIA 2019 年发布的一套**把超大语言模型切到很多张 GPU 上协同训练**的框架。核心招式叫 **Tensor Parallelism**（TP，张量并行）。

日常类比：单张 GPU 就像一个工人，要他独自造一辆车——零件太多塞不下车间，根本动不了手。Megatron 的做法是**把每个零件切给不同工人，每人只负责一片，最后拼起来还是一辆完整的车**。

具体怎么「切」？Transformer 层里有大矩阵 `Y = X × W`：

- 把 W **按列切**给 N 张卡，每张算自己那几列
- 下一层把权重 **按行切**，每张算一个部分和
- 用一次 all-reduce 把部分和加起来 → 拿到完整结果

约 8B 参数的模型在单张 V100（32GB）上塞不下；切到 8 张 V100 上每张只占约 1/8 权重，才能开训。论文验证的是这条「切开还能高效」的路，而不是又一个新网络结构。

## 为什么重要

不知道 Megatron-LM，下面这些大模型故事都讲不通：

- **Megatron-Turing NLG 530B** 等公开超大密集模型的训练叙事——它是张量并行的工业标杆
- 2021 年 NVIDIA + 微软在 **4480 张 A100** 上训出 530B，用的就是这套分布式栈
- 它和 [[deepspeed-zero]] **互补**：Megatron 切模型权重，ZeRO 切优化器状态和梯度，叠起来才扛得住更大规模
- 2023 年 NVIDIA 把核心算法抽成 **Megatron-Core**，成为 NeMo / TensorRT-LLM 等框架的地基

简单说——**2019 之后多数「超大模型怎么训」的工程栈，都把这篇当作重要起点之一**（OpenAI / Meta 等内部实现未必原样采用，但 TP 思路被广泛借鉴）。

## 核心要点

Megatron 提供三种「切」的方式，组合起来用：

1. **Tensor Parallelism（张量并行）**：把单个 Linear 层的权重矩阵切到多卡。Attention 的 Q/K/V 按列切，输出投影按行切，串接成一对，一次 all-reduce 就能闭环。这是 2019 年论文的核心贡献。
2. **Pipeline Parallelism（流水线并行）**：不同 Transformer 层放不同 GPU——前几层在卡 0、中间在卡 1、后面在卡 2。层之间只在边界传激活。这招不是 Megatron 原创（GPipe 2018 已有），但它把 PP 和 TP 组成了「3D 并行」。
3. **Sequence Parallelism（序列并行）**：2021 v2 加的——把 LayerNorm 和 Dropout 的**序列维度**也切了，省下激活值内存。是对 TP 的补丁，因为 TP 切不动这些归一化模块。

最常见的组合是 **TP × PP × DP**（数据并行）三层叠，工业上叫「3D 并行」。读配置时先问三句话：矩阵怎么切、层怎么切、数据怎么切。

把三种切法记成一句话：**TP 切宽、PP 切深、DP 切数据**。配置单上三个数字乘起来，才是总并行度；只报其中一个，别人无法复现你的吞吐。

## 实践案例

### 案例 1：列并行 + 行并行串接（最小步骤）

```text
# 目标：多卡计算 Y = X @ W，再接下一层
# 1) 把 W 按列切成 W1..Wn，每卡算 Y_i = X @ W_i   （forward 无通信）
# 2) 下一层把权重按行切；每卡用切开的激活算部分和
# 3) all-reduce 把部分和加总 → 各卡得到完整输出
# backward：列并行算输入梯度时再 all-reduce 一次
```

为什么列切后要接行切？列并行的输出**天然是切开的**，正好当行并行的输入。一个 FFN 从入到出，forward+backward **大约各一次** all-reduce——这是 8 卡上仍能报到约 76% weak-scaling 效率的关键。注意：论文里的 76% 是 **weak scaling**（卡与模型一起变大）；固定模型只加卡时，数字通常更难看。
逐步对照时，建议在 2 卡上先跑通「列切→行切→all-reduce」玩具 Linear，再上到 8 卡真实 Transformer。先验证通信次数，再追求吞吐。


### 案例 2：Megatron-Turing NLG 530B 的 3D 并行

NVIDIA + 微软 2021 合作、**4480 张 A100**：公开配置量级为 TP=8 × PP=35 × DP=16。读法：节点内用 NVLink 扛 TP；层间用 PP 切深度；剩下的卡走数据并行。这是早期公开的 500B+ 密集模型训练栈之一。

### 案例 3：选 TP/PP 时先写一张「通信账本」

```text
假设单节点 8 卡、模型 hidden=8192：
1. 设 TP=8（hidden 能被 8 整除）
2. 层数多再设 PP，使每段层数接近
3. 剩下的卡给 DP
4. 估算：TP all-reduce 是否仍在 NVLink 域内？跨节点则优先降 TP、升 PP/DP
```

开源生态里不少大模型训练 pipeline 从 Megatron-LM fork 或吸收其 TP 思路；对照时先看并行三维，再看具体仓库名。微批（micro-batch）太少会放大流水线气泡，太多又吃显存——这是 PP 侧最常见的第二张账本。
同一公式也解释了为什么 hidden 总爱选 4096/8192：不是审美，是为了让 TP 整除且各卡负载对称。


## 踩过的坑

1. **bias 别加两次**：行并行的 bias 只在 rank 0 加，否则每卡各加一份，loss 怪但不崩，定位极难。
2. **dropout 的 RNG 要同步**：Megatron 用 `tensor model parallel rng tracker`；不同步会让梯度 silently 错。
3. **跨节点别硬上 TP**：NVLink 域内 TP=8 还行，跨 InfiniBand 常被通信吃掉——优先 PP+DP。
4. **checkpoint 不能直接换 TP size**：TP=8 权重不能裸加载到 TP=4，需要专门转换工具。

补充一条读论文口径：Megatron 原文强调的高效数字，多在单节点 NVLink 域内成立。把同一套 TP 配置原样搬到跨节点，再抱怨「论文数字骗人」，通常是场景换了。

## 适用 vs 不适用

**适用**：

- 训练约 8B 以上、单卡装不下的 Transformer
- 单节点 8 卡且 NVLink 带宽充足
- hidden size 能被 TP world size 整除（如 4096/8192）
- 预训练为主、需要可组合的 3D 并行配方

**不适用**：

- 1B 以下小模型——DP + 激活重算通常更简单
- 强制跨节点 TP（带宽不够时稳定亏损）
- 非 Transformer、或维度不能整除的「异形」模型
- 以微调为主、更想要 HuggingFace + FSDP 灵活栈时

## 历史小故事（可跳过）

- **2019（v1）**：Shoeybi 团队提出 TP 列+行串接，8.3B GPT-2 验证约 76% weak scaling
- **2021（v2）**：加入 Sequence Parallelism，补上 LayerNorm/Dropout 的序列维切分
- **2023**：核心算法抽成 **Megatron-Core** 可复用库
- **2024+**：NeMo（训练）与 TensorRT-LLM（推理）集成同一内核家族

技术演进很清楚：先证明「能切开训」，再补序列维显存，最后把原语库化给别人复用。

## 学到什么

1. **大矩阵可分块**是整个体系的支点——线性代数旧知识，工程化才是贡献
2. **算法会反约束架构**：TP 要求维度整除，推动 hidden 选「漂亮数」
3. **通信账本决定上限**：看不见的 backward all-reduce 常被漏算
4. **承认单节点 TP 局限**，反而给 ZeRO / FSDP / 更强 PP 留出空间
5. **读 scaling 数字先问 weak 还是 strong**——口径不同，结论可以差一截

若你正在选框架：预训练、要极致 TP/PP 组合，Megatron 家族仍是默认候选；以微调、异构实验为主，先评估 HuggingFace + FSDP 是否够用，再决定要不要上完整 3D 并行。

## 延伸阅读

- 论文：https://arxiv.org/abs/1909.08053（先读 Tensor Parallel 章节）
- 代码：https://github.com/NVIDIA/Megatron-LM
- 后续：Megatron-Turing NLG 530B（2021）讲 3D 并行扩到千卡
- NeMo 并行文档：三维并行如何配置
- [[deepspeed-zero]] —— 切优化器/梯度的互补路线
- [[megatron-core-moe-2026]] —— 同一家族上的 MoE 系统报告

## 关联

- [[transformer]] —— Megatron 切分的基本对象
- [[deepspeed-zero]] —— DP 维显存切分，可与 TP/PP 叠加
- [[gpt-3]] —— 同期超大密集模型训练语境
- [[megatron-core-moe-2026]] —— MoE 训练系统后续
- [[gshard-2020]] —— 另一条大规模模型并行叙事
- [[nvlink-nvswitch-2018]] —— 机内带宽决定 TP 是否划算

### 配置口诀（可跳过细读）

- 先保证 hidden % TP == 0，再谈效率。
- TP 优先钉在 NVLink 域；跨节点预算留给 PP/DP。
- PP 段数与 micro-batch 一起调，只调一个常会顾此失彼。
- 看到漂亮 scaling 曲线，先问是 weak 还是 strong。
- checkpoint 与 TP size 绑定；改并行度前先准备权重转换。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[deepspeed-zero]] —— DeepSpeed ZeRO — 微软优化大模型训练显存
- [[distserve]] —— DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑
- [[fsdp-2023]] —— PyTorch FSDP — 把大模型切成 N 份分到 N 张卡
- [[gpipe-2019]] —— GPipe — micro-batch 流水线让 GPU 排成生产线
- [[gpudirect-rdma-2014]] —— GPUDirect RDMA — 让网卡直接读写 GPU 显存
- [[megatron-core-moe-2026]] —— Megatron-Core MoE — 大规模稀疏专家并行实践
- [[paged-attention]] —— PagedAttention — 把 KV cache 当虚拟内存页来管理
- [[pipedream-2019]] —— PipeDream — 1F1B 调度让流水线工位别空等
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律
- [[papers/vllm]] —— vLLM — 把操作系统的分页搬进 GPU KV cache
- [[zero-2020]] —— ZeRO 2020 — 把训练状态切成 N 份让万亿参数成为可能
