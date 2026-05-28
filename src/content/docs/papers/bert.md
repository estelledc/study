---
title: BERT 双向 Transformer 预训练
来源: Devlin et al., "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", NAACL 2019 / arXiv 1810.04805
---

## 一句话总结

BERT 用 masked language model（MLM）+ next sentence prediction（NSP）两个自监督任务，
让 Transformer encoder 真正学到「双向上下文」表示，开启了 NLP「先大数据预训练、再小数据
finetune」的范式时代。

## 历史定位

把 NLP 表示学习的演化按时间轴排开：

- 2003: 神经语言模型（Bengio et al.），引入 word embedding 概念，但每个词一个固定向量
- 2013: **Word2Vec**（Mikolov），CBOW + skip-gram 让 embedding 大规模可用
- 2014: GloVe，全局共现矩阵 + 矩阵分解视角
- 2015: Bahdanau attention，让 RNN seq2seq 翻译能「看回」encoder
- 2017: **Transformer**（Vaswani），纯 attention 替代 RNN（见 [[attention]]）
- 2018-02: **ELMo**（Peters et al.），双向 LSTM 拼接 → 浅双向 contextualized embedding
- 2018-06: **GPT-1**（Radford et al.），decoder-only Transformer + 单向语言模型预训练
- 2018-10: **BERT**（本文），encoder-only + MLM 真正双向，11 NLP 任务全 SOTA
- 2019-07: **RoBERTa**（Liu et al.），BERT 配方调优（砍 NSP / 更多数据 / 更长训练）
- 2019-09: **DistilBERT**（Sanh et al.），蒸馏到 66M 参数仍保 95% 性能
- 2019-09: **ALBERT**（Lan et al.），跨层参数共享 + factorized embedding
- 2019-10: **T5**（Raffel et al.），把所有任务统一成 text-to-text
- 2020-05: **GPT-3**（Brown et al.），decoder-only 路线 175B 参数 + in-context learning
- 2020-12: **DeBERTa**（He et al.），解耦 content / position attention，刷新 GLUE
- 2022+: ChatGPT / Claude / LLaMA / DeepSeek 时代，decoder-only 大模型成主流，但 BERT
  路线在 embedding / 检索 / 分类场景仍占主流

引用数 100k+（截至 2025），是 NLP 史上 Top 3 引用论文之一。BERT 这个名字在 2018-2020
年几乎等同于「NLP 模型」本身。论文官方代码 google-research/bert 至今仍是教材级实现。

## 类比起手：为什么需要双向上下文

把读句子想象成填空题：

> The animal didn't cross the street because **it** was too tired.

这里 it 指代 animal 还是 street？人类一眼看出是 animal，因为「too tired」更适合活物。
但要做出这个判断，需要同时看到 it 左边的 animal 和右边的 too tired。

- **GPT 模式**（单向）：从左往右一个一个读，读到 it 时只看见 The / animal / didn't /
  cross / the / street / because，看不见后面的 was too tired。要等读完整句才能补判
  断，但此时已经过 it 这个位置了。
- **ELMo 模式**（浅双向）：训两个 RNN，一个从左往右、一个从右往左，最后把 hidden 拼
  在一起。两边的「理解」是各自独立完成的，到最后才浅浅地拼接，不能在中间层做联合推理。
- **BERT 模式**（深双向）：每一层 self-attention 都让 it 同时看到左右两边的所有词，
  从第一层到最后一层一直都是「双向联合」状态。

类比：
- GPT 像是听同传翻译，只能基于已经听到的内容做判断
- ELMo 像是两个翻译员各自从两端往中间翻，最后把笔记拼起来
- BERT 像是给翻译员一份完整稿子，再每段挖空让他填——他可以同时参考前后所有内容

但这里有个看似矛盾的点：如果让模型「看见」整句话，那它要预测哪个词都「直接抄」就行了，
学不到东西。BERT 的 MLM 巧妙之处：**挖空 15% 的词，让模型从剩下 85% 的双向上下文里
预测被挖掉的词**。这样既保留了双向能力，又制造了真正的预测任务。

---

## Section 1: 动机 — 单向 LM 与浅双向的局限

### 痛点 1：标准语言模型必须单向

经典语言模型目标是 P(x_t | x_<t)，即根据前面的词预测下一个词。这个目标天然要求单向：
如果模型能看到 x_t 自己（或之后的词），那预测目标就泄漏了。GPT-1 沿用这条路，所以是
左到右单向 decoder。

但很多 NLP 任务（QA、NER、分类）并不需要生成下一个词，而是需要「理解整句话」。强行把
单向 LM 当编码器用，就丢掉了一半的上下文。

### 痛点 2：ELMo 的浅双向不够深

ELMo（2018-02）尝试解决这个问题：训两个独立的 LSTM 语言模型——

- forward LSTM：P(x_t | x_<t)
- backward LSTM：P(x_t | x_>t)

最后把两个 LSTM 的 hidden state 拼接：h_t = [h_t^fwd; h_t^bwd]

但这只是「浅双向」：两个模型各自都是单向的，只在最后一层 concat。中间层完全独立，
没有跨方向的联合推理。比方说要让 forward 知道「too tired」、又让 backward 知道
「animal」，再综合判断「it 指代谁」——ELMo 在中间层做不到这种联合。

### 痛点 3：finetune 的两条路都不够好

2018 年用预训练模型做下游任务有两条路：

