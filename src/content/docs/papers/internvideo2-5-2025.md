---
title: InternVideo2.5 — 长富上下文 + HiCo 层次压缩
来源: 'Wang et al., "InternVideo2.5: Empowering Video MLLMs with Long and Rich Context Modeling", arXiv 2025'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 高级
provenance: manual-read
---

## 是什么

**InternVideo2.5** 是上海 AI Lab OpenGVLab 2025 年发布的视频 MLLM：在 [[internvideo2-2024]] 基础上，用 **LRC（Long and Rich Context）** 训练把有效视频记忆扩到约 **6×**，配合 **HiCo（Hierarchical Compression）** 层次 token 压缩和 **TPO（Temporal Preference Optimization）** 对齐长视频推理偏好。

日常类比：普通 Video-LLM 像只能记住预告片的观众；InternVideo2.5 像带**分层笔记**的剧评人——远景用章节摘要，近景保留台词细节，还能用偏好学习纠正「跳段漏剧情」的毛病。

实现与权重在 [[internvideo]] 仓库 `InternVideo2.5/` 子目录；NIAH（needle-in-a-haystack）长视频探针上报告约 6 倍记忆跨度提升。

## 为什么重要

不理解 InternVideo2.5，长视频 MLLM 的「工业开源」脉络会缺关键一环：

- **LRC 是数据+训练联合扩上下文**：不只改 RoPE 长度，还用长视频指令数据教模型「何时细读、何时略读」
- **HiCo 与 VideoChat-Flash 的 HiCo 同名不同构**：都是层次压缩，但 InternVideo2.5 嵌在 InternVideo encoder–LLM 接口层
- **TPO 针对长视频偏好**：比通用 RLHF 更关注时间顺序、因果链，减少「看了后面忘前面」
- **与 [[videollama3-2025]]、[[qwen2-vl-2024]] 构成 2025 长视频三甲对照**

## 核心要点

1. **LRC 长富上下文训练**：混合短视频精细标注 + 长视频稀疏标注 + 合成长上下文样本，让 8B Chat 在训练阶段就见过数千 token 级视觉输入，而不是推理时硬外推。

2. **HiCo 层次压缩**：帧 token 先局部池化成 clip 级 token，再按语义重要性递归合并。类比：先写段落小标题，再合并成章节标题，LLM 读的是「目录+关键段落」而非原始逐帧流。

3. **TPO 时间偏好优化**：用模型在长视频 QA 上的时序错误作为负样本，优化「先因后果」的回答顺序；与 DPO 类似但奖励函数强调时间一致性。

## 实践案例

### 案例 1：加载 InternVideo2.5-Chat-8B

```python
# 路径以 OpenGVLab/InternVideo 仓库 README 为准
from internvideo2_5 import InternVideo2_5_Chat, load_pretrained

model = load_pretrained("OpenGVLab/InternVideo2.5-Chat-8B")
response = model.chat(
    video_path="documentary_40min.mp4",
    question="主角在第三段为什么改变决定？",
    max_frames=512,
    use_hico=True,
)
print(response)
```

`use_hico=True` 开启层次压缩；长片建议配合 [[decord]] 按索引批量取帧。

### 案例 2：NIAH 记忆跨度（论文量级概念）

```text
探针：在 2 小时视频中插入唯一「needle」画面，问其内容

InternVideo2-Chat-8B（无 LRC）   可稳定回忆 ~15min 跨度
InternVideo2.5 + HiCo + LRC       ~6× 提升（约 90min 量级，依设置而异）

说明：扩上下文不只是位置编码，训练数据必须含长程依赖样本
```

### 案例 3：与竞品长视频策略对照

| 方法 | 核心手段 | 开源栈 |
|------|---------|--------|
| InternVideo2.5 | LRC + HiCo + TPO | [[internvideo]] |
| VideoChat-Flash | HiCo ~1/50 压缩 | 论文仓 |
| Qwen2-VL | M-RoPE + 动态分辨率 | [[qwen2-vl-2024]] |
| VideoLLaMA 3 | NaViT + 相似度压缩 | [[videollama3-2025]] |

读长视频论文时建议固定「同一 clip + 同一问法」在 2 / 2.5 / Qwen2-VL 上各跑一遍；只看 leaderboard 数字很难感知 LRC 带来的「回忆跨度」差异。

