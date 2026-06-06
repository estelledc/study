---
title: LiveVLM — 免训练流式视觉 token 压缩
来源: 'Li et al., "LiveVLM: Efficient Online Video Understanding via Streaming Visual Token Compression", arXiv 2025'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 高级
provenance: manual-read
---

## 是什么

**LiveVLM** 是 2025 年提出的**在线视频理解加速框架**：在不重训 MLLM 的前提下，用 **VSB（Visual Stream Buffer）** 压缩滚动视觉 KV cache，配合 **PaR（Patch-wise Retrieval）** 按问题检索相关历史 patch，让 [[llava-onevision-2024]] 等现成模型能以接近实时的速度处理长视频流。

日常类比：把 LLM 的视觉记忆想成越来越厚的相册。LiveVLM 是**智能相册管家**——旧页缩略成贴纸，问「刚才那辆车」时再按页码翻回高清，不用每次从第一页重翻。

继承 [[videollm-online-2024]] 的在线设定，但主打 **plug-and-play**：换压缩策略即可，不必端到端重训。

## 为什么重要

不理解 LiveVLM，「已有 MLLM 怎么做直播」会误以为必须等新模型：

- **免训练降低落地门槛**：企业已有 Qwen2-VL / LLaVA-OneVision 权重，可加 VSB 层上线
- **KV cache 是流式瓶颈**：视觉 token 数随时间线性涨；压缩直接减显存和 attention 成本
- **PaR 把检索与生成解耦**：问句 embedding 检索历史 patch，比全历史 attention 便宜
- **与 STAR / LIVE 形成三代流式对照**：训练式记忆 vs 免训练 buffer 管理

## 核心要点

1. **VSB 流式缓冲压缩**：维护固定大小视觉 KV；新帧进入时，按重要性或相似度合并/驱逐旧 token。类比：手机相册「相似照片」自动折叠，只留代表图。

2. **PaR 按 patch 检索**：用户提问编码为 query 向量，在 buffer 索引里找 Top-K 历史 patch，再与当前帧一起送 LLM。跨时间回忆不靠全量 context，而靠检索命中。

3. **兼容 LLaVA-OneVision 等开源权重**：论文在 OneVision 上报告流式场景 latency 与准确率 trade-off，证明框架模型无关（同族架构）。

## 实践案例

### 案例 1：VSB 插入现有推理栈

```python
# 概念层（伪代码）
from livevlm import VSBWrapper, PaRRetriever

base_model = load_llava_onevision("llava-hf/LLaVA-OneVision-7B")
stream = VSBWrapper(base_model, buffer_tokens=2048, merge_policy="similarity")

retriever = PaRRetriever(stream.memory_index)

for frame in video_stream:
    stream.push(frame)
    if user_asked(q):
        hits = retriever.search(q, k=32)
        answer = base_model.generate(
            current=stream.current_tokens(),
            retrieved=hits,
            question=q,
        )
```

无需 `fine_tune()`；调 `buffer_tokens` 与 `merge_policy` 即可。

### 案例 2：压缩率 vs 准确率（示意）

```text
Buffer 上限        StreamingBench 准确率    首 token 延迟
无压缩 8K tok      基准 100%               很高（线性涨）
VSB 4K             ~92%                    -40% latency
VSB 2K + PaR       ~88%                    -60% latency

运动剧烈流：相似度合并宜保守，否则 PaR 也检索不到关键帧
```

### 案例 3：与训练式流式模型选型

```text
已有 OneVision / Qwen2-VL 部署  → LiveVLM 外挂最快
从零做直播产品、可训数据        → VideoLLM-online / Flash-VStream
小时级离线精读                  → [[internvideo2-5-2025]] / [[qwen2-vl-2024]]
```

上线前建议在 [[streamingbench-2024]] 上扫「多时间点 + 不同 buffer 上限」网格搜索，找到 latency–准确率拐点再写进 SLA。

## 踩过的坑

1. **相似度合并在快动作场景失效**：体育、游戏要改用重要性评分或提高 buffer 下限。

2. **PaR 检索 miss 时模型胡编**：应检测低相似度回退「我不确定刚才画面」。

3. **与文本 KV 混管要小心**：只压视觉 cache；误压文本会丢对话历史。