- **feature-based**（ELMo 用法）：把预训练的 embedding 当固定特征，下游另起一个模型
- **finetune-based**（GPT-1 用法）：把整个预训练模型 + 一个小 head 一起在下游 finetune

GPT-1 的 finetune 路线更简洁（不用为每个任务设计架构），但因为它单向，对「理解类」
任务（GLUE 中的 MNLI / RTE）效果一般。

> 怀疑：BERT 论文反复强调「unidirectional 是核心瓶颈」，但同期 GPT-1 也是 unidirectional
> 却在生成任务上更强。所以方向性的好坏其实任务相关——理解类任务双向赢，生成类任务双向
> 反而设计困难。BERT 论文把「双向」当成普适胜利写，可能误导了几年的研究方向：直到 GPT-3
> 用 decoder-only + 海量数据反超，才有人重新评估「双向是不是必须」。

### 假设

把 GPT-1 的 finetune 范式 + ELMo 的双向意图结合：用 Transformer encoder（深、可并行）
+ 一个能利用双向上下文的预训练目标。

关键问题：怎么定义「双向语言模型」目标而不让模型看到自己？

BERT 的回答：**masked language model（MLM）**——随机遮 15% token，让模型只从剩下 85%
预测被遮的位置。遮挡破坏了「看到自己」的捷径，但模型仍可同时使用左右双向上下文。

---

## Section 2: 核心定义

### Definition 1: Masked Language Model（MLM）

输入序列 x = (x_1, ..., x_n)。随机选 15% 的位置组成 mask 集合 M ⊆ {1, ..., n}。

对每个 i ∈ M，按以下规则替换：

- 80% 概率：x_i ← `[MASK]`（特殊 token）
- 10% 概率：x_i ← random_token（词表里随机抽）
- 10% 概率：x_i ← x_i（保持不变）

模型输入是替换后的序列 x'。前向 forward 一遍 Transformer encoder 后，对每个 i ∈ M 的
位置取最后一层 hidden h_i，过一层 linear + softmax，预测 x_i 原始 token 的概率分布。

损失函数：

```
L_MLM = - sum over i in M of log P(x_i | x')
```

只在 mask 位置上算 cross-entropy，未 mask 位置不参与 loss。

为什么是 80/10/10 而不是直接 100% mask？

- 100% [MASK]：finetune 阶段不会有 [MASK] token（finetune 任务输入是真实文本），
  模型在 finetune 时见到 [MASK] 的统计分布与 pretrain 完全一致，但 finetune 数据
  根本没有 [MASK]，会导致 pretrain-finetune mismatch（论文 §3.1）。
- 80% [MASK] + 20% 真 token：让模型 10% 时间「以为这个位置可能是真的」，逼它对所有
  位置都保持注意力，不能只在 [MASK] 上工作。
- 10% random：进一步加噪，鼓励模型不只死记 [MASK] 位置。

### Definition 2: Next Sentence Prediction（NSP）

输入是一对句子 (A, B)，目标判断 B 是否真的紧跟在 A 后面。

训练样本构造：

- 50% 样本：B 是 A 在原文中真正的下一句 → label = `IsNext`
- 50% 样本：B 是从语料里随机抽的另一句 → label = `NotNext`

输入格式：`[CLS] A [SEP] B [SEP]`

`[CLS]` token 经过 BERT 后取最后一层 hidden h_[CLS]，过一层 linear + softmax 做二分类。

损失：L_NSP = - log P(label_true | [CLS] hidden)

总训练损失：L = L_MLM + L_NSP

NSP 设计初衷是让 [CLS] 学到句对级语义，方便下游 QA / 自然语言推理（NLI）任务直接用
[CLS] 做分类。

> 怀疑：NSP 在 BERT 论文里被称为「关键贡献之一」，但 RoBERTa（2019）实验表明砍掉 NSP
> 反而效果更好。这说明 NSP 的好处可能来自「让 [CLS] 学到句对关系」之外的其他副作用，
> 比如让模型见到更多上下文长度变化、或者训练目标多样化。BERT 论文给了一个看似合理的
> 理由（NLI 任务受益），但没有做严格的消融——这是早期深度学习论文的通病：先有结果，
> 再编故事。

### Definition 3: Pretrain + Finetune 范式

完整流程：

```
Stage 1 (pretrain, unsupervised):
    data: BooksCorpus 800M words + English Wikipedia 2.5B words = 3.3B tokens
    objective: L_MLM + L_NSP
    output: pretrained weights theta*
    cost: BERT-base 4 days on 16 TPU; BERT-large 4 days on 64 TPU

Stage 2 (finetune, per-task supervised):
    init: theta = theta*  (load pretrained weights)
    add: small task-specific head (1 linear layer typical)
    train: end-to-end, 2-4 epochs, lr 2e-5 to 5e-5, batch 16-32
    loss: task-specific (CE / span loss / token CE / regression)
    output: theta_task
    cost: minutes to hours on 1 GPU
```

关键设计：所有 BERT 参数在 finetune 阶段都解冻参与梯度，不是 feature-based 那种冻住
backbone 只训 head。这让 BERT 能在小数据集（GLUE 的 RTE 只有 2.5k 样本）上仍然 finetune
出好效果——pretrain 提供了强初始化。

### Definition 4: WordPiece 子词切分

BERT 用 WordPiece tokenizer（与 Google NMT 同款），词表 30k 子词。

切分规则：贪心从左到右匹配最长子词。常用词整词收录，罕见词拆成多个子词，未登录词总
能拆到字符级 fallback。例子：

