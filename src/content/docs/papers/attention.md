---
title: Attention Is All You Need
来源: 'Vaswani et al., "Attention Is All You Need", NeurIPS 2017'
日期: 2026-05-29
子分类: 深度学习 / NLP
分类: 机器学习
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
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

每个词先变成向量。给每个词算 query / key / value 三个分量，「猫」的 query 和三个词的 key 做点积得 3 个分数 → softmax 得权重 [0.7, 0.2, 0.1] → 加权求和 3 个 value 得「猫」的新表示。每个词都做一遍，整句话就被「关系增强」了一次。

### 案例 2：Multi-head 各司其职

base 模型 8 个头独立学：头 1 学语法（主语↔谓语）、头 2 学指代（「他」↔ 上文）、头 3 学相邻位置、头 4 学跨句长程依赖。最后 concat 拼起来送下一层。

### 案例 3：Positional encoding 用 sin/cos 注入位置

第 `pos` 位的第 `i` 维 = `sin(pos / 10000^(2i/d))` 或 `cos(...)`。不同维度用不同频率正余弦——低频像秒针转得快、高频像年针转得慢，组合唯一像钟表指针。模型从中学「相对位置」（pos+k 可由 pos 线性变换得到）。

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
- **2020-2022**：GPT-3 175B 验证 scale 下的涌现能力，ChatGPT 把 Transformer 推到亿级用户面前；现在整个 AI 行业的大模型几乎都是 attention 的徒孙。

最戏剧的是：论文发表当年（2017）BLEU 28.4 看起来只是渐进改进，没人预测它会改写整个深度学习。**架构论文的真正影响力要等 5-10 年下游 scale up 之后才看清**。

## 学到什么

1. **简单 + 可并行 > 复杂 + 表达力强**——scaled dot-product 比 additive attention 简单但 GPU 友好；硬件友好的设计赢在长期。
2. **三块拼图就够 Transformer**：self-attention（关系建模）+ multi-head（多视角）+ positional encoding（位置信号）。去掉 RNN 和归纳偏置纯靠 scale 反而干赢，是"bitter lesson" 的早期实证。
3. **架构论文的影响周期是 5-10 年**——发表当年指标提升不重要，重要的是它有没有「scale 起来还成立」的潜力。

## 延伸阅读

