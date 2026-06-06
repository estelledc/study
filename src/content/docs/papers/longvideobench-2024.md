---
title: LongVideoBench — 一小时交织字幕视频的长上下文理解考卷
来源: 'Wu et al., "LongVideoBench: A Benchmark for Long-context Interleaved Video-Language Understanding", arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

LongVideoBench 是 2024 年 7 月发布的长视频理解 benchmark：给模型一段**最长约 1 小时**的网页视频，配上**时间对齐的字幕**，再出 **6,678** 道人工标注的四选一选择题，专门考「长上下文多模态理解与推理」。

日常类比：以前的 VideoQA 像看 15 秒短视频后答「画面里有什么」——瞄几帧就够。LongVideoBench 像带着字幕看完一整部纪录片，然后回答「当旁白说到某某句子时，画面里发生了什么变化？」「A 事件和 B 事件谁先谁后？」——必须把**画面 + 字幕 + 时间线**串起来，单帧或只看开头根本不够。

论文的核心任务叫 **referring reasoning（指称推理）**：每道题先给一段 **referring query**（指称查询），指向视频里某个具体时刻或片段（called context，被指称上下文）；模型必须先从长达一小时的输入里**找回**这段上下文，再在上面做视觉感知或跨片段关系推理。这是首个要求 **video-language interleaved（视频-语言交织）** 输入、且分数会随「能看更多帧」而稳定上涨的长视频 benchmark。

## 为什么重要

不了解 LongVideoBench，下面这些事容易误判：

- 为什么 EgoSchema、MVBench 高分不代表模型真能处理小时级视频——它们要么固定 3 分钟 egocentric，要么 clip 只有十几秒，加帧收益很快饱和
- 为什么「长上下文 LMM」需要专门 benchmark——文本侧有 NIAH / RULER，多模态侧此前缺少能测「帧数 ↑ → 分数 ↑」的公开考卷
- 为什么 GPT-4o、Gemini-1.5-Pro 在 LongVideoBench 上仍只有 **~64–67%**，开源模型 **~44–50%**——说明长视频检索 + 交织推理仍是硬缺口
- 为什么后续 VideoMME、MLVU、TPO 都把 LongVideoBench 列入标准 eval——它是 2024 年长视频路线的「标尺」

## 核心要点

1. **Referring Reasoning（指称推理）**：题目 = referring query + 问题主体 + 4 个干扰项。query 可指一个场景、一个事件、一个物体，或字幕里的一句话；模型要先定位 referred context，再答题。类比：不是问「整部片讲了啥」，而是「当旁白说到第三段那句时，桌上多了什么？」——强迫模型在长输入里做 needle-in-haystack 式检索。

2. **两级 17 类细粒度任务**：L1 Perception（约 3204 题）考单时刻视觉感知（物体存在、属性、事件等）；L2 Relation（约 3474 题）考跨时刻关系（先后、跟踪、属性变化、场景顺序 SSS 等）。17 类覆盖 Scene→Event、Text→Object、Event before/after Text 等组合，避免一个总分掩盖「关系推理」全面崩溃。

3. **四档递进时长 + 交织字幕输入**：视频分 (8,15]s、(15,60]s、(3,10]min、(15,60]min 四组，平均约 **473 秒**；共 **3,763** 条，主题覆盖电影解说、生活 vlog、新闻、知识科普等 10 类。字幕与帧按时间戳**交织**送入模型（字幕块插在对应帧之间），模拟人类开字幕看视频——这是与 EgoSchema、MVBench 最大的输入格式差异。

## 实践案例

### 案例 1：理解 referring reasoning 题目长什么样

```
视频：25 分钟旅行 vlog（带英文字幕）

Referring query + Question（概念化）：
  "在旁白说到 'we finally reached the summit' 的那一刻，
   画面里主角手里拿着什么？"
  A. 登山杖  B. 水瓶  C. 相机  ✓  D. 地图

题型代码：T2O（Text-referred Object Existence）
  —— 用字幕句子定位时刻，再考该时刻的视觉细节

L2 关系题示例（E3E）：
  "当主角在厨房切洋葱之后，下一个发生的事件是？"
  —— 需关联两个不同时刻，不能只看单帧
```

### 案例 2：帧数 scaling 实验（validation set）

```
GPT-4o 在四档时长上的 accuracy（max_frames @ 1fps）：

时长档          1帧    16帧   256帧   涨幅
----------------------------------------------
(8,15]s        52.9   71.4   71.6    +18.7
(15,60]s       50.6   73.7   76.8    +26.2
(3,10]min      40.8   53.8   69.1    +28.3
(15,60]min     36.0   52.2   60.9    +24.9
Overall        41.7   58.0   66.7    +25.0

对比：EgoSchema 上 Gemini-1.5-Pro 从 16→150 帧只涨 ~2.5%
LongVideoBench 证明「多帧真的有用」——前提是题目设计对了
```

### 案例 3：交织模态消融（validation set, 256 帧）

```python
# 论文 Tab.6：同一模型、不同输入模态（GPT-4o 示例）

modalities = {
    "subtitle_only":  44.6,   # 只有字幕，无画面
    "frames_only":    60.6,   # 只有帧，无字幕
    "interleaved":    66.7,   # 帧+字幕交织 ✓ 最佳
}

# 开源 Idefics2：交织 49.7 vs 仅帧 49.4 —— 几乎不会用字幕
# 说明：长视频 benchmark 必须同时测视觉检索和字幕融合能力
```

## 踩过的坑

