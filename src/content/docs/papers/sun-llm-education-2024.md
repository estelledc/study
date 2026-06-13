---
title: "Green AI — 深度学习推理的能量效率，从框架到执行器的全面对比"
来源: 'Alizadeh & Castor, "Green AI: A Preliminary Empirical Study on Energy Consumption in DL Models Across Different Runtime Infrastructures", AI Eng 2024'
日期: 2026-06-13
分类: 机器学习
子分类: edtech
provenance: pipeline-v3
---

## 是什么

这篇论文回答了三个很实际的问题：**你选哪个深度学习框架来跑推理，对你的电费有多大影响？** 作者测了 PyTorch、TensorFlow、MXNet 三个主流框架，加上它们转成 ONNX 后的版本，在 ResNet-50、MobileNetV2、BERT 三个模型上的**能耗、推理时间和精度**，还对比了 ONNX 的两种后端执行器（CUDA vs TensorRT）。

日常类比：把模型推理想象成**从北京到上海的交通方式选择**。PyTorch、TensorFlow、MXNet 像三辆不同品牌的车——有的高速上省油、有的城里起步快。ONNX 像一台万能翻译器，把你的车换成另一辆车再出发。TensorRT 像是给车装了 turbo 引擎。选哪条路最省电，取决于你坐几个人（batch size）、车上装什么货（模型类型）、路况怎么样（GPU/CPU）。

论文的核心贡献是**首次系统性地测量深度学习运行时基础设施的能量消耗**。过去几乎所有研究都只看精度或速度，很少人关心"跑一次推理消耗多少焦耳"。

## 为什么重要

不理解能量效率这件事，下面这些现象解释不清：

- 为什么同一个模型在 PyTorch 和 TensorFlow 上跑的**电费差好几倍**——运行时不是免费的，框架内部调度、GPU 利用率、CPU/GPU 负载分配都在烧钱
- 为什么把模型转成 ONNX 通常更省电——ONNX 运行时做了更多推理优化（算子融合、内存复用）
- 为什么 "GPU 利用率越高越省电" 不是铁律——TensorFlow 的 GPU 利用率很低，但 GPU 本身功耗也低，真正烧电的是**GPU 低效运行时 CPU 被迫多干活**
- 为什么 AWS 曾选定 MXNet 为默认框架——在特定场景（vision models, batch 1）下它确实更省

简单说：**框架选择不是纯工程偏好问题，它直接决定了你每百万次推理的能源账单。**

## 核心要点

1. **推理时间与能耗高度相关（Spearman rho = 0.99）**：跑得慢的基本上就耗电多。但这只是相关性，不是因果律——有些框架可能跑得慢但功耗低，总能耗反而低。这篇论文确认了在 DL 推理场景下，这两个指标几乎是一回事。

2. **没有"最省"的框架**：MXNet 在 vision model + batch 1 时胜出，PyTorch 在 BERT 上完胜，TensorFlow 在所有测试中都是最耗电的。选型必须**按模型 + batch size + 任务类型**来看。

3. **ONNX 转换普遍省电，但有例外**：batch 1 时 ONNX 版本几乎总是比原版省 10-30%。但 batch 64 时，从 MXNet 和 PyTorch 转出的 ONNX 模型反而**多耗 10-13% 能量**——因为转换引入了一层额外开销。

4. **TensorRT 作为 ONNX 后端总是优于 CUDA**：在 ResNet 上，TensorRT 比 CUDA 执行器推理时间缩短 24-27%，总能耗降低 15-25%。

5. **GPU 利用率与能耗不是简单的正比关系**：TensorFlow 的 GPU 利用率仅 8%，看起来"没怎么用电"，但 CPU 被迫扛了大量工作，CPU 能耗反而暴涨。GPU 利用率低 + CPU 高负载 = 最差的组合。

## 实验设计

### 三个研究问题

| RQ | 问题 | 对比维度 |
|----|------|----------|
| RQ1 | 不同框架在能量上有差异吗？ | PyTorch vs TF vs MXNet |
| RQ2 | 转换到 ONNX 后有什么不同？ | 原版 vs ONNX 转换版 |
| RQ3 | 执行器（CUDA vs TensorRT）有影响吗？ | ONNX + CUDA vs ONNX + TensorRT |

### 测试环境

- **硬件**：Intel Core i7-11850H CPU, NVIDIA RTX 3070 GPU (8GB)
- **测量方法**：GPU 用 `nvidia-smi` 每 10ms 采样一次功率；CPU 用 `pyRAPL`（基于 Intel RAPL 接口）
- **归一化**：都记录了 10 分钟空闲状态的基准功耗，推理结果减去这个基准

