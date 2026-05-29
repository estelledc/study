---
title: 论文候选 — 信息检索 / 搜索引擎 / 推荐系统
description: 50 篇候选，由 research subagent 整理，待主 CC 排期写入正式 papers/
日期: 2026-05-29
---

# 信息检索 / 搜索引擎 / 推荐系统主题候选

候选 50 篇，按 13 个子主题分组。覆盖 1960-2023，避开 study 站现有 RAG 系列（rag-lewis-2020 / retro / graphrag）以及 papers-databases.md 已有的搜索/向量索引本体（hnsw / product-quantization / diskann / faiss / milvus）。

## 奠基（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `salton-vsm-1975` | A Vector Space Model for Automatic Indexing | 1975 | Salton-Wong-Yang 把文档与查询表示成向量、用余弦相似度排序——所有现代 IR / embedding / 向量检索的祖宗思想 | https://dl.acm.org/doi/10.1145/361219.361220 |
| `okapi-bm25-1994` | Some Simple Effective Approximations to the 2-Poisson Model for Probabilistic Weighted Retrieval | 1994 | Robertson-Walker 的 BM25 原始形式，30 年后仍是绝大多数检索系统的强 baseline，理解 IDF×TF 饱和函数必读 | https://dl.acm.org/doi/10.5555/188490.188561 |
| `maron-kuhns-1960` | On Relevance, Probabilistic Indexing and Information Retrieval | 1960 | 概率检索范式的开山，引入"相关性概率"作为排序目标——BM25 / 语言模型 / 神经 IR 都是它的远房后代 | https://dl.acm.org/doi/10.1145/321033.321035 |

## 链接分析与 PageRank 系列（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `pagerank-1998` | The PageRank Citation Ranking: Bringing Order to the Web | 1998 | Page-Brin-Motwani-Winograd 的 Stanford 技术报告，用随机游走对网页打分；Google 帝国的根 | http://ilpubs.stanford.edu:8090/422/ |
| `hits-1999` | Authoritative Sources in a Hyperlinked Environment | 1999 | Kleinberg 的 hub/authority 双向特征值算法，与 PageRank 同期但思路对偶；理解链接分析两条流派 | https://www.cs.cornell.edu/home/kleinber/auth.pdf |
| `trustrank-2004` | Combating Web Spam with TrustRank | 2004 | Gyongyi-Garcia-Molina 用半监督 PageRank 抗 web spam；现代反作弊 / 反垃圾邮件 / 信誉系统的源头 | https://www.vldb.org/conf/2004/RS15P3.PDF |
| `simrank-2002` | SimRank: A Measure of Structural-Context Similarity | 2002 | Jeh-Widom 定义"两节点相似当且仅当它们的邻居相似"的递归相似度；图嵌入 / 推荐召回里仍在用 | http://ilpubs.stanford.edu:8090/508/ |
| `personalized-pagerank-2003` | Scaling Personalized Web Search | 2003 | Jeh-Widom 把 PageRank 个性化；今天的 GNN 推荐 / 社交图召回都沿用这套数学 | http://ilpubs.stanford.edu:8090/596/ |

## Web search 工程（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `google-1998` | The Anatomy of a Large-Scale Hypertextual Web Search Engine | 1998 | Brin-Page 的原始 Google 论文，包含 crawler / 倒排索引 / 链接结构 / PageRank 全栈；理解搜索引擎工程化的入口 | http://infolab.stanford.edu/~backrub/google.html |
| `indri-2005` | Indri: A Language Model-based Search Engine for Complex Queries | 2005 | UMass CIIR 的搜索引擎，把语言模型 / 推断网络 / 结构化查询统一；学术 IR 系统的代表实现 | https://ciir.cs.umass.edu/pubfiles/ir-407.pdf |
| `anserini-2017` | Anserini: Enabling the Use of Lucene for Information Retrieval Research | 2017 | Lin 团队基于 Lucene 的可复现 IR 工具包，BEIR / MS MARCO 等评测的事实底座；现代神经 IR 论文几乎都用它做 baseline | https://cs.uwaterloo.ca/~jimmylin/publications/Yang_etal_SIGIR2017.pdf |

