---
title: Word2Vec 词向量分布式表示
来源: Mikolov et al., "Efficient Estimation of Word Representations in Vector Space" (2013-01) + "Distributed Representations of Words and Phrases" (NeurIPS 2013)
---

## 一句话总结

Word2Vec 是 2013 年 Google 的 Mikolov 等人提出的一个**用浅层神经网络学习词向量**
的方法，把每个单词映射成一个 100-300 维的稠密向量，使得「语义相近的词」在这个
向量空间里「几何上也接近」。它有两种训练形式 —— **CBOW**（用上下文预测中心词）
和 **Skip-gram**（用中心词预测上下文）—— 配上 **negative sampling** 加速，可以
在 1 天内用普通 CPU 集群训练 16 亿词的 Google News 语料。它的核心遗产不在于这
两个具体架构（GloVe / BERT 之后基本都不再用），而在于「**embedding 这种思想**」
本身：词、图像、用户、商品、知识图谱节点都可以用一个稠密向量表示，相似性等于几
何距离。整个 NLP 在 2013 年之后从「count-based 离散符号」时代一脚跨进了
「dense embedding」时代，Word2Vec 是那道门。

## 历史定位

把这条线放在一起看：

- 1950s: 词袋模型（bag-of-words）+ TF-IDF —— 词是离散符号，互不相关
- 1988: Latent Semantic Analysis (Deerwester) —— 用 SVD 降维 term-document 矩阵
- 2003: Bengio "A Neural Probabilistic Language Model" —— 第一次用神经网络学
  词向量，但训练慢、规模小（千万词级）
- 2008: Collobert & Weston "A unified architecture for NLP" —— 用神经网络学多任务表示
- 2010: Mikolov RNN 语言模型博士论文 —— 为 Word2Vec 打地基
- **2013-01: Word2Vec / CBOW + Skip-gram (Mikolov et al.) ← 本文 part 1**
- **2013-10: Distributed Representations / negative sampling + phrase ← 本文 part 2**
- 2014-08: GloVe (Pennington et al.) —— count-based + Word2Vec 思想的融合
- 2016-07: FastText (Bojanowski et al.) —— 加 sub-word ngram，处理 OOV
- 2018-02: ELMo (Peters et al.) —— 双向 LSTM，contextual embedding
- 2018-06: GPT-1 (Radford et al.) —— transformer-based contextual embedding
- 2018-10: BERT (Devlin et al.) —— transformer + MLM，contextual embedding 主流化
- 2020+: GPT-3 / T5 时代，token embedding 只是大模型最底层的查表操作

Word2Vec 处在「神经网络词向量」这条线的爆发点。它之前神经网络词向量是论文里的
小技术，它之后整个 NLP 都在做 embedding。

> 怀疑：把 Word2Vec 当作「embedding 时代的开山祖师」是常见叙事，但 Bengio 2003
> 已经做了几乎一样的事，只是慢得多 —— 千万词训不动，更别说 16 亿。所以 Word2Vec
> 真正的创新到底是「概念」（dense vector 表示词）还是「工程」（让它能在亿级语料
> 上训得动）？我倾向后者：CBOW + Skip-gram + negative sampling + Huffman softmax
> 这一整套加速技巧，比那两个浅层架构本身重要得多。

## Section 1: 动机 —— one-hot 编码为什么不够

在 Word2Vec 之前，词在 NLP 系统里的标准表示是 **one-hot 向量**：

- 词表大小 V（比如 100 万）
- 每个词是一个 V 维向量，只有自己那一位是 1，其他是 0

这种表示有三个根本问题。

### 1.1 维度爆炸

V = 100 万意味着每个词是 100 万维向量。一个句子（10 个词）就是 10 万 × 100 万的
稀疏矩阵。下游模型（SVM / 逻辑回归 / 浅层神经网络）一接这种输入就退化成「词袋」，
所有词序、共现信息全丢掉。

### 1.2 词与词之间正交，没有相似性