```
"playing"  -> ["play", "##ing"]
"unbelievable" -> ["un", "##believable"]   (or ["un", "##believ", "##able"])
"BERT" -> ["bert"]   (lowercase in uncased model)
"##" prefix marks "this is a continuation, not a new word"
```

为什么用 WordPiece 而不是字符级或词级：

- 字符级：序列太长，self-attention O(n^2) 吃不消
- 词级：词表必须很大（百万级）；OOV 是大问题
- 子词：词表 30k 适中；常用词整词；罕见词分解；零 OOV

### Definition 5: 输入嵌入

每个输入位置 i 的最终嵌入是三部分之和：

```
E_i = TokenEmb(x_i) + SegmentEmb(seg_i) + PositionEmb(i)
```

- **TokenEmb**：词表嵌入（30522 × 768 for base，30522 × 1024 for large）
- **SegmentEmb**：只有两个值（A=0, B=1），让模型知道每个 token 属于哪一句
- **PositionEmb**：可学习的绝对位置嵌入（不像 Transformer 原版用正弦），最大长度 512

三个向量直接相加（element-wise sum），不是 concat。这是一个重要工程选择：相加保持
维度不变（仍然是 d_model = 768），让后续 Transformer block 输入维度恒定。

---

## Section 3: 输入表示与序列格式

### Section 3.1: 特殊 token

BERT 引入四个特殊 token：

- `[CLS]`：每个序列第一个位置，finetune 分类任务用其 hidden 做分类
- `[SEP]`：分隔符，标记句子边界（句对任务用两个 [SEP]）
- `[MASK]`：MLM 训练时替换被遮位置
- `[PAD]`：批次内补齐到等长

序列格式：

```
single sentence:
    [CLS] tok_1 tok_2 ... tok_n [SEP]
    seg:    A     A     A      A    A

sentence pair:
    [CLS] tok_A1 ... tok_Am [SEP] tok_B1 ... tok_Bn [SEP]
    seg:    A      A     A      A     B      B     B    B
```

### Section 3.2: 序列长度

BERT 默认最大序列长度 512 tokens。这是一个硬限制：

- position embedding 表只有 512 行
- self-attention 是 O(n^2) 复杂度，再长会爆显存

预训练时论文做了一个工程优化：

- 前 90% 步用 max_len=128（90% of all updates）
- 后 10% 步用 max_len=512（学习长序列 position）

理由：position embedding 学习不需要太长序列，但 attention 模式需要见过长序列才稳定。
这个 trick 让总训练成本下降约 4 倍。

### Section 3.3: pre-tokenization + WordPiece

完整流水：

```
raw text "I'm running."
 -> basic tokenizer (lowercase, split on whitespace + punct)
 -> ["i", "'", "m", "running", "."]
 -> WordPiece (greedy longest match in 30k vocab)
 -> ["i", "'", "m", "running", "."]      (all in vocab)
 -> add specials
 -> ["[CLS]", "i", "'", "m", "running", ".", "[SEP]"]
 -> token ids
 -> [101, 1045, 1005, 1049, 2770, 1012, 102]
```

uncased 版本会先 lowercase + 去重音；cased 版本保留大小写。下游任务一般 uncased 效果
好（除了 NER 这种依赖大小写的）。

---

## Section 4: 模型架构与规模

BERT 本质是 Transformer encoder，没有 decoder。架构沿用 [[attention]] 论文的 encoder
block：每个 block = MultiHeadAttention + LayerNorm + FFN + LayerNorm，残差连接。

两个标准规模：

| 模型 | layers L | hidden d_model | heads h | FFN dim | params |
|------|---------|---------------|---------|---------|--------|
| BERT-base | 12 | 768 | 12 | 3072 | 110M |
| BERT-large | 24 | 1024 | 16 | 4096 | 340M |

参数量分解（BERT-base 110M）：

- Token embedding: 30522 × 768 ≈ 23.4M
- Position embedding: 512 × 768 ≈ 0.4M
- Segment embedding: 2 × 768 ≈ 1.5k（可忽略）
- 每层 attention: 4 × 768 × 768 = 2.36M (Q/K/V/O projection)
- 每层 FFN: 768 × 3072 + 3072 × 768 = 4.72M
- 12 层总和: 12 × (2.36M + 4.72M + LN params) ≈ 85M
- 23.4M (emb) + 85M (transformer) + 1.6M (pooler / heads) ≈ 110M

> 怀疑：BERT-base 的 23.4M token embedding 占了 21% 参数。后来 ALBERT（2019）把
> embedding 拆成 V × E + E × H 的低秩分解（比如 30522 × 128 + 128 × 768），把这部分
> 砍到 4M。说明原始 BERT 的 embedding 容量是冗余的。但 BERT 论文没有讨论这个问题——
> 当时大家直觉上认为「embedding 维度 = hidden 维度」是天经地义的，没人去拆。这是工程
> 上的认知盲区被 ALBERT 第一次戳破。

激活函数：用 **GELU**（Gaussian Error Linear Unit）而不是 Transformer 原版的 ReLU：

```
GELU(x) = x * Φ(x)        # Φ 是标准正态 CDF
        ≈ 0.5x * (1 + tanh(sqrt(2/π) * (x + 0.044715 * x^3)))
```

GELU 在 0 附近平滑（不像 ReLU 在 0 处不可导），实测 NLP 任务收敛更稳。GPT-1 也用 GELU。
后来几乎所有大模型（GPT-2/3/4、LLaMA、PaLM）都默认 GELU 或其变体（SwiGLU）。

---

