---
title: Word2Vec — 词向量奠基
来源: 'Mikolov et al., "Efficient Estimation of Word Representations in Vector Space", 2013'
日期: 2026-05-29
子分类: NLP
分类: NLP
难度: 中级
provenance: pipeline-v3
---

## 是什么

Word2Vec 是 2013 年 Google 的 Mikolov 团队发明的**用神经网络学每个词的向量表达**的方法。日常类比：以前每个词在计算机里就是一个独立 ID（"king" 是 5、"queen" 是 12，互不相关）；Word2Vec 让每个词在 300 维空间里有一个坐标，**意义近的词坐标也近**。

最有名的例子：

```
vec("king") - vec("man") + vec("woman") ≈ vec("queen")
```

词义自动变成了**几何运算**——这在 2013 年之前没人见过。

这套"用稠密向量表示离散符号"的思路，成了之后所有 [[bert]] / [[gpt-3]] / [[clip]] 等 embedding 类模型的源头。

## 为什么重要

不理解 Word2Vec，下面这些事都没法解释：

- 为什么现代 LLM 最底层都是一个 "token embedding 表"——它就是 Word2Vec 的 W_in 矩阵被嵌进了大模型
- 为什么推荐系统、广告系统、知识图谱都在算 embedding——"分布式表示" 思想从词扩展到了任何离散对象
- 为什么 NLP 在 2013 年突然换了赛道——从 "词袋 + TF-IDF" 离散符号时代切到 "稠密向量空间"
- 为什么 "AI 能理解语义" 开始有了数学化定义——语义 ≈ 向量距离

工业界第一次出现 ad / 推荐 / NLP 都能共享同一套数学的可能性，就是从 Word2Vec 开始。

## 核心要点

Word2Vec 学词向量的核心可以拆成 **三件事**：

1. **CBOW**（用上下文猜中心词）：看到 `The ___ sat on the mat`，从邻居词反推中间是什么。类比：完形填空。

2. **Skip-gram**（用中心词猜上下文）：看到 `cat`，反推它的常见邻居是 `the / sat / on / mat`。类比：你给我一个词，我来猜你下一句会说什么。

3. **Negative sampling**（不用 softmax，只采几个负例）：朴素做法是对整个词表算 softmax（300 万维），慢得像狗。改成 "区分正确词 vs 5-20 个随机采的负样本"，训练快 100 倍。

CBOW 和 Skip-gram 是镜像关系——一个用周围猜中心，一个用中心猜周围。两种都能跑出好向量，但 Skip-gram 在罕见词上效果更好（每个上下文位置都是一次独立训练样本）。

## 实践案例

### 案例 1：toy 例子——一句话训出 embedding

训练语料：`the cat sits on the mat`，窗口大小 2。

当中心词 = `cat` 时，上下文 = `[the, sits, on, the]`。

Skip-gram 的训练目标：让 `vec(cat)` 与 `vec(sits)` / `vec(on)` / `vec(the)` 的点积变大，与随机负样本（比如 `vec(banana)`、`vec(rocket)`）的点积变小。

迭代几万轮后，"cat" 在向量空间里就和 "sits" / "on" 近，和 "banana" 远。这就是 "用邻居定义自己" 的几何化版本。

### 案例 2：经典类比题

Mikolov 在论文里展示了一组震撼的等式：

```
king - man + woman ≈ queen          (性别)
Paris - France + Italy ≈ Rome        (首都)
walking - walked + swam ≈ swimming   (动词时态)
big - bigger + small ≈ smaller       (形容词比较)
```

训练目标只是 "预测上下文"，但训练完之后向量空间里**几何方向**自动编码了高层语义关系（性别、首都、时态、复数）——**没人显式监督，它们自己浮现**。这是论文最让人惊讶的地方。

### 案例 3：Python 三行跑起来

```python
from gensim.models import Word2Vec

sentences = [["the", "cat", "sits", "on", "the", "mat"], ...]
model = Word2Vec(sentences, vector_size=100, window=5, min_count=1)
model.wv.most_similar('cat')
# 输出: [('dog', 0.87), ('kitten', 0.82), ('pet', 0.79), ...]
```

`gensim` 是 Word2Vec 在 Python 生态里最流行的实现，所有训练 trick（hierarchical softmax / negative sampling / subsampling）都封装好了。

## 踩过的坑

1. **每个词其实有两套向量**——`W_in`（输入侧）和 `W_out`（输出侧）。论文官方 release 的 `vectors.bin` 用的是 `W_in`，但 `(W_in + W_out) / 2` 有时效果更好。新手以为只有一个向量。

2. **多义词只有一个向量**——`bank` 在 "河岸" 和 "银行" 两个语义里只有一个 embedding，被两种意思平均掉了。这是 static embedding 的根本短板，后续 ELMo / [[bert]] 用 contextual embedding 才解决。

3. **OOV 词只能映射到 `<UNK>`**——训练时没见过的词在模型眼里全长一样。fastText 后续用 char n-gram 切词解决。

4. **训练数据 bias 被几何化放大**——`doctor - he + she` 在 Google News 训出的模型里倾向 `nurse`，反映新闻语料里 doctor 和男性代词共现多。embedding 把这种 bias 显式化、可量化，反而比词袋时代更暴露问题。

5. **超参数全是炼丹值**——embedding 维度 100-300、窗口 5-10、负样本 K=5-20、subsampling 阈值 t=10⁻⁵、负采样分布 unigram^0.75，全是经验值，没理论指导。换语料就要重调。

## 适用 vs 不适用场景

**适用**：

- 中等规模语料（几百万到几十亿词）的词向量学习
- 推荐系统的物品 embedding（Item2Vec）、图节点 embedding（DeepWalk / Node2Vec）
- 任何 "用上下文定义对象" 的场景——把序列当成 "句子"，把对象当成 "词"
- 算力有限、需要快速训出可用 embedding 的项目

**不适用**：

- 多义词消歧——需要 contextual embedding（[[bert]] / ELMo）
- 长距离依赖——5-10 词窗口看不到 "The cat that the dog chased ran" 里 cat 和 ran 的关系
- 形态丰富的语言（土耳其语、芬兰语）——词形变化太多，OOV 严重，要 fastText
- 需要细粒度语义（QA、推理）——必须用大模型 contextual representation

## 历史小故事（可跳过）

- **2003 年**：Bengio 第一次用神经网络学词向量（NNLM），思路对，但训练慢、规模小（千万词级跑不动）。
- **2010 年**：Mikolov 在博士论文里用 RNN 做语言模型，为后续打地基。
- **2013-01 月**：Mikolov 跳到 Google Brain，发表 Word2Vec 第一篇论文（CBOW + Skip-gram + hierarchical softmax），16 亿词 1 天训完。
- **2013-09 月**：第二篇论文加 negative sampling + phrase embedding，工业可用。
- **2014 年**：Stanford 的 Pennington 提出 GloVe，把 count-based 共现矩阵 + Word2Vec 思想融合。
- **2015 年**：Mikolov 跳到 Facebook，发布 fastText（加 sub-word 处理 OOV）。
- **2018 年**：[[bert]] / ELMo 把静态 embedding 升级成 contextual embedding。

之后 10 年，所有大模型最底层都还是 "一张 token embedding 表"——Word2Vec 的精神没变，只是被嵌进了更大的模型里。

## 学到什么

1. **embedding 是一种思想，不是一个具体架构**——CBOW / Skip-gram 早被淘汰，但 "把离散对象映射到稠密向量空间" 这件事变成了所有 ML 子领域的标配。

2. **simple model + huge data 是早期范式**——浅层网络 + 1.6B 数据 + 工程优化（hierarchical softmax / negative sampling）就能干翻所有 count-based 方法。[[bert]] / [[gpt-3]] 沿用同思路，只是把 "简单模型" 换成了 transformer。

3. **vector arithmetic 是浮现行为**——训练目标只是预测上下文，但类比能力自然浮现。这是 "分布式假设 → 几何关系" 第一次在大规模语料上被实证，也是后来 LLM in-context learning 这类浮现行为的思想前身。

4. **训练数据 bias 会被几何化**——embedding 把 `doctor + he` 偏见精确编码进向量空间。做 ML 公平性研究的人都该读 Bolukbasi 2016（debias 方法）和 Caliskan 2017（embedding 反映社会偏见）。

## 延伸阅读

- 视频教程：[Christopher Olah — Visualizing Word Embeddings](https://colah.github.io/posts/2014-07-NLP-RNNs-Representations/)（动画展示词向量空间）
- 自己写实现：[Chris McCormick — Word2Vec Tutorial](http://mccormickml.com/2016/04/19/word2vec-tutorial-the-skip-gram-model/)（手写 Skip-gram，逐行解释）
- 原始 C 代码：[Mikolov 本人开源仓库](https://github.com/tmikolov/word2vec)（论文暗知识都在这里——动态窗口、unigram^0.75、t=10⁻⁵ 这些细节论文不写代码里写死）
- gensim 文档：[gensim.models.Word2Vec](https://radimrehurek.com/gensim/models/word2vec.html)（Python 生态最常用实现）

## 关联

- [[bert]] —— contextual embedding 取代 static embedding；transformer + MLM
- [[gpt-3]] —— 大模型最底层的 `wte` 矩阵仍是 Word2Vec 思想的直系延续
- [[clip]] —— 图文共同 embedding 空间；vector arithmetic 跨模态
- [[attention]] —— attention 取代固定 context window，解决长距离依赖

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[dssm-2013]] —— DSSM — 把 query 和文档各编码成 128 维向量再算余弦
- [[elmo-2018]] —— ELMo — 让词向量随上下文变化
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[koren-mf-2009]] —— Koren-Bell-Volinsky 2009 — 把推荐系统的 MF 写成 8 页教科书
- [[lstm-1997]] —— LSTM — 用门控让神经网络记得住上一段话
- [[ranknet-2005]] —— RankNet — 让搜索引擎学会比较两个结果谁更好
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[youtube-two-tower-2019]] —— YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键

