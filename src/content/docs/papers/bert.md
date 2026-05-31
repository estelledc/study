---
title: BERT — 双向 Transformer 预训练
来源: 'Devlin et al., "BERT: Pre-training of Deep Bidirectional Transformers", NAACL 2019'
日期: 2026-05-29
分类: NLP
难度: 中级
---

## 是什么

BERT（**Bidirectional Encoder Representations from Transformers**）是 2018 年 Google 把 [[attention]] 论文里的 encoder 部分单独拿出来，**先用海量文本预训练、再用几千条样本微调**做出来的语言模型。

日常类比：

> 先让机器读完整个图书馆的书（预训练），再花一周教它做一项具体工作（微调）——这台机器比一个从零学的"专家"还强。

读懂这句话就读懂了 BERT 的核心：**预训练捕获通用语言知识，微调把通用知识接到具体任务**。这是过去 10 年 NLP 最重要的范式转变。

## 为什么重要

不理解 BERT，下面这些事都没法解释：

- 为什么 2018 之后 NLP 论文几乎都从「预训练 checkpoint + 微调」开始，而不是从零训模型
- 为什么 GLUE / SQuAD / MultiNLI 这些榜单 2018 年底被同一个模型同时刷新——**12 个 NLP 任务全 SOTA**
- 为什么 Google 搜索 2019-2020 年悄悄改了排序逻辑：他们把 BERT 加进去，**10% 查询效果提升**
- 为什么后来所有大语言模型（GPT 系、[[t5]]、[[llama]]）都建在 BERT 概念基础上——预训练 + 双向上下文 + Transformer encoder

引用数 100k+，是 NLP 史上 Top 3 引用论文之一。BERT 这个名字在 2018-2020 年几乎等同于「NLP 模型」本身。

## 核心要点

BERT 在三件事上跟同期工作不同：

1. **双向上下文（Bidirectional）**：每一层 self-attention 让每个 token **同时**看到左右两侧。GPT-1 是单向（只看左边），ELMo 是「浅双向」（两个独立 LSTM 最后拼接）。BERT 是真正的「深双向」——从第一层到最后一层都在融合两侧信息。

2. **MLM（Masked Language Model）**：随机盖住 15% 的 token（用 `[MASK]` 替换），让模型从剩下 85% 的双向上下文预测被盖住的词。**为什么必须遮？** 如果直接训「双向预测词」，模型能直接抄答案。盖住一部分制造真正的预测任务，又保留了双向能力。

3. **NSP（Next Sentence Prediction）**：训练时给两个句子 A、B，问 B 是否真是 A 的下一句。设计初衷是让 `[CLS]` 学到句对级语义。**后来 RoBERTa 证明这个任务没必要**——它的好处其实来自「让模型见到更多上下文长度变化」之外的副作用，BERT 论文把它当核心贡献是过度归因。

## 实践案例

### 案例 1：MLM 预训练在做什么

```
原句：  我  爱  吃  鱼
盖住：  我  爱  [MASK]  鱼
模型预测 [MASK] 位置 → P(吃) = 0.92, P(看) = 0.05, P(养) = 0.02 ...
```

模型必须**同时**看左边「我 爱」和右边「鱼」才能正确填出「吃」。光看左边可能猜「看 / 养」，光看右边可能猜「钓 / 卖」。这就是双向上下文的力量。

实际实现里，遮罩比例是 80/10/10：80% 替换成 `[MASK]`、10% 换成随机词、10% 保持原词不变。后两种是为了缓解「pretrain 阶段满屏 `[MASK]`、finetune 阶段一个 `[MASK]` 都没有」的分布不一致问题。这个比例本身是工程经验，不是数学最优。

### 案例 2：微调情感分类

```
输入：  [CLS] 这家餐厅服务很差 [SEP]
       ↓ BERT encoder 12 层
       ↓ 取 [CLS] 位置最后一层 hidden（768 维向量）
       ↓ 接一层线性分类头
输出：  P(positive) = 0.03, P(negative) = 0.97
```

整个过程**端到端微调**：BERT 的所有参数都解冻参与梯度。3-4 个 epoch、学习率 2e-5、batch 16-32 就能在小数据集上得到好结果。预训练提供了强初始化，下游任务只需要"小幅调整"。

### 案例 3：与 GPT 的对比

| 维度 | GPT-1（2018-06） | BERT（2018-10） |
|---|---|---|
| 方向 | 单向（左→右） | 双向 |
| 预训练任务 | 预测下一个词 | 预测被盖住的词 |
| 架构 | Transformer decoder | Transformer encoder |
| 强项 | 生成 | 理解 |
| 适用任务 | 对话、续写、代码生成 | 分类、检索、问答抽取 |

