---
title: Attention Is All You Need
来源: 'Vaswani et al., "Attention Is All You Need", NeurIPS 2017'
日期: 2026-05-29
分类: 深度学习 / NLP
难度: 中级
---

## 是什么

2017 年 Google 8 个人写的 12 页论文，提出一个叫 **Transformer** 的架构，用一个叫 **attention** 的机制处理整个序列，干掉了之前主流的 RNN / LSTM。

日常类比：以前 LSTM 看小说像**逐字念**——一个字一个字地读，读到第 100 字时第 1 字早就模糊了。Transformer 是**同时看整页书**，每个词都能直接看其他所有词，然后用「attention 权重」决定哪几个最相关。

一句话：把序列建模从「沿时间步串行」变成「沿位置全并行」。

## 为什么重要

不理解 Transformer，下面这些事都没法解释：

- 为什么 **ChatGPT / Claude / Gemini / Llama** 全是 Transformer 架构——它是当前所有大模型的公共骨架
- 为什么 LSTM / GRU 在 2018 之后基本被淘汰——注意力跨度任意长、不衰减
- 为什么训练 GPU 利用率从 30% 飙到 90%——RNN 必须按时序，Transformer 可以一整层并行
- 为什么 8 年内被引 15 万次，是深度学习史上最高引论文之一——它不是一篇翻译论文，是一个**通用骨架**

## 核心要点

Transformer 的设计可以拆成 **三块**：

1. **Self-attention（自注意力）**：每个词同时去看其他所有词，用一个分数（Q·K 点积）决定「我对你有多关注」，再 softmax 归一化成权重，最后加权融合。类比：会议上每个人对其他人的发言都打个相关度分，按分数加权综合成自己的发言。

2. **Multi-head（多头）**：单一 attention 只能学一种「关注模式」。多头是同时跑 8 个独立的 attention，每个头看不同子空间——一个学语义、一个学句法、一个学相邻位置——再拼起来。类比：8 个翻译员各自专注不同维度，最后合稿。

3. **Positional encoding（位置编码）**：纯 attention 是 set 操作，不分顺序——「猫追狗」和「狗追猫」算出来一样。所以在词向量上加一个**位置向量**（用 sin/cos 不同频率算出来），把「我在第几位」注入进去。

## 实践案例

### 案例 1：「猫吃鱼」三个词怎么算 attention

每个词先变成一个向量。然后：

1. 给每个词算三个东西：query（我想问什么）、key（我能答什么）、value（我携带什么内容）
2. 第 1 词「猫」的 query 去和「猫/吃/鱼」三个词的 key 做点积，得到 3 个分数
3. softmax 归一化 → 比如得到 [0.7, 0.2, 0.1]，意思是「猫」最关注自己，其次「吃」，最不关注「鱼」
4. 用这 3 个权重对 3 个 value 加权求和，得到「猫」的新表示

每个词都做一遍，整句话就被「关系增强」了一次。

### 案例 2：Multi-head 各司其职

base 模型用 8 个头，每个头独立学。常见现象：

- 头 1 学**语法关系**：主语 ↔ 谓语
- 头 2 学**指代关系**：「他」↔ 上文具体的人
- 头 3 学**相邻位置**：每个词关注左/右一个
- 头 4 学**长程依赖**：跨句子的语义关联

8 个头各看一种，最后 concat 拼起来送进下一层。

### 案例 3：Positional encoding 用 sin/cos 注入位置

公式简化版：第 `pos` 位的位置向量第 `i` 维 = `sin(pos / 10000^(2i/d))` 或 `cos(...)`。

直觉：不同维度用**不同频率**（短到长）的正余弦波。低频维度像「秒针」转得快，高频维度像「年针」转得慢。每个位置的组合是唯一的——就像钟表的指针位置组合唯一。

模型从这个组合里能学到「相对位置」（pos+k 可以由 pos 线性变换得到）。

## 踩过的坑

1. **softmax 在大维度上会饱和**：Q·K 的方差随维度 d_k 增大而增大，softmax 进去梯度趋零。论文加了 `/√d_k` 把方差拉回 1 量级，这步叫 **scaled dot-product**。

2. **去掉 RNN 后没有顺序信号**：很多人第一次看会忘记 attention 本身是 set 操作。**必须**配 positional encoding，否则模型不知道「猫追狗」和「狗追猫」的区别。

3. **post-norm 在深层不稳**：论文用的是「残差加完再 LayerNorm」（post-norm），后来 GPT-2 改成「LayerNorm 后再进 sub-layer」（pre-norm），深层训练才稳。这个细节业界花了 2-3 年才修。

4. **O(n²) 复杂度限制长序列**：每个 token 看其他所有 token，复杂度是 `n²`。序列长度 4K 还行、100K 就要算 1 亿次点积。后来的 Flash Attention / Mamba 都是在攻这个瓶颈。

## 适用 vs 不适用场景

**适用**：
- 大语言模型骨架（GPT / Claude / Llama / Gemini）
- 视觉模型（ViT 把图像切 patch 当 token）
- 多模态对比学习（CLIP 双 encoder）
- 序列建模通用任务——翻译、摘要、生成

**不适用**：
- 极长序列（百万 token 以上）→ vanilla Transformer 算不动，需要 Flash Attention / Mamba 等优化
- 极端低算力场景（IoT 设备）→ 参数量太大，需要 DistilBERT / MobileBERT 等小型化
- 数据极少的场景 → 没有归纳偏置，需要海量数据，少数据时 CNN / RNN 反而占优

