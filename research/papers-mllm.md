---
title: 论文候选 — MLLM / 多模态大语言模型
description: 26 篇候选，覆盖 MLLM 评测体系、工业标杆（含 Gemini 2.5 / Qwen2.5-VL）、开源架构、连接器范式与数据配方；与 papers-video-understanding.md 分工（本表偏图像/通用，视频专表见彼处）
日期: 2026-06-05
station: mllm
---

# MLLM / 多模态大语言模型主题候选

候选 **26 篇**，按 5 个子主题分组。覆盖 2023–2025，专注 **Multimodal LLM（图像 + 通用多模态 + 工业视频上限）** 主线。

**边界说明**：
- **视频理解 / Video-LLM** → 见 [`papers-video-understanding.md`](./papers-video-understanding.md)（65 候选，**8 篇已写**；VideoMME、流式/Agent、VTG 等专表收录）
- **已写入 study 站、本表跳过**：llava / clip / align-2021 / flamingo-2022 / blip2-2023 / coca-2022 / sam / vit / mae / dino
- **视频专题已写、本表仍相关的条目**：`gemini-1.5`（小时级视频上限）、`vila-pretrain`/`nvila`（LongVILA 管线）、`internvl2`（含视频榜）——**保留本表，视频 roadmap 路线 D 交叉读，不迁移 slug**
- **papers-machine-learning.md 中「多模态视觉-语言」4 篇**（align/flamingo/blip2/coca）与上列重复，排期时以站点已有笔记为准
- 不纳入：纯 OCR（PaddleOCR）、纯 TTS/ASR、Sora/Open-Sora 生成主线；**视频 VTG/STVG 16 篇**不归本表

### 与 papers-video-understanding.md 重叠对照

| 主题 | papers-mllm（本表） | papers-video-understanding | 处理 |
|---|---|---|---|
| 工业长视频 | `gemini-1.5-2024` / `gemini-2-5-2025` | `qwen2-vl-2024` ✓ / `qwen2-5-vl-2025` | 双表各写各的，笔记互链 |
| 开源视频榜首 | `internvl2-2024` / `internvl2-5-2024` | `internvideo2-5-2025` | mllm 写通用 VLM，视频表写 LRC 长视频专版 |
| 训练管线 | `vila-pretrain` / `nvila` | `longvila` / `videochat-flash` | mllm 写预训练范式，视频表写长视频结果 |
| 数据配方 | `sharegpt4v-2023` | `sharegpt4video-2024` | 图像 vs 视频 caption，对照读 |
| 评测 | `mme` / `mmmu` | `videomme` / `mvbench` / `tempcompass` ✓ | 图像评测 vs 视频评测，不合并 |
| 开源架构 | `llava-1.5` / `internvl2` | `video-llava` ✓ / `llava-onevision` | 枢纽 [[llava]] 分叉 |

**无 slug 重复**：两表候选池零交集，仅阅读路线与 wiki-link 交叉。

**与培养路线连接**：Season H（多模态 / 视觉理解）的 CLIP 枢纽已存在；本表补 **工业对标 + 开源架构族谱 + 评测怎么读 leaderboard**。

## 总览

