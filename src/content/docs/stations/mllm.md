---
title: 多模态大模型阅读站
description: 12 篇枢纽论文 · CLIP→LLaVA 开源族谱 · 26 篇候选待扩
sidebar:
  order: 2
  label: 多模态大模型
---

> **专题一句话**：让 LLM 长出「眼睛」——从 CLIP 对比预训练到 LLaVA 指令微调，再到工业闭源上限的对照阅读。  
> 候选池：仓库 [`research/papers-mllm.md`](https://github.com/estelledc/study/blob/main/research/papers-mllm.md)  
> **视频专表**见 [视频理解阅读站](/study/stations/video-understanding/)（VideoMME、长视频等不归本表）。

## 统计

| 维度 | 数量 |
|---|---:|
| 枢纽已写 | **12** |
| 候选待写 | **26** |
| 交叉已写（视频表） | 见 video-understanding |

[← 返回专题阅读站](/study/reading-stations/) · [论文全景 · 多模态](/study/papers-atlas/#机器学习)

---

## 专题导读

MLLM（Multimodal Large Language Model）核心问题是：**怎么把视觉信号接进 LLM，又不把 LLM 训崩**。本阅读站聚焦**图像 / 通用多模态**主线；小时级视频、流式 Agent 见视频专题。

三条技术脉络：

1. **对比预训练** — CLIP / ALIGN 把图文绑进同一嵌入空间
2. **连接器范式** — Q-Former、Perceiver、Cross-Attention 等「翻译层」
3. **指令微调** — LLaVA 式「看图对话」开源族谱

---

## 阅读路线图

### 阶段 0 · 对比预训练地基（入门，2 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 1 | [[clip]] | 初级 | 图文对比学习；90% 下游视觉 backbone 来源 |
| 2 | [[align-2021]] | 初级 | 大规模噪声图文对 + 对比损失工程化 |

### 阶段 1 · 连接器与少样本（中级，3 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 3 | [[flamingo-2022]] | 中级 | 冻结 LLM + Perceiver resampler；少样本看图 |
| 4 | [[blip2-2023]] | 中级 | Q-Former 两阶段：先对齐再生成 |
| 5 | [[coca-2022]] | 中级 | 对比 + 生成双目标统一 |

### 阶段 2 · 指令微调开源主线（中级，1 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 6 | [[llava]] | 中级 | Visual Instruction Tuning；开源 MLLM 对话范式 |

### 阶段 3 · 视觉编码器族谱（中级→高级，4 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 7 | [[vit]] | 初级 | Transformer 视觉 backbone |
| 8 | [[mae]] | 中级 | 自监督掩码预训练 |
| 9 | [[dino]] | 中级 | 自蒸馏视觉特征 |
| 10 | [[sam]] | 中级 | 分割基础模型；与 MLLM grounding 邻域 |

### 阶段 4 · 细粒度对齐与生成（进阶，2 篇）

| 顺序 | 论文 | 难度 | 读完你会 |
|:---:|---|:---:|---|
| 11 | [[filip-2021]] | 高级 | Token 级图文细对齐 |
| 12 | [[dalle-2]] | 中级 | CLIP + 扩散的文本到图（生成侧对照） |

---

## 已写论文一览

| slug | 一句话 |
|---|---|
| [[clip]] | 4 亿图文对对比预训练 |
| [[align-2021]] | 噪声网页图文规模化对齐 |
| [[flamingo-2022]] | 冻结 LLM 的少样本 VLM |
| [[blip2-2023]] | Q-Former 连接器 |
| [[coca-2022]] | 对比 + 生成统一 |
| [[llava]] | 视觉指令微调开源标杆 |
| [[vit]] | 视觉 Transformer |
| [[mae]] | 掩码自编码器 |
| [[dino]] | 自蒸馏视觉表征 |
| [[sam]] | 分割一切模型 |
| [[filip-2021]] | 细粒度 token 对齐 |
| [[dalle-2]] | CLIP 引导扩散生成 |

---

## 待写候选（按子类）

> 完整 26 篇见 `research/papers-mllm.md`。以下高 ROI 首批。

### 评测与基准（待写 4 篇）

| slug | 论文 | 状态 |
|---|---|:---:|
| `mme-benchmark-2023` | MME 14 子任务跑分起点 | 待写 |
| `mmmu-2023` | 大学级跨学科推理 | 待写 |
| `mllm-benchmark-survey-2024` | 200+ benchmark 地图 | 待写 |
| `mme-survey-2024` | 评测方法论综述 | 待写 |

### 工业闭源标杆（待写 3 篇）

| slug | 论文 | 状态 |
|---|---|:---:|
| `gemini-1.5-2024` | 百万 token + 小时级视频 | 待写 |
| `gemini-2-5-2025` | Gemini 2.5 技术报告 | 待写 |
| `internvl2-2024` | 开源逼近 GPT-4V | 待写 |

### 开源架构（待写 10 篇）

| slug | 论文 | 状态 |
|---|---|:---:|
| `internvl-2023` | 6B 视觉基座 + QLLaMA | 待写 |
| `vila-pretrain-2023` | 交错图文预训练 | 待写 |
| `nvila-2024` | VILA 效率升级版 | 待写 |
| `cogvlm-2023` | Visual Expert 深融合 | 待写 |
| `minicpm-v-2024` | 端侧 MLLM | 待写 |
| … | 见 research 表 | 待写 |

---

## 与视频专题的交叉

| 主题 | 本表（MLLM） | 视频表 |
|---|---|---|
| 工业长视频 | `gemini-1.5` · `gemini-2-5` | [[qwen2-vl-2024]] ✓ |
| 开源视频榜 | `internvl2` · `nvila` | [[internvideo2-2024]] ✓ |
| 图像评测 | `mme` · `mmmu` | [[videomme-2024]] ✓ |

**无 slug 重复**：两表候选池零交集，仅阅读路线互链。

---

## 关联项目

| 项目 | 角色 | 状态 |
|---|---|:---:|
| [[llava-next]] | LLaVA 主线仓库（图像 + 视频） | ✅ |
| [[lmms-eval]] | MME / MMMU / VideoMME 统一评测 | ✅ |
| [[pytorch]] | 训练框架 | ✅ |
| [[transformers-video]] | HF 视频 Processor / 解码后端 | ⏳ 待写 |
| [[vllm-multimodal]] | 多模态视频 serving | ⏳ 待写 |

## 工具与实现

图像侧训练从 [[llava]] 仓库起步；视频上限见 [视频理解阅读站](/study/stations/video-understanding/) 的 decord → lmms-eval 评测闭环。

---

## 里程碑

| 里程碑 | 目标 | 状态 |
|---|---|:---:|
| M1 枢纽齐 | 阶段 0–2 六篇在站 | ✅ |
| M2 编码器栈 | vit / mae / dino / sam 可读 | ✅ |
| M3 评测篇 | mme + mmmu 落站 | ⏳ |
| M4 工业对标 | gemini + internvl2 落站 | ⏳ |
| M5 候选 26 清零 | 专表全部发布 | ⏳ |
