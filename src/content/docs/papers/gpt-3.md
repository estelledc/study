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

```text
English: hello, French: bonjour.
English: cat, French: chat.
English: dog, French: ?
```

逐部分解释：前两行是带答案的例题（定格式）；第三行只给英文留 `?`；权重不变，变的只是 prompt。输出 `chien`——没微调英法翻译，看两个例子就会。

### 案例 2：Few-shot 算术

```text
Q: 25 + 13 = ? A: 38.
Q: 47 + 19 = ? A:
```

逐部分解释：第一行示范「题 → 答」；第二行留空让模型续写。两位数几乎满分；**4 位以上常翻车**——BPE 把长数字切成怪子词。

### 案例 3：Few-shot 代码 / 分类

```text
# 写一个函数：判断一个数是否是质数
def is_prime(n):

评论：味道很赞 → 正面
评论：等一小时没上菜 → 负面
评论：服务员态度真好 → ?
```

逐部分解释：上半段用注释+签名当开头，模型补函数体（启发 Codex/Copilot）；下半段前两行标定标签空间，第三行让模型选同类标签——同一模型换 prompt 就能切换任务。

## 适用 vs 不适用场景

**适用**：

- 快速试一个 NLP 任务、还没数据做微调——塞 5–50 个 few-shot 例子往往就够
- 需要「一个模型覆盖多任务」的原型（分类、翻译、摘要都写成生成）
- 研究 / 教学 in-context learning、prompt 顺序与示例质量
- 能接受 API 按 token 计费的产品路径

**不适用**：

- 要稳定事实问答、低幻觉——原版无 RLHF，应看 [[instructgpt]] / 更新模型
- 长文档、长对话（原版 context 仅 2K token）
- 强中文性价比场景（BPE 对中文不友好）
- 单卡本地跑 175B——显存不划算，改小模型微调或蒸馏

## 踩过的坑

1. **推理成本极高**：175B 单次前向需要约 350GB 显存（fp16），8 张 80GB A100 才装得下。一次 API 调用几美分听着便宜，跑上百万次就是真金白银。后来催生了量化 / KV cache / speculative decoding 一整套推理优化产业。

2. **Hallucination（瞎编）严重**：原始 GPT-3 没经过 RLHF（基于人类反馈的强化学习），会一本正经地编造"看似合理但完全错"的答案。这个问题到 [[instructgpt]] 才被部分缓解。

3. **Context window 只有 2K token**：few-shot 例子加上要解的题，2048 token 一下就用光了。长任务（长代码、长对话）根本塞不下足够示例。GPT-4 把上限推到 32K，Claude 推到 200K+，才把 prompt engineering 的天花板拉开。

4. **中文不友好**：BPE tokenizer 是按英文设计的，一个中文字常被切成 2-3 个 token。同样长度的中文文本要花 2-3 倍 token 数，又贵又卡 context。中文大模型（Qwen / DeepSeek / GLM）后来重训了 tokenizer 才解决。

5. **数据集污染**：Common Crawl 里混进了不少 benchmark 测试集，导致评分虚高。论文 §4 自己 audit 了一遍，发现 LAMBADA / HellaSwag 等任务有 1-13% 样本疑似在训练集出现过。这种坦诚自查后来被许多 LLM 论文跟进（但很多没那么严格）。

## 历史小故事（可跳过）

- **2018-06：GPT-1**（1.17 亿）——decoder-only + 预训练 + 微调
- **2019-02：GPT-2**（15 亿）——zero-shot 泛化成立；权重一度拒发
- **2020-05：GPT-3**（1750 亿）——本文，few-shot in-context learning；同年 6 月 API 上线
- **2022：InstructGPT → ChatGPT**——RLHF 对齐后再加对话格式，5 天破百万
- **2023–2025：GPT-4 → GPT-5**——多模态与更长 context；GPT-5 于 2025-08 发布

引用 30000+，从论文到改变互联网的产品大约 30 个月。

## 学到什么

1. **Scale 是路径**：参数 + 数据 + 计算同步放大，能力非线性涌现——也是 [[scaling-laws]] 的实证。
2. **生成是统一接口**：分类 / QA / 翻译 / 摘要都可写成条件文本生成。
3. **Prompt 是新语言**：finetune 不再唯一；chain-of-thought / ReAct / agent 都从这里长出来。
4. **大模型 ≠ 通用智能**：算术 / 对抗 NLI 仍会翻车；Chinchilla、o1 修正了「够大就行」叙事。
5. **理论 → 算法 → 产品**同流水线：Kaplan（2020-01）→ GPT-3（2020-05）→ API → ChatGPT（2022-11）。