one-hot 的「king」和「queen」点积是 0，「king」和「banana」点积也是 0。
模型从输入向量本身**完全看不出 king 和 queen 比 king 和 banana 更接近**。
要让模型知道相似性，必须从训练数据里反复学，没法迁移、没法泛化到没见过的词。

### 1.3 OOV（out-of-vocabulary）

词表是封闭的。训练时没见过的词只能映射到 `<UNK>`，所有 OOV 词在模型眼里都长得
一样。一旦语料里有大量长尾词（人名、地名、专业术语），系统就废一半。

### 1.4 LSA / LDA 这条 count-based 线为什么不够好

针对这些问题，2010 之前有一条主流路线 —— **count-based 方法**：

- LSA：构造 term-document 矩阵 → SVD 降维 → 每个词得到一个 100-300 维向量
- LDA：把文档建模成主题分布，词建模成主题里的概率分布

count-based 方法能给出稠密向量，但有两个硬伤：

1. **不考虑词序** —— "dog bites man" 和 "man bites dog" 在它们眼里完全一样
2. **不考虑局部上下文** —— 全局共现统计淹没了「这个词在 5 词窗口内的邻居」这种信号

> 怀疑：count-based 方法淘汰这件事被神经网络派写得很彻底，但 GloVe (Pennington
> 2014) 后来证明 **count-based + Word2Vec 思想** 一样能拿到 SOTA。所以 Word2Vec
> 之于 LSA，到底是「思想代差」还是「实现优势」？我猜更接近后者：神经网络能用 SGD
> 在线训练 16 亿词，SVD 在 16 亿词上压根跑不动。

### 1.5 Mikolov 的核心假设

> **「分布式假设」（Distributional Hypothesis, Harris 1954）：相似的词出现在
> 相似的上下文中。**

这是 Word2Vec 一切的起点。如果两个词的「邻居词分布」很像，它们的语义就接近。
那么用「上下文邻居」来定义一个词的向量，应该能捕捉语义。

## Definition 1: distributed representation（分布式表示）

```
distributed representation 的定义：
  把一个离散对象（词 / 用户 / 物品）映射到一个低维稠密向量 v ∈ R^d，
  其中 d 通常是 50 - 300，每一维不对应明确的人类语义概念，
  但整个向量整体上编码该对象的属性。

对比：
  - 局部（local）表示 = one-hot：每一位有明确含义，但维度 = V
  - 分布式（distributed）表示：每一位无明确含义，但维度 << V
    且向量空间里距离 = 语义相似度
```

「distributed」这个词来自 Hinton 80 年代的论文（"distributed representations"），
强调「概念被分布到多个神经元上」。和「一个神经元代表一个概念」（grandmother cell）
对立。在词向量这个语境下，它意味着：

- 「king」这个概念**不是**某一维的值
- 而是 300 维向量整体在向量空间里的位置

## Definition 2: CBOW（Continuous Bag-of-Words）

```
CBOW 训练目标：
  给定上下文 c = {w(t-2), w(t-1), w(t+1), w(t+2)}，
  最大化中心词 w(t) 的对数概率：
      L_CBOW = Σ_t log P(w(t) | context(t))

  其中 P(w | context) = softmax(u_w · h)
       h = average of embedding(c_i) for c_i in context
```

直觉：用「这个词周围 4 个词的平均」作为线索，预测「这个词是什么」。
就像完形填空：「The ___ sat on the mat」，从 the / sat / on / the / mat 推出
__ ≈ cat。

## Definition 3: Skip-gram

```
Skip-gram 训练目标：
  给定中心词 w(t)，最大化每个上下文词的对数概率：
      L_SG = Σ_t Σ_{j != 0} log P(w(t+j) | w(t))

  其中 P(w_o | w_i) = softmax(u_{w_o} · v_{w_i})
```

直觉：拿中心词去**反推**周围 4 个邻居。和 CBOW 方向相反。
就像看到「cat」要预测出「The / sat / on / the / mat」是它常见的邻居。

CBOW 和 Skip-gram 是镜像关系。Mikolov 同时提出两个，论文 II 的实验里发现：

