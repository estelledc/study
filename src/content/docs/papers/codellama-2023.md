---
title: Code Llama — 开源代码模型的完整训练配方
来源: 'Rozière et al. (Meta AI), "Code Llama: Open Foundation Models for Code", arXiv:2308.12950 (2023)'
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

Code Llama 是 Meta 在 2023 年放出的一组开源代码大模型。日常类比：把通用大模型 Llama 2 送去码农训练营再读两年研究生——出来就成了能写代码、能补代码、还能看长文件的专科版。

它一次给了三种规格（7B / 13B / 34B），三种变体：

- **基础版**：在多语言代码上继续预训练
- **Python 专化版**：再加 100B Python 数据
- **Instruct 指令版**：再加自指令对话数据，能听懂自然语言

外加一项当时开源界少有的能力：**最长支持 100k token 上下文**——可以把整个项目塞进去问。

## 为什么重要

不读这篇，下面这些后来的事都没法解释：

- 为什么 DeepSeek-Coder / StarCoder2 / Qwen2.5-Coder 训练流程几乎长一样（继续预训练 + 长上下文微调 + 中间填充 + 自指令）
- 为什么 IDE 里的代码补全能从光标两侧同时读上下文（FIM 中间填充技术普及）
- 为什么 RoPE 位置编码的"基数"成了人人调参的对象
- 为什么开源代码模型敢说"上下文 100k"——这条路是 Code Llama 第一次走通

它把"训一个能用的代码模型"的步骤拆成可复制的食谱，之后整个开源代码模型生态都吃这份配方。

## 核心要点

四步训练流水线，每一步解决一个问题。

1. **继续预训练（500B tokens）**：从 Llama 2 起步，在公开代码数据上接着训。类比：通才本科生进研究生院读 CS。

2. **长上下文微调（LCFT）**：训练时把上下文从 4k 拉到 16k，**关键改动是把 RoPE 旋转位置编码的"基数 θ"从 10000 改成 1,000,000**。改完后模型在推理时能外推到 100k 不崩。这是论文最关键的技术贡献——**一行超参数换来 25 倍上下文**。

3. **中间填充（Fill-in-the-Middle, FIM）**：把代码切成"前缀 / 中间 / 后缀"，用特殊 token 重排成"前缀-后缀-中间"，让模型学会**从两侧补中间**。只在 7B / 13B 启用，34B 关掉（论文承认 FIM 与因果建模存在张力）。

4. **指令微调（自指令）**：用 Llama 2 70B 出题，用 Code Llama 7B 答题，**过单元测试筛掉答错的**，得到 14k 高质量编程对话。这条思路省了人工标注。

## 实践案例

### 案例 1：长上下文为什么靠改 θ 就行

RoPE 把"位置 i"编码成一组旋转角度，频率取决于基数 θ。**θ 大 → 低频长波多 → 远距离仍能区分**。日常类比：钟表多加几根更慢的指针，年/月/日都能读清楚，而不只是分秒。

```
原始 Llama 2: θ = 10000，训练 4k，推到 8k 就糊
Code Llama:  θ = 1000000，训练 16k，推到 100k 仍稳
```

代价：θ 改大，**短距离区分度变差一点**——所以基础模型还要在 16k 数据上微调几十亿 token 让它"重学短距离"。

### 案例 2：FIM 数据是怎么造的

```
原始代码:
def add(a, b):
    return a + b

FIM 重排（50% 概率应用）:
<PRE> def add(a, b):
    return  <SUF>  + b <MID> a
```

模型见到 <PRE> 和 <SUF> 段，要预测 <MID> 段。训练时一半样本做 FIM、一半保持因果，**两种能力共存**。这让 Code Llama 同时支持"续写"和"补中间"——IDE 补全两种场景都能覆盖。

### 案例 3：HumanEval 数字怎么读

| 模型 | HumanEval pass@1 | 含义 |
|------|------------------|------|
| Code Llama 34B 基础 | 48.8% | 出 100 道题约对 49 道 |
| Code Llama 34B Python | 53.7% | Python 专化提了约 5 个点 |
| Code Llama 34B Instruct | 41.5% | 指令版反而**更差** |

最后一行反直觉：Instruct 在 HumanEval 上比基础版低约 7 个点。论文解释：**为了安全和拒答能力牺牲了一部分硬编码能力**，但在多轮对话和理解模糊需求上更强。这是 RLHF 时代代码模型的通病——直到 2024 年 DeepSeek-Coder-V2 才比较好地兼顾。

### 案例 4：训练数据配比

总训练量 ≈ 620B tokens，分四阶段：

```
基础: 500B   (代码主体)
LCFT:  20B   (16k 长样本，把 RoPE 调好)
Python: 100B (Python 变体专门加的)
Instruct: 5B (自指令对话)
```

