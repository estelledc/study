---
title: Medusa — 让大模型自己同时猜好几个 token
来源: 'Cai et al., "Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads", arXiv 2401.10774 / ICML 2024'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Medusa 是一种**让大语言模型自己同时猜下一个、下下一个、下下下个 token，再一次性验证**的推理加速方法。日常类比：原本你写字是"一笔一画"，Medusa 让你左手右手一起动，同时写出后面三个字，再回头检查哪些写对了——对的留下，错的擦掉重写。

技术形式：在原模型最后一层 hidden state 上**外接 K 个并行的小 head**（默认 K=5，每个就是单层 MLP + 残差）。head k 负责预测位置 t+k+1 的 token。一次前向就拿到 5 个候选位置的 top-k token，拼成树形候选集，**一次再前向**验证哪些续写合理。

代码改动量极小（几百行 Python 集成进 vLLM / TGI），训练只要冻结 base 训 head（Vicuna-7B 单卡 A100 几小时）。

## 为什么重要

LLM 推理慢的根因是**自回归解码**——一次前向只产 1 个 token，KV cache 大半时间在等。各种加速方案里 Medusa 是工程性价比最高的一档：

- **比经典投机解码（Leviathan 2023）省一个模型**：经典方案需要训一个对齐分布的 draft 小模型，部署两个模型对齐两套权重；Medusa 只在大模型本身长几个头，省掉 draft 模型的所有对齐工程
- **比 SpecInfer 简单**：[[specinfer-2023]] 用一棵 token 树 + 一群小 draft 模型，Medusa 把"draft 模型"换成"多头并行预测"，一个模型搞定
- **2.2-3.6x 端到端加速**：Vicuna 7B / 13B / 33B 上实测；不依赖 draft 模型质量
- **被 vLLM / TensorRT-LLM 收编**：成了主流推理引擎的标配选项

不理解 Medusa，下面这些事都没法解释：

- 为什么 vLLM 配置里有 `num_speculative_tokens` 这一项
- 为什么 LLM 推理引擎评测都开始报"接受率"（acceptance rate）这个指标
- 为什么 2024 年之后小厂自训模型也敢上 spec decoding——门槛降到了"训几个 head"

## 核心要点

Medusa 的工程设计可以拆成 **三件事**：

1. **多头并行预测**：在最后一层 hidden state 之后，并联 K 个 Medusa head。head k 是一个单层 MLP（带残差到原 hidden state），输出 t+k+1 位置的 logits。一次前向同时拿到 K 个未来位置的概率分布。

2. **树形注意力（tree attention）**：把每个 head 的 top-k 候选拼成一棵 prefix tree。比如 head1 给出 {the, a}，head2 给出 {cat, dog}，组合出 4 条候选续写。用一个**精心设计的 attention mask** 让这 4 条续写在一次前向里被并行验证——不用跑 4 次。

3. **typical acceptance**：经典投机解码用严格的 rejection sampling 保证分布完全一致；Medusa 改成"按典型度阈值"接受概率合理的 token，工程更简单、效果几乎不变。

两种训练方式：

- **Medusa-1**：冻结 base 模型，只训 head（Vicuna-7B 几小时单卡 A100），加速 ~2.18x
- **Medusa-2**：联合训练 head + base（损失加权融合），加速 ~2.83x，但要更多算力

为什么"多个头"能省时间？关键在于**自回归不是物理必然，是建模惯例**——LLM 在 t 位置的 hidden state 已经"包含了未来几个 token 的概率信息"，只是原本只有一个 lm_head 去读它。Medusa 的洞察是：**让多个 head 各读一份，每个 head 学习把 hidden state 解码成"未来第 k 个 token"**——理论上当然不如老老实实每步重新前向准，但准到 60-80% 就够用。

## 实践案例

### 案例 1：默认配置下一次能"押"几个 token

Vicuna-7B 默认配置：5 个 head + 每个 head top-5 候选 + 树形拼接成 64 条路径。一次前向产生 64 条续写，验证后**平均接受 2.5 个 token**——也就是相当于一次前向出 2.5 个 token，吞吐近似翻倍。

### 案例 2：跟 vLLM 集成是什么样

```python
from vllm import LLM, SamplingParams

llm = LLM(
    model="lmsys/vicuna-7b-v1.3",
    speculative_model="FasterDecoding/medusa-vicuna-7b-v1.3",
    num_speculative_tokens=5,
)
out = llm.generate(["写一首关于秋天的诗"], SamplingParams(max_tokens=200))
```

加一行 `speculative_model` 指向预训好的 Medusa head，vLLM 内部走 Medusa 路径，**应用代码完全不用改**。

### 案例 3：跟 SpecInfer 的对比

| 维度 | Medusa | SpecInfer |
|---|---|---|
| draft 来源 | 大模型本身 + K 个 head | 多个独立小模型 |
| 对齐难度 | 训 head 即可 | 小模型需对齐大模型分布 |
| 接受策略 | typical acceptance | 严格 rejection sampling |
| 部署 | 一份权重 | 多份权重 |
| 加速 | 2-3.6x | 2-2.8x |