| 子类 | 数量 |
|---|---:|
| [1. MLLM 评测综述与基准](#1-mllm-评测综述与基准) | 4 |
| [2. 工业闭源标杆](#2-工业闭源标杆) | 3 |
| [3. 开源通用 MLLM 架构](#3-开源通用-mllm-架构) | 10 |
| [4. 连接器与融合范式](#4-连接器与融合范式) | 4 |
| [5. 数据配方与视觉编码器](#5-数据配方与视觉编码器) | 4 |

---

## 1. MLLM 评测综述与基准

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `mllm-benchmark-survey-2024` | A Survey on Benchmarks of Multimodal Large Language Models | 2024 | 200+ benchmark 的系统分类（感知/认知/领域/模态）；读它等于拿到 MLLM 评测地图，知道 MME/MMMU/VideoMME 各自测什么 | https://arxiv.org/abs/2408.08632 |
| `mme-survey-2024` | MME-Survey: A Comprehensive Survey on Evaluation of Multimodal LLMs | 2024 | 从 benchmark 构造、judge 方式、toolkit 四步讲清「怎么评」；与上篇互补——上篇列清单，本篇讲方法论 | https://arxiv.org/abs/2411.15296 |
| `mme-benchmark-2023` | MME: A Comprehensive Evaluation Benchmark for Multimodal Large Language Models | 2023 | 14 子任务手工指令-答案对、防数据泄漏；开源 MLLM 跑分的事实起点，与 lmms-eval 工具链直接对接 | https://arxiv.org/abs/2306.13394 |
| `mmmu-2023` | MMMU: A Massive Multi-discipline Multimodal Understanding and Reasoning Benchmark for Expert AGI | 2023 | 11.5K 大学级跨学科题；GPT-4V 仅 ~56%——区分「会看图」和「会用专业知识推理」的分水岭 benchmark | https://arxiv.org/abs/2311.16502 |

## 2. 工业闭源标杆

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `gemini-1.5-2024` | Gemini 1.5: Unlocking Multimodal Understanding across Millions of Tokens of Context | 2024 | 百万 token 长上下文 + 小时级视频/音频原生输入；长视频 MLLM 的工业上限参照，与 LongVA/LongVILA 开源路线对照 | https://arxiv.org/abs/2403.05530 |
| `gemini-2-5-2025` | Gemini 2.5: Pushing the Frontier with Advanced Reasoning, Multimodality, Long Context, and Next Generation Agentic Capabilities | 2025 | Gemini 2.X 技术报告：3h 视频 + 工具调用 + thinking；VideoMME/LVBench 闭源上限，链视频表 `worldsense-2025` | https://arxiv.org/abs/2507.06261 |
| `internvl2-2024` | How Far Are We to GPT-4V? Closing the Gap to Commercial Multimodal Models with Open-Source Suites | 2024 | InternVL2 系列技术报告：动态分辨率 + MPO 对齐 + 开源套件；标题即研究问题——「离 GPT-4V 还差多少」的量化答案 | https://arxiv.org/abs/2404.16821 |

## 3. 开源通用 MLLM 架构

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `internvl-2023` | InternVL: Scaling up Vision Foundation Models and Aligning for Generic Visual-Linguistic Tasks | 2023 | 6B 视觉基座 + QLLaMA 中间件；开源侧「大视觉 encoder + LLM 对齐」范式的奠基，VILA/LLaVA-NeXT 都引它 | https://arxiv.org/abs/2312.14238 |
| `minicpm-v-2024` | MiniCPM-V: A GPT-4V Level MLLM on Your Phone | 2024 | 端侧 2B/8B MLLM：自适应高分辨率切片 + token 压缩 + RLAIF-V；理解「性能-效率 trade-off」的工程样本 | https://arxiv.org/abs/2408.01800 |
| `mplug-owl-2023` | mPLUG-Owl: Modularization Empowers Large Language Models with Multimodality | 2023 | 视觉 encoder / visual abstractor / LLM 三模块解耦；模块化 MLLM 设计语言的早期代表 | https://arxiv.org/abs/2304.14178 |
| `mplug-owl2-2023` | mPLUG-Owl2: Revolutionizing Multi-modal Large Language Model with Modality Collaboration | 2023 | modality-adaptive module 解决模态干扰；与 mPLUG-Owl 对照看「协作 vs 独立通道」 | https://arxiv.org/abs/2311.04257 |
| `vila-pretrain-2023` | VILA: On Pre-training for Visual Language Models | 2023 | 交错图文预训练 + 多阶段 recipe；LongVILA/NVILA 的祖宗，视频理解训练管线的重要参照 | https://arxiv.org/abs/2312.07533 |
| `nvila-2024` | NVILA: Efficient Frontier Visual Language Models | 2024 | VILA 效率升级版（CVPR 2025）：训练/推理加速 + VideoMME/MLVU 视频榜；「工业级 VLM 怎么省算力」 | https://arxiv.org/abs/2412.04468 |
| `cogvlm-2023` | CogVLM: Visual Expert for Pretrained Language Models | 2023 | 在 LLM 每层 attention/FFN 加 visual expert 做深融合；对比 InstructBLIP 浅对齐，理解 fusion depth 对 hallucination 的影响 | https://arxiv.org/abs/2311.03079 |
| `paligemma-2024` | PaliGemma: A versatile 3B VLM for transfer | 2024 | SigLIP + Gemma 3B 轻量 VLM；Google 开源「小模型多任务迁移」样本，含短视频 caption/QA | https://arxiv.org/abs/2407.07726 |
| `internvl2-5-2024` | Expanding Performance Boundaries of Open-Source Multimodal Models (InternVL2.5) | 2024 | 模型/数据/测试时缩放；首个开源 MMMU>70%；多图/视频榜全面刷新，链 `internvideo2-5-2025` | https://arxiv.org/abs/2412.05271 |
| `qwen2-5-vl-2025` | Qwen2.5-VL Technical Report | 2025 | 绝对时间编码 + 动态分辨率 ViT；视频表同 slug 写 VideoMME/Charades-STA 实证，本表写通用 VLM 架构 | https://arxiv.org/abs/2502.13923 |

## 4. 连接器与融合范式

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `instructblip-2023` | InstructBLIP: Towards General-purpose Vision-Language Models with Instruction Tuning | 2023 | instruction-aware Q-Former + 26 数据集统一指令格式；BLIP-2 之后「通用 VLM 指令微调」的标准流程 | https://arxiv.org/abs/2305.06500 |
| `sharegpt4v-2023` | ShareGPT4V: Improving Large Multi-Modal Models with Better Captions | 2023 | GPT-4V 生成高质量详细 caption 做预训练数据；揭示「数据质量 > 架构花活」的 LMM 训练真理 | https://arxiv.org/abs/2311.12793 |
| `siglip-2023` | Sigmoid Loss for Language Image Pre-Training | 2023 | 用 sigmoid 替代 softmax 的 CLIP 变体；MiniCPM-V / PaliGemma / 大量 2024 MLLM 的视觉 encoder 默认选型 | https://arxiv.org/abs/2303.15343 |
| `llava-1.5-2023` | Improved Baselines with Visual Instruction Tuning (LLaVA-1.5) | 2023 | 站内 [[llava]] 枢纽的 1.5 版细节：MLP projector + 高质量 558K 数据；Video-LLaVA / OneVision 的共同起点 | https://arxiv.org/abs/2310.03744 |
| `mm-navigator-2023` | GPT-4V in Wonderland (MM-Navigator) | 2023 | GPT-4V 零样本手机 GUI agent；**非视频**但与视频 Agent 表 §9 对照读 tool-use 范式 | https://arxiv.org/abs/2311.07562 |

## 5. 数据配方与视觉编码器

> 注：本节与 §4 有交叉，侧重「训练数据从哪来」；架构细节见 §3–§4。

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `mantis-2024` | Mantis: Interleaved Multi-Image Instruction Tuning | 2024 | 多图交错指令微调（非单图 QA）；LLaVA-OneVision 多图能力的前置参照，补 Season H 多图场景 | https://arxiv.org/abs/2405.01483 |
| `mme-realworld-2024` | MME-RealWorld: Could Your Multimodal LLM Challenge High-Resolution Real-World Scenarios? | 2024 | 高分辨率真实场景专项 benchmark；测 OCR/细粒度感知，区分「实验室 benchmark 高分」与「真实可用」 | https://arxiv.org/abs/2408.13257 |
| `pope-2023` | Evaluating Object Hallucination in Large Vision-Language Models | 2023 | POPE benchmark：对象幻觉专项；CogVLM/MiniCPM-V 论文必引，理解 MLLM 可信度评估 | https://arxiv.org/abs/2305.10355 |
| `mmmu-pro-2024` | MMMU-Pro: A More Robust Multi-discipline Multimodal Understanding Benchmark | 2024 | MMMU 加强版：防 OCR 捷径 + 视觉依赖题型；2024 下半年 MLLM 刷榜新标准 | https://arxiv.org/abs/2409.02813 |

---

## 阅读顺序建议

1. **入门**：mme-benchmark → mmmu → internvl2（工业对标三角）
2. **架构深潜**：blip2（站内已有）→ instructblip → llava-1.5 → cogvlm（浅对齐 vs 深融合）
3. **接视频线**：vila-pretrain → internvl2-5 / qwen2-5-vl → 转入 [`papers-video-understanding.md`](./papers-video-understanding.md) 的 llava-onevision / internvideo2-5 / 流式 §7；排期见 [`video-understanding-roadmap.md`](./video-understanding-roadmap.md)

## 配套项目候选

- 评测 CLI：[`projects-video-understanding.md`](./projects-video-understanding.md) 中的 `lmms-eval`
- 训练/推理：`llava-next`（LLaVA-OneVision 代码归宿）、InternVL / VILA 官方仓库
