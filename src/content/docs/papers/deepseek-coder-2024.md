---
title: DeepSeek-Coder — 按整个仓库喂代码的开源 SOTA
来源: 'Guo, Zhu, Yang et al. (DeepSeek-AI), "DeepSeek-Coder: When the Large Language Model Meets Programming", arXiv:2401.14196 (2024)'
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

DeepSeek-Coder 是 2024 年 1 月开源的一组代码大模型，从 1.3B 到 33B 共四档，从零训练 2 万亿 token，覆盖 87 种编程语言。日常类比：传统代码模型训练像给学生发一沓沓零散笔记本，每本独立看；这篇换了发书方式——把同一个仓库的所有文件按"谁依赖谁"装订成一本完整教材，让模型从头到尾顺着读一遍。

它做对了两件工程：

1. **按仓库（repo-level）组织数据**——同一个 GitHub 项目的文件不再被打散，而是按 `import` / `include` 关系排成依赖顺序后整体喂进模型。
2. **学会"填中间"**——除了续写，还专门用 fill-in-the-middle（FIM）目标，让模型练在已有代码中间挖个洞补回来。

结果：在作者复现设定下，33B 版本在多数主流代码基准上同时超过 Meta CodeLlama-34B，Instruct 版也超过 OpenAI GPT-3.5 / Codex。

## 为什么重要

- **打破"开源代码模型不如闭源"的格局**：HumanEval 上 33B-Instruct 拿 79.3%，在作者评测设定下超过 GPT-3.5-Turbo（约 76%）。
- **许可宽松**：明确允许商用，相比 LLaMA-2 系列对小公司更友好——很多 AI IDE 创业团队的本地推理底座最早都用它。
- **两个范式后来被反复复用**：repo-level 拓扑排序、FIM 占 50% 训练量，几乎成了 2024 年后开源代码模型的标准动作。
- **小模型也能打**：7B 版本性能接近 CodeLlama-34B（参数小 5×），说明数据组织和训练目标比单纯堆参数更值钱——这给资源有限的团队指了条路。

## 核心要点

把训练拆成 **三个关键决定**：

1. **数据按"仓库 + 依赖序"组织**——常规做法是把每个 `.py` 文件当独立样本；DeepSeek-Coder 解析每个仓库内的 import / include，做拓扑排序，让被依赖的文件在前、调用方在后，整库串成一个长序列喂入。模型由此学到"跨文件引用"。

2. **FIM（Fill-in-the-Middle）训练目标**——除常规续写外，把代码切成"前缀 / 中间 / 后缀"，让模型给定前缀+后缀来补中间。比例设到 0.5（一半样本是 FIM）。这是 IDE 补全的真实形态：光标常常在文件中间，前后都有上下文。

3. **数据配比与规模**——~87% 源代码 + ~10% 英文（markdown / StackExchange）+ ~3% 中文，总共 2T token，上下文窗口 16K。中文那部分让模型在中文注释、中文需求描述场景下不至于"失语"。

三者合起来 = "把模型当作一个会读整个项目的实习生在练习填空"。

## 实践案例

### 案例 1：repo-level 拓扑排序长什么样

假设一个仓库结构：

```text
proj/
  utils.py        # 不依赖任何文件
  models.py       # import utils
  train.py        # import models, utils
```

传统方式：三个文件分别成为三条独立训练样本。
DeepSeek-Coder 方式：拓扑排序后串成一条长样本——

```text
[file=utils.py]   ...
[file=models.py]  from utils import ...
[file=train.py]   from models import ...
```

模型读到 `train.py` 时，前文里已经"见过" `utils.py` 和 `models.py` 的真实定义，能学到跨文件函数签名匹配。

### 案例 2：FIM 训练样本怎么造

原始代码：

```python
def add(a, b):
    return a + b
```

切成三段，按 PSM（Prefix-Suffix-Middle）格式重排：

```text
<PRE>def add(a, b):
    return <SUF>
<MID>a + b
```

模型看到 `<PRE>` + `<SUF>`，要预测 `<MID>` 段。训练时 50% 样本走这条路、50% 仍是普通从左到右续写，两种能力都不丢。

### 案例 3：IDE 光标在中间时 FIM 怎么用

```python
# 用户文件里光标停在中间；模型实际吃到的是：
prompt = """<PRE>def parse_csv(path):
    <SUF>
    return rows
<MID>"""
# 模型应补：with open(path) as f: rows = list(csv.reader(f))
completion = model.generate(prompt)
```

**逐部分解释**：

- 续写式模型只见前缀，容易写到与 `return rows` 对不上；FIM 同时看见前缀和后缀，目标被后缀钉住。
- 本地试用时把 tokenizer 的 FIM 特殊符号按模型卡说明填上，再 `generate`；这就是 IDE 补全体验更好的原因。
- 同理可解释为何 7B 能逼近 CodeLlama-34B：题型（repo 序 + FIM）比对路，比单纯堆参数更值钱。

