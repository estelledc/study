---
title: Hour-LLaVA — 记忆增强，让 LLaVA 读懂一小时视频
来源: 'Lin et al., "Unleashing Hour-Scale Video Training for Long Video-Language Understanding", arXiv 2506.05332'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

Hour-LLaVA 是 AMD 与罗切斯特大学团队在 2025 年提出的**小时级视频理解模型**，论文见 [arXiv 2506.05332](https://arxiv.org/abs/2506.05332)，配套数据集 **VideoMarathon** 与代码仓库 [jylins/hourllava](https://github.com/jylins/hourllava)。它解决的核心矛盾是：长视频 benchmark 已经测到一小时，但主流 Video-LLM 训练数据平均只有几十秒，推理时也只能均匀采 8–64 帧——**训练和测试的「时间尺度」严重错位**。

日常类比：以前的 Video-LLM 像只带便签本进电影院——每场电影只能记 8 张速写，散场后靠这几张猜剧情。Hour-LLaVA 的做法是：先用 1 FPS 把整场电影记在**仓库档案**里（memory repository），再按问题只抽关键片段送进 LLM，同时用 **MemAug（记忆增强）** 模块从档案里「回忆」被压缩掉的信息。LLM 看到的 token 少了，但背后仍连着完整一小时上下文。

技术栈：视觉编码 **SigLIP** + 两层 MLP 投影（沿用 LLaVA 范式）+ **MemAug**（4 层 Transformer，可学习压缩）+ 语言模型 **Qwen2 / Qwen2.5**（3B / 7B）。训练数据核心是 **VideoMarathon**（约 9,700 小时原片、330 万 QA、单条 3–60 分钟）。

## 为什么重要

不理解 Hour-LLaVA，下面这些事说不清：

- 为什么 2025 年长视频榜（Video-MME、LVBench、LongVideoBench）开始逼模型**在训练阶段就见过小时级视频**——测一小时、训一分钟的 gap 会直接体现在 long 档分数上
- 为什么「均匀采 64 帧」对一小时视频几乎等于盲猜——一小时 1 FPS 就有 3,600 帧，固定帧预算下信息损失是数量级问题，不是多采几帧能抹平的
- 为什么 **VideoMarathon** 会成为长视频指令微调的新基准——平均片长 20.9 分钟、最长 60 分钟，比 LLaVA-Video-178K（平均 0.6 分钟）长一个数量级以上
- 为什么开源 7B 模型能在 **LVBench**（平均 4,037 秒）上超过 LLaVA-Video-7B——Hour-LLaVA-7B 在 LVBench 达 45.6，靠的是 MemAug + 专门长视频数据，而不是单纯加帧数

## 核心要点

1. **VideoMarathon：第一条「小时尺度」指令数据管线**：从 Panda-70M、Ego4D、ActivityNet、YouCook2、MovieChat-1K 等源筛 **≥3 个事件** 的长片；用 **Qwen2-VL-7B** 按 1 FPS 写六级 clip caption（时序 / 空间 / 物体 / 动作 / 场景 / 摘要），再用 **DeepSeek-V3** 递归汇总到 event 级与 global 级，最后合成 **22 类任务、330 万** 开放问答与选择题。类比：不是给短视频写一句话简介，而是给连续剧写分集梗概再出题。

2. **MemAug：可学习的「遗忘 + 回忆」**：1 FPS 编码后的全片 token 存入 memory repository；**遗忘机制**在时空各压 1/4，总体约丢掉 94% token 得到 decayed tokens；**MemAug** 用 cross-attention 让 decayed tokens + 问题 token 从仓库里取回与问题相关的全片语义，再送进 LLM。对比手工 keyframe / SlowFast：MemAug 的压缩由**下一 token 预测损失端到端监督**，不是固定启发式。

3. **三阶段训练对齐 LLaVA 主线**：Stage 1 在 LLaVA-OV 图像对上只训 MemAug；Stage 2 混入短视频（LLaVA-Video-178K 等）做视频域适应；Stage 3 在 VideoMarathon 长片上指令微调（每条样本最多 5 轮 QA 对话），vision encoder 冻结、其余可训。Hour-LLaVA-7B 初始化自 **LLaVA-OV-SI-7B**，与 LLaVA 家族一脉相承。

## 实践案例

### 案例 1：Hour-LLaVA 推理（1 FPS + MemAug）

```python
# 官方仓库: https://github.com/jylins/hourllava
from hourllava.model.builder import load_pretrained_model
from hourllava.mm_utils import process_video

model_path = "jylins/Hour-LLaVA-7B"
tokenizer, model, processor, _ = load_pretrained_model(model_path)

# 1 FPS 密集采帧 — 一小时约 3600 帧，全进 memory repository
video_tensor = process_video(
    "lecture_45min.mp4",
    sample_fps=1.0,
    max_duration_sec=3600,
)

response = model.generate(
    input_ids=tokenizer("讲座第 30 分钟左右讲到了什么主题？"),
    video=video_tensor,
    # 送进 LLM 的是经遗忘压缩 + MemAug 增强后的 token
)
```

逐部分解释：`sample_fps=1.0` 保证训练/推理分布一致；用户问「第 30 分钟」时，MemAug 的 cross-attention 偏向该时段仓库特征，而不是均匀 64 帧里碰巧抽到一帧。

### 案例 2：VideoMarathon 与旧数据集的尺度对比

```
数据集对比（论文 Table 1 要点）：

                    总时长    平均片长    时长范围      QA 规模
------------------------------------------------------------------
ShareGPT4Video      0.2K hr   0.3 min    < 2 min       极少
LLaVA-Video-178K    2K hr     0.6 min    < 3 min       ~1.16M
VideoMarathon       9.7K hr   20.9 min   3–60 min      3.3M

关键含义：在 VideoMarathon 上微调后，模型在 LVBench（均长 4037s）
仍有效 —— 训练最长 60 分钟，测试可泛化到 ~67 分钟级 benchmark
```

### 案例 3：MemAug 数据流直觉（伪代码）

```python
# H_v: 1 FPS 全片 token，存入 memory repository
H_v = encode_video_at_1fps(video)          # 例如 T×64 tokens/帧

# 遗忘：时空各 1/4 → 约 1/16 保留
H_decay = forget_spatial(H_v, ratio=1/4)
H_decay = forget_temporal(H_decay, ratio=1/4)

# MemAug：decayed + 问题 query，从 H_v 回忆
H_aug = memaug(
    queries=concat(H_decay, H_question),
    memory_keys_values=H_v,
)

answer = llm_decoder(H_aug, H_question)
# 压缩是硬的，回忆是可学习的 —— 比纯 pooling 更贴问题
```

## 踩过的坑

1. **1 FPS 不是免费午餐**：一小时视频即使用 8×8 pooling，仓库里仍有数千帧特征，显存和 MemAug 计算随片长线性涨——论文用 64 张 MI300X 训 7B，消费级 GPU 往往需要截断时长或降 FPS。

2. **短视频能力需单独验证**：长视频微调后 TempCompass（均长 11s）仍维持 68.1，但不能假设所有短榜都无损——训练配方里混了大量长样本，部署前应用目标时长分布做抽检。

3. **字幕与多模态输入未覆盖**：Video-MME 有字幕档（w/ subtitles）分数更高，但 Hour-LLaVA 框架描述以视觉为主——复现榜单词幕设置时要对齐官方评测脚本，别拿无字幕 checkpoint 硬比有字幕数字。

4. **数据合成链依赖强教师**：VideoMarathon 标注链是 Qwen2-VL + DeepSeek-V3，教师偏见会进 330 万 QA——长片事件切分若错，后续 MC 题答案也会系统性偏。

## 适用 vs 不适用场景

**适用**：
- 需要**小时级**视频问答、纪要、检索式理解（讲座、监控回放、赛事全场）
- 想在 **LLaVA 架构**上扩展长视频，且能接受 MemAug 额外模块
- 研究 **可学习 token 压缩** vs 均匀采帧 / SlowFast 的对比基线
- 需要开源 **VideoMarathon** 规模的长视频指令数据做微调

**不适用**：
- 实时流式视频（论文是离线整段编码进仓库，不是帧级在线增量）
- **音频 / 对白**为主的内容——无音轨分支，电影对白理解应换音视频模型
- 只要**极简 8 帧 demo**、片长 < 1 分钟——用 LLaVA-Video 或 Video-LLaVA 更轻
- 显存极紧的边缘设备——MemAug + 1 FPS 仓库对端侧不友好

## 历史小故事（可跳过）

- **2024 下半年**：Video-MME、LVBench、LongVideoBench、HourVideo 等长视频榜集中发布，把评测时长推到 17 分钟–1 小时量级
- **2025-06**：论文上传 arXiv:2506.05332，同步发布 VideoMarathon 数据集与 Hour-LLaVA 训练代码
- **2025-06**：GitHub [jylins/hourllava](https://github.com/jylins/hourllava) 开源 Hour-LLaVA-3B/7B 权重与数据管线说明
- **NeurIPS 2025**：论文入选 **Spotlight**，长视频训练从「评测先行」进入「数据 + 架构配套」阶段

## 学到什么

1. **训练时长必须向评测时长靠拢**：长视频 SOTA 不只是推理技巧，VideoMarathon 证明「小时级标注数据」是开源模型追上 LVBench 的关键燃料
2. **压缩与回忆要拆开设计**：硬遗忘保算力，可学习 MemAug 保语义——比单一均匀采帧或纯启发式 keyframe 更稳
3. **LLaVA 范式可扩展到小时尺度**：SigLIP + MLP + Qwen2 与 LLaVA-OV 同源，长视频能力靠数据与 MemAug 模块补齐，不必推倒重来
4. **多级 caption 再合成 QA 可规模化**：clip → event → global 三级摘要 + 任务模板，是用强教师模型造长视频指令数据的实用流水线

## 延伸阅读

- 论文 PDF：[arXiv 2506.05332](https://arxiv.org/abs/2506.05332)
- 项目主页：[VideoMarathon](https://videomarathon.github.io/)
- 官方代码：[jylins/hourllava](https://github.com/jylins/hourllava)
- [[llava-video-2024]] —— 同 LLaVA 家族的短视频指令微调与 SlowFast 对照
- [[llama-vid-2023]] —— 另一条长视频路线：每帧双 token 硬压缩
- [[videomme-2024]] —— Hour-LLaVA 主榜之一，long 档时长与采帧对齐必读

## 关联

- [[llava]] —— Hour-LLaVA 继承 MLP 投影 + 视觉指令微调范式，7B 初始化自 LLaVA-OV-SI
- [[llava-video-2024]] —— 短视频合成数据（178K）与 SlowFast；Hour-LLaVA Stage 2/3 仍混用该数据
- [[llama-vid-2023]] —— 长视频双 token 压缩；MemAug 用仓库 + 可学习回忆替代固定压缩
- [[videomme-2024]] —— 论文四大评测之一，Hour-LLaVA-7B 达 63.6% / 70.2%（无字幕 / 有字幕）
- [[internvideo2-2024]] —— 强视频 encoder 预训练路线；Hour-LLaVA 选 SigLIP + 端到端 LMM
- [[qvhighlights-2021]] —— 长片精彩段落检索；与「全片仓库 + 问题导向回忆」形成检索 vs 生成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

