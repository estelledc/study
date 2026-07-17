# 21 个项目架构与源码深挖

## 阅读说明

每个项目按四个维度整理：

- **定位**：它在生态中的职责。
- **架构/控制流**：输入如何经过核心模块得到输出。
- **代码组织**：最值得读的目录与文件。
- **边界**：代码当前能证明什么，不能证明什么。

## 1. apple/ml-fastvlm

### 定位

FastVLM 官方实现，包含 PyTorch 推理、LLaVA 派生训练代码、Core ML/MLX 导出与 iOS/macOS demo。

### 架构

`fastvithd()` 创建五阶段 `FastViT`：

- 2/12/24 个 RepMixer block 负责前三阶段；
- 4/2 个 Attention block 负责后两阶段；
- embedding 维度逐步从 96 增长到 1536；
- 每阶段之间用 `PatchEmbed(stride=2)` 下采样；
- `MobileCLIPVisionTower` 将最终 `[B,C,H,W]` 展平成 `[B,H*W,C]`；
- `mm_projector` 默认用 `mlp2x_gelu` 映射到 LLM hidden size；
- LLaVA 将视觉 embedding 插入 `<image>` token 位置；
- Qwen2/Vicuna decoder 完成 prefill 与自回归生成。

### 端侧链路

- `model_export/export_vision_encoder.py` 补齐 processor/tokenizer 元数据并导出 `fastvithd.mlpackage`。
- 官方导出说明在固定 commit 的 `mlx-vlm` 上应用补丁，只转换 LLM，视觉塔单独走 Core ML。
- Swift `FastVLM` 用 Core ML 视觉模型、MLX projector/Qwen2 和 KV cache。
- `FastVLMModel.generate` 串行生成、支持取消、每 4 token 更新 UI 并记录 TTFT。
- `ContentView` 用两个 `AsyncStream` 分离显示与分析，分析流 `bufferingNewest(1)`。

### 代码组织

- `llava/model/multimodal_encoder/mobileclip/mci.py`：FastViTHD。
- `llava/model/multimodal_encoder/mobileclip_encoder.py`：视觉塔适配。
- `llava/model/llava_arch.py`：视觉/文本融合。
- `llava/train/`：LLaVA 训练。
- `model_export/`：Core ML + MLX 导出。
- `app/FastVLM/`：Swift 模型。
- `app/FastVLM App/`：相机和 UI。

### 边界

- 仓库只有一个 2025-05-05 主提交，研究发布完整但后续代码演化较少。
- 没有内置完整训练脚本矩阵，训练说明要求回到 LLaVA。
- 论文指标来自作者测试，本轮未本地复现。

## 2. apple/ml-fastvit

### 定位

FastViTHD 的架构前身，解释 FastVLM 为什么采用混合卷积/Transformer 和结构重参数化。

### 架构

`FastViT` 由卷积 stem、多个 stage、stage 间 patch merge 和分类/特征头组成。每个 stage 可选择：

- `RepMixerBlock`：局部 token mixing；
- `AttentionBlock`：全局关系；
- `RepCPE`：可重参数化位置编码。

训练图的 MobileOne/RepMixer 可有多条 Conv-BN/identity 分支，`reparameterize_model()` 深拷贝模型并逐模块调用 `reparameterize()`，将等价 kernel/bias 融合成单分支推理图。

### 代码组织

- `models/fastvit.py`：主网络和模型变体。
- `models/modules/mobileone.py`：分支融合。
- `models/modules/replknet.py`：大卷积核重参数化。
- `train.py`、`validate.py`：分类训练/验证。
- `export_model.py`：导出。

### 边界

FastViT 的目标包括分类、检测、分割；FastViTHD 在此基础上为 VLM 高分辨率与少 token 重新设计，不能把两者视为同一模型。

## 3. apple/ml-mobileclip

### 定位

移动图文表征模型与 FastViTHD 的预训练血缘。MobileCLIP2 也可作为 FastVLM 类模型的视觉 encoder。

### 架构

`CLIP` 由 image encoder 和 text transformer 组成，映射到共享 embedding 空间。`create_model_and_transforms()`：

1. 读取 JSON 配置；
2. 创建 resize/crop/tensor transform；
3. 构建 CLIP；
4. 加载 checkpoint；
5. 默认执行结构重参数化。

MobileCLIP2 S3/S4 继续使用五阶段 FastViT 变体，前三阶段 RepMixer、后两阶段 attention。

