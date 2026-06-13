---
title: DeepSpeed-Inference: Enabling Efficient Inference of Transformer Models at Unprecedented Scale
来源: https://arxiv.org/abs/2207.00032
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# DeepSpeed Inference：让 Transformer 推理快得离谱

## 一、从"大模型太慢"说起

你训练了一个巨大的 Transformer 模型——比如 1750 亿参数的 GPT-3。训练完了，高兴了。然后你想用它来回答问题（这叫"推理"），结果发现：

- 模型太大，一张 GPU 的显存根本装不下
- 就算装得下，每次回答一个问题都要等好几秒
- 如果一千个人同时问，GPU 直接爆掉

这就是 2022 年微软研究院这篇论文要解决的核心问题：**怎么让超大 Transformer 模型推理又快又省？**

日常类比：想象一个图书馆管理员，他脑子里装着整座图书馆的书（模型参数）。你问他一个问题，他得从脑子里翻出相关章节来回答。如果图书馆太大了，他的脑子不够用，怎么办？DeepSpeed Inference 的做法是：把书分一部分放到书架上（CPU 内存），再分一部分放到隔壁房间（NVMe 硬盘），同时雇好几个管理员一起翻书（多 GPU 并行）。

## 二、Transformer 推理为什么慢？

先搞明白瓶颈在哪。Transformer 推理有两个主要阶段：

1. **Prefill（预填充）**：一次性处理你的整个输入 prompt，计算第一次的注意力。这步可以并行，相对快。
2. **Decode（解码）**：一个字一个字地生成输出。每个新字都依赖前面所有的字，所以只能串行。这才是真正的瓶颈。

类比：Prefill 像考试时你一次性读完所有阅读理解文章，Decode 像你要逐题作答——每题的答案都依赖上一题的理解，没法跳着做。

核心瓶颈是 **Memory Wall**：GPU 的计算能力（TFLOPS）增长远快于显存带宽（GB/s）。模型越大，从显存里读参数的时间就越长，GPU 大部分时间在"等数据"而不是"算数据"。

## 三、DeepSpeed Inference 的两大核心方案

论文提出了两个层面的解决方案：

### 3.1 多 GPU 推理（模型能放进所有 GPU 的总显存）

当模型太大、单张 GPU 放不下，但可以分散到多张 GPU 上时，DeepSpeed Inference 做了这些事：

- **Tensor Parallelism（张量并行）**：把矩阵运算拆到多张卡上各自算一部分，再合并结果。就像一群人各算一道大题的不同小题，最后对答案。
- **Pipeline Parallelism（流水线并行）**：把模型的层按顺序分配到不同 GPU，数据像流水线一样流过。
- **KV Cache 压缩**：推理中 Attention 机制需要保存之前所有 token 的 Key-Value 向量（KV Cache）。随着对话变长，这部分占用的显存线性增长。论文用了量化（Quantization）来压缩它。

### 3.2 异构推理（模型大到连多 GPU 总显存都放不下）

当模型达到百亿甚至万亿参数级别时，连多 GPU 加起来也装不下。这时候 DeepSpeed Inference 引入了 CPU 内存和 NVMe 存储：

- 把模型参数分层存放：热数据在 GPU 显存，温数据在 CPU 内存，冷数据在 NVMe SSD
- 智能预取：预测哪些参数接下来会被用到，提前从 NVMe 搬到 GPU
- 这就像厨房里的"三级储物"：最常用的调料放手上（GPU），不太常用的放抽屉（CPU RAM），半年用一次的放储藏室（NVMe）

## 四、关键技术拆解

### 4.1 推理量化（Inference Quantization）

这是 DeepSpeed Inference 最核心的优化之一。

训练时我们用 FP16（半精度浮点数，16 位）来存参数。推理时可以进一步压缩到 INT8（8 位整数），甚至更低。这样显存占用直接减半，读取速度翻倍。

关键挑战：直接量化会导致精度下降。论文用了 SmoothQuant 的思想，把量化的难度从激活值（难以统计分布）转移到权重上（可以离线统计），从而保持精度。

### 4.2 通信优化

在多 GPU 场景下，GPU 之间需要频繁交换数据。传统做法是用 All-Reduce，但 DeepSpeed Inference 做了针对性优化：

- **算通重叠（Compute-Communication Overlap）**：一边算一边传，不等上一批传完再算下一批。就像厨师一边炒菜一边让助手递盘子。
- **拓扑感知路由**：根据 GPU 之间的实际连接速度（NVLink vs PCIe）来智能分配任务。

## 五、代码示例

### 示例 1：使用 DeepSpeed Inference 部署模型

