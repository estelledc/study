---
title: 'Open-Sora — 把 Sora 路线开源对标的视频生成项目'
来源: 'https://github.com/hpcaitech/Open-Sora'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '高级'
---

## 是什么

Open-Sora 是 HPC-AI Tech（Colossal-AI 团队）在 2024 年 3 月起发布的**视频生成完整开源栈**：模型、训练、数据清洗、推理都公开，目标是**对标** OpenAI 闭源的 Sora（Sora 架构未公开，因此是路线复现，不是字面一比一拷贝）。日常类比：Sora 像黑盒 ChatGPT；Open-Sora 更像早期 LLaMA——权重和食谱都能改、能再训。

它做的事一句话：**给一段文字，生成几秒到十几秒的视频**。

```
"a cat playing piano in space" --> [文本编码] --> [扩散去噪] --> [VAE 解码] --> 短视频 MP4
```

人话版流水线：先把句子编成向量，再在「压缩后的小视频」里一步步去噪，最后用 **VAE**（把大图/视频压成小 latent、再解压回来的编解码器）还原成像素。技术骨架是 **STDiT**（Spatial-Temporal Diffusion Transformer）：用 Transformer 替代旧版 U-Net，并把注意力拆成「空间一路 + 时间一路」交替——既学单帧构图，也学帧间运动。

## 为什么重要

不理解 Open-Sora，下面这些事会卡住：

- 为什么 2024 年开源视频模型集体走 DiT 路线，而不是把 SD 的 U-Net 加一维时间——纯 Transformer 在长序列上 scaling 更好
- 为什么训练视频模型不能直接拿 SD 数据集——每秒 24 帧 30 秒 = 720 帧，是图像模型的 720 倍 token 量，必须做时间维 VAE 压缩
- 为什么 Sora 黑盒发布几个月内就有完整开源对标——HPC-AI 团队走了『先抄架构、再做数据 pipeline、再优化训练成本』的标准路径
- 为什么视频生成模型的『数据清洗代码』比『模型代码』本身还重要——垃圾视频进，糊片片出

## 核心要点

记 **3 个组件 + 1 条主线**（先记人话，再记形状）：

1. **T5-XXL 文本编码器（约 4.7B）**：把 prompt 编成 conditioning。比图像模型常用的 CLIP 大一个数量级——视频更吃「句子理解力」。

2. **VideoVAE（v1.2 起）**：同时压空间（约 8×）和时间（约 4×）。一段 16 帧小分辨率视频会变成更短、更小的 latent；这是显存可控的关键。早期 v1.0 只用图像 SD-VAE（只压空间），短视频训练就很容易顶到 80GB 级显存。

3. **STDiT**：每个 block 大致是『spatial-attn → cross-attn（接 T5）→ temporal-attn → MLP』。spatial 看「同一帧里的像素彼此」，temporal 看「同一位置跨帧怎么动」。两路分开，比一次对所有时空 token 做满注意力便宜一个时间维量级。

4. **训练主线（三阶段）**：图像预训练 spatial → 低分辨率短视频训 temporal → 更高分辨率 / 多长宽比 / 更长视频微调。

## 实践案例

### 案例 1：最小可跟做的推理入口

仓库提供配置驱动的推理脚本（版本目录会变，以当前 README 为准），典型形态：

```bash
# 先按 README 装依赖并下载 v1.2 权重，再跑官方 inference 入口
python scripts/inference.py configs/opensora-v1-2/inference/sample.py
```

读 config 时盯三件事：分辨率 / 帧数（VideoVAE 常按 `4k+1` 如 17 帧组织）、sampler 是否与训练一致（v1.2 起常用 Rectified Flow，别和旧 DDPM 系数混用）、T5 是否 offload。能跑通这一条，再往下看张量形状才有锚点。

### 案例 2：一次去噪在算什么（形状直觉）

1. T5 把 prompt 编成文本 conditioning
2. 从噪声 latent 起步（通道少、时空已被 VAE 压小）
3. STDiT 多步去噪：每步把 latent 与 conditioning 送进多层 block
4. VideoVAE decoder 还原成 RGB 帧并写成 MP4

教学价值在于：每一步的显存与形状都能在代码里追到，而不是只看 demo 视频。

### 案例 3：为什么注意力要拆成两路

16 帧 × 32×32 latent 约 1.6 万 token。满注意力复杂度按 token² 涨；拆成「每帧空间」+「每位置时间」后，计算量大约降一个时间维量级。代价是单路看不到全局，但多层交替后信息仍能传开——这是 video DiT 的常见取舍。

### 案例 4：数据 pipeline 往往比模型代码更贵