## Section 5: 训练目标的细节实现

### Algorithm 1: MLM mask 位置选择

```
input: token sequence x = [x_1, ..., x_n] (length n, excluding [CLS]/[SEP])
output: input x', label y, mask positions M

1. M = empty
2. for each candidate position i (excluding special tokens):
3.     with probability 0.15:
4.         M.add(i)
5. for each i in M:
6.     r = uniform(0, 1)
7.     if r < 0.8:    x'_i = [MASK]
8.     elif r < 0.9:  x'_i = random token from vocab
9.     else:          x'_i = x_i           # unchanged
10. for each i not in M:
11.     x'_i = x_i
12. y_i = x_i for i in M, else IGNORE_INDEX
13. return x', y, M
```

实现要点：

- 选位置时跳过 `[CLS]` / `[SEP]`（特殊 token 不参与 mask）
- whole-word masking 变体：如果一个词被 WordPiece 拆成多个子词，要么全 mask 要么全不 mask。
  原始 BERT 没这么做，后来发现 whole-word mask 效果略好（被收录进 BERT-WWM）
- mask 静态 vs 动态：原 BERT 在数据预处理阶段就决定哪些位置 mask（静态），同一句话每个
  epoch 看到的 mask 都一样。RoBERTa 改成每次 forward 时重新 mask（动态），效果更好。

### Algorithm 2: NSP 样本构造

```
input: corpus = list of documents, each doc = list of sentences
output: training sample (A, B, label)

1. doc = random_choice(corpus)
2. i = random_index(0, len(doc) - 2)
3. A = doc[i]
4. with probability 0.5:
5.     B = doc[i+1]; label = IsNext
6. else:
7.     other_doc = random_choice(corpus)
8.     B = random_sentence_from(other_doc); label = NotNext
9. truncate (A, B) so total length <= 512
10. return (A, B, label)
```

注意点：「随机抽取」其实是从另一个文档抽，不是同文档另一句。这是为了避免 NotNext 样本
和 IsNext 样本在主题/词汇上太接近——主题相似会让 NSP 退化成话题分类，论文希望它学到
真正的连贯性。

### Algorithm 3: 前向 + loss 计算

```
input: x' (masked input), y (labels), M (mask positions), nsp_label
output: total_loss

1. # Embedding
2. E = TokenEmb(x') + SegmentEmb(seg) + PositionEmb(pos)
3. H_0 = LayerNorm(Dropout(E))
4. # Transformer encoder L layers
5. for l in 1..L:
6.     H_l = TransformerBlock_l(H_{l-1})
7. # MLM head
8. for i in M:
9.     logits_mlm[i] = H_L[i] @ W_mlm + b_mlm        # tied with TokenEmb.T
10.    L_mlm += CE(logits_mlm[i], y[i])
11. # NSP head
12. h_cls = H_L[0]                                    # [CLS] position
13. h_pool = tanh(h_cls @ W_pool + b_pool)
14. logits_nsp = h_pool @ W_nsp + b_nsp
15. L_nsp = CE(logits_nsp, nsp_label)
16. total_loss = L_mlm + L_nsp
17. return total_loss
```

实现细节：

- MLM head 的输出投影矩阵 W_mlm 与 token embedding 矩阵共享权重（tied embedding），
  这是常见的 trick，省 23M 参数 + 加速收敛。
- Pooler（第 13 行的 tanh + linear）只对 [CLS] 用，下游分类任务也复用这个 pooler。
- 学习率 warmup：前 10000 步线性 ramp 到峰值 1e-4，然后线性 decay 到 0。

### Section 5.4: 训练超参数

| 项 | BERT-base | BERT-large |
|----|----------|-----------|
| batch size | 256 | 256 |
| max_len | 128 (90%) → 512 (10%) | 同 |
| optimizer | AdamW | AdamW |
| lr | 1e-4 | 1e-4 |
| warmup steps | 10000 | 10000 |
| weight decay | 0.01 | 0.01 |
| dropout | 0.1 | 0.1 |
| total steps | 1M | 1M |
| total tokens seen | ~3.3B × 40 = 132B | 同 |
| hardware | 16 TPU v3 | 64 TPU v3 |
| time | 4 days | 4 days |

看似 base 和 large 都跑 4 天，是因为 large 参数量翻 3 倍，但用的 TPU 也翻了 4 倍。

---

## Section 6: 嵌入图与训练流水

![Figure 1: BERT pretrain + finetune 范式 — MLM/NSP 双任务预训练，下游加 head finetune](/papers/bert/01-pretrain-finetune.webp)

图 1 把整个 BERT 工作流摊开：

- **左半（Stage 1）**：3.3B token 上联合训 MLM（80/10/10 mask）+ NSP（[CLS] 二分类）。
  产出 pretrained weights，BERT-base 110M / large 340M。
- **右半（Stage 2）**：每个下游任务加一个小 head（多数情况就是一层 linear + softmax），
  整个模型端到端 finetune 2-4 epochs。同一 backbone 适配 11 个 NLP 任务。

这张图传递的核心 message：**预训练阶段昂贵但只做一次；finetune 阶段便宜可重复**。这
也是为什么 2018 之后 NLP 的发展节奏完全变了——研究者不再各自从头训模型，而是基于公开
checkpoint（HuggingFace 模型库由此而生）做下游研究。

---

## Section 7: Finetune 范式：5 类下游任务

BERT 论文展示了 5 种下游任务怎么接 head，这套模板沿用至今：

### 7.1 单句分类（SST-2 情感、CoLA 语法判断）

