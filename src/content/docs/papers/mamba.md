---
title: Mamba — 选择性状态空间模型
来源: 'Gu & Dao, "Mamba: Linear-Time Sequence Modeling with Selective State Spaces", 2023'
日期: 2026-05-29
分类: NLP / 深度学习
难度: 中级
---

## 是什么

Mamba 是 2023 年底 Carnegie Mellon 的 Albert Gu 和 Tri Dao 提出的**新一代序列模型架构**，用一种叫"选择性状态空间"（Selective State Space Model，简称 **S6** = S4 + Selection）的机制**替代了 Transformer 里的 [[attention]]**。

日常类比：

- **Transformer 处理长文像背诵全文**——每个新词都要和前面所有词逐一比较"你和我有关系吗"，越往后越累
- **Mamba 像速读高手**——边读边把当前页的关键信息塞进一个固定大小的"小脑袋"里，下一页就只看小脑袋 + 新内容

正因为只看"压缩过的小脑袋"，Mamba 处理 100 万 token 的长上下文时**不像 Transformer 那样卡死**，而是顺顺当当一直读下去。论文标题里的 "Linear-Time Sequence Modeling" 不是市场口号——是数学证明的 **O(N) 推理时间** 保证。

## 为什么重要

不理解 Mamba，下面这些事都没法解释：

- 为什么 2024 年开始有一波"线性 attention 复兴"——RWKV、RetNet、xLSTM 全是这条路
- 为什么 AI21 / Mistral / TII 等团队开始出 Mamba+Transformer **混合模型**（Jamba、Codestral Mamba、Falcon-Mamba）
- 为什么基因组学、长音频、长视频这些"序列动辄 100 万"的领域，Mamba 几乎垄断
- 为什么有人喊"Transformer 终结者"——但两年过去，旗舰 LLM 还是清一色 Transformer
- 为什么"算法 + CUDA kernel 协同设计"成了 LLM-era 新论文的标配
- 为什么 Tri Dao 同一作者，左手 [[flash-attention]] 推 Transformer，右手 Mamba 推替代——这种"两面下注"恰恰说明谁也没完全胜出

Mamba 的核心承诺是 **推理时间线性 O(N)**（Transformer 是平方 O(N²)）+ **state 大小固定 O(1)**（Transformer 的 KV cache 随 token 数线性涨）。

## 核心要点

Mamba 做对了三件事，缺一不可：

1. **State Space Model（SSM）打底**：用一个隐藏向量 h 压缩到目前为止读过的所有内容。类比 LSTM 的"记忆细胞"，但数学结构来自控制论，更清晰、更可控。每读一个 token 就更新一次 h，h 的大小固定（论文默认 16 维），不随上下文增长。

2. **Selective（选择性）—— 这是真正的突破**：以前的 SSM（如 S4）参数是固定的，处理任何 token 都用同一种方式更新 h。Mamba 让参数 **根据当前输入动态生成**——遇到重要 token 多写一笔，遇到无关 token 直接跳过。这就是"speed reading"的本质。

3. **Hardware-aware CUDA kernel**：单纯把参数变 input-dependent 会让训练 **没法并行**（不再是固定卷积）。Mamba 用 **parallel scan**（一个 1990 年就有但被深度学习社区忘掉的并行算法）+ 把所有中间值留在 GPU 的 SRAM 里，让训练速度追上 [[flash-attention]] 优化过的 Transformer。

三件事合起来 = **训练快 + 推理超快 + 长上下文能跑**。

## 实践案例

### 案例 1：100 万 token 长文档

任务：把整本《战争与和平》（约 50 万词）喂给模型做摘要。

- **Transformer**：32k 上下文已经吃力，128k 要 ring attention，1M 显存爆炸
- **Mamba**：state 始终是同样大小（约 128KB），从头读到尾内存不变，速度线性

### 案例 2：基因组建模（DNA 序列）

人类基因组 30 亿碱基对。Mamba 在 1M-token 序列上比 Transformer 低 4-8 个 perplexity 点（ppl 越低越好）。这是 Mamba 真正打 Transformer 不还手的领域。

### 案例 3：同规模 LM 性能

Mamba-2.8B 在 Pile 数据集训练 300B token 后，**ppl 略优于 Pythia-2.8B**（同规模 Transformer），而推理速度快 5x。但 **仅在 7B 以下**——更大规模上 Transformer 仍占优。

### 案例 4：流式语音转写

实时语音需要"边听边输出"。Transformer 每个新词都要回看所有历史 token，越长越慢；Mamba 的 state 是固定大小，每个新词处理时间常数——天然适合流式场景。这是 Mamba 在产品落地最现实的窗口。

## 踩过的坑

1. **In-context learning 弱**：Mamba 把历史压缩成固定向量是有损（lossy）的，少样本学习（few-shot prompting）能力比 Transformer 差 2-5%。RAG / 精确召回类任务（needle-in-haystack）落后更多。

2. **"无 KV cache"是修辞**：确实没有 attention 的 KV cache，但 conv1d 还要保留前 4 个 token 的 input；prefill 阶段仍是 O(L)。准确说法是"decode 阶段每 token O(1)"。

3. **训练超参敏感**：A 矩阵必须用 HiPPO 风格初始化，Delta 范围严格在 [0.001, 0.1]，深层网络必须开 residual_in_fp32——配方不对直接 NaN。比 Transformer "随便糊上去都能训"差远了。

