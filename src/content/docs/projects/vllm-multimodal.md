---
title: vLLM Multimodal — 多模态与视频 URL 高吞吐推理服务
description: vLLM 0.6+ 多模态引擎；Qwen2.5-VL 视频理解、video_url/base64 输入、PagedAttention 复用与 OpenAI 兼容 API
来源: 'https://github.com/vllm-project/vllm'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

**vLLM Multimodal** 指 vLLM 推理引擎在文本 LLM 之外扩展的**图像 / 视频 / 音频多模态 serving 能力**：在保留 PagedAttention 与 Continuous Batching 的前提下，把视觉编码器与 LLM 拼成可并发服务的统一 worker。与 [[vllm]] 主笔记聚焦「纯文本 KV cache」不同，本篇关注 **Qwen2.5-VL 等模型的 `video_url` 入参、显存预算与多模态批处理**。

日常类比：普通 [[vllm]] 像高速公路专跑小轿车；Multimodal 版在同一条路上加**集装箱检查通道**——每辆车（请求）可能多带一截视频像素，调度器要同时算「视觉 token 占多少块」和「文本生成占多少 KV」。

典型启动：

```bash
pip install "vllm>=0.6.0"
vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
  --max-model-len 32768 \
  --limit-mm-per-prompt video=1 \
  --gpu-memory-utilization 0.9
```

## 为什么重要

不理解 vLLM 多模态层，Video-LLM 很难从 Gradio demo 迁到生产：

- **吞吐与延迟**：同一套 PagedAttention 复用到视觉 token，并发视频 QA 比 HuggingFace `generate` 循环高一个数量级
- **OpenAI 兼容多模态消息**：`messages[].content[]` 支持 `type: video_url`，现有聊天客户端可少改接入
- **与 HF 权重互通**：直接 `vllm serve Qwen/...`，不必另写 [[accelerate]] + Processor 推理脚本
- **评测到 serving 闭环**：[[lmms-eval]] 测完的模型，同一权重可 `vllm serve` 上线 A/B

## 核心要点

1. **MMEncoder 与 LLM 同进程**：视觉塔在 worker 内编码视频为 embedding，再注入语言模型；显存 = 权重 + 视觉激活 + KV cache，需 `--gpu-memory-utilization` 留余量。

2. **`limit-mm-per-prompt`**：限制每条请求 attachments 数量（如 `image=2,video=1`），防止单请求吞掉整卡显存拖死批次。

3. **视频输入形态**：支持 HTTP `video_url`、本地路径（部署配置允许时）、base64；内部仍走解码 → 帧采样 → 视觉 token，与 [[qwen2-vl-2024]] 训练契约对齐。

4. **与纯文本 vLLM 的差异**：Continuous Batching 要感知「预填充阶段视觉算力」；视频请求 prefill 更慢，调度策略影响尾延迟。

## 实践案例

### 案例 1：OpenAI 兼容 API 传 video_url

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-VL-7B-Instruct",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "video_url", "video_url": {"url": "https://example.com/demo.mp4"}},
        {"type": "text", "text": "用三句话描述视频主线"}
      ]
    }],
    "max_tokens": 256
  }'
```

`video_url` 需服务侧能访问；内网文件可改本地静态服务或先 [[ffmpeg]] 切片缩短 prefill。

### 案例 2：Python 客户端与多模态消息

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="Qwen/Qwen2.5-VL-7B-Instruct",
    messages=[{
        "role": "user",
        "content": [
            {"type": "video_url", "video_url": {"url": "file:///data/clip.mp4"}},
            {"type": "text", "text": "视频中人物在做什么？"},
        ],
    }],
    max_tokens=128,
)
print(resp.choices[0].message.content)
```

与纯文本 [[vllm]] 相同，只改 `messages` 结构；适合从 GPT-4V 迁移的代码路径。

### 案例 3：限制视觉附件防 OOM

```bash
vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
  --tensor-parallel-size 2 \
  --max-model-len 16384 \
  --limit-mm-per-prompt '{"image":2,"video":1}' \
  --enforce-eager
```

长视频 + 高分辨率会撑爆 prefill；`enforce-eager` 便于调试 CUDA graph 与多模态 shape 问题，稳定后再关。

## 踩过的坑

1. **视频 URL 不可达**：容器内 `localhost` 指向自身；应传服务可下载的 HTTP 地址或挂载卷路径。

2. **显存估算仍按文本思维**：一段 5 分钟 1080p 视频的视觉 token 远超短文本，单卡 24G 易 OOM——先裁短或降分辨率。

3. **模型版本与 vLLM 版本配对**：Qwen2.5-VL 需较新 vLLM；升级后 API 字段可能变，查 release note 再上线。

4. **`max-model-len` 含视觉 token**：设过大导致 KV 预留失败；按业务最长对话 + 视觉预算反推。

5. **与 [[decord]] 无直接关系**：serving 端解码在 vLLM 内部；训练侧用 decord 不代表线上路径相同，时长截断策略要单独验。

## 适用 vs 不适用场景

**适用**：
- 生产环境部署 Qwen2-VL / Qwen2.5-VL 视频问答
- 高并发多用户视频 chat API
- 从 OpenAI 多模态接口迁移到自托管
- 需要与纯文本模型共用同一 serving 集群

**不适用**：
- 研究训练与梯度更新（用 [[pytorch]] + [[videollama2]] 等训练脚本）
- 极低延迟首 token 且视频极长（考虑预切片或专用检索 [[long-video-retrieval-2023]]）
- 模型不在 vLLM 多模态支持列表（查官方 compatibility matrix）
- 只需本地 [[gradio]] demo 验证想法

## 历史小故事（可跳过）

- **2023**：vLLM 以 PagedAttention 文本 serving 成名（见 [[vllm]] 主笔记）
- **2024 中**：多模态 PR 合入，LLaVA 类模型率先支持
- **2024 末**：Qwen2-VL 成为文档主推视频模型
- **2025**：Qwen2.5-VL + `video_url` API 稳定，与 OpenAI 消息格式对齐

## 学到什么

1. **多模态 serving 的瓶颈常在 prefill 视觉编码，不在 decode**
2. **`limit-mm-per-prompt` 是生产防炸卡护栏**
3. **与 HF Processor 共用权重，但线上解码路径独立验证**
4. **OpenAI 消息格式是接入成本最低的迁移路径**
5. **读 [[vllm]] 懂 KV，读本篇懂视觉 token 与并发放不下**

## 延伸阅读

- vLLM 文档：Multimodal Inputs / Supported Models
- [[vllm]] —— PagedAttention 与文本 serving 基础
- [[qwen2-vl-2024]] —— 主流 served 模型之一
- [[accelerate]] —— HF 侧多卡 Processor 推理对照

## 关联

- [[vllm]] —— 文本推理引擎根基
- [[qwen2-vl-2024]] —— 核心 served 模型
- [[decord]] —— 训练采帧（与 serving 路径对照）
- [[ffmpeg]] —— 上线前视频裁切转码
- [[lmms-eval]] —— 上线前基准对照
- [[gradio]] —— 研究 demo vs 生产 serving
- [[videollama2]] —— 训练管线对照
- [[pytorch]] —— 训练与调试
- [[accelerate]] —— HF 侧多卡推理对照
- [[long-video-retrieval-2023]] —— 超长视频替代架构
- [[tempcompass-2024]] —— 时序能力评测
- [[videomme-2024]] —— 视频综合 benchmark

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[livevlm-2025]] —— LiveVLM — 免训练流式视觉 token 压缩
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解