4. **不同 MLLM 的 patch 粒度不同**：VSB 超参不能跨模型直接拷贝，需小规模校准。

## 适用 vs 不适用场景

**适用**：
- 已有 [[llava-onevision-2024]] / [[qwen2-vl-2024]] 权重，要快上流式 demo
- 显存不够撑长流全量 KV 的单卡部署
- 研究 **免训练压缩** vs [[flash-vstream-2024]] 训练式记忆

**不适用**：
- 需要毫秒级极限延迟的硬实时控制（应用小模型 + 专用硬件）
- 无流输入的单次 mp4 问答（直接均匀采帧更简单）
- 模型架构不支持视觉 KV 暴露（需改推理引擎）

## 历史小故事（可跳过）

- **2024**：[[videollm-online-2024]]、[[flash-vstream-2024]] 开启流式 Video-LLM。
- **2025-05**：LiveVLM arxiv 2505.15269，强调 plug-and-play。
- **同期**：[[videochat-flash-2025]] 用 HiCo 训练式压缩争夺长流 SOTA。

## 学到什么

- **流式落地可以先改推理，再改训练**；VSB 是工程捷径。
- **检索式记忆比暴力长 context 更省算力**；PaR 思路可迁移到任何 MLLM。
- **压缩策略必须场景化**；讲座流与体育流不能共用一套 merge 阈值。
- **Serving 层可叠加**：[[vllm-multimodal]] 分页 KV + LiveVLM VSB 在架构上可串联实验。
- **免训练方案适合 A/B**：同一权重开/关 VSB 即可量化产品收益，无需重训。
- **PaR 检索失败要有兜底话术**：低相似度时应拒绝回答，避免流式场景幻觉放大。

## 延伸阅读

- 论文 PDF：[arXiv:2505.15269](https://arxiv.org/abs/2505.15269)
- 前驱：[[videollm-online-2024]]
- 基座：[[llava-onevision-2024]]
- 对照：[[flash-vstream-2024]]、[[videochat-flash-2025]]
- 评测：[[streamingbench-2024]]

## 关联

- [[videollm-online-2024]] —— 在线 LIVE 框架前驱
- [[llava-onevision-2024]] —— 论文主要实验基座
- [[flash-vstream-2024]] —— STAR 训练式流式对照
- [[streamingbench-2024]] —— 多时间点流式评测
- [[qwen2-vl-2024]] —— 可外挂 VSB 的工业 MLLM
- [[vllm-multimodal]] —— Serving 层可结合 KV 管理



> 维护提示：
- 训练 I/O 默认对照 [[decord]]；评测迁移可试 [[torchcodec]]（lmms-eval v0.7+）。
- 与 [[vid-llm-survey-2023]] 范式分类对照阅读，避免孤立记模型名。
- 候选队列维护见 `research/papers-video-understanding.md`，站内 slug 以 atlas 为准。
- 长视频与流式子题见专题站 `/stations/video-understanding/` 分阶段表。
- 报分请注明采帧数、模态（video / av）与解码后端，便于跨论文对比。
- 工程对照项目见 [[decord]]、[[lmms-eval]]、[[videochat2]] 等专题笔记。
- 与专题阅读站 [[video-understanding]] / stations 路线图对照，避免候选表与站内 slug 脱节。
发版前用 [[lmms-eval]] 或官方脚本复现文中数字；pinned 依赖以各仓库 README 为准。
## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chapter-llama-2025]] —— Chapter-Llama — 语音引导采帧，一小时视频一次前向切章节
- [[flash-vstream-2024]] —— Flash-VStream — STAR 双进程记忆的低延迟长流理解
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[llmvs-2025]] —— LLMVS — 用 LLM 语义裁判给视频帧打分做摘要
- [[qwen2-5-vl-2025]] —— Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解
- [[traveler-2024]] —— TraveLER — 四段式多 Agent，帧级问答看懂长视频
- [[videoagent-memory-2024]] —— VideoAgent（Fan）— 双记忆 + 四工具，长视频逼近 Gemini
- [[videollama3-2025]] —— VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
- [[videollm-online-2024]] —— VideoLLM-online — 流式视频对话的 LIVE 框架

