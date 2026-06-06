---
title: VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
description: Video-LLaMA 论文的可运行实现；7B/72B checkpoint、Gradio demo、MVBench/VideoMME 评测脚本，2.1-AV 分支支持音视频联合 QA
来源: 'https://github.com/DAMO-NLP-SG/VideoLLaMA2'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

**VideoLLaMA2** 是阿里达摩院 NLP 团队发布的**音视频 Video-LLM 开源仓库**：在 [[video-llama-2023]] 思路上升级时空建模，提供 7B/72B 等级 checkpoint、Gradio demo、训练与评测脚本，并扩展 **VideoLLaMA2.1-AV** 音视频联合理解。

日常类比：如果 [[video-llama-2023]] 论文是「设计图纸」，VideoLLaMA2 就是**带充电桩的整车**——`pip install -e .` 后能本地起 demo、跑 MVBench/VideoMME、复现 leaderboard 分数。

模型族（README Model Zoo 摘要）：

| 型号 | 视觉编码器 | LLM | 训练帧数 |
|------|-----------|-----|---------|
| VideoLLaMA2-7B-16F | CLIP ViT-L/14@336 | Mistral-7B | 16 |
| VideoLLaMA2.1-7B-16F | SigLIP SO400M | Qwen2-7B | 16 |
| VideoLLaMA2.1-7B-AV | BEATs 音频 + 上述视觉 | Qwen2-7B | 16 |

## 为什么重要

不理解 VideoLLaMA2，国内 Video-LLM 工程实践会缺一块：

- **论文到代码的闭环**：arXiv 2406.07476 的 MVBench / VideoMME / EgoSchema SOTA 声明，都以本仓库为复现入口
- **音视频一体**：2.1-AV 分支把 BEATs 音频 encoder 和视觉帧对齐，比纯视觉 Video-LLM 更贴近真实视频（有声）
- **与 Video-LLaVA 数据兼容**：Quick Start 直接用 VideoLLaVA 数据集结构训练，降低「换模型不换数据」的迁移成本
- **后继 VideoLLaMA3**：README 已链到更新一代，读 2 代有助于理解国内团队迭代节奏

## 核心要点

1. **时空建模增强**：相比初代 Video-LLaMA，2 代在视觉 token 进 LLM 前加强时空聚合（论文称 advancing spatial-temporal modeling），16 帧输入是 7B 甜点配置。

2. **三模式使用**：Online `pip install -e .` 开发；Offline 包安装推理；Gradio `serve/` 模块起 Web demo——覆盖研究到演示。

3. **评测目录结构标准化**：`eval/` 下按 EgoSchema、MVBench、VideoMME、ActivityNet-QA 分子目录，每套附官方数据链接——clone 后按树状图准备数据即可开跑。

## 实践案例

### 案例 1：起 Gradio 单模型 Demo

```bash
git clone https://github.com/DAMO-NLP-SG/VideoLLaMA2
cd VideoLLaMA2
pip install -r requirements.txt
pip install flash-attn==2.5.8 --no-build-isolation

python videollama2/serve/gradio_web_server_adhoc.py
# 默认加载 VideoLLaMA2-7B，浏览器打开本地端口上传视频问答
```

`gradio_web_server_adhoc.py` 是最快体验路径；多卡环境可用 controller + model_worker 架构挂多个 checkpoint。

### 案例 2：按 VideoLLaVA 数据训练

```bash
# 数据集按 README 放到 datasets/videollava_pt 和 videollava_sft
bash scripts/vllava/pretrain.sh   # 预训练
bash scripts/vllava/finetune.sh   # 指令微调
```

数据 JSON（如 `valley_llavaimage.json`）包含 703K 视频-文本 + 558K 图像-文本对；和 [[video-llava-2024]] 用的 Video-LLaVA 语料同源，适合对比「同数据不同架构」。

### 案例 3：EgoSchema 评测

```bash
# eval/egoschema/ 下放 good_clips_git/ 和 questions.json
python videollama2/eval/inference_video.py \
  --model-path DAMO-NLP-SG/VideoLLaMA2-7B-16F \
  --benchmark egoschema
```

EgoSchema 是长 egocentric 视频多选 QA；VideoLLaMA2-7B-16F 曾在 leaderboard 占据 ~7B 档前列，可与 [[long-video-retrieval-2023]] 的检索路线数字对照。

### 案例 4：decord 采帧 + lmms-eval 统一跑分

```bash
# 仓库内 eval/ 与 lmms-eval 二选一；横向对比建议后者
pip install -e . && cd ../lmms-eval && uv pip install -e ".[all]"

python -m lmms_eval \
  --model videollama2 \
  --model_args pretrained=DAMO-NLP-SG/VideoLLaMA2-7B-16F \
  --tasks mvbench,videomme,tempcompass \
  --batch_size 4 \
  --output_path ./vlm2_video_suite.json
```

lmms-eval 内部处理视频 I/O；训练脚本 `scripts/vllava/` 则用 [[decord]] 按 16F 均匀采帧——**推理帧数须与 checkpoint 名一致**。

## 与同类对比

