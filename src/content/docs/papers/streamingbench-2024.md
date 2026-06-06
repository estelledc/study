---
title: StreamingBench — 流式视频理解的 18 任务在线大考
来源: 'Lin et al., "StreamingBench: Assessing the Gap for MLLMs to Achieve Streaming Video Understanding", arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

StreamingBench 是 2024 年 11 月发布的**首个全面流式视频理解 benchmark**：在 **900 条** YouTube 视频上布置 **4,500 道**人工质控问答题，每条视频在**五个不同时间点**各出一题，模拟「视频还在播、问题随时打断」的在线场景——而不是等整片看完再一次性提问。

日常类比：VideoMME、MLVU 像**把整部电影下载完**再开卷考试；StreamingBench 像**边看直播边被主持人提问**——「此刻字幕上写的什么？」「刚才那声哨响时场上发生了什么？」「请在前一个问题提到的那支队伍再得一分时喊 GOAL」。人天然能边看边答；多数 MLLM 仍只能离线吞完整段视频。

论文把 18 种任务归入三大能力：**实时视觉理解**（10 任务）、**全模态理解**（4 任务，视+听同步）、**上下文理解**（4 任务，含误导帧过滤、连续追问、主动输出）。对 **13 个**开源与闭源 MLLM 的系统评测显示：最强 **Gemini 1.5 Pro** 总体准确率约 **67.1%**，人类抽样约 **91.7%**——流式理解仍是 2024–2025 年的明显短板。

## 为什么重要

不了解 StreamingBench，下面这些事容易误判：

- 为什么 VideoMME、[[mlvu-2024]] 高分仍不等于「能当直播助手」——离线 benchmark 默认整片可见；StreamingBench 把**提问时刻**写进题面（「right now」「just now」），同一问题在不同秒数答案可能不同
- 为什么「能处理长视频」和「能流式交互」是两件不同的事——论文把流式任务拆成**实时视觉 / 视听同步 / 交互上下文**三条轴，暴露模型只在第一条上还行
- 为什么带音频的 MLLM 开始成为标配——全模态任务（谁刚说了某句台词、某句话对应什么画面）上，多数纯视觉模型接近随机，**Gemini 1.5 Pro** 因能读音轨明显领先
- 为什么 2025 年 streaming MLLM 论文开始标配 StreamingBench 子表——它是 VStream-QA（仅 32 视频、纯视觉）之后**规模最大、任务最全**的在线视频考

## 核心要点

1. **三大能力轴 = 流式 vs 离线的本质差别**：实时视觉考「此刻画面里有什么」；全模态考「画面和声音是否对齐」；上下文考「冗余帧会不会误导、上一问能否引用、条件触发能否主动喊 GOAL」。类比：离线考是交卷后阅卷；流式考是**边播边抢答 + 边听边对字幕 + 边记上一句对话**。

2. **18 任务覆盖真实直播场景**：视觉侧含物体感知 OP、因果推理 CR、片段摘要 CS、读屏 TR、计数 CT 等 10 项；视听侧含情绪 ER、场景 SCU、声源辨别 SD、多模态对齐 MA；上下文侧含误导 MCU、异常 ACU、连续 SQA、主动 PO。八类视频来源（生活、赛事、教育、综艺、游戏、纪录片、动画电影、异常事件）保证题型不绑单一域。

3. **评测协议：用离线模拟流式**：当前 MLLM 尚不能真接流式输入，论文把每题转为「从片头剪到提问时刻的片段 + 离线作答」；SQA 额外拼接历史 QA；PO 用每秒轮询「是否该输出」测时间精度（±2 秒算对）。主实验设定：**提问前 60 秒**为可见上下文——比「全片可见」更贴近在线助手。

## 实践案例

### 案例 1：三大能力题目长什么样

```
实时视觉 — Text-Rich（读屏）：
  时刻 t=02:15  问：屏幕上此刻显示的数字是？
  → 同一视频在 t=02:30 再问，答案可能已变

全模态 — Source Discrimination（声源辨别）：
  问：刚才谁说了「Let's go」？
  A. 左侧红衣  B. 右侧蓝衣✓  C. 画外音  D. 无人说话
  → 必须同时看口型/画面与听对白

上下文 — Sequential QA（连续追问）：
  Q1 @01:00：穿 7 号球衣的是哪支队伍？
  Q2 @03:20：上一问提到的那支队伍目前比分是多少？
  → 模型需记住 Q1 实体，不能每题当独立卷面

主动输出 — Proactive Output：
  指令：进球时输出「GOAL」
  → 模型需在正确秒数附近自主触发，而非等用户再问
```

### 案例 2：论文主要模型分数（Overall %）

```
模型                        Overall   实时视觉   全模态   上下文
------------------------------------------------------------------
Human（10% 抽样）            91.66     91.46     90.26    93.55
Gemini 1.5 Pro               67.07     75.69     60.22    48.73  ← SOTA
GPT-4o                       60.15     73.28     44.50    38.70
Claude 3.5 Sonnet            57.68     72.44     36.80    37.70
LLaVA-OneVision 7B           56.36     71.12     38.40    32.74  ← 开源最强
Qwen2-VL 7B                  54.14     69.04     34.90    31.66

关键结论：视觉任务普遍 >60%；视听+上下文普遍 <45%
```

### 案例 3：用官方仓库跑 StreamingBench

```bash
git clone https://github.com/THUNLP-MT/StreamingBench.git
cd StreamingBench

# 下载数据后按 README 配置模型 API / 本地权重
python evaluate.py \
  --model qwen2_vl \
  --setting main_60s \
  --output ./results/streamingbench.json

# main_60s：每题仅可见「提问时刻前 60 秒」片段（论文主设定）
# 对比 all_context 可观察「偷看全片」对流式分数的虚高幅度
```

