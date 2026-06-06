---
title: LLaVA-OneVision — 单图、多图、视频一个模型全搞定
来源: 'Li et al., "LLaVA-OneVision: Easy Visual Task Transfer", arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

LLaVA-OneVision 是 LMMs-Lab 团队 2024 年 8 月发布的开源多模态大模型家族，核心主张是：**用同一个模型同时处理单张图片、多张图片和视频**，而且三种场景都能打到开源 SOTA 水平。

日常类比：以前的方案像三家分店——一家只卖明信片（单图模型）、一家只卖连环画（多图模型）、一家只卖短视频（视频模型），顾客换需求就得换店。OneVision 是**一家万能杂货铺**：同一套收银系统（SigLIP 视觉编码器 + MLP 投影层 + Qwen2 语言模型），不管顾客拿来的是一张照片、一组对比图还是一段视频，都用同一种方式「读进去、答出来」。

技术上它继承 [[llava]] 系列的极简架构，在 [[video-llava-2024]] 的「统一视觉表征」思路上再往前走一步：单图用高分辨率长 token 序列（AnyRes），多图和视频则把每帧当一张图处理，通过**任务迁移（Task Transfer）**让图像上学到的 OCR、推理、对话能力自动涌现到视频理解上。

## 为什么重要

不理解 LLaVA-OneVision，下面这些事说不清：

- 为什么 2024 年后「一个模型打天下」成为开源多模态主流路线——它第一次在 47 个 benchmark 上同时证明单图/多图/视频三场景都能 SOTA
- 为什么「只训图像、不训视频也能做视频问答」不是噱头——LLaVA-NeXT 博客已验证零样本迁移，OneVision 用两阶段训练把这一现象系统化
- 为什么 Video-LLaVA 的 ABP 思路会进化成「把视频帧当图片序列」——OneVision 不再依赖 LanguageBind，改用 SigLIP + 统一投影层
- 为什么 [[qwen2-vl-2024]] 和 OneVision 常被放在一起对比——两者都走「统一表征 + 强 LLM 骨干」，但帧压缩和位置编码策略不同

## 核心要点

1. **两阶段训练配方**：第一阶段用 320 万条单图指令把模型训到「看图什么都会」；第二阶段用 160 万条混合数据（56 万多图 + 35 万视频 + 80 万单图抽样）做 OneVision 微调。类比：先学会读单页漫画，再拿连环画和翻页动画练手——基础扎实后跨格式学得飞快。

2. **Higher AnyRes 统一表征**：单图分配大量视觉 token（高分辨率多裁剪），多图只用基础分辨率省算力，视频每帧也走基础分辨率再用双线性插值压缩 token 数。核心设计意图：让单图的长序列表示「长得像」视频帧序列，方便能力从图像侧迁移到视频侧。

3. **任务迁移与涌现能力**：论文最大卖点不是某个单项分数，而是「图像上学到的技能零样本帮到视频」——比如图像 OCR 能力迁移后，模型能读视频里的字幕；图像推理能力迁移后，能回答「视频里角色先做了什么」。这种跨场景互促是统一架构相比「三个专用模型」的根本优势。

## 实践案例

### 案例 1：同一 checkpoint 处理单图 / 多图 / 视频

```python
# 官方仓库：LLaVA-VL/LLaVA-NeXT，文档 docs/LLaVA_OneVision.md
# HuggingFace：lmms-lab/llava-onevision-qwen2-7b-ov

from transformers import LlavaOnevisionForConditionalGeneration, AutoProcessor
import torch

model_id = "lmms-lab/llava-onevision-qwen2-7b-ov"
model = LlavaOnevisionForConditionalGeneration.from_pretrained(
    model_id, torch_dtype=torch.float16, device_map="auto"
)
processor = AutoProcessor.from_pretrained(model_id)

# 单图问答
messages = [{"role": "user", "content": [
    {"type": "image", "url": "photo.jpg"},
    {"type": "text", "text": "图片里有什么？"},
]}]
inputs = processor.apply_chat_template(messages, return_tensors="pt").to(model.device)
output = model.generate(**inputs, max_new_tokens=256)

# 视频问答：视频帧被当作「多张图」输入，同一套 vision tower + projector
video_messages = [{"role": "user", "content": [
    {"type": "video", "url": "clip.mp4"},
    {"type": "text", "text": "视频里发生了什么？"},
]}]
```

**逐部分解释**：

- `llava-onevision-qwen2-7b-ov` 后缀 `ov` 表示 OneVision 版，支持三模态
- 视频不走独立视频编码器，帧序列经 SigLIP 编码后 token 池化再送进 Qwen2
- 单图 / 多图 / 视频共用同一个 MLP Projector，体现统一表征

### 案例 2：两阶段训练的数据配比

```
阶段一：Single-Image Training（320 万条）
  - General QA 36% / Doc-Chart 21% / Math 20% / OCR 9% / Language 14%
  - 目标：把单图指令跟随能力训到极强

阶段二：OneVision Training（160 万条混合）
  - Multi-Image  43%（56 万，含 NLVR、ScanQA 等）
  - Video        22%（35 万，项目自采）
  - Single-Image 31%（80 万，从阶段一高质量子集重采样）

关键发现：阶段二不引入全新单图数据，而是复用阶段一精华
→ 视频/多图能力是在「已经很强的图像模型」上叠加的，迁移效率极高
```

### 案例 3：用 LMMs-Eval 复现论文数字

