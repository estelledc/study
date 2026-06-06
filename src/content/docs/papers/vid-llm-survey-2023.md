---
title: Vid-LLM Survey — 用大语言模型理解视频的全景地图
来源: 'Tang et al., "Video Understanding with Large Language Models: A Survey", TCSVT 2025 (arXiv 2023)'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

这篇综述回答了一个问题：**把 LLM 和视频拼在一起，研究者都想过哪些方式，哪些路跑通了？**

日常类比：你家客厅来了三类修房师傅——第一类先拍照存档再找人描述，第二类把房子缩小塞进脑子，第三类两者结合。这篇综述就是一本师傅名册，把 2022–2024 年上百个 Vid-LLM 系统按这三条路分门别类，告诉你每条路的代表案例、常用工具、已知极限。

具体来说，作者把 Vid-LLM 分为三种范式，LLM 在里面扮演五种角色：

- **范式 A（Video Analyzer × LLM）**：视频先被独立工具分析（目标检测 / OCR / 语音识别），结果以文字送进 LLM。LLM 只读文字。
- **范式 B（Video Embedder × LLM）**：视频帧被编码成 token，直接作为上下文送进 LLM。LLM 边看"图"边说话。
- **范式 C（Analyzer + Embedder × LLM）**：同时走两条路，混合决策。

## 为什么重要

不读这篇综述，下面这些事容易搞混：

- 为什么 VideoChat / Video-LLaMA / Video-LLaVA 结构看起来差不多，但采帧数能差 10 倍——这背后是范式 A/B/C 的架构差异
- 为什么「视频 QA 准确率高」不等于「模型真懂视频」——综述里的 benchmark 分类暴露了这个陷阱
- 为什么大多数 Vid-LLM 忽略音频（看综述表格，多数模型 Sound 列打 ✗）——音视频对齐是独立难点
- 为什么长视频（>5 分钟）至今仍是未解问题——token 爆炸的成因在综述的 limitation 章节里被系统梳理

## 核心要点

1. **三范式的核心权衡**：范式 A（Analyzer×LLM）不需要 GPU 密集训练，但丢了原始像素信息；范式 B（Embedder×LLM）保留视觉细节，但帧数一多 context 窗口立刻撑满；范式 C 两头花钱但天花板最高。选哪条路，本质是精度和算力的权衡。

2. **LLM 的五种角色——不只是"说话机器"**：Summarizer（汇总字幕/描述）、Manager（决定调哪个工具）、Text Decoder（把视频 token 转文字）、Regressor（输出时间戳坐标）、Hidden Layer（视频 token 当 KV 塞进中间层）。Regressor 和 Hidden Layer 这两种非主流角色，告诉你 LLM 不只是生成自然语言的。

3. **均匀采帧是当前的默认 baseline，也是最大弱点**：绝大多数 Vid-LLM 选 4 / 8 / 32 / 100 帧均匀抽——快速动作漏掉了，静止长镜头却浪费 token。解决思路有两种：可学习的帧选择（SeViLA / LLoVi），或靠可学习检索（本系列第 7 篇 long-video-retrieval）。

## 实践案例

### 案例 1：用 lmms-eval 跑一个 VideoQA benchmark

```bash
# 安装 lmms-eval（多模态评测框架）
pip install lmms-eval

# 用 Video-LLaVA 7B 跑 MSVD-QA
python -m lmms_eval \
  --model video_llava \
  --model_args pretrained="LanguageBind/Video-LLaVA-7B" \
  --tasks msvd_qa \
  --batch_size 1 \
  --output_path ./results
```

输出 JSON 里的 `accuracy` 就是论文里的 VideoQA 指标。综述 Table 2 里列的大多数模型都能用这套评测框架复现。

### 案例 2：范式 B——用 LanguageBind 把 8 帧编码成 token

```python
from languagebind import LanguageBind, to_device, transform_dict, LanguageBindImageTokenizer

model = LanguageBind(clip_type={'video': 'LanguageBind/LanguageBind_Video_FT'})
tokenizer = LanguageBindImageTokenizer.from_pretrained('LanguageBind/LanguageBind_Video_FT')

# video_path 是本地 mp4；采 8 帧送进编码器
inputs = {'video': to_device(transform_dict['video'](video_path), device)}
with torch.no_grad():
    embeddings = model(inputs)  # shape: [1, 8, 768]
# 把 embeddings 接 MLP projector 就是 Video-LLaVA 的 B 范式做法
```

### 案例 3：范式 A——用 Analyzer×LLM 做电影问答

```python
# 先用 Whisper 把音频转文字
import whisper
asr_model = whisper.load_model("base")
transcript = asr_model.transcribe("movie_clip.mp4")["text"]

# 再用 CLIP 每秒抽一帧，取 top-K 帧描述
# 最后把字幕 + 帧描述拼成 context 送进 LLM
prompt = f"""
视频字幕：{transcript}
关键帧描述：{frame_captions}
问题：这段视频里发生了什么重大事件？
"""
response = llm(prompt)  # 不需要 LLM 看任何视频帧
```

这就是 VLog / ChatVideo 的做法：LLM 全程只读文字，零视觉 token 消耗。

