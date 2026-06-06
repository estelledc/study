---
title: Dash — Plotly 的 Python 仪表板框架
来源: 'https://github.com/plotly/dash'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

Dash 是 Plotly Inc.（蒙特利尔）2017 年 6 月开源的 Python 仪表板框架，MIT License，至今仍由 Plotly 主导开发，官方还出商业版 Dash Enterprise。日常类比：像把一份 Jupyter 分析脚本钉到一面墙上，墙上多了几个旋钮和下拉框，每次旋钮一动，墙上的图就自己跟着变——而你只写了"哪个旋钮接哪张图"的连线表，没动一行 HTML / JS。

最小例子：

```python
from dash import Dash, dcc, html, Input, Output
import plotly.express as px
import pandas as pd

df = pd.DataFrame({"x": range(10), "y": [i*i for i in range(10)]})
app = Dash(__name__)

app.layout = html.Div([
    dcc.Slider(1, 10, 1, value=5, id="k"),
    dcc.Graph(id="g"),
])

@app.callback(Output("g", "figure"), Input("k", "value"))
def redraw(k):
    return px.line(df.head(k), x="x", y="y")

app.run(debug=True)
```

存为 `app.py`，命令行 `python app.py`，浏览器开 `http://127.0.0.1:8050`，拖一下 slider 图就重画。**没写一行 HTML / CSS / JS / Flask 路由 / WebSocket**，但比 [[streamlit]] 多了一层"显式连线"。

## 为什么重要

不理解 Dash，下面这些事都没法解释：

- 为什么金融 / 医药 / 工业仪表团队偏向 Dash 而不是 [[streamlit]]——反应式回调让大型应用的状态流可被审计
- 为什么很多公司把 Tableau / PowerBI 替换成 Dash——一份 Python 代码就能拼出可定制 BI，免许可证
- 为什么 Plotly 公司能靠 Dash Enterprise 商业化——auth / 部署 / Job Queue / Snapshot 这些"企业要的脏活"包成订阅
- 为什么 Dash 应用在科学论文配图越来越多——`dcc.Graph` 直接吃 Plotly Figure，交互式 3D / 曲面图开箱即用

## 核心要点

Dash 的设计哲学是**反应式回调**（reactive callbacks）：你**显式声明**"哪个组件的哪个属性变化时，重算哪个组件的哪个属性"，框架替你建依赖图、按拓扑排序触发。理解这一点，整套 API 都顺：

1. **布局**：`app.layout` 是一棵组件树，节点全是 Python 对象。`html.Div` / `html.H1` 对应 HTML 标签，`dcc.Graph` / `dcc.Slider` / `dcc.Dropdown` / `dcc.DatePickerRange` 是高级控件，`dash_table.DataTable` 是可编辑表格。

2. **回调**：`@app.callback(Output(...), Input(...), State(...))` 装饰一个普通 Python 函数。`Input` 触发回调，`State` 只读不触发。一个回调可同时返回多个 Output，多个回调可共写一个 Output（用 `allow_duplicate=True`）。

3. **`dcc.Store`**：把任意 JSON 状态藏在浏览器里（memory / session / local），跨回调共享但不走全局变量——Dash 默认无服务端 session，多 worker 部署也安全。

4. **样式**：默认空白布局丑，社区方案 `dash-bootstrap-components` 套 Bootstrap、`dash-mantine-components` 套 Mantine，类似 React 生态的 UI 库。

5. **多页应用**：`pages/` 目录下放 `.py`，每个文件 `dash.register_page(__name__, path="/foo")` 自动登记到路由——和 Next.js 的文件路由神似。

底层架构：Flask 起 HTTP server，前端是 React + Redux 应用，每次回调走 `POST /_dash-update-component`，server 端运行 Python 函数返回新的属性 JSON，前端 diff 后局部更新。所以"反应式"是请求-响应模型，不是 WebSocket 推送。

## 实践案例

### 案例 1：双控件联动一张图

```python
@app.callback(
    Output("chart", "figure"),
    Input("country", "value"),
    Input("year-range", "value"),
)
def update(country, years):
    sub = df[(df.country == country) & df.year.between(*years)]
    return px.line(sub, x="year", y="gdp")
```

下拉选国家 / 滑双端选年份范围 → 图自动重画。Dash 看到两个 `Input` 都依赖这个回调，任意一个变就重跑——比手动写 `onChange` 短得多。

### 案例 2：用 dcc.Store 在回调间传状态

```python
app.layout = html.Div([
    dcc.Store(id="filtered-df"),
    dcc.Dropdown(id="picker", options=[...]),
    dcc.Graph(id="g1"),
    dcc.Graph(id="g2"),
])

@app.callback(Output("filtered-df", "data"), Input("picker", "value"))
def filter_data(v):
    return df[df.cat == v].to_dict("records")

@app.callback(Output("g1", "figure"), Input("filtered-df", "data"))
def draw1(data):
    return px.histogram(pd.DataFrame(data), x="age")

@app.callback(Output("g2", "figure"), Input("filtered-df", "data"))
def draw2(data):
    return px.box(pd.DataFrame(data), y="income")
```

第一回调过滤数据写入 Store，两个画图回调都监听 Store。**过滤只跑一次**，两张图同时更新，依赖图自动展开成菱形——这是 Dash 比 [[streamlit]] "整段重跑"省算力的关键。

### 案例 3：Dash Bootstrap + DataTable 一体化

```python
import dash_bootstrap_components as dbc
from dash import dash_table

app = Dash(__name__, external_stylesheets=[dbc.themes.BOOTSTRAP])

app.layout = dbc.Container([
    dbc.Row([
        dbc.Col(dcc.Dropdown(id="d", options=[...]), width=4),
        dbc.Col(dcc.Graph(id="g"), width=8),
    ]),
    dash_table.DataTable(
        id="t", page_size=20, sort_action="native", filter_action="native"
    ),
])
```

栅格布局 / Bootstrap 主题 / 可排序可筛选表格——三段拼起来就是一份"看起来像产品"的内部报表，比 [[streamlit]] 默认主题视觉门面更高。

## 踩过的坑

1. **回调依赖图不能成环**：A 的输出是 B 的输入、B 的输出又是 A 的输入会启动时报 `CycleError`。要打破环，用 `State` 替换其中一边的 `Input`，或把共享状态搬进 `dcc.Store`。

2. **同一 Output 默认只能由一个回调写**：想在不同情境改同一个 figure，必须显式 `allow_duplicate=True` + 指定 `prevent_initial_call="initial_duplicate"`，否则报 `DuplicateCallback`。

3. **回调函数必须是纯函数**：Dash 不保证哪个 worker 跑你的回调，函数里读全局可变状态在多进程部署（gunicorn -w 4）下会读到不一致的值——状态全部经 `dcc.Store` 走客户端。

4. **`dcc.Graph` 的 figure 大对象很沉**：每次回调把整个 Plotly Figure JSON（动辄几 MB）回传前端，慢且费带宽。优化：用 `extendData` / `Patch` 增量更新只补新点，不重传全图。

5. **debug=True 的热重载会吃状态**：开发时改一行代码触发重载，所有 `dcc.Store` / 浏览器表单状态被清空。养成"先点刷新再演示"的肌肉记忆，否则 demo 时显示空白。

6. **Dash 的回调签名是位置参数**：`Input("a", "value"), Input("b", "value")` 顺序对应函数 `def f(a, b)`。新人常写错顺序，运行时不报错但图错了——3.0 引入 `Input(...)+kwargs` 写法稍缓解。

## 适用 vs 不适用场景

**适用**：

- 内部 BI / 科学仪表板：自由布局、企业部署、可审计的状态流
- 需要复杂联动的探索界面：4+ 控件互相影响多张图，反应式比"整段重跑"清晰
- 团队里有 React 经验：Dash 的组件 / 属性 / 回调心智模型几乎是 React 的 Python 翻译

**不适用**：

- 极简 demo / 一次性脚本：3 个控件 1 张图直接写 [[streamlit]]，10 行 vs Dash 30 行
- 需要复杂 LLM 对话 UI：Dash 没有原生 chat 控件，要自己拼；[[gradio]] 或 [[streamlit]] 更直接
- 需要响应速度毫秒级：每次交互一次 HTTP roundtrip，比纯前端慢；这种场景上 [[react]] + [[plotly-js]]
- 企业要 Snapshot / SSO / Job Queue：开源 Dash 不带，要么买 Dash Enterprise 要么自己拼 [[flask]] + Celery + Auth0

## 历史小故事（可跳过）

- **2013 年**：Plotly 创始人 Alex Johnson / Jack Parmer / Chris Parmer 在蒙特利尔做在线绘图 SaaS，主打 Plotly.js
- **2017 年 6 月**：Chris Parmer 主导，把 Flask 后端 + React + Plotly.js + Python 装饰器拼在一起，开源发布 Dash 0.17
- **2018 年起**：Dash Enterprise 商业化，按席位订阅；客户从对冲基金到 NASA
- **2024 年**：Dash 3.0 重写回调引擎，正式支持 async 回调和 `set_props`，跟上 React 18 的步伐

之后社区生态外溢到 R / Julia——同套架构出 Dash for R / Dash.jl，但 Python 版仍是绝对主力。

## 学到什么

1. **反应式回调 vs 整段重跑** 是 Python 仪表板框架的两条根本路线，Dash 选前者，[[streamlit]] 选后者，没有谁更好——选哪条取决于状态复杂度和团队背景
2. **显式依赖图** 是 Dash 可以撑大型应用的根本：每个回调输入输出都标得死死的，几百个回调也能 IDE 一键跳转、全局重构
3. **服务端无 session** 是分布式部署的前提：把所有用户态推到 `dcc.Store`，server 退化成纯函数容器，水平扩容不需要黏性会话
4. **开源核心 + 企业版商业化** 是数据可视化工具最稳的盈利路径：Plotly / Tableau / Grafana / Metabase 都走这条

## 延伸阅读

- 官方文档：[Dash Tutorial](https://dash.plotly.com/tutorial)（一小时把 callback / layout / Store 走完）
- [Dash 与 Streamlit / Gradio 对比](https://plotly.com/blog/dash-vs-streamlit/)（Plotly 自己写的，看观点偏向但案例齐）
- 进阶模式：[Dash Pattern-Matching Callbacks](https://dash.plotly.com/pattern-matching-callbacks)（动态生成的控件如何统一回调）
- [[plotly-py]] —— Dash 用 Plotly 画图，绕不开的同门
- [[plotly-js]] —— Dash 前端的渲染引擎，深度调优 figure 性能必读

## 关联

- [[streamlit]] —— 同赛道竞品，"整段重跑"对位 Dash 的"反应式回调"
- [[gradio]] —— 更轻量的 ML demo 框架，HuggingFace Spaces 主力
- [[bokeh]] —— 另一条 Python 交互可视化路线，自带 server
- [[plotly-py]] / [[plotly-js]] —— Dash 的图引擎，三件套不可分
- [[flask]] —— Dash 的 server 层，自定义路由 / 中间件时直接拿 `app.server`
- [[react]] —— Dash 前端的真正运行时，写自定义组件要懂 React + Webpack
