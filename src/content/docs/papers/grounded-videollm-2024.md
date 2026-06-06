---
title: Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM
来源: 'Wang et al., "Grounded-VideoLLM: Sharpening Fine-grained Temporal Grounding in Video Large Language Models", EMNLP 2025 Findings'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

Grounded-VideoLLM 是 UC Davis 等团队 2024 年 10 月发布（EMNLP 2025 Findings 收录）的视频大语言模型，专门解决 **fine-grained temporal grounding（细粒度时序定位）**：不只回答「视频里发生了什么」，还要精确说出 **「在第几秒到第几秒发生」**。

日常类比：普通 Video LLM 像看完新闻集锦后只能概括「今天有球赛、有发布会」——粗粒度。Grounded-VideoLLM 像带时间轴的剪辑师：「0:12–0:18 婴儿在哭，0:19–0:32 男人进门抱起婴儿，0:40–0:45 婴儿在吃苹果」。每个事件都绑在具体时间窗口上。

论文指出多数 Video-LLM 的短板来自两点：**逐帧独立编码、忽视帧间运动关系**，以及 **用纯文本写浮点秒数**（如 `"from 102.3 to 120.1 seconds"`），LLM 的 next-token 机制对数字不友好。Grounded-VideoLLM 用 **双流视觉编码** + **离散时间 token** + **三阶段渐进训练** 把「何时」和「何事」放进同一套离散 token 序列里联合解码。

## 为什么重要

不理解 Grounded-VideoLLM，下面这些事容易误判：

- 为什么 [[video-llava-2024]] / [[video-chatgpt-2023]] 在 MVBench 还行、一到 Charades-STA 定位就崩——它们优化的是全局语义，缺少显式时间戳表示与运动建模
- 为什么「把秒数写进 prompt」不是好方案——论文消融显示纯文本时间戳在 ActivityNet 等长视频上明显弱于 300 个专用 `<t>` token
- 为什么 2024–2025 年 Video LLM 开始分 **Refer / Localize / Reason** 三种时序能力——Grounded-VideoLLM 把句子定位、密集字幕、带证据的 VideoQA 统一成一条 grounding 主线
- 为什么 VCG-Bench 的 **TU（Temporal Understanding）** 子项成为新卖点——Grounded-VideoLLM TU 分 **3.12**，比 P-LLaVA 等同规模模型高约 7%，双流运动编码直接受益

## 核心要点

1. **双流编码（Two-Stream Encoding）**：视频均匀采 **96 帧**，切成 **12 段**；每段 **空间流** 取中间关键帧走图像 encoder（保留外观细节），**时间流** 把段内多帧送进 InternVideo2 抽运动特征。两路特征经 MLP 投影后拼接。类比：空间流看「这一幕长什么样」，时间流看「这一小段里动作怎么变」。

2. **离散时间 token**：向 LLM 词表新增 **300 个** 相对时间 token（如 `<0>` 表视频起点、`<300>` 表终点）。连续秒数 $\tau$ 按 $t = \mathrm{Round}(M \cdot \tau / L)$ 量化后再解码。输出可以是：`From <0> to <6>, a baby is crying.` —— 文本与时间 token 同序列生成，避免 LLM 逐字符拼浮点数。

3. **三阶段渐进训练**：Stage-1 用 128 万 video-caption 对齐视频 encoder（只训投影层）；Stage-2 **Temporal Token Alignment**，在 TSG / 密集字幕 / 时间指代任务上对齐时间 token 与视频时间轴；Stage-3 多任务指令微调（含自建的 **17K Grounded VideoQA** + VideoChat2 等），并加 LoRA 训 LLM。类比：先学会「看视频」，再学会「读时间轴」，最后学会「边答边指证据片段」。

## 实践案例

### 案例 1：模型输出里的时间 token 长什么样

```
输入（概念化）：
  [96帧视频特征] + 指令："Describe events with timestamps."

模型输出：
  From <0> to <6>, a baby is crying.
  From <7> to <16>, a man is coming and picking up the baby.
  From <20> to <25>, the baby is eating an apple.

解读：
  - <0>–<6> 映射到视频前 ~2% 时长（300 档相对量化）
  - 文本事件与时间 token 在同一条自回归序列里生成
  - 特殊 token <ground> 可提示模型「接下来要输出 grounded 时间戳」
```

### 案例 2：双流 vs 单流（论文 Table 5 量级）

```
配置                          Charades mIoU    MVBench Avg
----------------------------------------------------------
Grounded-VideoLLM（双流）        36.8            60.0
去掉时间流，稀疏 24 帧             30.4            58.5
去掉时间流，密集 96 帧             34.3            53.2   ← 定位略升、通用理解掉
去掉空间流                        33.5            57.7

结论：运动流 + 外观流缺一不可；只堆帧数不能替代显式 temporal stream
```

### 案例 3：用官方仓库跑推理（概念命令）

```bash
git clone https://github.com/WHB139426/Grounded-Video-LLM
cd Grounded-Video-LLM

# 权重见 Hugging Face: WHB139426/Grounded-Video-LLM
# 典型输入：均匀 96 帧 + 文本指令

python inference.py \
  --video_path demo.mp4 \
  --question "When does the person pick up the object?" \
  --model_path WHB139426/Grounded-Video-LLM-Phi3.5

# 期望输出：自然语言答案 + <t_start> to <t_end> 形式的时间 token 区间
# Phi3.5-3.8B 版在 ANet-Grounding mIoU 36.1，强于同规模 Vicuna-7B 版
```

## 踩过的坑

1. **时间 token 太少会伤长视频**：消融显示 100 token 与纯文本接近，**300 token** 在 ActivityNet 等长片上增益最明显——部署时别为省词表随意砍 $M$。

2. **跳过 Stage-2 对齐，Stage-3 也救不回来**：去掉 Temporal Token Alignment 后 Charades mIoU 从 36.8 跌到 27.5——时间 token 必须专门对齐视频时间轴，不能指望最后一轮指令微调硬背。

3. **底座 LLM 强弱影响大于参数量**：Vicuna-7B 版整体略弱于 Phi3.5-4B 版——grounding 再强也受限于底座推理与指令跟随能力。

4. **Grounded VideoQA 训练集靠 GPT-4 流水线合成**：17K 样本 scalable 但有噪声，零样本迁移到分布外领域（监控、体育）时要预期 IoU 回落。

5. **96 帧上限对极长视频不友好**：均匀分段在 10 分钟片上每段仍覆盖数十秒，毫秒级动作边界会被量化 token 平滑——需要更密采样或层次 grounding 时得换架构。

## 适用 vs 不适用场景

**适用**：
- 需要 **句子级时间定位**（Temporal Sentence Grounding）或 **密集事件字幕**（Dense Video Captioning）
- 问答必须附带 **证据时间段**（NExT-GQA / Grounded VideoQA 形态）
- 在通用 VideoQA（MSVD / MSRVTT / ActivityNet-QA）上也要兼顾 **VCG-Bench 时间理解 TU 子项**

**不适用**：
- 纯短视频全局问答、不关心秒级定位——[[video-llava-2024]] 更轻
- 小时级电影全片对话——看 [[moviechat-2024]] 的记忆压缩路线，Grounded-VideoLLM 固定 96 帧
- 空域框级定位（谁在哪）——本文只做 **时间轴** grounding，不做 spatial bbox
- 实时低延迟流式分析——96 帧 + 双流 encoder 离线算力不低

## 历史小故事（可跳过）

