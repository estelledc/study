---
title: Comer 1979 — B-Tree 综述：为什么这棵树到处都有
来源: 'Douglas Comer, "The Ubiquitous B-Tree", ACM Computing Surveys 1979'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Comer 1979《The Ubiquitous B-Tree》是 ACM Computing Surveys 上的一篇 B-Tree **综述**——它不发明新东西，而是把 1972-1978 年所有 B-Tree 论文整理成**一份对照清单**：什么是基本 B-Tree、什么是 B*-Tree、B+-Tree、Prefix B+-Tree、Virtual B-Tree、Binary B-Tree、2-3 Tree……每种变体长什么样、解决什么问题、付出什么代价。

日常类比：像一份**汽车选购指南**——基本 B-Tree 是底盘，B+-Tree 加了"叶子链表"（顺序扫得动），B*-Tree 加了"延迟分裂"（更紧凑），Prefix B+-Tree 把分隔字符串砍短（更省空间），Virtual B-Tree 上了"内存映射 ECU"。一篇论文读完，知道每个变体应该选谁。

文章最大的判断：**B+-Tree 是工业落地的胜出者**——数据全在叶子 + 叶子横向链表，让点查（logd(n)）和顺序扫（每个叶子节点 1 次访问）都很便宜，IBM VSAM 第一个把它做成通用文件存取方法。

## 为什么重要

不读这篇综述，下面这些事会一直分不清：

- 为什么大家说 "InnoDB 索引是 B+-Tree" 而不是 "B-Tree" 或 "B*-Tree"——这三个**真的不一样**
- 为什么 1972 年 Bayer-McCreight 原版 B-Tree 不直接用，工业界都用 1973 年 Knuth 提的 B+-Tree 变种
- 为什么"50% 节点利用率下界 + 不需要周期 reorganization"是 B-Tree 家族最关键的工程优势
- 为什么 1979 年 IBM 的 [[system-r-1976]] 默认用 B+-Tree，今天 PostgreSQL / MySQL / SQLite 还在用同一棵树

## 核心要点

Comer 把 B-Tree 家族的差异拆成 **三条主线**：

1. **基本 B-Tree（Bayer & McCreight 1972）**：节点装 `d` 到 `2d` 个键，分裂传播只走"叶 → 根"一条路径，从根到任意叶深度相等。代价模型：每访问一个节点 = 一次磁盘 IO，find / insert / delete 都是 logd(n)。比喻：像**装满人的公交车**，每节车厢一次拉走 200 位乘客。

2. **B*-Tree vs B+-Tree（容易搞混）**：B*-Tree 是 Knuth 定义的 **2/3 装满**变体——节点满了不立刻分裂，先和邻居"再分配"，两邻居都满才分裂；B+-Tree 是另一个 Knuth 提的变体——**数据只放叶子**，内部节点只有索引和指针，叶子之间用横向链表串起来。两者解决不同问题，但很多文献把后者错叫成前者。

3. **VSAM = 把 B+-Tree 做成产品**：IBM 在 VSAM 里把 B+-Tree 变成通用文件存取方法。叶子叫 control interval（一次磁盘 IO 的单位），上层叫 control area（在同一个磁盘 cylinder 上）。这套结构被后来所有关系数据库继承。

## 实践案例

### 案例 1：尺度感——4 次磁盘读跨 100 万行

Comer 论文里的 Table I 直接给了对照表：

| 节点容量 / 文件行数 | 10³ | 10⁴ | 10⁵ | 10⁶ | 10⁷ |
|---|---|---|---|---|---|
| 节点装 10 键 | 3 | 4 | 5 | 6 | 7 |
| 节点装 50 键 | 2 | 3 | 3 | 4 | 4 |
| 节点装 100 键 | 2 | 2 | 3 | 3 | 4 |

**怎么读**：100 万行的文件，节点装 50 键的 B-Tree，**最坏 4 次磁盘读**。这是 1979 年的硬件——机械盘 ~10 ms / 次，4 次 = 40 ms 完成查询。今天 SSD 更快但比例没变。

