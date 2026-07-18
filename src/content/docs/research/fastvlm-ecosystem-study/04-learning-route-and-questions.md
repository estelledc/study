---
title: "学习路线与关键思考点"
sidebar:
  hidden: true
---
# 学习路线与关键思考点

## 使用方式

不要试图一次读完 21 个仓库。先掌握一条完整链路，再比较替代方案。每一阶段都保留了可直接提问的问题。

## 阶段 0：先补五个概念

### 1. Embedding

embedding 是把离散输入映射到连续向量空间。文本 token、视觉 patch 最终都要变成相同 hidden size 的向量，才能放进同一个 LLM 序列。

思考：

1. 为什么视觉塔输出 1536 维，而 Qwen2 可能需要 896/1536/3584 维？
2. projector 只改变维度，还是也承担跨模态对齐？

### 2. Visual token

视觉 token 是图像经过视觉编码器后的一组向量。token 数越多，通常细节越丰富，但 LLM prefill 越慢。

思考：

1. 1024 x 1024 图片为什么不一定生成 1024² 个 token？
2. token 数相同，两个视觉编码器的实际延迟为什么仍可能不同？

### 3. Prefill 与 decode

- prefill：一次处理 prompt 中所有文本和视觉 token，建立 KV cache。
- decode：之后每次生成一个新 token。

思考：

1. 为什么视觉 token 主要影响 TTFT？
2. 为什么回答越长，语言模型 decode 能耗会重新成为主导？

### 4. KV cache

KV cache 保存每层历史 token 的 key/value，避免每生成一个 token 都重算全部历史。

思考：

1. 视觉 token 被裁掉后，KV cache 应该怎么同步裁剪？
2. 同一图片多次提问，能否复用视觉 embedding 或视觉相关 KV？

### 5. Quantization

量化降低权重位宽，例如 fp16 -> int8/int4。它主要减少权重内存和带宽，不自动减少视觉 token。

思考：

1. 为什么 4-bit 模型可能比 fp16 更慢？
2. 视觉塔、projector、LLM 是否应该使用相同精度？

## 阶段 1：读懂 FastVLM 主链

### 推荐文件

1. `fastvlm/README.md`
2. `fastvlm/llava/model/multimodal_encoder/mobileclip/mci.py`
3. `fastvlm/llava/model/multimodal_encoder/mobileclip_encoder.py`
4. `fastvlm/llava/model/llava_arch.py`
5. `fastvlm/app/FastVLM/FastVLM.swift`

### 学习目标

- 能画出 image -> visual token -> projector -> LLM -> text。
- 能解释 FastViTHD 的五阶段。
- 能指出视觉 token 在哪里插入文本。
- 能区分 Core ML 和 MLX 的职责。

### 检验题

1. FastViTHD 为什么前三阶段不用 attention？
2. `feature_select()` 为什么把 `[B,C,H,W]` 变成 `[B,H*W,C]`？
3. `<image>` token 为什么会被一段视觉 embedding 替换，而不是只替换成一个向量？
4. 训练 label 为什么在视觉 embedding 位置设为 ignore？
5. 如果 projector 输出维度错一位，最早会在哪一层失败？

## 阶段 2：理解 FastViT 与 MobileCLIP 血缘

### 推荐文件

1. `fastvit/models/fastvit.py`
2. `fastvit/models/modules/mobileone.py`
3. `mobileclip/mobileclip/__init__.py`
4. `mobileclip/mobileclip/image_encoder.py`
5. `mobileclip/training/open_clip_v2.patch`

### 学习目标

- 能解释结构重参数化。
- 能区分训练时多分支和推理时单分支。
- 能解释 MobileCLIP 的 image-text 对齐与 FastVLM 的生成任务差异。
- 能说清数据强化为什么可能让小视觉塔更强。

### 检验题

1. Conv-BN 融合为什么不需要重新训练？
2. MobileCLIP 的共享 embedding 空间如何帮助 FastVLM 视觉塔初始化？
3. 合成 caption 与 teacher embedding 各提供什么监督？
4. 数据强化和知识蒸馏有什么重叠与区别？

## 阶段 3：读懂端侧 Swift App

### 推荐文件

1. `fastvlm/app/FastVLM App/ContentView.swift`
2. `fastvlm/app/FastVLM App/FastVLMModel.swift`
3. `fastvlm/app/Video/CameraController.swift`
4. `mlx-swift-lm/Libraries/MLXVLM/VLMModelFactory.swift`
5. `mlx-swift-lm/Libraries/MLXVLM/Models/FastVLM.swift`

### 学习目标

- 能解释相机帧的背压。
- 能解释 `ModelContainer.perform` 的隔离作用。
- 能区分模型加载、输入处理、prefill、decode 和 UI 更新。
- 能识别取消、生命周期和主线程边界。

### 检验题

1. 为什么使用 `bufferingNewest(1)` 而不是保存所有相机帧？
2. 为什么连续模式必须等当前 generation 完成再分析下一帧？
3. 为什么每 token 更新 UI 会降低 tokens/s？
4. `@MainActor` 模型状态与后台 MLX 计算如何协调？
5. App 显示的 TTFT 包含哪些步骤，是否包含模型首次下载？