- CBOW 训练快，平滑（多个 context 平均掉噪声）
- Skip-gram 慢，但在 rare word 上更好（每个 context 都是一个独立训练样本）

## Section 3: CBOW 架构详解

```
输入层 ─── Projection 层 ─── 输出层
(4 × V)    (1 × N)           (1 × V)

具体:
  - 输入: 4 个 context 词的 one-hot, 形状 [4, V]
  - 投影: 每个 one-hot × W_in (形状 V×N) = 4 个 N 维向量
          再求平均, 得到 h ∈ R^N
  - 输出: y = h × W_out (形状 N×V) → softmax 得到 V 维概率
  - 损失: cross-entropy(y, w_t 的 one-hot)

参数:
  W_in  ∈ R^{V × N}  ← 输入侧 embedding 矩阵（每行是一个词的输入向量 v_w）
  W_out ∈ R^{N × V}  ← 输出侧 embedding 矩阵（每列是一个词的输出向量 u_w）
  N = 100 - 300（embedding 维度）
  V = ~3M（with phrases 的 vocab）
```

注意：**每个词其实有两个向量**，输入向量 v_w 和输出向量 u_w。论文 release 的
`vectors.bin` 用的是 v_w（输入侧）。这是个常被忽略的工程细节。

## Section 4: Skip-gram 架构详解

```
输入层 ─── Projection 层 ─── 输出层
(1 × V)    (1 × N)           (4 × V)  // 4 个独立 softmax

具体:
  - 输入: 中心词 w_t 的 one-hot
  - 投影: one-hot × W_in = v_{w_t} (N 维)
  - 输出: 对每个 context 位置 j ∈ {-2, -1, +1, +2}:
          y_j = v_{w_t} × W_out → softmax → V 维概率分布
  - 损失: -Σ_{j != 0} log P(w_{t+j} | w_t)
```

Skip-gram 比 CBOW 慢的原因：每个中心词产生 4 个训练样本（4 个 softmax），
而 CBOW 一个中心词只有一个 softmax。但这也是为什么 Skip-gram 在 rare word 上
更好 —— 哪怕一个 rare word 只在语料里出现过几次，它也会被多次当作 context 出现，
每次都给 v_w 提供训练信号。

![CBOW vs Skip-gram 双架构](/papers/word2vec/01-cbow-skipgram.webp)

## Section 5: 加速技巧（论文 II 的核心贡献）

### 5.1 为什么需要加速？

朴素 CBOW / Skip-gram 的瓶颈是**输出层 softmax**：

```
P(w_o | h) = exp(u_{w_o} · h) / Σ_{w'∈V} exp(u_{w'} · h)
```

分母对整个词表 V（~300 万）求和。每个 batch 都要算 V 次点积、V 次 exp。
1.6 亿训练样本 × 300 万 vocab = 4.8 × 10^14 次操作。普通 CPU 跑不动。

Mikolov 的两个加速方案：**hierarchical softmax** 和 **negative sampling**。

### 5.2 Hierarchical Softmax（论文 I 主推）

把 V 个词组织成一棵 **Huffman 树**（按词频建树，常见词更靠近根）。
预测一个词从「直接在 V 维 softmax 上选一个」变成「沿着 Huffman 树从根走到那个
词的叶子节点，每一步是个二分类」。

```
P(w | h) = ∏_{j=1}^{L(w)-1} σ([n(w, j+1) = ch(n(w, j))] · v_{n(w,j)} · h)

其中 L(w) = 词 w 在 Huffman 树上的路径长度
     n(w, j) = 路径上的第 j 个内部节点
     σ = sigmoid
```

复杂度：O(V) → O(log V)。300 万 vocab → ~22 步二分类。常见词路径短，rare word 路径长。

### 5.3 Negative Sampling（论文 II 主推）

直接绕开 softmax 这件事本身。把「预测正确的词」改成「区分正确词 vs k 个随机
负样本」：

```
L_NEG = log σ(u_{w_o} · v_{w_i}) + Σ_{k=1}^{K} E_{w_k ~ P_n} [log σ(-u_{w_k} · v_{w_i})]

含义:
  - 第一项: 对真实的 (中心词 w_i, 上下文 w_o) 输出高分
  - 第二项: 对 K 个随机采样的负样本词 w_k 输出低分
  - K = 5-20（small dataset 大 K, large dataset 小 K）
```

