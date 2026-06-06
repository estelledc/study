---
title: Plotly.js — 一个 JSON 描述任何图表的浏览器全家桶
来源: 'https://github.com/plotly/plotly.js + Plotly Inc. 2015 开源'
日期: 2026-05-31
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

Plotly.js 不是给你一堆"画框"的工具，而是一种**用纯 JSON 描述图表的标准**——你写一个对象，浏览器替你画图、加交互、做导出。日常类比：D3 给你砖头自己砌房子，Plotly 给你**装修菜单**——勾几个选项，房子直接落成，连开关插座（缩放/悬停/导出）都接好了。

最小代码：

```js
Plotly.newPlot('chart', [{
  x: [1, 2, 3, 4],
  y: [10, 15, 13, 17],
  type: 'scatter'
}], {
  title: '我的第一张图'
})
```

四行 JSON，浏览器里出一张可缩放、可框选、可导出 PNG 的折线图。**没写一行 SVG，没绑一个事件**。

40+ 种图表类型（散点、柱、饼、箱线、热力、3D 曲面、地图、桑基、旭日……）共用同一个对象骨架：`data`（数据 trace 数组）+ `layout`（标题/坐标轴/字体）+ `config`（工具条行为）。换图表只改一个字段：`type: 'scatter'` 改成 `'bar'` 就是柱状图，改成 `'box'` 就是箱线图。

## 为什么重要

不理解 Plotly.js，下面这些事都没法解释：

- 为什么 Python 里 `fig = px.scatter(...)` 出来的图，**保存成 JSON 拷到前端 Plotly.js 直接渲染** —— 因为 plotly.py / Plotly R / Plotly Julia / plotly.js 共用**同一份 schema**，4 个宿主语言一份文档
- 为什么 Dash / Streamlit / Gradio 的图表组件几乎都是它 —— 跨语言 + 框架无关 + 交互内置，做仪表盘的甜区
- 为什么 Jupyter 里图能拖能转能看 tooltip —— 那不是图片，是 plotly.js 在浏览器实时渲染的 JSON
- 为什么生物/金融/地理论文图大量用它 —— 3D 曲面 / 地图 / 候选烛 / 等高线这些"专业图"开箱即有，D3 要自己拼

## 核心要点

Plotly.js 的设计可以拆成 **三个支点**：

1. **声明式 JSON schema**：图表 = `{data, layout, config}` 一个对象。`data` 是 trace 数组（每条曲线一个 trace），`layout` 管全局外观，`config` 管交互行为。学一次结构通吃 40+ 图表。

2. **SVG / WebGL 混合渲染**：默认走 SVG（清晰、可二次编辑、几千点流畅）；点数上去切到 WebGL trace（`scatter` → `scattergl`，仅改一个字符串），百万点仍能拖。底层早期基于 D3 做 SVG，后接入 stack.gl / regl 做 WebGL。

3. **跨语言 schema 复用**：plotly.py 的 `fig.to_json()` 输出和浏览器 `JSON.stringify(div.data)` **字节级一致**。Python 后端算图、前端原样渲染，中间不用转换层。

三点合起来：**写一份 JSON，跨语言、跨规模、跨交互**。

## 实践案例

### 案例 1：换图表只改一个字符串

```js
const data = [{
  x: ['周一', '周二', '周三'],
  y: [3, 7, 5],
  type: 'scatter'   // 折线图
}]
Plotly.newPlot('chart', data)
```

把 `type: 'scatter'` 改成 `'bar'` —— 柱状图。改成 `'box'` —— 箱线图（注意把 y 改成数组的数组）。同一个数据骨架，**40+ 种图任选**。

### 案例 2：内置交互一个不漏

```js
Plotly.newPlot('chart', data, {
  hovermode: 'x unified'      // 同 x 值多 trace 一起显示在 tooltip
})
```

页面上自动得到：

- **缩放**：鼠标拖矩形框选区域；滚轮缩放
- **平移**：按住拖
- **悬停 tooltip**：跟随鼠标显示数值
- **图例**：单击隐藏一条 trace、双击只显示这一条
- **modebar**：右上角工具条 — 下载 PNG / 重置视图 / 套索选择

零代码。要关掉某个交互就在 `config` 里改一个布尔。

### 案例 3：Python 算图 + 前端渲染（schema 共用）

Python 端：

```python
import plotly.express as px
fig = px.scatter(df, x='gdp', y='life')
json_str = fig.to_json()    # 序列化成 JSON 字符串
```

前端 JS：

```js
const fig = JSON.parse(jsonStr)
Plotly.newPlot('chart', fig.data, fig.layout)
```

**没有适配层**。Python 算完直接拿 JSON 给前端，前端就是把那个 JSON 喂给 Plotly.js。Dash 框架就是把这个流程自动化做成 web app。

## 踩过的坑

1. **全量 bundle ~3MB 压缩后**：dist/plotly.min.js 含全部 40+ 图 + 3D + 地图，首屏会拖慢。生产用按需选 **partial bundle**：`plotly-basic` / `plotly-cartesian` / `plotly-geo` / `plotly-gl3d` / `plotly-finance` —— 只引你要的那一部分。

2. **`Plotly.newPlot` vs `Plotly.react`**：前者每次销毁重建 DOM，数据频繁更新（实时仪表盘）会闪烁掉帧。**频繁更新用 `Plotly.react`** —— 它做 diff，只改变化的部分，新人常用错。

3. **WebGL context 上限**：浏览器最多约 16 个 WebGL 上下文，超过会丢弃最早的。一页放 20 个 `scatter3d` 会有图突然空白。**解决**：合并成一个图多 trace，或者部分 trace 退回 SVG。

4. **SVG 文本跨浏览器 1-2px 偏差**：出 PDF 报告时不同 Chrome / Safari 渲染的 SVG 文本居中略不同。生产报告流水线必须 `Plotly.toImage(div, {format:'png'})` 转 PNG 再嵌 PDF，避免视觉抖动。

## 适用 vs 不适用场景

**适用**：

- 数据探索仪表盘（Dash / Streamlit / Jupyter）—— 交互内置、40 种图够用
- 跨语言协作（Python 同事算数据、前端同事展示）—— schema 一致免对齐
- 科研报告含 3D / 地图 / 统计高级图 —— 不用自己拼 D3
- 中等数据量（万级到百万级）—— WebGL trace 顶得住

**不适用**：

- 极致定制图形（不在 40 种内的奇异可视化）—— 用 D3 从砖头开始
- 极简首屏 / 移动端 banner —— 3MB bundle 太重，用 Chart.js（八种主流图、~70KB）
- 千万级流式数据 —— 仍然吃力，要 deck.gl / regl 直接吃 GPU
- 想完全 React 范式（组件即图表）—— Recharts / nivo 是 React-only 封装更顺手

## 历史小故事（可跳过）

- **2013**：Plotly Inc. 在蒙特利尔创立，做在线绘图 SaaS
- **2014**：内部图表引擎跨 Python / R / MATLAB 成型
- **2015**：**plotly.js 在 GitHub MIT 开源** —— 这是它进入主流前端的起点
- **2017**：Dash 发布 —— 把 plotly.js 推上 Python 仪表盘主流舞台
- **2019**：Plotly Express 发布 —— Python 高层 API，写法接近 seaborn

之后六年，plotly.js 成为科研、量化、生物信息、地理可视化默认选择之一。

## 学到什么

1. **声明式 JSON 是跨语言图表的关键** —— 一份 schema 让 Python / R / Julia / JS 共享一份"画图语言"
2. **SVG 和 WebGL 不是二选一** —— 同一个库按数据规模自动切换渲染后端
3. **交互内置是仪表盘场景的甜区** —— 缩放/悬停/导出零代码就能用，省下 80% 模板代码
4. **乐高 vs 装修菜单** —— D3 / Plotly / ECharts / Chart.js 是同一光谱不同高度，按"想自定义多少"挑

## 延伸阅读

- 官方文档：[Plotly.js docs](https://plotly.com/javascript/)（按图表类型组织，每种都有可改的 demo）
- 跨语言对照：[Plotly Python](https://plotly.com/python/) 和 plotly.js 文档**结构镜像**，对着看能立刻理解 schema 共享
- Dash 教程：[Dash in 20 minutes](https://dash.plotly.com/tutorial)（看仪表盘怎么把 plotly.js 推上 web）
- 论文级对比：Bostock D3 vs 高层封装的取舍 —— 见 [[d3]] 笔记
- [[d3]] —— Plotly.js 早期 SVG 后端用的就是它
- [[echarts]] —— 同光谱另一个声明式高层库，国内仪表盘多
- [[recharts]] —— React-only 高层封装，思想接近但范式不同

## 关联

- [[d3]] —— Plotly.js 的 SVG 渲染最初基于它；理解 d3 能解释 plotly 的下层
- [[echarts]] —— 另一条声明式路线（Apache 系），对比可看出 schema 设计取舍
- [[recharts]] —— React 范式封装，和 Plotly.js 的"框架无关"是相反取向
- [[jupyter]] —— Jupyter notebook 把 plotly.py 输出的 JSON 直接喂给 plotly.js 渲染
