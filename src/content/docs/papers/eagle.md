---
title: EAGLE — 让大模型先在"特征层"猜下一步而不是猜 token
来源: Li, Wei, Zhang, Zhang, "EAGLE — Speculative Sampling Requires Rethinking Feature Uncertainty", ICML 2024 / arXiv 2401.15077
日期: 2026-05-31
分类: LLM 推理
难度: 进阶
---

## 是什么

EAGLE 是一种**让大语言模型推理变快**的技术。它属于"投机解码"（speculative decoding）这一族——核心思路是：用一个轻量级模块**先猜几步**，然后让真正的大模型一次性**并行验证**这些猜测。猜对了就连跳，猜错了就退回原速。

日常类比：你在长走廊里送外卖，一次走一格慢。EAGLE 就像派一个**轻装跑腿的小弟先跑前 5 格**，你顺着小弟跑过的路一气走过去，比一格一格挪要快得多——只要小弟选的路径跟你想去的方向大致一致。

EAGLE 的特别之处：以前的"小弟"是另一个**小语言模型**（要猜出具体 token id），训练麻烦还容易猜偏；EAGLE 的小弟改在**特征层**（倒数第二层 hidden state）做猜测，更平滑、更准、更省。

## 为什么重要

不理解 EAGLE，下面这些事都讲不清：

- 为什么 vLLM / SGLang 这类推理引擎在 2024 年后把 EAGLE 列为推荐 draft 路径（需显式配置，不是开箱默认全开）
- 为什么同样是"投机解码"，Medusa / Lookahead / 普通 speculative 加速比只有 1.5x，EAGLE 能到 3x
- 为什么 LLaMA2-70B 在 EAGLE 加持下吞吐**直接翻倍**还**保证输出分布与原模型一致**（不是近似，是数学等价）
- 为什么"在特征层做事比在 token 层做事容易"是大模型工程一个反复出现的经验

## 核心要点

EAGLE 的两个关键洞见，一前一后：

1. **洞见 A：特征层比 token 层好猜**
   传统 draft 模型直接预测下一个 **token id**——这是个离散选择题（词表 32000 选 1）。EAGLE 改成预测 target 模型**倒数第二层的 hidden state**——一个连续向量。连续向量在相邻位置之间变化平滑，自回归一步预测一步，比"猜 32000 选 1"容易得多。

2. **洞见 B：特征层有"采样不确定性"，要补一个错位输入**
   同一个前缀，target 模型可能采到 token A 也可能采到 token B（因为有温度采样）。所以"前缀 → 下一个特征"这个映射其实是**一对多的**。EAGLE 的解法：把**已采样的 token 序列向前错一位**作为额外输入塞给 draft head——告诉它"上一步你采到的是 A 不是 B"，把不确定性消解。

加起来叫 **EAGLE Head**：一个跟 target 模型共享 embedding 的小 transformer，输入 = 上一步 hidden + 错位 token，输出 = 下一步 hidden + 下一步 token logits。

## 实践案例

### 案例 1：vLLM 里启用 EAGLE

```python
from vllm import LLM, SamplingParams

llm = LLM(
    model="meta-llama/Llama-2-70b-chat-hf",
    speculative_config={
        "method": "eagle",
        "model": "yuhuili/EAGLE-llama2-chat-70B",
        "num_speculative_tokens": 5,
    },
)
out = llm.generate(["你好"], SamplingParams(temperature=0.7))
```

vLLM 用 `speculative_config` 把 EAGLE head 加载进来；每一轮 forward 让 head **预测 5 个未来 token**，target 对这 5 个候选**一次性 forward**验证。命中前 k 个就一次跳 k+1 步。

### 案例 2：EAGLE 比 vanilla speculative 快多少

LLaMA2-Chat 70B + 单 GPU 输出场景（论文 Table 2）：

- vanilla speculative（独立 7B draft）：1.4x 加速
- Medusa（多头并行）：2.2x
- **EAGLE：2.7x - 3.5x**（看任务）
- 代码生成 / 数学推理任务接受率最高，加速最明显

### 案例 3：EAGLE 为什么"分布无损"

投机解码用了一种叫 **rejection sampling**（拒绝采样）的修正：
- 候选 token 在 target 概率高 → 接受
- 候选 token 在 target 概率低于某阈值 → 按差值概率拒绝并重采

数学上能证明：经过这个修正，**最终输出的分布与直接用 target 模型采样完全一致**。EAGLE 不破坏这个性质，所以"加速 3x"不是"近似 3x"——是真等价。

### 案例 4：EAGLE head 长什么样

```
[t-1 hidden, t-1 token, t token]  ← 输入：错位 token + 上一步 hidden
             ↓
       一层 transformer block
             ↓
[t hidden 预测]  +  [t+1 token logits]
             ↓
   作为下一步的输入循环
```

整个 head 的参数量是 target 模型的 1-2%。训练数据用 target 模型自己的输出（teacher-forcing），训练目标是让 head 的 hidden 和 logits 与 target 输出尽量接近——一个标准蒸馏问题。

## 踩过的坑

1. **EAGLE head 不能跨 target 模型迁移**：`EAGLE-llama2-7b` 不能套到 LLaMA3-7B 上。换 base 模型必须重训 head（好在 head 很小，几小时能训完）。