### 案例 2：B+-Tree 的"叶子链表"为什么是 killer feature

```python
# 伪代码：在 B+-Tree 上做范围扫 100 <= id <= 200
node = find_leaf(root, key=100)  # 自上而下走 logd(n) 次磁盘读
while node is not None:
    for record in node.records:
        if record.key > 200:
            return
        yield record
    node = node.next_leaf  # 横向跳，1 次磁盘读
```

**逐部分解释**：

- `find_leaf` 走根 → 中间 → 叶，3-4 次磁盘读定位起点
- `node.next_leaf` 是叶子链表指针，**不用回根**，每个叶子 1 次磁盘 IO
- 而原始 B-Tree 没有这个链表，扫范围要走中序遍历跨多层，主存还得栈住整条路径

这就是 Comer 反复强调"B+-Tree 是 random + sequential 通吃"的原因。

### 案例 3：为什么 InnoDB 页大小是 16 KB

Comer 在第 2 节说："节点大小由硬件单次 IO 上限决定，太小浪费 IO 带宽，太大读得慢。"

VSAM 的 control interval 大小**可配置**，工程师按磁盘 cylinder 算。今天：

- InnoDB 默认 16 KB——和 SSD page size 对齐过
- PostgreSQL 默认 8 KB——和 OS page size 对齐
- SQLite 默认 4 KB——单文件场景，磁盘块对齐

挑选不是拍脑袋，是把"一次磁盘 IO 拉走多少键"这个 Comer 模型量化到具体硬件。换算公式：

```
节点容量 ≈ (页大小 - 头部) / (键长 + 指针长)
树高 = ceil(logd(行数))
最坏 IO = 树高 + 1（叶节点本身）
```

16 KB 页 + 8 字节键 + 8 字节指针 ≈ 1000 个键/节点；100 万行 → 树高 2 → 最坏 3 次 IO。

## 踩过的坑

1. **B*-Tree 和 B+-Tree 名字混用**：Comer 在论文里专门吐槽这点。B*-Tree = 2/3 装满 + 延迟分裂；B+-Tree = 数据全在叶子。今天 ACM 论文里仍然时不时用错。

2. **以为基本 B-Tree 适合顺序扫描**：1972 论文的 B-Tree 把数据散在所有节点，next 操作要走 logd(n) 次磁盘读 + 在主存里栈住整条路径。要做范围扫**必须**升级到 B+-Tree。

3. **节点大小没和磁盘块对齐**：节点设成 1 KB 而磁盘块是 4 KB → 一次磁盘读浪费 3/4 容量。VSAM 的 control interval 要"装满一个 cylinder track"是有原因的。

4. **并发场景里只锁单节点**：bottom-up insert/delete 会沿路径回溯改父节点，单节点锁触发死锁或大面积失效。要么用 Bayer-Schkolnick 1977 的预约协议（reservation 转 lock），要么用 Guibas-Sedgewick 1978 的 top-down split（下行时把"可能满"的节点先分裂掉，永远不用回溯）。

## 适用 vs 不适用场景

**适用**：

- 关系数据库的主键索引 / 二级索引（OLTP 场景，B+-Tree 变体）
- 文件系统目录（NTFS / Btrfs / ext4 HTree）
- 范围查询 + 事务一致性要求高的场景
- 数据 + 索引都太大装不进内存，必须靠磁盘

**不适用**：

- 写远多于读（日志 / 时序数据）→ [[lsm-tree-1996]] 更合适
- 全部数据装内存 → 红黑树 / 跳表更轻
- 只查点不查范围 → 哈希索引更快（O(1) vs O(log n)）
- 数据量极小（< 1 万行）→ 顺序扫就够，建索引反而慢

## 历史小故事（可跳过）

