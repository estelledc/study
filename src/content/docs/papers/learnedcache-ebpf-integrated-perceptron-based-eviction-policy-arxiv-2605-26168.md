---
title: LearnedCache — 用 eBPF + 单层感知机给 Linux 页缓存装上"预测大脑"
来源: https://arxiv.org/abs/2605.26168
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

## 是什么

LearnedCache 是一篇 2026 年 5 月发表的论文，核心想法很简单：给 Linux 操作系统的页缓存（page cache）换一个"更聪明"的淘汰策略，用机器学习模型代替传统的 FIFO/LRU，从而减少磁盘访问、提升性能。

## 日常类比：图书馆的书架

想象图书馆有 100 个书架位（等于页缓存大小），每天读者借走各种书（磁盘页/page）。书架满了，管理员必须决定"谁该被清走"。

传统策略（FIFO）像这样：**先来先走**。第一本被放进书架的书，排到最末尾时就会被丢出去——不管它是不是大家最常借的热门书。

LRU（最近最少使用）稍微聪明一点：**最久没人碰的书先走**。但如果一本书"每隔 100 天被借一次"，LRU 会以为它"很久没用"，然后把它扔掉——结果它被扔掉之后立刻又被借了，造成"误判"。

LearnedCache 的做法是：给每本书建一个**个人档案**，记录它被借的时间间隔、这本书有多厚、上次和这次借之间隔了多久……然后用一个简单的数学模型（单层感知机）来**预测这本书下次什么时候会被借**。预测"下次借"时间最长的书，先被清走。

就像你开始整理书架时，不再看"谁来得最早"，而是看"谁最可能不会再被需要"。

## 核心概念

### 1. Linux 页缓存（Page Cache）

Linux 会把磁盘上的文件数据读进内存（RAM），这就是页缓存。下次再读同一个文件时，直接从内存返回，不用再碰磁盘——磁盘比内存慢几十到上百倍，所以这步优化极其重要。但当内存满了，Linux 必须把某些页清出去，这个**决定谁走的规则**就是"淘汰策略"（eviction policy）。Linux 默认用 MGLRU（多 generations 的 LRU 变体）。

### 2. eBPF

eBPF 是 Linux 内核里的一种"沙盒小程序"机制。你可以写一段代码，经过内核自带的验证器（verifier）检查确认"这段代码不会搞坏系统"之后，直接跑在内核的关键路径上。它的特点是**高性能 + 安全**——不像以前改内核模块那样危险。LearnedCache 用 eBPF 把 ML 模型直接塞进了内核的页缓存淘汰流程里。

但 eBPF 有两个重大限制：
- 栈大小最多 512 字节
- **不允许浮点数运算**——所有计算必须用整数

### 3. 单层感知机（Single-Layer Perceptron）

感知机是最简单的"神经网络"，只有一个公式：

```
得分 = 特征1 × 权重1 + 特征2 × 权重2 + ... + 特征n × 权重n
```

你可以把它理解为一个**加权评分表**。每张页（页缓存里的一项数据）有一组特征（比如"上次访问和这次访问隔了多久"），每个特征有权重（模型训练出来的，表示这个特征重要到什么程度）。得分高的表示"很可能很快会被再次访问"，得分低的表示"可能暂时不会被用了"。

### 4. Bradley-Terry 配对排序

LearnedCache 的模型不是直接预测"某个页下次什么时候被访问"，而是用 Bradley-Terry 模型做**两两比较**：在两个候选页之间，模型预测"A 比 B 更晚被重用"的概率是多少。

公式推导：

```
P(A 比 B 更晚被重用) = sigmoid(得分_A - 得分_B)
                      = sigmoid(w·xA - w·xB)
                      = sigmoid(w·(xA - xB))
```

其中 xA 和 xB 是两个页的特征向量，w 是感知机的权重向量。因为模型是线性的，最终在部署时不需要做复杂的 sigmoid 运算——只需要给每个页算一个简单得分，然后排序就行了。

### 5. 离散化（Discretization）

原始特征（比如"距离上次访问过了 3.7 秒"）是连续值，分布极度偏斜——大部分值集中在 0 附近，少数极端值拖到很远的右边。

离散化的做法：按**分位数**把连续值切成 10 个"区间"（bin），每个区间对应一个整数标签。这带来两个好处：
- 数据分布变得均匀，训练更稳定
- 可以用 one-hot 编码，让模型捕捉非线性关系

举例：如果"页面访问时间间隔"被离散化成 10 个 bin，那么"间隔 < 0.1 秒"是 bin 0，"0.1~0.5 秒"是 bin 1，"间隔 > 50 秒"是 bin 9。

### 6. ML-at-the-tail 架构

LearnedCache 没有完全替换 FIFO，而是用"尾端重排"的方式：先从 FIFO 队列的尾部采样 32 个候选页，然后用 ML 模型给这 32 个页打分，把**得分最低**（预测最不会被重用）的页真正淘汰掉。

这样做的原因：全量排序所有缓存页太慢了（O(N log N)），但只评估一小部分候选页，开销几乎可以忽略。

## 特征工程

LearnedCache 提取了 9 个特征，全部围绕**时间间隔**和**热度**：

| # | 特征 | 说明 |
|---|------|------|
| 1 | 页面最后两次访问的时间差 | 这张纸上次和上上次被翻，隔了多久 |
| 2 | 页面倒数第二、三次访问的时间差 | 更早之前的访问间隔 |
| 3 | 文件 inode 最后一次访问距今多久 | 整个文件上次被碰，隔了多久 |
| 4 | 文件 inode 倒数第二、三次访问的时间差 | |
| 5 | 文件内的相对访问距离 | 这次读的是文件的第几页，距离上次读的页差多远 |
| 6 | 文件大小（页数） | 文件一共多少页 |
| 7 | 页面的指数移动平均热度 | 每次访问 +1，每秒钟衰减半 |
| 8 | inode 的指数移动平均热度 | 同上，但针对整个文件 |
| 9 | 最后一次访问到被驱逐的时间 | 训练目标：从访问到被踢出缓存过了多久 |

## 代码示例

### 示例 1：训练（Python，scikit-learn）

```python
from sklearn.linear_model import SGDClassifier
from sklearn.preprocessing import OneHotEncoder
import numpy as np

# 离散化后的特征：每个特征被 one-hot 编码成多个二元列
# 假设有 9 个特征，每个 10 个 bin，共 90 列
X_train = np.random.randint(0, 2, size=(10000, 90))

# 标签：两个候选页的配对比较结果
# y = 1 表示页 A 比页 B 更晚被重用，y = 0 表示页 A 更早被重用
y_train = np.random.randint(0, 2, size=10000)

# 单层感知机：本质就是一个带线性核的 SVM
model = SGDClassifier(
    loss="modified_huber",  # 提供 sigmoid 梯度，用于训练
    max_iter=50,
    tol=1e-3,
    random_state=42
)
model.fit(X_train, y_train)

# 训练完成：model.coef_ 就是权重向量 w
w = model.coef_[0]  # 形状为 (90,)，每个 bin 对应一个权重
print(f"权重范围: [{w.min():.3f}, {w.max():.3f}]")
```

这段代码训练了一个感知机。关键点：`SGDClassifier` 用随机梯度下降，`loss="modified_huber"` 提供了类似 sigmoid 的梯度函数用于反向传播。训练出来的 `w` 就是后面要嵌入到内核里的权重。

### 示例 2：eBPF 部署（C，内核算法核心）

```c
// eBPF 程序：对每个候选页计算 ML 得分
#define PROCESS_FEATURE(feat_idx) \
do { \
    u32 idx = (feat_idx); \
    __u8 *n_bins_ptr = bpf_map_lookup_elem(&n_bins_map, &idx); \
    if (n_bins_ptr) { \
        __u64 (*bin_edges)[MAX_BINS] = bpf_map_lookup_elem(&bin_edges_map, &idx); \
        if (bin_edges) { \
            s64 (*weights)[MAX_BINS] = bpf_map_lookup_elem(&nn_weights_map, &idx); \
            if (weights) { \
                __u8 n_bins = *n_bins_ptr; \
                if (n_bins > 0 && n_bins <= MAX_BINS) { \
                    __u8 bin = discretize_feature(raw_features[feat_idx], *bin_edges, n_bins); \
                    if (bin >= MAX_BINS) bin = MAX_BINS - 1; \
                    score += (*weights)[bin]; \
                } \
            } \
        } \
    } \
} while (0)

// 离散化函数：用硬编码的 if-else 链（为了通过 eBPF 验证器）
static inline __u8 discretize_feature(__u64 value, __u64 *bin_edges, __u8 n_bins) {
    __u8 n_interior_edges = n_bins - 1;
    if (n_interior_edges > 0 && value < bin_edges[0]) return 0;
    if (n_interior_edges > 1 && value < bin_edges[1]) return 1;
    if (n_interior_edges > 2 && value < bin_edges[2]) return 2;
    if (n_interior_edges > 3 && value < bin_edges[3]) return 3;
    if (n_interior_edges > 4 && value < bin_edges[4]) return 4;
    if (n_interior_edges > 5 && value < bin_edges[5]) return 5;
    if (n_interior_edges > 6 && value < bin_edges[6]) return 6;
    if (n_interior_edges > 7 && value < bin_edges[7]) return 7;
    if (n_interior_edges > 8 && value < bin_edges[8]) return 8;
    return n_bins - 1;
}

// 在淘汰请求中，对每个候选页调用
int eviction_hook(void *ctx) {
    s64 score = 0;
    PROCESS_FEATURE(0);  // 特征 0: 页面最后两次访问时间差
    PROCESS_FEATURE(1);  // 特征 1: 页面倒数第二、三次访问时间差
    PROCESS_FEATURE(2);  // 特征 2: 文件 inode 最后一次访问距今
    // ... 更多特征
    // score 就是该页的预测得分，得分越低越应该被淘汰
    return score;
}
```

