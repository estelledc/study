---
title: Altair — Python 上的 Vega-Lite 绑定
来源: 'https://github.com/vega/altair'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 入门到中级
---

## 是什么

Altair 是 Jake Vanderplas 等人 2016 年发起、由 University of Washington Interactive Data Lab 维护的 Python 可视化库。日常类比：像点单——你勾选"用什么图形 + 哪一列接哪个轴 + 用什么颜色分组"三栏，Altair 把这单子翻译成一份 [[vega-lite]] JSON，浏览器照单画图。

最小例子：

```python
import altair as alt
import pandas as pd

df = pd.DataFrame({"a": ["A", "B", "C"], "b": [28, 55, 43]})

chart = (
    alt.Chart(df)
    .mark_bar()
    .encode(x="a:N", y="b:Q")
)
```

这条链做了三件事：

- `Chart(df)`：把数据塞进 spec 的 `data` 槽位
- `mark_bar()`：选择 `mark = "bar"`
- `encode(x=..., y=...)`：填 `encoding` 槽位，`:N` / `:Q` 是简写后缀，分别表示 nominal（类别）/ quantitative（数值）

整个链没有任何"画"的动作——`chart` 只是一个 Python 对象，背后存的是 Vega-Lite spec。Jupyter / VS Code Notebook / JupyterLab 内置 Vega-Lite 渲染器，所以执行后**即所见即所得**。

## 为什么重要

不理解 Altair，下面这些事都没法解释：

- 为什么 Python 数据科学界把"画交互图"和"输出 PNG"拆成了两条路线——matplotlib 走后者，Altair / [[plotly-js]] 走前者
- 为什么 Streamlit 直接 `st.altair_chart(chart)` 就能在 Web 上画图——它接受的就是 Altair 对象的 `to_dict()` JSON
- 为什么 LLM 写"画一个 X vs Y 的散点图"在 Python 里出图越来越稳——大模型生成 Altair 链 / Vega-Lite JSON 都比生成 matplotlib 命令式调用稳
- 为什么 ggplot2 用户从 R 转 Python 不抱怨——Altair 是 PyData 圈最贴近 grammar of graphics 的实现

## 核心要点

Altair 的 API 三件套和 Vega-Lite 三段一一对应：

1. **Chart / mark_xxx**：选数据源、选图形原语（bar / line / point / area / rect / text 等十几种）
2. **encode**：哪一列接到哪个视觉通道（x / y / color / size / shape / opacity / tooltip）
3. **transform_xxx**：画之前怎么处理数据（filter / aggregate / bin / window / calculate）

复合算子也一一对应：

- `alt.layer(a, b)` 或 `a + b`：多图叠在同一坐标系
- `alt.hconcat(a, b)` / `alt.vconcat(a, b)` 或 `a | b` / `a & b`：横竖拼面板
- `alt.Chart(...).facet(column="...")`：按一列分组自动复制图（small multiples）
- `chart.repeat(row=[...], column=[...])`：对一组列做笛卡尔积生成网格（散点矩阵）

交互联动靠 **selection**：`alt.selection_interval()` / `alt.selection_point()` 配合 `add_params` 把 brush / click 行为也写进 spec，渲染端解释执行——Python 进程不参与运行时交互。

写法上的关键约定：

- `type` 必须显式：`a:N` / `a:O` / `a:Q` / `a:T`（nominal / ordinal / quantitative / temporal），猜错图就画错
- 列名拼写错只会画空图**不报错**——pandas 列名陷阱
- 默认嵌入数据上限 5000 行，超出抛 `MaxRowsError`，要 `alt.data_transformers.disable_max_rows()` 或换走 URL

## 实践案例

### 案例 1：从 DataFrame 到一张交互散点图

```python
import altair as alt
from vega_datasets import data

cars = data.cars()

(
    alt.Chart(cars)
    .mark_circle()
    .encode(
        x="Horsepower:Q",
        y="Miles_per_Gallon:Q",
        color="Origin:N",
        tooltip=["Name", "Year", "Origin"],
    )
    .interactive()
)
```

`.interactive()` 一行加了平移 + 缩放（生成 `selection_interval` bind 到 x/y 轴）。整张图在 Jupyter 里直接渲染，鼠标可拖可缩，悬停出 tooltip——全部走 Vega-Lite spec，Python 不参与。

### 案例 2：transform 链 + facet 做小多图

```python
(
    alt.Chart(cars)
    .mark_line()
    .transform_filter("datum.Origin == 'USA' || datum.Origin == 'Japan'")
    .transform_aggregate(mean_mpg="mean(Miles_per_Gallon)", groupby=["Year", "Origin"])
    .encode(x="Year:T", y="mean_mpg:Q", color="Origin:N")
    .facet(column="Origin:N")
)
```

整条链编译成 Vega-Lite spec 时，`transform` 数组按声明顺序展开——filter 在前、aggregate 在后。facet 让两个国家各占一格。

### 案例 3：脱离 Python 拿到底层 spec

