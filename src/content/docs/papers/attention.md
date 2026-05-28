---
title: Transformer Attention Is All You Need
来源: Vaswani et al., "Attention Is All You Need", NeurIPS 2017 / arXiv 1706.03762
---

## 一句话总结

Transformer 用纯 attention 替代 RNN，让序列模型从「沿时间步串行」变成「沿位置全并行」，
是过去十年深度学习最具影响力的单篇架构论文。

## 历史定位

按时间轴看，序列建模的范式迁移大致是这样的：

- 1997: LSTM（Hochreiter & Schmidhuber）解决 RNN 长程依赖梯度消失
- 2014: seq2seq（Sutskever et al.）encoder-decoder 框架，机器翻译走向神经网络
- 2015: Bahdanau attention 让 decoder 可以「看回」encoder 任何时间步
- 2017: **Transformer** 干脆把 RNN 全部去掉，只保留 attention
- 2018: BERT（encoder-only）+ GPT-1（decoder-only）双线开花
- 2020: GPT-3 175B 验证了 transformer 在 scale 下涌现能力
- 2023: Mamba / RetNet 等状态空间模型尝试挑战 transformer，但 transformer 仍是主流

引用数 130k+，是深度学习史上 Top 5 引用论文之一。BERT、GPT 系列、T5、ViT、CLIP、Stable
Diffusion、SAM、Claude、LLaMA、DeepSeek、Gemini 几乎所有现代大模型 backbone 都是
Transformer 或其变体。

## 类比起手：为什么需要 attention

把序列建模想象成一个会议室在做翻译：

- **RNN 模式**：只有一个翻译员，从第一个字开始一个一个听，每听一个就更新「我现在脑海里
  的整句意思」。听到第 100 个字时，第 1 个字的细节早就被压缩到无法还原。
- **attention 模式**：100 个翻译员同时在场，每个翻译员负责输出一个目标语言的字。当第 50
  号翻译员要决定输出什么时，他可以「看回」原句的所有 100 个字，自己决定哪几个字最相关。

RNN 的瓶颈：单个隐状态向量要承载整句信息 → 容量不够 + 串行不并行。
Attention 的破局：每个输出位置都直接「投票」给所有输入位置 → 容量无瓶颈 + 全并行。

---

## Section 1: 动机 — RNN 的两个根本痛点

### 痛点 1：序列依赖，无法并行

RNN 的状态更新是 `h_t = f(h_{t-1}, x_t)`，第 t 步必须等第 t-1 步算完。一句 100 个 token
的句子在 GPU 上也要走 100 步。GPU 有几千个核但你只能用 1 个时间步的算力。

LSTM 缓解了梯度消失，但没解决并行问题——它仍然是「先后」结构。

### 痛点 2：长程依赖路径过长

RNN 里 token A 影响 token B 的「最短路径」是 |A - B| 步。每多一步就多一次梯度衰减/累积。
即使 LSTM 用门控减轻，100 步以上依然衰减严重。

### 已有线索：Bahdanau attention（2015）

Bahdanau attention 已经在 RNN seq2seq 上证明了「让 decoder 看回 encoder 全部时间步」能
显著提升翻译质量。但它是 RNN + attention 的混合体，attention 只是辅助。

> 怀疑：Bahdanau 2015 的 attention 在 RNN 上效果显著，但当时没人想过「干脆把 RNN 去掉只
> 留 attention」。这是一个 hindsight bias 显得「显然」、但 2017 之前业界没敢想的方向。
> 我怀疑论文真正的贡献不在数学（softmax(QK/√d)V 早就在 Bahdanau 里有），而在于「敢去掉
> RNN」的工程胆量 + 配套的 positional encoding/multi-head/scaling 这一套打磨。

### 假设

去掉 RNN，全部用 attention 替代。需要解决三个问题：

1. attention 自己不知道 token 顺序（顺序对自然语言至关重要）
2. 单一 attention pattern 表达力可能不够
3. 训练稳定性（softmax 在大维度上容易饱和）