```
input:  [CLS] sentence [SEP]
output: P(label) = softmax(W * h_[CLS] + b)
loss:   cross-entropy
```

### 7.2 句对分类（MNLI 蕴含、QQP 释义）

```
input:  [CLS] sentence_A [SEP] sentence_B [SEP]
output: P(label) = softmax(W * h_[CLS] + b)
```

### 7.3 抽取式 QA（SQuAD v1.1）

```
input:  [CLS] question [SEP] paragraph [SEP]
output: 对 paragraph 每个 token 算两个 logit
        start_logit_i = w_s · h_i
        end_logit_i   = w_e · h_i
        预测 span = argmax_{i<=j} (start_logit_i + end_logit_j)
loss:   cross-entropy(start_label) + cross-entropy(end_label)
```

### 7.4 token 分类（NER）

```
input:  [CLS] tok_1 tok_2 ... tok_n [SEP]
output: 每个 token i 输出标签 P(tag | h_i) = softmax(W * h_i + b)
loss:   sum over i of cross-entropy
```

注意点：WordPiece 把单词拆成子词后，NER 标签只对每个词的第一个子词预测，其他子词被
忽略（X 标签）。否则 ##ing / ##able 都要预测会无意义。

### 7.5 句对相似度回归（STS-B）

```
input:  [CLS] sentence_A [SEP] sentence_B [SEP]
output: similarity = sigmoid(W * h_[CLS] + b) × 5
loss:   MSE
```

### 7.6 finetune 关键超参

论文推荐区间（其实就是 BERT 时代的「黑魔法」常识）：

- learning rate: {2e-5, 3e-5, 5e-5}
- batch size: {16, 32}
- epochs: {2, 3, 4}
- warmup ratio: 10% of total steps

这个 lr 区间比 pretrain（1e-4）小一个数量级，因为 finetune 不希望毁掉 pretrain 学到的
表示——只做小幅调整。

> 怀疑：finetune learning rate 2-5e-5 是黑话级别的经验值，BERT 论文没有给推导。后来
> Mosbach et al.（2020）发现这个区间在小数据集上不稳定，30% 的 finetune run 会发散。
> RoBERTa 用 1e-5 + bigger batch；ELECTRA 用 5e-5 + small batch；学界至今没收敛到一
> 个普适配方。这说明 BERT finetune 的训练动力学其实没被深刻理解，工程上只是「试出来
> 能 work」。

---

## Section 8: 实验与结果

### 8.1 GLUE benchmark（9 个任务平均分）

| 模型 | GLUE avg |
|------|---------|
| Pre-OpenAI SOTA (2018) | 70.0 |
| ELMo + BiLSTM | 71.0 |
| OpenAI GPT-1 | 75.1 |
| **BERT-base** | **79.6** |
| **BERT-large** | **82.1** |

BERT-large 比之前最好结果绝对提升 7 个点，相对降低错误率 30%+。这种幅度的提升在 NLP
benchmark 历史上极少见。

### 8.2 SQuAD v1.1（抽取式 QA）

| 模型 | F1 |
|------|----|
| Human performance | 91.2 |
| Previous SOTA | 91.7 |
| **BERT-large + ensemble** | **93.2** |

BERT 第一次在 SQuAD 上**超过人类**。

### 8.3 SQuAD v2.0（含无答案样本）

| 模型 | F1 |
|------|----|
| Human performance | 89.5 |
| BERT-base | 76.3 |
| **BERT-large** | **83.1** |

v2.0 比 v1.1 难（要判断是否有答案），BERT 还没超过人类，但也是当时 SOTA。

### 8.4 11 个任务全 SOTA

论文 Table 2 列了 11 个 NLP 任务 BERT 都刷新 SOTA：

GLUE 8 个子任务 + SQuAD v1.1 + SQuAD v2.0 + SWAG（常识推理）。

> 怀疑：「11 任务全 SOTA」当年极其震撼，但这其实有 selection bias——BERT 团队挑了
> 自己擅长的 benchmark。生成类任务（机器翻译、摘要）BERT 论文几乎没碰，那些任务后来
> 一直是 GPT/T5 的地盘。所以 BERT 的「全胜」实际是「理解类任务全胜」。媒体当时把它
> 渲染成「NLP 通用模型」是过度解读。

### 8.5 消融实验（Table 5-6）

论文做了几组重要消融：

| 配置 | GLUE avg |
|------|---------|
| BERT-base | 82.0 |
| - NSP（只有 MLM） | 80.6 |
| - NSP + Left-to-Right LM（GPT 风格） | 76.5 |
| - NSP + LTR + BiLSTM 顶层 | 79.1 |

这组消融的 message：

1. NSP 贡献约 1.4 个点（论文说重要，但 RoBERTa 后来证明可选）
2. 双向（MLM）vs 单向（LTR）差 5.5 个点（这是核心贡献）
3. 加 BiLSTM 顶层缓解了部分单向损失，但仍不如 MLM

模型规模消融：

| L | H | A | params | Dev avg |
|---|---|---|--------|---------|
| 3 | 768 | 12 | 28M | 81.8 |
| 6 | 768 | 12 | 56M | 84.9 |
| 12 | 768 | 12 | 110M | 86.7 |
| 24 | 1024 | 16 | 340M | 87.9 |

更大的模型更好——这是 scaling law（见 [[chinchilla]]）的早期证据，但当时还没有人系统化
这个观察。

---

## Section 9: 代码实现参考

