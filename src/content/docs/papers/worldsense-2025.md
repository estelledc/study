---
title: WorldSense — 真实世界同步音视频理解 benchmark
来源: 'Guo et al., "WorldSense: Evaluating Real-World Multimodal Understanding", ICLR 2026'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

**WorldSense** 是 2025 年发布、ICLR 2026 接收的**真实世界全模态理解评测**：精选 **1,662 段同步音视频**（覆盖日常、户外、多语言等场景），配套 **3,172 道四选一 QA**，同时考察**画面、对白、环境音、音乐**的联合理解，弥补 [[videomme-2024]] 以视觉为主的缺口。

日常类比：VideoMME 像「闭卷看图做题」；WorldSense 像**现场听音乐会**——既要看见舞台，又要听清歌词和环境声，还要判断谁在说话。纯视觉高分在这里会露馅。

与 [[video-llama-2023]] / [[videollama2-2024]] 强调的**音视频联合**能力直接对齐；是 2025 年后 AV-MLLM 论文的新必报榜之一。

## 为什么重要

不了解 WorldSense，会高估「只看几帧」的 Video-LLM：

- **同步音视频是真实世界默认模态**：用户拍的手机视频大多有声，静音评测偏离分布
- **3172 题覆盖多类声学事件**：音乐节奏、环境噪声、多人对话交叉，测模型是否「只会读字幕」
- **与 VideoMME / MVBench 互补**：VideoMME 重时长与领域；MVBench 重运动微技能；WorldSense 重**声画一致**
- **揭示 GPT-4o 与开源 AV 模型差距**：论文报告闭源仍领先，但 BEATs 类音频分支显著涨分

## 核心要点

1. **1662 段真实同步 AV**：非后期配音，保留现场收音、背景音乐、环境噪声。类比：纪录片原声而非翻译腔配音。

2. **3172 QA 多技能标签**：含「谁在说话」「背景乐器」「画面与声音是否一致」等；迫使模型用音频，不能只 OCR 字幕。

3. **评测协议支持 video-only / video+audio**：同一题可关音频做 ablation，量化「听」带来的增益——类似 VideoMME 的字幕/音频消融但更重声学。

## 实践案例

### 案例 1：用 LMMs-Eval 跑 WorldSense（预期接口）

```bash
# 任务名以 lmms-eval 上游为准，概念命令：
python -m lmms_eval \
  --model videollama2_av \
  --tasks worldsense \
  --model_args "modal=av" \
  --output_path ./results/worldsense

# 对比纯视觉
python -m lmms_eval \
  --model videollama2 \
  --tasks worldsense \
  --model_args "modal=video"
```

对比两次输出的 `audio_gain` 分项，验证音频分支价值。

### 案例 2：典型题型（概念）

```text
题型 A：画面显示钢琴，问「正在演奏的乐器是？」→ 需视觉
题型 B：仅闻狗吠未见狗，问「附近有什么动物？」→ 需音频
题型 C：口型与声音不匹配，问「说话者是否在画面中央？」→ 需声画联合

纯 8 帧视觉模型在 B/C 类接近随机；VideoLLaMA2-AV 类明显提升
```

### 案例 3：与现有 benchmark 分工

| Benchmark | 主打 | 音频权重 |
|-----------|------|---------|
| [[videomme-2024]] | 短中长 + 六领域 | 可选字幕/音频 |
| [[mvbench-2023]] | 20 种动态微技能 | 低 |
| [[tempcompass-2024]] | 时序概念 | 低 |
| WorldSense | 真实同步 AV | **核心** |

做产品 roadmap 时可将 WorldSense 设为「音视频功能开关」的验收测试：关音频与开音频的分数差若 <3 点，说明音频分支未真正生效。

## 踩过的坑

1. **用字幕代替音频作弊**：WorldSense 部分样本故意声画信息互补，只喂 OCR 字幕会掉分且不符合评测精神。

2. **视频-only 与 AV 分数不可混报**：论文要求标明模态；拿 8 帧视觉分宣称「懂真实世界」会误导。

3. **采样率影响音频分支**：BEATs / Whisper 特征对 16k vs 48k 敏感，复现要固定预处理。