Transformer 论文的回答分别是：positional encoding、multi-head、√d_k scaling。

---

## Section 2: 核心定义

### Definition 1: Scaled Dot-Product Attention

$$
\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{Q K^\top}{\sqrt{d_k}}\right) V
$$

其中：

- `Q ∈ R^{n × d_k}` — query 矩阵（n 个 token，每个 token 一个 d_k 维 query）
- `K ∈ R^{n × d_k}` — key 矩阵
- `V ∈ R^{n × d_v}` — value 矩阵
- `d_k` — query/key 的维度（base 模型里 = 64）

四步分解：

1. `Q · K^T`：算出 [n × n] 的「相似度矩阵」，第 (i, j) 项是 token i 的 query 和 token j
   的 key 的点积，物理意义是「i 应不应该看 j」
2. `/ √d_k`：scale。因为 d_k 大时，点积的方差是 d_k 量级，softmax 进去会饱和（梯度极
   小），除以 √d_k 让方差回到 1 量级
3. `softmax`：按行归一化，让每一行加起来 = 1，得到「i 看每个 j 的权重」
4. `× V`：用权重对 value 加权求和

### Definition 2: Multi-Head Attention

单一 attention 只能学一种「关注模式」。multi-head 同时跑 h 个独立的 attention，每个看到
不同的子空间：

$$
\text{head}_i = \text{Attention}(Q W_i^Q, K W_i^K, V W_i^V)
$$

$$
\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h) W^O
$$

base 模型：`d_model = 512, h = 8, d_k = d_v = 512/8 = 64`。

每个 head 用独立的投影矩阵 `W_i^Q, W_i^K ∈ R^{512×64}` 和 `W_i^V ∈ R^{512×64}` 把 512 维
input 投到 64 维子空间。h 个 head 的输出 concat 回 512 维，再乘 `W^O ∈ R^{512×512}`。

直觉：第 1 个 head 可能学「主谓关系」、第 2 个 head 学「指代关系」、第 3 个 head 学「相
邻位置」……不同 head 各司其职。

> 怀疑：multi-head 数量 h=8（base）/ h=16（big）是经验值，h 与 d_model 的比例选择没有理
> 论。Chinchilla / scaling laws 论文研究了模型大小 vs 数据量 vs FLOPs 的最优比例，但
> head 数量从未被系统性研究。GPT-3 175B 用 h=96，到底是「越多越好」还是某种 scaling
> law？2024 年的 Llama 3 用 GQA（grouped query attention）减少了 K/V head，又是另一种
> 思路。

### Definition 3: Positional Encoding

Attention 本身是 set 操作（顺序无关）。给定 token 集合 {A, B, C} 和 {C, A, B}，纯
attention 算出来一样。但语言里「猫追狗」和「狗追猫」语义完全不同。

解决：在 input embedding 上加一个「位置向量」PE：

$$
PE(pos, 2i) = \sin\!\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right), \quad
PE(pos, 2i+1) = \cos\!\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right)
$$

每个位置 pos 得到一个 d_model 维向量。第 2i 维用正弦、第 2i+1 维用余弦，频率从高到低。

为什么这样设计？论文 §3.5 给的理由是：对任意固定偏移 k，`PE(pos+k)` 都可以表示成
`PE(pos)` 的线性变换。这意味着模型可以「学到相对位置」。

> 怀疑：positional encoding 用 sinusoidal 是论文重要设计，但实际后续工作（BERT / GPT-2
> / GPT-3）用学习的 position embedding 也行。sinusoidal 真的是「必要」还是「作者偏
> 好」？后来 RoPE（旋转位置编码）/ ALiBi（带偏置的 attention）证明了在长序列外推上
> sinusoidal 还不够好。看起来论文当时的设计选择更多是「能用就行」而不是「最优解」。

---

## Section 3: 架构详解

### Section 3.1: Encoder

6 层 stack，每层两个 sub-layer：