## 延伸阅读

- 论文：[Brown et al. 2020, arXiv:2005.14165](https://arxiv.org/abs/2005.14165)（§6 limitations 最有诚意）
- 架构手撸：[karpathy/nanoGPT](https://github.com/karpathy/nanoGPT) / [Let's build GPT](https://www.youtube.com/watch?v=kCc8FmEb1nY)
- [[bert]] —— GPT-3 出现前的双向预训练对手
- [[instructgpt]] —— GPT-3 → ChatGPT 路上的 RLHF 步骤

## 关联

- [[attention]] —— Transformer 是 GPT-3 的基础架构
- [[bert]] —— 双向预训练同期工作，与 GPT 路线对照
- [[scaling-laws]] —— GPT-3 的模型规模按这个排
- [[instructgpt]] —— GPT-3 → ChatGPT 路上的 RLHF 步骤

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adamw-2017]] —— AdamW — 把 weight decay 从梯度里拆出来
- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[chain-of-thought]] —— Chain-of-Thought — 让大模型先写步骤再回答
- [[chatbot-arena-2024]] —— Chatbot Arena — 让真人盲投，给 LLM 排出公允座次
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[codex-2021]] —— Codex — 让 GPT 学会写 Python，并造一把尺子量它
- [[constitutional-ai]] —— Constitutional AI — Anthropic 的对齐方法
- [[dalle-2]] —— DALL-E 2 — 基于 CLIP + 扩散的图像生成
- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[dit]] —— DiT — Diffusion Transformer
- [[dpo]] —— DPO — Direct Preference Optimization
- [[flan-2021]] —— FLAN — 用自然语言指令教模型学会"听话"
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[flashattention-2]] —— FlashAttention-2 — 更高吞吐 Attention 的可执行优化
- [[helm-2022]] —— HELM 2022 — 给语言模型做全身体检
- [[hullft-ttft]] —— HullFT — 让测试时微调既会挑样本又省算力
- [[induction-heads]] —— Induction Heads — Transformer 的 in-context learning 引擎
- [[instructgpt]] —— InstructGPT — RLHF 让 LLM 听话
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[llm-int8-2022]] —— LLM.int8() — 大模型激活值里藏着几个超大异常通道
- [[llmsurgeon-data-mixture]] —— LLMSurgeon — 从模型回答反推训练数据配方
- [[lora]] —— LoRA — 给冻结大模型贴低秩便签
- [[maml-2017]] —— MAML — 学一个"好起点"，几步就能学会新任务
- [[papers/megatron-lm]] —— Megatron-LM — NVIDIA 大规模训练框架
- [[mesa-optimization-2019]] —— Mesa-Optimization 2019 — 训出来的模型自己也是个优化器
- [[mixture-of-experts]] —— Mixture of Experts (MoE)
- [[mmlu-2021]] —— MMLU — 用 57 个学科的多选题考一考语言模型
- [[muzero]] —— MuZero — 不用规则也能下棋
- [[parti-2022]] —— Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基
- [[papers/react]] —— ReAct — Reasoning and Acting
- [[resnet]] —— ResNet — 残差连接
- [[resolution-diagnostics-llm]] —— Resolution Diagnostics — 判断 LLM 排名差距有没有统计分辨率
- [[retro]] —— RETRO — DeepMind 的检索增强 LLM
- [[roberta-2019]] —— RoBERTa — 把 BERT 重训一遍就能拿 SOTA
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律
- [[self-consistency-2022]] —— Self-Consistency — 让模型把同一道题做 40 遍再投票
- [[starcoder-2023]] —— StarCoder — 把训练数据完整公开的 15B 代码模型
- [[t0-2021]] —— T0 — 让 50 个人各写各的提示词，模型反而更会听新指令
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[tabpfn-2023]] —— TabPFN — 一秒解决小表格分类的 Transformer
- [[toolformer]] —— Toolformer — 教 LLM 自主调用 API
- [[transformer]] —— Transformer — 让每个词一次看完整句话
- [[transformer-2017]] —— Attention Is All You Need — 用 self-attention 重写序列建模
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
- [[vall-e-2023]] —— VALL-E — 3 秒音频样本就能克隆你的声音
- [[whisper-2022]] —— Whisper — 用 68 万小时"野生"音频教会模型听懂全世界
- [[word2vec]] —— Word2Vec — 词向量奠基
- [[xlnet-2019]] —— XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向
