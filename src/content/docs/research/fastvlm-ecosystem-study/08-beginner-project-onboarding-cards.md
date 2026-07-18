---
title: "零基础项目上手卡：21 个项目从哪里读起"
sidebar:
  hidden: true
---
# 零基础项目上手卡：21 个项目从哪里读起

> 完整机制见[项目深挖](02-project-deep-dives.md)，版本见
> [仓库清单](05-repository-inventory.md)。

## 使用方法

1. 先选视觉骨干、projector/resampler、LLM pruning、runtime 或 App 工程。
2. 复述输入、token 变化和输出，再打开 2-5 个源码锚点。
3. 先判断证据是 E0/E1/E2，再讨论“快”或“省内存”。
4. 本页没有任何真机性能 E2；最小预算实验只验证公式和测量合同。

## 核心血缘与运行时

### 1. FastVLM

- **类比与输入输出**：让“眼睛”从源头更快写出更少视觉笔记；输入高分辨率图和问题，输出视觉 token、projected embedding 和文字。
- **主链**：image → FastViTHD → flatten → MLP projector → replace `<image>` → Qwen2/Vicuna prefill/decode。
- **源码锚点**：`llava/model/multimodal_encoder/mobileclip/mci.py`、`llava/model/multimodal_encoder/mobileclip_encoder.py`、`llava/model/llava_arch.py`、`model_export/`、`app/FastVLM/`。
- **取舍**：同时优化视觉塔和 prefill，代价是专用视觉塔需训练、导出和 runtime 适配。
- **证据与第一项任务**：**E1**；追踪 `[B,C,H,W]` 到 `[B,H*W,C]`，记录视觉 token 数第一次确定的位置。

### 2. FastViT

- **类比与输入输出**：训练时用多条支路练能力，部署前折叠成单一路径；输入图像，输出分层视觉特征。
- **主链**：conv stem → RepMixer/Attention stages → patch merge → feature/classification head → reparameterize。
- **源码锚点**：`models/fastvit.py`、`models/modules/mobileone.py`、`models/modules/replknet.py`、`train.py`、`export_model.py`。
- **取舍**：训练图丰富、推理图简单，代价是转换后权重等价性和下游导出都要验证。
- **证据与第一项任务**：**E1**；找一个 Conv-BN 分支，解释 kernel/bias 如何融合，为什么这不是量化。

### 3. MobileCLIP

- **类比与输入输出**：让图片和文字在同一坐标系中靠近，作为 FastVLM 视觉表示血缘；输入 image/text，输出共享 embedding。
- **主链**：config → image/text encoders → normalized embeddings → contrastive/distillation loss → reparameterized model。
- **源码锚点**：`mobileclip/`、`mobileclip2/`、`training/`、`eval/`、`ios_app/`。
- **取舍**：移动视觉表征强且部署友好，代价是它本身没有生成式 LLM 问答头。
- **证据与第一项任务**：**E1**；比较 CLIP shared embedding 与 FastVLM projector hidden size，说明两种“对齐”目标不同。

### 4. MobileCLIP RayGen

- **类比与输入输出**：大规模数据工厂为每张图补 caption 和 teacher embedding；输入数据 shard，输出增强 shard/manifest/checkpoint。
- **主链**：manifest → Ray Dataset → GPU actor → caption/embedding → ShardWriter → checkpoint。
- **源码锚点**：`scripts/gen.py`、`src/raygen/datasetio.py`、`src/raygen/driver_utils.py`、`src/raygen/cloud_common/`、`src/raygen/dr/`。
- **取舍**：数据强化提升小模型上限，代价是 teacher 偏差、对象存储和大规模重跑成本。
- **证据与第一项任务**：**E1**；追踪一个 shard 的幂等/checkpoint 边界，找出 actor 重启可能重复写的位置。

### 5. LLaVA

- **类比与输入输出**：把视觉向量插入文本句子里的通用多模态训练骨架；输入图像和 conversation，输出 LLM logits/回答。
- **主链**：vision tower → projector → locate `<image>` → embed replace/label ignore → LLM → eval。
- **源码锚点**：`llava/model/llava_arch.py`、`llava/model/multimodal_encoder/`、`llava/model/multimodal_projector/`、`llava/train/train.py`、`llava/eval/`。
- **取舍**：训练和评测生态成熟，代价是老主线不代表 2026 最新 runtime，视觉成本未专门为端侧优化。
- **证据与第一项任务**：**E1**；追踪视觉位置 label 为何设 `IGNORE_INDEX`，再画 embedding 与 label 的长度关系。