### 训练

仓库没有直接复制 OpenCLIP 全部源码，而是提供 `open_clip_v1.patch` / `open_clip_v2.patch`：

- 添加 dataset reinforcement 数据字段；
- 同时处理真实 caption、合成 caption 与 teacher embedding；
- 支持 teacher ensemble；
- 将 contrastive loss 与 distillation loss 组合；
- 配置 DataCompDR/DFNDR 训练命令。

### 代码组织

- `mobileclip/`：V1 模型和 tokenizer。
- `mobileclip2/`：S3/S4 架构接入。
- `training/`：OpenCLIP 补丁与训练配置。
- `eval/`：zero-shot ImageNet。
- `ios_app/`：Core ML 零样本分类示例。

### 边界

MobileCLIP 是 image-text embedding 模型，不是生成式 VLM；它提供高质量视觉表示，但没有 LLM 问答头。

## 4. apple/ml-mobileclip-dr

### 定位

RayGen 数据强化管线，解释 MobileCLIP/FastVLM 的效率之外，数据质量如何成为另一条性能杠杆。

### 控制流

```text
info.json / shard glob
  -> Ray Dataset
  -> GPU actor
  -> CaptionModel 或 EmbeddingModel
  -> 合成 caption / 多增强 teacher embedding
  -> ShardWriter
  -> 新 manifest + checkpoint
```

`CaptionModel` 用 CoCa 对每张图采样多个 caption。`EmbeddingModel`：

- 加载一个或多个 OpenCLIP teacher；
- 对图像执行可压缩记录的增强；
- 计算图像、真实文本、合成文本 embedding；
- 把增强参数与 embedding 写回数据分片。

### 代码组织

- `scripts/gen.py`：driver 与 actor 模型。
- `src/raygen/datasetio.py`：JSONL、tar、gzip、TFRecord 读写。
- `src/raygen/driver_utils.py`：Ray 初始化与 manifest。
- `src/raygen/cloud_common/`：对象存储、重试、checkpoint。
- `src/raygen/dr/`：可序列化增强。

### 边界

README 描述可扩到超大规模集群；本轮只确认了弹性 actor、分片和 checkpoint 设计，没有验证其规模数字。

## 5. haotian-liu/LLaVA

### 定位

视觉指令微调的基础实现，也是 FastVLM 训练代码的主要来源。

### 架构

`LlavaMetaModel` 组合：

- `vision_tower`
- `mm_projector`
- language model

`prepare_inputs_labels_for_multimodal()`：

1. 编码图片；
2. projector 映射维度；
3. 在文本 token 中定位 `<image>`；
4. 用视觉 embedding 替换占位位置；
5. 将视觉段 label 设为 ignore；
6. 对 batch 做 padding。

训练层提供 lazy dataset、conversation template、modality length sampler、DeepSpeed/LoRA 保存和多 benchmark 评测。

### 代码组织

- `llava/model/llava_arch.py`：多模态融合。
- `llava/model/multimodal_encoder/`：CLIP/S2。
- `llava/model/multimodal_projector/`：linear/MLP。
- `llava/train/train.py`：数据和训练入口。
- `llava/train/llava_trainer.py`：sampler/trainer。
- `llava/eval/`：GQA、ScienceQA、TextVQA、MMBench 等。

### 边界

该仓主线最后 push 较早，当前 LLaVA 后续工作已迁到 LLaVA-NeXT；读 FastVLM 血缘时有价值，但不代表 2026 年最新 LLaVA runtime。

## 6. Blaizzy/mlx-vlm

### 定位

Apple Silicon Python 端通用 VLM/omni 运行时。FastVLM 官方最初通过 patch 接入，当前主线已经原生支持。

### 架构

模型目录统一拆为：

- `config.py`
- `vision.py`
- `language.py`
- `processing.py`
- 主 `Model`

`MODEL_REMAPPING` 把 FastVLM checkpoint 的 `llava_qwen2` 映射到 `fastvlm`。主模型：

1. 根据视觉 patch embed dtype 转像素；
2. 运行 MLX FastViTHD；
3. flatten + MLP projector；
4. 用视觉 embedding 替换 image token；
5. 调 language model；
6. `sanitize()` 重写 PyTorch/HF 权重 key。

### 通用能力

当前仓库还包括：

- 多模型 registry；
- LoRA/DoRA/SFT/ORPO；
- 量化与 1-bit module；
- FastAPI/Gradio；
- continuous batching；
- automatic prefix caching；
- vision feature caching；
- 分布式推理。

