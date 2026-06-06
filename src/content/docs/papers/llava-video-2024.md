---
title: LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
来源: 'Zhang et al., "LLaVA-Video: Video Instruction Tuning with Synthetic Data", arXiv 2410.02713'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

LLaVA-Video 是 LLaVA-NeXT 团队在 2024 年推出的**视频理解模型家族**，正式论文见 [arXiv 2410.02713](https://arxiv.org/abs/2410.02713)。它把 LLaVA 主线从「只训图像」一路延伸到「能聊视频」，核心贡献有两层：

1. **LLaVA-NeXT-Video（2024 年 4–5 月）**：只用图像训好的 LLaVA-NeXT，靠 **AnyRes** 把多帧排成 `{1×N}` 网格，实现**零样本视频理解**；再 SFT + DPO 进一步拉高分数。
2. **LLaVA-Video（2024 年 10 月）**：发布 **LLaVA-Video-178K** 合成指令数据集（GPT-4o 标注，1 FPS 密集采帧），配合 **SlowFast 视觉 token 分配**，在 64 帧预算下训出 7B/72B 视频 LMM。

日常类比：以前的 Video-LLM 像请了一位只读过「幻灯片截图」的解说员——画面几乎不动，讲不出剧情转折。LLaVA-Video 先挑**情节丰富的原片**（动态、未剪辑），再让 GPT-4o 按时间轴写**分章节讲稿**（三级递归 caption + 16 类 QA），最后让模型用 **SlowFast** 在有限显存里同时看「慢镜头细节帧」和「快镜头概览帧」——像体育转播的慢放 + 全场回放。

技术栈：视觉编码器 **SigLIP** + 语言模型 **Qwen2**，在 **LLaVA-OneVision** 单图阶段 checkpoint 上继续视频指令微调；评测统一走 **LMMs-Eval**。

## 为什么重要

不理解 LLaVA-Video，下面这些事说不清：

- 为什么 **「只训图像的 LLaVA-NeXT 也能做视频」**——AnyRes 把「多 patch 拼高分辨率图」自然推广成「多帧拼视频」，首次展示 LMM 的强零样本模态迁移
- 为什么 2024 年后开源 Video-LLM 论文几乎必报 **VideoMME**——LLaVA-NeXT-Video / LLaVA-Video 把该榜推成事实标准，7B 在 short/medium/long 三档都有公开数字
- 为什么「合成视频指令数据」成为新范式——LLaVA-Video-178K 用 **1 FPS** 标注，对比 ShareGPT4Video 平均 0.15 FPS，说明稀疏采帧会让标注丢失动作细节
- 为什么帧数真的影响视频理解——论文消融显示加 LLaVA-Video-178K 后 NExT-QA +31.9、VideoMME +9.1，推翻「单帧就够」的旧结论

## 核心要点

1. **AnyRes 零样本视频（LLaVA-NeXT-Video 阶段）**：AnyRes 把高分辨率图切成子图网格（如 2×2、1×4），拼成 token 序列送进 ViT。视频只需把 N 帧排成 `{1×N}` 网格；配合 **spatial pooling stride=2**（24×24 → 12×12 token/帧）和 **RoPE 线性缩放**（训练 4096、推理扩到 8192），零样本就能处理 32–56 帧。类比：把连环画每一页缩略后横着贴成长条，LLM 仍按「读图」方式读视频。

2. **LLaVA-Video-178K 合成数据管线**：从 10 大视频源（ActivityNet、Ego4D、InternVid 等）筛**动态、未剪辑、5s–3min** 原片；GPT-4o 以 **1 FPS** 采帧，三级递归写 caption（10s 片段 → 30s 摘要 → 全片总述），再按 16 类问题模板生成开放问答与选择题，共 **178K 视频 / 1.3M 指令**。类比：不是随机截图写说明，而是按章节写连续剧剧本再出题。

3. **SlowFast 视觉 token 预算**：在固定 LLM 上下文里，把帧分成 slow 组（每隔 s 帧，高分辨率 pooling）和 fast 组（其余帧，更强 pooling），参数记为 `V=(T,M,s,p)`。7B 用 `(64,679,1,2)`、72B 用 `(64,679,3,2)`，同等 token 预算下可塞进约 **3× 帧数**。类比：重要镜头用 4K 慢放，过渡镜头用 360p 快进，总带宽不变。

## 实践案例

### 案例 1：LLaVA-NeXT-Video 推理（32 帧 + spatial pooling）

```python
# 官方仓库: https://github.com/LLaVA-VL/LLaVA-NeXT
# 模型: lmms-lab/LLaVA-NeXT-Video-7B-DPO
from llava.model.builder import load_pretrained_model

model_path = "lmms-lab/LLaVA-NeXT-Video-7B-DPO"
tokenizer, model, image_processor, _ = load_pretrained_model(model_path)

# 关键超参（见 docs/LLaVA-NeXT-Video.md）
NUM_FRAMES = 32          # 均匀采 32 帧
POOL_STRIDE = 2          # 每帧 24x24 → 12x12 tokens
POOL_MODE = "average"

response = model.generate(
    video_path="demo.mp4",
    prompt="请详细描述视频里发生了什么？",
    num_frames=NUM_FRAMES,
    spatial_pool_stride=POOL_STRIDE,
)
```

逐部分解释：`NUM_FRAMES` 控制时间覆盖；`POOL_STRIDE` 把每帧 token 减半，才能在 4096–8192 窗口里塞下更多帧；DPO 版比纯 SFT 更少幻觉、更听话。

### 案例 2：LMMs-Eval 跑 VideoMME（对齐采帧数）

```bash
# 论文与 videomme-2024 笔记均强调：横向对比必须对齐帧数
python -m lmms_eval \
  --model llava_next_video \
  --model_args pretrained="llava-hf/LLaVA-NeXT-Video-7B-hf",max_frames=32 \
  --tasks videomme \
  --batch_size 1
```

一行命令打出 short / medium / long 三档准确率。论文里 LLaVA-NeXT-Video 约 **52.5%** 总均分；升级后的 LLaVA-Video-7B 在 VideoMME 达 **63.3% / 69.7%**（无字幕 / 有字幕），72B 达 **70.5% / 76.9%**。

### 案例 3：SlowFast 帧分组直觉

```
假设 T=12 帧，stride s=3，每帧原始 M=144 tokens（12×12），pooling p=2：

slow 组：第 3、6、9、12 帧 → 每帧 144/4 = 36 tokens（看得细）
fast 组：其余 8 帧       → 每帧 144/16 = 9 tokens（看得广）

总 token ≈ 4×36 + 8×9 = 216
若 12 帧全用 slow 精度：12×36 = 432 → 超预算

结论：SlowFast 用「关键帧高清 + 过渡帧低清」在同等预算下覆盖更多时间轴
```

## 踩过的坑

1. **零样本不等于最终形态**：LLaVA-NeXT-Image 零样本已能超很多专门训视频的模型，但 SFT + DPO 仍有明显提升——部署时别只拿「没看过视频数据」的 checkpoint 就宣称 SOTA。

2. **帧数与标注密度必须匹配**：LLaVA-Video-178K 用 1 FPS 写标注；你若推理只采 8 帧，长视频中间事件容易被跳过，和训练分布不一致。

3. **ActivityNet-QA 提升有限不代表模型弱**：很多问题单帧就能答（如球的颜色），密集时序标注优势体现不出来——要用 VideoMME、TempCompass 等测时序。

4. **EgoSchema 对 7B 仍是短板**：第一人称视角数据在 178K 里占比低，7B 明显偏弱；72B 才追上 LLaVA-OneVision，小模型别盲目报 ego 任务。

## 适用 vs 不适用场景

**适用**：
- 需要 **开源可复现** 的 Video-LLM 基线（7B/72B + 178K 数据 + LMMs-Eval 脚本）
- 想学习 **合成指令数据** 怎么从 GPT-4o + 递归 caption 规模化产出
- 在有限 GPU 显存下尽量提高 **有效帧数**（SlowFast 可直接借鉴）

**不适用**：
- 需要 **音频理解** 的场景——LLaVA-Video 纯视觉，无音轨分支
- **超长视频（>3 分钟）** 原生支持弱——训练数据截在 3 分钟内
- 只要 **极简零样本 demo**、不想准备视频 SFT 数据——可先用 LLaVA-NeXT-Image 零样本，但上限低于完整 LLaVA-Video

## 历史小故事（可跳过）

- **2024-01-30**：LLaVA-NeXT 发布，AnyRes 提升图像 OCR / 推理，为视频扩展奠基
- **2024-04-30**：团队发博客 **「A Strong Zero-shot Video Understanding Model」**，证明图像-only 训练 + AnyRes 零样本超 LLaMA-VID 等视频专用模型
- **2024-05-10**：**LLaVA-NeXT-Video** checkpoint 与 DPO 版开源，VideoMME 榜进入开源第一梯队
- **2024-10-04**：**LLaVA-Video** 正式论文 [2410.02713](https://arxiv.org/abs/2410.02713) 与 **LLaVA-Video-178K** 发布；原 LLaVA-NeXT-Video 品牌并入 LLaVA-Video 家族

## 学到什么

1. **模态迁移可以「免费」拿到第一波能力**：AnyRes 让图像 LMM 不碰视频数据也能聊短视频，但要做 SOTA 仍需视频指令微调与好数据
2. **视频数据质量 > 数量**：178K 条动态原片 + 1 FPS 标注，胜过百万级静态 Web 视频 + 稀疏 2 帧标注
3. **token 预算是视频 LMM 的核心工程问题**：SlowFast、spatial pooling、RoPE 缩放都是为在固定上下文里塞更多「有效时间」
4. **评测要对齐帧数和任务类型**：VideoMME 看综合理解，TempCompass 看时序，EgoSchema 看第一人称——单榜高低不能代表全部能力

## 延伸阅读

- 论文 PDF：[arXiv 2410.02713](https://arxiv.org/abs/2410.02713)
- 官方代码：[LLaVA-VL/LLaVA-NeXT](https://github.com/LLaVA-VL/LLaVA-NeXT)
- 数据集：[LLaVA-Video-178K](https://huggingface.co/datasets/lmms-lab/LLaVA-Video-178K)
- 零样本视频博客：[LLaVA-NeXT Video Blog](https://llava-vl.github.io/blog/2024-04-30-llava-next-video/)
- [[videomme-2024]] —— LLaVA-Video 系列的核心评测榜与采帧对齐注意事项
- [[llava]] —— 整条路线的图像侧起点：MLP Projector + 视觉指令微调

## 关联

- [[llava]] —— 图像多模态对话范式源头；LLaVA-Video 继承 Projector + 指令微调骨架
- [[video-llava-2024]] —— 北大 Video-LLaVA 的「先对齐再投影」路线；与 LLaVA-NeXT 的 AnyRes 路线对照
- [[llama-vid-2023]] —— 双 token 压缩长视频；LLaVA-NeXT-Video 零样本曾超越该基线
- [[videomme-2024]] —— 论文主榜；LLaVA-NeXT-Video / LLaVA-Video 数字均在此复现
- [[internvideo2-2024]] —— 强视频 encoder 路线；LLaVA-Video 选 SigLIP + Qwen2 的端到端 LMM 路线
- [[qwen2-vl-2024]] —— 工业竞品：动态分辨率 + M-RoPE vs SlowFast + 合成 178K
- [[lmms-eval]] —— 论文统一评测入口，避免各报各的采帧设置

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hour-llava-2025]] —— Hour-LLaVA — 记忆增强，让 LLaVA 读懂一小时视频
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库

