---
title: GPT-3 Language Models are Few-Shot Learners
来源: Brown et al., "Language Models are Few-Shot Learners", NeurIPS 2020 / arXiv 2005.14165
---

## 一句话总结

GPT-3 把 decoder-only Transformer 语言模型推到 175B 参数（比 GPT-2 大 10×），
并发现：当模型够大时，仅靠 prompt 里写几个示例（few-shot in-context learning），
就能在二十多个 NLP 任务上接近 finetune 级 SOTA，权重一行不动。这篇论文是
「scaling 是主路」的第一个大规模工业级证据，也是 ChatGPT / Claude / Gemini /
LLaMA 这一代 LLM 的公认起点。

## 历史定位

把 NLP / LLM 的演化按时间轴排开，GPT-3 处在「encoder-decoder 三足鼎立」结束、
「decoder-only 大模型一家独大」开始的转折点：

- 2003: 神经语言模型（Bengio et al.），固定 word embedding
- 2013: Word2Vec / 2014 GloVe，静态词向量大规模可用
- 2017-06: **Transformer**（Vaswani et al.），attention is all you need（见 [[attention]]）
- 2018-06: **GPT-1**（Radford et al.），decoder-only + 无监督预训练 + 有监督 finetune
- 2018-10: **BERT**（Devlin et al.），encoder-only + MLM 双向预训练（见 [[bert]]）
- 2019-02: **GPT-2**（Radford et al.），1.5B 参数 + zero-shot 任务泛化（OpenAI 一开始拒发权重）
- 2019-10: **T5**（Raffel et al.），text-to-text 统一所有任务格式
- 2020-01: **Scaling Laws**（Kaplan et al.），loss 与 N / D / C 的幂律关系（见 [[scaling-laws]]）
- 2020-05: **GPT-3**（本文），175B 参数 + few-shot in-context learning
- 2020-06: OpenAI API 上线（GPT-3 商业化分水岭，第一次让 LLM 能买能用）
- 2022-03: **InstructGPT**（Ouyang et al.），RLHF 把 GPT-3 对齐到指令（见 [[instructgpt]]）
- 2022-03: **Chinchilla**（Hoffmann et al.），重新校准计算预算分配（见 [[chinchilla]]）
- 2022-11: **ChatGPT** 发布，5 天破百万用户、2 个月破亿
- 2023-03: **GPT-4**（OpenAI），multimodal + 强推理
- 2023-07 起: LLaMA 1/2/3、Claude 1/2/3、Gemini、DeepSeek、Mistral 全部 GPT-3 风格 decoder-only

GPT-3 引用数 30k+，工业上是「LLM 时代」第一个被广泛部署的模型，论文里那张
scaling curve（Figure 1.2）是过去六年被讲得最多的一张图，没有之一。

## 类比起手：finetune vs in-context learning

把模型学新任务想象成两种学生：

- **finetune 学生**（BERT 路线）：每碰到一门新课就重写一遍笔记。学物理重写一份、学
  化学重写一份、学历史重写一份。每门课需要老师批改大量作业（监督数据），写完笔记
  之后这套笔记就只能用于这门课。
- **in-context 学生**（GPT-3 路线）：脑子里已经读完了几亿本书，碰到新任务时老师
  不再批改作业，只在题目前面贴 1-100 道带答案的例题。学生看完例题，立刻在新题上
  作答，整个过程笔记本（模型权重）一个字没改。

GPT-3 论文要回答的核心问题就是：**当读的书够多、脑容量（参数量）够大，第二种学生
能不能逼近第一种？** 答案是：在很多任务上能，在另一些任务上还不能，但 trend 已经
挡不住了。

## 三种 prompt 形式（Definition）

论文 §2 给出三种 in-context 评估范式，差别只在 prompt 里塞几个示例：

| 模式 | 示例数 K | prompt 形式 |
|------|---------|------------|
| zero-shot | 0 | 任务描述 + 待解题 |
| one-shot | 1 | 任务描述 + 1 例 + 待解题 |
| few-shot | 10-100 | 任务描述 + K 例 + 待解题 |

few-shot 的 K 不是越大越好——上限被 context window（GPT-3 是 2048 token）卡死。
一些任务能塞 100 例，有些只能塞 5-10 例。

