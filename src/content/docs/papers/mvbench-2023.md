---
title: MVBench — 二十道题拆穿视频大模型真懂还是装懂
来源: 'Li et al., "MVBench: A Comprehensive Multi-modal Video Understanding Benchmark", arXiv 2023'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

MVBench（Multi-modal Video Benchmark）是 2023 年 11 月发布的**视频理解综合评测集**：把「看视频答题」拆成 **20 种能力任务**（动作顺序、物体计数、场景变换、反事实推理等），每题都是四选一选择题，专门考验模型有没有**时序与因果**理解，而不只是认静态画面。

日常类比：以前的视频 QA 像问「这张图里有没有狗？」——暂停某一帧就能答。MVBench 像连续播放短片后问「狗是先进门还是先叫？」「杯子被拿了几次？」——必须真看完整段视频的时间线。

同篇论文还提出 **VideoChat2**：三阶段训练（大规模图文对齐 → 视频指令微调 → 多任务联合），在 MVBench 上大幅超过 Video-ChatGPT、VideoChat 等同期模型。MVBench 因此既是 benchmark，也是 VideoChat2 的「成绩单」。

## 为什么重要

不理解 MVBench，下面这些事说不清：

- 为什么 2024 年 VideoMME、MLVU 还要再建更大 benchmark——MVBench 首次证明「总准确率」不够，必须按**能力维度**拆开看短板
- 为什么工业界开始强调 static-to-dynamic gap——MVBench 里大量题目**单帧 CLIP 特征答不对**，直接量化了这个鸿沟
- 为什么 VideoChat2 的三阶段训练成为后续模板——它在 MVBench 20 任务上平均 51+ 分，比 Video-ChatGPT 的 ~33 分拉开明显差距
- 为什么 TempCompass、LongVideoBench 会接力出现——MVBench 题量有限（约 4K 题），需要更长视频、更细时序粒度

## 核心要点

1. **20 任务 = 20 种「看视频必须会的能力」**：涵盖 Action Sequence、Action Count、Scene Transition、Object Existence、Counterfactual 等。每类用程序化或模板化方式从现有视频数据集（如 STAR、Perception Test）**自动生成**选择题，降低人工标注成本。类比：不是一套卷子考所有科，而是 20 科各有模拟卷。

2. **static-to-dynamic 设计哲学**：许多题目故意让「只看中间一帧」的模型选错，必须比较帧间差异才能答对。这直接把评测焦点从「图像识别 + 语言」推向「时间推理 + 语言」。