| 模型 | 视觉 encoder | LLM | 音频 | 训练帧数 | 代码仓 |
|---|---|---|---|---:|---|
| **VideoLLaMA2** | CLIP / SigLIP | Mistral / Qwen2 | 2.1-AV 有 BEATs | 16 | 本仓 |
| [[llava-next]] OneVision | SigLIP 等 | Qwen2 | ✗ | 可变 | LLaVA-NeXT |
| [[qwen2-vl-2024]] | 内置 ViT | Qwen2 | 部分 | 动态 | transformers |
| [[video-llava-2024]] | CLIP + ABP | Vicuna | ✗ | 8/16 | 迁入 LLaVA-NeXT |
| [[videochat-2023]] | EVA / UMT | Vicuna | ✗ | 8 | Ask-Anything |

VideoLLaMA2 强项：**音视频联合（2.1-AV）** + **VideoLLaVA 数据即插即用**；弱项：无 OneVision 式 image→video 涌现叙事。

## 踩过的坑

1. **flash-attn 版本 pinned**：README 要求 `flash-attn==2.5.8`，随意升级常导致 CUDA 编译失败或注意力数值漂移。

2. **transformers 锁定 4.40.0**：复现论文需对齐版本；用最新 transformers 可能报 API 不兼容。

3. **HuggingFace 镜像**：国内下载 checkpoint 可在脚本里 `export HF_ENDPOINT=https://hf-mirror.com`。

4. **评测视频下载分散**：EgoSchema / VideoMME 等链接在 Google Drive / SharePoint，批量下载易断，建议按 benchmark 逐个准备。

5. **16F vs 8F 帧数配置**：checkpoint 名带 `16F` 表示训练时用 16 帧，推理时改帧数会影响分布，需与训练一致。

6. **CUDA 版本**：README 要求 CUDA >= 11.8，与 flash-attn 编译环境需一致。

## 适用 vs 不适用场景

**适用**：
- 本地跑通 Video-LLM 推理 / demo
- 复现 VideoLLaMA2 论文表格
- 在 VideoLLaVA 数据上训练自己的视频指令模型
- 音视频联合 QA（2.1-AV）

**不适用**：
- 极低显存（<16G）环境跑 7B-16F
- 只要图像理解（用 LLaVA 更轻）
- 生产级高并发 serving（Gradio demo 是研究用，商用需 vLLM 等改造）
- 需要最新一代（团队已推 VideoLLaMA3，2 代作基线阅读）

## 历史小故事（可跳过）

- **2023**：初代 Video-LLaMA 仓库（同团队）奠定音视频 LLM 方向
- **2024-06**：VideoLLaMA2 论文 + 代码发布，VideoMME leaderboard 登顶 ~7B 档
- **2024-10**：2.1 系列 SigLIP + Qwen2，AV 分支发布
- **2025-01**：VideoLLaMA3 接力，2 代仍是读文献时最常引用的可运行基线

## 学到什么

1. **开源 Video-LLM 的门槛在数据准备而非模型代码**：eval/ 目录的价值是把「去哪下视频」写死
2. **帧数命名写进 checkpoint 名**：16F/8F 是部署时必须尊重的训练契约
3. **国内团队偏好 Mistral/Qwen2 作 LLM 后端**：和 LLaVA 系的 Llama 形成生态分工
4. **Gradio serve 模块是论文 demo 的标配**：读懂 `videollama2/serve/` 就懂多 worker 推理架构
5. **MLVU / VideoMME 榜单位置是 7B 档卖点**：读 leaderboard 时核对参数量与帧数配置

## 延伸阅读

- 论文：[arXiv 2406.07476](https://arxiv.org/abs/2406.07476)
- HuggingFace Demo：spaces/lixin4ever/VideoLLaMA2
- AV Demo：spaces/lixin4ever/VideoLLaMA2-AV
- MSVC 数据集：HuggingFace DAMO-NLP-SG/Multi-Source-Video-Captioning
- [[video-llama-2023]] —— 前代论文
- [[video-llava-2024]] —— 同数据集竞争者

## 关联

- [[video-llama-2023]] —— 理论前驱
- [[video-llava-2024]] —— 同赛道对比（ABP vs 时空模块）
- [[videochat-2023]] —— 国内 Video-LLM 对话路线对照
- [[decord]] —— 视频采帧
- [[lmms-eval]] —— 另一套统一跑分入口
- [[tempcompass-2024]] —— 时序探针评测
- [[long-video-retrieval-2023]] —— 长视频检索路线对照（EgoSchema 数字可比）
- [[videomme-2024]] —— VideoMME 榜单对照
- [[mvbench-2023]] —— 时序专项 benchmark
- [[internvideo]] —— 工业级 encoder 对照
- [[llava-next]] —— 多模态统一仓库另一主线
- [[qwen2-vl-2024]] —— 2.1 系列采用 Qwen2 作 LLM 后端
- [[videoprism-2024]] —— 冻结 encoder 范式对照
- [[vid-llm-survey-2023]] —— 综述中的可运行实现索引
- [[llava]] —— LLaVA 图像侧起源；VideoLLaVA 数据同源
- [[clip]] —— 7B-16F 默认 CLIP ViT-L/14 视觉塔
- [[videochat2]] —— MVBench + 三阶段训练官方实现（待写）
- [[videollama3]] —— VideoLLaMA 3 续作官方仓（待写）
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cvat]] —— CVAT — 视频帧标注与半自动追踪的开源王者
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
