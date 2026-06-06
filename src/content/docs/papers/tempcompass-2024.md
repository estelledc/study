---
title: TempCompass — 专门拆穿 Video LLM 有没有真懂时间
来源: 'Liu et al. TempCompass - Do Video LLMs Really Understand Videos. arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

TempCompass 是一个**专门评测 Video LLM 时序理解能力**的 benchmark，核心问题就一句：这些模型是真的懂视频里的时间变化，还是只靠单帧图像理解在「猜」？

日常类比：普通 VideoQA 像问「这张图里有什么」——模型看中间一帧就能蒙对。TempCompass 像考驾照科目三：必须区分「车是在加速还是减速」「方向盘往左还是往右」「事件发生的先后顺序」——单帧根本答不了。

数据集覆盖 **5 个时序维度**（速度、方向、动作变化、事件顺序、属性变化）× **4 种任务格式**（多选、判断、字幕匹配、Caption 排序），并对 8 个 Video LLM + 3 个 Image LLM 做了系统评测。结论扎眼：**多数 Video LLM 在时序维度上并不比「只喂中间一帧的 Image LLM」强多少**。

## 为什么重要

不了解 TempCompass，下面这些事容易误判：

- 为什么 MSRVTT-QA 高分不代表模型懂视频——很多问题单帧 + 常识就能答对
- 为什么「均匀采 8 帧」的 Video LLM 和「只取中间 1 帧」的 LLaVA 分数接近——说明多帧没有带来预期的时序收益
- 为什么评测要拆成 speed / direction / order 等子维度——合并成一个 accuracy 会掩盖模型在「方向感」上的全面崩溃
- 为什么后续 Qwen2-VL、TempCompass 续作都在强化 M-RoPE / 时序专项训练——这篇 benchmark 第一次量化了缺口

## 核心要点

1. **五维时序感知**：Speed（快慢）、Direction（运动方向）、Action（动作类型变化）、Event（事件先后）、Attribute（属性随时间变化）。每个维度单独出题，避免「总分会掩盖短板」——论文发现模型往往在 Direction 和 Event Order 上最差。

2. **四种任务格式**：Multi-choice QA、Yes/No、Caption Matching（哪句描述匹配视频）、Captioning（给乱序字幕排序）。同一视频片段用不同问法测，减少「模型只会做选择题」的偏差。

3. **Image LLM 对照组**：LLaVA-1.5、SPHINX、Qwen-VL 只喂**中间一帧**。若 Video LLM 只比它们高几个点，说明多帧 pipeline 几乎没有转化为时序理解力——这是 TempCompass 最有冲击力的发现。

## 实践案例

### 案例 1：用 lmms-eval 跑 TempCompass

```bash
pip install lmms-eval

python -m lmms_eval \
  --model qwen2_vl \
  --model_args pretrained="Qwen/Qwen2-VL-7B-Instruct" \
  --tasks tempcompass \
  --batch_size 1 \
  --output_path ./results/tempcompass

# 输出按 5 个维度分别报告 accuracy
# speed / direction / action / event / attribute
```

### 案例 2：多选 vs 中间帧对照（论文思路）

```python
# 同一视频片段，两种喂法对比
video_path = "ball_rolling_left.mp4"

# Video LLM：均匀 8 帧
video_answer = video_llm.chat(video_path, n_frames=8,
    question="球是向左滚还是向右滚？")

# Image LLM：仅中间帧
mid_frame = extract_middle_frame(video_path)
image_answer = llava.chat(mid_frame,
    question="球是向左滚还是向右滚？")

# TempCompass 发现：两者在 direction 维度差距 often < 5%
# 说明 Video LLM 没有真正利用帧间运动信息
```

### 案例 3：Caption Ordering 任务格式

```
给定视频 + 4 句乱序字幕：
  A: "男人关上了门"
  B: "男人走进了房间"
  C: "男人拿起了钥匙"
  D: "男人打开了灯"

任务：排出正确时间顺序 -> B, C, A, D

这需要理解事件因果链，单帧 Image LLM 几乎随机猜；
Video LLM 略好但仍远低于人类。
```

