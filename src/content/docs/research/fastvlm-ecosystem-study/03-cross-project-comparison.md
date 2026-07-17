---
title: "跨项目架构比较与选型"
sidebar:
  hidden: true
---
# 跨项目架构比较与选型

## 1. 核心模型比较

| 项目 | 视觉输入策略 | token 控制位置 | 语言模型 | 主要部署 | 核心优势 | 主要代价 |
|---|---|---|---|---|---|---|
| FastVLM | 单图高分辨率，分层骨干 | 视觉塔内部 | Qwen2/Vicuna | Core ML + MLX | 同时压视觉延迟和 prefill | 需专用视觉塔 |
| MobileVLM V2 | CLIP 固定分辨率 | LDPv2 projector | MobileLLaMA | llama.cpp/移动端 | projector 简单直接 | 视觉塔成本仍在 |
| LLaVA-OneVision | base + AnyRes tiles | 空间 merge/pool | Qwen2 等 | GPU/SGLang | 多图、视频、任意比例 | tile/token 多，端侧重 |
| MiniCPM-V | base + slices | resampler/编码器内部压缩 | Qwen/Qwen3.5 | PyTorch/GGUF/三端 App | 跨平台、图像视频能力完整 | 多代代码与 runtime 复杂 |
| SmolVLM | 动态 patch，少 token | connector/模型设计 | SmolLM | Transformers/ONNX/WebGPU | 全开放训练、内存小 | 细节任务有压缩上限 |
| Moondream | 全局 + 重叠局部 crop | 重建 + projection | 专用 text/MoE | PyTorch/边缘端 | region 能力和同图多问缓存 | 专用架构，crop 成本 |

## 2. FastVLM 与 FastV 不要混淆

| 维度 | FastVLM | FastV |
|---|---|---|
| 优化位置 | 视觉编码器 | LLM 中间层 |
| 是否需要新视觉塔 | 是 | 否 |
| 是否减少视觉编码成本 | 是 | 否 |
| 是否减少 LLM prefill 深层成本 | 是，因初始 token 少 | 是，K 层后 token 少 |
| 是否依赖问题文本 | 否 | 主要看早期 attention，通常不显式问题自适应设计 |
| 推理图复杂度 | 主路径相对固定 | 动态 top-k/index/mask |
| 迁移现有模型 | 需重新训练/适配 | 较容易，但需修改 decoder |

两者可以理论上组合：FastVLM 先少产 token，FastV 再在 LLM 深层裁 token。但起始 token 已少时，FastV 的收益可能下降，动态裁剪开销占比可能上升，必须实测。

## 3. 四种 token 压缩策略

### 3.1 Pooling

代表：MobileVLM LDPv2、LLaVA video pool。

做法：将 token 恢复为二维网格，用 average/max/adaptive pooling 降低网格大小。

适合：

- 空间分布较均匀；
- 希望固定 token 数；
- 算子需要简单、易部署。

风险：

- 小文字、小物体可能被平均掉；
- pooling 不看问题，不知道用户关心哪里。

### 3.2 Resampling

代表：MiniCPM-V Perceiver resampler。

做法：固定数量可学习 query 对可变视觉序列做 cross-attention。

适合：

- 输入图片/切片数变化；
- 希望稳定 LLM token 预算；
- 能接受额外可训练模块。

风险：

- query 数形成信息瓶颈；
- 训练和导出链更复杂。

### 3.3 Prune/Merge

代表：PruMerge、FastV、SparseVLM。

做法：根据注意力/相似性选重要 token；不重要 token 丢弃或聚类合并。

适合：

- 已有 ViT/LLaVA 模型，无法重训视觉骨干；
- 需要可调 token budget；
- GPU runtime 支持动态索引。

风险：

- attention score 不是可靠解释；
- OCR/计数需要的低注意力细节可能被裁；
- 不同 prompt 的 token 重要性不同；
- 动态 shape 会影响 kernel 效率。

### 3.4 Active Acquisition

代表：AdaptVision、VLMKit 的系统级近似方案。

做法：先看低成本全局信息，再请求局部高清图。

适合：

- 高分辨率细节只集中在局部；
- 任务允许多轮；
- 能检测/定位感兴趣区域。

风险：

- 第一轮必须足以定位；
- 工具调用格式、bbox 和轮数都可能失败；
- 多次模型调用增加尾延迟。

## 4. FastViTHD 与普通 ViT 的结构差异

| 维度 | 普通 ViT | FastViTHD |
|---|---|---|
| 空间分辨率 | 通常较长时间保持固定 token 网格 | 每阶段继续下采样 |
| 早期 token mixer | self-attention | RepMixer/卷积 |
| 后期 token mixer | self-attention | self-attention |
| 高分辨率成本 | token 数增大后 attention 昂贵 | 大特征图主要用卷积 |
| 输出 token | 由 patch size/分辨率直接决定 | 由层次化下采样共同决定 |
| 部署优化 | 依赖 attention kernel | 可利用卷积和结构重参数化 |

关键不是“卷积一定比 Transformer 好”，而是让局部、规则的大图计算使用硬件友好的卷积，把全局注意力推迟到小特征图。

## 5. 训练与推理项目边界

| 项目 | 模型定义 | 训练 | 转换/量化 | App/服务 |
|---|---:|---:|---:|---:|
| FastVLM | 是 | LLaVA 派生，说明不完整 | Core ML + MLX | iOS/macOS |
| MobileCLIP | 是 | OpenCLIP patch | Core ML 示例 | iOS 分类 |
| RayGen | 否 | 数据生成 | 不适用 | Ray job |
| LLaVA | 是 | 完整 SFT | 少量 | Gradio/worker |
| MLX-VLM | 多模型 | LoRA/SFT/偏好训练 | 多种量化 | CLI/API/Gradio |
| MLX Swift LM | 多模型 | LoRA/部分训练 | 运行时加载 | Swift package |
| MiniCPM-V | 多代 | 微调脚本 | 依赖外部生态 | Web demo |
| MiniCPM-V Apps | 否 | 否 | GGUF 资产 | iOS/Android/Harmony |
| SmolVLM | 是 | 完整训练/数据 | ONNX 生态 | 外部 demo |
| Moondream | 是 | examples/finetune | 自定义量化层 | recipes/API |

## 6. 运行时比较

### Core ML + MLX

适合 Apple 设备。FastVLM 官方示例将视觉塔和 LLM 分开，让不同模型部分使用更合适的后端。

注意：

- Core ML conversion 成功不代表一定跑 ANE；
- `compute_units`、算子支持、精度和 deployment target 都会影响调度；
- MLX GPU 共享统一内存，峰值与 App 其他内存竞争。

### MLX Swift LM

适合原生 Swift 应用，优势是：

- 统一模型 factory；
- Swift concurrency；
- tokenizer/downloader 协议；
- VLM processor；
- guided generation；
- 与 FoundationModels API 的适配。

代价是快速迭代带来的 API 版本迁移。

### GGUF + llama.cpp/mtmd

适合跨平台和 CPU/GPU 混合部署。MiniCPM-V Apps 说明真实产品必须处理：

- 文本权重与 mmproj 配对；
- context size；
- KV cache shift；
- JNI/Objective-C++ 边界；
- 下载校验；
- 内存不足与取消。

### ONNX Runtime

适合把模型拆成固定 IO graph，并切换 execution provider。USLS 的三个 engine 结构清晰，但要求：

- token id、shape、KV cache IO 完全匹配导出模型；
- 不同模型规格需要显式配置；
- 动态循环仍由宿主语言实现。

## 7. 端侧 App 工程比较

| 维度 | FastVLM App | MiniCPM-V Apps | VLMKit |
|---|---|---|---|
| UI | SwiftUI | UIKit/Kotlin/Harmony | Swift package + demo |
| 推理 | Core ML vision + MLX LLM | GGUF + llama.cpp/mtmd | MLX Swift LM backend |
| 连续相机 | 最新帧流、串行生成 | 定时抽帧/live stream | recipe 级 |
| 结构化输出 | 纯文本为主 | 聊天/多模态 | Decodable task + JSON 修复 |
| 内存策略 | MLX cache limit | 设备内存探测、batch/ubatch | 依赖 backend |
| 跨平台 | Apple | iOS/Android/Harmony | Apple |

## 8. 选型决策表

### 需要最快的 Apple 单图首响应

优先验证 FastVLM 0.5B/1.5B，重点测：

- 目标 iPhone 的 TTFT；
- 真实 prompt 输出质量；
- 连续运行温升；
- Core ML 视觉塔是否命中目标计算单元。

### 需要跨 iOS/Android/Harmony

先看 MiniCPM-V Apps 的 GGUF/mtmd 路线。不要直接假设 FastVLM Swift App 可平移到 Android。

### 需要浏览器零安装

看 FastVLM WebGPU/SmolVLM Transformers.js 生态。重点不是仓库编译，而是：

- 模型下载大小；
- WebGPU feature；
- 摄像头权限；
- 浏览器内存；
- 静态托管配置。

### 需要 OCR/文档细节

比较：

1. FastVLM 高分辨率单图；
2. MiniCPM-V 多 slice；
3. LLaVA-OneVision AnyRes；
4. AdaptVision 局部高清；
5. VLMKit Vision OCR + VLM。

不能只看通用 VQA 平均分。

### 需要计数/定位/测量

纯 VLM 容易在精确计数和坐标上失败。优先考虑 VLMKit 类“传统视觉做精确感知，VLM 做语义”的组合。

### 已有 LLaVA 模型，不能重训

优先试 FastV/SparseVLM/PruMerge，但必须建立任务特定回归集，确认裁 token 没伤害关键细节。

## 9. 可组合与不可直接组合

### 可以探索组合

- FastVLM + MLX vision feature cache：同图多问。
- FastVLM + guided JSON generation：结构化抽取。
- FastVLM + Vision OCR/检测：专家模型补精确能力。
- FastVLM + AdaptVision 式 crop：低清定位后局部高清。
- FastVLM + LoRA：领域 prompt/输出格式适配。

### 不可直接假设

- FastVLM 的 Core ML 视觉塔可以直接替换任意 VLM 视觉塔。
- MiniCPM-V 的 resampler 权重可迁移到 FastVLM。
- FastV/SparseVLM 的固定 token index 可直接用于 FastVLM。
- 浏览器 benchmark 可代表 iPhone 原生 App。
- 参数更小一定更省内存。

## 10. 统一验证矩阵

后续真机比较至少固定：

| 维度 | 固定项 |
|---|---|
| 输入 | 同一原图、同一方向、同一色彩空间 |
| prompt | 同一文本、同一语言 |
| 输出 | 同一 max tokens、temperature、stop tokens |
| 状态 | 冷启动与热启动分开 |
| 设备 | 型号、OS、内存、低电量模式 |
| 指标 | 下载、加载、视觉编码、prefill、TTFT、decode tok/s |
| 资源 | 峰值内存、能耗、温升、持续 10 分钟帧率 |
| 质量 | caption、OCR、计数、空间、幻觉、结构化成功率 |

只有这张矩阵固定后，才有资格比较“哪个项目更快”。
