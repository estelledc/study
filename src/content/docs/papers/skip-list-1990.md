---
title: Skip List — 用抛硬币代替平衡树
来源: 'William Pugh, "Skip Lists: A Probabilistic Alternative to Balanced Trees", CACM 1990'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

**Skip List**（跳表）是一种**用抛硬币随机决定节点高度，从而在不写复杂旋转代码的情况下，实现 O(log n) 查找的有序数据结构**。日常类比：像北京地铁——1 号线是慢车，每站都停（最底层全量链表）；2 号线是快车，只停大站（中间层）；最高层只停换乘枢纽。要去哪儿先坐快车跳过大段，到附近再换慢车精确定位。

你写一个有序集合，传统方案是平衡二叉树（AVL / 红黑），插入要旋转、要染色、代码 500 行起。Skip List 换一种思路：

```
4 层 ──→ HEAD ─────────────────────→ 17 ───────────→ NIL
3 层 ──→ HEAD ─────→ 6 ───────────→ 17 ───────→ 25 → NIL
2 层 ──→ HEAD ─→ 3 → 6 ─────→ 12 → 17 ───→ 21 → 25 → NIL
1 层 ──→ HEAD → 1 → 3 → 6 → 9 → 12 → 17 → 19 → 21 → 25 → NIL
```

每个节点插入时抛硬币：连续抛到反面就停，抛了几次正面就升几层。这个"概率换平衡"的思路让 Redis、LevelDB、HBase 都用它做核心索引。

## 为什么重要

不理解 Skip List，下面这些事都没法解释：

- 为什么 Redis 的 sorted set 既能 O(log n) 按分数查 又能 O(1) 按 member 查——内部是 skip list + hash table 双索引
- 为什么 LevelDB / RocksDB 的 MemTable 选 skip list 而不是红黑树——lock-free 实现简单得多
- 为什么 Java 的 ConcurrentSkipListMap 是标准库唯一的并发有序 map
- 为什么"概率算法在工程上反而更稳"这种反直觉的事会发生

## 核心要点

Skip List 的全部魔法可以拆成 **三步**：

1. **多层链表叠罗汉**：第 0 层是完整有序链表。第 i 层期望只有 n/2^i 个节点，最高层只有少数几个。类比：地铁的快慢线，慢车站点全、快车站点稀。

2. **抛硬币定层数**：插入新节点时，抛硬币——正面继续升一层，反面停。每个节点平均出现在 2 层。这一步的妙处：不需要看整棵树的结构就能决定层数，所以**没有 rebalance**。类比：每个新乘客自己选要不要上快线，调度员不操心。

3. **查找"能跳就跳"**：从最高层开始，向右走，一旦下一个节点超过 target 就降一层继续。期望步数 O(log n)。类比：导航 App 先用高速跨城，到地级市再换国道，到县再换乡道。

三步加起来，代码量大约是平衡树的三分之一。

## 实践案例

### 案例 1：Redis sorted set 的 zset 结构

Redis 的 `ZADD` / `ZRANGEBYSCORE` 命令背后是 skip list：

```c
// Redis src/t_zset.c 简化版
typedef struct zskiplistNode {
    sds ele;                          // 成员名
    double score;                     // 分数
    struct zskiplistNode *backward;   // 反向指针，支持 ZREVRANGE
    struct zskiplistLevel {
        struct zskiplistNode *forward;
        unsigned long span;            // 跨过几个节点，用于 ZRANK
    } level[];                         // 柔性数组，长度 = 抛硬币结果
} zskiplistNode;
```

为什么 Redis 选 skip list 不是红黑树？作者 antirez 的解释：实现简单、范围查询天然友好（最底层就是有序链表，next 即可）、节点 size 平均才 1.33 个指针（p=0.25），内存比红黑树省。

### 案例 2：LevelDB MemTable 的并发写入

LevelDB / RocksDB 写入路径：先写 WAL，再写内存 skip list（MemTable）。skip list 满了就 flush 成 SST 落盘。

```cpp
// LevelDB include/leveldb/memtable.h 思路
template <typename Key>
class SkipList {
  // Insert 用 atomic store 设置 forward 指针
  // 多个 reader 可以无锁读，single writer 用外部 mutex
  void Insert(const Key& key);
  bool Contains(const Key& key) const;
};
```

关键是 **single-writer + many-reader 模型下完全无锁读**。读线程只用 atomic load 看 forward 指针，writer 用 release-store 发布新节点，C++ memory order 保证顺序。这种"半 lock-free"在红黑树上几乎写不出来。

### 案例 3：Java ConcurrentSkipListMap 的 lock-free 删除

JDK 自带的 `ConcurrentSkipListMap` 是 Doug Lea 实现的真 lock-free skip list：

```java
ConcurrentSkipListMap<Integer, String> map = new ConcurrentSkipListMap<>();
map.put(1, "a");  // 多线程并发安全，不需要外部锁
map.firstKey();   // O(log n) 有序查询
```

难点在删除：直接 CAS 把 prev.forward 指向 next 会丢更新（另一个线程可能正在 next 之后插入）。Fraser 2003 的方案——**先把节点标记为"已删除"（marker node），再 CAS 物理删除**——是教科书级别的并发设计。

