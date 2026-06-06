---
title: Video-MME — 视频多模态大模型的「高考卷」
来源: 'Fu et al., "Video-MME: The First-Ever Comprehensive Evaluation Benchmark of Multi-modal LLMs in Video Analysis", CVPR 2025'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

Video-MME 是 2024 年发布的**视频多模态大模型综合评测 benchmark**：从 YouTube 人工精选 **900 段真实视频**（总时长约 254 小时），每段配 **3 道四选一选择题**，共 **2,700 题**；覆盖 **6 大视觉领域**、**30 个子类**，视频时长从 **11 秒到 1 小时**分短/中/长三档，并可选用**字幕与音频**作为额外输入。

日常类比：以前的 VideoQA 像期中测验——短视频、单一题型、总分一锤定音。Video-MME 像高考：科目多（知识、影视、体育、艺术表演、生活记录、多语言）、卷子分短中长三卷、还能开「字幕辅助」和「听力题」——想自称「懂视频」的模型，都得来这儿考一遍。

论文在 CVPR 2025 接收；评测了 GPT-4V/o、Gemini 1.5 Pro 以及 LLaVA-NeXT-Video 等开源模型，成为 2024 年后 Video-LLM 论文的**事实标准榜**之一。

## 为什么重要

不了解 Video-MME，下面这些事容易误判：

- 为什么 2024 年后论文几乎必报「VideoMME 分数」——它首次把**开放域 + 多时长 + 多模态**放进同一套人工标注题里，可比性远超 MSVD-QA
- 为什么「MSRVTT-QA 90%」和「VideoMME 50%」可以并存——前者平均 15 秒短视频，后者含 30–60 分钟长片，测的不是同一难度
- 为什么工业界开始强调字幕/音频分支——Video-MME 实验证明加字幕可给 Gemini 1.5 Pro 再涨约 6 个点，长视频收益更明显
- 为什么 MVBench、TempCompass 仍要保留——Video-MME 看综合长视频表现，MVBench 拆 20 种细粒度能力，TempCompass 专拆时序——三者互补而非替代

## 核心要点

1. **六域三十类，覆盖真实 YouTube 生态**：Knowledge（天文、科技、纪录片）、Film & Television、Sports Competition、Artistic Performance、Life Record、Multilingual 等。类比：不是只考「体育集锦」，而是把用户日常会刷的频道类型都采样一遍，防止模型只在某一类视频上刷分。

2. **短 / 中 / 长三档时长（各 300 段）**：Short < 2 分钟，Medium 4–15 分钟，Long 30–60 分钟；每档 900 题中的 300 题。论文发现：**视频越长，所有模型准确率普遍下滑**——长视频是当前 MLLM 的共性瓶颈，不是某一家的问题。

3. **帧 + 字幕 + 音频的三模态评测**：除均匀采帧外，可喂整段字幕（长视频字幕可达数千词）和音轨。Gemini 1.5 Pro 在长视频上加字幕提升约 9 点、加音频约 7 点——说明「只看几帧」会丢掉大量信息，多模态输入是长视频理解的刚需。

## 实践案例

### 案例 1：用 LMMs-Eval 跑 VideoMME

```bash
pip install lmms-eval

python -m lmms_eval \
  --model llava_vid \
  --model_args pretrained="llava-hf/LLaVA-NeXT-Video-7B-hf" \
  --tasks videomme \
  --batch_size 1 \
  --output_path ./results/videomme

# 输出含 short / medium / long 分项 accuracy
# 以及 w/o subs vs w/ subs（若模型支持字幕输入）
```

一行命令打出三档时长分数；论文对比时务必对齐**采帧数**（如 LLaVA-NeXT-Video 用 32 帧、GPT-4o 用 10 帧），否则横向不可比。

### 案例 2：按时长分层读榜（论文 Table 4 思路）

```
模型示例（仅帧，无字幕）：

                    Short   Medium   Long   Overall
Gemini 1.5 Pro      82.3%   75.3%   67.5%   75.7%
GPT-4o              77.1%   62.1%   59.2%   66.2%
LLaVA-NeXT-Video    63.1%   51.1%   44.6%   52.5%
Video-LLaVA         45.9%   38.1%   37.3%   40.4%

读法：Long 列掉分最严重 → 产品若处理会议录像/课程，别看 Overall 自嗨
```

### 案例 3：Certificate Length（证明「必须真看视频」）

```python
# 论文借鉴 EgoSchema 的 certificate 概念：
# 答对一题所需的最短视频片段总时长

# Video-MME 中位数 certificate length：
#   Short  ~26s
#   Medium ~167s
#   Long   ~891s

# 对比 EgoSchema 平均视频 180s —— Video-MME 中长/长档
# 要求模型消化数分钟到十几分钟的有效片段，单帧「静态作弊」更难
```

出题后还用 Gemini 1.5 Pro **只看题干、不看视频**过滤——纯文本能答对的题会被打回重做，保证「必须看视频」。

## 踩过的坑

1. **把 900 理解成 900 道题**：实际是 900 视频 × 3 题 = 2700 QA；报分时用 Overall accuracy，别和视频数混淆。

2. **忽略采帧策略差异**：各模型官方帧数从 4 到 64 不等，复现时不对齐 inference config，榜单数字没有参考价值。

3. **只看总分不看 Long 列**：Overall 52% 的模型可能在 Long 上只有 37%——长视频场景选型必看分项。