## 踩过的坑

1. **不要用「全片上下文」冒充流式分数**：论文 ablation 显示给模型看完整视频会显著抬高分——横向比必须对齐 **60 秒主设定**或同一切片规则。

2. **Overall 掩盖视听崩盘**：Gemini 视觉子项约 75.7%，全模态仅 60.2%，上下文 48.7%——合并平均会把「能看画面、听不懂、记不住」伪装成「勉强及格」。

3. **PO 任务不能当普通四选一比**：主动输出用时间误差 ±2s 判对错，且多数模型需轮询式 prompt 才能测——直接套多选题 pipeline 会系统性低估或高估。

4. **Concurrent / Subsequent 线索最难**：论文按线索时序分 Prior / Concurrent / Subsequent，Subsequent 类准确率可低至个位数——只报 Prior 子集会显得模型比实际更能「在线反应」。

## 适用 vs 不适用场景

**适用**：
- 验证 streaming / online video MLLM 在**边播边问**场景的真实能力
- 对比「纯视觉 vs 带音频」模型在全模态子项上的差距
- 测试连续对话（SQA）、条件触发（PO）、误导帧鲁棒性（MCU/ACU）等离线 benchmark 覆盖不到的交互形态

**不适用**：
- 纯离线长视频全局理解上限——用 [[lvbench-2024]]、[[mlvu-2024]] 更直接
- 纯短视频(<1 分钟)多任务筛选——[[mvbench-2023]] 更省时
- 训练数据扩充——900 视频专用于评测；且 PO 任务当前仅评 50/250 题（其余计划后续放出）

## 历史小故事（可跳过）

- **2024-11-06**：StreamingBench 上传 arXiv 2411.03628，清华大学等单位联合发布，自称首个全面流式视频理解 benchmark
- **2024 底**：项目页 [streamingbench.github.io](https://streamingbench.github.io/) 与 [GitHub THUNLP-MT/StreamingBench](https://github.com/THUNLP-MT/StreamingBench) 开放数据与评测脚本
- **对照前驱**：VStream-QA 仅 32 视频、5 任务、纯视觉——StreamingBench 在规模、模态、交互类型上全面扩容
- **2025**：多篇 VideoLLM-online、Flash-VStream 等 streaming 模型论文把 StreamingBench 列为标准 eval，推动「离线高分 ≠ 在线可用」成为社区共识

## 学到什么

1. **流式理解是独立于「长视频离线 QA」的新赛道**：能看完 2 小时片再答题，不等于能在第 37 秒被问「此刻发生什么」
2. **视听同步是第二道硬门槛**：实时视觉任务上强模型仍可达 70%+，一进入 ER/SD/MA 普遍腰斩——音频不能当可选项
3. **上下文冗余会系统性误导模型**：MCU/ACU 去掉冗余帧后分数可涨 15–40 点——未来架构需要「从流里抽关键帧」而不只是堆 token
4. **连续追问与主动输出暴露交互缺口**：SQA 需要解析「上一问提到的实体」；PO 需要精确到秒——产品 claim「实时助手」至少应披露这两项
5. **人类 92% vs 模型 67% 说明在线场景仍早**：直播解说、安防告警、会议同传等应用不能只看离线 leaderboard

## 延伸阅读

- 论文 PDF：[arXiv 2411.03628](https://arxiv.org/abs/2411.03628)
- 项目主页：[streamingbench.github.io](https://streamingbench.github.io/)
- 代码与数据：[GitHub THUNLP-MT/StreamingBench](https://github.com/THUNLP-MT/StreamingBench)
- Hugging Face 数据集：[mjuicem/StreamingBench](https://huggingface.co/datasets/mjuicem/StreamingBench)
- 并列离线 benchmark：[[mlvu-2024]]、[[lvbench-2024]] —— 测「看完再答」上限，与 StreamingBench 互补
- [[moviechat-2024]] —— 流式记忆架构先驱；论文附录对照 VideoLLM-online 等在线模型在 StreamingBench 上仍偏弱

## 关联

- [[mlvu-2024]] —— 离线长视频九类任务大考；MLVU 测「全片理解」，StreamingBench 测「播到一半就被问」
- [[lvbench-2024]] —— 极端时长离线 benchmark；与 StreamingBench 的在线交互轴形成正交
- [[moviechat-2024]] —— 双层记忆处理小时级流；StreamingBench 是检验这类架构是否真「在线」的标尺
- [[grounded-videollm-2024]] —— 时间定位增强；StreamingBench 的 Concurrent/Subsequent 线索同样需要精确时刻对齐
- [[sharegpt4video-2024]] —— 高质量视频 caption 数据；StreamingBench 部分视觉题用 GPT-4o 辅助生成后再人工校验
- [[video-chatgpt-2023]] —— 早期 VideoQA 范式；StreamingBench 把「问在片尾」推进到「问在任意秒」
- [[lmms-eval]] —— 统一跑分框架；社区可封装 StreamingBench 子任务便于复现 Table 2
- [[video-understanding]] —— 专题枢纽；流式理解是 2025 路线图里的独立分支
- [[tempcompass-2024]] —— 专测时序微粒度；StreamingBench 的 PR/ACP 偏宏观动作与预测，二者细-粗互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[flash-vstream-2024]] —— Flash-VStream — STAR 双进程记忆的低延迟长流理解
- [[grounded-videollm-2024]] —— Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM
- [[livevlm-2025]] —— LiveVLM — 免训练流式视觉 token 压缩
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[lvbench-2024]] —— LVBench — 平均 68 分钟、六维能力的长视频极限考
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[sharegpt4video-2024]] —— ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[videollm-online-2024]] —— VideoLLM-online — 流式视频对话的 LIVE 框架