Medusa 的设计哲学是"**用工程简单换 5% 数学严谨**"——非严格分布对齐换来训练/部署一份权重。

### 案例 4：树形 attention 的 mask 是什么样

假设 head1 给候选 {A, B}，head2 给候选 {X, Y}。把 prompt 末尾 hidden state 记作 P，那么一次前向输入序列就是：

```
P, A, B, X, Y, X, Y
   └head1┘ └head2─┘ └head2─┘
            (跟随 A)  (跟随 B)
```

attention mask 是一个三角下三角 + 自定义遮挡的矩阵，让 X 只能看到 P 和 A，第二个 X 只能看到 P 和 B。一次前向输出 7 个位置的 logits，就拿到了所有候选续写在大模型下的"真实"概率，对照 head 给的候选去裁决。

## 踩过的坑

1. **K 不是越大越好**：K=10 比 K=5 慢，因为树形候选指数爆炸、attention mask 矩阵变大。论文实测 K=5 是 sweet spot。

2. **head 训练数据必须跟 base 推理分布一致**：用 ShareGPT 训的 head 在代码任务上接受率会跌。生产里要按业务场景采数据训 head。

3. **接受率随生成长度衰减**：开头几十 token 接受率高（2.5-3 个/次），到几百 token 后掉到 1.5-2 个/次——hidden state 跟"未来 token"的相关性随距离衰减。

4. **跟 KV cache 量化不兼容**：早期版本 Medusa head 假设 hidden state 是 fp16，跟 INT8/FP8 KV cache 配合需要额外的反量化开销。现在的实现已修。

5. **小 batch 反而变慢**：batch=1 + 短 prompt 时，多头预测的固定开销（树形 attention 的 mask 构建 + 多 head 矩阵乘）大于省下来的前向次数。生产里通常配 batch ≥ 4 才打开 Medusa。

6. **temperature 不是 0 时 typical acceptance 调参重要**：阈值太严接受率掉，太松生成质量降。论文给的默认 epsilon=0.09、delta=exp(-10) 是 Vicuna 上的经验值，换模型要重新扫。

## 适用 vs 不适用场景

**适用**：

- 服务器侧 LLM 推理加速（vLLM / TGI / TensorRT-LLM）
- 模型已固定、想压低 latency 的场景
- 中等规模（7B-70B）模型——更小没必要，更大投机收益边际下降

**不适用**：

- 端侧极小模型（1B 以下）——head 开销占比高
- 极低 batch size（≤1）+ 短 prompt 短 output——投机的固定开销反而拖慢
- 需要严格分布对齐的科研评测（要用经典 rejection sampling）

## 历史小故事（可跳过）

- **2023 年 1 月**：Leviathan 等人提出经典投机解码（需 draft 模型）
- **2023 年 11 月**：[[specinfer-2023]] 把 draft 升级成 token 树
- **2024 年 1 月**：Medusa 出现，把 draft 模型彻底干掉，工程上一个模型搞定
- **2024 年中**：vLLM / TensorRT-LLM 收编，成为生产推理标配

## 学到什么

1. **加速的关键不是新算法，是把工程复杂度降下来**——Medusa 数学上更弱，但工程上简单 10 倍，所以赢
2. **多头预测 + 树形验证** 是一个值得记住的模式，背后是"用一次前向的算力换多次前向的效果"
3. **接受率**是衡量投机解码的核心指标——加速比 ≈ 平均接受 token 数 + 1（验证那一步本身也产 1 个 token）
4. **学术 → 工程的抽税**：经典投机解码的严格 rejection sampling 是一个数学性质优美但工程麻烦的设计，Medusa 用 typical acceptance 换简单——这种"放弃 5% 数学严谨换 10x 工程便利"的取舍在系统设计里反复出现

## 延伸阅读

- 论文 PDF：[Medusa arXiv:2401.10774](https://arxiv.org/abs/2401.10774)
- 官方仓库：[FasterDecoding/Medusa](https://github.com/FasterDecoding/Medusa)
- 博客解读：[Together AI — Medusa: Simple Framework for Accelerating LLM Generation](https://www.together.ai/blog/medusa)
- [[specinfer-2023]] —— 投机解码用 token 树的前一代
- [[vllm]] —— 主流 LLM 推理引擎，Medusa 默认载体

## 关联

- [[specinfer-2023]] —— Medusa 的直接前辈，用多个小 draft 模型；Medusa 把它简化成多头
- [[vllm]] —— 工程主战场：Medusa 的 head 在 vLLM 里被调度执行
- [[flash-attention]] —— Medusa 的树形 attention 依赖 FlashAttention 内核高效跑变长 mask
- [[tensorrt-llm-2023]] —— 工业推理引擎的另一个宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[sglang-2024]] —— SGLang — 把 LLM 程序当成共享前缀的树来跑
- [[specinfer-2023]] —— SpecInfer — 让大模型一次"猜一棵树"再并行验证
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎

