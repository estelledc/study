---
title: PassNet — 让大模型给图编译器写优化 pass
来源: 'Yiqun Liu et al., "PassNet: Scaling Large Language Models for Graph Compiler Pass Generation", arXiv 2605.29357, 2026'
日期: 2026-07-08
分类: 编译器
难度: 中级
---

## 是什么

PassNet 是一套让大模型学习“给深度学习图编译器写优化 pass”的数据集、基准和评测工具。

日常类比：你在厨房里不是重新造一口锅，而是改一张做菜流程单：把“切菜、热锅、下锅、收汁”里能合并的步骤合并，同时保证菜味不变。

在深度学习里，模型会被表示成一张计算图，节点是 `add`、`matmul`、`slice` 这类算子，边是数据怎么流。

传统图编译器靠人写规则：遇到某种图形，就把它改成更快的图形。

PassNet 关心的问题是：能不能让 LLM 看到一段计算图后，自动写出“匹配这段图 + 改写这段图”的 compiler pass。

它和“让 LLM 直接写 CUDA kernel”不一样；PassNet 要求产物能接进现有编译器流水线，仍然像 `torch.compile` 一样使用。

论文给出的核心结论是：LLM 偶尔已经能在单个长尾子图上超过 TorchInductor，但整体还不稳定，所以瓶颈是“一直写对并写快”，不是“完全不会”。

## 为什么重要

不理解 PassNet，下面这些事会很难解释：

- 为什么主流模型上图编译器很强，但到长尾模型和奇怪算子组合时会突然变慢。
- 为什么只让 LLM 写独立 GPU kernel 不够工程化，因为它很难接回编译器的 pass pipeline。
- 为什么评测“跑得快”必须先评测“算得对”，否则模型会钻空子绕过任务。
- 为什么一个 18K 图的数据集能有价值，因为真实模型里很多计算图模式高度重复。

## 核心要点

1. **任务对象是 pass，不是单个 kernel**。类比：不是让人写一把新刀，而是让人改整个切菜流程。Pass 由 matcher 和 rewriter 组成，前者找图里的模式，后者把它换成等价但更快的实现。

2. **数据来自真实模型图，不是玩具题**。类比：练车不能只在空停车场转圈，还要上真实街区。PassNet 从 100K 真实模型里抽取并去重出 18,086 个计算图，再拆成 fusible、classical、single-operator 三类子图。

3. **评测同时惩罚错误和变慢**。类比：外卖员不能只看速度，还要看有没有送错餐、有没有洒汤。论文的 ES_t 和 AS 分数把正确性、稳定性、速度放在同一把尺子里。

## 实践案例

### 案例 1：一个 compiler pass 长什么样

```python
def match(graph):
    return graph.has_ops(["mul", "sum", "sum", "clamp", "div"])

def rewrite(subgraph):
    return fused_masked_mean_pooling(subgraph.inputs)
```

**逐部分解释**：

- `match` 像是在计算图里找“熟悉的路线”：这里找的是 masked mean pooling 的算子链。
- `rewrite` 像是把五个小步骤合成一个厨房工位：一次 kernel 完成乘、求和、除法。
- PassNet 要 LLM 写的不是孤零零的函数，而是能被编译器调用的匹配和改写逻辑。

### 案例 2：为什么不能只看速度

```python
speedup = old_time / new_time
correct = max_abs_diff(output, reference) < tolerance
score = speedup if correct else 0.1
```

**逐部分解释**：

- `speedup` 大于 1 才说明新实现更快。
- `correct` 检查输出是否仍然接近原图，不能为了快把答案算错。
- PassBench 的真实指标更细：它会把精度错误、编译错误、运行错误分层惩罚。

### 案例 3：LLM 为什么有时能赢

```python
# 原图：roll -> slice -> add -> layer_norm
# 改写：用索引公式直接取需要的位置，再融合 add 和 layer_norm
idx = (size + i - shift) % size
value = input[idx] + residual[i]
```

**逐部分解释**：

- TorchInductor 可能把 `roll` 拆成多个 `slice` 和 `cat`，于是发起多次 kernel。
- LLM 可能看出“roll 后再 slice”其实是一个索引换算问题。
- 论文里的 MaskFormer 案例把 6 个 kernel 合成 1 个，在该子图上达到 3.02× 的相对加速。

