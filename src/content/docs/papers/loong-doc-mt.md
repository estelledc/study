---
title: Loong DocMT — 长文档翻译里的会挑上下文的代理
来源: 'Yutong Wang et al., "Loong: A Human-Like Long Document Translation Agent with Observe-and-Act Adaptive Context Selection", arXiv 2026'
日期: 2026-05-29
分类: machine-learning
难度: 中级
---

## 是什么

Loong 是一个做**长文档机器翻译**的 LLM 代理：它边翻译边记笔记，但不会把所有历史都塞回上下文，而是先观察候选记忆，再选择真正有用的部分。

日常类比：像一个认真译长篇小说的人。你不会每翻一句都把前 100 页重读一遍；你会翻出三类小卡片：剧情摘要、前面已经定下来的译法、人物和术语表，然后只挑和当前段落有关的卡片放到眼前。

论文里的名字是 LOONG，它用 3E memory module（Essence、Exemplar、Entity）存历史信息，再用 observe-and-act 推理过程筛掉冗余上下文。它的目标不是让模型“看得更多”，而是让模型“看得准”。

它解决的问题很具体：长文档翻译里，句子之间会互相影响；但是全量历史太长、太吵、还容易把模型带偏。Loong 把这个矛盾拆成“记什么、取什么、用什么”三件事。

## 为什么重要

不理解 Loong，下面这些事就很难解释：

- 为什么一句话翻得对，不代表整篇文档翻得稳定；人物名、术语、语气会在几十段后漂移。
- 为什么长上下文窗口不是万能答案；无关历史越多，模型越可能被噪声干扰。
- 为什么翻译代理需要“选择上下文”的能力；真正稀缺的是注意力，不只是 token 数。
- 为什么论文报告 EN ↔ ZH/DE/FR 多方向平均最多提升 13.0 个指标点；提升主要来自少而准的上下文，而不是单纯多喂材料。

## 核心要点

1. **3E 记忆：把历史拆成三种卡片**。Essence 记录段落摘要，像“剧情提纲”；Exemplar 记录源句和译句对，像“之前这样翻过”；Entity 记录实体和术语，像“人物/术语表”。三类记忆粒度不同，避免把所有历史揉成一坨。

2. **Observe-and-act：先看候选，再决定用谁**。每次翻当前段落时，系统先从三类记忆里粗检索候选，再让模型逐类分析相关性并选择。类比：不是把整柜资料倒在桌上，而是先把可能相关的文件夹拿出来，再逐个判断。

3. **偏好学习：让模型学会好选择**。训练时，Loong 会采样多条“观察-行动”轨迹，用 COMET 分数挑出好选择和坏选择，再用 SFT + DPO 调整模型。类比：老师不只给标准译文，还指出“这张卡该用，那张卡会误导”。

## 实践案例

### 案例 1：3E 记忆长什么样

```json
{
  "essence": ["上一段说军队正在集合"],
  "exemplar": [["科伦", "Korren"], ["肖上尉", "Captain Xiao"]],
  "entity": { "科伦": "中尉，负责带队" }
}
```

**逐部分解释**：

- `essence` 是全局摘要，帮助模型知道当前段落接在哪个情节后面。
- `exemplar` 是已经确认过的译法，帮助名字、术语和风格保持一致。
- `entity` 是结构化实体表，帮助模型不要把军衔、人物关系翻错。

### 案例 2：observe-and-act 不是普通检索

```ts
const candidates = retrieveMemory(segment)
const chosen = candidates.filter((item) => {
  return modelJudge(segment, item).useful
})
const translation = translate(segment, chosen)
```

**逐部分解释**：

- `retrieveMemory` 只是粗筛，可能拿到有用内容，也可能拿到噪声。
- `modelJudge` 对每条候选做相关性判断，这就是 observe-and-act 的核心。
- `translate` 只接收被选中的上下文，所以模型不用背着一堆无关历史工作。

### 案例 3：为什么还要对齐算法

```python
def translate_aligned(lines):
    out = llm_translate_with_markers(lines)
    if aligned(lines, out) or len(lines) == 1:
        return out
    mid = len(lines) // 2
    return translate_aligned(lines[:mid]) + translate_aligned(lines[mid:])
```

**逐部分解释**：

