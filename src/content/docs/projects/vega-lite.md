---
title: Vega-Lite — 三段式 JSON 把复合图收口
来源: 'https://github.com/vega/vega-lite'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 入门到中级
---

## 是什么

Vega-Lite 是一个**用 JSON 描述图表的小语言**，由 University of Washington 的 Interactive Data Lab 维护。日常类比：像点奶茶——你只勾"杯型 / 加料 / 甜度"三栏，店员自动补默认；不像让你手画一杯奶茶。它把"画一张图"压成三段：

```json
{
  "data": {"values": [{"a": "A", "b": 28}, {"a": "B", "b": 55}]},
  "mark": "bar",
  "encoding": {
    "x": {"field": "a", "type": "nominal"},
    "y": {"field": "b", "type": "quantitative"}
  }
}
```

三段对应三个槽位：

- **mark**：用什么图形原语（bar / line / point / area / rect / text 等十几种）
- **encoding**：哪一列数据接到哪个视觉通道（x / y / color / size / shape / opacity 等）
- **transform**：画之前怎么处理数据（filter / aggregate / bin / window / fold / pivot）

Vega-Lite 自己不渲染——它把 spec **编译成底层 [[vega]] spec**，再交给 vega-runtime 渲染。所以你看到的"画图"其实是两层：人写 Vega-Lite，编译器吐 Vega，渲染器画 SVG / Canvas。

## 为什么重要

不理解 Vega-Lite，下面这些事都没法解释：

- 为什么 Python 数据科学界 [[altair]] 不画图、只**生成 JSON**——它生成的就是 Vega-Lite spec
- 为什么 Streamlit / Jupyter / Observable / VS Code Notebook 都**直接内置** Vega-Lite 渲染器
- 为什么 LLM 让"画一个 X vs Y 的散点图"在 ChatGPT 里能直接出图——背后输出格式就是 Vega-Lite JSON
- 为什么 [[d3]] 写一张图 50 行起步，Vega-Lite 5 行——抽象层级差一代

## 核心要点

三段式之外是 **四个复合算子**，把单图拼成复合图：

1. **layer**：多张图叠在同一坐标系（柱 + 折线 + 均值线）
2. **concat / hconcat / vconcat**：水平 / 垂直拼成多面板
3. **facet**：按一列分组，**自动复制图**（小多图 small multiples）
4. **repeat**：对一组列做笛卡尔积，**自动生成网格**（散点矩阵）

再加 **selection**（交互选择器，绑定 interval brush 或 point click），就能写交互联动——同一份 spec 里。

写法上的关键约定：

- `type` 必须显式：`nominal`（类别）/ `ordinal`（有序类别）/ `quantitative`（数值）/ `temporal`（时间）
- 同一个 channel（比如 `color`）在一段 encoding 里出现多次会被**静默覆盖**，不报错
- `transform` 顺序敏感，`filter` 后 `aggregate` 与反过来结果不同

## 实践案例

### 案例 1：layer 把柱和折线叠到同一坐标系

```json
{
  "data": {"url": "data/sales.json"},
  "layer": [
    {"mark": "bar", "encoding": {"x": {"field": "month"}, "y": {"field": "sales"}}},
    {"mark": "line", "encoding": {"x": {"field": "month"}, "y": {"field": "target"}}}
  ]
}
```

两层共享数据和 x 轴，y 各画各的。**复合 = 把若干个三段式拼起来**——这是 Vega-Lite 的核心抽象。

### 案例 2：facet 自动小多图

```json
{
  "data": {"url": "data/cars.json"},
  "mark": "point",
  "encoding": {
    "x": {"field": "Horsepower", "type": "quantitative"},
    "y": {"field": "MPG", "type": "quantitative"},
    "facet": {"field": "Origin", "type": "nominal", "columns": 3}
  }
}
```

一张 spec 自动按 `Origin` 切成三张小图横排——不用循环、不用拼图代码。

### 案例 3：selection 让两图联动

```json
{
  "vconcat": [
    {
      "mark": "point",
      "params": [{"name": "brush", "select": "interval"}],
      "encoding": {"x": {"field": "x"}, "y": {"field": "y"}}
    },
    {
      "mark": "bar",
      "transform": [{"filter": {"param": "brush"}}],
      "encoding": {"x": {"field": "category"}, "y": {"aggregate": "count"}}
    }
  ]
}
```

上面散点图刷一个范围（brush），下面柱状图自动只显示被刷中的子集。**没有写一行 JS 事件**——交互是声明的一部分。

### 案例 4：浏览器嵌入只要一行

```html
<div id="chart"></div>
<script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
<script>vegaEmbed("#chart", spec)</script>
```

`vega-embed` 自动加载 vega + vega-lite 两个运行时，把 spec 编译并渲染。这是把 Vega-Lite 嵌进任意 HTML 的标准方式。

## 踩过的坑

1. **type 漏写默认当 nominal**：把年份 1990/1991/1992 当类别画出来，每年一根独立柱，看起来像离散事件，其实是连续时间。永远显式写 `"type": "temporal"` 或 `"quantitative"`。

2. **encoding 重复定义被静默覆盖**：同一个 mark 里写两次 `color`，后一个赢，但**没有警告**。复制粘贴 layer 时容易触发。

3. **transform 顺序敏感**：先 `filter` 再 `aggregate` 算"过滤后的总和"；先 `aggregate` 再 `filter` 算"先求总和再过滤"。两种结果都合法但语义完全不同。

4. **selection 跨视图联动需共用同名 selection**：新人常在两张图里各自定义两个 selection，发现没联动；正确做法是顶层定义一个 selection，两图都引用 `{"param": "brush"}`。

5. **大数据集卡浏览器**：默认前端 SVG 渲染，超过 5 万点就明显掉帧。需要先用 Vega-Lite 的 `bin` / `aggregate` 在 spec 里压数据，或者切到 Canvas 后端（`renderer: "canvas"`）。

## 适用 vs 不适用场景

**适用**：

- 探索式分析（EDA）——改一行 JSON 换一种视图
- Jupyter / Observable / Streamlit 内嵌图
- 看板需要交互（hover / brush / 联动）但不想写前端
- 团队协作分享图——spec 是 JSON，可粘贴可 diff 可版本控制
- LLM / 工具 / 编译器**生成**图表（JSON 可模板化）

**不适用**：

- 百万级数据点的实时大图 → Deck.gl / regl WebGL 后端
- 出版级 PDF / 矢量精修 → matplotlib + TikZ 更可控
- 3D / 网络图 / 地理深度交互 → 转 Plotly / Kepler.gl
- 需要插命令式逻辑（鼠标点击弹自定义 modal）→ 借宿主 JS 或下沉到 [[d3]]

## 历史小故事（可跳过）

- **1999**：Leland Wilkinson《The Grammar of Graphics》，提出"图是一门语言"
- **2005**：Hadley Wickham 在 R 里实现 ggplot2，工业界第一次感受到"图可以拼"
- **2014**：UW IDL（Heer 组）发布 [[vega]]，完整 JSON DSL 但写一张简单图要 200 行
- **2017**：Satyanarayan 等人发表 Vega-Lite（IEEE TVCG / InfoVis 最佳论文），把 Vega 的样板默认掉，只让用户写差异
- **2019 起**：[[altair]] 把 Vega-Lite 推进 Python 主流圈，成为 ggplot2 在 Python 的对标方案

## 学到什么

1. **图是语言不是模板**——可视化的复杂度来自组合，不是来自堆参数
2. **三段式是核心**：mark 决定形状、encoding 决定通道、transform 决定输入
3. **复合靠四个算子**：layer / concat / facet / repeat 覆盖几乎所有"组合需求"
4. **JSON 作中间表示的价值**：可读、可写、可 diff、可程序生成、可跨语言渲染——这是 Vega-Lite 比纯 API 路线（Plot / d3）多出的工程红利

## 延伸阅读

- 官方文档：[vega.github.io/vega-lite](https://vega.github.io/vega-lite/)
- 在线编辑器：[Vega Editor](https://vega.github.io/editor/)（左边 JSON、右边图，改完即看）
- 论文：[Vega-Lite IEEE TVCG 2017](https://idl.cs.washington.edu/files/2017-VegaLite-InfoVis.pdf)（10 页讲清三段式 + 复合算子）
- Python 入口：[altair-viz.github.io](https://altair-viz.github.io/)（pandas DataFrame 直接喂）
- 嵌入工具：[vega-embed](https://github.com/vega/vega-embed)（一行 JS 把 spec 渲染进任意 HTML）

## 关联

- [[vega]] —— 底层显式 spec，Vega-Lite 编译目标
- [[d3]] —— 更底层的乐高，Vega 内部很多渲染细节复用 d3 模块
- [[observable-plot]] —— 同样 grammar of graphics 思想，但走 JS API 路线
- [[echarts]] —— 同样 JSON 即图，但配置式而非 grammar 式
- [[chart-js]] —— Canvas 渲染入门级图表，对照 Vega-Lite 的"重型版"
- [[plotly-js]] —— 另一种 JSON 即图路线，更偏交互式仪表盘

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[altair]] —— Altair — Python 上的 Vega-Lite 绑定
- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[leaflet]] —— Leaflet — 轻量交互式地图
- [[mapbox-gl-js]] —— Mapbox GL JS — 矢量瓦片 + WebGL 客户端渲染地图
- [[matplotlib]] —— matplotlib — Python 绘图基石
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[seaborn]] —— seaborn — matplotlib 之上的一行统计图

