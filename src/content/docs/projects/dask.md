---
title: Dask — 让 pandas / NumPy 直接跑在比内存大的数据上
来源: 'https://github.com/dask/dask'
日期: 2026-05-30
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Dask 是一个 Python 并行计算库，**把 pandas / NumPy / scikit-learn 的 API 扩展到「比内存大、需要多核或多机」的场景**。日常类比：像把"一锅炖菜"换成"分餐火锅"——锅装不下，就分成 10 个小盘，10 个人一起涮，最后端上桌还是一道菜。

你写：

```python
import dask.dataframe as dd
df = dd.read_csv("data-*.csv")  # 200 个文件，总共 100 GB
df.groupby("user").value.mean().compute()
```

这段代码长得**和 pandas 一模一样**，但 pandas 一行就 OOM，Dask 却能在 16 GB 笔记本上跑完——它把 200 个文件切成 200 块、并行算、最后才合起来。

## 为什么重要

不理解 Dask，下面这些事都没法解释：

- 为什么"数据科学家不用学 Spark / Java"也能处理 100 GB 级数据
- 为什么同一份代码加一个 `import dask.dataframe as dd` 就能从笔记本搬到 100 台机器的集群
- 为什么 NVIDIA 的 GPU 数据科学栈（RAPIDS）选 Dask 而不是 Spark 当并行底座
- 为什么 Dask 调用一个 `.mean()` 不会立刻算，要再调 `.compute()` 才动

## 核心要点

Dask 的能力可以拆成 **三个机制**：

1. **分块（partition）**：把 DataFrame / Array 切成几十到几千个小块，每块是一份独立的 pandas DataFrame 或 numpy 数组。类比：把一本 1000 页的书拆成 100 个小册子，每册子可以独立翻。

2. **任务图（task graph）**：你写的每一步操作（`read_csv` / `groupby` / `mean`）不会立刻跑，而是记到一张有向无环图（DAG）里——节点是函数调用，边是数据依赖。类比：装修不会一边订砖一边贴，先画完整张施工图。

3. **懒执行 + 调度（lazy + scheduler）**：直到你调 `.compute()`，调度器才看图、决定哪块先算、分给哪个 worker。本机多核走线程池，跨机走 `dask.distributed`。

三者结合 = **API 不变、规模可扩**。

## 实践案例

### 案例 1：把 200 个 CSV 读成一张表做 groupby

```python
import dask.dataframe as dd

df = dd.read_csv("logs/2026-*.csv")     # 懒加载，没真读
result = df.groupby("user_id").duration.mean()
print(result.compute())                  # 此刻才真正读 + 算
```

**逐部分解释**：

- `dd.read_csv` 接受 glob 通配符，每个文件成为一个 partition
- `.groupby().mean()` 只是往任务图里加节点，没读数据
- `.compute()` 触发执行：调度器把 200 个分组任务发到本地线程池，最后合并成普通 pandas Series

### 案例 2：对超大 numpy 矩阵求均值

```python
import dask.array as da

x = da.random.random((100_000, 100_000), chunks=(5000, 5000))
# 100k × 100k float64 = 80 GB，单机内存装不下
print(x.mean().compute())
```

**逐部分解释**：

- `chunks=(5000, 5000)` 把矩阵切成 400 块，每块约 200 MB，能装进内存
- `.mean()` 在每块上算局部均值 + 局部计数，再合并成全局均值（map-reduce 风格）
- 全程不存完整 80 GB 矩阵，内存峰值就是少数 chunk 的总和

### 案例 3：用 `dask.delayed` 把已有函数并行化

```python
from dask import delayed, compute

@delayed
def load_and_clean(path):
    return expensive_pipeline(path)      # 你已有的纯 Python 函数

tasks = [load_and_clean(p) for p in paths]
results = compute(*tasks)                 # 8 个文件并行处理
```

**逐部分解释**：

- `@delayed` 装饰器让函数调用「先记账不真跑」，返回一个 lazy 对象
- 列表推导造出 8 个 lazy 任务，构成一张图
- `compute(*tasks)` 一起执行，自动并行——你**完全不用碰线程池或进程池**

## 踩过的坑

1. **忘记调 `.compute()`**：`df.groupby(...).mean()` 返回的是一个"图"对象，不是结果。新人 print 出来一串 `<Dask DataFrame Structure>` 还以为代码错了。

