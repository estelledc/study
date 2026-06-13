---
title: "GPT-3 — 少样本学习者"
来源: 'https://arxiv.org/abs/2005.14165'
日期: 2026-06-13
分类: NLP
子分类: ml-deep-learning
provenance: pipeline-v3
---

## 是什么

GPT-3 是 OpenAI 在 2020 年 5 月发布的语言模型，有 1750 亿个参数，比前代 GPT-2 大了 100 倍。论文标题叫 "Language Models are Few-Shot Learners"。

日常类比：

> 想象一个学生，他读了几乎整个互联网上的文字。传统 AI 的做法是：你想让他做数学题，就专门给他一套数学题让他反复练习；你想让他翻译法语，就再给他一套法语题练一遍。每个任务都要重新训练。
>
> GPT-3 的做法完全不同：你不需要专门训练它。**你只需要给它看几个例子**——比如给它两个"英文到法文的翻译例子"，然后给第三个英文句子让它翻译，它就能猜出来。就像老师给学生出了两道例题，然后出一道类似的题让学生做，学生一看例题就知道该怎么做。
>
> 更厉害的是，有时候**连例题都不需要**——你只用自然语言说一句"请翻译以下句子"，它就知道该干嘛了。这就像你告诉一个读过整间图书馆的人"你会用法语吗？"，他说"会啊"，然后你就直接出题考他。

这就是 GPT-3 的核心发现：

> **语言模型不需要针对每个任务重新训练。只要模型够大（1750 亿参数），在输入时给几个例子（few-shot），它就能在不做任何参数更新的情况下完成新任务。**

## 为什么重要

不理解 GPT-3，下面这些事都没法解释：

- 为什么 ChatGPT 时代的 Prompt Engineering 成为可能——GPT-3 首次证明了"给例子就能学会"（in-context learning），这是 ChatGPT 交互模式的基础
- 为什么参数量从几亿跳到几千亿再到几千亿——这篇论文建立了"scaling law"的实证基础：模型越大，少样本学习能力越强，且呈平滑的幂律关系
- 为什么后来出现了 In-Context Learning、Chain-of-Thought、Tool Use 这些范式——它们都建立在 GPT-3 发现的"in-context learning"之上
- 为什么 OpenAI 后来转向 GPT-3.5/GPT-4 的 RLHF 路线——因为 GPT-3 虽然强大，但零样本/少样本的表现仍有明显上限，需要人类反馈来进一步提升

## 核心概念

### 1. In-Context Learning（上下文学习）

这是 GPT-3 最重要的发现。传统做法中，模型完成任务需要"微调"（fine-tuning）——即更新模型的内部参数。而 GPT-3 发现，**不更新任何参数**，只在输入时给出几个示例，模型就能学会新任务。

```
传统微调（Fine-Tuning）：
  预训练模型 + 任务数据 → 更新模型参数 → 新模型 → 推理

GPT-3 少样本（Few-Shot / In-Context Learning）：
  预训练模型（参数冻结） + 示例 + 新问题 → 直接推理（不更新参数）
```

关键区别：微调改变了模型的"大脑"，而 in-context learning 只是在模型的"工作记忆"中放了几张参考卡片。

### 2. 三种学习设置

GPT-3 论文定义了三种推理时的使用方式，从简单到复杂：

| 设置 | 输入内容 | 类比 |
|------|----------|------|
| Zero-Shot（零样本） | 只有任务描述，没有示例 | 老师说："请把这句话翻译成法语" |
| One-Shot（单样本） | 一条示例 + 一个新问题 | 老师给一个例子："Hello → Bonjour"，然后让你翻 "Good morning" |
| Few-Shot（少样本） | 10-100 个示例 + 一个新问题 | 老师给十几道题的例题，然后出一道新的 |

### 3. Scaling Law（缩放定律）

GPT-3 训练了从 1.25 亿到 1750 亿共 8 个不同大小的模型。结果发现：**模型越大，少样本学习能力的提升越明显**。而且这种提升遵循平滑的幂律关系——不是突然"涌现"出来的，而是随着规模逐步增强。

```
模型越小 → 零样本和少样本差距很小（模型记不住模式）
模型越大 → 少样本相比零样本的提升幅度越大（模型能更好地利用示例）
```

### 4. 训练数据与流程

GPT-3 的训练数据和流程跟 GPT-2 类似，但规模扩大了几个数量级：

```
训练数据构成：
  - Common Crawl（过滤后）: 4100 亿 token，占 60%
  - WebText2:              190 亿 token，占 22%
  - Books1 + Books2:       67 亿 token，占 16%
  - Wikipedia:              30 亿 token，占 3%

训练总量: 3000 亿 token
上下文窗口: 2048 token
架构: Decoder-only Transformer（与 GPT-2 相同）
```

注意：高质量数据（如 Books、Wikipedia）被重复采样多次，而 Common Crawl 只采样不到一半。这是一种策略取舍——宁可轻微过拟合，也要保证数据质量。

### 5. 数据污染（Data Contamination）

这是一个 GPT-3 论文中首次被系统讨论的重要问题。因为训练数据用了整个 Common Crawl（互联网镜像），而很多评测数据集也来自互联网，所以**测试题很可能已经在训练数据中出现过**。

这意味着某些数据集上 GPT-3 的高分，可能不是因为"学会了"，而是因为"背过了"。论文作者非常诚实地标记了存在污染风险的数据集。

## 关键实验结果

### 实验一：闭卷问答（Closed-Book QA）

模型不看任何外部资料，只靠训练时学到的知识回答问题：

