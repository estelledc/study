---
title: "端侧高效 VLM 生态与发展现状"
sidebar:
  hidden: true
---
# 端侧高效 VLM 生态与发展现状

## 1. 领域边界

本研究中的 VLM 指“接受图像/视频与文本问题，输出文本或结构化结果”的视觉语言模型。重点不是云端最大模型，而是满足以下约束的端侧/边缘模型：

- 设备内存有限；
- 首响应必须快；
- 可能持续读取相机；
- 需要隐私、本地离线或低网络依赖；
- 部署后端不是训练时的 CUDA，而是 Core ML、MLX、GGUF、ONNX Runtime、WebGPU 等。

端侧 VLM 的核心矛盾是：高分辨率有利于 OCR、小物体和文档理解，但视觉计算与视觉 token 数会快速增加。

## 2. 不要只看模型参数量

VLM 的推理成本至少有五部分：

```text
图像预处理
+ 视觉编码器
+ projector / resampler
+ LLM prefill
+ LLM autoregressive decode
```

模型总参数量只能粗略反映权重内存，不能直接代表：

- 一张图生成多少视觉 token；
- 视觉塔在目标硬件上的算子效率；
- prefill 要处理多长序列；
- KV cache 多大；
- 第一个 token 和后续 token 各自多快；
- 持续相机运行是否稳定。

FastVLM、SmolVLM、MiniCPM-V 和 Moondream 参数规模接近时，视觉输入策略仍可能完全不同。

## 3. 视觉 token 从哪里来

### 普通 ViT

ViT 把图片切成固定 patch。若 patch 大小不变，分辨率的长宽各翻倍，patch/token 数约变成四倍。自注意力对 token 数通常具有二次项，LLM prefill 也要处理更长序列。

### 层次化视觉骨干

FastViT/FastViTHD 像 CNN 一样逐阶段降低空间尺寸。早期在大特征图上使用卷积，后期在小特征图上使用注意力，从结构上限制最终 token 数。

### 切片与 AnyRes

LLaVA-OneVision、MiniCPM-V、Moondream 会把高分辨率图分成全局图和局部 crop。它们保留细节，但代价是视觉塔要处理更多图块，必须再池化或压缩 token。

## 4. 六类效率路线

### 路线 A：重做视觉编码器

代表：FastVLM、FastViT、MobileCLIP。

机制：

- 用卷积/注意力混合骨干提高高分辨率编码效率；
- 分层下采样减少最终二维网格；
- 通过结构重参数化优化推理图；
- 用图文预训练提高少 token 下的表示质量。

优点：

- 主推理路径简单；
- 不依赖每个问题动态裁 token；
- 视觉编码和 LLM prefill 都可能受益。

代价：

- 需要重新预训练视觉塔和训练 VLM；
- 新骨干的权重、算子和导出链需要维护；
- 不能像纯推理补丁一样直接套在任意现有模型上。

### 路线 B：在 projector/resampler 压缩

代表：MobileVLM、MiniCPM-V、SmolVLM。

机制：

- MobileVLM 的 LDPv2 把视觉 token reshape 回二维网格，池化到 `12 x 12`，再注入位置特征。
- MiniCPM-V 用固定数量 query 的 Perceiver resampler 把可变视觉序列压成固定 token。
- SmolVLM 继承 Idefics3 connector，并让每图只占较少 token。

优点：

- 视觉塔可以复用成熟 CLIP/SigLIP；
- token 预算容易控制；
- 和 LLM 的接口稳定。

代价：

- 视觉塔本身仍可能很慢；
- 压缩发生在编码之后，前面的计算已经支付；
- 固定压缩容易损失 OCR、小物体和精确空间信息。

### 路线 C：高分辨率切片与重建

代表：LLaVA-NeXT、MiniCPM-V、Moondream。

机制：

- 低分辨率全局图提供整体语义；
- 局部 crop 保留细节；
- 按原始长宽比恢复二维布局；
- 再池化、resample 或与全局特征融合。

优点：

- 文档、图表和细粒度场景更强；
- 能处理非方形图片。

代价：

- crop 数量使视觉编码成本增加；
- token 拼接、newline、网格和 placeholder 管理复杂；
- 不同任务的最佳切片数不同。

### 路线 D：静态或自适应 token 裁剪

代表：PruMerge、FastV、SparseVLM。

机制差异：

- PruMerge 在视觉塔出口用 CLS 注意力选 token，并聚合未选 token。
- FastV 在 LLM 第 K 层后按早期注意力保留视觉 token。
- SparseVLM 用问题文本选择视觉 token，在多层逐步缩减，并对部分删除 token 聚类合并。

优点：

- 可在现有 ViT/LLaVA 系模型上验证；
- token 预算可调；
- 不一定需要重训整个视觉塔。

代价：

- 注意力本身不等同于真实重要性；
- 动态索引、mask、KV cache 与 FlashAttention 兼容复杂；
- 实现通常绑死具体模型层、token 起点或分辨率。

### 路线 E：主动视觉采集

代表：AdaptVision。

机制：

1. 先给模型低分辨率全图。
2. 模型输出 `request_local_region(bbox)` 工具调用。
3. 系统从原图裁出高清局部区域。
4. 把 crop 作为新一轮图像输入。
5. 模型继续推理或给最终答案。

