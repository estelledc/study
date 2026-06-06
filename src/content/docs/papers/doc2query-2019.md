---
title: doc2query — 让模型替文档预想"会被怎么搜"再写进倒排表
来源: 'Nogueira, Yang, Lin & Cho, "Document Expansion by Query Prediction", arXiv:1904.08375, 2019'
日期: 2026-05-31
子分类: 检索与排序
分类: 信息检索
难度: 入门
provenance: pipeline-v3
---

## 是什么

doc2query 是一个**让神经网络替每篇文档预想"用户可能会用什么话来搜它"，把这些预想的查询直接拼进文档原文、再交给 BM25 建倒排表**的方法。日常类比：图书馆员在每本书的封面背后多贴一张便签，写上"这本书能回答的常见问题"。读者来问，BM25 这位老检索员翻到便签，就能匹配上——哪怕原书里压根没出现读者用的那个词。

工作流就三步：

```text
1. 训练 seq2seq：输入文档 D，输出可能的查询 q
2. 离线生成：对每篇 D 预测 80 条 q，拼到 D 末尾
3. 用 BM25 给"D + 预测查询"建索引，正常检索
```

查询时**不动 BM25**，毫秒级延迟、零 GPU。神经部分全在索引前跑完。

## 为什么重要

不理解 doc2query 的设计，下面这些事都没法解释：

- 为什么 2019 年神经检索都靠 GPU 重排，doc2query 偏要回头改造索引这一步
- 为什么 BM25 + doc2query 的 MRR@10 能从 0.184 跳到 0.277（接近早期 BERT 重排），却还跑在普通 CPU
- 为什么这个想法是把伪相关反馈（[[rm3]]）反着做——RM3 扩查询，doc2query 扩文档
- 为什么后来的 SPLADE、生成式检索都把它当"祖师爷"

## 核心要点

doc2query 的全部贡献可以拆成 **三件事**：

1. **把"词汇错配"挪到离线解决**：BM25 的老毛病是查询和文档用了同义不同字（用户搜"car"，文档写"automobile"）。过去的解法是查询时扩展（RM3 之类），慢且不稳。doc2query 让模型在**建索引前**就把潜在查询塞进文档，错配在离线就被填平。

2. **生成模型当"翻译官"**：用 MS MARCO 的（查询，相关文档）训练对调过来——给文档让它生成查询。模型学会的不是抄词，而是**抽取文档里"最像查询的几个角度"**，比如标题里没明说但内容暗示的实体名。

3. **零查询时开销**：所有神经计算都摊到离线一次。换来的代价：索引体积涨 30-50%（多塞了 80 条短查询）。但磁盘便宜、查询延迟金贵，这笔交易在工业场景几乎稳赚。

三件事加起来叫 **索引时文档扩展**（index-time document expansion）。

### 一句话回顾"伪相关反馈"以做对比

[[rm3]] 这类伪相关反馈的做法是：

1. 用原 query 跑一遍 BM25
2. 取 top-K 文档当"假定相关"
3. 从这 K 篇里挑高频词，把原 query 扩成更长的 query

doc2query 把这个流程**整个反过来**：不在查询时扩 query，而是在索引前扩 doc。一次扩展，所有未来的 query 都受益。这就是它最核心的概念跳跃。

## 实践案例

### 案例 1：MS MARCO 段落检索的数字跳跃

| 方法 | MRR@10 | 备注 |
|------|--------|------|
| BM25 | 0.184 | 公认强基线 |
| BM25 + doc2query (Transformer) | 0.215 | 原论文 |
| BM25 + docTTTTTquery (T5) | 0.277 | Nogueira & Lin 跟进版 |

**关键点**：把生成器从 vanilla Transformer 换成 T5（已经预训练过英文），分数再跳一大截。说明扩展质量直接受生成器英语能力制约。

### 案例 2：拼接的不是花哨向量，而是 plain text

```text
原文档：
  "The Eiffel Tower was completed in 1889 for the World's Fair..."

模型生成的 80 条查询（节选）：
  "when was the eiffel tower built"
  "who designed the eiffel tower"
  "height of eiffel tower in feet"
  ...

最终送入 Lucene 的文本：
  原文档 + " " + 80 条查询拼成一段
```

倒排索引完全不知道这堆文字是"生成的"——它就当多了点同义改写。这就是为什么任何 BM25 实现（[[anserini-2017]] / Elasticsearch）能零改造直接复用。

### 案例 3：T5 升级版（docTTTTTquery）的训练片段

```python
# 训练样本 (doc, query) 来自 MS MARCO triples
input_text  = "Passage: The Eiffel Tower was completed in 1889..."
output_text = "when was the eiffel tower built"

# T5 标准 seq2seq fine-tune
# 推理时 sampling 80 条不同 query 拼接到原文档末尾
```

