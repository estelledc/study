---
title: HawkEye — 用递归缩窗把文本查询钉在长视频时间轴上
来源: 'Wang et al., "HawkEye: Training Video-Text LLMs for Grounding Text in Videos", arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

HawkEye 是北京大学 Wangxuan 实验室等团队在 2024 年 3 月发布的**视频-文本大语言模型（video-text LLM）**：它不靠专用检测头回归起止秒数，而是让 LLM 用**纯文本对话**完成时序视频定位（temporal video grounding）——给定一句查询（如「Person turn the light switch on」），在长视频里找出对应片段的 `(start, end)`。

日常类比：找书中某段话，传统 VTG 模型像带激光测距仪的测绘员，直接报「第 127–133 页」。多数 Video LLM 却像只读过封面的助手，随机猜一页。HawkEye 像**分册检索**：先问「在前三分之一、中间、后三分之一还是贯穿全书？」锁定大区间；再在缩小的区间里重复问，多轮后区间越缩越窄，最后把答案翻译成用户看得懂的 `23.3s–31.0s`。

技术上它站在 VideoChat2 肩膀上，自建 **InternVid-G**（约 71.5 万条场景级字幕 + 负样本区间），用**粗粒度四选一**（beginning / middle / end / throughout）代替让 LLM 直接吐帧号或秒数，再配合 **recursive grounding（递归缩窗）** 多轮推理。同期 [[vtimellm-2023]]、TimeChat 也做 text-to-text grounding，但 HawkEye 强调「粗标签 + 二分搜索式多轮」更稳、更省帧。

## 为什么重要

不理解 HawkEye，下面这些事容易误判：

- 为什么 MVBench、VITATECS 里 SOTA Video LLM 在「动作定位」「事件顺序」上接近随机——短视频指令微调几乎不教**时间轴推理**；HawkEye 证明补上 InternVid-G 式时序数据后，零样本 Charades-STA R@0.5 可从 ~14% 拉到 ~31%
- 为什么「让 LLM 直接输出第几秒」往往翻车——帧数一变，prompt 里数字列表就乱；粗粒度四选一 + 递归缩窗对 8/12/16 帧输入更鲁棒（论文 Fig.4）
- 为什么 2024 年 VTG 出现「检测器派」与「LLM 派」分叉——[[qvhighlights-2021]] / UniVTG 走专用 DETR；HawkEye 走 **text-to-text**，与 [[vtimellm-2023]] 同赛道但表征不同（粗四选一 vs 百分比/秒数）
- 为什么长视频产品不能只堆帧数——HawkEye 仅用 12 帧输入，零样本仍超用 100 帧的 VTimeLLM-7B，说明**训练目标与区间表示**比 brute-force 抽帧更关键

## 核心要点

1. **InternVid-G 时序训练语料**。从 InternVid-10M 抽 10 万条长视频，PySceneDetect 切场景 + CLIP 相似度过滤，得到 83,614 条视频、715,489 条**带起止时间的场景字幕**，并为每条正样本构造**负样本区间**（相似但语义不符的片段不能当答案）。类比：不只给「这句话在书里出现过」，还标明「哪些页看起来像但答错」。

2. **粗粒度四选一表征**。不逼 LLM 输出 `frame 7` 或 `14.3s`，只判断目标片段落在「开头 / 中间 / 结尾 / 贯穿整段当前窗口」。单轮最多把区间缩到一半；配合递归可多轮缩到任意细度。类比：先选「上册还是下册」，再选「第几章」，比一次报页码易学。

3. **递归 grounding（递归缩窗）**。每轮：在当前时间窗口均匀采 `num_frames` 帧 → LLM 四选一 → 把窗口裁到对应子区间；下一轮在更短窗口里**提高有效帧率**再判。类似二分搜索；当窗口已几乎全是目标片段时，模型答 `throughout` 终止。理论 3 轮四选一的 R@0.5 上界可达 97%（Charades-STA）。

4. **双任务时序指令微调**。在 VideoChat2 stage-3 上叠加：(a) **Temporal Video Grounding**——随机裁剪视频窗口 + 四选一问答；(b) **Video Segment Captioning**——给定裁剪窗口与位置陈述，生成正样本区间的描述。随机裁剪防止模型死记「查询→答案」捷径。仅微调 Q-Former、query tokens 与 LLM LoRA，视觉编码器冻结，8×V100 约 7 天。

## 实践案例

