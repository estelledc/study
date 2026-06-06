---
title: InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B
来源: 'Wang et al., "InternVideo2: Scaling Video Foundation Models for Multimodal Video Understanding", arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 高级
provenance: manual-read
---

## 是什么

InternVideo2 是 OpenGVLab 2024 年 3 月发布的**视频基础模型（Video Foundation Model）**系列，目标不是「再接一个 7B LLM 做聊天」这么简单，而是先把**视频 encoder 本身**训到能同时搞定动作识别、检索、字幕、问答和对话。

日常类比：以前的 Video-LLM 像先雇一个只会看连环画封面的实习生，再教他背百科——封面信息不够，聊天再聪明也瞎编。InternVideo2 像先培养一位**能看完整部电影、还懂对白和配乐**的影评人（Stage1–2 把时空结构和语义对齐练扎实），最后才让他上台主持问答节目（Stage3 接 LLM 做 next-token 预测）。

核心设计是**三阶段渐进训练**：① 掩码视频重建，学时空结构；② 跨模态对比学习，对齐视频–文本–音频–语音；③ 接大语言模型做 next-token 预测，解锁开放对话。encoder 规模可扩到 **6B 参数**，在 60+ 项视频/音频任务上报告 SOTA；开源侧常见 **InternVideo2-Chat-8B**（约 1B 视频 encoder + 7B LLM）。

## 为什么重要

不理解 InternVideo2，工业级视频理解和学术 SOTA 的脉络会断档：

- 为什么 2024 年后 Video-LLM 开始强调「**先训 encoder 再 Chat**」——InternVideo2 用三阶段证明：对话能力建立在感知+语义两层的预训练之上，不是单靠指令微调能补
- 为什么 InternVid 230M 语料被 VideoChat、Video-LLaMA 等反复引用——InternVideo2 的数据与训练栈是中文开源社区最完整的**可复现预训练路线**之一
- 为什么 [[videoprism-2024]] 和 InternVideo2 常被放在一起对照——一边是 Google 的掩码蒸馏+冻结 encoder，一边是生成/判别/对话**统一渐进**的 6B 缩放实验
- 为什么 [[lmms-eval]] 和 MVBench 榜单里 InternVideo2-Chat 长期占位——它把「预训练 encoder → 接 LLM → 16 个下游 benchmark」做成一条龙

## 核心要点

1. **Stage1：未掩码 token 重建，先练「眼睛」**：模型学习重建未被遮住的视频 token，用 InternViT、VideoMAE-g 等不同预训练 encoder 当**代理教师**，让 video encoder 获得基础时空感知。类比：先练看慢动作回放、辨认物体轨迹，再学写影评。

2. **Stage2：跨模态对比，把视频和「人话、对白、BGM」对齐**：架构扩展出音频、文本 encoder，用对比学习与匹配损失把视频表征和语音、字幕、文本拉进同一语义空间；VidCap 等多模态标注管线生成融合描述。类比：影评人开始对照剧本、台词和配乐理解一场戏，而不只看画面。

3. **Stage3：next-token 预测，把 encoder 接进 LLM 对话**：构建视频中心对话系统与指令微调数据，把 InternVideo2 encoder 连到 LLM，通过自回归生成进一步更新 encoder，强化 VQA、描述、多轮对话。类比：影评人上台主持问答——观众问什么，他能结合刚才练过的视听语义作答。

## 实践案例

### 案例 1：三阶段训练流程（概念伪代码）

```python
# Stage1: 时空结构 — 掩码重建 + 教师蒸馏
for clip in video_loader:  # decord 采帧，见 [[decord]]
    tokens = video_encoder(clip)
    masked, targets = random_mask(tokens, ratio=0.75)
    pred = decoder(masked)
    loss_s1 = mse(pred, targets) + distill_loss(pred, teacher_vit(clip))

# Stage2: 跨模态对齐 — 视频/文本/音频对比学习
v, t, a = video_encoder(clip), text_encoder(caption), audio_encoder(wav)
loss_s2 = contrastive(v, t) + contrastive(v, a) + matching_loss(v, t)

# Stage3: 接 LLM — next-token 预测（Chat 8B = ~1B encoder + 7B LLM）
vis_tokens = projector(video_encoder(clip))
loss_s3 = llm_next_token_loss(vis_tokens, instruction, answer)
```

逐段解释：Stage1 只训 video encoder 的「看」；Stage2 引入文本/音频分支做 CLIP 式对齐；Stage3 才挂 LLM，且**继续更新 encoder**（不是永远冻结），所以对话能力会反哺视觉表征。

### 案例 2：InternVideo2-Chat-8B 推理入口

```python
# 官方仓库: https://github.com/OpenGVLab/InternVideo
# 模型卡: OpenGVLab/InternVideo2-Chat-8B
# 脚本见 InternVideo2/multi_modality/demo/

model_path = "OpenGVLab/InternVideo2-Chat-8B"
# 典型输入：视频路径 + 文本问题 -> 文本回答
# 内部：InternVideo2 encoder 提时空特征 -> 投影进 7B LLM -> 自回归生成

question = "视频里的人在做什么？"
# demo 中常用均匀或稀疏采帧 + HD 分辨率配置（见 MODEL_ZOO.md）
answer = model.chat(video_path="clip.mp4", text=question)
```

### 案例 3：Stage1 预训练与下游微调（单模态子目录）