BERT 是少数官方代码 + 多个高质量第三方实现都活跃的论文。学源码推荐顺序：

### 9.1 google-research/bert（官方 TF1，论文同款）

链接示意：

`https://github.com/google-research/bert/blob/eedf5716ce1268e56f0a50264a88cafad334ac61/modeling.py`

读这份代码的看点：

- `BertConfig`：所有超参的集合
- `BertModel.__init__`：建图（embedding → transformer → pooler）
- `attention_layer`：手写 multi-head attention（没用 nn.MultiheadAttention 因为 TF1）
- `transformer_model`：堆叠 L 层 block
- `embedding_postprocessor`：token + segment + position 加和

读 modeling.py 的痛点：TF1 静态图风格，函数式而非 OOP，理解不直观。但这是论文同款，
所有数值结果都从这份代码出来。

### 9.2 huggingface/transformers（PyTorch 生态标杆）

链接示意：

`https://github.com/huggingface/transformers/blob/4c8e4a62b5e2c89c7d3a2e0d65d8e8a0e2d9b2c3/src/transformers/models/bert/modeling_bert.py`

HuggingFace 的 BertModel 是 PyTorch nn.Module 风格，OOP 清晰，与官方 TF 代码语义等价。
推荐读这份学 BERT 工程实现。

模块结构：

```
BertEmbeddings      # token + segment + position + LayerNorm + Dropout
BertSelfAttention   # Q, K, V projection + softmax(QK/sqrt(d)) + V
BertSelfOutput      # output proj + dropout + LayerNorm
BertAttention       # Self + Output 包起来
BertIntermediate    # FFN 第一层 (d -> 4d) + GELU
BertOutput          # FFN 第二层 (4d -> d) + dropout + LayerNorm
BertLayer           # Attention + Intermediate + Output (一层 transformer block)
BertEncoder         # L 层 BertLayer 堆叠
BertPooler          # [CLS] tanh(linear) → 句子表示
BertModel           # Embeddings + Encoder + Pooler
BertForMaskedLM     # BertModel + MLM head
BertForNextSentencePrediction  # BertModel + NSP head
BertForSequenceClassification  # BertModel + 分类 head
BertForQuestionAnswering       # BertModel + span head
BertForTokenClassification     # BertModel + token head
```

这套抽象是 HuggingFace 后来支持 100+ 模型的基石——所有 encoder-only 模型都按这个模板
组织代码。

### 9.3 codertimo/BERT-pytorch（教学级 from-scratch）

链接示意：

`https://github.com/codertimo/BERT-pytorch/blob/d10dc4f9d5a6f2ca74380f62039526eb7277c671/bert_pytorch/model/bert.py`

这是一个早期的纯 PyTorch from-scratch 实现，~2000 行覆盖整个 BERT。优点：代码极简，适
合学习；缺点：精度和性能不及官方（用作教材足够）。

读这份代码的看点：

- `bert_pytorch/model/transformer.py`：手写 transformer block
- `bert_pytorch/model/embedding/`：分别实现 token / position / segment embedding
- `bert_pytorch/dataset/`：MLM mask 数据加载逻辑
- `bert_pytorch/trainer/pretrain.py`：训练循环，看 loss 是怎么组合的

适合读完 HuggingFace 后再看这份「精简版」对照——会发现 HuggingFace 多出的 100 行都
在做什么（边界情况、效率优化、API 设计）。

---

## Section 10: 嵌入图 — 与同代模型的对比

![Figure 2: 双向上下文对比 — GPT 单向 / ELMo 浅双向 / BERT 深双向](/papers/bert/02-bert-vs-gpt.webp)

图 2 把 BERT、GPT-1、ELMo 三种「上下文表示」方式画在一起：

- **GPT（左）**：每个 token 只能看左边，arrow 都是从前向后。预测 token i 时只能用 i-1
  及之前的信息。
- **ELMo（中）**：上半 forward LSTM 从左往右，下半 backward LSTM 从右往左。两条信息流
  独立计算，最后才在输出层 concat。
- **BERT（右）**：self-attention 让每个 [MASK] 位置同时看到左右所有 token，从第一层就
  开始联合推理。

图右下角的 trade-off 说明 BERT 选择 MLM 后失去的能力：**不能直接做 autoregressive 生成
**。GPT 的单向 LM 目标天然支持「给前缀生成下文」，BERT 不能。这也是为什么后来 LLM
时代 decoder-only 路线（GPT-2/3/4、Claude、LLaMA）成了主流——因为大家最后都想要
ChatGPT 式的对话生成。

---

## Section 11: 后续工作 + 衍生模型

BERT 之后两年是 NLP 论文最密集的时期。重要分支：

### 11.1 配方调优分支（同架构 / 改训练）

- **RoBERTa**（Liu et al., 2019-07）：
  - 砍掉 NSP
  - 动态 mask（每 epoch 重新选位置）
  - 更长训练（500k 步 → 500k+ 步，1M+ 步）
  - 更大 batch（256 → 8000）
  - 更多数据（13GB → 160GB）
  - 结果：GLUE 88.5（vs BERT-large 82.1），同架构纯靠调训练
  - **教训**：BERT 论文 underchecked 了训练 budget；同架构空间还很大
- **ALBERT**（Lan et al., 2019-09）：
  - 跨层参数共享（一组参数，L 次复用）
  - factorized embedding（V × H → V × E + E × H，E < H）
  - 把 NSP 换成 SOP（sentence order prediction，更难）
  - 结果：参数量 18M（vs BERT-base 110M）但 GLUE 类似