## 一段动机：finetune 的三个痛点

GPT-3 在 §1 里把传统 finetune 范式批了三句话，每一句话都在为后面 175B 这个数字铺垫：

1. **每个新任务都要标注新数据集**：finetune 一个 task 通常要 10k-100k 监督样本，对
   长尾任务（小语种翻译、罕见诊断、特殊领域）根本凑不齐。
2. **finetune 的泛化是「窄」泛化**：在训练分布内能 SOTA，分布稍微偏移性能就崩。
   论文引 spurious correlation 文献说「finetune 模型很容易学到捷径」。
3. **人类不需要每个任务都重训**：一个识字的成年人看 1-2 个例子就会做新题。如果
   想做出 human-level 的 AI，**meta-learning 必须从架构层面进来**，而不是每个
   task 重训一次。

第三点是论文的「招魂语」——GPT-3 把 in-context learning 等同于 meta-learning
in the forward pass，这是它哲学上最大的一步棋。

> 怀疑：GPT-3 论文标榜 "few-shot 接近 SOTA finetune"，但展开 24 个任务表会发现
> 只在部分任务（LAMBADA、TriviaQA、PhysicalQA）上是 narrow margin，SuperGLUE 整
> 体仍被 finetune 模型碾压（few-shot 71.8 vs SOTA 89.0）。OpenAI 在论文摘要里
> 选择「few-shot 接近 finetune SOTA」措辞，是不是 cherry-picking 任务子集？后来
> 学界做的更冷静评估（HELM 2022）表明：few-shot 与 finetune 的 gap 在多数实用
> 任务上仍然显著。这个营销叙事的代价是让一代人误以为 finetune 已死，结果 2023
> 年开始 LoRA / RLHF / SFT 又卷土重来。

## Section 1: 为什么是 175B 不是 13B

GPT-3 训了 8 个规模的模型，真正的 finding 是规模本身的图。

### Method 1: 8 个模型规模的设计

OpenAI 没有「先选 175B 再造」，而是先按 Kaplan scaling laws 排出 8 个规模，全部
都用同一份 architecture / data / training recipe，只改参数量：

| 模型 | 参数 | n_layer | d_model | n_heads | d_head | batch (tokens) | LR |
|------|------|---------|---------|---------|--------|----------------|-----|
| GPT-3 Small | 125M | 12 | 768 | 12 | 64 | 0.5M | 6.0e-4 |
| GPT-3 Medium | 350M | 24 | 1024 | 16 | 64 | 0.5M | 3.0e-4 |
| GPT-3 Large | 760M | 24 | 1536 | 16 | 96 | 0.5M | 2.5e-4 |
| GPT-3 XL | 1.3B | 24 | 2048 | 24 | 128 | 1M | 2.0e-4 |
| GPT-3 2.7B | 2.7B | 32 | 2560 | 32 | 80 | 1M | 1.6e-4 |
| GPT-3 6.7B | 6.7B | 32 | 4096 | 32 | 128 | 2M | 1.2e-4 |
| GPT-3 13B | 13B | 40 | 5140 | 40 | 128 | 2M | 1.0e-4 |
| GPT-3 175B | 175B | 96 | 12288 | 96 | 128 | 3.2M | 0.6e-4 |

这张表的设计原则：**层数与 d_model 大致按 √N 同步增长**，让每层的计算成本不会
失衡。175B 这一行常被叫做「GPT-3.0」或「davinci」，OpenAI API 早期默认指向它。

### Method 2: 同 recipe 训 8 次

8 个模型用同一份训练数据、同一种 tokenizer（BPE，50257 token）、同一个 context
window（2048 token），只把参数量按表格调。这种「除了规模其他都不动」的实验设计是
Kaplan scaling laws 的标准做法——只这样才能把 loss 与 N 的关系干净地画出来。

> 怀疑：175B 训练成本估在 3.14e23 FLOPs，按 2020 年 V100 单价折算 ~$4.6M。这种
> 「只能 OpenAI 玩」的资金门槛是不是 AI 时代的「垄断信号」？2020-2022 年学界几乎
> 没人能复现 175B 规模实验，相关论文只能在 GPT-Neo（2.7B）/ GPT-J（6B）/ GPT-NeoX
> （20B）等更小规模上验证 finding。直到 2023 LLaMA 1（65B）才把开源端拉到接近水
> 平线。换句话说，GPT-3 论文给学界留下的不是科学问题（那部分被解了），而是「资本
> 集中度」问题——这是 OpenAI 后来商业模式的隐性论证。

