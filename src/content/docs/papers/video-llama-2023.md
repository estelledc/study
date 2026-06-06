---
title: Video-LLaMA — 把音频和视频同时塞进大语言模型
来源: 'Zhang et al., "Video-LLaMA: An Instruction-tuned Audio-Visual Language Model for Video Understanding", EMNLP 2023'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

Video-LLaMA 是阿里巴巴 DAMO Academy 2023 年 6 月发布的**第一个同时处理视觉和音频的视频理解 LLM**。在它之前，VideoChat / Video-ChatGPT 这类系统只看画面，听不见声音；AudioGPT 只能听声音，看不见画面。Video-LLaMA 第一次让两件事在一个系统里同时成立。

日常类比：之前的视频 AI 助手像一个戴着耳机但捂住眼睛的人（只听）或者摘掉耳机但睁着眼的人（只看）。Video-LLaMA 是第一个既不捂眼又不堵耳的——你把一段演唱会视频扔给它，它能回答「台上的歌手在哪个城市演出」（视觉）和「这首歌叫什么」（音频）。

架构核心是**两条并行分支**：Vision-Language Branch（帧级别编码 + Video Q-Former）处理画面，Audio-Language Branch（ImageBind 音频编码器 + Audio Q-Former）处理声音，最后两路 token 一起送进冻结的 LLaMA/Vicuna。

## 为什么重要

不了解 Video-LLaMA，下面这些事没法解释：

- 为什么说 ImageBind 的「共享嵌入空间」是一个意外的工程礼物——Video-LLaMA 靠这个把「几乎没有音频-文字对齐数据」的问题绕过去了
- 为什么后续的 VideoLLaMA2 / VideoChat 系列都强调「音视频联合理解」——Video-LLaMA 是第一个让人看到这条路可行的系统
- 为什么视频 Q-Former 和图像 Q-Former 要分开设计——帧与帧之间的时序信息无法靠单帧编码捕获，需要在 Q-Former 里加位置编码层
- 为什么「用视觉数据训练音频接口」这种绕道听起来荒谬但实际有效——ImageBind 的多模态对齐能力是这个 trick 成立的技术前提

## 核心要点

1. **Vision 分支：Position Embedding + Video Q-Former**：图像编码器逐帧产出 embedding 后，先加上可学习的时间位置编码（告诉模型「这是第 3 秒的帧」），再送进 Video Q-Former 压缩成固定 K 个 token。关键点：位置编码加在 Q-Former 输入前，而不是在原始图像编码器里——因为 CLIP ViT-G 是冻结的，不能改。

2. **Audio 分支：ImageBind + 用视觉数据训练的巧妙绕道**：训练音频-语言对齐最大的难点是音频-文字对数据极少。Video-LLaMA 的解法：用 ImageBind 作为音频编码器——ImageBind 已经把音频、图像、视频、IMU 等多模态对齐到同一空间，于是「音频 embedding」和「视觉 embedding」在该空间里已经很接近，可以用大量现有的视觉-文字数据来训练 Audio Q-Former + Linear Layer，无需真实音频-文字对。

3. **两阶段训练，Vision 和 Audio 分支独立训**：Stage 1 用 Webvid-2M 视频字幕对 + CC595k 图像字幕做视觉-语言对齐（只训 Position Embedding + Video Q-Former + Linear，其余冻结）；Stage 2 混入 VideoChat 的视频指令数据 + LLaVA 的图像指令数据做微调。音频分支的 Stage 1 也用视觉数据训，Stage 2 靠模型在推理时自动跨模态。

## 实践案例

### 案例 1：加载并推理（音视频联合）

