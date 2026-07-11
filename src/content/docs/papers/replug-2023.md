---
title: REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上
来源: 'Shi et al., "REPLUG: Retrieval-Augmented Black-Box Language Models", arXiv 2301.12652, 2023 (NAACL 2024)'
日期: 2026-05-31
分类: AI / NLP
难度: 中级
---

## 是什么

REPLUG（**RE**trieve and **PLUG**）是一种检索增强方法，它**把大模型当黑盒**，只动外挂的"检索器"。

日常类比：你雇了一位水平很高但脾气很大的顾问（GPT-3 / Codex），他不让你看他大脑里的过程，也不让你给他做培训。你能做的只有：**给他递参考资料**。REPLUG 教你"把递的资料挑得更合他口味"——通过观察他读完资料后的反应（输出概率）反推他喜欢什么，然后只训练那个"挑资料的小助理"。

一句话：**不微调 LLM，只插拔检索器**。这是现代企业级 RAG 系统的事实范式之一。

## 为什么重要

2023 年初的现实是：

- GPT-3 / GPT-4 / Codex 这些最强的 LLM 都是 **API 黑盒**，没法 fine-tune，没法看梯度
- 早期 RAG（如 [[rag-lewis-2020]]）和 Atlas（[[atlas-2022]]）需要**联合训练**生成器和检索器，对闭源模型不可行
- 工业界要给 LLM 接公司私有数据，只能"先检索再拼到 prompt 前面"——但检索器本身和 LLM 没对齐，常检回不相关内容

REPLUG 解决的就是这个问题：**只用 LLM 的输出概率作监督信号**，反向训练检索器。它证明了：黑盒 LLM 也能享受到"为它定制的检索器"带来的提升。后来不少 RAG 系统吸收了"用 LM 反馈调检索器"的思路（检索重排 / 反馈训练），不必说成全行业标配。

## 核心要点

REPLUG 的整套机制可拆成 **三步**：

1. **检索 top-k 文档**：用一个稠密向量检索器（基于 [[dpr-2020]] / [[colbert-2020]] 思路）从外部语料里取出最相关的 k 篇文档。Query 和文档都先用同一个 BERT-base 双塔编码成向量，再用近似最近邻搜索（如 [[faiss-2017]]）找 top-k。

2. **集成（ensemble）每篇文档独立进 LLM**：把每篇文档分别**单独**拼到 query 前，让 LLM 跑 k 次，得到 k 份输出概率分布；再按检索相似度加权平均。**关键**：不是把 k 篇拼到一起塞进 context，而是 k 次独立前向、最后投票。这样既绕开 context 长度限制，又让相关文档自然胜出。公式上：`P(y|x) = Σ_i softmax(sim_i) · P_LM(y | doc_i, x)`。

3. **LSR（LM-Supervised Retrieval）训练检索器**：核心创新。用一个强 LLM（如 GPT-3）算出"给定每篇候选文档时，正确答案的概率"，把这组概率当成"老师的偏好分布"；再用检索器自己的相似度算出"学生的偏好分布"；用 **KL 散度**让学生去学老师。检索器从此知道"这位 LLM 喜欢什么样的文档"。

整个过程 **LLM 参数一个不动**，只有检索器（一个 BERT-base 大小的双塔编码器）在训练。这是 REPLUG 和它之前所有 RAG 工作最本质的区别。

## 实践案例

### 案例 1：在 GPT-3 上提语言建模（三步）

1. **检索**：用 Contriever 类双塔从外部语料取 top-k 文档  
2. **拼 prompt + ensemble**：每篇文档单独拼到输入前，跑 k 次 GPT-3，再按相似度加权合并输出分布  
3. **看指标**：论文在 The Pile 上用 **BPB**（bits per byte，每字节多少比特，越低越好）衡量；GPT-3 175B 相对提升约 **6.3%**。**模型权重一行未改**，只换了更懂它的检索器。

### 案例 2：在 Codex 上提五-shot MMLU

同样三步（检索 → 每文档独立前向 → ensemble），评测换成 MMLU（多学科问答）：

- Codex 175B baseline：**68.3**  
- Codex + REPLUG：**71.4**（+3.1 分，相对约 **4.5%**）  
- Codex + REPLUG LSR：**71.8**（相对约 **5.1%**）  

相对"现成 Contriever"，LSR 定制检索器再抬一截——说明**为这个 LLM 调过的检索器**比通用检索器更管用。

### 案例 3：LSR 训练循环长什么样

```
for batch in training_data:
    # 1. 学生检索器算每篇文档的相似度
    scores_retriever = encoder(query) · encoder(doc_i) for i in 1..K

    # 2. 老师 LLM 算每篇文档作为 context 时正确答案的概率
    scores_lm = LM(answer | doc_i, query) for i in 1..K  # API 调用

    # 3. 让两个分布尽量接近（softmax 归一化后做 KL；KL=两份「口味分布」差多少）
    loss = KL(softmax(scores_retriever) || softmax(scores_lm))
    loss.backward()  # 只更新 encoder 参数
```

注意：这里 LLM 只前向、不反向；它**只贡献一个概率数字（logprob）**，不需要梯度。这就是"黑盒"的精确含义——接口收窄到"LLM 能不能给我 logprob"。

### 案例 4：与拼接式 In-Context RAG 的差距

普通 RAG 把 top-k 篇直接拼进 prompt：`[doc1]...[docK] Question: ...`，容易挤占长度、互相干扰、噪声污染整段。REPLUG 的 ensemble 让每篇**独立提议**再投票。论文在 NQ / TriviaQA 上：同样 K=10，ensemble 通常优于简单拼接。

## 踩过的坑

1. **LSR 训练成本不低**：每个 batch 要调 K 次 LLM API（K 通常 10-20）。用大模型当老师时，账单往往是**万美元量级**（取决于步数与定价）。中小团队复现多用小 LLM 当老师，或只训少量步数。

2. **ensemble 是延迟杀手**：推理时每条 query 要前向 K 次 LLM。RAG 部署如果 K=10、LLM 单次延迟 1s，就是 10s。生产环境通常退化成 K=3 或干脆只用 top-1。

3. **检索器学到的是"这个特定 LLM 的偏好"**：换 LLM 就要重训。从 GPT-3 训出来的检索器接到 LLaMA 上效果会打折。这点和 Atlas 的"端到端训练专用模型"完全相反。

4. **不能解决"LLM 不会引用"的问题**：REPLUG 只让检索更准，但 LLM 仍可能忽略检索内容、自由发挥。引用准确性要在 prompt 工程或后处理层另解。

5. **logprob 不是所有 API 都给**：训练阶段需要 LLM 返回每个 token 的 logprob。OpenAI 早期 API 给，后来限流；Anthropic 直到 2024 年才开始有限放开。如果老师 LLM 不给 logprob，整个 LSR 训练无从谈起，论文复现遇到的最大障碍往往是这个。

## 适用 vs 不适用场景

**适用**：

- 用闭源商用 LLM（GPT-4 / Claude / Gemini）做 RAG，无法 fine-tune
- 有大量私有语料，希望检索器学到"这位 LLM 对哪类文档反应好"
- 离线训练预算够，但在线推理可以接受 K 次前向（如批量文档处理、问答系统）

**不适用**：

- 在线低延迟场景（chat 机器人）——ensemble 太慢，退化成 top-1 后 REPLUG 优势变小
- 没钱调老师 LLM——LSR 训练阶段的 API 账单不可忽视
- 已经能微调 LLM 的场景——用 [[atlas-2022]] 端到端联合训练效果通常更好
- 任务对"实时新知识"敏感——REPLUG 训出来的检索器是静态的，索引和检索器需要分别更新

## 历史小故事（可跳过）

