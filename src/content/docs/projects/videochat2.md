---
title: VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
description: Ask-Anything 仓库的 VideoChat2 主线；UMT 视觉编码 + Mistral/Vicuna LLM、三阶段训练与 MVBench 官方评测脚本
来源: 'https://github.com/OpenGVLab/Ask-Anything'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

**VideoChat2** 是上海 AI Lab OpenGVLab 在 [[videochat-2023]] 之后发布的**新一代 Video-LLM 开源实现**，代码集中在 Ask-Anything 仓库的 `videochat2/` 目录。它把 UMT 视觉编码器、投影层和 Mistral-7B / Vicuna-7B 语言模型串成端到端视频对话系统，并提供三阶段训练脚本与 MVBench 等 benchmark 的官方推理入口。

日常类比：如果 [[videochat-2023]] 是「把视频塞进聊天机器人的原型车」，VideoChat2 就是**带完整产线手册的量产版**——从图文对齐预训练、视频-文本联合训练到多轮对话微调，每一步都有独立 shell 脚本和配置 JSON。

仓库内主要分支：

| 目录 | 用途 |
|------|------|
| `videochat2/` | 2 代主线：训练 + 推理 + eval |
| `videochat/` | 1 代 VideoChat 遗留实现 |
| `videochat2_it/` | 图文交织（interleaved）扩展实验 |

## 为什么重要

不理解 VideoChat2，国内 Video-LLM 工程脉络会断一截：

- **三阶段训练范式已成行业模板**：Stage1 图文对齐 → Stage2 视频-文本联合 → Stage3 多轮指令微调，[[videollama2]]、[[video-llava-2024]] 等多沿用类似节奏
- **MVBench 官方复现入口**：论文表格里的 VideoChat2 分数以本仓库 eval 脚本为准，clone 后按 README 准备 JSON 即可开跑
- **与 VideoChat-Flash 形成代际对照**：[[videochat-flash-2025]] 走轻量化路线，读 2 代有助于理解「精度 vs 速度」分叉
- **OpenGVLab 生态枢纽**：同组织还有 InternVideo、[[internvideo]] 等 encoder 套件，VideoChat2 是「把 encoder 接上 LLM」的标准范例

## 核心要点

1. **UMT 作视觉主干**：相比 1 代 EVA-CLIP，2 代采用 UMT（Unified Multimodal Transformer）提取时空特征，再经 MLP 投影进 LLM 词嵌入空间。

2. **三阶段训练契约**：Stage1 只用图像-文本对学对齐；Stage2 引入视频片段学时空；Stage3 用对话 JSON 学多轮 follow-up。跳过任一阶段，下游 QA 容易「会说不会看」。

3. **帧采样与训练配置绑定**：默认均匀采 8 帧，checkpoint 名和 config 里 `num_frames` 必须一致；改帧数等于改输入分布。

4. **Gradio + CLI 双入口**：`demo/` 可快速起 Web 问答；`eval/` 下按 benchmark 分子目录，适合批量跑分而非交互体验。

## 实践案例

### 案例 1：克隆并安装依赖

```bash
git clone https://github.com/OpenGVLab/Ask-Anything
cd Ask-Anything/videochat2
pip install -r requirements.txt
pip install flash-attn --no-build-isolation  # CUDA 环境
```

README 会列出 transformers、deepspeed 等版本区间；建议新建 conda 环境，避免与 [[pytorch]] 主环境冲突。

### 案例 2：Stage2 视频联合训练

```bash
# 数据按 README 放到 data/videochat2/
bash scripts/train/stage2_video_pretrain.sh \
  --cfg configs/videochat2_7b_stage2.json
```

脚本内部用 [[decord]] 按索引采帧，再喂给 UMT。若 I/O 慢，先检查视频是否已转码为训练友好格式（可用 [[ffmpeg]] 统一 fps 与编码）。

### 案例 3：MVBench 官方评测

```bash
python eval/mvbench/evaluate.py \
  --model-path OpenGVLab/VideoChat2_HD_stage4_Mistral_7B \
  --num-frames 8 \
  --output mvbench_vc2.json
```

MVBench 题目按「时序推理 / 目标关系」等维度拆分；结果可与 [[lmms-eval]] 的 `--model videochat2` 任务交叉验证，排除数据路径差异。

## 踩过的坑

