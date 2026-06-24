---
title: Seq2Seq — 把翻译变成端到端神经网络
来源: 'Sutskever, Vinyals, Le, "Sequence to Sequence Learning with Neural Networks", NeurIPS 2014'
日期: 2026-05-31
分类: 深度学习 / NLP
难度: 中级
---

## 是什么

Seq2Seq 是 2014 年 Google 三个人写的 9 页论文，第一次用**两段神经网络**把整件事——「读一句法语，吐一句英语」——从头到尾接成一个可训练的整体。

日常类比：像两个翻译员背靠背坐着。第一个（**编码器**）把法语听完，在脑子里压出**一团想法**，递给第二个；第二个（**解码器**）拿着这团想法，一个英语词一个英语词地往外吐，直到吐出句号。

具体做法：

- 编码器是一个 LSTM，逐词读法语句子，把整句话压成**一个 1000 维向量**
- 解码器也是一个 LSTM，从这个向量出发，每次预测下一个英语词，预测完再把词喂回去预测下下个，直到生成 `<EOS>` 表示句子结束

## 为什么重要

不理解 Seq2Seq，下面这些事都没法解释：

- 为什么 **encoder-decoder** 是当今所有翻译/对话/摘要模型的默认骨架——这个词就是这篇论文定的
- 为什么 **attention 机制**（2015 Bahdanau）非要发明出来——它就是来修 Seq2Seq 的「固定向量瓶颈」
- 为什么 **Transformer**（2017）一出生就是 encoder-decoder 两段——它继承的就是 Seq2Seq 的范式骨架
- 为什么 **GPT** 这样 decoder-only 的模型也能做翻译——把 Seq2Seq 的两段拼成一段而已

一句话：这是把翻译从「特征工程 + n-gram」的统计范式，整体改写成「端到端神经网络」的奠基工作。后来的 attention / Transformer / 大模型都是在这块地基上盖楼。

## 核心要点

Seq2Seq 的设计可以拆成 **三块**：

1. **变长 → 定长 → 变长**：源句子长度不固定（5 词或 50 词），目标句子长度也不固定。编码器把变长压成一个**定长向量**，解码器再从定长向量展开成变长。这是关键的「桥」。

2. **两个 LSTM，参数不共享**：编码器和解码器是**两套独立**的 LSTM，参数完全分开训练。直觉是：「读」和「写」是两件不同的事，强行共享参数反而会互相干扰。

3. **训练目标极其朴素**：给定源句 x 和目标句 y，最大化 P(y|x) = 连乘每一步 P(yt | y1..yt-1, x)。整个网络可以反向传播一起训。

实验配置（论文里的关键数字）：

- 4 层 LSTM，每层 1000 维隐藏状态，参数总量 3.84 亿
- 8 张 GPU 数据并行训练 10 天
- 解码用 **beam search**（束搜索），beam=2 就够好，beam=12 提升不大

## 实践案例

### 案例 1：编码器到底压出了什么

论文做了一个很妙的可视化：把不同句子编码后的 1000 维向量降到 2 维。

发现：

- 「I gave her a book」和「She was given a book by me」在向量空间里**距离很近**——意思相同，编码器学到了**语义**而非词序
- 「John admires Mary」和「Mary admires John」**距离很远**——主谓颠倒，意思变了，编码器分得清

这告诉你编码器没有死记词序，它学到了一个**意义空间**。这个观察直接启发了后来的句子嵌入研究。

### 案例 2：把源句反过来读，BLEU 涨 5 个点

论文里有一个看起来非常邪门的 trick：**把源语言句子反转输入**。

- 正向输入「A B C → α β γ」：BLEU 25.9
- 反转输入「C B A → α β γ」：BLEU 30.6

差了将近 5 个点，几乎是天与地的差距。

为什么？因为反转后，**源句的第一个词** A 离**目标句的第一个词** α 在网络里只隔几步，梯度能轻松传过去。正向时 A 和 α 中间隔了整个句子，长 RNN 的梯度被衰减掉了。

这个 trick 暴露了原始 Seq2Seq 的**根本缺陷**：信息要走一条很长的串行路径。**这正是 attention 要解决的问题**——给解码器一个直达任意源词的捷径。

### 案例 3：BLEU 34.8 是什么水平

WMT-14 英→法翻译任务，那年的成绩单：

- 当时最强的统计机器翻译 SMT：BLEU 37.0
- Seq2Seq 单模型：BLEU 30.6（反转后）
- Seq2Seq 5 个模型集成：BLEU 34.8
- 用 Seq2Seq 给 SMT 1000-best 重排序：BLEU 36.5

意思是：**纯神经网络还没赢 SMT**，但已经接近到能当 SMT 的「质检员」用。论文标题没说自己赢了，只说「learning」——这是对当时尚未成熟的诚实。一年后 attention 出来，神经网络才正式干翻 SMT。

## 踩过的坑

1. **固定向量瓶颈**：50 词的句子要塞进 1000 维，10 词的句子也是 1000 维。长句翻译质量明显下降——在长度 35+ 的句子上 BLEU 掉得很惨。这个瓶颈撑了不到一年就被 attention 解决了。

