---
title: Performer — 用随机特征把 softmax attention 拉成线性复杂度
来源: 'Choromanski et al., "Rethinking Attention with Performers", ICLR 2021 (arXiv:2009.14794)'
日期: 2026-05-31
分类: 深度学习 / NLP
难度: 中级
---

## 是什么

Performer 是 Google / DeepMind / 剑桥 / Alan Turing Institute 在 2020 年提出的**线性复杂度 attention**，把标准 Transformer 里 O(L²) 的注意力降到 O(L)。日常类比：原版 attention 像让会场里每个人都和其他所有人对一次眼，人多了对不过来；Performer 让每个人先把自己"画成几条特征线"，再让特征线之间互相比较——人多了线还是那几条，时间不爆炸。

它的核心招数叫 **FAVOR+**（Fast Attention Via positive Orthogonal Random features）：

1. 把 softmax 写成一个**核函数**：`softmax(q·k) ∝ exp(q·k)`
2. 用**随机特征**做无偏估计：`exp(q·k) ≈ φ(q)·φ(k)`
3. 把 attention 重写为 `(φ(Q) · (φ(K)ᵀ V))`——先算 K 和 V 的乘积，再乘 Q，**矩阵乘法顺序一换**，复杂度就从 O(L²d) 变成 O(Lrd)，r 远小于 L

最妙的是：理论上**无偏**，可数学分析；工程上可先把预训练 softmax Transformer 的权重**直接套进** FAVOR+（通常掉 1–3 点），再微调几个 epoch 追平——算法换了不一定要从头训。

## 为什么重要

不理解 Performer，下面这些事说不通：

- 为什么 2020 年前后冒出一堆 "linear attention" 论文（Linear Transformer / Performer / Random Feature Attention），它们其实都是同一个核技巧的变体
- 为什么 [[reformer-2020]] 用 LSH 分桶、[[flash-attention]] 改 IO，而 Performer 走"重写公式"这条完全不同的路
- 为什么 Mamba / RWKV 这一代非 Transformer 架构会出现——Performer 已经把 attention "线性化"了，只差再换掉 softmax
- 为什么"长上下文"问题在 2023 年才在产品端爆发，但学界早就在 2020 年攻

它是**线性 attention 流派最严谨的代表**——理论有证明、近似有上界、可直接落地。

## 核心要点

Performer 的关键拆成三步：

1. **softmax 是核函数**：注意力权重 `softmax(QKᵀ/√d)` 的核心是 `exp(qᵢ·kⱼ)`（标准化常数先放一边）。这恰好是高斯核的一个变体，是机器学习里研究透了的对象。

2. **随机特征近似核**：经典结果（Rahimi-Recht 2007）说，任何"平移不变核"都可以写成两个随机特征的内积期望。Performer 找了一组**正随机特征**：`φ(x) = exp(-‖x‖²/2) · exp(w·x)`，其中 `w` 从标准高斯采样。它满足 `E[φ(q)·φ(k)] = exp(q·k)`，是无偏估计。

3. **正交性 + 正性 = 数值稳定**：早期 random feature 用三角函数（cos/sin），值有正有负，归一化分母容易接近 0 → 爆炸。Performer 用**正特征**（exp 永远 > 0），加上**正交约束**（采样的 w 互相正交）进一步降方差。这是这篇论文相比之前 linear attention 工作的核心修正。

4. **矩阵乘法重排序**：标准 attention 是 `softmax(QKᵀ)V`，必须先算 `QKᵀ`（L×L 大矩阵）。Performer 写成 `φ(Q)(φ(K)ᵀV)`——先算 `φ(K)ᵀV`（r×d 小矩阵），再左乘 `φ(Q)`。整体只有 O(Lrd)。

5. **归一化分母也线性化**：完整的 attention 还要除以 `Σⱼ exp(qᵢ·kⱼ)`。Performer 把分母写成 `φ(qᵢ)·(Σⱼ φ(kⱼ))`，又是一次 r 维向量内积，依然 O(Lrd) 完成。

### 一张图看懂"换顺序"

```
标准 attention（O(L²)）：
  Q (L×d) × Kᵀ (d×L) = QKᵀ (L×L)   ← 这一步爆炸
  softmax(QKᵀ) × V (L×d) = O (L×d)

Performer（O(L)）：
  φ(K)ᵀ (r×L) × V (L×d) = M (r×d)   ← 这一步只 O(Lrd)
  φ(Q) (L×r) × M (r×d) = O (L×d)    ← 又一次 O(Lrd)
```

数学上 `(AB)C = A(BC)`，但前者中间矩阵是 L×L，后者是 r×d——L=64K、r=256、d=64 时，差了几千倍显存。

## 实践案例

### 案例 1：矩阵重排两步（伪代码）

设序列长 L=10000，特征维 d=64，随机特征维 r=256。跟做下面两步：

```
# 1) 先把 K、V 收成小矩阵 M（r×d），代价 O(L·r·d)
M = φ(K).T @ V          # (r×L) × (L×d) → (r×d)

# 2) 再用 Q 的特征去读 M，代价仍 O(L·r·d)
O = φ(Q) @ M            # (L×r) × (r×d) → (L×d)
```

对比：标准路径必须先物化 `QKᵀ`（L×L）。L=10K 时两边常数开销接近；L=64K 时标准路径中间矩阵爆炸，Performer 仍是两次 O(Lrd)。**L 越长差距越大**；r 与 d 同量级时短序列反而更慢。

### 案例 2：causal 用前缀和代替 mask

语言模型要求位置 i 只能看 ≤i 的 token。没有 L×L 矩阵后，mask 怎么做？

1. 维护累加器 `S`（r×d），从左扫到右：`S ← S + φ(kᵢ) ⊗ vᵢ`
2. 当前位置输出：`oᵢ = φ(qᵢ) · S`（只读已经累加过的过去）

每步 O(rd)，总 O(Lrd)。**因果性靠累加自然成立**，不需要上三角 mask。

### 案例 3：套预训练权重 + 长序列收益

论文把训好的 BERT-base 的 softmax 换成 FAVOR+、权重不动：GLUE 掉 1–3 点，再微调几个 epoch 追平——**同一套权重，换算法实现**。ProteinNet 上氨基酸序列常到 8K–32K，标准 dense attention 在 16GB 卡上难塞下；Performer 在 L=8192 时显存约降到 1/8、准确率掉不到 1 点。这是它真正发光的场景：**标准 dense attention 跑不动的长度上，它是可行的线性方案之一**（同期还有 Reformer / Longformer 等不同路线）。

## 踩过的坑

1. **正特征是关键**：早期 linear attention 用 cos/sin 随机特征，理论一样无偏，但实际训练经常发散——softmax 分母里有负值会接近 0，再除一下就爆。Performer 把这点列为论文核心贡献。

2. **特征维 r 是超参**：r 太小近似误差大，r 太大就退化回 O(L²) 没意义。论文经验值是 r=256（d=64 时）。

3. **短序列没收益**：L<512 时常数项主导，比标准 attention 慢。Performer 是**长序列专用药**。

4. **Causal 反向传播工程难写**：前缀和的反向需要倒着累加 + 仔细的 stop_gradient，naive 实现要么慢要么数值不稳。这也是 Performer 没成为工业默认的原因之一。

5. **r 是数据无关的近似维**：和 Linformer 的低秩投影不同，Performer 的 r 不依赖具体数据分布。好处是泛化稳定；坏处是不能根据数据自适应——某些任务里其实 r=64 就够，但 Performer 不知道，得手动调。

## 适用 vs 不适用场景

**适用**：

- 超长序列建模（L > 4096，比如蛋白质序列、长文档、基因组）
- 需要严格近似精度保证的场景（理论上有方差上界）
- 想直接套预训练 softmax Transformer 权重做推理加速

**不适用**：

- 短序列（L < 1K）→ 标准 attention 更快、更准
- 对精度极敏感的小模型 → 用 [[flash-attention]]，它不近似、只改 IO
- 想完全摆脱 attention → 看 Mamba / RWKV，它们不只是线性化，而是结构换了

## 历史小故事（可跳过）

- **2007 年**：Rahimi-Recht 提出 random feature 近似核函数，拿了 NeurIPS Test of Time Award，但那时还没人想到能用在 attention 上
- **2019 年**：Katharopoulos 等人首次提出 Linear Transformer，用 elu+1 作为特征——能跑但不严谨、不稳定
- **2020 年 9 月**：Performer 上 arXiv，第一次把 random feature 严格嫁接到 softmax attention，给出无偏性证明 + 正特征修正
- **2021 年**：ICLR 接收
- **2022 年后**：FlashAttention 出来，工业界发现"不近似、改 IO"更香，Performer 退居理论参考；但它的核技巧框架被后续 linear attention（含 Mamba 里的部分推导）继承

## 学到什么

1. **复杂度可以从公式层面降**——不是只能改硬件、改 IO；把 softmax 看成核函数后，算法层就能从 O(L²) 降到 O(L)
2. **无偏估计 + 正性 + 正交性** 是数值稳定的三件套，缺一会爆
3. **矩阵乘法顺序很重要**：(AB)C 和 A(BC) 数学上一样，工程复杂度天差地别
4. **预训练权重可以共享**：算法换了不一定要从头训——可先直接替换再微调，这是 Performer 的工程友好之处
5. **理论严谨性 ≠ 工业默认**：Performer 数学最漂亮，但 FlashAttention 工程更稳；学术地位高不代表占领生产线

## 延伸阅读

- 论文 PDF：[arXiv:2009.14794](https://arxiv.org/abs/2009.14794)（30 多页，前 10 页是核心，后面是大量实验）
- Google AI Blog：[Rethinking Attention with Performers](https://ai.googleblog.com/2020/10/rethinking-attention-with-performers.html)（动画讲解 FAVOR+）
- 视频：[Yannic Kilcher — Performer](https://www.youtube.com/watch?v=xJrKIPwVwGM)（45 分钟逐式拆解）
- 代码：[google-research/google-research/performer](https://github.com/google-research/google-research/tree/master/performer)（JAX + TF）
- Rahimi-Recht 的随机特征原始论文：[Random Features for Large-Scale Kernel Machines, NeurIPS 2007](https://people.eecs.berkeley.edu/~brecht/papers/07.rah.rec.nips.pdf)

## 关联

- [[attention]] —— Performer 改造的对象，理解它的 O(L²) 起点
- [[reformer-2020]] —— 同期 efficient Transformer，用 LSH 分桶（数据相关近似），思路完全不同
- [[flash-attention]] —— 后来的工程化解法，不近似、改 IO；现已是工业默认
- [[transformer]] —— 原始架构，Performer 是它的算法层等价替换

## 一句话总结

Performer 把 softmax attention 当成核函数，再用**正随机特征**做无偏估计，复杂度从 O(L²) 降到 O(L)，是 linear attention 流派最严谨的代表——理论漂亮、工程踏实，但被后来更简单的 FlashAttention 在生产线上盖过。它留下的核技巧 / 线性化思路，仍被后续长序列与部分非 Transformer 架构工作借鉴。

## 一个常见误解

很多人以为 Performer "用了一个近似函数代替 softmax"——其实不是。Performer 是把 softmax **重写**成两个特征向量的内积期望，再用蒙特卡洛采样估计这个期望。差别在：前者是函数级近似（误差不可控），后者是统计级估计（无偏 + 方差有界）。这是 Performer 数学严谨性的来源，也是它和 Linformer 那类"硬性低秩压缩"方案的本质区别。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[reformer-2020]] —— Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)

