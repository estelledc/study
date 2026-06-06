---
title: Orca — 让一批 LLM 请求随到随走，不再排队等最长那个
来源: 'Yu et al., "Orca: A Distributed Serving System for Transformer-Based Generative Models", OSDI 2022'
日期: 2026-05-31
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Orca 是一篇 OSDI 2022 论文，提出 **continuous batching**（连续批处理，论文里叫 **iteration-level scheduling**）——让 LLM 推理服务器**每生成一个 token 就重新洗牌一次 batch**，而不是攒一波请求一起跑、跑完再放下一波。

日常类比：传统 batch 像**机场摆渡车**——10 个人坐满才发车，跑完一圈再回来接下一波；中途有人提前到了也得等满才走。Orca 像**自动扶梯**——你随时上、随时下，扶梯一刻不停，前面的人下了后面立刻填位。

这个设计是今天 vLLM / TGI / TensorRT-LLM / SGLang 这些 LLM serving 框架**全部默认开启**的调度方式，但起点是 Orca。

## 为什么重要

不理解 Orca，下面这些事都没法解释：

- 为什么 LLM 推理框架的核心代码 70% 都在写**调度器**，而不是矩阵乘法
- 为什么"continuous batching" 在 Orca 论文里 2022 年就有，但**社区要等 vLLM (2023)** 才真正用上——Orca 实现闭源（被 FriendliAI 商业化）
- 为什么 LLM 在线推理几乎不能用传统 ML serving 框架（TF Serving / Triton 静态 batch 模式）——请求长度方差太大，最长那个会拖死全场
- 为什么 ADR-1 / 决策树根节点的铁律是"在线 LLM 推理必须 iteration-level 调度"——这条铁律就来自 Orca

## 核心要点

LLM 推理和传统 ML 推理最大区别：**自回归**——一个请求要跑很多步（每步生成 1 个 token），每步都用前一步的输出。

Orca 把这个特性变成机会，提出**两个**关键设计：

1. **iteration-level scheduling（迭代级调度）**：batch 的边界不是"一个请求"，而是"**一步**"。每生成一个 token 后，调度器重新决定下一步谁参与——已完成的退出，新来的加入，**不需要等其他请求**。

2. **selective batching（选择性批处理）**：一个 batch 里不同请求的序列长度不同，怎么一起算？
   - 对长度无关的操作（matmul、layernorm、激活函数）→ **打平 batch 一起算**
   - 对长度敏感的操作（attention，要看每个请求自己的 KV）→ **逐请求单独算**
   
   这一刀切得很妙——把"必须分别处理"的部分隔离到最小，其余统统享受 batch 红利。

效果：GPT-3 175B 上，相同延迟 SLA，**吞吐 36.9× FasterTransformer**。

## 实践案例

### 案例 1：静态 batch vs continuous batching 的差别

假设来了 3 个请求：
- A 要生成 100 token
- B 要生成 10 token
- C 要生成 50 token

**静态 batch（传统方式）**：

```
step 1-10:   [A, B, C] 一起跑
step 11-50:  [A, _, C] B 已生成完，但位置空着浪费
step 51-100: [A, _, _] 只剩 A 一个还在用 GPU
```

GPU 大部分时间在算空位。

**continuous batching（Orca 方式）**：

```
step 1-10:   [A, B, C]
step 11:     B 完成 → 立刻把队列里 D 接上 → [A, D, C]
step 51:     C 完成 → 立刻接 E → [A, D, E]
step 101:    A 完成 → 立刻接 F → [F, D, E]
```

GPU 永远满载。

### 案例 2：selective batching 怎么处理不等长

batch 里 3 个请求，prefill 长度分别是 [128, 64, 256]：

- **matmul / FFN**：把这些 token 全打平成一个长 (128+64+256=448) 的张量，一次 matmul 算完——和长度无关
- **attention**：每个请求的 KV cache 只能自己看自己（不能跨请求 attend）→ 拆出去逐个算

这个分治让"批量计算" 和 "请求隔离" 在同一个网络里共存。

### 案例 3：vLLM 怎么继承又修补

vLLM (SOSP 2023) 直接采纳了 Orca 的两个设计，但加了一层：**PagedAttention 把 KV cache 也分页管理**。

为什么要补这层？Orca 解决了**计算调度**，但没解决**显存碎片**——KV cache 按最长可能长度预留，实际用不满就浪费。vLLM 像给 GPU 显存装了"操作系统的虚拟内存"。

所以今天的标准 LLM serving = **Orca 的调度** + **vLLM 的内存**。

## 踩过的坑

1. **不能直接套传统 ML serving 框架**：Triton / TF Serving 的 dynamic batching 是"等一段时间凑齐请求一起算"，**不是** iteration 级。这个区别让它们在 LLM 场景吞吐差一个数量级。新人常以为开了 dynamic batching 就等于 continuous batching，其实差别巨大。

2. **iteration scheduler 实现非常容易写错**：要追踪每个请求的 KV cache 状态、位置编码偏移、是否完成。早期社区复刻 Orca 的开源框架（如早期 TGI）经常 attention mask 错位、生成乱码。

3. **selective batching 在 attention 这层有性能成本**：逐请求算 attention 比真正打平慢。后来的 FlashAttention varlen kernel 把"不等长 attention"也打平算了，进一步压榨性能。

4. **不是所有模型都适合**：encoder-only（BERT 推理）和 encoder-decoder（T5）只用 prefill，没有长 decode 阶段，continuous batching 收益不大。Orca 的红利集中在 **GPT 这类 decoder-only 自回归模型**。

5. **prefill 和 decode 计算密度差太大**：prefill 阶段一次处理整个 prompt，是 compute-bound；decode 阶段每步只算 1 个 token，是 memory-bound。Orca 简单地把它们混在同一 batch，会让 prefill 的长请求拖慢 decode 的所有人——这是后来 DistServe / Sarathi-Serve 要解决的问题。

## 适用 vs 不适用场景

**适用**：
- decoder-only 自回归 LLM 在线推理（GPT 系、Llama 系、Qwen 系）
- 请求长度方差大（短问答 + 长文档生成混在一起）
- 多租户 / 多并发请求的服务器
- 任何"生成步数远多于请求数"的场景

**不适用**：
- 离线批量推理 → 静态 batch 反而更简单更快
- encoder-only 模型（embedding、分类）→ 没自回归，不需要 iteration 调度
- 单请求独占 GPU → 没 batch 收益
- 极低延迟首 token 场景需结合 prefill/decode 分离（见 DistServe / Sarathi-Serve 后续工作）

## 历史小故事（可跳过）

- **2017**：Transformer 论文发表，但当时 LLM 还没大到逼出"调度问题"。
- **2020**：GPT-3 175B 出现，单次推理也很慢。NVIDIA FasterTransformer 用静态 batch 优化算子，吞吐到瓶颈。
- **2022**：Orca 论文（首尔大学 + FriendliAI）提出 iteration-level 调度——把 OS 教科书里"协作式调度" 的思想搬到 GPU 上。
- **2023**：vLLM 把 Orca 思路 + PagedAttention 一起开源，社区第一次有完整可用的实现，整个行业 follow。
- **2024 起**：所有 LLM serving 框架的默认配置都包含 continuous batching，问题转向"prefill/decode 分离"、"chunked prefill" 等更精细调度（DistServe / Sarathi-Serve）。

## 学到什么

1. **调度器才是 LLM serving 的灵魂**——算子优化最多 2-3×，调度优化能 30×+。读 LLM 框架源码先看 scheduler，不要先看 attention kernel。
2. **OS 教科书在 GPU 时代仍然有用**——iteration scheduling 本质是"协作式多任务"，1960s 的 OS 思想换个场景再次发光。同样的还有 vLLM 的"虚拟内存"思路。
3. **闭源会让创新慢两年**——Orca 比 vLLM 早 1 年提出，但社区要等 vLLM 才真正受益。论文 + 开源实现缺一不可。
4. **selective 是个普适设计模式**——把"必须独立处理"的部分隔离到最小，其余统统批量。这个思路在分布式系统里反复出现（MapReduce 的 combiner、列存的 vectorized execution 都是同款思想）。

## 一句话记忆

**continuous batching = 把"按请求"调度换成"按 token step" 调度，让短请求随时退场、新请求随时入场，GPU 不再被最长那个请求拖死。**

如果你只能记一句话关于 LLM 推理调度，记这句。

## 延伸阅读

- 论文 PDF：[Orca OSDI 2022](https://www.usenix.org/conference/osdi22/presentation/yu)（17 页，调度部分必读，selective batching 那张图反复看）
- 视频讲解：[Anyscale — Continuous Batching 入门](https://www.anyscale.com/blog/continuous-batching-llm-inference)（含 GIF 动画对比静态 batch）
- 源码参考：vLLM `vllm/core/scheduler.py` 是 Orca 思路的开源实现样板，建议跟着 step 一遍调度循环
- 后续工作：DistServe (OSDI'24) / Sarathi-Serve (OSDI'24) 在 Orca 基础上把 prefill 和 decode 拆开调度，缓解第 5 个坑
- [[vllm]] —— Orca 思路 + PagedAttention 的开源工业实现
- [[attention]] —— selective batching 之所以要"逐请求算 attention"的根因

## 关联

- [[vllm]] —— Orca 调度器 + KV 分页内存管理 = 今天 LLM serving 的标准范式
- [[attention]] —— attention 的 KV cache 是 selective batching 必须单独处理的原因
- [[transformer]] —— 自回归 decoder 的结构造就了 iteration-level 调度的可行性
- [[triton-llm]] —— 同时代的 NVIDIA 商业方案，后来也加入了类似调度

<!-- 合并自 [[orca-2022]] dedup 2026-05-31 -->