## 倒排索引与查询执行（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `croft-harper-1979` | Using Probabilistic Models of Document Retrieval Without Relevance Information | 1979 | Croft-Harper 在没有相关性反馈的情况下做概率检索，奠定 BM25 的理论桥梁；Croft 学派的入门 | https://citeseerx.ist.psu.edu/document?doi=10.1.1.108.7708 |
| `anh-moffat-2005` | Inverted Index Compression Using Word-Aligned Binary Codes | 2005 | Anh-Moffat 的字对齐编码把倒排表压到接近熵下限，至今 Lucene / Tantivy / Vespa 仍在用 | https://link.springer.com/article/10.1007/s10791-005-5660-0 |
| `block-max-wand-2011` | Faster Top-k Document Retrieval Using Block-Max Indexes | 2011 | Ding-Suel 的 Block-Max WAND，早停跳过低分块；现代 Lucene / Anserini / Tantivy 默认走这条路 | http://engineering.nyu.edu/~suel/papers/bmw.pdf |

## 学习排序 LTR（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `ranknet-2005` | Learning to Rank using Gradient Descent | 2005 | Burges 团队 RankNet 用 pairwise cross-entropy 训神经网络做排序；学习排序范式的奠基 | https://www.microsoft.com/en-us/research/wp-content/uploads/2005/08/icml_ranking.pdf |
| `lambdarank-2006` | Learning to Rank with Nonsmooth Cost Functions | 2006 | Burges 把 NDCG 等不可导指标的梯度直接定义出来；把"排名指标 → 梯度"的工程小聪明合理化 | https://papers.nips.cc/paper_files/paper/2006/hash/af44c4c56f385c43f2529f9b1b018f6a-Abstract.html |
| `lambdamart-2010` | From RankNet to LambdaRank to LambdaMART: An Overview | 2010 | Burges 的 MSR 技术报告，串起 RankNet → LambdaRank → LambdaMART；至今 Bing / 美团 / 淘宝精排还在用 | https://www.microsoft.com/en-us/research/publication/from-ranknet-to-lambdarank-to-lambdamart-an-overview/ |
| `gbrank-2007` | A Regression Framework for Learning Ranking Functions Using Relative Relevance Judgments | 2007 | Zheng-Zha-Sun 的 GBRank，把 GBDT 应用到 pairwise 排序；理解 GBDT 在 IR 实战胜过神经网络的早期证据 | https://www.cc.gatech.edu/~zha/papers/fp086-zheng.pdf |

## 神经 IR（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `dssm-2013` | Learning Deep Structured Semantic Models for Web Search using Clickthrough Data | 2013 | 微软 DSSM 用孪生 DNN + 点击数据做语义匹配；双塔 / 向量检索的鼻祖，比 sentence-BERT 早 5 年 | https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/cikm2013_DSSM_fullversion.pdf |
| `drmm-2016` | A Deep Relevance Matching Model for Ad-hoc Retrieval | 2016 | Guo-Fan-Croft 提出"匹配是相关性而非语义相似"，用直方图特征做 query-doc 交互；理解 IR 与 NLU 任务差异的关键 | https://arxiv.org/abs/1711.08611 |
| `knrm-2017` | End-to-End Neural Ad-hoc Ranking with Kernel Pooling | 2017 | Xiong-Dai-Callan 用核函数池化把交互矩阵转成可微分排序信号；早期 BERT 之前最强神经 ranker | https://arxiv.org/abs/1706.06613 |
| `colbert-2020` | ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT | 2020 | Khattab-Zaharia 的 late interaction，用 token 级最大相似度兼顾效率与效果；MS MARCO 长青 baseline | https://arxiv.org/abs/2004.12832 |
| `splade-2021` | SPLADE: Sparse Lexical and Expansion Model for First Stage Ranking | 2021 | Formal-Piwowarski-Clinchant 用学习到的稀疏向量直接复用倒排索引；连接 BM25 与稠密检索两派 | https://arxiv.org/abs/2107.05720 |

## 稠密检索（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `dpr-2020` | Dense Passage Retrieval for Open-Domain Question Answering | 2020 | Karpukhin 等的 DPR，用对比学习训双塔 BERT；开放域 QA 检索范式从此换轨 | https://arxiv.org/abs/2004.04906 |
| `ance-2020` | Approximate Nearest Neighbor Negative Contrastive Learning for Dense Text Retrieval | 2020 | Xiong 等用 ANN 检索结果当 hard negatives 在线挖掘；解决 DPR 训练 negative 太弱的硬伤 | https://arxiv.org/abs/2007.00808 |
| `rocketqa-2021` | RocketQA: An Optimized Training Approach to Dense Passage Retrieval for Open-Domain QA | 2021 | 百度团队用 cross-batch negative + 去噪 + 数据增强组合拳；中文检索社区的工业级 recipe | https://arxiv.org/abs/2010.08191 |
| `cocondenser-2021` | Unsupervised Corpus Aware Language Model Pre-training for Dense Passage Retrieval | 2021 | Gao-Callan 的 coCondenser，预训练阶段就让 [CLS] 学会聚合段落语义；检索专用预训练范式的代表 | https://arxiv.org/abs/2108.05540 |
| `e5-2022` | Text Embeddings by Weakly-Supervised Contrastive Pre-training | 2022 | 微软 E5 用弱监督 + 对比学习训通用 embedding；MTEB 榜单代表，BGE / GTE 后继者的范式来源 | https://arxiv.org/abs/2212.03533 |

## 跨模态与召回检索（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `filip-2021` | FILIP: Fine-grained Interactive Language-Image Pre-Training | 2021 | 华为诺亚 FILIP 把 CLIP 的图文对齐细化到 token 级最大相似度；跨模态检索精度的关键升级 | https://arxiv.org/abs/2111.07783 |
| `youtube-two-tower-2019` | Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations | 2019 | YouTube 把 Google 双塔召回工业化，含 in-batch negative + 频次纠偏；推荐召回的事实标准 | https://dl.acm.org/doi/10.1145/3298689.3346996 |
| `ms-marco-2016` | MS MARCO: A Human Generated MAchine Reading COmprehension Dataset | 2016 | 微软发布 880 万段落 + 100 万查询的检索 / QA 评测集；现代神经 IR 论文不评 MS MARCO 几乎不能投稿 | https://arxiv.org/abs/1611.09268 |

## 推荐系统经典（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `netflix-bellkor-2009` | The BellKor Solution to the Netflix Grand Prize | 2009 | Koren 团队夺冠方案，融合 SVD / RBM / 时序 bias；推荐竞赛史上最重要的工程报告 | https://www.netflixprize.com/assets/GrandPrize2009_BPC_BellKor.pdf |
| `koren-mf-2009` | Matrix Factorization Techniques for Recommender Systems | 2009 | Koren-Bell-Volinsky IEEE Computer 总结 MF 系列；CF 时代的标准教科书章节 | https://www2.seas.gwu.edu/~simhaweb/champalg/cf/papers/KorenBellVolinsky2009.pdf |
| `slim-2011` | SLIM: Sparse Linear Methods for Top-N Recommender Systems | 2011 | Ning-Karypis 用稀疏线性回归学 item-item 相似矩阵；至今 Top-N 推荐的强 baseline | http://glaros.dtc.umn.edu/gkhome/fetch/papers/SLIM2011icdm.pdf |
| `bpr-2009` | BPR: Bayesian Personalized Ranking from Implicit Feedback | 2009 | Rendle 提出 pairwise loss 处理隐式反馈；今天所有"用户点击 → 排序"模型都在用这个范式 | https://arxiv.org/abs/1205.2618 |
| `neumf-2017` | Neural Collaborative Filtering | 2017 | He 等的 NeuMF，用 MLP 替代 MF 内积；推荐系统进入深度学习时代的标志论文 | https://arxiv.org/abs/1708.05031 |

## 现代推荐（6 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `wide-deep-2016` | Wide & Deep Learning for Recommender Systems | 2016 | Google Play 把记忆 (wide) 与泛化 (deep) 联合训练；现代 CTR 模型双塔结构的祖先 | https://arxiv.org/abs/1606.07792 |
| `dcn-2017` | Deep & Cross Network for Ad Click Predictions | 2017 | Google 用 cross network 显式学高阶特征交叉；DCN-V2 至今仍是字节 / 阿里精排标配 | https://arxiv.org/abs/1708.05123 |
| `din-2018` | Deep Interest Network for Click-Through Rate Prediction | 2018 | 阿里妈妈 DIN，用 attention 在用户行为序列里挑出与候选相关的；电商推荐范式革新 | https://arxiv.org/abs/1706.06978 |
| `dlrm-2019` | Deep Learning Recommendation Model for Personalization and Recommendation Systems | 2019 | Meta 开源 DLRM，定义了"embedding table + MLP + 特征交互"的工业级架构；推荐系统硬件协同设计的标尺 | https://arxiv.org/abs/1906.00091 |
| `sasrec-2018` | Self-Attentive Sequential Recommendation | 2018 | Kang-McAuley 把 Transformer 引入序列推荐，单向 self-attention 对 GRU4Rec 全面胜出；序列建模标志 | https://arxiv.org/abs/1808.09781 |
| `bert4rec-2019` | BERT4Rec: Sequential Recommendation with Bidirectional Encoder Representations from Transformer | 2019 | Sun 等把 BERT MLM 用到序列推荐双向建模；理解推荐与 NLP 范式互通的关键节点 | https://arxiv.org/abs/1904.06690 |

