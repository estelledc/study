---
title: Altair — Python 上的 Vega-Lite 绑定
来源: 'https://github.com/vega/altair'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 入门到中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vega/altair
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a9765713566095349cb1cfbbe85d6ad258c84245
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.2.2
---

## 是什么

Altair 是一份把 Vega-Lite JSON spec 写成 Python 链式 API 的声明式可视化库。日常类比：像点单——你勾选“用什么图形 + 哪一列接哪个轴 + 用什么颜色分组”，Altair 把这单子编译成 Vega-Lite 对象；真正画图的是浏览器里的 Vega-Lite runtime，不是 Python。

固定 `6.2.2` 的公开入口从 `altair.vegalite.v6` 再导出。`SCHEMA_VERSION` 是 `v6.4.1`，`VEGA_VERSION` 是 `6`，`VEGAEMBED_VERSION` 是 `7`。硬依赖是 `jinja2` / `jsonschema` / `packaging` / `narwhals`；`pandas` 只在 `all` extra 里，不是装包就能画图的前提。

```python
import altair as alt

chart = (
    alt.Chart({"values": [{"a": "A", "b": 28}, {"a": "B", "b": 55}]})
    .mark_bar()
    .encode(x="a:N", y="b:Q")
)
spec = chart.to_dict()
```

这条链只构造 `Chart` 对象：`Chart(...)` 填 `data`，`mark_bar()` 选 mark，`encode` 填 encoding。`to_dict()` 默认吐 Vega-Lite JSON；`format="vega"` 才走编译插件（默认要 `vl-convert-python`）。

## 为什么重要

不理解 Altair 的“Python 只写 spec”，下面这些事会对不上：

- 为什么 Notebook / Streamlit 接的是 `to_dict()`，而不是一张 PNG
- 为什么交互（刷选、缩放）写在 spec 的 `params` 里，Python 进程不参与运行时事件
- 为什么超 5000 行会在**序列化数据**时炸，而不是在 Vega-Lite 里炸
- 为什么 6.x 页不能再按 Altair 5 / Vega-Lite 5 的旧教程推理

## 核心要点

固定版本可以拆成四层：

1. **Chart / mark / encode 映射 Vega-Lite 字段**：`mark_*` 对应 `arc` / `area` / `bar` / `circle` / `geoshape` / `image` / `line` / `point` / `rule` / `rect` / `square` / `text` / `tick` / `trail` 以及 `boxplot` / `errorband` / `errorbar`。`encode()` 把通道写进 `FacetedEncoding`。

2. **shorthand 解析在 Python 侧**：`parse_shorthand("b:Q")` 得到 `{field, type: quantitative}`。`:N/:O/:Q/:T` 分别是 nominal / ordinal / quantitative / temporal。只写 `"name"` 且没有 DataFrame 时，结果只有 `field`，**不会**自动标 nominal；有 DataFrame 时才按列 dtype 推断。

3. **复合与参数**：`+` 走 `layer`，`&` 走 `vconcat`，`|` 走 `hconcat`（左侧已是 `ConcatChart` 时改走 `concat`）。`interactive()` 不是魔法方法，它调用 `add_params(selection_interval(..., bind="scales", encodings=["x","y"]))`。`add_selection` 自 5.0.0 起弃用。

4. **数据变压器**：默认 `default` 会 `limit_rows(..., max_rows=5000)`，超限抛 `MaxRowsError`，文案推荐 `alt.data_transformers.enable("vegafusion")`。同版本还注册了 `json`、`csv`、`vegafusion`。

`encode()` 会深拷贝已有 encoding 再 `update`：链式第二次调用是**合并通道**，只有同名通道被后写覆盖。同一个调用里写两个 `color=` 是 Python 关键字参数语法问题，到不了 Altair。

## 实践示例

### 案例 1：从行数据到可缩放散点

```python
import altair as alt

rows = [
    {"Horsepower": 130, "Miles_per_Gallon": 18, "Origin": "USA"},
    {"Horsepower": 85, "Miles_per_Gallon": 27, "Origin": "Japan"},
]
chart = (
    alt.Chart(rows)
    .mark_circle()
    .encode(
        x="Horsepower:Q",
        y="Miles_per_Gallon:Q",
        color="Origin:N",
        tooltip=["Origin"],
    )
    .interactive()
)
```

**逐部分**：行列表经默认变压器变成 inline values；`:Q/:N` 避免无 DataFrame 时缺 type；`.interactive()` 往 `params` 加一条 bind-to-scales 的 interval selection。本轮未在 Notebook 里渲染。

### 案例 2：transform 顺序进入 spec 数组

```python
(
    alt.Chart(rows)
    .mark_line()
    .transform_filter("datum.Origin == 'USA'")
    .transform_aggregate(mean_mpg="mean(Miles_per_Gallon)", groupby=["Origin"])
    .encode(x="Origin:N", y="mean_mpg:Q")
)
```

`transform_*` 按调用顺序追加到 spec 的 `transform` 数组。filter 写在 aggregate 前面，编译结果也是这个顺序。

### 案例 3：导出 spec 与文件

```python
chart.to_dict()            # Vega-Lite dict；validate 默认 True
chart.to_dict(format="vega")  # 需活动 compiler 插件
chart.save("c.html")       # 后缀决定 format
```