- **2024-10**：论文上传 arXiv:2410.03290，提出双流 + 时间 token + 三阶段训练完整方案
- **2024 同期**：VTimeLLM、TimeChat、Momentor、VTG-LLM 等并发探索「Video LLM + 时间定位」，Grounded-VideoLLM 强调 **离散 token 对齐** 而非纯文本秒数
- **2025**：收录 **EMNLP 2025 Findings**；代码与 Phi3.5 / Vicuna 权重释出 Hugging Face
- **评测位势**：在 Charades-STA R@0.7、ANet-Captions SODA_c、NExT-GQA Acc@GQA、MVBench 上同时拿到 Video-LLM 阵营前列，证明 grounding 专项训练不必牺牲通用理解

## 学到什么

1. **「何时」和「何事」应共用离散 token 词表**，而不是让 LLM 当 OCR 读浮点秒数——这是 fine-grained grounding 的工程关键
2. **双流要在编码早期分工**：空间看关键帧、时间看段内密集帧，比只在 LLM 里靠 position embedding 猜时序更稳
3. **渐进课程学习对 grounding 有效**：caption → 对齐时间 token → 多任务指令，比一上来混训 grounding + 闲聊 loss 更易收敛
4. **专用 grounding 与通用 VideoQA 可兼得**：MVBench 60.0、VCG-Bench 3.24 说明 sharpen temporal 不等于牺牲 [[video-chatgpt-2023]] 式开放问答
5. **R@0.7 比 R@0.3 更能区分模型**：论文强调高 IoU 阈值上的领先，说明定位 **边界更准** 而不只是「大概区间」

## 延伸阅读

- 论文 PDF：[arXiv 2410.03290](https://arxiv.org/abs/2410.03290)
- 代码与权重：[Grounded-Video-LLM GitHub](https://github.com/WHB139426/Grounded-Video-LLM) / [Hugging Face](https://huggingface.co/WHB139426/Grounded-Video-LLM)
- 对标工作：VTimeLLM、TimeChat（纯文本时间戳路线）；Momentor、VTG-LLM（特殊 token 但对齐策略不同）
- 评测集：NExT-GQA（ grounded QA）、Charades-STA / ActivityNet-Captions（定位与密集字幕）
- [[vid-llm-survey-2023]] —— 综述 VTG 任务谱系；Grounded-VideoLLM 是 Video-LLM 接 VTG 的 2024 代表
- [[mlvu-2024]] —— 长视频多任务考；与本文 96 帧定位路线互补

## 关联

- [[video-llava-2024]] —— 统一图像/视频表征、弱时序；Grounded-VideoLLM 补「秒级定位」短板
- [[video-chatgpt-2023]] —— 论文主要对照基线之一；文本写秒数的 grounding 尝试
- [[moviechat-2024]] —— 超长视频记忆；Grounded-VideoLLM 专攻中等长度精细时间轴
- [[mlvu-2024]] —— 长视频九类任务 benchmark；可检验 grounding 模型在 AO/AC 上的表现
- [[llava]] —— Vicuna 版 Grounded-VideoLLM 的图像 MLLM 底座来源
- [[internvideo]] —— 时间流采用 InternVideo2-1B；运动特征质量绑定 grounding 上限
- [[lmms-eval]] —— 复现 MSVD-QA / MVBench 等通用指标的推荐框架
- [[tempcompass-2024]] —— 专测时序理解微粒度；可对比 Grounded-VideoLLM 在速度/方向题上的泛化
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[qwen2-5-vl-2025]] —— Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解
- [[sharegpt4video-2024]] —— ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成
- [[spacevllm-2025]] —— SpaceVLLM — 一个 MLLM 同时做时序定位、图像指代与时空管定位
- [[streamingbench-2024]] —— StreamingBench — 流式视频理解的 18 任务在线大考
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[traveler-2024]] —— TraveLER — 四段式多 Agent，帧级问答看懂长视频
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videoagent-memory-2024]] —— VideoAgent（Fan）— 双记忆 + 四工具，长视频逼近 Gemini
- [[vidstg-2020]] —— VidSTG — 用自然语言在长视频里框出「谁在何时何地」
- [[vtg-llm-2024]] —— VTG-LLM — 绝对时间 token + VTG-IT-120K，让 Video LLM 精确定位时刻

