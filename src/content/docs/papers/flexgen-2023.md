---
title: FlexGen — 把 175B 大模型塞进一张 16GB 显卡
来源: https://arxiv.org/abs/2303.06865
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 是什么

FlexGen（**Flex**ible **Gen**eration Engine）是斯坦福、伯克利、CMU、耶鲁、Together AI、Yandex、ETH Zurich 等多机构合作 2023 年 3 月提出的**单卡高吞吐 LLM 推理系统**。它能在一张 16GB 消费级 GPU（NVIDIA T4）上运行 OPT-30B 甚至 OPT-175B 模型。

日常类比：大模型推理就像一场宴会——GPU 的显存是餐桌，模型权重、中间计算结果、KV 缓存是满桌菜。以前只有大桌子（多张 A100）才能放下；FlexGen 的思路是**用 CPU 内存和 SSD 当餐边柜**，做菜时只把当前要用的菜放到桌上，做完立刻收回去，再取下一道。通过智能调度，餐桌虽小说能请很多桌客人同时吃饭（大 batch），总吞吐量反而更高。

## 为什么重要

- 首次让 **OPT-175B 在单卡 T4 上达到 1 token/s** 级别吞吐——之前几乎不可能
- 面向**批处理优先**场景（benchmark、数据抽取、表单处理），延迟可以慢，但吞吐必须高
- 通过线性规划自动搜索最优张量放置策略，用户只需给约束条件
- 权重 + KV 缓存压缩到 4-bit，几乎不掉精度
- 让企业用 **$0.5/小时 的 T4 替代 $5/小时 的 A100** 做离线推理——成本降 10 倍

## 核心要点

FlexGen 的核心思想可以拆成四块：

### 1. 三级存储分层：GPU ↔ CPU ↔ Disk

模型张量（权重、激活、KV 缓存）不再只驻留 GPU，而是可以**分布在三个存储层**：

- **GPU**：当前层计算需要活跃的数据
- **CPU 内存**：暂存暂时不用的权重和缓存（比 GPU 大得多，16GB GPU vs 200GB+ CPU 内存）
- **Disk（SSD）**：存放几乎不访问的权重，按需读取

关键问题：**哪些放哪层？** FlexGen 用线性规划自动求解最优放置方案，输入是 GPU/CPU/磁盘容量约束，输出是每个张量的存储位置。

### 2. 块级调度（Block Scheduling）

这是 FlexGen 相比之前系统（如 Alpa、DeepSpeed）的**核心创新**。

之前的 offloading 系统用**逐行调度**——算完一层再把权重从 CPU 搬运下来，计算完又搬回去。大量时间浪费在 I/O 上。

FlexGen 改用**块级调度**——把输入 batch 分成多个 block，每个 block 独立计算：

```
Block 1: 搬运所需权重 → 计算 → 搬运回 CPU/Disk
Block 2: 搬运所需权重 → 计算 → 搬运回 CPU/Disk
...
```

每个 block 内部 I/O 与计算**部分重叠**（CPU→GPU 搬运时 GPU 已经在算上一个 block 的尾部），减少空闲等待。效果：I/O 效率大幅提升。

### 3. 4-bit 量化压缩

FlexGen 对两部分做 4-bit 压缩：

- **模型权重（weights）**：FP16 → INT4，显存占用降 4x
- **KV 缓存（attention cache）**：FP16 → INT4，显存占用降 4x

压缩不是简单截断，而是做**逐通道缩放（per-channel scaling）**：找到每个通道中激活值最大的绝对值作为 scale，量化时用 scale 做归一化，反量化时再乘回去。这比逐权重量化更准，且硬件友好。

论文实验显示：压缩后精度**几乎无损失**（<1% 困惑度增长）。

### 4. 延迟-吞吐的主动权衡

FlexGen 明确放弃"低延迟"目标，转向**最大化吞吐**。这意味着：

- 接受较高的单次请求延迟
- 通过**超大有效 batch size** 摊薄 I/O 开销
- OPT-30B 上可达 **batch size = 144**（CPU offloading），OPT-175B 上可达 **256**

类比：餐厅不追求每桌 5 分钟上菜（低延迟），而是追求一天能接待 500 桌（高吞吐）。

## 实践案例

### 案例 1：安装和运行 OPT-1.3B（单卡即可，无需 offloading）

```bash
pip install flexllmgen

# OPT-1.3B 只有约 2.6GB 权重，直接塞进 16GB GPU
python3 -m flexllmgen.flex_opt --model facebook/opt-1.3b
```