## 历史小故事（可跳过）

- **2014 年**：Bahdanau 在 RNN seq2seq 上加了 attention，让 decoder 能「看回」encoder 的所有时间步。但 attention 只是辅助，主体仍是 RNN。
- **2017 年**：Vaswani 团队（Google Brain + Google Research）8 个人在一篇 NeurIPS 论文里**直接把 RNN 去掉**，只保留 attention，配上 multi-head + positional encoding，就是 Transformer。
- **2018 年**：BERT（encoder-only）+ GPT-1（decoder-only）双线开花，把 Transformer 从「翻译架构」变成「通用预训练骨架」。
- **2020 年**：GPT-3 175B 验证了 scale 下的涌现能力。
- **2022 年**：ChatGPT 把 Transformer 推到亿级用户面前。
- **现在**：整个 AI 行业的大模型几乎都是 attention 的徒孙。

最戏剧的是：论文发表当年（2017）BLEU 28.4 看起来只是渐进改进，没人预测它会改写整个深度学习。**架构论文的真正影响力要等 5-10 年下游 scale up 之后才看清**。

## 学到什么

1. **简单 + 可并行 > 复杂 + 表达力强**——scaled dot-product 比 additive attention 简单，但 GPU 友好。硬件友好的设计赢在长期。
2. **attention is all you need 不是夸张**——去掉 RNN、去掉所有归纳偏置，纯靠数据 + scale，反而干赢。这是 "bitter lesson"（算力胜过聪明设计）的早期实证。
3. **三块拼图**：self-attention（关系建模）+ multi-head（多视角）+ positional encoding（位置信号）= Transformer。少任何一块都不行。
4. **架构论文的影响周期是 5-10 年**——发表当年的指标提升不重要，重要的是它有没有「scale 起来还成立」的潜力。

## 延伸阅读

- 视频教程：[3Blue1Brown — But what is a GPT?](https://www.youtube.com/watch?v=wjZofJX0v4M)（用动画把 attention 整套讲一遍）
- 自己写实现：[karpathy nanoGPT](https://github.com/karpathy/nanoGPT)（200 行 Python 跑通完整 GPT-2 训练）
- 论文 PDF：[Vaswani et al. 2017 arXiv 1706.03762](https://arxiv.org/abs/1706.03762)（12 页，公式密度高但工程细节齐全）
- 图解教程：[Jay Alammar — The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/)（中文翻译版很多）
- [[resnet]] —— 残差连接是 Transformer 训得动深层的前置
- [[vit]] —— Transformer 在视觉的首次成功移植

## 关联

- [[resnet]] —— 残差连接让深层 Transformer 不退化，是必备前置
- [[vit]] —— 把图像切 patch 当 token，证明 Transformer 不只属于 NLP
- [[clip]] —— 双 Transformer encoder 做图文对比学习
- [[mae]] —— encoder-only Transformer 的自监督预训练
- [[mamba]] —— 状态空间模型挑战 Transformer 的 O(n²)
- [[flash-attention]] —— IO-aware 优化，把 n² 的常数压到极致
- [[scaling-laws]] —— Transformer 训练的参数 vs 数据 vs 算力关系
- [[chinchilla]] —— compute-optimal 的 Transformer 训练配方
- [[gpt]] —— Transformer 的 decoder-only 分支
- [[bert]] —— Transformer 的 encoder-only 分支

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[activation-patching]] —— Activation Patching — 因果干预可解释性方法
- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[anthropic-circuits]] —— Anthropic Circuits — 把 Transformer 当电路逆向
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[causal-abstraction]] —— Causal Abstraction — 神经网络与算法的因果对齐
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[dit]] —— DiT — Diffusion Transformer
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[dpo]] —— DPO — Direct Preference Optimization
- [[dqn]] —— DQN — Deep Q-Network
- [[faiss-2017]] —— FAISS 2017 — 用 GPU 在十亿向量里找最近邻
- [[fermi-architecture-2010]] —— NVIDIA Fermi — 把 GPU 从游戏卡推上超算
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[induction-heads]] —— Induction Heads — Transformer 的 in-context learning 引擎
- [[kepler-architecture-2012]] —— NVIDIA Kepler — 把 GPU 调成深度学习训练默认机型
- [[mae]] —— MAE — Masked Autoencoders
- [[mamba]] —— Mamba — 选择性状态空间模型
- [[maxwell-architecture-2014]] —— NVIDIA Maxwell — 同一工艺节点把性能每瓦翻一倍
- [[mixture-of-experts]] —— Mixture of Experts (MoE)
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[muzero]] —— MuZero — 不用规则也能下棋
- [[pascal-architecture-2016]] —— NVIDIA Pascal P100 — HBM2 + NVLink + FP16 让 Tesla 真正变成 AI 卡
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[realm]] —— REALM — 把检索器和 BERT 一起预训练的第一篇论文
- [[resnet]] —— ResNet — 残差连接
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[tesla-architecture-2008]] —— NVIDIA Tesla — 把显卡改造成通用并行计算机
- [[toy-models-superposition]] —— Toy Models of Superposition
- [[turing-architecture-2018]] —— NVIDIA Turing — RT Core 把光追装进消费卡，Tensor Core 第二代下放 INT8
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[vit]] —— ViT — Vision Transformer
- [[volta-architecture-2017]] —— NVIDIA Volta V100 — 第一代 Tensor Core 把 AI 训练算力一夜抬 6 倍
- [[word2vec]] —— Word2Vec — 词向量奠基
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器

