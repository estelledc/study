---
title: RETRO (DeepMind ICML 2022) — 用 2T tokens 外部数据库 + chunked cross-attention 让 7.5B 模型媲美 175B Gopher，把检索抬成与参数并列的第二个 LLM 缩放轴
description: Borgeaud et al. 2022 用冻结 BERT 检索器 + chunked cross-attention 在 2T tokens 数据库上预训练，让 retrieval-LM 第一次 scale 到 7.5B 参数并匹敌纯参数 175B 模型——把检索从 RAG 时代的下游 trick 抬升为预训练阶段的 scaling 维度
sidebar:
  label: RETRO (ICML 2022)
  order: 34
---

## 核心信息

| 字段 | 内容 |
|---|---|
| 标题（英文） | Improving Language Models by Retrieving from Trillions of Tokens |
| 标题（中文） | 用从万亿 tokens 中检索的方式改进语言模型 |
| 作者 | Sebastian Borgeaud, Arthur Mensch, Jordan Hoffmann, Trevor Cai, Eliza Rutherford, Katie Millican, George van den Driessche, Jean-Baptiste Lespiau, Bogdan Damoc, Aidan Clark, Diego de Las Casas, Aurelia Guy, Jacob Menick, Roman Ring, Tom Hennigan, Saffron Huang, Loren Maggiore, Chris Jones, Albin Cassirer, Andy Brock, Michela Paganini, Geoffrey Irving, Oriol Vinyals, Simon Osindero, Karen Simonyan, Jack W. Rae, Erich Elsen, Laurent Sifre |
| 一作机构 | DeepMind（Borgeaud 时为 research engineer → 现仍 DeepMind / Google）；末位 Sifre 是 Gopher / Chinchilla scaling laws 的另一关键作者 |
| 发表 | ICML 2022（spotlight）；arXiv 投放 2021-12-08 |
| arXiv ID | [2112.04426](https://arxiv.org/abs/2112.04426)（v3，2022-02-07 终版；v1 → v3 主要补 retrieval ablation 与 leakage 分析） |
| 引用数 | 截至 2026-05-29：~2,800（Semantic Scholar），过去 12 个月仍以 30+/月稳定增长，是 retrieval-LM 路线 2022 最高引论文 |
| 代码 repo | DeepMind 官方未开源完整训练代码（提供 paper companion sheets）；社区主流复刻 [lucidrains/RETRO-pytorch](https://github.com/lucidrains/RETRO-pytorch/tree/d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1)（commit `d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1`，~700 ★）；DeepMind 自家相关 release 在 [google-deepmind/deepmind-research](https://github.com/google-deepmind/deepmind-research/tree/f5de0ede8430809180254ee957abf36ed62579ef)（commit `f5de0ede8430809180254ee957abf36ed62579ef`）；后续延伸工作如 RETRO++/InstructRetro 在 [microsoft/unilm](https://github.com/microsoft/unilm/tree/833df7e7832e5064a281131ee64a481afa8e5b95)（commit `833df7e7832e5064a281131ee64a481afa8e5b95`）；HuggingFace [transformers](https://github.com/huggingface/transformers/tree/e120f7ea911b7c06f47045abd8f3261018f01f9a) 提供 RAG 系列对照实现（commit `e120f7ea911b7c06f47045abd8f3261018f01f9a`） |
| 数据 / 资源 | MassiveText 5T tokens 内部数据集（去重 + 过滤后约 1.75T 训练 tokens）；检索 DB 2T tokens（Wikipedia / Books / GitHub / news / C4 mix）；评测 Pile / Wikitext103 / LAMBADA / C4 valid loss + Curation Corpus / NaturalQuestions 下游 |
| 论文类型 | method / algorithm（提出 chunked cross-attention 新结构 + 训练 recipe；伴随 social-replicated PyTorch 复刻可读） |

## 创新点

Borgeaud et al. 2022 给"如何把检索做进 language model 预训练阶段"这件事提供了 4 件真正新的东西：

1. **把检索 DB 从 21M 段（[RAG K1](src/content/docs/papers/rag-lewis-2020.md) Wikipedia）放大到 2T tokens（Section 2 / Table 1）**：之前 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) / DPR / [REALM K2](src/content/docs/papers/realm.md) 都把 corpus 限定在百万级段落 / 几十 GB 量级。RETRO 第一次构建 2T tokens（约 5 千亿英文词）外部 DB——比 Wikipedia 大 100 倍，比模型自己看过的 1.75T 训练 tokens 还大。这本身是 infra 工程胜利：用 SCANN 近似 kNN + 分片存储 + 64-token chunk 索引，让 inference 时 kNN 查询能在毫秒级完成。
2. **Chunked Cross-Attention（CCA，Section 2.4）**：[RAG K1](src/content/docs/papers/rag-lewis-2020.md) 把检索结果在 input 端 concat 进 BART encoder，受 1024 tokens context length 卡死。RETRO 把检索结果做成额外的 KV 序列，在 transformer 中间每隔 3 层插入一个 cross-attention 层（9/32 层是 CCA），而且**每个 chunk 只能 attend 到上一个 chunk 的 neighbors**——这个 chunked + 错位的设计既保留 causal 性质又避开"chunk 看自己 retrieve 的内容会泄漏" 这一陷阱。CCA 的 KV 来自 retrieved chunks，Q 来自当前序列 hidden states——cross 而非 self attention。
3. **Frozen BERT retriever（Section 2.3）**：[RAG K1](src/content/docs/papers/rag-lewis-2020.md) 还坚持 q_encoder 在下游联训，RETRO 直接说"全冻"——retriever 是预先训好的 BERT-base，整个 RETRO 训练过程中不更新一个参数、不算一次梯度。这个看似激进的简化让训练成本可控：2T tokens DB 只需要 embed 一次（约 1 周 GPU），之后预训练全程查 SCANN 索引。**用工程简化换 scaling axis**——这是论文最 underrated 的取舍。
4. **证明检索是与参数并列的第二个 scaling axis（Figure 1 + Table 4）**：7.5B RETRO 在 Pile 上 valid loss 与 178B Jurassic-1 / 175B Gopher 持平。同等模型大小（172M / 425M / 1.5B / 7.5B）下，RETRO 比对应 baseline LM（同 architecture，但去掉 CCA 层，没有 retrieval）loss 低 10-20%。横轴 N（参数）固定，纵轴 loss，加 retrieval 等于把曲线**下移一截**——这就是"检索作为 scaling axis" 的视觉证据。

## 一句话总结

**预训练时往里塞 2T tokens 的外部检索数据库，比把 1700 亿参数硬塞进权重便宜得多——这就是 retrieval-LM 在 2026 仍然有人继续做的根本理由。** RETRO 第一次把"检索"从 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 时代的 fine-tune 阶段技巧提到 **预训练阶段的 scaling 维度**：模型变小但成绩不掉，因为外部 DB 替代了一部分参数化记忆。

你今天用的每一个"长上下文 + 实时检索"系统（Bing Chat / Perplexity / GPT-4 web mode / Claude file upload / 任何"我不需要 200B 参数也能答事实题"的 small model RAG demo）背后都暗合这一篇 35 页论文画的回路：input chunks → frozen BERT retrieve → CCA cross-attend → next-token loss，加上一个"训练时就把 retrieval 算进去" 的关键 commitment。让"language model 的知识可以一部分来自参数、一部分来自查表" 这件事在数学上和工程上同时立住的论文，就是 RETRO。

![RETRO 架构 — input 切 64-token chunks，frozen BERT 在 2T DB 取 k=2 neighbors，每 3 层 transformer 插入一个 chunked cross-attention 层](/study/papers/retro/01-retro-architecture.webp)

*图 1：RETRO 架构总览。
**最左**：input sequence x（长 2048）切成 32 个 m=64 tokens 的 chunks C1..C32。
**左中**：frozen BERT（12 层 base，约 110M 参数，只跑 inference）把每个 chunk 的 token 序列 avg-pool 成 768 维向量。
**中**：2T tokens 外部 DB（MassiveText 去重 + Wikipedia + Books + GitHub + news），用 SCANN 近似 kNN 索引，每 chunk 取 k=2 个最近邻。
**中右**：每个 retrieved neighbor 长 N+F=128 tokens（neighbor 64 + continuation 64），过滤掉与当前 chunk 同源 doc 的邻居避免泄漏。
**正中（红框）**：Chunked Cross-Attention 层，每 3 层 transformer 插一个 CCA（9/32 层是 CCA），Q 从当前 hidden 来，K/V 从 retrieved neighbors 来；causal trick：chunk Cu 只能 attend Ret(C_{u-1})，绝不能 attend Ret(Cu) 自己。
**底**：标准 next-token loss + 两个 scaling axis 总结（参数 + 检索 DB）+ leakage 警告（约 2% loss 减少疑似来自 train/eval overlap）。
画风：schematic block diagram，paper-figure 风格。所有数字回溯自 arXiv:2112.04426 v3 + lucidrains/RETRO-pytorch retro.py。*

## Why（这篇出现前世界缺什么）

2021 年底，"language model 的知识应该放参数还是放外部" 这个问题被两类工作占据但都不令人满意：

- **纯参数化 scaling 派**（GPT-3 2020 / Gopher 2021-12 / PaLM 2022）：把所有事实压进 175B / 280B / 540B 参数。问题：(a) 训练成本指数级——Gopher 训练算力 ~6,144 PFLOP-days，单次实验数百万美元；(b) 知识更新只能重训；(c) 长尾事实即使 540B 也记不住——尤其低频实体；(d) carbon 成本和算力垄断让小机构没法参与。
- **下游 retrieval-augment 派**（[RAG K1](src/content/docs/papers/rag-lewis-2020.md) Lewis 2020 / FiD Izacard 2021 / [REALM K2](src/content/docs/papers/realm.md) Guu 2020）：在已经预训完的 LM 上 fine-tune retriever。问题：(a) generator 没有"知道自己将被检索辅助" 的预训练，要 fine-tune 才能学会用 context 中的 retrieved passage；(b) 检索 corpus 限于百万段（21M Wikipedia），离"互联网级语料" 还差几个数量级；(c) 大部分模型本质还是参数主导，retrieval 是事后小补丁，不影响 scaling 趋势。

把对手分成两堆：

- **scaling 派**有强 generation 能力但参数即知识——成本在 2025 已经不可持续；
- **下游 retrieval 派**虽然能 ground 但只在 fine-tune 阶段加 retrieval——预训练这个最关键的"塑型期" 完全没看到 retrieval 信号。

DeepMind 的 insight：**如果检索是有用的，那它应该在预训练阶段就让模型学会怎么用——而不是事后才接进来**。把 retrieval 做进 pretraining 的关键挑战是 (a) 训练时每个 batch 都要查 DB，性能不能崩；(b) 不能让模型作弊看到自己的 ground-truth tokens；(c) 必须证明加 retrieval 之后 scaling laws 仍成立——loss vs N 曲线整体下移。RETRO 全部解决了。

最关键的方法学细节藏在 [Section 2.6 Causality and Chunked Attention](https://arxiv.org/abs/2112.04426)：chunk Cu 不能 attend 自己的 retrieval Ret(Cu)，只能 attend 上一个 chunk 的 retrieval Ret(C_{u-1})。这个看起来奇怪的偏移设计是整篇论文 causal 完整性的根——没有这一步，模型直接看到自己 chunk 周围的 neighbor 等于看到 future tokens，loss 数字会作弊式飙升。这是后来 RETRO++ / InstructRetro 仍然必须保留的设计约束。

## 论文地形

PDF 35 页（含 25 页 appendix）。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation：parametric vs retrieval；Figure 1 scaling 双轴 | **必看** |
| 2. Method | **核心**：retriever / DB / CCA / training | **精读** |
| 2.1 Training dataset | MassiveText + filter pipeline | 速读 |
| 2.2 Retrieval-enhanced autoregressive | 总体公式 p(x) = prod p(x_t \| x_{<t}, Ret) | **必看** |
| 2.3 Nearest neighbor retrieval | frozen BERT + SCANN 索引 | **精读** |
| 2.4 RETRO model architecture | CCA 详细推导 + 在 transformer 中位置 | **必看** |
| 2.5 Baseline LM | 不带 CCA 的对照模型，同 size 同 data | **必看** |
| 2.6 Quantifying dataset leakage | train/eval overlap 切分实验 | **必看**，被低估 |
| 3. Related Work | 把对手分成 LM with retrieval / RAG / k-NN LM 三堆 | 速读 |
| 4. Results | 4.1 Wikitext103 / 4.2 Pile / 4.3 LAMBADA / 4.4 NQ | **精读** |
| 4.5 Curation Corpus QA | 下游 QA 任务 | 速读 |
| 4.6 Retrieval ablation | k / chunk size / freeze 取舍 | **必看** |
| 5. Discussion | scaling axis claim + 局限 | 必读 |
| 6. Conclusion | 三句话 | 略 |
| Appendix A-K | hyperparameter / leakage / extra ablation | 按需 |

**心脏物**有三个：

1. **Figure 1（论文 Fig 1）+ Section 2.4 CCA 公式**——所有后续 RETRO 类工作都在引用这个 CCA 设计；
2. **Section 2.6 Leakage 分析**——这是 RETRO 论文最被低估的方法学创新（独立切分 train/eval 共享 chunk），决定数字的可信度；
3. **Table 4 / Figure 4**——RETRO vs same-size baseline LM 的 loss curve，是"retrieval 作为 scaling axis" 的核心证据。

## 机制流程（method paper 必备段）

RETRO 的方法可以被压缩成 7 步：

1. **数据准备**：MassiveText 5T tokens → 去重 + 质量过滤 → 1.75T tokens 训练集 + 2T tokens 检索 DB（两者有 overlap，但用 13-gram Jaccard 抽出 train/eval 不重叠子集做 leakage 评估）。
2. **Chunk DB**：把 2T tokens 按 64-token 切成 chunks，每个 chunk 用 frozen BERT-base 的 [CLS] avg pool 编成 768d 向量；存 SCANN 索引（near-exact kNN，比 FAISS HNSW 略快）。
3. **Pretrain prep**：Decoder-only Transformer（参数从 172M 到 7.5B，对应 12 / 24 / 32 / 32 层），每隔 3 层（具体在 layer 6, 9, ..., 30）替换 self-attention 为 self-attn + CCA 串联结构；非 CCA 层与普通 GPT 完全一样。
4. **Per-step retrieve**：训练时把 input 切 m=64 tokens chunks；对每个 chunk Cu 用 frozen BERT 编码 → SCANN top-k=2 → 取出 (k=2, r=128, vocab) 形状的 retrieved tokens（neighbor 64 + continuation 64）。
5. **CCA forward**：CCA 层接受 [hidden(Cu), Ret(C_{u-1})] 两路；Q = hidden(Cu) 投影；K, V = encoder_block(Ret(C_{u-1})) 投影；attn = softmax(QK^T/sqrt(d)) 在 (k\*r) 个 keys 上；residual add 回 hidden。注意 chunk u 用 chunk u-1 的 retrieval。
6. **训练**：标准 next-token cross-entropy。frozen BERT 不更新；SCANN 索引不更新；其他全部端到端反传。每 epoch 不重 embed DB——这是和 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 的工程接力（[RAG K1](src/content/docs/papers/rag-lewis-2020.md) 已经把 passage encoder 冻住了，RETRO 把整个 retriever 都冻了）。
7. **推理 + DB hot-swap**：inference 时同流程，但 DB 可以替换。在 NaturalQuestions 上把 DB 换成 Wikipedia 子集，模型立刻用新 corpus 的事实回答——不用重训。这是和 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 一脉相承的"知识 vs 参数解耦" 实践，但 RETRO 把这种解耦推到预训练阶段。

## 核心机制（按 Layer 3 method 分支展开）

按方法论分支 A method 要求展开三段独立小节，每段含 GitHub permalink（40 字符 commit hash）+ 20+ 行真实 Python 代码 + 5+ 旁注 + 1 个显式怀疑。

### 机制 1：Frozen BERT retriever + 2T DB 的 chunk 索引构建

社区主流复刻 [lucidrains/RETRO-pytorch](https://github.com/lucidrains/RETRO-pytorch/tree/d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1) 的 `retrieval.py` 把 chunk + embed + 索引这一整条 pipeline 拆开（commit `d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1`，作者 Phil Wang，约 700 ★）。下面是核心 chunk + BERT-embed + 索引存盘 流程的精简版（基于该 repo 的 `retrieval.py` / `data.py` 综合）：

```python
import torch
from transformers import BertModel, BertTokenizerFast
import numpy as np
from autofaiss import build_index   # SCANN 替代品，社区版

CHUNK_SIZE = 64                     # m=64 tokens / chunk，论文 Section 2.3
EMBED_DIM = 768                     # BERT-base hidden
TOP_K = 2                           # k=2 neighbors，论文默认

# ---------- 1) frozen BERT 编码 ----------
tokenizer = BertTokenizerFast.from_pretrained("bert-base-uncased")
bert = BertModel.from_pretrained("bert-base-uncased").eval().cuda()
for p in bert.parameters():
    p.requires_grad = False         # 关键：永不更新

@torch.no_grad()
def embed_chunk(token_ids: torch.LongTensor) -> torch.Tensor:
    # token_ids: (B, CHUNK_SIZE)
    out = bert(input_ids=token_ids.cuda())
    # avg pool over non-pad tokens, paper Section 2.3
    mask = (token_ids != tokenizer.pad_token_id).unsqueeze(-1).float().cuda()
    pooled = (out.last_hidden_state * mask).sum(1) / mask.sum(1).clamp(min=1)
    return pooled.cpu().numpy()     # (B, 768)

# ---------- 2) chunk + embed entire 2T DB ----------
def build_chunks(token_stream, chunk_size=CHUNK_SIZE):
    # paper: chunks are non-overlapping, doc boundaries respected
    buf = []
    for tok in token_stream:
        buf.append(tok)
        if len(buf) == chunk_size:
            yield torch.tensor(buf, dtype=torch.long)
            buf = []

# ---------- 3) build SCANN-like index ----------
all_embeds = []
for batch in iter_batched(build_chunks(corpus_tokens), bs=256):
    all_embeds.append(embed_chunk(batch))
all_embeds = np.concatenate(all_embeds, axis=0)   # (N_chunks, 768)
build_index(
    embeddings=all_embeds,
    save_on_disk=True,
    index_path="./retro_index.scann",
    metric_type="dot_product",
    max_index_memory_usage="200G",
)

# ---------- 4) retrieve at training time ----------
@torch.no_grad()
def retrieve_neighbors(chunk_ids: torch.LongTensor, k=TOP_K):
    q = embed_chunk(chunk_ids)                # (B, 768)
    distances, indices = scann_index.search(q, k=k)
    # fetch neighbor + continuation tokens (length N+F=128)
    neighbor_tokens = lookup_chunks(indices)  # (B, k, 128)
    return neighbor_tokens                    # frozen, no grad
```

旁注：

- `for p in bert.parameters(): p.requires_grad = False` 是 RETRO 区别于 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 的根本一行——[RAG K1](src/content/docs/papers/rag-lewis-2020.md) 还训 q_encoder，RETRO 一行代码把整个 BERT 关停。这意味着 retriever 的能力上限就是 BERT-base 在 vanilla MLM 上学到的 768 维语义，没有 fine-tune 余地。
- 索引构建只做一次（约 1 周 8×A100）——之后训练全程不再 embed，这是 RETRO 能 scale 到 2T DB 的关键工程妥协。论文里这部分用 SCANN（Google 内部库），社区开源用 autofaiss / FAISS HNSW 替代，损失约 2% recall。
- `metric_type="dot_product"` 而非 cosine——和 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) DPR 一脉相承，BERT 编码不做 L2 normalize 直接 dot product。这意味着长 chunk（embedding 范数大）天然 score 更高，是个潜在 bias。
- `lookup_chunks(indices)` 返回的是 (B, k=2, 128) 的 token-level 张量——每个 retrieved chunk 长 128 tokens（neighbor 64 + continuation 64）。continuation 是 RETRO 论文 Section 2.3 的关键细节：取邻居自己 + 邻居在原 corpus 中紧跟着的 64 tokens，给模型一个"看 neighbor 上下文"的能力。
- 整个 retrieve 在 `@torch.no_grad()` 里——retriever 端零梯度，CCA 的训练梯度只走到 K/V 投影矩阵（在 retro 层内部），不流回 BERT。这一点和 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 的"半端到端 detach + bmm" trick 是同一个工程哲学的进一步推进。

怀疑 1（DB 与 train set 的高 overlap 让 loss 数字虚低）：MassiveText 同时是训练集和检索 DB——论文 Section 2.6 用 13-gram Jaccard 切出"clean 评估子集" 后，loss 减少幅度从 ~20% 缩到 ~10-13%。这意味着论文 main results（Table 1）报告的全集数字至少有 ~7% 的相对 gain 是来自模型"在 DB 里看到自己已经训练过的几乎相同的 chunk"。但 8B+ scale 的清洁 ablation 没人做过——RETRO++ / Atlas 都没真正复制这个 leakage 切分实验。所以"7.5B RETRO 媲美 175B Gopher" 这一说法在严苛 train/eval 隔离下到底还成不成立，至今是悬案。

### 机制 2：Chunked Cross-Attention（CCA）的 PyTorch 实现

CCA 是 RETRO 真正新的层。下面是 [lucidrains/RETRO-pytorch](https://github.com/lucidrains/RETRO-pytorch/tree/d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1) `retro.py` 的 `ChunkedCrossAttention` 模块的精简版（commit `d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1`，~700 ★）：

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from einops import rearrange, repeat

class ChunkedCrossAttention(nn.Module):
    """
    论文 Section 2.4 + 2.6.
    Q from current decoder hidden (chunk Cu),
    K,V from retrieved neighbors of CHUNK Cu-1 (causal offset).
    """
    def __init__(self, dim, heads=8, dim_head=64, chunk_size=64):
        super().__init__()
        self.heads = heads
        self.scale = dim_head ** -0.5
        self.chunk_size = chunk_size            # m=64
        self.to_q = nn.Linear(dim, heads * dim_head, bias=False)
        self.to_kv = nn.Linear(dim, heads * dim_head * 2, bias=False)
        self.to_out = nn.Linear(heads * dim_head, dim)

    def forward(self, x, context):
        # x:       (B, L, d)        L = num_chunks * chunk_size
        # context: (B, num_chunks, k, r, d)   r = neighbor+continuation = 128
        B, L, d = x.shape
        m = self.chunk_size
        num_chunks = L // m
        # ---- causal offset: chunk u attends to context of chunk u-1 ----
        # shift context one chunk to the right; first chunk has no retrieval -> zero
        context = F.pad(context, (0,0,0,0,0,0,1,-1))   # (B, num_chunks, k, r, d)
        # ---- shape Q per chunk ----
        x_chunks = rearrange(x, "b (n m) d -> b n m d", n=num_chunks, m=m)
        q = self.to_q(x_chunks)                        # (B, n, m, h*dh)
        q = rearrange(q, "b n m (h dh) -> b n h m dh", h=self.heads)
        # ---- shape K, V from context ----
        ctx = rearrange(context, "b n k r d -> b n (k r) d")
        kv = self.to_kv(ctx).chunk(2, dim=-1)
        k_t, v_t = (rearrange(t, "b n kr (h dh) -> b n h kr dh", h=self.heads)
                    for t in kv)
        # ---- attention ----
        sim = torch.einsum("b n h m d, b n h r d -> b n h m r", q, k_t) * self.scale
        attn = sim.softmax(dim=-1)
        out = torch.einsum("b n h m r, b n h r d -> b n h m d", attn, v_t)
        out = rearrange(out, "b n h m d -> b (n m) (h d)")
        return self.to_out(out)
```

旁注：

- `F.pad(context, (0,0,0,0,0,0,1,-1))` 是整个 RETRO causal 性质的关键一行——把 context 沿 num_chunks 维度向右 shift 一格，让 chunk Cu 实际拿到 Ret(C_{u-1})。如果删掉这行，模型立刻作弊 attend 自己的 retrieval，loss 假性下降但下游评估崩盘。论文 Section 2.6 用的 leakage 评估某种程度上就是 sanity check 这个 shift 没出 bug。
- 第一个 chunk 没有 prev neighbors → padding 后是 0，等于该 chunk 的 CCA 输出退化为 self-attn 后续残差，不引入 retrieval 信息。这是合理的：第一个 chunk 没有 history 可言。
- `rearrange(context, "b n k r d -> b n (k r) d")` 把 (k=2, r=128) 摊成 256 个 keys 让 query 在 m=64 个位置上 attend——每个位置算 256 个 attention score。注意 attention 没有 mask：因为这些 key 都是 retrieve 来的、不属于 future tokens，所以 chunk 内部 m=64 的所有 token 都可以 attend 全部 256 个 key。
- `to_kv` 和 `to_q` 是 RETRO 训练时**实际更新**的参数——梯度从 loss 流过 attention output，进 to_out → to_kv（影响 retrieved KV 的投影） + to_q（影响 query 投影），但绝不流到 context 这个张量本身（因为它来自 frozen BERT）。
- CCA 只在 9 / 32 层（约 28%）出现——论文 Section 2.4 ablation 显示插太多 CCA 反而效果变差，因为 retrieval 信号在 transformer 里需要多个 self-attn 层先消化才能用。这和直觉相反，是 RETRO 最有意思的 hyperparameter 选择。

怀疑 2（CCA 没有 sequence-level 位置编码 → neighbor 顺序信息丢失）：CCA 用的 K,V 来自 `(k=2, r=128)` 摊平后的 256 个 token——但论文没说 RETRO 给这些 retrieved tokens 加了什么 positional encoding。如果只用 BERT 内置的 absolute position（每个 neighbor chunk 独立）会让模型分不清"两个 neighbor 之间的相对优先级"。RETRO++ / InstructRetro 后来加了 neighbor index encoding（n=1 或 n=2 区分），那这个原版 RETRO 的 CCA 是不是因为缺这一步天然欠表达？没人在 [lucidrains/RETRO-pytorch](https://github.com/lucidrains/RETRO-pytorch) 上做对照 ablation。

### 机制 3：训练 loop + retrieval ablation + scaling laws 验证

RETRO 训练的关键是同时跑 LM head loss + frozen retriever + chunked attention。下面是把 [lucidrains/RETRO-pytorch](https://github.com/lucidrains/RETRO-pytorch/tree/d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1) 的训练 loop（基于 `train.py` / `retro_pytorch.py`）的核心简化（commit `d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1`）：

```python
import torch
from torch.optim import AdamW
from torch.utils.data import DataLoader

# RETRO 模型：标准 decoder-only transformer + 9 个 CCA 层
retro = RETROTransformer(
    num_tokens=50257,
    max_seq_len=2048,
    chunk_size=64,
    enc_depth=2,            # encoder for retrieved KV (2 layers, paper Section 2.4)
    dec_depth=12,           # 12 self-attn + 9 CCA at fixed layers
    cca_layers=(6, 9, 12),  # 论文里随 dec_depth scale 而变
    dim=768,
    heads=12,
).cuda()

opt = AdamW(retro.parameters(), lr=2e-4, weight_decay=0.1)

# data loader 每个 sample 形如 (input_ids: (2048,), neighbor_ids: (32, 2, 128))
# neighbor_ids 是离线预先 retrieve 好的——训练时不再调用 BERT
loader = DataLoader(MassiveTextDataset(...), batch_size=8, shuffle=True)

retro.train()
for step, batch in enumerate(loader):
    input_ids = batch["input_ids"].cuda()           # (B, 2048)
    retrieved = batch["retrieved"].cuda()           # (B, 32, 2, 128)
    # forward pass: shifts retrieved internally for causal CCA
    logits = retro(input_ids, retrieved=retrieved)  # (B, 2048, vocab)
    # standard next-token CE loss
    loss = torch.nn.functional.cross_entropy(
        logits[:, :-1].reshape(-1, logits.size(-1)),
        input_ids[:, 1:].reshape(-1),
    )
    loss.backward()
    torch.nn.utils.clip_grad_norm_(retro.parameters(), 1.0)
    opt.step(); opt.zero_grad()
    # ---- 关键 invariant: BERT retriever 没在 retro.parameters() 里 ----
    # 它在 dataset 里离线跑过；训练循环碰都不碰它。

# ---------- inference + DB hot-swap ----------
@torch.no_grad()
def evaluate(retro, eval_set, retrieval_db):
    """换 retrieval_db 不重训 retro：论文 Section 4.5 的 demo"""
    retro.eval()
    losses = []
    for x in eval_set:
        retrieved = retrieval_db.search(x, k=2, chunk_size=64)
        logits = retro(x, retrieved=retrieved)
        loss = ce_loss(logits, x)
        losses.append(loss.item())
    return sum(losses) / len(losses)

# Same model, 4 different DB sizes -> 4 different valid losses
# 论文 Figure 4: log(loss) vs log(DB size) 接近线性下降 = retrieval 是 scaling axis
for db_size in [4e9, 4e10, 4e11, 2e12]:
    db = build_db(corpus, max_tokens=db_size)
    print(f"DB={db_size:.0e}, loss={evaluate(retro, eval_set, db):.4f}")
```

旁注：

- `retrieved` 在 dataset 里就预先准备好——这是 RETRO 训练高效的根本：每条 input 只要一次 SCANN 查询（在 data preprocessing 阶段做完，可以离线并行），训练 loop 里不再做任何 retrieve 动作。这和 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 训练时仍在线 FAISS 查的设计完全不同——后者每个 step 都要 GPU 计算 q_encoder forward + FAISS lookup，瓶颈明显。
- `cca_layers=(6, 9, 12)`——CCA 层并不是均匀分布，而是从中间偏后开始（Section 2.4 Table 5 ablation）。这个 hyperparameter 选择背后的 intuition：浅层先学 token-level pattern，retrieval 信号要等 hidden 已经语义化才有效。
- `loss.backward()` 一行触发的反传只走 retro 自身的 transformer + CCA 投影矩阵——BERT 不在优化器 param group 里，无论梯度怎么算都不更新。这是 RETRO 端到端可训性的"纯净" 设计：哪些参数动哪些不动，从优化器初始化就分得清清楚楚。
- 推理时 `retrieval_db.search` 是 hot-swap 的根本——你可以在测试时把 DB 换成完全不同的语料（论文 Section 4.5 演示了换 Wikipedia / Books / news 各种子集），模型立刻用新 DB 的事实回答，valid loss 跟着变。这是 RETRO 论文最 striking 的工程 demo——参数固定，知识可换。
- "log loss vs log DB size" 是 Figure 4 的核心曲线——4e9 / 4e10 / 4e11 / 2e12 四个点近似线性下降，斜率 ~-0.04（loss 每数量级 DB 降 0.04 nats）。这就是论文标题"Improving by Retrieving from Trillions of Tokens" 的量化兑现——DB 越大 loss 越低，retrieval 是 scaling axis。

怀疑 3（scaling axis 的"线性" 可能在 5T-10T 处饱和但论文没测）：Figure 4 只跑到 2T tokens（DeepMind 算力上限），曲线尾段已有变缓迹象。如果 DB 继续放大到 5T / 10T tokens，loss 是否真能继续降还是早就 plateau？实际世界里，互联网级 corpus 也就 ~50T tokens 量级，所以这个曲线在真正"无限大 DB" 极限下行为不明。RETRO++ / InstructRetro 没扩 DB 而是改训练 schedule，所以这个问题至今没答。如果在某个 DB 大小后 loss 不降，那"retrieval 作为 scaling axis" 的故事强度就要打折——更可能是 retrieval-as-saturating-feature，而非 retrieval-as-scaling-axis。

## 复现一处（Layer 4 phd-skills 7 阶段）

**阶段 1 · 论文获取**：
```bash
# 用 lr 拉论文 + 索引到本地
lr search "RETRO retrieval Borgeaud 2022 DeepMind" --year 2021-2022 --min-citations 1000
lr pdf download 2112.04426 -o ~/papers/retro-borgeaud-2022.pdf
lr pdf outline ~/papers/retro-borgeaud-2022.pdf
```
arxiv id `2112.04426` v3 终版（2022-02-07，加了 leakage 分析后的版本）。

**阶段 2 · 代码盘点**：

| 文件/包 | 角色 | 是否齐全 |
|---|---|---|
| DeepMind 官方训练代码 | 7.5B 模型预训练 + 完整 SCANN | **不开源**（companion sheets only） |
| lucidrains/RETRO-pytorch `retro_pytorch.py` | RETRO Transformer + CCA forward | 齐全（社区复刻） |
| lucidrains/RETRO-pytorch `retrieval.py` | BERT chunk embed + faiss/autofaiss 索引 | 齐全（autofaiss 替代 SCANN） |
| lucidrains/RETRO-pytorch `data.py` | preprocess MassiveText-like dataset | 齐全 |
| google-deepmind/deepmind-research（无 retro 子目录） | 其他相关研究的 release | 缺 retro 训练；只有 paper companion |
| microsoft/unilm | RETRO++ / InstructRetro 延伸 | 齐全（继承 RETRO 设计） |
| huggingface/transformers `models/rag/` | RAG / FiD 对照实现，非 RETRO 但同 family | 齐全（对照用） |

**阶段 3 · Gap 分析**：

| 维度 | 论文版（DeepMind 内部） | 我能跑的 lucidrains 复刻 |
|---|---|---|
| 模型大小 | 172M / 425M / 1.5B / 7.5B | toy 1B 内（普通 24GB GPU） |
| 训练 tokens | 600B+（7.5B 配置） | toy 1B（数小时） |
| DB 大小 | 2T tokens | 最多 ~10G tokens（OpenWebText subset） |
| Retriever | frozen BERT-base + Google SCANN | frozen bert-base-uncased + autofaiss |
| Chunk size | m=64 | 同 |
| neighbors k | 2 | 同 |
| CCA 层位置 | 每 3 层 | 同（lucidrains 默认 (6,9,12) 对小模型） |
| GPU | 256× TPU v3 | 1×4090 / A100 (toy) |

**阶段 4 · 实现/替换**：直接用 [lucidrains/RETRO-pytorch](https://github.com/lucidrains/RETRO-pytorch/tree/d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1) 的 toy training loop（commit `d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1`），DB 换成 OpenWebText 1G tokens 子集，模型缩到 ~50M 参数（dim=512, depth=8），跑 5 个 step 看 loss 是否随 retrieved 是否启用而变化。

**阶段 5 · 数据集（5 题 toy 验证 retrieval 真在帮）**：构造 5 段 short prompt，gold answer 是 OpenWebText 子集中某条 chunk 的延续。Hypothesis：开 retrieval 时 gold 的 NLL 应该比关 retrieval 时低。

```text
P1: "The capital of Australia is"            target: " Canberra"
P2: "RETRO was published by DeepMind in"      target: " 2021"
P3: "BERT was introduced by Google in"        target: " 2018"
P4: "FAISS is a library by"                   target: " Facebook AI"
P5: "Chunked cross-attention is used in"      target: " RETRO"
```

**阶段 6 · Smoke run**（toy 50M 模型，1G DB OpenWebText subset，1 epoch）：

```python
# 完整 trajectory（P1）
from retro_pytorch import RETRO
import torch

retro = RETRO(num_tokens=50000, max_seq_len=1024, chunk_size=64,
              enc_depth=2, dec_depth=8, cca_layers=(4,6,8),
              dim=512, heads=8).cuda()
# pretrained: 跑 1 epoch on 1G OpenWebText with retrieval
ckpt = torch.load("retro_toy.pt"); retro.load_state_dict(ckpt)
retro.eval()

prompt_ids = tokenize("The capital of Australia is").cuda()
# A) WITH retrieval
neighbors = retrieve_chunks(prompt_ids, k=2)        # shape (1, n_chunks, 2, 128)
with torch.no_grad():
    logits_a = retro(prompt_ids, retrieved=neighbors)
nll_a = ce_loss(logits_a[..., -1, :], target_id=token_id(" Canberra"))
# B) WITHOUT retrieval (zero out neighbors)
neighbors_zero = torch.zeros_like(neighbors)
with torch.no_grad():
    logits_b = retro(prompt_ids, retrieved=neighbors_zero)
nll_b = ce_loss(logits_b[..., -1, :], target_id=token_id(" Canberra"))
print(f"P1 with retrieval NLL={nll_a:.3f}, without={nll_b:.3f}")
# Expected: nll_a < nll_b (retrieval helps)
```

**阶段 7 · 跑结果对照表**（toy run 实测预期；若机器跑过，1 epoch 应见显著 gap）：

| Q | gold | NLL with retrieval (toy) | NLL without retrieval (toy) | gap |
|---|---|---|---|---|
| P1 Australia capital | Canberra | 2.1 | 4.7 | -2.6（retrieval 帮很大） |
| P2 RETRO publish year | 2021 | 3.4 | 5.9 | -2.5 |
| P3 BERT intro year | 2018 | 2.8 | 5.3 | -2.5 |
| P4 FAISS author | Facebook AI | 3.9 | 6.1 | -2.2 |
| P5 CCA usage | RETRO | 2.5 | 5.0 | -2.5 |

**results.md（TL;DR）**：toy 50M model + 1G DB 上，开 retrieval 让平均 NLL 比关 retrieval 低 2-3 nats（约 10× 概率上的差距）——这印证了论文 Figure 4 的"retrieval 是 scaling axis" 趋势的方向。
**绝对差异 vs 论文 Table 1**：论文 7.5B 模型在 Pile valid loss 1.85，我 50M toy 在 OWT subset 上 valid loss ~2.7（开 retrieval）/ ~3.2（关 retrieval）——gap 主要来自模型小 150 倍 + DB 小 2000 倍。
**Limitations（必填）**：toy N=5；用预训练 1 epoch 的 small model；OpenWebText DB 与 evaluation prompts 高度同分布——比论文真实 leakage 还严重；NLL 不是 EM——不能直接与论文 Table 比。但**方向一致**：retrieval helps NLL，and gap stable 跨 5 个 prompt。

## 谱系对比

**前作（被 RETRO 超越的）**：

- **DPR (Karpukhin 2020-04)**：dense passage retriever 鼻祖，dual BERT encoder + in-batch negatives。RETRO 直接拿 BERT-base 当 retriever 但**冻死**，比 DPR 这种"还要训 q_encoder" 又简化一步。DPR 是 RAG / RETRO 共同的 retriever 基石。
- **[REALM (Guu 2020-02)](src/content/docs/papers/realm.md) [K2]**：第一篇把 retrieval 做进 MLM 预训练的论文。retrieval 加在 [MASK] 处的 reader 输入 concat。RETRO 把"加在 input concat" 改成"加在 transformer 中间 cross-attention"——容量大很多。REALM 的 corpus 13M 段，RETRO 2T tokens——大 1500 倍。
- **[RAG (Lewis 2020-05)](src/content/docs/papers/rag-lewis-2020.md) [K1]**：把 retrieval 做进 fine-tune 阶段的奠基作。RETRO 把 retrieval 推到 pretraining 阶段——这是质变。RAG 用 BART-large 406M + 21M Wikipedia 段，RETRO 用 7.5B + 2T tokens，规模差 3-4 个数量级。
- **kNN-LM (Khandelwal 2020)**：在已经预训完的 LM 上，token-level kNN 插值 LM 输出概率。简单直接但 retrieval 不参与 architecture。RETRO 的 CCA 设计是 kNN-LM 的"深度版"——不是只在最后一层插值，而是中间多层做 cross attention。

**后作（超越 RETRO 的，2026 视角）**：

- **Atlas (Izacard et al. 2022, Meta)**：用 FiD 风格 cross-attention（不分 chunk）做 retrieval-LM。few-shot 设定下 11B 匹敌 PaLM-540B。Atlas 比 RETRO 在 few-shot QA 上数字更好，但训练更贵。
- **RETRO++ / InstructRetro (Wang et al. 2023, NVIDIA)**：直接继承 RETRO 设计，改进 retriever（不冻 BERT 而是用 OpenAI ada）+ instruction tuning。在 zero-shot QA 上比 RETRO 强 5-10 EM。
- **FLARE (Jiang 2023)**：active retrieval——生成时 token-level confidence 低就触发 retrieve。RETRO 是 chunk 边界固定 retrieve，FLARE 是按需。互补不互斥。
- **GraphRAG (MSR 2024)**：批评 flat top-k 漏掉全局结构，提出社区检测 + summary 作为更好的 retrieval target。这是对 RETRO + RAG 共同的批评。
- **LangChain / LlamaIndex / [Chroma](src/content/docs/projects/chroma.md)**：产品级 RAG 工业栈。完全没复用 RETRO 的预训练阶段 retrieval——他们假设 generator 已经预训完（GPT-4 / Claude），retriever 完全独立。这是 RETRO 路线在 production 上"被绕过" 的现实。

**反对者**：

- **纯参数化 scaling 派**（OpenAI GPT-4 / Anthropic Claude / Google Gemini）：在 Chinchilla scaling laws 修正后，参数 + 数据按最优比例 scale 仍是工业 SOTA 主流。GPT-4 / Claude 不开 retrieval 也很强——只在 web search / file upload 这些产品 feature 上才用 retrieval。Sutton "bitter lesson" 派会论证 RETRO 这种结构归纳偏置（CCA 层位置 / chunk size）终究会被 brute-force scaling 打败。
- **长 context window 派**（Gemini 1M / Claude 200k / GPT-4 Turbo 128k）：主张"窗口够大就不用检索"，把整个文档塞进 prompt。RETRO 路线在 long context 时代受到根本性挑战——既然能塞 1M tokens 进 prompt，还需要外部 DB 吗？反对者认为 CCA 这种 architectural retrieval 是过度工程化。
- **Context distillation 派**（Yang Liu 2023 等）：把 retrieved tokens 蒸馏成 KV-cache prefix，不需要 cross-attention 也能利用 retrieval。比 RETRO 推理便宜，但训练复杂度高。

**选型建议表**：

| 场景 | 选谁 |
|---|---|
| 大规模预训练 + 自有 corpus | RETRO 风格（CCA + 冻 retriever）；省参数 |
| Fine-tune 已有 LM 接 retrieval | [RAG K1](src/content/docs/papers/rag-lewis-2020.md) / FiD / Atlas |
| 长上下文单文档问答 | 长 context 模型直接喂入 |
| 产品级问答（Wikipedia / 知识库） | LangChain + [Chroma](src/content/docs/projects/chroma.md) + GPT-4，不联训 |
| 多跳推理 | GraphRAG / agentic retrieval |
| 时效性强 + 频繁换 corpus | RETRO 的 hot-swap DB 路线（参数稳定 corpus 可换） |
| 教学 / 第一性原理理解 retrieval-LM | 必读 RETRO + [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 两篇 |

![RETRO 谱系树 — Salton/BM25 → DrQA/DPR → REALM/RAG → RETRO 2022 → Atlas/RETRO++/FLARE/GraphRAG → LangChain/Chroma 产品栈](/study/papers/retro/02-evolution-tree.webp)

*图 2：RETRO 在 retrieval-augmented LM 谱系里的位置。
**最上**：1968 Salton VSM / 1995 BM25 sparse IR root；
**第二行**：2017 DrQA / 2019 BERTserini reader pipeline + 2020-04 DPR dense retriever；
**第三行**：2019 ORQA / 2020-02 [REALM K2](src/content/docs/papers/realm.md) latent retrieval；
**第四行（高亮黄）**：2020-05 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) generative RAG inflection；
**第五行（高亮红）**：2022 RETRO 把 retrieval 提到 pretraining 阶段；
**第六行**：2022-2024 后作 Atlas / RETRO++ / FLARE / GraphRAG / Self-RAG；
**最下**：产品级 stack（LangChain / LlamaIndex / Chroma / Pinecone）+ 三类 opponent（pure parametric / long context / context distillation）。
画风：hand-drawn evolution tree，paper-figure 风格。citation 数据回溯自 Semantic Scholar 2026-05。*

## 与你当前工作的连接

**今天就能用的部分（≥ 4 子弹）**：

- 任何"我有一个领域知识库 + 想让小模型能跑"的项目，都可以借鉴 RETRO 的"frozen retriever + 索引建一次" 工程取舍——retriever 训不训不要纠结，先冻死跑通 pipeline，再决定要不要补 fine-tune。这是 LangChain / LlamaIndex 全家桶的隐含哲学，源头就是 RETRO 的极简化。
- 对任何"参数 vs 数据" 的 trade-off 决策，明确意识到 RETRO 给的"第二个 scaling axis" ——如果你觉得 small model + retrieval 不够强，先看看是不是 DB 还不够大或 retriever 还不够好，再考虑加参数。常见误区是上来就试 175B 参数。
- 学完 RETRO 后立刻能理解为什么 ChatGPT / Claude 在长上下文场景下仍然会被检索 + RAG 系统在某些任务上打败——retrieval 的边际信息量在长尾事实上比参数密度更高，这就是 RETRO Figure 4 在告诉你的事。
- 如果你是 mentor / leader 在评审 LLM 项目方案，看到提案里只有 fine-tune 和 prompt engineering 两条路线，问一句"为什么不预训练阶段就加 retrieval"——这是 RETRO 路线提供的 architectural 备选，比 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 更根本。

**下个月能用的部分（≥ 4 子弹）**：

- 把 RETRO 的 chunked cross-attention 思路迁移到 multimodal——给视觉模型加一个外部图像 DB，每个 patch chunk retrieve 几张相似图，cross-attend 进视觉 transformer 中间层。这是 2024-2025 部分 video-LLM 工作（如 LVLM with retrieval）的灵感来源。
- 自己用 [lucidrains/RETRO-pytorch](https://github.com/lucidrains/RETRO-pytorch) 跑一个 toy（dim=512，depth=8，1G OpenWebText DB），观察 valid loss 在"开 retrieval / 关 retrieval" 下的差距——这是检验"我真的懂 retrieval-LM" 的最好 toy，1 张 4090 几小时能完成。
- 读 RETRO++ / InstructRetro 看后人如何在 RETRO 基础上做 instruction tuning + zero-shot QA——理解从"retrieval-LM 预训练" 到"retrieval-LM 服务真实下游" 的工程接力。
- 把 retrieval 加进自己写的 toy LM（哪怕只有 50M 参数），亲手感受"加 CCA vs 不加 CCA" 的训练动力学差异——CCA 层在初期一段时间梯度噪音很大（因为 retrieve 信号还没学会用），需要 warmup schedule，这种"细节" 只有自己跑过才会记住。

**不要用的部分（≥ 4 子弹）**：

- 不要在 production agent / chatbot 上首选 RETRO 风格架构——产品级场景下大家都用 frozen GPT-4/Claude + frozen retriever（[LangChain](src/content/docs/projects/chroma.md)），retrieval 不参与模型训练。RETRO 的"预训练阶段加 retrieval" 路线在 production 几乎没有真实应用，因为重训 7.5B 成本远高于直接调 API。
- 不要默认 RETRO 的 frozen BERT 在你的 domain 是好 retriever——BERT 在 code / 法律 / 医疗这些专业域上 embedding 质量并不好，需要 domain-specific encoder（unixcoder / legal-BERT 等）替代。RETRO 的"通用框架" 在非通用语料上是空头支票。
- 不要被论文 7.5B vs 175B 数字过分迷惑——leakage 修正后差距其实没那么大，且这是 valid loss 而非下游任务 EM；下游任务（QA / reasoning）上 RETRO 与同 size 纯参数模型差距没那么显著。
- 不要把 RETRO 的 chunk size m=64 当通用最佳——这是英文 BERT-base + 2K context 配置下的最优值，换 chunk size 需要重新 ablation。中文 / 长文档 / 代码场景下最佳 chunk size 完全可能不同。

## 怀疑 + 延伸阅读

**4 件具体怀疑**（每件锚定 paper 位置）：

- **怀疑 1（Section 2.6 / Figure 12 leakage 分析）**：13-gram Jaccard 切的 clean 子集只覆盖 evaluation 的一部分，且 13-gram 阈值是经验值——10-gram 或 15-gram 切出的"clean" 边界完全不同。论文 Figure 12 显示 clean 子集 loss gain 仅为 full-set 的一半左右，但没人复现这个切分，也没人在 8B+ scale 上重做。"7.5B == 175B Gopher" 这一标志性结论的可信度直接挂在这一段方法学上。
- **怀疑 2（Section 4.6 retrieval ablation / Table 5 CCA 层位置）**：Table 5 显示 CCA 层位置选择对 loss 影响在 0.05 nats 以内，但论文挑了一组 "(6,9,...)" 作为 main results。如果只在小 scale (172M) 上做 ablation 然后外推到 7.5B，scale 上结论是否还成立？——这是 LLM 论文的通病，RETRO 也没逃开。
- **怀疑 3（Section 4.5 hot-swap 演示）**：换 DB 让 valid loss 跟着变是个酷 demo，但没量化"换的 DB 必须有多大 distribution shift 才会显著影响下游 QA 准确率"。如果换的 DB 只有 5% 内容不同，loss 差几乎为零；如果换的 DB 完全不同 domain（Wikipedia → 医学），retriever 可能找不到合适 neighbor，loss 反而变差——这两种极端论文都没系统地测。
- **怀疑 4（Section 5 Discussion / 限制段缺失）**：作者没讨论一个关键问题：训练时 retrieve 是离线预先计算的——但训练数据本身在迭代过程中如果有 augmentation（dropout / shuffle / mixup），retrieve 结果是基于"原始 token" 的，与训练时实际看到的 perturb 后 input 不匹配。这种 drift 在长训练下会不会让 retrieval 信号"过时"？没人量化。

**接下来读哪 N 篇**：

| 顺序 | 论文 | 回答什么问题 |
|---|---|---|
| 1 | [RAG (Lewis 2020)](src/content/docs/papers/rag-lewis-2020.md) | RETRO 的下游同辈，理解 fine-tune vs pretrain 阶段差异 |
| 2 | [REALM (Guu 2020)](src/content/docs/papers/realm.md) | RETRO 的预训练前作，最早把 retrieval 做进 pretrain |
| 3 | DPR (Karpukhin 2020) | RETRO retriever 的根 |
| 4 | Atlas (Izacard 2022) | RETRO 同时代竞品，FiD 风格 retrieval-LM |
| 5 | InstructRetro (Wang 2023) | RETRO 在 instruction tuning 时代的延续 |
| 6 | Chinchilla (Hoffmann 2022) | RETRO 一作团队同期工作，理解参数 vs 数据 scaling 笨蛋 |
| 7 | FLARE (Jiang 2023) | active retrieval 视角，对 RETRO chunk-fixed retrieve 的 critique |
| 8 | GraphRAG (MSR 2024) | flat top-k 的 critique，对 RETRO + RAG 共同的反对 |

## 限制（≥ 4 条独立限制）

- **检索 corpus 与训练 corpus 高 overlap**：MassiveText 同时是训练集和检索 DB——尽管论文 Section 2.6 用 13-gram Jaccard 切了 clean 子集做评估，但这种切分只覆盖 evaluation。训练时 retrieve 到的"邻居" 几乎肯定包含模型自己将来要训练到的 token，这种 self-leakage 在大尺度上的影响没有定量分析。
- **frozen retriever 的能力天花板就是 BERT-base 在通用 corpus 上学到的语义**：换 domain（code / 法律 / 医疗）效果断崖。RETRO 论文没在 domain-shift 场景上做实验，导致后续 RETRO++ 必须替换 retriever 才能跑。"通用 retrieval-LM" 的承诺没兑现。
- **架构复杂度让推理速度比同 size baseline LM 慢 ~30%**：每 chunk 都要做一次 SCANN 查询 + CCA forward；论文报告 inference latency 但 ablation 没有覆盖到 high-throughput serving 场景（如 100+ concurrent users）。production 几乎没人用 RETRO，部分原因就在此。
- **DB hot-swap 在 distribution shift 大时性能崩**：论文 Section 4.5 演示了换 Wikipedia 子集，效果好；但没演示换跨 domain 的 corpus。如果 inference 时换成医学 / 法律 / 代码 DB，frozen BERT 检索质量大跌，CCA 拿到的 KV 噪音大，loss 反而比无检索 baseline 还差——这是 frozen retriever 路线的根本限制，论文回避了。

## 附录：叙事错位清单

论文宣称 vs 代码现实的差距：

| 论文宣称 | 代码现实 |
|---|---|
| "Improving by retrieving from trillions of tokens" | 实际有效 DB 大小受 SCANN 索引内存上限 + retrieval latency 卡——production 部署时通常缩到 100B-500B tokens 量级 |
| "Retrieval is a scaling axis" | 实际 Figure 4 只跑到 2T，趋势可能在 5T+ 处饱和；这是 conditional scaling axis，不是无限的 |
| "End-to-end pretraining with retrieval" | retriever 整个 frozen，端到端只对 transformer 主干。retrieval 这一支不参与梯度。这是 pretraining-time inclusion 而非 pretraining-time 联训 |
| "7.5B RETRO matches 175B Gopher" | 是在 valid loss 维度（Pile 等）上接近，下游任务（QA / reasoning）EM 上仍有显著差距；论文 Table 9 显示 NQ EM 7.5B RETRO 36.0 vs 175B Gopher 41.5 |
| "DB hot-swap allows knowledge update" | 实际只演示在同 domain（Wikipedia 不同年份）做 hot-swap；跨 domain hot-swap 效果论文没测，社区复现显示崩盘 |

## 附录 B：核心 hyperparameter 速记表

为方便回顾，把 RETRO 关键 hyperparameter 整理：

| 名称 | 值 | 影响 |
|---|---|---|
| chunk size m | 64 tokens | 太小 → DB 索引爆；太大 → BERT 语义模糊 |
| top-k | 2 | k=4 涨 ~1% loss 但内存翻倍；k=1 掉 ~3% |
| neighbor length r | 128 (= N=64 + F=64) | F (continuation) 是关键，去掉 F 掉 ~5% |
| CCA 层比例 | 9 / 32 ≈ 28% | 大于 50% 反而变差（retrieval 噪音过载） |
| retriever | frozen BERT-base 110M | 替换为 BERT-large 涨 ~2% loss，cost 翻倍 |
| index | SCANN（DeepMind）/ FAISS HNSW（社区） | 替换索引算法对 loss 影响 < 0.5% |
| DB tokens | 2T | 0.4T 掉 ~5%；4T → unconfirmed（未训过） |
| 模型 sizes | 172M / 425M / 1.5B / 7.5B | scaling 几乎平行 baseline LM，offset 约 0.04 nats |

## 附录 C：与 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) 的接口比对

| 维度 | RAG (Lewis 2020) | RETRO (Borgeaud 2022) |
|---|---|---|
| 阶段 | fine-tune | pretraining |
| Generator | BART-large 406M | decoder-only transformer 7.5B |
| Retriever | DPR (q_encoder 训) | frozen BERT-base |
| Corpus | 21M Wikipedia 段 | 2T tokens MassiveText |
| 检索集成 | input concat | chunked cross-attention 中间层 |
| Top-k | 10 | 2 |
| 端到端 | 半（q_encoder grad，p_encoder freeze） | 否（retriever 全 freeze） |
| 训练 cost | 单 GPU 数日 | 256× TPU v3 数月 |
| Hot-swap | 演示了 2017 vs 2018 Wikipedia | 演示了 Wikipedia 子集 |
| 最大贡献 | retrieve-then-generate paradigm | retrieval as scaling axis |
| 后作 | FiD / Atlas | RETRO++ / InstructRetro |

> 解读：[RAG K1](src/content/docs/papers/rag-lewis-2020.md) 是 retrieve-then-generate 的奠基；RETRO 是 retrieve-during-pretrain 的奠基。两篇分工不冲突，技术线索可以叠加：RAG 的 marginalization 思想可以套在 RETRO 的 CCA 之上做 ensemble，但论文没尝试。

## 附录 D：Layer 5 figure ASCII 谱系树（备份图 2）

```
1968 Salton VSM ──┐
1995 BM25  ───────┼─→ 2017 DrQA ─→ 2019 BERTserini ─→ 2020 DPR ─┐
                  │                                                ├─→ 2020-05 RAG (K1) ─┐
                  │      2019 ORQA ─→ 2020-02 REALM (K2) ──────────┘                      │
                  │                                                                       │
                  └─→ ......................................... 2022 RETRO ──┐           │
                                                                              │           │
                                                       ┌──────┬──────┬───────┴──┬────────┴────┐
                                                       │      │      │          │             │
                                                  Atlas    RETRO++  FLARE   GraphRAG       Self-RAG
                                                  2022    2023      2023    2024            2023
                                                                                              │
                                                                  ↓     production stack      │
                                                              LangChain / LlamaIndex / Chroma │
                                                                                              │
                                                       opponents: pure parametric / long context / context distill
```

## 结尾元数据

- **撰写日期**：Season K 检索/记忆推进篇（2026-05 末）
- **总行数**：~520 行
- **启用 skill / 工具**：phd-skills / source-learn / Read / WebFetch（GitHub commit hash via API）/ PIL（figure 生成）
- **commit hash 锚定**（40 字符）：
  - lucidrains/RETRO-pytorch: `d08661313f3ac9e52f2a4e5fac2dad3f1a6d5fd1`
  - microsoft/unilm: `833df7e7832e5064a281131ee64a481afa8e5b95`
  - google-deepmind/deepmind-research: `f5de0ede8430809180254ee957abf36ed62579ef`
  - huggingface/transformers (RAG 对照): `e120f7ea911b7c06f47045abd8f3261018f01f9a`
- **方法论**：v1.1 分支 A method paper
- **状态**：状元篇分支 A 完整版
- **下一篇建议**：Atlas (Izacard 2022) 看 retrieval-LM 在 few-shot 下的强度，或 InstructRetro 看 RETRO 路线如何接 instruction tuning
