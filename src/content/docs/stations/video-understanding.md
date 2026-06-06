---
title: 视频理解阅读站
description: 65 篇论文 · Video-LLM 分阶段路线图 · 11 个工程对照项目
sidebar:
  order: 1
  label: 视频理解
---

> **专题一句话**：教模型「看视频、答问题、跟时间轴对齐」——从 2023 对话式 Video-LLM 到 2025 长视频工业标杆。  
> 候选池与维护清单：仓库 [`research/video-understanding-roadmap.md`](https://github.com/estelledc/study/blob/main/research/video-understanding-roadmap.md)

## 统计

| 维度 | 数量 |
|---|---:|
| 已写论文 | **65** |
| 候选待写 | **0** |
| 关联项目 | **11** |
| 关联项目待写 | **0** |

[← 返回专题阅读站](/study/reading-stations/) · [论文全景 · 视频理解](/study/papers-atlas/#视频理解)

---

## 专题导读

Video-LLM 把图像多模态（CLIP + LLaVA）延伸到**时间维**：帧采样、压缩、检索、时序探针评测。本专题覆盖四条主线：

1. **对话式 Video-LLM** — 指令微调 + 多轮 QA
2. **长视频** — 检索选片段 vs 扩 context
3. **时空定位（VTG）** — 用自然语言在视频里「找片段」
4. **编码器基座** — 冻结 video encoder 服务下游

**前置枢纽**（图像 / MLLM 地基，建议先扫 [MLLM 阅读站](/study/stations/mllm/)）：

- [[clip]] · [[blip2-2023]] · [[llava]] · [[flamingo-2022]]

---

## 阅读路线图

### 阶段 0 · 地图（入门，~1 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 1 | [[vid-llm-survey-2023]] | 初级 | 拿到 Video-LLM 术语表与范式分类 |

### 阶段 1 · 对话范式史（入门→中级，~5 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 2 | [[videochat-2023]] | 初级 | 理解「视频 + 指令微调 + 多轮对话」开山 |
| 3 | [[video-chatgpt-2023]] | 初级 | 对照 GPT-4 路线的早期尝试 |
| 4 | [[video-llama-2023]] | 中级 | 音视频同时进 LLM |
| 5 | [[video-llava-2024]] | 中级 | LLaVA 路线延伸到视频（ABP） |
| 6 | [[chat-univi-2023]] | 中级 | 统一图像-视频对话框架 |

### 阶段 2 · 工业对标（中级→高级，~4 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 7 | [[qwen2-vl-2024]] | 中级 | 动态分辨率 + M-RoPE 工业标杆 |
| 8 | [[internvideo2-2024]] | 高级 | 视频基础模型 2.0 栈 |
| 9 | [[llava-onevision-2024]] | 中级 | 单图 / 多图 / 视频统一 |
| 10 | [[videochat-flash-2025]] | 高级 | 分层压缩长视频 |

### 阶段 3 · 长视频 + 评测（中级，~10 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 11 | [[long-video-retrieval-2023]] | 高级 | 可学习检索替代均匀采帧 |
| 12 | [[llama-vid-2023]] | 中级 | 长视频 token 压缩 |
| 13 | [[longva-2024]] | 中级 | 扩 context 开源路线 |
| 14 | [[longvila-2024]] | 高级 | VILA 长视频训练管线 |
| 15 | [[hour-llava-2025]] | 高级 | 一小时级记忆增强 |
| 16 | [[videomme-2024]] | 中级 | VideoMME 综合大考 |
| 17 | [[mvbench-2023]] | 中级 | 多任务视频 benchmark |
| 18 | [[mlvu-2024]] | 中级 | 多时长分层评测 |
| 19 | [[tempcompass-2024]] | 中级 | 四类时序能力探针 |
| 20 | [[egoschema-2023]] | 中级 | 第一视角长视频诊断 |

### 阶段 4 · VTG / 时空定位（高级，~6 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 21 | [[qvhighlights-2021]] | 中级 | 精彩集锦检索经典 |
| 22 | [[vtimellm-2023]] | 高级 | 时间戳语言 grounding |
| 23 | [[timechat-2024]] | 高级 | 时间感知对话 |
| 24 | [[grounded-videollm-2024]] | 高级 | 带框视频 QA |
| 25 | [[univtg-2023]] | 高级 | 统一 VTG 框架 |
| 26 | [[2d-tan-2019]] | 高级 | 经典 moment retrieval |

### 阶段 5 · 编码器 + 扩展评测（高级，~10 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 27 | [[videoprism-2024]] | 高级 | 冻结 video encoder 基座 |
| 28 | [[llava-video-2024]] | 中级 | LLaVA-NeXT 视频主线 |
| 29 | [[sharegpt4video-2024]] | 中级 | 视频 caption 数据配方 |
| 30 | [[moviechat-2024]] | 高级 | 电影级长叙事 |
| 31 | [[streamingbench-2024]] | 高级 | 流式在线评测 |
| 32 | [[lvbench-2024]] | 高级 | 超长视频 benchmark |
| 33 | [[longvideobench-2024]] | 高级 | 长视频综合考 |
| 34 | [[vsi-bench-2024]] | 高级 | 空间智能探针 |
| 35 | [[st-llm-2024]] | 高级 | 时空 LLM |
| 36 | [[vslnet-2020]] | 高级 | 视频 span 定位经典 |

### 阶段 6 · 本批新增（8 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 37 | [[videollama2-2024]] | 中级 | STC 连接器 + 音视频双分支 |
| 38 | [[videollama3-2025]] | 中级 | 动态分辨率 + token 压缩 |
| 39 | [[internvideo2-5-2025]] | 高级 | 长富上下文 + HiCo 压缩 |
| 40 | [[videollm-online-2024]] | 高级 | 流式 Video-LLM 开山 |
| 41 | [[flash-vstream-2024]] | 高级 | STAR 双进程在线记忆 |
| 42 | [[livevlm-2025]] | 高级 | 免训练流式 KV 管理 |
| 43 | [[worldsense-2025]] | 中级 | 同步音视频全模态 benchmark |
| 44 | [[vinoground-2024]] | 中级 | 时序反事实短视频探针 |

---

## 关联项目工具

| 项目 | 角色 | 状态 |
|---|---|:---:|
| [[decord]] | 训练 / 评测侧高效视频解码 | ✅ 已写 |
| [[torchcodec]] | PyTorch 官方视频解码；lmms-eval v0.7+ 推荐路径 | ✅ 已写 |
| [[lmms-eval]] | VideoMME / MVBench / TempCompass 统一跑分 | ✅ 已写 |
| [[internvideo]] | 上海 AI Lab 视频基础模型全栈 | ✅ 已写 |
| [[videollama2]] | Video-LLaMA 可运行实现 | ✅ 已写 |
| [[llava-next]] | LLaVA 主线：图像 / 视频 / OneVision | ✅ 已写 |
| [[videochat2]] | VideoChat2 三阶段 + MVBench 官方代码 | ✅ 已写 |
| [[ffmpeg]] | 转码 / 抽帧上游（decord 底层依赖；media 侧链） | ✅ 已写 |
| [[opencv]] | 传统 CV 解码 fallback（media 侧链） | ✅ 已写 |
| [[vllm-multimodal]] | Qwen2-VL 等视频 serving | ✅ 已写 |
| [[transformers-video]] | HF 视频 Processor 与解码后端选型 | ✅ 已写 |

**media 侧链**（[`projects-media.md`](https://github.com/estelledc/study/blob/main/research/projects-media.md)）：

| 项目 | 角色 | 状态 |
|---|---|:---:|
| [[librosa]] | 音频特征 / MIR 分析（Video-LLM 音轨侧） | ✅ 已写 |
| [[yt-dlp]] | 评测集 / demo 视频抓取上游 | ✅ 已写 |
| [[pillow]] | 帧预处理 / 缩略图 IO | ✅ 已写 |

训练底座：[[pytorch]] · 阅读站入口：[专题总览](/study/reading-stations/) · [视频理解 hub](/study/stations/video-understanding/)

---

## 待写候选（精选）

> 以下 slug **尚未**发布为正式笔记，仅作排期参考。完整列表见 `research/papers-video-understanding.md`。

| 优先级 | 待写 slug | 子类 |
|:---:|---|---|
| P0 | `qwen2-5-vl-2025` | Qwen 视频工业续作 |
| P1 | `videoagent-longform-2024` | 长视频 Agent |
| P1 | `cover-2025` | 反事实视频推理 |

---

## 里程碑

| 里程碑 | 目标 | 状态 |
|---|---|:---:|
| M1 范式史可读 | 阶段 0–1 全部在站 | ✅ |
| M2 评测闭环 | 阶段 3 前 5 篇 + lmms-eval 跑分指引 | ✅ |
| M3 长视频纵深 | 已写 54 / 候选 65（83%） | 🔄 |
| M4 VTG 专精 | 阶段 4 六篇可读 | ✅ |
| M5 候选清零 | 68 篇候选全部落站 | ⏳ |

---

## 两条技术路线

```text
学术 / 对话路线              工业 / 编码器路线
videochat → video-llama       videoprism ↔ internvideo2
     ↓ video-llava                  ↓
     qwen2-vl（统一多模态顶峰）
长视频：long-video-retrieval（检索） vs qwen2-vl（扩 context）
评测：tempcompass（时序）+ lmms-eval（跑分入口）
```
