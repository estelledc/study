---
title: ST-LLM — 把所有时空 token 交给 LLM，让它自己学时序
来源: 'Liu et al., "ST-LLM: Large Language Models Are Effective Temporal Learners", arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

ST-LLM 是北京大学与腾讯 ARC 团队 2024 年 3 月发布的**时空联合视频大语言模型**（arXiv 2404.00308）——它问了一个看似简单的问题：**能不能把视频所有帧的空间 token 按时间顺序原样拼进 LLM，让 LLM 自己当「时序建模器」？** 答案是：可以，而且比多数「先池化再对话」的方案更强。

日常类比：以前的 Video LLM 像把电影每一帧都拍成照片，再叠成一张「平均模糊图」给解说员——动作方向、先后次序全糊掉。ST-LLM 像把按时间排列的连环画页整本交给一个本来就会读长文的编辑——他逐格看，自己推断「球从左滚到右」「门先开后人再进」。

架构上三块拼图：**BLIP-2 Q-Former 逐帧编码** → **全时空 token 串接进 Vicuna-7B**（不另加时序模块）→ **动态掩码 + 全局-局部输入** 控制算力与长视频稳定性。单阶段视频指令微调即可，不必像 VideoChat2 那样三阶段对齐专用视频编码器。

## 为什么重要

不了解 ST-LLM，下面这些事说不清：

- 为什么 VideoChat / Video-LLaMA 的「帧特征做 temporal mean pooling」在 MVBench 运动类任务上集体翻车——时序信息在进 LLM 前就被平均掉了
- 为什么 2024 年后出现「把时序建模还给 Transformer 本体」的路线——ST-LLM 证明 LLM 自带的序列建模能力足以理解视频动态，不必外挂重型时序头
- 为什么动态掩码对视频 LLM 不只是省算力——训练时随机遮掉 30%–70% 视觉 token，推理时帧数变化更稳，减轻「训练 16 帧、测试 64 帧就幻觉」的脆弱性
- 为什么 MVBench 上运动方向（MD）、运动计数（MC）成为分水岭——ST-LLM 在这三类 motion 任务平均 59.2%，VideoChat2 仅 36.3%，拉开「真懂动态」与「只会描述静态场景」的差距

## 核心要点

1. **Video Tokens Inside LLM（时空 token 直入 LLM）**：每帧经 BLIP-2 视觉编码器压成 \(K\) 个 token，\(T\) 帧拼成 \(T \times K\) 的联合时空序列，与文本 token 直接拼接进 Vicuna。不加帧间分隔符、不加额外时空位置编码——依赖 LLM 自带的 RoPE 区分位置。类比：不先写章节摘要，把原稿按页码顺序整本塞进编辑手里。

2. **动态掩码 + 掩码视频建模（Dynamic Masking & MVM）**：训练时从 \(\mathcal{N}(0.5, 0.1)\) 采样掩码率 \(\rho\)（限制在 0.3–0.7），随机遮住约一半视觉 token；同时用 Masked Video Modeling：对掩码序列与完整序列各做一次前向，让未遮 token 的隐状态逼近完整版，损失 \(\mathcal{L} = \mathcal{L}_{mvm} + \mathcal{L}_{llm}\)。类比：读连环画时故意盖住几格，逼模型从上下文推断被挡住的动作。

3. **全局-局部输入（Global-Local Input）**：超长视频先对所有帧 token 做平均池化得全局表示 \(V_0\)，再均匀采样 \(\overline{T}\) 帧（4–16）作局部时空序列 \(\overline{V}\)，以 \(\overline{V} + f_m(V_0)\) 送入 LLM（\(f_m\) 为零初始化上采样 MLP）。全局分支提供「整片概览」，局部分支保留 LLM 内精细时序建模。类比：看三小时纪录片——先扫一眼章节标题（全局），再精读你关心的 5 分钟片段（局部）。

## 实践案例

### 案例 1：ST-LLM 视频对话推理

```python
# 官方仓库: https://github.com/TencentARC/ST-LLM
from stllm import STLLM

model = STLLM.from_pretrained("TencentARC/ST-LLM-7B")  # 基于 InstructBLIP-Vicuna-7B

# 短视频：1 fps 采帧，局部帧数 4–16，token 不经 mean pooling
response = model.chat(
    video_path="basketball_clip.mp4",
    question="球是从左边滚到右边，还是从右边滚到左边？",
    num_local_frames=8,
)

# 长视频（数分钟）：启用 global-local，全局 64 帧均值 + 局部 16 帧
response_long = model.chat(
    video_path="cooking_tutorial_10min.mp4",
    question="厨师是在切菜之前还是之后加的盐？",
    use_global_local=True,
    global_frames=64,
    num_local_frames=16,
)
```

### 案例 2：动态掩码如何缩短训练上下文

```
设: T=16 帧, 每帧 K=32 token → 未掩码总长 512 token

掩码率 ρ ~ N(0.5, 0.1), 裁剪到 [0.3, 0.7]:
  ρ=0.5 时 → 约 256 token 进 LLM（与 LLaVA 单图 token 预算相当）
  ρ=0.3 时 → 约 358 token（偏难，逼模型补全更多时空依赖）
  ρ=0.7 时 → 约 154 token（偏省算力）

对比 VideoChat 式 mean pooling:
  无论 T 多大 → 固定 K=32 token，运动信息在池化阶段已丢失
```

### 案例 3：MVBench 运动类 vs 全局平均（摘选）

```text
MVBench 20 项任务平均分（7B 级、LLaMA-1 底座公平对比）:

  VideoChatGPT    32.7
  Video-LLaMA     34.1
  VideoChat2      51.1   ← 专用视频编码器 + 三阶段预训练
  ST-LLM          54.9   ← 单阶段视频指令微调、无额外时序模块

运动敏感三项（Moving Direction / Count / Attribute）:
  VideoChat2  平均 36.3%
  ST-LLM      平均 59.2%   ← 方向感、计数、属性变化明显领先

VideoChatGPT-Bench 生成式五维均分:
  ST-LLM Mean Score 3.15（Temporal 2.93），高于 VideoChat2 的 2.98
```

## 踩过的坑

1. **全 token 进 LLM 显存随帧数线性涨**：不做动态掩码时，16 帧 × 32 token 已占满上下文；工程上必须训练期掩码、推理期控制 local 帧数，否则长视频直接 OOM。

2. **CLIP/BLIP-2 图像编码器拖细粒度任务后腿**：MVBench 的 Fine-grained Action、Fine-grained Pose 上 ST-LLM 未必全胜——低层时空纹理不是 Q-Former 强项，运动理解强不等于微动作识别强。

3. **帧数分布漂移仍会伤精度**：动态掩码缓解但未消除「训练 16 帧、测试突然 64 帧」的分布差；global-local 要手动开关，短视频误开全局分支反而引入多余噪声。

4. **单阶段微调依赖强图像底座**：论文冻结 CLIP 与 Q-Former，只吃 InstructBLIP 已有对齐；换弱视觉底座或跳过图像对话预训练，时空 token 直入 LLM 的优势会缩水。

## 适用 vs 不适用场景

**适用**：
- 需要判断**运动方向、先后次序、场景切换**的短视频 QA（MVBench 类多选）
- 希望**少改架构、复用现成 Image LLM 权重**做视频对话——不必训三阶段专用视频编码器
- 研究「LLM 能否承担时序建模」的基线对照——ST-LLM 是首批开源验证该假设的模型之一
- 分钟级视频在**全局概览 + 局部精读**之间折中——global-local 模块可直接借鉴

**不适用**：
- 需要**精确到秒的时间戳定位**——ST-LLM 不绑绝对时间，[[timechat-2024]] 更合适
- **毫秒级动作识别**或极细粒度姿态——图像编码器瓶颈明显
- **实时流式对话**——全 token 进 LLM 延迟高，难做在线场景
- 追求**极致参数效率**的 8 帧均匀采样方案——[[video-llava-2024]] 的 ABP + MLP 更轻，但时序弱

## 历史小故事（可跳过）

- **2024-03-30**：ST-LLM 上传 arXiv（2404.00308），同期 VideoChat2、Chat-UniVi 都在加专用时序模块，它反其道把建模权交还 LLM
- **2024 上半年**：代码与权重在 GitHub / HuggingFace 开源（TencentARC/ST-LLM），MVBench 平均 54.9 刷新 7B 级 SOTA
- **2024 年中**：VideoChatGPT-Bench 生成评测均分 3.15，Temporal 维度 2.93 领先多数竞品——「LLM 当时序学习器」假说获量化背书
- **2024 下半年**：VideoLLaMA 2、Qwen2-VL 等工业模型继续演进时空建模，ST-LLM 的「掩码 + 全局局部」思路被后续工作吸收为工程标配之一

## 学到什么

1. **时序理解不必等于「加时序模块」**：mean pooling 是效率捷径却是理解天花板；把 \(T \times K\) token 交给 LLM，运动类 benchmark 可一次性抬 20+ 点
2. **掩码训练对视频 LLM 有双重价值**：既砍训练算力，又提升推理时帧数鲁棒——借鉴 NLP/视频预训练的 BERT 式思路，但配合自回归 LLM 需定制 MVM 目标
3. **长视频要「全局摘要 + 局部精读」不对称设计**：全帧进 LLM 不可行；平均池化全局 + 采样局部再残差注入，是在有限上下文里保留时序建模能力的务实折中
4. **简洁管线可以打败重型预训练**：ST-LLM 单阶段视频指令微调、冻结视觉侧，仍超三阶段 VideoChat2——说明问题定义（谁来做时序建模）比堆模块更重要

## 延伸阅读

- 论文 PDF：[arXiv 2404.00308](https://arxiv.org/abs/2404.00308)
- 官方代码：[TencentARC/ST-LLM](https://github.com/TencentARC/ST-LLM)
- 评测基准：[MVBench](https://github.com/OpenGVLab/Ask-Anything/tree/main/mvbench)
- [[blip2-2023]] —— 视觉编码与 Q-Former 来源；ST-LLM 逐帧当图像编码
- [[llava]] —— 对照：单图 token 预算与 ST-LLM 掩码后平均长度相当
- [[timechat-2024]] —— 另一条长视频路线：帧级时间戳绑定 vs ST-LLM 的纯 token 序列
- [[videochat-flash-2025]] —— 后继：分层压缩换更长上下文，与 ST-LLM 的 global-local 异曲同工

## 关联

- [[blip2-2023]] —— ST-LLM 视觉底座；Q-Former 把每帧压成少量 token 再拼时空序列
- [[llava]] —— 共享「视觉 token + LLM 自回归」范式；ST-LLM 把单图扩展为 \(T\) 帧串联
- [[llava-onevision-2024]] —— 同期统一图像/视频表示；ST-LLM 专注时序、不做跨模态对齐创新
- [[timechat-2024]] —— 长视频 + 时间定位；ST-LLM 强运动理解弱绝对秒数
- [[videochat-flash-2025]] —— VideoChat 系长视频后继；HiCo 压缩 vs ST-LLM 掩码 + 全局局部
- [[flamingo-2022]] —— 早期「交错视觉-文本序列进 LLM」；ST-LLM 在视频对话场景系统化验证
- [[clip]] —— 被 BLIP-2 取代为默认视觉编码；ST-LLM 实验表明 Q-Former 压缩更利于多帧拼接
- [[vit]] —— 逐帧 ViT patch 是时空 token 的空间维来源
- [[flan-2021]] —— 指令微调范式延续到视频对话数据混合（VideoChatGPT-100k 等）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[flamingo-2022]] —— Flamingo — 让冻结的大模型学会看图，几张样例就上手
- [[flan-2021]] —— FLAN — 用自然语言指令教模型学会"听话"
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[llava-onevision-2024]] —— LLaVA-OneVision — 单图、多图、视频一个模型全搞定
- [[timechat-2024]] —— TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-flash-2025]] —— VideoChat-Flash — 分层压缩，让长视频理解又快又准
- [[vit]] —— ViT — Vision Transformer