## 踩过的坑

1. **8B = 1B encoder + 7B LLM**：显存瓶颈常在视觉 token 而非 LLM；盲目加大 LLM 不换压缩策略收益有限。

2. **HiCo 与帧率耦合**：低 fps + 强压缩会抹掉快动作；体育类视频要提高基础采帧率再压缩。

3. **TPO 数据未全开源**：完全复现偏好对齐阶段可能缺官方负样本构造脚本，只能复现推理 + 部分微调。

4. **与 InternVideo2 权重部分共享**：换 2.5 时要确认 encoder 版本匹配，混用 2/2.5 checkpoint 会 shape 报错。

## 适用 vs 不适用场景

**适用**：
- 30–90 分钟纪录片、课程、会议录像 QA
- 需要**开源全栈**（数据说明 + 训练 + Chat）的研究组
- 与 [[lvbench-2024]]、[[longvideobench-2024]] 对齐的长视频评测

**不适用**：
- 实时流式（用 [[livevlm-2025]]）
- 纯短视频 &lt;2min（[[videollama2-2024]] 更轻）
- 无 GPU 集群的个人笔记本端到端预训练 LRC 全量

## 历史小故事（可跳过）

- **2024**：[[internvideo2-2024]] 8B Chat，生成+判别联合缩放。
- **2025-01**：InternVideo2.5 arxiv 2501.12386，主打长富上下文。
- **2025**：InternVideo-Next 等后续版本在 [[internvideo]] 共存，形成多代目录。

## 学到什么

- **长视频能力 = 压缩 × 训练数据 × 偏好对齐**，单靠 RoPE 外推不够。
- **层次压缩是 2025 长视频共识**，实现细节决定运动场景上限。
- **开源视频 MLLM 国内主线**：InternVideo 系列与 VideoLLaMA 系列值得双线跟踪。
- **NIAH 探针应进回归套件**：发版前用 30/60/90 分钟 needle 任务扫一遍，比只看 LVBench 平均分更稳。
- **TPO 揭示「答案对但顺序错」**：长视频 QA 要同时评准确性与时间逻辑。
- **HiCo 不是免费午餐**：压缩率越高，[[vinoground-2024]] 类时序探针越要重跑。

## 延伸阅读

- 论文 PDF：[arXiv:2501.12386](https://arxiv.org/abs/2501.12386)
- 代码：[[internvideo]] `InternVideo2.5/`
- 前作：[[internvideo2-2024]]、[[videoprism-2024]]
- 长视频榜：[[lvbench-2024]]、[[longvideobench-2024]]
- 压缩对照：[[videochat-flash-2025]]

## 关联

- [[internvideo]] —— 官方多代仓库
- [[internvideo2-2024]] —— 直接前作
- [[videoprism-2024]] —— 视频 encoder 基座对照
- [[lvbench-2024]] —— 极端长视频评测
- [[longvideobench-2024]] —— 指代推理长视频榜
- [[qwen2-vl-2024]] —— 工业长视频竞品
- [[decord]] —— 长视频按帧 I/O



> 维护提示：
- 双千进度以 `data/written.txt` 与 atlas 为准，勿手工改计数。
- 训练 I/O 默认对照 [[decord]]；评测迁移可试 [[torchcodec]]（lmms-eval v0.7+）。
- 与 [[vid-llm-survey-2023]] 范式分类对照阅读，避免孤立记模型名。
- 候选队列维护见 `research/papers-video-understanding.md`，站内 slug 以 atlas 为准。
- 长视频与流式子题见专题站 `/stations/video-understanding/` 分阶段表。
- 报分请注明采帧数、模态（video / av）与解码后端，便于跨论文对比。
- 工程对照项目见 [[decord]]、[[lmms-eval]]、[[videochat2]] 等专题笔记。
- 与专题阅读站 [[video-understanding]] / stations 路线图对照，避免候选表与站内 slug 脱节。
发版前用 [[lmms-eval]] 或官方脚本复现文中数字；pinned 依赖以各仓库 README 为准。
- 关联条目使用 `[[slug]]` 格式，build 时由 backlink 脚本补全反向链。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
