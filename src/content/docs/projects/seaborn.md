---
title: seaborn — matplotlib 之上的一行统计图
来源: 'https://github.com/mwaskom/seaborn'
日期: 2026-05-31
子分类: 数据可视化
分类: 数据可视化
难度: 入门到中级
provenance: pipeline-v3
---

## 是什么

seaborn 是 Michael Waskom 2012 年在斯坦福读神经科学博士期间发起、现由 NumFOCUS 财务赞助的 Python 统计可视化库。日常类比：matplotlib 像装在三脚架上的单反——光圈、快门、白平衡都要自己拧；seaborn 是一台 "人像模式" 的手机相机——你说 "把这组分类列拍成箱线图、按性别上色、按年级分面"，剩下交给它。底层每一次调用最终都还是落到 matplotlib 的 Axes 上，所以 "seaborn 出的图" 本质是 "matplotlib 出的图，但配置由统计语义自动决定"。

最小例子：

```python
import seaborn as sns
tips = sns.load_dataset("tips")

sns.boxplot(data=tips, x="day", y="total_bill", hue="sex")
```

一行干了三件事：把 day 当分类轴、total_bill 当数值轴、sex 当配色维度，自带箱体 + 中位数 + 须 + 离群点 + 图例 + 调色板。同样一张图用 matplotlib 写要 30 行 groupby + bar + errorbar。

## 为什么重要

不理解 seaborn，下面这些事都没法解释：

- 为什么 EDA（探索式数据分析）阶段大家不直接 [[matplotlib]]——boxplot / violinplot / heatmap 三件套是 seaborn 的主场，matplotlib 写起来太啰嗦
- 为什么 [[pandas]] DataFrame 越来越偏好 "长格式"（long-form）——seaborn 的 hue / col / row 直接吃列名，宽格式必须先 melt
- 为什么 v0.12（2022-09）以后多了一套 `seaborn.objects` 接口——是 Waskom 把 Wilkinson Grammar of Graphics 思想（[[plotnine]] 同源）引进来，给老 API 留一条声明式分叉
- 为什么科研论文里那些 "同一指标按多组分面 + 95% CI 阴影" 的图大多是 seaborn——bootstrap 置信区间、KDE、回归带都是内建

## 核心要点

seaborn 的 API 分**两层**，弄清楚这一刀解决 90% 困惑：

1. **figure-level**：`relplot / displot / catplot / lmplot / jointplot / pairplot`。返回 **FacetGrid**（不是 Axes），自己创建一整张 Figure，支持 `col=` `row=` 自动分面
2. **axes-level**：`scatterplot / lineplot / boxplot / violinplot / heatmap / kdeplot / regplot` 等。画到 **现有 Axes**（默认当前 Axes 或你传的 `ax=`），可以和 matplotlib 子图混用

记忆窍门："带 plot 后缀但又是大类名" 的几乎都是 figure-level（relplot = relational plot），细分函数（boxplot / scatterplot）是 axes-level。两者参数大同小异，但返回值不同——这是新人最常踩的坑。

数据格式偏好：

- **长格式**（long-form / tidy）：每行一个观测，列名当变量。`hue="sex"` 直接生效
- **宽格式**：seaborn 也认，但 hue / style / size 必须自己拼。建议先 `df.melt()`

统计内建（matplotlib 没有，要自己写）：

- bootstrap 重采样默认 1000 次，自动画 95% 置信带（lineplot / lmplot / barplot）
- KDE（核密度估计）：`kdeplot`、`displot(kind="kde")`
- 回归：`regplot` 默认 OLS，可切 `lowess` / `order=2` 多项式 / `logistic=True`

样式系统：

- `sns.set_theme(style="whitegrid", palette="deep")` 一键改全局——本质是改 matplotlib rcParams
- 五种默认样式：`darkgrid` / `whitegrid` / `dark` / `white` / `ticks`
- 调色板：分类用 `deep / muted / pastel / bright / dark / colorblind`；连续用 `rocket / mako / flare / crest`（替代 matplotlib 的 viridis）

## 实践案例

### 案例 1：箱线图 + 分面 + 配色一行调用

```python
sns.catplot(
    data=tips, kind="box",
    x="day", y="total_bill", hue="sex",
    col="time", height=4, aspect=0.8,
)
```

`catplot(kind="box")` 是 figure-level 包装。`col="time"` 自动按 lunch/dinner 横向分面成两子图，每子图内部按 day 分组、按 sex 上色——四维信息一行表达。返回 FacetGrid，后续 `g.set_axis_labels("星期", "账单 / 美元")` 改文字。

### 案例 2：热力图（相关矩阵）

```python
import numpy as np
corr = tips.corr(numeric_only=True)
mask = np.triu(np.ones_like(corr, dtype=bool))

sns.heatmap(
    corr, mask=mask, annot=True, fmt=".2f",
    cmap="rocket_r", center=0, square=True, linewidths=0.5,
)
```

`mask` 把上三角遮掉避免重复，`annot=True` 把数字直接画在格子里，`square=True` 强制正方形格子。混淆矩阵也用同款写法，把 `corr` 换成 `sklearn.metrics.confusion_matrix(...)` 输出即可。

### 案例 3：分类图三兄弟（boxplot / violinplot / stripplot）

