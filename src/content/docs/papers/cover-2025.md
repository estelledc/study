---
title: COVER — 四象限反事实视频推理 benchmark
来源: 'Zhou et al., "Reasoning is All You Need for Video Generalization: A Counterfactual Benchmark with Sub-question Evaluation", arXiv 2025'
日期: 2026-06-06
分类: 机器学习
子分类: 视频理解
难度: 中级
---

## 是什么

**COVER**（COunterfactual VidEo Reasoning，2025）是系统评测 **MLLM 视频反事实推理** 的 benchmark：在 **抽象–具体 × 感知–认知** 四个象限里出题，并把复杂问题拆成**子问题（sub-questions）**，观察「中间步对了，反事实题是否才对」。

日常类比：老师不只问「如果视频倒放，男孩还会先踢球吗？」，还拆成「倒放后第一个动作是什么？」「最后一个动作是什么？」——像数学大题要**分步给分**，才能看出模型是真推理还是蒙对。

论文发现：**子问题准确率与反事实主问题强相关**；想提升视频泛化，得先加强结构化推理，而不只是堆训练数据。后继于 [[vinoground-2024]] 的时序反事实，但覆盖**感知/认知/抽象/具体**全维度。

## 为什么重要

不了解 COVER，会误判 Video-LLM「已经会推理」：

- **反事实是 OOD 泛化的试金石**：改事件顺序或假设未发生，模型不能靠统计相关性答题
- **四象限暴露不同短板**：有的模型「看得清」（感知）但「推不动」（认知），或只会具体物体不会抽象关系
- **子问题机制可指导训练**：中间步错在哪一象限，数据增强才有靶子
- **与 [[vinoground-2024]] 互补**：Vinoground 专盯像素级顺序；COVER 还考抽象因果与认知链

## 核心要点

1. **四象限任务设计**：横轴抽象↔具体，纵轴感知↔认知。每格有专门题型，避免「只会认物体」的假高分。

2. **反事实主问题 + 子问题**：主问题改现实（倒放、假设另一结果）；子问题对应**必要条件**（先发生什么、谁在场）。子问题对 → 主问题更可能对。

3. **人机混合标注**：视频、原问、反事实问、子问题均人工校验；部分子问题可自动生成再审核。

4. **核心结论**：商业与开源 MLLM 在子问题链上掉分明显；**推理能力**是视频鲁棒性的关键因子，不是更大分辨率 alone。

## 实践案例

### 案例 1：四象限 + 子问题（示意）

```text
原视频：男孩 → 捡球 → 踢球 → 进门

主问题（反事实）：「若视频倒放，男孩是否仍先踢球再进门？」
子问题 Q1：倒放后第一个可见动作是什么？
子问题 Q2：倒放后最后一个动作是什么？
子问题 Q3：踢球发生在进门之前还是之后？

模型若 Q1/Q2 错，主问题几乎必错 → 可定位是「时序感知」还是「事件认知」失败。
```

### 案例 2：评测脚本骨架

```python
for item in cover_dataset:
    sub_scores = [model.answer(item.video, sq) for sq in item.sub_questions]
    main_pred = model.answer(item.video, item.counterfactual_q)
    log(sub_acc=mean(sub_scores), main_acc=(main_pred == item.label))
    log(quadrant=item.quadrant)  # 抽象/具体 × 感知/认知

# 分析：子问题准确率 vs 主问题准确率的相关系数
```

报告要**分象限**贴表，不能只有一个总分。

### 案例 3：与 Vinoground 分工

| Benchmark | 变量 | 测什么 |
|-----------|------|--------|
| [[vinoground-2024]] | 同帧不同顺序 | 像素级时序 |
| COVER | 反事实 + 子问题链 | 多象限推理 + 中间步 |
| [[tempcompass-2024]] | 时间概念词 | 语言–时序对齐 |

发版前应 **Vinoground + COVER** 至少各跑一遍，覆盖「顺序敏感」与「假设推理」。