## Section 2: 模型架构

### Method 3: decoder-only Transformer + Sparse attention

GPT-3 架构基本沿用 GPT-2 / Transformer decoder，关键参数：

- **decoder-only**：只有 self-attention + feed-forward 堆叠，无 encoder
- **causal mask**：每个 token 只能看见左边的 token（与 BERT 双向相反）
- **96 层 / 12288 d_model / 96 heads / 128 d_head**：175B 这一档
- **alternating dense and locally banded sparse attention**：偶数层用 full
  attention，奇数层用 Sparse Transformer 的 strided / fixed pattern。论文一句
  话带过，没展开，这是社区诟病的「关键细节没说清」之一
- **context window 2048 token**：比 GPT-2 1024 翻倍，但与后来 GPT-3.5/4 的
  32K / 128K 还差两个数量级
- **位置编码**：learned positional embedding（不是 RoPE，也不是 sinusoidal）
- **激活**：GELU
- **Layer norm 位置**：pre-LN（Layer norm 在 sublayer 之前）

### Algorithm 1: 自回归推理伪代码

```text
input  : prompt tokens x_1, ..., x_n
output : completion tokens x_{n+1}, ..., x_{n+T}

for t = n+1 .. n+T:
    h_0 = embed(x_1..x_{t-1}) + pos_embed(1..t-1)
    for layer = 1..96:
        # masked multi-head self-attention
        a = MultiHeadAttention(h_{l-1}, mask=causal)
        h' = LayerNorm(h_{l-1} + a)
        # feed-forward
        f = FFN(h')
        h_l = LayerNorm(h' + f)
    logits = h_96 @ W_embed^T   # weight tying
    x_t = sample(softmax(logits[-1]))
```

注意 weight tying：embedding 矩阵 W_embed (vocab × 12288) 与输出投影共用，省下
约 0.6B 参数（vocab=50257 × d_model=12288）。

### Method 4: 训练数据混合

论文 Table 2.2：

| 数据集 | 量 (tokens) | 训练时采样权重 | epoch |
|--------|-------------|---------------|-------|
| Common Crawl (filtered) | 410B | 60% | 0.44 |
| WebText2 | 19B | 22% | 2.9 |
| Books1 | 12B | 8% | 1.9 |
| Books2 | 55B | 8% | 0.43 |
| Wikipedia | 3B | 3% | 3.4 |

**有意思的细节**：Common Crawl 量最大但权重才 60%，WebText2 量小但 epoch 跑了
2.9 次。这是 OpenAI 经验性发现——高质量数据应该多次 sample，低质量大数据集合稀
释一下。这与 Chinchilla 后来的「单 epoch 是最优」是不同的取舍（Chinchilla 还没
发表）。

### Method 5: Common Crawl 过滤管线

OpenAI 发现 raw Common Crawl 直接训会让模型质量下降，做了三步过滤：

1. 用 logistic regression 分类器学「WebText 像 vs 不像」，分数低的丢
2. fuzzy 去重（MinHash LSH），跨文档去重
3. 把 benchmark 数据集（如 SuperGLUE / TriviaQA）中泄漏到 Common Crawl 的部分
   尽量剔除（这一步后来被发现做得不够干净，论文 §4 自己也承认有 contamination）

### Method 6: Adam + cosine + warmup

- Adam，β1=0.9, β2=0.95, eps=1e-8
- gradient clipping at 1.0
- cosine decay LR 到 10% 峰值
- warmup 头 375M token
- weight decay 0.1
- batch size 从 32k token 线性 ramp 到 3.2M token（动态 batching）

## Section 3: 评估范式

### Method 7: 24 个任务分组

GPT-3 在 24 个 NLP 任务上跑 zero/one/few-shot：

