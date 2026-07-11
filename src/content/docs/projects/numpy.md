---
title: NumPy — Python 科学计算基石
来源: 'https://github.com/numpy/numpy'
日期: 2026-05-30
分类: data-science-ai
难度: 初级
---

## 是什么

NumPy（**Numerical Python**）是一个让 Python **算数字算得跟 C 一样快**的库。日常类比：Python 自带的 list 像一袋散装乐高（每块都贴了"我是几号块"的小纸条），而 NumPy 的 ndarray 是一整盒规规矩矩同尺寸的乐高——拿一块、加一块、搬一行，都不用先撕纸条再贴回去。

你写：

```python
import numpy as np
a = np.array([1, 2, 3, 4])
print(a * 2)   # [2 4 6 8]
print(a + a)   # [2 4 6 8]
```

没写一个 `for`，但每个元素都被乘 2、相加。这种"一句话作用到整个数组"的能力叫**矢量化**（vectorization），是 NumPy 跟 Python list 最根本的区别。

## 为什么重要

不理解 NumPy，下面这些事都没法解释：

- 为什么 pandas / scikit-learn / PyTorch / TensorFlow / JAX 都说"接收一个数组"——它们说的"数组"几乎都是 ndarray 或它的兼容形式
- 为什么同样一段算术代码用 NumPy 写比 Python list 快 100 倍——循环被下推到 C 层
- 为什么深度学习论文里到处是 `(B, C, H, W)`、`(N, D)` 这种四元组——那是 ndarray 的 shape
- 为什么科学计算课总让你"先 `import numpy as np`"——它已经是 Python 数值生态的事实根基

## 核心要点

NumPy 干的事可以拆成 **三层**：

1. **ndarray（连续内存的同质数组）**：所有元素 dtype 一致，底层是一段紧挨着的 C 内存 + 一组 shape/strides 元数据。类比：一栋楼里所有房间户型一样，给个房间号就能算出地址，不用挨家敲门。

2. **ufunc（通用函数）**：`+ - * /`、`np.sin`、`np.exp` 都是 ufunc，作用是"对整个数组里每个元素做同一件事"，循环写在 C 里。类比：流水线工人每人干同一件事，不用来回切换。

3. **broadcasting（广播）**：形状不一样的两个数组也能做运算——只要形状能"对齐"，NumPy 会自动把小的"摊开"成大的。类比：Excel 里一个常量列加到一整张表，不用复制粘贴 1000 行。

三层叠起来，就是"一行代码替你写完矩阵运算"的核心引擎。

## 实践案例

### 案例 1：矢量化代替 Python 循环

```python
import numpy as np

# Python list 写法（慢）
xs = list(range(1_000_000))
ys = [x * 2 + 1 for x in xs]

# NumPy 写法（快 100 倍）
xs = np.arange(1_000_000)
ys = xs * 2 + 1
```

**逐部分解释**：

- `np.arange(1_000_000)` 一次性在 C 里造出 100 万整数的连续数组
- `xs * 2 + 1` 是两次 ufunc，循环跑在 C 里，没回 Python 一次
- list 版本每次乘加都要把 int 装箱成 PyObject，开销巨大

### 案例 2：广播做行归一化

```python
import numpy as np
X = np.random.randn(100, 5)          # 100 行 5 列数据
mean = X.mean(axis=0)                # shape (5,)
std  = X.std(axis=0)                 # shape (5,)
X_norm = (X - mean) / std            # 自动广播：(100,5) - (5,) → (100,5)
```

形状 `(100, 5)` 和 `(5,)` 不一样，但 NumPy 把 `(5,)` "摊"成 `(100, 5)`（每一行都减同一组均值），不用你手写 100 次循环。这就是广播的力量。

### 案例 3：切片是视图，不是拷贝

```python
import numpy as np
a = np.array([1, 2, 3, 4, 5])
b = a[1:4]            # b 是 a 的视图（共享内存）
b[0] = 999
print(a)              # [1 999 3 4 5] —— a 也变了！

# 想要独立副本要显式拷贝
c = a[1:4].copy()
c[0] = 0
print(a)              # a 不变
```

切片返回视图（共享底层内存），是 NumPy 的性能优化之一——但也是新人最常踩的坑。

## 踩过的坑

1. **视图 vs 拷贝混淆**：切片、reshape、transpose 大多返回视图，改一处影响原数组——拿不准就 `.copy()`，宁可慢点也别静默 bug。

2. **广播规则反直觉**：`(3,) + (3, 1)` 不是 `(3,)` 而是 `(3, 3)`——一个当行向量、一个当列向量被自动外积形状。新人常以为是逐元素加。

3. **dtype 静默升级**：`int32` 和 `float32` 相加会被自动提升到 `float64`，内存翻倍、性能掉一档；混合 dtype 时显式 `.astype()` 才稳。

4. **for 循环遍历 ndarray**：写 `for x in arr: ...` 等于把每个元素装箱回 Python 标量，比 ufunc 慢 100 倍以上——能矢量化就别 for。

## 适用 vs 不适用场景

**适用**：
- 数值密集型计算（矩阵、向量、统计、信号处理、图像）
- 同质 dtype 的批量数据（一张表全是 float、一张图全是 uint8）
- 作为更高层库的底层（pandas DataFrame / scikit-learn 输入 / PyTorch tensor 互转）
- 中小规模数据（GB 级别以下，能塞进单机内存）

**不适用**：
- 异质数据（每行字段类型不同）→ 用 pandas DataFrame
- 超大规模数据（10GB+）→ 用 Dask / Polars / Spark 分块计算
- 需要 GPU 加速的深度学习 → 用 PyTorch / JAX（API 几乎复刻 NumPy）
- 字符串密集操作 → NumPy 的 string dtype 性能一般，用 Python list 或 Arrow

## 历史小故事（可跳过）

- **1995 年**：Jim Hugunin 写了 Numeric，第一个 Python 数值数组库，被天文学家广泛用。
- **2001 年**：Travis Oliphant 等人决心统一 Numeric 与 Numarray 两条分裂的分支。
- **2006 年**：NumPy 1.0 发布，吸收了两边的优点，成为新的事实标准。
- **2015 年起**：pandas / scikit-learn / TensorFlow / PyTorch 全部把 ndarray 接口当输入输出契约。
- **2020 年**：Nature 发表 "Array programming with NumPy"，把这个 25 年老库正式写进了科学论文的工具栏。

## 学到什么

1. **数据连续 + dtype 同质** 是高性能数值计算的两个底座——把这两件事钉死，循环就能下推到 C
2. **矢量化 = 把循环交给底层**，写 `a + b` 而不是 `for i in range(n): a[i]+b[i]`，这个心智习惯比任何具体 API 都重要
3. **shape / strides** 是理解 reshape / transpose / broadcasting 的钥匙——懂了这两个，深度学习张量操作就不再玄学
4. **生态契约的力量**：NumPy 自己只做数组，但因为大家都按它的 ndarray 接口来对接，它就成了 Python 数值计算的"USB 口"

## 延伸阅读

- 官方教程：[NumPy: the absolute basics for beginners](https://numpy.org/doc/stable/user/absolute_beginners.html)（手把手 1 小时）
- 论文：[Harris et al., "Array programming with NumPy", Nature 2020](https://www.nature.com/articles/s41586-020-2649-2)（25 年总结）
- 视频：[Keith Galli — Complete Python NumPy Tutorial](https://www.youtube.com/watch?v=GB9ByFAIAH4)（1 小时把 ndarray + 广播讲透）
- 经典书：Jake VanderPlas, *Python Data Science Handbook*（前两章是 NumPy 全景）
- [[halide]] —— 同样把"循环下推到底层"做成 DSL 的一种思路

## 关联

- [[halide]] —— Halide 把数组运算调度与算法分离，思路和 NumPy ufunc 同源
- [[xla-compiler]] —— XLA 把 JAX/TensorFlow 的 NumPy 风格代码编译成融合 kernel
- [[tvm]] —— TVM 给张量算子生成跨硬件代码，目标用户与 NumPy 重叠
- [[mlir]] —— MLIR 的 tensor / linalg dialect 直接吸收了 ndarray 抽象
- [[llvm]] —— NumPy 的 C 扩展和 BLAS 通过 LLVM 工具链编译
- [[pypy-tracing-jit]] —— PyPy 早年试图给 Python list 提速，NumPy 选了"换数据结构"这条路
- [[faiss-2017]] —— FAISS 的向量索引输入输出全部用 ndarray 兼容布局

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dask]] —— Dask — 让 pandas / NumPy 直接跑在比内存大的数据上
- [[dlib]] —— dlib — C++ 机器学习 / CV 工具箱
- [[librosa]] —— librosa — 把声音变成机器学习能吃的数字特征
- [[open3d]] —— Open3D — 现代点云 / 几何库
- [[pandas]] —— pandas — Python 表格数据事实标准
- [[pillow]] —— Pillow — Python 图像处理
- [[polars]] —— Polars — Rust 写的列存 DataFrame
- [[pyarrow]] —— PyArrow — 让所有数据系统共用一块内存
- [[scikit-learn]] —— scikit-learn — 经典 ML 库
- [[scipy]] —— SciPy — NumPy 之上的科学计算工具箱