3. **VideoChat2 三阶段训练**：Stage1 大规模图像-文本对齐（继承 BLIP-2 / MiniGPT-4 思路）；Stage2 视频指令微调；Stage3 在 MVBench 各任务上联合微调。评测时用「Best option: (」提示格式，把开放生成变成稳定四选一，减少 LLM 输出格式噪声。

## 实践案例

### 案例 1：MVBench 任务类型长什么样

```
任务示例（概念化）：

Action Sequence（动作顺序）：
  视频：人先坐下 → 再拿杯子 → 再喝水
  问题：哪个顺序正确？
  A. 拿杯→坐下→喝水  B. 坐下→拿杯→喝水  ✓
  C. 喝水→坐下→拿杯  D. 坐下→喝水→拿杯

Action Count（动作计数）：
  视频：同一人拍手 3 次
  问题：拍手几次？ A.1 B.2 C.3✓ D.4

Counterfactual（反事实）：
  视频：球没进网
  问题：如果球进了网，结果？（测因果推理）
```

### 案例 2：VideoChat2 在 MVBench 上的提示格式

```python
# 论文表格：开放 prompt vs 选择题 prompt
# VideoChatGPT 开放生成 Hit Ratio 64.6%，Avg 22.0
# 加 "Best option: (" 后 Hit 100%，Avg 32.8

prompt = (
    "Watch the video and answer.\n"
    f"Question: {question}\n"
    "Options:\n"
    + "\n".join(f"({chr(65+i)}) {opt}" for i, opt in enumerate(options))
    + "\nBest option: ("
)
# 模型只需补一个字母 A/B/C/D，评测稳定
```

### 案例 3：用 LMMs-Eval 跑 MVBench 子集

```bash
# 伪命令：lmms-eval 已集成 MVBench 多个 task
lmms_eval --model video_llava \
  --tasks mvbench_action_sequence,mvbench_scene_transition \
  --batch_size 1

# 输出按 20 任务分别报告 accuracy，便于画雷达图找短板
```

## 踩过的坑

1. **选择题格式掩盖生成质量**：Hit Ratio 100% 只说明模型会选字母，不代表开放对话更好——开放问答仍可能胡编。

2. **短视频片段为主**：多数 clip 仅数秒到数十秒，对小时级长视频泛化未验证；LongVideoBench 后来补这条。

3. **程序化出题有分布偏差**：模板题可能和训练数据泄漏重叠，高分不完全等于真实场景鲁棒。

4. **VideoChat2 与 MVBench 同文发布**：baseline 对比有「为自己出题」嫌疑，读数时应对照第三方复现（LMMs-Eval）。

## 适用 vs 不适用场景

**适用**：
- 对比 Video LLM 的**时序推理**能力，画 20 维雷达图
- 筛选模型上线前的「必挂题类型」（如 Counterfactual、Action Count）
- 研究三阶段训练 / 指令格式对多选准确率的影响

**不适用**：
- 开放域长视频叙事理解（题太短、太结构化）
- 需要精确时间戳定位的 dense captioning
- 多语言视频（MVBench 以英文为主）

## 历史小故事（可跳过）

- **2023-11-28**：arXiv 2311.17005 上传，标题含 MVBench + VideoChat2
- **2024 初**：MVBench 被 LMMs-Eval、OpenCompass 等框架收录，成为 Video LLM 标配榜
- **2024 中**：VideoMME、MLVU 发布，题量更大；MVBench 仍因 20 任务细粒度被引用
- **2025**：TempCompass、WorldSense 等继续拆时序子能力，可视为 MVBench 精神后继
- **社区**：HuggingFace 镜像了部分 MVBench 子集，方便本地快速冒烟测试

## 学到什么

1. **视频评测必须「动态化」**——能答静态图题的模型，未必能答 MVBench
2. **按能力拆任务比单一准确率更有指导意义**——知道挂在 Action Count 还是 Scene Transition，才知道改数据还是改架构
3. **评测 prompt 格式是分数的一部分**——四选一 + 「Best option:」是稳定测 LLM 视频理解的可复现技巧
4. **benchmark 与强 baseline 同发要交叉验证**——用第三方框架复现才能信
5. **20 任务雷达图适合产品选型**——上线前看模型在哪几个 task 崩盘，比只看一个总分更实用
6. **与 VideoMME 互补使用**——MVBench 看细粒度能力，VideoMME 看综合长视频表现

## 延伸阅读

- 论文 PDF：[arXiv 2311.17005](https://arxiv.org/abs/2311.17005)
- 对比基线：[[video-chatgpt-2023]] —— MVBench 主要超越对象之一
- 同期对话：[[videochat-2023]] —— VideoChat2 的直接前身路线
- 更大榜单：[[videomme-2024]] —— 900 题跨 6 领域长视频
- 时序专测：[[tempcompass-2024]] —— 比 MVBench 更聚焦时间语义

## 关联

- [[video-chatgpt-2023]] —— 主要对比 baseline；MVBench 暴露其时空池化短板
- [[videochat-2023]] —— VideoChat 第一代；VideoChat2 是其升级版
- [[video-llava-2024]] —— 另一路线在 MVBench 子任务上的竞品
- [[videomme-2024]] —— 更大规模评测，承接 MVBench 思路
- [[mlvu-2024]] —— 多维度长视频理解 benchmark 姊妹
- [[tempcompass-2024]] —— 时序理解专精评测
- [[vid-llm-survey-2023]] —— 综述引用 MVBench 定义 static-to-dynamic gap
- [[lmms-eval]] —— 跑 MVBench 20 任务的统一入口
- [[llava]] —— VideoChat2 Stage1 图文对齐依赖 LLaVA 类数据
- [[decord]] —— 评测管线视频解码
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chat-univi-2023]] —— Chat-UniVi — 动态视觉 token 统一图像与视频对话
- [[countervqa-2025]] —— CounterVQA — 因果图驱动的反事实视频 VQA
- [[cover-2025]] —— COVER — 四象限反事实视频推理 benchmark
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[longvideobench-2024]] —— LongVideoBench — 一小时交织字幕视频的长上下文理解考卷
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[streamingbench-2024]] —— StreamingBench — 流式视频理解的 18 任务在线大考
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解
- [[videomme-2024]] —— Video-MME — 视频多模态大模型的「高考卷」
- [[vinoground-2024]] —— Vinoground — 时序反事实短视频探针
- [[vsi-bench-2024]] —— VSI-Bench — 用室内漫游视频考视频大模型的空间智商
- [[worldsense-2025]] —— WorldSense — 真实世界同步音视频理解 benchmark

