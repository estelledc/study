---
title: REALM — 把检索器和 BERT 一起预训练的第一篇论文
来源: 'Guu et al. "REALM: Retrieval-Augmented Language Model Pre-Training". ICML 2020'
日期: 2026-05-30
分类: 自然语言处理
难度: 中级
---

## 是什么

REALM 是一种**让语言模型在被预训练的时候，自己学会"打开 Wikipedia 翻一翻"的方法**。日常类比：以前的 BERT 像一个闭卷考试的学霸——把所有知识硬背进脑子；REALM 给学霸配一本字典，并且**字典翻得好不好这件事也算分**，学霸为了考高分会努力学怎么用字典。

具体说，预训练时随机把句子里的实体或日期挖空（mask）。模型先把整句话编码成一个查询向量，去 13M 个 Wikipedia 段落里捞 top-8 个最相关的，再把段落和原句拼一起送进 reader，让它预测被挖掉的词。loss 同时反传给"捞段落的人"和"做填空的人"。

这是 2020 年所有 RAG 系统的祖宗形态。今天你用的 chroma + 大模型流水线，把"先检索再生成"当成天经地义的事；但在 2020 年，让检索器接受预测 loss 的梯度本身是一个尚未被证明可行的想法。

REALM 在三个 open-domain QA 数据集（NaturalQuestions / WebQuestions / CuratedTREC）上同时刷到当时 SOTA：NQ 上 Wikipedia 设定 39.2%、CC-News 设定 40.4%，相对 T5-11B 闭卷 34.5% 大约高 5–6 个点，相对 ORQA 33.3% 大约高 6–7 个点；参数约 330M，比 T5-11B 小约 30 倍。

## 为什么重要

- 不理解 REALM，没法解释为什么后来的 RAG / Atlas / RETRO 都长一个样
- 不理解 marginalize loss，没法看懂"检索器为什么能学到东西"——它的训练信号不来自人工标注
- 不理解异步索引刷新，没法做生产级向量库——索引在变、模型权重也在变，怎么对齐
- 不理解 ICT 预初始化为什么是必需的，会以为"随机初始化的检索器训得动"，浪费几个月
- 不理解 salient span masking（只挖实体/日期）为什么在开发集上比随机 mask 多拉约 6 个 EM 点——随机挖 "the / is" 不需要 retrieve 也能填，训练信号被稀释

## 核心要点

REALM 的训练动力学可以拆成 **三件事**：

1. **挖空 + 检索 + 拼回去**：从 Wikipedia 抽一句，用 BERT 实体标注器（CoNLL-2003）+ 日期正则找到要挖的 span；用 BERT 把整句投影成检索向量，经 MIPS（最大内积搜索）索引捞 top-k；把每个候选段落和原句拼起来送 reader。类比：阅读理解题给你几段参考材料，让你都试一遍。

2. **marginalize 反传**（对检索结果求加权和）：核心公式 log p(y|x) = log sum_z p(y|x,z) p(z|x)。权重是检索器给的概率。预训练时对含 null 文档在内的 8 个候选求边际；微调推理常用 top-5。**没人标注哪个段落相关**——预测准不准就是答案。

3. **ICT 预初始化 + 异步索引刷新**：检索器随机起步会冷启动失败（捞到的全是噪音，reader 学会忽略检索）。先用 Inverse Cloze Task（ICT：给一句，找回它所在段落）热身。13M 段落每步重 embed 不可能——旁路 job 约每 500 步刷一次 MIPS 索引。

4. **salient span masking**：不随机挖 15% token，而是只挖命名实体和日期这类"必须查外部知识才能填"的 span，把真正需要 retrieve 的信号留给联合训练。

## 实践案例

### 案例 1：用 HuggingFace 跑一个 OpenQA demo

原始 TF1 + ScaNN + TPU 的 pretrain 已无法复现。HuggingFace 曾移植 inference（`transformers` v4.41+ 已移除 REALM 类，需钉旧版）。

