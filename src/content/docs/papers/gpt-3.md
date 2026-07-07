---
title: GPT-3 — Language Models are Few-Shot Learners
来源: 'Brown et al., "Language Models are Few-Shot Learners", NeurIPS 2020'
日期: 2026-05-29
分类: NLP
难度: 中级
---

## 是什么

GPT-3 是 OpenAI 2020 年训出来的一个**特别大的语言模型**——1750 亿参数（175B），比上一代 GPT-2 大了整整 100 倍。

它最关键的发现：**当模型大到一定程度后，给它看几个例子就能做新任务，根本不用专门微调**。

日常类比：

- 以前的学生（[[bert]] 路线）——每碰到一门新课都得重写一份笔记。学翻译训一次，学问答训一次，学摘要又训一次。每次都要老师批改大量作业。
- GPT-3 这种学生——脑子里已经读完了几亿本书，老师不再批改作业，只在题目前面贴 1-100 道带答案的例题。学生看完例题，立刻在新题上作答。**笔记本（模型权重）一个字没改。**

这种"看几个例子就会"的能力，论文里叫 **few-shot in-context learning**（上下文学习），是 ChatGPT / Claude / Gemini 这一代 LLM 的起点。

## 为什么重要

不理解 GPT-3 的影响，下面这些事都没法解释：

- 为什么 ChatGPT 2022 年发布后 5 天破百万、2 个月破亿——它的底子（GPT-3.5）就是 GPT-3 的微调版
- 为什么 2020 年之后所有大模型都在比"谁参数多"——GPT-3 第一个证明了"够大就能涌现新能力"
- 为什么"prompt engineering"（写提示词）成了一门新学问——few-shot 例子怎么放、放几个、放什么顺序，都会影响结果
- 为什么 [[scaling-laws]] 那篇论文被反复引用——GPT-3 就是它最早的实证案例
- 为什么 OpenAI 从研究机构变成了 SaaS 公司——GPT-3 API 上线（2020-06）是分水岭

## 核心要点

GPT-3 把三件事推到极致：

1. **参数量 100 倍跳跃**：GPT-2 只有 1.5B 参数，GPT-3 直接 175B。这个"100x"不是随手定的，是按 Kaplan scaling laws 排出来的最优规模。
2. **训练数据 3000 亿 token**：Common Crawl（互联网爬虫数据，过滤后 410B token）+ WebText2（高质量网页）+ 两本书库 + Wikipedia 一锅炖，总共约 300B token 用来训。
3. **三种推理范式**：

   | 模式 | 例子数量 | prompt 形式 |
   |------|---------|------------|
   | zero-shot | 0 | "把英文翻译成法文：hello → ?" |
   | one-shot | 1 | "...：hello → bonjour. cat → ?" |
   | few-shot | 10-100 | "...：hello → bonjour. cat → chat. dog → ?" |

   三种模式下**模型权重完全相同**，唯一变化是 prompt 里塞几个示例。

## 实践案例

### 案例 1：Few-shot 翻译

你给 GPT-3 这样一段 prompt：

```text
English: hello, French: bonjour.
English: cat, French: chat.
English: dog, French: ?
```

GPT-3 输出 `chien`。它没专门学过英法翻译，只看了两个例子就会了。

### 案例 2：Few-shot 算术

```text
Q: 25 + 13 = ? A: 38.
Q: 47 + 19 = ? A:
```

GPT-3 会补完 `66`。两位数加法对它来说几乎 100% 准确。**但 4 位以上加法就开始翻车**——这是 BPE tokenizer 的副作用，长数字被切成奇怪的子词。

### 案例 3：Few-shot 代码生成

```text
# 写一个函数：判断一个数是否是质数
def is_prime(n):
```

GPT-3 能补出像样的实现。这条路径直接启发了后来的 Codex 和 GitHub Copilot。

### 案例 4：Few-shot 文本分类

```text
评论：这家餐厅味道很赞 → 正面
评论：等了一小时还没上菜 → 负面
评论：服务员态度真好 → ?
```