Python 专化模型完整流程是 500B + 20B + 100B = 620B，比基础版多吃 100B Python 数据，HumanEval 上得到约 5 个点回报——**特化数据的边际收益依然显著**。这一观察直接催生了后来一堆"领域专精模型"（医学、法律、数学）。

## 踩过的坑

1. **70B 不支持 FIM**：论文同期没放 70B，后来补上时砍掉了 FIM。说明 FIM 在更大规模上训练成本不划算（或与因果建模冲突更明显）。

2. **长上下文不是免费午餐**：θ 改大后短距离区分度下降，必须用 16k 长样本"补课"几十亿 token，否则短代码任务会回退。论文给了一张折线图——4k 短任务上 LCFT 后掉了约 1 个 HumanEval 点，是真实代价。

3. **自指令的数据质量靠单测过滤**：直接用大模型生成对话作训练数据会引入大量错答，**必须能跑能验证**才能筛——所以 Code Llama 团队让模型出"带单测的题"，答错的丢掉。这套方法依赖代码这种"能机械验证"的领域，换到通用对话不好复用。

4. **模型卡 vs 现实差距**：HumanEval / MBPP 都是函数级单文件题，**不能反映真实工程任务**（多文件改动、依赖更新、调试）。Code Llama 在 SWE-bench 这种真实任务上表现远不如分数。

5. **Python 专化版的 Python 数据怎么选没公开**：论文只说"100B Python tokens"，没给来源、清洗规则、版权审计。后来开源社区想复刻只能猜——这是开源透明度上的遗憾。

## 适用 vs 不适用场景

**适用**：
- 想理解 2023 年后开源代码模型的训练配方（DeepSeek-Coder / StarCoder2 / Qwen-Coder 都是这个思路的延伸）
- 自建代码助手时参考长上下文与 FIM 的训练超参
- 做 IDE 代码补全（FIM 双侧补中间是关键能力）

**不适用**：
- 想要 SOTA：2024 年后已被 DeepSeek-Coder-V2 / Qwen2.5-Coder 全面超越
- 想要安全合规：Instruct 版的 RLHF 数据未公开
- 想要训练代码：Meta 没放训练数据集详细配比

## 历史小故事（可跳过）

- **2023 年 7 月**：Llama 2 开源
- **2023 年 8 月**：Code Llama 论文上 arXiv，权重同步开源（7/13/34B）
- **2024 年 1 月**：Code Llama 70B 补发（无 FIM）
- **2024 年**：DeepSeek-Coder / StarCoder2 / Qwen2.5-Coder 接力，开源代码模型完全跑赢 GPT-3.5

Code Llama 是开源代码模型生态的"奠基性配方书"。

## 学到什么

1. **代码 LLM 训练 = 通用基模 + 继续预训练 + 长上下文 + 中间填充 + 指令微调**，五个环节缺一不可
2. **RoPE θ 是廉价的长上下文杠杆**——改一个超参 + 微调几十亿 token = 25 倍上下文
3. **自指令 + 单测过滤** 是代码领域专属的数据增强手法，能机械验证的任务才能这么玩
4. **能力 vs 安全是个真实权衡**：Instruct 版本在硬指标上倒退，团队选了"拒答更稳"那一边

## 延伸阅读

- 论文：[Code Llama arXiv:2308.12950](https://arxiv.org/abs/2308.12950)
- Meta 博客：[Introducing Code Llama](https://ai.meta.com/blog/code-llama-large-language-model-coding/)
- FIM 原始论文：[Bavarian et al. 2022](https://arxiv.org/abs/2207.14255)（OpenAI 提出，Code Llama 继承）
- RoPE θ 调参分析：[Su et al. 2024 — Scaling Laws of RoPE](https://arxiv.org/abs/2310.05209)
- [[attention]] —— Transformer 注意力机制基础
- [[llama]] —— Code Llama 的基模

## 关联

- [[attention]] —— Transformer 是 Code Llama 的骨架
- [[deepseek-coder]] —— 直接继承 Code Llama 训练配方并超越它
- [[starcoder2]] —— 同期另一条开源代码模型路线
- [[rope-position]] —— Code Llama 长上下文靠改 RoPE θ 实现
- [[self-instruct]] —— Code Llama Instruct 数据来源
- [[humaneval-2021]] —— Code Llama 的主要评测集
- [[llama]] —— 基础模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[deepseek-coder-2024]] —— DeepSeek-Coder — 按整个仓库喂代码的开源 SOTA
- [[entity-tracking-states]] —— Entity Tracking States — 语言模型不是一路记账，而是最后临时汇总
- [[mira-rubric]] —— MIRA Rubric — 给混合训练数据先定评分尺再筛选
- [[passnet-graph-compiler]] —— PassNet — 让大模型给图编译器写优化 pass
- [[schgen-pcb]] —— SchGen PCB — 把一句需求变成可编辑电路原理图
- [[starcoder-2023]] —— StarCoder — 把训练数据完整公开的 15B 代码模型
