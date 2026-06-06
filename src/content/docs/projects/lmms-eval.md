---
title: LMMs-Eval — 多模态大模型统一评测框架
description: LMMs-Lab 维护的多模态统一评测 CLI；VideoMME / MVBench / TempCompass 等 100+ 任务、30+ 模型后端，LLaVA-NeXT 官方绑定
来源: 'https://github.com/EvolvingLMMs-Lab/lmms-eval'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

**LMMs-Eval**（Large Multimodal Models Evaluation）是 LMMs-Lab 维护的**开源多模态评测工具包**：一条 CLI 命令在 100+ 任务（含 VideoMME、MVBench、EgoSchema、TempCompass 等）上跑分，支持 30+ 模型后端（Qwen-VL、LLaVA、VideoLLaMA 等）。

日常类比：像高考 standardized test 的「阅卷中心」——你不用自己拼 30 套卷子、30 种答题卡格式；告诉它「考生是谁、考哪几科」，它统一出题、收卷、算分、出置信区间。

Quickstart（README 官方示例）：

```bash
git clone https://github.com/EvolvingLMMs-Lab/lmms-eval.git
cd lmms-eval && uv pip install -e ".[all]"

python -m lmms_eval \
  --model qwen2_5_vl \
  --model_args pretrained=Qwen/Qwen2.5-VL-3B-Instruct \
  --tasks mme \
  --batch_size 1 \
  --limit 8
```

打印 metrics 即说明环境 OK。

## 为什么重要

不理解 LMMs-Eval，Video-LLM 论文数字很难复现和对齐：

- **评测碎片化是行业痛点**：README 直言「两个团队同一模型同一 benchmark 常报不同分」——lmms-eval 用统一后处理和确定性 pipeline 对抗这个问题
- **LLaVA-NeXT 官方绑定**：LLaVA-NeXT README 写「开发时用的就是这套 eval」；读 Video-LLaVA / OneVision 论文应对照同一框架
- **视频任务一站式**：VideoMME、MVBench、EgoSchema、TempCompass、ActivityNet-QA 都能 `--tasks` 指定，不用每个 benchmark 克隆一份官方脚本
- **统计可信度**：v0.6+ 引入置信区间、paired t-test，不只看单点 accuracy

## 核心要点

1. **三原则：Reproducible / Efficient / Trustworthy**：同一配置多次跑分结果一致；async serving + 视频 I/O 优化（v0.7 TorchCodec 最高 3.58×）保 GPU 饱和；不只报 accuracy 还报统计显著性。

2. **任务即 YAML 插件**：`lmms_eval/tasks/` 下每个 benchmark 一个 task 定义；新数据集 onboarding 不用改核心引擎。`--tasks videomme,mvbench,tempcompass` 可组合。

3. **多推理后端**：原生 HuggingFace、vLLM、SGLang、OpenAI-compatible API 都有 `examples/models/` 脚本——本地 7B 和云端 GPT-4V 用同一套 task 定义横向比。

## 实践案例

### 案例 1：快速冒烟测 Qwen2.5-VL

```bash
python -m lmms_eval \
  --model qwen2_5_vl \
  --model_args pretrained=Qwen/Qwen2.5-VL-3B-Instruct \
  --tasks mme \
  --batch_size 1 \
  --limit 8
```

`--limit 8` 只跑 8 条样本验证链路；去掉 limit 即全量。适合新机器装完依赖后先确认 CUDA / 模型下载 / 视频解码都正常。

### 案例 2：视频 benchmark 组合跑分

```bash
python -m lmms_eval \
  --model llava_onevision \
  --model_args pretrained=lmms-lab/llava-onevision-qwen2-7b-ov \
  --tasks videomme,mvbench,egoschema \
  --batch_size 4 \
  --output_path ./results/ov_video.json
```

一条命令打出三个主流视频榜；`output_path` 存 JSONL 方便后续画表。论文里「我们在 VideoMME / MVBench / EgoSchema 上 SOTA」的复现入口通常就是这个模式。

### 案例 3：配合 TempCompass 测时序

```bash
python -m lmms_eval \
  --model videollama2 \
  --model_args pretrained=DAMO-NLP-SG/VideoLLaMA2-7B-16F \
  --tasks tempcompass \
  --batch_size 1
```

[[tempcompass-2024]] 论文提出的时序探针已集成进 task 列表；和 [[vid-llm-survey-2023]] 里列的 benchmark 对照，可诊断模型是真懂时序还是只靠单帧。

### 案例 4：decord 训练 + lmms-eval 验证闭环

```bash
# 训练侧（以 VideoLLaMA2 为例）：datasets/ 下视频由 decord 均匀采 16 帧
cd VideoLLaMA2 && bash scripts/vllava/finetune.sh

# 验证侧：同一 checkpoint 用 lmms-eval 打 TempCompass + VideoMME
python -m lmms_eval \
  --model videollama2 \
  --model_args pretrained=./checkpoints/videollama2-7b-16f \
  --tasks tempcompass,videomme \
  --batch_size 4 \
  --output_path ./results/post_finetune.json
```