```python
# 官方 demo: https://github.com/DAMO-NLP-SG/Video-LLaMA
# HuggingFace: DAMO-NLP-SG/Video-LLaMA-2-7B-Finetuned

import torch
from video_llama.conversation.conversation_video import Chat, conv_llava_llama_2

# 加载模型（Vision 分支 + Audio 分支 + LLaMA 7B）
chat = Chat.from_pretrained("DAMO-NLP-SG/Video-LLaMA-2-7B-Finetuned")

# 上传视频（均匀采 8 帧 + 提取音频）
chat.upload_video("concert.mp4", conv=conv_llava_llama_2.copy())

# 音频问题
audio_answer = chat.answer("这段音乐的风格是什么？", max_new_tokens=200)

# 视觉问题
visual_answer = chat.answer("台上有几个演员？", max_new_tokens=200)
```

### 案例 2：Video Q-Former 的时序位置编码

```python
# 伪代码：Vision-Language Branch 的核心逻辑
class VideoQFormer(nn.Module):
    def forward(self, frame_embeddings):
        # frame_embeddings: [B, N_frames, K_f, D]  <- ViT-G 逐帧输出
        B, N, K, D = frame_embeddings.shape

        # 加时间位置编码（可学习），区分「第 1 帧」和「第 8 帧」
        temporal_pos = self.position_embedding(torch.arange(N))  # [N, D]
        frame_embeddings = frame_embeddings + temporal_pos.unsqueeze(1)  # broadcast

        # 展平成 [B, N*K, D] 喂进 Q-Former（结构同 BLIP-2）
        flat = frame_embeddings.view(B, N * K, D)
        video_tokens = self.qformer(flat)  # [B, K_V, D_v]  <- 压成固定 K_V 个 token
        return self.linear(video_tokens)   # 映射到 LLM embedding 维度
```

### 案例 3：ImageBind 绕道训音频对齐

```python
# 关键 trick：ImageBind 已经对齐图像/音频/视频到同一空间
# 因此可以用「视觉数据」来训「音频接口」——两者在 ImageBind 空间里已经对齐

from imagebind.models import imagebind_model
audio_encoder = imagebind_model.imagebind_huge(pretrained=True)

# 训练时：输入图像 I，让 Audio Q-Former 对齐到 LLM 空间
img_embed = audio_encoder.forward({"vision": image_tensor})  # [B, D_bind]
audio_tokens = audio_qformer(img_embed)  # 训练用视觉 embedding

# 推理时：输入音频，因为 ImageBind 空间共享，接口自然迁移
aud_embed = audio_encoder.forward({"audio": spectrogram})   # 同一空间
audio_tokens = audio_qformer(aud_embed)  # 零样本迁移，无需音频训练数据
```

## 踩过的坑

1. **「用视觉训音频」的零样本迁移不稳定**：ImageBind 的跨模态对齐并不完美，音频-视觉 gap 在某些类型的声音（环境音 vs 语音 vs 音乐）上差异很大，模型的音频理解能力有明显上限，需要 VideoLLaMA2 加入真实音频数据才能修复。

2. **长视频仍然失败**：均匀采 8 帧的限制和 BLIP-2 Q-Former 的设计让长视频直接截断；论文在 limitation 里直接承认，1 分钟以上的视频不可靠。

3. **Q-Former 的 frozen 初始化被复用但未针对时序优化**：Video Q-Former 从 BLIP-2 的图像 Q-Former 参数初始化，它对「跨帧时序关系」没有专门设计。位置编码层是随机初始化的小模块，不一定能弥补时序建模的不足。

4. **Webvid-2M 字幕质量差**：预训练数据大多是股票视频的营销文案（「年轻女性在海边享受阳光」），与画面语义对应松散，导致 Stage 1 对视觉-语义对齐贡献有限，主要靠 Stage 2 指令微调补救。

## 适用 vs 不适用场景

**适用**：
- 含音频语义的视频问答（环境音识别 / 歌曲风格 / 对话内容）
- 学习「如何绕开音频训练数据稀缺」问题的参考工程方案
- 作为 AudioVisual LLM 的入门代码范本（官方完整开源）

**不适用**：
- 长视频（>1 分钟）——同 VideoChat 的 Q-Former 限制
- 精确音频分析（乐器识别 / 音高检测）——ImageBind 绕道能力有限
- 生产级别部署——论文定位是「早期原型系统」

