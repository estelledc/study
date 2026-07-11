---
title: Cousot-Halbwachs 凸多面体域 — 让分析器自己发现变量间的线性关系
来源: 'Cousot & Halbwachs, "Automatic Discovery of Linear Restraints Among Variables of a Program", POPL 1978'
日期: 2026-05-31
分类: 编程语言
难度: 高级
---

## 是什么

凸多面体域（Convex Polyhedra Domain）是 Cousot 和 Halbwachs 1978 年提出的一种**让静态分析器自己发现「程序里多个变量之间满足什么线性关系」**的方法。日常类比：你有一堆散落在桌面上的点，想用一根橡皮筋把它们全部圈起来——区间分析只能给每个变量一个独立的盒子（盒子永远是横平竖直的），多面体能把橡皮筋斜着拉，于是「i 永远不超过 j」「x + y 总等于 10」这种**联合关系**也能被兜进去。

更具体地说：把 n 个程序变量看成 n 维空间里的一个点，程序运行所有可能的状态拟合成空间中一个凸多面体——表示成 Ax ≤ b 这样的一组线性不等式。分析器的任务就是在每个程序点维护这样一个多面体，并随着程序前进不断更新。

## 为什么重要

这是 1977 年 Cousot-Cousot 抽象解释框架之后**第一个真正好用的关系型数值域**。1977 的框架像「盖楼图纸」：告诉你要用格、近似映射、不动点；但图纸没写墙用什么砖——Halbwachs 把多面体填进去，骨架第一次有了肉。

不理解它，下面这些现象都讲不清：

- 为什么 Astrée（验证 A380 飞控零运行时错误）一类工具要用 octagon 等"弱化多面体"——因为完整多面体太贵
- 为什么 Apron / ELINA / NewPolka 这些现代分析库都把 polyhedra 当成内置数值域之一
- 为什么 Polyspace、Astrée 检查数组越界时常常能抓住「i < n」这类跨变量关系，而单元测试容易漏
- 为什么区间域和多面体域并存，永远没被互相替代——一个便宜但盲，一个贵但全

## 核心要点

整个方法可以拆成 **三件事**。先约定：⊥ 表示「无可达状态」，⊤ 表示「任何状态都可能」。

1. **两种等价表示**：一个多面体可以用 H-rep（一堆 Ax ≤ b 不等式）描述，也可以用 V-rep（一组顶点 + 射线）描述。Chernikova 算法负责两种表示来回转换。**做不同操作时换不同表示更快**——求交集用 H-rep 拼约束，求凸包用 V-rep 合并顶点。

2. **三个核心算子**（别把 meet / join 搞反）：
   - **meet（∧）= 交集**：遇到 `if (i < n)` 这类条件时，把当前多面体与半平面 `i < n` 相交，约束变多、更精确
   - **join（∨）= 凸包**：if-else **两条路径汇合**时，取能包住两边的最小凸多面体，约束变松
   - **widening（∇）= 加速收敛**：循环里多面体可能越长越大；widening **丢掉每轮都在变的不等式**，强制几步内稳住

3. **不动点迭代**：每个程序点的多面体从 ⊥ 出发，反复用上述算子推到收敛。数学上保证存在最小不动点；widening 保证有限步内一定到达。

一句话：**用多面体当抽象域，H-rep/V-rep 按需切换，用 widening 强制收敛**。

## 实践案例

### 案例 1：区间域抓不到的关系

```c
i = 0;
j = 10;
while (i < j) {
  i = i + 1;
  j = j - 1;
}
```

逐步看：

1. 入口：多面体记下 `i = 0 ∧ j = 10`，顺带得到 `i + j = 10`。
2. 循环体：每轮 `i++`、`j--`，等式 `i + j = 10` 仍成立；区间域只能各自报 `[0,10]`，丢掉联合关系。
3. 出口：`i < j` 不成立且 `i + j = 10` ⇒ 推出 `i == j == 5`。

### 案例 2：循环不变式自动生成

```c
for (int k = 0; k < n; k++) {
  a[k] = 0;
}
```

逐步看：

1. 进入循环前：`k = 0`；进入体时 meet 上 `k < n`，得到 `0 ≤ k < n`。
2. 循环体末尾：`k` 变成 `k+1`，再 join / widening，稳定出不变式 `0 ≤ k ≤ n`。
3. 出口：再 meet 上 `¬(k < n)`，得到 `k == n`。下游就能用它证明 `a[k]` 不越界——这是 Polyspace 类工具「少注解也能证越界」的核心套路。

### 案例 3：widening 救场