- **1968 年**：Sperry Univac、Control Data 各自做出类似的"多路平衡外存索引"（access method），都没正式命名。
- **1972 年**：Bayer 和 McCreight 在波音研究室发表《Organization and Maintenance of Large Ordered Indexes》，正式命名 **B-Tree**。"B" 代表什么作者从未明说——候选有 balanced / broad / bushy / Boeing / Bayer。详情见 [[b-tree-1972]]。
- **1973 年**：Knuth TAOCP 第 3 卷收入 B-Tree 章节，定义 B*-Tree（2/3 装满变体）和那个"未命名"的 B+-Tree 变体。
- **1977 年**：Bayer-Schkolnick 解决并发锁；Bayer-Unterauer 提出 Prefix B+-Tree（把分隔字符串砍到最短前缀）。
- **1978 年**：Guibas-Sedgewick 证明 top-down split 不需要回溯，并发锁瞬间简化。
- **1979 年**：Comer 这篇综述出现时，IBM 已经把 B+-Tree 投产做 VSAM；[[system-r-1976]] 的 [[selinger-1979]] 优化器代价模型就建立在 B-Tree 假设上。

## 学到什么

1. **算法要为硬件特性设计**：B-Tree 不是数学上"最优"的搜索树（红黑树深度更小），它的优势在于把"一次磁盘 IO"这个昂贵操作的价值榨干——这是系统层算法的典型套路。
2. **变体爆炸里挑出胜者要靠工程视角**：Comer 论文里有 7 种变体，今天工业界只剩 B+-Tree。决定权是"random + sequential 通吃 + 50% 利用率下界"，不是数学上最漂亮。
3. **综述论文的价值**：1979 年的 Comer 把分散在 20 篇论文里的内容统一到一个代价模型，这是给后来人省了 100 小时的礼物。
4. **50 年仍未被替代**：好的数据结构不是被淘汰，而是被分工。OLTP 用 B+-Tree，OLAP 用 LSM，分工清楚就稳定。

## 延伸阅读

- 论文 PDF：[Comer 1979 — The Ubiquitous B-Tree](https://carlosproal.com/ir/papers/p121-comer.pdf)（17 页，可读性极好，零基础也能跟）
- 配套读 [[b-tree-1972]] —— Bayer-McCreight 原始论文，定义基本 B-Tree
- CMU 15-445 课件：[Tree Indexes](https://15445.courses.cs.cmu.edu/fall2023/notes/08-trees.pdf)（含分裂动画）
- 可视化：[B+Tree Visualization](https://www.cs.usfca.edu/~galles/visualization/BPlusTree.html)（亲手插数据看分裂）

## 关联

- [[b-tree-1972]] —— Bayer-McCreight 原始论文，Comer 1979 综述的起点
- [[system-r-1976]] —— 第一个用 B+-Tree 做主索引的关系数据库
- [[selinger-1979]] —— System R 查询优化器的代价模型直接基于 B-Tree 假设
- [[lsm-tree-1996]] —— B+-Tree 的"对手派"，写多读少场景用它
- [[knuth-taocp]] —— TAOCP 第 3 卷《排序与查找》里收入 B-Tree 章节，Comer 反复引用
- [[sequel-1974]] —— SEQUEL/SQL 的随机点查 + 范围查需求催生 B+-Tree
- [[ingres-1976]] —— Berkeley 平行实现的关系数据库，索引也基于 B-Tree

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[art-2013]] —— ART 自适应基数树 — 内存数据库为主索引重新选材
- [[b-tree-1972]] —— B-Tree 1972 — 磁盘友好的索引结构
- [[btrfs-2013]] —— Btrfs — Linux 上"写时复制 B-tree"的工业级文件系统
- [[hnsw-2018]] —— HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[knuth-taocp]] —— Knuth TAOCP — 计算机程序设计艺术
- [[leveldb]] —— LevelDB — Google LSM 库
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[rocksdb-2017]] —— RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验
- [[selinger-1979]] —— Selinger 1979 — 基于代价的查询优化
- [[sequel-1974]] —— SEQUEL 1974 — 让数据库"听懂"近似英语的查询
- [[skip-list-1990]] —— Skip List — 用抛硬币代替平衡树
- [[sqlite-2022]] —— SQLite — 嵌入式数据库 30 年怎么活下来的
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库