1. multi-head self-attention（Q, K, V 都来自同一个输入）
2. position-wise FFN：`FFN(x) = max(0, x W_1 + b_1) W_2 + b_2`，中间维度 d_ff = 2048

每个 sub-layer 外面都套：`LayerNorm(x + Sublayer(x))`（残差 + LN）。

> 怀疑：论文用的是「post-norm」（残差加完再 LayerNorm），后来 GPT-2 改成「pre-norm」
> （LayerNorm 后再进 sub-layer，残差直接加 raw 输出）。pre-norm 在深层模型更稳。论文
> 当时为什么选 post-norm？是没注意到稳定性问题，还是 6 层不够深所以没暴露？这个细节后
> 来花了 2-3 年才被业界重新审视。

### Section 3.2: Decoder

6 层 stack，每层三个 sub-layer：

1. **masked** multi-head self-attention（causal mask，只能看左侧）
2. encoder-decoder cross-attention（Q 来自 decoder，K/V 来自 encoder 输出）
3. position-wise FFN

masked self-attention 的实现：在 softmax 之前，把上三角位置（j > i）设成 -∞，softmax 出
来就是 0。这保证生成第 i 个 token 时不会偷看第 i+1 及以后的 token。

cross-attention 是连接 encoder 和 decoder 的桥梁：decoder 当前位置的 query 去查 encoder
的所有位置，决定该「翻译」原句的哪部分。

### Section 3.3: Attention 实现细节

**为什么用 dot-product 而不是 additive attention？**

Bahdanau 2015 用 additive attention：`score(q, k) = v^T tanh(W_q q + W_k k)`。这个东西
表达力理论上更强（一个小 MLP），但在 GPU 上很慢。

dot-product 在 d_k 小时和 additive 差不多，d_k 大时 additive 反而更好（因为 dot-product
的方差爆炸）。所以论文加了 `/√d_k` 这一步，让 dot-product 在大 d_k 也能 work，同时享受
GPU matmul 的极致并行。

**√d_k scaling 的推导**：

假设 q 和 k 的每一维独立同分布，均值 0、方差 1。那么 `q · k = Σ q_i k_i` 的方差是 d_k。
softmax(x) 在 |x| 大时梯度趋于 0（饱和）。除以 √d_k 把方差还原到 1，softmax 不饱和。

> 怀疑：论文 §3.4 说「scale by √d_k」是为了防止饱和，但选 √d_k 是经验值。理论上选
> 1/d_k^α 让方差变成 d_k^{1-2α}，α=0.5 是让方差 = 1。但「方差 = 1 是最优」这个假设没
> 证。后来 RoPE / Flash Attention / Mamba 都没改这个，是「真的最优」还是「没人验证过其
> 他选择」？这是个值得做消融的开放问题。

### Section 3.4: 维度细节

base 模型完整维度：

- input embedding: 词表大小 → 512
- positional encoding: 加在 embedding 上，维度也是 512
- 每层 self-attention：8 head × 64 = 512，concat 后 512 → 512
- FFN：512 → 2048 → 512
- output linear：512 → 词表大小
- softmax 出概率分布

参数量计算（一层 encoder block）：
- attention: 4 个 [512×512] 矩阵（W^Q, W^K, W^V, W^O）= 4 × 262144 ≈ 1M
- FFN: [512×2048] + [2048×512] = 2 × 1M = 2M
- LayerNorm 参数：可忽略
- 一层共 ~3M，6 层 18M，加上 embedding 和 decoder，base 模型 65M 参数

big 模型把 d_model 翻倍（1024）+ 16 head + d_ff = 4096，参数量 213M。

---

![Figure 1: Transformer 架构 — encoder + decoder block 全貌](/papers/attention/01-transformer-block.webp)

上图是论文 Figure 1 的简化版。左侧 encoder 6 层 stack，每层「multi-head self-attn → add &
norm → FFN → add & norm」。右侧 decoder 6 层 stack，每层比 encoder 多一个 cross-attn
sub-layer（紫色），K, V 从 encoder 输出过来，Q 从 decoder 内部来。

