---
title: UniVTG — 把视频时刻定位、高光检测、摘要合成一套框架
来源: 'Lin et al., "UniVTG: Towards Unified Video-Language Temporal Grounding", arXiv 2023'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

UniVTG 是新加坡国立大学 Show Lab 团队在 2023 年 7 月发布的**统一视频时序定位（VTG）框架**：同一份模型、同一套标注公式，同时处理「按句子找连续片段（moment retrieval）」「给每段打精彩分（highlight detection）」「按关键词摘关键镜头（query-focused summarization）」三类任务，还能用 420 万条伪标注做**时序 grounding 预训练**，在七个数据集上超过不少任务专用 SOTA。

日常类比：以前做视频浏览像三家分店——一家只卖「按问题找段落」，一家只卖「标高潮曲线」，一家只卖「做精华集锦」，各用各的价签和收银系统。UniVTG 像统一收银台：不管顾客要「第 24–30 秒」「精彩度 4.5 分」还是「和 tree 有关的三个镜头」，后台都把视频切成等长小 clip，给每个 clip 填三张表——**是不是前景**、**区间边界偏移**、**与查询的相关分**——再派三个小部门（三个预测头）分别读表。

技术上它站在 [[qvhighlights-2021]] 的 Moment-DETR 肩膀上：视频用 CLIP + SlowFast 特征，文本用 CLIP text encoder，中间加多模态 Transformer，但把「只对 QVHighlights 双任务」扩展成**三种标签互转 + 大规模预训练 + 零样本 grounding**。

## 为什么重要

不理解 UniVTG，下面这些事容易误判：

- 为什么 QD-DETR、Moment-DETR 之后还要再出一篇「统一 VTG」——它们联合了 moment + highlight，但仍绑在特定标注格式上；UniVTG 把 **point / interval / curve** 三类标签写成同一套 \((f_i, d_i, s_i)\)，才能跨 Ego4D 叙述点、QVHighlights 区间、TVSum 曲线一起预训练
- 为什么 2023 年后 Video LLM 做 grounding 仍会引用 UniVTG 预训练权重——它是首批把 **temporal grounding 当预训练任务** 的工作（类比图像领域的 GLIP 做空间 grounding 预训练），给 [[vtimellm-2023]] 等「检测器 + LLM」路线提供强底座
- 为什么「没有昂贵人工区间标注」也能训定位模型——UniVTG 用 CLIP 当 teacher，从概念库给每个 clip 打伪 saliency 曲线，再阈值推出区间和点标签，把标注成本从「人工看完全片」降到「自动打分 + 规则派生」
- 为什么零样本 VTG 在 2023 年突然变得可信——统一框架 + 420 万多样本预训练后，模型在未见过的数据集上仍能做 interval / curve / point 推理，而不必每个 benchmark 从头训专用头

## 核心要点

1. **统一公式：每个 clip 三张表**。把视频切成固定长度 clip 序列，对每个 clip \(v_i\) 定义：前景指示 \(f_i \in \{0,1\}\)（是否与查询相关）、边界偏移 \(d_i=[d_i^s,d_i^e]\)（clip 中心到区间起止的距离）、显著性 \(s_i \in [0,1]\)（与查询的视觉相关度）。类比：每个 2 秒镜头同时贴「进不进答案集」「区间往左往右扩多少」「有多匹配」三张便利贴，三种 VTG 任务只是读不同列的组合。

2. **标签互转，一种标注补全其余两种**。只有区间标签（moment retrieval）时，区间外 \(f_i=0,s_i=0\)，区间内 \(f_i=1,s_i>0\)；只有曲线标签（highlight）时，用阈值 \(\tau\) 从 saliency 推出前景，再用最近非前景邻居估边界；只有点标签（Ego4D 叙述、QFVS 关键词）时，正点 \(s_i>0\)，并用相邻叙述间距估伪区间。类比：知道「高潮曲线」就能反推「哪些分钟算相关段」和「峰值时刻」。

3. **可扩展伪标注管线**。区间侧用 VideoCC 等带切分信息的视频-字幕对构造伪区间；曲线侧用开放概念库 + CLIP 逐 clip 打分，取 top-5 概念当视频 gist，相似度即伪 saliency；点侧直接吃 Ego4D 大规模时间戳叙述。合计约 **4.2M** 预训练样本，覆盖多域、多标签形态。

4. **双通路模型 + 三头解码**。继承 Moment-DETR 的 CLIP+SlowFast 视频编码与 CLIP 文本编码；**交互通路**把图文 token 拼接进 Transformer 做深度融合；**对齐通路**把句子池化后与 clip 特征做对比学习。输出头分别预测 \(\tilde{f}_i\)（BCE）、\(\tilde{d}_i\)（Smooth L1 + GIoU，仅前景 clip）、\(\tilde{s}_i\)（clip 与句向量的余弦相似 + 排序损失）。一套权重同时服务 MR、HD、摘要与零样本迁移。