1. **装模型**：下载 `google/realm-orqa-nq-openqa` 的 tokenizer / retriever / reader。
2. **编码问题**：把问句变成 `input_ids`。
3. **前向**：retriever 捞段落，reader 在段落里抽答案 span。
4. **解码**：`predicted_answer_ids` 是答案 token，decode 成字符串。

```python
from transformers import RealmTokenizer, RealmForOpenQA, RealmRetriever
tokenizer = RealmTokenizer.from_pretrained("google/realm-orqa-nq-openqa")
retriever = RealmRetriever.from_pretrained("google/realm-orqa-nq-openqa")
model = RealmForOpenQA.from_pretrained(
    "google/realm-orqa-nq-openqa", retriever=retriever
)
enc = tokenizer(["Who wrote 'Pride and Prejudice'?"], return_tensors="pt")
out = model(input_ids=enc.input_ids, return_dict=True)
print(tokenizer.decode(out.predicted_answer_ids))  # jane austen
```

### 案例 2：marginalize 思想搬到自己的检索系统

如果你做"先检索证据再生成答案"的工具，可以把"答案对不对"的 loss 反传给检索器：让 8 个候选证据都送一次 generator，loss 按 sum_z p(answer|z) p(z|query) 算。这样检索器会自动学"哪些证据真的支持了正确答案"——不用人工标注证据。

```python
# 简化版 marginalize loss（伪代码）
retrieval_logits = query_emb @ candidate_embs.T          # [B, k]
candidate_log_probs = log_softmax(retrieval_logits)       # log p(z|x)
gold_log_probs = generator(x_repeat_k, z_top_k, gold_y)   # log p(y|x,z)
joint = candidate_log_probs + gold_log_probs              # log p(y,z|x)
loss = -logsumexp(joint, axis=1).mean()                   # marginal NLL
```

工程坑：generator 必须能接收 batch_size × k 的输入；softmax 只在 top-k 上归一化，不是全集，要小心冷启动给的梯度方向是错的。

### 案例 3：异步索引刷新模式

任何"模型在变 + 索引要更新"的系统都能套这个三目录状态机：

- `staging/`：刷新 job 在算
- `temp/`：算完写一半的中间状态
- `live/`：trainer 或 serving 在读

```bash
# 刷新 job 的伪代码骨架
while true; do
  new_ckpt=$(latest_embedder_ckpt)
  [ "$new_ckpt" = "$last_ckpt" ] && sleep 60 && continue
  embed_all_docs $new_ckpt > staging/encoded.npy
  mv staging/encoded.npy temp/encoded.npy   # 中间态
  mv temp live_new && mv live old && mv live_new live
  last_ckpt=$new_ckpt
done
```

读端永远看到完整索引，不会读到一半被覆盖（POSIX rename 是原子的）。监控一个 `index_age_min` 指标——索引和最新 embedder 差多久。

## 踩过的坑

1. **检索器随机初始化训不动**：必须先 ICT 热身。论文明确写了冷启动恶性循环——检索差 → reader 忽略文档 → 检索器拿不到有效梯度。**ICT 不是 minor warmup，是必需品**。

2. **softmax 只在 top-k 上归一化不是 13M 全集**：训练初期正确段落常不在 top-k。marginalize 可能只在错的候选里争相对好坏。论文没给冷启动诊断曲线。

3. **异步刷新约每 500 步是经验值**：Table 2 里把 MIPS 刷新拖慢 30×，开发集 EM 从 38.2 掉到 28.7。改成 100 或 5000 步会怎样，论文没做完整 sensitivity。

4. **null document 是空文档兜底**：top-k 里塞 ∅，检索没用时把信用分给它。论文没给 null 选中频率——它是否真起 fallback 作用，读者只能自己猜。

## 适用 vs 不适用场景

**适用**：

- 学术理解 RAG 算法的源头——读这一篇等于读 Atlas / RETRO / Self-RAG 的祖宗
- 构造可微检索系统的灵感来源——marginalize 公式可以直接抄
- 异步索引刷新工程模式——任何向量库 + 模型联合更新的场景都能套