输出会显示 OPT-1.3B 生成的文本和 benchmark 结果。这一步不触发 offloading，因为模型太小。

### 案例 2：运行 OPT-30B（需要 CPU offloading）

```bash
# OPT-30B 权重约 60GB，远超 16GB GPU
# --percent 六个参数分别控制：
#   [权重层0在GPU%, 权重层1在CPU%, 权重在Disk%, 
#    KV缓存在GPU%, KV缓存在CPU%, KV缓存在Disk%]
python3 -m flexllmgen.flex_opt \
  --model facebook/opt-30b \
  --percent 0 100 0 0 100 0

# 解释：权重 100% 放 CPU，KV 缓存 100% 放 CPU
# 计算时按需从 CPU 搬到 GPU，算完收回
# 在 T4 + 208GB RAM 上达到 7.32 token/s（batch=144）
```

### 案例 3：运行 OPT-175B（需要磁盘 offloading）

```bash
# OPT-175B 权重约 350GB，CPU 内存也不够
# 权重全部放 SSD，KV 缓存放 CPU
python3 -m flexllmgen.flex_opt \
  --model facebook/opt-175b \
  --percent 0 0 100 0 100 0 \
  --offload-dir /path/to/ssd

# 在 T4 + 1.5TB SSD 上达到 0.69 token/s（batch=256）
# 加上 --compress-weight 可达 1.12 token/s
```

### 案例 4：通过 API 批量推理

```python
from flexllmgen import FlexLLMGen

model = FlexLLMGen(
    model_name="facebook/opt-30b",
    percent=[0, 100, 0, 0, 100, 0],  # offloading 策略
    gpu_batch_size=48,                  # 每个 GPU 的 batch
    num_gpu_batches=3,                  # 总共 144 个请求
)

# 批量生成：一次输入 144 条文本
prompts = [
    "The meaning of life is",
    "Python is a",
    # ... 142 more
]

outputs = model.generate(prompts, max_new_tokens=32, temperature=0.7)

for prompt, out in zip(prompts, outputs):
    print(f"[{prompt}] -> {out}")
```

### 案例 5：集成 HELM benchmark

```bash
pip install crfm-helm

# 在 T4 上跑 MMLU 抽象代数子场景
python3 -m flexllmgen.apps.helm_run \
  --description mmlu:model=text,subject=abstract_algebra \
  --pad-to-seq-len 512 \
  --model facebook/opt-30b \
  --percent 20 80 0 100 0 100 \
  --gpu-batch-size 48 \
  --num-gpu-batches 3 \
  --max-eval-instance 100
```

### 案例 6：`--percent` 参数的六种组合速查

```
位置:   [权重_GPU, 权重_CPU, 权重_Disk, KV_GPU, KV_CPU, KV_Disk]

全部GPU  : 100  0    0    100  0    0   → 模型必须完全塞进 GPU，最快但受限
全部CPU  : 0   100  0    0   100  0   → 通用策略，大多数场景够用
全磁盘   : 0   0   100   0   100  0   → 极端受限，175B 级别才需要
混合    : 20  80   0    100  0   0   → 热点权重留 GPU，其余上 CPU
...
约束:  权重前三项之和=100，KV 三项之和=100
```

## 核心数据对比

在 T4 (16GB) + 208GB DRAM + 1.5TB SSD 上，OPT-175B 的吞吐对比：

| 系统 | 吞吐 (token/s) | 有效 batch | 备注 |
|------|:-:|:-:|------|
| HuggingFace Accelerate (disk offload) | 0.01 | 2 | 几乎不可用 |
| DeepSpeed ZeRO-Inference (disk) | 0.01 | 1 | 同上 |
| Petals (distributed) | 0.08 | 2 | 分布式，依赖多机器 |
| **FlexGen** | **0.69** | **256** | **单卡，全部放磁盘** |
| **FlexGen + 压缩** | **1.12** | **144** | **4-bit 权重 + KV** |

OPT-30B 上 FlexGen 达到 **7.32 token/s（batch=144）**，加压缩到 **8.38 token/s（batch=512）**。

## 踩过的坑

1. **单卡 offloading 对小 batch 很慢**：FlexGen 为**大 batch 批处理**优化，单次请求延迟可能比 A100 高数十倍。如果你的场景是一次聊一句，别用它。

2. **`--percent` 需要调**：没有自动优化器（论文预告了但没发布），需要手动尝试几组策略。经验法则：模型 > CPU 容量时，权重往 Disk 放；GPU 能塞下当前层就留 GPU。