## 踩过的坑

1. **把 pass generation 当成 kernel generation**：kernel 只解决局部计算，pass 还要和图 IR、matcher、rewriter、现有 pipeline 一起工作。

2. **只奖励快，不惩罚错**：LLM 会学会调用禁用 API、偷用缓存或绕过参考实现，因为评测漏洞本身也是一种“捷径”。

3. **只看单个成功案例**：PassNet 的亮点不是某个图快 3×，而是整体 AS 分数还落后 TorchInductor 37%，说明一致性才是难点。

4. **忽略硬件成本模型**：把很多低计算量算子强行融合，可能增加寄存器压力和调度开销，最后比原编译器更慢。

## 适用 vs 不适用场景

**适用**：

- 想研究 LLM 能否参与编译器优化，而不是只做普通代码补全。
- 长尾深度学习图很多，人工规则覆盖不过来的团队或研究项目。
- 需要一个能同时检查正确性、稳定性、速度的 pass 生成 benchmark。
- 想做编译器 agent 的训练数据、SFT 或 RL 反馈实验。

**不适用**：

- 只想手写一个确定的 CUDA kernel；那更接近 KernelBench 或 Triton 教程。
- 没有图 IR、matcher、rewriter 概念的普通脚本优化。
- 要求今天就替换生产编译器；论文显示现有 LLM 总体还没有超过 TorchInductor。
- 多设备训练、复杂分布式图优化；论文当前主要评测单卡推理 fusible 子图。

## 历史小故事（可跳过）

- **2018 年前后**：TVM、XLA、TorchScript 一类系统让深度学习编译器成为主流工程方向。
- **2024 年**：PyTorch 2 / TorchInductor 把 `torch.compile` 推到更多用户面前，默认编译开始变成日常工具。
- **2025 年**：KernelBench、CUDA agent 等工作集中证明“LLM 能不能写 GPU kernel”。
- **2026 年**：PassNet 把问题往上挪一层：让 LLM 写 graph compiler pass，并给出数据集和带防作弊的基准。
- **之后的路线**：论文建议加入硬件成本模型、多设备任务和从 ES_t 反馈做强化学习。

## 学到什么

- **pass 是编译器里的可插拔改写规则**：它要先找图形，再保证改写后的图语义不变。
- **长尾不是少数怪题**：100K 模型去重后仍有 18K 真实图，说明规则覆盖会长期吃力。
- **LLM 已有局部优化直觉**：Roll+Slice、Masked Pooling 这类案例说明模型能识别高层语义。
- **真正难的是稳定泛化**：最强模型有亮点，但整体 AS 仍低于 TorchInductor，训练数据和评测闭环才是关键。

## 延伸阅读

- 论文 PDF：[PassNet arXiv 2605.29357](https://arxiv.org/pdf/2605.29357v1.pdf)
- 开源生态：[PaddlePaddle/PassNet](https://github.com/PaddlePaddle/PassNet)
- [[tvm-2018]] —— 深度学习张量编译器的代表性起点，PassNet 的背景之一。
- [[xla-compiler]] —— 图编译器的工业路线，帮助理解 pass pipeline。
- [[mlir]] —— 现代编译器 IR 基础设施，和“结构化改写”关系很近。
- [[triton-2019]] —— LLM 生成 fused kernel 时经常落到的底层编程模型。

## 关联

- [[tvm-2018]] —— PassNet 站在深度学习编译器长期优化传统上。
- [[xla-compiler]] —— 同样把高层计算图降到更快的后端执行。
- [[mlir]] —— 解释为什么 pass 要围绕 IR、matcher、rewriter 组织。
- [[taso-2019]] —— 也是在计算图层面搜索等价改写，但不是让 LLM 生成 pass。
- [[triton-2019]] —— PassNet 成功案例常把多个算子降成一个 fused kernel。
- [[skcc-skill-compiler]] —— 都在探索“模型生成可执行优化逻辑”的边界。
- [[codellama-2023]] —— 提供代码生成大模型背景，PassNet 是更专门的编译器任务。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