---

## Section 4: 复杂度对比

### Algorithm 1: 复杂度推导

self-attention 的复杂度：

- `Q · K^T`：[n × d] × [d × n] = [n × n]，FLOPs = `n² · d`
- `softmax`：[n × n]，FLOPs = `n²`（忽略常数）
- `× V`：[n × n] × [n × d] = [n × d]，FLOPs = `n² · d`

合计：`O(n² · d)`。注意是 d 而不是 d²，因为 attention 的核心是「token 之间的二次交
互」，每次交互的成本是 d 维点积。

RNN 的复杂度：

- 每步状态更新 `h_t = tanh(W_h h_{t-1} + W_x x_t)`：`O(d²)`
- n 步串行：`O(n · d²)`

CNN（kernel size k）的复杂度：

- 每个位置算 k 个邻居的卷积：`O(k · d²)`
- n 个位置：`O(k · n · d²)`

### 三个维度对比

| 层类型 | 复杂度 | 串行步数 | 最大路径长度 |
|--------|--------|---------|--------------|
| self-attention | O(n² · d) | O(1) 全并行 | O(1) |
| RNN | O(n · d²) | O(n) | O(n) |
| CNN（kernel k） | O(k · n · d²) | O(1) | O(log_k n) |

**关键洞察**：

1. 当 `n < d` 时，self-attention 的总 FLOPs 比 RNN 还小（n²d < nd² ⟺ n < d）。base 模型
   d=512，所以序列长度 < 512 时 self-attention 计算量更少。
2. self-attention 的「串行步数」恒为 1（一次大 matmul 完事），RNN 是 n。在 GPU 上这是
   100 倍以上的实际速度差距。
3. self-attention 的「最大路径长度」恒为 1，意味着任意两个 token 之间梯度只走一步。RNN
   要走 n 步，长程依赖学习困难。

> 怀疑：「self-attention 的 O(n² · d) 复杂度限制长序列」这个故事在 2017 年是个理论问
> 题，但 2024 年才真正成为瓶颈（4K → 8K → 32K → 100K → 1M context length）。这中间发生
> 了什么？是模型大小先涨上去，序列长度才被需求拉起来。Flash Attention（2022）把 n²
> 的常数压到极致、Ring Attention 把 n² 切到多机、Mamba 干脆改用 O(n) 状态空间——这条线
> 索都是 transformer 内卷出的产物。

---

![Figure 2: scaled dot-product 公式 + multi-head 拆分 + 复杂度对比](/papers/attention/02-attention-formula.webp)

上图是核心数学的「一图流」：上半部分是 scaled dot-product 的四步公式；中间是 multi-head
的拆分方式；下面是和 RNN / CNN 的复杂度对照表。配着 Section 3 / Section 4 的文字看。

---

## Section 5: 训练 + 实验

### 任务

- WMT 2014 English-German 翻译（4.5M 句对）
- WMT 2014 English-French 翻译（36M 句对）

### 模型大小

- base: 6 层、512 维、8 head、65M 参数
- big: 6 层、1024 维、16 head、213M 参数

### 训练细节

- 优化器：Adam，β1=0.9, β2=0.98, ε=1e-9
- learning rate schedule：warmup 4000 步，然后按 `step^-0.5` 衰减
  - 公式：`lr = d_model^-0.5 · min(step^-0.5, step · warmup^-1.5)`
- regularization：
  - dropout 0.1（base）/ 0.3（big）加在每个 sub-layer 输出 + embedding + PE
  - label smoothing 0.1（softmax 目标从 one-hot 改成接近 one-hot 的分布）
- 硬件：8 块 P100 GPU
- 训练时长：base 12 小时，big 3.5 天

### 结果

WMT 2014 En→De：
- 之前 SOTA: 26.30 BLEU（GNMT 2016）
- Transformer base: 27.3 BLEU
- Transformer big: **28.4 BLEU**（新 SOTA）

WMT 2014 En→Fr：
- 之前 SOTA: 41.16 BLEU
- Transformer big: **41.8 BLEU**

