---
title: Learned Index Structures — 把数据库索引看成会预测位置的模型
来源: 'Kraska, Beutel, Chi, Dean & Polyzotis, "The Case for Learned Index Structures", SIGMOD 2018'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

《The Case for Learned Index Structures》提出一个很反直觉的观点：**数据库索引本来就是模型**，只是传统索引用手写数据结构来“预测”位置，而这篇论文尝试用机器学习模型来做同一件事。

日常类比：去图书馆找一本书，B-Tree 像一层层目录牌；learned index 像熟悉书架布局的管理员，听到书名就大概指向“第 3 排第 120 格附近”，然后你在附近扫一小段确认。

论文的核心不是“神经网络替代所有数据库”，而是：当数据分布有规律时，模型可以用很小的体积预测 key 在有序数组里的位置，再用局部搜索补齐精确性。

它把范围索引、哈希索引、Bloom filter 都重新解释成“输入 key，输出位置 / 桶 / 是否存在”的预测问题，因此开出了一条“用数据分布压缩数据结构”的研究路线。

## 为什么重要

不理解这篇论文，下面这些事会一直模糊：

- 为什么 B-Tree 可以被看成“近似 CDF 的回归树”，而不是只能被看成普通树。
- 为什么 learned index 在某些只读内存数据集上能比缓存优化 B-Tree 更小、更快。
- 为什么机器学习模型不能直接替代索引，还要保留误差边界、局部搜索、overflow 结构。
- 为什么后续数据库论文会讨论 ALEX、PGM-index、RMI、learned Bloom filter 这些新索引家族。

这篇论文的重要性在于换了问题视角：传统索引问“怎么设计通用结构”，它问“这份数据自己的分布能不能帮我们少存一些结构”。

## 核心要点

1. **范围索引 = 学 CDF**：如果数组已经按 key 排好序，某个 key 的位置约等于 `F(key) * N`。类比：知道全班成绩分布后，看到 90 分就能猜它大概排在前 10%。B-Tree 其实也是分段估计位置，只是用节点和比较来做。

2. **RMI = 分层专家**：Recursive Model Index 先用一个大模型粗略判断区域，再交给下一层小模型精修。类比：商场服务台先告诉你在三楼，然后三楼导购告诉你在左侧第 5 排。这样复杂模型只做大方向，便宜模型负责最后一段。

3. **保证来自补救结构**：模型会犯错，所以论文记录每个底层模型的最大低估 / 高估误差，并在预测位置附近搜索。类比：管理员说“书在 120 格附近，误差不超过 20 格”，你扫 100-140 格就不会漏。

这三个点合起来就是 learned index 的基本公式：**模型给猜测，误差界定搜索范围，传统结构兜底最坏情况**。

## 实践案例

### 案例 1：把有序数组位置看成 CDF

```js
const keys = [10, 20, 30, 40, 50]
function predictPosition(key) {
  const min = 10, max = 50
  return Math.round(((key - min) / (max - min)) * (keys.length - 1))
}
console.log(predictPosition(40)) // 3
```

**逐部分解释**：

- `keys` 已经按大小排好，这是范围索引能工作的前提。
- `((key - min) / (max - min))` 是一个极简 CDF 近似：key 越大，位置越靠后。
- `predictPosition(40)` 直接猜到下标 3；如果数据接近线性，这个模型几乎不需要树节点。
- 真实论文里数据更复杂，所以用 RMI 和局部搜索，而不是只用一条直线。

### 案例 2：RMI 为什么像两级导航

```js
const stage1 = key => key < 1000 ? 0 : 1
const stage2 = [
  key => Math.round(key / 10),
  key => Math.round(100 + (key - 1000) / 5),
]
function lookupGuess(key) {
  const expert = stage1(key)
  return stage2[expert](key)
}
console.log(lookupGuess(1250)) // 150
```

**逐部分解释**：

- `stage1` 不直接给最终位置，只决定该交给哪个二级模型。
- `stage2[expert]` 是“局部专家”：不同数据区间可以有不同斜率和规律。
- 论文里的 RMI 可以有多层、很多模型；底层常用线性模型，因为最后一段不值得跑大网络。
- 如果某个区间太难学，hybrid index 会把底层模型换回 B-Tree，保证不会比传统结构更糟。

### 案例 3：用误差边界找回精确答案

```js
const data = [10, 20, 30, 41, 50, 60]
const predicted = 4
const minErr = -1
const maxErr = 1
function find(key) {
  for (let i = predicted + minErr; i <= predicted + maxErr; i++) {
    if (data[i] === key) return i
  }
  return -1
}
console.log(find(41)) // 3
```

**逐部分解释**：

- `predicted` 是模型猜的位置，不是最终答案。
- `minErr` / `maxErr` 是训练后在已知 key 上统计出的最坏偏差。
- 搜索只扫 `[3, 5]`，比从头扫便宜，也比树上多层跳转更顺。
- 这就是 learned index 的安全感来源：模型只负责缩小范围，精确性由验证步骤保证。

## 踩过的坑

1. **把 learned index 当成万能替代品**：论文自己强调它主要验证只读、内存、分析型场景；写多和磁盘分页仍是开放问题。

2. **以为模型预测到了就能直接返回**：数据库索引不能靠“差不多”，必须通过局部搜索或兜底结构确认 key 是否真的存在。

3. **忽略分布变化**：训练时学到的是旧数据分布；如果后续插入让分布变形，误差边界和性能都会失效。

4. **只看平均速度**：模型在容易数据上很亮眼，但复杂日志时间戳、字符串、非单调预测会放大尾部风险。

## 适用 vs 不适用场景

**适用**：

- 只读或读多写少的内存分析系统，数据可以先排序再建索引。
- key 分布有规律，例如时间戳、地理坐标、连续整数、可学习的字符串前缀。
- 索引空间非常宝贵，希望用模型参数替代大量树节点。
- 可以接受“模型预测 + 小范围校正”的工程复杂度。

**不适用**：

- 高频随机插入 / 删除的 OLTP 主索引，模型频繁重训会抵消收益。
- 物理页不连续、磁盘随机读主导的系统，CDF 到数组位置的假设被破坏。
- 强最坏情况延迟场景，不能接受某些 key 落入很大的修正窗口。
- 数据分布高度对抗或经常漂移，训练集无法代表未来查询。

## 历史小故事（可跳过）

- **1970s**：B-Tree / B+-Tree 成为数据库索引主力，核心目标是减少磁盘 IO，见 [[b-tree-1972]] 和 [[comer-1979-btree]]。
- **1990s-2000s**：内存变大后，研究者开始重新优化缓存、SIMD、分支预测，出现 FAST、ART 等硬件友好索引。
- **2017 年**：论文 arXiv 版本提出“indexes are models”，把索引和机器学习联系起来。
- **2018 年**：SIGMOD 版本引发大量后续工作，也引发“模型索引是否可靠”的争论。
- **后来**：ALEX、PGM-index、learned Bloom filter 等路线继续探索，但工业落地通常会和传统结构混合，而不是裸模型单独上场。

## 学到什么

- 索引的本质不是“树”或“哈希表”，而是把 key 映射到更小的搜索空间。
- B-Tree 的节点、哈希函数、Bloom filter 的位图都可以被重新解释成预测器。
- 机器学习模型带来空间和速度机会，也带来分布漂移、误差界、最坏情况这些系统问题。
- 这篇论文最有价值的是提出新视角，而不是证明神经网络已经能替换所有数据库索引。

## 延伸阅读

- 论文页面：[The Case for Learned Index Structures](https://arxiv.org/abs/1712.01208)
- 论文 PDF：[arXiv 1712.01208](https://arxiv.org/pdf/1712.01208)
- 批评与对照：[The Case for B-Tree Index Structures](http://databasearchitects.blogspot.com/2017/12/the-case-for-b-tree-index-structures.html)
- [[comer-1979-btree]] —— 先理解 B-Tree 家族，才能看懂论文为什么说 B-Tree 是模型。
- [[art-2013]] —— 同样关注内存索引，但 ART 仍是手写数据结构路线。
- [[silt-2011]] —— 用紧凑索引省内存的另一条系统路线。

## 关联

- [[b-tree-1972]] —— learned index 主要挑战的传统范围索引祖先。
- [[comer-1979-btree]] —— 解释 B+-Tree 为什么长期成为数据库默认选择。
- [[art-2013]] —— 内存数据库索引的强 baseline，代表非学习路线的硬件友好优化。
- [[lsm-tree-1996]] —— 写优化索引方向，与 learned index 的读多场景形成对照。
- [[rocksdb-2017]] —— 工业存储引擎里索引、压缩和写放大的现实约束。
- [[silt-2011]] —— 同样追求内存占用极低，但靠系统结构而非模型学习分布。
- [[hekaton-2013-sigmod]] —— 内存数据库场景帮助理解论文为什么强调 CPU cache 和主存索引。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