`save()` 支持 `html` / `png` / `svg` / `pdf` / `json` / `vega`。非 vegafusion 路径会临时切回 default 并关掉行数上限，好让 vl-convert 读到内嵌数据。HTML 默认模板从 `cdn.jsdelivr.net/npm` 拉运行时；`inline=True` 才把 JS 嵌进文件。

## 踩过的坑

1. **把 Altair 5 教程直接当 6.2.2**：固定源码只导出 v6 schema，MIME 是 `application/vnd.vegalite.v6.json`。旧的 `alt.themes` 在 5.5.0 起弃用，应走 `alt.theme`。

2. **以为没写 `:Q` 就一定按 nominal**：没有数据时 shorthand 根本不写 type；有 DataFrame 时按列推断。猜错图，先看 spec 里有没有 `type`。

3. **把链式 encode 写成整表覆盖**：第二次 `.encode(tooltip=...)` 会留下第一次的 `x`/`y`。要覆盖某个通道，再写一次同名关键字即可。

4. **5000 行是默认变压器的上限**：`MaxRowsError` 在 `limit_rows` 里抛。修法包括 `disable_max_rows()`、换 `json`/`csv` URL、或 extra 里的 `vegafusion`（该变压器默认 `max_rows=100000`，本轮未执行）。

5. **`save("x.html")` 默认要 CDN**：离线场景用 `inline=True`，或自己托管 Vega / Vega-Lite / vega-embed。

## 适用 vs 不适用场景

**适用**：

- 希望一份 spec 同时服务 Notebook、静态 HTML 和前端 Vega-Lite runtime
- 交互可以全部写进 selection / parameter，不需要 Python 常驻进程
- Python `>=3.10`，并能接受声明式通道而不是命令式 artist

**不适用**：

- 需要 Python 回调改数据再推前端——那是 Bokeh Server 的合同，不是 Altair
- 必须完全离线且不能内嵌 JS / 自托管 runtime
- 要把未实测的渲染帧率、LLM 出图成功率写成选型结论
- 3D 或百万行浏览器实时绘制——固定源码没有这类保证

## 固定版本边界

- 本文绑定 `vega/altair@a9765713566095349cb1cfbbe85d6ad258c84245`，annotated tag `v6.2.2`，与 PyPI `altair==6.2.2` 同号。
- schema `v6.4.1`；Vega 6 / vega-embed 7。
- `requires-python >=3.10`；pandas 不是硬依赖。
- `add_selection` 已弃用，交互参数走 `add_params`。
- 本文未安装依赖、未渲染、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **声明式画图的交付物是 spec**——Python 链的价值是可序列化，不是画布句柄。
2. **type 简写是编译期合同**——缺后缀时要么推断，要么把问题留给 Vega-Lite。
3. **行数上限属于变压器**——换 transformer 就换上限，不是 Vega-Lite 本身的硬顶。
4. **交互可以完全离开 Python**——`selection_interval(bind="scales")` 由前端解释。

## 应用型自测

1. `.interactive()` 在固定源码里新增的是 mark，还是一条 selection parameter？
2. `.encode(x="a:Q").encode(color="b:N")` 之后，`x` 通道还在吗？
3. 默认变压器遇到 5001 行时，抛错的是 Vega-Lite 运行时，还是 Altair 的 `limit_rows`？

检查点：

1. 后者。它调用 `add_params(selection_interval(..., bind="scales"))`。
2. 还在。`encode()` 合并通道，只覆盖同名 key。
3. Altair 的 `limit_rows` 在序列化数据时抛 `MaxRowsError`。

## 延伸阅读

- 文档：[Altair User Guide](https://altair-viz.github.io/)
- 固定源码：[vega/altair](https://github.com/vega/altair) —— 本文绑定提交 `a9765713566095349cb1cfbbe85d6ad258c84245`
- [[vega-lite]] —— Altair 的编译目标
- [[bokeh]] —— 同主题对照：Python 模型树 + Server 回调

## 关联

- [[vega-lite]] —— spec 字段与 Chart / mark / encode / transform 对应
- [[vega]] —— Vega-Lite 再编译成 Vega
- [[bokeh]] —— 需要 Python 常驻回调时的另一条路
- [[plotly-js]] —— 命令式 + JSON 混合的对照
- [[d3]] —— 要完全自定义渲染时退回的底层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/vega-lite]] —— Vega-Lite — 用 JSON 三段式画复合图
- [[bokeh]] —— Bokeh — 浏览器端交互式 Python 图，可挂 Server 做实时数据流
- [[holoviews]] —— HoloViews — 一份声明 ⇄ 多后端自动绘图
- [[matplotlib]] —— matplotlib — Python 绘图基石
- [[projects/panel]] —— Panel — 多绘图后端的 Python dashboard
- [[plotly-py]] —— Plotly.py — DataFrame 一行变交互图表
- [[plotnine]] —— plotnine — Python 复刻 R 的 ggplot2
- [[seaborn]] —— seaborn — matplotlib 之上的一行统计图
- [[streamlit]] —— Streamlit — Python 几行写 Web 应用
- [[projects/vega-lite]] —— Vega-Lite — 高层声明式可视化语法