GPT-3 输出 `正面`。同一个模型，换个 prompt 就能做翻译 / 算术 / 分类——这就是"生成是统一接口"的字面意思。

## 踩过的坑

1. **推理成本极高**：175B 单次前向需要约 350GB 显存（fp16），8 张 80GB A100 才装得下。一次 API 调用几美分听着便宜，跑上百万次就是真金白银。后来催生了量化 / KV cache / speculative decoding 一整套推理优化产业。

2. **Hallucination（瞎编）严重**：原始 GPT-3 没经过 RLHF（基于人类反馈的强化学习），会一本正经地编造"看似合理但完全错"的答案。这个问题到 [[instructgpt]] 才被部分缓解。

3. **Context window 只有 2K token**：few-shot 例子加上要解的题，2048 token 一下就用光了。长任务（长代码、长对话）根本塞不下足够示例。GPT-4 把上限推到 32K，Claude 推到 200K+，才把 prompt engineering 的天花板拉开。

4. **中文不友好**：BPE tokenizer 是按英文设计的，一个中文字常被切成 2-3 个 token。同样长度的中文文本要花 2-3 倍 token 数，又贵又卡 context。中文大模型（Qwen / DeepSeek / GLM）后来重训了 tokenizer 才解决。

5. **数据集污染**：Common Crawl 里混进了不少 benchmark 测试集，导致评分虚高。论文 §4 自己 audit 了一遍，发现 LAMBADA / HellaSwag 等任务有 1-13% 样本疑似在训练集出现过。这种坦诚自查后来被许多 LLM 论文跟进（但很多没那么严格）。

## 历史小故事（可跳过）

GPT 这条路从 2018 年走到 2025 年，每一步都在加倍：

- **2018-06：GPT-1**（1.17 亿参数）——decoder-only Transformer + 无监督预训练 + 有监督微调
- **2019-02：GPT-2**（15 亿参数）——zero-shot 任务泛化第一次成立。OpenAI 一开始拒发权重，理由是"怕被滥用"，被社区嘲讽了半年才放出来
- **2020-05：GPT-3**（1750 亿参数）——本文，few-shot in-context learning 范式诞生，论文挂 arXiv 当天就引爆 AI 社区
- **2020-06：OpenAI API**——第一批开发者拿到 davinci 模型，第一次让 LLM 能买能用
- **2022-03：InstructGPT**（[[instructgpt]]）——用 RLHF 把 GPT-3 对齐到指令，"听话"的版本
- **2022-11：ChatGPT**——InstructGPT 加对话格式，公开发布。5 天百万、2 月破亿
- **2023-03：GPT-4**——多模态、32K context、推理 / 代码 / 数学全面提升
- **2025：GPT-5**——本文写的时候已经发布

GPT-3 这一篇论文引用数 30000+，是过去 6 年 AI 圈被引最频繁的论文之一。从一篇论文到一个改变互联网的产品，OpenAI 走了 30 个月。

## 学到什么

1. **Scale 是路径**：参数 + 数据 + 计算同步放大，能力会以非线性方式涌现。这是 GPT-3 最大的哲学贡献，也是 [[scaling-laws]] 的实证。
2. **生成是统一接口**：所有 NLP 任务都可以 cast 成"条件文本生成"——分类、QA、翻译、摘要全都用一种格式做。Decoder-only 路线之所以胜出，靠的是这个统一接口。
3. **Prompt 是新语言**：finetune 不再是唯一适配方式，写 prompt 成了新学科。这是后来 chain-of-thought / ReAct / agent 等技术的根。
4. **大模型 ≠ 通用智能**：GPT-3 在算术 / 词义消歧 / 对抗 NLI 等任务上仍然翻车，"够大就行"是过度营销。后来的 Chinchilla（数据要同步放大）、o1（推理时算力是新维度）一个个修正了这条叙事。
5. **理论 → 算法 → 产品**，每步隔几年。Kaplan scaling laws（2020-01）→ GPT-3 论文（2020-05）→ API 商业化（2020-06）→ ChatGPT 现象级产品（2022-11）。把研究、工程、产品当成同一条流水线，是 LLM 时代的新常态。

