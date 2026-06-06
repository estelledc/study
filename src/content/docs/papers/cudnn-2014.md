---
title: cuDNN — 把卷积写成矩阵乘，让所有深度学习框架共享底层加速
来源: 'Chetlur et al., "cuDNN: Efficient Primitives for Deep Learning", arXiv:1410.0759, 2014'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

**cuDNN** 是 NVIDIA 2014 年发布的一个 GPU 库，专门做深度学习里那几个最吃算力的算子——卷积、池化、激活、softmax、归一化。日常类比：像饭店的中央厨房——每家分店（PyTorch / TensorFlow / Caffe）自己不再切菜炖汤，统一从中央厨房进货，又快又稳。

你写：

```python
import torch.nn as nn
conv = nn.Conv2d(64, 128, kernel_size=3)
y = conv(x)  # x 在 GPU 上
```

表面上 PyTorch 跑了一行卷积。实际上这一行最终落到 cuDNN 的 `cudnnConvolutionForward()`——一段 NVIDIA 工程师用 CUDA 手写、按 GPU 微架构调过一遍又一遍的高度优化代码。

这个"框架不再自己写 GPU 卷积"的分工，是 2014 年之后整个深度学习生态能爆发的隐形基座。

## 为什么重要

不理解 cuDNN，下面这些事都没法解释：

- 为什么 PyTorch 在 NVIDIA 卡上比 AMD 卡快很多——cuDNN 是闭源的，AMD 只能逆向写 MIOpen 追赶
- 为什么 `torch.backends.cudnn.benchmark=True` 第一次跑慢、后面快——它在让 cuDNN 选算法
- 为什么模型 OOM 不是因为 batch 太大，是 cuDNN 选了 Winograd 算法多吃 workspace
- 为什么升 PyTorch 常被 CUDA / cuDNN 版本卡住——三者强绑定

## 核心要点

cuDNN 解决的核心问题：**怎么在 GPU 上把卷积算快**。它的关键招数是 **implicit GEMM**（隐式矩阵乘）。

1. **把卷积看成矩阵乘**：经典办法叫 im2col——把每个滑动窗口拉成一行，整张图变成一个大矩阵，然后调 cuBLAS 做矩阵乘。问题是中间矩阵巨大，显存爆。

2. **不真的生成那个大矩阵**：cuDNN 按 tile（小块）切分，**在 GPU 寄存器和共享内存里现拼现算**——逻辑上是矩阵乘，物理上从没物化过中间矩阵。这就是 implicit GEMM。

3. **多算法 + runtime 选最优**：v1 只有 implicit GEMM。后续版本加了 Winograd（小 kernel 加速 2-4×）、FFT（大 kernel 用频域）、direct convolution。runtime 根据输入 shape、卷积参数自动挑最快的。

4. **API 模仿 cuBLAS**：先创建 handle、再创建 tensor / filter / convolution 描述符，最后调 forward/backward。框架开发者不用懂 CUDA 也能用。

## 实践案例

### 案例 1：你看不见但每天都在用

```python
import torch
import torch.nn as nn

x = torch.randn(32, 3, 224, 224, device="cuda")
conv = nn.Conv2d(3, 64, kernel_size=7, stride=2, padding=3).cuda()
y = conv(x)
```

这一行最终走到 cuDNN：

1. PyTorch 把 x、conv.weight 包装成 `cudnnTensorDescriptor` 和 `cudnnFilterDescriptor`
2. 调 `cudnnGetConvolutionForwardAlgorithm()` 选算法
3. 调 `cudnnConvolutionForward()` 真正算

整条链上 PyTorch 没自己写一行 CUDA。

### 案例 2：benchmark 模式的代价与收益

```python
torch.backends.cudnn.benchmark = True
```

打开后，**第一次**遇到一个新的 (input shape, conv params) 组合时，cuDNN 会跑几种算法各一遍，挑最快的缓存下来。后续同样 shape 直接用缓存。

收益：训练循环里 shape 固定，整个 epoch 提速 10-30%。
代价：第一次启动慢；输入 shape 频繁变化（如动态 batch、变长序列）反而每次都重搜一次，更慢。

### 案例 3：implicit GEMM 省了多少显存

假设 batch=32、输入 224×224×3、kernel=7×7、output channels=64：

- im2col 中间矩阵大小约 `32 × (224×224) × (7×7×3) ≈ 7.4 亿元素 ≈ 3 GB`（FP32）
- implicit GEMM **完全不生成这个矩阵**，只在 tile 里临时拼

这就是为什么 cuDNN 一出来就把卷积训练能跑的 batch size 翻好几倍。