| 类别 | 代表任务 |
|------|---------|
| 语言模型 | LAMBADA、HellaSwag、StoryCloze |
| 闭卷 QA | TriviaQA、WebQuestions、Natural Questions |
| 翻译 | WMT En-Fr / En-De / En-Ro 双向 |
| Winograd 风格 | Winograd、Winogrande |
| 常识推理 | PIQA、ARC、OpenBookQA |
| 阅读理解 | CoQA、DROP、QuAC、SQuADv2、RACE |
| SuperGLUE | BoolQ、CB、COPA、RTE、WiC、WSC、MultiRC、ReCoRD |
| NLI | RTE、ANLI |
| 完形填空 | LAMBADA |
| 综合 | 数字加法、单词扰动、SAT 类比、新闻文章生成 |

### Method 8: prompt 模板与采样

每个任务用一份固定的 prompt 模板。例如 TriviaQA：

```text
Q: <question>
A: <answer>

Q: <question>
A: <answer>

Q: <test question>
A:
```

few-shot 时 K 个 (Q, A) 在前；one-shot 时 K=1；zero-shot 时只剩任务描述（很多
任务直接没描述，靠 prompt 格式暗示任务）。

采样：开放生成任务用 temperature=1.0 + nucleus sampling（top-p=0.9）；多选任
务用 likelihood scoring（每个候选答案算 conditional log-prob，选最高的）。

![GPT-3 scaling curve](/papers/gpt-3/01-scaling-curve.webp)

> **Figure 1**: GPT-3 模型规模（横轴 log）vs zero/one/few-shot 平均准确率（纵轴）。
> 三条曲线：绿色 zero-shot、橙色 one-shot、蓝色 few-shot。175B 处三条曲线之间出
> 现明显 gap——这是 in-context learning「因规模而出现」的关键证据。

![In-context learning prompt formats](/papers/gpt-3/02-in-context-learning.webp)

> **Figure 2**: 三种 prompt 形式的字面对照。注意：模型权重在三种模式下完全相同，
> 唯一变化是 prompt 里塞几个示例。这就是「in-context learning happens in the
> forward pass」的字面意思。

## Section 4: 关键 Findings

### Finding 1: 规模效应是普遍的

24 个任务里，175B > 13B > 6.7B > ... 这个序关系几乎在所有任务上都成立。Figure 3.1
（论文版）按任务画 8 条曲线，几乎都单调上升。例外只有 ANLI / WiC / 部分常识推理任
务，曲线接近平台。

### Finding 2: few-shot > one-shot > zero-shot 是规模相关的

小模型（< 2B）上，三种 shot 的差距很小——few-shot 给不了什么帮助。模型越大，三种
shot 的 gap 越大。这是论文最 striking 的图，也被后来归类为「in-context learning
是 emergent ability」的早期证据。

### Finding 3: emergent abilities 初现

部分任务（如 3-digit arithmetic、单词解码、SAT analogies），13B 以下模型几乎是
随机水平，到 175B 突然跳到 50%+ 准确率。Figure 3.10 那张「3-digit addition」曲
线后来被 Wei et al. 2022 emergent abilities 论文反复引用。

> 怀疑：「emergent abilities」是真现象还是评估指标问题？Schaeffer et al. 2023
> （NeurIPS 2023 best paper）质疑：当用 exact match（不连续指标）评估时，模型从
> 0% → 50% 看起来像跳跃；但用 token edit distance（连续指标）评估时，曲线是平滑
> 上升的。换句话说，emergent 可能是「人类选指标不连续」造成的人为 artifact。GPT-3
> 论文当年的 emergent 叙事是不是过度营销？我自己倾向认为：现象是真的，但没那么
> 「魔法」——更多是 Skill compositionality 在某个 capacity 阈值后才稳定可用，不是
> 物理意义上的相变。

### Finding 4: Few-shot 在某些任务上接近 finetune SOTA

最 strong 的几个任务：

- **LAMBADA**（last word prediction）：few-shot 86.4%，已超过 finetune SOTA
- **TriviaQA**（闭卷 QA）：few-shot 71.2%，接近 open-domain SOTA（带检索）
- **PIQA**（物理常识）：few-shot 82.8%，仅次于 finetune SOTA 84.4%
- **HellaSwag**：few-shot 79.3%，与 finetune RoBERTa 83% 差距 < 4 点

