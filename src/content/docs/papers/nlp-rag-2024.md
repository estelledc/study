---
title: "RAG for AIGC: 检索增强生成在 AI 生成内容中的应用 — 学习笔记"
来源: https://arxiv.org/abs/2402.19473
日期: 2026-06-13
分类: AI / NLP
难度: 中级
---

# RAG for AIGC：检索增强生成在 AI 生成内容中的应用

## 一句话总结

这篇论文（arXiv:2402.19473，北京大学 & PKU-DAIR）是一篇**综述**，系统地整理了「检索增强生成（RAG）」技术如何被应用到各种 AI 生成内容（AIGC）场景中——包括文字、代码、音频、图像、视频、3D 模型、知识问答和科学发现等领域。

---

## 日常类比：图书馆里的考生

想象一场开卷考试。

**没有 RAG 的 AI 模型**：像一个只靠记忆力答题的考生。如果考题涉及考试结束后发生的事，或者考的是他没背过的冷门知识点，他就瞎编答案（这叫「幻觉」）。

**有 RAG 的 AI 模型**：像同一个考生，但允许他进图书馆翻书。看到题目后，他先去书架上找到最相关的几页资料，**阅读这些资料**，然后基于资料写出答案。

这就是 RAG 的核心思路：

> **R = Retrieval（检索）**：从外部知识库中找出与问题最相关的资料
> **A = Augmented（增强）**：把找到的资料「喂给」生成模型
> **G = Generation（生成）**：模型基于这些资料生成更准确的答案

---

## 核心概念

### 1. 为什么 AIGC 需要 RAG？

AI 生成内容（AIGC）——比如写文章、画图片、生成代码、做音乐——虽然很强，但有四个天然短板：

- **知识更新慢**：模型训练完之后，世界还在变。新发生的新闻、新出的技术，模型不知道。
- **长尾数据差**：常见知识答得好，冷门知识（比如某个小众编程语言的特有 API）就拉胯。
- **数据泄露风险**：训练数据如果包含隐私，模型可能「背出来」。
- **训练成本高**：想更新知识？重新训练整个模型，花多少钱和时间？

RAG 通过「即时检索」这四个问题：**不重新训练模型，就能让它用上最新、最相关的知识。**

### 2. RAG 的四大基础方法

论文把 RAG 按照「检索结果如何增强生成器」分为四类：

#### (a) 基于查询的 RAG（Query-based RAG）

最经典的方式。把用户的问题转换成搜索词，去数据库里查资料，然后把搜索结果和用户问题一起发给生成模型。

```
用户问题 → [检索器] → 相关文档 → [生成模型] → 答案
```

代表工作：REALM、Self-RAG、REPLUG。

#### (b) 基于潜在表示的 RAG（Latent Representation-based RAG）

不把原文直接扔给模型，而是把检索到的资料转换成「向量」（一种数学表示），然后和生成模型的内部状态融合。更像「借鉴」而非「照抄」。

代表工作：KNN-Diffusion（图像生成）、REINVENT（药物设计）。

#### (c) 基于 Logit 的 RAG（Logit-based RAG）

在模型生成每一个词的时候，用检索到的相似文本「投票」：哪个词在参考文本中出现概率高，就倾向选它。相当于让检索结果对每个字的生成施加「影响力」。

代表工作：Nearest Neighbor Language Models。

#### (d) 推测式 RAG（Speculative RAG）

如果检索到的内容和模型自己的记忆高度一致，就「偷懒」直接用记忆生成，跳过检索步骤，节省时间。

代表工作：REST、COPY IS ALL YOU NEED。

### 3. RAG 的增强策略

光有基础方法不够，论文还整理了提升 RAG 效果的各类「技巧」：

| 增强位置 | 具体方法 | 作用 |
|---------|---------|------|
| **输入增强** | 查询改写、数据增强 | 让检索器更容易找到有用资料 |
| **检索器增强** | 递归检索、分块优化、混合检索、重排序 | 让检索本身更准、更全 |
| **生成器增强** | 提示工程、微调生成器 | 让模型更好地利用检索到的资料 |
| **结果增强** | 输出重写 | 让最终答案更自然、更连贯 |
| **Pipeline 增强** | 自适应检索（该查就查，不该查不查）、迭代检索（查→写→再查→再写） | 让整个流程更智能 |

### 4. RAG 的应用领域全景

论文覆盖了以下六大模态的应用：

- **文本**：问答、摘要、翻译、对话、常识推理
- **代码**：代码生成、代码补全、代码注释、自动修复 bug
- **音频**：文本转音频、音频描述
- **图像**：文本转图像、图像描述
- **视频**：视频描述、视频问答
- **3D / 科学**：3D 模型生成、药物发现、数学推理

---

## 代码示例

### 示例 1：最基础的 RAG 流程（伪代码）

这个示例展示 RAG 的核心三步骤：检索 → 拼接 → 生成。

