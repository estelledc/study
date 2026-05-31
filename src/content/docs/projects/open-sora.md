---
title: 'Open-Sora — 把 Sora 黑盒一比一开源的视频生成项目'
来源: 'https://github.com/hpcaitech/Open-Sora'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '高级'
---

## 是什么

Open-Sora 是 HPC-AI Tech（Colossal-AI 团队）在 2024 年 3 月发布的**视频生成模型完整开源实现**：包含模型代码、训练脚本、数据处理 pipeline、推理代码全套，对标 OpenAI 闭源的 Sora。日常类比：Sora 是黑盒 ChatGPT，Open-Sora 是 LLaMA——你拿到权重还能拿到食谱，能改、能再训、能换数据。

它做的事一句话：**给一段文字，生成一段几秒到一分钟的视频**。

```
"a cat playing piano in space" --> [文本编码] --> [扩散去噪] --> [VAE 解码] --> 4 秒 720p MP4
```

技术骨架是 **STDiT**（Spatial-Temporal Diffusion Transformer）：把 Stable Diffusion 时代的 U-Net 换成 Transformer，再把 Transformer block 拆成『空间注意力 + 时间注意力』两路交替——这样既能学到一帧内的构图，也能学到帧之间的运动连贯。

## 为什么重要

不理解 Open-Sora，下面这些事会卡住：

- 为什么 2024 年开源视频模型集体走 DiT 路线，而不是把 SD 的 U-Net 加一维时间——纯 Transformer 在长序列上 scaling 更好
- 为什么训练视频模型不能直接拿 SD 数据集——每秒 24 帧 30 秒 = 720 帧，是图像模型的 720 倍 token 量，必须做时间维 VAE 压缩
- 为什么 Sora 黑盒发布几个月内就有完整开源对标——HPC-AI 团队走了『先抄架构、再做数据 pipeline、再优化训练成本』的标准路径
- 为什么视频生成模型的『数据清洗代码』比『模型代码』本身还重要——垃圾视频进，糊片片出

## 核心要点

记 **3 个组件 + 1 条主线**：

1. **T5-XXL 文本编码器（4.7B 参数）**：把 prompt 编成一串 conditioning 张量。比 SD 用的 CLIP 大 30 倍——视频模型对 prompt 理解力的要求高于图像。

2. **VideoVAE（v1.2 起）**：同时做空间下采样 8 倍、时间下采样 4 倍。一段 16 帧 256x256 视频 → 4 帧 32x32 的 latent。这是视频生成显存可控的根本原因；早期 v1.0 只用 SD-VAE 2.1（仅压空间），训练 4 秒视频就要 80GB 显存。

3. **STDiT（Spatial-Temporal DiT）**：每个 block 内部是『spatial-attn → cross-attn（接 T5）→ temporal-attn → MLP』。spatial 把 (T, N, D) reshape 成 (T*N, D) 做帧内自注意力；temporal 转成 (N, T, D) 做帧间自注意力。两路分开比一次性做 (T*N) 全注意力省下 T 倍计算。

4. **训练主线（三阶段）**：
   - Stage 1：用 SD checkpoint 初始化，在 LAION 高质图上预训练 spatial 部分
   - Stage 2：256x256 + 16 帧短视频，开始训 temporal-attn
   - Stage 3：720p + 多 aspect ratio + 长视频，全模型微调

## 实践案例

### 案例 1：从 prompt 到一段视频经过了什么

跑一次推理时 STDiT 内部走的步骤：

1. T5-XXL 把 prompt 编码成 `(L_text, 4096)` 的 conditioning
2. VideoVAE 起点是纯噪声 `(C=4, T=4, H=32, W=32)`
3. STDiT 跑 30 步去噪：每步把当前 latent 和 conditioning 一起送进 28 层 STDiT block
4. 最终 latent 经 VideoVAE decoder 解码回 `(3, 16, 256, 256)`
5. 写成 MP4 输出

每一步显存占用、张量形状都能在代码里追到——这是 Open-Sora 教学价值的核心。

### 案例 2：为什么 STDiT 把注意力拆成两路

一段 16 帧 32x32 latent 共 16384 个 token。如果做满注意力，复杂度是 16384 squared = 268M。拆成空间（每帧 1024 token，attention 1M，做 16 次）+ 时间（每像素位置 16 token，attention 256，做 1024 次）= 16M + 0.26M，**省了 16 倍**。

代价是 spatial 看不到跨帧、temporal 看不到跨像素，但因为两路交替了 28 层，信息最终能扩散到全局。这是 video DiT 共同的设计取舍。

### 案例 3：数据 pipeline 比模型代码还重要

Open-Sora 仓库 `tools/` 下有一整套数据处理脚本：

- `scenedetect/`：用 PySceneDetect 把长视频切成单镜头片段（避免镜头切换）
- `aesthetic/`：跑 LAION aesthetic predictor，过滤低美学分（< 4.5 丢弃）
- `optical_flow/`：UniMatch 算光流，过滤静止视频和镜头剧烈抖动
- `caption/`：用 PLLaVA / LLaVA-Video 给每段视频自动生成详细 caption

最终 70 万小时原始视频 → 30 万小时高质量数据 → 训练用。**社区复现 Open-Sora 最难的部分不是模型代码，是这一套筛选 pipeline 的算力成本**。

