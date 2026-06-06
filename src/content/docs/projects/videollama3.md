---
title: VideoLLaMA3 — 阿里达摩院第三代图像/视频多模态基座
description: 动态分辨率 NaViT 视觉编码 + Qwen2.5 后端；7B/2B checkpoint、Gradio demo、VideoMME/LVBench SOTA 评测脚本
来源: 'https://github.com/DAMO-NLP-SG/VideoLLaMA3'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

**VideoLLaMA3** 是阿里达摩院 NLP 团队 2025 年发布的**第三代图像+视频统一多模态基座**：在 [[videollama2]] 时空建模基础上，引入 **SigLIP-NaViT 动态分辨率视觉编码**与 **Qwen2.5** 语言后端，单仓库同时覆盖单图、多图、视觉指代与长视频理解。

日常类比：如果 [[videollama2]] 是「能听能看的 SUV」，VideoLLaMA3 就是**带自适应镜头的旗舰款**——分辨率随内容伸缩，视频 token 可压缩，7B 体量在 VideoMME / LVBench 上刷到同尺寸榜首。

Model Zoo 摘要：

| 型号 | LLM 底座 | 侧重 |
|------|---------|------|
| VideoLLaMA3-7B | Qwen2.5-7B | 图像+视频通用 |
| VideoLLaMA3-2B | Qwen2.5-1.5B | 轻量部署 |
| VideoLLaMA3-7B-Image | Qwen2.5-7B | 图像专项 |
| VL3-SigLIP-NaViT | siglip-so400m | 独立视觉塔权重 |

## 为什么重要

不理解 VideoLLaMA3，2025 年 Video-LLM 工程对照会缺「国内最新可复现 SOTA」这一格：

- **论文 arXiv:2501.13106 的可运行入口**：VideoMME、LVBench 7B 榜首声明都以本仓库为复现基线
- **动态分辨率 NaViT**：比固定 336px 更省 token，长视频场景 OOM 压力更小
- **与 2 代数据/脚本一脉**：训练 annotation 格式、eval 目录树延续 VideoLLaMA2 习惯，迁移成本低
- **VL3-Syn7M 重标注数据集**：开源 7M 级高质量 image-text，可单独拿来做预训练对照

## 核心要点

1. **统一 conversation API**：`AutoProcessor` 接受 `{"type":"video","video":{...}}` 与文本混排，fps / max_frames 可调——一条 pipeline 覆盖图与视频。

2. **推理依赖 pinned 版本**：README 明确要求 `torch==2.4.0` + `flash-attn==2.7.3` + `transformers==4.46.3`；CUDA 版本不匹配是第一大踩坑源。

3. **训练四步闭环**：数据按 `data_root` + jsonl annotation 组织 → 可选 HF→local checkpoint 转换 → 改 `scripts/train/stage*.sh` → DeepSpeed ZeRO / `--mm_max_length` 控显存。

## 实践案例

### 案例 1：最小视频推理

```python
import torch
from transformers import AutoModelForCausalLM, AutoProcessor

device = "cuda:0"
model_path = "DAMO-NLP-SG/VideoLLaMA3-7B"
model = AutoModelForCausalLM.from_pretrained(
    model_path, trust_remote_code=True,
    device_map={"": device}, torch_dtype=torch.bfloat16,
    attn_implementation="flash_attention_2",
)
processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)

conversation = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": [
        {"type": "video", "video": {"video_path": "./cat.mp4", "fps": 1, "max_frames": 180}},
        {"type": "text", "text": "What is happening?"},
    ]},
]
inputs = processor(conversation=conversation, return_tensors="pt")
inputs = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in inputs.items()}
out = model.generate(**inputs, max_new_tokens=1024)
print(processor.batch_decode(out, skip_special_tokens=True)[0])
```

`fps=1` + `max_frames=180` 是 README 默认甜点；长视频先降 fps 再增帧数。

### 案例 2：本地 Gradio Demo

```bash
git clone https://github.com/DAMO-NLP-SG/VideoLLaMA3
cd VideoLLaMA3
pip install torch==2.4.0 torchvision==0.19.0 --extra-index-url https://download.pytorch.org/whl/cu118
pip install flash-attn==2.7.3 --no-build-isolation
pip install transformers==4.46.3 accelerate==1.0.1 decord ffmpeg-python imageio opencv-python

python inference/launch_gradio_demo.py --model-path DAMO-NLP-SG/VideoLLaMA3-7B
```