这段 eBPF 代码展示了模型在内核里的实际运行方式：**没有浮点数、没有循环、没有动态内存分配**。权重和 bin 边界通过 eBPF map（一种内核数据结构）从用户态加载，每个特征的处理就是一个"查表 + 累加"的操作。`PROCESS_FEATURE` 用宏定义展开，避免函数调用开销。

## 训练结果

论文用 Filebench 生成了 6 种模拟工作负载来训练模型，结果如下：

| 工作负载 | AUC | F1 分数 |
|----------|-----|---------|
| copyfiles | 0.999 | 0.990 |
| webserver | 0.984 | 0.930 |
| webproxy | 0.861 | 0.720 |
| openfiles | 0.823 | 0.720 |
| varmail | 0.682 | 0.650 |
| mongo | 0.661 | 0.650 |

AUC 接近 80% 意味着模型的排序能力相当不错。copyfiles 和 webserver 这种"读写模式比较规律"的工作负载，模型表现几乎完美。

## 内核实测结果

论文在 50 轮配对实验中，把 LearnedCache 跟 FIFO 做了对比。核心指标是**插入率**（insertions / accesses，越低表示缓存命中越好）：

| 工作负载 | 相对基线变化 | 是否显著 |
|----------|-------------|---------|
| webproxy | **-9.69%** | 是 (p=6.3×10⁻²¹) |
| copyfiles | **-8.78%** | 是 (p=2.5×10⁻¹⁴) |
| webserver | **-3.76%** | 是 (p=5.5×10⁻³⁰) |
| varmail | -0.08% | 是 (边缘显著) |
| openfiles | +1.02% | 否 |
| mongo | +7.28% | 否（性能下降） |

webproxy 效果最惊艳——插入率降低了 9.69%，p 值小到 10⁻²¹ 级别，说明这个改善几乎不可能是随机波动造成的。

## 关键挑战

### eBPF 里不能用浮点数

Linux 内核不允许浮点运算，所以所有权重都要**量化成整数**。做法是把浮点权重乘以 10000 再四舍五入到整数。这带来了精度损失，但实验表明影响不大。

### eBPF 验证器非常严格

循环、动态数组、深层嵌套都可能过不了验证器。LearnedCache 用了**手动展开循环**（hard-coded if-else 链）来确保验证器能静态证明数组访问不会越界。这是工程上非常务实的妥协。

### 不是所有工作负载都适用

mongo 和 openfiles 上 LearnedCache 甚至不如 FIFO。论文分析：mongo 的访问模式过于随机，模型学不到有效的规律。这说明 ML 淘汰策略**有适用的边界**——访问模式有规律的工作负载才能从中受益。

### 权重的可解释性

因为模型是线性的 + one-hot 编码，权重本身是**可解释的**。比如 webserver 工作负载中，"文件大小"和"inode 热度"的权重最高——这恰好跟一个基于规则的启发式策略能学到的一样。但在 varmail 和 mongo 上，权重分布很"散"，说明这些负载的模式更复杂，简单的线性模型不够用。

## 学习要点总结

1. **页缓存淘汰策略**不是"选了 LRU 就完事"——不同工作负载有不同的访问模式，一个策略不可能通吃
2. **ML 可以跑在内核里**，但必须做大量工程妥协：整数化、离散化、无浮点、验证器友好
3. **eBPF 是连接"灵活策略"和"高性能"的桥梁**——以前加自定义淘汰策略要改内核源码，现在 eBPF 可以热插拔
4. **模型简单反而更好**——单层感知机就能带来显著改善，复杂模型在 eBPF 的约束下反而不划算
5. **训练数据必须来自内核**——用户态的 trace 跟内核看到的视角不同，只有内核里的 eBPF tracer 能拿到真实数据

## 延伸思考

如果感知机就能带来 ~10% 的改善，那深层神经网络呢？在 eBPF 里显然不行（512 字节栈、无浮点、无动态内存），但在类似 cache_ext 这样的框架里，或许可以探索**混合方案**——轻量模型放内核实时推理，重模型放用户态做"二次调优"。这值得进一步研究。

---

**一句话总结**：LearnedCache 证明了用 eBPF 把训练好的感知机模型放进 Linux 内核页缓存淘汰流程是可行的，在特定工作负载下比 FIFO 少了最多 10% 的不必要磁盘访问——用"预测下次谁会回来"代替"谁来得最早谁就走"。