`tools/` 下常见步骤：镜头切分（PySceneDetect）→ 美学分过滤 → 光流过滤静止/狂抖 → 多模态模型自动 caption。v1.2 报告口径是在大规模筛选后的数据上训练（公开写法约 **>30M 样本 / ~80k 小时** 量级），不是「随便下点视频就能复现」。社区最难的往往是清洗算力，不是 STDiT 那几千行。

### Open-Sora vs 同代对照

| 维度 | Open-Sora | Sora（闭源） | CogVideoX | HunyuanVideo |
|---|---|---|---|---|
| 架构 | STDiT 双路注意力 | 未公开 | DiT 系 | DiT 系 |
| 文本编码器 | T5-XXL | 未公开 | T5 + 自研 | MLLM + CLIP |
| 参数量 | 1.1B（v1.2） | 未公开 | 5B | 13B |
| 训练成本 | v1.2 ≈ 35k H100 小时；**$200K 是 v2.0 报告** | 未公开 | 未公开 | 未公开 |
| 数据 pipeline | 开源 | 闭源 | 部分开源 | 闭源 |
| 推理显存 | 视版本/分辨率，24GB–80GB 常见 | 闭源 | 约 36GB 级 | 60GB+ 级 |

## 踩过的坑

1. **维度顺序写错**：spatial-attn 期待 `(B, T, N, D)`，temporal-attn 期待 `(B, N, T, D)`，两路之间必须 `rearrange`。早期 issue 里反复有人 reshape 错了导致输出乱码。

2. **VideoVAE 时间维必须 4xk+1**：v1.2 的 VideoVAE 时间下采样 4 倍，但要求输入帧数是 `4k+1`（如 17/33/65 帧）才能整除。直接传 16 帧 VAE encode 时 padding 错位，输出抖动。

3. **T5-XXL + STDiT + VideoVAE 三个 fp32 直接 OOM**：单卡 80GB 都装不下。必须 T5 推理完立刻 CPU offload，VAE 也只在 encode/decode 时上 GPU。

4. **Rectified Flow 与 DDPM 不能混 sampler**：v1.2 训练常用 Rectified Flow（更直的噪声→数据路径），旧 config 若仍按 DDPM 系数采样，输出容易花屏。

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
- **2024-03-18**：Open-Sora v1.0，完整开源对标路线的第一枪（低分辨率短视频）
- **2024-04-25**：v1.1 多分辨率
- **2024-06-17**：v1.2：VideoVAE + 更高分辨率 / 更长视频；训练成本公开口径约 35k H100 小时
- **2025-03**：v2.0：商业级效果路线，报告强调约 **$200K** 训练成本（不要和 v1.2 混用）

每次大版本都把模型权重、训练 config、数据清洗脚本一起开源——这是 Open-Sora 在视频生成领域口碑的根本来源。

## 学到什么

1. **对标复现 > 空谈创新**：把闭源黑盒的关键路径做成可改可训的开源栈，价值不亚于只发概念图

2. **数据 pipeline 是真正的护城河**：模型代码几千行，数据清洗代码几万行
3. **DiT 替 U-Net 是趋势**：纯 Transformer 在 scaling 上的优势压过了 U-Net 的归纳偏置
4. **空间-时间分离注意力**是视频 Transformer 的标配，省 T 倍计算
5. **多阶段训练**（图像 → 短视频 → 长视频）是大模型训练成本可控的关键

## 延伸阅读

- 仓库 README + `docs/report_*.md`：各版本技术报告
- 论文 / 报告：Open-Sora 1.2 Technical Report；Open-Sora 2.0（$200K 训练成本）
- [[pytorch]] —— 实现底座
- [[colossal-ai]] —— 同团队训练加速
- [[comfyui]] —— 社区推理工作流常对照的节点式界面

## 关联

- [[pytorch]] —— Open-Sora 的 nn.Module / 训练循环底座
- [[colossal-ai]] —— sequence parallelism 等训练加速依赖
- [[comfyui]] —— 想少碰训练、多碰工作流时的对照入口
- [[stable-diffusion-webui]] —— 同代图像扩散 UI，用来感受「图像 → 视频」复杂度跳变
- [[diffusers]] —— Hugging Face 推理封装生态；只想调用 pipeline 时可对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[videomla]] —— VideoMLA — 给长视频生成压缩 KV 缓存
- [[ffmpeg]] —— FFmpeg — 几乎所有视频工具背后都藏着它
- [[handbrake]] —— HandBrake — 把视频转码变成点两下鼠标的事
- [[insightface]] —— InsightFace — 人脸识别 / 检测 SOTA 工具箱
- [[sam2]] —— SAM 2 — 图像和视频都能抠轮廓的通用分割模型
- [[ultralytics]] —— Ultralytics — YOLOv8/v11 易用 SDK