GPT 像同传翻译，只能基于已经听到的内容判断；BERT 像填空题选手，能同时利用前后所有线索。两条路线后来分化：生成任务走 GPT 路线（ChatGPT、[[llama]]），理解 / 检索 / 分类仍走 BERT 路线（BGE、E5、Sentence-BERT）。

考虑这句话：「The animal didn't cross the street because **it** was too tired」——`it` 指 animal 还是 street？要判断这一点必须**同时**看左边的 animal 和右边的 too tired。GPT 读到 `it` 时只看左边，要等读完才能补判断；BERT 第一层就能联合两侧信息，这正是它在 GLUE / SQuAD 这类理解任务上碾压 GPT-1 的根本原因。

## 踩过的坑

1. **输入最长 512 token**：position embedding 表只有 512 行，长文档要切片处理。后来 RoPE / ALiBi 等位置编码让 BERT 衍生模型（ModernBERT 等）支持 8k+ context，但**原始 BERT** 卡在 512。

2. **`[CLS]` 不一定包含全文信息**：早期被神化为「句子语义向量」，但实际它只在 NSP 任务上被训过——直接用作 sentence embedding 效果一般。Sentence-BERT（2019）专门训了一套对比损失才让它真正能做相似度检索。读论文要警惕「论文里说重要，但工程里不能这么用」的设计。

3. **小数据集微调不稳定**：GLUE 中 RTE 只有 2.5k 样本，约 30% 的微调 run 会发散到 chance level。解法：小学习率（2e-5 ~ 5e-5，比预训练 1e-4 小一个数量级）+ warmup（前 10% 步线性升到峰值）+ 多个 seed 跑出最好的。这是 BERT 时代的"黑魔法"常识。

4. **NSP 任务后来被证明无效**：RoBERTa（2019）实验砍掉 NSP 反而效果更好。BERT 论文反复强调 NSP 是「关键贡献之一」，但消融实验做得不彻底——这是早期深度学习论文的通病：先有结果，再编故事。读论文要分清「真因果」和「事后归因」。

5. **预训练 hardware 门槛高**：BERT-base 用 16 TPU 训 4 天，BERT-large 用 64 TPU 训 4 天，2018 年只有 Google 能跑。后来 RoBERTa 证明小幅调整能大幅提升，但「小幅调整」也要 1024 V100 × 1 天。学术界从此进入「rich get richer」时代——这是 BERT 留给后来者的副作用，到 GPT-3 时代彻底无法被学术界复现。

## 历史小故事（可跳过）

- **2017**：Vaswani 等提出 [[attention]]，纯 attention 替代 RNN，但还没人系统化「预训练 + 微调」
- **2018-02**：ELMo（Peters et al.）用双向 LSTM + 拼接做第一代「上下文 embedding」
- **2018-06**：GPT-1（Radford et al.）单向 decoder + 微调，Transformer 工程价值首次显形
- **2018-10**：**BERT 发布**——双向 encoder + 预训练权重公开 + 11 任务全 SOTA，三件事一起爆发
- **2019-07**：RoBERTa 同架构调训练流程（砍 NSP / 动态 mask / 更大 batch / 更多数据），证明 BERT 训练 budget 没用满
- **2020-05**：GPT-3 用 decoder-only + 海量数据 + zero-shot 反超，"BERT 已死"论调出现
- **2023+**：RAG 兴起后 BERT 系 embedding（BGE、E5）反成基础设施——架构和任务的匹配度是长期问题

之后的故事大家都熟：decoder-only 路线（GPT 系、[[llama]]）做生成对话，encoder-only 路线（BERT 系）做检索分类，两条线**不是替代关系**，是不同任务的最优工具。

## 学到什么