### 6. MLX-VLM

- **类比与输入输出**：Apple Silicon 上的通用 VLM 适配仓库，把不同模型翻译成共同加载/生成接口；输入 HF model/image/prompt，输出 MLX generation。
- **主链**：model remap → config/model/processor → weight sanitize → image embedding → language model → cache/generate。
- **源码锚点**：`mlx_vlm/models/fastvlm/`、`mlx_vlm/utils.py`、`mlx_vlm/generate/`、`mlx_vlm/trainer/`、`mlx_vlm/server/`。
- **取舍**：模型覆盖、量化和服务能力强，代价是快速版本演化会与论文固定 patch 分叉。
- **证据与第一项任务**：**E1**；找 FastVLM key remap/sanitize，列出 checkpoint key 错位的 fail-fast 点。

### 7. MLX Swift Examples

- **类比与输入输出**：Swift 开发者的示例展厅；输入示例配置，输出 Chat/Eval/LoRA 等可运行 App。
- **主链**：sample target → package dependencies → model load → generate/UI。
- **源码锚点**：`Applications/MLXChatExample/`、`Applications/LLMBasic/`、`Applications/LLMEval/`、`Package.swift`。
- **取舍**：适合学习应用接线，代价是可复用 VLM 库已迁到 `mlx-swift-lm`，不能在旧位置找最新实现。
- **证据与第一项任务**：**E1**；从 `Package.swift` 找到库迁移边界，区分 sample code 与 runtime source。

### 8. MLX Swift LM

- **类比与输入输出**：Swift 端的模型总装厂，负责下载、registry、processor、模型、cache 和生成；输入 UserInput/model ID，输出 stream。
- **主链**：registry → resolve/download → decode config → model factory → sanitize weights → processor → ModelContainer/generate。
- **源码锚点**：`Libraries/MLXLMCommon/`、`Libraries/MLXVLM/VLMModelFactory.swift`、`Libraries/MLXVLM/Models/FastVLM.swift`、`Libraries/MLXVLM/Models/Gemma4.swift`、`Tests/MLXLMTests/`。
- **取舍**：原生 Swift 抽象完整，代价是 API 与 processor contract 快速变化。
- **证据与第一项任务**：**E1 refresh**；比较 Gemma 4 旧固定尺寸与新动态 soft token，解释多图 placeholder 必须逐图展开。

## 同类端侧模型

### 9. LLaVA-NeXT

- **类比与输入输出**：先看缩略全图，再看按长宽比切出的局部块；输入单图/多图/视频，输出 AnyRes visual sequence 和回答。
- **主链**：choose grid → base+tiles → shared vision tower → restore/unpad/pool → newline → LLM。
- **源码锚点**：`llava/mm_utils.py`、`llava/model/llava_arch.py`、`llava/model/multimodal_resampler/`、`llava/train/`、`docs/`。
- **取舍**：细节和多图/视频能力强，代价是 tile 数和 token 管理对端侧更重。
- **证据与第一项任务**：**E1**；用一张超宽图追 AnyRes grid 选择，计算 base 与 local patch 数。

### 10. MobileVLM

- **类比与输入输出**：视觉塔先完整看图，轻量 projector 再把二维网格池成 12×12；输入 CLIP features，输出 144 visual token。
- **主链**：vision features → channel map → reshape 2D → adaptive pool → position conv → LLM。
- **源码锚点**：`mobilevlm/model/vision_projector.py`、`mobilevlm/model/mobilevlm.py`、`mobilevlm/model/mobilellama.py`、`mobilevlm/train/`。
- **取舍**：projector 简单、token 固定，代价是视觉塔成本已支付，小文字可能被池化。
- **证据与第一项任务**：**E1**；在 LDPv2 标出 raw token 与 144 token 的边界，说明哪段成本没有减少。

### 11. MiniCPM-V

- **类比与输入输出**：把高分图切片后，用固定 query 的 resampler 压成稳定预算；输入 base/crops，输出固定 visual blocks 和回答。
- **主链**：aspect/area slice → vision encoder → Perceiver resampler → placeholders → LLM。
- **源码锚点**：`omnilmm/model/omnilmm.py`、`omnilmm/model/resampler.py`、`finetune/dataset.py`、`finetune/finetune.py`、`eval_mm/`。
- **取舍**：跨端且细节能力强，代价是多代模型与仓内代码/remote model 实现边界复杂。
- **证据与第一项任务**：**E1**；区分 README 4.6 声明与仓内旧 `omnilmm` 可见实现，不能跨代拼结论。

### 12. MiniCPM-V Apps

- **类比与输入输出**：把 GGUF 文本模型和 multimodal projector 装进 iOS/Android/Harmony App；输入相机/媒体，输出本地 token stream。
- **主链**：download/check → bridge/JNI → llama/mtmd → image embedding → KV/generate → UI/cancel。
- **源码锚点**：`MiniCPM-V-demo/Sources/Base/Model/`、`MiniCPM-V-demo/Sources/Base/Utils/MBDeviceMemoryProbe.swift`、`MiniCPM-V-demo-Android/app/src/main/java/com/example/minicpm_v_demo/LlamaEngine.kt`、`MiniCPM-V-demo-Android/app/src/main/cpp/llama_jni.cpp`、`DOWNLOAD.md`。
- **取舍**：跨平台产品工程完整，代价是 vendored runtime、模型/mmproj 配对和许可证需逐层核对。
- **证据与第一项任务**：**E1**；追踪 iOS 内存探测如何改变 batch/ubatch，列出 OOM 前后的降级动作。

### 13. SmolVLM

- **类比与输入输出**：从数据 packing 到小模型都开放的训练工厂；输入多模态样本，输出固定 image block、训练 loss 和回答。
- **主链**：dataset packing/collator → vision model → connector → replace image tokens → text model。
- **源码锚点**：`vision/smolvlm2/smolvlm/model/`、`vision/smolvlm2/smolvlm/datasets/`、`vision/smolvlm2/smolvlm/train/`、`vision/evaluation/`。
- **取舍**：训练透明、内存小，代价是固定压缩对 OCR/小物体有能力上限。
- **证据与第一项任务**：**E1**；读 `PackedConcatDataset`，解释不同样本为何需要 block-diagonal attention。

### 14. Moondream

- **类比与输入输出**：一名会缓存同一张图并专门做点/框任务的小型视觉助手；输入全局图+overlap crops，输出 embedding/KV cache、caption/query/region。
- **主链**：global/local crops → ViT → tile reconstruction → projection → text prefill/cache → task heads。
- **源码锚点**：`moondream/torch/config.py`、`moondream/torch/vision.py`、`moondream/torch/moondream.py`、`moondream/torch/region.py`、`recipes/`。
- **取舍**：同图多问缓存和 region head 强，代价是专用架构与多 crop 视觉成本。
- **证据与第一项任务**：**E1**；追踪 `encode_image()` 保存了哪些视觉/文本 cache，说明第二次提问省了什么。

## 衍生与系统应用

### 15. Mobile-O

- **类比与输入输出**：同一个移动模型既看图回答，也把 VLM hidden state 交给扩散模型生成图；输入图文，输出文字或图像。
- **主链**：FastViTHD+Qwen2 → layerwise fusion → lightweight connector → SANA DiT/VAE。
- **源码锚点**：`mobileo/model/llava_arch.py`、`mobileo/model/mobile_block.py`、`mobileo/model/language_model/`、`mobileo/train/`、`Mobile-O-App/`。
- **取舍**：理解/生成统一，代价是 loss、权重、导出和 runtime 复杂度大幅上升。
- **证据与第一项任务**：**E1**；画 hidden-state fusion 到 DiT conditioning 的 shape 链，不把 README iPhone 指标写成本地实测。

### 16. VLMKit

- **类比与输入输出**：传统 Vision 先精确圈区域，VLM 再逐区理解并汇总；输入图和 typed task，输出 Decodable 结构。
- **主链**：RegionExtractor → crop → VLMTask → JSON extract/repair/retry → Aggregator。
- **源码锚点**：`Sources/VLMKit/Backend/`、`Sources/VLMKit/Core/`、`Sources/VLMKit/Extract/`、`Sources/VLMKit/Recipes/`、`Tests/`。
- **取舍**：专家视觉与语义分工清楚，代价是区域串行调用增加总延迟，小社区成熟度有限。
- **证据与第一项任务**：**E1**；追 `FanoutPipeline` 的 region failure，说明 skip、retry 和 fail-whole-task 的取舍。

