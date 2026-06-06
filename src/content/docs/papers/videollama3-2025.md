---
title: VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
来源: 'Zhang et al., "VideoLLaMA 3: Vision-centric Multimodal Large Language Model", arXiv 2025'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

**VideoLLaMA 3** 是阿里达摩院 2025 年发布的第三代图像/视频统一 MLLM：用 **SigLIP-NaViT 动态分辨率视觉编码**替代固定 336px 输入，配合 **视频 token 相似度压缩**和 **Qwen2.5** 语言后端，在 VideoMME、LVBench 等榜单上以 7B 体量刷到同尺寸前列。

日常类比：[[videollama2-2024]] 像固定镜头的摄像机；VideoLLaMA 3 是**自动变焦 + 智能抽帧**——远景少占像素、近景保留细节，相似帧合并成一条「摘要 token」，同样上下文窗口能塞进更长视频。

官方实现：[[videollama3]]；训练数据含开源 **VL3-Syn7M** 高质量 image-text 对。

## 为什么重要

不理解 VideoLLaMA 3，2025 年 Video-LLM 工程对照会缺「国内最新可复现 SOTA」：

- **动态分辨率是长视频 OOM 的实用解**：固定分辨率模型为保细节会爆 token；NaViT 按内容伸缩，同等显存可看更多帧
- **Vision-centric 四阶段训练**：把视觉对齐、指令微调、视频专项、压缩策略拆成可 ablation 的流水线
- **token 压缩基于帧间相似度**：运动少的片段自动合并，比均匀降采样更保关键帧
- **与 Qwen2-VL 形成国内双雄对照**：一个走原生动态分辨率 API，一个走 VideoLLaMA 系列迭代

## 核心要点

1. **SigLIP-NaViT 动态分辨率**：图像/视频帧按长宽比和语义密度分配 patch 数，不再强行 resize 到正方形。类比：PPT 幻灯片横竖不一，NaViT 给每页「合适字号」而非统一缩印。

2. **视频 token 相似度压缩**：相邻帧 embedding 余弦相似度高于阈值则合并或丢弃冗余 token，在进 LLM 前把序列长度压到预算内。运动剧烈段保留高密度，静态段稀疏化。

3. **四阶段训练**：(1) 视觉-语言对齐 (2) 多模态指令微调 (3) 视频专项数据 (4) 长视频 + 压缩策略联合微调——每阶段可单独替换数据做 ablation。

## 实践案例

### 案例 1：统一 conversation API 推理

```python
import torch
from transformers import AutoModelForCausalLM, AutoProcessor

model_path = "DAMO-NLP-SG/VideoLLaMA3-7B"
processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    model_path, torch_dtype=torch.bfloat16, device_map="auto", trust_remote_code=True
)

conversation = [
    {"role": "user", "content": [
        {"type": "video", "video": {"video_path": "lecture.mp4", "fps": 1, "max_frames": 128}},
        {"type": "text", "text": "总结这段视频的三个要点"},
    ]}
]
inputs = processor(conversation=conversation, return_tensors="pt").to(model.device)
out = model.generate(**inputs, max_new_tokens=512)
print(processor.decode(out[0], skip_special_tokens=True))
```

`fps` / `max_frames` 控制采帧密度；压缩在模型内部按相似度触发。

### 案例 2：固定 vs 动态分辨率 token 预算

```text
输入：10 分钟讲座，均匀 1 FPS → 600 帧

固定 336×336 + 均匀 32 帧采样    ~8K visual tokens（丢大量内容）
VideoLLaMA 3 NaViT + 相似度压缩  ~4K tokens 覆盖更多有效片段

LVBench 67min 子集：7B 动态分辨率比固定分辨率高约 8–12 点（论文报告量级）
```

### 案例 3：Model Zoo 选型

| 型号 | 侧重 | 典型场景 |
|------|------|---------|
| VideoLLaMA3-7B | 图+视频通用 | VideoMME / LVBench 刷榜 |
| VideoLLaMA3-2B | 边缘部署 | 单卡 demo |
| VideoLLaMA3-7B-Image | 图像专项 | 高分辨率 OCR / 图表 |
| VL3-SigLIP-NaViT | 独立视觉塔 | 自定义 LLM 对接 |

