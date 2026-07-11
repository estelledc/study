---
title: Bokeh — 浏览器端交互式 Python 图，可挂 Server 做实时数据流
来源: 'https://github.com/bokeh/bokeh + Continuum Analytics 2013 开源'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 入门
---

## 是什么

Bokeh 是一个**用 Python 写代码、浏览器里画交互图**的库，最大的差异化是它**自带一个 Server**——前端动一下（拖个 slider、点个按钮），Python 那边跑回调、实时把新数据推回浏览器。日常类比：Plotly 像装修菜单（写 JSON 配置，浏览器自己上漆），Bokeh 像**遥控玩具车**——遥控器（前端）和电池（Python）通过电波（WebSocket）一直连着，你按一下按钮车就动。

最小代码：

```python
from bokeh.plotting import figure, show
p = figure(title='我的第一张图', x_axis_label='x', y_axis_label='y')
p.line([1, 2, 3, 4], [10, 15, 13, 17], line_width=2)
show(p)  # 浏览器弹出一张可缩放、可悬停、可导出的折线图
```

四行 Python，浏览器里出一张可交互图。**没写一行 JS、没写一行 HTML**。换图表只改一个方法名：`p.line(...)` 换成 `p.scatter(...)` 是散点，换成 `p.vbar(...)` 是柱状——链式叠层，**和 matplotlib 的 axes 用法神似**。

## 为什么重要

不理解 Bokeh，下面这些事都没法解释：

- 为什么科研团队做实时仪表盘选它而不是 Plotly——**Bokeh Server 是一等公民**，Python 写回调不用再装 Dash
- 为什么 ML 训练监控（损失曲线、梯度直方图）大量用它——`ColumnDataSource.stream()` 一行往现有图追加新点，自动重绘
- 为什么金融、传感器、日志流场景偏爱它——**WebSocket 双向通信**内置，前端事件能直接触发 Python 函数
- 为什么有人说"Bokeh 比 Plotly 更 Pythonic"——它是 `figure().line()` 链式调用，Plotly 是 dict 配置，前者更像 matplotlib 后者更像配置文件

## 核心要点

Bokeh 的设计可以拆成 **三个支点**：

1. **BokehJS 前端 + Python 后端共用一套模型树**：你在 Python 里 new 一个 `Figure`、加几个 `LineGlyph`，整棵对象树序列化成 JSON 喂给 BokehJS，前端反序列化成对应的 TypeScript 对象——**Python 类和 TS 类一一对应**。改一个属性，前后端自动同步。

2. **ColumnDataSource 是数据中枢**：所有图共享一个表格状对象（列名 → 数组），多个图绑同一份数据自动联动选区/缩放。`source.stream(new_data, rollover=200)` 增量追加并丢弃最老的，做实时流图就这一行。

3. **两种部署模式**：(a) **静态导出**——`output_file('out.html')` 生成自包含 HTML，无 Python 依赖，邮件传都行；(b) **Bokeh Server**——`bokeh serve app.py` 起 Tornado，前端事件回调由 Python 处理，状态在服务端。前者像 Plotly，后者是 Bokeh 独有甜区。

## 实践案例

### 案例 1：链式叠层做组合图

```python
from bokeh.plotting import figure, show

x = [1, 2, 3, 4]
y1 = [10, 15, 13, 17]
y2 = [9, 12, 18, 14]
y3 = [3, 4, 2, 5]

p = figure(width=600, height=300)
p.line(x, y1, color='blue', legend_label='温度')
p.scatter(x, y2, color='red', size=8, legend_label='事件')
p.vbar(x=x, top=y3, width=0.5, alpha=0.3, legend_label='流量')
show(p)
```

逐部分解释：先准备同长度的 `x / y1 / y2 / y3` 数组，再在同一个 `figure` 上叠折线、散点、柱三层 glyph。每一行只加一层视觉元素，读起来像 matplotlib；Plotly 等价写法通常要把三种 trace 塞进一个配置列表里。

### 案例 2：实时流数据 stream() 一行搞定

```python
import random
import time

from bokeh.models import ColumnDataSource
from bokeh.plotting import figure

source = ColumnDataSource(data=dict(x=[], y=[]))
p = figure()
p.line(x='x', y='y', source=source)

# 每秒追加一个新点，最多保留最近 200 个
def update():
    source.stream(dict(x=[time.time()], y=[random.random()]), rollover=200)
```

逐部分解释：`ColumnDataSource` 像一张共享数据表，`p.line(..., source=source)` 把图绑定到这张表，`stream()` 只追加新行并按 `rollover=200` 丢掉旧行。在 Bokeh Server 里，这个增量会通过 WebSocket 推给前端，前端只重绘新点，不必整张图重传。

### 案例 3：Bokeh Server 把 Python 函数挂到 slider

```python
# app.py
from bokeh.io import curdoc
from bokeh.models import Slider
from bokeh.layouts import column
from bokeh.plotting import figure

p = figure()
line = p.line([0, 1, 2], [0, 1, 4])
slider = Slider(start=0, end=10, value=1, step=0.1, title='指数')

def update(attr, old, new):
    line.data_source.data['y'] = [v ** new for v in [0, 1, 2]]

slider.on_change('value', update)
curdoc().add_root(column(slider, p))
```

`bokeh serve --show app.py` 启动后，拖 slider 触发 `update`，Python 算新数据，WebSocket 推回浏览器重绘。**没写一行 JS、没起 Flask**——这是 Bokeh Server 的核心卖点。

## 踩过的坑

1. **show() / output_file() / output_notebook() 三套上下文不互通**：在 Jupyter 里 `output_notebook()` 后调 `show(p)` 内联渲染；脚本里 `output_file('x.html')` 后 `show(p)` 只写文件。**混用导致图不出现是新手最常见 bug**——必须先确认当前上下文。

2. **ColumnDataSource 列长度必须严格一致**：`source.data = dict(x=[1,2,3], y=[4,5])` 直接 `ValueError`，不像 pandas DataFrame 容忍。`stream()` 里也是——传进去的 dict 列长度必须互相相等。

3. **Bokeh Server 要 Python 进程常驻**：不像 Plotly 静态 HTML 能 CDN 分发，Server 模式必须 `bokeh serve` 一直跑，部署到生产要起 systemd / supervisor。**做轻量分享别选 Server 模式**，用 `output_file` 就够。

4. **v2 → v3 大量重命名**：v3.0（2022）改了 `CDSView` 接口、`circle()` 拆成 `scatter(marker='circle')`、部分 layout API 也变了。**老 tutorial 直接跑会报弃用警告或错**——查文档先认版本号。

5. **Canvas 默认渲染导出 PNG 文字会糊**：要清晰矢量得 `figure(output_backend='svg')` 显式切。SVG 模式百万点会卡，权衡场景。

## 适用 vs 不适用场景

**适用**：

- 实时仪表盘 / 流数据监控（传感器、股价、ML 训练）—— Server + stream() 是 Bokeh 主场
- 科学计算交互探索（Jupyter 里拖 slider 看参数效应）—— `bokeh.io.show + on_change`
- 需要 Python 回调的 web 应用，但又懒得搭 Flask + 前端框架
- 大数据量散点 / 折线（万级到百万级）—— Canvas + stream 性能顶得住

**不适用**：

- 纯静态 PDF 报告 / 截图 —— Plotly 的 SVG 默认更清晰，导出更省心
- 极致 3D / 地图可视化 —— Bokeh 3D 弱，用 Plotly 或 deck.gl
- 想要 React 组件式封装 —— 没有官方 React 绑定，硬塞要自己包 iframe
- 移动端 / 首屏极敏感 —— bundle 不算小，体积敏感场景用 Chart.js

## 历史小故事（可跳过）

- **2012 年**：Continuum Analytics（今 Anaconda）的 Peter Wang 与 Travis Oliphant 启动 Bokeh，目标是"D3 风格的图，但用 Python 写"
- **2013 年 4 月**：0.1 公开发布。早期由 **DARPA XDATA 项目**资助，与 Numba、Blaze、Dask 同源
- **2018 年**：1.0 发布，API 稳定，Bokeh Server 也成熟
- **2022 年**：3.0 大改造——TS 重写前端、统一 glyph API、迁出弃用接口
- **现在**：NumFOCUS sponsored project，Bryan Van de Ven 长期主维护

名字 **Bokeh** 来自日语 ボケ，指照片背景虚化的美感——隐喻"焦点之外的点也很美"，对应散点图大量点的视觉。

## 学到什么

1. **声明式 + Server 回调是另一种范式**：Plotly 走纯前端 JSON，Bokeh 走前后端共用模型树 + WebSocket，**两种风格不分胜负，看场景选**
2. **ColumnDataSource 是抽象的胜利**：把数据从图里抽出来共享，多图联动 / 增量流 / 选区同步全靠它
3. **Pythonic 链式 vs 配置 dict**：`p.line().scatter().vbar()` 接近 matplotlib 体感，过渡更顺
4. **遥控车 vs 装修菜单**：实时双向交互选 Bokeh，离线分发选 Plotly，**通信模型决定架构选型**

## 延伸阅读

- 官方文档：[Bokeh User Guide](https://docs.bokeh.org/en/latest/docs/user_guide.html)（按概念组织，每节有可跑 demo）
- Server 教程：[Bokeh Server Tutorial](https://docs.bokeh.org/en/latest/docs/user_guide/server.html)（搞懂回调机制必读）
- Gallery：[Bokeh Gallery](https://docs.bokeh.org/en/latest/docs/gallery.html)（看链式 API 怎么写组合图）
- 对比文章：可视化光谱的 Pythonic 一头与 JSON 一头——见 [[plotly-js]] 笔记

## 关联

- [[plotly-js]] —— 同光谱另一端，纯 JSON 配置 + 纯前端，没 Server 概念
- [[d3]] —— BokehJS 早期渲染思路受 D3 启发但自己重写了
- [[altair]] —— 同样 Python 优先但走 Vega-Lite 声明式，对比可看出"Pythonic 链式"和"声明式 grammar"的取舍
- [[jupyter]] —— `output_notebook()` 把 Bokeh 图直接嵌 cell，是最常见的本地探索环境

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
