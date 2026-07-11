---
title: Atlas — 把检索器和生成器一起训练，11B 打 540B
来源: 'Izacard et al., "Atlas: Few-shot Learning with Retrieval Augmented Language Models", JMLR 2023 (arXiv 2208.03299)'
日期: 2026-05-31
分类: AI / NLP
难度: 中级
---

## 是什么

Atlas 是 Meta 2022 年做的**检索增强语言模型**——比 [[rag-lewis-2020]] 更进一步：**让"找资料"的小模型和"写答案"的大模型一起训练**，而不是各练各的再拼一起。

日常类比：[[rag-lewis-2020]] 像**新员工临时配了个图书管理员**，管理员凭老经验找书，员工照本宣读；Atlas 是**让员工和管理员一起入职培训**——管理员学会"这位员工每次写错的地方往往需要哪类书"，员工也学会"这位管理员今天给的书该信几分"。两人配合到第 100 天，比把世界上最聪明的员工单独丢进考场还稳。

最反直觉的结果：**11B 参数的 Atlas 在 64-shot Natural Questions 上比 540B 参数的 PaLM 还高 8.6 分**——大模型 50× 的"硬背"被 Atlas 用"学会查资料"打掉了。

## 为什么重要

不理解 Atlas，下面这些事都没法解释：

- 为什么 2022 之后业界开始普遍认为"模型大小不是唯一选项，外接知识库 + 联合训练才是"
- 为什么后来 [[retro]] / Self-RAG / Atlas-Plus 都把"联合训练检索器"当默认设计
- 为什么 few-shot（只有几十个样例）场景下，Atlas 类方法成了主流——参数化模型背不下罕见知识，但能学会"怎么查"
- 为什么"知识更新"在 Atlas 后变成"换索引"而不是"重训模型"——参数和知识被显式解耦
- 为什么现代企业 RAG 系统讨论"finetune retriever"时引的多半是 Atlas 那几个 loss

## 核心要点

Atlas 的核心可以拆成 **三件事**：

1. **检索器（retriever）**：用 [[contriever-2021]] 风格的双塔编码器把每段文档变成向量，提问时算相似度，挑前 k 段（k=20 到 40）。
2. **生成器（generator）**：用 T5 编码器-解码器，但走 Fusion-in-Decoder（FiD）路线——每段检索到的文档**单独编码**，再在解码器里拼起来生成。
3. **联合训练（joint training）**：不只是训生成器；retriever 也跟着更新。这是 Atlas 真正不同于 RAG 的地方。

把"找资料"的能力从"经验直觉"变成"按目标训出来的肌肉"。

## 实践案例

### 案例 1：联合训练用什么 loss

Atlas 论文比了 4 种训 retriever 的目标，最后推荐前两种：

- **ADist（Attention Distillation）**：让 retriever 的相似度分布**对齐生成器在交叉注意力里给每段文档的权重**。直觉：解码器自己用得多的段，retriever 下次就该排得更靠前。公式上是把生成器 cross-attention 权重 softmax 后当软标签，对 retriever 输出做 KL 散度。
- **EMDR²（Expectation-Maximization for retrieval）**：把检索看成隐变量，用 EM 思路最大化"找对了某段、生成了对答案"的联合概率。E-步给每段算后验权重，M-步用这权重更新 retriever。
- **PDist / LOOP**：另两种被消融掉的方案——前者用 perplexity 做监督信号，后者用"留一法"看每段对最终答案的边际贡献。效果都不如前两种稳定。

四个都不需要标"哪段是对的"——靠生成 loss 反传到 retriever，弱监督就够。

### 案例 2：为什么 11B 能打 540B

64-shot Natural Questions 准确率（2022 数据）：

```
PaLM-540B          : 18.1
Atlas-11B          : 26.7   ← 高 8.6 分，参数小 50×
Atlas-3B           : 22.9   ← 3B 也比 540B 高
GPT-3-175B         : 22.6
```

关键在于：**Atlas 的"知识"大部分存在 Wikipedia 索引里（约 4000 万段，几十 GB）**，模型只学"怎么用知识"。索引可以离线扩到几亿、几十亿段——这部分不算模型参数。

更深一层的洞察：参数化大模型在罕见事实上的召回率随规模增长很慢，但"学会查资料"几乎是 capacity-free 的——只要 retriever 能命中正确段落，11B 的生成器就够把答案拼出来。

### 案例 3：在 MMLU 上验证"换索引就换知识"

Atlas 把训练时的索引换成 2022 年新 dump 的 Wikipedia，**不重训**，MMLU 时事题立刻涨分。换索引 = 换知识库，参数和知识完全解耦——这正是 RAG 范式相对纯参数化模型的杀手锏。

### 案例 4：Pretrain 也要联合训

Atlas 不只是 fine-tune 阶段联合训。它的预训练目标叫 **MLM with retrieval**：先 mask 掉一段文档里的 span，让 retriever 从其它语料里找近邻段，生成器再去补 mask。retriever 在预训练阶段就被生成器的 loss "拉着学"，到下游 few-shot 时已经有了基本对齐。这是 Atlas 比"先各自预训练再拼起来联合微调"高一截的原因之一。

## 踩过的坑