## 踩过的坑

1. **不要用 TempCompass 总分替代通用 VideoQA**：它只测时序，不测物体识别、场景描述——高分 TempCompass 不等于通用视频理解 SOTA。

2. **推理设置影响大**：论文 Table 7 显示各模型 temperature、top-p、采帧策略不同，横向对比要严格对齐 inference config，否则结论不可靠。

3. **短视频片段仍可能「静态作弊」**：Attribute 变化类问题有时靠最后一帧状态就能猜，出题方需配合动态 mask 才更严——benchmark 自身也有局限。

4. **模型快速迭代使榜单过时**：2024 年初测的 Video-LLaMA-13B 分数到 2025 年参考价值下降——应用 TempCompass 测新模型时以子维度趋势为主，别死记旧榜单。

## 适用 vs 不适用场景

**适用**：
- 评估新 Video LLM 的时序理解是否真进步
- 对比「加 M-RoPE / 时序模块」前后的 ablation
- 写论文 Related Work 时引用「Video LLM 时序短板」的实证

**不适用**：
- 评测长视频理解（片段通常较短，无法暴露「检索 + 时序」复合难题）
- 评测音频理解（TempCompass 无音频轨，音视频模型需另跑 AudioBench）
- 替代 MSVD-QA / VideoMME 等通用 benchmark（TempCompass 是专项探针，不是全能榜）

## 历史小故事（可跳过）

- **2024-03**：TempCompass 上传 arXiv，同期 Video LLM 爆发但评测滞后
- **2024**：被 Vid-LLM Survey v3+ 引用为时序评测代表；lmms-eval 集成 tempcompass 任务
- **2024–2025**：Qwen2-VL、LLaVA-OneVision 等把 TempCompass 列入标准 eval suite，推动 M-RoPE 类设计普及
- **启示**：这篇 benchmark 直接催生了「时序专项训练」和「中间帧对照实验」成为论文标配

## 学到什么

1. **高 VideoQA 分可能是幻觉**：合并准确率会掩盖「模型只靠单帧」——评测必须拆维度
2. **多帧 != 时序理解**：采 8 帧但无显式时序建模，和 1 帧差距可能极小
3. **任务格式要多样**：只做 multi-choice 会让模型学会排除法而非真正理解
4. **Benchmark 要和对照组一起读**：Image LLM 中间帧对照是 TempCompass 方法论的灵魂
5. **子维度分数比总分更有诊断价值**：Direction 和 Event Order 往往是全军覆没的维度，合并 accuracy 会误导产品选型

## 延伸阅读

