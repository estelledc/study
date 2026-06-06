---
title: VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
来源: 'Li et al., "VideoChat: Chat-Centric Video Understanding", arXiv 2023'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

VideoChat 是上海 AI Lab 2023 年 5 月发布的**第一个对话式视频理解系统**——它做到了三件事同时成立：给我一段视频，你可以问它「发生了什么」「为什么会这样」「然后呢」，而且能多轮追问。

日常类比：把一段视频当成陌生城市，之前的工具只会给你一张地图（图文匹配）。VideoChat 是第一个导游——它边陪你走边回答任何问题，包括"为什么刚才的路那么拥堵"（因果推理）。

系统内部有两条路：**VideoChat-Text** 先把视频"翻译"成文字（时间轴 + 物体描述 + 字幕），再送进 LLM；**VideoChat-Embed** 把视频帧编码成 embedding，直接插进 LLM 的 attention。Text 路成本低，Embed 路保留更多视觉细节——前者是 Survey 里的范式 A，后者是范式 B。

## 为什么重要

不了解 VideoChat，下面这些事说不清楚：

- 为什么 2023 年下半年的 Video-LLM 几乎全部采用「视频编码器 + Q-Former + 投影层 + LLM」结构——VideoChat 是这条架构路线的第一个完整实现
- 为什么「视频指令数据」这个话题在 2023 年突然爆发——VideoChat 引入了「时序 + 因果」双维度对话数据生成范式，后来的 Video-LLaMA、Video-LLaVA 都复用了这个思路
- 为什么即使是 LLaVA 范式的开山论文也没处理视频——图像理解和视频时序推理在数据构造上是截然不同的工程问题
- 为什么 OpenGVLab 的 InternVideo 系列后来对学界影响这么大——VideoChat 的成功证明了他们的视频基础模型路线值得继续投入

## 核心要点

1. **两阶段训练**：Stage 1 用 10M 视频文本对 + 15M 图像文本对做跨模态对齐（只训连接层，冻结编码器和 LLM）；Stage 2 用 7K 视频描述 + 4K 视频对话做指令微调。两阶段加起来可训参数只有 Q-Former + 投影层，不到 1%。这和 BLIP-2 的思路一脉相承。

2. **指令数据的「时序 + 因果」标注**：传统图像指令数据问的是「图里有什么」；VideoChat 专门设计了「0:02–0:05 秒之间人在做什么」「为什么车子在 0:08 秒突然停下」这类 Temporal 和 Causal 问题。这不是巧合，是论文的核心贡献——没有这类数据，模型只会把视频当静态图看。

3. **视频帧时间戳注入**：在 Stage 2 微调时，每条视频对话的系统提示里都注入了 `The video contains T frames sampled at t₀, t₁, ..., tₙ seconds`。这一行看似朴素，但告诉了模型「帧的时间位置」，是后续所有 Video-LLM 的惯例起源。

## 实践案例

### 案例 1：VideoChat-Embed 推理（Embed 路径）

```python
# VideoChat GitHub: https://github.com/OpenGVLab/Ask-Anything
# 核心依赖：InternVideo + BLIP-2 Q-Former + StableVicuna 7B
from videochat import VideoChat

model = VideoChat.from_pretrained("OpenGVLab/VideoChat")

# 采 4-32 帧，送进 ViT-G 编码器 + Q-Former，压成 32 个视觉 token
response = model.chat(
    video_path="car_accident.mp4",
    question="请找出视频中发生了什么事，以及可能的原因。",
)
print(response)
# -> "视频显示两辆车发生碰撞，前车牌照受损...
#     可能原因是后车追尾，制动距离不足。"
```

### 案例 2：VideoChat-Text 推理（Text 路径，成本更低）

```python
# Text 路径先把视频转成时间轴 + 物体描述，再送进 LLM
from videochat import VideoChatText

model = VideoChatText()
# 先用 GRiT / Tag2Text 为每帧生成描述
description = model.textualize_video("friends_clip.mp4")
# -> "00:00-00:02: 客厅里一男一女坐在沙发上，桌上有一个玻璃杯..."

# 再用 ChatGPT 回答问题
answer = model.ask(description, "他们在谈论什么话题？")
```

### 案例 3：生成视频指令对话数据

```python
# 论文里的数据生成 pipeline，后续 Video-LLaMA/Video-LLaVA 都沿用
import openai

dense_caption = """
00:00-00:03: a man holding a small dog beside a motorcycle.
00:03-00:07: man pats dog, dog wags tail.
"""

prompt = f"""
你是 AI 视觉助手，正在观看一段视频。描述如下：
{dense_caption}
请生成包含「描述性」「时序性」「因果性」三类问题的多轮对话，
重点在时序变化而非静态图像内容。
"""
conversation = openai.chat.completions.create(
    model="gpt-4", messages=[{"role": "user", "content": prompt}]
)
```

## 踩过的坑

1. **长视频（≥1 分钟）仍然失败**：Q-Former 把 T 帧压成固定 32 个 token，视频越长信息损失越大；论文承认这是遗留问题，直到 LLoVi / 可学习检索方法出现才有解法。

2. **指令数据由 ChatGPT 生成，带幻觉**：7K 视频描述 + 4K 对话全是 GPT-4/ChatGPT 生成的——如果 dense caption 本身有错，对话数据就会继承并放大这些错误，模型也会自信地给出错误的因果推理。

3. **帧采样 4–32 帧，快速动作漏帧**：均匀采 4 帧的设定对慢动作场景够用，但对格斗 / 体育 / 交通事故等快速动作容易错过关键帧，这是范式 B（Embedder×LLM）的内生矛盾。

4. **VideoChat-Text 信息损失不可逆**：Text 路把像素变成文字后，颜色细节 / 非显著物体 / 微表情等信息永久丢失；论文定性对比里 VideoChat-Embed 能识别服装颜色而 Text 路不能，说明两路的能力边界相当清晰。

## 适用 vs 不适用场景

**适用**：
- 短视频（<1 分钟）的多轮问答和因果推理
- 作为教学范本理解「视频指令数据如何构造」
- 探索 VideoChat-Text 的零成本部署（不需要 GPU 密集训练）

**不适用**：
- 长视频（>5 分钟）——token 爆炸没有解决
- 需要精确时间戳输出——系统设计面向文字对话，不做 Regressor
- 音频理解——VideoChat 不处理声音信号

## 历史小故事（可跳过）

- **2023-04-15**：VideoChat 初版在 GitHub 公开（VideoChat-Text 路径），几天内在社区引起关注
- **2023-05-10**：论文上传 arXiv，OpenGVLab 团队在 Shanghai AI Lab 发表；同期 Video-LLaMA / Video-ChatGPT 接连出现，对话式视频理解瞬间成为热点
- **2023-下半年**：VideoChat 的 video-centric instruction dataset 范式被 Video-LLaVA / VideoLLaMA2 等直接继承，「时序+因果对话数据」成为视频指令微调的标准做法
- **2024-01**：v2 修订，Awesome-LLMs-for-Video-Understanding 综述将其列为对话式 Vid-LLM 的代表起点

## 学到什么

1. **指令数据的维度决定模型能力的天花板**：加了 Temporal + Causal 两列，模型才会推理时序和因果；如果训练数据只有「这帧里有什么」，模型永远只是图像描述器
2. **Q-Former 是信息压缩的开关**：32 个 token 可以服务短视频，是 BLIP-2 拿来的现成方案；长视频需要更聪明的选帧或检索，VideoChat 选择坦诚承认而不是假装解决
3. **Text 路径的部署成本比 Embed 路径低一个数量级**：没有端到端训练需求，任何调通 ChatGPT API 的人都能复现 VideoChat-Text；这是它在 2023 年初快速流传的工程原因
4. **开源时机很重要**：2023-04 比 Video-ChatGPT（06 月）早两个月，这两个月内的引用头部优势直接影响了后来的综述归因

## 延伸阅读

- 论文 PDF：[arXiv 2305.06355](https://arxiv.org/abs/2305.06355)
- 代码仓库：[OpenGVLab/Ask-Anything](https://github.com/OpenGVLab/Ask-Anything)
- 同期对比论文：[Video-ChatGPT (2023)](https://arxiv.org/abs/2306.05424)（CLIP 版视频对话，结构更简单）
- [[blip2-2023]] —— VideoChat Embed 路径的 Q-Former 直接来自 BLIP-2
- [[vid-llm-survey-2023]] —— 把 VideoChat 归类为"对话式 Embedder×LLM"范式代表

## 关联

- [[blip2-2023]] —— Q-Former + 冻结 LLM 的两阶段训练范式直接来源
- [[llava]] —— 图像侧的指令微调平行工作；VideoChat 的数据生成 pipeline 借鉴了 LLaVA 的 image instruction 部分
- [[flamingo-2022]] —— Perceiver Resampler 把多帧压成固定 token 的思路与 Q-Former 同源
- [[vid-llm-survey-2023]] —— 本文是综述里 Embedder×LLM 范式的奠基案例
- [[video-llama-2023]] —— 同期作品，同样用 Q-Former，但额外处理了音频模态
- [[video-llava-2024]] —— 后继作品，把对齐前置（Alignment Before Projection）进一步降低模态 gap
- [[qwen2-vl-2024]] —— 工业后继：动态分辨率 + M-RoPE 替代 Q-Former 连接
- [[long-video-retrieval-2023]] —— 长视频短板的后继：可学习检索替代均匀采帧
- [[tempcompass-2024]] —— 验证时序推理是否落地的探针 benchmark
- [[videoprism-2024]] —— 更强冻结 encoder 可替换 VideoChat 的 ViT-G backbone
- [[internvideo]] —— OpenGVLab 视频基础模型；VideoChat 数据与 encoder 同源
- [[videollama2]] —— Video-LLaMA 系列工程实现，继承对话式范式
- [[lmms-eval]] —— 复现 VideoChat 系 benchmark 的统一入口
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chat-univi-2023]] —— Chat-UniVi — 动态视觉 token 统一图像与视频对话
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[flash-vstream-2024]] —— Flash-VStream — STAR 双进程记忆的低延迟长流理解
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-2024]] —— InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[lvbench-2024]] —— LVBench — 平均 68 分钟、六维能力的长视频极限考
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[timechat-2024]] —— TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-flash-2025]] —— VideoChat-Flash — 分层压缩，让长视频理解又快又准
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollm-online-2024]] —— VideoLLM-online — 流式视频对话的 LIVE 框架
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务
- [[vtimellm-2023]] —— VTimeLLM — 让 Video LLM 学会标出事件起止时间

