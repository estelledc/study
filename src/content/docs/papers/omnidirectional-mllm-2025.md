---
title: 全景空间推理 — MLLM 准备好面对 360° 了吗
来源: 'Dongfang et al., "Are Multimodal Large Language Models Ready for Omnidirectional Spatial Reasoning?", arXiv 2025'
日期: 2026-06-06
分类: 机器学习
子分类: 视频理解
难度: 中级
---

## 是什么

**Omnidirectional Spatial Reasoning** 论文（2025，常称 OSR 工作）问一个直白问题：**现成 MLLM 能不能在 360° 全景图里做空间推理？** 作者发布 **OSR-Bench**：基于高保真室内全景 **3D 布局** 构造 **15.3 万+** QA 对，覆盖**物体计数、相对距离、相对方向**；并用**两阶段评估**——先考模型能否生成认知地图，再考问答准确率，配合**旋转不变匹配**与负样本（插入不存在物体）测幻觉。

日常类比：给你一张「站在房间中心环视一圈」的展开图，问「沙发离窗户更近还是离门更近？」「左边架子上有几个瓶子？」——需要把**弯曲空间**脑内摊平成地图。论文测了 GPT-4o、Gemini 1.5 Pro 等 8 个 SOTA，结论：**全景空间推理仍远未就绪**。

与 [[dense360-2025]] 并列：Dense360 偏密集 caption/grounding 数据与 ERP-RoPE；本篇偏**诊断式空间 QA**。

## 为什么重要

不了解 OSR-Bench，会误以为 MLLM「看图说话」就等于「懂空间」：

- **180°×360° FOV 是机器人 / VR / 全景相机常态**，透视训练数据覆盖不足
- **透视榜高分不能外推**：针孔视角的空间题与 ERP 拓扑不是同一技能
- **两阶段评分离感知与推理**：先画地图再答题，能看出是「看不见」还是「推不对」
- **负采样抓幻觉**：问不存在的物体，模型若瞎答说明 grounding 脆

## 核心要点

1. **OSR-Bench 规模与类型**：153K+ QA，三类核心空间任务；数据来自高保真室内全景认知地图（omni-cognitive maps）。

2. **负采样策略**：在 prompt 里插入**不存在物体**，测模型是否硬编答案——全景场景物体多，幻觉风险高。

3. **两阶段评估**：Stage 1 生成 top-down 认知地图；Stage 2 答空间 QA。用 **Hungarian 匹配**等旋转不变指标对齐预测地图与真值。

4. **八模型零样本结果**：闭源与开源 MLLM 在全景设置下空间能力有限，揭示**感知接地（perceptually grounded）** MLLM 仍是缺口。

## 实践案例

### 案例 1：三类空间题（示意）

```text
计数："视野内可见几个椅子？"（要绕 ERP 一圈不重复数）
相对距离："冰箱离相机更近还是沙发更近？"
相对方向："洗衣机在阳台门的左侧还是右侧？"

负样本变体："红色花瓶旁边的绿色台灯是什么形状？"
（若场景无绿色台灯，正确应答「不存在」而非编造）
```

### 案例 2：两阶段评测流程

```python
# Stage 1：让模型根据 ERP 输出 top-down 认知地图（JSON/文本布局）
pred_map = model.generate_map(panorama_erp)

# 旋转不变匹配：pred_map 与 gt_map 对齐算结构相似度
map_score = hungarian_match(pred_map, gt_map, rotation_invariant=True)

# Stage 2：标准 QA
qa_acc = eval_qa(model, panorama_erp, questions)

# 报告：map_score 低但 qa_acc 高 → 可能语言猜对；两者都低 → 全景接地差
```

### 案例 3：与 Dense360 分工

| 工作 | 重点 | 产出 |
|------|------|------|
| [[dense360-2025]] | 密集 caption + ERP-RoPE | 160K 数据 + grounding bench |
| OSR（本篇） | 空间推理诊断 | OSR-Bench + 认知地图评估 |
| [[vsi-bench-2024]] | 漫游视频空间 | 视频轨迹心理地图 |

做全景产品应 **Dense360（描述）+ OSR（推理）** 双线评测。

## 踩过的坑

1. **用透视 VQA 榜代替 OSR**：几何与任务分布完全不同。