### 17. USLS

- **类比与输入输出**：把 FastVLM 拆成三个 ONNX engine，由 Rust 手工接 embedding 和 KV cache；输入图文，输出 decoder token。
- **主链**：Visual → Textual embedding → replace image token → TextualDecoderMerged → update past K/V loop。
- **源码锚点**：`src/models/traits.rs`、`src/models/vlm/fastvlm/`、`src/processor/`、`src/ort/`、`examples/vlm/`。
- **取舍**：可切多 execution provider，代价是 shape、token ID、KV IO 和导出协议必须精确一致。
- **证据与第一项任务**：**E1**；列出三个 engine 的输入输出 shape，找出目前只适配 0.5B 的硬编码。

## 视觉 Token 替代路线

### 18. SparseVLMs

- **类比与输入输出**：根据问题在 LLM 多层逐步删/合并视觉笔记；输入 visual/text hidden states，输出动态缩短序列。
- **主链**：record token spans → text-guided score → prune layers → head correction → top-k/cluster merge。
- **源码锚点**：`llava/model/language_model/modelling_sparse_llama.py`、`llava/model/language_model/score.py`、`llava/model/language_model/utils.py`、`llava/model/builder.py`。
- **取舍**：问题相关且可渐进稀疏，代价是 decoder/attention/KV 兼容复杂、层和预算绑定。
- **证据与第一项任务**：**E1**；选择一个 pruning layer，写出 hidden/mask/position/KV 必须同步改变的对象。

### 19. LLaVA-PruMerge

- **类比与输入输出**：视觉塔出口先保留热点，再把周边和剩余信息合并到较少 token；输入 CLIP patch，输出 selected/merged token。
- **主链**：hook Q/K → CLS attention → top token → cosine neighbors → weighted merge → residual token。
- **源码锚点**：`llava/model/multimodal_encoder/clip_encoder.py`、`llava/model/multimodal_encoder/`、`scripts/`、`docs/`。
- **取舍**：可作为视觉出口补丁，代价是 CLIP layer、576 patch、k 值和 Python 循环硬编码。
- **证据与第一项任务**：**E1**；找出 layer 23、patch count、cluster k 的假设，说明换视觉塔为何不能直接复用。

### 20. FastV

- **类比与输入输出**：答题者读到第 K 层后按注意力扔掉部分视觉笔记；输入 LLM hidden/KV，输出更短的后层序列。
- **主链**：full early layers → attention rank → top visual token → shrink hidden/mask/KV → late layers。
- **源码锚点**：`src/FastV/`、`src/FastV/lmms-eval/fastv_kvcache.py`、`src/FastV/inference/`。
- **取舍**：不必重训视觉塔，代价是视觉塔和前 K 层成本不变，动态索引未必转成真实 kernel 加速。
- **证据与第一项任务**：**E1**；用预算实验解释为什么 FLOPs 降低比例不能直接写成 TTFT 降低比例。

### 21. AdaptVision

- **类比与输入输出**：先看低清全图，模型觉得需要时再调用“放大镜”取局部高清；输入原图/问题，输出 crop tool calls 和答案。
- **主链**：downsample global → `<tool_call>` bbox → validate/crop/upscale → append image → multi-round answer。
- **源码锚点**：`scripts/vllm_adaptvision.py`、`cookbooks/adaptvision.ipynb`、`patches/megatron_v4.patch`、`verl/`。
- **取舍**：按问题分配视觉预算，代价是定位错误、格式失败、多轮尾延迟和 RL 训练。
- **证据与第一项任务**：**E1**；追踪 bbox 校验与最大轮数，设计 invalid bbox、重复调用和预算耗尽三类测试。

## 项目级完成检查

完成一个项目的入门学习后，至少能回答：

1. 它在哪一步产生或减少 visual token？
2. 减少前的成本是否已经支付？
3. 输入、shape、cache、输出和失败状态是什么？
4. 设计选择提高什么，又损失什么细节或兼容性？
5. 当前是 E0、E1、合成 E2 还是真机 E2？
6. 下一项实验要固定哪些设备、图片、prompt 和输出合同？

答不出第 2 和第 5 题，就不能写“更快”或“更适合端侧”。
