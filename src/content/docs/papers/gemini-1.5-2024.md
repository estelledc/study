---
title: Gemini 1.5 — 百万 token 多模态上下文的工程样板
来源: 'Gemini Team et al., "Gemini 1.5: Unlocking multimodal understanding across millions of tokens of context", arXiv 2024'
日期: 2026-07-09
分类: 机器学习
难度: 中级
---

## 是什么

Gemini 1.5 是 Google DeepMind 在 2024 年发布的一组多模态大模型，最醒目的能力是：把上下文窗口从几万 token 推到百万级，研究评测里还测到 1000 万 token。

日常类比：普通聊天机器人像只能看你递来的几页纸；Gemini 1.5 像把一整本书、一段长视频、一堆代码文件和录音都摊在桌上，再从里面找线索回答问题。

它不是只会"记得更久"。论文强调的是**多模态长上下文**：文本、代码、图片、音频、视频可以混在同一个输入里，模型在一次推理里跨这些材料检索、理解、回答。

技术上，Gemini 1.5 Pro 是 sparse mixture-of-experts Transformer：总参数很多，但每个 token 只激活一部分专家。这样做的目标是把容量做大，同时控制训练和服务成本。

## 为什么重要

不理解 Gemini 1.5，下面这些事都说不清：

- 为什么"把文件都塞进上下文"一度成为 RAG 之外的另一条产品路线
- 为什么长上下文评测不能只看单个 needle-in-haystack，而要看多 needle、视频、音频和真实任务
- 为什么百万 token 看起来像暴力堆长度，背后其实是模型架构、数据、系统和延迟的联合工程
- 为什么长上下文模型不等于自动会推理，它首先解决的是"能不能看见和取回"的问题

## 核心要点

Gemini 1.5 的论文可以抓住三条主线：

1. **上下文窗口从短盒子变成长桌子**：Gemini 1.0 Pro 主要是 32K 级别，Gemini 1.5 Pro 展示了百万到千万 token 级别的输入处理。类比：以前做题只能带一张小抄，现在能把整本教材摊开。

2. **多模态不是外挂，而是同一条上下文流**：论文展示了文本、代码、图片、音频、视频混在一起的任务。类比：侦探不只看文字证词，也看监控、录音、手绘草图和现场照片。

3. **评测重点从"会不会答题"扩展到"能不能在海量材料里稳定取证"**：论文用 NLL 曲线、文本 needle、视频 needle、音频 needle、Kalamang 低资源翻译、1H-VideoQA 等任务测长上下文。类比：不是只考背课文，而是给你一间档案室，看你能不能找到关键票据并解释。

一个重要结论是：长上下文能力没有明显牺牲普通能力。论文报告 1.5 Pro 在许多文本、代码、视觉任务上超过 1.0 Pro，并接近或超过更贵的 1.0 Ultra。

## 实践案例

### 案例 1：把整个代码库当上下文查线索

论文里给了一个直观例子：把 746,152 token 的 JAX 代码库放进上下文，让模型定位自动微分相关方法。

```python
files = collect_repo_files("jax/")
prompt = f"""
下面是一整个代码库：
{files}

问题：核心自动微分逻辑在哪里？请给出文件和原因。
"""
answer = long_context_model(prompt)
```

逐部分解释：

- `collect_repo_files` 代表把代码文件整理成一个可读输入，不是真的随便拼接就够
- `files` 很长，普通 32K 模型放不下，百万 token 模型才有机会一次看完
- `answer` 的价值不是"背出 API"，而是从全局代码里定位证据

### 案例 2：needle-in-haystack 测的是"找得到吗"

论文把一句秘密数字插进长文本不同位置，再问模型取回数字。Gemini 1.5 Pro 在文本任务上报告：到 530K token 仍 100% recall，1M token 约 99.7%，扩到 10M token 仍约 99.2%。

```python
haystack = repeat_essays_until_tokens(1_000_000)
needle = "The special magic Paris number is: 48291"
text = insert_at_depth(haystack, needle, depth=0.73)
question = "What is the magic number for Paris?"
```

逐部分解释：

- `haystack` 是干扰材料，越长越考验定位
- `needle` 是唯一正确证据，位置可能在开头、中间或结尾
- `question` 只测检索和抽取，不代表模型已经会复杂推理

### 案例 3：低资源语言的"现场学习"

论文用 Kalamang 语言做例子：模型在推理时拿到语法书和双语词表，再把英文翻成 Kalamang，质量接近同样看材料学习的人类。

