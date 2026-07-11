---
title: plotnine — Python 复刻 R 的 ggplot2
来源: 'https://github.com/has2k1/plotnine'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 入门到中级
---

## 是什么

plotnine 是 Hassan Kibirige（has2k1）2017 年起主导的 Python 可视化库。日常类比：像翻译——R 用户写了十年 `ggplot(df) + geom_point() + facet_wrap(...)`，换语言时不想换肌肉记忆，plotnine 把 R 的每个算子原封不动搬到 Python，连 `+` 加号叠加图层这件事都保留。

最小例子：

```python
from plotnine import ggplot, aes, geom_point
import pandas as pd

df = pd.DataFrame({"hp": [90, 130, 170], "mpg": [30, 22, 16], "origin": ["JP", "US", "US"]})

(
    ggplot(df, aes(x="hp", y="mpg", color="origin"))
    + geom_point(size=3)
)
```

这条链做了三件事：

- `ggplot(df, aes(...))`：把 DataFrame 塞进图对象，并声明 x/y/color 三个**美学映射**（aesthetic mapping）
- `+ geom_point(...)`：加一层"散点"几何对象
- 最外层的 `()` 让多行 `+` 可读，不是必需

执行后底层调 matplotlib 画一张静态 PNG/SVG——不是浏览器交互图。这是 plotnine 和 [[altair]] 最根本的分叉。

## 为什么重要

不理解 plotnine，下面这些事都没法解释：

- 为什么"统计师从 R 迁到 Python"在 2018 年之后变得不痛——他们要的不是新画图库，是 ggplot2 的复刻
- 为什么 GoG（grammar of graphics）这套 1999 年 Wilkinson 提出的语法，能跨 R / Python / JS（[[altair]] / Vega-Lite）三个生态都站住——它本身是对"图是什么"的形式化拆解
- 为什么 plotnine 的图扔进 LaTeX 论文不会糊——后端是 matplotlib，PDF 矢量输出免费拿
- 为什么"颜色"在 GoG 里不是装饰参数而是和 x、y 平级的通道——`aes(color=...)` 把数据某列映射到 hue，跟把另一列映射到 x 是同一件事

## 核心要点

GoG 把"一张图"拆成 7 个正交的层，plotnine 的 API 一一对应：

1. **data + aes**：`ggplot(df, aes(x=, y=, color=, shape=, size=))`——数据来源 + 哪一列接哪个视觉通道
2. **geom_xxx**：几何对象层。`geom_point` / `geom_line` / `geom_bar` / `geom_smooth` / `geom_boxplot` / `geom_histogram` 十几种
3. **stat_xxx**：统计变换层。`stat_summary` / `stat_smooth` 算回归线、置信带；多数 geom 已经隐含调一个 stat
4. **scale_xxx**：标度。`scale_x_log10` / `scale_color_brewer` 控制"数据值 → 视觉值"的映射函数
5. **coord_xxx**：坐标系。`coord_flip` 横竖翻、`coord_polar` 转极坐标
6. **facet_wrap / facet_grid**：按一列或两列分组复制成小多图（small multiples）
7. **theme + labs**：主题样式与文字标签

复合的方式只有一个算子：**`+`**。`p + geom_point() + scale_x_log10() + theme_minimal()`——叠加图层、改标度、换主题，全是同一个加号。这把"声明式"贯彻到了极致。

写法上的关键约定：

- `aes()` 里的列名是**字符串**，必须和 DataFrame 列名完全一致；拼错只在渲染时抛 KeyError
- aes 里写常量（`color="blue"`）会被当映射处理（生成图例），固定颜色应写在 geom 外（`geom_point(color="blue")`）
- 默认主题 `theme_gray()` 灰底白格，跟 R ggplot2 一致，期刊投稿常换 `theme_bw()` / `theme_minimal()`

## 实践案例

### 案例 1：从 DataFrame 到一张分面散点图

```python
from plotnine import ggplot, aes, geom_point, geom_smooth, facet_wrap, theme_bw
from plotnine.data import mtcars

(
    ggplot(mtcars, aes(x="wt", y="mpg", color="factor(cyl)"))
    + geom_point(size=2)
    + geom_smooth(method="lm", se=False)
    + facet_wrap("~gear")
    + theme_bw()
)
```

这条链按声明顺序叠：先散点，再线性回归线（`method='lm'`，关掉置信带），再按 `gear` 列分三格小多图，最后换白底主题。`factor(cyl)` 把数值列当作类别处理——和 R 一样的转换语法。

### 案例 2：统计变换替你算

```python
from plotnine import ggplot, aes, geom_bar

(
    ggplot(mtcars, aes(x="factor(cyl)"))
    + geom_bar()  # 隐含 stat_count: 自己数每个 cyl 出现次数
)
```

这里没有 y——`geom_bar` 默认调 `stat_count`，自动按 x 分组数行数。要画"y 是某列均值"的柱图，写 `geom_bar(aes(y='mpg'), stat='summary', fun_y='mean')` 或用 `stat_summary`。

### 案例 3：转图保存

```python
p = ggplot(mtcars, aes(x="wt", y="mpg")) + geom_point()

p.save("scatter.png", width=6, height=4, dpi=150)  # 静态 PNG
p.save("scatter.pdf")                              # 矢量 PDF（论文友好）
fig = p.draw()                                     # 拿到 matplotlib Figure，自由后处理
```

`draw()` 拿到的就是普通 matplotlib `Figure`，可以继续加 axhline、annotate、保存任意格式——这是 plotnine 比 [[altair]] 更"传统数据科学"的根本：底层是熟悉的 matplotlib 栈。

## 踩过的坑

1. **`+` 顺序不能反**：`geom_point() + ggplot(df)` 会抛 TypeError——`+` 是 ggplot 对象上重载的，必须左边是 ggplot 实例。新手有时复制粘贴顺序写反，看报错懵半天。

2. **aes 里写常量被当映射**：`aes(color='red')` 不会画红点，而是创建一个名叫"red"的类别图例。要固定颜色写 `geom_point(color='red')`，放在 aes **外面**。

3. **列名陷阱**：`aes(x='hp ')`（多了空格）和 `aes(x='hp')` 是两列，IDE 不会警告。pandas 列名清洗（`df.columns.str.strip()`）在管道首步加上是肌肉记忆。

4. **大数据集慢**：底层 matplotlib 对几十万点不算快，超过 10 万点考虑提前 aggregate / bin 或换 datashader。

5. **theme 合并不是字典更新**：`theme_bw() + theme(figure_size=(8,4))` 是按声明顺序覆盖，最后一个 theme 优先；想"基础主题 + 局部调"必须显式写两段。

## 适用 vs 不适用场景

**适用**：

- 团队主语言是 Python 但有大量 R/ggplot2 出身成员——零迁移成本
- 输出目标是论文 / 报告 / 静态截图——matplotlib 后端 PDF/SVG 矢量免费
- 想用 GoG 思维强迫自己拆图：先想清楚"哪几列映射哪几个通道"，再选 geom

**不适用**：

- 需要浏览器交互（zoom / brush / tooltip）→ 用 [[altair]] / plotly
- 百万行级渲染 → datashader / holoviews
- 3D / 地理投影 / 复杂 GIS → 直接 matplotlib + cartopy / pyvista
- 期刊 Figure 1 级精排版（多面板对齐到 mm）→ 仍需要直接控 matplotlib

## 历史小故事（可跳过）

- **1999**：Leland Wilkinson 出版 *The Grammar of Graphics*，把"图"拆成可组合的层
- **2005–2010**：Hadley Wickham 在 R 里做成 ggplot2，统计师肌肉记忆定型
- **2017**：Hassan Kibirige（has2k1）开源 plotnine，目标是把 ggplot2 API 原样搬到 Python
- **之后**：文档与案例库持续对齐 R 生态；后端始终钉在 matplotlib，换来论文级矢量输出

## 学到什么

1. **GoG 把"图"形式化成 7 层**：data / aes / geom / stat / scale / coord / facet——理解这个比记 API 重要十倍，跨 R/Python/JS 都能复用
2. **`+` 是叠加而不是赋值**：每加一层都返回新 ggplot 对象（不可变），可以中途存变量复用基底
3. **声明式让"换数据 / 加分面 / 换主题"几乎免费**——不像命令式 matplotlib 改一个轴要重画整套
4. **跨语言移植的代价是失去交互**——Vega-Lite/altair 把渲染外包给浏览器拿到交互；plotnine 留在 matplotlib 拿到出版质量，二者各取一头

## 延伸阅读

- 官方文档：[plotnine.org](https://plotnine.org)（API 参考 + 案例库）
- 案例对比：[plotnine vs ggplot2 cheatsheet](https://plotnine.org/tutorials/)（同一图两种语言并排）
- Wilkinson 原书：《The Grammar of Graphics》（1999, Springer）——GoG 的源头，理论密度高
- Hadley Wickham 2010：[A Layered Grammar of Graphics](http://vita.had.co.nz/papers/layered-grammar.pdf)（ggplot2 的设计论文，22 页）
- [[altair]] —— 同代竞品，声明式但走 Vega-Lite/浏览器路线
- [[pandas]] —— plotnine 的数据源，aes 字符串映射的就是 DataFrame 列名

## 关联

- [[altair]] —— 同样声明式，但编译目标是 Vega-Lite JSON 而非 matplotlib，交互 vs 静态出版的分叉
- [[pandas]] —— plotnine 第一个参数就是 DataFrame
- [[matplotlib]] —— plotnine 的渲染后端；`draw()` 交出的就是它的 Figure
- [[seaborn]] —— 同属 Python 统计绘图，API 更"函数式快捷方式"而非 GoG 图层叠加
- [[plotly-py]] —— 交互/仪表盘路线，和 plotnine 的论文静态输出互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