```bash
# InternVideo2/single_modality/scripts/ — 只训 encoder，不接 LLM
cd InternVideo2/single_modality
# 准备 InternVid 子集 json + 视频路径列表
bash scripts/pretrain.sh configs/internvideo2_base.py

# 下游：Kinetics / MSR-VTT 等见 MODEL_ZOO.md 的 16 个 benchmark 配置
python eval_mvbench.py --checkpoint path/to/internvideo2_chat.pth
```

预训练阶段不接 LLM，和 [[blip2-2023]] 的「先视觉、后语言」两阶段类似，但规模在**视频域**且数据用 InternVid；评测脚本与 [[internvideo]] 仓库 MODEL_ZOO 对齐，也可导出到 [[lmms-eval]] 横向比。

## 踩过的坑

1. **子目录代际不兼容**：InternVideo1 与 InternVideo2 的 API、权重格式不同，clone 后必须先读对应子目录 README，别混用脚本。

2. **InternVid Full 230M 体量巨大**：预训练视频不是小文件，需按 10M 子集试跑并预留存储，否则 DataLoader 还没跑通磁盘就满。

3. **8B Chat + HD 视频显存门槛高**：单卡 24G 往往不够，要按 MODEL_ZOO 开梯度检查点或多卡，否则推理 OOM。

4. **与 VideoPrism / Qwen2-VL 指标不可硬比**：训练语料、tokenizer、评测脚本都不同，只能比趋势不能比绝对分数。

## 适用 vs 不适用场景

**适用**：
- 需要 SOTA 级**视频 encoder** 权重做 Video-LLM 前端或研究 ablation
- 复现或改进 InternVideo 系列论文与 InternVid 数据管线
- 需要覆盖动作识别、检索、字幕、对话的**统一预训练基座**

**不适用**：
- 只想快速 Gradio 对话 demo（[[videollama2]] / [[llava-next]] 开箱更快）
- 纯图像多模态（LLaVA 系更直接）
- 算力有限的小团队从头跑 6B Stage1–3（成本极高）
- 毫秒级精细手势/体育慢动作——高压缩采帧仍弱于专用运动模型

## 历史小故事（可跳过）

- **2022-12**：InternVideo1 技术报告，提出生成+判别联合预训练
- **2023-07**：InternVid 大规模视频-文本数据集开源，支撑后续 Video-LLM 指令微调
- **2024-03-22**：InternVideo2 报告上传 arXiv:2403.15377，HuggingFace 发布 1B/6B 与 Chat-8B 权重
- **2024 下半年**：InternVideo2.5 长上下文、后续 InternVideo3 / InternVideo-Next 在 [[internvideo]] 仓库子目录持续迭代

## 学到什么

1. **视频基础模型要「感知 → 语义 → 推理」分阶段喂课**：一次性端到端 Chat 很难同时学好时空结构和开放对话，渐进式训练更可扩展
2. **encoder 缩放（到 6B）和 LLM 嫁接是两条线**：换 7B LLM 容易，换高质量 video encoder 难——InternVideo2 把算力主要花在 encoder 上
3. **数据+训练+评测三位一体才有复现价值**：不只开源权重，InternVid、训练脚本和 16 个 benchmark 配置一起发布
4. **Stage3 仍更新 encoder 很重要**：冻结 encoder 接 LLM 省事，但对话监督能反哺视觉表征——这是和「只冻 ViT」路线的关键分歧

## 延伸阅读

- 论文 PDF：[arXiv 2403.15377](https://arxiv.org/abs/2403.15377)
- 项目页：[internvideo.github.io](https://internvideo.github.io/)
- 官方代码：[OpenGVLab/InternVideo](https://github.com/OpenGVLab/InternVideo)
- HuggingFace：OpenGVLab/InternVideo2-Chat-8B
- [[internvideo]] —— 仓库全栈：数据、训练、Chat、评测入口
- [[videoprism-2024]] —— 对照阅读：另一套视频基础模型缩放范式

## 关联

- [[internvideo]] —— 项目枢纽：InternVideo2 代码、InternVid 数据与 MODEL_ZOO
- [[videoprism-2024]] —— 学术对照：掩码蒸馏 vs 三阶段渐进训练
- [[videochat-2023]] —— 早期对话模型，常用 InternVideo 系数据与能力
- [[video-llava-2024]] —— 同赛道 Video-LLM；encoder 选型与「先对齐再投影」对照
- [[qwen2-vl-2024]] —— 工业 Video-LLM 竞品；NDR + M-RoPE vs 6B encoder 预训练
- [[vid-llm-survey-2023]] —— 综述中的视频基础模型与 Embedder×LLM 章节
- [[lmms-eval]] —— 统一评测出口，便于与 VideoLLaMA2 等横向比
- [[decord]] —— Stage1 预训练与 Chat demo 的采帧后端
- [[tempcompass-2024]] —— 时序理解专项 benchmark，可测 Chat 上限
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hour-llava-2025]] —— Hour-LLaVA — 记忆增强，让 LLaVA 读懂一小时视频
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[llava-video-2024]] —— LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[qvhighlights-2021]] —— QVHighlights — 用自然语言查询在视频里找精彩瞬间
- [[ta-stvg-2025]] —— TA-STVG — 解耦「找谁 / 何时 / 何地」的时空视频定位