```python
context = grammar_book + bilingual_dictionary
task = "Translate this English sentence into Kalamang."
response = model(context + task)
```

逐部分解释：

- `grammar_book` 和 `bilingual_dictionary` 不是训练数据，而是这次输入的资料
- 模型需要在上下文里临时学规则，再把规则用到新句子上
- 这说明长上下文不只是"仓库"，也可以是临时教材

## 踩过的坑

1. **把长上下文等同于深理解**：needle 任务能证明模型会找东西，但不能证明它会长链推理。

2. **以为塞得越多越好**：百万 token 输入会带来成本、延迟和注意力分散，很多任务用精检索更便宜。

3. **忽略多 needle 更难**：论文也指出，多个独立 needle 比单个 needle 更有信号，更接近真实工作流。

4. **忘记安全问题也会变长**：长上下文里可能藏恶意指令、隐私片段或互相冲突的要求，模型越会找，越需要安全评测跟上。

## 适用 vs 不适用场景

**适用**：

- 整本书、长合同、长论文、长代码库的一次性问答和定位
- 多模态材料混合分析，例如视频画面 + 字幕 + 文字问题
- 低资源语言、领域手册、API 文档这类"临时给资料再做任务"的场景
- 评测新模型是否真的使用远距离上下文，而不是只看开头和结尾

**不适用**：

- 问题只需要少量明确资料，[[rag-lewis-2020]] 往往更便宜、更可控
- 需要严格可追溯引用的企业知识库，长上下文仍要配合引用和证据切片
- 需要复杂全局推理但材料噪声很大，单纯加长度可能放大干扰
- 低延迟高并发接口，百万 token 输入会直接推高成本和响应时间

## 历史小故事（可跳过）

- **2017 年**：[[attention]] 提出 Transformer，但标准 attention 的 O(L²) 计算让长序列很贵。
- **2019-2020 年**：[[transformer-xl-2019]]、[[longformer-2020]] 等工作尝试缓存、滑窗、稀疏 attention，把上下文从几百推到几千。
- **2022 年**：[[flash-attention]] 从 GPU IO 角度优化 attention，让更长序列的 full attention 变得现实一些。
- **2023 年**：GPT-4 Turbo、Claude 2/3 等商用模型把 100K 到 200K 级上下文推成产品卖点。
- **2024 年**：Gemini 1.5 把讨论推到百万 token 多模态，并明确提醒社区：长上下文评测需要比单 needle 更难。

## 学到什么

1. **长上下文是一种系统能力**：模型架构、训练数据、推理系统、延迟和评测要一起做，不能只改一个参数。

2. **多模态长上下文改变了输入单位**：以前输入是一段文本；现在输入可以是一部电影、一堆代码和一本手册。

3. **评测要区分检索、理解和推理**：能从 100 万 token 找到一句话，是检索能力；能综合多处证据做判断，才更接近理解。

4. **RAG 没被消灭**：长上下文让"全塞进去"可行，但检索仍然在成本、引用、更新和权限控制上有优势。

## 延伸阅读

- 论文 PDF：[Gemini 1.5 Technical Report](https://arxiv.org/abs/2403.05530)（长上下文、多模态、安全和评测都在一篇里）
- Google 发布说明：[Introducing Gemini 1.5](https://blog.google/technology/ai/google-gemini-next-generation-model-february-2024/)
- [[attention]] —— Gemini 1.5 仍然建立在 Transformer 注意力机制上
- [[longformer-2020]] —— 早期长文档 Transformer 的稀疏 attention 路线
- [[rag-lewis-2020]] —— 长上下文路线的主要工程对照组
- [[mmlu-2021]] —— 论文核心能力评测中常见的通用知识标尺

## 关联

- [[attention]] —— Transformer 的基础机制，长上下文首先卡在 attention 成本上
- [[transformer-xl-2019]] —— 用缓存和相对位置拉长上下文，是长序列路线的早期节点
- [[longformer-2020]] —— 用滑窗和全局 token 降低长文档 attention 成本
- [[flash-attention]] —— 从 GPU 内存访问优化 attention，是百万 token 工程化的底层背景
- [[rag-lewis-2020]] —— 和"全塞进上下文"形成互补：一个靠检索，一个靠窗口
- [[clip]] —— 多模态模型的图文对齐前史，Gemini 1.5 把多模态扩到长上下文
- [[whisper-2022]] —— 音频理解的专门模型，论文把它作为长音频任务的对照之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[orca-2022]] —— Orca — Transformer 生成模型的分布式推理调度