### Open-Sora vs Sora vs CogVideoX vs HunyuanVideo

| 维度 | Open-Sora | Sora（闭源） | CogVideoX | HunyuanVideo |
|---|---|---|---|---|
| 架构 | STDiT 双路注意力 | 推测 DiT 单流 | DiT 单流 3D-attn | DiT 单流 |
| 文本编码器 | T5-XXL | 推测 GPT 系 | T5 + 自研 | MLLM + CLIP |
| 参数量 | 1.1B（v1.2） | 未公开 | 5B | 13B |
| 训练成本 | $200K（v1.2 报告） | 未公开 | 未公开 | 未公开 |
| 数据 pipeline | 开源 | 闭源 | 部分开源 | 闭源 |
| 推理显存 | 24GB（v1.0）/ 80GB（v1.2 720p） | 闭源 | 36GB | 60GB+ |

## 踩过的坑

1. **维度顺序写错**：spatial-attn 期待 `(B, T, N, D)`，temporal-attn 期待 `(B, N, T, D)`，两路之间必须 `rearrange`。早期 issue 里反复有人 reshape 错了导致输出乱码。

2. **VideoVAE 时间维必须 4xk+1**：v1.2 的 VideoVAE 时间下采样 4 倍，但要求输入帧数是 `4k+1`（如 17/33/65 帧）才能整除。直接传 16 帧 VAE encode 时 padding 错位，输出抖动。

3. **T5-XXL + STDiT + VideoVAE 三个 fp32 直接 OOM**：单卡 80GB 都装不下。必须 T5 推理完立刻 CPU offload，VAE 也只在 encode/decode 时上 GPU。

4. **Rectified Flow 与 DDPM 不能混 sampler**：v1.2 训练用 Rectified Flow（直线 schedule），但旧 sampler config 默认 DDPM 系数。换 sampler 不改 schedule 出图全是噪声块。

5. **训练数据没去重**：原始视频里大量片段是同一作者上传的不同剪辑，没做感知 hash 去重时 STDiT 会过拟合到几个常见镜头风格。

6. **多 aspect ratio 训练的 batch 拼接**：720x1280 / 1280x720 / 1024x1024 token 数不同，必须用 bucketed sampler 把同尺寸拼一个 batch；不分桶 attention mask 复杂度爆炸。

## 适用 vs 不适用场景

**适用**：

- 想理解视频扩散模型每一步在做什么——代码注释 + config 比论文清楚
- 在自有视频数据上训练定制风格模型——data pipeline 全开源
- 学 Colossal-AI sequence parallelism / zero 优化——训练脚本是真实大规模案例
- 单 H100 推理 720p 短视频做 demo

**不适用**：

- 工业级商用视频生成 → 用闭源 Sora / Kling / Runway，质量更稳
- 显存 < 24GB 的本地推理 → 用 [[comfyui]] 跑量化版 CogVideoX
- 只想推理不想训练 → 直接用 [[diffusers]] 的 OpenSoraPipeline，封装更干净
- 视频编辑/补全 → Open-Sora 主打文本到视频，编辑任务用 Sora-Edit / Runway Gen-3

## 历史小故事（可跳过）

- **2024-02-15**：OpenAI 发 Sora demo，业内震动；技术报告只有架构草图无代码
- **2024-03-18**：Open-Sora v1.0 发布，256x256 2 秒视频，第一个完整开源对标
- **2024-04-25**：v1.1 发布多分辨率支持
- **2024-06-17**：v1.2 发布 VideoVAE + 720p + 16 秒视频
- **2025-03**：v2.0 发布，架构升级到接近 Sora 公开论文的设计

每次大版本都把模型权重、训练 config、数据清洗脚本一起开源——这是 Open-Sora 在视频生成领域口碑的根本来源。

## 学到什么

1. **复现 > 创新**：把闭源黑盒一比一做出来，对学界和工业界的价值不亚于发原创论文
2. **数据 pipeline 是真正的护城河**：模型代码几千行，数据清洗代码几万行
3. **DiT 替 U-Net 是趋势**：纯 Transformer 在 scaling 上的优势压过了 U-Net 的归纳偏置
4. **空间-时间分离注意力**是视频 Transformer 的标配，省 T 倍计算
5. **多阶段训练**（图像 → 短视频 → 长视频）是大模型训练成本可控的关键

## 延伸阅读

- 仓库 README + reports/ 目录：每个版本都有详细技术报告
- 论文：Open-Sora Plan / Open-Sora 1.2 Technical Report（arXiv 2024）
- 视频解读：B 站搜『Open-Sora 源码解析』有几个完整 walkthrough
- [[pytorch]] —— 全部代码基于 PyTorch
- [[colossal-ai]] —— 训练加速框架，同团队
- [[comfyui]] —— 推理时也能用 ComfyUI 节点接入

## 关联

- [[pytorch]] —— Open-Sora 全部 nn.Module 调用基于 PyTorch
- [[colossal-ai]] —— 同团队的训练加速框架，是训练脚本的依赖
- [[comfyui]] —— 节点式推理界面也支持加载 Open-Sora 权重
- [[stable-diffusion-webui]] —— 同代图像扩散 UI，对照看视频版本的复杂度增量
- [[hindley-milner]] —— 不直接相关，但类型化 config 字典阻挡接错模型组件，思想类似
