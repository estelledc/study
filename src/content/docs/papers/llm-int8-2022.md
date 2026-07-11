---
title: LLM.int8() — 大模型激活值里藏着几个超大异常通道
来源: Dettmers et al., LLM.int8() 8-bit Matrix Multiplication for Transformers at Scale, NeurIPS 2022
日期: 2026-05-31
分类: LLM 推理
难度: 中级
---

## 是什么

LLM.int8() 是一种**把 transformer 推理时的矩阵乘法从 16-bit 压成 8-bit、却几乎不掉精度**的方法。

日常类比：你要把一整柜子衣服塞进一半大的箱子（INT8 内存只占 FP16 的一半）。普通做法是所有衣服都对折。但作者发现衣柜里有几件超大羽绒服（**异常通道 outlier features**）——你硬对折它们就会撑爆箱子的形状（精度崩盘）。于是他做了两件事：

1. 普通衣服用一种"按列定制"的折法（**vector-wise 量化**）尽量不变形
2. 那几件羽绒服**单独留一个高精度的盒子装**（FP16 路径），其他 99.9% 的衣服走 INT8 路径

这是把"175B 参数模型 FP16 约 350GB → INT8 约一半显存、单台多卡消费级服务器就能跑"的工程现实背后的算法。

## 为什么重要

- **OPT-175B / BLOOM-176B 的单台消费级 GPU 服务器推理**——之前通常要多张 A100 级数据中心卡或多机；本文把 FP16 显存需求大约砍半
- **第一次系统描述并工程化处理 outlier 通道**——后续 SmoothQuant / AWQ / GPTQ / QLoRA 都建立在相关观察上
- **`load_in_8bit=True` 一行代码搞定**——HuggingFace transformers 集成了 bitsandbytes，作者之一就是 Tim Dettmers
- **接近 FP16 的精度**——此前大模型 INT8 常掉数个困惑度点；本文在 175B 上报告与 16-bit 相当、无明显退化
- **打开了更低比特路线**——后续 QLoRA（NF4）、AWQ、GPTQ 都是这条路上的延续

如果你想理解今天为什么能在一张 24G 消费级显卡上微调 70B 模型，这篇是源头。

## 核心要点

LLM.int8() 的核心可以拆成 **两个观察 + 两个方法**：

**观察 1：异常通道是大模型的"涌现现象"**

模型规模过 6.7B 后，每一层激活值里突然出现几个**幅度比平均值大 20 倍**的通道。它们集中在不到 0.1% 的特征维度上，但**贡献了注意力输出的大头**。小于 6.7B 的模型完全没有这个现象——它是规模涌现的副产物。

**观察 2：异常通道高度系统化**

这些大通道**不是随机分布**——它们出现在固定的几个特征维度上、跨 token、跨 batch 都稳定。所以可以静态地识别并隔离。

**方法 1：vector-wise 量化（处理 99.9% 的普通通道）**

不是整个矩阵共用一个缩放因子（**tensor-wise**，太粗），也不是每个元素一个（**element-wise**，太碎）。LLM.int8() 选择中间粒度：

- 输入矩阵 A：**每一行**一个缩放因子 `c_x[i]`
- 权重矩阵 B：**每一列**一个缩放因子 `c_w[j]`
- 反量化时 `Out[i,j] = (A_int8 · B_int8)[i,j] / (c_x[i] · c_w[j])`

每个内积有自己的归一化常数，比 tensor-wise 精确得多，又不像 element-wise 那样存储爆炸。

**方法 2：混合精度分解（处理 0.1% 的异常通道）**

设阈值 `α=6.0`。对输入 X 的每一列：

- 若该列存在 |x| > 6 的元素 → **整列**走 FP16 路径
- 否则 → 走 INT8 路径

最后两路结果加起来：

```
Y = X_int8 · W_int8 / scales + X_fp16 · W_fp16
```

通常只有 ~7 个特征维度命中 FP16 路径（百分比 < 0.1%），但精度被这一手保住了。

## 实践案例

### 案例 1：异常通道长什么样

在 OPT-13B 上随机喂一个 prompt，测某一层 FFN 的输入激活：

- 4095 个普通通道：均值 0.5、最大值 5
- 7 个异常通道：均值 65、最大值 130

如果你用 INT8（范围 -128 到 127）量化全部 4096 个通道：

- 缩放因子由最大的 130 决定，每一格代表 ~1.0
- 那 4095 个均值 0.5 的普通通道全被压成 0 或 1，**信息全丢了**

这就是为什么"异常通道必须单独处理"——不是为了它们自己，是为了**保护其他 99.9% 通道的分辨率**。

### 案例 2：vector-wise 比 tensor-wise 强多少

在 13B 模型上比对（C4 困惑度，越低越好）：

| 方法 | 13B 困惑度 |
|---|---|
| FP16 baseline | 12.45 |
| 8-bit absmax (tensor-wise) | 13.78 |
| 8-bit zeropoint (tensor-wise) | 13.51 |
| 8-bit row-wise | 12.78 |
| **8-bit vector-wise** | 12.72 |
| **LLM.int8() (vector + decomp)** | **12.45** |

只有加了**异常分解**那一步才能回到与 FP16 相当——单靠 vector-wise 在 6.7B 之后就会开始掉点。

### 案例 3：用起来什么样