### 案例 1：递归 grounding 三轮缩窗（论文 Fig.6）

```text
原视频: 31.0 秒
查询: "Person turn the light switch on"
GT 区间: 23.3s – 31.0s

Round 1 —— 全片 12 帧, 采样 2.3s…28.0s
  问: 事件在视频的哪个部分?
  答: At the end of the video.
  → 窗口缩为 15.5s – 31.0s  (IoU=0.39)

Round 2 —— 在 15.5–31.0s 内再采 12 帧
  答: At the end of the video.
  → 窗口缩为 23.3s – 31.0s  (IoU=0.79)

Round 3 —— 在 23.3–31.0s 内再采 12 帧
  答: Throughout the entire video.  # 触发终止
  → 输出: 23.3s – 31.0s
```

用户只见最终 `start_sec - end_sec`；中间多轮在后台自动完成。

### 案例 2：用官方仓库跑递归 grounding 评测

```bash
git clone https://github.com/yellow-binary-tree/HawkEye
cd HawkEye

# 准备 VideoChat2 stage-2 权重与 InternVid-G 处理脚本（见 data/README）
# 下载 HawkEye checkpoint 或自行 stage-3 微调

# Charades-STA / ActivityNet-Captions 上跑递归 grounding
bash ./scripts/test/recursive_grounding.sh

# 逐步分析每轮区间: data_preparing/check_grounding_results.ipynb
```

论文主指标：**mIoU** 与 **R@IoU>0.3/0.5/0.7**。零样本 HawkEye（12 帧，粗粒度+递归）在 Charades-STA 约 33.7 / 50.6 / 31.4 / 14.5；微调后约 49.3 / 72.5 / 58.3 / 28.8。专用 SOTA 仍更高（R@0.5≈57.3），但 HawkEye 是少数**不靠检测头、纯 LLM 文本输出**就能拉开与随机差距的方案。

### 案例 3：InternVid-G 正负样本怎么构造

```python
# 概念流程 —— 对应论文 §3，非完整源码
for video in internvid_sample_100k:
    scenes = pyscenedetect_split(video)
    for seg in scenes:
        caption = clip_caption_model(seg)  # 场景级描述
        if clip_sim(seg, caption) < tau:
            continue  # 丢弃语义不符的 seg（如图 seg 3）

        pos_span = (seg.start, seg.end)
        # 负区间: 从「相似但不同语义」的其它场景结束处开始
        neg_start = max_similar_segment_end_before(seg)
        neg_end = video.duration
        neg_span = (neg_start, neg_end)

        yield {
            "caption": caption,
            "positive": pos_span,
            "negative": neg_span,  # 裁剪训练窗口时避开正样本
        }
```

负样本区间保证随机裁剪时，模型必须**看画面**才能四选一，而不是背查询模板。

## 踩过的坑

1. **把四选一当最终产品交互**：单轮粗定位在 Charades 上 mIoU 会掉一截；生产环境应默认开递归 grounding（论文 Fig.5 建议微调后 max_rounds≥2）。

2. **零样本却期望 beat 专用检测器**：InternVid-G 没碰人工 VTG 标注，微调前 R@0.7 仍只有十几；要和 Moment-DETR / QD-DETR 同台比，需在 Charades-STA train 上再 FT。

3. **帧数与训练不一致就崩**：frame-level / second-level 表征在 8↔16 帧切换时 mIoU 可掉 10+ 点；粗粒度表征才是 HawkEye 的鲁棒卖点，复现时别改回「让 LLM 数秒」。

4. **忽略 InternVid-G 在 stage-3 的配比**：时序样本量远大于其它 VideoChat2-IT 任务，作者额外加 segment captioning 并混训，防止模型变成只会做四选一的偏科生。

## 适用 vs 不适用场景

**适用**：
- 已有 Video LLM（VideoChat2、LLaVA-Video 等），想**轻量增补**时序 grounding 而不重跑大规模预训练
- 需要**可解释、可对话**的「问一句 → 返回时间段」能力，输出统一成文本区间
- 长视频（分钟级）上帧预算紧（12 帧级），仍要做零样本 VTG 或 NExT-GQA 问题定位
- 研究 text-to-text VTG 与 [[vtimellm-2023]]、TimeChat 的**表征设计**差异（粗四选一 vs 连续时间戳）

