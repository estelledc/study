---
title: LVBench — 平均 68 分钟、六维能力的长视频极限考
来源: 'Wang et al., "LVBench: An Extreme Long Video Understanding Benchmark", arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

LVBench（Long Video Benchmark）是 2024 年 6 月发布的长视频理解极限评测集：从 YouTube 精选 **103 条**公开长视频，人工标注 **1,549 道**四选一选择题，视频平均时长约 **4,101 秒（≈68 分钟）**，最长可达约 **2 小时**——比当时最长的 MovieChat-1K、EgoSchema 等 benchmark 平均时长还要长 **约 5 倍**。

日常类比：以前的 VideoQA 像看完 15 分钟短片后做随堂测验；LVBench 像带着你**完整看完一场足球赛、一整集综艺或一部纪录片**，再考「第 29 分 30 秒发生了什么」「主角情绪为何变化」「片尾字幕里的营收数字是多少」——必须同时会**记全局、跟人物、抽细节、做推理**。

论文定义 **6 种核心能力**（时序定位、摘要、推理、实体识别、事件理解、关键信息检索），并允许多能力组合出题。对 **8 个主流 MLLM** 的系统评测显示：最强 **Gemini 1.5 Pro** 总体准确率仅约 **33.1%**，人类标注者平均 **94.4%**——长视频理解仍是 2024 年最难啃的硬骨头之一。

## 为什么重要

不了解 LVBench，下面这些事容易误判：

- 为什么 VideoMME、MLVU 高分仍不等于「真懂小时级视频」——LVBench 把平均时长推到 **68 分钟**，专门暴露模型在超长上下文下的记忆与推理崩盘
- 为什么「能喂进 1 万帧」不等于「看得懂」——MovieChat、LLaMA-VID、LWM 在 LVBench 上接近随机猜，说明**结构能吞长视频 ≠ 语义理解跟上**
- 为什么 benchmark 设计要过 **LLM 文本过滤**——论文用 GLM-4 与 GPT-4 双模型答题，剔除「不看视频也能蒙对」的脏题，否则 LLaVA-NeXT 虚高近 17 个百分点
- 为什么 2024 下半年工业论文开始标配 LVBench 子表——它与 MLVU、VideoMME 并列，是长视频评测「三件套」里**时长最极端**的那一个

## 核心要点

1. **六维能力 = 长视频认知全景图**：Temporal Grounding（问「29:30 发生了什么」）、Summarization（全片摘要）、Reasoning（因果/情感/意图/预测）、Entity Recognition（跟人物物件与动作）、Event Understanding（类型/重大事件/场景切换）、Key Information Retrieval（读屏上文字与数字）。类比：不是只考「画面里有什么」，而是考「看完一整部片子后，你还能当解说员、侦探和秘书」。

2. **视频筛选极严**：从 500 条 ≥30 分钟的 YouTube 片源里，人工筛到 103 条——要求有主角叙事线、完整剧情结构、多事件时序、画面可脱离音频理解。六大门类（体育、纪录片、活动记录、生活、综艺、动画）× 21 子类，避免只会答某一域。

3. **出题 + 质控三板斧**：① 每小时视频约 24 题，覆盖多事件时段；② 问题必须指向唯一场景/人物，禁止模糊「他们为什么吵架」式捷径；③ 用双 LLM 过滤纯文本可答样本，并刻意减少「给时间戳降低难度」的时序定位题——逼模型真看完全片。

## 实践案例

### 案例 1：六维能力题目长什么样

```
Entity Recognition — 动作识别：
  背景：90 分钟足球纪录片
  问题：穿 10 号球衣的球员在下半场共完成了几次射门？
  → 需跨片段跟踪同一实体并计数

Reasoning — 因果推理：
  背景：68 分钟生活综艺
  问题：嘉宾 B 在厨房争吵后为何独自离开？（四选一）
  → 需串联前序冲突与后续行为

Key Information Retrieval — 读屏：
  背景：企业发布会全程录像
  问题：大屏 PPT 上公布的营收增长率是？
  A. 12%  B. 18%✓  C. 25%  D. 31%
```

### 案例 2：论文主要模型分数（Overall %）

```
模型                        吞吐帧数    Overall
--------------------------------------------------
Gemini 1.5 Pro (原生长视频)   3600       33.1  ← SOTA
LLaVA-NeXT (32 帧)            32         32.2  ← 非原生却接近最强
GPT-4o (10 帧)                10         27.0
LWM                           >3600      25.5
MovieChat                     >10000     22.5  ← 近乎随机
LLaMA-VID                     >10800     23.9
Human                         —          94.4

关键结论：能输入更多帧 ≠ 分数更高；摘要(Sum)子项普遍最难
```

### 案例 3：LLM 过滤前后分数落差（防捷径）

```python
# 论文 4.4 节：去掉「纯文本可猜」题目后的 ablation
scores = {
    "LLaVA-NeXT": {"before_filter": 48.9, "after_filter": 32.2},
    "LWM":        {"before_filter": 32.7, "after_filter": 25.5},
}
# 语言模型越强，过滤前「蒙对」越多 → 必须用过滤后数字横向比
# 自建 benchmark 时可复用：双 LLM 独立作答，一致且命中 GT 则删题
```

## 踩过的坑

1. **不要用过滤前分数吹模型**：未过 LLM 筛的 LVBench 上，LLaVA-NeXT 可达 48.9%，与论文主表 32.2% 不可混比。

