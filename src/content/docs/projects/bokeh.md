---
title: Bokeh — 浏览器端交互式 Python 图，可挂 Server 做实时数据流
来源: 'https://github.com/bokeh/bokeh'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/bokeh/bokeh
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c215fd3105bf6a52aed95beb92db9eaf22c90523
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.10.0
---

## 是什么

Bokeh 是一套用 Python 描述图形、由 BokehJS 在浏览器里画交互图的库。和 Altair 把一切编译成静态 Vega-Lite spec 不同，Bokeh 的 Python 类与前端模型对应，属性变化可以经 Document 同步；再挂上 Server，前端事件就能跑 Python 回调。日常类比：遥控车——遥控器（浏览器）和电池（Python）通过电波（WebSocket）连着，但你也可以先把车停在展示柜里（静态 HTML）。

固定 `3.10.0` 要求 Python `>=3.12`。硬依赖包括 `tornado>=6.2`（emscripten 除外）、`numpy`、`jinja2`、`narwhals`、`pillow`、`pyyaml`、`xyzservices`。样本数据已拆到可选包 `bokeh_sampledata`。

```python
from bokeh.plotting import figure, show

p = figure(title="第一张图", x_axis_label="x", y_axis_label="y")
p.line([1, 2, 3, 4], [10, 15, 13, 17], line_width=2)
show(p)
```

`figure` 是 `Plot` + `GlyphAPI`。未指定 tools 时用 `DEFAULT_TOOLS = "pan,wheel_zoom,auto_box_zoom,save,reset,help"`。`show()` 看当前 `curstate()`：notebook 激活就走 notebook hook；`output_file` 激活或还没展示过，就写 HTML 并尝试打开浏览器。

## 为什么重要

不理解 Bokeh 的“模型树 + 可选 Server”，下面这些事会对不上：

- 为什么同一套 `figure().line()` 既能导出静态 HTML，又能在 `bokeh serve` 里接 slider 回调
- 为什么多图联动和流式追加都围绕 `ColumnDataSource`，而不是每人一份数组
- 为什么 `output_file` 和 `output_notebook` **可以同时开**——它们往 state 上加目的地，并不互相清掉
- 为什么 3.10.0 页不能按“`circle()` 已经消失”或“列长不一致立刻 ValueError”的旧印象推理

## 核心要点

固定版本可以拆成四个支点：

1. **Python 模型树**：`Model` 经 `Serializer` / `ObjectRefRep` 序列化进 Document。`on_change` 是 Python 属性回调，`js_on_change` 是前端回调。改属性会触发 Document 事件；Server 会话再决定是否推给浏览器。

2. **ColumnDataSource**：列名 → 序列。构造时列长不一致发 `BokehUserWarning`，不是当场 `ValueError`；读 `.length` 遇到多种长度才 `RuntimeError`。`stream(new_data, rollover=None)` 要求补齐**全部已有列**且本次追加等长；`rollover` 从列头截断。空 source 允许用新 key 初始化。

3. **glyph API**：`p.line` / `p.vbar` / `p.scatter` 往同一 `figure` 叠 renderer。`circle()` 仍在：带 `size` 时自 3.4.0 起弃用并转 `scatter`；否则走 `Circle` glyph（`radius`）。`scatter` 默认 `marker="circle"`。`Plot.output_backend` 默认 `"canvas"`。

4. **两种输出 + Server**：`output_file` 默认 Resources mode `cdn`；`output_notebook` 默认 Jupyter。`bokeh serve app.py` 起 Tornado `BokehTornado`，默认端口 `5006`（`BOKEH_DEFAULT_SERVER_PORT`）。`curdoc().add_root(...)` 把布局挂进当前 Document。

仓库另有 `4.0.0.dev2` 预发布标签；本文不绑定 4.x 行为。

## 实践示例

### 案例 1：同一 figure 叠三种 glyph

```python
from bokeh.plotting import figure, show

x = [1, 2, 3, 4]
p = figure(width=600, height=300)
p.line(x, [10, 15, 13, 17], color="blue", legend_label="温度")
p.scatter(x, [9, 12, 18, 14], color="red", size=8, legend_label="事件")
p.vbar(x=x, top=[3, 4, 2, 5], width=0.5, alpha=0.3, legend_label="流量")
show(p)
```

每一行往 `renderers` 加一层。`scatter(..., size=8)` 走 marker glyph；若写成 `circle(..., size=8)`，固定版本会弃用并转到 `scatter`。

### 案例 2：stream 追加并截断

```python
from bokeh.models import ColumnDataSource
from bokeh.plotting import figure

source = ColumnDataSource(data=dict(x=[], y=[]))
p = figure()
p.line(x="x", y="y", source=source)

source.stream(dict(x=[1.0], y=[0.2]), rollover=200)
```

`stream` 只接受已有列的等长追加。漏列或多列会 `ValueError`。`rollover=200` 在包装后的列数据上从头部丢掉超出部分。本轮未启动 Server，也未测量推送延迟。

### 案例 3：Server 把 slider 挂到 Python