```python
# 假设用户问了一个问题
question = "2024 年诺贝尔物理学奖获得者是谁？"

# 第一步：检索 —— 从知识库中查找相关文档
# 把问题转换成向量（embedding），在向量数据库里找最相似的文档
query_embedding = embedding_model.encode(question)
relevant_docs = vector_db.search(query_embedding, top_k=3)

# relevant_docs 可能返回类似这样的结果：
# [
#   "2024年诺贝尔物理学奖授予了John Hopfield和Geoffrey Hinton，\
#    以表彰他们在机器学习领域的奠基性工作。",
#   "Geoffrey Hinton 被称为'AI 之父'之一，他开发的反向传播算法\
#    是深度学习的核心算法之一。",
#   "John Hopfield 提出的 Hopfield 网络是最早的神经网络模型之一。"
# ]

# 第二步：增强 —— 把检索到的资料拼接到提示词中
prompt = f"""
请根据以下参考资料回答问题。

参考资料：
{doc} for doc in relevant_docs:
    print(f"- {doc}")

问题：{question}

请基于上述资料给出准确答案。如果资料中没有相关信息，请说不知道。
"""

# 第三步：生成 —— 把增强后的提示词发给大模型
answer = llm.generate(prompt)
print(answer)
# 输出类似："2024 年诺贝尔物理学奖授予了 John Hopfield 和 Geoffrey Hinton，\
#           以表彰他们在机器学习领域的奠基性工作。"
```

### 示例 2：自适应 RAG（Adaptive RAG）

这不是每次都查资料，而是让模型自己判断「需不需要查」。

```python
def adaptive_rag(question, llm, retriever, vector_db):
    """
    自适应 RAG：模型先判断自己是否知道答案。
    知道 → 直接回答（省时间）
    不知道 → 检索后再回答（保准确）
    """

    # 第一步：让模型先「自我评估」
    self_eval_prompt = f"""
    请判断你是否知道以下问题的答案。
    只回答「知道」或「不知道」。

    问题：{question}
    """
    self_assessment = llm.generate(self_eval_prompt).strip()

    if self_assessment == "知道":
        # 模型自信满满，直接生成答案
        return llm.generate(f"请直接回答：{question}")

    # 模型说「不知道」或者「不太确定」 → 启动检索
    # 第二步：检索相关文档
    query_embedding = embedding_model.encode(question)
    docs = vector_db.search(query_embedding, top_k=3)

    # 第三步：把文档拼进提示词，让模型基于资料回答
    augmented_prompt = f"""
    以下是参考资料，请基于它们回答问题：

    {chr(10).join(docs)}

    问题：{question}
    请给出基于参考资料的答案。
    """
    return llm.generate(augmented_prompt)

# 使用
answer = adaptive_rag("量子计算的基本原理是什么？", llm, retriever, vector_db)
```

### 示例 3：代码生成场景中的 RAG（RepoCoder 风格）

论文提到 RAG 在代码生成中的应用非常活跃。这个示例展示如何检索项目中的相关代码来帮助生成新代码。

```python
def rag_code_completion(current_code, project_repo):
    """
    RAG 辅助代码补全 —— 类似 RepoCoder 的思路。
    不是从训练数据里猜，而是从当前项目里找类似的代码片段来参考。
    """
    # 第一步：把当前代码上下文转换成向量，在项目代码库中检索
    code_embedding = code_embedding_model.encode(current_code)
    similar_snippets = project_repo.semantic_search(
        code_embedding,
        top_k=5
    )
    # similar_snippets 返回项目中语义最相似的已有代码片段

    # 第二步：构建提示词 —— 包含原始需求 + 检索到的参考代码
    prompt = f"""
    请根据以下已有的代码模式，补全当前函数。

    【当前代码上下文】
    {current_code}

    【项目中的相似代码参考】
    {chr(10).join(similar_snippets)}

    请补全代码，保持与项目现有代码风格一致。
    """

    # 第三步：生成代码
    generated_code = code_llm.generate(prompt)
    return generated_code

# 使用
code_snippet = """
def calculate_user_churn_rate(active_users, churning_users):
    # TODO: 计算用户流失率
    return
"""

new_code = rag_code_completion(code_snippet, project_repo="my_company_backend")
print(new_code)
# 模型可能输出：
# def calculate_user_churn_rate(active_users, churning_users):
#     if active_users == 0:
#         return 0.0
#     return churning_users / active_users
```

---

## 论文的贡献总结

1. **统一分类框架**：首次把 RAG 按照「检索如何增强生成」分为四类（Query / Latent / Logit / Speculative），给后续研究提供了一个清晰的坐标体系。
2. **全模态覆盖**：不只是文字，还包括代码、图像、音频、视频、3D、科学发现。覆盖面极广。
3. **增强策略归纳**：从输入到检索器、生成器、输出、整个 Pipeline，逐层整理提升 RAG 效果的方法。
4. **Benchmark 梳理**：介绍了 RAG 领域的常用评测基准（如 RAGAS、CRUD-RAG 等）。
5. **开源项目**：论文维护了一个 [GitHub 仓库](https://github.com/PKU-DAIR/RAG-Survey)，持续收录 RAG 相关论文。

---

## 学习收获

- RAG 不是单一技术，而是一个**框架**：检索 + 生成可以以多种方式组合。
- 检索质量决定 RAG 的上限，生成质量决定 RAG 能接近这个上限的程度。
- 自适应 RAG（让模型自己决定要不要查）和迭代 RAG（查→写→再查→再写）是未来方向。
- RAG 已经在代码生成领域大放异彩（GitHub Copilot 的底层原理之一就是 RAG），在医疗、法律、科学等专业领域也有巨大潜力。

---

> **延伸建议**：如果想动手实践，可以从 `langchain` 或 `LlamaIndex` 两个框架入门，它们都内置了 RAG 的完整管道。先从「加载文档 → 切块 → 向量化 → 检索 → 生成」这个最经典的流程开始。