2. **Overall 掩盖子能力崩盘**：摘要 Sum 上 MovieChat 仅 17.2%，实体 ER 上 Gemini 最强也只有 32.1%——合并平均会把「局部还行、全局全挂」伪装成「勉强及格」。

3. **指令遵循要单独看**：Gemini 1.5 Pro 有 20.9% 回答跑出 ABCD 四选项外（如「以上都不对」），需正则 + 裁判模型二次抽取，否则算分失真。

4. **无音频是硬限制**：论文刻意去掉音轨，因为多数 MLLM 不会处理声音——考「台词对白」类能力时 LVBench 不适用，需另找带音频的 benchmark（如部分 EgoSchema 变体）。

## 适用 vs 不适用场景

**适用**：
- 验证新长视频 MLLM 在 **30 分钟～2 小时**区间的真实理解上限
- 对比「多采帧短视频模型」vs「原生长上下文模型」谁更划算
- 画六维能力雷达图，定位模型在摘要/推理/读屏等子项的短板

**不适用**：
- 纯短视频（<1 分钟）能力筛选——用 MVBench、TempCompass 更省时
- 需要音频/对白理解的任务——LVBench 只有视觉轨
- 训练数据扩充——仅 103 视频、1,549 题，体量小，专用于评测而非预训练

## 历史小故事（可跳过）

- **2024-06-11**：LVBench 上传 arXiv 2406.08035，清华大学等单位联合发布，号称首个面向「超长」公开视频的人工 QA benchmark
- **2024-08**：Hugging Face 上线 [LVBench Leaderboard](https://huggingface.co/spaces/THUDM/LVBench)，方便社区提交模型成绩
- **2024 下半年**：与同期 [[mlvu-2024]]、VideoMME 形成长视频评测三件套；LVBench 侧重量级「时长极端」
- **2025**：论文收录 **ICCV 2025**，长视频 benchmark 章节的标准引用之一

## 学到什么

1. **时长本身是最硬的门槛**：平均 68 分钟、最长 2 小时，把「长视频」从口号变成可量化的压力测试
2. **能吞帧 ≠ 能理解**：MovieChat 等 >10K 帧模型仍接近随机，说明记忆/压缩/对齐才是下一战场
3. **benchmark 必须防文本捷径**：双 LLM 过滤是简单有效的质控，不做这一步排行榜会严重失真
4. **六维拆报告比一张总分诚实**：产品 claim「支持长视频」时，至少披露 Sum/Rea/KIR 三项
5. **人类 94% vs 模型 33% 说明赛道还早**：长视频理解距离实用（赛事解说、观影讨论、具身长期决策）仍有巨大鸿沟
6. **视频越长不一定越难（对强模型）**：论文显示 LLaVA-NeXT、Gemini 在 90 分钟以内较稳，但 MovieChat 等超 90 分钟后陡降——不同架构的「有效记忆长度」差异巨大

## 延伸阅读

- 论文 PDF：[arXiv 2406.08035](https://arxiv.org/abs/2406.08035)
- 项目主页：[lvbench.github.io](https://lvbench.github.io/)
- 数据集：[Hugging Face LVBench](https://huggingface.co/datasets/zai-org/LVBench)
- 并列 benchmark：[[mlvu-2024]]（九类任务、多时长分层）、VideoMME（900 视频综合长视频考）
- [[moviechat-2024]] —— 论文重点对照的长视频记忆模型；LVBench 上暴露其近随机表现
- [[vid-llm-survey-2023]] —— 综述 benchmark 章节；LVBench 填补「超长」空白
- Leaderboard：[Hugging Face LVBench 榜单](https://huggingface.co/spaces/THUDM/LVBench) —— 社区提交模型成绩的公开入口

## 关联

- [[mlvu-2024]] —— 同期长视频综合考；MLVU 重九类任务与多时长，LVBench 重极端时长与六维能力
- [[moviechat-2024]] —— 原生长视频代表之一；论文实测 >10K 帧仍难及格，警示「结构先行」陷阱
- [[long-video-retrieval-2023]] —— 检索选片段路线；LVBench 考全片理解，二者互补
- [[video-llava-2024]] —— 短视频统一表征方案；在 LVBench 类任务上均匀采帧天然吃亏
- [[qwen2-vl-2024]] —— 工业扩上下文代表；多篇后续工作在 LVBench 上验证收益
- [[llava]] —— LLaVA-NeXT 是论文非原生长视频第二名（32 帧即 32.2%）
- [[videochat-2023]] —— 多轮视频对话先驱；LVBench 把对话能力推到小时级
- [[tempcompass-2024]] —— 专测时序微粒度；与 LVBench 的 TG/ER 子项形成细-粗对照
- [[lmms-eval]] —— 统一跑分入口；复现 LVBench 数字的推荐框架
- [[video-understanding]] —— 专题枢纽
- [[flamingo-2022]] —— 早期图文视频统一 MLLM；LVBench 证明「能接视频」到「懂长视频」仍有数量级差距

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cover-2025]] —— COVER — 四象限反事实视频推理 benchmark
- [[flamingo-2022]] —— Flamingo — 让冻结的大模型学会看图，几张样例就上手
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[streamingbench-2024]] —— StreamingBench — 流式视频理解的 18 任务在线大考
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videollama3-2025]] —— VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
- [[videollm-online-2024]] —— VideoLLM-online — 流式视频对话的 LIVE 框架
- [[vinoground-2024]] —— Vinoground — 时序反事实短视频探针

