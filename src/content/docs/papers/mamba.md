---
title: Mamba — 选择性状态空间模型
来源: 'Gu & Dao, "Mamba: Linear-Time Sequence Modeling with Selective State Spaces", 2023'
日期: 2026-05-29
分类: NLP / 深度学习
难度: 中级
---

## 是什么

Mamba 是 2023 年底 Albert Gu 与 Tri Dao 提出的**序列模型架构**，用「选择性状态空间」（Selective State Space Model，简称 **S6** = S4 + Selection）机制，在许多长序列任务上**替代 Transformer 里的 [[attention]]**。

日常类比：

- **Transformer 像背诵全文**——每个新词都要和前面所有词比一遍「你和我有关系吗」，越长越累
- **Mamba 像速读高手**——边读边把关键信息塞进固定大小的「小脑袋」，下一页只看小脑袋 + 新内容

正因为只看压缩过的状态，处理百万 token 时推理时间可按长度**线性**增长（论文标题里的 Linear-Time），而不是 Transformer 的平方级。它不是又一个「更快的 attention 近似」，而是换了一套递推状态的记账方式。

论文把选择性 SSM 嵌进简化后的端到端网络（常称 Mamba block），在语言、音频、基因组等模态上展示了长序列潜力。

## 为什么重要

不理解 Mamba，下面这些事都很难解释：

- 为什么 2024 年出现一波「线性 attention / RNN 复兴」——RWKV、RetNet、xLSTM 都在同一赛道
- 为什么 AI21 / Mistral / TII 等会出 Mamba+Transformer **混合模型**（Jamba、Codestral Mamba、Falcon-Mamba）
- 为什么基因组、长音频等「序列动辄百万」的领域特别关注 SSM
- 为什么有人喊「Transformer 终结者」，但旗舰 LLM 仍以 Transformer 为主
- 为什么「算法 + CUDA kernel 协同设计」成了新架构论文的标配（同一作者也做了 [[flash-attention]]）

核心承诺：**推理时间 O(N)** + **decode 时状态大小近似固定**（对比 Transformer 的 KV cache 随长度涨）。把这两点记住，后面读混合模型文案时就不容易被「终结者」口号带跑。

## 核心要点

1. **State Space Model（SSM）打底**：用隐藏向量 `h` 压缩读过的内容。类比 LSTM 的记忆细胞，但数学来自控制论。每读一个 token 更新一次 `h`，维度固定（论文常用状态扩展 N=16），不随上下文变长。

2. **Selective（选择性）——真正突破**：旧 SSM（如 S4）参数固定；Mamba 让 Δ、B、C **随当前输入变化**——重要 token 多写一笔，无关 token 可跳过。这就是「速读」的开关。

3. **Hardware-aware CUDA kernel**：参数变 input-dependent 后不能再当固定卷积训。Mamba 用 **parallel scan** + 把中间值留在 GPU SRAM，避免反复读写 HBM，让训练速度追上优化过的 Transformer。

可以记成一条流水线：**输入 → 动态生成 Δ/B/C → 更新固定状态 h → 读出 y**；训练走并行 scan，推理走逐步递推。

三件事合起来：**能训、能推、能跑长上下文**。
## 实践案例

### 案例 1：读一个 token 时发生了什么

```text
# 伪代码：selective SSM 一步
x_t = 当前 token 的向量
Δ, B, C = Linear(x_t)          # 由输入动态生成
h_t = exp(-Δ) * h_{t-1} + Δ*B * x_t   # 更新固定大小状态
y_t = C * h_t                   # 读出当前输出
```

逐部分解释：

- `Δ/B/C` 依赖 `x_t`：同一套公式，遇到「重要词」和「虚词」更新力度不同。
- `h_t` 长度固定：读到第 10 个或第 100 万个 token，状态槽位数不变。
- 训练时用 parallel scan 把整段序列并行算完；推理 decode 时逐步递推即可。

### 案例 2：同规模语言建模对比

论文在 The Pile 上训约 300B token：Mamba-2.8B 的下游表现**略优于同规模 Pythia-2.8B**，推理吞吐可到约 **5×**。这是「同参数量、同数据量」下的对照，不是「任意规模都碾压 Transformer」。

读结果时注意：

- 比的是 **2.8B 档** 的开源基线，不是 GPT-4 级旗舰
- 「更快」主要来自 decode 不再维护随长度增长的 KV cache
- 若任务极度依赖精确回看某句原文，数字好看也不代表该换架构

### 案例 3：长序列、基因组与流式

- **长文档**：百万 token 扫读时，状态内存近似常数；纯 Transformer 往往先撞显存墙。
- **基因组**：碱基序列极长，SSM 这类线性模型更吃得消；这是论文重点模态之一，不等于「该领域只剩 Mamba」。
- **流式语音**：每来一个新帧，更新 `h` 的时间近似常数；适合边听边出字的产品窗口。