## 踩过的坑

1. **把 COVER 当普通 Video QA 榜**：核心是反事实 + 子问题，不是认动作分类。

2. **只看主问题不看子问题**：失去诊断价值，无法指导 ablation。

3. **忽略象限**：总分掩盖「认知象限全挂、感知很高」的假象。

4. **温度 / 采帧不固定**：反事实对分数抖动大，复现要锁协议。

## 适用 vs 不适用场景

**适用**：
- 新连接器、CoT、子问题训练策略的鲁棒性验证
- 与 [[vinoground-2024]] 组成反事实双探针
- 研究「推理是否 video 泛化关键」的 ablation

**不适用**：
- 长视频小时级理解（用 [[lvbench-2024]] / Agent 路线）
- 纯图像 MLLM（无视频输入）
- 单一排行榜官宣 SOTA

## 历史小故事（可跳过）

- **2024**：[[vinoground-2024]] 提出极简反事实视频对。
- **2025-03**：COVER arXiv 2503.10691，四象限 + 子问题评估框架。
- **2025**：[[countervqa-2025]] 从因果图角度并行推进反事实视频评测。

## 学到什么

- **视频泛化要靠推理，不只靠规模**；子问题准确率是领先指标。
- **反事实 benchmark 要分维度**，否则不知道模型哪种「不懂」。
- **子问题 = 可解释评分尺**，适合 CI 回归与训练课程设计。
- **与 Vinoground 叠加**才能覆盖时序与假设两类失败。
- **开源与闭源模型都未饱和**，推理链仍是 2025 frontier。

## 延伸阅读

- 论文 PDF：[arXiv:2503.10691](https://arxiv.org/abs/2503.10691)
- 代码：[COVER-Benchmark](https://github.com/gongyifan-hash/COVER-Benchmark)
- 前驱：[[vinoground-2024]]、[[tempcompass-2024]]
- 并行：[[countervqa-2025]]
- 综合：[[videomme-2024]]、[[mvbench-2023]]

## 关联

- [[vinoground-2024]] —— 时序反事实短 clip 探针
- [[countervqa-2025]] —— 因果图反事实 VQA
- [[tempcompass-2024]] —— 时序概念词评测
- [[videomme-2024]] —— 综合视频理解榜
- [[qwen2-vl-2024]] —— 工业 MLLM 基线对照
- [[videollama2-2024]] —— 开源视频模型对照
- [[lmms-eval]] —— 潜在统一跑分

> 维护提示：
- 双千进度以 `data/written.txt` 与 atlas 为准，勿手工改计数。
- 反事实评测建议与 [[vinoground-2024]] 组合跑，覆盖像素时序与多象限推理两层。
- 报分请锁采帧数、温度与子问题协议；COVER 对采样抖动敏感。
- 子问题链准确率是主问题的领先指标，勿只看四象限总分。
- 候选队列见 `research/papers-video-understanding.md`，站内 slug 以 atlas 为准。
- 长视频子题见专题站 `/stations/video-understanding/` 分阶段表。
- 工程对照见 [[lmms-eval]]、[[decord]] 等笔记，复现数字以官方脚本为准。
- 关联条目使用 `[[slug]]` 格式，build 时由 backlink 脚本补全反向链。
- 与 [[countervqa-2025]] 因果图路线对照，避免孤立记 benchmark 名。
- 开源/闭源模型均未饱和，推理链仍是 2025 frontier。
- 人类子问题基线显著高于主问题，模型掉分多发生在中间步。
- 四象限表要分格汇报，总分掩盖「感知高、认知低」假象。
- 发版前用 [[lmms-eval]] 或 COVER 官方仓库脚本复现文中数字。
- pinned 依赖以各仓库 README 为准，勿混用不同 checkpoint 协议。
- 与专题阅读站 [[video-understanding]] 路线图对照，避免候选表脱节。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[countervqa-2025]] —— CounterVQA — 因果图驱动的反事实视频 VQA