```python
import matplotlib.pyplot as plt

fig, axes = plt.subplots(1, 3, figsize=(12, 4), sharey=True)
sns.boxplot   (data=tips, x="day", y="total_bill", ax=axes[0])
sns.violinplot(data=tips, x="day", y="total_bill", ax=axes[1])
sns.stripplot (data=tips, x="day", y="total_bill", ax=axes[2], jitter=0.2, size=3)
```

三种分布展示方式同位对比：箱线给五数概括、提琴叠 KDE、带状散点保留每个观测。注意三个都是 axes-level——传 `ax=` 直接画到指定子图。混用 matplotlib 的 `plt.subplots` 是日常工作流的标准姿势。

## 踩过的坑

1. **figure-level 返回的不是 Axes**：`g = sns.relplot(...)` 后想存图，写 `plt.savefig` 拿到的是空白；正确做法 `g.figure.savefig("out.png")` 或 `g.savefig(...)`。同样 `g.ax` 只在单子图时存在，多子图要走 `g.axes` 或 `g.axes_dict`。

2. **宽数据传 hue 不生效**：宽表（每列一个变量）直接喂会被当成 "y 是这一列"，hue 失效。先 `df.melt(id_vars=[...], var_name="metric", value_name="value")` 转长格式。

3. **数值列被当连续色**：`hue="rating"` 如果 rating 是 int，seaborn 默认连续色板（rocket）；想要离散色板必须 `hue=df["rating"].astype(str)` 或 `palette="deep"` 配合 `hue_order=`。

4. **set_theme 污染全局 rcParams**：在 notebook 里调一次 `sns.set_theme(style="dark")`，后面纯 matplotlib 出图也变深色背景。库代码里别用 set_theme，临时上下文用 `with sns.axes_style("dark"): ...`。

5. **heatmap 不聚类**：要按相似度重排行列必须用 `sns.clustermap(corr)`——它走 scipy.cluster.hierarchy 做层次聚类，返回 ClusterGrid（也是 figure-level），savefig 同样走 `g.savefig`。

6. **distplot 已弃用**：v0.11 起拆成 `histplot` / `kdeplot` / `ecdfplot` / `displot`。老教程里的 `sns.distplot(x)` 现在会报 FutureWarning，等价 `sns.histplot(x, kde=True)`。

## 适用 vs 不适用场景

**适用**：

- EDA 阶段一行出图、一行换分面（catplot / relplot / displot 三大门）
- 论文 figure 里 "同指标分组 + 95% CI" 的标准范式
- 相关矩阵 / 混淆矩阵 / 任何热力图
- 分布对比（boxplot / violinplot / stripplot / swarmplot 一组）

**不适用**：

- 像素级排版（双栏 PDF、嵌入数学公式）→ 退回 [[matplotlib]] OO API
- 交互（hover、zoom、brush 联动）→ [[altair]] / Plotly
- Web 前端嵌入 → [[vega-lite]]
- grammar of graphics 风格的可组合管线 → seaborn.objects 或 [[plotnine]]
- 海量点（>1M）实时渲染 → datashader

## 学到什么

1. **API 两层切分**（figure-level vs axes-level）解决了 "高层方便 vs 底层可控" 的老矛盾——figure-level 一行起飞、axes-level 嵌进 matplotlib 复合 panel，二者共享 90% 参数
2. **统计语义提前**：bootstrap CI / KDE / 回归带这种 "几乎每张科研图都要" 的东西做进默认行为，是 seaborn 真正提速 EDA 的核心，不是颜值
3. **长格式 DataFrame 是声明式可视化的入场券**：seaborn / [[plotnine]] / [[altair]] 都偏好 long-form——hue / col / row 直接 = 列名，这种范式比宽表更适合 "组合多变量"
4. **建在 matplotlib 之上而不是替代**：保留 `ax=` 接口让你随时退回到底层精修——这种 "高层默认 + 底层逃生口" 的设计哲学值得复用

## 延伸阅读

- 官方教程：[seaborn.pydata.org/tutorial.html](https://seaborn.pydata.org/tutorial.html)（按 API 类别分章，每章自带数据集）
- 新接口：[seaborn.objects 介绍](https://seaborn.pydata.org/tutorial/objects_interface.html)（v0.12 起的 grammar 风格，类比 plotnine）
- 论文：[Waskom 2021 — seaborn: statistical data visualization (JOSS)](https://joss.theoj.org/papers/10.21105/joss.03021)（2 页 JOSS，引用准入门）
- 配色背景：[Smith & van der Walt 2015 — viridis](https://bids.github.io/colormap/)（rocket / mako 同思路，感知均匀）
- [[matplotlib]] —— 底层渲染层，seaborn 100% 调它
- [[pandas]] —— DataFrame 是 seaborn 唯一原生输入
- [[plotnine]] —— grammar of graphics 在 Python 上的近亲，seaborn.objects 同源思路

## 关联

- [[matplotlib]] —— seaborn 每张图最终落到 matplotlib 的 Axes / Figure
- [[pandas]] —— seaborn 偏好长格式 DataFrame，hue / col / row 直接是列名
- [[plotnine]] —— ggplot2 的 Python 移植，与 seaborn.objects 同走声明式 grammar 路线
- [[altair]] —— 声明式 + 交互向，seaborn 的对照（静态 vs 交互、命令式 vs 声明式）
- [[vega-lite]] —— Web 端 grammar of graphics 标准，对位 seaborn.objects 的设计哲学