```bash
# LLaVA-NeXT README 推荐组合
python -m lmms_eval \
  --model llava_onevision \
  --model_args pretrained=lmms-lab/llava-onevision-qwen2-7b-ov \
  --tasks videomme,mvbench,mme \
  --batch_size 4

# 7B 在 VideoMME / MVBench 等指标上与专用视频模型竞争
# 72B 进一步拉高天花板；0.5B 适合边缘部署验证
```

**逐部分解释**：

- `videomme` 测长视频理解，`mvbench` 测多维度视频能力，`mme` 测单图感知
- 同一命令跑三种 benchmark，正是论文「一个模型三场景」论点的工程验证入口
- 输出可直接和 [[qwen2-vl-2024]]、[[videollama2]] 表格对齐

## 踩过的坑

1. **「任务迁移」不等于「不用视频数据」**：OneVision 第二阶段仍有 35 万视频样本；零样本迁移是图像模型的惊喜，但要冲 SOTA 仍需视频微调——别把博客 里的 zero-shot 叙事当成可以完全跳过视频训练。

2. **视频帧 token 被池化，细粒度时序会丢**：每帧经双线性插值压缩 token，长视频里快速动作或短暂字幕可能看不清——和 [[tempcompass-2024]] 暴露的时序弱点一致，不是统一架构能自动解决的。

3. **多图输入格式有讲究**：HuggingFace 文档建议多图用嵌套列表传入，否则每张图都走 AnyRes 多裁剪，显存会爆——工程上和论文里的「多图只用基础分辨率」要对应上。

4. **checkpoint 命名易混**：HuggingFace 上 `llava-onevision` / `llava-next-video` / `llava-critic-r1` 并存，下载前务必核对 model card 和论文版本，否则评测数字对不上。

## 适用 vs 不适用场景

**适用**：
- 需要单图 + 多图 + 视频统一接口的产品（客服、教育、内容审核）
- 相信「先训强图像、再扩视频」的高效路线，算力预算有限
- 开源复现和 benchmark 对比——代码、数据、权重全套公开，配 [[lmms-eval]] 即可

**不适用**：
- 依赖精确到帧的时序推理（动作顺序、因果链）——token 池化是硬伤
- 需要音频理解——OneVision 无音频分支，音视频场景看 [[videollama2]]
- 超长视频（小时级）——帧数和上下文长度仍受限于 LLM 窗口

## 历史小故事（可跳过）

- **2024-01 ~ 06**：团队在 LLaVA-NeXT 博客系列（Video / Stronger / Ablation / Interleave）中并行探索，同时积累高质量指令数据
- **2024-08-06**：LLaVA-OneVision 上传 arXiv（2408.03326），标题直指 Easy Visual Task Transfer
- **2024-08 ~ 09**：发布 0.5B / 7B / 72B 权重、1.6M OneVision 训练数据、完整训练代码到 LLaVA-NeXT 仓库
- **2024 秋**：HuggingFace Transformers 官方收录 `LlavaOnevisionForConditionalGeneration`，降低上手门槛
- **2025+**：后继工作 LiveVLM 等在 OneVision 流式 KV 管理基础上做实时视频理解

## 学到什么

1. **统一表征的关键不是「同一个 encoder」这么简单**——AnyRes 让单图 token 布局刻意贴近视频帧序列，这种表征层面的对齐比事后接两个投影层更有效
2. **两阶段训练顺序有讲究**：先单图后混合，比一开始就搅在一起训更稳——图像数据量大质高，先把底子打好再扩场景，迁移才明显
3. **质量 > 数量在 LMM 时代依然成立**：论文 99.8% 高质量知识数据是合成的，精心策划的 160 万混合数据胜过盲目堆十亿低质图文对
4. **开源 SOTA 的护城河在「全套可复现」**：权重 + 数据 + 代码 + 评测脚本一起放，比单点刷榜更有长期价值

## 延伸阅读

- 论文 PDF：[arXiv 2408.03326](https://arxiv.org/abs/2408.03326)
- 官方代码：[LLaVA-VL/LLaVA-NeXT](https://github.com/LLaVA-VL/LLaVA-NeXT)（`docs/LLaVA_OneVision.md`）
- HuggingFace 模型卡：[llava-onevision-qwen2-7b-ov](https://huggingface.co/lmms-lab/llava-onevision-qwen2-7b-ov)
- [[video-llava-2024]] —— 统一视觉表征的前辈，ABP 思路的源头
- [[llava-next]] —— OneVision 代码与权重的工程归宿
- [[vid-llm-survey-2023]] —— 综述里「统一 image/video」路线的全景地图

## 关联

- [[llava]] —— 架构祖先：MLP Projector + 视觉指令微调范式，OneVision 完整继承
- [[video-llava-2024]] —— 直接前驱：先证明图像/视频可共享表征，OneVision 扩展到三模态
- [[llava-next]] —— 代码仓库：OneVision / LLaVA-Video / Interleave 产品线所在地
- [[qwen2-vl-2024]] —— 同期竞品：动态分辨率 + M-RoPE vs AnyRes + 任务迁移
- [[tempcompass-2024]] —— 时序 benchmark：可验证 OneVision 帧池化后的时序短板
- [[vid-llm-survey-2023]] —— 综述定位：统一 Embedder×LLM 路线的 2024 里程碑
- [[lmms-eval]] —— 论文 47 benchmark 的官方复现入口
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[livevlm-2025]] —— LiveVLM — 免训练流式视觉 token 压缩
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[longvila-2024]] —— LongVILA — 把 VILA 从 8 帧扩到 2048 帧的长视频全栈方案
- [[nvila-2024]] —— NVILA — 先放大分辨率再压缩 token 的高效 VLM
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[st-llm-2024]] —— ST-LLM — 把所有时空 token 交给 LLM，让它自己学时序
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现

