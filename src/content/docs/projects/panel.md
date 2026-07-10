---
title: Panel — 多绘图后端的 Python dashboard
来源: 'https://github.com/holoviz/panel'
日期: 2026-06-01
分类: projects / 数据可视化
难度: 入门
---

## 是什么

Panel 是 Anaconda 公司 Philipp Rudiger 等人 2018 年发起、2019 年公开发布、2023 年 6 月发布 1.0 GA 的开源 Python dashboard 库，属于 HoloViz 生态（同家族还有 [[bokeh]]、HoloViews、Datashader）。日常类比：像一个万能转接头——你手里随便哪种 Python 绘图（Bokeh、Plotly、matplotlib、Altair / Vega、Folium、pydeck），它都能套上一层"反应式外壳"，配上滑块和下拉框，再让你一键变成可分享 URL 的 Web 应用。

最小例子：

```python
import panel as pn
import numpy as np
import matplotlib.pyplot as plt

pn.extension()

freq = pn.widgets.FloatSlider(name="频率", start=0.1, end=5, value=1)

def plot(f):
    fig, ax = plt.subplots()
    x = np.linspace(0, 10, 200)
    ax.plot(x, np.sin(f * x))
    return fig

app = pn.Column(freq, pn.bind(plot, freq))
app.servable()
```

存为 `app.py`，命令行 `panel serve app.py --autoreload`，浏览器打开 `http://localhost:5006/app`。**没写一行 HTML / CSS / JS / 回调注册**，就有了一个滑块改变频率、正弦图实时重绘的应用，并且**只重画图、其它部分不刷新**——这是与 [[streamlit]] 整段重跑模型最大的差别。

## 为什么重要

不理解 Panel，下面这些事都没法解释：

- 为什么数据团队明明已经用了 [[streamlit]] 还要再装 Panel——前者每次交互整段脚本重跑，Panel 是细粒度反应式，重计算成本高的场景不被罚
- 为什么 [[dash]] 用户会迁移过来——Dash 只能用 Plotly 一种后端，Panel 同份代码里能混 [[bokeh]] / matplotlib / Plotly / [[altair]]
- 为什么 Jupyter 重度用户特别认它——同一个 Panel 对象在 notebook 单元格里直接渲染，部署到 server 时无需改一行
- 为什么 PyData 大会演讲里 Panel 越来越多——它是"探索性 notebook"和"生产 web 应用"中间那条少有人走的中间路线

## 核心要点