- **DeBERTa**（He et al., 2020-12）：
  - 解耦 content embedding 和 position embedding 的 attention 计算
  - 引入 enhanced mask decoder
  - 结果：刷新 GLUE，第一个超过人类的模型

### 11.2 蒸馏分支（同精度 / 更小模型）

- **DistilBERT**（Sanh et al., 2019-09）：6 层蒸馏，66M 参数，95% BERT-base 性能
- **TinyBERT**（Jiao et al., 2019-09）：4 层 + 多阶段蒸馏，14M 参数
- **MobileBERT**（Sun et al., 2020）：bottleneck 结构，针对移动端
- **MiniLM**（Wang et al., 2020）：deep self-attention 蒸馏，最佳压缩比之一

这条线对工业部署极重要。BERT-base 在 CPU 上推理慢，蒸馏版让它能进 mobile / edge 场景。

### 11.3 替代预训练任务分支

- **ELECTRA**（Clark et al., 2020-03）：
  - 把 MLM 换成 replaced token detection（小 generator 替换 token，大 discriminator 判断）
  - 训练效率高很多——所有 token 都参与 loss（MLM 只有 15%）
  - 同算力下精度更高
- **XLNet**（Yang et al., 2019-06）：
  - permutation language model：所有可能 token 顺序的 LM 平均
  - 既保留双向、又保留 autoregressive
  - 短期超过 BERT，但训练复杂，不如 RoBERTa 简洁
- **SpanBERT**（Joshi et al., 2019-07）：
  - 改 mask token 为 mask span（连续区间）
  - QA / coref 任务效果更好

### 11.4 多语言 / 跨语言

- **mBERT**（Multilingual BERT）：104 种语言混训，零样本跨语言迁移
- **XLM**（Conneau & Lample, 2019）：translation language modeling
- **XLM-R**（Conneau et al., 2020）：RoBERTa 配方 × 100 语言

### 11.5 与 GPT 路线分化

2020 年 GPT-3 出来后，业界开始重新评估 encoder-only 与 decoder-only：

- encoder-only（BERT 系）：擅长理解任务、embedding、检索、分类
- decoder-only（GPT 系）：擅长生成、对话、in-context learning
- encoder-decoder（T5、BART）：兼顾，但参数量翻倍

到 2026 年的现状：

- LLM 主流是 decoder-only（ChatGPT / Claude / Gemini / LLaMA / DeepSeek 都是）
- 但 BERT 路线在 retrieval / embedding / classification 仍主流（BGE、E5、Sentence-BERT
  都是 BERT 系 backbone）
- 两条线**不是替代关系**，是不同任务的最优工具

> 怀疑：2020-2022 年学界一度出现「BERT 已死」的论调，认为 decoder-only + scale 会吃掉
> 一切。但实际 retrieval / embedding 场景到 2026 仍是 BERT-style 模型主导（BGE、E5、
> ColBERT 等）。这说明「架构选择」和「任务匹配度」是长期问题，scale 不能解决一切。
> BERT 的设计哲学（双向 encoder）不会过时——只是在 generative AI 时代被 GPT 系遮住
> 了光。

---

## Section 12: 与其他论文的关联

- [[attention]]：BERT 的 backbone 就是 Transformer encoder。理解 self-attention /
  multi-head / position encoding 是读 BERT 的前置。BERT 没改架构，只改了训练目标。
- [[resnet]]：BERT 24 层能训得稳，关键是 LayerNorm + 残差连接（resnet 引入的思想）。
  没有残差，深 transformer 训不动。
- [[vit]]：ViT 把 BERT 的 [CLS] + Transformer encoder 思想搬到图像（patch 当 token）。
  ViT 论文反复对照 BERT 设计：是不是要 [CLS]？怎么 mask（后来 MAE 给出答案）？
- [[clip]]：CLIP 的 text encoder 就是 BERT 风格 transformer。但 CLIP 没用 MLM，用对
  比学习——这是预训练任务的另一条路。
- [[mamba]]：Mamba 挑战 Transformer 的 O(n^2) 复杂度，提出 SSM 替代。但目前 Mamba
  在 BERT 类理解任务上还没站稳——双向 SSM 设计不像双向 attention 那么自然。
- [[flash-attention]]：FlashAttention 让 BERT-large 这种 24 层模型在长序列上能跑得动。
  原始 BERT 的 O(n^2) memory 是限制 max_len=512 的根本原因，FlashAttention 后许多
  BERT 衍生（如 ModernBERT 2024）能跑到 8k context。
- [[chinchilla]]：Chinchilla scaling law 回看 BERT 训练，BERT-large 340M 在 132B token
  上训练，大致是 380 token/param 比例——已经接近 Chinchilla 推荐的 20× compute optimal
  但偏 over-trained。这暗示 BERT 训练 budget 其实可以更小或模型可以更大。

---

## 限制（≥ 5 条）

### 1. pretrain-finetune mismatch（最经典批评）

MLM 训练时输入有 [MASK]（80% 时间），但 finetune / inference 时绝不会出现 [MASK]。这
是分布不一致问题。BERT 用 80/10/10 缓解但没消除。XLNet / ELECTRA 等后续工作就是为了
彻底干掉 [MASK]。

### 2. 不能直接做生成

BERT 的双向 self-attention（无 causal mask）让它没法做 autoregressive 生成。生成需要
「给前缀预测下一 token」，但 BERT 训练时双向看了一切，生成时只给前缀会让它在「未来位置」
seeing zeros，分布外。

