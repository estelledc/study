---
title: OmAgent — 长视频分治 Agent 与回退检索
来源: 'Zhang et al., "OmAgent: A Multi-modal Agent Framework for Complex Video Understanding with Task Divide-and-Conquer", arXiv 2024'
日期: 2026-06-06
分类: 机器学习
子分类: 视频理解
难度: 中级
---

## 是什么

**OmAgent**（2024）是面向**超长视频理解**的多模态 **Agent 框架**：先把几小时 CCTV 或整部电影预处理成可检索的「场景记忆库」（Video2RAG），再用 **Divide-and-Conquer Loop（分治循环）** 把复杂问题拆成子任务，必要时调用 **rewinder** 工具回到具体时间点补看帧，而不是把全片帧一次性塞进模型。

日常类比：你看完一部三小时电影后脑子里只有「大概剧情脉络」；被问到「第 47 分钟主角穿什么颜色外套」时，你会**拖动进度条回那一幕**再确认——OmAgent 用 rewinder 模拟这个动作，用 RAG 模拟「剧情大纲」。

与 [[videollm-online-2024]]、[[flash-vstream-2024]] 同属「长视频不能硬塞上下文」家族，但 OmAgent 强调**自主规划 + 工具调用**，而非纯流式编码。

## 为什么重要

不理解 OmAgent，长视频方案容易走偏：

- **均匀采帧 / 全片转文字会丢细节**：论文指出关键帧法和帧转文本都会损失连续信息
- **24 小时 CCTV 是真实场景**：安防、监控复盘需要「先粗后细」检索，不是 8 帧猜答案
- **Agent 路线可插拔工具**：ASR、人脸框、场景检测可随需求更新，不必重训整个 Video-LLM
- **2000+ QA 自研 benchmark**：填补「复杂长视频 + 多步推理」评测空白

## 核心要点

1. **Video2RAG 预处理**：场景检测切段 → 每段均匀采 10 帧 → Visual Prompting（人脸框等标注在图上）→ ASR 转文字 → MLLM 写 **Scene Caption** → 向量入库。类比：把电影剪成「带时间戳的章节摘要卡片」。

2. **Divide-and-Conquer Loop**：收到问题后先抽时间线索过滤检索结果，再递归拆子任务；子任务可再调 API / 工具。复杂查询不会一次生成终答案。

3. **rewinder 工具**：Agent 判断需要像素级细节时，按时间戳回拉原始视频片段重看——弥补 RAG 分段造成的信息裂缝。类比：书签定位章节后仍要翻原书核对脚注。

4. **与 Video-LLM 微调对比**：不训练新视频底座，而是 orchestrate 现有 MLLM + 外部模块，算力更省、工具可热更新。

## 实践案例

### 案例 1：Video2RAG 入库（概念）

```python
# 伪代码：预处理流水线
segments = scene_detect(video)          # 按镜头切分，记录 start/end 时间戳
for seg in segments:
    frames = uniform_sample(seg, n=10)
    frames = visual_prompt(frames)      # 人脸框、物体框画在图上
    audio_text = asr(seg) + diarize(seg)
    caption = mllm_dense_caption(frames, audio_text, time_hint=seg.range)
    db.insert(embedding(caption), metadata=seg.range)

# 查询时：encode(question) → 向量检索 → 按问题中的时间词过滤
```

入库一次，多次问答共享；token 只花在检索到的片段上。

### 案例 2：DnC + rewinder 答题

```text
问题："主角在雨夜追逐后是否进了仓库？"

Step 1 检索 → 命中「雨夜街道」「仓库门口」两段 Scene Caption
Step 2 子任务 A：确认追逐结束时间 → 调 rewinder 看 1:23:40–1:24:10 原片
Step 3 子任务 B：确认是否进入建筑 → 对比门框与室内光照
Step 4 Conclusive Synthesis 合并子答案

若只靠 Caption 写「两人在雨中」但没说进门，rewinder 补看避免幻觉。
```

### 案例 3：与均匀采帧基线对比

| 策略 | 24h 视频 token | 细节召回 |
|------|----------------|----------|
| 均匀 32 帧 | 低 | 极易漏关键 10 秒 |
| 全片 ASR 摘要 | 中 | 丢画面信息 |
| OmAgent Video2RAG + rewinder | 按查询伸缩 | 可回到任意时间段 |

发版长视频功能前应报 **预处理耗时 + 平均 rewinder 次数**，不只报准确率。

## 踩过的坑

1. **把 OmAgent 当单模型权重**：核心是流水线 + Agent，不是换一个 checkpoint 就行。

2. **忽略预处理成本**：场景检测、ASR、逐段 Caption 对 24h 片源可能跑数小时，需离线批处理。

3. **rewinder 无上限**：复杂问题可能连环回拉，延迟和算力失控，生产要设预算。

4. **用 MVBench 短 clip 验证**：短视频榜测不出分治与检索价值，要用长片 QA。

## 适用 vs 不适用场景

**适用**：
- 数小时监控 / 电影 / 纪录片「找细节、多跳推理」
- 已有 MLLM，想外挂检索与工具而非重训
- 与 [[long-video-retrieval-2023]] 检索路线对照实验

**不适用**：
- 30 秒短视频分类（直接 [[videollama2-2024]] 即可）
- 实时低延迟流（预处理 + 多轮工具太慢）
- 无存储条件的边缘设备

## 历史小故事（可跳过）

- **2023**：[[long-video-retrieval-2023]]、LLoVi 等「先摘要再问答」流行，信息损失明显。
- **2024-06**：OmAgent arXiv 2406.16620，提出 rewinder + Video2RAG。
- **2024–2025**：[[videollm-online-2024]]、[[flash-vstream-2024]] 流式路线并行发展；Agent 路线在「可解释多步」上互补。

## 学到什么

- **长视频理解 = 记忆结构 + 按需放大**：先粗索引，再像素级回查。
- **分治 Loop 让 MLLM 像项目经理**：拆任务比一次 CoT 更稳。
- **工具调用是扩展点**：新 OCR、跟踪器可接入，不必动底座。
- **评测要含 2000+ 复杂 QA**：单一短视频榜掩盖长片短板。
- **与流式方案取舍**：流式省存储，Agent 检索适合离线库已建好的场景。
- **benchmark 2000+ 复杂 QA** 适合作为长视频 Agent 的固定回归集，比临时抽片测更稳。

若你正在做监控复盘产品，优先评估 Video2RAG 离线建库成本能否接受；实时场景可先看 [[videollm-online-2024]] 能否覆盖 80% 查询，再用 OmAgent 补长尾细节题。

## 延伸阅读

- 论文 PDF：[arXiv:2406.16620](https://arxiv.org/abs/2406.16620)
- 代码：[OmAgent GitHub](https://github.com/om-ai-lab/OmAgent)
- 流式长视频：[[videollm-online-2024]]、[[flash-vstream-2024]]
- 检索：[[long-video-retrieval-2023]]
- 地图：[[vid-llm-survey-2023]]

## 关联

- [[videollm-online-2024]] —— 在线流式长视频理解
- [[flash-vstream-2024]] —— 高效流式视觉编码
- [[long-video-retrieval-2023]] —— 长视频检索增强
- [[vinoground-2024]] —— 时序反事实诊断（短 clip 互补）
- [[videollama2-2024]] —— 视频底座连接器参考
- [[qwen2-vl-2024]] —— 通用 MLLM 工具调用底座
- [[lmms-eval]] —— 统一评测入口

> 维护提示：
> - 长视频 Agent 路线与 [[videollm-online-2024]] 流式路线对照阅读，避免孤立记 OmAgent。
> - 报分请注明预处理是否离线、平均 rewinder 调用次数与检索 top-k。
> - 候选队列见 `research/papers-video-understanding.md`；专题站 `/stations/video-understanding/`。
> - 训练 I/O 默认对照 [[decord]]；评测可试 [[lmms-eval]]。
> - 与 [[vid-llm-survey-2023]] 范式分类对照，区分「端到端 Video-LLM」与「Agent 编排」。
> - 24h 级场景务必说明存储后端（向量库 / 文件系统）与 ASR 语种配置。
> - 关联条目使用 `[[slug]]` 格式，build 时由 backlink 脚本补全反向链。
> - 复杂 QA benchmark 体量 2000+，复现请 pinned 官方仓库 commit。
> - Scene Caption 维度（时间、人物、地点）影响检索质量，ablation 时单独报告。
> - 发版前用 [[lmms-eval]] 或官方脚本复现；pinned 依赖以各仓库 README 为准。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
