---
title: SciPy — NumPy 之上的科学计算工具箱
来源: 'https://github.com/scipy/scipy'
日期: 2026-05-30
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

SciPy 是 **Python 科学计算的标准扩展库**——给 NumPy 的多维数组配上一整套工程算法：统计检验、最优化、数值积分、信号处理、稀疏矩阵、空间数据结构……都装在一个 `scipy` 包里。日常类比：NumPy 像一张白纸 + 一把直尺，能量长度算面积；SciPy 是配套的整套工具箱——圆规、三角板、量角器、计算器，每件都对应一个工程领域。

你写：

```python
from scipy.optimize import minimize
result = minimize(lambda x: (x[0] - 3)**2 + (x[1] + 1)**2, x0=[0, 0])
print(result.x)  # 接近 [3, -1]
```

只调一个函数，背后是几十年沉淀的 Fortran 数值代码（MINPACK / L-BFGS-B）。SciPy 把这些"工业级硬核算法"包装成 Python 接口，让你不用懂 Fortran 也能用上。

## 为什么重要

不理解 SciPy，下面这些事都没法解释：

- 为什么 scikit-learn / statsmodels / scikit-image / PyMC 都默认装好就能用——它们底层全靠 `scipy.sparse` / `scipy.optimize` / `scipy.linalg`
- 为什么"用 Python 做科研"敢说和 MATLAB 抗衡：因为 SciPy 包装了 LAPACK / BLAS / ARPACK 这些 MATLAB 也在用的同一批 Fortran 库
- 为什么处理"100 万维线性方程"要用 `scipy.sparse` 而不是 numpy——稀疏存储 + 专用解法器才能让内存和时间都压下来
- 为什么 1990 年代的 Fortran 代码到 2026 年还在跑——SciPy 是最大的"古老数值库现代化封装层"

## 核心要点

SciPy 的设计可以拆成 **三层**：

1. **NumPy 数组当通用语言**：所有子模块的输入输出都是 `numpy.ndarray`（或 `scipy.sparse` 稀疏矩阵）。类比：USB 接口——任何外设只要支持就能插。这让 SciPy / scikit-learn / pandas 能无缝串起来。

2. **Python 做胶水，Fortran/C 做计算**：Python 层做参数校验、数据转换、错误信息；真正的数值循环在 LAPACK（线代）/ QUADPACK（积分）/ MINPACK（最小二乘）/ ARPACK（稀疏特征值）里跑。类比：餐厅前台用中文点单，后厨用各国母语做菜。

3. **子模块自治**：`scipy.stats` / `scipy.optimize` / `scipy.signal` / `scipy.sparse` / `scipy.linalg` / `scipy.spatial` 各管一摊，接口风格也各自独立。类比：同一栋楼的不同诊室——挂号规则可能不一样，但都属一家医院。

## 实践案例

### 案例 1：非线性曲线拟合

```python
import numpy as np
from scipy.optimize import curve_fit

# 模拟指数衰减数据：y = a * exp(-b * x) + 噪声
x = np.linspace(0, 4, 50)
y_true = 2.5 * np.exp(-1.3 * x)
y_obs = y_true + 0.2 * np.random.randn(len(x))

def model(x, a, b):
    return a * np.exp(-b * x)

popt, pcov = curve_fit(model, x, y_obs, p0=[1, 1])
print(popt)            # 接近 [2.5, 1.3]
print(np.sqrt(np.diag(pcov)))  # 每个参数的标准误差
```

`popt` 是最优参数；`pcov` 是协方差矩阵，对角线开方就是参数的不确定度。这是科研里最常用的"拟合 + 报误差棒"流程。

### 案例 2：百万维稀疏线性方程组

```python
from scipy.sparse import diags, csr_matrix
from scipy.sparse.linalg import spsolve

n = 1_000_000
# 三对角矩阵：主对角 2，上下对角 -1（一维拉普拉斯算子）
A = diags([-1, 2, -1], [-1, 0, 1], shape=(n, n), format='csr')
b = np.ones(n)
x = spsolve(A, b)  # 几秒解完
```

如果用稠密 `numpy` 存矩阵，光内存就要 8 TB（100 万 × 100 万 × 8 byte）。`scipy.sparse` 只存非零元，CSR 格式让 `spsolve` 能跑稀疏 LU 分解。这是有限元、电路仿真、PageRank 的基础。

### 案例 3：参数 vs 非参数检验

```python
from scipy import stats
group_a = [23, 25, 21, 29, 27, 24]
group_b = [30, 28, 35, 32, 31, 33]

# 假设正态：t 检验
t_stat, p_t = stats.ttest_ind(group_a, group_b)
# 不假设分布：Mann-Whitney U 检验
u_stat, p_u = stats.mannwhitneyu(group_a, group_b)

print(f"t-test p={p_t:.4f}, U-test p={p_u:.4f}")
```

样本小且分布存疑时，t 检验的前提（正态、等方差）不成立，Mann-Whitney U 更稳健。`scipy.stats` 把 100+ 种检验和 90+ 种概率分布塞在一个命名空间里，是统计学习的"急救包"。

## 踩过的坑

1. **`scipy.linalg` ≠ `numpy.linalg`**：前者强制走 LAPACK 优化版、支持更多分解（QR / Schur / Cholesky 完整版）；后者是简化封装。同名函数（如 `solve` / `eig`）性能能差几倍——做密集线代必须用 `scipy.linalg`。

2. **稀疏格式选错性能崩盘**：`LIL` / `DOK` 适合"边构造边改"，`CSR` / `CSC` 适合矩阵乘法和解方程。构建完没 `.tocsr()` 就直接乘，每次都会重建索引，慢上百倍。

3. **`optimize.minimize` 默认方法不一定收敛**：有梯度选 `BFGS` / `L-BFGS-B`；无梯度选 `Nelder-Mead` / `Powell`；带约束用 `SLSQP` / `trust-constr`。选错可能给你一个"看着正常但是错的"局部极值，且不报错。

4. **尾部概率千万别用 `1 - cdf`**：当 `cdf(x)` 接近 1 时，`1 - cdf(x)` 浮点截断成 0；要用 `sf(x)`（survival function），它在尾部保持精度。`stats.norm.sf(10)` ≈ 7.6e-24，而 `1 - stats.norm.cdf(10)` 可能直接给 0。

## 适用 vs 不适用场景

**适用**：
- 数值科研、工程仿真、信号 / 图像处理、统计建模、稀疏线代
- 需要"调一行代码就能用工业级算法"的场景（拟合、解方程、做检验）
- 和 NumPy / pandas / scikit-learn 一起搭数据科学流水线

**不适用**：
- GPU 加速 / 自动求导 → 用 PyTorch / JAX
- 大规模分布式计算 → 用 Dask / Ray
- 符号计算（解方程的解析解）→ 用 SymPy
- 真·实时控制 → SciPy 是离线计算工具，不保证毫秒级延迟

## 历史小故事（可跳过）

- **1999 年**：Travis Oliphant 等人把当时三套半成品（Numeric / Numarray / Multipack）合到一起，叫 SciPy 0.1。
- **2001 年**：第一个公开版本发布，已能调 LAPACK 解线代。
- **2006 年**：Oliphant 把底层 Numeric / Numarray 重写成 NumPy，SciPy 才稳定到"NumPy 当数组层 + SciPy 当算法层"的现代分层。
- **2017 年**：1.0 正式版发布，距 0.1 整 18 年，宣告接口冻结。
- **2020 年起**：每年一个稳定大版本，逐步把 Fortran 翻译成 C/C++、加 PEP 517 构建，迈向 Python 3-only。

## 学到什么

1. **Python 不是科学计算的发明者，是封装者**——SciPy 让 1970-1990 年代的 Fortran 巨人们继续在 2026 年发光
2. **API 一致性 ≠ 实现一致性**：同一个 `solve` 在 `numpy.linalg` 和 `scipy.linalg` 里走不同路径，性能差几倍
3. **稀疏 / 稠密分家是数值计算的核心抽象**：选对存储格式比换算法影响更大
4. **生态先于库**：SciPy 的真正威力不是它自己，是 scikit-learn / statsmodels / scikit-image 都用它当地基

## 延伸阅读

- 官方文档：[SciPy User Guide](https://docs.scipy.org/doc/scipy/tutorial/index.html)（每个子模块都有零基础教程）
- 视频：[SciPy 2024 Tutorials](https://www.youtube.com/@EnthoughtMedia)（每年大会全程录像，免费）
- 书：Robert Johansson《Numerical Python》第 2 版（手把手讲 NumPy + SciPy + Matplotlib + Pandas）
- 论文：Virtanen et al. "SciPy 1.0: fundamental algorithms for scientific computing in Python", Nature Methods 2020（官方综述）
- [[numpy]] —— SciPy 的地基，多维数组的事实标准
- [[pandas]] —— 上层表格分析常和 SciPy 统计模块串用

## 关联

- [[numpy]] —— SciPy 把所有输入输出都当 numpy.ndarray，是物理上的依赖关系
- [[pandas]] —— DataFrame 的 `.values` 直接喂给 SciPy；统计建模常 pandas + scipy.stats
- [[polars]] —— 新一代列存表格库，和 SciPy 的桥还在生态早期，但思想类似（zero-copy 共享内存）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dask]] —— Dask — 让 pandas / NumPy 直接跑在比内存大的数据上
- [[librosa]] —— librosa — Python 音频分析库与 MFCC/STFT 事实标准
- [[numpy]] —— NumPy — Python 科学计算基石
- [[pandas]] —— pandas — Python 表格数据事实标准
- [[polars]] —— Polars — Rust 写的列存 DataFrame
- [[pyarrow]] —— PyArrow — 让所有数据系统共用一块内存
- [[scikit-learn]] —— scikit-learn — 经典 ML 库

