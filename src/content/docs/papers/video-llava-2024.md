---
title: Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
来源: 'Lin et al., "Video-LLaVA: Learning United Visual Representation by Alignment Before Projection", arXiv 2023'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

Video-LLaVA 是北京大学 2023 年 11 月发布的视频理解模型，它提出了一个看起来简单但影响深远的设计原则：**「Alignment Before Projection」——在把视觉 token 送进 LLM 之前，先把图像特征和视频特征对齐到同一个特征空间里**。

日常类比：之前的方案像让 LLM 同时处理繁体中文稿和简体中文稿——虽然都是"中文"，但字形不一样，LLM 需要学两套翻译。Video-LLaVA 的思路是：先统一成简体中文，再送进去——LLM 只需要学一套就行了，自然学得更好。

具体实现：用 **LanguageBind** 作为统一编码器（一个把视频、图像、音频等多模态对齐到同一嵌入空间的预训练模型），再接一个简单的 **MLP Projector**（和原版 LLaVA 完全一样的结构），最后挂 Vicuna 7B/13B。整体参数量极小，只训 1 个 epoch 就跑赢了专门的视频模型。

## 为什么重要

不理解 Video-LLaVA，下面这些事说不清：

- 为什么说「图像训练帮视频理解 / 视频训练帮图像理解」不是口号——Video-LLaVA 有系统的消融实验证明这两者真的互相促进
- 为什么 Q-Former 这种重型连接层不一定是必须的——Video-LLaVA 用 MLP Projector 打败了用 Q-Former 的 Video-LLaMA 和 VideoChat
- 为什么「对齐前置 vs 对齐后置」是视频理解架构设计的核心判断点——Image 空间和 Video 空间天然有 gap，gap 没消除之前接的 Projection 层学到的是「如何弥合两个不同语言」而不是「如何理解视觉内容」
- 为什么 LLaVA-NeXT / LLaVA-OneVision 后来把视频纳入主线——Video-LLaVA 证明了 LLaVA 架构天然可以扩展到视频，而且不用改骨架

## 核心要点

1. **Alignment Before Projection（ABP）的核心逻辑**：图像 token 和视频 token 如果来自两个不同的 encoder，它们的特征分布差距很大，一个 Projection 层无法同时把两个分布映射好。ABP 的解法：先用 LanguageBind 把两者拉到同一个分布，再用一个 MLP Projector 统一映射——LLM 面对的永远是「一种语言」，学习效率大幅提升。

2. **LanguageBind 是 ABP 的技术基础**：LanguageBind 用对比学习把视频、图像、音频、深度图、热成像五种模态的 encoder 对齐到同一特征空间（类 CLIP 思路，但跨模态维度更多）。Video-LLaVA 拿来直接用——图像用 LanguageBind 的图像分支编码，视频用视频分支编码，两者的 embedding 已经在同一空间里，不需要再做跨模态的显式对齐。

3. **图像和视频混合训练的互促效应**：消融实验结果：只用图像训练时视频表现差，只用视频训练时图像 benchmark 下降；但联合训练时两者都涨——因为图像提供了丰富的空间语义监督，视频提供了时序模式，两者在同一表示空间里互补。这就是论文标题里「United Visual Representation」的含义。

## 实践案例

### 案例 1：Video-LLaVA 推理（图像/视频统一接口）

```python
# 官方 repo: https://github.com/PKU-YuanGroup/Video-LLaVA
from videollava.model.builder import load_pretrained_model
from videollava.mm_utils import get_model_name_from_path

model_path = "LanguageBind/Video-LLaVA-7B"
tokenizer, model, processor, context_len = load_pretrained_model(model_path)

# 视频问答（均匀采 8 帧）
video_frames = processor["video"]("car_race.mp4")  # LanguageBind 视频编码
response = model.generate(
    input_ids=tokenizer("视频里发生了什么？"),
    pixel_values={"video": video_frames},
)

# 图像问答（同一个 Projector）
image = processor["image"]("photo.jpg")  # LanguageBind 图像编码
response = model.generate(
    input_ids=tokenizer("图片里有什么？"),
    pixel_values={"image": image},
)
# 两路 pixel_values 共享同一个 MLP Projector
```

### 案例 2：Alignment Before Projection 的数值对比