HuggingFace Spaces 也有在线 demo；本地起服务适合测私有视频。

### 案例 3：批量视频 benchmark

```bash
# 数据按 benchmarks/video/{videomme,mvbench,...} 组织
bash scripts/eval/eval_video.sh weights/videollama3_7b_local "videomme mvbench" 1 1
```

`DATA_ROOT` / `SAVE_DIR` 可在 eval 脚本内改；多卡时调 `NUM_GPUS`。

## 踩过的坑

1. **flash-attn 与 CUDA/torch 三角不匹配**：wheel 选错会直接 import 失败——对照 README 的 cu118 + torch 2.4.0 组合，别随手升 torch 2.5。

2. **训练 OOM**：先减 `--mm_max_length` 和 `--model_max_length`，再开 DeepSpeed ZeRO-3；新 commit 已优化显存，记得 pull main。

3. **HF checkpoint 与训练格式不一致**：finetune 前必须跑 `scripts/convert_hf_checkpoint.py`，否则 loader 找不到 local 权重布局。

4. **decord / ffmpeg 版本**：推理依赖 `decord` 采帧；容器里缺 ffmpeg 会导致 silent decode 失败——用 `ffmpeg-python` 只是封装，系统层仍要装 ffmpeg 二进制。

## 适用 vs 不适用场景

**适用：**

- 需要 7B 级图像+视频统一模型、要对标 VideoMME / LVBench 的研究复现
- 已有 VideoLLaMA2 数据管线，想平滑升级到 3 代
- 需要 NaViT 视觉塔单独抽出来做下游实验（VL3-SigLIP-NaViT）

**不适用：**

- 纯音频理解（2.1-AV 在 [[videollama2]]，3 代主打视觉）
- 边缘设备无 GPU / 显存 <16GB（至少先试 2B-Image）
- 不想 pin 老版本 torch 的生产环境（依赖链较脆）

## 历史小故事（可跳过）

- **2023**：Video-LLaMA 论文把 AV 指令微调带进 Video-LLM
- **2024.06**：VideoLLaMA2 强化时空建模 + 2.1-AV 音频分支
- **2025.01.21**：VideoLLaMA3 模型与推理代码发布，arXiv:2501.13106
- **2025.01.26**：7B 登顶 VideoMME；02.07 开源 VL3-Syn7M 重标注集

## 学到什么

- 动态分辨率 NaViT 是长视频 token 预算的关键杠杆，比无脑加帧更可持续
- Video-LLM 工程 = 版本 pin + 数据 jsonl 规范 + eval 目录约定，三者缺一复现就卡壳
- 国内 DAMO 系列从论文到 HF demo 到 eval 脚本闭环完整，适合当「可运行 SOTA」参照系

## 延伸阅读

- 论文：[arXiv:2501.13106](https://arxiv.org/abs/2501.13106)
- HF Collection：DAMO-NLP-SG/videollama3
- CookBook：`inference/notebooks/` 四本 notebook（单图/多图/指代/视频）
- [[videollama2]] —— 直接前代
- [[qwen2-vl-2024]] —— 同用 Qwen 系的工业对照

## 关联

- [[videollama2]] —— 二代时空建模与 AV 分支
- [[video-llama-2023]] —— 系列起源论文
- [[decord]] —— README 指定的视频解码依赖
- [[gradio]] —— 本地 demo 启动方式
- [[llava-next]] —— 同代多模态统一路线
- [[lmms-eval]] —— 另一套统一评测入口
- [[tempcompass-2024]] —— eval 脚本内置 benchmark
- [[internvideo]] —— 工业级 video encoder 对照
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[fdk-aac]] —— fdk-aac — Fraunhofer AAC 编解码库
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[handbrake]] —— HandBrake — FFmpeg 上的 GUI 转码器
- [[lame]] —— LAME — MP3 编码开源参考实现
- [[libvpx]] —— libvpx — VP8/VP9 开源视频编解码
- [[opus]] —— Opus — 低延迟全频带音频编解码
- [[shotcut]] —— Shotcut — 基于 MLT 的开源非线性编辑器
- [[svt-av1]] —— SVT-AV1 — 可扩展 AV1 软件编码器
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama3-2025]] —— VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
- [[x264]] —— x264 — 开源 H.264/AVC 软件编码器
- [[x265]] —— x265 — 开源 HEVC/H.265 编码器