但在另一些任务上 finetune 仍碾压：

- **SuperGLUE 整体**：few-shot 71.8% vs finetune SOTA 89.0%（gap 17 点）
- **ANLI R3**（对抗 NLI）：few-shot 40.2% vs finetune RoBERTa 53%
- **WiC**（词义消歧）：few-shot 49.4%，接近随机

### Finding 5: 翻译方向不对称

英→其他语言（En-Fr、En-De、En-Ro）的 BLEU 比反向（Fr-En 等）低很多。原因：训练
语料 93% 是英文，模型「输出英文」远比「输出法文」熟练。这与 finetune 模型可以专
门做某方向是相反的。

### Finding 6: 算术泛化的 size threshold

| 任务 | 13B | 175B |
|------|-----|------|
| 2-digit addition | 100% | 100% |
| 3-digit addition | 25% | 80% |
| 4-digit addition | 5% | 25% |
| 5-digit addition | < 1% | < 10% |

可见 175B 把 2-3 位加法学得很好，4-5 位仍翻车。论文承认这是「字符级表征」+
「sub-word tokenizer」的副作用——5-digit number 可能被 BPE 切成奇怪的 subword。
这个观察直到 2023 年 Llama 2 数学 finetune 才被部分解决。

## Section 5: Limitations（论文 §6）

GPT-3 论文有罕见的「认真讨论自己缺点」的 §6，列了 6-7 条：

### Limitation 1: 推理成本

175B 单次前向需 ~ 350 GB 内存（fp16），即使 8×A100 也撑不住，需要 8×80GB A100 +
张量并行。论文承认「we expect that broad deployment of models like GPT-3 will
require novel architectural and engineering work」。这后来催生了量化（INT8 /
INT4）、KV cache、speculative decoding 等一整套推理优化产业。

### Limitation 2: 文本限定，单 modality

GPT-3 没视觉、没音频、没 embodied 输入。论文明确说「we expect future models to
benefit from multi-modal training」。这预言被 GPT-4 / Gemini / Claude 3 / LLaVA
全部兑现。

### Limitation 3: Training 数据来源不透明

OpenAI 没公开 Common Crawl 过滤管线的细节，外人无法精确复现 175B。社区花两年
（GPT-NeoX-20B / Pythia / LLaMA）才把开源端追上，且永远无法验证 OpenAI 的
"WebText2" 到底是什么。

### Limitation 4: 偏差与安全

论文 §6.2 / §6.3 自己跑了 toxicity / bias 评估：

- 性别 bias：医生 / 工程师 / CEO 默认补男性；护士 / 接待员 / 助理默认补女性
- 种族 bias：白人词共现 valence 显著高于其他族群
- 宗教 bias：穆斯林词高频共现 violent / terrorist 等词

论文承认「the internet is not a neutral data source」，这是后来 RLHF / Constitutional
AI / safety alignment 全套技术的起点。

### Limitation 5: Sample efficiency 仍远低于人类

人类小孩看 100 个字就能学会一种语言现象，GPT-3 训练读了 5000 亿 token 才达到
当前水平。这个 sample efficiency 鸿沟到 2026 年仍未解决。

### Limitation 6: 缺乏在线学习

GPT-3 训练完之后权重就冻住了，无法增量更新。一个事实在 2020 之后变化（如总统是
谁），GPT-3 永远不知道。这个限制催生了 RAG、tool use、frequent re-training 等替
代方案。

> 怀疑：GPT-3 context window 2048 让 few-shot 例子非常有限——长任务（如 100+ 行
> 代码补全、长对话）根本塞不下足够示例。RAG / long context（GPT-4 32K / Claude
> 200K）后来突破，但 GPT-3 时代 prompt engineering 受这个限制严重。如果当时
> OpenAI 把 context 推到 8K，prompt engineering 学科会不会少走 1-2 年弯路？

## Section 6: 工程与系统细节

### Method 9: 数据并行 + 模型并行 + pipeline 并行混合

175B 单卡塞不下，必须切分。OpenAI 用 V100 集群（具体卡数未公布，外推估 1024-
10000 张），混合三种并行：

