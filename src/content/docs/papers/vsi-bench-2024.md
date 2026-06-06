---
title: VSI-Bench — 用室内漫游视频考视频大模型的空间智商
来源: 'Yang et al., "Thinking in Space: How Multimodal Large Language Models See, Remember, and Recall Spaces", CVPR 2025 / arXiv 2412.14171'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

VSI-Bench（Visual-Spatial Intelligence Benchmark）是 NYU Vision X 团队在 2024 年 12 月发布的**视频空间智能评测集**：让人拿着手机在室内走一圈录成视频，再让多模态大模型（MLLM）看完视频后回答「房间多大」「沙发在冰箱哪边」「先看到门还是先看到窗」这类问题——专门考模型能不能像人一样**在脑子里建一张空间地图**。

日常类比：以前的视频 benchmark 像问「视频里有没有猫？」——认物体就行。VSI-Bench 像你第一次去朋友家，只跟着主人走一圈，然后闭着眼回答「厨房到卧室大概几步」「洗衣机在阳台左边还是右边？」——必须**记住布局、估距离、换视角**，比认动作难一个量级。

数据来自 ScanNet / ScanNet++ / ARKitScenes 的 288 段真实室内漫游视频，共 **5000+ 道 QA**，分 **8 类任务**（物体计数、相对距离/方向、路线规划、物体/房间尺寸、绝对距离、出现顺序）。同篇论文还测了 15 个视频 MLLM，发现最强模型仍比人类低 30+ 个百分点，且**链式思考（CoT）帮不上忙，画认知地图反而有用**。

## 为什么重要

不理解 VSI-Bench，下面这些事说不清：

- 为什么 2025 年机器人、AR/VR 开始强调「空间智能」而不只是「看懂视频」——VSI-Bench 第一次把**配置关系 + 尺度估计 + 时空记忆**放进同一套视频考卷
- 为什么 Gemini-1.5 Pro 在一般视频 QA 很强，却在空间任务上仍远低于人类——论文量化出**空间推理**才是主瓶颈，不是语言或单帧视觉
- 为什么 MVBench / TempCompass 测不过的短板，VSI-Bench 还能继续拆——它考的是**自我中心视频 →  allocentric 心理地图**的转换，和纯时序题不同
- 为什么「让模型先画地图再答题」会成为新 prompt 技巧——VSI-Bench 实验证明认知地图能提升**距离估计**类题目

## 核心要点

1. **八任务 × 三能力轴**：配置类（object count、relative distance/direction、route plan）考空间布局；测量类（object size、room size、absolute distance）考数值尺度感；时空类（appearance order）考「走过房间时谁先进入视野」。类比：配置像认户型图，测量像估家具能不能进门，时空像回忆参观路线。

2. **MRA 指标处理数值题**：选择题用准确率；要答「房间长 4.2 米」这类数值题时，论文提出 **Mean Relative Accuracy（MRA）**——预测值和真值的相对误差在多个容忍阈值下取平均，避免「差 0.1 米就算全错」。类比：猜身高 175cm，真值 170cm，传统 accuracy 给 0 分，MRA 会给部分分。

3. **空间推理是主瓶颈，CoT 无效**：作者让模型自解释答题过程，发现弱在 spatial reasoning 而非 visual perception 或语言。更反直觉的是：chain-of-thought、self-consistency、tree-of-thoughts **都没涨分**；但要求模型**显式生成认知地图（cognitive map）**再答距离题，性能有提升——说明「用语言想空间」和「用地图想空间」是两条路。

## 实践案例

### 案例 1：VSI-Bench 八类任务长什么样

```
配置类（Multiple-Choice）：
  Relative Direction：「冰箱相对于沙发在哪个方向？」
    A. 左前  B. 右后  C. 正右  D. 左后
  Route Plan：「从门口到厨房，哪条描述的路径最合理？」

测量类（Numerical Answer，用 MRA 评分）：
  Room Size：「这个房间面积约多少平方米？」→ 模型输出 18.5
  Absolute Distance：「相机到窗户大约多少米？」→ 模型输出 2.3

时空类：
  Appearance Order：「下列物体按首次出现顺序排列？」
    A. 门→桌→灯  B. 桌→门→灯  ...
```

### 案例 2：从 HuggingFace 加载评测数据

```python
# 数据集：nyu-visionx/VSI-Bench
from datasets import load_dataset

ds = load_dataset("nyu-visionx/VSI-Bench", split="test")
sample = ds[0]
# 典型字段：video_path, question, choices, answer, task_type
print(sample["question"])      # e.g. "What is the relative direction of ..."
print(sample["task_type"])     # e.g. "relative_direction"
# 288 段室内视频，ScanNet 系 3D 标注保证答案可追溯
```

### 案例 3：用 MRA 评估数值预测

```python
import numpy as np

def mean_relative_accuracy(pred, gt, thresholds=None):
    """论文 Eq.1：多阈值相对误差平均"""
    if thresholds is None:
        thresholds = np.arange(0.5, 1.0, 0.05)
    rel_err = abs(pred - gt) / max(gt, 1e-6)
    return np.mean([rel_err < (1 - t) for t in thresholds])

# 真值房间面积 20 m²，模型猜 18 → MRA 在宽松阈值下仍给分
print(mean_relative_accuracy(18.0, 20.0))  # > 0，比 exact match 合理
```

## 踩过的坑

