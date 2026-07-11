---
title: Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
来源: 'Yu et al., "Scaling Autoregressive Models for Content-Rich Text-to-Image Generation", arXiv 2206.10789, 2022 (Google Research)'
日期: 2026-05-31
分类: 生成模型 / 计算机视觉
难度: 中级
---

## 是什么

Parti（**Pa**thways Auto**r**egressive **T**ext-to-**I**mage）是 Google 2022 年 6 月发布的文生图模型。日常类比：把"画一张图"当成"写一篇文章"——一个词一个词往后写，只不过这里的"词"不是中文字，而是一小块图像。

输入：

```
"A portrait of a kangaroo wearing an orange hoodie ..."
```

输出：一张 256×256 的图。它不是一次生成，而是按顺序写出 1024 个"图像 token"，每个 token 解码成图里 8×8 的一小格。

它和同年发布的 [[imagen-2022]] / [[dalle-2]] 走的是**完全不同的路线**：那两家用扩散模型（先撒噪声再反复去噪），Parti 用自回归 Transformer（像 GPT 写文字一样按顺序写图块）。这是 2022 年文生图的"路线分叉点"。

## 为什么重要

不读 Parti，下面这些事都解释不了：

- 为什么 2022 年文生图"扩散派"和"自回归派"打对台——这两条路各有信徒，Parti 是自回归一边的旗舰
- 为什么后来的 [[muse-2023]] / VAR / ByteDance Seed 系都回头走自回归路——Parti 验证了 AR 也能 scale 到 SOTA
- 为什么"图像 token"这个想法这么重要——把图变成离散符号后，所有 LLM 工具链（数据并行 / Megatron / FlashAttention）直接复用
- 为什么 OpenAI 后来 GPT-4o 原生图像生成不再走独立 DALL·E 扩散管线——主路径自回归，多模态统一架构回潮

## 核心要点

Parti 把"画图"拆成 **三段**：

1. **ViT-VQGAN 编码器（已训好，冻结）**：把 256×256 图压成 32×32=**1024 个离散 token**。每个 token 来自 8192 个码字的"码本"。类比：把图切成 1024 块拼图，每块从 8192 种花色里挑一种。

2. **encoder-decoder Transformer（新训）**：像翻译模型一样——encoder 读文本"a kangaroo in hoodie"，decoder 按顺序输出 1024 个图像 token。**关键：自回归**——第 i 个 token 看前 i-1 个 token + 文本。

3. **ViT-VQGAN 解码器（已训好，冻结）**：把 1024 个 token 还原成像素图。

整条管线：

```
text → encoder → text emb
                    ↓
        decoder ──→ token 1 → token 2 → ... → token 1024
                                                  ↓
                                        VQGAN 解码 → 256×256 图
```

注意 decoder 是**串行**的——第 1024 个 token 必须等前 1023 个写完。这是 AR 路线的本质代价。

## 实践案例

### 案例 1：scaling law——Parti 论文最大的发现

Parti 训了 4 个尺寸的模型，FID 分数（越低越好）：

```
350M    FID 14.10
750M    FID 10.71
3B      FID 8.10
20B     FID 7.23  ← 当时 zero-shot SOTA（与 Imagen 相当）
```

**逐部分解释**：

- 模型从 350M scale 到 20B，FID 持续下降；**350M→750M 降幅最大**（14.10→10.71），之后仍降但收益递减（3B→20B 只再降 0.87）
- 这复制了 LLM 的 scaling law（GPT-3 验证过的）——图像生成也吃这一套
- 20B 是当时最大的文生图模型之一，远超 [[imagen-2022]] 文本编码器 T5-XXL 的 4.6B

结论：**自回归图像生成 scale 起来跟语言模型一样听话**。

### 案例 2：AR vs 扩散——同一个 prompt 两条路

Prompt：`"a green sign saying Welcome"`

**扩散派（Imagen）**：从纯噪声开始，迭代 30~100 步，每步对整张 64×64 latent 图同时去噪，文本通过 cross-attention 注入。

**AR 派（Parti）**：encoder 读完文本后，decoder 按光栅顺序写 1024 个 token，每写一个看前面所有写过的。

两者各有一套缺点：

- 扩散：步数多但每步并行，**可控性强**（可以中途换 prompt、做编辑），文字渲染弱
- AR：每个 token 串行（1024 步无法并行），但训练就是 next-token-prediction，**复用 LLM 全部基建**

Parti 论文里"绿色 Welcome 招牌"这种带文字的图，AR 派比扩散派出得正。

### 案例 3：PartiPrompts 基准——为什么这条 benchmark 还在被用

Parti 同时发布了 1600 个 prompt 的测试集 PartiPrompts，覆盖 12 类（写实 / 文字 / 计数 / 抽象等）× 11 难度。它是当时第一个"专门测内容丰富度"的文生图 benchmark。

到现在 2026 年，DALL-E 3 / Stable Diffusion 3 / Flux 论文都还在跑 PartiPrompts。这个数据集本身比模型活得久。

## 踩过的坑