- **2020 年**：[[rag-lewis-2020]] / [[dpr-2020]] 把"检索 + 生成"打成一个端到端可训练的整体，但要求两端都开源。
- **2022 年**：[[atlas-2022]] 把 retriever 和 LM 一起 few-shot 训练，11B 打过 PaLM 540B。但 GPT-3 已是黑盒，Atlas 路径走不通。
- **2023 年 1 月**：Meta AI 的 Weijia Shi 等人提出 REPLUG，在 ACL/NAACL 投稿。核心 insight：**LM 输出概率本身就是监督信号**，不需要梯度。
- **2023-2024 年**：用 LM 反馈调检索 / 重排的思路进入更多 RAG 工具链；具体实现各异，不必等同于论文里的完整 LSR。

REPLUG 的位置：是 **从"训得动的 RAG"过渡到"训不动 LLM 时代的 RAG"** 的关键论文。

## 学到什么

1. **黑盒 LLM 也能监督**——只要它愿意吐出一个概率数字，就能反向传播给上游模块
2. **ensemble > 拼接**——k 篇文档分别独立做前向再投票，比塞到一个长 context 里效果好且更稳
3. **检索器是可调拨的"风味器"**——同一份语料、同一个 LLM，换一个为它训过的检索器就能提分
4. **训练时贵、推理时也不便宜**——RAG 的工程复杂度从单点（LLM）扩散到了三处（检索器、索引、ensemble 调度）
5. **概率分布是软监督**——比硬标签（哪篇文档是"对的"）信息量大得多，不需要人工标注就有学习信号

## 一图流自查

| 关注点 | REPLUG 给的答案 |
|--------|----------------|
| LLM 能不能微调？| 不能也行，黑盒就够 |
| 检索器从哪学？| 从 LLM 看完文档后的输出概率反推 |
| 多文档怎么用？| ensemble 投票，不拼接 |
| 训练成本？| K 倍 LLM API 调用，预算敏感 |
| 推理成本？| 仍然 K 次前向，延迟敏感场景慎用 |
| 换 LLM 还能用吗？| 检索器需要重训，但语料和索引可复用 |

## 延伸阅读

- 论文 PDF：[arXiv:2301.12652](https://arxiv.org/abs/2301.12652)（17 页，主要看 §3 和 §4）
- 视频讲解：[Yannic Kilcher — REPLUG paper review](https://www.youtube.com/results?search_query=REPLUG+paper)（45 分钟，把 LSR 推一遍）
- 官方代码：[swj0419/REPLUG](https://github.com/swj0419/REPLUG)（论文作者发布）
- [[rag-lewis-2020]] —— RAG 奠基，但要求两端可训
- [[atlas-2022]] —— 与 REPLUG 路线相反，端到端联合训
- [[dpr-2020]] —— REPLUG 检索器的底层骨架
- [[colbert-2020]] —— 另一种稠密检索方案，与 REPLUG 检索器风格类似

## 关联

- [[rag-lewis-2020]] —— 同一家族，REPLUG 是它在"LLM 黑盒"时代的延续
- [[atlas-2022]] —— 路线对比：训得动 LM 选 Atlas，训不动选 REPLUG
- [[dpr-2020]] —— 提供稠密检索的双塔基础
- [[colbert-2020]] —— 检索器结构的近亲
- [[ance-2020]] —— 同样用模型反馈来训检索器，是 LSR 的精神前辈
- [[rocketqa-2021]] —— 用难负例提升稠密检索质量，REPLUG 的检索器训练阶段也借鉴了类似采样
- [[faiss-2017]] —— 大规模向量检索的事实标准，REPLUG 推理时直接用
- [[graphrag]] —— 图结构 + RAG，与 REPLUG 思路正交，可以叠加使用
- [[dspy]] —— 从更高层把"prompt + 检索 + 选模型"整体当成可优化系统，REPLUG 是其中一种 retriever 选择