### 案例 4：混合架构一眼看懂

AI21 的 Jamba 等把 attention 与 Mamba **按层混排**（常见约 1:7）：少数 attention 层负责精确召回，多数 Mamba 层负责便宜的长程推进。纯 Mamba「取代一切」没有发生，**互补**才是 2024–2025 更常见的落地。
## 踩过的坑

1. **In-context learning 偏弱**：历史压成固定向量是有损的，few-shot / 精确召回（needle-in-haystack）常弱于同规模 Transformer。

2. **「完全无 KV cache」是修辞**：没有 attention 的 KV，但 conv1d 仍要留最近若干输入；更准确说是 **decode 每 token 近似 O(1)**。

3. **训练超参敏感**：A 常用 HiPPO 风格初始化，Δ 范围要管住，深层常需 `residual_in_fp32`——配方不对容易 NaN。

4. **生态仍薄**：生产推理栈不如 vLLM 等对 Transformer 成熟，部署常要自己接 `mamba-ssm` kernel。

经验法则：先问「我的痛点是长度/吞吐，还是精确回看？」再决定纯 Mamba、混合还是继续 Transformer。
## 适用 vs 不适用场景

**适用**：

- 超长上下文（数万 token 以上）且推理流量大（流式语音、长文档扫读）
- 边缘部署：状态以 MB 计，不想扛 GB 级 KV cache
- 基因组 / 高分辨率音频等物理上难喂给纯 attention 的超长序列
- 与 Transformer **混合**（如 Jamba 约 1:7 attention:Mamba），兼顾召回与吞吐

**不适用**：

- 强依赖 few-shot / 精确引用的产品形态
- RAG、代码跳转、法律医疗「必须找对那一句」的检索型任务
- 要开箱即用推理生态的团队
- 任务画像不清时——默认仍选 Transformer 更稳

## 历史小故事（可跳过）

- **1960 年代**：控制论提出 State Space Model，描述线性动态系统
- **1990 年**：Blelloch 给出 work-efficient parallel scan，后来成了 Mamba 训练并行的关键积木
- **1997 / 2017 年**：LSTM 让 RNN 实用化；Transformer / [[attention]] 随后成为序列建模主流
- **2020–2021 年**：HiPPO → S4，长程基准上超过 Transformer，但语言建模仍偏弱
- **2023 年 12 月**：Gu & Dao 加入 selectivity，Mamba（arXiv:2312.00752）发布，社区热议「线性时代」
- **2024 年**：Mamba-2（State Space Duality）、Jamba、Falcon-Mamba 等扩展出现；旗舰 LLM 仍以 Transformer 为主，混合架构更常见

这段历史说明：Mamba 的爆发是 **selectivity + parallel scan kernel** 叠在一起的结果，缺一则要么慢、要么弱。
## 学到什么

1. 替代 attention 要同时做对**算法、数学、工程**——只证明复杂度不够
2. **Selectivity ≈ 按内容路由**：和 LSTM forget gate、attention softmax、MoE routing 是同一类思想
3. **Hardware-aware kernel** 已是新架构入场券：没有 fused scan，纸面 O(N) 也难进主流训练栈
4. 读 limitations 比读刷榜数字更重要：论文自己也强调 ICL 弱、混合往往更实用
5. 架构竞争常常是「各占生态位」：固定状态换吞吐，attention 换精确回看

一句话记忆：Mamba 用「可开关的小脑袋」换线性长上下文；精确逐词回看仍常要 attention 帮忙。
## 延伸阅读

- 论文：[arXiv:2312.00752](https://arxiv.org/abs/2312.00752) —— §3 selectivity motivation 必读
- 代码：[state-spaces/mamba](https://github.com/state-spaces/mamba) —— CUDA kernel 在 `csrc/selective_scan`
- [[attention]] —— Mamba 想部分替代的机制
- [[flash-attention]] —— 同一作者的 IO-aware 思路，对照着读很有启发
- [[lstm]] —— 更早的「压缩历史」路线，帮助理解状态模型直觉
- [[rwkv]] —— 另一条追求 O(N) 推理的序列建模路线

## 关联

- [[attention]] —— lossless lookup；SSM 是 lossy compression
- [[flash-attention]] —— 同一 hardware-aware 思路
- [[lstm]] —— 都用隐藏状态压历史，并行性与数学结构不同
- [[transformer]] —— 主竞品；2024 后更多「混合」而非「取代」
- [[rwkv]] —— 平行的线性时间序列建模路线
- [[llama]] —— 当代旗舰仍多走 Transformer；对照着看 Mamba 的取舍更清楚

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