## 踩过的坑

1. **混淆「VideoQA 高分」与「时序理解」**：大多数 VideoQA benchmark 的问题用单帧就能答对，Vid-LLM 可以靠图像理解作弊——TempCompass 论文后来专门拆出速度 / 方向 / 顺序三个时序维度才揭穿这一点。

2. **音频被系统性忽略**：综述表格里超过 80% 的模型 Sound 列是 ✗，但视频本身音频承载了大量语义（笑声 / 环境音 / 旋律变化）。这导致当前 Vid-LLM 在需要声音的任务上有隐形盲区。

3. **帧数越多未必越好**：LLaMA-VID（1fps）和 MovieChat（2048 帧）结构都能跑，但训练 / 推理成本差 100 倍以上。均匀提高帧数对准确率的边际回报在 32 帧后急剧下降。

4. **综述更新速度跟不上领域**：v1 发布 2023-12，v8 到 2025-11；但领域每月出新模型。把综述当「最终结论」而非「某时间截面的快照」来引用是常见错误。

## 适用 vs 不适用场景

**适用**：
- 想进入视频理解领域前建立整体认知地图
- 选型：为特定视频任务（QA / captioning / temporal grounding）选架构范式
- 对比基线：为自己的方法找 SOTA 基线时，综述的 benchmark 表格是首选查找处

**不适用**：
- 需要最新 2025+ SOTA 模型——综述更新有延迟，要直接查 Papers With Code
- 想深入理解某一个具体模型的实现细节——综述粒度是系统对比，不是源码讲解

## 历史小故事（可跳过）

- **2022-05**：Socratic Models 最早把 LLM 和视频工具链拼起来，纯 Analyzer 范式的先驱
- **2023-05**：VideoChat 发布，第一个「端到端对话式视频理解」系统；同月 Video-LLaMA、Video-ChatGPT 接连出现，Embedder 范式大爆发
- **2023-12**：本综述 v1 上线，收录 ~50 个模型；同期 LLaMA-VID / TimeChat / VTimeLLM 说明长视频是下一个主战场
- **2025-06**：v8 收录模型超过 100 个，并在 IEEE TCSVT 正式接收——至此成为 Vid-LLM 领域的官方综述参考

## 学到什么

1. **视频理解的「三维度」比「一个准确率」有意义**：general（整体描述）/ temporal（时序推理）/ spatiotemporal（时空定位）三类任务对模型的要求完全不同，合并成一个数字会掩盖短板
2. **音频是被低估的模态**：当前多数 Vid-LLM 只用视觉帧；把 ASR 文字或 Audio Q-Former 加进来，是相对低成本的能力扩展
3. **均匀采帧是起点，不是终点**：领域正在从"采多少帧"转向"采哪些帧"——可学习帧选择和检索增强是主流解题方向
4. **LLM 在视频里能做 Regressor** 这件事超出直觉——输出时间戳坐标的能力打开了「视频时序定位」这条新赛道

## 延伸阅读

- 论文 PDF：[arXiv 2312.17432](https://arxiv.org/abs/2312.17432)（TCSVT 2025 正式版）
- 论文仓库：[Awesome-LLMs-for-Video-Understanding](https://github.com/yunlong10/Awesome-LLMs-for-Video-Understanding)（持续更新的模型列表）
- 评测框架：[LMMs-Eval GitHub](https://github.com/EvolvingLMMs-Lab/lmms-eval)（跑 VideoMME / MVBench 等 benchmark 的统一入口）
- [[flamingo-2022]] —— 最早把冻结 LLM 和视觉编码器拼起来做 video few-shot QA 的工作
- [[llava]] —— LLaVA 的图像范式是 Video-LLaVA / LLaVA-NeXT 的起点

## 关联

- [[flamingo-2022]] —— Embedder × LLM 范式的工业奠基；Perceiver Resampler 思路被后续 Video Q-Former 直接继承
- [[blip2-2023]] —— Q-Former 架构是大多数 Embedder × LLM 范式视频模型的连接层参考
- [[llava]] —— LLaVA 的 MLP Projector 极简路线在视频端演化为 Video-LLaVA
- [[clip]] —— 综述表格里 90% 以上的模型用 CLIP ViT 作为视觉 backbone
- [[videochat-2023]] —— 综述里第一类「对话式 Video-LLM」的代表
- [[video-llama-2023]] —— 音视频联合理解子主线
- [[video-llava-2024]] —— 统一视觉表征 + ABP 路线
- [[qwen2-vl-2024]] —— 工业级动态分辨率与长视频工程顶峰
- [[long-video-retrieval-2023]] —— 长视频检索选片段路线
- [[tempcompass-2024]] —— 时序理解专项评测
- [[videoprism-2024]] —— 视频专用 foundation encoder 路线，与 CLIP backbone 对比
- [[video-understanding]] —— 专题枢纽：8 篇阅读顺序与工程对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[cvat]] —— CVAT — 视频帧标注与半自动追踪的开源王者
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[flamingo-2022]] —— Flamingo — 让冻结的大模型学会看图，几张样例就上手
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务