2. **小 batch 下加速比下降**：验证一次要跑 target 模型完整 forward。batch 大时这次 forward 摊给 5 个候选 token，单 token 成本低；batch 小时摊不开，加速比掉到 1.5x 以下。

3. **温度越高、加速越低**：高温度下 target 模型采样更随机，draft 猜中率下降。生产场景如果 temperature > 1，EAGLE 收益接近消失。

4. **EAGLE-2 / EAGLE-3 是后续工作，不要混淆**：本文（EAGLE-1，2024.01）用**静态 tree**做候选展开；EAGLE-2（2024.06）改 dynamic tree 再快 20-40%；EAGLE-3（2024.10）融合多层特征对齐数据规模。线上部署一般用 EAGLE-2 或 -3。

5. **draft tree 深度调参**：EAGLE 一次猜多步是用一棵 token 树（每个节点几个候选）。树太深算力浪费在最终被拒的分支；太浅又拿不到多步收益。论文里给了 LLaMA2-7B / 70B 的推荐深度，照搬别的模型不一定最优。

## 适用 vs 不适用场景

**适用**：
- 大模型（30B+）服务化部署，单请求要低延迟
- 任务确定性高（代码 / 数学 / 翻译 / 抽取） → draft 接受率高
- 长输出场景（数百到数千 token） → 加速摊得开
- batch 中等到大（4-32），GPU 利用率有空间换 draft 验证

**不适用**：
- 极小模型（< 7B）：自己跑就够快，加 EAGLE 反而开销大
- 极高温度采样 / 大量 top-p：draft 命中率掉
- batch = 1 且短输出（< 50 token）：摊不开开销
- 边缘设备显存紧张：head 约 target 的 1–2%（大模型上可达数百 MB～1B 级），还要多占一份 KV cache

## 历史小故事（可跳过）

- **2018 年 Stern et al.**：第一次提"块并行解码"——一次预测多个 token，是投机解码的祖先
- **2022 年 DeepMind / Google**：正式化 speculative decoding 数学框架，证明分布等价性
- **2023 年初 Medusa**：放弃独立 draft model，改成"target 模型加几个并行预测头"，简化训练
- **2024 年初 EAGLE**：从 Medusa 出发但更进一步——不在 token 层做多头，而在特征层做**递归**——继承了"无独立 draft"的简洁，又拿回了 vanilla speculative 的"自回归"威力
- **2024-2025 年**：EAGLE 系列成为 vLLM / SGLang / TensorRT-LLM 默认推荐的 draft 路径

整个故事的主线：投机解码这一族，不断在"draft 简单 vs 接受率高"之间找新平衡点。

## 学到什么

1. **特征层比 token 层好做事**——这条经验在 LLM 工程反复出现：连续向量的回归比离散分类容易很多
2. **不确定性是性能瓶颈**——发现一个映射"一对多"时，找一个**让它变一对一**的额外输入，比硬学一对多有效
3. **加速要保证"等价"，否则只是近似**——rejection sampling 把"猜得快"和"采得对"拆开
4. **draft 复杂度有甜区**：太简单（一个小 LM 头）猜不准；太复杂（独立大 draft）训练慢；EAGLE 卡在中间——共享 embedding + 一层 transformer
5. **共享 embedding 是免费午餐**：head 不训练自己的 embedding，直接复用 target，省参数也省一致性问题

## 延伸阅读

- 论文 PDF：[EAGLE arXiv 2401.15077](https://arxiv.org/abs/2401.15077)（v3 是最终版，约 14 页）
- 官方代码：[SafeAILab/EAGLE](https://github.com/SafeAILab/EAGLE)（含 EAGLE-1/2/3 全系列）
- vLLM 官方文档：[Speculative Decoding](https://docs.vllm.ai/en/latest/usage/spec_decode.html)（看 EAGLE 配置）
- 视频讲解：[EAGLE 论文一作 Yuhui Li 的报告](https://www.youtube.com/results?search_query=EAGLE+speculative+decoding)（30 分钟把核心讲一遍）
- HuggingFace 上有训练好的 head 仓库（搜 yuhuili/EAGLE-*）可直接下载，不必自己训
- [[attention]] —— EAGLE head 内部还是 transformer，attention 是它的引擎
- [[vllm]] —— 投机解码的工业落地宿主
- [[speculative-decoding]] —— EAGLE 所属技术族的总览

## 关联

- [[vllm]] —— vLLM 把 EAGLE 列为推荐 draft 路径之一
- [[attention]] —— EAGLE head 是一层 transformer，依赖 attention
- [[flash-attention]] —— EAGLE 的 target 验证 forward 用 FlashAttention 提速
- [[paged-attention]] —— EAGLE 与 PagedAttention 正交组合，分别管"猜得快"和"显存省"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[rtp-llm-alibaba]] —— RTP-LLM — 把大模型推理服务做成分阶段工厂
- [[specinfer-2023]] —— SpecInfer — 让大模型一次"猜一棵树"再并行验证
- [[vericache]] —— VeriCache: Turning Lossy KV Cache into Lossless LLM Inference — 有损压缩草稿，无损输出验收