4. **与 [[vinoground-2024]] 混淆**：Vinoground 测时序反事实短视频；WorldSense 测真实长场景同步 AV——互补不是替代。

## 适用 vs 不适用场景

**适用**：
- 评测 [[videollama2-2024]]、[[video-llama-2023]] 等 AV 模型
- 验证「加音频分支是否值得」的产品决策
- 与 [[videomme-2024]] 一起报综合 + AV 专项

**不适用**：
- 纯视觉 CLIP 分类（无 LLM 问答）
- 文本-only LLM
- 静音幻灯片/屏幕录制主导的场景（VideoMME 更合适）

## 历史小故事（可跳过）

- **2023**：[[video-llama-2023]] 首开音视频进 LLM。
- **2024**：[[videomme-2024]] 成为综合视频榜；音频仍为可选项。
- **2025-02**：WorldSense arxiv 2502.04326，强调 real-world sync AV。
- **2026**：ICLR 2026 接收，纳入 [[lmms-eval]] 任务生态。

## 学到什么

- **真实世界理解默认有声**；静音 benchmark 会系统性高估产品体验。
- **声画不一致题是照妖镜**；只靠字幕的模型会在这里崩盘。
- **报分要分模态**；video / video+audio 两条曲线都要给。
- **1662 段虽小于 VideoMME 900 段×三时长，但声学标签更细**；适合专项而非全面排位。
- **与 [[videollama2-2024]] 2.1-AV 是天然搭档**：论文级音频分支应在此榜验证而非只看 MSVD。
- **ICLR 2026 接收后预计更多模型报分**：早期 baseline 可先自建对照表存档。

## 延伸阅读

- 论文 PDF：[arXiv:2502.04326](https://arxiv.org/abs/2502.04326)
- 音频模型：[[videollama2-2024]]、[[video-llama-2023]]
- 综合榜：[[videomme-2024]]
- 时序榜：[[tempcompass-2024]]
- 跑分：[[lmms-eval]]

## 关联

- [[videomme-2024]] —— 综合视频榜对照
- [[video-llama-2023]] —— 音视频联合开山
- [[videollama2-2024]] —— AV 分支主要受测者
- [[mvbench-2023]] —— 动态微技能评测
- [[tempcompass-2024]] —— 时序概念评测
- [[lmms-eval]] —— 统一 CLI 入口
- [[vinoground-2024]] —— 时序反事实短视频互补



> 维护提示：
- 双千进度以 `data/written.txt` 与 atlas 为准，勿手工改计数。
- 训练 I/O 默认对照 [[decord]]；评测迁移可试 [[torchcodec]]（lmms-eval v0.7+）。
- 与 [[vid-llm-survey-2023]] 范式分类对照阅读，避免孤立记模型名。
- 候选队列维护见 `research/papers-video-understanding.md`，站内 slug 以 atlas 为准。
- 长视频与流式子题见专题站 `/stations/video-understanding/` 分阶段表。
- 报分请注明采帧数、模态（video / av）与解码后端，便于跨论文对比。
- 工程对照项目见 [[decord]]、[[lmms-eval]]、[[videochat2]] 等专题笔记。
- 与专题阅读站 [[video-understanding]] / stations 路线图对照，避免候选表与站内 slug 脱节。
发版前用 [[lmms-eval]] 或官方脚本复现文中数字；pinned 依赖以各仓库 README 为准。
- 关联条目使用 `[[slug]]` 格式，build 时由 backlink 脚本补全反向链。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chapter-llama-2025]] —— Chapter-Llama — 语音引导采帧，一小时视频一次前向切章节
- [[llmvs-2025]] —— LLMVS — 用 LLM 语义裁判给视频帧打分做摘要
- [[qwen2-5-vl-2025]] —— Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解
- [[traveler-2024]] —— TraveLER — 四段式多 Agent，帧级问答看懂长视频
- [[videoagent-longform-2024]] —— VideoAgent (Wang) — LLM Agent 迭代选帧理解长视频
- [[videoagent-memory-2024]] —— VideoAgent（Fan）— 双记忆 + 四工具，长视频逼近 Gemini