## 阶段 4：比较三种“少 token”方案

### 对照项目

- MobileVLM LDPv2
- MiniCPM-V resampler
- FastV/SparseVLM 中间层 pruning

### 学习目标

能回答：

1. token 在哪一步减少？
2. 减少前的计算是否已经支付？
3. 压缩是否依赖问题？
4. 删除的信息是否被合并？
5. shape 是否固定？
6. 目标后端是否擅长动态索引？

### 案例题

任务是读取发票右下角一个很小的税号：

- LDPv2 固定池化可能发生什么？
- FastV 的早期 attention 能否保证保留税号？
- AdaptVision 的局部 crop 如何降低风险？
- 如果先用 OCR 找区域，再给 FastVLM，系统复杂度增加在哪里？

## 阶段 5：比较高分辨率策略

### 对照项目

- FastVLM：单图高分辨率 + 分层编码。
- LLaVA-OneVision：base + AnyRes tiles。
- MiniCPM-V：base + slices + resampler。
- Moondream：全局 + overlap crop + 重建。
- AdaptVision：低清全局 + 按需局部高清。

### 思考题

1. 哪些方案一次性支付全部视觉成本？
2. 哪些方案可以按问题分配视觉预算？
3. 如果目标位于 crop 边界，重叠裁块有什么作用？
4. 如果图像是超长票据，固定正方形输入会浪费多少区域？
5. OCR、自然图像 caption、视频分别需要怎样的策略？

## 阶段 6：读懂训练与数据

### 推荐文件

- `fastvlm/llava/train/train.py`
- `mobileclip-dr/scripts/gen.py`
- `smollm/vision/smolvlm2/smolvlm/datasets/builder.py`
- `mobile-o/mobileo/train/`

### 学习目标

- 能区分视觉-语言预训练、connector 对齐、SFT、偏好训练。
- 能解释 lazy dataset、modality length sampler 和 sequence packing。
- 能识别 synthetic data、teacher embedding 与数据许可证。

### 思考题

1. 为什么只训练 projector 可以很快，但能力上限有限？
2. 高分辨率阶段为什么可能需要解冻视觉塔？
3. sequence packing 如何避免不同样本互相 attention？
4. 合成数据的错误会以什么方式进入小模型？
5. 数据、代码和模型许可证为什么必须分开检查？

## 阶段 7：做一个有界实测

### 建议目标

只比较 FastVLM 0.5B 在一台明确设备上的四类任务：

- 自然图 caption；
- 小文字 OCR；
- 计数；
- 简单空间关系。

### 独立验收

- 记录模型与 commit；
- 冷/热 TTFT；
- decode tokens/s；
- 峰值内存；
- 10 分钟连续相机温升与帧率；
- 四类任务各 20 个固定样本；
- 保留失败输出，不只看成功 demo。

### 停止条件

- 模型或权重许可证不允许目标用途；
- 设备内存频繁 OOM；
- 三轮配置调整仍无法稳定复现；
- 持续运行温升或耗电不满足需求。

## 关键开放问题

### 架构

1. FastViTHD 的最终下采样是否会伤害极小文字？
2. 多尺度中间特征是否值得重新引入，还是会破坏简单性？
3. 能否为 FastVLM 增加问题引导的轻量局部视觉路径？
4. 视觉塔与 LLM 的最佳大小是否应联合搜索？

### Runtime

1. FastVLM 视觉塔在不同 iPhone 上实际落到 CPU/GPU/ANE 的比例是多少？
2. Core ML 与纯 MLX 视觉塔的端到端差异是什么？
3. 同图多问的 vision feature cache 能节省多少？
4. 量化 projector 是否值得，还是只量化 LLM？

### 产品

1. 连续相机应该按时间采样、场景变化采样还是用户触发？
2. 如何避免模型不断描述几乎相同的帧？
3. 发热后性能下降如何进入产品状态机？
4. 什么时候应退化到传统 OCR/检测，而不是继续调用 VLM？

### 评测

1. TTFT 是否包含图像解码和 resize？
2. 输出长度不同如何公平比较？
3. 低温采样与 greedy 对重复和准确率有什么影响？
4. 如何建立“被视觉压缩丢掉的信息”专项回归集？

## 常见误区

1. **错误：参数少就是端侧快。**
   正确：还要看视觉 token、视觉塔算子、prefill、量化和 runtime。

2. **错误：Core ML 模型一定跑 ANE。**
   正确：实际调度取决于算子、精度、compute units 和设备。

3. **错误：TTFT 快说明整个回答快。**
   正确：长回答仍受 autoregressive decode 主导。

4. **错误：token pruning 只会删冗余。**
   正确：低注意力 token 也可能包含 OCR、小物体或反事实细节。

5. **错误：fork 后就能自由商用。**
   正确：代码、模型、数据各有许可证，fork 不改变授权。