```python
chart.to_dict()       # 拿到 Vega-Lite JSON dict
chart.to_json()       # 序列化好的 JSON 字符串
chart.save("c.html")  # 嵌 Vega-Lite runtime 的离线 HTML
```

拿到 JSON 后可以直接喂给前端 [[vega-lite]] runtime、Streamlit、Observable，或者贴进任何支持 Vega-Lite 的渲染容器——这是 Altair 比 matplotlib 更"可移植"的根本原因。

## 踩过的坑

1. **type 简写后缀必填**：`encode(x="a")` 不报错，但默认按 nominal 处理；数值列写成 `:N` 会被当类别画柱状图。养成 `:Q` / `:N` / `:O` / `:T` 四选一的肌肉记忆。

2. **5000 行限制是 Altair 的，不是 Vega-Lite 的**：默认 spec 把数据**内嵌**进 JSON，超 5000 行直接 `MaxRowsError`。三种修法：`alt.data_transformers.disable_max_rows()` 强行嵌、`alt.data_transformers.enable("json")` 落本地文件再 URL 引、或事先 aggregate 到小数据。

3. **encode 同名 channel 静默覆盖**：同一个 `encode` 里写两个 `color=...` 后者覆盖前者**不警告**。链式调多个 `.encode()` 也是覆盖语义，不是合并。

4. **save("chart.html") 默认嵌 runtime**：生成的 HTML 通过 CDN 拉 Vega-Lite JS；离线场景要 `embed_options={"actions": False}` + 自己托管 runtime。

5. **错误信息在浏览器端**：spec 编译错（比如字段不存在）Altair 不报，渲染时浏览器 console 才有提示——Notebook 里看不到 console，要 F12 打开开发者工具。

## 适用 vs 不适用场景

**适用**：

- Jupyter / Colab 里做探索性数据分析（EDA），又希望图能交互
- 把 Python 分析结果嵌入网页 / 文档，不想拖一份 matplotlib PNG
- 需要 small multiples / facet / 联动 brush 的复合图——一份 spec 描完
- 想让 LLM 生成图——LLM 输出 Vega-Lite JSON 比输出 matplotlib 命令式代码稳

**不适用**：

- 百万行级实时渲染——Vega-Lite 浏览器端会卡，应转 datashader / holoviews / deck.gl
- 期刊 Figure 1 级精排版——matplotlib + LaTeX 仍是首选
- 3D 图——Vega-Lite 不支持，要转 plotly / pyvista
- 完全离线无浏览器场景——Vega-Lite 依赖 SVG / Canvas，命令行进程跑不动

## 历史小故事（可跳过）

- 2016 年前后：Altair 从 Python 数据科学社区里长出来，目标是把 Vega-Lite 的声明式图形语法搬进 Notebook。
- 2017-2019 年：JupyterLab / Notebook 对 Vega-Lite 渲染越来越顺，Altair 成了 PyData 里“轻量交互图”的常用选择。
- 2020 年后：Streamlit、Observable、前端文档站都能吃 Vega-Lite spec，Altair 的 `to_dict()` 变成跨环境接口。
- 2023 年后：Altair 5 跟进 Vega-Lite 5，选择、参数和交互写法更统一。

## 学到什么

1. **声明式 vs 命令式画图差一代抽象**：Altair 让你说"要什么"，matplotlib 让你说"怎么画"——前者把"图能不能换数据 / 加交互 / 嵌网页"全免费送
2. **同一份 spec 跨语言** ：Python 链生成的 Vega-Lite JSON，前端、R、Julia 任何语言都能渲染——可移植性来自把渲染逻辑外包给标准
3. **API 一一对应底层 IR 的好处**：Altair 的 Chart / mark / encode / transform / layer / concat / facet 全都直接映射 Vega-Lite 字段，学一遍 API 等于学了 IR

## 延伸阅读

- 官方教程：[Altair Tutorial Notebooks](https://altair-viz.github.io/getting_started/overview.html)
- 案例库：[Altair Example Gallery](https://altair-viz.github.io/gallery/index.html)（按图类型索引，配 spec 源码）
- 对比文章：[Altair vs ggplot2 vs matplotlib](https://altair-viz.github.io/getting_started/overview.html#why-altair)
- [[vega-lite]] —— Altair 的编译目标，必读
- [[vega]] —— 更底层的运行时 IR
- [[plotly-js]] —— PyData 圈另一条交互路线，命令式 + JSON 混合
- [[d3]] —— 想要完全自定义渲染时退回的底层

## 关联

- [[vega-lite]] —— Altair 是它的 Python 绑定，spec 字段一一对应
- [[vega]] —— Vega-Lite 编译成 Vega，Vega 再编译成 SVG / Canvas
- [[d3]] —— Vega 底层用 D3 selection 做绑定 + 过渡
- [[plotly-js]] —— 同代际竞品，PyData 里另一选择
- [[jupyter-notebook]] —— Altair 默认渲染容器，内置 Vega-Lite runtime

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