Panel 的设计哲学是**反应式编程**（reactive）：每个控件是一个 [Param](https://param.holoviz.org/) 对象（Param 是 HoloViz 自家做的"带类型 + 自带变更通知"的属性系统，可以理解成 Python 版的 observable 字段），UI 自动追踪"谁依赖了谁"，只重算被影响的那段。理解四个原语就能搭出大多数应用：

1. **Pane**：把一个可视对象包成可显示组件。`pn.pane.Matplotlib(fig)` / `pn.pane.Plotly(go_fig)` / `pn.pane.Vega(spec)` / `pn.pane.DataFrame(df)`——任何对象只要有 `_repr_html_` 或是 Bokeh model 都能成 Pane。

2. **Widget**：交互控件。`pn.widgets.IntSlider` / `Select` / `TextInput` / `FileInput` / `DatetimeRangePicker` 等三十多个，每个的 `value` 都是 Param Parameter，能被 `watch` 也能被 `bind`。

3. **Layout**：`pn.Row` / `pn.Column` / `pn.Tabs` / `pn.GridSpec` / `pn.FlexBox` 把 Pane 和 Widget 拼成 app；都接受任意 Python 对象，自动包成 Pane。

4. **bind / depends**：`pn.bind(fn, w1, w2)` 让 fn 自动随 widget 重算，返回一个反应式对象塞进 Layout 即可；`@param.depends("w.value", watch=True)` 是另一套等价写法，绑到方法上。

底层架构：Panel 复用 [[bokeh]] 的 BokehJS 协议——Tornado 起 HTTP + WebSocket，前端是 Bokeh 的 React-less JS，控件值变了发一条 protocol 消息回 server，server 算出"哪些 model 变了"再推回前端，前端只 patch 改变的部分。这就是为什么"细粒度反应式"是免费的。

## 实践案例

### 案例 1：DataFrame 探索器，三种图共存

```python
import panel as pn, pandas as pd, plotly.express as px
pn.extension("plotly", "vega")

df = pd.read_csv("sales.csv")

dim = pn.widgets.Select(name="维度", options=list(df.columns))
metric = pn.widgets.Select(name="指标", options=["count", "sum", "mean"])

def plotly_view(d, m):
    g = df.groupby(d).size().reset_index(name=m)
    return px.bar(g, x=d, y=m)

def vega_view(d, m):
    g = df.groupby(d).size().reset_index(name=m).to_dict("records")
    return {"data": {"values": g}, "mark": "line",
            "encoding": {"x": {"field": d}, "y": {"field": m}}}

app = pn.Tabs(
    ("Plotly", pn.bind(plotly_view, dim, metric)),
    ("Vega", pn.bind(vega_view, dim, metric)),
)
pn.Column(dim, metric, app).servable()
```

同一份数据，左 tab 用 Plotly 出柱图、右 tab 用 [[vega-lite]] spec 出折线图——上层不改，绘图后端可换。

### 案例 2：模板让原型有生产气息

```python
template = pn.template.FastListTemplate(
    title="销售看板",
    sidebar=[dim, metric, pn.widgets.DatetimeRangePicker(name="日期")],
    main=[pn.bind(plotly_view, dim, metric)],
    accent="#0f766e",
)
template.servable()
```

逐步读：

1. `FastListTemplate` 来自 Microsoft FAST，自带 navbar / sidebar / 暗色模式
2. `sidebar=[...]` 把筛选控件放左边；`main=[...]` 把图放主区
3. `accent="#0f766e"` 只改主题色变量，不用手写 CSS
4. 仍调用 `.servable()`，`panel serve` 后就是带壳的看板

原型不用让设计师再贴一次皮就能给老板演示。

### 案例 3：notebook 直出，serve 直接跑

```python
# 在 .ipynb 单元格里：
pn.extension()
slider = pn.widgets.IntSlider(value=5, start=0, end=20)
pn.Column(slider, pn.bind(lambda v: f"平方={v*v}", slider))
```

单元格直接显示交互控件——这是 ipywidgets 也能做的；但把同一个文件命名成 `.py` 加 `.servable()` 然后 `panel serve` 立刻就是 standalone 应用，**不改一行**。这种"notebook 即应用"是 Panel 区别于 [[dash]] 的核心体验。

## 踩过的坑

1. **panel serve 启动慢**：每次 `panel serve` 都要重新加载所有 import，开发期一定加 `--autoreload`，否则改一行重启十秒。生产部署用 `--num-procs N` 多进程跑，单进程吞吐有限。

2. **matplotlib pane 不会自动 redraw**：返回新 Figure 没问题；但若直接修改 axes 内容，要传 `pn.pane.Matplotlib(fig, tight=True)` 并显式 `pane.param.trigger("object")`，否则界面不更新。

3. **Plotly hover 偶尔双触发**：Plotly 自己的 hover 事件和 Panel 的 `watcher` 都会响应，复杂场景要么禁掉 Plotly 的 hovermode，要么用 `pn.bind` 而不是 `watch` 保证同一事件链路。

4. **Param 的 `watch_dependency` 与 `pn.bind` 两套写法**：前者面向类、把方法绑到属性变化；后者面向函数、声明依赖。新手容易混着写导致依赖图乱。建议小应用统一用 `pn.bind`。

5. **session 隔离薄**：`panel serve` 每个用户连接是独立 session，但全局变量是进程共享——一个用户改了某个全局 DataFrame 其他人也看到。要做用户隔离用 `pn.state.cache` 按 `pn.state.session_id` 分桶。

## 适用 vs 不适用场景

**适用**：

- 数据科学家想把 notebook 一键变内部工具——同一份代码两种使用方式
- 同一份 dashboard 要混用多种绘图库（Plotly 3D + Bokeh 时序 + matplotlib ML 评估图）
- 想要细粒度反应式（重计算成本高）但又不想跳到 [[dash]] 的回调地狱
- 配合 Datashader 处理千万级点的交互可视化——HoloViz 生态里最顺

**不适用**：

- 给非技术同事做"15 分钟 demo"——[[streamlit]] 的脚本式心智模型门槛更低
- 纯静态报告——用 Quarto / Jupyter Book 更轻量
- 复杂前端交互（拖拽编辑器 / 多页路由 / 表单校验）——还是上真前端
- 团队共享有状态后端（用户隔离、权限、长连接）——Panel 不替你管，要外接

## 历史小故事（可跳过）

- **2018**：Philipp Rudiger 在 Anaconda / HoloViz 里发起 Panel，目标是"notebook 里的图一键变 Web 应用"
- **2019**：公开发布，和 [[bokeh]]、HoloViews、Datashader 绑成同一生态
- **2023 年 6 月**：发布 1.0 GA，API 稳定承诺落地，PyData 演讲明显增多
- **之后**：`panel convert` 走向 Pyodide / WASM 静态部署，探索性分析和可分享站点之间的缝更窄

## 学到什么

1. **反应式 vs 整段重跑是 dashboard 框架的两条主路**：Panel 选反应式得到了"重计算只发生在被影响的地方"，代价是依赖追踪心智成本；[[streamlit]] 选整段重跑换来了"无回调即写应用"的极简但每次全量重算
2. **复用现有协议比造轮子省力**：Panel 没有自己的前端，直接吃 [[bokeh]] 的 WebSocket 协议——发布日就有了能跑十几年的成熟 transport 层
3. **同一对象多场景渲染是 notebook 工作流的关键**：同一个 `pn.Column` 在 IPython 富显示协议里是 widget，在 server 进程里是 servable 应用，在 `panel convert` 后是离线 WASM——一份对象三种部署
4. **生态绑定的力量**：Panel 自己只做 dashboard 一层，但能直通 HoloViews 的高层语法、Datashader 的大数据渲染、Param 的反应式核心——选 Panel 等于选了一整套 HoloViz 栈

## 延伸阅读

- 官方文档：[Panel Docs](https://panel.holoviz.org/)（含 100+ Gallery 案例）
- Panel 1.0 发布博客：[Panel 1.0 Release](https://blog.holoviz.org/posts/panel_release_1.0/)（讲清楚为什么有 1.0）
- 社区案例集：[awesome-panel](https://awesome-panel.org/)
- WASM 部署教程：`panel convert app.py --to pyodide-worker`，把 Panel 应用打成纯静态站点
- [[bokeh]] —— Panel 底层依赖的绘图与 server 协议
- [[streamlit]] —— 同生态对照，整段重跑模型

## 关联

- [[bokeh]] —— Panel 的 transport 层与默认绘图后端
- [[streamlit]] —— 反应式 vs 整段重跑的另一极
- [[dash]] —— 同样反应式但只支持 Plotly 一种后端
- [[altair]] —— Panel 通过 `pn.pane.Vega` 直接吃 Vega-Lite spec
- [[plotly-js]] —— Panel 内置 Plotly pane
- [[gradio]] —— ML demo 场景的同代竞品

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
