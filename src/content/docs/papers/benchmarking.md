---
title: Wisconsin Benchmark — 给数据库出一套可重复的体检题
来源: 'David J. DeWitt, "The Wisconsin Benchmark: Past, Present, and Future", The Benchmark Handbook 1993'
日期: 2026-05-29
分类: 数据库评测
难度: 初级
---

## 是什么

Wisconsin Benchmark 是一套**专门用来测关系数据库基本功的标准题库**：它造一批可控的表，再用固定 SQL 测选择、投影、连接、聚合、插入、删除、更新这些操作。

日常类比：像体检套餐。你不是只看一个“总分”，而是分别量血压、血糖、心率、视力。数据库也一样，不能只问“每秒几笔交易”，还要知道它扫表快不快、索引好不好、join 会不会拖后腿。

这篇 1993 年回顾文章讲了三件事：Wisconsin Benchmark 当年怎么设计，为什么它引发数据库厂商的 benchmark wars，以及它后来为什么又适合测并行数据库的 speedup / scaleup。

它的核心价值不是“那几组老数字还有效”。老数字早过期了。真正有价值的是：**怎么设计一把可解释、可放大、能揭露系统短板的尺**。

## 为什么重要

不理解 Wisconsin Benchmark，下面这些事都说不清：

- 为什么数据库评测不能只给一个总分：一个 tps 数字遮不住查询优化器、索引、join、聚合的差异。
- 为什么合成数据有时比真实数据更适合 benchmark：因为它能精确控制 1%、10%、20% 选择率。
- 为什么早期关系数据库厂商会被公开评测逼着优化实现：产品名被点出来，市场就会追问“你为什么慢”。
- 为什么并行数据库要同时测 speedup、scaleup、sizeup：加机器变快、数据变大不变慢、固定机器线性变慢，是三件不同的事。

## 核心要点

Wisconsin Benchmark 可以拆成 **三层设计**：

1. **可控数据**：表里有 `unique1`、`unique2`、`onePercent`、`tenPercent` 这些列。类比：老师提前知道每道题会筛出多少学生，所以能判断系统是真的快还是只是题目碰巧简单。

2. **覆盖基本操作的 SQL 题库**：原始套件有 32 条查询，覆盖选择、投影、join、聚合和更新。类比：驾照考试不能只考直线开车，还要考倒车、变道、坡起。

3. **看曲线而不是看一句口号**：并行系统要看 speedup、scaleup、sizeup。类比：多雇 10 个厨师能不能快 10 倍，客人多 10 倍能不能不排队，厨房不变时订单多 10 倍会不会慢 10 倍。

这三层让它既能当产品体检，也能当研究工具。

## 实践案例

### 案例 1：用一列制造固定选择率

```sql
SELECT * FROM TENKTUP1
WHERE onePercent = 7;
```

逐部分解释：

- `TENKTUP1` 是 benchmark 里的测试表，名字表示大约一万行的版本。
- `onePercent` 的值从 0 到 99 均匀分布，所以 `= 7` 永远选出约 1% 的行。
- 表放大到一百万行后，这个查询仍然是 1% 选择率，只是返回行数变成一万行。

这就是合成数据的好处：你能把“题目难度”固定住，再去比较不同数据库的执行时间。

### 案例 2：同一查询测聚簇索引和非聚簇索引

```sql
-- 聚簇索引：数据本身按 unique2 附近排列
SELECT * FROM TENKTUP1
WHERE unique2 BETWEEN 0 AND 99;

-- 非聚簇索引：索引命中后可能到处跳页
SELECT * FROM TENKTUP1
WHERE unique1 BETWEEN 0 AND 99;
```

逐部分解释：

- `unique2` 常用来建 clustered index，命中后数据页比较连续。
- `unique1` 常用来建 non-clustered index，命中后可能产生很多随机 I/O。
- 两个查询都取约 1% 数据，但暴露的是两种完全不同的存储路径。

论文里 Gamma 的结果也说明：聚簇 B-tree 通常明显更快；非聚簇索引在取多行时会被随机寻道拖累。

### 案例 3：用 join 测并行数据库是否真会分工

```sql
INSERT INTO TMP
SELECT *
FROM TENKTUP1, BPRIME
WHERE TENKTUP1.unique2 = BPRIME.unique2;
```

逐部分解释：

- `BPRIME` 是从另一张表筛出来的小表。
- 如果两张表已经按 join key 分区，每个节点可以本地 join，少走网络。
- 如果分区列不是 join key，系统要先按 join key 重新洗牌，网络和 CPU 都会被测出来。

这类查询适合看 shared-nothing 数据库是否只是“机器多”，还是查询执行器真的能把 scan、hash、join、store 拆到多个节点并行跑。

## 踩过的坑