1. **别把 validation 分数当 leaderboard 最终成绩**：test set（5341 题）答案隐藏防污染，官方 leaderboard 以 test total 为准；自测只能用 val set（1337 题）调 max_frames 等超参。

2. **开源模型加帧可能反而掉分**：Idefics2、Mantis 在 64 帧时长视频组 accuracy 从 ~48% 跌到 ~22%，不是「帧越多越好」，而是上下文超限或位置编码失效。

3. **必须支持交织输入格式**：只均匀采 8 帧、忽略字幕的 Video-LLaVA 路线无法公平对标 LongVideoBench 设计意图；评测时要按官方 interleaved 协议喂入。

4. **L2 Relation 普遍比 L1 Perception 难**：GPT-4o 在 SSS（场景顺序）仅 ~44%，TOS（字幕-物体跟踪）~62%；合并总分会掩盖关系推理短板。

## 适用 vs 不适用场景

**适用**：
- 评估长上下文 LMM（128K+ token）是否真能「看更多帧 → 答得更好」
- 对比专有 API（GPT-4o / Gemini）与开源长视频模型的真实差距
- 写论文 Related Work 时引用「交织多模态长输入」评测范式与 referring reasoning 任务定义

**不适用**：
- 评测纯秒级时序细粒度（速度/方向）——[[tempcompass-2024]] 更专精
- 评测第一视角 egocentric 长程行为——[[egoschema-2023]] 场景分布不同
- 作为预训练语料——规模小、license 受限，且专用于 diagnostic eval

## 历史小故事（可跳过）

- **2024-07-22**：LongVideoBench 上传 arXiv 2407.15754；作者 Wu、Li、Chen、Li；官网 [longvideobench.github.io](https://longvideobench.github.io/) 开放 validation set
- **2024 夏**：论文系统评测 22 个 LMM（含 GPT-4o、Gemini-1.5-Pro、Phi-3-Vision、Idefics2 等），揭示 proprietary vs open-source 的长上下文鸿沟
- **2024–2025**：VideoMME、MLVU 等更长 benchmark 接力出现；TPO（Temporal Preference Optimization）等后训练方法把 LongVideoBench 列为关键 eval
- **数据管线**：119 个频道爬取 → Whisper-V3 补字幕 → Q-Align 滤低质 → 三轮人工标注（主标/审查/修订，约 20% 需返工）
- **test set 设计**：3011 条视频、5341 题答案隐藏；leaderboard 以 test total 排名，GPT-4o 约 66.7%、Gemini-1.5-Pro 约 64.4%
- **启示**：它第一次让「加帧」和「涨分」在长视频上重新对齐，打破旧 benchmark 的 single-frame bias

## 学到什么

1. **长视频评测要设计「必须检索」的题**：summary 类问题模型可以靠开头几帧+字幕蒙对；referring query 强迫模型定位特定时刻，才测得出长上下文能力
2. **交织字幕不是锦上添花**：GPT-4o 仅帧 60.6% → 帧+字幕 66.7%；真实场景里人类也靠字幕消歧，benchmark 应模拟这种输入
3. **时长要分档报告**：四档递进设计让你能看到模型从 15 秒到 1 小时的衰减曲线，而不是一个模糊的「平均时长」
4. **开源长上下文 LMM 仍有工程鸿沟**：能宣称 128K context 不等于能在 256 帧交织输入上稳定推理——LongVideoBench 把这句话量化了
5. **隐藏 test set 是正确做法**：5341 题答案不公开，避免 GPT 系列训练污染，leaderboard 才有公信力

## 延伸阅读

- 论文 PDF：[arXiv 2407.15754](https://arxiv.org/abs/2407.15754)
- 官网与 Leaderboard：[longvideobench.github.io](https://longvideobench.github.io/)
- 对照 benchmark：[[egoschema-2023]]（3 分钟 egocentric）、[[mvbench-2023]]（20 任务短视频）、[[tempcompass-2024]]（时序维度）
- [[lmms-eval]] —— 社区正在集成 longvideobench task；跑分前确认是否支持 interleaved 字幕
- [[vid-llm-survey-2023]] —— 综述 benchmark 章节里长视频评测的演进脉络
- [[qwen2-vl-2024]] —— 长上下文工业路线的重要对照模型

## 关联

- [[egoschema-2023]] —— 互补：EgoSchema 固定 3 分钟第一视角；LongVideoBench 覆盖 8 秒到 1 小时、多主题、带字幕交织
- [[mvbench-2023]] —— 前代：MVBench 测 20 种短视频能力；LongVideoBench 接力补「小时级 + 指称检索」空白
- [[tempcompass-2024]] —— 互补：TempCompass 拆秒级时序维度；LongVideoBench 拆长程感知 vs 关系推理
- [[long-video-retrieval-2023]] —— 方法论对照：R-VLM 用检索选片段；LongVideoBench 要求模型自己从长输入里找 referred context
- [[qwen2-vl-2024]] —— 长上下文 + M-RoPE 路线；后续工作常在此 benchmark 上报数字
- [[lmms-eval]] —— 统一评测入口；与 EgoSchema / MVBench / LongVideoBench 可联跑对比
- [[videollama2]] —— 视频专用 LMM 在 leaderboard 上的参照基线之一
- [[llava-next]] —— LLaVA-Next-Mistral-7B 论文评测约 47–49%，说明通用多图路线在长视频上仍吃力
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[egoschema-2023]] —— EgoSchema — 三分钟第一视角长视频理解的诊断探针
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[trace-2024]] —— TRACE — 用因果事件链同时输出时间、精彩度与描述
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[vsi-bench-2024]] —— VSI-Bench — 用室内漫游视频考视频大模型的空间智商