1. **预训练 + 微调范式是 NLP 史上最重要的工作流胜利**——把昂贵预训练做一次，下游每个任务复用。这套思路后来扩展到 CV（ImageNet 预训练）、多模态（CLIP）、agent（基础模型 + tool use）。**不是技术发明，是工作流组织上的胜利**
2. **`[MASK]` trick 是「巧思」级设计**：用极简方式（随机遮 + 预测原词）解决了「双向 LM 不能看自己」的悖论。这种「不靠数学发明，靠任务设计」的思路后来在 MAE（遮图像 patch）、SimCLR（对比学习）、ELECTRA（replaced token detection）反复出现
3. **论文里的「关键设计」要警惕**：NSP 写得像核心贡献，一年后被 RoBERTa 砍掉效果更好——读 paper 要分清「真原则」（双向、预训练 + 微调）和「噪声细节」（具体 80/10/10 比例、NSP 这种事后归因）
4. **架构和任务的匹配度是长期问题**：2020-2022 大家以为 BERT 已死，2023+ RAG 兴起后 BERT 系 embedding 反成基础设施。**scale 不能解决一切**——架构选择需要考虑任务特征
5. **命名是一份模板级的学术沟通**：Bidirectional Encoder Representations from Transformers，每个词都精准对应论文核心：Bidirectional（vs GPT 单向）、Encoder（vs decoder）、Representations（而非 generation）、from Transformers（不是 RNN）。论文的命名直接说出了与同期工作的差异
6. **理论 → 算法 → 工程，每一步隔约 1-2 年**：2017 [[attention]] 出 → 2018-06 GPT-1 用 Transformer 做单向预训练 → 2018-10 BERT 双向预训练 + 公开权重，催化了下游百花齐放。**开源权重比开源论文影响更大**——学术界第一次能站在公司预训练的肩膀上做研究

## 延伸阅读

- 论文 PDF：[BERT arXiv 1810.04805](https://arxiv.org/abs/1810.04805)（16 页，密度适中，前 6 页读完就懂主线）
- 官方代码：[google-research/bert](https://github.com/google-research/bert)（TF1，论文同款数值，但 TF1 静态图风格不直观）
- HuggingFace 实现：[transformers/models/bert/modeling_bert.py](https://github.com/huggingface/transformers/blob/main/src/transformers/models/bert/modeling_bert.py)（PyTorch，OOP 清晰，工程模板）
- 视频精读：[Yannic Kilcher — BERT Explained](https://www.youtube.com/watch?v=-9evrZnBorM)（45 分钟，逐图讲透）

## 关联

- [[attention]] — BERT 的 backbone 就是 Transformer encoder，BERT 没改架构只改了训练目标
- [[t5]] — 把所有任务统一成 text-to-text，是 BERT 路线的 encoder-decoder 演化
- [[llama]] — decoder-only 大模型代表，与 BERT 是 NLP 两条主干路线之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adamw-2017]] —— AdamW — 把 weight decay 从梯度里拆出来
- [[ance-2020]] —— ANCE — 让模型自己挖训练负例，对比学习的"自给自足"
- [[attention]] —— Attention Is All You Need
- [[bert4rec-2019]] —— BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模
- [[causal-abstraction]] —— Causal Abstraction — 神经网络与算法的因果对齐
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[coca-2022]] —— CoCa — 把对比和生成两种多模态训练目标合到一个模型里
- [[cocondenser-2021]] —— coCondenser — 让 BERT 的 [CLS] 在预训练就学会"代表整段话"
- [[colbert-2020]] —— ColBERT — 让 BERT 检索既准又能扛大规模
- [[colbert-v2]] —— ColBERTv2 — 让向量检索既精又能扛百万文档
- [[deberta-2021]] —— DeBERTa — 把"内容"和"位置"拆成两路独立看的 BERT
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[dpr-2020]] —— DPR — 用 BERT 双塔把检索从 BM25 时代拉进稠密向量时代
- [[drmm-2016]] —— DRMM — 检索里的匹配是相关性不是语义相似
- [[dssm-2013]] —— DSSM — 把 query 和文档各编码成 128 维向量再算余弦
- [[e5-2022]] —— E5 — 用海量"自然出现的文本对"训通用 embedding
- [[electra-2020]] —— ELECTRA — 把猜词题改成判真假题，训练效率 4 倍
- [[elmo-2018]] —— ELMo — 让词向量随上下文变化
- [[faiss-2017]] —— FAISS 2017 — 用 GPU 在十亿向量里找最近邻
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[longformer-2020]] —— Longformer — 滑窗加少数全局 token，把长文档喂进 Transformer
- [[mae]] —— MAE — Masked Autoencoders
- [[maml-2017]] —— MAML — 学一个"好起点"，几步就能学会新任务
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基
- [[realm]] —— REALM — 把检索器和 BERT 一起预训练的第一篇论文
- [[reformer-2020]] —— Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)
- [[resnet]] —— ResNet — 残差连接
- [[roberta-2019]] —— RoBERTa — 把 BERT 重训一遍就能拿 SOTA
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[tabpfn-2023]] —— TabPFN — 一秒解决小表格分类的 Transformer
- [[toy-models-superposition]] —— Toy Models of Superposition
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
- [[vit]] —— ViT — Vision Transformer
- [[word2vec]] —— Word2Vec — 词向量奠基
- [[xlnet-2019]] —— XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向