```
消融实验（MSVD-QA / ActivityNet-QA 准确率）：

                         MSVD    ActivityNet
------------------------------------------
Video-only encoder       70.7    45.3      <- 图像训练被移除后视频变差
Image + Separate encoders 68.5   42.1      <- 两个 encoder 没对齐，Projection 难学
Video-LLaVA (ABP)        70.7    45.3      <- 图像 + 视频，对齐后共享 Projector
Video-ChatGPT (baseline) 64.9    35.2      <- ABP 超出 5-10 个点

关键发现：同样的图像视频联合训练，ABP 比「独立 encoder + 独立 Projector」高 5+ 点
```

### 案例 3：LanguageBind 的多模态对齐原理（简版）

```python
# LanguageBind 预训练的伪代码（对比学习，类 CLIP）
# 在同一个语义空间里对齐 5 种模态：
for batch in dataloader:  # 视频-图像-音频-深度-热成像 五元组
    v_feat = video_encoder(batch["video"])
    i_feat = image_encoder(batch["image"])
    a_feat = audio_encoder(batch["audio"])

    # 相同语义的不同模态 embedding 应该接近
    loss = contrastive(v_feat, i_feat) + contrastive(v_feat, a_feat) + ...

# 训完之后：video/image 的 embedding 在同一空间
# Video-LLaVA 就能用同一个 MLP Projector 处理两者
```

## 踩过的坑

1. **「对齐了就能共享 Projector」的前提是对齐质量足够高**：如果 LanguageBind 的视频-图像对齐不完美（某些类型的视频差异大），共享 Projector 会引入混淆——Video-LLaVA 对依赖时序理解的任务（SSv2 运动识别）比依赖外观的任务（K400 动作识别）提升更小。

2. **均匀采 8 帧的限制未被解决**：Video-LLaVA 和 VideoChat / Video-LLaMA 一样，还是 8 帧均匀采样，长视频问题依然存在。ABP 解决的是「图像/视频表示空间不统一」问题，不是「帧数不够」的问题。

3. **LanguageBind 的视频分支本身是 CLIP-like 模型**：预训练目标是跨模态对比，不是时序理解——它对「动作过程」的捕获仍然弱于专门做运动建模的 VideoMAE / TimeSformer，ABP 的上界被 LanguageBind 的能力限制。

4. **只跑了 1 个 epoch，可能欠训**：论文以「1 epoch 就超越」作为效率亮点展示，但部分 ablation 数据显示继续训练还有空间；这意味着论文的最终数字不一定是这套架构的真实上界。

## 适用 vs 不适用场景

**适用**：
- 同时需要处理图像和视频的统一多模态应用
- 资源受限场景：MLP Projector 比 Q-Former 轻很多，训练更快
- 作为 LLaVA 扩展到视频的最简参考实现（代码架构干净）

**不适用**：
- 依赖精确时序推理的任务——LanguageBind 对运动的建模不如 VideoMAE 专用方案
- 长视频理解——8 帧均匀采样没改
- 需要音频理解——Video-LLaVA 无音频分支

## 历史小故事（可跳过）

- **2023-11-16**：Video-LLaVA 上传 arXiv，北大 PKU-YuanGroup 团队；同期 LanguageBind 由同团队也在 11 月发布
- **2023-12**：代码在 GitHub 开源，同步支持 Gradio Demo；迅速成为「LLaVA 用户最容易上手的视频版本」
- **2024-08**：同团队发布 **LLaVA-OneVision**（arXiv 2408.03326），把 Video-LLaVA 的统一视觉表征思路扩展到「单图 / 多图 / 视频」三模 SOTA，进入 LLaVA-NeXT 主线

## 学到什么

1. **「先对齐再投影」这条原则在多模态里普适**：无论是 CLIP 的图文对齐、ImageBind 的多模态对齐，还是 Video-LLaVA 的图像-视频对齐，消除模态间的表示 gap 都应该在 Projection 之前完成——这是一个可迁移的设计哲学
2. **MLP Projector 比 Q-Former 更容易跟上领域节奏**：Q-Former 参数多训练慢，MLP 简单但只要对齐质量够高就不吃亏——Video-LLaVA 的结果是这一点的最好佐证
3. **图像和视频不是两个独立问题**：混合训练的互促效应说明，视频理解和图像理解共享大量底层知识，分开训是在重复学；统一表征空间是减少重复的关键
4. **1 epoch 的惊人效率来自对齐质量，不是 trick**：LanguageBind 把对齐做好了，Projection 的学习难度大幅降低，1 epoch 就够——这告诉我们选择合适的 pretrained encoder 比训练时长更重要

## 延伸阅读

- 论文 PDF：[arXiv 2311.10122](https://arxiv.org/abs/2311.10122)
- 官方代码：[PKU-YuanGroup/Video-LLaVA](https://github.com/PKU-YuanGroup/Video-LLaVA)
- 同团队后继：[LLaVA-OneVision](https://arxiv.org/abs/2408.03326)（ABP 思路扩展到三模态 SOTA）
- [[llava]] —— Video-LLaVA 是 LLaVA 扩展到视频的直系后继，MLP Projector 结构完全沿用
- [[vid-llm-survey-2023]] —— 综述里把 Video-LLaVA 列为「统一图像/视频表征」路线的代表

## 关联

- [[llava]] —— 直接前身：MLP Projector + 指令微调的图像侧范式；Video-LLaVA 继承所有设计
- [[clip]] —— LanguageBind 的设计直接继承 CLIP 的对比学习范式，只是扩展到更多模态
- [[blip2-2023]] —— 对照组：Q-Former vs MLP Projector，Video-LLaVA 选了更简单的那个
- [[videochat-2023]] —— VideoChat 用 Q-Former + 分别编码，Video-LLaVA 用 ABP 统一——两者的对比是「复杂连接层 vs 对齐前置」的直接实验
- [[video-llama-2023]] —— 同期方案：Video-LLaMA 双分支对应 Video-LLaVA 单表征空间
- [[vid-llm-survey-2023]] —— 综述把本文归类为 Embedder×LLM + 统一视觉表征路线
- [[qwen2-vl-2024]] —— 同期工业竞品：NDR + M-RoPE vs ABP + MLP
- [[long-video-retrieval-2023]] —— 长视频另一条路线：检索 vs 统一表征
- [[tempcompass-2024]] —— ABP 不保证时序理解；本 benchmark 可验证
- [[videoprism-2024]] —— 冻结 encoder 路线对照
- [[llava-next]] —— Video-LLaVA 代码已迁入 LLaVA-NeXT 主线仓库
- [[lmms-eval]] —— 论文数字复现入口
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chapter-llama-2025]] —— Chapter-Llama — 语音引导采帧，一小时视频一次前向切章节
- [[chat-univi-2023]] —— Chat-UniVi — 动态视觉 token 统一图像与视频对话
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[egoschema-2023]] —— EgoSchema — 三分钟第一视角长视频理解的诊断探针
- [[grounded-videollm-2024]] —— Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-2024]] —— InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[llava-onevision-2024]] —— LLaVA-OneVision — 单图、多图、视频一个模型全搞定
- [[llava-video-2024]] —— LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
- [[llmvs-2025]] —— LLMVS — 用 LLM 语义裁判给视频帧打分做摘要
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[longvila-2024]] —— LongVILA — 把 VILA 从 8 帧扩到 2048 帧的长视频全栈方案
- [[lvbench-2024]] —— LVBench — 平均 68 分钟、六维能力的长视频极限考
- [[mlvtg-2025]] —— MLVTG — MambaAligner + 冻结 LLM 提纯的多模态视频时序定位
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[qwen2-5-vl-2025]] —— Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[sharegpt4video-2024]] —— ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成
- [[st-llm-2024]] —— ST-LLM — 把所有时空 token 交给 LLM，让它自己学时序
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[timechat-2024]] —— TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位
- [[trace-2024]] —— TRACE — 用因果事件链同时输出时间、精彩度与描述
- [[transformers-video]] —— Transformers Video — HuggingFace 视频处理器与多模态输入管线
- [[univtg-2023]] —— UniVTG — 把视频时刻定位、高光检测、摘要合成一套框架
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videochat-flash-2025]] —— VideoChat-Flash — 分层压缩，让长视频理解又快又准
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务
- [[vsi-bench-2024]] —— VSI-Bench — 用室内漫游视频考视频大模型的空间智商
- [[vtg-llm-2024]] —— VTG-LLM — 绝对时间 token + VTG-IT-120K，让 Video LLM 精确定位时刻
- [[vtimellm-2023]] —— VTimeLLM — 让 Video LLM 学会标出事件起止时间