## 实践案例

### 案例 1：统一公式下三种任务怎么读同一张表

```text
视频: 150 秒 lifestyle vlog，切成 75 个 2 秒 clip（与 QVHighlights 协议一致）
查询: "A woman cooking in the kitchen"

# Moment Retrieval —— 读区间集合 {b_i | f_i=1}
预测: clip 12–15 与 28–30 为前景 → 区间 [24s,30s], [56s,60s]

# Highlight Detection —— 读 saliency 曲线 top-K
预测: s_13=0.92, s_14=0.88 最高 → 高光落在 26–30 秒一带

# Query-focused Summarization —— 读前景点集，总长 ≤ α% 原视频
查询关键词: "kitchen", "cooking"
预测: 选 f_i=1 且 s_i 最高的若干离散 clip，总时长 ≤ 2%×150s = 3 秒
```

三种任务不是三个模型，而是同一组 \((\tilde{f},\tilde{d},\tilde{s})\) 的不同后处理。

### 案例 2：用官方仓库在 QVHighlights 上微调

```bash
git clone https://github.com/showlab/UniVTG
cd UniVTG

# 下载 QVHighlights 预提取 CLIP+SlowFast 特征（见 data/README）
# 可选：加载 4.2M 预训练 checkpoint 再下游微调
bash scripts/train_qvhighlights.sh \
  --config configs/qvhighlights_univtg.yml \
  --pretrain_ckpt checkpoints/univtg_pretrain_4.2m.pth

# 联合评测 Moment Retrieval + Highlight Detection
python eval.py --dataset qvhighlights --split val
```

论文在 QVHighlights 上同时刷 MR（R@1, IoU=0.5/0.7）与 HD（mAP）；加载预训练后通常优于从零训练的 Moment-DETR / QD-DETR 同类设定。test 集仍需提交官方服务器，与 [[qvhighlights-2021]] 协议相同。

### 案例 3：CLIP teacher 生成伪曲线标签（论文 Fig.4 思路）

```python
# 概念化流程 —— 非官方源码，帮助理解伪标注
concept_bank = load_open_world_classes()  # 开放检测类别表
clip_feats = encode_video_clips(video)    # 每 clip 一个向量

scores = {}
for concept in concept_bank:
    scores[concept] = cosine_sim(clip_feats, encode_text(concept))  # [num_clips]

# 取 clip 维 top-5 概念，其相似度曲线即伪 saliency s_i
gist_concepts = top_k_concepts_per_video(scores, k=5)
s_i = aggregate_clip_scores(scores, gist_concepts)

# 派生区间：s_i > tau 的 clip 设 f_i=1；边界由最近 f=0 邻居估 d_i
tau = estimate_threshold(s_i)
f_i = (s_i > tau).astype(int)
```

这套伪标签让没有人工曲线标注的长视频也能参与预训练，是 UniVTG 敢堆 4.2M 样本的关键。

## 踩过的坑

1. **把「统一」理解成「一个 loss 权重走天下」**：三种标签密度不同，预训练时 \(\mathcal{L}_f,\mathcal{L}_b,\mathcal{L}_s\) 的 \(\lambda\) 和采样比例要按数据源调，否则曲线样本会淹没稀疏点标签。

2. **伪标注当金标准**：CLIP teacher 的 saliency 在新闻、体育等域可用，但在第一视角、细粒度动作上噪声大；下游微调仍应用真实人工标注（如 QVHighlights val）校准。

3. **忽略 clip 长度与 benchmark 协议不一致**：UniVTG 默认 2 秒 clip 与 QVHighlights 对齐；换 Charades-STA 或 TACoS 时需按各集特征步长重训或重对齐，否则 IoU 系统性偏低。

4. **零样本≠免特征**：预训练权重再强，推理仍依赖与训练同分布的 CLIP+SlowFast 预提取特征；自提特征若帧率或归一化不同，零样本 MR 会大幅缩水。

## 适用 vs 不适用场景

**适用**：
- 需要在 **moment retrieval、highlight detection、视频摘要** 多条产品线复用同一 grounding 底座
- 想利用 **Ego4D 叙述、VideoCC 伪区间、CLIP 伪曲线** 等廉价标签做大规模 VTG 预训练
- 在 [[qvhighlights-2021]]、Charades-STA、TACoS、Ego4D NLQ 等经典榜上做 **单模型多任务** 对比
- 为 [[vtimellm-2023]]、VTG-LLM 等「检测器 + 大模型」路线准备 **可插拔的 temporal encoder**

**不适用**：
- 端到端开放域视频对话（用 TimeChat、[[video-llava-2024]] 等 Video LLM 更直接）
- 毫秒级动作定位或超长电影（小时级）单次前向——clip 序列长度和显存仍是瓶颈
- 只有原始像素、不愿跑 CLIP+SlowFast 特征管线的轻量部署
- 多语言查询为主的产品（预训练与七大数据集以英文标签为主）

## 历史小故事（可跳过）

- **2021**：QVHighlights + Moment-DETR 首次把 MR 与 HD 绑在同一 benchmark，但模型仍难泛化到其他标签形态
- **2023-07**：UniVTG 上传 arXiv 2307.16715；提出统一 \((f,d,s)\) 公式与 CLIP 伪标注管线
- **2023 下半年**：4.2M 预训练 + 七数据集实验验证「一个模型打穿三类 VTG」；代码开源于 showlab/UniVTG
- **2023–2024**：[[vtimellm-2023]]、Grounded-VideoLLM 等把 UniVTG 式检测器接到 LLM，QVHighlights 榜进入「预训练检测器 + 指令微调」阶段
- **后续**：MLVTG 等非 DETR 路线出现，但 UniVTG 仍是 **VTG 预训练** 路线的参考基线

## 学到什么

1. **任务不同，原子单位可以相同**——把 VTG 拆成 clip 级前景、边界、相关分，比为每个 benchmark 单独设计头更易 scale
2. **标签形态可以互相推导**——有一种标注就能补全另两种，这是统一预训练的前提；GLIP 在图像上做过类似事，UniVTG 把它搬到时间轴
3. **Teacher 模型是标注工厂**——CLIP 概念打分生成百万级伪曲线，成本远低于人工 saliency；长视频产品应重视「弱 teacher + 强学生」管线
4. **预训练任务设计决定零样本上限**——把 grounding 本身当预训练目标，比只做 video-text retrieval 再挂 2D-TAN 类检测器更端到端
5. **VTG 统一化是通向 Video LLM 的桥**——检测器负责「指哪几秒」，LLM 负责「说什么」；UniVTG 强化前者，为 [[vtimellm-2023]] 铺路

## 延伸阅读

- 论文 PDF：[arXiv 2307.16715](https://arxiv.org/abs/2307.16715)
- 官方代码：[showlab/UniVTG](https://github.com/showlab/UniVTG)
- 前置基准：[[qvhighlights-2021]] —— 联合 MR+HD 的首个大规模数据集与 Moment-DETR 基线
- 后继路线：[[vtimellm-2023]] —— 把 VTG 检测器输出接到 Video LLM 做可解释时刻定位
- [[clip]] —— 文本编码、伪标注 teacher、以及视频侧 ViT-B/32 特征的来源
- [[vid-llm-survey-2023]] —— 综述 VTG 与 Video LLM 交界；UniVTG 列入 grounding 预训练代表

## 关联

- [[qvhighlights-2021]] —— 直接上游：UniVTG 在 MR+HD 联合榜上的核心评测场，架构继承 Moment-DETR
- [[vtimellm-2023]] —— 下游：用 LLM 读 UniVTG 类检测器的时间输出，把 grounding 变成可对话能力
- [[clip]] —— 三头 saliency 与伪标注 teacher 的骨干；视频与文本双塔对齐的基础
- [[timechat-2024]] —— 对照：TimeChat 用 LLM 生成秒数，UniVTG 用专用检测头回归区间与曲线
- [[tempcompass-2024]] —— 时序推理专测；UniVTG 强定位弱于「速度/方向」等细粒度维度
- [[long-video-retrieval-2023]] —— 长视频先检索再定位；UniVTG 预训练可当前段打分器
- [[decord]] —— 自提 SlowFast/CLIP 特征时的视频解码后端
- [[lmms-eval]] —— 部分 VTG 与 Video LLM 任务统一评测入口
- [[video-understanding]] —— 专题枢纽；VTG 子路线在 QVHighlights 之后读 UniVTG

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hawkeye-2024]] —— HawkEye — 用递归缩窗把文本查询钉在长视频时间轴上
- [[mlvtg-2025]] —— MLVTG — MambaAligner + 冻结 LLM 提纯的多模态视频时序定位
- [[omnistvg-2025]] —— OmniSTVG — 按句子把视频里所有相关物体都框出来
- [[timemarker-2024]] —— TimeMarker — 时间分隔符 + 任意长度采帧的视频定位大模型
- [[uvtg-mllm-2025]] —— UniTime — 生成式 MLLM 做通用视频时序定位