### 代码组织

- `mlx_vlm/models/fastvlm/`：FastVLM。
- `mlx_vlm/utils.py`：模型发现、加载、权重映射。
- `mlx_vlm/generate.py`/CLI 入口由 package scripts 暴露。
- `mlx_vlm/trainer/`：微调。
- `mlx_vlm/server.py`：服务。

### 边界

这是快速演化的 runtime，当前 commit 的 Transformers/MLX 版本已远高于 FastVLM 官方 patch 固定版本。复现论文导出与使用最新版运行时是两个不同目标。

## 7. ml-explore/mlx-swift-examples

### 定位

MLX Swift 应用样例仓。FastVLM 原始 Xcode 工程依赖过它，但可复用的 `MLXLMCommon/MLXLLM/MLXVLM` 已迁到 `mlx-swift-lm`。

### 架构

当前职责主要是：

- `MLXChatExample`：LLM/VLM 聊天 App；
- `LLMBasic`/`LLMEval`：最小加载、生成与统计；
- LoRA、Stable Diffusion、MNIST 和数值计算样例。

### 代码组织

- `Applications/`：产品示例。
- `Libraries/`：仍留在本仓的 StableDiffusion/MNIST。
- `Package.swift`：依赖 `mlx-swift` 与 `swift-transformers`。

### 边界

研究 FastVLM runtime 时不要继续从该仓找最新 `FastVLM.swift`；最新实现已经在 `mlx-swift-lm/Libraries/MLXVLM/Models/`。

## 8. ml-explore/mlx-swift-lm

### 定位

当前 Swift 端 LLM/VLM 可复用库，也是 Apple 设备应用最重要的通用参考。

### 分层

- `MLXLMCommon`：配置、下载抽象、容器、生成循环、cache。
- `MLXLLM`：文本模型。
- `MLXVLM`：视觉语言模型、processor、factory。
- `MLXEmbedders`：embedding 模型。
- `MLXHuggingFace`：下载/tokenizer 集成。
- `MLXGuidedGeneration`：JSON Schema/EBNF 约束。
- `MLXFoundationModels`：适配 Apple FoundationModels API。

`VLMTypeRegistry` 同时注册 `fastvlm` 与 `llava_qwen2` 到 `FastVLM`。`VLMRegistry.fastvlm` 指向 MLX FastVLM 权重。Factory 负责：

1. resolve 模型目录；
2. 解码配置；
3. registry 创建模型；
4. 加载并 sanitize 权重；
5. 创建 processor/tokenizer；
6. 返回 `ModelContainer`。

### 边界

FastVLM 官方 App 中的模型实现是当时的内嵌版本；当前库已有更多模型和 3.x breaking changes，升级需要重新核对 config、processor 与 downloader 接口。

## 9. LLaVA-VL/LLaVA-NeXT

### 定位

LLaVA-OneVision、LLaVA-NeXT-Video 与后续训练线，FastVLM 论文的关键比较对象。

### 架构

AnyRes 控制流：

1. 根据原图长宽比选择 grid；
2. 生成 base image 和局部 patch；
3. 共用视觉塔编码；
4. 恢复二维 patch 布局；
5. unpad 去掉为等比缩放增加的空白；
6. 可做 `maxpool2x2` 或 anyres token 上限；
7. 插入 newline token；
8. 与文本序列拼接。

视频路径会对每帧二维 token 做 average/max/bilinear pool，并支持 slow/faster token 交错。

### 代码组织

- `llava/mm_utils.py`：AnyRes 预处理。
- `llava/model/llava_arch.py`：图像/视频 token 组织。
- `llava/model/multimodal_resampler/`：可选 resampler。
- `llava/train/`：SFT、DPO、采样策略。
- `docs/`：模型与评测入口。

### 边界

LLaVA-NeXT 追求通用多图/视频质量，FastVLM 追求高分辨率下的端侧 TTFT；两者优化目标不同。

## 10. Meituan-AutoML/MobileVLM

### 定位

早期移动端生成式 VLM 代表，采用 MobileLLaMA 和轻量 downsample projector。

### 架构

V1 `LDPBlock`：

- 两层 MLP 映射通道；
- token reshape 回二维；
- MobileNetV3 inverted residual；
- stride=2 下采样。

V2 `LDPNetV2Projector`：