```python
from bokeh.io import curdoc
from bokeh.layouts import column
from bokeh.models import Slider
from bokeh.plotting import figure

p = figure()
line = p.line([0, 1, 2], [0, 1, 4])
slider = Slider(start=0, end=10, value=1, step=0.1, title="指数")

def update(attr, old, new):
    line.data_source.data["y"] = [v ** new for v in [0, 1, 2]]

slider.on_change("value", update)
curdoc().add_root(column(slider, p))
```

`bokeh serve --show app.py` 默认听 `http://localhost:5006/app`。拖 slider 触发 Python `update`，Document 再补丁到前端。没有这条 serve 进程，`on_change` 不会在静态 HTML 里自动跑。

## 踩过的坑

1. **以为 file / notebook 互斥**：`output_file` 文档写明不清除 `output_notebook`。`show()` 可以先内联再写文件。要清掉所有目的地用 `reset_output()`。

2. **把列长不一致当成构造期 ValueError**：构造走 warning；`.length` 才可能 `RuntimeError`。`stream()` 对列集合和追加长度是硬 `ValueError`。

3. **`circle(size=...)` 当现行推荐 API**：3.4.0 起这条路径弃用。数据单位半径继续用 `circle(radius=...)`，屏幕像素大小用 `scatter(size=...)`。

4. **静态 HTML 默认走 CDN**：`output_file` 的 Resources mode 默认 `cdn`。离线要 `mode="inline"`。Server 模式必须有常驻 Tornado 进程。

5. **把 3.10.0 当成仓库最新线**：同仓已有 `4.0.0.dev2`。样本数据也不再内置，需要 `bokeh_sampledata`。

## 适用 vs 不适用场景

**适用**：

- 需要 Python 回调或 `stream()` 增量更新的仪表盘 / 参数探索
- 希望同一套 glyph API 既能 `output_file` 也能 `bokeh serve`
- Python `>=3.12`，能接受 Tornado 作为 Server 运行时

**不适用**：

- 只要一份可移植 JSON、不要 Python 常驻——看 [[altair]]
- 必须在 3.11 或更旧的解释器上跑——固定包声明 `requires-python >=3.12`
- 要把未实测的点数上限、首屏体积写成选型结论
- 准备跟 4.0 预发布走，却仍按 3.10.0 推理

## 固定版本边界

- 本文绑定 `bokeh/bokeh@c215fd3105bf6a52aed95beb92db9eaf22c90523`，annotated tag `3.10.0`，与 PyPI `bokeh==3.10.0` 同日。
- `requires-python >=3.12`；Server 依赖 Tornado，默认端口 5006。
- 同仓 `4.0.0.dev2` 是 prerelease，未绑定。
- 本文未安装依赖、未启动 Server、未渲染 BokehJS、未测吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **静态导出和 Server 是同一棵模型树的两种目的地**——差别在有没有 Python 会话解释 `on_change`。
2. **ColumnDataSource 把“表”从 glyph 里抽出来**——联动、stream、选区都挂在这份列数据上。
3. **警告和异常分层**——构造容错用 warning，stream 合同用 ValueError。
4. **glyph 改名是渐进的**——`circle` 还在，只是 `size` 这条路被标弃用。

## 应用型自测

1. `output_notebook()` 之后再调 `output_file("x.html")`，notebook 输出会被清掉吗？
2. `ColumnDataSource(dict(x=[1,2,3], y=[4,5]))` 会立刻 `ValueError` 吗？
3. `p.circle(x, y, size=8)` 在 3.10.0 里走的是 `Circle` glyph，还是转去 `scatter`？

检查点：

1. 不会。两种目的地可以同时激活；要清空用 `reset_output()`。
2. 不会立刻。构造发 `BokehUserWarning`；`.length` 遇到多种长度才 `RuntimeError`。
3. 转去 `scatter`。带 `size` 的 `circle()` 自 3.4.0 起弃用并转发。

## 延伸阅读

- 文档：[Bokeh User Guide](https://docs.bokeh.org/en/latest/docs/user_guide.html)
- 固定源码：[bokeh/bokeh](https://github.com/bokeh/bokeh) —— 本文绑定提交 `c215fd3105bf6a52aed95beb92db9eaf22c90523`
- Server：[bokeh serve](https://docs.bokeh.org/en/latest/docs/user_guide/server.html)
- [[altair]] —— 纯 spec、无 Python 回调的对照

## 关联

- [[altair]] —— 声明式 Vega-Lite，对位“不要 Server”
- [[plotly-js]] —— 纯前端 JSON 配置的另一端
- [[d3]] —— BokehJS 早期思路的参照，不是现行运行时依赖
- [[jupyter]] —— `output_notebook()` 的默认 notebook_type

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/panel]] —— Panel — 把 notebook 一键变交互式 web app
- [[dash]] —— Dash — Plotly 的 Python 仪表板框架
- [[holoviews]] —— HoloViews — 一份声明 ⇄ 多后端自动绘图
- [[projects/panel]] —— Panel — 多绘图后端的 Python dashboard
- [[plotly-py]] —— Plotly.py — DataFrame 一行变交互图表