变通做法（masked generation、Gibbs sampling）效果远不如 GPT 系。这从根本上限制了 BERT
能做的事情：理解可以，生成基本不行。

### 3. context length 硬上限 512

position embedding 表只有 512 行，超过就需要重新预训练或外推（外推效果差）。实际场景
（长文档、长对话）需要 4k / 32k / 100k context，BERT 的 512 是巨大瓶颈。

到 2026 年长上下文 BERT 衍生（ModernBERT 等）通过 RoPE / ALiBi 等位置编码解决，但**原始
BERT** 已经过时。

### 4. attention O(n^2) 复杂度

self-attention 对序列长度 n 是 O(n^2) 内存 + 时间。BERT-large 在 max_len=512 上推理需要
~2GB activation memory（fp32）。长序列推理慢、内存大，移动端部署困难。FlashAttention
后情况改善，但底层复杂度没变。

### 5. 推理慢（与 distillation 之前对比）

BERT-base 110M 参数在 CPU 上每次推理 ~100ms（长度 128），server 端没问题，移动端勉强。
BERT-large 340M 在 GPU 上也有 latency。这让它在「实时检索」「移动 NER」等场景没法直接
用。DistilBERT / MiniLM 解决了这个问题，但纯 BERT 仍不实用。

### 6. NSP 任务设计可疑

如 RoBERTa 所示，NSP 砍掉效果反而好。BERT 论文反复强调 NSP 重要，但实际它可能在「让
模型见到不同文档拼接」之外的设计意图都没实现。这是论文的「编故事」嫌疑。

### 7. 训练数据偏向（English Wikipedia + BookCorpus）

数据是 2018 年的英文公开语料。中文、低资源语言、专业领域（医学、法律、代码）效果差。
后续多语言 BERT / 领域 BERT（BioBERT、CodeBERT）都要从头预训练或继续预训练。

### 8. 小数据 finetune 不稳定

Mosbach et al.（2020）发现 BERT 在小 GLUE 任务（RTE 2.5k 样本、CoLA 8.5k）finetune 时
约 30% run 会发散到 chance level。需要多 seed run + cherry-pick best。这暴露了 finetune
训练动力学没被完全理解。

---

## 学到了什么

1. **预训练 + finetune 范式是 NLP 史上最重要的工程范式之一**。它不是技术发明，是工作流
   组织上的胜利——把昂贵的预训练做一次，下游每个任务复用。这套思路后来扩展到 CV
   （ImageNet 预训练 → 下游）、多模态（CLIP）、agent（基础模型 + tool use）。
2. **[MASK] trick 是「巧思」级设计**。它用极简方式（随机遮 + 预测原词）解决了「双向 LM
   不能看自己」的悖论。这种「不靠数学发明，靠任务设计」的思路在后来很多论文里看到（MAE
   遮图像 patch、SimCLR 对比学习、ELECTRA replaced token detection）。
3. **80/10/10 mask 比例是工程经验，不是数学最优**。RoBERTa 等后续工作证明这个具体比例
   不重要（动态 mask、whole-word mask 都更好）。BERT 论文的「精确数字」其实是消融实验
   挑出来的局部最优，不是普适真理。读论文要分清「设计原则」和「具体超参」。
4. **NSP 的故事告诉我们：消融实验不彻底的论文要警惕**。BERT 论文给 NSP 编了一个合理故
   事（对句对任务有用），但没做严格消融。一年后 RoBERTa 砍掉它效果更好——说明原论文
   的因果归因可能完全错。这种「论文里写的『关键设计』，复现时砍掉发现没用」的事情在
   深度学习里反复出现。
5. **BERT 训练的 hardware 门槛一开始就把学术界排除在外**。BERT-large 64 TPU × 4 天，
   2018 年只有 Google 能跑。后来 RoBERTa 证明小幅调整能大幅提升——但「小幅调整」也
   要 1024 V100 × 1 天的预算。这开启了 NLP 研究的「rich get richer」时代，到 GPT-3
   时代彻底无法被学术界复现。
6. **encoder-only 路线没死，只是换了战场**。2020-2022 年大家以为 BERT 时代结束（GPT-3
   横扫），但 2023-2026 年 retrieval-augmented generation（RAG）需求爆发，BGE / E5
   等 BERT-style embedding 模型反而成为 LLM 应用栈的关键基础设施。这给我们一个启示：
   **架构和任务的匹配度是长期问题，scale 不能解决一切**。
7. **BERT 的命名学**：Bidirectional Encoder Representations from Transformers。每个词
   都精准对应论文核心：Bidirectional（vs GPT 单向）、Encoder（vs decoder）、Representations
   （而非 generation）、from Transformers（不是 RNN）。论文的命名直接说出了与同期工作
   的差异，是一份模板级的学术沟通。

## 关联

- 前置：[[attention]] — BERT 的 backbone 是 Transformer encoder
- 类比：[[resnet]] — 残差连接让深 transformer 可训练，与 BERT 24 层稳定性相关
- 视觉版本：[[vit]] — ViT 把 BERT [CLS] + transformer encoder 搬到图像
- 多模态：[[clip]] — text encoder 是 BERT 风格但用对比学习预训练
- 后续替代：[[mamba]] — SSM 路线尝试替代 Transformer 的 O(n^2)
- 工程优化：[[flash-attention]] — 让 BERT-large 长序列能跑动
- scaling law：[[chinchilla]] — 回看 BERT 训练 budget，BERT-large 偏 over-trained