```python
from transformers import AutoModelForCausalLM
model = AutoModelForCausalLM.from_pretrained(
    "facebook/opt-66b",
    load_in_8bit=True,
    device_map="auto",
)
# 66B 模型从 132GB 直接降到 66GB
# 单张 A100-80G 即可加载（之前要两张）
```

底层调的是 bitsandbytes 库，C++/CUDA 实现了上面的两路融合 kernel。

## 踩过的坑

1. **`α=6.0` 不是普适常数**：作者在 13B 上调出来，更大模型可能要更大阈值；调小则 FP16 路径变胖、速度回落

2. **推理慢于纯 FP16**：FP16 路径 + INT8 路径 + scatter/gather 索引带来开销，**首 token 延迟比 FP16 高 ~30%**——LLM.int8() 是省内存的方法，不是加速的方法

3. **训练中不能用**：原文只覆盖推理。后续 QLoRA 才把异常处理思想搬到训练（NF4 + 双量化），但仍有适配成本

4. **只压权重 + 激活，没压 KV cache**：长上下文时 KV 占内存反而成新瓶颈，这才有了后来的 KV cache 量化（FP8 / INT4 KV）

5. **小模型（<6.7B）用它没意义**：异常现象不存在，普通 vector-wise 量化就够；强行加分解路径反而拖慢

## 适用 vs 不适用场景

**适用**：
- 大模型推理 GPU 内存吃紧（>10B 参数 + 消费级或单台服务器）
- 一次性加载、长时间服务的场景（开销分摊）
- 想保留训练好的 FP16 模型不动、零调参直接降精度

**不适用**：
- 追求**速度**而不是省内存 → 看 SmoothQuant / AWQ / TensorRT-LLM
- 需要**极致 4-bit** → 用 QLoRA（NF4）/ AWQ / GPTQ
- 训练阶段量化 → LLM.int8() 是推理工具
- 小于 6.7B 的模型 → 简单 vector-wise 量化即可，不需要这套

## 历史小故事（可跳过）

- **2018–2021 年**：CNN 量化（DoReFa / LSQ）、BERT 量化（Q-BERT）成熟，但 LLM 上做 INT8 总是掉点 5–10
- **2021 年**：作者 Tim Dettmers 在 GPT-3 复现 OPT-175B 时遇到内存墙，开始挖根因
- **2022 年 8 月**：本文发布，第一次完整描述 outlier 现象 + 给出工程可行方案
- **2022 年 11 月**：bitsandbytes 集成进 HuggingFace transformers，`load_in_8bit=True` 上线
- **2023 年 5 月**：同作者发表 QLoRA，把思路推向 4-bit + 训练
- **之后**：SmoothQuant（2022-11，把 outlier 从激活搬到权重）/ AWQ（2023-06，看激活选关键权重）/ GPTQ（2022-10，二阶量化）轮番接力

## 学到什么

1. **大模型有"涌现"的负面副作用**——不是只有能力涌现，激活分布也涌现新的极端模式
2. **0.1% 的异常 + 99.9% 的常规** 是 transformer 量化的根本结构。用同一种方法处理两者是错的
3. **混合精度不一定要硬件支持**：本文用纯软件分解就保住精度，这是巧妙的工程
4. **量化是带宽工程不是计算工程**——LLM 推理首先是 memory-bound，所以省一半内存比加速 2 倍更重要
5. **观察 → 描述 → 工程化** 三步可以在 ~6 个月内做完；好论文经常是"先发现现象再造方法"

## 延伸阅读

- 论文 PDF：[arXiv:2208.07339](https://arxiv.org/abs/2208.07339)
- 作者博客：[Tim Dettmers — LLM.int8() and Emergent Features](https://timdettmers.com/2022/08/17/llm-int8-and-emergent-features/)（讲故事顺序更好读）
- 库源码：[bitsandbytes GitHub](https://github.com/bitsandbytes-foundation/bitsandbytes)（CUDA kernel 在 `csrc/kernels.cu`）
- HuggingFace 集成文档：[Quantization with bitsandbytes](https://huggingface.co/docs/transformers/main/en/quantization/bitsandbytes)
- [[awq]] —— 后继工作：用激活信息选关键权重做 4-bit
- [[attention]] —— 异常通道恰好出现在注意力的 Q/K/V 投影里
- [[gpt-3]] —— 175B 是 LLM.int8() 第一个完整压缩的目标

## 关联

- [[awq]] —— 同样用"激活分布"指导量化，但走 weight-only 4-bit 路线
- [[attention]] —— outlier 集中在 attention 投影层，与注意力机制本身耦合
- [[gpt-3]] —— GPT-3/OPT-175B 是这套方法的首要受益者
- [[ampere-architecture-2020]] —— A100 的 INT8 Tensor Core 是落地的硬件前提
- [[fastertransformer-2021]] —— 早期 LLM 推理引擎，缺的就是无损量化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[awq]] —— AWQ — 看激活脸色给权重打折
- [[awq-2023]] —— AWQ 2023 — 让 70B 大模型住进 RTX 4090
- [[fastertransformer-2021]] —— FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[gptq-2023]] —— GPTQ — 把 175B 大模型压成 4-bit 还几乎不掉点
- [[smoothquant-2023]] —— SmoothQuant 2023 — 把激活的烫手山芋扔给权重

