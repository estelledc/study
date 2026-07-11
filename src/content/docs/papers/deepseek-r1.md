---
title: DeepSeek R1 — 强化学习推理模型
来源: 'DeepSeek AI, "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning", 2025-01'
日期: 2026-05-29
分类: NLP / 推理
难度: 中级
---

## 是什么

DeepSeek R1 是中国 DeepSeek 实验室 2025 年 1 月开源的一个**让大模型自己学会推理**的语言模型。

日常类比：以前教模型解数学题，要给它**无数题目 + 标准解题步骤**，一步步示范（这叫 SFT，监督微调）；R1 反过来——只给它**一堆题**，做错扣分、做对加分，让它自己琢磨出推理步骤。

性能媲美 OpenAI o1（当时最强的闭源推理模型），但**完全开源**——权重、论文、训练 pipeline 全公开。

## 为什么重要

不理解 R1，下面这些事都没法解释：

- 为什么 2025 年 1 月 27 日 NVIDIA 一天跌 17%、市值蒸发 6000 亿美元
- 为什么之后 Llama 4 / Qwen 3 / Claude 3.7 全加上了"推理模式"
- 为什么"小团队也能训前沿 AI"这件事被重新点燃
- 为什么开源生态突然涌现一堆推理模型（QwQ / OpenThinker / Phi-4-Reasoning）

5 件具体的事：

1. **第一个开源的 o1 级推理模型**——权重与代码 **MIT** 协议（蒸馏版继承底座许可证：Qwen 系 Apache 2.0 / Llama 系 Llama License）
2. **671B MoE 架构**，推理性能全球第一梯队（激活 37B，蒸馏版单卡可跑）
3. **底座训练成本公开约 560 万美元**（DeepSeek-V3-Base GPU 时）；R1 额外 RL 相对便宜——相对闭源前沿模型的训练/研发投入仍低一个数量级以上
4. **引爆 AI 股市动荡**——美国市场原以为只有大厂能训前沿模型，R1 打破假设
5. **重新打开"穷人路线"**——小公司、小实验室也能复刻类似方法

## 核心要点

R1 做对了 **3 件事**：

1. **GRPO**（Group Relative Policy Optimization，PPO 的简化版）
   类比：传统 RL 要请一个"裁判"打分（critic 网络），GRPO 让选手互比——同一道题让模型答 8 次，谁答得好就奖励谁，省掉了裁判这个角色，显存少一半。

2. **Pure RL 也能学会推理**（R1-Zero 实验）
   不做 SFT，直接给 base model 上 RL，模型自然涌现出长思考、中途自检、回头改答案这些行为。

3. **Cold-start SFT 让输出可读**（R1 完整版）
   纯 RL 的输出乱七八糟（中英夹杂、不分段），加一点点 SFT 就能让格式漂亮，性能再往上抬一截。

## 实践案例

### 案例 1：R1-Zero — 什么都不教，纯刷题

DeepSeek 团队做了一个大胆实验：拿一个**完全没经过 instruction tuning 的 base model**（DeepSeek-V3-Base，671B），直接挂 GRPO 训。

Reward 极简：
- 数学题：答案对 = 1 分，错 = 0 分（用 `math_verify` 库自动判等价性）
- 代码题：跑测试通过 = 1 分，否则 = 0 分（沙箱执行）

训练几千步后，模型自己学会了：
- 长 chain-of-thought（一步步推理而非直接给答案）
- self-verification（中途回头检查自己）
- "Aha moment"——会写出"等等，我刚才好像算错了"这类自我纠错语言

**关键**：没人教过它这些，是 RL 自己激发出来的。

### 案例 2：R1 完整版 — 加一点点 SFT 救对齐

R1-Zero 推理强但读起来难受（中英混杂、不礼貌、无标点）。R1 完整版的 4 步 pipeline：

1. **Cold start**：用几千条精选 CoT 数据做轻量 SFT，让模型学会 `<think>...</think><answer>...</answer>` 格式
2. **Reasoning RL**：大规模 GRPO，主战场，让推理能力起飞
3. **再 SFT**：用 RL 模型自己生成 60 万条推理数据 + 20 万条对话数据，重新 SFT 一遍
4. **Final RL**：最后一轮 RL，同时考虑推理质量 + helpfulness + harmlessness

最被低估的细节：cold-start 数据**只有几千条**。质量比规模重要得多。

### 案例 3：你能直接看到的 `<think>` 标签

R1 推理时输出长这样：

```
<think>
让我一步步分析。
24 块饼干，给一半给弟弟。
24 / 2 = 12，所以剩下 12 块。
等等，再确认一下：24 - 12 = 12。对的。
</think>
<answer>
12
</answer>
```

`<think>` 里是模型的"内心独白"，`<answer>` 才是给用户的最终答案。这种格式不是 prompt engineering，而是**训练时强制学到的结构**——format reward 在每条 rollout 上检查标签是否齐整。

## 踩过的坑

1. **rule-based reward 只对"可验证答案"有效**。数学、代码、逻辑题有标准答案能机器判分；但创意写作、开放问答没有 ground truth，R1 路线在那些任务上不适用。

2. **GRPO 的 G 个 rollout 必须有差异**。如果同一个 prompt 8 次都答对（或都答错），advantage 全 0，这步白训。开源社区用 dynamic sampling 滤掉这种 trivial prompt。

3. **Long CoT 推理 token 成本暴涨**。R1 单次回答平均 2000-5000 tokens，是普通 chat model 的 5-10 倍，API 计费和延迟都受影响。

4. **PRM 与 MCTS 都被 R1 团队试过失败**。Process reward model（给中间步骤打分）和 Monte Carlo tree search（推理时搜索）这两条主流路线，论文专门用一章承认尝试过都不 work。

## 适用 vs 不适用场景

**适用**：

- 数学 / 代码 / 形式逻辑这类"答案能机器判"的任务
- 自训行业垂类推理模型（R1 范式 + 自己的 verifier）
- 部署小模型推理能力——用 R1 蒸馏的 7B / 14B 版本

**不适用**：

- 开放对话、创意写作（没 verifier）
- 极低延迟场景（推理 token 太多）
- 需要工具调用 / 多轮 agent 推理（R1 是纯权重内推理，不带工具）

## 历史小故事（可跳过）

- **2024 年 9 月**：OpenAI 发布 o1，宣称用 RL + 长 CoT 大幅提升推理。但**完全闭源**——社区不知道是 RL 还是 search、有没有 SFT、reward 怎么设计。各派论文吵架。
- **2025 年 1 月 20 日**：DeepSeek 一篇论文给出答案：**纯 RL + outcome reward + GRPO，不需要 PRM，不需要 search**。R1-Zero 实验更狠——连 SFT 都不需要。
- **2025 年 1 月 27 日**（论文发布一周后）：NVIDIA 单日跌 17%，市值蒸发 6000 亿美元。市场担心："如果开源团队用远低于闭源大厂的公开训练成本就能训出 o1 级推理模型，美国大厂囤的 GPU 还值那么多吗？"
- **2025 年 Q1**：开源社区出现 huggingface/open-r1、UC Berkeley TinyZero、Qwen-QwQ、OpenThinker 十几个复刻项目。整个 AI 研究议程被一篇论文 reset。
- **2025 年 Q2**：Llama 4 / Qwen 3 / Claude 3.7 全部跟进"RL + 推理"范式。

## 学到什么

1. **能力激发 ≠ 能力教学**——reasoning 是 RL 激发的（model 本来就会，奖错惩对让它表现出来），不是 SFT 教的
2. **rule-based reward > reward model**——只要任务有 verifier，规则判分比训练判分网络鲁棒得多，避开 reward hacking
3. **多阶段 pipeline 不是花架子**——R1 每个 stage 解决一个具体问题（教格式 / 激发推理 / 修对齐 / 联训），每一步都有目标
4. **distill 让小模型继承大模型推理**——R1-distill-7B 在 AIME 上比 GPT-4o 高 6 倍，self-host 友好

## 延伸阅读

- 论文 PDF：[arXiv 2501.12948](https://arxiv.org/abs/2501.12948)（22 页，重点是方法章节与失败尝试章节）
- 完整复刻：[huggingface/open-r1](https://github.com/huggingface/open-r1)（开源 GRPO + reward 实现）
- 视频解读：[Yannic Kilcher — DeepSeek R1 Paper Explained](https://www.youtube.com/watch?v=bAWV_yrqx4w)
- 对比阅读：[CoT (Wei 2022)](https://arxiv.org/abs/2201.11903)、[InstructGPT (Ouyang 2022)](https://arxiv.org/abs/2203.02155)

## 关联

- [[chain-of-thought]] —— prompting 时代的推理起源，R1 把它从 prompt trick 升级为 base capability
- [[instructgpt]] —— RLHF 三段论奠基（SFT → RM → PPO），R1 部分继承部分颠覆
- [[mixture-of-experts]] —— DeepSeek-V3 的 MoE 架构让 671B 推理可负担
- [[chinchilla]] —— N/D 1:1 同比放大约束，DeepSeek-V3-Base 严格遵守
- [[dpo]] —— 偏好优化简化路线，R1 回归 PPO 风格但去掉 critic

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[compose-future-theorems]] —— COMPOSE — 用引用图和 Mathlib 图预测未来定理
- [[cot]] —— Chain-of-Thought Prompting
- [[deepseek-coder-2024]] —— DeepSeek-Coder — 按整个仓库喂代码的开源 SOTA
- [[demystifying-data-org]] —— Demystifying Data Organization — 给训练数据排队的四条原则
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[loong-doc-mt]] —— Loong DocMT — 长文档翻译里的会挑上下文的代理
- [[mira-rubric]] —— MIRA Rubric — 给混合训练数据先定评分尺再筛选
- [[ppc-preplan]] —— PPC Preplan — 先想清楚题目类型再规划解法
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[reasoning-with-sampling]] —— Reasoning with Sampling — 在关键决策点重采样推理过程
- [[rim-latent-reasoning]] —— RiM Latent Reasoning — 给 LLM 一块不用说出口的工作记忆
- [[rlhf-christiano]] —— RLHF Christiano 2017 — 人类偏好做奖励
- [[self-trained-verification]] —— Self-Trained Verification — 让模型先看标准答案学会挑错