- 论文 PDF：[arXiv 2403.00476](https://arxiv.org/abs/2403.00476)
- 数据集与代码：[TempCompass GitHub](https://github.com/llyx97/TempCompass)
- 对照 benchmark：MVBench（动作理解）、Video-MME（综合长视频）——TempCompass 专补「纯时序」维度
- [[vid-llm-survey-2023]] —— 综述中的 benchmark 章节；TempCompass 填补其时序细粒度空白
- [[lmms-eval]] —— 跑 TempCompass 的推荐框架；`--tasks tempcompass` 一行接入

## 关联

- [[vid-llm-survey-2023]] —— 全景地图；TempCompass 是地图里「评测」节点的时序专项
- [[video-llava-2024]] —— 被评测模型之一；ABP 不保证时序理解
- [[qwen2-vl-2024]] —— M-RoPE 设计的动机之一来自此类 benchmark 暴露的缺口
- [[long-video-retrieval-2023]] —— 解决「找对片段」；TempCompass 测「理解时序」——互补
- [[videochat-2023]] —— 强调时序推理训练；TempCompass 可验证其声称是否落地
- [[lmms-eval]] —— 生产级跑分入口
- [[internvideo]] —— 强视频 encoder 在 TempCompass 上仍可能输给中间帧对照——说明 encoder 不等于时序
- [[videollama2]] —— 被评测的 Video-LLM 实现之一；跑 TempCompass 可验证其时空建模是否落地
- [[llava-next]] —— LLaVA-Video 主线仓库；TempCompass 是验证其视频分支时序能力的标准探针
- [[video-llama-2023]] —— 声称时序推理训练；本 benchmark 可验证是否落地
- [[videoprism-2024]] —— 强 encoder 仍可能输给中间帧对照——encoder ≠ 时序
- [[vid-llm-survey-2023]] —— 评测章节在综述中的定位
- [[decord]] —— 固定帧采样策略影响 TempCompass 分数
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[2d-tan-2019]] —— 2D-TAN — 用二维时间图做自然语言时刻检索
- [[chapter-llama-2025]] —— Chapter-Llama — 语音引导采帧，一小时视频一次前向切章节
- [[chat-univi-2023]] —— Chat-UniVi — 动态视觉 token 统一图像与视频对话
- [[countervqa-2025]] —— CounterVQA — 因果图驱动的反事实视频 VQA
- [[cover-2025]] —— COVER — 四象限反事实视频推理 benchmark
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[egoschema-2023]] —— EgoSchema — 三分钟第一视角长视频理解的诊断探针
- [[grounded-videollm-2024]] —— Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM
- [[hawkeye-2024]] —— HawkEye — 用递归缩窗把文本查询钉在长视频时间轴上
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-2024]] —— InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[llava-onevision-2024]] —— LLaVA-OneVision — 单图、多图、视频一个模型全搞定
- [[llmvs-2025]] —— LLMVS — 用 LLM 语义裁判给视频帧打分做摘要
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[longvideobench-2024]] —— LongVideoBench — 一小时交织字幕视频的长上下文理解考卷
- [[longvila-2024]] —— LongVILA — 把 VILA 从 8 帧扩到 2048 帧的长视频全栈方案
- [[lvbench-2024]] —— LVBench — 平均 68 分钟、六维能力的长视频极限考
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[qvhighlights-2021]] —— QVHighlights — 用自然语言查询在视频里找精彩瞬间
- [[qwen2-5-vl-2025]] —— Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[sharegpt4video-2024]] —— ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成
- [[streamingbench-2024]] —— StreamingBench — 流式视频理解的 18 任务在线大考
- [[timechat-2024]] —— TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位
- [[timemarker-2024]] —— TimeMarker — 时间分隔符 + 任意长度采帧的视频定位大模型
- [[trace-2024]] —— TRACE — 用因果事件链同时输出时间、精彩度与描述
- [[transformers-video]] —— Transformers Video — HuggingFace 视频处理器与多模态输入管线
- [[traveler-2024]] —— TraveLER — 四段式多 Agent，帧级问答看懂长视频
- [[univtg-2023]] —— UniVTG — 把视频时刻定位、高光检测、摘要合成一套框架
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videoagent-memory-2024]] —— VideoAgent（Fan）— 双记忆 + 四工具，长视频逼近 Gemini
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videochat-flash-2025]] —— VideoChat-Flash — 分层压缩，让长视频理解又快又准
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama3]] —— VideoLLaMA3 — 阿里达摩院第三代图像/视频多模态基座
- [[videomme-2024]] —— Video-MME — 视频多模态大模型的「高考卷」
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务
- [[vinoground-2024]] —— Vinoground — 时序反事实短视频探针
- [[vllm-multimodal]] —— vLLM Multimodal — 多模态与视频 URL 高吞吐推理服务
- [[vsi-bench-2024]] —— VSI-Bench — 用室内漫游视频考视频大模型的空间智商
- [[vslnet-2020]] —— VSLNet — 用 span-based QA 做自然语言视频定位
- [[vtg-llm-2024]] —— VTG-LLM — 绝对时间 token + VTG-IT-120K，让 Video LLM 精确定位时刻
- [[vtimellm-2023]] —— VTimeLLM — 让 Video LLM 学会标出事件起止时间
- [[worldsense-2025]] —— WorldSense — 真实世界同步音视频理解 benchmark