负采样的分布 P_n(w) 也有讲究：论文用 **unigram^(3/4)**：

```
P_n(w) = U(w)^{3/4} / Z
```

为什么是 3/4？经验值，论文说「在所有试过的 power 里效果最好」。
这种「指数 0.75」的常数在后来的推荐系统、对比学习里也反复出现。

> 怀疑：negative sampling 的 K=5-20、unigram^0.75 都是炼丹味很重的经验数。
> 论文 II 没给理论说明为什么是 3/4 而不是 0.5 或 1.0。这种「调出来的常数」
> 在 transformer 时代基本被 scaling law 替代（理论指导参数选择）。Word2Vec 是
> 不是早期 NN 的「alchemy 时代」最后的代表？

### 5.4 Subsampling 高频词

「the / a / of」出现 1 亿次以上，每次训练对 embedding 的贡献其实很小（梯度饱和）。
论文加了一个 **subsampling**：高频词以一定概率被丢弃：

```
P(discard w) = 1 - sqrt(t / f(w))

t = 10^-5（经验阈值）
f(w) = w 在语料里的频率
```

效果：训练快了 ~2x，且 rare word 的 embedding 质量更好（因为被高频词稀释的梯度
变干净了）。

> 怀疑：subsampling 的 t = 10^-5 同样是炼丹常数。它的作用是「让高频词不要太
> 喧宾夺主」，但完全没有理论指导为什么是 10^-5 而不是 10^-4 或 10^-6。如果换
> 一个语料（比如学术论文，词频分布不同），这个常数应该重新调，但论文没给出
> 调参方法论。

## Section 6: Phrase Embedding（论文 II 的另一个贡献）

「New York」是一个语义实体，不是「New」+「York」的组合。
论文 II 用一个简单的 PMI 启发式找出 phrase：

```
score(w_i, w_j) = (count(w_i w_j) - δ) / (count(w_i) × count(w_j))

如果 score 超过阈值，把 "w_i w_j" 当作一个新 token 加入词表
δ = discount 系数（防止 rare bigram 噪声）
```

迭代 2-4 轮，可以把 "United States of America" 这种 4-gram phrase 也找出来。
论文 release 的 `phrase vectors` 词表 ~3M，里面包含很多多词 phrase 的 embedding。

应用：在 vector arithmetic 里，phrase 和单词一样可用：

```
Berlin - Germany + France ≈ Paris      (单词)
Steve_Ballmer - Microsoft + Apple ≈ Steve_Jobs   (phrase)
```

## Section 7: 训练 + 实验

### 7.1 数据集

- **Google News** 语料（论文 I 的实验数据）
- 16 亿 tokens
- 词表 ~3M（with phrases）
- 训练时间：~1 天，100 CPU cores

> 怀疑：1 天 × 100 CPU = 2400 CPU-hour 的训练，在 2013 年是「Google 才有的算力」，
> 现在一台 8×A100 节点 1 小时就能搞定。Word2Vec 的算力门槛在当时是被严重低估
> 的 —— 论文写得像「随便就能复现」，但其实没有大公司基建复现不出来。这种「论文
> 暗藏算力门槛」的现象在 BERT / GPT-3 / T5 时代越来越明显。

### 7.2 评估方式：类比题

Mikolov 自己整理了一个 **8869 道类比题** 测试集，分两类：

- **Semantic**（5 类，~8500 题）
  - capital-common-countries: Athens : Greece :: Baghdad : ?
  - capital-world: Abuja : Nigeria :: Accra : ?
  - currency: Algeria : dinar :: Angola : ?
  - city-in-state: Chicago : Illinois :: Houston : ?
  - family: boy : girl :: brother : ?

