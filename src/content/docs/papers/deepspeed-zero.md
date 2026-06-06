---
title: DeepSpeed ZeRO — 微软优化大模型训练显存
来源: 'Rajbhandari et al., "ZeRO: Memory Optimizations Toward Training Trillion Parameter Models", SC 2020'
日期: 2026-05-29
子分类: 模型与训练
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

DeepSpeed ZeRO（**Zero Redundancy Optimizer**）是微软 2019 年开源的一套**让模型训练时多 GPU 之间不再重复存数据**的技术。日常类比：以前每张 GPU 都存一份完整的"作业本"（参数 + 梯度 + 优化器状态）；ZeRO 让每张只存 1/N 份，要用时再问别张 GPU 借。

**结果**：训练一个 7B（70 亿参数）的模型，原本需要 24GB+ 的单卡显存，开了 ZeRO 之后 8GB 就能微调。

它和 [[megatron-lm]] 是分布式训练的两大基础设施——Megatron 切的是"**计算**"（一层算不完拆给多张卡算），ZeRO 切的是"**状态**"（一份数据不用 N 张卡都存）。

## 为什么重要

不理解 ZeRO，下面这些事都没法解释：

- 为什么 Llama 2 / Mistral / Qwen 的官方微调脚本**默认**用 DeepSpeed
- 为什么 HuggingFace 的 `accelerate config` 选 DeepSpeed 后能在 4 张 24GB 显卡上微调 7B 模型（不开 ZeRO 至少要 80GB × 4）
- 为什么 PyTorch 2.0 后官方推 **FSDP**——它就是 ZeRO 思想的官方版重写
- 为什么训练 530B 参数的 Megatron-Turing NLG 用的是 "Megatron-DeepSpeed"——两套互补技术拼起来

## 核心要点

ZeRO 把训练时占内存的三类东西**逐级切分**：

1. **Stage 1：切优化器状态（4 倍节省）**
   - 模型用 Adam 训练时，每个参数都要额外存 momentum 和 variance（共 12 字节/参数）
   - Stage 1 让每张 GPU 只保留 1/N 份的 momentum + variance
   - 类比：4 个学生一起做作业，每人只负责保管 1/4 题目的"做题历史记录"

2. **Stage 2：切梯度（8 倍节省）**
   - 在 Stage 1 基础上把梯度（gradient）也切掉
   - 关键技巧：用 **reduce-scatter** 替代 **all-reduce**，每张卡只拿到自己负责那段的梯度
   - 类比：4 个学生一起改卷，传统做法是每人都拿到 4 份完整改完的成绩；reduce-scatter 让每人只拿自己那 1 份

3. **Stage 3：切参数（N 倍节省，N = GPU 数）**
   - 最激进：连参数本身也切了，每张卡只保留 1/N 个参数
   - forward / backward 时按层动态 all-gather（算这层时把参数借齐，算完立刻还回去）
   - 类比：每人只背 1/4 课本，上课讲到哪一页就传给谁

4. **ZeRO-Infinity（offload 到 CPU 内存 / NVMe SSD）**
   - 把切出来的状态进一步搬到 CPU 内存或硬盘
   - 单张 GPU 也能训上百亿模型，代价是速度变慢（PCIe / NVMe 带宽比 GPU 显存慢一两个数量级）

## 实践案例

### 案例 1：Llama 7B 微调

不开 ZeRO：每张卡至少需要 80GB（fp16 训练 + Adam 优化器 + 一些缓冲），得 A100 80GB × 4 才能跑。

开 ZeRO Stage 3：4 张 24GB 的 RTX 3090 / 4090 也能跑通——内存被 4 张卡"摊薄"了。

```json
// DeepSpeed 配置（ds_config.json）
{
  "fp16": { "enabled": true },
  "zero_optimization": {
    "stage": 3,
    "offload_optimizer": { "device": "cpu" }
  }
}
```

### 案例 2：HuggingFace accelerate 一行启用

```bash
accelerate config       # 交互式选 DeepSpeed → ZeRO Stage 3
accelerate launch train.py
```

这是当下用得最多的方式——`accelerate` 把底层 DeepSpeed / FSDP 都封装起来，用户改一行配置就切换并行策略。

### 案例 3：和 Megatron 组合训超大模型

微软 + NVIDIA 联合训 530B 参数的 Megatron-Turing NLG，用的是 **Megatron-DeepSpeed**：

- Megatron 负责切**计算**（tensor parallelism 把一层 attention 拆给多张卡算）
- DeepSpeed 负责切**状态**（ZeRO 把跨副本的状态分摊）
- 二者正交，可以叠加用上

这就是后来 "3D Parallelism" 概念的起点——Data × Tensor × Pipeline × ZeRO 四维组合。

## 踩过的坑

1. **小模型上 Stage 3 反而更慢**：模型 < 1B 时本来就不大，多一次 all-gather 的通信开销 > 内存节省的收益。这种时候用 Stage 1 或纯 DDP 才对。

2. **ZeRO 不解决 activation 内存**：训练时 activation（前向保留的中间结果）常占总内存 40%+，ZeRO 完全切不动这块，要配合 **gradient checkpointing** 一起用。

3. **跨 node 比单 node 慢得多**：ZeRO 频繁的 all-gather 在单 node NVLink（900GB/s）上很快，跨 node InfiniBand（约 25GB/s）就成瓶颈。1024 GPU 训练时 Stage 3 的通信占比能到 30%+。

4. **配置参数多，新人容易调爆**：stage / offload / bucket_size / overlap_comm 一堆旋钮，调不好可能比 DDP 还慢。这也是 PyTorch 推出 FSDP（更易用版 Stage 3）来收编社区的原因之一。

## 适用 vs 不适用场景

**适用**：
- 单卡装不下完整模型，又有多张 GPU 可用（典型场景：4-8 张消费级卡微调 7B-70B 模型）
- 用 Adam / AdamW 优化器（OS 是大头，切了收益最高）
- 训练框架是 PyTorch / HuggingFace Transformers 生态（DeepSpeed / FSDP 集成好）

**不适用**：
- 单卡能装下整个模型（< 1B 参数）→ 直接 DDP 更快
- 用 SGD（无 momentum）→ Stage 1 收益接近零
- 推理场景 → ZeRO 是训练时显存优化，推理用 quantization / vLLM 等其他思路
- 极端跨 node 拓扑（千卡以上）→ 通信占比过高，需要混合 TP / PP 才能稳住吞吐

## 历史小故事（可跳过）

- **2019 年 10 月**：微软 DeepSpeed 团队挂出 ZeRO 论文，定义三个 stage 的切分策略
- **2020 年**：在超算顶会 **SC 2020** 正式发表，DeepSpeed 开源到 GitHub
- **2021 年**：同一作者发表 **ZeRO-Infinity**，加入 NVMe SSD offload，让单张 V100 能训 1T 参数模型（速度极慢但能跑）
- **2022 年**：发表 **ZeRO++**，针对量化通信和 hierarchical partitioning 进一步降通信开销
- **2022-2024 年**：PyTorch 推出 **FSDP**（Fully Sharded Data Parallel），本质是 Stage 3 的官方原生实现，逐渐成为新项目的默认选择
- **2024 年**：FSDP 进入 PyTorch 主线，ZeRO 思想成事实标准

## 学到什么

1. **"复制是必须的"是个可挑战的假设**——DDP 让每张卡都存一份完整状态是工程惯例，不是物理定律。规模一大，复制本身就是瓶颈。
2. **all-reduce = reduce-scatter + all-gather** 这个等式总成立——把一个 collective 操作拆成两步，可以"白拿"一份内存优化。
3. **工程化的胜利**：ZeRO 没发明新算法，只是把"切分"贯彻到优化器状态、梯度、参数三个层次——这种"已有技术的极致组合"反而比新算法更有影响力。
4. **通信换内存**是分布式训练的核心 trade-off——没有银弹，只有不同硬件代际下不同的最优配置。

## 延伸阅读

- 论文 PDF：[ZeRO: Memory Optimizations Toward Training Trillion Parameter Models](https://arxiv.org/abs/1910.02054)（arXiv 1910.02054，14 页，可读性高）
- 微软官方博客：[DeepSpeed: Extreme-scale model training for everyone](https://www.microsoft.com/en-us/research/blog/deepspeed-extreme-scale-model-training-for-everyone/)（带动画图解三个 stage）
- HuggingFace 教程：[DeepSpeed Integration](https://huggingface.co/docs/transformers/main/deepspeed)（最快上手路径）
- PyTorch FSDP 官方教程：[Getting Started with FSDP](https://pytorch.org/tutorials/intermediate/FSDP_tutorial.html)（学完 ZeRO 看 FSDP 顺水推舟）
- [[megatron-lm]] —— 切计算的姐妹篇，常和 ZeRO 一起用
- [[transformer]] —— ZeRO 服务的主要训练对象

## 关联

- [[megatron-lm]] —— Megatron 切计算 / ZeRO 切状态，正交互补
- [[transformer]] —— ZeRO 的训练对象绝大多数是 Transformer 系列
- [[adam-optimizer]] —— ZeRO 的内存分析依赖 Adam 的 OS 占大头这一事实

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[fsdp-2023]] —— PyTorch FSDP — 把大模型切成 N 份分到 N 张卡
- [[gpipe-2019]] —— GPipe — micro-batch 流水线让 GPU 排成生产线
- [[pipedream-2019]] —— PipeDream — 1F1B 调度让流水线工位别空等
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律
- [[tesla-architecture-2008]] —— NVIDIA Tesla — 把显卡改造成通用并行计算机