2. **忽略旋转等价**：同一房间 ERP 可水平滚动，评测必须 rotation-invariant。

3. **只看 QA 不看地图阶段**：无法区分感知失败与推理失败。

4. **负样本题当噪声删掉**：恰恰是测幻觉的关键子集。

## 适用 vs 不适用场景

**适用**：
- 全景相机、室内机器人、VR 导航的 MLLM 选型
- 与 [[dense360-2025]] 组成全景能力双探针
- 研究认知地图 prompt 是否提升空间 QA

**不适用**：
- 窄 FOV 短视频动作识别
- 不需要 360° 输入的纯透视应用
- 期望零样本接近人类的空间机器人部署（当前 gap 大）

## 历史小故事（可跳过）

- **2024**：[[vsi-bench-2024]] 开启视频空间智能评测。
- **2025-05**：OSR arXiv 2505.11907，首个全景空间推理专用 bench。
- **2025-06**：[[dense360-2025]] 发布全景密集数据与 ERP-RoPE，与 OSR 形成邻域。

## 学到什么

- **MLLM 在 360° 下的空间推理仍是开放问题**，透视 SOTA ≠ 全景就绪。
- **评测要两阶段 + 负样本**，否则看不清幻觉与接地质量。
- **旋转不变性是 ERP 评测刚需**，不能当普通矩形图处理。
- **与 Dense360 数据/方法互补**：编码用 ERP-RoPE，能力用 OSR-Bench 验。
- **具身 AI / VR 应把 OSR 纳入回归**，而非只报通用 MMMU 分数。
- **认知地图阶段低分**往往比 QA 低分更早暴露全景接地问题。

GPT-4o 等闭源模型在 OSR 仍有限，说明全景空间不是「堆 API 额度」能自动解决的，需要 ERP 感知专门研究。

OSR 数据集基于高保真室内 3D layout；户外全景或动态场景超出当前 bench 范围，外推结论需谨慎。HuggingFace UUUserna/OSR-Bench 为官方数据入口。

零样本评测协议固定八模型列表；新增模型对比时应复用同一旋转匹配与负采样子集，避免协议漂移。

## 延伸阅读

- 论文 PDF：[arXiv:2505.11907](https://arxiv.org/abs/2505.11907)
- 数据：[OSR-Bench on HuggingFace](https://huggingface.co/datasets/UUUserna/OSR-Bench)
- 邻居：[[dense360-2025]]、[[vsi-bench-2024]]
- 底座：[[qwen2-vl-2024]]、[[internvideo2-5-2025]]
- 地图：[[vid-llm-survey-2023]]

## 关联

- [[dense360-2025]] —— 全景密集 caption 与 ERP-RoPE
- [[vsi-bench-2024]] —— 视频空间智能 benchmark
- [[qwen2-vl-2024]] —— 被测 MLLM 代表
- [[internvideo2-5-2025]] —— 视频–语言强底座
- [[videollama2-2024]] —— 开源多模态对照
- [[lmms-eval]] —— 评测框架
- [[decord]] —— 媒体解码工程参考

> 维护提示：
> - OSR-Bench 153K+ QA；复现需 rotation-invariant 地图匹配与负样本子集。
> - 两阶段评分离地图生成与 QA，报告时两阶段分数都要贴。
> - 与 [[dense360-2025]] 全景邻域并列；一个偏诊断 QA，一个偏密集数据。
> - 八模型零样本列表含 GPT-4o、Gemini 1.5 Pro；版本号须与论文一致。
> - 候选见 `research/papers-video-understanding.md`；HuggingFace 数据集 UUUserna/OSR-Bench。
> - 透视榜高分不能外推 OSR；几何与 FOV 完全不同。
> - [[vsi-bench-2024]] 视频空间 vs 本篇 ERP 静态全景，选题勿混。
> - 关联 `[[slug]]`；regen-backlinks 自动维护反向链。
> - 具身/VR 产品应把 OSR 纳入 CI，而非只报 MMMU。
> - 负采样（不存在物体）是测幻觉关键，不可删。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[dense360-2025]] —— Dense360 — 全景 ERP 密集理解与 ERP-RoPE
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解
- [[vsi-bench-2024]] —— VSI-Bench — 用室内漫游视频考视频大模型的空间智商