- `FeatureIRLayer` 映射；
- `AdaptiveAvgPool2d((12,12))` 固定到 144 token；
- depthwise 位置卷积注入位置信息。

其余视觉 token 插入、训练和评测大量沿用 LLaVA。

### 代码组织

- `mobilevlm/model/vision_projector.py`：LDP/LDPv2。
- `mobilevlm/model/mobilevlm.py`：多模态融合。
- `mobilevlm/model/mobilellama.py`：语言模型包装。
- `mobilevlm/train/`：训练。
- `mobilellama/`：小语言模型训练说明。

### 边界

最后 push 在 2024 年，仍是理解 projector 压缩的好基线，但不是当前维护最活跃的跨端方案。

## 11. OpenBMB/MiniCPM-V

### 定位

跨图像、视频、语音的端侧模型族。2026 README 中 MiniCPM-V 4.6 采用 SigLIP2-400M + Qwen3.5-0.8B，并报告视觉编码器内部 4x/16x 压缩。

### 仓内可见实现

本地仓库代码横跨多个代际：

- `omnilmm/` 是较早的 EVA02 + Mistral + Perceiver resampler；
- `finetune/` 通过 Transformers remote model 加载较新版本；
- 高分辨率图片按面积和长宽比切成最多 N 个 patch；
- 每张 base/crop 用固定 `query_num` placeholder；
- 2.6 示例中每个 slice 可压到 64 token；
- 数据 collator 处理 image placeholder 和多种 LLM conversation schema。

### 代码组织

- `omnilmm/model/omnilmm.py`：旧版模型融合。
- `omnilmm/model/resampler.py`：2D Perceiver resampler。
- `finetune/dataset.py`：切片、placeholder、patch reshape。
- `finetune/finetune.py`：LoRA/全量微调。
- `eval_mm/`：VLMEvalKit 和 VQA。

### 边界

README 的 4.6 实现主要由最新 Transformers/model repo 提供，不能仅靠本仓 `omnilmm/` 文件还原 4.6 全部视觉内部压缩细节。材料把“当前模型声明”和“本地可读旧/通用代码”分开。

## 12. OpenBMB/MiniCPM-V-Apps

### 定位

MiniCPM-V iOS/Android/HarmonyOS 离线应用，重点不在训练，而在模型下载、GGUF runtime、相机/视频和内存管理。

### 架构

- iOS：Swift/UIKit + Objective-C++ bridge + llama.cpp/mtmd。
- Android：Kotlin coroutine + JNI + C++ llama/mtmd。
- HarmonyOS：对应原生应用层。
- GGUF 文本模型和 multimodal projector 分文件下载。
- generation loop 暴露取消、KV cache/context shift 和流式 token。
- iOS 根据 `os_proc_available_memory()` 调整 batch/ubatch，并申请 increased memory limit entitlement。

### 代码组织

- `MiniCPM-V-demo/Sources/Base/Model/`：iOS 模型引擎。
- `MiniCPM-V-demo/Sources/Base/Utils/MBDeviceMemoryProbe.swift`：内存策略。
- `MiniCPM-V-demo-Android/.../LlamaEngine.kt`：Android engine。
- `app/src/main/cpp/llama_jni.cpp`：JNI 解码循环。
- `DOWNLOAD.md`：模型资产契约。

### 边界

仓库没有清晰根许可证文件；多端源代码和 vendored runtime 的许可需要逐项核对。

## 13. huggingface/smollm

### 定位

SmolLM/SmolVLM 全开放训练仓。FastVLM 论文直接比较 SmolVLM 的 TTFT。

### 架构

SmolVLM2 基于 Idefics3：

- vision model 处理真实图片，过滤 batch 中全零 padding image；
- connector 投影/压缩视觉特征；
- 每张图对应固定长度 image token block；
- 自定义 `inputs_merger` 把 image block 替换到文本 image token；
- text-only 样本插入零长度视觉 slice，保持 DeepSpeed 计算图一致。

训练侧 `PackedConcatDataset` 把短样本拼接到 cutoff length，用整数 subsequence id 构造分块 attention，并按 token/sample/sqrt 方式调整 loss 权重。

### 代码组织

- `vision/smolvlm2/smolvlm/model/`：模型与 processor。
- `vision/smolvlm2/smolvlm/datasets/`：数据、packing、collator。
- `vision/smolvlm2/smolvlm/train/`：训练。
- `vision/data/`：数据处理。
- `vision/evaluation/`：评测。

### 边界

