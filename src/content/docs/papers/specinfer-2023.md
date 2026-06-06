---
title: SpecInfer — 让大模型一次"猜一棵树"再并行验证
来源: Miao 等, "SpecInfer — Accelerating Generative LLM Serving with Tree-based Speculative Inference and Verification", arXiv 2305.09781 / ASPLOS 2024
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 进阶
provenance: pipeline-v3
---

## 是什么

SpecInfer 是一种**让大语言模型推理变快**的方法。它属于"投机解码"（speculative decoding）这一族——核心套路是：让一个**小模型先猜几步**，再让真正的大模型**一次性并行验证**这些猜测，猜对就连跳，猜错才退回原速。

SpecInfer 的关键招数是把"猜"做成**一棵树**：传统做法只猜一条线性的"下一句话"，SpecInfer 同时猜出**多条候选分支**，组成一棵 token 树，然后让大模型在**一次 forward** 里把整棵树验证完。

日常类比：你在迷宫里送外卖，传统投机解码派一个小弟先跑一条路，跑完你顺着走；如果小弟跑歪了，整段都白费。SpecInfer 派的小弟会**同时探出三条最可能的路**，你顺着走时大概率能对上其中一条，命中率自然更高。

## 为什么重要

不理解 SpecInfer，下面这些事都讲不清：

- 为什么 2024 年后所有主流投机解码（Medusa / EAGLE / EAGLE-2 / SpS）都用 "token tree"——这个范式就是 SpecInfer 提出来的
- 为什么 vLLM / SGLang / TensorRT-LLM 内部都有 "tree attention mask" 这个工程结构——它是 SpecInfer 让一次 forward 验证整棵树的核心
- 为什么"投机解码加速比从 1.4x 跳到 2x+"是 2023 年中那段时间发生的——SpecInfer 是分水岭
- 为什么大模型推理服务一边谈"加速 3x"一边敢说"输出和原模型完全一致"——靠的是 SpecInfer 沿用并完善的 rejection sampling 数学修正

## 核心要点

SpecInfer 的三个关键洞见：

1. **洞见 A：把候选做成树而非线**
   传统投机解码只猜一条序列，错一个 token 就要退回那个位置重来。SpecInfer 让 draft 模型从根开始一次给出多条分支，每个节点几个候选，组成 token 树。命中率从"一条线全对"放宽到"一条线对就行"。

2. **洞见 B：tree attention mask 让一次 forward 验完整棵树**
   树里每个 token 只能"看到"从根到自己这条路径上的祖先。用一个特制的 attention mask 把不该看到的位置遮掉——所有路径**共享公共前缀的 KV cache**，只在分叉点之后各自独立。一次大模型 forward 就能并行验证全部分支。

3. **洞见 C：分布无损**
   验证用的是数学技巧 **rejection sampling**：候选 token 在大模型概率高就接受，低就按差值概率拒绝并重采。能证明最终输出分布**等于**让大模型直接采样的分布——加速 2x 不是"近似 2x"，是真等价。

## 实践案例

### 案例 1：SpecInfer 的 token 树长什么样

```
              [root: 上一步 token]
              /        |        \
          "the"     "a"      "this"
         /  |  \    /  \      |
     "cat" "dog" "fox" ...    ...
```

draft 模型从根开始，每一步给出 top-k 候选作为子节点，递归扩展几层。例：3 层树、每层 3 个候选 = 1 + 3 + 9 + 27 = 40 个 token，全部一次性丢给大模型验证。

### 案例 2：tree attention mask 怎么遮

假设 root 之下有两个分支 A 和 B，A 后面接 A1，B 后面接 B1：

- A 看得到 root（祖先）；看不到 B / B1（旁支）
- A1 看得到 root + A；看不到 B / B1
- B 看得到 root；看不到 A / A1
- B1 看得到 root + B；看不到 A / A1

用一个非全 1 的 mask 矩阵实现，attention 计算照常。一次 forward 出所有节点的输出，验证逻辑只走"被接受路径"。

### 案例 3：与 vanilla speculative 对比

LLaMA-65B + LLaMA-7B 当 draft（论文 Table 4 风格）：

- vanilla（线性序列，4 步）：1.5x 加速
- **SpecInfer（树深 4，每层宽 3-5）：2.0x - 2.8x**
- 任务越确定（代码 / 翻译）接受率越高，加速最大；开放生成接受率低，加速最小

### 案例 4：SpecInfer 的代码骨架

```python
# 伪代码：SpecInfer 一轮迭代
tree = draft_ssm.expand_tree(prefix, depth=4, fanout=3)
mask = build_tree_attention_mask(tree)
logits = llm.forward(tree.tokens, attention_mask=mask)
accepted = rejection_sample(tree, logits)
prefix = prefix + accepted
```

骨架看着平淡，难点都在 `build_tree_attention_mask` 和 `rejection_sample`——把"分布等价 + 一次 forward"这两件事做对。

## 踩过的坑

1. **树形不是越大越好**：树越深 / 越宽，draft 候选越多，但大模型验证一次也要算更多 token。存在一个**甜区**——SpecInfer 论文给了 LLaMA 系列的推荐值，换模型要重新调。