## 大规模索引与哈希学习（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `scann-2020` | Accelerating Large-Scale Inference with Anisotropic Vector Quantization | 2020 | Google ScaNN 提出各向异性损失下的乘积量化；ANN benchmark 长期占据 Pareto 前沿 | https://arxiv.org/abs/1908.10396 |
| `spann-2021` | SPANN: Highly-efficient Billion-scale Approximate Nearest Neighborhood Search | 2021 | 微软 SPANN 把内存索引 + 磁盘 posting list 分层；十亿级向量内存占用降一个数量级 | https://arxiv.org/abs/2111.08566 |
| `lsh-indyk-1998` | Approximate Nearest Neighbors: Towards Removing the Curse of Dimensionality | 1998 | Indyk-Motwani 的 LSH 原始论文，证明高维 ANN 可以亚线性查询；后续所有哈希学习的理论起点 | https://www.cs.princeton.edu/courses/archive/spring04/cos598B/bib/IndykM-curse.pdf |
| `minhash-broder-1997` | On the Resemblance and Containment of Documents | 1997 | Broder 提出 MinHash 估算 Jaccard 相似度；AltaVista 去重、Google 网页去重、推荐 retrieval 全在用 | https://www.cs.princeton.edu/courses/archive/spring13/cos598C/broder97resemblance.pdf |
| `simhash-charikar-2002` | Similarity Estimation Techniques from Rounding Algorithms | 2002 | Charikar 的 SimHash，用随机超平面把余弦相似度转成汉明距离；Google 网页去重的核心算法 | https://www.cs.princeton.edu/courses/archive/spring04/cos598B/bib/CharikarEstim.pdf |

## Query 理解（2 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `doc2query-2019` | Document Expansion by Query Prediction | 2019 | Nogueira 等让 seq2seq 给文档预测可能的查询并附加进倒排表；BM25 + doc2query 一度逼近神经 IR | https://arxiv.org/abs/1904.08375 |
| `rm3-2001` | Relevance-Based Language Models | 2001 | Lavrenko-Croft 的语言模型框架下的伪相关反馈 (RM3)；今天仍是 IR 工具包默认的查询扩展方法 | https://ciir.cs.umass.edu/pubfiles/ir-225.pdf |

## Spell correction（1 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `brill-moore-2000` | An Improved Error Model for Noisy Channel Spelling Correction | 2000 | Brill-Moore 在 Kernighan-Church 噪声信道模型基础上引入广义编辑操作；现代搜索框拼写纠错的算法骨架 | https://aclanthology.org/P00-1037/ |

---

## 备注

- 全部 50 篇均有公开 PDF 或 ACM/Springer DOI
- 时间跨度 1960-2023，涵盖 13 个子主题
- 已避开 study 站现有 RAG 系列（rag-lewis-2020 / retro / graphrag）以及 papers-databases.md 已有向量索引（hnsw / product-quantization / diskann / faiss / milvus）
- 同时避开 papers-machine-learning.md 候选中的 atlas-2022 / replug-2023 / self-rag-2023 / align-2021
- 选择策略：奠基（salton / bm25 / maron-kuhns / pagerank / hits）+ 倒排索引工程（anh-moffat / block-max-wand）+ 学习排序（ranknet→lambdamart）+ 神经 IR 双线（交互式 colbert/splade、稠密 dpr/ance）+ 推荐系统两代（mf/bpr/neumf → wide-deep/din/dlrm/sasrec）+ 工业级哈希索引（scann/spann/lsh/minhash/simhash）+ 经典 query 理解 / 拼写纠错收尾