## 踩过的坑

1. **cuDNN 不确定性**：默认情况下，多次跑同一个 batch 结果有 1e-6 级别浮动（来自 atomic 加和顺序）。要复现得设：

```python
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
```

但会慢。

2. **OOM 不一定是 batch 太大**：cuDNN 算法的 workspace 大小差几个数量级。FFT/Winograd workspace 可能几百 MB。OOM 时先试 `cudnnConvolutionForwardAlgo_t` 的 implicit GEMM。

3. **版本绑定地狱**：CUDA 11.8 ↔ cuDNN 8.6 ↔ PyTorch 2.0 是一组，错位就 import 报错。升级前查 PyTorch 的兼容矩阵。

4. **闭源**：你看不到 cuDNN 内部代码、profile 不到细节。只能看 nsys 的 kernel 名和时间。

## 适用 vs 不适用场景

**适用**：

- 任何在 NVIDIA GPU 上跑卷积、池化、激活、softmax 的训练或推理
- 标准网络结构（ResNet / BERT / Transformer 的 LayerNorm / GELU 等）

**不适用**：

- AMD / Intel GPU——用 MIOpen / oneDNN
- 自定义算子——cuDNN 没覆盖，得自己写 CUDA 或用 Triton / TVM
- 极端小 batch 或动态 shape——overhead 大于算力收益，可能 PyTorch native 更快

## 历史小故事（可跳过）

- **2012 年**：AlexNet 用 Krizhevsky 自己写的 cuda-convnet 拿下 ImageNet——当时还没有"通用 GPU DL 库"这回事，每个研究组各写一份卷积。
- **2013 年**：Caffe 自己写了一套 GPU kernel，但跨硬件调起来很苦。
- **2014.10**：NVIDIA 看到机会，发布 cuDNN v1——36% 加速 + 省显存，Caffe 立刻接入。
- **2015-2017**：cuDNN 成为事实标准，TensorFlow、PyTorch、MXNet 全部走它；Tensor Core (Volta, 2017) 进一步给 cuDNN 加 FP16 mma。
- **2020-至今**：Ampere TF32/BF16、Hopper FP8 都通过 cuDNN 暴露给框架。cuDNN 本身已是 NVIDIA AI 护城河的一块基石。

## 学到什么

1. **基础设施分工的力量**：cuDNN 出现之前，每个框架自己写一份 GPU 卷积。统一到一个底层库后，框架开发者能专注模型抽象，硬件厂能专注算子调优——双赢。
2. **API 抽象的稳定性**：cuDNN 的 handle + descriptor + algo 三段式 API 已经稳定 10 年，期间底层实现从 implicit GEMM 演进到 Winograd/FFT/Tensor Core，上层调用没变。**好抽象能跨过几代硬件**。
3. **闭源生态的双刃**：cuDNN 让 NVIDIA 卡有不可替代的 DL 性能，也让 PyTorch 在 NVIDIA 上比 AMD 快——这正是 CUDA 护城河。AMD/Intel 必须复刻一份才能玩。
4. **算法 × 硬件 × runtime 选择**：cuDNN 不是某一个算法快，而是**多算法 + runtime 自动选**。这是工业级库的常见做法。

## 延伸阅读

- 论文 9 页 PDF：[cuDNN arXiv:1410.0759](https://arxiv.org/abs/1410.0759)（密度适中，第 2 节讲 implicit GEMM 值得读）
- NVIDIA 官方文档：[cuDNN Developer Guide](https://docs.nvidia.com/deeplearning/cudnn/developer-guide/)
- PyTorch 文档：[torch.backends.cudnn](https://pytorch.org/docs/stable/backends.html)
- [[pytorch]] —— cuDNN 的最大上层用户
- [[ampere-architecture-2020]] —— cuDNN 在新硬件上靠什么继续提速

## 关联

- [[pytorch]] —— PyTorch 内部所有标准 conv/RNN 都走 cuDNN
- [[keras]] —— Keras 后端 TensorFlow 也走 cuDNN
- [[ampere-architecture-2020]] —— Ampere TF32 通过 cuDNN 暴露给框架
- [[alpa-2022]] —— 上层并行框架，底层还是 cuDNN 算单卡
- [[jax]] —— JAX 走 XLA，部分 fallback 到 cuDNN

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[batchnorm-2015]] —— Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14
- [[cutlass-2020]] —— CUTLASS — 把 SOTA GEMM 拆成可组合的 C++ 模板层级
- [[jax]] —— JAX — Google 函数式数值计算
- [[pytorch]] —— PyTorch — 深度学习主流框架