- `llm_translate_with_markers` 给每句加编号和边界，要求模型保留这些标记。
- `aligned` 检查源句和译句是否还能一一对应，方便评测和更新记忆。
- 如果对不齐，就把段落切成两半重试；这能减少长段生成时的漏译和串行。

## 踩过的坑

1. **把长上下文当答案**：上下文越长不一定越好，因为无关历史会冲淡当前句子的真正线索。

2. **只记摘要不记译法**：摘要能保剧情，但不能保证同一个人名、术语、固定说法前后一致。

3. **只看句级指标**：句子级 COMET 可能不错，但文档级连贯性、风格一致性和术语一致性仍然会坏。

4. **忽略对齐问题**：Doc2Doc 一次生成一段很自然，但如果句子数量对不上，评测、回填记忆和人工审校都会变麻烦。

## 适用 vs 不适用场景

**适用**：

- 长篇小说、技术手册、演讲稿这类需要跨段保持一致的翻译。
- 有历史上下文，但历史里噪声很多、不能全塞给模型的任务。
- 想把翻译系统做成在线流程：每翻一段，就更新一次记忆。
- 需要在不同 LLM backbone 上迁移的场景；论文在 Qwen2.5、Qwen3、Llama3.1 上都做了实验。

**不适用**：

- 单句或很短文本翻译；这时 3E 记忆和推理选择的开销不值得。
- 对延迟极敏感的线上请求；observe-and-act 和偏好训练都比一次生成更重。
- 没有可靠评测信号的领域；训练里用 COMET 做奖励代理，如果代理指标偏了，模型也会学偏。
- 段落边界特别依赖语义的文体；论文也承认固定分段策略不一定贴合自然篇章。

## 历史小故事（可跳过）

- **2017-2021 年**：文档级 NMT 主要尝试把邻近句子编码进模型，重点是“多看一点上下文”。
- **2023 年**：LLM 被系统性用于文档级翻译，研究者发现长上下文能帮忙，但对齐和一致性仍然难。
- **2024-2025 年**：DelTA 等翻译代理开始显式维护多层记忆，说明“记忆模块”比单纯 prompt 更稳。
- **2025-2026 年**：推理模型和偏好优化进入翻译任务，Loong 把“深度推理选上下文”作为训练目标。
- **2026 年**：Loong 在新闻、演讲、网文和超长小说翻译上验证：真正关键的是记忆选择策略。

## 学到什么

- 长文档翻译的核心难点不是“翻一句”，而是“几十页后还记得自己前面怎么翻”。
- 3E 记忆把上下文拆成摘要、示例、实体三层，比一整段历史更适合被检索和筛选。
- observe-and-act 把“用哪个上下文”变成显式动作，因此可以采样、评分、偏好学习。
- Loong 的实验说明：当上下文里混入 30-50 句伪噪声时，会挑信息的代理比直接塞上下文更稳。

## 延伸阅读

- 论文 PDF：[Loong 2026](https://arxiv.org/pdf/2605.30274)（主论文，读摘要、方法图和消融表就够起步）
- 相邻工作：[Document-Level Machine Translation with Large Language Models](https://arxiv.org/abs/2304.02210)（早期系统评估 LLM 做文档级翻译）
- 前置代理：[DelTA: An Online Document-Level Translation Agent Based on Multi-Level Memory](https://arxiv.org/abs/2410.08143)（Loong 的直接邻居，重在多层记忆）
- [[dpo]] —— Loong 用偏好数据训练“好选择胜过坏选择”的策略
- [[cot]] —— observe-and-act 里的分析步骤带有链式推理味道
- [[deepseek-r1]] —— 代表“用强化学习激发推理能力”的大背景

## 关联

- [[attention]] —— 注意力决定模型怎么用上下文，Loong 则在输入前先筛上下文
- [[rag-lewis-2020]] —— RAG 是先检索再生成，Loong 是先检索记忆、再推理选择、再翻译
- [[dpo]] —— Loong 用偏好对齐学习上下文选择和翻译利用策略
- [[cot]] —— Loong 的 observe-and-act 让模型显式解释为什么选某条记忆
- [[deepseek-r1]] —— 二者都体现“用奖励/偏好训练推理行为”的路线
- [[t5]] —— 机器翻译可以看作 text-to-text 任务，Loong 是在文档层面加记忆和代理流程
- [[llama]] —— 论文把 Llama3.1-8B 作为 backbone 之一，验证方法不是只绑定某个模型家族

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
