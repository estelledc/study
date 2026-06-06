---
title: CounterVQA — 因果图驱动的反事实视频 VQA
来源: 'Chen et al., "Distilling Counterfactual Reasoning from Language to Vision: Causal Graph Guided Post-Training for Video Understanding", arXiv 2025'
日期: 2026-06-06
分类: 机器学习
子分类: 视频理解
难度: 高级
---

## 是什么

**CounterVQA**（2025）是评测 **视频反事实推理** 的 benchmark：用多智能体 pipeline 为每段视频建**因果图（causal graph）**，再生成**三级难度**反事实问答题（邻接、长链、不存在事件）。论文还提出 **CFGPT** 后训练法：让**语言模态当老师**，把反事实推理能力**蒸馏到视觉模态**，并用因果图一致性作奖励。

日常类比：普通 VQA 像看监控回答「谁摔倒了」；反事实 VQA 问「如果没扶栏杆，他会摔吗？」——需要脑内**事件因果链**。CounterVQA 像先把链画成图再出题，并分「改一步」「改多步」「问根本没发生的事」三档难度。

与 [[cover-2025]]、[[vinoground-2024]] 同属反事实视频评测，但 CounterVQA 强调**显式因果图 + 语言→视觉蒸馏训练**。

## 为什么重要

不理解 CounterVQA，会高估 VLM「懂因果」：

- **Pearl 因果层级顶端是反事实**：识别相关 ≠ 理解干预与假设结果
- **三级难度暴露崩点**：简单邻接题还行，多跳长链与幻觉题断崖式下跌
- **CFGPT 给出可复现训练路径**：不只测问题，还用因果图奖励做 SFT + RL
- **与静态图反事实 benchmark 互补**：视频有时序与未观测帧，更难

## 核心要点

1. **多智能体因果图生成**：推断视频事件成对因果 → 构图 → 按复杂度排序视频 → 自动生成并校验反事实 QA。

2. **三级难度**：**Adjacent**（改邻接事件）、**Long-chain**（多跳干预）、**Non-existent**（问未发生事件，测幻觉）。类比：小学改一步算术 → 奥数连锁推理 → 防「编造没发生的事」。

3. **评测发现**：SOTA 开源/闭源 VLM 在简单级尚可，复杂链显著退化——说明当前模型多靠表面相关。

4. **CFGPT 训练**：语言侧擅长抽象逻辑；视觉侧当学生；**Causal Graph Reward** 约束预测与真图一致；SFT + RL 后在各级 CounterVQA 上稳定提升。

## 实践案例

### 案例 1：因果图 → 题目（概念）

```text
视频事件链：A 下雨 → B 地滑 → C 人摔倒 → D 旁人扶起

Adjacent 反事实：「若没下雨(B 不发生)，人还会摔吗？」
Long-chain：「若地没滑且人穿防滑鞋，还会需要扶起吗？」（多跳）
Non-existent：「若人提前带了伞，视频里会出现伞吗？」（可能从未出现）

每题 ground truth 由因果图上的 do-演算 / 可达性导出。
```

### 案例 2：CFGPT 两阶段（伪代码）

```python
# Stage 1 SFT：语言教师生成 CoT + 答案，视觉学生模仿
for (video, q, causal_graph) in countervqa_train:
    teacher_cot = llm.reason(q, graph=causal_graph)
    loss = sft(vlm(video, q), target=teacher_cot)

# Stage 2 RL：奖励 = 答案正确 + 预测图与真图结构相似度
reward = acc(pred, label) + graph_match(pred_graph, causal_graph)
rl_update(vlm, reward)
```

语言模态提供抽象因果模板，视觉模态学习「在像素证据上落地」。

### 案例 3：与 COVER / Vinoground 三角

| 方法 | 结构 | 训练方案 |
|------|------|----------|
| [[vinoground-2024]] | 顺序反事实对 | 无 |
| [[cover-2025]] | 四象限 + 子问题 | 无 |
| CounterVQA | 因果图 + 三级 | CFGPT 蒸馏 |