- **数据并行**：每个并行组复制一份模型，处理不同 minibatch
- **张量并行（Megatron-LM 风格）**：把单层的 weight 矩阵按列 / 按行切到多卡
- **流水线并行**：把 96 层切成 N 段，每段塞在不同卡上，按 pipeline schedule 调度

OpenAI 自己没开源训练框架，但同期 Megatron-LM（NVIDIA）和 DeepSpeed（Microsoft）
公开了等价路径。

### Method 10: bfloat16 / fp16 mixed precision

激活和大部分 matmul 用 fp16，权重 master copy 保留 fp32。loss scaling 防止梯度
underflow。这套 mixed precision 是 V100 时代的标配。

### Method 11: gradient checkpoint（activation recompute）

96 层 × 12288 d_model × 2048 ctx 的激活根本存不下，OpenAI 用 activation
checkpointing：前向时只存一部分层的激活，反向需要时重新前向计算。代价是
forward 计算量翻倍，换来内存大降。

## Section 7: 实证有意思的细枝末节

### 1. 新闻文章人类区分实验

论文 §3.9.4：让人类区分「GPT-3 175B 写的新闻」vs「真人记者写的新闻」。结果：
人类正确率 52%（接近随机 50%）。换句话说，175B 在短新闻文体上已经骗过人类。
这是 ChatGPT 引发后来 misinformation 担忧的早期证据。

### 2. 数据集 contamination 自查

论文 §4 罕见地公开 audit 自己的训练数据是否泄漏了 benchmark 测试集。结果发现
LAMBADA / HellaSwag 等任务有 1-13% 的样本疑似在训练集出现过。OpenAI 在论文
里展示了「去除可疑样本后的 clean score」，对部分任务影响 <1 点。这种坦诚自查
后来被许多 LLM 论文跟进（但很多没那么严格）。

### 3. SAT 类比题接近大学水平

GPT-3 175B 在 SAT analogies 上 65.2%，论文报告这超过美国大学申请者的平均水平
（57%）。这是「大模型有 abstract reasoning」的早期信号。

### 4. word scrambling

任务：A1 把字母顺序打乱的单词还原。GPT-3 175B 在 cycle letters 任务上 38.6%
准确率，13B 模型只有 1.4%。这是典型的 emergent ability——小模型完全做不到。

## Section 8: 后续发展（GPT-3 → 现代 LLM）

GPT-3 之后的演化路线：

### InstructGPT (2022-03)

OpenAI 把 GPT-3 用 RLHF（Reinforcement Learning from Human Feedback）微调成
「能听懂指令」的版本。三阶段：

1. SFT：用人写的 prompt-response 对 finetune GPT-3
2. RM：训一个 reward model 给输出打分
3. PPO：用 RM 作为 reward，PPO 优化 GPT-3 输出

详见 [[instructgpt]]。InstructGPT-1.3B 在用户偏好上击败了 GPT-3-175B，第一次
证明「对齐 > 规模」在用户体验上的胜出。

### ChatGPT (2022-11)

InstructGPT 加了对话格式 finetune，公开发布。5 天破百万用户、2 个月破 1 亿，是
人类史上增长最快的消费产品。

### GPT-4 (2023-03)

multimodal（吃图片），上下文 32K，推理 / 代码 / 数学全面提升。论文不公开架构细
节，但社区推断为 MoE（Mixture of Experts，~8×220B 总参数 1.76T）。

### Open-source 复现

社区花了 2-3 年才追上 GPT-3 175B 水平：

- **EleutherAI GPT-Neo / GPT-J / GPT-NeoX-20B**（2021-2022）：开源端第一波
- **Meta OPT-175B**（2022-05）：第一个开源 175B 规模 decoder-only
- **BLOOM-176B**（2022-07）：BigScience 多语言开源
- **Meta LLaMA 1**（2023-02）：65B 但训了 1.4T token，性能接近 GPT-3 175B
- **LLaMA 2**（2023-07）：商用 license，70B 公开
- **Claude / Gemini / Qwen / DeepSeek**（2023+）：闭源 + 开源并行

### Scaling laws 修正

- **Kaplan 2020**：参数 N 与计算 C 的最优分配，建议 large N + 短训
- **Chinchilla 2022**：重新做实验发现 N 与 D（数据 token）应当 1:20 比例同步放
  大，GPT-3 这种「N 大 D 小」其实 undertrained。详见 [[chinchilla]]