仓库包含多代 SmolVLM 和大量数据脚本。理解当前模型时必须先选定具体 release，不能把所有目录当成一个同时运行的系统。

## 14. m87-labs/moondream

### 定位

面向边缘设备的专用 VLM，不只是 LLaVA 换小 LLM，而是自定义视觉、文本、区域任务和推理循环。

### 架构

- 输入图生成全局 crop 与最多 12 个重叠局部 crop；
- ViT 编码每个 crop；
- 局部特征按 tiling 重建；
- 全局特征与重建局部特征拼接，经 MLP 投影到文本维度；
- 自定义文本模型支持 MoE、KV cache 和 flex attention；
- region 模块独立编码/解码坐标和尺寸；
- `encode_image()` 不只缓存视觉 embedding，还先在文本模型中 prefill，保存每层 KV cache，后续同图多问减少重复计算。

### 代码组织

- `moondream/torch/config.py`：文本、视觉、区域配置。
- `vision.py`：crop、ViT 和 projection。
- `moondream.py`：缓存、prefill、query/caption/detect/point。
- `region.py`：空间坐标。
- `recipes/`：视频打码、内容审核等应用。

### 边界

高分辨率依赖多 crop，视觉成本与 `max_crops` 直接相关；其专用 region head 不能自动代表通用开放式问答能力。

## 15. Amshaker/Mobile-O

### 定位

FastVLM 衍生的统一理解与图像生成模型，CVPR 2026 demo。

### 架构

- 理解路径复用 FastViTHD + Qwen2。
- 生成路径加入 SANA DiT 与 VAE。
- Qwen2 forward 强制输出 hidden states。
- `LayerwiseMobileFusion` 对最后 N 层做可学习 softmax 加权。
- 先压到较小 hidden dim，用 depthwise separable 1D conv 和 channel attention 精炼。
- 再投影到 DiT conditioning dim。
- 扩散训练与语言建模 loss 在统一模型中组合。

### 代码组织

- `mobileo/model/llava_arch.py`：VLM、DiT、VAE 组合。
- `mobileo/model/mobile_block.py`：轻量 connector。
- `mobileo/model/language_model/`：训练/推理包装。
- `mobileo/train/`：三阶段训练。
- `Mobile-O-App/`：Core ML/MLX iOS 导出和 Metal kernel。

### 边界

理解与生成统一增加了训练、权重和 runtime 复杂度。README 报告的 iPhone 性能未在本轮复现。

## 16. john-rocky/VLMKit

### 定位

Apple 平台的结构化 VLM 编排库，强调“传统 Vision 负责精确感知，VLM 负责语义”。

### 架构

核心协议：

- `VLMBackend`：模型生成接口；
- `RegionExtractor`：决定看哪里；
- `VLMTask<Output>`：prompt + Decodable schema；
- `VLMRunner`：生成、提取 JSON、修复、重试；
- `Aggregator`：汇总分区结果；
- `FanoutPipeline`：extract -> crop -> task -> aggregate。

由于只有一个 GPU 模型，区域调用按代码串行执行；单个区域失败后跳过并通过 `onError` 报告。

### 代码组织

- `Sources/VLMKit/Backend/`
- `Sources/VLMKit/Core/`
- `Sources/VLMKit/Extract/`
- `Sources/VLMKit/Recipes/`
- `Examples/VLMKitDemo/`

### 边界

这是 2026 年新、小型社区项目。架构思路值得参考，但 star、维护者数量和真实 benchmark 都不足以证明生产成熟度。

## 17. jamjamjon/usls

### 定位

Rust + ONNX Runtime 模型库，FastVLM 是其众多 VLM/vision model 之一。

### 架构

`Model` trait 不持有 engine，`Runtime<M>` 组合 model logic 与 `Engines`，解决多 engine 与可变借用问题。FastVLM 使用：

- `Visual`：图像 encoder；
- `Textual`：token embedding；
- `TextualDecoderMerged`：decoder + KV cache IO。

Rust 层找到 `<image>` token，把视觉 embedding 插入文本 embedding，循环调用 decoder，更新显式 past K/V。

### 代码组织

- `src/models/traits.rs`：统一模型/runtime。
- `src/models/vlm/fastvlm/`：FastVLM。
- `src/processor/`：图像和文本处理。
- `src/engine/`、`src/ort/`：ONNX Runtime。
- `examples/vlm/`：CLI。

### 边界

