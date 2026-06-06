---
title: VTG-LLM — 绝对时间 token + VTG-IT-120K，让 Video LLM 精确定位时刻
来源: 'Guo et al., "VTG-LLM: Integrating Timestamp Knowledge into Video LLMs for Enhanced Video Temporal Grounding", AAAI 2025'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

VTG-LLM 是阿里巴巴达摩院等团队 2024 年 5 月发布（AAAI 2025 收录）的**视频时序定位大模型**：在 InstructBLIP 式 Video LLM 骨架上，把「第几秒发生」拆成三块工程——**视觉 token 注入绝对时间嵌入**、**词表里新增绝对时间 token**、**slot 压缩让更多帧进 LLM**——并配套重标数据集 **VTG-IT-120K**（12 万条指令、4.72 万视频）。

日常类比：[[vtimellm-2023]] 像用 0–99 号胶片格标区间——格数固定，电影越长每格代表的秒数越大，边界越糊。VTG-LLM 像剪辑软件时间轴：永远用「分:秒.小数」六位数字写法（如 120.5 秒写成 ⟨t1⟩⟨t2⟩⟨t0⟩⟨tdot⟩⟨t5⟩），**精度不随片长变粗**；同时每帧视觉特征旁贴「这是第几秒拍的」小标签（sequence-time embedding），模型读画面时就知道自己在时间轴哪一格。

论文覆盖 **Moment Retrieval、Dense Captioning、Video Summarization、Highlight Detection** 四类 VTG 任务，零样本在 Charades-STA、[[qvhighlights-2021]]、YouCook2 上超过同期 7B Video LLM。

## 为什么重要

不理解 VTG-LLM，下面这些事容易误判：

- 为什么相对时间 token（帧 ID / 0–300 档）在长视频上 IoU 掉得快——量化误差随片长线性放大；绝对时间 token 把「写秒数」和「写普通数字」分开，还能用 LLM 预训练里的数字嵌入初始化
- 为什么只在输出端加时间戳不够——[[vtimellm-2023]] 主要靠文本 `from 12 to 34`；VTG-LLM 证明 **视觉 token 也要带绝对秒数嵌入**，否则采样不均匀时长视频时模型猜不准帧对应时刻
- 为什么 VTG 专用数据质量比规模更关键——TimeIT 等源标注噪声大、任务极不平衡；VTG-IT-120K 用 Gemini 1.5 Pro 重标 5.19 万条，四任务配比更均衡
- 为什么 2024–2025 VTG-LLM 路线会和 DETR 路线（QVHighlights）长期并存——前者零样本多任务、后者专模 SOTA；QVHighlights mAP / HIT@1 仍是检验 Video LLM 会不会「按查询找高光」的硬榜

## 核心要点

1. **Sequence-Time Embedding（序列 + 绝对时间双嵌入）**：对 N 帧各 M 个视觉 token，做 $\hat{z}_{i,j} = z_{i,j} + W_s[i] + W_t[t]$——$W_s$ 表帧序，$W_t[t]$ 表该帧**绝对秒数**。$W_t$ **全零初始化**，避免破坏预训练视觉特征；测试时对未见过的秒数做相邻训练时刻的线性插值。类比：不只给每张照片编号，还在背面印「拍摄于 02:15」。

2. **Absolute-Time Tokens（11 个专用时间 token）**：词表加数字 ⟨t0⟩…⟨t9⟩ 与 ⟨tdot⟩；**所有时间戳固定 6 token**（不足补零），如 120.5 秒 → ⟨t0⟩⟨t1⟩⟨t2⟩⟨t0⟩⟨tdot⟩⟨t5⟩。嵌入与 LM head 用同名普通数字 token 初始化，继承 LLM 已有算术感。对比相对 token：1 小时片与 30 秒片精度一致，避免 [[grounded-videollm-2024]] 式 300 档在长片上变粗。

3. **Slot-Based Token Compression**：借鉴 SoftMoE，可学习 dispatcher $\Phi \in \mathbb{R}^{K \times d}$ 把任意多视觉 token 软混合成 **K=256** 个 slot 再送投影层——只训一个矩阵，比 cross-attention 压缩更省数据。训练时视频均分 96 段、每段随机抽 1 帧；测试均匀采 96 帧。类比：上百张剧照先收成 256 张「主题拼图」，再塞进 LLM 上下文。