**不适用**：
- 要刷 [[qvhighlights-2021]] MR/HD 联合榜的专用检测路线——HawkEye 未在该 benchmark 主报，应用 Moment-DETR / UniVTG 类模型
- 毫秒级精确定位或密集多段检索（四选一 + 有限轮次有理论上界，极短事件易漏）
- 端到端像素输入、不愿依赖 VideoChat2 权重与 InternVid-G 管线的部署
- 纯开放域视频 QA、不关心时间轴（加 InternVid-G 微调仍占算力，增益主要在 grounding）

## 历史小故事（可跳过）

- **2024-03-15**：arXiv 2403.10228 上传；同期 VideoChat2、MVBench 揭示 Video LLM 时序短板
- **2024 上半年**：InternVid-G 从 InternVid-10M 自动构造 71.5 万场景对；代码开源于 yellow-binary-tree/HawkEye
- **同期竞争**：[[vtimellm-2023]]、TimeChat 亦宣称 text-to-text VTG；HawkEye 用粗粒度+递归在 Charades 零样本超 VTimeLLM-7B
- **2024 下半年**：长视频 LLM 路线分化——检测器+LLM（UniVTG→VTimeLLM）vs 纯 LLM 递归缩窗（HawkEye）；后者在 NExT-GQA grounding 上 mIoU 25.7 领先 VideoChat2
- **社区**：基于 VideoChat2-IT 重训的公平对照成为复现标配；递归轮数与 `throughout` 终止策略是调参焦点

## 学到什么

1. **Video LLM 缺的不是参数，是时序课**——同一 VideoChat2 骨架，加上 InternVid-G 双任务，零样本 VTG 从「像随机」变成「能用的粗定位」
2. **别让 LLM 做它不擅长的算术**——直接回归秒数/帧号对 prompt 数字极度敏感；粗语义区间 + 递归缩窗是更稳的 inductive bias
3. **自动标注可以 scale VTG 预训练**——场景切分 + CLIP 过滤 + 负区间，比人工标 [[qvhighlights-2021]] 便宜几个数量级，但需防捷径学习（随机裁剪是关键）
4. **通用性与专精要一起训**——HawkEye 刻意混训 MVBench / NExT-QA 等，避免时序任务淹没其它 video-text 能力；增时序数据不等于牺牲 QA
5. **text-to-text VTG 仍低于专用检测器**——LLM 路线胜在接口统一与可解释；极致 IoU 仍要 DETR 或对比学习专家，两条路线互补而非替代

## 延伸阅读

- 论文 PDF：[arXiv 2403.10228](https://arxiv.org/abs/2403.10228)
- 官方代码：[yellow-binary-tree/HawkEye](https://github.com/yellow-binary-tree/HawkEye)
- 底座模型：VideoChat2（MVBench 论文同系列）
- 数据上游：InternVid-10M —— InternVid-G 的视频来源
- [[vtimellm-2023]] —— 同期 text-to-text VTG；用百分比/秒数表征，可对照递归缩窗设计
- [[qvhighlights-2021]] —— 查询驱动 moment retrieval + highlight 的专用检测 benchmark，与 HawkEye 的 LLM 路线互补
- [[vid-llm-survey-2023]] —— 综述 VTG 与 Video LLM 交界章节

## 关联

- [[vtimellm-2023]] —— 最直接的同期对照：都做 LLM 文本 grounding，HawkEye 用粗四选一+递归，VTimeLLM 接专用时间感知模块
- [[qvhighlights-2021]] —— 专用 VTG benchmark 与 Moment-DETR 范式；HawkEye 未主测 MR/HD，但同属「按查询找时段」问题族
- [[univtg-2023]] —— 统一 DETR 检测框架 + 4.2M 预训练；与 HawkEye 的「无检测头、纯 LLM」形成路线对比
- [[timechat-2024]] —— 另一 text-to-text 时序 LLM；用滑动 Q-Former + 秒级时间戳，HawkEye 论文在速度与帧数上对标
- [[clip]] —— InternVid-G 场景过滤与字幕对齐的相似度骨干
- [[tempcompass-2024]] —— 时序推理多维评测；HawkEye 强定位，不等于速度/方向等维度满分
- [[video-understanding]] —— 专题枢纽；长视频 grounding 子路线在 QVHighlights / UniVTG 之后可读 HawkEye
- [[lmms-eval]] —— 部分 Video LLM 与 grounding 任务统一评测入口

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[omnistvg-2025]] —— OmniSTVG — 按句子把视频里所有相关物体都框出来

