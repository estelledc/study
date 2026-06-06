---
title: 视频理解专题（旧入口）
description: 已迁移至专题阅读站 · 54 篇论文分阶段路线图
sidebar:
  order: 4
  label: 视频理解（旧）
---

:::note[已迁移]
本页保留旧链接兼容。完整 **54 篇** 分阶段阅读站请访问：**[视频理解阅读站 →](/stations/video-understanding/)**
:::

> **专题范围**：对话式 Video-LLM、长视频与评测、视频基础编码器，以及对应的工程工具链。
> 详细写作路线图与候选队列在仓库 `research/video-understanding-roadmap.md`（站外维护，不纳入 build）。

## 快速入口

| 类型 | 数量 | 索引 |
|---|---:|---|
| 论文 | 8 | [论文全景 · 视频理解](/study/papers-atlas/#视频理解) |
| 项目 | 5 | [项目全景 · 视频理解](/study/projects-atlas/#视频理解) |

## 推荐阅读顺序

适合第一次系统啃 Video-LLM：先地图，再范式史，最后长视频与工业对标。

1. [[vid-llm-survey-2023]] —— 术语表与范式分类（必读地图）
2. [[videochat-2023]] —— 对话式 Video-LLM 开山
3. [[video-llama-2023]] —— 音视频联合理解
4. [[video-llava-2024]] —— LLaVA 路线延伸到视频（ABP）
5. [[qwen2-vl-2024]] —— 工业级动态分辨率 + M-RoPE
6. [[long-video-retrieval-2023]] —— 长视频：检索选片段 vs 均匀采帧
7. [[tempcompass-2024]] —— 时序理解探针 benchmark
8. [[videoprism-2024]] —— 冻结视频 encoder 基座路线

**前置枢纽**（图像 / 多模态地基，建议先扫一眼）：

- [[clip]] —— 90% Video-LLM 的视觉 backbone 来源
- [[blip2-2023]] —— Q-Former 两阶段范式
- [[llava]] —— 图像侧指令微调；Video-LLaVA 直接前身
- [[flamingo-2022]] —— 冻结 LLM + 视觉 resampler 工业先驱

## 8 篇论文

| 论文 | 一句话 |
|---|---|
| [[vid-llm-survey-2023]] | Video-LLM 全景地图与范式分类 |
| [[videochat-2023]] | 视频 + 指令微调 + 多轮对话第一次合体 |
| [[video-llama-2023]] | 视觉与音频同时进 LLM |
| [[video-llava-2024]] | 投影前先对齐，图像视频共用 LLM |
| [[qwen2-vl-2024]] | 任意分辨率 + 20 分钟长视频工业标杆 |
| [[long-video-retrieval-2023]] | 可学习检索替代均匀采帧 |
| [[tempcompass-2024]] | 四类时序能力探针评测 |
| [[videoprism-2024]] | 两阶段预训练，冻结即 SOTA encoder |

## 5 个项目（工程对照）

| 项目 | 角色 |
|---|---|
| [[decord]] | 训练 / 评测侧高效视频解码（按帧 seek） |
| [[lmms-eval]] | VideoMME / MVBench / TempCompass 等统一跑分 |
| [[internvideo]] | 上海 AI Lab 视频基础模型全栈 |
| [[videollama2]] | Video-LLaMA 系列可运行实现（含音视频） |
| [[llava-next]] | LLaVA 主线：图像 / 视频 / OneVision 统一仓库 |

训练底座：[[pytorch]]（Video-LLM 的 `nn.Module` 与训练循环均在此之上）。

## 两条技术路线对照

```text
学术 / 对话路线          工业 / 编码器路线
videochat → video-llama   videoprism ↔ internvideo
     ↓ video-llava              ↓
     qwen2-vl（统一多模态顶峰）
长视频：long-video-retrieval（检索） vs qwen2-vl（扩 context）
评测：tempcompass（时序）+ lmms-eval（跑分入口）
```

## 与全景索引的关系

- 论文子类「视频理解」在 [papers-atlas](/study/papers-atlas/) 机器学习主题下，当前 **8 篇**均已发布。
- 项目子类「视频理解」在 [projects-atlas](/study/projects-atlas/) 机器学习主题下，当前 **5 个**均已发布。
- 候选队列中尚未写成正式笔记的 slug **不会**在本页挂假链接；新篇发布后 atlas 会在 `prebuild` 时自动收录。
