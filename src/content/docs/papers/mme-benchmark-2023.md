---
title: MME Benchmark — 开源 MLLM 评测的事实起点
来源: 'Fu et al. "MME: A Comprehensive Evaluation Benchmark for Multimodal Large Language Models". arXiv 2023'
日期: 2026-06-06
分类: 机器学习
子分类: 多模态 LLM
难度: 初级
---

## 是什么

MME（Multimodal Large Language Model Evaluation）是 2023 年发布的 **第一个全面 MLLM 评测基准**之一：14 个子任务，覆盖**感知**（能不能看清）和**认知**（能不能想对），所有指令-答案对**手工设计**，防训练集泄漏。

日常类比：像高考出题组——不直接从课本（公开数据集）抄题，而是老师全新命题，这样分数才反映真本事，不是背答案。

## 为什么重要

不懂 MME，下面这些事说不清：

- 为什么开源 MLLM 论文几乎必报 MME 分数——它是社区公认的起跑线
- 为什么 [[lmms-eval]] 默认包含 MME 任务
- 为什么 [[mllm-benchmark-survey-2024]] 把它列为感知/认知类代表
- 为什么手工 QA 对比自动爬取 VQA 更抗数据污染

## 核心要点

1. **14 子任务二分**：感知（存在性、数量、位置、颜色…）+ 认知（常识、数值计算、翻译、代码…）。分开记分，拒绝单一总分糊弄。

2. **手工指令-答案对**：不用公开 VQA 测试集原题，降低「训练见过」风险。简洁指令也减少 prompt engineering 不公平。

3. **定量可统计**：Yes/No 或短答案为主，metric 简单透明，适合 leaderboard 和消融实验。

## 实践案例

### 案例 1：跑 MME 分数

```bash
# 通过 lmms-eval 统一入口
python -m lmms_eval --model llava --tasks mme --batch_size 1
# 输出 Perception / Cognition 分项与总分
```

### 案例 2：读分不要只看 Total

```text
模型 X: Perception 1400 / Cognition 400  → 眼尖脑钝
模型 Y: Perception 900  / Cognition 550  → 平衡型
→ 产品选型取决于你要 OCR 还是推理
```

### 案例 3：与 MMMU 互补

```text
MME   → 短指令、防泄漏、感知+认知基础盘
MMMU  → 大学学科多模态推理、更难
→ 论文里两个都报才完整（见 [[mllm-benchmark-survey-2024]]）
```

跑分前固定：模型 revision、图像 resize 短边、精度 fp16/bf16。MME 对数值敏感，README 应贴完整环境表而不只一个总分。

Perception 子项里 OCR 与 color 对视觉塔分辨率敏感；换 [[siglip-2023]] patch 大小时要重跑全表，不能 cherry-pick 涨分项。

社区扩展了 MME-RealWorld 等变体；引用时写清版本，避免「MME」一词多义。

## 踩过的坑

1. **prompt 改动**：官方指令极简，加 CoT 可能涨分但不可横向比。

2. **图像路径版本**：不同 repo 的预处理图不一致，分数微小漂移。

3. **只报 Total**：掩盖感知/认知偏科，误导产品决策。

4. **忽略后续子集扩展**：MME 生态在更新，要对齐 commit 版本。

## 适用 vs 不适用场景

**适用**：
- 开源 MLLM 基础能力体检
- 对比两个模型「眼」和「脑」谁强
- 接入 [[lmms-eval]] 的标准任务之一

**不适用**：
- 长视频理解（用 VideoMME 等）
- 专业领域深度（用 Med-VQA 等）
- 替代人类主观体验评测


## 进阶话题（可跳过）

这一节把前文和工业落地再绑紧一点，方便你读完就能动手选型或读论文。

1. **子任务权重**：公开总分是加权和；复现时最好分项上报便于横向比。
2. **开源模型标配**：LLaVA、InternVL README 几乎必含 MME；它是社区信任锚点。
3. **与 [[mllm-benchmark-survey-2024]] 关系**：本篇是地标基准，综述是全域地图。
4. **迭代版本**：跟踪 Awesome-MMLLM 仓库 Evaluation 分支更新。
## 历史小故事（可跳过）

- **2023.06**：MME arXiv，30 个 MLLM 首轮评测。
- **2023 底**：[[lmms-eval]] 等工具链收录，成为默认榜。
- **2024**：[[mllm-benchmark-survey-2024]]、[[mme-survey-2024]] 把它写入方法论。
- **今天**：仍是开源 MLLM README 必贴分数之一。

## 学到什么

1. **好 benchmark 的壁垒在出题，不在代码**
2. **感知和认知要分报**
3. **手工 QA 是防泄漏的有效手段**
4. **MME 是地图上的地标，不是全部地形**

## 延伸阅读

- 论文：[arXiv 2306.13394](https://arxiv.org/abs/2306.13394)
- 数据：[Awesome-MMLLM Evaluation](https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models/tree/Evaluation)
- [[lmms-eval]] —— 一键跑 MME
- [[mllm-benchmark-survey-2024]] —— 在 200+ 榜中的定位

## 关联

- [[lmms-eval]] —— 官方推荐评测入口
- [[mllm-benchmark-survey-2024]] —— benchmark 分类地图
- [[mme-survey-2024]] —— 评测方法论姊妹篇
- [[qwen2-vl-2024]] —— 常在 MME 上对比的工业模型
- [[gemini-1.5-2024]] —— 闭源强基线
- [[clip]] —— 很多 MLLM 的视觉底座


- 入门路径：先读「是什么」+「核心要点」，跑通一个最小案例后再翻「进阶话题」。
- 复习抓手：把「为什么重要」四条用自己的话复述一遍，能讲给同事即算掌握。
- 与仓库其他笔记：用文内 [[wikilink]] 跳到已写条目，别孤立读单篇。

- Fu 团队 Awesome-MMLLM 列表持续更新模型条目。
- 感知子项对 OCR 敏感，文档类应用要单独看。
- Cognition 子项含代码/数学，和 MMMU 有交集但更难混。
- 简洁 Yes/No 指令降低 prompt 工程不公平。
- 跑榜脚本版本写进 README 是社区礼貌。


## 读者练习（可跳过）

用 10 分钟做一个小练习，巩固上文：

1. 用自己的话向朋友解释「这篇解决什么问题」。
2. 从「实践案例」挑一个命令或代码块在本地或纸上走一遍。
3. 列出两个你会踩的坑，并写下规避句。

- 第 4 步：在「关联」里挑一篇未读笔记加入待读清单。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[gemini-1.5-2024]] —— Gemini 1.5 — 百万 token 多模态长上下文
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[mllm-benchmark-survey-2024]] —— MLLM Benchmark Survey — 200+ 多模态评测基准地图
- [[mme-survey-2024]] —— MME-Survey — 多模态 LLM 怎么评才靠谱
- [[mmmu-2023]] —— MMMU — 大学级多学科多模态推理基准
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[siglip-2023]] —— SigLIP — 用 Sigmoid 损失训练图文对齐