改采帧策略（8→32 帧）后，**必须**用 lmms-eval 全量重跑才能和论文表对齐——只改 decord 索引不重跑 eval 会导致训练-评测分布漂移。

## 与同类对比

| 框架 | 任务数 | 视频榜 | 统计检验 | LLaVA 官方绑定 | 扩展方式 |
|---|---|---:|---|---|---|
| **LMMs-Eval** | 100+ | VideoMME/MVBench/EgoSchema/TempCompass | v0.6+ 置信区间 | ✓ LLaVA-NeXT 开发配套 | YAML task 插件 |
| 各 benchmark 官方脚本 | 1 | 单榜 | 通常无 | ✗ | 每榜 clone 一份 |
| VLMEvalKit | 80+ | 部分重叠 | 有限 | 部分 | Python 注册 |
| OpenCompass (MM 分支) | 多 | 有 | 有 | 部分 | 配置驱动 |

读 [[video-llava-2024]] / [[qwen2-vl-2024]] 论文数字时，优先用 lmms-eval 复现——后处理和选项匹配规则已统一，避免「同模型不同分」。

## 踩过的坑

1. **依赖版本敏感**：README 提醒 torch/cuda 版本差会导致 LLaVA-1.5 复现分数小幅波动——记录自己的 `torch==x.x` 再横向比。

2. **视频数据路径要手动准备**：lmms-eval 管跑分不管下载；VideoMME / EgoSchema 视频需按各 task 文档放到约定目录，否则报 file not found。

3. **`--limit` 误当正式结果**：冒烟用 limit，写论文得全量跑；limit 8 的分数没有统计意义。

4. **Java 8 依赖**：部分 caption 类任务（COCO 等）要 `java==1.8` 跑 pycocoeval，`conda install openjdk=8` 才能过。

## 适用 vs 不适用场景

**适用**：
- 复现 / 对比 Video-LLM 在主流视频榜上的分数
- 新模型发布前批量跑 10+ benchmark 出表
- 验证训练改动（新采帧策略、新 RoPE）的 ablation

**不适用**：
- 训练模型（这是纯 eval，不是训练框架）
- 极自定义企业内部私有数据集（需自己写 task YAML，有学习成本）
- 低延迟在线 A/B（面向离线批评测，不是 serving benchmark）

## 历史小故事（可跳过）

- **2024-03 v0.1**：随 LLaVA-NeXT 发布，LMMs-Lab 博客官宣
- **2024-06 v0.2**：加入视频评测（VideoMME、EgoSchema）
- **2025–2026 v0.5–0.7**：音频扩展、HTTP eval server、TorchCodec 视频 I/O、50+ 新 task
- **定位**：从「LLaVA 专用脚本」长成社区默认的 LMM 评测枢纽

## 学到什么

1. **评测基础设施和模型一样重要**：分数不可比时，整个研究方向会被噪声拖累
2. **CLI + task 插件是正确扩展性**：新 benchmark 来了加 YAML，不动核心
3. **统计显著性应成标配**：单点 accuracy 升 0.5% 可能是随机波动
4. **视频榜应用同一套后处理**：不同模型间分数可比的前提是 lmms-eval 统一了选项抽取和匹配规则

## 延伸阅读

