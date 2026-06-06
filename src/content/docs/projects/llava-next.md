---
title: LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
description: LLaVA 系列主线仓库；OneVision / LLaVA-Video / Interleave 统一 image+video 表征，Video-LLaVA 代码归宿，配套 LMMs-Eval 评测
来源: 'https://github.com/LLaVA-VL/LLaVA-NeXT'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

**LLaVA-NeXT** 是 Haotian Liu / LMMs-Lab 维护的**LLaVA 系列主线仓库**：在 LLaVA-1.5 基础上扩展出 **LLaVA-NeXT（高分辨率图像）**、**LLaVA-NeXT-Video / LLaVA-Video**、**LLaVA-OneVision（统一图像+视频+多图）**、**LLaVA-NeXT-Interleave** 等分支，是理解「从 LLaVA 到视频 SOTA」最直接的代码归宿。

日常类比：原版 [[llava]] 像一家只卖单张明信片画的画廊；LLaVA-NeXT 是**连锁总部**——同一套投影层和训练配方，分店卖「高清画」「连环画」「短视频」「画+字幕交织册」。

README 核心产品线：

- **LLaVA-OneVision**：0.5B/7B/72B，单图/多图/视频 47 benchmark SOTA 级
- **LLaVA-Video**：LLaVA-Video-178K 合成数据 + 7B/72B 视频模型
- **LLaVA-NeXT-Interleave**：图文交织格式统一视频、多图、3D

## 为什么重要

不理解 LLaVA-NeXT，Video-LLaVA 论文和工程实现会对不上号：

- **Video-LLaVA 代码已迁入此仓**：[[video-llava-2024]] 的 ABP 训练、评测文档在 `docs/LLaVA_Video_1003.md` 等文件——不是散落在旧 repo
- **LMMs-Eval 同源**：README 写 LMMs-Eval 开发时服务 LLaVA-NeXT；读论文数字应配 [[lmms-eval]]
- **OneVision 的 task transfer 叙事**：图像上学到的能力零样本迁到视频，是 2024–2025 视频理解的主流论点，本仓库是首发实证
- **stars ~12k**：开源多模态里最活跃的统一仓库之一

## 核心要点

1. **统一视觉表征**：OneVision 用同一 vision tower + projector 处理单图、多图、视频帧序列，减少 modality-specific 分支——读代码时对比 `image` 和 `video` branch 的 collate 差异即可。

2. **LLaVA-Video-178K 数据**：178K caption + 960K 开放问答 + 196K 多选，全合成高质量视频指令数据；训练脚本在 `scripts/train` 可复用。

3. **零样本视频迁移**：LLaVA-NeXT 图像模型不经视频微调即在 VideoMME 有竞争力，论文称 modality transfer；视频专用微调后（LLaVA-Video）再冲高。

## 实践案例

### 案例 1：LLaVA-OneVision 推理（7B）

```bash
git clone https://github.com/LLaVA-VL/LLaVA-NeXT
cd LLaVA-NeXT
pip install -e .

# 按 docs/LLaVA_OneVision.md 下载 lmms-lab/llava-onevision-qwen2-7b-ov
python llava/eval/run_llava_onevision.py \
  --model-path lmms-lab/llava-onevision-qwen2-7b-ov \
  --image-file demo.jpg \
  --query "Describe this image."
```

同一 checkpoint 换 `--video-file` 和采帧参数即可处理视频——体现统一表征设计。

### 案例 2：训练 LLaVA-Video

```bash
# 数据：HuggingFace lmms-lab/LLaVA-Video-178K
# 文档：docs/LLaVA_Video_1003.md
bash scripts/train/finetune_video.sh \
  --model_name_or_path lmms-lab/LLaVA-Video-7B-Qwen2 \
  --data_path ./LLaVA-Video-178K
```

178K 视频指令数据是 LLaVA-Video 论文核心贡献之一；脚本里可见帧采样率、分辨率、Qwen2 对话模板等关键超参。

### 案例 3：用 LMMs-Eval 跑 VideoMME

```bash
python -m lmms_eval \
  --model llava_onevision \
  --model_args pretrained=lmms-lab/llava-onevision-qwen2-7b-ov \
  --tasks videomme \
  --batch_size 4
```

LLaVA-NeXT README 明确推荐此组合；输出可直接和 VideoLLaMA2、Qwen2-VL 表格对齐。

### 案例 4：decord 帧采样 + LLaVA-Video 训练管线

```python
# llava/train 数据 collate 内常用 decord（见 docs/LLaVA_Video_1003.md）
from decord import VideoReader, cpu
import decord

decord.bridge.set_bridge('torch')

def load_video_for_llava(path, sample_fps=1, max_frames=32):
    vr = VideoReader(path, ctx=cpu(0))
    native_fps = vr.get_avg_fps()
    stride = max(1, int(native_fps / sample_fps))
    indices = list(range(0, len(vr), stride))[:max_frames]
    return vr.get_batch(indices)  # → projector → Qwen2 LLM
```

训练完用 [[lmms-eval]] 跑 `--tasks videomme,mvbench` 验证；读 [[video-llava-2024]] 对照 ABP 与 OneVision 帧策略差异。

## 与同类对比

| 仓库 | 统一 image+video | 合成视频数据 | 零样本 video | 音频 | 评测绑定 |
|---|---|---|---|---|---|
| **LLaVA-NeXT** | OneVision ✓ | LLaVA-Video-178K | NeXT 图像→视频 | ✗ | [[lmms-eval]] 官方 |
| [[videollama2]] | ✗ | VideoLLaVA 兼容 | 需视频微调 | 2.1-AV ✓ | lmms-eval + 内置 eval/ |
| [[qwen2-vl-2024]] | ✓ | 闭源 | 强 | 部分 | lmms-eval / 官方 |
| [[internvideo]] | 偏 video | InternVid | encoder 预训练 | ✗ | 内置 + lmms-eval |
| [[videochat-2023]] | ✗ | VideoChat 指令 | 需三阶段训练 | ✗ | MVBench 官方 |

读 **统一多模态架构** 首选本仓 + [[llava]] + [[video-llava-2024]]；读 **音视频** 转 [[videollama2]]。

## 踩过的坑

1. **分支文档多**：`docs/` 下按产品线分 LLaVA_OneVision.md、LLaVA_Video_1003.md、LLaVA_NeXT-Video_0716.md，首次 clone 先确认自己要哪条 branch 的 doc。

2. **checkpoint 命名冗长**：HuggingFace 上 llava-onevision / llava-next-video / llava-critic-r1 并存，下载前核对 paper 版本和 model card。

3. **视频微调吃显存**：72B + 长视频帧序列需要多卡 + DeepSpeed；7B 是复现甜点。

4. **与 haotian-liu/LLaVA 旧仓混淆**：新功能在 LLaVA-VL/LLaVA-NeXT，旧仓 LLaVA-1.5 不再承接 video 主线。

## 适用 vs 不适用场景

**适用**：
- 理解 LLaVA 到视频的统一架构演进
- 训练 / 微调 OneVision 或 LLaVA-Video
- 对比 image→video transfer 实验
- 与 [[lmms-eval]] 配套复现论文表

**不适用**：
- 只要最简 LLaVA-1.5 图像 demo（旧 LLaVA 仓更轻）
- 音视频联合（无原生音频轨，看 [[videollama2]] AV 分支）
- 从零预训练视频 encoder（看 [[internvideo]]）
- 只想读 ABP 论文不做 OneVision（可只读 [[video-llava-2024]] 笔记）

## 历史小故事（可跳过）

- **2024-01**：LLaVA-NeXT 发布，34B 超 Gemini Pro 部分榜
- **2024-05**：LLaVA-NeXT-Video，零样本视频能力出圈
- **2024-08**：LLaVA-OneVision 统一单图/多图/视频
- **2024-10**：LLaVA-Video-178K 数据 + 7B/72B 模型；LMMs-Eval 绑定加深
- **2025+**：LLaVA-Critic-R1 等 GRPO 批评测模型加入同一仓
- **与 LMMs-Lab 深度绑定**：评测、数据、模型三线同源，读仓即读实验室全貌

## 学到什么

1. **统一仓库降低 modality 碎片化**：image/video/interleave 同一套训练基础设施，论文叙事和工程一致
2. **合成指令数据是视频 SOTA 催化剂**：LLaVA-Video-178K 证明规模化学好视频对话不必只靠人工标注
3. **读 video 分支要先读 image 分支**：projector 和 resolution 策略继承自 NeXT 图像线
4. **LLaVA-Video-178K 是合成数据路线的里程碑**：证明视频指令微调可以规模化不靠人工逐条标

## 延伸阅读

- LLaVA-OneVision 论文：[arXiv 2408.03326](https://arxiv.org/abs/2408.03326)
- LLaVA-Video 论文：[arXiv 2410.02713](http://arxiv.org/abs/2410.02713)
- LLaVA-NeXT-Interleave：[arXiv 2407.07895](https://arxiv.org/pdf/2407.07895)
- 官方博客：llava-vl.github.io/blog/
- [[video-llava-2024]] —— 学术前驱（ABP 范式）
- [[llava]] —— 图像侧原点
- [视频理解阅读站](/study/stations/video-understanding/) — Video-LLaVA / OneVision 论文阅读顺序
- [MLLM 阅读站](/study/stations/mllm/) — CLIP→LLaVA 图像地基

## 关联

- [[llava]] —— 图像侧奠基
- [[clip]] —— 视觉 encoder 范式起源；NeXT 视觉塔与之同族
- [[video-llava-2024]] —— Video-LLaVA 论文与 ABP
- [[video-llama-2023]] —— 音视频路线对照（本仓无原生音频）
- [[videochat-2023]] —— 三阶段 VideoChat 训练对照
- [[lmms-eval]] —— 官方评测框架
- [[qwen2-vl-2024]] —— 同级工业竞争者
- [[llava-onevision-2024]] —— 统一 image/video 涌现能力论文
- [[llava-video-2024]] —— LLaVA-Video-178K 数据配方
- [[videollama2]] —— 国内 Video-LLM 对照
- [[internvideo]] —— 视频 encoder 预训练对照
- [[decord]] —— 视频数据加载
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[flamingo-2022]] —— Flamingo — 让冻结的大模型学会看图，几张样例就上手
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-2024]] —— InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[llava-onevision-2024]] —— LLaVA-OneVision — 单图、多图、视频一个模型全搞定
- [[llava-video-2024]] —— LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[longvideobench-2024]] —— LongVideoBench — 一小时交织字幕视频的长上下文理解考卷
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[pillow]] —— Pillow — Python 图像处理库与 PIL 现代继任者
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[sharegpt4video-2024]] —— ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成
- [[spacevllm-2025]] —— SpaceVLLM — 一个 MLLM 同时做时序定位、图像指代与时空管定位
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[torchcodec]] —— TorchCodec — PyTorch 原生 GPU 视频解码与张量输出
- [[transformers-video]] —— Transformers Video — HuggingFace 视频处理器与多模态输入管线
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama3]] —— VideoLLaMA3 — 阿里达摩院第三代图像/视频多模态基座
- [[videomme-2024]] —— Video-MME — 视频多模态大模型的「高考卷」

