---
title: Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)
来源: 'Kitaev, Kaiser, Levskaya, "Reformer: The Efficient Transformer", ICLR 2020'
日期: 2026-05-31
分类: 深度学习 / NLP
难度: 中级
---

## 是什么

Reformer 是 Google / UC Berkeley 在 2020 年提出的**省显存版 Transformer**，目标是让一张 16GB 的卡也能训 64K 长度的序列。日常类比：原版 Transformer 像让会场里每个人都和其他所有人握一次手——人多了就握不动；Reformer 让大家先按"声音相似度"分到几个小房间，**只在自己房间里握手**。

它做了两件事：

1. **LSH attention**：用 locality-sensitive hashing 给 query / key 分桶，只在同桶内算 attention，把 O(L²) 降到 O(L log L)
2. **Reversible residual**：每层激活可由下一层反推回来，反向传播时不用全存，显存占用不再随层数 N 线性增长

结果在 enwik8 字符级语言模型上和同规模标准 Transformer 打平，但能吞下普通 Transformer 完全装不下的 64K 序列。

## 为什么重要

不理解 Reformer，下面这些事说不通：

- 为什么 2020 年前后突然冒出一堆 efficient Transformer（Longformer / BigBird / Performer / Linformer），它们解决的是同一个痛点
- 为什么"长上下文"这个词在 2023 年的 LLM 圈才火起来——其实学界 2019-2020 就已经在攻
- 为什么后来被 [[flash-attention]] 取代了——FlashAttention 不近似、不掉精度，工程上更简单

它是**长上下文 Transformer 的早期解法**，理解它就理解了"长序列难在哪"。

## 核心要点

Reformer 的两块改造分开看：

1. **LSH attention**：query 和 key 都过同一个哈希函数，哈希值相近的进同一个桶。每个 query 只和自己桶里的 key 做 dot product。实现上常用 **shared-QK**（令 Q=K），这样"自己和自己哈希"更稳。哈希函数是"随机投影 + 取符号"——投到同一象限的向量就是相似的。

2. **多轮哈希**：单轮哈希会漏配（真相似但被分到不同桶），所以做 `n_hashes` 轮（通常 4-8），把每轮的结果合并。轮数越多越接近真值，但越慢。

3. **Reversible residual layer**：借 RevNet 的思路。普通残差是 `y = x + f(x)`，反向传播要存 `x`；可逆残差把每层拆成两条路 `y1 = x1 + f(x2)` / `y2 = x2 + g(y1)`，正反向都能推。代价是反向时多一次前向计算，**省显存换算力**。

4. **分块前馈层**：FFN 也是显存大户，论文把它沿序列维度切块算，进一步压峰值。

## 实践案例

### 案例 1：LSH 怎么"分桶"

想象 query 向量 `q`、key 向量 `k`，都是 d 维。随机投影矩阵 `R` 是 `d × b`（b 是桶数的对数）：

```
hash(x) = argmax([Rx; -Rx])
```

读起来：把 `x` 投影到 `b` 维，再拼上它的反向，取最大那一维当桶号。同象限的向量大概率落同一桶。

接着把所有 token 按桶号排序、切块，每块内部做标准 attention：

- 标准 attention：L 个 query × L 个 key = L² 对
- LSH attention：L 个 query × O(log L) 个同桶 key = L log L 对

### 案例 2：可逆残差为什么能省显存

普通 N 层 Transformer 反向传播要存每层激活——显存占用 O(N × L × d)。N 增大显存线性涨。

可逆版只存最后一层。前向：

```
y1 = x1 + f(x2)
y2 = x2 + g(y1)
```

反向时从 `y1, y2` 反推 `x1, x2`：

```
x2 = y2 - g(y1)
x1 = y1 - f(x2)
```

一行减法就推回去了。代价是每层反向多一次 f / g 前向，**FLOPs 大约多 1/3 量级，显存接近常数级**。

类比：普通残差像每翻一页书都拍照存档，可逆残差像知道每页是上一页的某种确定性变换，丢了也能凭最后一页倒推回去。

### 案例 3：调 `n_hashes` 看漏配

跟做时先固定桶大小，只改哈希轮数：

1. `n_hashes=1`：同桶命中率低，长依赖 copy 任务容易掉点或发散
2. `n_hashes=4`：论文常用起点，多数任务接近 dense attention
3. `n_hashes=8`：更贴真值，但排序/分桶开销明显上涨

论文在 **enwik8 64K** 上用约 12 层打平同规模标准 Transformer（后者塞不进 16GB）；**imagenet64** 把 64×64 像素当 token 序列做自回归。调参口诀：**先够用再加轮，别一上来拉满**。

## 踩过的坑

1. **n_hashes 难调**：开太少（如 1-2 轮）哈希漏配严重，模型发散；开太多（>16）速度优势消失。论文推荐 4-8，但每个任务都得重调。

2. **省显存不省算力**：reversible residual 反向重算前向，FLOPs 大约多 1/3 量级。GPU 算力受限的场景比标准 Transformer 还慢——它换的是**显存墙**不是**算力墙**。

3. **短序列别用**：L ≲ 1024–2K 时，LSH 的分桶 / 排序 overhead 常大于省下的 attention，比标准 Transformer 慢。短序列请用普通 Transformer。

4. **复现踩雷**：官方 Trax 实现历史包袱重，HuggingFace 的 Reformer 实现存在已知数值差异，复现 enwik8 64K 结果需要严格对照原始 config（哈希轮数、桶大小、学习率 schedule 都敏感）。

## 适用 vs 不适用场景

**适用**：

- 长文档语言模型（整本书 / 代码仓库当一个序列）
- 长序列图像 / 音频 / 蛋白质建模——天然不能分块的领域
- 显存吃紧但算力相对充裕的训练场景（消费级 GPU 跑研究）

**不适用**：

- 短到中等序列（L ≲ 1024–2K）——分桶/排序 overhead 主导，反而更慢
- 推理对精度极敏感的任务——LSH 是近似
- 已经能用 [[flash-attention]] 的现代场景——FlashAttention 精确、更快、实现更简单

## 历史小故事（可跳过）

- **2019**：Sparse Transformer（Child et al.）先开了"稀疏 attention"的口子，但稀疏模式是手工设计的
- **2019 末**：Transformer-XL 用 segment recurrence 处理长序列，但本质还是分段不是真长程
- **2020 ICLR**：Reformer 把 LSH（一个信息检索老技术）+ RevNet（一个计算机视觉老技术）拼到 Transformer 上，思路新颖度高
- **2020-2021**：Longformer / BigBird（窗口 + 全局 token）/ Performer（kernel 近似）/ Linformer（低秩近似）相继出现，efficient transformer 成显学
- **2022**：FlashAttention 出现，**精确算法 + IO-aware 优化**，不损精度还更快——efficient transformer 这条线整体褪色
- **2023+**：长上下文 LLM（Claude 100K / GPT-4 128K）走 FlashAttention + 工程优化路线，不再用近似 attention

Reformer 的两个 trick 没活到工业落地，但它**第一次系统性证明了"长序列 Transformer 是工程问题不是理论问题"**。

## 学到什么

1. **复杂度墙不是理论墙是工程墙**：O(L²) 看起来无解，换个分桶视角就是 O(L log L)
2. **省显存 ≠ 省算力**——不同硬件瓶颈下选择不一样
3. **近似算法的甜蜜点很窄**：LSH 在"序列特别长 + 算力相对宽裕 + 精度可妥协"三角区有效，移开任一条件就不划算
4. **同一篇论文的两个 trick 命运分开**：reversible residual 的思想活到了 gradient checkpointing；LSH attention 被精确算法淘汰

## 延伸阅读

- 论文 PDF：[Reformer ICLR 2020](https://arxiv.org/abs/2001.04451)（12 页，公式密但读得动）
- 官方实现：[Trax / Reformer](https://github.com/google/trax)（Jax 写的，复现严格用这个）
- HuggingFace 实现：[transformers / Reformer](https://huggingface.co/docs/transformers/model_doc/reformer)（API 友好但有数值差异）
- 解析博客：[Illustrated Reformer](https://www.pragmatic.ml/reformer-deep-dive/)（图解 LSH 分桶过程）
- [[attention]] —— Reformer 改造的对象
- [[flash-attention]] —— Reformer 之后的精确解法，工业上取代了它
- [[transformer-xl-2019]] —— 同期长序列方案，思路不同（segment recurrence）

## 关联

- [[attention]] —— Reformer 把它的 O(L²) 复杂度替换成近似版
- [[flash-attention]] —— 后辈，精确算法 + IO 优化，把 Reformer 这一脉的工业地位吃掉
- [[transformer-xl-2019]] —— 同期竞品，从 recurrence 而非 sparsity 切入
- [[bert]] —— 标准 Transformer 工业落地代表，吃不下长序列的痛点正是 Reformer 要解的

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[longformer-2020]] —— Longformer — 滑窗加少数全局 token，把长文档喂进 Transformer
- [[performer-2020]] —— Performer — 用随机特征把 softmax attention 拉成线性复杂度
