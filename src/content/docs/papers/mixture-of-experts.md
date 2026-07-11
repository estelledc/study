---
title: Mixture of Experts (MoE)
来源: 'Shazeer et al., "Outrageously Large Neural Networks: The Sparsely-Gated MoE Layer", 2017 / Switch Transformer 2021 / Mixtral 2024'
日期: 2026-05-29
分类: NLP / 深度学习
难度: 中级
---

## 是什么

MoE（Mixture of Experts，专家混合）让神经网络的"前馈层"从一个大网络变成多个并行的"小专家"，每个 token 只激活 2-8 个专家而不是全部参数。

日常类比：

- 老办法（[[gpt-3]] 这种 dense 模型）：1 个全能博士每道题都答——什么题都会，但每题都得他从头算
- MoE：100 个专家组成一个组，每道题只问其中 4 个最相关的——总知识量大，但单题响应快

技术上 MoE 把 Transformer 里那个最占参数的"前馈层"（FFN）换成 N 个独立 FFN（叫 expert），加一个 router 决定每个 token 走哪几个 expert。其他没被选到的 expert 这步不算。

## 为什么重要

不理解 MoE，下面这些事都没法解释：

- 为什么 Mixtral 8×7B 总参数 47B，推理速度却像 13B 一样快——它不是模型小，而是"每次只用一部分"
- 为什么 2024 之后大量新开源旗舰转向 MoE：DeepSeek-V3、Mixtral、Qwen-MoE、Llama 4 都走这条路（dense 仍在，但稀疏路线明显变主流）
- 为什么训练 1T 参数级别模型变得可行——dense 1T 训练 + 推理都要付完整 FLOPs，MoE 只算激活的那部分
- 为什么"稀疏激活"被认为是 LLM 后摩尔时代继续放大的关键路径

核心是把两件事第一次切开：**模型容量**（总参数有多大）和**推理成本**（每个 token 算多少 FLOPs）。

## 核心要点

MoE 一层里有三个角色：

1. **Router（路由器 / gate）**：一个轻量的小线性层。读到一个 token，输出 N 个分数，决定它该走哪几个 expert。类比：医院前台护士看病人症状决定挂哪几个科。

2. **Expert（专家）**：N 个独立的 FFN。每个长得一样但权重不同，训练后会自然分化——有的擅长代码、有的擅长数学、有的擅长中文。

3. **Top-K routing + 辅助 loss**：
   - **Top-K**：router 算出 N 个分数后只取最高的 K 个（最常见 K=2）。其他 expert 这一步不参与。
   - **Auxiliary loss（load balance loss）**：防止 router 偷懒——所有 token 都涌向同一个 expert（叫 routing collapse），其他 expert 永远 0 token、永远不更新。这个 loss 强制把负载分散开。

公式直觉：

- 总参数 ≈ N × （单 expert 参数）
- 每 token FLOPs ≈ K × （单 expert FLOPs）
- 取 N 大、K 小，就能"参数大、推理便宜"

## 实践案例

### 案例 1：Top-K routing 最小伪代码

```python
# scores: [N] 每个 expert 的打分；K=2
scores = router(token)          # 线性层 → N 维
topk_val, topk_idx = topk(scores, k=2)
weights = softmax(topk_val)     # 只在选中的 K 个上归一化
out = 0
for w, i in zip(weights, topk_idx):
    out += w * experts[i](token)  # 没选中的 expert 不算
```

逐步读：① router 给每个 expert 打分；② 只留最高的 K 个；③ 在这 K 个上 softmax 当权重；④ 加权求和。这就是"参数多、每步只算一小撮"的全部动作。

### 案例 2：Mixtral 8×7B — 让普通人也能跑大 MoE

Mistral 2024 年开源的 8×7B MoE 是社区起飞点：

- 8 个 expert，每层都有；共享 attention 等后总参数约 47B（不是 8×7=56B）
- 每个 token 选 top-2 expert，推理时实际算的参数 ≈ 13B
- 论文称质量对标 Llama 2 70B 量级，速度接近 13B dense

第一次让普通研究者在 2 张消费级 GPU 上跑出接近大 dense 的能力，开源 LLM 生态从此分叉。

### 案例 3：故障 — Routing Collapse 与修法

不加 load balance 的 MoE，训练几百步就会出现：所有 token 都涌向 expert 0，其他 expert 永远没 token、永远不更新。模型实际只用 1/N 容量。

修法：

- 经典：加 load balance loss（Switch Transformer 2021）——离散负载 × 连续概率，强制均匀
- 现代：动态 bias（DeepSeek-V3 2024，671B 总参 / 37B 激活）——被选多的 expert 降一点偏置，bias 不进梯度图

## 踩过的坑

- **Router 崩溃容易，恢复难**：训练初期 router 是随机的，一旦某个 expert 偶然多被选几次，正反馈让它越被选越多。所以初始化 scale 必须比 dense 层小一个数量级，给所有 expert 一个公平起点。

