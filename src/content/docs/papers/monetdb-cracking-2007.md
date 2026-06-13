---
title: Database Cracking — 不用建索引，让查询自己塑造数据
来源: https://stratos.seas.harvard.edu/files/IKM_CIDR07.pdf
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# Database Cracking（2007）

> **作者**: Stratos Idreos, Martin L. Kersten, Stefan Manegold（CWI Amsterdam）
> **发表**: CIDR 2007

## 1. 一句话核心

传统数据库在「更新时」维护索引；Database Cracking 把索引维护推迟到「查询时」——每次查询顺便把数据整理一下，让下次同类查询更快。

## 2. 日常类比：图书馆与自助归书架

想象一个没有固定分类规则的图书馆。

**传统做法（B-Tree 索引）**：
管理员先把所有书按编号排好序（建索引），读者借书时直接二分查找。但每次新书入库，管理员都要花精力插入到正确位置。如果读者对某一类书感兴趣，管理员会提前把所有这类书集中摆放——这需要提前知道读者的偏好。

**Cracking 做法**：
没有管理员。第一位读者要借 100-200 号的书，他从整堆书中挑出这些书放到一起（物理重排），然后取走。书架变成了三段：≤99、100-200、≥201。第二位读者要借 70-150 的书，他只需要重新整理 ≤99 和 201-∞ 这两段（把 100-150 的部分分离出来），中间那段 100-200 不用动。几次之后，书架自然形成了按编号分段的格局——不需要管理员提前知道什么书受欢迎，读者自己就把秩序「练」出来了。

这个「自己练出秩序」的能力，论文叫 **self-organization（自组织）**。

## 3. 传统索引 vs Cracking

| 维度 | B-Tree 索引 | Database Cracking |
|------|-------------|-------------------|
| 维护时机 | 每次 INSERT/UPDATE 时 | 每次 SELECT 查询时 |
| 需要预知 workload？ | 需要（决定建什么索引） | 不需要，查询驱动 |
| 建好后的查询速度 | 极快（O(log n)） | 接近最优（段内二分） |
| 初期代价 | 高（建索引 + 维护） | 低（首次查询就整理） |
| 索引漂移 | 需要重新 build | 天然适应，自动分裂/合并 |

## 4. 核心概念拆解

### 4.1 Cracker Column（碎裂列）

对原始列 A 维护一份**拷贝** `A_crk`。这份拷贝中的数据按值域被切成若干「片段（Piece）」：

```
A_crk = [ Piece1: A≤7 ] [ Piece2: 7<A≤10 ] [ Piece3: 10<A<14 ] [ Piece4: 14≤A≤16 ] [ Piece5: A>16 ]
```

每个 Piece 内部不一定完全有序，但所有 Piece 之间的值域是**不重叠的**。

### 4.2 Cracker Index（碎裂索引）

一个 AVL 树，每个节点记录一个边界值 v 以及它在 A_crk 中的分割位置 `p`。

```
AVL 节点结构:
  value:  7    →  在位置 7 分割
  value:  10   →  在位置 14 分割
  value:  14   →  在位置 22 分割
  value:  16   →  在位置 28 分割
```

有了这个索引，新来的查询可以直接定位到需要处理的 Piece，不需要全列扫描。

### 4.3 Column Slice（列切片）

Cracking 的结果就是一个「视图」——不需要复制数据，直接返回满足条件的 Piece 编号范围。这就是论文说的 **zero-cost result**。

## 5. 核心算法

### 5.1 Two-Piece Cracking（两段碎裂）

把一段列按一个中值 `med` 分成两段：`< med` 和 `≥ med`。

```
Algorithm: CrackInTwo(c, posL, posH, med, inc)
输入:
  c     - 列
  posL  - 起始位置
  posH  - 结束位置
  med   - 分割阈值
  inc   - med 是否包含在左侧（inc=false → 左: <med, 右: ≥med）

过程:
  x1 = 指向 posL 的指针（从左往右扫）
  x2 = 指向 posH 的指针（从右往左扫）
  
  while x1 的位置 < x2 的位置:
    if x1 的值 < med:
      x1 右移一位   # 已经在正确的一侧
    else:
      # x1 的值 ≥ med，需要移到右侧
      # 从右找 < med 的值
      while x2 的值 >= med 且 x2 在 x1 左边:
        x2 左移一位
      交换 x1 和 x2 指向的值
      x1 右移一位
      x2 左移一位
```

这本质上就是 **快排的 partition 操作**，原地重排，只碰需要移动的数据。

### 5.2 Three-Piece Cracking（三段碎裂）

针对 double-sided 谓词 `low < A < high`，一次遍历分成三段：`≤low`、`low<A<high`、`≥high`。

```
Algorithm: CrackInThree(c, posL, posH, low, high, incL, incH)
输入:
  c     - 列
  posL  - 起始位置
  posH  - 结束位置
  low   - 下阈值
  high  - 上阈值
  incL  - low 是否包含在左侧
  incH  - high 是否包含在右侧

过程:
  x1 = 指向 posL 的指针（左指针）
  x2 = 指向 posH 的指针（右指针）
  xm = 指向 posL 的中间指针（扫描当前段）
  
  while xm 的位置 <= x2 的位置:
    if xm 的值在 (low, high) 范围内:
      交换 xm 和 x2，x2 左移   # 中间段从右往左生长
    elif xm 的值 <= low:
      交换 xm 和 x1，x1 右移，xm 右移   # 左段从左往右生长
    else:
      xm 右移   # 值 > high，属于右侧，不动
```