**不适用**：

- 复现原始 pretrain——TF1 / ScaNN / TPU v3-256 / GCS bucket 全部退役
- 现代生产 RAG——工业界已普遍采用 frozen 检索器 + frozen 大模型 + prompt 路线
- 多步推理或 multi-hop 检索——REALM 只在 single-hop open-domain QA 上验证过
- 依赖实体/日期抽取的训练信号——标注器漏掉的 span 永远进不了 salient mask，长尾实体尤其吃亏

## 历史小故事（可跳过）

- **2017 年**：Chen et al. 发表 DrQA——TF-IDF/BM25 检索 + BiLSTM reader，检索器完全固定
- **2019 年**：Lee et al. 发表 ORQA——检索器在 finetune 阶段才更新，提出 ICT。NQ 33.3% EM
- **2020-02**：Guu 等上传 REALM（ICML 2020）——第一次让检索器在 pretrain 也吃梯度。NQ 39.2% EM
- **2020-05**：Lewis et al. 上传 RAG——同期姊妹篇，BART seq2seq + DPR 检索器
- **2021–2022**：Borgeaud 等提出 RETRO（2021 arXiv / ICML 2022），每层接检索；Atlas（2022）把联合检索搬到 T5+FiD
- **2023 年起**：工业 RAG 多走 frozen 检索器 + frozen 大模型 + prompt——chroma / LangChain / LlamaIndex 不做联合训练

REALM 和 RAG 是 retrieval-augmented LM 的双子星，分别走 BERT MLM 和 BART seq2seq 的对偶路线。两篇相隔 3 个月发表，引用网络至今高度耦合。

## 学到什么

1. **检索可以端到端联合训练**——不需要人工标注哪个文档相关，预测准不准就是答案
2. **冷启动是检索类系统的死亡谷**——必须有一个独立的预训练任务（ICT / 对比学习）让检索器先暖身
3. **工程 trick 决定算法能否跑通**——异步索引刷新这个细节论文只用 1 段话交代，但没它整个 pipeline 跑不起来
4. **算法 niche 化是常态**——REALM 的核心创新在 2026 工业界已被放弃（frozen + prompt 路线赢了），但思想活在所有继承者里

## 延伸阅读

- 论文 PDF：[arxiv.org/abs/2002.08909](https://arxiv.org/abs/2002.08909)（重点看 Section 3 与 Table 1/2）
- 视频讲解：[Yannic Kilcher — REALM Paper Explained](https://www.youtube.com/watch?v=F1naDPJpdY0)（45 分钟把架构和 marginalize 公式讲一遍）
- HuggingFace 实现：[transformers v4.40 RealmForOpenQA](https://huggingface.co/docs/transformers/v4.40.0/en/model_doc/realm)（v4.41+ 已删除）
- [[rag-lewis-2020]] —— 同期姊妹篇，走 BART seq2seq 路线
- [[bert]] —— REALM 的 reader 和 retriever 都是 BERT-base

## 关联

- [[bert]] —— REALM 把它当 backbone，retriever 和 reader 都是 BERT-base
- [[attention]] —— marginalize 在数学上等价于 attention 的加权求和形式
- [[rag-lewis-2020]] —— 2020 年同期对偶版，BART seq2seq 取代 BERT MLM
- [[retro]] —— DeepMind 的激进继承者，每一层都接检索
- [[chroma]] —— 现代向量库，REALM 异步刷新模式的工程后裔
- [[langchain]] —— 工业 RAG 框架，走 frozen 检索器路线
- [[t5]] —— REALM 的纯参数派对手，NQ 上被拉开约 5–6 个 EM 点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chroma]] —— Chroma — Python 优先的向量数据库
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基
- [[retro]] —— RETRO — DeepMind 的检索增强 LLM
- [[t5]] —— T5 — Text-to-Text Transfer Transformer