- **Softmax 必须 fp32**：router 的 softmax 用 bf16 训练会出问题——数值范围紧时容易出现 1.0 vs 0.0 的硬切，梯度直接断。expert 内部 FFN 仍走 bf16，路径决策走 fp32，这是个非对称精度策略。

- **All-to-all 通信瓶颈**：训练时 N 个 expert 分散在 N 台 GPU 上，token 路由 = 跨设备数据重排（all-to-all）。token 在 expert 间分布不均 → 通信也不均 → 一个慢的 GPU 拖慢全局。所以训练时要限制每个 expert 的最大接收量（capacity factor）。

- **单卡推理优势会消失**：MoE 的 active params 优势在多卡是真的；单卡推理时不同 token 切不同 expert，变成 cache miss 主导的 memory-bound，反而比 dense 慢。vLLM 早期版本踩过这个坑。

- **Fine-tune 不稳**：dense 模型微调几乎随便都能跑，MoE 微调常见 router 在小数据上过拟合或塌缩，需要更小学习率 + 冻结部分 expert。

## 适用 vs 不适用场景

**适用**：

- 大规模预训练，想要"参数大但推理便宜"——所有先进开源 LLM 的标配
- 多机多卡分布式训练，能用 expert parallel 把通信开销摊掉
- 需要 specialization 的场景——多语言、多领域，让不同 expert 自动分工

**不适用**：

- 单卡或小规模训练（< 8 GPU），all-to-all 通信成本远高于收益
- 单卡推理 + 流式输出场景，expert 切换的 cache miss 抵消 active params 优势
- 数据量小、需要密集微调的下游任务，MoE 微调比 dense 难得多
- 需要严格逐层量化的边缘部署，每个 expert 激活分布不同要逐个校准

## 历史小故事（可跳过）

- **1991 年**：Jacobs & Jordan 在论文《Adaptive Mixtures of Local Experts》里提出 MoE 概念。那时还没有 deep learning，是用统计模型做"分而治之"。30 年后才被翻牌。
- **2017 年**：Shazeer 在 Google 发《Outrageously Large Neural Networks》，把 MoE 用到 LSTM，证明可以训出 137B 参数模型。但还在 RNN 时代没引爆。
- **2021 年**：Fedus 等《Switch Transformer》把 MoE 和 Transformer 结合，简化到 top-1 routing，第一次推到 1.6T 参数训练稳定。这是把 MoE 写进 LLM 主流的转折点。
- **2023 年末**：Mistral 开源 Mixtral 8×7B，让社区第一次能在自己机器上跑 MoE，质量直接对标 GPT-3.5。开源 LLM 集体跟进。
- **2024 年**：DeepSeek-V3 把 MoE 推到 671B 参数 + fine-grained expert + aux-loss-free routing，定义了 MoE 第二代。

之后所有"大模型继续放大但推理不能太贵"的需求都走这条路。

## 学到什么

- **容量和成本可以解耦**：dense 时代二者绑定（参数大 = 推理慢），MoE 让二者分别 tune。这个设计哲学不止用于 FFN，可推广到任何"在 N 个候选里选 K 个"的场景
- **稀疏激活 vs 密集激活**：是 LLM 后摩尔时代继续放大的两条岔路。dense 工程简单但物理上限近，sparse 复杂但天花板高
- **Specialization 不是设计出来的，是 routing + balance loss 训出来的**——给定足够数据，expert 会自动分化，不需要人工告诉它"你管代码我管中文"
- **训练稳定性是 MoE 最大的工程门槛**——不是算法不会，而是真的训不稳。每一代 MoE 论文最大篇幅都在讲怎么不崩

## 延伸阅读

- 论文 PDF：[Shazeer 2017 — Outrageously Large Neural Networks](https://arxiv.org/abs/1701.06538)（MoE + LSTM 的奠基）
- 论文 PDF：[Switch Transformer 2021](https://arxiv.org/abs/2101.03961)（MoE + Transformer 第一次到 1T 参数）
- 论文 PDF：[Mixtral of Experts 2024](https://arxiv.org/abs/2401.04088)（开源 SoTA 级 MoE 起点）
- 视频教程：[Yannic Kilcher — Switch Transformer 解读](https://www.youtube.com/watch?v=iAR8LkkMMIM)（30 分钟把 routing 讲一遍）
- 工程参考：[mistralai/mistral-src](https://github.com/mistralai/mistral-src)（PyTorch，不到 500 行的官方 inference 代码）

## 关联

- [[attention]] —— Transformer 主干；MoE 替换的是其中的 FFN 部分，不动 attention
- [[scaling-laws]] —— dense 时代的幂律，MoE 在它的基础上多开一条"参数维度"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[afd-disagg-moe]] —— AFD Disagg MoE — 把注意力和 FFN 分开摆的 MoE 推理地图
- [[deepseek-r1]] —— DeepSeek R1 — 强化学习推理模型
- [[gshard-2020]] —— GShard — 用注解让 600B 模型自动跨设备切片
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[megatron-core-moe-2026]] —— Megatron-Core MoE — 大规模稀疏专家并行实践