部署长视频时建议先用 `max_frames=64` 跑通 [[lvbench-2024]] 子集，再逐步放开 fps；一步拉到 256 帧容易在相似度合并未调优时 OOM。

## 踩过的坑

1. **pinned 版本极严**：`torch==2.4.0` + `flash-attn==2.7.3` + `transformers==4.46.3` 不对就 CUDA kernel 报错或生成乱码。

2. **压缩阈值调太激进会丢动作**：高相似度合并适合讲座/幻灯片，体育快攻场景应提高 `max_frames` 或降低合并强度。

3. **2B 与 7B 训练数据不完全同构**：小模型在长视频榜上的压缩策略收益更小，别用 2B 分数推断 7B 上限。

4. **VL3-Syn7M 需单独申请/下载**：完整 7M 标注不是 `pip install` 自带，预训练复现要预留存储与清洗时间。

## 适用 vs 不适用场景

**适用**：
- 长视频（>5min）理解且显存受限的单卡 7B 部署
- 需要图像+视频**同一 API** 的产品原型
- 研究动态分辨率 vs 固定分辨率的 ablation

**不适用**：
- 实时流式对话（见 [[videollm-online-2024]] / [[livevlm-2025]]）
- 纯文本或纯音频（用大语言模型即可）
- 不想锁死 transformers 旧版本的生产环境

## 历史小故事（可跳过）

- **2023–2024**：[[video-llama-2023]] → [[videollama2-2024]] 建立 STC + 音视频底座。
- **2025-01**：VideoLLaMA 3 arxiv 2501.13106，强调 vision-centric 与 NaViT。
- **2025**：[[videollama3]] 仓库发布，VideoMME / LVBench 7B SOTA 声明。
- **同期**：[[qwen2-vl-2024]] 工业线、[[internvideo2-5-2025]] 长上下文竞品并存。

## 学到什么

- **分辨率应随内容变，不是随模型变**：NaViT 思路可迁移到任何 Video-LLM 数据管线。
- **压缩要语义感知**：均匀丢帧 vs 相似度合并，后者对讲座类长视频更友好。
- **四阶段训练让 ablation 可复现**：对齐、指令、视频、长视频不要一锅炖。
- **7B 刷榜不等于 2B 可部署**：小模型需单独测延迟与 OOM，不能外推。
- **VL3-Syn7M 是独立资产**：即使不训 3 代全文，图像预训练也可单独受益。
- **对比 [[qwen2-vl-2024]] 时要看解码与采帧默认值**：同榜分数可能差在预处理而非模型本体。

## 延伸阅读

- 论文 PDF：[arXiv:2501.13106](https://arxiv.org/abs/2501.13106)
- 官方代码：[[videollama3]]
- 前作：[[videollama2-2024]]
- 长视频榜：[[lvbench-2024]]
- 综合榜：[[videomme-2024]]

## 关联

- [[videollama2-2024]] —— 二代时空 + 音频前作
- [[videollama3]] —— 官方实现仓库
- [[video-llama-2023]] —— 系列开山
- [[qwen2-vl-2024]] —— 工业动态分辨率对照
- [[lvbench-2024]] —— 主要长视频评测
- [[videomme-2024]] —— 短中长综合评测
- [[decord]] —— 训练采帧 I/O



> 维护提示：
- 工程对照项目见 [[decord]]、[[lmms-eval]]、[[videochat2]] 等专题笔记。
- 与专题阅读站 [[video-understanding]] / stations 路线图对照，避免候选表与站内 slug 脱节。
发版前用 [[lmms-eval]] 或官方脚本复现文中数字；pinned 依赖以各仓库 README 为准。
## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chapter-llama-2025]] —— Chapter-Llama — 语音引导采帧，一小时视频一次前向切章节
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[qwen2-5-vl-2025]] —— Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解