### 推理优化产业链

- **Flash Attention**（Dao et al. 2022）：把 attention 显存从 O(N²) 降到 O(N)，
  详见 [[flash-attention]]
- **vLLM / PagedAttention**（2023）：KV cache 分页管理，吞吐 ×24
- **量化（GPTQ / AWQ / INT4）**：175B 模型从 350GB → 90GB 部署
- **speculative decoding**：小模型猜大模型，吞吐 ×2-3

### 哲学层面：「scaling is all you need」

GPT-3 论文之后，业界出现一个口号：「Scale is the bitter lesson's last word」。
意思是：与其设计聪明架构 / 算法，不如多投 GPU 训更大模型。这种哲学在 2020-2023
极具说服力，但在 2023 年之后开始被 Chinchilla / DeepSeek-V3 / o1 / Reasoning
trace 修正——纯堆参数已不再是单调上升路径。

> 怀疑：「scaling is all you need」叙事是不是被 GPT-3 一篇论文带偏了？回头看
> 2020-2022 业界把绝大部分计算预算砸在「再大 10×」上，2022 年 Chinchilla 出来
> 才发现「数据 token 数其实更紧要」。再到 2024 年 o1 / Reasoning model 出来，
> 大家发现「inference-time compute（推理时算力）」也是另一个独立维度。GPT-3 太
> 成功，可能让一代研究者忽略了多维 scaling space 中的其他方向。

## 参考实现链接（GitHub permalinks）

GPT-3 本体闭源，但社区有多份高质量复现 / 风格相同的开源实现，下面三个 permalink
是常被研读的代码（hash 标"链接示意"，复习时可贴最新 commit）：

- karpathy/nanoGPT，简洁 GPT 训练 / 推理样板：
  `https://github.com/karpathy/nanoGPT/blob/093a7e5f6c0c8b2c8e1c2c2f3a4b5c6d7e8f9a0b/model.py`
- EleutherAI/gpt-neo，第一波开源 GPT-3 风格复现：
  `https://github.com/EleutherAI/gpt-neo/blob/3c1d2c4f8e1d6a7b9c0d2e4f6a8b1c3d5e7f9a0b/models/gpt2/gpt2.py`
- meta-llama/llama，LLaMA 1/2 受 GPT-3 启发的开源 decoder：
  `https://github.com/meta-llama/llama/blob/57b0eb62de0636e75af471e49e2f1862d908d9d8/llama/model.py`

这三个仓库覆盖了「最简实现 / 中等开源训练 / 工业级开源」三个层级。读 GPT-3 想理
解架构细节，强烈建议先读 nanoGPT 的 ~300 行 model.py，再去看 LLaMA 的工业实现。

## 学到什么

### 1. Decoder-only 路线胜出的偶然与必然

2018-2020 年 NLP 领域有三种主流架构：encoder-only（BERT）、encoder-decoder（T5）、
decoder-only（GPT）。GPT-3 之后的事实是 decoder-only 接近一统天下。原因不是
decoder-only 在所有任务上最强，而是：

- 训练目标（next token prediction）与生成任务天然对齐
- 一个目标可以覆盖所有任务（生成、分类、QA、翻译都能 cast 成生成）
- in-context learning 这种「meta task」只有 decoder 能优雅承载
- 推理时 KV cache 让 decoder-only 的 sequential 推理工程上可优化

这是一个「目标函数简单 + 接口统一」战胜「架构精巧」的案例。

### 2. In-context learning 是「meta-learning in the forward pass」

这是论文最深的哲学贡献。BERT 时代每个任务训一个 head，T5 时代每个任务用 prompt
但仍要 finetune；GPT-3 第一次说「连 finetune 都不用，把 examples 塞 prompt 里就
行」。这把「学习」从优化器层面移到了 attention 层面——这是后来 chain-of-thought /
ReAct / agent 等 prompt 范式的根。

### 3. Emergent abilities 是真实但不神秘

从「3-digit addition」「word unscrambling」「SAT analogies」等任务看，模型在某
个规模阈值后突然能做某些事。但这不是物理相变，更像是「skill 组件在足够 capacity
后稳定可调用」。理解这个有助于在工程上设计 prompt（更小模型上的失败可能不是 prompt
不对，而是模型不够大）。

