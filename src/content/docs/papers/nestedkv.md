---
title: NestedKV — 用三层记忆决定 KV cache 该留谁
来源: 'Chen, Liu, Gao, Fan, Wang, Chu, Lin, Hu, "NestedKV: Nested Memory Routing for Long-Context KV Cache Compression", arXiv:2605.26678, 2026'
日期: 2026-07-10
分类: machine-learning / LLM 推理
难度: 进阶
---

## 是什么

NestedKV 是一种**训练无关、只看 Key** 的长上下文 KV cache 压缩方法：模型权重不动，注意力实现也不改，只在 prefill 之后决定「缓存里哪些 token 的 K/V 留下、哪些丢掉」。

日常类比：你整理一本很厚的会议纪要，不能整本随身带。NestedKV 同时用三种尺子量每一页——「整本里是否特别」「这一章里是否特别」「最近几页里是否特别」——只要任一尺子说「特别」，这页就更该留下。

它受 Nested Learning 里 Continuum Memory System 启发：把缓存看成多层时间尺度的记忆，而不是用单一分数（注意力质量、新旧程度、或离均值远近）一刀切。

一句话边界：**改的是「缓存里留谁」，不是权重文件，也不是 attention 公式**——同一套冻结 Transformer，换一种 test-time 记忆维护策略。

## 为什么重要

不理解 NestedKV，下面这些事会对不上：

- 为什么只按注意力排序压缩时，答案针常被先扔掉——注意力往往堆在句首 sink 和句尾，中间事实反而暗
- 为什么 StreamingLLM / SnapKV / KeyDiff 各有一套「单一锚点」，在激进压缩比下会突然崩
- 为什么「省显存」不等于「改模型」——NestedKV 是 test-time 记忆维护，不微调
- 为什么同一层不同 attention head 该分到不同预算——有的头盯全局，有的头盯局部段落
- 为什么长文问答里「不同问题激活不同段落」时，单一时间锚点会系统性漏掉另一批证据

## 核心要点

1. **三尺度 Key 锚点**：类比三本摘要——全书均值 μ_s、所在块均值 μ_e（块长约 clip(N/32, 128, 256)）、最近 W=64 的滑动均值 μ_c。每个 token 的归一化 key 对三个均值算余弦异常 a = −cos(k̂, μ)，越「不像摘要」越该留。稳定尺度抓全文离群，情节尺度抓段落话题切换，当前尺度抓近窗连续性。

2. **外层学习者做混合与路由**：类比班长汇总三科成绩——先按 head 自适应权重混合三尺度（先验约 0.4/0.4/0.2），若三科分歧大（surprise = 标准差高），就改信「最高分那一科」，避免平均抹掉真正异常。先验只是贝叶斯锚，不是最终系数：某个尺度在该头上更分得清好坏时，权重会偏向它。

3. **按 head 抢预算再 TopB**：类比教室座位有限——整层总预算 B_ℓ 让 (head, token) 按分数竞争，每头至少留一点；前 n_sink=4 个位置钉死。分数只依赖 Key，Value 跟着索引走，兼容现有 attention kernel。论文还强调：先问「这个 head 里谁重要」，再问「这一层座位怎么分给各 head」，两件事不要绑死成均匀配额。

## 实践案例

### 案例 1：prefill 后压缩一次

```python
# 伪代码：冻结 LLM，只改 cache 保留集合
K, V = model.prefill(tokens)          # 完整 KV
K_hat = l2_normalize(K, dim=-1)

mu_s = K_hat.mean(dim=seq)            # 稳定：全书
mu_e = block_means(K_hat, b)          # 情节：按块
mu_c = sliding_means(K_hat, W=64)     # 当前：近窗

a_s = -cosine(K_hat, mu_s)
a_e = -cosine(K_hat, mu_e)
a_c = -cosine(K_hat, mu_c)
# 每 head min-max 归一化 → 混合/路由 → TopB 索引
keep = nestedkv_select(a_s, a_e, a_c, budget=B, sink=4)
K, V = K[keep], V[keep]               # 之后 decode 只用压缩 cache
```

逐部分解释：

- `l2_normalize` 后只看方向，不看 key 模长
- 三个 `mu_*` 对应稳定 / 情节 / 当前三本摘要
- `nestedkv_select` 内部做 head 自适应混合 + surprise 路由 + sink 钉死 + TopB
- 压缩发生在 prefill 与自回归之间；每层独立算分，同层各 head 抢总预算

### 案例 2：三尺度为什么比单一 KeyDiff 稳

```text
文档：前缀 sink | … 针 A … | 重复废话块 | … 针 B … | 问题
KeyDiff 近似：只看「离全局均值远」→ 废话块里的离群噪声也可能高分
NestedKV：针 A 对 μ_s 异常；针 B 对 μ_e 异常；问题附近对 μ_c 异常
          surprise 高时走 max，任一尺度报警就保留
```

逐部分解释：单一全局几何容易把「局部话题切换」和「全文离群噪声」混为一谈；三尺度分开打分，再在分歧大时改信最强尺度。论文在 Qwen3-4B、驱逐比 r=0.75 时，RULER 相对 KeyDiff 最高约 +19.10；LongBench 平均从约 30.8 提到约 50.1。