1. **仓库多版本目录易混**：`videochat/` 与 `videochat2/` 依赖不同，clone 后先 `cd videochat2` 再装包，否则 import 路径全错。

2. **checkpoint 分 stage**：HuggingFace 上的 `stage3` / `stage4` 名称表示训练阶段，拿 stage2 权重跑多轮对话会明显复读。

3. **flash-attn 与 CUDA 绑定**：编译失败时先对齐 CUDA 11.8+ 与 gcc 版本，不要随意升 transformers。

4. **评测 JSON 路径硬编码**：`eval/` 脚本里数据根目录常写相对路径，换机器必须改 config 或设环境变量。

5. **8 帧默认值不可随意改**：论文与 leaderboard 数字基于 8 帧；改成 16 帧不会自动变强，反而可能 OOM。

## 适用 vs 不适用场景

**适用**：
- 复现 VideoChat2 论文表格与 MVBench 分数
- 学习三阶段 Video-LLM 训练流水线
- 在自有视频指令数据上做 Mistral-7B 规模微调
- 与 [[videollama2]]、[[qwen2-vl-2024]] 做同 benchmark 对照实验

**不适用**：
- 极低显存（<24G）跑 7B 全量微调
- 只要图像对话（直接用 LLaVA 系更轻）
- 生产级高并发 serving（需 [[vllm]] 等多模态服务改造）
- 追求最新轻量模型（优先看 [[videochat-flash-2025]]）

## 历史小故事（可跳过）

- **2023-05**：VideoChat 论文 + Ask-Anything 仓库首发，国内较早的「视频多轮对话」系统
- **2024 初**：VideoChat2 技术报告与 stage 权重陆续放出，MVBench 榜单占据 7B 档前列
- **2024 中**：VideoChat2_HD 等高清变体，帧分辨率与 encoder 容量提升
- **2025**：VideoChat-Flash 接力，2 代仍是理解三阶段训练的最佳教科书

## 学到什么

1. **三阶段训练是 Video-LLM 的「出厂设置」**：对齐 → 联合 → 对话，缺一步就缺一项能力
2. **eval 目录结构与论文表格一一对应**：读懂 `eval/mvbench/` 就懂官方数字怎么来的
3. **8 帧是 7B 时代的甜点**：帧数、分辨率、LLM 规模三者互相制约
4. **OpenGVLab 偏好 Mistral 作 LLM 后端**：与 LLaVA 系 Vicuna/Llama 形成分工
5. **Gradio demo 是论文标配**：`demo/` 代码是理解推理链路的捷径
6. **vLLM 分支与主线 release 不同步**：加速部署以分支 README 为准

## 延伸阅读

- 论文：[VideoChat2 技术报告](https://arxiv.org/abs/2405.04200)
- HuggingFace 模型集合：OpenGVLab/VideoChat2 系列
- [[videochat-2023]] —— 1 代论文与系统
- [[mvbench-2023]] —— 官方主战场 benchmark
- [[vid-llm-survey-2023]] —— 综述中的工程实现索引

## 关联

- [[videochat-2023]] —— 前代理论与系统
- [[videochat-flash-2025]] —— 同团队轻量化后继
- [[videollama2]] —— 国内另一三阶段训练对照
- [[video-llava-2024]] —— 同赛道 ABP 对齐路线
- [[qwen2-vl-2024]] —— 工业级动态分辨率竞争者
- [[decord]] —— 训练采帧 I/O
- [[ffmpeg]] —— 视频预处理
- [[lmms-eval]] —— 横向统一评测入口
- [[gradio]] —— demo 部署
- [[internvideo]] —— 同组织视觉 encoder 套件
- [[mvbench-2023]] —— 时序专项 benchmark
- [[tempcompass-2024]] —— 时序探针评测
- [[pytorch]] —— 训练框架底座
- [[llava-next]] —— 多模态统一仓库另一主线
- [[vllm-multimodal]] —— 视频 serving 与加速分支

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[flash-vstream-2024]] —— Flash-VStream — STAR 双进程记忆的低延迟长流理解
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[livevlm-2025]] —— LiveVLM — 免训练流式视觉 token 压缩
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama3-2025]] —— VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
- [[videollm-online-2024]] —— VideoLLM-online — 流式视频对话的 LIVE 框架
- [[vinoground-2024]] —— Vinoground — 时序反事实短视频探针
- [[worldsense-2025]] —— WorldSense — 真实世界同步音视频理解 benchmark