1. **索引重算成本**：retriever 每更新一次，理论上整个语料的向量都要重算。Atlas 用"延迟刷新"——每 N 步只重算前 K 段最常被检索的文档，其余沿用旧向量。这步省下的算力是工程能跑通的关键。
2. **冷启动差**：retriever 一开始太弱，给生成器送的全是垃圾，生成 loss 反传回去也没用。论文用 [[contriever-2021]] 预训练好的权重做初始化才能起步。
3. **few-shot 不等于 zero-shot**：Atlas 强在 32~64 shot，shot 数掉到 5 时优势收窄。完全 zero-shot 还是大模型占上风——少量样例是它学会"怎么查"的关键。
4. **FiD 显存炸**：每段文档单独编码，k=40 段时显存约是普通 seq2seq 的 40 倍。论文用梯度检查点 + 把检索器和生成器分卡才跑得动。
5. **ADist 容易被生成器误导**：如果生成器在某些样本上靠"瞎蒙"也能答对（比如答案在 prompt 里出现过），交叉注意力分布就不能反映文档真实有用度，蒸馏给 retriever 反而是噪声。论文用了 query encoder 冻结一段步数 + 软启动来缓解。

## 适用 vs 不适用场景

**适用**：
- 知识密集型 QA（Natural Questions / TriviaQA / FEVER）—— Atlas 在 11 个基准里 8 个 SOTA
- 需要频繁更新知识的产品场景（新闻问答、法规问答）—— 换索引比重训便宜 1000×
- few-shot / 中等数据场景（几十到几千样例）—— 联合训练对小数据特别友好
- 引用可追溯的需求 —— 检索段就是 citation

**不适用**：
- 推理密集型任务（数学、代码）——这类知识不在 Wikipedia 段落里，retriever 帮不了
- 完全 zero-shot 部署——没几个 shot 调过的 retriever 不知道往哪找
- 算力极度受限——FiD 推理慢且耗显存，还不如直接上小一点的纯参数模型
- 索引规模 < 100 万段—— retriever 拉不开差距，复杂度不划算

## 关键消融（论文最值得记住的几张表）

Atlas 论文消融实验密度很高，挑三个对工程最有指导意义的结论：

### 消融 1：联合训 vs 冻结 retriever

```
冻结 retriever (RAG 风格)         : 23.1 EM
仅 fine-tune 阶段联合训          : 25.4 EM   ← +2.3
预训练 + fine-tune 都联合训 (Atlas): 26.7 EM   ← +3.6
```

预训练阶段就让 retriever 跟生成器对齐，回报远大于只在下游联合训。

### 消融 2：检索段数 k 的拐点

```
k=5  : 22.1
k=20 : 25.8
k=40 : 26.7
k=60 : 26.5  ← 收益封顶
```

到 k=40 就基本饱和——不是越多越好，再多就稀释 cross-attention 注意力。

### 消融 3：索引规模影响

把 Wikipedia 子集从 100 万段扩到 4000 万段，准确率单调上升 6 分；但从 4000 万扩到 1 亿（加 CommonCrawl）只涨 0.4 分——同领域索引的边际收益快速递减。这给做企业 RAG 的人一个直接启示：**先把领域内文档清干净，再考虑加通用语料**。

## 历史小故事（可跳过）

- **2020 年**：Lewis 的 RAG 把检索 + 生成串起来，但 retriever 大多冻住或独立训。
- **2021 年**：[[contriever-2021]] 出现，证明对比学习能在没有标注的情况下训出强 retriever。Atlas 的 retriever 直接用它做底座。
- **2022 年 8 月**：Izacard 等把 Contriever + FiD + 联合 loss 一起做了消融，发表 Atlas。同年 [[retro]]（DeepMind）走的是另一条路——不联合训，但索引规模到 2 万亿 token。
- **2023 年起**：联合训练 retriever 成了 RAG 升级的默认动作；Atlas 的 ADist / EMDR² 被各家工程实现反复 cite。

## 学到什么

1. **参数和知识可以解耦** —— 把"会推理"放在参数里，把"知道什么"放在索引里，两边各自 scale。
2. **联合训练 > 拼装** —— retriever 跟着生成器一起练，比各练各的好得多；信号弱但方向对。
3. **few-shot 是 retriever 学习的甜区** —— 完全无样例学不会"该查什么"，全监督又用不上 retriever 的归纳能力。
4. **"换索引就换知识"是范式级特性** —— 不是工程技巧，是 RAG 类方法相对纯参数模型的根本优势。

## 延伸阅读

- 论文：[Atlas: Few-shot Learning with Retrieval Augmented Language Models (arXiv 2208.03299)](https://arxiv.org/abs/2208.03299)
- 代码：[facebookresearch/atlas](https://github.com/facebookresearch/atlas)（Meta 官方实现）
- 解读视频：[Yannic Kilcher — Atlas paper review](https://www.youtube.com/watch?v=9SF8aFPs7Fk)
- [[rag-lewis-2020]] —— Atlas 的直接前身
- [[retro]] —— 同期另一路线：超大索引 + 冻结 retriever
- [[contriever-2021]] —— Atlas 的 retriever 底座

## 关联

- [[rag-lewis-2020]] —— 检索 + 生成的奠基；Atlas 是它的联合训练升级版
- [[retro]] —— 同期对照：DeepMind 选"不联合训但索引超大"的对偶解
- [[contriever-2021]] —— Atlas 用它做 retriever 初始化
- [[t5]] —— Atlas 的生成器底座
- [[scaling-laws]] —— Atlas 的"小参数 + 大索引"是对纯参数 scaling 的反例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[nlp-rag-2024]] —— RAG for AIGC: 检索增强生成在 AI 生成内容中的应用 — 学习笔记
- [[replug-2023]] —— REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上
- [[self-rag-2023]] —— Self-RAG — 让模型自己决定何时该查资料
