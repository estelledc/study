---
title: LLaMA-VID — 每帧两枚 token，把小时级视频塞进 LLM
来源: 'Li et al., "LLaMA-VID: An Image is Worth 2 Tokens in Large Language Models", arXiv 2023'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

LLaMA-VID 是香港中文大学 2023 年 11 月提出的视频/图像理解模型，核心口号是 **「An Image is Worth 2 Tokens」**——不管一帧画面多复杂，送进大语言模型（LLM）时只保留 **两枚视觉 token**：一枚 **context token（上下文 token）** 和一枚 **content token（内容 token）**。

日常类比：以前的 Video-LLM 像把一整本连环画逐页扫描进聊天框——一页 256 个 token，一小时视频（按 1 FPS 采帧）就是 90 多万 token，LLM 根本装不下。LLaMA-VID 的做法像给每页漫画写 **两行摘要**：第一行按你的问题挑重点（context），第二行保留画面骨架（content）。整本书的「页数 token」从几十万压到几千，小时级电影也能聊。

技术栈：EVA-G 视觉编码器 + 文本解码器（BERT / Q-Former）生成 **指令引导的 text query**，经 **context attention** 聚成 context token；视觉特征再经 **自适应平均池化** 压成 content token；两枚 token 线性投影后接入 Vicuna-7B/13B。代码基于 LLaVA 改造，8×A100 约 2 天训完。

## 为什么重要

不理解 LLaMA-VID，下面这些事说不清：

- 为什么 2023 年底开始出现「小时级视频问答」Demo——不是 LLM 上下文突然变无限，而是 **每帧 token 从 256+ 压到 2** 才塞进 64K 窗口
- 为什么「用户问题」可以参与视觉压缩——context token 用 text query 对 patch 特征做注意力，**问剧情就留剧情相关 patch，问服装就留外观 patch**
- 为什么 LLaVA 系论文常把 LLaMA-VID 当长视频基线——同一套 Projector + 指令微调骨架，只改 token 生成策略就能从短视频 QA 扩展到电影级对话
- 为什么后来的 Qwen2-VL、VoCo-LLaMA 仍要讨论 **token 预算**——LLaMA-VID 证明了「双 token 范式」是长视频路线的可行解，但单帧 1 个 content token 仍会丢细粒度时序

## 核心要点

1. **双 token 分工：context 管「问什么」，content 管「画面里有什么」**：context token 由用户指令经 text decoder 生成 query，再对 ViT patch 特征做 softmax 注意力并均值池化，**只保留与问题最相关的视觉线索**；content token 对剩余 patch 做 2D 平均池化，视频模式压到 **1 token/帧**，单图模式可放开到 **256+ token**。类比：context 像按考题划重点，content 像速记整页轮廓。

2. **自适应池化：同一套架构，图像与视频用不同 token 预算**：长视频强制 `n=1` content token，把 10K 帧从 320 万 token（按 LLaVA 256 token/帧估算）降到约 **2 万 token**；单张高清图则保留更多 content token 不牺牲细节。论文在 64K 上下文下支持 **3 小时以上** 视频（约 1 FPS）。

3. **三阶段训练 + 电影级长视频数据**：① 模态对齐（79 万图文/视频字幕对，冻 encoder）；② 指令微调（ShareGPT + 多源视觉/视频 QA）；③ 长视频微调（MovieNet 400+ 部电影剧本，GPT-4 / Claude-2 合成 9K 电影对话 + 6K 长上下文扩展数据）。前两阶段已在 MSVD-QA、MSRVTT-QA 等榜超 Video-ChatGPT；第三阶段解锁「聊电影剧情」。

## 实践案例

### 案例 1：双 token 生成伪代码（论文 Algorithm 1 简化）

```python
# context token：指令引导的注意力聚合
scores = text_q @ vis_embed.transpose(-1, -2)  # (B, M, N)
scores = scores / (vis_embed.shape[-1] ** 0.5)
ctx_embed = (scores.softmax(-1) @ vis_embed).mean(1)  # (B, C)
ctx_token = ctx_proj(ctx_embed[:, None])              # (B, 1, C)  ← context token

# content token：自适应 2D 平均池化，视频 n=1
cur = int(vis_embed.shape[1] ** 0.5)
grid = vis_embed.reshape(B, cur, -1, C)
pooled = F.avg_pool2d(grid.permute(0, 3, 1, 2),
                      kernel_size=cur // n, stride=cur // n)
content_token = vis_proj(pooled.flatten(1, 2))        # (B, n, C)

frame_tokens = torch.cat([ctx_token, content_token], dim=1)  # 每帧 1+n 枚
```

逐段解释：`text_q` 来自用户问题经 BERT/Q-Former 解码；`vis_embed` 是 EVA-G 对单帧的 patch 序列；context 分支只留 **1 枚** 与问题对齐的摘要 token；content 分支把空间网格池化成 **n 枚**（视频 n=1）；拼接后投影进 Vicuna 词嵌入空间。

### 案例 2：零样本视频 QA 数值对比（7B，每帧 2 token）

```
数据集              Video-ChatGPT   VideoChat   LLaMA-VID-7B
----------------------------------------------------------
MSVD-QA Acc         64.9            56.3        69.7
MSRVTT-QA Acc       49.3            45.0        57.7
ActivityNet-QA Acc  35.2            26.5        47.4

Video-ChatGPT 生成评测（Correctness 维度，满分约 5）
Video-ChatGPT: 2.40  →  LLaMA-VID: 2.96

注：公平对比仅用 Stage1+2 数据，未加长视频微调
```