4. **生态贫瘠**：Transformer 有 vLLM / TGI / TensorRT-LLM 全套生态，Mamba 只有官方 mamba-ssm 一个 repo + HuggingFace 支持有限。生产部署得自己搞 inference server。

## 适用 vs 不适用场景

**适用**：

- 超长上下文（32k+）+ 推理流量大于训练（流式语音、实时翻译、长文档摘要）
- 嵌入式 / 边缘部署（state 仅 MB 级，无需 GB 级 KV cache）
- 基因组 / 高分辨率音频（序列动辄 1M+，Transformer 物理上不行）
- 与 Transformer **混合**（Jamba 风格，1:7 比例 attention，兼顾 ICL 和 long context）

**不适用**：

- 强 in-context learning 需求（few-shot prompting 是 LLM 主要使用方式）
- 精确召回 / 检索（RAG、code search、法律医疗文档）
- 对生态成熟度敏感的生产环境
- 任务画像不清时——Transformer 永远是 safer bet

## 历史小故事（可跳过）

- **1960 年代**：控制论提出 State Space Model，描述线性动态系统
- **1990 年**：Blelloch 发明 work-efficient parallel scan 算法，本是并行计算理论的玩具
- **1997 年**：LSTM 诞生，第一次让 RNN 实用化处理长依赖
- **2017 年**：Transformer 论文发布，[[attention]] 成为序列建模主流
- **2020 年**：Albert Gu 等提出 HiPPO 理论，给 SSM 一个稳定的 A 矩阵初始化
- **2021 年**：S4 在 Long Range Arena 上首次超过 Transformer，但语言建模仍弱
- **2023 年 12 月**：Gu & Dao 把 "selectivity" 加进 SSM，Mamba 论文发布，社区炸了
- **2024 年**：Mamba-2（State Space Duality）/ Jamba / Falcon-Mamba 7B 等扩展涌现；旗舰 LLM 仍未采用

Mamba 的成功是 **算法 + 工程同等重要** 的典型——光有 selectivity 没有 hardware-aware kernel，速度跑不起来；光有 kernel 没有 selectivity，建模能力不够。

## 案例补充：混合架构（Jamba）的工程经验

AI21 的 Jamba 把 Transformer 和 Mamba 按 1:7 比例混排：每 8 层里 1 层是 attention、7 层是 Mamba。结果是：

- **长上下文 256k**：内存占用比纯 Transformer 低 5x
- **ICL（in-context learning）保住了**：靠那 1/8 的 attention 层维持精确召回
- **吞吐量翻倍**：大部分计算量在 Mamba 上，attention 只在关键节点

这是 Mamba 在 2024-2025 年最现实的落地形式——纯 Mamba 替代 Transformer 失败了，但混合架构给两边都留了位置。Codestral Mamba（Mistral）和 Falcon-Mamba（TII）都走了类似路线。

更深的启示：架构竞争往往不是"谁取代谁"，而是"谁补谁"。Mamba 的固定 state 提供 O(N) 推理，attention 提供精确召回；两者都是有价值的能力，混合是利益最大化的选择。这种"打平不是失败，而是各占生态位"的格局，在硬件领域（CPU vs GPU vs ASIC）已经反复出现。

## 学到什么

1. **Transformer 不是终点，但替代它要同时做对算法、数学、工程三件事**——只做一件不够
2. **state expansion 与 attention 的对偶**：N=16 的状态向量本质是 16 个独立 channel 的记忆，类似 multi-head 但每 head 是 RNN
3. **selectivity 的本质是 input-dependent routing**——和 MoE 的 expert routing、LSTM 的 forget gate、attention 的 softmax 是同一类思想：让模型基于输入动态选信息
4. **hardware-aware 已经成为新模型入场券**：未来任何"O(N) 训练复杂度"的模型，没有自己的 fused kernel 就上不了主流——FlashAttention / Mamba / FlexAttention 都是这个套路
5. **看一篇 paper 的 limitations 比 results 更重要**：Mamba 论文 limitation 里就老老实实写了 ICL 弱、混合最好——读者经常跳过，然后惊讶"为什么没替代 Transformer"

## 延伸阅读

- 论文 PDF：[Mamba arXiv 2312.00752](https://arxiv.org/abs/2312.00752)（密度高但写得清晰，section 3 selectivity motivation 必读）
- 官方代码：[state-spaces/mamba](https://github.com/state-spaces/mamba)（13k+ stars，CUDA kernel 在 csrc/selective_scan）
- [[attention]] —— Mamba 想替代的那个机制
- [[flash-attention]] —— Tri Dao 同一作者，同一 IO-aware 思路从 attention 搬到 SSM

## 关联

- [[attention]] —— Mamba 的对照面；attention 是 lossless lookup，SSM 是 lossy compression
- [[flash-attention]] —— 同一作者 Tri Dao；同一 hardware-aware kernel 思想；Mamba 的反对者也是同一个人
- [[lstm]] —— Mamba 的远亲，都用"隐藏状态压缩历史"，但数学结构和并行性差距大
- [[transformer]] —— Mamba 的竞争对手；2024 后双方更多走"混合"而非"替代"
- [[rwkv]] —— 同样追求 O(N) 推理的"线性 attention"路线，与 Mamba 平行竞争

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[dqn]] —— DQN — Deep Q-Network
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[resnet]] —— ResNet — 残差连接
- [[rwkv-2023]] —— RWKV — 让 RNN 拿到 Transformer 那张训练并行的入场券