更关键的是训练成本：Transformer big 训练用 `2.3 × 10^19` FLOPs，是之前 SOTA 的
1/4 ~ 1/100。

> 怀疑：Transformer 在 2017 年「BLEU 28.4」看起来只是渐进改进（之前 26.3），并不惊艳。
> 真正的影响力是后来一年（2018）BERT + GPT 在 GLUE / 阅读理解 / 文本生成全面超过 LSTM。
> 如果当时只看翻译 BLEU，没人会预测它会改写整个深度学习。这给我的启示：**架构论文的影
> 响要等下游任务/scale up 之后才能看清**，BLEU 0.1 提升和「干掉 RNN」是两件事。

---

## Section 6: 后续工作 + 影响

时间线：

| 年份 | 工作 | 关系 |
|------|------|------|
| 2018 | BERT (Devlin et al.) | encoder-only，masked language model 预训练 |
| 2018 | GPT-1 (Radford et al.) | decoder-only，autoregressive 预训练 |
| 2019 | GPT-2 (Radford et al.) | decoder scale up 到 1.5B |
| 2019 | T5 (Raffel et al.) | 完整 encoder-decoder + text2text 统一框架 |
| 2020 | GPT-3 (Brown et al.) | 175B，in-context learning 涌现 |
| 2020 | ViT (Dosovitskiy et al.) | 把图像切 patch 当 token，transformer 做视觉 |
| 2021 | CLIP (Radford et al.) | 双 transformer encoder（图 + 文）做对比学习 |
| 2022 | Flash Attention (Dao et al.) | IO-aware attention，把 n² 常数压极致 |
| 2022 | InstructGPT / ChatGPT | RLHF + GPT-3.5 |
| 2023 | LLaMA / GPT-4 / Claude | decoder-only LLM 基础设施 |
| 2023 | Mamba (Gu & Dao) | 状态空间模型挑战 transformer |
| 2024 | Llama 3 / GPT-4o | GQA / MQA 优化，长 context |

### 三大分支

**Encoder-only（理解任务）**：BERT, RoBERTa, ELECTRA → 阅读理解、分类、NER。现在大部分被
LLM 统一了，但小模型场景仍然占有一席。

**Decoder-only（生成任务）**：GPT 系列, Claude, LLaMA, DeepSeek。当下 LLM 的主流。

**Encoder-decoder（序列到序列）**：原始 Transformer, T5, BART。机器翻译、摘要、code
review 等任务上仍有优势。

### Code 实现参考

论文官方代码（Tensor2Tensor）：
`https://github.com/tensorflow/tensor2tensor/blob/c8a8f01a55de13c8a02baba2f1e74f02f50d2eee/tensor2tensor/models/transformer.py`
（链接示意，40-char hex SHA）

HuggingFace BERT 实现（最广泛使用的 encoder-only 参考）：
`https://github.com/huggingface/transformers/blob/4c8e4a62b5e2c89c7d3a2e0d65d8e8a0e2d9b2c3/src/transformers/models/bert/modeling_bert.py`
（链接示意，40-char hex SHA）

karpathy 的极简实现 nanoGPT（200 行实现一个 GPT）：
`https://github.com/karpathy/nanoGPT/blob/9755682b981a45507f6eb9b11eadef8cb83cebd5/model.py`
（链接示意，40-char hex SHA）

nanoGPT 是学习 transformer 实现的最佳起点：单文件、200 行、跑通完整 GPT-2 训练。

---

## 限制（≥ 5 条）

### 1. O(n²) 复杂度限制长序列

序列长度从 512 → 4K → 32K → 100K → 1M context length 的过程里，O(n²) 一直是核心瓶颈。
中间出现的解决方案：sparse attention（Longformer 2020）、linear attention（Performer
2020）、Flash Attention（2022 IO-aware 优化常数）、Ring Attention（2023 多机切分）、
Mamba（2023 改用 O(n) 状态空间）。但 vanilla transformer 的二次复杂度始终在那里。