4. **VTG-IT-120K 四任务指令集**：在 TimeIT 上扩展并重标——Moment Retrieval 63.2K、Dense Captioning 37.2K、Summarization 15.2K、Highlight Detection 3.9K；16K 条来自 YT-Temporal-180M 经 Gemini 重标。与 9.7 万 Valley 样本混训，统一 QA 格式、答案含格式化时间戳以利任务间知识迁移。

## 实践案例

### 案例 1：绝对时间 token 输出长什么样

```
USER:  [96帧视频] + "When does the person open the door?"

ASSISTANT:
  The person opens the door from ⟨t0⟩⟨t0⟩⟨t1⟩⟨t2⟩⟨tdot⟩⟨t3⟩
  to ⟨t0⟩⟨t0⟩⟨t1⟩⟨t5⟩⟨tdot⟩⟨t8⟩.

解读：
  - ⟨t0⟩⟨t0⟩⟨t1⟩⟨t2⟩⟨tdot⟩⟨t3⟩ → 01.23 秒（六位固定格式，前导零保留）
  - ⟨t0⟩⟨t0⟩⟨t1⟩⟨t5⟩⟨tdot⟩⟨t8⟩ → 01.58 秒
  - 不用 LLM 逐字符拼 "1.23" 普通 token，避免与文本数字语义打架
```

### 案例 2：零样本主榜数字（论文 Table 1，7B）

```
任务 / 数据集          指标                    VTG-LLM    VTimeLLM   TimeChat
─────────────────────────────────────────────────────────────────────────
YouCook2 DVC          F1（时间定位）           17.5       9.1        12.6
                      SODA_c                  1.5        1.0        1.2
Charades-STA MR       R@1, IoU=0.5            33.8       27.5       32.2
                      R@1, IoU=0.7            15.7       11.4       13.4
QVHighlights HD       mAP                     16.5       —          14.5
                      HIT@1                   33.5       —          23.9

读法：R@0.7 / F1 看边界精度；QVHighlights 同时报 mAP（排序）与 HIT@1（最高分 clip 是否命中）
```

### 案例 3：用官方仓库跑推理（概念命令）

```bash
git clone https://github.com/gyxxyg/VTG-LLM
cd VTG-LLM

# 依赖 EVA-CLIP ViT-G/14 + InstructBLIP Qformer + LLaMA-2-7B 权重
# 见 README 下载 checkpoint

python inference.py \
  --video_path demo.mp4 \
  --query "Find when the chef adds salt." \
  --num_frames 96

# 期望：答案含 ⟨t*⟩ 绝对时间 token 区间，而非纯浮点文本
# Charades-STA 零样本 R@0.5≈33.8，强于同规模通用 Video LLM
```

## 踩过的坑

1. **绝对时间嵌入随机初始化会崩**：消融「TE Random Initialize」Charades R@0.5 从 33.8 跌到 21.4——必须零初始化 $W_t$，依赖预训练视觉通路。

2. **时间 token 不固定六位格式会伤定位**：「Time Token not Formatted」R@0.5 27.0 vs 完整版 33.8——长短不一的 token 序列让 LLM 难学对齐。

3. **时间 token 与字幕质量有 trade-off**：「No Time Token」SODA_c 略升但 R@0.7 掉——专精定位会轻微牺牲叙事流畅度，产品要按任务选 checkpoint。

4. **只用 TimeIT 不换 VTG-IT-120K**：数据消融 QVHighlights HIT@1 19.1 vs 33.5——低质量源标注和任务失衡会直接拉垮高光检测。

5. **slot 数不是越大越好**：K=256 是论文默认；entropy / diverse sampling 等替代压缩在 Charades 上明显弱于 slot——别为省参随意换成未验证的 pooling。

## 适用 vs 不适用场景

**适用**：
- 需要 **零样本** 同时做 MR / DVC / 摘要 / 高光四类 VTG（一条模型多任务）
- 长视频（可达 1 小时+）上要 **恒定秒级精度**，相对帧号或 300 档 token 不够用时
- 在 [[qvhighlights-2021]]、Charades-STA、YouCook2 上与 TimeChat / VTimeLLM 对标
- 已有 InstructBLIP / Video-LLaMA 管线，想 **轻量加时间嵌入 + 绝对 token** 而非重训 DETR 头

**不适用**：
- 纯短视频全局 QA、不关心秒级定位——[[video-llava-2024]] 更轻
- 空域框级 grounding（谁在画面哪一角）——VTG-LLM 只做时间轴
- 实时低延迟流式——96 帧 + Qformer + 256 slot 离线算力不低
- 非英文查询为主——训练标注以英文 VTG 源为主，跨语言需额外指令数据