做反事实方向应至少读两篇 benchmark + 一篇训练（本篇）。

## 踩过的坑

1. **把邻接级分数当「会因果」**：长链级可能接近随机，要分表报。

2. **忽略 Non-existent 级**：模型爱编造未出现物体，这级专门抓幻觉。

3. **CFGPT 只跑 SFT 不跑 RL**：论文显示图奖励对长链关键。

4. **因果图生成错误传播**：自动构图需人工抽检，否则标签噪声毁评测。

## 适用 vs 不适用场景

**适用**：
- 研究视频因果 / 反事实推理上限
- 需要**训练配方**（CFGPT）而不只 benchmark
- 与 [[cover-2025]] 交叉验证鲁棒性

**不适用**：
- 快速产品验收（构图 + 三级评测成本高）
- 无视频因果标注需求的纯识别任务
- 期望零样本就达人类水平的部署（当前 gap 大）

## 历史小故事（可跳过）

- **2006–2018**：Pearl 因果层级、图像反事实探针逐步成熟。
- **2024–2025**：视频反事实爆发：[[vinoground-2024]]、[[cover-2025]]、CounterVQA。
- **2025-11**：CounterVQA arXiv 2511.19923，首套视频因果图 benchmark + CFGPT。

## 学到什么

- **反事实视频推理要显式因果结构**，否则题难控难度。
- **语言模态可教视觉模态抽象因果**——跨模态蒸馏是可行路线。
- **三级难度必不可少**；平均分会掩盖长链崩溃。
- **幻觉题（不存在事件）是独立维度**，与准确率分开报。
- **与 COVER 子问题机制互补**：一个重图，一个重分步 QA。
- **语言→视觉蒸馏**说明抽象因果不必从零在像素上学，可借力 LLM 教师。

若 Long-chain 级接近随机而 Adjacent 尚可，优先加 CFGPT 式图奖励 RL，而不是继续堆透视预训练数据。

数据集与代码将随论文进一步 release；关注 arXiv 2511.19923 页面更新以获取因果图标注格式说明。评测脚本应输出每级难度与图一致性分项，勿合并成单一 accuracy。

## 延伸阅读

- 论文 PDF：[arXiv:2511.19923](https://arxiv.org/abs/2511.19923)
- 因果：Pearl《为什么》入门
- 评测：[[cover-2025]]、[[vinoground-2024]]
- 视频：[[videomme-2024]]、[[mvbench-2023]]
- 地图：[[vid-llm-survey-2023]]

## 关联

- [[cover-2025]] —— 四象限反事实 + 子问题
- [[vinoground-2024]] —— 时序反事实对
- [[tempcompass-2024]] —— 时序概念探针
- [[qwen2-vl-2024]] —— 常见 VLM 基线
- [[videollama2-2024]] —— 开源视频模型
- [[lmms-eval]] —— 评测框架
- [[vid-llm-survey-2023]] —— Video-LLM 全景

> 维护提示：
> - 三级难度（Adjacent / Long-chain / Non-existent）必须分表，禁止平均成一个数。
> - CFGPT 复现需同时报告 SFT 与 RL 阶段；因果图奖励权重敏感。
> - 与 [[cover-2025]] 子问题机制、[[vinoground-2024]] 顺序反事实对照阅读。
> - 自动因果图需抽检人工一致率；噪声标签会扭曲 benchmark 结论。
> - 候选见 `research/papers-video-understanding.md`；站内 slug 以 atlas 为准。
> - 报分注明 VLM 版本、帧数、是否用官方多智能体构图 pipeline。
> - Pearl 因果层级：关联→干预→反事实；本篇落在第三层。
> - 训练 I/O 对照 [[decord]]；评测框架 [[lmms-eval]]。
> - 关联 `[[slug]]` 格式；build 触发 regen-backlinks。
> - Non-existent 题专门测幻觉，不可从评测集删除。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cover-2025]] —— COVER — 四象限反事实视频推理 benchmark