## 历史小故事（可跳过）

- **2023-06-05**：Video-LLaMA v1 上传 arXiv；DAMO Academy 同步开源完整代码
- **2023-06**：同月 Video-ChatGPT（Mohamed Maaz 等）发布，但无音频——Video-LLaMA 在表格对比里是唯一三栏全打勾的模型
- **2023 EMNLP**：Findings 收录；被 Vid-LLM Survey 列为「音视频联合理解」的开山模型
- **2024**：续作 VideoLLaMA2 发布，用真实音频数据训练，修复了「ImageBind 绕道」方案的稳定性问题

## 学到什么

1. **「共享嵌入空间」可以把数据稀缺变成工程优势**：ImageBind 把多模态对齐做完了，所以 Video-LLaMA 可以用间接数据训练音频接口——这种「借船出海」的思路在数据受限场景下有广泛借鉴价值
2. **位置编码必须在 Q-Former 输入前加，不能在冻结 encoder 里加**：这是冻结 encoder 架构的普遍约束——如果 encoder 可训，可以直接加 temporal embedding；冻结了就只能在连接层里补
3. **两个分支独立训练 > 联合训练**：视觉数据量（百万级）远大于音频数据量（极少），联合训练会让视觉分支压制音频分支的梯度，分开训才能让两个分支各自充分学习
4. **早期原型坦诚说限制，比假装没问题更有价值**：Video-LLaMA 在 limitation 里直接写长视频 / 幻觉 / 感知能力不足——这种诚实让后续工作有明确的改进方向，VideoLLaMA2 正是沿这三条路改的

## 延伸阅读

- 论文 PDF：[arXiv 2306.02858](https://arxiv.org/abs/2306.02858)（EMNLP 2023 Findings）
- 官方代码：[DAMO-NLP-SG/Video-LLaMA](https://github.com/DAMO-NLP-SG/Video-LLaMA)
- 续作：[VideoLLaMA2](https://github.com/DAMO-NLP-SG/VideoLLaMA2)（修复音频问题，加入真实音频训练数据）
- [[blip2-2023]] —— Q-Former 的直接来源；Video Q-Former 从 BLIP-2 权重初始化
- [[vid-llm-survey-2023]] —— 把 Video-LLaMA 归类为「音视频联合 Embedder×LLM」的代表

## 关联

- [[blip2-2023]] —— Video Q-Former 直接继承 BLIP-2 的 Q-Former 结构和初始权重
- [[flamingo-2022]] —— Perceiver Resampler 思路的同源先驱；Video-LLaMA 的 Q-Former 是更紧凑的实现
- [[videochat-2023]] —— 同期的视觉侧对话系统；VideoChat 无音频，Video-LLaMA 有音频，两篇论文互为对照
- [[vid-llm-survey-2023]] —— 本文是综述里「音视频联合理解」这条子主线的奠基参考
- [[videollama2]] —— 官方续作，解决了 Video-LLaMA 的三个核心 limitation
- [[video-llava-2024]] —— 平行的视觉侧简化方案，用 MLP Projector 替代 Q-Former
- [[qwen2-vl-2024]] —— 工业后继：Qwen2 作 LLM 后端 + 解冻 ViT
- [[long-video-retrieval-2023]] —— 长视频消融对照；均匀采帧路线的后继改进
- [[tempcompass-2024]] —— 时序理解探针；验证音视频训练是否真懂时间
- [[videoprism-2024]] —— 冻结 encoder 路线对照
- [[lmms-eval]] —— MVBench / VideoMME 等 leaderboard 复现入口
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chat-univi-2023]] —— Chat-UniVi — 动态视觉 token 统一图像与视频对话
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[timechat-2024]] —— TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解
- [[videollama3]] —— VideoLLaMA3 — 阿里达摩院第三代图像/视频多模态基座
- [[videollama3-2025]] —— VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务
- [[worldsense-2025]] —— WorldSense — 真实世界同步音视频理解 benchmark