```
数据集: TriviaQA（开放域知识问答）

零样本（只有指令）:  64.3%
单样本（1 个例子）:  68.0%
少样本（10-100 个例子）: 71.2%  ← 达到当时最佳（SOTA）

对比：之前最好的微调模型（RAG, 需要外部知识库）在开放设定下只有 68.0%
```

这意味着：GPT-3 少样本不需要外部数据库，仅凭"脑子里的知识"就超过了需要外挂知识库的模型。

### 实验二：合成任务——证明真正的"学习"能力

为了证明 GPT-3 不是在死记硬背，作者设计了训练集中不可能出现的任务：

```
任务：单词打乱还原（Word Scrambling）
示例：输入 "tcsoe" → 输出 "coste"（实际应为 "cost"）

关键设计：训练时从未见过这种任务
结果：模型大小与性能呈正相关
  - 125M 参数: 几乎不会
  - 6.7B 参数: 开始有一些能力
  - 175B 参数: 显著超出小模型表现
```

这说明大模型确实具备**即时适应新规则**的能力，而不是仅仅回忆训练数据。

### 实验三：人类难以区分 AI 生成的新闻

GPT-3 在少样本设置下生成的新闻文章，经过人类评估者盲测，**很难与真人写的文章区分开来**。这既是能力的证明，也是社会影响的警示。

## 代码示例

### 示例一：零样本翻译（Zero-Shot Translation）

零样本意味着不给任何例子，只给指令：

```python
# 调用 GPT-3 API 进行零样本翻译
response = openai.Completion.create(
    engine="davinci",          # GPT-3 最大的模型
    prompt="Translate English to French:\n\nEnglish: How are you?\nFrench:",
    max_tokens=20,
    temperature=0.7
)

# GPT-3 的输出可能是: "Comment allez-vous ?"
```

模型没见过任何英法翻译对，但因为它读过大量多语文本，知道"how are you"的法语表达，所以能直接翻译。

### 示例二：少样本算术（Few-Shot Arithmetic）

让模型做它训练时从未被专门教过的三位数加法：

```python
# 少样本设置：给出几个例子让模型学会加法规则
response = openai.Completion.create(
    engine="davinci",
    prompt="""Perform the addition:

2 + 3 = 5
7 + 8 = 15
12 + 19 = 31

123 + 456 =""",
    max_tokens=10,
    temperature=0.0
)

# GPT-3 的输出: "579"
```

注意：这里的重点是——GPT-3 的训练目标从来不是做数学题，而是预测下一个词。但它通过几个例子就"学会"了加法规则并应用到新数字上。这就是 in-context learning 的威力。

### 示例三：少样本情感分类（Few-Shot Sentiment Classification）

```python
# 让模型学会判断句子的情感倾向
response = openai.Completion.create(
    engine="davinci",
    prompt="""Classify the sentiment of this review:

Review: I love this product! It's amazing.
Sentiment: Positive

Review: Terrible experience, would not recommend.
Sentiment: Negative

Review: The food was okay, nothing special.
Sentiment:""",
    max_tokens=10,
    temperature=0.0
)

# GPT-3 的输出: " Neutral"
```

### 示例四：少样本单词造词（Few-Shot Neologism）

测试模型能否将新造的单词用在句子中：

```python
# 让模型学会一个新词的用法
response = openai.Completion.create(
    engine="davinci",
    prompt="""Use the invented word "flurbo" in a new sentence:

Definition: A flurbo is a green alien that lives on cold planets
Sentence: I dreamed of a flurbo last night.

Definition: A blorg is a tiny creature that repairs computers
Sentence:""",
    max_tokens=20,
    temperature=0.7
)

# GPT-3 的输出可能是: "I saw a blorg fixing my laptop this morning."
```

模型在训练时从未见过"blorg"这个词，但通过一个例子就学会了它的词性和用法，并创造了一个新句子。

## GPT-3 的局限性

论文也坦诚指出了 GPT-3 做不好的事情：

- **自然语言推理（NLI）**：如 ANLI 数据集上表现很差，无法理解复杂的逻辑蕴含关系
- **部分阅读理解**：如 RACE、QuAC 等数据集上表现不佳
- **复杂数学**：只能做简单的三位数运算，复杂计算仍然不行
- **偏见和有害内容**：因为训练数据来自互联网，模型学到了其中的偏见
- **数据污染问题**：部分数据集的高分可能来自训练数据中的测试题泄露

## 影响与后续

GPT-3 论文发表后，直接催生了以下几个方向：

1. **Prompt Engineering** 成为一门学问——既然模型可以通过提示学会任务，那么怎么写提示就成了核心竞争力
2. **In-Context Learning 理论**——学术界开始研究"为什么大模型能做到上下文学习"，以及"它到底是在学习还是在检索"
3. **Chain-of-Thought（思维链）**——2022 年的工作发现，在 few-shot 示例中加入推理步骤，模型的表现会大幅提升
4. **Scaling Law 的持续验证**——后续的 Chinchilla、PaLM、GPT-4 等工作都延续了"更大模型更好"的思路
5. **从 GPT-3 到 ChatGPT 的转变**——GPT-3 虽然强大，但直接对话体验不够好，OpenAI 后来引入了 RLHF（人类反馈强化学习），才有了 ChatGPT

## 一句话总结

> **GPT-3 证明了：语言模型不需要为每个任务单独训练。只要模型足够大（1750 亿参数），在输入时给几个例子，它就能在不更新任何参数的情况下学会新任务。这彻底改变了我们与 AI 交互的方式——从"训练专用模型"变成了"用自然语言编程"。**