### 2. softmax attention 的数值精度

`Q K^T / √d_k` 这个量在 d_k 大时容易爆炸或消失。论文加了 √d_k 但仍然依赖 fp16 → fp32 的
混合精度。Flash Attention 在前向算 softmax 时要做 online softmax 分块，本质就是因为
softmax 数值稳定性不好处理。

### 3. 没有内置归纳偏置

CNN 有 locality bias（邻居相关）、RNN 有 sequential bias（顺序）。Transformer 啥都没
有，需要数据补。这就是为什么早期 ViT 在小数据集（ImageNet 1K）打不过 ResNet，要等
JFT-300M 这种大数据集才超越。归纳偏置弱 = 数据需求大。

### 4. LayerNorm 位置选择

post-norm（论文）vs pre-norm（GPT-2 之后）的争议持续了 2-3 年。post-norm 在浅层稳，深层
不稳；pre-norm 反过来。这个细节直到 2020 年才被仔细研究（Xiong et al. "On Layer
Normalization in the Transformer Architecture"）。

### 5. positional encoding 长序列外推弱

sinusoidal PE 在训练长度内 OK，但训练时见过最长 512、推理时给 4K，效果会崩。学习的
position embedding 完全无法外推。后来 RoPE（2021）用旋转位置编码、ALiBi（2021）用线性偏
置才部分解决长度外推问题。论文当时的 PE 设计在长 context 时代不够用。

### 6. 计算密集，移动端部署困难

base 65M 参数，big 213M，对移动端是天文数字。后来才有 DistilBERT、TinyBERT、MobileBERT
等小型化工作。原始 Transformer 是「服务器端模型」。

### 7. 训练数据需求大

Transformer 没有归纳偏置，需要海量数据才能学到合理的归纳。WMT En-Fr 36M 句对在 2017 是
顶级规模。如果数据量小，CNN/RNN 反而可能更好。

---

## 怀疑（汇总，方便回看）

> 怀疑 1：论文真正贡献是「敢去掉 RNN」的工程胆量，不是数学。Bahdanau 2015 已经有
> softmax(QK/√d)V 的雏形，但没人想到全部用 attention 替代 RNN。这种「敢」的部分往往在
> 论文里看不到，要看作者背景（Google Brain 内部之前已经在玩 attention-only seq2seq 多
> 年）。

> 怀疑 2：multi-head 数量 h=8 是经验值。head 数量与 d_model 的比例没有理论。后来 GQA /
> MQA 减少 K/V head 是为了 KV cache 节省内存——这条 trade-off 是 2017 时没考虑的。

> 怀疑 3：positional encoding 用 sinusoidal 是论文设计选择，但 BERT/GPT 用 learned PE
> 也 work。说明 sinusoidal 不是「必要」。RoPE（2021）才是真正的进步。

> 怀疑 4：√d_k scaling 是经验值。「方差 = 1 最优」这个假设没证。整个领域 7 年没人改这
> 个，到底是「真的最优」还是「没人系统性验证过」？

> 怀疑 5：post-norm vs pre-norm 论文选了 post-norm，深层不稳。GPT-2 之后业界改 pre-
> norm。这个细节论文当时似乎没意识到，6 层不够深所以问题没暴露。

> 怀疑 6：6 层 encoder + 6 层 decoder 在 2017 是合理，但 GPT-3 175B 用 96 层。深度 vs
> 宽度的 trade-off 在 transformer 里有没有理论？scaling laws（Kaplan 2020 / Chinchilla
> 2022）研究了参数总量 vs 数据量，但没系统性研究深度/宽度比例。

> 怀疑 7：BLEU 28.4 在 2017 看是渐进改进。如果当时只看翻译指标，谁也预测不到它会改写
> 整个 AI。**架构论文的影响力要在 scale up 之后才能看清**——这是个朴素但深刻的教训。

---

## Section 7: 一个小型实现演练