### 两个 batch size 的考量

- **batch 1**：模拟单次推理场景，如实时视频流每帧 classification
- **batch 64**：模拟离线批量推理，如一次处理整个数据库

## 代码示例

### 示例 1：用三种框架各跑一次 ResNet 推理

```python
import torch
import torchvision.models as models
import tensorflow as tf
import mxnet as mx

# ---- PyTorch ----
torch_model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
torch_model.eval()
# 假设 x_torch 是预处理好的 [1, 3, 224, 224] 张量
with torch.no_grad():
    logits = torch_model(x_torch)

# ---- TensorFlow ----
tf_model = tf.keras.applications.ResNet50(weights='imagenet')
# 假设 x_tf 是预处理好的 [1, 224, 224, 3] 张量
logits = tf_model(x_tf)

# ---- MXNet ----
mx_model, mx_params = mx.model.load_checkpoint('resnet50', 0)
mx_sym = mx_model.list_outputs()
mod = mx.mod.Module(symbol=mx_sym, context=mx.cpu(), label_names=None)
mod.bind(for_training=False, data_shapes=[('data', (1, 3, 224, 224))])
mod.set_params(mx_params)
mx_batch = mx.io.DataBatch(data=[x_mx])
mod.forward(mx_batch, is_train=False)
logits = mod.get_outputs()[0]
```

同样的 ResNet-50 模型，三个框架推理一次 batch-1 的能耗数据：

```
框架       GPU 能耗 (J)    CPU 能耗 (J)    总能耗 (J)    推理时间 (s)
───────────────────────────────────────────────────────────────────
MXNet       2,586           848             3,434         50.89
PyTorch     2,574           1,431           4,005         52.42
TensorFlow  2,915           5,315           8,230         270.09

结论：TensorFlow 比 MXNet 多耗能 140%，速度慢 5 倍
```

### 示例 2：转成 ONNX 后对比能耗

```python
import torch
import onnxruntime as ort

# Step 1: 用 PyTorch 导出 ONNX
torch_model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
torch_model.eval()
torch.onnx.export(
    torch_model,
    x_torch,                      # 示例输入
    "resnet50.onnx",              # 输出文件名
    input_names=["input"],        # 输入名称
    output_names=["output"],      # 输出名称
    dynamic_axes={                # 支持可变 batch size
        "input": {0: "batch"},
        "output": {0: "batch"}
    }
)

# Step 2: 用 ONNX Runtime 加载并推理
ort_session = ort.InferenceSession("resnet50.onnx")
ort_inputs = {"input": x_torch.numpy()}
ort_logits = ort_session.run(None, ort_inputs)[0]
```

转换后的能耗对比（batch 1, ResNet-50）：

```
版本              GPU 能耗 (J)    CPU 能耗 (J)    总能耗 (J)    推理时间 (s)
───────────────────────────────────────────────────────────────────────────
PyTorch 原版       2,574           1,431           4,005         52.42
PyTorch → ONNX     2,039           629             2,668         38.46
节省比例                     ~21%            ~56%            ~33%          ~27%
```

ONNX 版本省了超过三分之一的能耗。CPU 能耗大幅下降（从 1431J 到 629J），说明 ONNX 运行时更有效地把计算调度到了 GPU。

### 示例 3：对比 TensorRT vs CUDA 执行器

```python
import onnxruntime as ort

# CUDA 执行器：通用后端
sess_cuda = ort.InferenceSession(
    "resnet50.onnx",
    providers=["CUDAExecutionProvider"]
)

# TensorRT 执行器：推理优化后端
sess_tensorrt = ort.InferenceSession(
    "resnet50.onnx",
    providers=["TensorrtExecutionProvider"]
)

# 同一输入，不同后端
inputs = {"input": x.numpy()}

# CUDA
logits_cuda = sess_cuda.run(None, inputs)[0]
# TensorRT
logits_tensorrt = sess_tensorrt.run(None, inputs)[0]

# 验证输出一致（转换不改变精度）
assert abs(logits_cuda - logits_tensorrt).max() < 1e-4
```

TensorRT vs CUDA 在 ResNet-50 上的能耗对比（batch 1）：

```
后端          GPU 能耗 (J)    CPU 能耗 (J)    总能耗 (J)    推理时间 (s)
───────────────────────────────────────────────────────────────────────────
CUDA           2,197           476             2,673         42.56
TensorRT       1,703           411             2,114         32.05
节省比例               ~22%            ~14%            ~21%          ~25%
```

## 踩过的坑