1. **把一个 tps 数字当完整评测**：原因是 tps 只像总分，不告诉你慢在索引、join、锁还是恢复。

2. **数据集比内存还小**：原因是查询会被 buffer pool 缓存掩盖，论文建议关系大小至少是总 buffer 的 5 倍。

3. **只跑一次查询就报数**：原因是缓存命中、磁盘位置和启动开销会抖动，Wisconsin 用多组等价查询取平均。

4. **忘记单用户限制**：原因是原 benchmark 不测并发控制和恢复，无法区分行级锁、表级锁、崩溃恢复这些真实产品能力。

## 适用 vs 不适用场景

**适用**：

- 测关系数据库基本查询操作：选择、投影、join、聚合、更新。
- 对比索引访问路径：聚簇索引、非聚簇索引、全表扫描。
- 评估并行数据库的 speedup、scaleup、sizeup 曲线。
- 给数据库课程讲 benchmark 设计：为什么数据分布、查询集合、测量规则要一起设计。

**不适用**：

- 直接代表真实业务负载：它是单用户、合成数据，不是银行、电商或报表系统。
- 评估事务并发和崩溃恢复：这些能力要用 TPC-C、YCSB 或专门事务 benchmark。
- 测复杂现代 SQL：外连接、窗口函数、复杂子查询、列存向量化都不是它的重点。
- 只想做市场宣传：它输出的是一组诊断结果，不是一个容易传播的魔法数字。

## 历史小故事（可跳过）

- **1981 年**：Wisconsin 团队做 DIRECT 数据库机，发现没有标准 benchmark 能测它的加速能力。
- **1983 年**：Bitton、DeWitt、Turbyfill 发表系统化数据库 benchmark，公开点名真实产品，引发厂商争论。
- **1984-1988 年**：Jim Gray 等人推动 Datamation / DebitCredit / TPC 路线，用一个交易吞吐数字吸引市场注意。
- **1988 年**：Bitton 和 Turbyfill 回顾 Wisconsin Benchmark，指出它的可扩展性和字符串设计问题。
- **1990 年前后**：Gamma、Teradata、Tandem、Volcano 等并行数据库把 Wisconsin 重新拿来测 ad-hoc 查询和 scaleup。
- **1993 年**：DeWitt 写这篇回顾，总结它的功过：不完美，但确实逼早期关系数据库修掉很多性能缺陷。

## 学到什么

1. **好 benchmark 是可解释的题库**：每列、每个谓词、每条 SQL 都应该能解释它在测什么。
2. **合成数据不是偷懒**：当目标是控制选择率、join 输出和聚合分组数时，合成数据反而更科学。
3. **公开比较会改变市场**：技术评测一旦点名产品，厂商就不得不修性能短板。
4. **单用户 benchmark 也有价值**：它不覆盖并发，但能先把 scan、index、join 这些基本零件拆开看清。
5. **并行系统要看曲线**：只给一台机器上的耗时不够，必须看加机器、加数据、固定机器加数据时曲线怎么变。

## 延伸阅读

- 论文 PDF：[The Wisconsin Benchmark: Past, Present, and Future](https://jimgray.azurewebsites.net/BenchmarkHandbook/chapter4.pdf)（Jim Gray Handbook 第 4 章）
- 原始系统化论文：Bitton, DeWitt, Turbyfill 1983 “Benchmarking Database Systems: A Systematic Approach”
- 背景书目：[The Benchmark Handbook, 1993](https://jimgray.azurewebsites.net/BenchmarkHandbook/TOC.htm)（TPC、AS3AP、Set Query 等同书章节）
- [[dewitt-gray-1992]] —— 并行数据库为什么会成为高性能数据库主线
- [[system-r-1976]] —— 早期关系数据库产品被 benchmark 测的核心对象
- [[leis-2015-optimizers]] —— 后来用真实数据重新挑战优化器的 benchmark 思路

## 关联

- [[system-r-1976]] —— Wisconsin 测的就是 System R 之后那批关系数据库的基本功。
- [[ingres-1976]] —— DIRECT 和 university Ingres 是 Wisconsin 起初想比较的对象。
- [[selinger-1979]] —— 查询优化器是否会选好访问路径，是 benchmark 想揭露的重点之一。
- [[b-tree-1972]] —— 聚簇 / 非聚簇 B-tree 索引性能差异，是 Wisconsin 查询套件的关键观察点。
- [[dewitt-gray-1992]] —— 并行数据库的 speedup / scaleup 评价延续了 Wisconsin 的测量方法。
- [[volcano-1994]] —— Volcano 并行执行模型也用 Wisconsin 类查询展示并行算子能力。
- [[bigbench-2022]] —— 另一个领域的 benchmark，说明“题库设计”会长期塑造研究方向。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bullet]] —— Bullet — C++ 经典 3D 物理引擎与 PyBullet 仿真工具
