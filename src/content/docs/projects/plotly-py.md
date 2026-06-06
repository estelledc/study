---
title: Plotly.py — DataFrame 一行变交互图表
来源: 'https://github.com/plotly/plotly.py + Plotly Inc. 2015 开源'
日期: 2026-05-31
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

Plotly.py 是 Plotly.js 的 **Python 端外壳**——它把 pandas DataFrame 直接翻译成 plotly.js 看得懂的 **JSON 图表规格**（spec）。日常类比：plotly.js 是负责画图的厨师，Plotly.py 是替你点单的服务员——你递一张 DataFrame，它把字段名翻译成厨师的菜单 JSON。

最小代码：

```python
import plotly.express as px
df = px.data.gapminder().query("year == 2007")
fig = px.scatter(df, x='gdpPercap', y='lifeExp', color='continent', size='pop')
fig.show()
```

四行：拿数据、调一次 `px.scatter`、`fig.show()`。Jupyter 里出来一张能 hover、能缩放、能按大洲筛选图例的散点气泡图。**没写一行 SVG，没绑一个事件**。

它有 **三层 API**：`plotly.express`（高层、一行出图，对标 seaborn）/ `plotly.graph_objects`（低层 Figure / Trace 对象，做精细定制）/ `plotly.io`（导出 PNG/HTML/JSON）。日常 80% 场景用 px，剩下 20% 调 go。

## 为什么重要

不理解 Plotly.py，下面这些事都没法解释：

- 为什么 `fig.to_json()` 输出可以**直接拷给前端 Plotly.js 渲染** —— 因为两端共享**同一份 schema**，没有适配层
- 为什么 Dash 框架能让你"只写 Python，零 JS"出仪表盘 —— Dash 把 plotly.py 算出的 JSON 自动喂给浏览器里的 plotly.js
- 为什么 Jupyter notebook 里的 plotly 图能拖能转 —— 它不是图片，是 plotly.js bundle 在浏览器实时渲染 plotly.py 序列化出的 JSON
- 为什么数据科学家从 matplotlib 转过来 —— hover 看数值、点图例隐藏 trace 这些交互在 matplotlib 里都得自己写

## 核心要点

Plotly.py 的设计可以拆成 **三个支点**：

1. **DataFrame 优先**：`px.scatter(df, x='col1', y='col2', color='col3')` 接整张 DataFrame + 列名字符串，自动推 trace 数量、配色、图例文案。不用先 group-by、不用先 melt——pandas 里怎么放就怎么传。

2. **Figure 本质是 dict**：`fig.to_json()` / `fig.to_dict()` 直接拿到 plotly.js 能吃的 JSON。`fig.data` 是 trace 列表、`fig.layout` 是布局 dict——结构和 plotly.js 字节级镜像。

3. **三层 API 渐进披露**：写 `px.line(df, x=..., y=...)` 三秒出图；要改某条线颜色就 `fig.update_traces(line_color='red', selector=dict(name='A'))`；要彻底自定义就掉到 `go.Scatter(...)` 手搭。三层之间无缝混用。

三点合起来：**pandas 一头、plotly.js JSON 另一头，中间几乎透明**。

## 实践案例

### 案例 1：px 一行做分组散点

```python
import plotly.express as px
df = px.data.iris()
fig = px.scatter(df, x='sepal_width', y='sepal_length',
                 color='species', symbol='species',
                 trendline='ols')
fig.show()
```

`color='species'` 自动把三种鸢尾花拆成三条 trace、配三种颜色、出图例。`trendline='ols'` 自动跑最小二乘加趋势线。同样的事用 matplotlib 大概要 15 行 + 手 group-by。

### 案例 2：go 精细控制 + update_layout 流式调

```python
import plotly.graph_objects as go
fig = go.Figure()
fig.add_trace(go.Scatter(x=[1,2,3], y=[4,5,6], name='A'))
fig.add_trace(go.Scatter(x=[1,2,3], y=[2,3,4], name='B'))
fig.update_layout(title='对比', xaxis_title='时间', yaxis_title='值',
                  hovermode='x unified')
fig.update_traces(line=dict(width=3), selector=dict(name='A'))
```

`update_layout` / `update_traces` 是不可变流式 API——每次返回新对象的字段更新（其实是原地改 + 返回 self），可以串很多调用。`selector` 用 dict 匹配 trace（按 name/type/任意属性），匹配不到不会报错——这是常见踩坑。

### 案例 3：Python 算图 + 前端 plotly.js 渲染

后端 Python：

```python
fig = px.scatter(df, x='gdp', y='life')
spec_json = fig.to_json()    # 序列化成 JSON 字符串，存数据库或推给前端
```

前端 JS：

```js
const fig = JSON.parse(specJson)
Plotly.newPlot('chart', fig.data, fig.layout)
```