### 案例 3：读论文数字时的 r 含义

```text
r = 丢掉的比例（eviction ratio）
r=0.25 → 还留 75% cache（温和）
r=0.75 → 只留 25%（激进，NestedKV 优势最明显）
r=0.95 → 几乎掏空；文中 LongBench 仍约 37.3 vs KeyDiff 约 17.6
```

逐部分解释：跟做实验时先固定模型与 r，再比 Full KV / SnapKV / StreamingLLM / KeyDiff；不要把「保留比」和「丢弃比」混用。短上下文 MMLU-Pro 上，温和压缩时 NestedKV 仍接近 Full KV，说明它不是「只为长文牺牲短文」。

## 踩过的坑

1. **以为要改注意力内核**：NestedKV 只改保留哪些位置；kernel 仍可 FlashAttention 一类。
2. **忘了钉 sink**：前几个位置若不强制保留，长上下文常出现的 attention sink 会丢，开头格式崩。
3. **把三尺度平均当最终分**：分歧大时平均会互相抵消，必须走 surprise 路由到 max。
4. **在 decode 每步重算全量分数**：论文主设定是 prefill 后一次性压缩；每步重算成本会吃掉省下的显存收益。
5. **均匀给每个 head 相同 B**：有的头需要更长记忆，有的头局部就够；应用层内竞争分配，而不是一刀切。

## 适用 vs 不适用场景

**适用**：

- 长 prompt（数 k–32k）推理，显存紧，愿意丢 50%–75% KV
- 冻结模型、不能微调，只要 training-free 插件
- 检索/多跳类任务，答案散落在全文而非只在句尾

**不适用**：

- 短 prompt、几乎满 cache 也能放下——Full KV 更简单
- 需要逐步动态驱逐且延迟极敏感的 serving 路径（要另做工程调度）
- 主要靠 Value 几何、而 Key 方向信息弱的设定（方法显式 key-only）
- 想「训一次通用压缩网络」——这不是 Learned compression，是规则策略

## 历史小故事（可跳过）

- **2023**：H2O / StreamingLLM 等用注意力质量或 sink+滑窗，把 KV 压成有界窗口
- **2024**：SnapKV、PyramidKV 把观察窗与分层预算写进 training-free 压缩工具箱
- **2025–2026**：Expected Attention、KeyDiff 等把评分移出纯注意力，转向期望注意力或 key 几何离群
- **2026**：NestedKV（arXiv:2605.26678，HKUST-GZ 等）把 Nested Learning 的连续记忆观搬进 KV 驱逐：三时间尺度异常 + 无参外层路由 + 按 head 抢预算
- **经验规律**：论文主结论是「越激进压缩、越长上下文，多尺度越值钱」——温和压缩时各方法差距缩小

## 学到什么

1. **单一重要性信号在激进压缩下会脆**：全局、情节、近期三种「特别」常常不是同一批 token。
2. **Key 方向已经携带可驱逐信号**：不必先算完注意力再排序，也能做 cache 维护。
3. **混合不够时要会路由**：跨尺度分歧本身是信息，用 surprise 门控比死平均稳。
4. **预算分配和 token 评分是两件事**：谁重要 ≠ 每头该分多少座位。
5. **对照要看 r 与任务类型**：RULER/LongBench 上的大分差，往往出现在高 r；短文知识题要用 MMLU-Pro 确认没有误伤。

## 延伸阅读

- 论文 PDF / HTML：[arXiv:2605.26678](https://arxiv.org/abs/2605.26678)
- Hugging Face papers 页：[NestedKV](https://huggingface.co/papers/2605.26678)
- 对照基线：StreamingLLM（attention sinks）、SnapKV、PyramidKV、KeyDiff、Expected Attention
- [[kv-fold]] —— 不驱逐、把 KV 当 fold 累加器的另一条长上下文路线
- [[paged-attention]] —— serving 侧如何分页管理 KV 显存
- [[kv-cache-budget-2026]] —— cache 预算与分配的相关讨论
- [[prefix-cache-policy-2026]] —— 前缀缓存策略，和「整段 prefill 后再压缩」互补

## 关联

- [[transformer-2017]] —— K/V 来自哪，cache 为什么随长度线性涨
- [[flash-attention]] —— 算子侧省显存；NestedKV 是缓存条目侧省显存
- [[paged-attention]] —— 把 KV 当虚拟内存页；NestedKV 决定页里留哪些 token
- [[kv-fold]] —— 保留全部历史 KV 的对照路线
- [[kv-cache-budget-2026]] —— 预算与驱逐策略的近邻笔记
- [[oscar-int2-kv]] —— 量化压缩 KV 的另一条路
- [[attention]] —— 注意力分数为何会偏向前缀/后缀，从而误导驱逐

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kv-cache-budget-2026]] —— KVBudget — 给每条请求划一块 KV cache 预算
- [[oscar-int2-kv]] —— OSCAR — 离线转个方向，把 KV Cache 压到 2-bit