## 踩过的坑

1. **以为 skip list 是 deterministic 的**：它本质是概率结构，最坏 O(n)（虽然概率随 n 指数衰减）。如果你的 RNG 被攻击者控制（HTTP 请求决定 key），可能被构造退化输入——这是真实的 DoS 攻击面。

2. **maxLevel 设小了**：理论上 maxLevel = log_{1/p}(N_max)。Redis 取 32（p=0.25 时支持 2^64 元素），LevelDB 取 12。设成 8 而你存了 1000 万元素，最高层就退化成 O(n/256) 的链表扫描。

3. **p 选错**：p=1/2 代码极简（位移即可）但空间占用 2n 指针；p=1/4 空间降到 1.33n，但搜索常数稍差。Redis 选 1/4，LevelDB 选 1/2。复制别人代码前要看清。

4. **简单加全局锁就丢了优势**：把 skip list 套上一把 mutex，跟 std::map 没区别。要发挥并发优势必须 single-writer + atomic forward，或者上 lock-free（Harris-Michael / Fraser 算法）。

## 适用 vs 不适用场景

**适用**：

- 内存有序索引（Redis zset、LevelDB MemTable）——尤其需要范围扫描
- 并发有序 map（Java ConcurrentSkipListMap）——lock-free 实现成熟
- 教学/原型——15 分钟手写一个，不像红黑树要调一周

**不适用**：

- 磁盘上的有序索引——这种场景 [[b-tree-1972]] 和 [[comer-1979-btree]] 的 B+树更优（cache friendly、IO 单元对齐）
- 严格 worst-case 要求（实时系统）——概率结构有最坏 O(n) 风险，虽然概率极低但合规上无法接受
- 存储极度受限——p=1/2 时多 100% 的指针开销，红黑树只多 1 bit color
- 需要 deterministic 顺序遍历且不能容忍随机性——比如某些数据库的快照隔离实现

## 历史小故事（可跳过）

- **1962 年**：Adelson-Velsky & Landis 发明 AVL 树，第一个自平衡二叉搜索树。
- **1978 年**：Bayer 等人发表红黑树。两者都给了 O(log n)，但 rebalance 代码极其难写难调。
- **1990 年**：William Pugh 在马里兰大学发表本文（CACM Vol 33 No 6）。他的口吻很轻松——"如果你觉得平衡树太难，试试这个"。
- **1998 年**：Pugh 也成为 Java Memory Model 主要设计者（JSR-133），把概率思维带到并发领域。
- **2009-2012 年**：Redis（antirez）和 LevelDB（Sanjay Ghemawat、Jeff Dean）几乎同期采用 skip list 做内存索引，让这个 1990 的结构进入工业主流。

## 学到什么

1. **概率换简单是工程上有效的折衷**——只要尾概率随 n 指数衰减，期望复杂度就能当 worst-case 用
2. **代码量本身是 bug 的来源**——平衡树 500 行 vs skip list 100 行，后者长期维护成本低一个数量级
3. **数据结构的"并发友好"很难事后补**——红黑树的 rotation 跨多个节点，天然抗拒 lock-free；skip list 的局部性让它天生适合并发
4. **不是所有"简单"的方案都是新的**——skip list 1990 才出现，之前 28 年大家都在跟 AVL 较劲

## 延伸阅读

- 论文 PDF：[Pugh 1990 CACM 原文](https://homepage.cs.uiowa.edu/~ghosh/skip.pdf)（9 页，语言极轻松）
- 视频教程：[MIT 6.046 — Skip Lists（Demaine 讲）](https://www.youtube.com/watch?v=2g9OSRKJuzM)（70 分钟把概率分析讲透）
- 工业实现：[Redis t_zset.c](https://github.com/redis/redis/blob/unstable/src/t_zset.c)、[LevelDB skiplist.h](https://github.com/google/leveldb/blob/main/db/skiplist.h)
- [[redis]] —— Redis 的 zset 是 skip list 最知名的工业用例
- [[rocksdb-lsm]] —— RocksDB MemTable 的默认实现也是 skip list

## 关联

- [[b-tree-1972]] —— 磁盘场景的对应方案；skip list 主战场是内存
- [[comer-1979-btree]] —— B+树综述；和 skip list 互为镜像（一个磁盘有序、一个内存有序）
- [[lsm-tree-1996]] —— LSM-Tree 的 MemTable 层基本都用 skip list
- [[redis]] —— Redis 把 skip list 用到极致，zset 命令族全靠它
- [[rocksdb-lsm]] —— RocksDB 沿用 LevelDB 的 skip list MemTable
- [[bigtable]] —— Google Bigtable MemTable 也是 skip list 思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[art-2013]] —— ART 自适应基数树 — 内存数据库为主索引重新选材
- [[hnsw-2018]] —— HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[silt-2011]] —— SILT — 0.7 字节内存索引一条记录的 flash 键值存储
- [[compound-v3]] —— Compound III (Comet) — 单基础资产借贷重构
- [[redis]] —— Redis — 内存键值数据库
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