中间**没有任何转换层**。Dash 框架就是把这套流程自动化包成 web app：你写 Python callback 返回 fig，Dash 把 JSON 发到浏览器，plotly.js 渲染。

## 踩过的坑

1. **Jupyter 不显示图**：notebook 里 `fig.show()` 一片空白——多半是 nbformat 版本旧或 kernel 没重启。兜底：`fig.show(renderer='browser')` 让浏览器开新标签页直接渲染，绕开 notebook 环境问题。

2. **Plotly Express 列类型陷阱**：数值列被当类别 → 离散调色板，图例每个值一种颜色（看着像花花绿绿）。修：显式 `df['col'] = df['col'].astype('category')` 或传 `color_continuous_scale='Viridis'` 强制连续色。

3. **Kaleido 导出 PNG 在 Linux server 装不上**：`fig.write_image('out.png')` 默认走 kaleido，它要 chromium 依赖。docker 镜像必须装 `chromium-browser` 或 `google-chrome-stable`，否则 install 完调用直接挂。

4. **to_json() 遇到 numpy 类型报错**：`Object of type int64 is not JSON serializable`。修：写图前 `df.astype({'col': float})` 或用 `fig.to_json(engine='orjson')`（orjson 引擎认 numpy 类型）。

5. **`fig.show()` vs `fig.write_html()` 体积差 3MB**：write_html 默认把整个 plotly.js bundle 嵌进单文件——分享方便但每个文件 3MB+。生产用 `include_plotlyjs='cdn'` 改成走 CDN，文件压到几十 KB。

## 适用 vs 不适用场景

**适用**：

- Python 数据科学家做交互探索（hover 看数值、图例筛选 —— matplotlib 没这个）
- Dash / Streamlit / Gradio 仪表盘后端 —— `st.plotly_chart(fig)` 一行接入
- 需要分享给非技术同事的单文件 HTML 报告（`fig.write_html('report.html')`）
- 跨语言协作：Python 端算图、前端 Plotly.js 渲染、schema 一致免对齐

**不适用**：

- 高规格论文静态图 —— matplotlib 排版精细、期刊熟、出 PDF 矢量稳；plotly 出 PNG 中规中矩
- 一次性快速看分布 —— seaborn `sns.displot(df.col)` 更直接，plotly 依赖更重
- 复杂 GIS 地图 —— folium / kepler.gl / pydeck 更专
- 千万级流式实时 —— plotly.js 浏览器端也吃力，要 deck.gl 直吃 GPU

## 历史小故事（可跳过）

- **2015**：plotly.py 首版，配合 plotly.js MIT 开源同步发布
- **2017**：Dash 框架出现 —— 把 plotly.py 推上 Python 仪表盘主流舞台
- **2019**：plotly.express 发布 —— 对标 seaborn 的高层 API，让"一行出图"成为默认入口
- **2020**：kaleido 替代 orca 做静态图导出 —— 纯 Python 安装、轻量
- **2024**：v5 系列稳定，主推 px + Dash 组合作为 Python 交互图表的工业默认

## 学到什么

1. **DataFrame 直接进、JSON 直接出** —— 中间没有自定义中间层，是 plotly.py 跨语言协作的关键
2. **三层 API 渐进披露** —— 不要 px 和 go 二选一，要会混搭：px 出骨架、go/update_traces 精修
3. **schema 共用是工程杠杆** —— 一份 JSON spec 让 Python / R / Julia / JS 共享一份"画图语言"，团队无翻译成本
4. **静态图 vs 交互图不是对立** —— 探索期用 plotly 看交互、出版期用 matplotlib 出 PDF，两者搭配

## 延伸阅读

- 官方文档：[Plotly Python](https://plotly.com/python/)（按图表类型组织，每页都能改 demo）
- 镜像对照：[Plotly.js docs](https://plotly.com/javascript/) 结构和 Python 文档一一对应，对着看立刻理解 schema 共享
- Dash 教程：[Dash in 20 minutes](https://dash.plotly.com/tutorial)（仪表盘怎么把 plotly.py 推上 web）
- [[plotly-js]] —— JS 端，本笔记的镜像兄弟
- [[altair]] —— 声明式可视化对手，后端是 Vega-Lite
- [[bokeh]] —— 同光谱 Python 交互图，但不与 JS 共用 schema

## 关联

- [[plotly-js]] —— Plotly.py 的 JSON 输出就是给它吃的；理解 plotly-js 才能理解为什么 plotly.py 要这么设计
- [[altair]] —— 同样是声明式 Python 可视化，但后端走 Vega-Lite，不是 plotly.js
- [[bokeh]] —— Python 原生交互图，思路接近但 schema 不跨语言共用
- [[pandas]] —— DataFrame 是 plotly.express 的天然输入，列名当字段
- [[jupyter]] —— notebook 把 plotly.py 输出的 JSON 直接喂给 plotly.js 渲染