4. **字幕收益因领域而异**：多语言类加字幕提升可达 16+ 点，体育类有时反降——不能假设「加字幕一定涨分」。

## 适用 vs 不适用场景

**适用**：
- 对比 Video LLM / 图像 MLLM 的**综合视频理解**能力（论文证明图像模型多帧喂入也能考）
- 评估长视频（30–60 分钟）理解是否达标
- 测试「帧 + 字幕 + 音频」多模态融合收益
- 写论文 Related Work 时引用「当前 SOTA 在开放域长视频上的位置」

**不适用**：
- 专测纯时序推理细粒度（用 [[tempcompass-2024]] 或 [[mvbench-2023]] 更合适）
- 开放域对话质量 / GPT-4 裁判式打分（Video-MME 全是四选一，不测生成流畅度）
- 低算力快速冒烟（900 段真实长视频解码 + 多帧推理成本高）
- 非英文多语言内容为主的产品（Multilingual 子集占比有限）

## 历史小故事（可跳过）

- **2024-05**：arXiv 2405.21075 上传，USTC / XMU / HKU 等多校联合；项目页 [video-mme.github.io](https://video-mme.github.io)
- **2024 中**：GitHub [MME-Benchmarks/Video-MME](https://github.com/MME-Benchmarks/Video-MME) 开源数据与评测脚本；[[lmms-eval]] 集成 `videomme` 任务
- **2024–2025**：Qwen2-VL、VideoLLaMA2、LLaVA-NeXT-Video 等把 VideoMME 列入标准 eval suite，工业论文几乎必报
- **CVPR 2025**：正式接收；与 MLVU、EgoSchema 并列成为长视频评测三件套
- **社区观察**：Gemini 1.5 Pro 长上下文 + 全字幕策略在榜上一度领先，推动「小时级视频」成为下一代模型卖点

## 学到什么

1. **视频评测必须分时长报分**——合并 Short/Medium/Long 会掩盖长视频崩盘，产品选型要看 Long 列
2. **人工标注 + 纯文本过滤**是保证「必须看视频」的有效手段——自动出题 benchmark 容易泄漏常识答案
3. **多模态不是噱头**——字幕和音频对长视频、多语言、知识类视频的增益有论文级实证
4. **图像 MLLM 也能考视频榜**——多帧图像模型与专用 Video LLM 分数接近，说明视频理解仍 heavily 依赖静态视觉底座
5. **benchmark 会塑造研究方向**——Video-MME 的长视频短板直接催生了 MLVU、StreamingBench 等后继工作

## 延伸阅读

- 论文 PDF：[arXiv 2405.21075](https://arxiv.org/abs/2405.21075)
- 项目主页：[Video-MME](https://video-mme.github.io/home_page.html)
- 数据与评测：[MME-Benchmarks/Video-MME](https://github.com/MME-Benchmarks/Video-MME)
- 统一跑分：[[lmms-eval]] —— `--tasks videomme` 一行接入
- 细粒度对照：[[mvbench-2023]]（20 任务）、[[tempcompass-2024]]（五维时序）
- 姊妹长视频榜：[[mlvu-2024]]、EgoSchema（待写笔记）

## 关联

- [[mvbench-2023]] —— 细粒度 20 任务雷达图；Video-MME 看综合长视频，MVBench 看能力拆解
- [[tempcompass-2024]] —— 时序专测；Video-MME 含时序题但非唯一焦点
- [[lmms-eval]] —— 生产级跑分入口；VideoMME 是核心 video task 之一
- [[qwen2-vl-2024]] —— 工业模型在 VideoMME 上的对标对象；动态分辨率 + M-RoPE 路线
- [[llava-next]] —— LLaVA-NeXT-Video 是论文主要开源竞品之一
- [[videollama2]] —— 7B 档开源模型常报 VideoMME 分数的复现仓库
- [[vid-llm-survey-2023]] —— 综述 benchmark 章节；Video-MME 填补长视频综合评测空白
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[countervqa-2025]] —— CounterVQA — 因果图驱动的反事实视频 VQA
- [[cover-2025]] —— COVER — 四象限反事实视频推理 benchmark
- [[flash-vstream-2024]] —— Flash-VStream — STAR 双进程记忆的低延迟长流理解
- [[hour-llava-2025]] —— Hour-LLaVA — 记忆增强，让 LLaVA 读懂一小时视频
- [[llama-vid-2023]] —— LLaMA-VID — 每帧两枚 token，把小时级视频塞进 LLM
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[llava-video-2024]] —— LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[nvila-2024]] —— NVILA — 先放大分辨率再压缩 token 的高效 VLM
- [[qvhighlights-2021]] —— QVHighlights — 用自然语言查询在视频里找精彩瞬间
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[ta-stvg-2025]] —— TA-STVG — 解耦「找谁 / 何时 / 何地」的时空视频定位
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[timemarker-2024]] —— TimeMarker — 时间分隔符 + 任意长度采帧的视频定位大模型
- [[trace-2024]] —— TRACE — 用因果事件链同时输出时间、精彩度与描述
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解
- [[videollama3-2025]] —— VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
- [[vinoground-2024]] —— Vinoground — 时序反事实短视频探针
- [[vllm-multimodal]] —— vLLM Multimodal — 多模态与视频 URL 高吞吐推理服务
- [[vtimellm-2023]] —— VTimeLLM — 让 Video LLM 学会标出事件起止时间
- [[worldsense-2025]] —— WorldSense — 真实世界同步音视频理解 benchmark