- 论文 PDF：[Vaswani et al. 2017 arXiv 1706.03762](https://arxiv.org/abs/1706.03762)（12 页，公式密度高但工程细节齐全）
- 视频 + 图解：[3Blue1Brown — But what is a GPT?](https://www.youtube.com/watch?v=wjZofJX0v4M) + [Jay Alammar Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/)（动画 + 中文翻译）
- 自己写实现：[karpathy nanoGPT](https://github.com/karpathy/nanoGPT)（200 行 Python 跑通完整 GPT-2 训练）

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
- [[align-2021]] —— ALIGN — 用 18 亿条脏图文对训练，证明数据规模能压住噪声
- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[ampere-architecture-2020]] —— NVIDIA Ampere — 第三代 Tensor Core 加 TF32 / BF16 / FP64，结构化稀疏 + MIG 重写大模型时代硬件假设
- [[ance-2020]] —— ANCE — 让模型自己挖训练负例，对比学习的"自给自足"
- [[anthropic-circuits]] —— Anthropic Circuits — 把 Transformer 当电路逆向
- [[anthropic-prompt-caching]] —— Anthropic Prompt Caching — 让长 prompt 只算一次，后续只付 10%
- [[batchnorm-2015]] —— Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[bert4rec-2019]] —— BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模
- [[biggan-2018]] —— BigGAN — 把 GAN 暴力放大到 ImageNet 512×512
- [[blackwell-architecture-2024]] —— NVIDIA Blackwell — 双 die NV-HBI + 第二代 Transformer Engine + FP4 让万亿参数训练日常化
- [[causal-abstraction]] —— Causal Abstraction — 神经网络与算法的因果对齐
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[coca-2022]] —— CoCa — 把对比和生成两种多模态训练目标合到一个模型里
- [[codellama-2023]] —— Code Llama — 开源代码模型的完整训练配方
- [[codex-2021]] —— Codex — 让 GPT 学会写 Python，并造一把尺子量它
- [[colbert-2020]] —— ColBERT — 让 BERT 检索既准又能扛大规模
- [[colbert-v2]] —— ColBERTv2 — 让向量检索既精又能扛百万文档
- [[dcn-2017]] —— DCN — 在 DNN 旁边并联一条专门学特征交叉的网络
- [[deberta-2021]] —— DeBERTa — 把"内容"和"位置"拆成两路独立看的 BERT
- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[deepseek-coder-2024]] —— DeepSeek-Coder — 按整个仓库喂代码的开源 SOTA
- [[din-2018]] —— DIN — 让推荐模型按你看的广告决定该激活你哪段历史
- [[distserve]] —— DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑
- [[dit]] —— DiT — Diffusion Transformer
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[dpo]] —— DPO — Direct Preference Optimization
- [[dpr-2020]] —— DPR — 用 BERT 双塔把检索从 BM25 时代拉进稠密向量时代
- [[dqn]] —— DQN — Deep Q-Network
- [[eagle]] —— EAGLE — 让大模型先在"特征层"猜下一步而不是猜 token
- [[elmo-2018]] —— ELMo — 让词向量随上下文变化
- [[faiss-2017]] —— FAISS 2017 — 用 GPU 在十亿向量里找最近邻
- [[fastertransformer-2021]] —— FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
- [[fermi-architecture-2010]] —— NVIDIA Fermi — 把 GPU 从游戏卡推上超算
- [[filip-2021]] —— FILIP — 把 CLIP 的图文对齐细化到 token 级
- [[flamingo-2022]] —— Flamingo — 让冻结的大模型学会看图，几张样例就上手
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gat-2018]] —— GAT — 让图神经网络的邻居自带权重
- [[gcn-2017]] —— GCN 2017 — 把卷积搬到图结构上的最简版本
- [[goodfellow-fgsm-2014]] —— FGSM — 用一行梯度让神经网络看错图片
- [[gpipe-2019]] —— GPipe — micro-batch 流水线让 GPU 排成生产线
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[grokking-2022]] —— Grokking — 训练 loss 早归零，几千步后才突然学会
- [[gru-2014]] —— GRU 2014 — 用两个门替代 LSTM 三个门，编码-解码范式登场
- [[gshard-2020]] —— GShard — 用注解让 600B 模型自动跨设备切片
- [[hopper-architecture-2022]] —— NVIDIA Hopper — Transformer Engine + FP8 + TMA + Thread Block Cluster 把硅片为 LLM 量身定制
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[imagen-2022]] —— Imagen — 文生图真正的引擎是语言模型
- [[induction-heads]] —— Induction Heads — Transformer 的 in-context learning 引擎
- [[karis-2014-taa]] —— Karis 2014 TAA — 让游戏每帧只采一次也能 4K 不锯齿
- [[karis-2014-ue4-pbr]] —— Karis UE4 PBR — 把电影质感塞进游戏的 33 毫秒
- [[kepler-architecture-2012]] —— NVIDIA Kepler — 把 GPU 调成深度学习训练默认机型
- [[label-smoothing-2016]] —— Label Smoothing — 别让模型对正确答案过度自信
- [[li-2018-redner]] —— redner — 让光线追踪能反向传播过几何边缘
- [[liu-2020-dlss]] —— DLSS 2.0 — 把 4K 实时渲染的一半工作量交给神经网络
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[llm-int8-2022]] —— LLM.int8() — 大模型激活值里藏着几个超大异常通道
- [[longformer-2020]] —— Longformer — 滑窗加少数全局 token，把长文档喂进 Transformer
- [[mae]] —— MAE — Masked Autoencoders
- [[mamba]] —— Mamba — 选择性状态空间模型
- [[maron-kuhns-1960]] —— Maron-Kuhns 1960 — 检索不是匹配，是猜"对你有用的概率"
- [[maxwell-architecture-2014]] —— NVIDIA Maxwell — 同一工艺节点把性能每瓦翻一倍
- [[mixture-of-experts]] —— Mixture of Experts (MoE)
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[mueller-2022-instant-ngp]] —— Instant-NGP — 把 NeRF 训练从几小时压到 5 秒
- [[muzero]] —— MuZero — 不用规则也能下棋
- [[nerf-2020]] —— NeRF — 用一个 MLP 把整个场景"背"下来
- [[neumf-2017]] —— NeuMF — 用神经网络替掉推荐系统的内积
- [[nickolls-dally-2010-cuda-era]] —— Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI
- [[orca-continuous-batching]] —— Orca — 让一批 LLM 请求随到随走，不再排队等最长那个
- [[parti-2022]] —— Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
- [[pascal-architecture-2016]] —— NVIDIA Pascal P100 — HBM2 + NVLink + FP16 让 Tesla 真正变成 AI 卡
- [[performer-2020]] —— Performer — 用随机特征把 softmax attention 拉成线性复杂度
- [[pipedream-2019]] —— PipeDream — 1F1B 调度让流水线工位别空等
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[prototypical-networks-2017]] —— Prototypical Networks — 每类算个均值，比距离就够了
- [[realm]] —— REALM — 把检索器和 BERT 一起预训练的第一篇论文
- [[reformer-2020]] —— Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)
- [[resnet]] —— ResNet — 残差连接
- [[rwkv-2023]] —— RWKV — 让 RNN 拿到 Transformer 那张训练并行的入场券
- [[sarathi-serve]] —— Sarathi-Serve — 让长 prompt 不再卡住所有人的流式回复
- [[sasrec-2018]] —— SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律
- [[seq2seq-2014]] —— Seq2Seq — 把翻译变成端到端神经网络
- [[sparsegpt-2023]] —— SparseGPT — 175B 大模型一次过剪 50%，不重训
- [[specinfer-2023]] —— SpecInfer — 让大模型一次"猜一棵树"再并行验证
- [[stylegan2-2020]] —— StyleGAN2 — 把 StyleGAN 的水滴瑕疵和潜空间纠葛一起修掉
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[tabpfn-2023]] —— TabPFN — 一秒解决小表格分类的 Transformer
- [[tesla-architecture-2008]] —— NVIDIA Tesla — 把显卡改造成通用并行计算机
- [[toy-models-superposition]] —— Toy Models of Superposition
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
- [[turing-architecture-2018]] —— NVIDIA Turing — RT Core 把光追装进消费卡，Tensor Core 第二代下放 INT8
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[tvm-2018]] —— TVM OSDI 2018 — 把 Halide 思想搬到深度学习
- [[vit]] —— ViT — Vision Transformer
- [[volta-architecture-2017]] —— NVIDIA Volta V100 — 第一代 Tensor Core 把 AI 训练算力一夜抬 6 倍
- [[wide-deep-2016]] —— Wide & Deep — 让模型同时学会"记住"和"举一反三"
- [[word2vec]] —— Word2Vec — 词向量奠基
- [[world-model-robot-learning-2026]] —— 机器人世界模型综述 — 预测未来再动手
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器
- [[xlnet-2019]] —— XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向