1. **人类基线 79% 但测量题只有 ~47%**：人类也不是神，绝对距离/房间面积本来就难——读榜时别拿「配置题 95%+」和「测量题 30%」混为一谈。

2. **频率基线（Frequency）能到 34% 平均分**：模型总选最常见选项也能蹭分，报告必须同时给 Random 和 Frequency 两条 chance level。

3. **短视频漫游 ≠ 全局地图**：模型往往只有**局部**空间模型（看清眼前）而缺**全局**布局（整屋拓扑），高分不代表能用于导航。

4. **VSI-Bench-Debiased 后续版**：团队发现部分题存在非视觉捷径（语言偏见），2025 年跟进工作做了去偏版——老榜单数字不能直接和 debiased 集横比。

5. **零样本 + 贪心解码的设定**：论文所有模型都用默认 prompt、greedy decoding，换采样温度或加 few-shot 会让分数不可比——复现时先对齐官方脚本。

## 适用 vs 不适用场景

**适用**：
- 筛选要做**室内导航 / 家具摆放 / AR 叠层**的 Video LLM，看空间而不只看字幕
- 对比 Gemini vs LLaVA-OneVision vs LongVA 在**同一套 8 任务**上的雷达图
- 研究认知地图、多帧采样策略对距离估计的影响

**不适用**：
- 户外驾驶、体育动作等开放场景（数据全是室内重建数据集）
- 开放对话式视频摘要（题型是结构化 QA，不是自由生成）
- 纯音频或纯文本空间推理（必须吃 egocentric 视频）

## 历史小故事（可跳过）

- **2024-12-18**：arXiv 2412.14171 上传，标题 *Thinking in Space*，VSI-Bench 随文发布
- **2024-12**：HuggingFace 上线 `nyu-visionx/VSI-Bench`，配套 GitHub `vision-x-nyu/thinking-in-space`
- **2025-06**：CVPR 2025 正式收录，成为空间智能方向引用最高的视频 benchmark 之一
- **2025-11**：同团队发布 VSI-Bench-Debiased 与「Train on the Test Set」去偏方法论
- **社区**：LLaVA-Video-72B、Gemini-1.5 Pro 在开源/闭源两端领跑，但距人类仍有约 33 点 gap

## 学到什么

1. **视频理解评测正在从「认内容」走向「建空间」**——VSI-Bench 把 3D 重建数据集的标注反哺给 2D 视频 MLLM，打通了两条研究线
2. **语言推理技巧不万能**——在空间题上 CoT 失败说明：有些能力不能靠「多想几步」补，要换表征（认知地图）
3. **数值题需要 MRA 这类软指标**——exact match 会低估「差不太远」的模型，评测设计要和任务语义对齐
4. **局部强、全局弱是当代 MLLM 的空间画像**——做机器人前先问：你的模型考过 VSI-Bench 的 route plan 吗？
5. **benchmark 质量来自 3D 标注闭环**——题目从 ScanNet 系 meta-info 模板生成，再经多轮人工验错，比纯爬虫 QA 更可信

## 延伸阅读

- 论文 PDF：[arXiv 2412.14171](https://arxiv.org/abs/2412.14171)
- 数据集：[HuggingFace VSI-Bench](https://huggingface.co/datasets/nyu-visionx/VSI-Bench)
- 评测代码：[vision-x-nyu/thinking-in-space](https://github.com/vision-x-nyu/thinking-in-space)
- 时序专测：[[tempcompass-2024]] —— 与 VSI-Bench 互补，一个考时间语义一个考空间布局
- 综合视频考卷：[[mvbench-2023]] —— 20 任务偏时序因果，VSI-Bench 偏空间几何
- 项目页：[Thinking in Space](https://vision-x-nyu.github.io/thinking-in-space/) —— 含榜单、认知地图可视化与 probe 实验说明

## 关联

- [[mvbench-2023]] —— 上一代细粒度视频 benchmark；MVBench 考动作顺序，VSI-Bench 考房间布局
- [[egoschema-2023]] —— 同为第一视角长视频诊断，EgoSchema 偏高层规划，VSI-Bench 偏空间 QA
- [[longvideobench-2024]] —— 长视频交织理解；VSI-Bench 视频也较长但侧重空间而非叙事
- [[longva-2024]] —— 论文评测的开源模型之一，LongVA 在 VSI-Bench 中位表现
- [[video-llava-2024]] —— LLaVA-OneVision 系列是榜单开源前排
- [[qwen2-vl-2024]] —— 工业级视频 MLLM，可对照 VSI-Bench 空间短板
- [[tempcompass-2024]] —— 时序 vs 空间：两个维度拆 Video LLM 能力
- [[llava]] —— LLaVA-Video / OneVision 是评测主力 backbone 之一
- [[vid-llm-survey-2023]] —— 综述脉络里可插入 VSI-Bench 作为 2025 空间智能代表
- [[lmms-eval]] —— 统一跑榜入口（若集成 VSI-Bench 任务）
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dense360-2025]] —— Dense360 — 全景 ERP 密集理解与 ERP-RoPE
- [[egoschema-2023]] —— EgoSchema — 三分钟第一视角长视频理解的诊断探针
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[longvideobench-2024]] —— LongVideoBench — 一小时交织字幕视频的长上下文理解考卷
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[omnidirectional-mllm-2025]] —— 全景空间推理 — MLLM 准备好面对 360° 了吗
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM

