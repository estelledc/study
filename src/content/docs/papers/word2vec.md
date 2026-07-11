---
title: Word2Vec — 词向量奠基
来源: 'Mikolov et al., "Efficient Estimation of Word Representations in Vector Space", 2013; 负采样见同组 Distributed Representations of Words and Phrases, 2013'
日期: 2026-05-29
分类: NLP
难度: 中级
---

## 是什么

Word2Vec 是 2013 年 Google 的 Mikolov 团队发明的**用神经网络学每个词的向量表达**的方法。日常类比：以前每个词在计算机里就是一个独立 ID（"king" 是 5、"queen" 是 12，互不相关）；Word2Vec 让每个词在 300 维空间里有一个坐标，**意义近的词坐标也近**。

最有名的例子：

```
vec("king") - vec("man") + vec("woman") ≈ vec("queen")
```

词义变成了**可加减的几何关系**——Word2Vec 首次在十亿级语料上把这类类比任务跑通并流行开来（此前也有稠密词向量，但没有这套可复现的大规模实证）。

这套"用稠密向量表示离散符号"的思路，成了之后所有 [[bert]] / [[gpt-3]] / [[clip]] 等 embedding 类模型的源头。

## 为什么重要

不理解 Word2Vec，下面这些事都没法解释：

- 为什么现代 LLM 最底层都是一个 "token embedding 表"——它就是 Word2Vec 的输入侧矩阵被嵌进了大模型
- 为什么推荐系统、广告系统、知识图谱都在算 embedding——"分布式表示" 思想从词扩展到了任何离散对象
- 为什么 NLP 在 2013 年突然换了赛道——从 "词袋 + TF-IDF" 离散符号时代切到 "稠密向量空间"
- 为什么 "AI 能理解语义" 开始有了数学化定义——语义 ≈ 向量距离

工业界第一次出现 ad / 推荐 / NLP 都能共享同一套数学的可能性，就是从 Word2Vec 开始。

## 核心要点

Word2Vec 学词向量的核心可以拆成 **三件事**：

1. **CBOW**（用上下文猜中心词）：看到 `The ___ sat on the mat`，从邻居词反推中间是什么。类比：完形填空。

2. **Skip-gram**（用中心词猜上下文）：看到 `cat`，反推它的常见邻居是 `the / sits / on`。类比：你给我一个词，我来猜你下一句会说什么。

3. **Negative sampling**（不用全词表 softmax，只采几个负例）：朴素做法是对整个词表算 softmax（可到百万维），极慢。改成 "区分正确词 vs 5-20 个随机负样本"，训练可快约两个数量级（第二篇 2013 论文引入）。

CBOW 和 Skip-gram 是镜像关系。两种都能跑出好向量，但 Skip-gram 在罕见词上通常更好（每个上下文位置都是一次独立训练样本）。

## 实践案例

### 案例 1：toy 例子——一句话训出 embedding

训练语料：`the cat sits on the mat`，窗口大小 2。

当中心词 = `cat`（位置 1）时，距离 ≤2 的上下文 = `[the, sits, on]`（第二个 `the` 距离为 3，不进窗口）。

**逐部分解释**：

1. Skip-gram 目标：让 `vec(cat)` 与上下文词点积变大，与随机负样本（如 `banana`）点积变小
2. 迭代后，"cat" 在空间里靠近 "sits" / "on"，远离无关词
3. 这就是 "用邻居定义自己" 的几何化版本

### 案例 2：经典类比题怎么算

Mikolov 展示的等式：`king - man + woman ≈ queen`（还有首都、时态等）。

**逐部分解释**：

1. 取三个已知向量，做 `v = vec(king) - vec(man) + vec(woman)`
2. 在词表里找与 `v` 余弦相似度最高、且不是这三个词本身的词
3. 理想结果是 `queen`——训练目标只是预测上下文，性别等关系作为几何方向**浮现**，无人显式监督

### 案例 3：gensim 最小可跑示例

```python
from gensim.models import Word2Vec
sentences = [
    ["the", "cat", "sits", "on", "the", "mat"],
    ["the", "dog", "sits", "on", "the", "floor"],
    ["a", "cat", "and", "a", "dog", "play"],
]
model = Word2Vec(sentences, vector_size=50, window=2, min_count=1, epochs=200)
print(model.wv.most_similar("cat", topn=3))
```

**逐部分解释**：`vector_size` 是坐标维数；`window` 是左右看几格；`min_count=1` 表示出现 1 次也保留（玩具语料才这么设）。玩具语料结果不稳定，正式训练要用百万词以上语料。`gensim` 已封装 hierarchical softmax（把词表收成一棵二叉树加速）与 negative sampling。

## 踩过的坑

1. **每个词其实有两套向量**——输入侧 `W_in`（查表用）和输出侧 `W_out`（预测用）。官方 `vectors.bin` 常用 `W_in`，但 `(W_in + W_out) / 2` 有时更好。
2. **多义词只有一个向量**——`bank` 的 "河岸/银行" 被平均掉；后续 ELMo / [[bert]] 才用 contextual embedding 解决。
3. **OOV 词只能映射到 `<UNK>`**——没见过的词全长一样；fastText 用 char n-gram 缓解。
4. **语料 bias 被几何化**——`doctor - he + she` 在 Google News 模型里常偏向 `nurse`。
5. **超参数全是经验值**——维数 100-300、窗口 5-10、负样本 K=5-20、subsampling 阈值 t=10⁻⁵、负采样分布 unigram^0.75（高频词被压一点再抽样），换语料要重调。

## 适用 vs 不适用场景

**适用**：

- 中等规模语料（约 10⁶–10¹⁰ 词）的词向量；词表通常 10⁴–10⁶，`min_count` 常取 5–100 滤噪声
- 推荐 Item2Vec、图节点 DeepWalk / Node2Vec 等 "上下文定义对象" 场景
- 算力有限、需要快速训出可用 embedding 的项目

**不适用**：

- 多义词消歧——需要 contextual embedding（[[bert]] / ELMo）
- 长距离依赖——5-10 词窗口看不到从句两端关系
- 形态丰富语言（土耳其语、芬兰语）——OOV 严重，要 fastText
- 细粒度语义（QA、推理）——必须用大模型 contextual representation

## 历史小故事（可跳过）

- **2003 年**：Bengio 用神经网络学词向量（NNLM），思路对但规模小。
- **2013-01**：Word2Vec 第一篇（CBOW + Skip-gram + hierarchical softmax），约 16 亿词可一天训完。
- **2013-09**：第二篇加 negative sampling + phrase embedding，工业可用。
- **2014 年**：Pennington 提出 GloVe，融合共现矩阵与 Word2Vec 思想。
- **2015–2018**：fastText 处理 OOV；[[bert]] / ELMo 升级为 contextual embedding。

之后大模型最底层仍是 "一张 token embedding 表"——精神没变，只是嵌进了更大模型。

## 学到什么

1. **embedding 是一种思想，不是一个具体架构**——"离散对象 → 稠密向量" 成了 ML 标配；CBOW / Skip-gram 本身早被淘汰。
2. **simple model + huge data**——浅层网络 + 十亿级数据 + 工程优化就能干翻早期 count-based 方法。
3. **vector arithmetic 是浮现行为**——目标只是预测上下文，类比能力自然出现；是后来 LLM 浮现能力的思想前身。
4. **训练数据 bias 会被几何化**——可读 Bolukbasi 2016（debias）与 Caliskan 2017（社会偏见）。

## 延伸阅读

- 图解：[Christopher Olah — Visualizing Representations](https://colah.github.io/posts/2014-07-NLP-RNNs-Representations/)
- 手写教程：[Chris McCormick — Skip-gram Tutorial](http://mccormickml.com/2016/04/19/word2vec-tutorial-the-skip-gram-model/)
- 原始 C 代码：[tmikolov/word2vec](https://github.com/tmikolov/word2vec)（动态窗口、unigram^0.75 等细节在代码里）
- gensim：[gensim.models.Word2Vec](https://radimrehurek.com/gensim/models/word2vec.html)

## 关联

- [[bert]] —— contextual embedding 取代 static embedding
- [[gpt-3]] —— 底层 `wte` 仍是 Word2Vec 思想的直系延续
- [[clip]] —— 图文共同 embedding；跨模态 vector arithmetic
- [[attention]] —— 取代固定 context window，解决长距离依赖
- [[elmo-2018]] —— 让词向量随上下文变化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[dssm-2013]] —— DSSM — 把 query 和文档各编码成 128 维向量再算余弦
- [[elmo-2018]] —— ELMo — 让词向量随上下文变化
- [[koren-mf-2009]] —— Koren-Bell-Volinsky 2009 — 把推荐系统的 MF 写成 8 页教科书
- [[lstm-1997]] —— LSTM — 用门控让神经网络记得住上一段话
- [[ranknet-2005]] —— RankNet — 让搜索引擎学会比较两个结果谁更好
- [[scaling-hnsws-antirez]] —— Scaling HNSWs — antirez 把向量图做成 Redis 数据结构的工程笔记
- [[szegedy-adversarial-2013]] —— Szegedy 对抗样本 — 图片只改一点点，模型却会彻底看错
- [[youtube-two-tower-2019]] —— YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键