2. **draft 与 target 必须共享 tokenizer**：词表不一样的两个模型不能直接配对——比如把 LLaMA-7B 当 OPT-66B 的 draft 不行。换 base 模型常常意味着重训 draft。

3. **短输出摊不开**：tree 验证有固定开销（构图 + mask + rejection 计算），输出只有 30-50 token 时摊不开，可能比直接采样还慢。

4. **高温度采样命中率塌**：温度 > 1 时大模型采样更随机，draft 树命中率掉，加速比从 2x 退化到 1.2x 甚至更低。

5. **多 draft 集成的工程开销**：SpecInfer 提到 "collective boost-tuning"——用多个 SSM 集成提树覆盖率。理论好看，但工程上要管多个 draft 模型 + 多次 forward，落地一般退化为单 draft + 大树。

## 适用 vs 不适用场景

**适用**：
- 大模型（30B+）服务化部署，单请求要低延迟
- 任务确定性高（代码 / 数学 / 翻译 / 抽取） → draft 命中率高
- 中长输出（数百到数千 token） → 加速摊得开
- 有匹配 tokenizer 的小模型可用作 draft（LLaMA 家族 / Qwen 家族内部都好配）

**不适用**：
- 极小目标模型（< 7B）：自己跑就够快，加 draft 反而开销大
- 极高温度 / top-p 接近 1：命中率塌
- batch=1 短输出：固定开销摊不开
- tokenizer 不匹配的 draft / target：必须重训 draft 才能用

## 历史小故事（可跳过）

- **2018 年 Stern 等**：第一次提"块并行解码"，一次预测多个 token——投机解码的祖先
- **2022 年 11 月**：DeepMind / Google 几乎同时正式化 speculative decoding 数学框架，证明分布等价性。但都还是**线性序列**
- **2023 年 5 月 SpecInfer**：CMU / UCSD 团队把 "token tree + tree attention" 引进来，是范式转折点
- **2023 年 9 月 Medusa**：受 SpecInfer 启发，去掉独立 draft 模型，直接在 target 模型上接几个并行预测头，简化训练
- **2024 年初 EAGLE**：再进一步，把猜测从 token 层挪到特征层（hidden state），更平滑
- **2024-2025 年**：vLLM / SGLang / TensorRT-LLM 把 SpecInfer 的 "tree-based verification" 列为标配路径

整条主线：投机解码这一族不断在"draft 简单 vs 接受率高"之间找新平衡，SpecInfer 的"token tree"是其中一道分水岭。

## 学到什么

1. **多路径投机比单路径更划算**——只要验证开销不超线性，把候选从"线"扩到"树"几乎总赚
2. **mask 是隐藏的杠杆**——同一个 attention 算子，换个 mask 就能从"一条序列"变成"一棵树"，工程上几乎零成本
3. **加速要保证"等价"才有信任**——rejection sampling 把"猜得快"和"采得对"拆开，是这一族技术的根
4. **draft 和 target 一致性问题反复出现**——tokenizer / 词表 / 推理框架都要对齐，每一步都是坑
5. **token tree 这个抽象出圈了**：它后来支撑了 Medusa 多头、EAGLE 特征层递归、Lookahead n-gram 缓存——同一个数据结构演化出三种用法

## 延伸阅读

- 论文 PDF：[SpecInfer arXiv 2305.09781](https://arxiv.org/abs/2305.09781)（约 18 页）
- 官方代码：[FlexFlow Serve](https://github.com/flexflow/FlexFlow)（SpecInfer 在其中实现）
- 综述视角：[A Survey on Speculative Decoding (2024)](https://arxiv.org/abs/2401.07851)（把 SpecInfer / Medusa / EAGLE 放在一张图里）
- 视频讲解：YouTube 搜 "SpecInfer ASPLOS 2024"（一作 Xupeng Miao 的报告，30 分钟）
- [[eagle]] —— SpecInfer 的直接演化，把"猜"挪到特征层
- [[vllm]] —— 投机解码的工业落地宿主之一
- [[attention]] —— tree attention mask 的底座

## 关联

- [[eagle]] —— EAGLE 继承了 SpecInfer 的 token tree 但换成特征层投机
- [[vllm]] —— vLLM 默认支持 SpecInfer 风格的 tree-based verification
- [[attention]] —— SpecInfer 靠 attention mask 支持 tree-based 并行验证
- [[flash-attention]] —— SpecInfer 的 target forward 用 FlashAttention 提速
- [[paged-attention]] —— SpecInfer 与 PagedAttention 正交组合，分别管"猜得快"和"显存省"
- [[tensorrt-llm-2023]] —— TensorRT-LLM 把 SpecInfer 风格树验证作为推理路径之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[eagle]] —— EAGLE — 让大模型先在"特征层"猜下一步而不是猜 token
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[medusa-2024]] —— Medusa — 让大模型自己同时猜好几个 token
- [[sglang-2024]] —— SGLang — 把 LLM 程序当成共享前缀的树来跑
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎

