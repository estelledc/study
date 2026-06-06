---
title: GShard — 用注解让 600B 模型自动跨设备切片
来源: 'Lepikhin et al., "GShard: Scaling Giant Models with Conditional Computation and Automatic Sharding", arXiv 2006.16668 / ICLR 2021'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级到高级
provenance: pipeline-v3
---

## 是什么

GShard 是 Google 2020 年发出的一套**让超大模型自动切到几千张卡上**的方法。日常类比：你写菜谱时只标注「土豆要切丝、肉要剁碎」，至于哪把刀、哪块案板、谁切——厨房自动安排。

技术上分两层：

- **MoE（专家混合）层**：把 Transformer 里的前馈层换成 N 个并行专家，每个 token 只激活其中 2 个 → 总参数 600B，每 token 实际只算 ~2B
- **Sharding annotation**：在张量上贴注解（`replicate` / `split(dim, mesh_axis)` / `partial`），XLA 编译器自动生成跨设备的 `all-gather` / `reduce-scatter` / `all-to-all`

最终：2048 颗 TPU v3 核、4 天，训完一个 6000 亿参数的多语言翻译模型（100 种语言 → 英语）。

## 为什么重要

不理解 GShard，下面这些事都没法解释：

- 为什么 Switch Transformer / GLaM / PaLM / T5X 都长得很像——它们都建在 GShard 的 sharding 抽象上
- 为什么 JAX 的 `pjit` 和 Pathways 用的是「贴注解 + 编译器自动并行」这套范式——直接继承 GShard
- 为什么 Megatron 时代「写个 attention 都要手写 all-reduce」终结了——分片从用户代码下沉到编译器
- 为什么 MoE 真正变得工程可行——之前 600B 的 dense 模型要 8-way TP + 8-way PP + 32-way DP 才能塞下；MoE 只要在 expert 维切到 2048 设备就够了

核心是把两件事头一回从用户代码里**剥离**：

1. **模型容量**（总参数有多大） — 由 expert 数量决定
2. **跨设备布局**（每个张量切到哪几张卡） — 由 annotation + 编译器决定

## 核心要点

GShard 的三根支柱：

1. **Annotation 三原语**：
   - `replicate`：张量在每个 device 上都有完整副本
   - `split(dim, mesh_axis)`：在指定维度切，每个 device 拿一片
   - `partial`：每个 device 上是『部分和』，编译器后续插 reduce 凑齐
2. **SPMD 编译**（single program multiple data）：所有 device 跑**同一份**编译产物，差异只在 shard 取哪一片。编译器看到 annotation 后**自动**插入 collective ops。
3. **Conditional computation（MoE）**：每 token 经 router 选 top-2 expert，没被选到的 expert 这步不算 → 600B 总参数，每 token 仅 ~2B FLOPs。

三件套合体后，用户代码看起来仍是「单设备 PyTorch 风格」，编译器接管所有 send/recv 细节。

## 实践案例

### 案例 1：一行注解切 attention 多头

```python
# 单设备代码：q/k/v 形状是 [batch, seq, heads, head_dim]
q = einsum("bsd,dhk->bshk", x, W_q)

# 加一行注解，告诉编译器把 heads 维切到 mesh 的 x 轴
mesh_split(q, dims=["heads"], mesh_axes=["x"])
```

编译器看到注解后自己干两件事：

- 把 `W_q` 沿 heads 维切成 N 份，每个 device 只算自己那一份头
- 在 attention 输出处自动插 `reduce-scatter`，把『部分和』凑成完整结果

用户代码**一行没改**，模型就从 1 卡变成了 N 卡跨设备并行。

### 案例 2：MoE 路由用的 all-to-all

MoE 的关键挑战：router 给每个 token 算出 expert 索引后，**同一个 expert 的 token 必须聚到同一个 device** 才能算。

GShard 在这一步插 `all-to-all`：每个 device 把『要去 expert k 的 token』发给负责 k 的 device。算完再 all-to-all 把结果送回来。

```
[device 0 持 expert 0,1]  [device 1 持 expert 2,3]  ...
       ↑↓ all-to-all ↑↓
[原始 token 按 sequence 切到各 device]
```

这一步是 MoE 训练的网络瓶颈——因为 all-to-all 不像 all-reduce 有成熟的树形优化。

### 案例 3：与 GPipe 流水线并行的对照

GPipe（Google 2019）切**深度方向**：layer 1-12 在 dev0，layer 13-24 在 dev1，靠 microbatch 流水填气泡。

GShard 切**宽度方向**：每一层都横切到所有 device，每个 device 持有每一层的一片。

| 维度 | GPipe | GShard |
|------|-------|--------|
| 切的方向 | 深度（layer 切片） | 宽度（tensor 维度切片） |
| 流水气泡 | 有，靠 microbatch 缓解 | 无 |
| 适合模型 | 顺序长 layer 多 | MoE / 大 hidden |
| 写法 | 显式 stage 划分 | 贴一个 annotation |

## 踩过的坑

1. **Annotation 写错编译能过但收敛崩**：早期没有静态形状校验，写错切的维度（比如把 batch 维和 seq 维搞反），编译能 compile，但 loss 飞掉。后来才加 shape 检查器。
2. **Expert capacity 设小了会丢 token**：MoE 路由有上限——某个 expert 太热门、超过 capacity 时多余 token 被**直接丢弃**（dropped token）。capacity 设太小，下游质量明显下降；设太大，浪费显存。
3. **All-to-all 是跨 pod 瓶颈**：单 TPU pod 内有专用网络，all-to-all 还能扛；跨 pod 走以太网，性能断崖式下降。
4. **SPMD 怕 straggler**：所有 device 必须步调一致，一旦某 device 慢一拍（GC、网络抖动），全局都得等它。

## 适用 vs 不适用场景

**适用**：

- TPU pod / GPU 大集群训练超大模型（>10B 参数）
- MoE / 稀疏激活模型——每 token 只走部分参数
- 同一份代码要分别跑 8 卡和 2048 卡的场景——切多少由 mesh shape 决定，代码不动

**不适用**：

- 单卡 / 小集群——注解开销大于收益，不如直接 DDP
- 动态形状或动态控制流——SPMD 要求静态计算图
- 不规则负载——router 出来的 expert 分布严重倾斜时，部分 device 闲、部分超载

## 历史小故事（可跳过）

- **2017**：Shazeer 在 LSTM 上发明 sparsely-gated MoE，工程靠手写并行——只跑得起几十张卡
- **2018**：Mesh-TensorFlow 给出 mesh + dim 注解雏形，但是 graph 模式、用户体验差
- **2019**：GPipe 解决流水线并行，但只能切 layer 维
- **2020**：GShard 把 mesh annotation + MoE + XLA 编译器**首次合体**，6000 亿参数训得动了
- **2021**：Switch Transformer 把 top-2 改 top-1，简化训练，路由从此「一条路走到底」
- **2022**：PaLM 用 GShard + Pathways 训 540B dense
- **2023**：JAX `pjit` / `shard_map` 把 GShard 风格 API 标准化，外部研究者也能用上

## 学到什么

1. **并行不是用户问题，是编译器问题** — 比争论 GPU/TPU 谁强重要得多
2. **声明式 > 命令式** — 你只说『哪个维度该切』，不说『谁该 send 给谁』
3. **MoE + 自动分片是组合解锁** — 单独任何一个都不够支撑 600B 规模
4. **从模型代码剥离系统细节** — 让算法研究者写算法，让系统工程师写编译器，两边都更专注
5. **抽象的代价是可调试性** — 编译器接管细节后，性能不达预期时定位变难，需要新的 profiling 工具链支撑

## 延伸阅读

- 论文 PDF：[GShard arXiv 2006.16668](https://arxiv.org/abs/2006.16668)
- [[mixture-of-experts]] —— MoE 概念入门
- [[xla-compiler]] —— GShard 跑在 XLA 编译器上
- [[t5]] —— 同期 Google 大模型训练栈
- [[attention]] —— 被 GShard 切片的核心层

## 关联

- [[mixture-of-experts]] —— GShard 第一次把 MoE 推到 600B 规模
- [[xla-compiler]] —— GShard 的 sharding 注解依赖 XLA 编译器自动展开 collective ops
- [[t5]] —— T5X 训练栈直接用 GShard 风格 API
- [[attention]] —— GShard 切的就是 attention 多头维度

## 一句话总结

把『模型怎么并行』变成『张量上贴注解』，让编译器接管所有跨设备通信——这是从 Megatron 手写 all-reduce 时代跨入现代大模型训练栈的分水岭。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[fsdp-2023]] —— PyTorch FSDP — 把大模型切成 N 份分到 N 张卡
- [[mixture-of-experts]] —— Mixture of Experts (MoE)
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器

