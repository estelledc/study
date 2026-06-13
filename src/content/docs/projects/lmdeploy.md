---
title: LMDeploy — 大模型压缩、部署与推理工具包
来源: https://github.com/InternLM/lmdeploy
日期: 2026-06-13
分类: 机器学习
子分类: ai-infra
provenance: pipeline-v3
---

# LMDeploy — 大模型压缩、部署与推理工具包

## 一、从日常类比开始

想象一下，你开了一家餐厅。

厨房里有几位大厨（他们就是 **大语言模型**，比如 Llama、Qwen、InternLM）。每位大厨知识渊博，但他们工作有几个痛点：

1. **做菜太慢** — 一位大厨同时只能做一道菜，顾客多了就排长队。
2. **食材太贵** — 大厨需要巨大的厨房（显存/内存）才能施展。
3. **人多管不过来** — 如果有多家分店，老板不知道把顾客分给哪个大厨。

**LMDeploy 就像一套餐厅管理系统**，它做了三件事：

- 让大厨同时做多道菜（**持续批处理**，persistent batch / continuous batching）
- 把食材切得更薄、用更小的盘子装（**量化**，quantization，从 FP16 压到 INT4）
- 当顾客太多时，自动分配到多台厨房（**分布式服务**，distribution server）

这套系统由上海人工智能实验室的 InternLM 团队开发，前身是 MMDeploy（计算机视觉推理框架）团队。

## 二、核心概念

### 2.1 两种推理引擎

LMDeploy 提供了两个推理引擎，各有侧重：

| 引擎 | 特点 | 适合场景 |
|------|------|----------|
| **TurboMind** | C++ / CUDA 编写，追求极致性能 | 生产环境、高并发、低延迟 |
| **PyTorchEngine** | 纯 Python 编写，开发门槛低 | 快速实验、新模型验证 |

TurboMind 是 LMDeploy 的核心杀手锏。它用了很多底层优化技巧，让推理速度比 vLLM（另一个著名推理框架）快 1.8 倍。

### 2.2 关键优化技术

理解这几个概念，就理解了 LMDeploy 为什么快：

- **Persistent Batch（持续批处理）**：普通推理是一次处理一个请求，做完才接下一个。持续批处理允许在同一批中同时处理多个请求，做到"边做边接"，像传送带一样不停运转。

- **KV Cache（键值缓存）**：大模型每次生成新词时，都会重复计算前面所有词的 "KV 值"。KV Cache 把这些算好的值存起来，避免重复劳动。

- **Paged Attention（分页注意力）**：像操作系统的虚拟内存一样，把 KV Cache 切成小块灵活管理，避免内存浪费。

- **Tensor Parallelism（张量并行）**：把一个大模型拆分到多张显卡上一起算。就像把一个复杂的菜分给两个大厨各做一半。

- **Quantization（量化）**：把模型参数从高精度的 FP16（16 位浮点）压缩到 INT4（4 位整数）。精度降低但速度提升 2.4 倍，同时质量下降很少。

### 2.3 支持模型

LMDeploy 支持超过 80 种模型，包括但不限于：

- **LLM**：Llama 系列、Qwen 系列（含 Qwen3.5）、InternLM 系列、DeepSeek-V3、GPT-OSS 等
- **VLM（多模态）**：Qwen2-VL、InternVL 系列、LLaVA、Phi-3-Vision 等

## 三、快速上手

### 3.1 安装

```bash
conda create -n lmdeploy python=3.12 -y
conda activate lmdeploy
pip install lmdeploy
```

从 v0.13.0 开始，PyPI 上的预编译包默认针对 **CUDA 12.8**，直接 `pip install lmdeploy` 即可。

### 3.2 代码示例一：离线批量推理

这是最简单的使用方式。LMDeploy 会自动从 HuggingFace 下载模型并推理：

```python
from lmdeploy import pipeline

# 创建一个推理管道，自动下载并加载模型
pipe = pipeline("internlm/internlm3-8b-instruct")

# 一次性发送多条消息（批量推理）
responses = pipe(["你好，请介绍一下你自己", "上海是"])
for r in responses:
    print(r.text)
```

这里 `pipeline` 是 LMDeploy 的核心 API。它做了很多事情：自动下载模型、初始化引擎、管理 GPU 内存。你只需要传入问题，它就返回答案。

### 3.3 代码示例二：启动 OpenAI 兼容的 API 服务

如果你想把模型变成一个 HTTP 服务，让其他程序调用：

```bash
# 一行命令启动 API 服务
lmdeploy serve api_server \
    internlm/internlm3-8b-instruct \
    --server-port 23333
```

启动后，就可以用任何 OpenAI SDK 风格的代码来调用：

```python
from openai import OpenAI

client = OpenAI(
    api_key="not-needed",
    base_url="http://localhost:23333/v1"
)

response = client.chat.completions.create(
    model="internlm3-8b-instruct",
    messages=[
        {"role": "system", "content": "你是一个 helpful assistant"},
        {"role": "user", "content": "什么是持续批处理？"}
    ]
)
print(response.choices[0].message.content)
```

这和调用 ChatGPT API 的代码几乎一模一样——LMDeploy 实现了完整的 OpenAI API 协议。

### 3.4 代码示例三：量化压缩模型

LMDeploy 最强大的功能之一是量化。把 FP16 模型压缩到 INT4，显存占用直接降为原来的 1/4：

```python
from lmdeploy import compress

# 将模型量化为 INT4 权重 + INT8 KV Cache
compress(
    model_name="internlm/internlm3-8b-instruct",
    quant_policy=4,      # 4-bit 量化策略
    save_dir="./internlm3-8b-int4"
)
```

量化后的模型可以用更少的 GPU 卡运行，甚至在消费级显卡上跑大模型。

## 四、TurboMind 的架构要点

TurboMind 是 LMDeploy 的性能引擎，它的核心架构如下：

1. **CUDA Kernel 层**：用 CUDA C++ 手写高性能算子（Flash Attention、Paged Attention 等），避免 PyTorch 的通用算子开销。

2. **KV Cache 管理层**：用 Paged Attention 机制管理缓存，支持动态分裂与合并（dynamic split & fuse），在连续请求中保持高效。

3. **张量并行层**：通过 NCCL 实现多卡通信，把大模型切分到多张 GPU 上。

4. **调度层**：实现 continuous batching，在 token 生成期间动态插入新请求。

这个分层设计让 TurboMind 在不修改模型代码的前提下，获得显著提升。

## 五、什么时候该用 LMDeploy

- **你想在自己的 GPU 上跑开源大模型**，又不想写复杂推理代码 → 用 `pipeline` API
- **你想把模型变成 API 服务**，供多人调用 → 用 `api_server` 命令
- **你的显存不够跑 FP16 模型** → 用量化功能，INT4 能省 75% 显存
- **你需要高并发低延迟** → TurboMind 引擎 + 持续批处理，QPS 比 vLLM 高 80%
- **你在做模型实验**，不想写底层 CUDA 代码 → PyTorchEngine 纯 Python，上手简单

## 六、总结

LMDeploy 的核心理念很简单：**让大模型推理变得像安装一个 pip 包一样简单**。

它解决了三个层次的问题：

1. **易用层**：一行代码跑起来，OpenAI 兼容协议
2. **性能层**：TurboMind 引擎做到极致推理速度
3. **成本层**：量化让大模型在消费级硬件上也能跑

对于零基础学习者，建议先从 3.2 节的离线推理开始体验，感受一下"让本地 GPU 跑大模型"有多简单。