## 延伸阅读

- 论文 PDF：[Brown et al. 2020, arXiv:2005.14165](https://arxiv.org/abs/2005.14165)（75 页，§6 limitations 是最有诚意的一节，几乎所有后续 LLM 改进都在攻这里列的某条）
- 配 nanoGPT 读架构：[karpathy/nanoGPT](https://github.com/karpathy/nanoGPT) 的 ~300 行 model.py 把 GPT 架构讲得比论文清楚 10 倍
- 视频教程：[Andrej Karpathy — Let's build GPT from scratch](https://www.youtube.com/watch?v=kCc8FmEb1nY)（2 小时手撸一个 mini GPT，从 0 跑通）
- [[bert]] —— GPT-3 出现前的双向预训练对手
- [[instructgpt]] —— GPT-3 → ChatGPT 路上的 RLHF 步骤

## 关联

- [[attention]] —— Transformer 是 GPT-3 的基础架构
- [[bert]] —— 双向预训练同期工作，与 GPT 路线对照
- [[scaling-laws]] —— GPT-3 的 8 个模型规模就是按这个排的
- [[instructgpt]] —— GPT-3 → ChatGPT 路上的 RLHF 步骤

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adamw-2017]] —— AdamW — 把 weight decay 从梯度里拆出来
- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chatbot-arena-2024]] —— Chatbot Arena — 让真人盲投，给 LLM 排出公允座次
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[codex-2021]] —— Codex — 让 GPT 学会写 Python，并造一把尺子量它
- [[constitutional-ai]] —— Constitutional AI — Anthropic 的对齐方法
- [[dalle-2]] —— DALL-E 2 — 基于 CLIP + 扩散的图像生成
- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[dit]] —— DiT — Diffusion Transformer
- [[dpo]] —— DPO — Direct Preference Optimization
- [[dqn]] —— DQN — Deep Q-Network
- [[flan-2021]] —— FLAN — 用自然语言指令教模型学会"听话"
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[induction-heads]] —— Induction Heads — Transformer 的 in-context learning 引擎
- [[instructgpt]] —— InstructGPT — RLHF 让 LLM 听话
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[llm-int8-2022]] —— LLM.int8() — 大模型激活值里藏着几个超大异常通道
- [[maml-2017]] —— MAML — 学一个"好起点"，几步就能学会新任务
- [[mesa-optimization-2019]] —— Mesa-Optimization 2019 — 训出来的模型自己也是个优化器
- [[mixture-of-experts]] —— Mixture of Experts (MoE)
- [[mmlu-2021]] —— MMLU — 用 57 个学科的多选题考一考语言模型
- [[muzero]] —— MuZero — 不用规则也能下棋
- [[parti-2022]] —— Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基
- [[resnet]] —— ResNet — 残差连接
- [[retro]] —— RETRO — DeepMind 的检索增强 LLM
- [[roberta-2019]] —— RoBERTa — 把 BERT 重训一遍就能拿 SOTA
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律
- [[self-consistency-2022]] —— Self-Consistency — 让模型把同一道题做 40 遍再投票
- [[starcoder-2023]] —— StarCoder — 把训练数据完整公开的 15B 代码模型
- [[t0-2021]] —— T0 — 让 50 个人各写各的提示词，模型反而更会听新指令
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[tabpfn-2023]] —— TabPFN — 一秒解决小表格分类的 Transformer
- [[toolformer]] —— Toolformer — 教 LLM 自主调用 API
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
- [[vall-e-2023]] —— VALL-E — 3 秒音频样本就能克隆你的声音
- [[whisper-2022]] —— Whisper — 用 68 万小时"野生"音频教会模型听懂全世界
- [[word2vec]] —— Word2Vec — 词向量奠基
- [[xlnet-2019]] —— XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向

