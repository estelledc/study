---
title: Chinchilla — 训练大模型的数据/参数最优比
来源: Hoffmann et al., "Training Compute-Optimal Large Language Models", 2022
日期: 2026-05-29
子分类: NLP
分类: NLP
难度: 中级
provenance: pipeline-v3
---

## 是什么

Chinchilla 是 DeepMind 2022 年的一篇论文，回答了一个朴素问题：**给你一笔训练算力预算，砸到"参数更大"还是"数据更多"上更划算**？

日常类比：

> 同样的钱，是请 1 个专家上 1 节课，还是请 1 个学生上 10 节课？
> Chinchilla 的答案：**学生上 10 节课**——参数小一点、训练数据多一点的模型，效果更好。

具体一点：在固定算力（FLOPs）预算下，把参数减一半、训练 token 加一倍，最终模型质量更高。这件事推翻了之前业界的共识，成了 2022 年之后所有大模型训练的默认起点。

## 为什么重要

不理解 Chinchilla，下面这些事都没法解释：

- 为什么 [[llama]] / Llama 2 / Mistral / DeepSeek 都不再追求"参数大就赢"——而是中等参数 + 海量数据
- 为什么 Chinchilla 70B 在大多数任务上**超过** [[gpt-3]] 175B（参数只有 1/3，数据多 4 倍）
- 为什么 2020 年的 [[scaling-laws]] 结论被业界整体修正——之前认为"参数比数据重要"，现在反过来
- 为什么训练效率（compute-optimal）成了 LLM 设计的核心指标，而不是光看模型多大

一句话：**Chinchilla 重新定义了"什么叫一个训练得好的大模型"**。

## 核心要点

可以拆成三句话：

- **Compute-optimal 比例**：参数量 N 与训练 token 数 D 应该满足 **N : D ≈ 1 : 20**——每个参数喂 20 个 token。
- **之前的共识错在哪**：[[scaling-laws]] 里 Kaplan 2020 的拟合说 N : D ≈ 1 : 1（每个参数 1 个 token），所以大家拼命堆参数。Chinchilla 重新跑实验发现这个比例**严重低估了数据的重要性**。
- **怎么验证的**：DeepMind 在固定算力下跑了 **400+ 组不同的 (N, D) 组合**，画"训练 loss vs (N, D)"曲线，找出每个算力预算下 loss 最低的点。所有点连起来，斜率告诉你最优比。

## 实践案例

### 案例 1：GPT-3 是"训练不足"的（undertrained）

| 模型 | 参数 N | 训练 token D | D/N 比 | 评价 |
|------|--------|-------------|--------|------|
| [[gpt-3]] | 175B | 300B | **1.7** | undertrained，浪费参数 |
| Chinchilla | 70B | 1.4T | **20** | compute-optimal |
| Llama-2 7B | 7B | 2T | **285** | 过训练，但推理便宜 |
| Llama-3 8B | 8B | 15T | **1875** | 远超 Chinchilla 比例 |

GPT-3 训练时算力分配完全偏向"堆参数"。同样的算力如果按 Chinchilla 配方跑，应该是约 **63B 参数 + 1.4T token**——参数砍一大半，数据加 4 倍。

### 案例 2：Chinchilla 70B vs GPT-3 175B

DeepMind 用 Chinchilla 公式重新分配 GPT-3 同等的训练算力：

- GPT-3：175B 参数 × 300B token
- Chinchilla：70B 参数 × 1.4T token

**算力消耗几乎一样**，但 Chinchilla 在 MMLU、阅读理解、推理等大多数评测上都超过 GPT-3。这不是"更多算力换更好结果"，是**同样算力分配方式不同**。

### 案例 3：为什么现代模型"过训练"得离谱

按 Chinchilla 公式，Llama-3 8B 应该训练 160B token 就够了。但实际训了 15T token——**多了 90 倍**。为什么？

> Chinchilla 算的是**训练时**的最优。但训练完模型还要**推理**——给亿万用户用很多年。
> 推理算力 = 模型大小 × 用户次数。
> 所以业界宁愿在训练上多花算力（多喂数据），换一个**参数更小但能力够强**的模型，省下未来无数次推理的钱。

这是 Chinchilla 之后的二次修正：**训练 compute-optimal ≠ 全生命周期 compute-optimal**。

## 踩过的坑

- **比例不是金科玉律**：N:D ≈ 1:20 是基于当时 transformer 架构 + 那批数据的拟合。新架构（MoE / Mamba）和新数据（合成数据 / 多模态）会让最优比变化。
- **数据质量 > 数据数量**：Chinchilla 假设数据是同质的。实际上 1T 高质量 token > 5T 垃圾 token。论文没充分讨论这个变量。Phi-3（Microsoft 2024）就用 3.8B 参数 + 高质量数据达到了 LLaMA 70B 的效果，挑战了 D ≈ 20×N 的"数据数量"假设。
- **小模型推不出大模型**：DeepMind 跑的是 70M ~ 16B 参数的实验，外推到 70B 才训了 Chinchilla。再外推到 1T 参数还成不成立？没人验证过。
- **不要混淆 N 和"激活参数"**：MoE 模型的"总参数"和"激活参数"不一样，Chinchilla 公式应该用激活参数算——比如 Mixtral 8×7B 总参数 47B 但激活 13B，要用 13B 套公式。
- **D ≈ 20 是近似，不是严格相等**：论文实际拟合得到参数指数 α≈0.34、数据指数 β≈0.28，两者差 21%。后续 OLMo / Pythia 重新拟合都得到 α 略大于 β。"20 倍"是四舍五入的口头禅。

## 适用 vs 不适用场景

**适用**：

- 从零训练 dense transformer LLM，预算有限要分配 N 和 D
- 拿 Chinchilla 比例当初始设计起点，再根据推理需求调整
- 解释为什么"模型不是越大越好"

**不适用**：

- MoE 架构（Mixtral / DeepSeek-V2）：激活参数和总参数解耦，Chinchilla 比例需要重新拟合
- 微调 / 继续预训练：Chinchilla 是从零训练的曲线，微调场景规则完全不同
- 推理优化场景：要算"训练 + 推理总算力"，不是只看训练
- 多模态模型：图像 + 文本 token 的"等价性"不清楚

## 历史小故事（可跳过）

- **2020 年 1 月**：OpenAI 发 [[scaling-laws]] 论文（Kaplan 等），结论是 N : D ≈ 1 : 1，每个参数喂 1 个 token。这给了 [[gpt-3]]（175B 参数 × 300B token）的训练配方。
- **2020-2022**：所有人按这个配方堆参数。Megatron-Turing NLG（530B）/ Gopher（280B）/ PaLM（540B）一个比一个大。
- **2022 年 4 月**：DeepMind 发 Chinchilla 论文，重新跑 400+ 实验，发现之前的拟合算错了——最优比应该是 1 : 20，参数被严重高估。
- **2023 年**：Meta 发 [[llama]]，7B 参数训 1T token（Chinchilla 比 = 142），证明"超 Chinchilla 训练"在推理友好场景里更值。
- **2024 年**：Llama-3 8B 训 15T token（比 = 1875），把"过训练"推到极致。

Chinchilla 是 2022 年最重要的 LLM 训练范式转折点，没有之一。

## 学到什么

- **算力预算下，参数和数据要平衡**——盲目堆参数是 2020 年的旧思维，现在不成立
- **用对实验方法能推翻"业界共识"**——DeepMind 跑 400+ 组合的笨办法证明了之前的拟合错了
- **训练最优 ≠ 全生命周期最优**——推理成本会重新定义"该训多大模型"
- **Scaling law 不是定律，是经验拟合**——架构、数据、目标变了，比例就变了
- **简单的数字最有传播力**——"每个参数喂 20 个 token"这句口头禅比公式更有用，让一线工程师能快速估算自己模型该训多少数据
- **拟合曲线要在多个量级上验证**——Chinchilla 跑 70M~16B 区间得到的比例，到 1T 参数还成不成立没人答得上来；任何 scaling law 都默认了"已观察区间内的现象延伸到外推区间"，这条假设本身才是最大的不确定性
- **业界共识也会错很久**——Kaplan 2020 的 1:1 比例错了两年才被纠正，期间烧掉的算力以亿美元计；论文里随便一个拟合错的常数，工程界可能要花几亿美金代价才能"撞回正确"
- **数据墙问题被 Chinchilla 提前预警**——按它的比例外推，再过几年就会缺高质量训练 token。今天合成数据 / 持续 finetune / RLHF 风潮，本质都是在"撞数据墙"前找替代
- **量纲分析就能避坑**：参数 N 的指数和 token D 的指数若差太多，说明拟合方程本身有问题；Chinchilla 把两个指数都拉到 0.3 附近，刚好对应"参数和数据各占一半工作量"的物理直觉

## 延伸阅读

- 论文 PDF：[Hoffmann et al. 2022](https://arxiv.org/abs/2203.15556)（30 多页，前 10 页就讲清主要结论）
- 视频讲解：Yannic Kilcher [Chinchilla 论文精读](https://www.youtube.com/watch?v=PZXN7jTLjGg)（45 分钟逐图讲解）
- [[scaling-laws]] —— Chinchilla 直接挑战的对象（Kaplan 2020）
- [[gpt-3]] —— Chinchilla 论文的对比基线，被证明 undertrained
- [[llama]] —— Chinchilla 之后第一批"按比例训练"的开源模型

## 关联

- [[scaling-laws]] —— Kaplan 2020 提出的旧 scaling law，Chinchilla 修正了核心比例
- [[gpt-3]] —— 按旧 scaling law 训练的代表，被 Chinchilla 证明 undertrained
- [[llama]] —— 第一个明确按 Chinchilla 配方做训练规划的开源 LLM
- [[transformer]] —— Chinchilla 实验所基于的架构
- [[bert]] —— 早期预训练模型代表，参数和数据规模都远小于 Chinchilla 时代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ampere-architecture-2020]] —— NVIDIA Ampere — 第三代 Tensor Core 加 TF32 / BF16 / FP64，结构化稀疏 + MIG 重写大模型时代硬件假设
- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[blackwell-architecture-2024]] —— NVIDIA Blackwell — 双 die NV-HBI + 第二代 Transformer Engine + FP4 让万亿参数训练日常化
- [[deepseek-r1]] —— DeepSeek R1 — 强化学习推理模型
- [[double-descent-2019]] —— Double Descent — 模型越大越准，过参数化时代的反常识曲线
- [[flan-2021]] —— FLAN — 用自然语言指令教模型学会"听话"
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[hopper-architecture-2022]] —— NVIDIA Hopper — Transformer Engine + FP8 + TMA + Thread Block Cluster 把硅片为 LLM 量身定制
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[retro]] —— RETRO — DeepMind 的检索增强 LLM
- [[roberta-2019]] —— RoBERTa — 把 BERT 重训一遍就能拿 SOTA
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律
- [[sleeper-agents]] —— Sleeper Agents — 故意藏后门的 LLM

