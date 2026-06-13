---
title: Awesome ML Systems Papers — 零基础学习笔记
来源: https://github.com/byungsoo-oh/ml-systems-papers
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# Awesome ML Systems Papers — 零基础学习笔记

## 一、什么是"ML Systems"？

在写笔记之前，先搞清楚一个问题：**"ML Systems"到底是什么？**

### 日常类比：餐厅 vs 厨师

想象一家高级餐厅：

- **ML（机器学习）研究者** = 发明新菜谱的厨师。他们设计算法、提出新的模型结构（比如 Transformer）。
- **ML Systems 研究者** = 餐厅的运营团队。他们确保成百上千个灶台同时运转、食材准时送达、锅碗瓢盆够用、火候控制精准。

一个菜谱（算法）在实验室里可能只需要一个灶台就能做。但当你要同时做 1000 道菜（训练一个万亿参数的大模型）时，你就需要一套完整的**系统**来协调。

这就是 ML Systems 要解决的问题——**如何让机器学习算法在真实的硬件上跑得快、跑得省、跑得稳。**

### 这个仓库在干什么？

`byungsoo-oh/ml-systems-papers` 是一个精心整理的论文清单，收录了 ML Systems 领域几乎所有重要的学术论文。截至 2026 年，它涵盖了 **20+ 个分类**、数百篇论文，时间跨度从 2018 年到 2026 年。

简单来说：这是进入"如何让大模型跑得更快"这个领域的**地图**。

---

## 二、核心概念

这个仓库的论文覆盖了 ML Systems 的方方面面。下面挑出 4 个最核心、也最易懂的概念，用类比+代码的方式讲清楚。

### 概念 1：数据管道（Data Pipeline）

**类比：** 餐厅的食材配送。再厉害的厨师，如果食材半小时内送不到灶台上，整个餐厅就得停工。

在深度学习训练中，GPU 计算速度极快，但数据从硬盘读到 GPU 内存的速度很慢。如果 GPU 等数据的时间超过计算时间，GPU 就"闲着没事干"——这是巨大的浪费。

**代码示例：PyTorch 数据加载器**

```python
from torch.utils.data import DataLoader, Dataset

class MyDataset(Dataset):
    def __getitem__(self, idx):
        # 这里模拟从磁盘加载一张图片
        image = load_image(f"/data/images/img_{idx}.jpg")
        label = get_label(f"/data/labels/label_{idx}.txt")
        return image, label

# 关键参数：
# num_workers=8  →  启动 8 个"搬运工"线程并行读数据
# pin_memory=True →  把数据先放在"快速通道"内存，加速传到 GPU
# batch_size=64   →  每次送 64 张图给 GPU 计算
loader = DataLoader(
    MyDataset(),
    batch_size=64,
    num_workers=8,
    pin_memory=True,
    prefetch_factor=2  # 提前预取 2 批数据
)

for images, labels in loader:
    output = model(images)  # GPU 一直在忙，不用等
    loss = compute_loss(output, labels)
```

仓库中的"Data Processing"分类下收录了大量优化数据管道的论文，比如 **FFCV**（通过去掉数据瓶颈来加速训练）、**FastFlow**（用 CPU-GPU 协作加速预处理）。

---

### 概念 2：分布式训练（Distributed Training）

**类比：** 一栋楼装修。一个装修队要 10 年，100 个装修队同时干，可能只要 3 个月。但前提是——每个队知道自己的区域，大家不互相干扰，还要定期对齐进度。

当模型大到一张 GPU 的内存放不下时，就需要把模型拆成多份，分配到多张 GPU 上同时训练。这就是分布式训练。

**三种基本并行策略：**

| 策略 | 类比 | 怎么分 |
|------|------|--------|
| **数据并行（Data Parallelism）** | 每人做同一道题的不同版本 | 数据分到各 GPU，每份模型副本完整 |
| **模型并行（Model Parallelism）** | 每人造车的不同部件 | 模型拆碎，每块数据只占一部分 GPU |
| **流水线并行（Pipeline Parallelism）** | 工厂流水线 | 模型分阶段，像传送带一样逐层传递 |

**代码示例：PyTorch 数据并行（DDP）**

```python
import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP

# 1. 初始化进程组（所有 GPU 先"建群"）
dist.init_process_group(backend="nccl")
local_rank = dist.get_rank()
torch.cuda.set_device(local_rank)

# 2. 加载模型并放到对应 GPU
model = MyModel().cuda(local_rank)
model = DDP(model, device_ids=[local_rank])

# 3. 训练循环
for images, labels in dataloader:
    images, labels = images.cuda(local_rank), labels.cuda(local_rank)
    output = model(images)
    loss = compute_loss(output, labels)

    # 反向传播：每块 GPU 各自算梯度
    loss.backward()

    # 同步梯度：所有 GPU 的平均梯度（这就是"对齐进度"）
    for param in model.parameters():
        dist.all_reduce(param.grad.data)

    # 更新参数
    optimizer.step()
```

仓库中"Training System → Distributed Training"分类下有超过 **100 篇论文**，包括：
- **Megatron-LM**（模型并行的经典实现）
- **DeepSpeed**（微软的数据并行优化方案）
- **Alpa**（自动寻找最佳并行策略）
- **MegaScale**（在超过 10,000 张 GPU 上训练大模型）

---

### 概念 3：GPU 共享与调度（GPU Scheduling）

**类比：** 健身房里的跑步机。健身房有 20 台跑步机，但来了 100 个人。谁先用、用多久、什么时候让出来，这就是调度的问题。

在云数据中心，成百上千的用户争夺有限的 GPU 资源。调度器要决定：哪个任务先跑？哪个可以等？如果某台 GPU 坏了，任务怎么办？

---

### 概念 4：推理优化（Inference Optimization）

**类比：** 餐厅上菜。训练是研发新菜（可以慢慢做），推理是实际端给客户（必须快）。

模型训练好之后，要部署到线上服务给用户。推理系统的核心目标是：**用最少的资源、最高的速度响应最多用户的请求。**

**代码示例：vLLM 推理加速（概念性）**

```python
# vLLM 是仓库"推理系统"分类中最有名的项目
# 它通过 PagedAttention 技术，把 GPU 显存像操作系统管理内存
# 一样分页管理，减少浪费，大幅提升吞吐量

from vllm import LLM, SamplingParams

# 加载模型（vLLM 会自动优化显存）
llm = LLM(model="meta-llama/Llama-3-70B", gpu_memory_utilization=0.9)

# 生成请求
prompts = [
    "请解释什么是分布式训练",
    "用一句话概括机器学习",
    "Python 中什么是列表推导式",
]

sampling_params = SamplingParams(temperature=0.7, max_tokens=256)
outputs = llm.generate(prompts, sampling_params)

for output in outputs:
    print(output.outputs[0].text)
```

仓库中"推理系统"分类收录了 vLLM、TGI、TensorRT-LLM 等相关论文。

---

## 三、仓库结构总览

以下是该仓库的完整分类结构，你可以把它当成 ML Systems 领域的"目录"：

```
ML Systems 论文清单
├── 1. 数据处理（Data Processing）
│   ├── 数据管道优化（Data pipeline optimization）
│   ├── 缓存与分布式存储（Caching and distributed storage）
│   ├── LLM 数据面（LLM data plane）
├── 2. 训练系统（Training System）
│   ├── GPU 集群工作负载分析
│   ├── 资源调度（Resource scheduling）
│   ├── 分布式训练（Distributed training）← 论文最多，100+篇
│   ├── AutoML
│   └── GNN 训练
├── 3. 推理系统（Inference System）
├── 4. 注意力优化（Attention Optimization）
├── 5. 混合专家模型（Mixture of Experts / MoE）
├── 6. 通信优化与网络（Communication & Network）
├── 7. 容错与慢节点缓解（Fault tolerance）
├── 8. GPU 显存管理（GPU Memory Management）
├── 9. GPU 共享（GPU Sharing）
├── 10. 编译器（Compiler）
├── 11. GPU Kernel 优化
├── 12. LLM 长上下文（Long Context）
├── 13. 模型压缩（Model Compression）
├── 14. 联邦学习（Federated Learning）
├── 15. 隐私保护 ML（Privacy-Preserving ML）
├── 16. ML API 与应用侧优化
├── 17. 用 ML 优化系统（ML for Systems）
├── 18. 能效（Energy Efficiency）
├── 19. RAG（检索增强生成）
├── 20. 仿真（Simulation）
├── 21. 智能体 AI 系统（Systems for Agentic AI）
├── 22. 强化学习后训练（RL Post-Training）
├── 23. 多模态（Multimodal）
└── 24. 混合 LLM（Hybrid LLMs）
```

---

## 四、如何阅读这份论文清单？

### 给零基础学习者的建议

1. **不要从头读到尾**。这份清单像字典，不是小说。先根据兴趣选一个分类，比如"数据管道"。
2. **先看标注了 [Survey 🔍] 的论文**。综述论文会帮你建立全局认知，就像先读地图再钻小路。
3. **关注带有知名系统名字的论文**：
   - **Megatron-LM** — 模型并行的开创性实现
   - **DeepSpeed** — 微软的分布式训练库
   - **vLLM** — 推理加速的事实标准
   - **Alpa** — 自动并行策略搜索
   - **GShard / MoE** — 混合专家架构

### 阅读顺序推荐

| 阶段 | 目标 | 推荐分类 |
|------|------|----------|
| 入门 | 了解全局 | 综述论文 + 数据管道 |
| 进阶 | 理解分布式训练 | 分布式训练 + GPU 显存管理 |
| 深入 | 研究具体方向 | 按兴趣选择特定分类 |

---

## 五、总结

- ML Systems 研究的是**让机器学习在真实硬件上高效运行**的问题
- 这个仓库收录了 2026 年以前 ML Systems 领域的几乎所有重要论文
- 核心挑战包括：数据管道瓶颈、分布式并行策略、GPU 资源调度、推理加速
- 学习路径建议：综述论文 → 数据管道 → 分布式训练 → 深入细分方向

这份清单本身就是一个巨大的学习资源。把它收藏起来，随着你逐步深入 ML Systems 领域，定期回来翻看，会有新的发现。
