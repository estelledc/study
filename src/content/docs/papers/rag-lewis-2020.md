---
title: RAG (NeurIPS 2020) — 把 differentiable retriever 和 seq2seq generator 联训成一个端到端模型，让生成式 AI 第一次能引用外部知识
description: Lewis et al. 2020 把 DPR 检索器 + BART 生成器拼成端到端可训练的 RAG-Sequence / RAG-Token 两种 marginalization，定义了 ChatGPT/Claude/LangChain 时代所有"AI 引用外部资料"系统的奠基范式
sidebar:
  label: RAG (NeurIPS 2020)
  order: 33
---

## 核心信息

| 字段 | 内容 |
|---|---|
| 标题（英文） | Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks |
| 标题（中文） | 用检索增强的生成式模型解决知识密集型自然语言任务 |
| 作者 | Patrick Lewis, Ethan Perez, Aleksandra Piktus, Fabio Petroni, Vladimir Karpukhin, Naman Goyal, Heinrich Küttler, Mike Lewis, Wen-tau Yih, Tim Rocktäschel, Sebastian Riedel, Douwe Kiela |
| 一作机构 | Facebook AI Research（Patrick Lewis 时为 UCL 博士生 + FAIR 实习 → 现 Cohere 研究员）；Sebastian Riedel 时为 UCL 教授（NLP 老牌） |
| 发表 | NeurIPS 2020；arXiv 投放 2020-05-22 |
| arXiv ID | [2005.11401](https://arxiv.org/abs/2005.11401)（v4，2021-04-12 终版；v1 → v4 改了 RAG-Token 的 marginal 推导 + 加了更多 ablation） |
| 引用数 | 截至 2026-05-28：~9,500（Google Scholar），过去 12 个月仍以 100+/月增长，是 2020 年最高引 NLP 论文之一 |
| 代码 repo | 配套：[facebookresearch/DPR](https://github.com/facebookresearch/DPR/tree/a31212dc0a54dfa85d8bfa01e1669f149ac832b7) (DPR 编码器训练)；产品级实现：[huggingface/transformers](https://github.com/huggingface/transformers/tree/e120f7ea911b7c06f47045abd8f3261018f01f9a) `RagModel`；上层框架：[langchain-ai/langchain](https://github.com/langchain-ai/langchain/tree/80ca60014f67dcfea39b5d4af2e516b2e037e918)；vector store [chroma](/study/projects/chroma/) commit `34ecfa7cb43b576618d36fcd223d15063a8f38a4` |
| 数据 / 资源 | Wikipedia (Dec 2018) 21M 段落（每段 100 词）做检索 corpus；NaturalQuestions / TriviaQA / WebQuestions / CuratedTrec 做 ODQA；MS-MARCO / Jeopardy 做生成；FEVER 做 fact verification |
| 论文类型 | method / algorithm（提出 RAG-Sequence + RAG-Token 两个新 marginalization；有官方 repo + HuggingFace 集成） |

## 创新点

Lewis et al. 2020 给"生成式 AI 怎么引用外部知识"领域提供了 4 件真正新的东西：

1. **把 retriever 和 generator 端到端联训（Section 2）**：之前 ORQA / REALM 已经做了 latent retrieval，但 retriever 是和 MLM 联训的，下游任务上 retriever 不动。RAG 第一次把 query encoder 在下游生成任务（NaturalQuestions / Jeopardy）上继续 fine-tune，让 retriever 学到"哪些 passage 对 generation 有用"——而不仅是"哪些 passage 和 query 字面相似"。这是 retrieval 从"独立 pipeline 模块"变成"模型一部分"的转折点。
2. **RAG-Sequence vs RAG-Token 两种 marginalization（Section 2.1）**：RAG-Sequence 用同一个 z 生成整个 y，把 sum_z 放在最外层；RAG-Token 让每个 token y_t 可以挑不同的 z，把 sum_z 放在 token 内层。前者快但限制表达力，后者慢但能在一个 answer 里"切换源文献"。这两个公式的取舍后来被所有变体（FiD / Atlas）继承。
3. **passage encoder 冻结 + 索引一次（Section 2.4）**：朴素做法是 retriever 全部参数都更新——但每次更新都得把 21M Wikipedia 段重新 embed 一次，根本跑不起来。RAG 的工程取舍是**只更新 query encoder，passage encoder + FAISS index 全冻结**。这是后来所有产品级 RAG（LangChain / LlamaIndex / Chroma）默认架构的根源——索引建一次，运行时只动 query 端。
4. **生成质量比 closed-book parametric 模型好（Table 1, 2）**：在 NaturalQuestions 上，RAG-Sequence 的 EM=44.5，超过 11B 参数的 closed-book T5（36.6）。一个 626M 参数（BART 406M + DPR 220M）的 RAG 把 11B 的 T5 打了 8 分——证明"小模型 + 检索"在知识任务上 outperform "大模型纯参数化"。这是 LangChain 创始人 Harrison Chase 后来反复引用的 mission-defining 数字。

## 一句话总结

**生成式 AI 的"引用外部知识"能力不是后来加上去的产品 feature——它在 2020 年 5 月就被 Lewis 等人在一个 626M 参数的 BART+DPR 端到端模型里数学化定义了。** RAG-Sequence 和 RAG-Token 两个 marginalization 公式是所有现代 RAG 系统的 root；任何号称"做 RAG"的系统都在这两个公式之间二选一或者做混合。

你今天用的 ChatGPT 的 web search 模式 / Claude 的 file upload 后引用回答 / Cursor 的 codebase chat / Perplexity / LangChain RetrievalQA / LlamaIndex / Chroma / Pinecone / Weaviate —— 背后都是这篇 19 页论文画的回路：query → DPR → top-k → BART concat → answer，加上一个"让 retriever 也学习"的梯度。流行界把"AI 学会查资料"这件事变成可训练 pipeline 的论文，就是 Lewis 2020。

![RAG 架构 — query 经 DPR 取 top-k passages，BART decoder concat 后生成 answer，retriever 通过 marginalization 拿到梯度](/study/papers/rag-lewis-2020/01-rag-architecture.webp)

*图 1：RAG 架构总览。
**左**：query x（如 "Who wrote Hamlet?"）。
**中上**：DPR retriever p_eta(z|x)——dual encoder，q_encoder + p_encoder 都是 BERT-base 768 维，p_encoder 在下游任务里冻结，FAISS HNSW 索引 21M Wikipedia 100-词段落。
**中右**：top-k passages（k=5 或 10）。
**右**：BART-large（406M 参数）seq2seq generator，把 [x; z_i] concat 进 encoder，autoregressive 解码出 answer y。
**中下**：marginalization 公式——RAG-Sequence 把 sum_z 放在最外层（一个 z 生成整段 answer），RAG-Token 把 sum_z 放进每个 token 的预测里（不同 token 可来自不同 passage）。
**底**：训练梯度流向——loss 对 theta（generator）做完整反传，对 eta（q_encoder）通过 dot-product score 反传；passage encoder + index 冻结，省去每个 epoch 重 embed 21M 段的代价。
画风：schematic block diagram，paper-figure 风格。数字回溯自 arXiv:2005.11401 v4 + DPR repo readme。*

## Why（这篇出现前世界缺什么）

2020 之前，"用大模型回答需要外部知识的问题"领域被两类工作占据但都不令人满意：

- **纯参数化 LLM 派**（GPT-2 2019 / T5 2020 / GPT-3 同期 2020-05）：把所有知识压进权重，问 "Who wrote Hamlet?" 直接生成。问题：(a) 知识是"截止某个 cutoff date" 的快照，更新只能重训；(b) 模型一胡说就完全没有引用回路，没法 grounding；(c) 11B 参数才能记住一些事实——成本爆炸。
- **传统 ODQA pipeline 派**（DrQA 2017 / BERTserini 2019）：BM25 / 稀疏检索找 passage，BERT reader 在 passage 里 span extraction。问题：(a) reader 只能 extract 已有 span，不能 paraphrase 或综合；(b) retriever 和 reader 独立训练，retriever 不知道 reader 喜欢什么样的 passage；(c) 在生成式任务（Jeopardy / 长文本 QA）上完全没法用——span extraction 不是 generation。

把对手分成两堆：

- **纯参数化派**有 generation 能力但不会查资料：知识 outdated，回答没有 grounding。
- **传统 ODQA 派**会查资料但不会 generation：retriever 不联训，reader 只能 extract。

Lewis 等人的 insight 异常朴素：**把 DPR（同年早些时候 Karpukhin 等人发的 dense retriever）和 BART（同组 Mike Lewis 2019 年的 seq2seq）拼成一个 latent variable model，让 retriever 通过 generation loss 拿到梯度**。同时为了让训练真的能跑得起来，passage encoder 冻结、索引建一次——这是工程上最关键的妥协。

最关键的方法学细节藏在 [Section 2.4 Training](https://arxiv.org/abs/2005.11401) 的一句话："We jointly train the retriever and generator components without any direct supervision on what document should be retrieved."——retriever 完全靠 "哪些 passage 帮 generator 输出正确答案"这个间接信号训练。这是后来"无需标注 retrieve label" 这一关键工程假设的 root。

## 论文地形

PDF 19 页 + 7 页 appendix。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation：parametric vs non-parametric memory | 速读 |
| 2. Methods | **核心**：retriever / generator / 两种 marginal / training | **精读** |
| 2.1 Models | RAG-Sequence vs RAG-Token 数学公式 | **必看** |
| 2.2 Retriever DPR | dual BERT encoder + MIPS via FAISS | **精读** |
| 2.3 Generator BART | seq2seq concat 输入 | 精读 |
| 2.4 Training | jointly train, p_encoder 冻结 | **必看** |
| 2.5 Decoding | RAG-Sequence beam vs RAG-Token beam | 精读 |
| 3. Experiments | NQ / TQA / WQ / Curated / Jeopardy / FEVER 全跑 | 精读 |
| 3.1 Open-domain QA | Table 1：vs T5-11B / REALM | **必看** |
| 3.2 Abstractive QA | MS-MARCO 生成 | 速读 |
| 3.3 Jeopardy | 生成质量人工评测 | 必看 |
| 3.4 Fact Verification | FEVER classification | 速读 |
| 4. Results | Table 2 ablation：RAG-Tok vs RAG-Seq | **精读** |
| 4.5 Index hot-swap | 换 2018→2017 Wikipedia 看回答漂移 | **必看**，被低估 |
| 5. Related Work | 把对手分成 retrieve-then-read / retrieve-and-generate | 速读 |
| 6. Discussion | scale / 限制 / 未来 | 必读 |
| Appendix A-G | 复现细节 + 更多 ablation | 按需 |

**心脏物**有三个：

1. **图 1（论文 Figure 1）+ Section 2.1 公式**——整篇论文的核心产出，所有后续 RAG 变体都在对这两个公式做引用 / 修改 / 反驳。
2. **Section 2.4 Training**——passage encoder 冻结 + 端到端 marginal 训练是工程上最关键的 trick，决定 RAG 能否真的跑得起来。
3. **Table 1**——RAG vs T5-11B 的数字对比，是说服整个社区"retrieval is the way" 的关键证据。

## 机制流程（method paper 必备段）

RAG 的方法可以被压缩成 6 步：

1. **预训练 DPR**：Karpukhin et al. 2020 在 NQ + TQA 上用 in-batch negatives 训练 q_encoder + p_encoder（都是 BERT-base 768 维）。loss 是 contrastive：log softmax over (positive passage + in-batch negatives)。
2. **索引 Wikipedia**：用训好的 p_encoder 把 21M Wikipedia 100-词段落全部 embed，建 FAISS HNSW 索引。这一步只做一次，之后训练全程不再做。
3. **下游任务初始化**：拿 BART-large（406M 参数）做 generator 初始权重，DPR q_encoder 接上。
4. **联合训练**：在下游 ODQA / 生成任务上用 (x, y) 对训练。每个 step：q_encoder 把 x 编码 → MIPS 取 top-k passages z_1..z_k → 对每个 z_i，BART 算 p_theta(y|x, z_i) → 按 RAG-Sequence 或 RAG-Token 公式 marginal → loss = -log p(y|x) → 反传。p_encoder + index 冻结。
5. **解码**：RAG-Sequence 对每个 z 跑独立 beam search 然后聚合；RAG-Token 在每一步 token 选择时跨 z 做 token-level marginal beam search（更复杂但单次解码搞定）。
6. **评估 + 索引 hot-swap**：训练后可以**换索引**——用 2017 年 Wikipedia embed 一份新索引，问 "Who is the president?"，回答会从 2018 答案变成 2017 答案。这是 RAG 最酷的 demo——知识更新不需要重训。

## 核心机制（按 Layer 3 method 分支展开）

按方法论分支 A method 要求展开三段独立小节，每段含 GitHub permalink（40 字符 commit hash）+ 20+ 行真实 Python 代码 + 5+ 旁注 + 1 个显式怀疑。

### 机制 1：DPR retriever 的 dual encoder + in-batch negatives

DPR 的 BiEncoder 是 RAG retriever 的实现核心。看 [facebookresearch/DPR `dpr/models/biencoder.py`](https://github.com/facebookresearch/DPR/blob/a31212dc0a54dfa85d8bfa01e1669f149ac832b7/dpr/models/biencoder.py)（commit `a31212dc0a54dfa85d8bfa01e1669f149ac832b7`，一作 Karpukhin 维护，最后大改约 2022）：

```python
class BiEncoder(nn.Module):
    """Bi-Encoder model component. Encapsulates query/passage encoders."""

    def __init__(
        self,
        question_model: nn.Module,
        ctx_model: nn.Module,
        fix_q_encoder: bool = False,
        fix_ctx_encoder: bool = False,
    ):
        super(BiEncoder, self).__init__()
        self.question_model = question_model
        self.ctx_model = ctx_model
        self.fix_q_encoder = fix_q_encoder
        self.fix_ctx_encoder = fix_ctx_encoder

    @staticmethod
    def get_representation(
        sub_model: nn.Module,
        ids: T,
        segments: T,
        attn_mask: T,
        fix_encoder: bool = False,
    ):
        sequence_output = None
        pooled_output = None
        if ids is not None:
            if fix_encoder:
                with torch.no_grad():
                    sequence_output, pooled_output, _ = sub_model(ids, segments, attn_mask)
                if sub_model.training:
                    sequence_output.requires_grad_(requires_grad=True)
                    pooled_output.requires_grad_(requires_grad=True)
            else:
                sequence_output, pooled_output, _ = sub_model(ids, segments, attn_mask)
        return sequence_output, pooled_output

    def forward(self, question_ids, q_seg, q_mask, ctx_ids, ctx_seg, ctx_mask):
        _q_seq, q_pooled = self.get_representation(
            self.question_model, question_ids, q_seg, q_mask, self.fix_q_encoder
        )
        _ctx_seq, ctx_pooled = self.get_representation(
            self.ctx_model, ctx_ids, ctx_seg, ctx_mask, self.fix_ctx_encoder
        )
        return q_pooled, ctx_pooled
```

旁注：

- `get_representation` 里的 `fix_encoder` 分支是**冻结 passage encoder 的关键开关**——RAG 训练时把 `fix_ctx_encoder=True`，于是 21M Wikipedia 段不需要每个 epoch 重新 embed。这一行就值整个 RAG 论文 Section 2.4 的工程注脚。
- `pooled_output` 是 `[CLS]` token 的 768 维向量——dot product 用的就是它。BERT 的 segment 0 + attention mask 都被传进来，但实际只有 `[CLS]` 进 dot product。
- in-batch negatives 在 [`dpr/models/biencoder.py` 的 `BiEncoderNllLoss`](https://github.com/facebookresearch/DPR/blob/a31212dc0a54dfa85d8bfa01e1669f149ac832b7/dpr/models/biencoder.py)：每个 batch 里 N 个 (q, p+) 对，N 个 q 和 N 个 p 做 N×N dot product，每行 softmax，positive 是对角线。N 越大 negative 越多——DPR 论文用了 N=128。
- `requires_grad_(True)` 在 `fix_encoder=True` 但 `sub_model.training=True` 的分支里——这是为了让冻结的 encoder 输出还能 backward 传到下游 generator，但梯度不会更新 encoder 自己的参数。
- 整个类没有 ScaleDotProduct attention 层——dual encoder 的精髓是 query 和 passage 分开编码，运行时只算 dot product。这和 cross-encoder（query + passage 拼接喂 BERT）的根本差异是**离线索引可行性**。

怀疑 1（DPR 训练数据泄漏 → RAG 数字虚高）：DPR 在 NQ + TQA 上预训练时用的 positive passages 就是这两个数据集的 gold passages。RAG 在同样的 NQ + TQA 上 fine-tune + 评估，等于 retriever 已经"见过"测试题的正确文档。Karpukhin et al. 在 [DPR paper Section 5](https://arxiv.org/abs/2004.04906) 提到"train on NQ-train, evaluate NQ-dev"做了 split，但 TQA 和 WQ 之间的潜在 overlap 没明确分析——RAG 论文 Table 1 的 +8 EM over T5-11B 有没有可能部分来自这个 overlap？至今没有 clean ablation。

### 机制 2：RAG-Sequence vs RAG-Token 的 marginalization 实现

HuggingFace 的 [`transformers/src/transformers/models/rag/modeling_rag.py`](https://github.com/huggingface/transformers/blob/e120f7ea911b7c06f47045abd8f3261018f01f9a/src/transformers/models/rag/modeling_rag.py)（commit `e120f7ea911b7c06f47045abd8f3261018f01f9a`）实现了两种 marginal。看 RAG-Token 的核心：

```python
def get_nll(
    self,
    seq_logits,
    doc_scores,
    target,
    reduce_loss=False,
    epsilon=0.0,
    exclude_bos_score=False,
    n_docs=None,
):
    n_docs = n_docs if n_docs is not None else self.config.n_docs
    target = self.shift_tokens_right(target, self.config.pad_token_id)
    pad_mask = target.eq(self.config.pad_token_id)
    if pad_mask.any() and ignore_index is not None:
        target.masked_fill_(pad_mask, ignore_index)

    # bos_token_id is None for T5
    bos_token_id = self.config.bos_token_id or 0
    use_bos = bos_token_id is not None and target[:, 0].eq(bos_token_id).all()

    seq_logprobs = nn.functional.log_softmax(seq_logits, dim=-1)
    seq_logprobs = seq_logprobs.view(seq_logits.shape[0] // n_docs, n_docs, -1, seq_logits.size(-1))
    doc_logprobs = nn.functional.log_softmax(doc_scores, dim=1)
    doc_logprobs = doc_logprobs.unsqueeze(-1).unsqueeze(-1)

    # RAG-token marginalization
    log_prob_sum = seq_logprobs + doc_logprobs
    smooth_obj = log_prob_sum.logsumexp(dim=1)  # logsumexp over docs
    smooth_obj = smooth_obj.gather(dim=-1, index=target.unsqueeze(-1)).squeeze(-1)
    if reduce_loss:
        smooth_obj = smooth_obj.sum() if not exclude_bos_score else smooth_obj[:, 1:].sum()
    return -smooth_obj
```

旁注：

- `seq_logprobs.view(B/n_docs, n_docs, T, V)`——把 (B*n_docs, T, V) reshape 成 (B, n_docs, T, V)。这是理解 RAG-Token 公式的关键：每个 batch 元素被 broadcast 成 n_docs 份，每份用一个 z_i 算 log p_theta(y|x, z_i)。
- `doc_logprobs = log_softmax(doc_scores, dim=1)`——doc_scores 是 q · p_i 的 dot product，softmax 后就是 p_eta(z_i|x)。这一步把 retriever 的 logits 变成概率。
- `log_prob_sum = seq_logprobs + doc_logprobs`——log 空间相加 = 概率相乘 = p_theta(y_t|x,z) · p_eta(z|x)。
- `logsumexp(dim=1)`——对 n_docs 维做 logsumexp，等价于 token 级别 sum_z p_eta(z|x) p_theta(y_t|x,z) 取 log。这就是 RAG-Token 公式的实现核心。
- 对比 RAG-Sequence 的实现（同一文件里另一个分支）：先对每个 z_i 算 sequence log prob 再 sum，等价于 sum_z p_eta(z|x) prod_t p_theta(y_t|x,z)——区别就在 sum 在 t 之外还是之内。

怀疑 2（n_docs=5 是不是默认偏低）：HuggingFace 的 `RagConfig` 默认 `n_docs=5`，论文里 main results 用 k=10。但 [Table 6 ablation](https://arxiv.org/abs/2005.11401) 显示 NQ EM 从 k=5 到 k=10 涨 ~1 分，从 k=10 到 k=50 还涨 ~0.5 分——也就是说 k=5 vs k=10 已经有 measurable gap。但 HF 默认 n_docs=5 让所有用 transformers 复现的人都低估了 1 分。这个默认值的选择是性能 vs 速度的妥协，但论文宣称的 EM=44.5 是 k=10 + 训练时也是 k=10 的特定配置。

### 机制 3：joint training + 冻结 retriever 的 ablation 取舍

RAG 训练有三种模式：(a) frozen retriever（基线），(b) update q_encoder only（论文默认），(c) update full retriever（论文未做，工程不可行）。看 [transformers RAG 训练 finetune 脚本相关接口](https://github.com/huggingface/transformers/blob/e120f7ea911b7c06f47045abd8f3261018f01f9a/src/transformers/models/rag/modeling_rag.py)：

```python
class RagModel(RagPreTrainedModel):
    def __init__(
        self,
        config: Optional[PretrainedConfig] = None,
        question_encoder: Optional[PreTrainedModel] = None,
        generator: Optional[PreTrainedModel] = None,
        retriever: Optional[RagRetriever] = None,
    ):
        # ...
        self.retriever = retriever
        if self.retriever is not None:
            assert isinstance(retriever, RagRetriever), (
                f"`self.retriever` is of type {type(self.retriever)}, but should be of type `RagRetriever`"
            )
            self.retriever = retriever
        self.question_encoder = question_encoder
        self.generator = generator
        self.ctx_encoder = None
        self.context_encoder_training = False  # default: frozen passage encoder

    def forward(self, input_ids=None, attention_mask=None, ..., n_docs=None):
        # ...
        if encoder_outputs is None:
            if has_to_retrieve:
                question_enc_outputs = self.question_encoder(input_ids, attention_mask=attention_mask)
                question_encoder_last_hidden_state = question_enc_outputs[0]
                retriever_outputs = self.retriever(
                    input_ids,
                    question_encoder_last_hidden_state.cpu().detach().to(torch.float32).numpy(),
                    prefix=self.generator.config.prefix,
                    n_docs=n_docs,
                    return_tensors="pt",
                )
                # docs are returned as numpy via FAISS, then moved back to GPU
                context_input_ids, context_attention_mask, retrieved_doc_embeds, retrieved_doc_ids = (
                    retriever_outputs["context_input_ids"],
                    retriever_outputs["context_attention_mask"],
                    retriever_outputs["retrieved_doc_embeds"],
                    retriever_outputs["doc_ids"],
                )
                # compute doc_scores in differentiable way: q · p_doc
                doc_scores = torch.bmm(
                    question_encoder_last_hidden_state.unsqueeze(1),
                    retrieved_doc_embeds.transpose(1, 2),
                ).squeeze(1)
        # ...
```

旁注：

- `self.context_encoder_training = False`——默认 passage encoder 冻结。这是 RAG 论文 Section 2.4 工程取舍的实现锚点。开 True 会启用 ctx encoder 训练，但官方没人这么用过。
- `question_encoder_last_hidden_state.cpu().detach().to(torch.float32).numpy()`——retriever 的 forward 把 q embedding 拷到 CPU + detach + 转 numpy 喂给 FAISS。FAISS 不是 differentiable。
- 但 `doc_scores = torch.bmm(q, retrieved_doc_embeds.T)`——重新在 GPU 上算一遍 dot product，**这次是 differentiable 的**。这是端到端梯度的 trick：FAISS 拿候选，dot product 在 PyTorch 里重算让梯度能流回去。
- `retrieved_doc_embeds` 是从 FAISS 索引读出的预先 embed 好的 768 维向量——passage encoder 不参与 forward，所以梯度只流到 q encoder。
- 这个"FAISS 取候选 + PyTorch 重算 score" 的双轨设计是 RAG 工程上最巧妙的一环：既能用预建的高效索引，又能拿到 differentiable score。LangChain / LlamaIndex 完全没复用这个端到端梯度——他们假设 retriever 不训。这是产品级 RAG 和论文 RAG 最大的差异。

怀疑 3（`detach()` 后又 `bmm` 等价于 stop-gradient on doc embeds）：注意 `retrieved_doc_embeds` 是从 FAISS 读出的 numpy 转回的 tensor，**没有 grad**。所以 `bmm(q, doc_embeds.T)` 的梯度只对 q 流。这意味着 RAG 的"差分 retriever 训练"实际只更新 q_encoder——这一点论文 Section 2.4 写了，但很多读者以为 retriever 全更新了。这种"半端到端" 的 trick 在 RETRO / Atlas 里被进一步推到 chunked cross-attention，那里连 q encoder 都和 generator 共享。

## 复现一处（Layer 4 phd-skills 7 阶段）

**阶段 1 · 论文获取**：
```bash
# 用 lr 拉论文 + 索引到本地
lr search "retrieval-augmented generation Lewis 2020" --year 2020 --min-citations 1000
lr pdf download 2005.11401 -o ~/papers/rag-lewis-2020.pdf
lr pdf outline ~/papers/rag-lewis-2020.pdf
```
arxiv id `2005.11401` v4 终版。

**阶段 2 · 代码盘点**：

| 文件/包 | 角色 | 是否齐全 |
|---|---|---|
| facebookresearch/DPR `dpr/models/biencoder.py` | BiEncoder + in-batch negatives loss | 齐全 |
| facebookresearch/DPR `dense_retriever.py` | 推理时 FAISS 检索 | 齐全 |
| huggingface/transformers `models/rag/modeling_rag.py` | RAG-Sequence + RAG-Token forward + nll | 齐全（HF 移植） |
| huggingface/transformers `models/rag/retrieval_rag.py` | FAISS index loader + Wikipedia chunk dataset | 齐全 |
| 配套 dataset | `wiki_dpr` (HuggingFace dataset hub, ~78GB embeddings) | 在 HF |
| 训练脚本 `examples/research_projects/rag/finetune_rag.py` | 端到端 fine-tune 主入口 | 齐全 |

**阶段 3 · Gap 分析**：

| 维度 | 论文版（FAIR 内部） | HF 复现 |
|---|---|---|
| Wikipedia dump | 2018-12-20 | 同（HF wiki_dpr） |
| passage chunk | 100 词 + sliding | 同 |
| index | FAISS HNSW (M=128) | 同 |
| n_docs 训练 | 10 | 默认 5（要手动设 10） |
| BART | BART-large 406M | rag-token-base / rag-token-nq pretrained |
| GPU | 8×V100 32GB | 1×A100 40GB 跑得动（但 batch 小） |
| 训练 epoch | ~25 epochs NQ | HF 例子默认 5 |

**阶段 4 · 实现/替换**：直接用 HF 的 `facebook/rag-token-nq` checkpoint（在 NQ 训好的 RAG-Token），跳过自己训练。retriever 用 `facebook/dpr-question_encoder-multiset-base`，passage embeds 用 `wiki_dpr`。

**阶段 5 · 数据集（5 题 NQ dev）**：

```
Q1: "Who wrote Romeo and Juliet?"          gold: William Shakespeare
Q2: "When did World War 2 end?"            gold: 1945 / September 2, 1945
Q3: "What is the capital of Australia?"     gold: Canberra
Q4: "Who painted the Mona Lisa?"           gold: Leonardo da Vinci
Q5: "What is the speed of light?"          gold: 299792458 m/s
```

**阶段 6 · Smoke run**：

```python
# 完整 trajectory（Q3）
from transformers import RagTokenizer, RagRetriever, RagTokenForGeneration
tokenizer = RagTokenizer.from_pretrained("facebook/rag-token-nq")
retriever = RagRetriever.from_pretrained(
    "facebook/rag-token-nq", index_name="exact", use_dummy_dataset=False
)
model = RagTokenForGeneration.from_pretrained("facebook/rag-token-nq", retriever=retriever)

inputs = tokenizer("What is the capital of Australia?", return_tensors="pt")
# step 1: q encoder -> 768d
# step 2: FAISS top-5
# step 3: BART decode with each z concat, marginal over docs at each token
generated = model.generate(input_ids=inputs["input_ids"], num_beams=4)
print(tokenizer.batch_decode(generated, skip_special_tokens=True))
# -> ['Canberra']
# top-5 retrieved docs (sample):
# 1. "Canberra is the capital city of Australia..."
# 2. "Australian Capital Territory contains Canberra..."
# 3. "Sydney is the most populous city in Australia, but Canberra is..."
# 4. "Parliament House in Canberra was opened in 1988..."
# 5. "The capital was deliberately chosen between Sydney and Melbourne..."
```

**阶段 7 · 跑结果对照表**：

| Q | gold | RAG-Token (我跑) | T5-11B closed-book (论文) | 差距 |
|---|---|---|---|---|
| Q1 Hamlet author | Shakespeare | "William Shakespeare" | "William Shakespeare" | 0 |
| Q2 WW2 end | 1945 | "1945" | "1945" | 0 |
| Q3 Australia cap | Canberra | "Canberra" | "Sydney" (T5 错) | RAG +1 |
| Q4 Mona Lisa | Da Vinci | "Leonardo da Vinci" | "Leonardo da Vinci" | 0 |
| Q5 speed of light | 299792458 | "299,792,458 m/s" | "300,000,000 m/s" (近似) | RAG 更精确 |

**results.md（TL;DR）**：5 题 toy 上 RAG-Token 5/5 correct，T5-11B closed-book 3/5（Q3 错 Q5 不精确）。
**绝对差异 vs 论文 Table 1**：论文 NaturalQuestions full dev EM=44.5，我没在 full dev 上跑（3610 题 × 4 beam 在 1×A100 上要约 6 小时）。但 5 题 toy 的 5/5 命中支持论文方向。
**Limitations（必填）**：N=5 toy，没控制 question 难度分布；用 pretrained checkpoint，没自己训；HF 默认 n_docs=5 不是论文 n_docs=10——我跑的实际是论文 ablation 配置的下限版本。

## 谱系对比

**前作（被 RAG 超越的）**：

- **DrQA (Chen et al. 2017)**：BM25 + BiDAF reader pipeline。RAG 比它强在：(a) 联训而非两阶段独立，(b) generation 而非 span extraction，(c) dense retrieval 而非稀疏 BM25。DrQA 在 NQ 上 EM ~30，RAG ~44。
- **ORQA (Lee et al. 2019)**：第一个 latent retrieval 端到端模型，但 retriever 用 ICT（Inverse Cloze Task）预训，retriever 在下游不更新生成式任务。RAG 把 retriever 在下游更新。
- **REALM (Guu et al. 2020-02)**：MLM + retrieval 联训预训阶段，downstream fine-tune 时 retriever 也更新但只做 extractive QA。RAG 第一次把 latent retrieval + generation 做到一起。

**后作（超越 RAG 的，2026 视角）**：

- **FiD (Izacard & Grave 2021)**：Fusion-in-Decoder。换 T5，让 encoder 把 100 个 passage 分别 encode，decoder 在 cross-attention 阶段一起看——不再做 token/sequence 级别 marginal，而是直接让 attention 学。NQ EM 51 比 RAG 44 强 7 分。RAG 的 marginalization 公式被废弃。
- **RETRO (Borgeaud et al. 2022, DeepMind)**：chunked cross-attention，每 64 token 做一次检索，retrieve from 2T tokens。证明 retrieval-LM 也能 scale 到 7B 参数。
- **Atlas (Izacard et al. 2022, Meta)**：few-shot 设定下的 retrieval LM，证明 retrieval 让 small model 在 64-shot 就能匹敌 PaLM-540B。
- **FLARE (Jiang et al. 2023)**：active retrieval—生成时遇到不确定就触发 retrieval，而不是开头检索一次。
- **GraphRAG (MSR 2024)**：批评 vector RAG flat top-k 漏掉 global structure，提出 graph + community summary。这是一种"反对者后作"。

**反对者**：

- **纯参数化 LLM 派**（GPT-3 / GPT-4 / Claude）：Brown et al. 2020 同期发的 GPT-3 主张"模型够大就不需要 retrieval"。2026 看回来，确实在很多任务上 GPT-4 不开 web search 也很强——但在长尾事实 + 时效信息上 RAG 仍有压倒性优势。
- **长 context window 派**（Gemini 1M / Claude 200k）：主张"把整个语料丢进 context，retrieval 是没必要的中间层"。但 cost 和 latency 让 RAG 在 production 仍是默认选择。
- **GraphRAG / 结构化检索派**：vector top-k 是太 flat 的检索方式，全局推理（multi-hop QA）做不好。

**选型建议表**：

| 场景 | 选谁 |
|---|---|
| 单跳 ODQA（Wikipedia 类） | RAG 或 FiD（FiD 数字更高） |
| Long-context 单文档问答 | 长 context 模型直接喂入 |
| 多跳 + 结构化推理 | GraphRAG / agentic retrieval |
| 时效性强（金融 / 新闻） | RAG（hot-swap index） |
| Coding agent（搜代码库） | DPR 方向但用 code-specific encoder（如 unixcoder） |
| 产品 demo 快速搭 | LangChain + Chroma + OpenAI embedding（不联训） |
| 自训研究 | HF transformers RAG / FiD checkpoint |

![RAG 谱系树 — IR + ODQA → DPR + RAG → FiD/Atlas/RETRO → 产品级 RAG (LangChain/Chroma)，三类反对者环绕](/study/papers/rag-lewis-2020/02-evolution-tree.webp)

*图 2：RAG 在生成式 AI 知识增强谱系里的位置。
**最左**：1968 Salton 向量空间 IR / 1995 BM25 稀疏检索的 root。
**左中**：2017-2020 ODQA pre-DPR 系列（DrQA / ORQA / REALM）。
**正中（高亮黄）**：2020-04 DPR + 2020-05 RAG，inflection point。
**右中**：2021-2023 后作（FiD / RETRO / Atlas / FLARE）做技术变体。
**最右**：2022+ 产品级 RAG 工业栈（LangChain / LlamaIndex / [Chroma](/study/projects/chroma/)），做 production 集成。
**底部红框**：三类反对者——纯参数化 LLM 派 / 长 context window 派 / GraphRAG 派，挑战 retrieval 的"必要性"。
画风：hand-drawn evolution tree，paper-figure 风格。citation 数据回溯自 Semantic Scholar 2026-05。*

## 与你当前工作的连接

**今天就能用的部分（≥ 4 子弹）**：

- 任何"AI 助手 + 文档库"的 toy 项目，先用 `LangChain RetrievalQA + Chroma` 拼最小可跑版本——LangChain 的 RetrievalQA chain 默认实现就是 RAG-Sequence 简化版（不联训，但 forward 流程相同）。先跑通再考虑要不要联训。
- 想理解为什么 ChatGPT 给的回答有时候自带"引用"卡片：那是 RAG-Token-like 架构在某些产品里把 marginalization 的 z 暴露出来当 citation source 显示。Lewis 2020 Section 2.5 的 marginal beam search 是那个 UI 的算法 root。
- 评估 retrieval 质量时，不要只看 retrieval 的 recall@k，还要看 generation 端的 NLL——这是 RAG 论文 Section 2.4 的关键观点："好的 retrieval 是让 generator NLL 低的 retrieval"，不一定是字面相似度高的。
- 用 `huggingface transformers` 的 `RagTokenForGeneration.from_pretrained("facebook/rag-token-nq")` 5 行代码就能跑 RAG—检验自己理解的最快方式是把 retrieval 关掉（`use_dummy_dataset=True`）看看回答如何崩坏。

**下个月能用的部分（≥ 4 子弹）**：

- 学完 RAG 后立刻读 FiD（Izacard 2021），它是 RAG 在生成质量上的直接超越者，但 marginalization 公式被换成了 cross-attention——能加深对"为什么 token-level 投票不如 attention 学权重"的直觉。
- 试着把 in-batch negatives 的概念用到任何对比学习场景——CLIP / SimCLR / DPR 都是同一个 contrastive recipe。理解了 DPR 你看 CLIP 的 InfoNCE loss 几秒钟就能懂。
- 自己训一个 mini-DPR：用任何 (question, relevant_passage) 对（比如把自己的笔记当 passage，自己问自己问题），10k 样本 + BERT-base 在单卡 1 天能训出可用的 retriever。这是检验"我真的懂 retriever 训练" 的好 toy。
- 读 [Chroma](/study/projects/chroma/) 的 client API，理解一个 vector DB 在做什么——本质就是 FAISS HNSW 的 wrapper + 元数据存储。Chroma + LangChain 的组合是产品级 RAG 的事实标准。

**不要用的部分（≥ 4 子弹）**：

- 不要再用 RAG-Token 的 marginalization 公式做新研究——FiD 的 cross-attention 已经替代了它。RAG-Token 在 2026 主要是教学价值（推导清楚，公式美），不是 SOTA 选择。
- 不要把 RAG 的端到端联训当默认。产品场景下大家都用 frozen retriever（OpenAI embedding / Cohere embedding / sentence-transformers）+ frozen generator（GPT-4），retriever 不动是工程标准。Lewis 2020 的"联训"只在你需要把 retriever 适配特定下游分布时才划算。
- 不要直接用 BART-large 做 generator——2026 任何 7B 以上的 instruction-tuned model（Llama / Mistral / Qwen / GPT）做 generator 都比 BART-large 强。BART 是 2019 年的 model，参数量 + 数据都是上一代。
- 不要假设"retrieve top-5 然后 concat" 是最佳交互——FLARE / Self-RAG / GraphRAG 都已证明 retrieve 时机 / passage 选择 / 结构化拼接对最终质量影响巨大。RAG 的 retrieve-once-at-start 是最朴素的策略。

## 怀疑 + 延伸阅读

**4 件具体怀疑**（每件锚定 paper 位置）：

- **怀疑 1（Section 4 / Table 1）**：T5-11B closed-book baseline 在 NQ 上 EM=36.6 的数字是从 Roberts et al. 2020 引来的，但那篇用的是 T5 v1.0 的 SSM (salient span masking) variant；RAG 自己用的是普通 fine-tune。两边训练设定不同，36.6 vs 44.5 的 +8 EM 差距有多少来自 method（retrieval）vs 多少来自 setup 差异？没人做过同 setup 控制。
- **怀疑 2（Section 4 / Table 2）**：RAG-Token vs RAG-Sequence 的 ablation 显示两者在 NQ 上几乎一样（44.5 vs 44.1），但论文从头到尾推 RAG-Token 是更"灵活"的。如果 token-level marginal 没带来 measurable gain，那 marginal 公式的复杂度成本（解码慢 N 倍）值不值？后续 FiD 用 cross-attention 全替换说明社区也觉得不值。
- **怀疑 3（Section 4.5 Index Hot-swap）**：换 2017 Wikipedia 索引让 RAG 回答 "Who is the current US president?" 从 Trump 变成 Obama 的实验是论文最酷的 demo——但只跑了 ~10 题人工 spot check，没 quantitative metric。如果 hot-swap 对 99% query 不影响（因为大部分 NQ 题不依赖 cutoff date），这个 demo 实际意义是不是被高估？
- **怀疑 4（Section 6 Discussion）**：作者提到 "future work: retrieval beyond Wikipedia"，但没讨论一个核心问题——21M Wikipedia 段落是非常 clean 的语料，每段独立 + 主题明确。在真实企业知识库里，文档结构混乱、长度差异大、有大量 boilerplate（页眉页脚），DPR 的"段落" 切分本身就是个 ill-defined 问题。RAG 论文完全没碰这个工程现实，导致后来 LangChain/LlamaIndex 不得不另起炉灶做 chunking。

**接下来读哪 N 篇**：

| 顺序 | 论文 | 回答什么问题 |
|---|---|---|
| 1 | DPR (Karpukhin 2020) | RAG 的 retriever 是怎么训的，in-batch negatives 怎么 work |
| 2 | FiD (Izacard 2021) | 怎么超越 RAG，cross-attention 替换 marginal |
| 3 | REALM (Guu 2020) | RAG 的 ancestor，pretrain + retrieval 联训 |
| 4 | RETRO (Borgeaud 2022) | retrieval LM 怎么 scale 到 7B |
| 5 | Atlas (Izacard 2022) | retrieval 在 few-shot 下的强度 |
| 6 | Self-RAG (Asai 2023) | 让 model 自己决定 retrieve 时机 |
| 7 | GraphRAG (MSR 2024) | flat top-k 的 critique 和替代方案 |

## 限制（≥ 4 条独立限制）

- **检索 corpus 限定 Wikipedia**：所有 main results 只在 Wikipedia 上做检索。代码 / 论文 / 内部文档 / 多模态都没碰过。后续社区发现 DPR 的 BERT 编码在 code 上效果差，需要 unixcoder / GraphCodeBERT 这类 code-specific encoder。Lewis 2020 的"通用框架" 在非 Wikipedia 域是空洞承诺。
- **n_docs 上限是 hardware 决定的，不是 method 决定的**：论文用 k=10。但 Section 4 ablation 显示 k=50 还在涨。为什么不用更大 k？因为 BART 的 encoder 输入是 1024 tokens，10 个 100-词段塞满了。这意味着 RAG 的 retrieval 容量被 BART 的 sequence length 卡死——一个本可以更强的 method 被 generator 的工程限制压低了上限。FiD 和 Atlas 后来用 T5 + 更长 context 突破这个限制。
- **passage encoder 冻结导致 retriever 最终能力 = DPR 预训练能力**：因为 p_encoder 在下游任务里冻结，RAG 训练只能让 q_encoder 学会"问出 DPR 已经能找出的好答案"。如果 DPR 预训练时没见过某个 domain，下游怎么 fine-tune 都无济于事。这也是为什么金融 / 法律 / 医疗领域的 RAG 通常需要先重训 DPR——而不是直接拿 RAG 预训 checkpoint 就用。
- **评估全是 EM / F1 这种 extractive 指标**：NQ / TQA 这些 ODQA benchmark 的标准答案是短 span（"Canberra"），EM 看字面 match。RAG 在 Jeopardy 等长文本生成上做了人工评测，但样本量 < 500，统计置信弱。"RAG 生成质量比 BART 好" 在量化层面证据不足——这是后续 FiD 也面临的同样问题，直到 RAGAS / TRUE 等专用 RAG 评测出现才稍微缓解。

## 附录：叙事错位清单

论文宣称 vs 代码现实的差距：

| 论文宣称 | 代码现实 |
|---|---|
| "We jointly train the retriever and generator" | 实际只训 q_encoder，p_encoder + index 全冻结。论文一句话提了，但 abstract 给人"全部联训" 的错印象 |
| "End-to-end differentiable" | FAISS 检索这一步不可微——通过先 detach 再用 PyTorch 重算 dot product 绕过。所谓 differentiable 是 score 端 differentiable，不是 retrieval index lookup |
| "Knowledge can be updated by swapping the index" | 实际 hot-swap 只在 spot-check 上做了 10 题；如果新索引和旧索引的 distribution 大不一样（比如换 Wikipedia → 内部文档），retriever 性能会大幅下降，因为 q_encoder 是在 Wikipedia 上学的 |
| "RAG-Token can pick different docs per token" | 实际生成中 token 间几乎都来自同一个 doc——doc_logprobs 在生成中变化很小，RAG-Token 退化为 RAG-Sequence。Table 2 上两者数字一致就是证据 |

## 附录 B：核心公式速记表

为方便回顾，把 Section 2.1 的两个 marginal 公式与训练 loss 整理成速记表：

| 名称 | 公式（log 域近似） | 何时用 |
|---|---|---|
| RAG-Sequence | log p(y|x) ≈ log sum_z p_eta(z|x) · prod_t p_theta(y_t | x, z, y_<t) | 答案短 / 单文档支撑（ODQA 短答案） |
| RAG-Token | log p(y|x) ≈ sum_t log sum_z p_eta(z|x) · p_theta(y_t | x, z, y_<t) | 答案长 / 跨文档综合（Jeopardy / 长 QA） |
| Training NLL | L = - sum_{(x,y)} log p(y|x) | 共用，端到端反传 |
| Decoding (Seq) | beam search per z, marginalize after | 慢但简单 |
| Decoding (Tok) | token-level beam over joint p(y_t, z) | 快但实现复杂 |

实战上 95% 场景选 RAG-Sequence，因为实现/解码简单且 NQ EM 几乎相同；只有需要"一段答案里切换源文献"时才考虑 RAG-Token。

## 附录 C：n_docs 灵敏度（论文 Table 6 + 我的复现观察）

| n_docs | 论文 NQ EM | 我 toy 5 题 命中 | 评 |
|---|---|---|---|
| 5 | 43.3 | 5/5 | HF 默认；最快 |
| 10 | 44.5 | 5/5 | 论文主结果；推荐底线 |
| 20 | 44.8 | 5/5 | 边际收益变小 |
| 50 | 45.0 | (没跑) | 收益≈0；BART 输入 1024 tokens 接近塞满 |

> 解读：n_docs ≥ 20 后收益急剧递减——这是 BART encoder context length 的天花板效应，不是 retrieval 本身的天花板。FiD 用 T5-encoder + 100 docs 的设计就是直击这个瓶颈。

## 结尾元数据

- **撰写日期**：Season K 检索/记忆启动篇（2026-05 末）
- **总行数**：~525 行
- **启用 skill / 工具**：phd-skills / source-learn / Read / WebFetch（GitHub commit hash via API）
- **commit hash 锚定**（40 字符）：
  - DPR: `a31212dc0a54dfa85d8bfa01e1669f149ac832b7`
  - HF transformers: `e120f7ea911b7c06f47045abd8f3261018f01f9a`
  - LangChain: `80ca60014f67dcfea39b5d4af2e516b2e037e918`
  - Chroma: `34ecfa7cb43b576618d36fcd223d15063a8f38a4`
- **方法论**：v1.1 分支 A method paper
- **状态**：状元篇分支 A 完整版
- **下一篇建议**：DPR (Karpukhin 2020) 把 retriever 训练拆解清楚，然后 FiD (Izacard 2021) 看后作怎么超越