当前 FastVLM 代码只实现 0.5B shape 参数，token id 和 prompt 模板有硬编码。它展示跨后端架构，不代表对全部 FastVLM checkpoint 的即插即用支持。

## 18. Gumpest/SparseVLMs

### 定位

问题引导的视觉 token 稀疏方法，针对 FastV 的 text-agnostic 评分不足。

### 架构

- 在多模态输入准备阶段记录视觉 token 起点、长度和文本起点。
- LLM 初始 hidden states 计算视觉/文本相似性，选择 text raters。
- pruning location 默认 `[2, 6, 15]`。
- 在指定层读取 text-to-vision attention。
- 依据 `RETAIN_TOKN` 预算逐层 top-k。
- SparseVLM+ 进一步做 attention gravity correction 和高优先级 head 选择。
- 部分删除 token 按相似性聚类并合并，而非全部直接丢弃。

### 代码组织

- `llava/model/language_model/modelling_sparse_llama.py`：主稀疏控制流。
- `score.py`：token 预算和 attention 评分。
- `utils.py`：选择、聚类、merge。
- `sparse_llava_llama.py`：模型包装。
- `builder.py`：替换 attention module。

### 边界

默认 token 预算和 layer index 是离散配置；要迁移到不同视觉 token 长度/decoder 深度，需要重新验证。

## 19. 42Shawn/LLaVA-PruMerge

### 定位

视觉编码器出口的自适应 token 选择与合并。

### 架构

`token_prune_merge_advanced()`：

1. hook CLIP 第 23 层 Q/K projection；
2. 计算 CLS 对 patch 的 attention；
3. 用 IQR outlier 比例或固定比例选 top token；
4. 用 key cosine similarity 为保留 token 找邻居；
5. 按 attention 加权聚合；
6. 把其余 token 汇总为一个额外 token。

PruMerge+ 还加入规则化空间采样 token，避免只保留注意力热点而丢掉背景覆盖。

### 代码组织

核心几乎集中在 `llava/model/multimodal_encoder/clip_encoder.py`，其余主要是 LLaVA 副本。

### 边界

代码硬编码 CLIP 层 23、约 576 patch 和聚类 `k=32`，且 Python 双循环较重。它更像研究原型，不是通用高性能 token compressor。

## 20. pkunlp-icler/FastV

### 定位

在 LLM 中间层剪掉低注意力视觉 token的 plug-and-play 方法。

### 架构

- K 层之前保留全部 token；
- 从前一层 attention 取最后文本 token 对视觉 token 的平均注意力；
- 按 ratio 选 top visual token；
- K 层之后 hidden states、position/mask 或 KV cache 只保留选中 token；
- 支持原版每次 forward 重剪和 static KV cache 变体。

### 代码组织

- 主实现直接 fork/修改 Transformers `modeling_llama.py`。
- `src/FastV/lmms-eval/fastv_kvcache.py`：KV cache 版。
- `src/FastV/inference/`：可视化和 benchmark。
- 仓内含两份大体量 vendored Transformers，导致代码组织较重。

### 边界

FastV 不减少视觉塔与 LLM 前 K 层的成本。其实际延迟收益依赖动态索引和 attention 实现，理论 FLOPs 降低不必然等于设备端同等加速。

## 21. AdaptVision/AdaptVision

### 定位

2026 年主动视觉采集路线。目标不是固定压缩现有视觉 token，而是让模型决定是否获取新局部视觉信息。

### 架构

推理协议：

1. 下采样全图；
2. 模型在 `<tool_call>` 中输出 `request_local_region` 与绝对 bbox；
3. 校验 bbox；
4. 从原图裁剪，并在需要时放大；
5. 把 crop 作为新的 image 输入；
6. 多轮继续，直到 `<answer>` 或达到最大图像/轮数。

`VLLM_AdaptVision` 批量管理多条 rollout，缓存 bbox 和 crop，并用线程池处理局部图。训练基于 veRL，论文方法通过 RL 学习工具使用策略。

### 代码组织

- `scripts/vllm_adaptvision.py`：工具协议和多轮评测。
- `cookbooks/adaptvision.ipynb`：示例。
- `patches/megatron_v4.patch`：训练栈适配。
- `verl/`：vendored RL 框架，本轮未展开。

### 边界

该方法把问题从“压缩 token”变成“规划观察”。如果第一轮定位错、bbox 无效或模型反复调用工具，延迟和准确率都会恶化，必须设置轮数、图像数和格式校验。