- **Syntactic**（9 类，~10500 题）
  - adjective-to-adverb: amazing : amazingly :: apparent : ?
  - opposite: acceptable : unacceptable :: aware : ?
  - comparative: bad : worse :: big : ?
  - superlative: bad : worst :: big : ?
  - present-participle: code : coding :: dance : ?
  - nationality-adjective: Albania : Albanian :: Argentina : ?
  - past-tense: dancing : danced :: decreasing : ?
  - plural: banana : bananas :: bird : ?
  - plural-verbs: decrease : decreases :: describe : ?

评估方法：给一个 (a, b, c) 三元组，找 d 使得 b - a + c ≈ d。
如果 cosine_similarity(b - a + c, d_true) 是所有候选词中最高的，就算对。

论文 I 的结果：

| 模型 | Semantic Acc | Syntactic Acc | 总 Acc |
|------|-------------:|--------------:|-------:|
| LSA-640 | 21.7% | 12.3% | 16.0% |
| RNNLM (Mikolov 2010) | 22.1% | 23.3% | 22.7% |
| **CBOW-300** | **57.3%** | **68.9%** | **63.7%** |
| **Skip-gram-300** | **66.1%** | **65.1%** | **65.6%** |

CBOW 在 syntactic 略好，Skip-gram 在 semantic 略好。两者都把 LSA / RNNLM 远远
甩开。

## Section 8: Vector Arithmetic —— 论文最有冲击力的发现

经典等式：

```
v(king) - v(man) + v(woman) ≈ v(queen)
v(Paris) - v(France) + v(Italy) ≈ v(Rome)
v(Tokyo) - v(Japan) + v(Russia) ≈ v(Moscow)
v(walking) - v(walked) + v(swam) ≈ v(swimming)
v(big) - v(bigger) + v(small) ≈ v(smaller)
```

直觉：训练目标只是「预测上下文词」，但训练完之后向量空间里**几何方向**自动编码了
高层语义关系（性别、首都、动词时态、复数）。这是论文最让人惊讶的发现 —— 没人
显式监督这些关系，它们自己浮现。

![Vector Arithmetic 类比关系](/papers/word2vec/02-vector-arithmetic.webp)

> 怀疑：vector arithmetic "king - man + woman ≈ queen" 是论文 PR 亮点，但
> Bolukbasi 2016 ("Man is to Computer Programmer as Woman is to Homemaker?")
> 后来证明许多类比题失败：doctor - he + she 倾向 "nurse"，反映训练数据 bias。
> 这是 embedding 几何的固有问题还是数据问题？我倾向**数据问题为主**：Google
> News 是 1990s-2010s 的英文新闻，里面 "doctor" 和男性代词共现远多于女性。
> 但**embedding 几何把这种 bias 放大、显式化了**，让问题反而比 bag-of-words
> 时代更明显。

> 怀疑：类比题 60-70% 准确率 = 30-40% 失败率，但论文只展示成功例子（cherry-pick）。
> 实际部署里 30% 失败率非常糟糕（每 3 次类比有 1 次错）。后续 BERT / GPT 通过
> contextual embedding 大幅改善，但 Word2Vec 时代用户「过度相信」类比能力。

## Section 9: 后续 + 衍生

### 9.1 NLP 内部直接继承

- **GloVe** (Pennington et al., 2014, EMNLP)
  - 出发点：Word2Vec 是 implicit matrix factorization，能不能 explicit 做
  - 方法：直接因子化 log(co-occurrence) 矩阵
  - 结果：和 Skip-gram 持平甚至略好，且训练更稳定

- **FastText** (Bojanowski et al., 2017, TACL)
  - 出发点：Word2Vec 不能处理 OOV 和 morphologically rich language
  - 方法：每个词 = 它的 char n-gram embedding 之和
  - 结果：能给「未见过的词」生成 embedding；土耳其语 / 芬兰语等 morphology 复杂
    语言提升明显

- **ELMo** (Peters et al., 2018, NAACL)
  - 出发点：Word2Vec 是 static embedding —— 一个词永远一个向量
  - 方法：双向 LSTM 语言模型，embedding 随上下文变化
  - 结果："bank" 在 "river bank" 和 "bank account" 里向量不同；引入 contextual
    embedding 概念

- **BERT** (Devlin et al., 2018, NAACL)
  - 出发点：ELMo 用 LSTM，能不能换 transformer
  - 方法：transformer + masked language model + 大数据
  - 结果：把 contextual embedding 做到 SOTA，开启 fine-tuning 范式

- **GPT 系列**（Radford et al., 2018-2020）
  - 同时期，decoder-only transformer + next-token prediction
  - 一脉相承的「自监督预训练 + 下游迁移」思想

参考代码（链接示意，commit hash 为 40-char hex 占位）：

- 原始 C 实现（Mikolov 本人）：
  `https://github.com/tmikolov/word2vec/blob/8b3c5e7f2d4a9b1e6c8d0f3a5b7e9c2d4a6f8b0e/word2vec.c`
- gensim Python 实现（最流行）：
  `https://github.com/RaRe-Technologies/gensim/blob/3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f/gensim/models/word2vec.py`
- FastText（后续衍生，Word2Vec + sub-word）：
  `https://github.com/facebookresearch/fastText/blob/4f3c8b2e9a7d6f1c5b8e0a2d4f7c9b3e6a8d0f2c/src/fasttext.cc`

### 9.2 跨领域扩展 —— embedding 思想的迁移

这才是 Word2Vec 真正的历史地位：embedding 这件事**远不止用于词**。

- **DeepWalk** (Perozzi et al., 2014, KDD) —— 把图上的 random walk 当成「句子」，
  Skip-gram 训练节点 embedding
- **Node2Vec** (Grover & Leskovec, 2016, KDD) —— DeepWalk + 偏置 random walk
- **Item2Vec** (Barkan & Koenigstein, 2016) —— 把用户购买序列当「句子」，
  学商品 embedding；推荐系统主流方法
- **TransE** (Bordes et al., 2013, NeurIPS) —— 知识图谱 (h, r, t) 三元组里
  h + r ≈ t；直接借用 vector arithmetic 思想
- **CLIP** (Radford et al., 2021) —— 图文共同 embedding 空间
- **现代推荐系统的 embedding table** —— 用户、商品、广告全是 embedding，
  本质都是「分布式表示」的延续

embedding 已经成为 ML 通用模块。Word2Vec 是这个浪潮的起点。

## 限制（≥ 5 条）

1. **Static embedding**：每个词一个向量，无法处理多义词。"bank"（河岸 / 银行）
   在 Word2Vec 里只有一个向量，被两个语义平均。ELMo / BERT 后续用 contextual
   embedding 解决。

2. **无 sub-word 信息**：OOV 词（人名、专业术语）只能映射到 `<UNK>`。"playing"
   和 "play" 的 embedding 没关系。FastText 后续用 char n-gram 解决。

3. **训练数据 bias 被放大**：Google News 里 "doctor" 和男性代词共现远多于女性，
   embedding 把这种 bias 几何化、显式化。Bolukbasi 2016 给出系统性的 debias
   方法，但根本问题还在数据。

4. **上下文窗口固定（5-10 词）**：无法捕捉长距离依赖。"The cat that the dog
   chased ran" 里 "cat" 和 "ran" 的 syntactic 关系，5 词窗口看不到。
   transformer 的 self-attention 后续解决（任意距离 O(1)）。

5. **vector arithmetic 不全可靠**：论文展示 cherry-pick 例子。8869 题准确率
   60-70%，意味着 30-40% 类比失败。"Einstein - scientist + Picasso ≈ painter"
   成立，但 "Einstein - scientist + Beethoven ≈ ?" 可能给出 musician 之外的
   奇怪结果。

6. **训练目标和下游任务不匹配**：Word2Vec 训练目标是「预测上下文」，但下游任务
   可能是「分类」「QA」「翻译」，这些任务里上下文预测能力不直接转化。BERT 通过
   MLM + 大模型容量缓解，GPT 通过 next-token prediction + 大模型解决。

7. **超参炼丹味重**：embedding 维度 100-300、context window 5-10、negative
   sample K=5-20、subsampling t=10^-5、negative sampling 分布 unigram^0.75 ——
   全是经验值，没有理论指导。换语料就要重调。

## 工程细节：实现 Word2Vec 的几个坑

### 坑 1: 两个 embedding 矩阵 W_in 和 W_out

很多人不知道 Word2Vec 训练完有两套 embedding。论文 release 的 `vectors.bin` 用的
是 W_in（输入侧）。但有些后续研究证明 (W_in + W_out) / 2 效果更好。gensim 默认
也是只用 W_in，但提供 `model.wv` 和 `model.syn1neg` 两个接口。

### 坑 2: 负采样的实现

朴素实现 `numpy.random.choice(V, size=K, p=unigram_freq^0.75)` 慢得像狗。
高效实现是预先构造一个长度 10^8 的 array，按 unigram^0.75 频率填词，然后
`array[random.randint(0, 10^8)]` 采样。这个 trick 在 Mikolov 的 C 代码里写死。

### 坑 3: 上下文窗口的「动态采样」

论文 II 的实现里，每个训练样本的 context window 不是固定 5，而是从 1 到
window_size 之间均匀采样。这相当于给「离中心词远的 context」分配更小的权重 ——
距离 1 的词每次都被采到，距离 5 的词只有 1/5 概率被采到。这个细节在论文文字里
没强调，但代码里写明，对 rare word 性能影响很大。

### 坑 4: phrase 检测的迭代

论文 II 写「迭代 2-4 轮」，但每一轮都改动词表。第一轮 "New York" 变成一个 token，
第二轮 "New_York City" 又变成一个 token。每一轮都要重新统计 unigram 频率、
重新跑 PMI 启发式。工程上实现起来很容易出 bug —— 词表 ID 在轮之间变化，
embedding 矩阵也要重新初始化。

> 怀疑：上面这些坑都是「Word2Vec 论文的暗知识」—— 写在 Mikolov 的 C 代码里，
> 没出现在论文正文。这种「论文是 marketing，代码才是 spec」的现象在深度学习
> 论文里普遍存在。后人复现 Word2Vec 时如果只看论文，结果通常比 release 的
> `vectors.bin` 差 3-5 个百分点。

## CBOW vs Skip-gram 的工程取舍

实际选择两者的经验法则（论文 + 工业经验）：

| 维度 | CBOW | Skip-gram |
|------|------|-----------|
| 训练速度 | 快（context 平均掉） | 慢（4 倍样本） |
| frequent word | 好 | 略好 |
| rare word | 一般 | **明显好** |
| semantic task | 略差 | **略好** |
| syntactic task | **略好** | 略差 |
| 推荐 default | 大语料 + 算力紧 | 小语料 / rare word 多 |

> 怀疑：CBOW vs Skip-gram 选择经验：CBOW 快、Skip-gram 在 rare word 好。但
> Word2Vec 之后 GloVe / BERT 都不再用这两个架构。CBOW/Skip-gram 是工程巧合
> 还是有理论必然？我倾向工程巧合：两者都是「浅层网络 + softmax」时代的特定
> 解，等到 transformer 出现，attention 一次性解决了「上下文聚合」「rare word」
> 「长距离依赖」三个问题，CBOW/Skip-gram 这种二选一就过时了。

## 算力对比：Word2Vec → BERT → GPT-3

```
模型           参数量     训练数据      训练算力             年份
Word2Vec       300d×3M    1.6B token   100 CPU × 1 day      2013
                          ~1.8 GB      = 2400 CPU-hour
                                       ≈ 10^15 FLOPs

BERT-large     340M       3.3B token   16 TPU × 4 day       2018
                          ~16 GB       = 1500 TPU-day
                                       ≈ 10^20 FLOPs

GPT-3          175B       300B token   ~3640 PFlop-day      2020
                          ~570 GB      ≈ 3.14 × 10^23 FLOPs

差距:
  Word2Vec → GPT-3 = 10^8 倍 FLOPs
  Word2Vec → GPT-3 = 5 × 10^5 倍 参数量
  Word2Vec → GPT-3 = 200 倍 数据量
```

> 怀疑：Word2Vec 训练 1 day 100 CPU = 总计 ~2400 CPU-hour。现代 LLM (GPT-3)
> 训练 ~3.14e23 FLOPs，差 10 万倍以上。从 Word2Vec 到 GPT-3 是不是只是 compute
> scaling？还是有质变？我的回答是：**两者都有**。compute scaling 让模型能学到
> 更复杂的映射；但 transformer + autoregressive 这个**架构选择**也是质变 ——
> 没有 transformer，单纯把 Skip-gram scaling 到 175B 参数也学不出 in-context
> learning。Word2Vec 是「embedding 思想的胜利」，GPT-3 是「embedding + 架构 +
> compute 的复合胜利」。

## 学到了什么

1. **embedding 是一种思想，不是一个具体架构**。Word2Vec 的 CBOW/Skip-gram 早就
   被淘汰，但「把离散对象映射到稠密向量空间」这件事变成了所有 ML 子领域的标配。

2. **simple model + huge data 的早期范式**。Word2Vec 是浅层网络（实际上等价于
   双层线性 + softmax），但靠 1.6B 数据 + 工程优化（hierarchical softmax /
   negative sampling）干翻了所有 count-based 方法。这套「数据 + 简单模型」
   思路后来被 BERT / GPT 沿用，只是「简单模型」变成了 transformer。

3. **vector arithmetic 是浮现行为**。论文目标只是预测上下文，类比能力没人显式
   监督，但训练完自然出现。这是「分布式假设 → 几何关系」第一次在大规模上被
   实证。后续 BERT / GPT 的 in-context learning 等浮现行为是同一思想的延伸。

4. **训练数据 bias 会被几何化**。Word2Vec 的 "doctor + he" 偏见、Google News
   的政治倾向，都被 embedding 几何空间精确编码。这是 ML 公平性研究的起点之一。
   做 LLM 的人都该读 Bolukbasi 2016 + Caliskan 2017。

5. **论文的暗知识在代码里**。Mikolov 的 C 代码里有动态窗口、unigram^0.75、
   subsampling t=10^-5 这些「论文一笔带过、代码写死」的细节。复现深度学习
   论文不能只读论文，必须读官方代码。

## 关联

- [[attention]] —— attention 取代了固定 context window，解决长距离依赖
- [[bert]] —— contextual embedding 取代 static embedding；transformer + MLM
- [[gpt-3]] —— 把「next-token prediction」推到极限；in-context learning 浮现
- [[t5]] —— text-to-text 框架；encoder-decoder transformer
- [[clip]] —— 图文 embedding 共同空间；vector arithmetic 跨模态
- [[chinchilla]] —— scaling law 取代炼丹常数；Word2Vec 时代的「t=10^-5」「K=5-20」
  在 Chinchilla 时代变成了「20 tokens / parameter」这种有理论支撑的数

## 复盘：Word2Vec 在状元篇序列里的位置

这是 method 分支 A 的 U5 收官。前面四篇：

- U1: attention（架构起点）
- U2: bert（encoder + 双向）
- U3: gpt-3（decoder + scale）
- U4: t5（encoder-decoder + text-to-text）
- **U5: word2vec（embedding 起源）← 当前**

这个顺序刻意把 Word2Vec 放在最后。原因：先看完 transformer 时代的高峰
（BERT / GPT-3 / T5），再回头看 2013 年的 Word2Vec，能更清楚看出**embedding
作为思想是怎么从 Word2Vec 一路保留到 GPT-3 的**：

- Word2Vec 的 W_in 矩阵 = BERT 的 token embedding table = GPT-3 的 wte 矩阵
- Word2Vec 的 negative sampling = 后来对比学习（CLIP / SimCLR）的核心
- Word2Vec 的 vector arithmetic = 后来 LLM 的 in-context analogy 能力

所以 Word2Vec 不是「过时的旧论文」，而是「整条 embedding 思想链的源头」。
读完它再看 BERT / GPT-3 的源代码，会发现「token embedding 这一层」其实就是
Word2Vec 的一个组件被嵌进了大模型。