```python
import deepspeed
import transformers

# 1. 加载 HuggingFace 模型（以 LLaMA-7B 为例）
model = transformers.AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-7b",
    torch_dtype="auto",
    device_map="auto"
)

tokenizer = transformers.AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b")

# 2. 用 DeepSpeed Inference 包装模型
# inference_config 里可以开启量化、多 GPU 分布式等
inference_config = {
    "tensor_parallel": 4,        # 用 4 张 GPU 做张量并行
    "dtype": "fp16",             # 使用半精度
    "enable_cuda_graph": True,   # 启用 CUDA Graph 加速小 batch
    "replace_with_kernel_inject": True  # 用 DeepSpeed 的内建算子替换
}

model = deepspeed.init_inference(
    model,
    config=inference_config,
    mp_size=4,                   # 模型并行大小 = GPU 数量
    dtype=torch.float16,
    max_out_tokens=512           # 最大生成长度
)

# 3. 推理
inputs = tokenizer("今天天气真好，我想", return_tensors="pt").to("cuda")
outputs = model.generate(**inputs, max_new_tokens=100, do_sample=True)
result = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(result)
```

### 示例 2：开启 KV Cache 量化以节省显存

```python
import deepspeed
from deepspeed.inference.v2 import InferenceEngineConfig

# 配置异构推理：让大模型跑在小机器上
config = InferenceEngineConfig(
    tensor_parallel=2,           # 2 卡并行
    quantize=True,               # 开启量化
    quantize_params_backend="nvme",  # 量化后的参数存在 NVMe 上
    max_out_tokens=1024,         # 最大输出长度
    enable_cuda_graph=True,      # CUDA Graph 减少 kernel 启动开销
)

# 从 DeepSpeed checkpoint 加载并构建推理引擎
engine = deepspeed.init_inference(
    "/path/to/model/checkpoint",
    config=config,
    mp_size=2,
    dtype=torch.float16,
)

# 批量推理（高吞吐场景）
prompts = [
    "请解释量子计算的原理",
    "写一首关于春天的诗",
    "Python 中装饰器怎么用",
]

inputs = tokenizer(prompts, return_tensors="pt", padding=True).to("cuda")
outputs = engine.generate(**inputs, max_new_tokens=256)

for i, prompt in enumerate(prompts):
    print(f"Q: {prompt}")
    print(f"A: {tokenizer.decode(outputs[i], skip_special_tokens=True)}\n")
```

## 六、论文的关键数据

| 指标 | DeepSpeed Inference | 对比基线 | 提升 |
|------|---------------------|----------|------|
| 延迟（延迟敏感场景） | — | SOTA | 降低至 1/7.3（即快 7.3 倍） |
| 吞吐（吞吐敏感场景） | — | SOTA | 提升 1.5 倍以上 |
| 支持的模型规模 | 万亿参数 | GPU-only 方案 | 大 25 倍 |
| 吞吐性能 | 84 TFLOPS | A6000 峰值的 50%+ | — |

关键数字：能用数百张 GPU 实时推理万亿参数模型——这在 2022 年是前所未有的。

## 七、与后来者的关系

DeepSpeed Inference 提出的很多思想被后续项目继承和发展：

- **vLLM**：继承了 PagedAttention 的思想来管理 KV Cache，但更专注于纯 GPU 场景，不做异构推理
- **TensorRT-LLM**：NVIDIA 的方案，侧重极致优化单卡/多卡推理，但不支持 CPU/NVMe 卸载
- **SGLang**：引入了 RadixAttention 来缓存和管理 KV Cache

DeepSpeed Inference 的独特价值在于：**它是少数同时覆盖多 GPU 分布式 + CPU/NVMe 异构卸载的方案**，适合那些模型大到连多 GPU 都装不下的场景。

## 八、学习要点总结

1. Transformer 推理的瓶颈不在"算得慢"，而在"等数据"——Memory Wall 是核心矛盾
2. 量化（FP16 → INT8）能在几乎不损失精度的前提下大幅减少显存占用
3. 多 GPU 推理的核心思路是张量并行 + 流水线并行 + 通信优化
4. 异构推理通过 GPU/CPU/NVMe 三级存储层次，让超大模型也能跑起来
5. KV Cache 是推理过程中隐形的显存杀手，需要专门的压缩和分页策略

## 九、下一步

- 动手装一个 DeepSpeed，用 `deepspeed.init_inference` 跑一个小模型试试
- 对比一下 vLLM 和 DeepSpeed Inference 在同一模型上的延迟/吞吐差异
- 了解 PagedAttention（vLLM 的核心创新）是如何管理 KV Cache 的