2. **梯度路径太长**：反转输入这个 hack 暴露了 RNN 的老毛病——序列一长，前面的信息走不到后面。LSTM 能缓解但治不好根。直到 Transformer 用 self-attention 让任意两个位置 1 步可达才彻底解决。

3. **一定要用 LSTM 不能用普通 RNN**：论文明确提到普通 RNN 完全训不出来，梯度爆炸/消失太严重。这印证了 1997 年 LSTM 的价值。

4. **解码必须 beam search 不能贪心**：贪心解码每步选概率最大的词，但局部最优不等于全局最优。beam=2 已经显著好于 beam=1。

5. **集成学习是最后一道补丁**：单模型 BLEU 30.6，5 个不同初始化的模型集成才到 34.8。每个模型 10 天训练，等于花 50 个 GPU-天换 4 个 BLEU 点——这个性价比在工业部署里完全不能接受，也是后来研究都在追求「单模型直接打过基线」的原因。

6. **训练数据要足够干净**：论文用 WMT-14 的 1200 万句对，过滤掉了不在 16 万词频表里的低频词（用 `<UNK>` 替代）。词表外的词翻译质量会直接崩——这个问题直到 BPE/WordPiece 出现才被彻底解决。

## 适用 vs 不适用场景

**适用**：

- 任何「输入序列 → 输出序列」的任务模板：翻译、摘要、对话、语音识别、代码生成
- 输入输出长度不固定且没有 1:1 对齐关系的场景
- 想要一个端到端可训练（不分离子模块）的方案

**不适用**：

- 输出和输入有强对齐的任务（如词性标注、命名实体识别）——直接序列标注更简单
- 长文档生成——固定向量瓶颈会咬人，必须上 attention
- 实时低延迟场景——LSTM 必须串行解码，每步都依赖上一步

## 历史小故事（可跳过）

- **2014 年 6 月**：Cho 等人在 EMNLP 发表 RNN encoder-decoder（用于 SMT 重排序），是 Seq2Seq 的直接前身。
- **2014 年 9 月**：Sutskever 这篇上 NeurIPS。区别：用 LSTM 不是 GRU，深 4 层不是 1 层，更重要的是定位为**端到端翻译**而不是 SMT 的辅助件。
- **2015 年**：Bahdanau attention 出现，解决固定向量瓶颈，BLEU 一举超过 SMT。
- **2016 年**：Google 把 Seq2Seq + attention 上线为 GNMT，正式取代 Google Translate 用了 10 年的 SMT 系统。
- **2017 年**：Transformer 出现，把 RNN 整体替换为 self-attention，但 encoder-decoder 这个框架名留下来了。

3 年内，Seq2Seq 的范式赢了，它的具体实现（RNN）被替换了。这是 ML 史上很经典的一次「思想活下来、零件全换」。

一个常见误解：很多教程把 Seq2Seq 直接画成「带 attention 的 encoder-decoder」，但 2014 这篇原始论文里**完全没有 attention**——它就是两段裸 LSTM 中间挤一个 1000 维向量。理解这一点很重要：你才能明白 attention 是为了解决什么具体问题被发明出来的。

## 学到什么

1. **端到端 vs 分模块**：不要预设「这件事必须分成 N 个步骤」。Seq2Seq 把翻译里的对齐、语言模型、调序全融进一个网络，反而比精心设计的 SMT 简洁。
2. **范式 vs 实现**：encoder-decoder 是范式，LSTM 是实现。Transformer 来了之后实现换了，范式还在。学习时要分清。
3. **诚实地指出瓶颈**：论文明确写了「长句翻译变差」「需要反转 trick」，这些坦诚的弱点反而成了下一篇论文的起点。这是研究的健康循环。
4. **简单 baseline 的力量**：3.84 亿参数、纯 LSTM、最朴素的 cross-entropy 损失，没用任何花活，跑出了能挑战十几年 SMT 积累的成绩。

## 延伸阅读

- 论文 9 页 PDF：[Sutskever 2014](https://arxiv.org/abs/1409.3215)（密度高但可读，附录有可视化）
- 视频教程：[Andrew Ng — Sequence to Sequence Models](https://www.coursera.org/lecture/nlp-sequence-models/basic-models-HyEui)（Coursera NLP 课，1 小时讲完）
- TensorFlow 官方 [Neural Machine Translation tutorial](https://www.tensorflow.org/text/tutorials/nmt_with_attention)（自己写一个 Seq2Seq+attention）
- [[attention]] —— Bahdanau 2015，下一篇必读，解决固定向量瓶颈
- [[lstm-1997]] —— Seq2Seq 的零件，理解长程依赖

## 关联

- [[attention]] —— 直接后继，给 Seq2Seq 装上「直达源词的捷径」
- [[lstm-1997]] —— 编码器/解码器的内部零件
- [[transformer]] —— 范式继承者，把 RNN 换成 self-attention
- [[bert-2019]] —— 借用 encoder 那一半，丢掉 decoder
- [[gpt]] —— 借用 decoder 那一半，丢掉 encoder
- [[fastertransformer-2021]] —— Seq2Seq 后裔的工业级推理优化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[fastertransformer-2021]] —— FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
- [[vall-e-2023]] —— VALL-E — 3 秒音频样本就能克隆你的声音
- [[whisper-2022]] —— Whisper — 用 68 万小时"野生"音频教会模型听懂全世界