1. **TensorFlow 在 batch 1 时 GPU 利用率极低**：MobileNet 上 GPU 仅 8% 利用率，但 CPU 能耗是 MXNet 的 8 倍——因为大部分工作被甩给了 CPU。不要只看 GPU 功耗，**CPU + GPU 总和才是总账单**。

2. **ONNX 转换不是万能灵药**：batch 64 时，从 MXNet 转出的 MobileNet 和 ResNet 分别**多耗 10-13%** 能量和推理时间。大 batch 下转换层的额外开销抵消了优化收益。

3. **MXNet 转 ONNX 有兼容性问题**：MXNet 和 TensorFlow 导出的 BERT 模型被 ONNX Runtime 标记为"无效"，只有 PyTorch 转的 BERT 能正常运行。跨框架转换前先做兼容性检查。

4. **精度不会变但数值可能微差**：论文确认 ONNX 转换后精度不变，但 GPU 计算浮点顺序可能有微小差异，最终 logits 可能有 1e-4 级别的数值偏差。产品上要注意阈值比较不要做得太严格。

5. **测试环境的代表性**：实验用的是消费级 GPU（RTX 3070）和 CPU（i7-11850H），不是数据中心级别的 A100/H100。消费级 CPU 和 GPU 之间的功耗比（约 38-52%）说明 CPU 开销更大——在数据中心环境下这个比例可能不同。

## 适用 vs 不适用场景

**适用**：

- 推理阶段**能耗敏感**的生产环境——选对框架和执行器省的是持续电费
- 需要**跨框架部署**的场景——ONNX 是事实标准，先做能耗基准测试再决定
- **移动端/边缘设备**部署——电池和散热有限，能耗就是用户体验
- 评估新模型上线前的**碳足迹**——把能耗换算成 CO2 排放量

**不适用**：

- 只关注训练阶段的优化——本文只研究推理阶段，训练能耗分析需看其他论文
- 需要极致低延迟的微秒级推理——框架选择之外还要看算子层面优化
- 多 GPU / 多机分布式推理——本文测试环境是单机单 GPU
- 大语言模型文本生成——论文仅测了 BERT（分类任务），生成式 LLM 行为不同

## 学到什么

1. **"框架只是运行时，不是魔法"——选框架要像选数据库一样做 benchmark，不能凭喜好**
2. **总能耗 = GPU 能耗 + CPU 能耗**——只看 GPU 是盲人摸象
3. **ONNX 转换在 batch 1 时几乎总是赢家**，但 batch 64 时需谨慎——转换不是免费午餐
4. **TensorRT 作为 ONNX 后端是最省的选择**——如果生态允许，优先用
5. **GPU 利用率低不代表省电**——低利用率 + CPU 补位是最浪费的组合
6. **没有银弹**——不同模型、不同 batch size 的最优解不同，必须实测

## 历史小故事（可跳过）

- **2019 年**：Strubell 等人发表 "Energy and Policy Considerations for Deep Learning"，首次引起业界对 DL 碳足迹的关注
- **2020 年**：Schwartz 等人正式提出 "Green AI" 概念，呼吁从精度竞赛转向效率竞赛
- **2020 年**：CarbonTracker（Anthony et al.）等工具出现，帮助训练阶段追踪能耗
- **2022 年**：Georgiou et al. 对比 PyTorch 和 TensorFlow 的能耗，但未测 MXNet 和 ONNX
- **2024 年 2 月**：本文 arXiv 上传，首次系统性地加入 MXNet + ONNX + 执行器对比
- **2024 年 4 月**：在 Lisbon 的 AI Eng 2024 会议上正式发表

## 延伸阅读

- 论文 PDF（10 页）：[arXiv 2402.13640](https://arxiv.org/abs/2402.13640)
- 原 Green AI 论文：[Schwartz et al., 2019](https://arxiv.org/abs/1907.10597)（Green AI 概念起源）
- 碳足迹追踪：[CarbonTracker](https://github.com/lfwa/carbontracker)（训练阶段能耗追踪工具）
- [[greenai-overview]] —— Green AI 全景综述
- [[inference-optimization]] —— 推理优化的其他思路（量化、剪枝、蒸馏）

## 关联

- [[greenai-overview]] —— Green AI 全景综述
- [[inference-optimization]] —— 推理优化（量化、剪枝、蒸馏）的其他路径
- [[carbontracker]] —— 训练阶段能耗追踪工具
- [[strubell-2019]] —— 首次量化 NLP 模型的碳足迹
- [[georgiou-2022]] —— 同期研究，对比 PyTorch 和 TensorFlow 能耗