1. **AR 推理慢得离谱**：1024 个 token 必须串行写，单张图在 TPUv4 上要几秒钟。扩散虽然要 30 步但每步并行，实际墙钟时间反而短。这是 AR 派的天花板，后续 [[muse-2023]] 用 mask-based parallel decoding 才打破。

2. **VQGAN 重建上限锁死了图像质量**：Parti 最后那一步 token → 像素由 VQGAN 解码器决定。哪怕 Transformer 把 token 序列预测得 100% 对，输出图也不会比 VQGAN 重建一张训练集图更清晰。这叫**离散瓶颈**。

3. **20B 是工程怪兽**：论文用 Lingvo + GSPMD 在大规模 Cloud TPUv4 上训推；单纯能把 20B encoder-decoder 跑稳就是卖点之一。复现门槛极高，开源社区到 2026 年都没真正复现 20B 版本。

4. **高分辨率靠简单超分**：主模型只直出 256×256；论文另接 WDSR 风格卷积超分到 512/1024（约 15M/30M 参），无文本条件。同期 Imagen 用级联扩散超分，编辑与细节更强。

## 适用 vs 不适用场景

**适用**：

- 需要复用 LLM 工具链做多模态统一架构——AR 路线天然兼容（GPT-4o / Chameleon / Emu3 都是这条路）
- 文字渲染、计数、组合推理——AR 在"读懂语义后准确执行"上比扩散稳
- 训练大模型 scaling 实验——AR 的 loss 更可解释，更好做 scaling law 研究

**不适用**：

- 实时交互式生成 / 图像编辑——扩散派完胜（Stable Diffusion / inpainting / ControlNet）
- 个人 GPU 推理——20B AR 本地基本跑不动；扩散有 SD 1.5 蒸馏版 4G 显存能跑
- 需要中途修改条件——扩散每步都重新读 prompt，AR 一旦写出 token 就回不去
- 高分辨率直出——主模型 256 直出；若不用超分、硬把 token 拉到 1024，序列约 16384，长度随边长平方涨

## 历史小故事（可跳过）

- **2021 年 1 月**：DALL-E 1 出，AR + dVAE token，证明 "把图当 token 序列写"可行，但只到 256×256，质量一般。
- **2021 年底**：扩散派 GLIDE / DALL-E 2 路线雏形成型，**整个圈子转向扩散**。
- **2022 年 4 月**：DALL-E 2 出（扩散派），效果震撼。
- **2022 年 5 月**：Imagen 出（扩散派），FID 创纪录。
- **2022 年 6 月**：Parti 出（AR 派），zero-shot FID 7.23，与 Imagen 相当。Google 同时押两条路，但内部争议据说很大。
- **2023 年**：Muse 出，AR 派改用 parallel mask decoding，速度追上扩散。
- **2024-2025 年**：GPT-4o / Chameleon / Emu3 / VAR 把 AR 路线推到主流。

事后看，**2022 年的"扩散派胜利"只是表象**——2024 年之后 AR 路线靠 LLM 工具链复用反超回来。Parti 是这条路第一次证明 "AR + scaling = 能打"。

## 学到什么

1. **图也能 token 化**——一旦图变成离散符号，所有 LLM 基建（attention / scaling / RLHF）直接复用。这是多模态统一架构的源头。
2. **scaling law 跨模态**——文本世界发现的"模型越大越好"在图像生成里同样成立，没饱和迹象。
3. **路线之争不是非黑即白**——2022 年扩散看似赢了，但 2024 年 AR 反超。技术路线选择要看 **下游生态怎么演化**，不是单看当下 benchmark。
4. **离散 vs 连续是关键分叉**——Parti 选离散 token（兼容 LLM），扩散派选连续 latent（兼容图像编辑）。两套生态互不兼容到现在。

## 延伸阅读

- 论文 PDF：[Parti arXiv 2206.10789](https://arxiv.org/abs/2206.10789)（38 页，扩展材料里有 PartiPrompts 全列表）
- 项目页：[parti.research.google](https://parti.research.google/)（含交互式 demo 和大量样本）
- 图解参考：[The Illustrated Stable Diffusion](https://jalammar.github.io/illustrated-stable-diffusion/)（Jay Alammar；Parti 无同款图解，可对照扩散管线）
- [[dalle-2]] —— DALL-E 2 — 同时期扩散派代表
- [[imagen-2022]] —— Imagen — 同时期扩散派代表

## 关联

- [[imagen-2022]] —— Imagen 是 Parti 同时期的扩散派对手，路线相反
- [[dalle-2]] —— DALL-E 2 是 unCLIP + 扩散，跟 Parti 的 AR + VQ token 形成路线分叉
- [[clip]] —— Parti 也用 CLIP 做语义对齐评估，但本身不依赖 CLIP encoder
- [[ddpm]] —— 扩散模型基础，Parti 走的是另一条路
- [[gpt-3]] —— Parti 借了 GPT 的 next-token prediction 思想到图像
- [[attention]] —— encoder-decoder Transformer 的基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