### 案例 3：官方推理入口（短视频 vs 长电影）

```python
# 官方 repo: https://github.com/dvlab-research/LLaMA-VID
from llava.model.builder import load_pretrained_model

model_path = "YanweiLi/llama-vid-7b-full-224-long-video"
tokenizer, model, image_processor, _ = load_pretrained_model(model_path)

# 短视频 QA：每帧 2 token，均匀采帧
video_frames = image_processor.preprocess(video_path, return_tensors="pt")
output = model.generate(
    input_ids=tokenizer("描述这段视频的主要内容", return_tensors="pt").input_ids,
    images=video_frames,  # 内部走 context + content 双 token 管线
    max_new_tokens=256,
)

# 长电影：Stage3 权重 + 64K 上下文，可接字幕 token
# 数据示例见 HuggingFace YanweiLi/LLaMA-VID-Data
```

## 踩过的坑

1. **每帧 1 个 content token 会丢细粒度运动**：快切镜头、手指细微动作在池化后容易糊成一团——ActivityNet 涨分明显，但极短间隔时序题仍弱于专门运动建模 encoder。

2. **context token 强依赖 text decoder 质量**：消融显示 Q-Former 略优于 BERT 做 query 生成；用户问题含糊时，context 注意力会聚错 patch，答非所问。

3. **长视频 Stage3 数据是合成对话，存在分布偏移**：电影剧本 + GPT-4 造 QA 对真实用户提问风格覆盖不全，开源 Demo「聊电影」好用，换工业监控流可能掉点。

4. **64K 上下文不是免费午餐**：2 token/帧看似很少，但 1 FPS 采三小时仍有约 2.1 万视觉 token，再加字幕与文本，推理显存和延迟仍高——压缩的是相对全 patch 展开，不是零成本。

## 适用 vs 不适用场景

**适用**：
- 需要 **小时级** 视频剧情问答、电影摘要、多轮对话（论文主战场）
- 已有 LLaVA 管线，想最小改动支持长视频（继承 Projector + 指令格式）
- 算力有限：8×A100 两天训 7B，比堆更多视觉 token 的方案省钱

**不适用**：
- 毫秒级精细动作识别（体育慢动作、手势阶段）——content token 过粗
- 需要原声/口型/BGM 联合推理——LLaMA-VID 无音频分支
- 高帧率实时流——按 1 FPS 设计，密集时序应用需另做采样策略

## 历史小故事（可跳过）

- **2023-11-29**：论文上传 arXiv:2311.17043，同步开源代码、权重与 Demo 页
- **2023-12-05**：发布长视频 checkpoint（`llama-vid-7b-full-224-long-video`）与 LLaMA-VID-Data，支持「电影聊天」
- **2024**：入选 ECCV 2024；双 token 思路被 VoCo-LLaMA 等后续工作引用为长视频 token 效率基线
- **2024-05 前后**：Video-MME 等更长、更难的 benchmark 上线，社区开始用新榜检验 LLaMA-VID 式压缩的上限

## 学到什么

1. **长视频的第一瓶颈往往是 token 数，不是 LLM 参数量**——把每帧从 256 patch token 压到 2 枚，比换更大 LLM 更直接
2. **压缩不一定要盲池化**：把用户指令变成 text query 再参与注意力，是「可交互压缩」——问什么留什么，比纯 temporal pooling 更省 token
3. **同一架构用不同 n 兼顾图像与视频**：单图放开 content token、视频收紧到 1，比维护两套模型便宜
4. **三阶段课程式训练可复用**：对齐 → 短指令 → 长电影，和 LLaVA 扩展路线一致，工程上容易 incremental 上线

## 延伸阅读

- 论文 PDF：[arXiv 2311.17043](https://arxiv.org/abs/2311.17043)
- 官方代码：[dvlab-research/LLaMA-VID](https://github.com/dvlab-research/LLaMA-VID)
- 项目页：[llama-vid.github.io](https://llama-vid.github.io/)
- 长视频数据：[HuggingFace LLaMA-VID-Data](https://huggingface.co/datasets/YanweiLi/LLaMA-VID-Data)
- [[llava]] —— 代码骨架与 Projector 范式直接继承
- [[videomme-2024]] —— 比 MSVD-QA 更难的长视频综合考卷，可测双 token 压缩上限

## 关联

- [[llava]] —— 母项目：线性 Projector + 指令微调；LLaMA-VID 在其上改 token 生成
- [[blip2-2023]] —— text query 可实例化为 Q-Former，与 BLIP-2 的查询机制同源
- [[clip]] —— EVA-G / ViT patch 特征与 CLIP 系视觉表征一脉相承
- [[vit]] —— 每帧先过 ViT 展平 patch，再进双 token 压缩
- [[flamingo-2022]] —— 更早的「少量视觉 token 接 LLM」探索，LLaMA-VID 把密度推到每帧 2 枚
- [[videomme-2024]] —— 2024 年后长视频评测标准；可对照 LLaMA-VID 压缩策略的天花板
- [[llama]] —— 骨干 LLM 家族；Vicuna 为其指令微调版本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[flamingo-2022]] —— Flamingo — 让冻结的大模型学会看图，几张样例就上手
- [[hour-llava-2025]] —— Hour-LLaVA — 记忆增强，让 LLaVA 读懂一小时视频
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[llava-video-2024]] —— LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
- [[videomme-2024]] —— Video-MME — 视频多模态大模型的「高考卷」
- [[vit]] —— ViT — Vision Transformer