三路划分的思想其实和 Hoare 的三路快排（Dutch National Flag）一样：`<low`、`[low,high]`、`>high` 三个区域。

### 5.3 查询处理流程

```sql
-- 假设原始表 R 有一列 A
SELECT * FROM R WHERE R.A > 10 AND R.A < 14;

-- Cracker 处理步骤:
-- 1. 查 Cracker Index，找到需要处理的 Piece
-- 2. 对涉及的 Piece 执行 CrackInTwo / CrackInThree
-- 3. 更新 Cracker Index
-- 4. 返回 Column Slice（Piece 编号范围，零拷贝）
```

## 6. 两个完整示例

### 示例 1：逐步碎裂的过程

```
初始列 A:  [13, 16, 4, 9, 2, 12, 7, 1, 19, 3, 14, 11, 8, 6]

查询 Q1: SELECT * FROM R WHERE A > 10 AND A < 14
→ 需要 A 在 (10, 14) 范围内的值
→ 执行 CrackInThree(col A, 0, 13, low=10, high=14)
→ 一趟遍历后重新排列:
   
  左侧 (A ≤ 10):  [4, 9, 2, 7, 1, 3, 8, 6]
  中间 (10 < A < 14): [12, 11, 13]   ← 这就是 Q1 的结果
  右侧 (A ≥ 14):  [16, 19, 14]

→ 返回中间段作为 Q1 的结果（零成本切片）
→ 更新 Cracker Index: 加入边界 10 和 14

查询 Q2: SELECT * FROM R WHERE A > 7 AND A <= 10
→ 查 Cracker Index 发现: 
    Piece A≤10 需要分裂（因为 Q2 要 7<A≤10）
    Piece 10<A<14 不需要动（全部不满足 A≤10）
    Piece A≥14 不需要动
→ 只在 [4, 9, 2, 7, 1, 3, 8, 6] 上执行 CrackInTwo(med=7):

  A ≤ 7:  [4, 2, 7, 1, 3, 6]
  A > 7:  [9, 8]   ← 这就是 Q2 需要的部分

→ 现在列的状态:
  Piece 1: A ≤ 7    → [4, 2, 7, 1, 3, 6]
  Piece 2: 7 < A ≤ 10 → [9, 8]
  Piece 3: 10 < A < 14 → [12, 11, 13]
  Piece 4: 14 ≤ A ≤ 16 → [16, 14]
  Piece 5: A > 16 → [19]
  
→ Q2 的结果 = Piece 2 ∪ Piece 3（两个连续片段的拼接）
```

### 示例 2：查询序列的加速效果

```
场景: 1000 万次整数的列，连续执行 3000 万次范围查询

时间线对比（累计响应时间，越低越好）:

  查询次数 →
  │
  │    Simple Scan（每次全扫）: ━━━━━━━━━━━━━━━━━━ 线性增长
  │
  │    Sort + Binary Search（先排序后二分）: ━━━ 前期慢（排序开销）
  │                                                 后期极快
  │
  │    Cracking（查询驱动）: ━━ 前期接近 sort
  │                           后期追平 sort，且无需预知 workload
  │
  └───────────────────────────────────────────────→

关键发现:
- 首次查询：Cracking 和 Sort 差不多（都在整理数据）
- 第 2~100 次查询：Cracking 已经明显快于全扫，接近排序
- 第 1000 次之后：Cracking 和 Sort 几乎持平
- 优势：Cracking 不需要提前知道数据分布，也不需要预建索引
```

## 7. 性能实验要点

论文在 MonetDB 上做了测试（2.4GHz Athlon 64, 2GB RAM, 7200rpm 磁盘）：

1. **Select 算子基准测试**：1000 万行的 range 查询序列，Cracking 在约 3000 次查询后追上 Sort 的性能
2. **不同选择性（Selectivity）**：结果集越小，Cracking 达到最优性能越快（因为每次只重排小部分）
3. **TPC-H Query 6**：Cracking 使 MonetDB/SQL 的性能优于带 B-Tree 的 PostgreSQL 和 MySQL
4. **自组织能力**：即使查询的焦点在数据空间里随机跳动，Cracking 也能自动适应

## 8. 开放研究问题（论文列出的 Future Work）

- **并发控制**：多个查询同时访问同一列的 Cracker Column 时如何处理？
- **Cut-off 策略**：什么时候不再分裂 Piece？需要成本模型判断
- **更多 Cracking 算子**：Join、Aggregate 能否也 Cracking？
- **分布式 Cracking**：Partition 后每个节点独立 Cracking
- **A-priori Cracking**：系统空闲时预执行「假查询」来预热数据布局

## 9. 你的理解检查

这篇文章最反直觉的点在哪里？

想想看：我们花了数十年学习如何**高效地维护索引**（B-Tree、LSM-Tree、Bitmap），而这篇论文提出——**索引维护本身就是一种浪费**，不如把它变成查询的「副作用」。这相当于说：「别在更新时记账了，等客人结账的时候再一起整理账本。」

一个值得思考的问题：Cracking 假设的是列存（column store）架构——MonetDB 的核心设计。如果是行存系统（如 MySQL InnoDB），Cracking 还能工作吗？为什么？

想清楚这个，你就理解了为什么 Cracking 是列存数据库的「天作之合」。