2. **partition 切得太细**：把每行切成一个 partition，任务图几十万个节点，调度开销远超计算开销。经验值：每个 partition 控制在 100 MB-1 GB 之间。

3. **用 `.apply()` 套 Python 自定义函数**：失去 pandas 的 C 向量化，比纯 pandas 还慢。能用内置算子（`groupby` / `agg` / `merge`）就别用 `.apply()`。

4. **单机默认开满核心，内存爆**：Dask 默认把所有 CPU 核都用上，每个 worker 还会缓存数据。大文件时要显式 `Client(n_workers=4, memory_limit="4GB")` 限流。

## 适用 vs 不适用场景

**适用**：

- pandas / NumPy 跑得动但**慢**（4-8 核加速）或**内存不够**（100 GB 级数据）
- 已有 Python 数据流水线想加并行，又不想重写成 Spark
- GPU 数据科学（配合 RAPIDS / cuDF）

**不适用**：

- 数据 < 10 GB 且 pandas 跑得动 → 直接 pandas，加 Dask 反而慢
- 列式分析 + 极致性能 → 用 [[polars]]（Rust 写的，单机比 Dask 快很多）
- 真正百 TB 级 + 复杂 SQL → 上 Spark / Trino，生态更成熟
- 流式实时计算 → Dask 是批处理思路，流式用 Flink / Kafka Streams

## 历史小故事（可跳过）

- **2014 年**：Matthew Rocklin 在 Continuum Analytics（后改名 Anaconda）启动 Dask，最初只想给 NumPy 做"out-of-core 数组"
- **2015 年**：扩出 DataFrame / Bag / Delayed 四套 API，task graph + scheduler 架构定型
- **2017 年**：`dask.distributed` 加入，支持跨机集群调度，正式成为 Spark 在 Python 生态的对手
- **2018 年起**：NVIDIA 把 Dask 选为 RAPIDS（GPU 数据科学）的并行底座，Dask 成为 PyData 默认并行方案

## 学到什么

1. **API 不变 + 规模可扩** 是工程上最值钱的能力——用户学习成本几乎为零
2. **task graph + lazy execution** 是把"小机器代码"放大到"大机器代码"的通用模式（Spark / TensorFlow / Airflow 同款）
3. **分块大小是性能杠杆**：太大装不下，太小调度爆——Dask 把这个杠杆暴露给用户调
4. **「先看图再执行」让框架有机会做优化**——融合算子、减少中间结果、推断内存上限

## 延伸阅读

- 官方文档：[Dask documentation](https://docs.dask.org/en/stable/)（按 Array / DataFrame / Bag / Delayed 分章）
- 入门视频：[Matthew Rocklin — Scalable Data Analysis in Python with Dask](https://www.youtube.com/watch?v=mbfsog3e5DA)（作者本人 1 小时讲架构）
- 实战书：[*Scaling Python with Dask* — Holden Karau](https://www.oreilly.com/library/view/scaling-python-with/9781098119867/)（2023 年出的实战手册）
- [[pandas]] —— Dask DataFrame 包的就是 pandas，每个 partition 是一份 pandas DataFrame
- [[polars]] —— 单机场景下的强力替代，列式 + Rust 实现

## 关联

- [[pandas]] —— Dask DataFrame 在每块 partition 上调 pandas，API 几乎一比一
- [[numpy]] —— Dask Array 把 numpy 操作分块、懒执行
- [[scikit-learn]] —— Dask-ML 把 sklearn 的 fit/predict 并行化到多核多机
- [[polars]] —— 同样针对"pandas 太慢"，但走"单机列式"路线，与 Dask 的"多机分块"互补
- [[scipy]] —— scipy 的稀疏 / 线性代数操作可借 Dask Array 分块加速
- [[mapreduce]] —— Dask 的「map 各 partition + reduce 合并」就是 MapReduce 思想在 Python 内的复刻

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[modin]] —— Modin — pandas 的分布式 drop-in（一行 import 自动并行）
- [[numpy]] —— NumPy — Python 科学计算基石
- [[pandas]] —— pandas — Python 表格数据事实标准
- [[polars]] —— Polars — Rust 写的列存 DataFrame
- [[ray]] —— Ray — 把单机 Python 函数和类无缝扩展到整个集群
- [[scikit-learn]] —— scikit-learn — 经典 ML 库
- [[scipy]] —— SciPy — NumPy 之上的科学计算工具箱

