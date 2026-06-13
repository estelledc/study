---
title: C-Store —— 把数据库"横着切"变成"竖着切"
来源: https://www.cs.umass.edu/~abadi/papers/abadi-column-stores.pdf
日期: 2026-06-13
分类_原始: 数据库系统
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

## 是什么

C-Store 是 2005 年由 Peter Boncz、David DeWitt 和 Samuel Madden 发表的论文，提出了一种**列式关系数据库管理系统（Column-oriented DBMS）**。它的核心思想一句话概括：

> 传统数据库把一整行存在一起（行存），C-Store 把每一列单独存成一组文件（列存）。

**日常类比**：想象一本员工花名册，每张表有 1000 个人、10 列信息（姓名、年龄、部门、工资……）。

- **行存（Row-store）** 像一本通讯录：第 1 页是张三的全部信息，第 2 页是李四的全部信息，依次排下去。翻到某个人时，他的所有字段都在一页上——很方便。
- **列存（Column-store）** 像 10 本单独的册子：一本全记名字，一本全记年龄，一本全记工资。想看所有人的工资？直接翻"工资册"就行，完全不用碰名字和年龄那两本。

C-Store 就是选择了后者。

## 核心概念

### 1. 数据按列存储

传统行存的数据布局：

```
行 1: [Alice, 30, Engineering, 120000]
行 2: [Bob, 25, Marketing, 85000]
行 3: [Carol, 35, Engineering, 150000]
```

C-Store 的列存布局：

```
名字列: [Alice, Bob, Carol]
年龄列: [30, 25, 35]
部门列: [Engineering, Marketing, Engineering]
工资列: [120000, 85000, 150000]
```

### 2. 只读需要的列（Projection）

这是列存最大的优势。假设你要算"全公司平均工资"：

- **行存**：每读一行，都要把姓名、年龄、部门、工资全部加载进来，即使你只需要工资那一列。大量无用数据被读入内存又丢弃。
- **列存**：只读工资列，其他列根本不动。

SQL 示例：

```sql
-- 行存：扫描整行，丢掉不需要的列
SELECT AVG(salary) FROM employees;

-- 列存：只加载 salary 列，IO 量大幅减少
SELECT AVG(salary) FROM employees;
-- 底层实际只读取 salary 列的文件
```

### 3. 同列数据高度相似 → 极致压缩

同一列里的数据类型相同、取值范围相近，压缩效率极高。比如部门列只有"Engineering""Marketing""Sales"三个值，可以用一个很小的编码表替换所有重复字符串。

```
部门列原始: [Engineering, Marketing, Engineering, Sales, Engineering]
编码表:     {1=Engineering, 2=Marketing, 3=Sales}
压缩后:     [1, 2, 1, 3, 1]
```

行存里每行都要完整存一遍"Engineering"字符串，列存只存一次编码。

### 4. 适合分析查询，不适合频繁更新

列存的弱点也很明显：

- **插入一行**：需要同时写入多列文件，成本高
- **更新一行**：同样要改多列文件
- **查询一行**：需要从多列文件中拼出来，慢

所以 C-Store 定位很清楚：**分析型负载（OLAP）**，而不是**交易型负载（OLTP）**。

## 代码示例

### 示例 1：行存 vs 列存的查询性能对比

假设有一个销售表 `sales(date, region, product, amount)`，有 1 亿行数据：

```sql
-- 查询：每个地区的总销售额
SELECT region, SUM(amount)
FROM sales
GROUP BY region;
```

**行存数据库**（如 MySQL）的执行过程：

```
1. 顺序扫描 1 亿行，每行读 4 个字段（date, region, product, amount）
2. 实际上我们只需要 region 和 amount 两个字段
3. date 和 product 被读入内存后又立刻丢弃
4. IO 量 = 1 亿行 × 4 个字段的总大小
```

**C-Store（列存）**的执行过程：

```
1. 只读 region 列文件和 amount 列文件
2. date 和 product 列完全不碰
3. IO 量 = 1 亿行 × 2 个字段的总大小（省了一半 IO）
4. 因为同列数据相似，压缩比更高，实际磁盘 IO 更少
```

### 示例 2：聚合查询中的 SIMD 加速

列存另一个优势是可以利用 CPU 的 SIMD（单指令多数据）指令并行计算：

```sql
-- 查询：去年总收入
SELECT SUM(amount) FROM sales WHERE date >= '2024-01-01';
```

**行存**中，amount 字段分散在不同行的不同位置，CPU 很难批量处理。

**列存**中，amount 是连续存储的整数数组：

```
内存中连续排列: [100, 200, 350, 500, 800, ...]

SIMD 一次加 4 个:
  指令: ADD [100, 200, 350, 500] → [100, 200, 350, 500]
  结果: 100+200+350+500 = 1150
```

一行指令就能处理 4 个数字，速度提升数倍。

### 示例 3：压缩效果对比

```
原始数据（行存，每行 100 字节）:
  第1行: [2024-01-01, North, Laptop, 1200]
  第2行: [2024-01-01, South, Phone, 800]
  第3行: [2024-01-01, North, Tablet, 500]
  ...共 1000 万行

行存存储: 1000 万 × 100 字节 ≈ 1 GB（未压缩）

列存存储（按列分别压缩）:
  日期列: 只有"2024-01-01"一个值 → 几乎零空间
  地区列: 只有"North""South"两个值 → 每个值 1 字节
  产品列: 只有"Laptop""Phone""Tablet"三个值 → 每个值 2 字节
  金额列: 整数压缩编码 → 平均 3 字节

  总计: 1000 万 × (0+1+2+3) 字节 ≈ 50 MB

压缩比: 1 GB → 50 MB，约 20 倍！
```

## 为什么重要

不理解列存，就无法理解下面这些现代数据基础设施：

- **为什么 BigQuery、Redshift、Snowflake 能秒级查 PB 级数据**——因为它们都是列存架构
- **为什么 DuckDB 能在本地文件上做超快分析**——它把列存做到了极致，配合 SIMD 和向量化执行
- **为什么 Apache Parquet 成为大数据生态的标准格式**——它就是列存文件的工业实现
- **为什么 Spark 内部要从 Parquet（列存）读到自己的内存格式（行存）再转回 Arrow（列存）**——因为不同操作适合不同布局

## C-Store 的关键设计

论文提出了几个开创性的设计选择：

1. **Append-only 列文件**：列文件一旦写入就不再修改，只追加新数据。这简化了并发控制，也提高了压缩率。
2. **版本控制**：每列文件有多个版本（version），旧版本保留直到确认不再被任何查询使用后才删除。
3. **向量化执行（Vectorized Execution）**：不是逐行处理，而是一批一批地处理数据，充分利用 CPU 缓存和 SIMD。
4. **共享无架构（Shared-nothing）扩展**：通过水平拆分列文件到多台机器来实现扩展。

## 总结

C-Store 的核心洞察非常朴素：**既然分析查询通常只访问少数几列，为什么要把整行数据都读进来？**

这个"把数据库横着切变成竖着切"的想法，奠定了现代列式数据库的理论基础。从 C-Store 到今天的 Snowflake、DuckDB、ClickHouse，底层思想一脉相承。

---

**延伸阅读**：
- Abadi & Madden, "Column-Stores vs. Row-Stores: How Different Are They Really?", SIGMOD 2008（后续实证对比论文）
- Boncz et al., "Database Architectures: Optimizing the Cost of Data Manipulation Operations"（C-Store 前身，1999 年）