## 踩过的坑

1. **FIM 比例不是越高越好**——0.5 是论文实测的甜点；继续往上抬会损伤普通续写能力，下游 instruct 阶段难拉回来。
2. **拓扑排序依赖准确解析 `import`**——Python 这种运行时 import / 动态加载，静态解析会漏边，引入噪声样本。论文用了启发式过滤，但仍非全准。
3. **33B 推理成本不低**——业界实际部署 IDE 补全多用 6.7B 蒸馏 / 4-bit 量化版；33B 更多用作离线评测和合成数据生成。
4. **HumanEval 高分会高估能力**——它只考独立小函数，真实 repo 级编辑（多文件改动、跨函数重构）要看 SWE-bench、RepoBench 等更难的集合。后续 DeepSeek-Coder-V2 才把这一档真正推上去。
5. **训练时间下限带来的"知识截止"**——2024-01 之前的语言 / 库它见过；新版本 API 改名、新框架推出之后需要靠 RAG 或继续训练补。

## 适用 vs 不适用场景

**适用**：

- AI IDE 自动补全（FIM 是为它设计的）
- 跨文件代码理解 / 生成（repo-level 训练给了它这个能力）
- 中文代码文档 / 需求理解（语料含 3% 中文）
- 想自建本地 / 内部代码模型，又怕许可踩雷

**不适用**：

- 通用对话或推理任务——它是代码模型，instruct 版也偏代码
- 超过 16K token 的整库一次性重构（窗口仍不够，需 retrieval 或 V2）
- 需要 2024-01 之后新出的语言 / 库 / 框架——必须配合 RAG

## 历史小故事（可跳过）

- **2021**：OpenAI Codex 论文 + Copilot 上线，第一次让 GPT 类模型写代码出圈，但闭源。
- **2022**：开源侧只有 InCoder / SantaCoder 等几亿到几十亿规模的小模型，HumanEval 普遍 30% 出头。同年 OpenAI 提出 FIM（Bavarian et al. 2022）。
- **2023-08**：Meta 发 CodeLlama，基于 LLaMA-2 继续训练，HumanEval 跳到 48%，开源 SOTA，但许可对商用有限制。
- **2024-01**：DeepSeek-Coder 发布，**从零训练 + repo-level + FIM + 宽松许可**，HumanEval base 56% / instruct 79%，同时超 CodeLlama 和 GPT-3.5。
- **2024-06**：DeepSeek-Coder-V2 把代码能力推到接近 GPT-4-Turbo；V1 仍被记住，因为它是"范式转变"的那一篇。

## 学到什么

1. **数据组织的回报有时大于模型规模**——同等参数下，repo-level + FIM 让 7B 追上 34B；这条心法不只对代码模型有效，对所有"训练目标贴近下游"的场景都成立。
2. **训练目标要贴近下游真实形态**——IDE 光标在中间，所以训练时一半样本必须是"中间填空"。如果只用左到右续写，下游再怎么 prompt 都补不回这部分能力。
3. **开源模型的护城河是许可**——技术差距能追，但宽松许可一旦先发就形成生态吸引力；2024 年很多 AI IDE 项目把 DeepSeek-Coder 设为默认本地后端，正是这条护城河的兑现。
4. **基准 ≠ 能力**——HumanEval 高不代表能改 repo；评估要分层（单函数 / 单文件 / 跨文件 / 整库），DeepSeek 自己后来也是这么补 V2 的。
5. **"从零训练 + 干净许可"是开源代码模型的最佳起点**——基于 LLaMA 续训的方案省钱，但许可受限会卡商用；从零训练贵，但换来生态自由。

## 延伸阅读

- 论文：[DeepSeek-Coder arXiv:2401.14196](https://arxiv.org/abs/2401.14196)
- 仓库：[github.com/deepseek-ai/DeepSeek-Coder](https://github.com/deepseek-ai/DeepSeek-Coder)
- FIM 训练目标原始论文：Bavarian et al. 2022, "Efficient Training of Language Models to Fill in the Middle"
- [[codex-2021]] —— 闭源前辈，第一次把 GPT 用在代码上
- [[codellama-2023]] —— 同期开源对手，许可受限
- [[attention]] —— 底层架构基石

## 关联

- [[codex-2021]] —— 代码 LLM 的开端，闭源
- [[codellama-2023]] —— 同档位开源对手，被 DeepSeek-Coder 反超
- [[attention]] —— Transformer 注意力机制是底座
- [[deepseek-r1]] —— 同团队后续推理模型，训练范式延续

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