### 4. Scaling 不是单维度

GPT-3 之后大家以为「params ↑ 万事大吉」，Chinchilla 修正了「应该 params + tokens
1:20 同时 ↑」，o1 又开了「inference-time compute ↑」第三维。要建立多维 scaling 直
觉，不能只看一篇论文的 scaling 图。

### 5. OpenAI 的产品化思路

GPT-3 论文 + API 上线是 OpenAI 转型「从研究机构到 SaaS 公司」的关键节点。论文
里那张 scaling curve 不仅是科学叙事，也是商业叙事——「越大越好，所以付费用 175B
版本最值」。这种把研究论文 + 产品定价一同设计的做法是 LLM 时代的新常态。

## 关联

- [[attention]]：Transformer 是 GPT-3 的基础架构
- [[bert]]：双向预训练同期工作，与 GPT 路线对照
- [[scaling-laws]]：GPT-3 模型族就是按 Kaplan scaling laws 设计的
- [[chinchilla]]：GPT-3 是 undertrained 的，Chinchilla 修正了 N/D 比例
- [[instructgpt]]：GPT-3 → ChatGPT 路上的 RLHF 步骤
- [[flash-attention]]：让 GPT-3 后代模型推理 / 训练显存 ×4 优化
- [[clip]] / [[vit]]：multimodal 路线，GPT-4 视觉能力的前置工作
- [[mamba]]：post-Transformer 路线，挑战 attention 二次复杂度

## 实践建议（如果今天读 GPT-3 论文）

1. **不要只读 §3 跳过 §6**：§6 limitations 是 GPT-3 论文最有诚意的一节，几乎所
   有后续 LLM 改进都在攻这里列的某条。
2. **重点看 Figure 3.1 / 3.2 / 3.10 / 4.2**：这四张图分别讲规模效应 / few-shot
   gap / emergent abilities / contamination audit，是论文核心证据。
3. **跳过附录的具体任务表**，除非你做某个特定 NLP 任务。
4. **先读 GPT-2 论文再读 GPT-3**：GPT-3 大量 architecture 细节默认读者读过 GPT-2，
   单独读 GPT-3 会觉得「这部分怎么没写」。
5. **配 nanoGPT 代码读**：250 行 model.py 把 GPT 架构讲得比论文清楚 10 倍。

## 时间线回顾（GPT-3 这一年发生了什么）

- 2020-01: Kaplan scaling laws 论文挂 arXiv
- 2020-05-28: GPT-3 论文挂 arXiv，立刻引爆 AI 社区
- 2020-06-11: OpenAI API（GPT-3）closed beta，第一批开发者拿到 davinci 模型
- 2020-09: 学术界开始大规模复现尝试，EleutherAI 启动 GPT-Neo 项目
- 2020-12: GPT-3 拿到 NeurIPS 2020 Best Paper Award
- 2021-03: Codex 论文（GPT-3 在 GitHub 代码上 finetune）发布
- 2021-08: GitHub Copilot 公开预览（基于 Codex）
- 2022-03: InstructGPT 论文（RLHF 应用到 GPT-3）
- 2022-11-30: ChatGPT 公开发布
- 2023-03-14: GPT-4 发布
- 2023-07: LLaMA 2 开源，开源端正式追上 GPT-3 水平

把这条时间线放在心上：从一篇论文到一个改变互联网的产品，OpenAI 走了 30 个月。

## 一句话再总结

GPT-3 是「decoder-only Transformer + 175B + 海量数据 + in-context learning」这
四个要素第一次合体的工业级证据，它给 LLM 时代写下三条公理：

1. **Scale 是路径**：参数 + 数据 + 计算同步放大，能力会以非线性方式涌现
2. **Generation 是接口**：所有 NLP 任务都可以 cast 成「条件文本生成」
3. **Prompt 是新接口语言**：finetune 不再是唯一适配方式，prompt engineering 成
   为新学科

这三条公理在 2026 年仍然主导 LLM 工程实践。GPT-3 论文也因此成为「读过的人都觉
得在写未来」的少数论文之一。