为了真正理解 Transformer，最好的方式是看 nanoGPT 这种 200 行实现。这里把核心 forward
pass 用伪代码写一遍：

```python
# 一个 Transformer block 的 forward（pre-norm 风格，现代主流）
def transformer_block(x, mask=None):
    # x: [batch, seq_len, d_model]
    # 1. multi-head self-attention 子层
    h = layer_norm(x)
    q = h @ W_Q  # [batch, seq, d_model]
    k = h @ W_K
    v = h @ W_V
    # reshape 成多头：[batch, h, seq, d_k]
    q = q.reshape(batch, seq, n_heads, d_k).transpose(1, 2)
    k = k.reshape(batch, seq, n_heads, d_k).transpose(1, 2)
    v = v.reshape(batch, seq, n_heads, d_v).transpose(1, 2)
    # scaled dot-product
    scores = q @ k.transpose(-1, -2) / sqrt(d_k)  # [batch, h, seq, seq]
    if mask is not None:
        scores = scores.masked_fill(mask, -inf)
    attn = softmax(scores, dim=-1)
    out = attn @ v  # [batch, h, seq, d_v]
    # concat 多头
    out = out.transpose(1, 2).reshape(batch, seq, d_model)
    out = out @ W_O
    x = x + dropout(out)  # 残差

    # 2. FFN 子层
    h = layer_norm(x)
    h = relu(h @ W_1 + b_1)  # [batch, seq, d_ff]
    h = h @ W_2 + b_2          # [batch, seq, d_model]
    x = x + dropout(h)
    return x
```

读这段代码的几个关键点：

1. `q @ k.transpose(-1, -2)` 是矩阵批量乘法，把每个 batch、每个 head 都算一遍
2. `mask` 在 decoder 里是上三角 -∞，让 softmax 出来的右上三角变成 0
3. 残差 `x = x + dropout(out)` 是稳定深层训练的关键
4. pre-norm（先 LN 再进 sub-layer）是现代主流，论文原版是 post-norm

跑通这段 forward 之后，反向传播由 PyTorch autograd 自动算，不用手写。整个 Transformer
就是 N 次堆叠这个 block，加上 input embedding、positional encoding、output projection。

## 学到什么

1. **Attention is all you need 不是 hyperbole**：去掉 RNN 后，能从 RNN 借的归纳偏置全没
   了，但 Transformer 反而靠数据 + scale 干赢了。这是「bitter lesson」（Sutton 2019）的
   早期实证。
2. **架构选择的影响周期是 5-10 年**：Transformer 2017 → 2020 GPT-3 涌现 → 2023 ChatGPT
   爆炸。架构论文的真正影响力不在发表当年，而是后续生态。
3. **数学上简单的设计往往胜出**：scaled dot-product attention 比 additive attention 简
   单，但 GPU 友好。简单 + 可并行 > 复杂 + 表达力强。这条在硬件层面的胜出，是 RNN/LSTM
   被淘汰的根本原因。
4. **设计选择的可疑细节要敢质疑**：√d_k 的 √、PE 的 sinusoidal、h=8 的 8、N=6 的 6——这
   些都是经验值。后来的 RoPE / GQA / Flash Attention / Mamba 都是在重新审视这些细节。

## 关联阅读

- [[resnet]] — 残差连接是 Transformer 的关键复用，没有 residual 就训不动深层
- [[vit]] — Transformer 在视觉的第一次成功移植
- [[clip]] — 双 transformer encoder 做对比学习
- [[mae]] — encoder-only transformer 的 self-supervised 预训练
- [[sam]] — Vision Transformer 在分割任务的应用
- [[dino]] — self-supervised vision transformer
- [[mamba]] — 挑战 transformer O(n²) 的状态空间模型
- [[flash-attention]] — IO-aware attention，工业标配
- [[chinchilla]] — Transformer 训练的 compute-optimal scaling law
- [[scaling-laws]] — 模型大小 vs 数据量 vs FLOPs 的指数关系
- [[gpt]] / [[bert]] — Transformer 的两个主要分支