```c
i = 0;
while (cond) i = i + 1;
```

不加 widening：多面体从 `i = 0` → `0 ≤ i ≤ 1` → `0 ≤ i ≤ 2`…永远不收敛。widening 看到上界一直在变，直接丢掉上界，第二轮稳定到 `0 ≤ i`。代价是丢精度——但能跑完比精确却跑不完强。以上是分析器心智模型，不是某个库的可执行 API。

## 踩过的坑

1. **复杂度对维度极敏感**：n 个变量时约束/顶点数最坏指数级；工程上超过约 20 个变量就明显拖慢，上百个基本不可用——所以按函数局部限定变量子集。
2. **widening 太激进会丢精度**：刚学到的 `i ≤ j` 可能立刻被扔，分析几乎退回区间；后来才有 thresholds、narrowing 等改良。
3. **整数 vs 实数语义错位**：多面体本质是实数/有理数凸集，表达不了「x 是奇数」；要叠 congruence 等别的域。
4. **Chernikova 转换是性能黑洞**：H-rep ↔ V-rep 最坏指数级，工程上要缓存双重描述；Apron 就是干这件事的成熟库。

## 适用 vs 不适用场景

**适用**：
- 需要发现跨变量线性关系（边界、循环不变式、数组索引安全）
- 验证关键代码块（大约几十个变量以内）的数值正确性
- 作为 Astrée 一类分析器的子模块，用在精度比性能更重要的地方

**不适用**：
- 大型代码库全程序分析——太贵，要降级到 octagon、interval
- 需要非线性关系（如 `x = y * z`）——多面体只刻画线性
- 整除性、奇偶性、位运算——必须叠别的域

## 它和别的数值域怎么取舍

按「能表达多少 / 多贵」排：

- **interval**：每变量独立 `[lo, hi]`，最便宜，零关系
- **zone**：`x − y ≤ c`，多一点关系仍便宜
- **octagon**（Miné 2001）：`±x ± y ≤ c`，中等成本，Astrée 常用
- **polyhedra（本篇）**：任意线性约束，最强但最贵

工程取舍：飞控关键路径可全多面体；通用代码默认 octagon；超大循环退到区间。

## 历史小故事（可跳过）

- **1977 年**：Cousot 夫妇在 POPL 发表抽象解释框架——纯理论，没填具体域
- **1978 年**：Patrick Cousot 与 Nicolas Halbwachs 在 POPL 把凸多面体填进框架
- **1980-90s**：Halbwachs 转向同步语言，参与设计 Lustre，后来用于飞控与信号系统
- **2000s**：NewPolka / Apron 把多面体域做成开源组件
- **2010s+**：ELINA 等用并行与剪枝，在局部变量子集上把可扩展性推得更远

## 学到什么

1. **理论框架要靠具体域才能跑起来**——1977 给地基，1978 给第一栋房
2. **同一对象多种表示**：H-rep / V-rep 各擅一类操作，按需切换是工程核心
3. **精度 vs 可终止**永远拉锯，widening 是最务实的妥协
4. **找到正确抽象层很难**：一旦找对，会成为领域默认起点几十年

## 延伸阅读

- 论文 PDF：[Cousot-Halbwachs 1978](https://www.di.ens.fr/~cousot/publications.www/CousotHalbwachs-POPL-78-ACM-p84--96-1978.pdf)
- Apron 库：[antoinemine/apron](https://github.com/antoinemine/apron)
- ELINA 库：[eth-sri/ELINA](https://github.com/eth-sri/ELINA)
- 教程：Antoine Miné 的 [Tutorial on Static Inference of Numeric Invariants](https://www-apr.lip6.fr/~mine/publi/article-mine-FnTPL17.pdf)
- [[cousot-abstract-interpretation]] —— 这篇论文的理论母体
- [[feautrier-polyhedral]] —— 同样用多面体，但目的是调度而非过近似

## 关联

- [[cousot-abstract-interpretation]] —— 1977 抽象解释框架；本篇是它第一个实用数值域实例
- [[feautrier-polyhedral]] —— 1992 多面体调度；用多面体表达迭代域
- [[astree]] —— 工业静态分析器；用弱化多面体跑飞控代码
- [[kildall-dataflow]] —— 数据流分析的格论框架；多面体域是高维亲戚
- [[sagiv-shape-analysis]] —— 形状分析；和数值多面体并列做堆结构
- [[steensgaard-pointer]] —— 指针分析；多面体补不上指针，要互补
- [[mine-octagon-2006]] —— 八边形域；区间与多面体之间的工程甜点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
