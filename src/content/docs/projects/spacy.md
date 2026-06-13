---
title: spaCy 零基础入门笔记
来源: https://github.com/explosion/spaCy
日期: 2026-06-13
分类: 机器学习
子分类: bioinformatics-and-scientific
provenance: pipeline-v3
---

# spaCy 零基础入门笔记

## 一、spaCy 是什么？

想象一下，你有一大堆文字——比如一万条用户评论、一千封邮件、或者一整本书。这些文字对人类来说很好理解，但对电脑而言只是一串字符，它不知道哪个词是人名、哪句话是主语、"running" 的原形是什么。

spaCy 就是用来帮电脑"读懂"文字的 Python 库。它的定位很明确：**工业级的 NLP 工具**。也就是说，它不是给你在课堂上做实验的玩具，而是真能放到生产环境里处理海量数据的工具。

GitHub 上有超过三万颗 Star，说明它在业界被广泛使用。

## 二、核心概念

### 1. 处理管道（Pipeline）

spaCy 的核心思想是"管道"。你可以把它想象成一条工厂流水线：

- 原材料（原始文本）从一端进入
- 经过多个工作站（分词、词性标注、依存分析、实体识别……）
- 每个工作站给文本贴上一层标签
- 最后从另一端出来的，就是一个"加工完毕"的文档对象

```
原始文本 → [分词] → [词性标注] → [依存分析] → [命名实体识别] → 完整的 Doc 对象
```

你不需要手动调用每一个步骤，加载一个模型之后，整个管道会自动运行。

### 2. Doc、Token、Span

这三个是 spaCy 里最重要的数据结构，理解了它们就理解了 spaCy 的一半：

- **Doc（文档）**：整个处理后的文本。就像一本加工好的书，里面包含了所有层级的信息。
- **Token（词元）**：Doc 里的最小单位，代表一个"词"或"标点"。注意，Token 不只是文字本身，它还带着各种属性——词性、原形、它在句法树中的位置等等。
- **Span（跨度）**：Doc 里的一段连续文本。比如一个命名实体 "Apple" 就是一个 Span，一句话也是一个 Span。

打个比方：如果 Doc 是一本完整的书，Token 就是书里的每一个字，Span 就是书中的某一段落。

### 3. 词性标注（POS Tagging）

POS Tagging 就是给每个词标记它的词性——名词、动词、形容词等等。但 spaCy 做得更细：它有粗粒度标签（如 VERB、NOUN）和细粒度标签（如 VBG 表示动名词、VBZ 表示第三人称单数现在时）。

### 4. 词形还原（Lemmatization）

"running" 的原形是 "run"，"better" 的原形是 "good"。词形还原就是把一个词的变形还原到词典中的基础形式，这个基础形式就叫 **lemma**。

### 5. 依存句法分析（Dependency Parsing）

这是 spaCy 最强大的功能之一。它分析句子中每个词之间的关系，建立一棵"句法树"。

以 "Autonomous cars shift insurance liability toward manufacturers" 为例：
- "cars" 是主语（nsubj），指向动词 "shift"
- "shift" 是整个句子的核心（ROOT）
- "liability" 是宾语（dobj），也指向 "shift"
- "toward" 是介词（prep），修饰 "shift"

这棵树告诉你：谁对谁做了什么。

### 6. 命名实体识别（NER）

NER 就是找出文本中"有意义的名词"——人名、地名、机构名、时间、金额等等。

比如 "Apple is looking at buying U.K. startup for $1 billion"：
- "Apple" → ORG（机构）
- "U.K." → GPE（地缘政治实体，即国家/城市）
- "$1 billion" → MONEY（金额）

### 7. 名词短语（Noun Chunks）

名词短语就是以名词为核心的短语。比如 "autonomous cars"、"the world's largest tech fund"。spaCy 可以自动把文本中的名词短语都抽出来。

## 三、代码示例

### 示例一：基础处理流程

这是最典型的 spaCy 用法。加载英文模型后，传入一段文本，就能拿到所有标注信息。

```python
import spacy

# 加载英文预训练模型（约 700MB）
nlp = spacy.load("en_core_web_sm")

# 传入原始文本，得到 Doc 对象
doc = nlp("Apple is looking at buying U.K. startup for $1 billion")

# --- 遍历每个 Token ---
print("=== 词元级别的信息 ===")
for token in doc:
    print(f"原文: {token.text:<12} 原形: {token.lemma_:<10} "
          f"词性: {token.pos_:<8} 依存关系: {token.dep_:<10}")

# --- 命名实体识别 ---
print("\n=== 命名实体 ===")
for ent in doc.ents:
    print(f"实体: {ent.text:<15} 类型: {ent.label_:<8} "
          f"描述: {spacy.explain(ent.label_)}")

# --- 名词短语 ---
print("\n=== 名词短语 ===")
for chunk in doc.noun_chunks:
    print(f"短语: {chunk.text:<25} 核心词: {chunk.root.text}")

# --- 句子分割 ---
print("\n=== 句子 ===")
for sent in doc.sents:
    print(f"句子: {sent.text}")
```

运行结果大致如下：