## 历史小故事（可跳过）

- **2024-05**：arXiv 2405.13382 上传；提出绝对时间 token + sequence-time embedding + slot 压缩三板斧
- **2024 同期**：与 VTimeLLM、TimeChat、Momentor、Grounded-VideoLLM 并发探索「Video LLM + VTG」；VTG-LLM 强调 **视觉侧注入秒数** 与 **数字 token 初始化**
- **2024 数据线**：基于 TimeIT 扩展 VTG-IT-120K，Gemini 1.5 Pro 重标 YT-Temporal 子集，缓解源标注冗长离题
- **2025**：AAAI 2025 正式发表；代码释出 [gyxxyg/VTG-LLM](https://github.com/gyxxyg/VTG-LLM)
- **评测位势**：零样本 Charades R@0.5 33.8、QVHighlights HIT@1 33.5，证明专用 VTG 训练不必牺牲多任务切换

## 学到什么

1. **时间知识要同时写在视觉 token 和输出 token 里**——只改 decoder 吐秒数，encoder 不知道帧对应哪一秒，长片定位仍会漂
2. **绝对时间 token + 数字嵌入初始化** 是兼顾精度与预训练迁移的务实方案，比从零学相对档 token 更稳
3. **VTG 数据质量 > 盲目堆量**——5 万条 Gemini 重标带来的 QVHighlights 增益，说明清洗比再爬 10 万噪声 caption 值钱
4. **slot 压缩让「多帧 VTG」在固定上下文内可行**——比简单均匀抽帧更能保留运动细节，且比 cross-attention 压缩更省训练样本
5. **零样本多任务与专模 DETR 互补**——[[qvhighlights-2021]] 的 Moment-DETR 仍是专模强基线；VTG-LLM 适合「一个聊天模型顺带定位」的产品形态

## 延伸阅读

- 论文 PDF：[arXiv 2405.13382](https://arxiv.org/abs/2405.13382)
- AAAI 2025：[OJS 正式版](https://ojs.aaai.org/index.php/AAAI/article/view/32341)
- 官方代码：[gyxxyg/VTG-LLM](https://github.com/gyxxyg/VTG-LLM)
- 数据集脉络：TimeIT（Ren et al. 2023）、YT-Temporal-180M
- [[vid-llm-survey-2023]] —— 综述 VTG 与 Video LLM 交界；VTG-LLM 是 2024 绝对时间 token 代表
- [[grounded-videollm-2024]] —— 离散相对时间 token 路线，可与本文绝对秒数方案对照

## 关联

- [[vtimellm-2023]] —— 同期边界感知三阶段；用帧号 00–99 而非绝对秒 token，VTG-LLM 补长片量化误差
- [[qvhighlights-2021]] —— 高光 + moment 双任务 benchmark；VTG-LLM 零样本 mAP/HIT@1 主测集之一
- [[grounded-videollm-2024]] —— 双流 + 300 相对时间 token；与 VTG-LLM 绝对六位 token 形成对照
- [[video-chatgpt-2023]] —— 传统 Video LLM 基线；VTG 任务上 F1 / R@0.5 远低于 VTG-LLM
- [[video-llava-2024]] —— 通用视频理解；缺显式时间戳机制，VTG 需专用模型
- [[internvideo]] —— 更强视频 encoder 能否进一步抬 VTG 上限的上游问题
- [[lmms-eval]] —— 部分 VTG 与 Video LLM 统一评测入口
- [[tempcompass-2024]] —— 细粒度时序理解专测；与 VTG「定位区间」能力互补
- [[video-understanding]] —— 专题枢纽；VTG-LLM 属 Video LLM 接时序定位主线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[grounded-videollm-2024]] —— Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[mlvtg-2025]] —— MLVTG — MambaAligner + 冻结 LLM 提纯的多模态视频时序定位
- [[qvhighlights-2021]] —— QVHighlights — 用自然语言查询在视频里找精彩瞬间
- [[spacevllm-2025]] —— SpaceVLLM — 一个 MLLM 同时做时序定位、图像指代与时空管定位
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[trace-2024]] —— TRACE — 用因果事件链同时输出时间、精彩度与描述
- [[uvtg-mllm-2025]] —— UniTime — 生成式 MLLM 做通用视频时序定位
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[vtimellm-2023]] —— VTimeLLM — 让 Video LLM 学会标出事件起止时间

