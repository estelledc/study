---
title: pandas — Python 表格数据事实标准
来源: 'https://github.com/pandas-dev/pandas'
日期: 2026-05-30
分类: data-science-ai
难度: 初级
---

## 是什么

pandas 是一个**让 Python 像 Excel 一样处理带行列标签的二维表格**的库。日常类比：你把一张 Excel 表的"行 + 列 + 表头 + 缺失格子"原样搬进 Python，还能用一行代码做透视、分组、合并。

核心是三个东西：

- `DataFrame`——一张二维表，有行索引、列名、各列可以是不同类型
- `Series`——一列数据，带行索引
- `Index`——行/列的标签本身，不是位置而是名字

底层走的是 NumPy 数组，但 pandas 在外面套了一层"标签 + 缺失值 + 异质类型"的语义。所以你能写：

```python
import pandas as pd
df = pd.read_csv("sales.csv")
df.groupby("region")["sales"].sum()
```

读 CSV、按地区分组、求和——三步，没循环，没 SQL，没游标。

## 为什么重要

不理解 pandas，下面这些事都没法解释：

- 为什么数据科学课第一课几乎都从 `import pandas as pd` 开始——它是 Python 进入"表格世界"的入口
- 为什么 scikit-learn / matplotlib / Jupyter 默认接收 DataFrame——pandas 是事实上的数据交换格式
- 为什么明明有 SQL，数据分析师还要用 pandas——它能在内存里反复试探数据，不用每次重连数据库
- 为什么"NaN 把我的整数列变成浮点了"是新手最常见的一个坑——这是 pandas 缺失值设计的历史副作用

## 核心要点

pandas 的能力可以拆成 **三层**：

1. **标签化的数据容器**：每行每列都有名字，不是 `arr[3][7]` 而是 `df.loc["beijing", "sales"]`。类比：从"按座位号点名"换成"按姓名点名"，更不容易认错人。

2. **自动按索引对齐**：两个 Series 做加法，pandas 不看位置，看索引。索引相同的相加，索引只在一边的位置自动填 NaN。类比：两份花名册合并，按姓名匹配，不在另一份的人留空。

3. **声明式操作 = 一行做一件大事**：`groupby` / `merge` / `pivot_table` 这些方法把"循环 + 分组 + 累加 + 合并"压成一行。类比：从手写 for 循环搬到 SQL 思路——你说要什么，不说怎么做。

这三层加起来，让 pandas 既比 NumPy 直观（有标签），又比手写循环快（向量化），还比 SQL 灵活（在内存里随便改）。

## 实践案例

### 案例 1：读 CSV 并看一眼数据形状

```python
import pandas as pd
df = pd.read_csv("sales.csv")
print(df.head())      # 看前 5 行
print(df.info())      # 看每列类型和缺失数
print(df.describe())  # 看数值列的均值/标准差/分位数
```

**逐部分解释**：

- `read_csv` 自动识别表头、数据类型、分隔符
- `head()` 像 SQL 的 `LIMIT 5`，先扫一眼别动全表
- `info()` 关键看"非空数 vs 总行数"——差出来的就是缺失值数量

新手第一步永远是这三连，绕过去就容易踩"列名拼错""类型不对"的坑。

### 案例 2：按列分组求和（GROUP BY 的 pandas 写法）

```python
df.groupby("region")["sales"].sum()
```

**逐部分解释**：

- `groupby("region")`——把表按 region 列的值切成几个小表
- `["sales"]`——只看 sales 列
- `.sum()`——每个小表求和

等价 SQL：`SELECT region, SUM(sales) FROM df GROUP BY region`。pandas 比 SQL 多一点：返回的是带 region 索引的 Series，可以直接画图、再排序、再 merge。

### 案例 3：两张表合并（JOIN 的 pandas 写法）

```python
users = pd.read_csv("users.csv")
orders = pd.read_csv("orders.csv")
joined = pd.merge(users, orders, on="user_id", how="left")
```

**逐部分解释**：

- `on="user_id"`——按这一列匹配
- `how="left"`——保留左表所有行，右表没匹配上的填 NaN（同 SQL `LEFT JOIN`）
- 还有 `inner` / `right` / `outer` 四种 how

`merge` 是 pandas 把关系代数搬进内存的核心动作——参考 [[codd-1970]] 的关系连接思想。

## 踩过的坑

1. **SettingWithCopyWarning**：写 `df[df.a > 0]["b"] = 1` 看似改了原表，pandas 内部其实先筛出副本再改副本，原表纹丝不动。正确写法：`df.loc[df.a > 0, "b"] = 1`，用 `.loc` 一次性定位。

2. **NaN 把 int 列升成 float**：缺失值借用 IEEE 754 浮点的 NaN 表达，整数列一旦混进 NaN，整列被升级成 float64，`1` 显示成 `1.0`。pandas 2.0 起有 `Int64`（首字母大写）可空整数类型解决。

3. **索引自动对齐让加法出 NaN**：两个 Series `s1 + s2` 不是按位置加，是按索引加。索引不一致的位置自动填 NaN。新手常在乱序索引上栽跟头——先 `reset_index()` 或显式对齐。

4. **inplace=True 不省内存也不更快**：很多 inplace 操作内部仍复制一份再写回，省不了多少内存却让链式调用断掉。社区主流建议：忘掉 inplace，永远写 `df = df.do_something()`。

## 适用 vs 不适用场景

**适用**：

- 几千到几千万行、能塞进内存的表格分析
- 探索性数据分析（在 Jupyter 里反复试探、画图）
- ETL 脚本：读 CSV/Excel/SQL → 清洗 → 写 Parquet
- 数据科学建模前的特征工程（喂给 scikit-learn 前的处理）

**不适用**：

- 数据量超内存（几亿行）→ 用 [[duckdb-2019]] 或 Polars，或下推到数据库
- 需要并行/分布式 → 用 Spark / Dask / Ray
- 在线交易型读写（OLTP）→ 用 PostgreSQL / MySQL，pandas 没有事务、没有索引外维护
- 实时流处理 → pandas 是批处理思路，不是 [[volcano-1994]] 那种流水线执行器

## 历史小故事（可跳过）

- **2008 年**：Wes McKinney 在一家量化对冲基金做研究分析师，每天在 Excel 和 R 之间来回搬数据，受不了，开始用 Python 写一个内部工具
- **2009 年**：项目开源，名字 **pandas** 来自 *panel data*（计量经济学的"面板数据"），不是熊猫
- **2012 年**：Wes 离职全职做 pandas，写了《Python for Data Analysis》，成为数据科学入门标配
- **2020 年**：1.0 发布，API 终于稳定，新手不再担心一升级就坏
- **2023 年**：2.0 引入 PyArrow 作为可选后端，开始解决"NaN 升级 int 为 float"等十年老坑

## 学到什么

1. **给数据加标签 = 让代码长得像问题本身**——`df.loc["beijing", "sales"]` 比 `arr[3][7]` 容易读 10 倍
2. **声明式操作 > 循环**：能用 groupby/merge 解决的事，永远别写 for
3. **缺失值是一等公民**：现实数据永远有缺，pandas 的 NaN 设计虽然有副作用但承认了这件事
4. **建在 NumPy 之上**：pandas 没有重新发明数组，它把 NumPy 的快和 Excel 的直观拼起来——好工具常常是这种"拼接"

## 延伸阅读

- 官方 10 分钟教程：[10 minutes to pandas](https://pandas.pydata.org/docs/user_guide/10min.html)（按需查 API 的最佳入口）
- 书：Wes McKinney《Python for Data Analysis》第 3 版（作者亲自写的"如何用 pandas 思考数据"）
- 视频：[Corey Schafer — Pandas Tutorials](https://www.youtube.com/playlist?list=PL-osiE80TeTsWmV9i9c58mdDCSskIFdDS)（11 集，从读 CSV 到时间序列全覆盖）
- [[numpy]] —— pandas 底层数组引擎，先懂 NumPy 再看 pandas 会顺很多
- [[codd-1970]] —— pandas 的 merge / groupby 思想直接来自关系代数

## 关联

- [[numpy]] —— pandas 的地基；DataFrame 每列本质是 NumPy ndarray
- [[codd-1970]] —— 关系模型；pandas 的 merge / pivot 是关系代数的内存版
- [[duckdb-2019]] —— 数据量过内存或想用 SQL 直接打 DataFrame 时的同代替代品
- [[clickhouse]] —— 当 pandas 跑不动时下推到列式数据库的常见选择
- [[cstore-2005]] —— 列式存储起源；pandas 2.0 的 Arrow 后端就是这个思路
- [[volcano-1994]] —— 流水线执行器；pandas 是它的反面（一次性物化全表）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[velox-meta-2022]] —— Velox — Meta 统一执行引擎
- [[arrow]] —— Apache Arrow — 内存列式标准
- [[dask]] —— Dask — 让 pandas / NumPy 直接跑在比内存大的数据上
- [[jupyter-notebook]] —— Jupyter Notebook — 经典数据科学笔记本
- [[marimo]] —— marimo — 反应式 Python 笔记本
- [[matplotlib]] —— matplotlib — Python 绘图基石
- [[modin]] —— Modin — pandas 的分布式 drop-in（一行 import 自动并行）
- [[plotly-py]] —— Plotly.py — DataFrame 一行变交互图表
- [[plotnine]] —— plotnine — Python 复刻 R 的 ggplot2
- [[polars]] —— Polars — Rust 写的列存 DataFrame
- [[pyarrow]] —— PyArrow — 让所有数据系统共用一块内存
- [[scikit-learn]] —— scikit-learn — 经典 ML 库
- [[scipy]] —— SciPy — NumPy 之上的科学计算工具箱
- [[seaborn]] —— seaborn — matplotlib 之上的一行统计图
- [[shap]] —— SHAP — 用博弈论给每个特征发工资
- [[zeppelin]] —— Apache Zeppelin — JVM 多语言笔记本