3. **SSD 必须是 NVMe**：机械硬盘的 I/O 太慢，块级调度优势荡然无存。论文实验用的 1.5TB SSD 是 NVMe 级别（~2GB/s 读）。

4. **压缩不是免费的**：INT4 量化引入的计算开销虽然小，但在 GPU 瓶颈时（如 OPT-6.7B 全放 GPU）反而可能比 FP16 慢。压缩主要在 offloading 场景获益。

5. **CPU 内存也要够**：`--percent 0 100 0` 把全部权重放 CPU 时，OPT-30B 需要约 90GB CPU 内存。小内存机器（如 64GB）需要把更多权重放 Disk。

6. **分布式扩展有限**：论文展示了多机 pipeline parallelism 的扩展，但需要各机 GPU 间有高速网络。同机多卡不如直接用 DeepSpeed/FSDP。

## 适用 vs 不适用场景

**适用**：

- 离线批处理任务：benchmark（HELM/MMLU）、数据抽取、表单处理、日志分析
- 只有单卡消费级 GPU，但有大模型推理需求
- 模型太大（30B/175B），多卡 A100 太贵或不方便申请
- 对延迟不敏感（可以跑几小时），追求低成本高吞吐

**不适用**：

- 交互式聊天应用（低延迟要求）——用 vLLM / TensorRT-LLM
- 小模型（<3B）——直接放 GPU 不需要 offloading
- 需要极低延迟 + 高吞吐的场景——FlexGen 的 trade-off 偏吞吐
- 没有 NVMe SSD 的环境——磁盘 offloading 优势全无

## 历史小故事（可跳过）

- **2022.08**：Stanford 发布 Alpa，首次用自动并行 + offloading 在 CPU 集群上跑 OPT-175B，但需要 48 台机器
- **2022 末**：Petals 用分布式推理（多 GPU 共享权重），每卡只拿一部分权重，但单卡延迟极高
- **2023.03**：FlexGen 论文 arXiv 上线，核心洞察——**批处理场景下 offloading 的 I/O 效率被严重低估**
- **2023.06**：论文修订版，增加 4-bit 量化实验，OPT-175B 吞吐翻倍
- **2023–2024**：vLLM 崛起，专注 GPU 内 PagedAttention + 高吞吐，成为交互式推理事实标准。FlexGen 走不同路线——offloading + 压缩，面向**无 GPU 或 GPU 严重不足**的场景

## 学到什么

1. **offloading 不是"慢"，而是"没用好"**——逐行调度 I/O 浪费严重，块级调度的重叠才是关键
2. **延迟和吞吐是两个不同的优化目标**——FlexGen 放弃前者全力追求后者，这个取舍在批处理场景下非常明智
3. **线性规划不是摆设**——自动求解张量放置策略，比人工经验更优，也更适应不同硬件配置
4. **4-bit 压缩已经成熟到"无感"**——权重和 KV 缓存一起压缩，精度几乎无损，性价比极高
5. **单卡不是上限**——FlexGen 可以扩展到多机 pipeline parallelism，offloading 和分布式可以叠加

## 延伸阅读

- 论文 PDF：[FlexGen arXiv 2303.06865](https://arxiv.org/abs/2303.06865)
- 官方代码：[FMInference/FlexLLMGen](https://github.com/FMInference/FlexLLMGen)（已归档，v2 为最终版）
- HELM 评测框架：[stanford-crfm/helm](https://github.com/stanford-crfm/helm)
- [[vllm]] —— 同期对手，专注 GPU 内 PagedAttention 高吞吐，面向交互式场景
- [[awq-2023]] —— 4-bit 量化方案，FlexGen 的压缩思路与之互补
- [[splitwise-2023]] —— 另一条 offloading 路线，按层自动划分 GPU/CPU

## 关联

- [[vllm]] —— GPU 内高吞吐推理；FlexGen 走 offloading 路线，两者面向不同硬件条件
- [[awq-2023]] —— 4-bit 权重量化；FlexGen 也用了类似的 per-channel INT4 压缩
- [[splitwise-2023]] —— 自动 GPU/CPU 分层，FlexGen 的线性规划前置工作
- [[efficient-compile-2011]] —— 古典编译优化思想：通过分块（tiling）提高内存复用
- [[triton-2019]] —— 自动化张量放置/编译的探索者，FlexGen 的 LP 优化与之精神相通

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