用 T5 的好处：它见过 C4 全网英文，已经懂"问题该怎么问"，doc2query 只需教它"对着文档问"。同样的训练数据、同样的 80 条预测，换了底座就涨 6 个点。

### 案例 4：和 BM25 的角色分工

把整个系统想成两班人：

- **索引前**：seq2seq 模型当"造便签的实习生"，对每篇文档预测 80 条潜在查询
- **查询时**：BM25 当"翻便签的老师傅"，按 TF-IDF 公式打分，根本不知道有过神经网络

工程上这种"训练贵 / 推理便宜"的非对称是 doc2query 真正的杀手锏。

## 踩过的坑

1. **生成的查询会重复抄关键词**：80 条里可能有 40 条都围绕标题打转。论文用 sampling（top-k=10 + temperature）而非 greedy/beam，强制多样性。

2. **索引体积不能无限涨**：预测 1000 条查询效果会饱和但索引爆炸。论文测出 80 条左右是甜点。这是个工程超参，业务自己调。

3. **领域外文档退化**：MS MARCO 训练的 doc2query 拿去扩展医疗、法律文档时，生成的查询风格和真实用户偏差很大。要么用领域内数据 fine-tune，要么用更强的预训练模型（T5 救场就是这个原因）。

4. **评测易踩"标签泄漏"陷阱**：训练用的（query, doc）对如果和测试 query 重叠，模型会"背"出测试 query。原论文严格切分了 train / dev / test，复现时若自己造数据要警惕。

## 适用 vs 不适用场景

**适用**：

- BM25 强基线想再涨几个点但不愿引入 GPU 推理——首选 doc2query
- 离线索引能慢、查询时必须毫秒返回——例如新闻搜索、电商搜索
- 已经有大量（query, click 文档）日志可作训练数据
- 想给 dense retrieval 做混合（hybrid）——doc2query + DPR 常一起用

**不适用**：

- 文档总数极小（万级以下）——直接上 BERT 重排序更省事
- 文档极长（万字以上）——seq2seq 输入截断会让生成偏向开头几段
- 实时索引、文档分钟级更新——离线生成那 80 条会成瓶颈
- 没标注查询-文档对——zero-shot 用通用 T5 效果会差不少

## 历史小故事（可跳过）

- **2019 年 4 月**：Nogueira 等在 arXiv 发出第一版，用 vanilla Transformer，MS MARCO MRR@10 从 0.184 升到 0.215。社区意识到"扩文档而非扩查询"是漏掉的方向。
- **2019 年 10 月**：同组发 docTTTTTquery 技术报告，把生成器换成 T5-base，分数推到 0.277，几乎追平早期 BERT 重排序，但延迟少两个数量级。
- **2020 年**：MS MARCO Leaderboard 上 doc2query 类方法常驻第一阶段召回，配合 BERT 重排做 SOTA。
- **2021 年起**：[[splade-2021]] 把"生成扩展"换成"学稀疏权重"，思路是 doc2query 的进一步抽象——不再生成自然语言查询，直接学每个 token 的检索权重。

## 学到什么

1. **错配可以在离线消除**——查询时扩展和文档时扩展是数学等价但工程不等价；后者的延迟分布远更友好
2. **生成模型当索引增强器**比当排序器便宜得多——一篇文档生成一次，被亿万查询复用
3. **混入 plain text 比设计新数据结构杠杆大**——零修改复用 Lucene/Anserini，社区接受成本最低
4. **生成器质量决定上限**——Transformer 到 T5 之间分数差 6 个点，提示后续 LLM 时代这条路还能继续涨

## 延伸阅读

- 论文：[Document Expansion by Query Prediction (arXiv:1904.08375)](https://arxiv.org/abs/1904.08375)
- 跟进 docTTTTTquery：[From doc2query to docTTTTTquery](https://cs.uwaterloo.ca/~jimmylin/publications/Nogueira_Lin_2019_docTTTTTquery-v2.pdf)
- 仓库：[castorini/docTTTTTquery](https://github.com/castorini/docTTTTTquery)（含预训练 T5 权重）
- [[anserini-2017]] —— BM25 一侧的标准实验台，doc2query 直接接它跑
- [[okapi-bm25-1994]] —— 被扩展的那位老检索员
- [[ms-marco-2016]] —— 训练 doc2query 的查询-文档对来源

## 关联

- [[okapi-bm25-1994]] —— doc2query 的"宿主"，扩展后照样它来打分
- [[anserini-2017]] —— 论文实验都在它上面跑
- [[ms-marco-2016]] —— 训练数据 + 评测集
- [[splade-2021]] —— 思路上的接班人，把"生成自然语言查询"升级为"学稀疏权重"
- [[colbert-2020]] —— 同时期另一条路：查询时多向量交互，与 doc2query 互补
- [[dpr-2020]] —— 稠密向量路线，doc2query 常作为它的稀疏侧搭子做 hybrid