- 官方文档：[docs/getting-started/quickstart.md](https://github.com/EvolvingLMMs-Lab/lmms-eval/tree/main/docs)
- 任务列表：[current_tasks.md](https://github.com/EvolvingLMMs-Lab/lmms-eval/blob/main/docs/advanced/current_tasks.md)
- v0.7 Release：TorchCodec 视频 I/O 与 Lance 分发说明
- [[tempcompass-2024]] —— 时序专项 benchmark 论文
- [[vid-llm-survey-2023]] —— benchmark 全景地图
- [视频理解阅读站](/study/stations/video-understanding/) — 阶段 3 评测论文链 + 跑分入口
- [MLLM 阅读站](/study/stations/mllm/) — 图像侧 MME/MMMU 评测交叉

## 关联

- [[llava-next]] —— 官方开发用的评测框架
- [[tempcompass-2024]] —— 集成的时序探针任务
- [[videollama2]] —— 可用 `--model videollama2` 直接跑分
- [[qwen2-vl-2024]] —— Qwen2-VL 论文数字的常用复现入口
- [[video-llava-2024]] —— Video-LLaVA 实验对照
- [[video-llama-2023]] —— Video-LLaMA 系列 leaderboard 复现入口
- [[videochat-2023]] —— VideoChat 系 benchmark 对照基线
- [[videomme-2024]] —— 2024+ Video-LLM 事实标准高考卷
- [[mvbench-2023]] —— 20 纯时序任务 + VideoChat2 三阶段对照
- [[internvideo]] —— InternVideo2 下游 benchmark 评测
- [[decord]] —— 视频帧 I/O（lmms-eval v0.7 亦支持 TorchCodec）
- [[internvideo2-2024]] —— InternVideo2 下游 task 复现
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[2d-tan-2019]] —— 2D-TAN — 用二维时间图做自然语言时刻检索
- [[countervqa-2025]] —— CounterVQA — 因果图驱动的反事实视频 VQA
- [[cover-2025]] —— COVER — 四象限反事实视频推理 benchmark
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[dense360-2025]] —— Dense360 — 全景 ERP 密集理解与 ERP-RoPE
- [[egoschema-2023]] —— EgoSchema — 三分钟第一视角长视频理解的诊断探针
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[flash-vstream-2024]] —— Flash-VStream — STAR 双进程记忆的低延迟长流理解
- [[grounded-videollm-2024]] —— Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM
- [[handbrake]] —— HandBrake — FFmpeg 上的 GUI 转码器
- [[hawkeye-2024]] —— HawkEye — 用递归缩窗把文本查询钉在长视频时间轴上
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-2024]] —— InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[librosa]] —— librosa — Python 音频分析库与 MFCC/STFT 事实标准
- [[livevlm-2025]] —— LiveVLM — 免训练流式视觉 token 压缩
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[llava-onevision-2024]] —— LLaVA-OneVision — 单图、多图、视频一个模型全搞定
- [[llava-video-2024]] —— LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[longvideobench-2024]] —— LongVideoBench — 一小时交织字幕视频的长上下文理解考卷
- [[longvila-2024]] —— LongVILA — 把 VILA 从 8 帧扩到 2048 帧的长视频全栈方案
- [[lvbench-2024]] —— LVBench — 平均 68 分钟、六维能力的长视频极限考
- [[mllm-benchmark-survey-2024]] —— MLLM Benchmark Survey — 200+ 多模态评测基准地图
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[mme-benchmark-2023]] —— MME Benchmark — 开源 MLLM 评测的事实起点
- [[mme-survey-2024]] —— MME-Survey — 多模态 LLM 怎么评才靠谱
- [[mmmu-2023]] —— MMMU — 大学级多学科多模态推理基准
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[omagent-2024]] —— OmAgent — 长视频分治 Agent 与回退检索
- [[omnidirectional-mllm-2025]] —— 全景空间推理 — MLLM 准备好面对 360° 了吗
- [[pillow]] —— Pillow — Python 图像处理库与 PIL 现代继任者
- [[qvhighlights-2021]] —— QVHighlights — 用自然语言查询在视频里找精彩瞬间
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[sharegpt4video-2024]] —— ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成
- [[shotcut]] —— Shotcut — 基于 MLT 的开源非线性编辑器
- [[streamingbench-2024]] —— StreamingBench — 流式视频理解的 18 任务在线大考
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[timechat-2024]] —— TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位
- [[torchcodec]] —— TorchCodec — PyTorch 原生 GPU 视频解码与张量输出
- [[trace-2024]] —— TRACE — 用因果事件链同时输出时间、精彩度与描述
- [[transformers-video]] —— Transformers Video — HuggingFace 视频处理器与多模态输入管线
- [[ultralytics]] —— Ultralytics — YOLOv8/v11 实现
- [[univtg-2023]] —— UniVTG — 把视频时刻定位、高光检测、摘要合成一套框架
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videoagent-longform-2024]] —— VideoAgent (Wang) — LLM Agent 迭代选帧理解长视频
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videochat-flash-2025]] —— VideoChat-Flash — 分层压缩，让长视频理解又快又准
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解
- [[videollama3]] —— VideoLLaMA3 — 阿里达摩院第三代图像/视频多模态基座
- [[videollama3-2025]] —— VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
- [[videollm-online-2024]] —— VideoLLM-online — 流式视频对话的 LIVE 框架
- [[videomme-2024]] —— Video-MME — 视频多模态大模型的「高考卷」
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务
- [[vinoground-2024]] —— Vinoground — 时序反事实短视频探针
- [[vllm-multimodal]] —— vLLM Multimodal — 多模态与视频 URL 高吞吐推理服务
- [[vsi-bench-2024]] —— VSI-Bench — 用室内漫游视频考视频大模型的空间智商
- [[vslnet-2020]] —— VSLNet — 用 span-based QA 做自然语言视频定位
- [[vtg-llm-2024]] —— VTG-LLM — 绝对时间 token + VTG-IT-120K，让 Video LLM 精确定位时刻
- [[vtimellm-2023]] —— VTimeLLM — 让 Video LLM 学会标出事件起止时间
- [[worldsense-2025]] —— WorldSense — 真实世界同步音视频理解 benchmark
- [[yt-dlp]] —— yt-dlp — youtube-dl 活跃分支与万能站点视频下载器