```
=== 词元级别的信息 ===
原文: Apple        原形: apple      词性: PROPN    依存关系: nsubj
原文: is           原形: be         词性: AUX      依存关系: aux
原文: looking      原形: look       词性: VERB     依存关系: ROOT
原文: at           原形: at         词性: ADP      依存关系: prep
原文: buying       原形: buy        词性: VERB     依存关系: pcomp
原文: U.K.         原形: u.k.       词性: PROPN    依存关系: compound
原文: startup      原形: startup    词性: NOUN     依存关系: dobj
原文: for          原形: for        词性: ADP      依存关系: prep
原文: $            原形: $          词性: SYM      依存关系: quantmod
原文: 1            原形: 1          词性: NUM      依存关系: compound
原文: billion      原形: billion    词性: NUM      依存关系: pobj

=== 命名实体 ===
实体: Apple           类型: ORG      描述: Companies, agencies, institutions.
实体: U.K.            类型: GPE      描述: Geopolitical entity, i.e. countries, cities, states.
实体: $1 billion      类型: MONEY    描述: Monetary values, including unit.

=== 名词短语 ===
短语: Apple                   核心词: Apple
短语: U.K. startup            核心词: startup
短语: $1 billion              核心词: billion

=== 句子 ===
句子: Apple is looking at buying U.K. startup for $1 billion
```

### 示例二：依存句法分析与导航

这个示例展示如何利用 spaCy 的句法树来理解句子结构，并做一些实用的信息抽取。

```python
import spacy

nlp = spacy.load("en_core_web_sm")

doc = nlp("The quick brown fox jumps over the lazy dog near the river")

print("=== 依存句法树导航 ===")
for token in doc:
    if token.head != token:  # 跳过指向自己的 ROOT 节点
        print(f"{token.text:<10} --> {token.head.text:<10} "
              f"(关系: {token.dep_})")

print("\n=== 从核心词向上/向下遍历 ===")
# 找到 "jumps" 这个词
jump_token = [t for t in doc if t.text == "jumps"][0]

# 左边的修饰语（主语部分）
print(f"'jumps' 左侧修饰: {[c.text for c in jump_token.lefts]}")
# 右边的成分（宾语/状语部分）
print(f"'jumps' 右侧修饰: {[c.text for c in jump_token.rights]}")

# 查找某个词的所有后代（子树）
print(f"\n'jumps' 的子树: {' '.join([t.text for t in jump_token.subtree])}")

print("\n=== 实用信息抽取：找动作的执行者 ===")
# 找到所有动词
verbs = [t for t in doc if t.pos_ == "VERB"]
for verb in verbs:
    # 找主语（nsubj 关系的词）
    subjects = [c for c in doc if c.dep_ == "nsubj" and c.head == verb]
    if subjects:
        print(f"动作 '{verb.text}' 的执行者是: {subjects[0].text}")
```

运行结果：

```
=== 依存句法树导航 ===
quick      --> fox        (关系: amod)
brown      --> fox        (关系: amod)
fox        --> jumps      (关系: nsubj)
lazy       --> dog        (关系: amod)
over       --> jumps      (关系: prep)
the        --> dog        (关系: det)
near       --> jumps      (关系: prep)
the        --> river      (关系: det)
river      --> over       (关系: pobj)

=== 从核心词向上/向下遍历 ===
'jumps' 左侧修饰: ['The', 'quick', 'brown', 'fox']
'jumps' 右侧修饰: ['over', 'near']

'jumps' 的子树: The quick brown fox jumps over the lazy dog near the river

=== 实用信息抽取：找动作的执行者 ===
动作 'jumps' 的执行者是: fox
```

## 四、spaCy 的主要优势

| 特性 | 说明 |
|------|------|
| **速度快** | 基于 Cython 实现，比纯 Python NLP 库快很多倍 |
| **生产就绪** | 不是玩具库，被大量公司和研究项目在生产环境中使用 |
| **多语言支持** | 支持 60+ 种语言，每种都有专门的模型 |
| **丰富的标注** | 分词、词性、依存句法、命名实体、词形还原一站式搞定 |
| **规则匹配** | 除了统计模型，还支持类似正则表达式的规则匹配（Matcher） |
| **可训练** | 支持从头训练模型，也可以增量微调已有模型 |
| **可视化工具** | 内置 displaCy，可以直观地查看依存树和命名实体 |

## 五、安装与使用

安装 spaCy 和模型：

```bash
pip install spacy
python -m spacy download en_core_web_sm
```

基本使用三步曲：

```python
import spacy

# 第一步：加载模型
nlp = spacy.load("en_core_web_sm")

# 第二步：处理文本
doc = nlp("你的文本在这里")

# 第三步：提取信息
for token in doc:
    print(token.text, token.pos_, token.dep_)
```

## 六、关键 API 速查

- `nlp(text)` → 将文本变成 Doc 对象
- `doc.text` → 原始文本
- `doc.ents` → 命名实体列表
- `doc.noun_chunks` → 名词短语列表
- `doc.sents` → 句子列表
- `token.text` → Token 的原文
- `token.lemma_` → 词形还原结果
- `token.pos_` → 粗粒度词性
- `token.dep_` → 依存关系标签
- `token.head` → 句法树中的父节点
- `token.lefts` / `token.rights` → 左右子节点
- `spacy.explain(tag)` → 解释一个标签的含义

## 七、下一步

spaCy 还有很多高级主题值得深入学习：

1. **规则匹配（Rule-based Matching）**：用 Pattern 和 Matcher 做精确匹配，不受模型准确率限制
2. **训练自己的模型**：用你自己的标注数据微调 NER 或分类器
3. **Transformer 集成**：结合 BERT 等预训练模型获得更高的准确度
4. **自定义管道组件**：编写自己的 NLP 处理步骤接入管道
5. **批量处理**：利用 `nlp.pipe()` 高效处理大量文本

spaCy 的设计哲学是"让复杂的 NLP 变得简单"。只要理解了 Doc、Token、Span 这三个核心概念和 Pipeline 的工作方式，你就已经掌握了 spaCy 的精髓。