优点：

- 不需要一开始为整图支付最高分辨率成本；
- token 预算与问题相关；
- 适合“先定位，再细看”的任务。

代价：

- 多轮生成增加延迟；
- bbox 错误会让后续观察失效；
- 需要工具协议、状态管理、最大轮数和 RL 训练。

### 路线 F：系统编排与专家协作

代表：VLMKit、Mobile-O。

VLMKit 不是改变模型权重，而是让 Apple Vision/ARKit 先做检测、分割、OCR 或深度，再让 VLM 负责语义理解。Mobile-O 则把 VLM 隐状态作为轻量扩散模型的条件，统一理解与图像生成。

这类方案说明端侧多模态产品的竞争力不只来自单模型 benchmark，还来自：

- 任务分解；
- 专家模型选择；
- 结构化结果；
- 缓存与取消；
- UI/相机/内存工程。

## 5. 训练生态

### LLaVA 两/三阶段训练

典型过程：

1. 视觉-语言连接器对齐；
2. 高分辨率或更大数据继续训练；
3. 视觉指令微调。

FastVLM 继承 LLaVA 的数据格式、trainer、图像 token 插入和评测结构。

### 数据强化

MobileCLIP RayGen 展示了另一条杠杆：不只改模型，还用强 teacher 给海量图文数据增加：

- 合成 caption；
- 多个视觉增强下的图像 embedding；
- 文本 embedding；
- teacher ensemble 监督。

RayGen 把数据分片变成 Ray Dataset，GPU actor 处理后写新分片，并记录 checkpoint。代码宣称可扩到大规模集群，但本轮只核对架构，没有验证该规模。

### 小模型训练效率

SmolVLM 的 `PackedConcatDataset` 把多个短样本拼到一个长序列，用 subsequence id 构造 block-diagonal attention，减少 padding 浪费。它说明“模型推理省 token”和“训练时提高 token 利用率”是两件不同但都重要的事。

## 6. 部署生态

### Apple 官方混合后端

FastVLM：

- Core ML 视觉塔；
- MLX 语言模型；
- SwiftUI + AVFoundation 相机；
- 本地模型下载和流式生成。

### MLX 通用化

MLX-VLM 和 MLX Swift LM 都把模型拆成：

- config；
- vision model；
- language model；
- processor；
- model registry/factory；
- weight sanitize/remap；
- generate/cache。

这使 FastVLM 不再只能在论文 demo 中运行，而能进入统一模型加载生态。

### GGUF/llama.cpp 多端

MiniCPM-V Apps 展示：

- iOS 原生 Swift/Objective-C++ bridge；
- Android Kotlin/JNI/C++；
- HarmonyOS；
- GGUF 文本模型与 multimodal projector；
- KV cache、context shift、取消、断点下载和内存预估。

### ONNX Runtime

USLS 将 FastVLM 拆成三个 engine：

1. `Visual`
2. `Textual`
3. `TextualDecoderMerged`

Rust 代码负责预处理、embedding 合并、KV cache 和循环解码。好处是可切换 CoreML、CUDA、OpenVINO、QNN 等 execution provider；代价是模型导出接口必须非常稳定。

### 浏览器 WebGPU

Apple/Hugging Face 发布了 FastVLM WebGPU demo。它证明轻量 VLM 可以零安装运行，但浏览器模型下载、WebGPU 兼容、静态 Space 配置和持续摄像头性能仍是独立工程问题。该 Space 不是 GitHub 仓库，因此只作为外部来源登记。

## 7. 2026 年生态现状

### 趋势一：优化从“参数量”转向“视觉 token 生命周期”

现在需要问：

- token 在视觉塔哪里产生？
- 是否在 projector 压缩？
- 是否在 LLM 中途删除？
- 是否能按问题主动获取新 token？
- token 被删除后，信息是丢弃还是聚合？

### 趋势二：模型与运行时解耦

同一个 FastVLM 已出现 PyTorch、MLX Python、MLX Swift、Core ML 和 ONNX Runtime 组织方式。模型论文只定义数学结构，生产可用性越来越由 runtime adapter 决定。

### 趋势三：端侧不再只做静态单图 caption

项目已经扩展到：

- 连续相机问答；
- 视频理解；
- 结构化表单/票据抽取；
- 区域定位和计数；
- 视觉理解 + 图像生成；
- 音视频全双工交互。

### 趋势四：主动视觉优于盲目全图升分辨率

AdaptVision 和 VLMKit 从不同方向得出相似系统原则：先决定“哪里值得看”，再把高成本视觉计算放到局部区域。前者让 VLM 自己调用 crop 工具，后者让传统 Vision 框架先切区域。

## 8. 当前真实缺口

1. 缺少统一的真机 benchmark：同一图片、同一 prompt、同一输出长度、同一热状态。
2. TTFT、tokens/s、峰值内存、能耗和模型质量常被分散报告。
3. 小模型输出越长，语言先验和重复退化越明显。
4. 视觉压缩在 OCR/计数/空间任务上的失败模式没有统一回归集。
5. 持续视频场景需要背压、采样和取消，否则模型再快也会堆积旧帧。
6. 许可证往往分为代码、模型、数据三套，fork 不代表可商用。
