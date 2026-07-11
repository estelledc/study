---
title: Vega-Lite — 用 JSON 三段式画复合图
来源: 'Satyanarayan, Moritz, Wongsuphasawat, Heer, "Vega-Lite: A Grammar of Interactive Graphics", IEEE TVCG / InfoVis 2017'
日期: 2026-05-31
分类: 数据可视化
难度: 入门到中级
---

## 是什么

Vega-Lite 是一种**用 JSON 描述图表**的小语言，由 University of Washington 的 Interactive Data Lab（IDL，Jeffrey Heer 组）维护。日常类比：像点奶茶——你只需要勾"杯型 / 加料 / 甜度"三栏，店员自动补默认；不像让你手画一杯奶茶。

写一张柱状图就这几行：

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

- **mark**：用什么图形原语（bar / line / point / area …）
- **encoding**：哪一列数据映射到哪个视觉通道（x / y / color / size …）
- **transform**：画之前怎么处理数据（filter / aggregate / bin …）

## 为什么重要

不理解三段式，下面这些事都没法解释：

- 为什么 Altair / Streamlit / Observable 里"5 行画一张图"比 matplotlib"改 30 行"还快
- 为什么图本身可以**复制粘贴分享**——一张 spec 就是一段 JSON，谁都能渲染
- 为什么 Wickham 的 ggplot2 在 R 圈封神，而 Python 圈过去十年没有同等地位的工具
- 为什么浏览器里的交互看板（hover、brush、联动）能用同一份 JSON 静态描述

## 核心要点

三段式之外还有四个**复合算子**，把单图拼成复合图：

1. **layer**：多张图叠在同一坐标系（柱+折线+均值线）
2. **concat**（hconcat / vconcat）：水平 / 垂直拼成多面板
3. **facet**：按一列分组，**自动复制图**（小多图）
4. **repeat**：对一组列做笛卡尔积，**自动生成网格**（散点矩阵）

再加 **selection**（选择器，绑定 brush 或 click），就能写交互联动。

写法上的关键约定：

- `type` 必须显式：`nominal`（类别）/ `ordinal`（有序类别）/ `quantitative`（数值）/ `temporal`（时间）
- 同一个 channel（比如 `color`）在一段 encoding 里出现多次会被**默默覆盖**，不报错
- `transform` 顺序敏感，`filter` 后 `aggregate` 与反过来结果不同

## 实践案例

### 案例 1：5 行画一张柱状图

```json
{
  "data": {"url": "data/cars.json"},
  "mark": "bar",
  "encoding": {
    "x": {"field": "Origin", "type": "nominal"},
    "y": {"aggregate": "count", "type": "quantitative"}
  }
}
```

- `aggregate: count` 直接说"按 Origin 分组数行数"，不必先 group by
- y 没写 `field`，等价于"对每行计数"

### 案例 2：layer 把柱和折线叠到同一图

```json
{
  "data": {
    "values": [
      {"month": "Jan", "sales": 28, "target": 30},
      {"month": "Feb", "sales": 55, "target": 40}
    ]
  },
  "layer": [
    {"mark": "bar", "encoding": {
      "x": {"field": "month", "type": "nominal"},
      "y": {"field": "sales", "type": "quantitative"}
    }},
    {"mark": "line", "encoding": {
      "x": {"field": "month", "type": "nominal"},
      "y": {"field": "target", "type": "quantitative"}
    }}
  ]
}
```

**逐部分解释**：

- 外层只有 `data` + `layer`——复合图把「画什么」下放到每一层
- 第一层柱（销量）、第二层折线（目标），共享数据与 x 轴；每层都显式写 `type`
- 三段式的力量在这——**复合 = 把若干个三段式拼起来**

### 案例 3：facet 自动小多图

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

**逐部分解释**：

- `facet` 按 `Origin` 分组，自动复制散点图成小多图（最多 3 列）
- 写在 `encoding` 里与顶层 `"facet": {...}` 等价；一张 spec 完成切分，不用手拼

## 踩过的坑

1. **type 漏写或写错**：把年份写成 `nominal`（或让推断猜错），1990/1991/1992 会当类别画成独立柱，像离散事件。永远显式写 `"type": "temporal"` 或 `"quantitative"`。

2. **encoding 重复定义被静默覆盖**：同一个 mark 里写两次 `color`，后一个赢，但**没有警告**。复制粘贴 layer 时容易触发。

3. **transform 顺序敏感**：先 `filter` 再 `aggregate` 算"过滤后的总和"；先 `aggregate` 再 `filter` 算"先求总和再过滤"。两种结果都合法但语义完全不同。

4. **大数据集卡浏览器**：默认前端渲染，超过 5 万点就明显掉帧。需要先用 Vega-Lite 的 `bin` / `aggregate` 在 spec 里压数据，或者切到 Deck.gl 这类 WebGL 后端。

## 适用 vs 不适用场景

**适用**：
- 探索式分析（EDA）——改一行 JSON 换一种视图
- Jupyter / Observable / Streamlit 内嵌图
- 看板需要交互（hover / brush / 联动）但不想写前端
- 团队协作分享图——spec 是 JSON，可粘贴可 diff 可版本控制

**不适用**：
- 百万级数据点的实时大图 → 用 Deck.gl / regl 这类 WebGL 后端
- 出版级 PDF / 矢量精修 → matplotlib + TikZ 更可控
- 3D / 网络图 / 地理深度交互 → 转 Plotly / Kepler.gl

## 历史小故事（可跳过）

- **1999 年**：Leland Wilkinson 出版《Grammar of Graphics》，提出"图是一门语言而非模板"。纯理论，没人能跑。
- **2005 年**：Hadley Wickham 在 R 里实现 ggplot2，工业界第一次感受到"图可以拼"。
- **2014 年**：华盛顿大学 IDL 实验室（Heer 组）发布 Vega，完整 JSON DSL，但写一张简单图要 200 行。
- **2017 年**：Satyanarayan 等人发表 Vega-Lite——把 Vega 的样板默认掉，只让用户写差异。论文同时给出 layer / concat / facet / repeat 四算子和 selection 模型。
- **约 2017–2019**：Altair 把 Vega-Lite 推进 Python 主流圈，成为 ggplot2 在 Python 的对标方案。

## 学到什么

1. **图是语言不是模板**——可视化的复杂度来自组合，不是来自堆参数
2. **三段式是核心**：mark 决定形状、encoding 决定通道、transform 决定输入
3. **复合靠四个算子**：layer / concat / facet / repeat，覆盖几乎所有"组合需求"
4. **JSON 作中间表示的价值**：可读、可写、可 diff、可程序生成、可跨语言渲染

## 延伸阅读

- 论文 PDF：[Vega-Lite IEEE TVCG 2017](https://idl.cs.washington.edu/files/2017-VegaLite-InfoVis.pdf)（10 页，三段式 + 复合算子讲清楚）
- 上手交互教程：[Vega-Lite Tutorials](https://vega.github.io/vega-lite/tutorials/getting_started.html)
- Python 包装：[Altair 文档](https://altair-viz.github.io/)（pandas DataFrame 直接喂）
- 在线编辑器：[Vega Editor](https://vega.github.io/editor/)（左边 JSON、右边图，改完即看）
- [[d3]] —— Vega 的底层抽象，更自由但更冗长
- [[observable-notebook]] —— Vega-Lite 的天然宿主

## 关联

- [[d3]] —— D3 用 JS API 描述图，Vega-Lite 用 JSON 描述同一思想
- [[ggplot2]] —— R 里的 grammar of graphics 实现，Vega-Lite 思想同源
- [[altair]] —— Python 把 Vega-Lite spec 当目标产物
- [[observable-notebook]] —— 浏览器内的 Vega-Lite 主要宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[altair]] —— Altair — Python 上的 Vega-Lite 绑定
- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[leaflet]] —— Leaflet — 轻量交互式地图
- [[mapbox-gl-js]] —— Mapbox GL JS — 矢量瓦片 + WebGL 客户端渲染地图
- [[matplotlib]] —— matplotlib — Python 绘图基石
- [[panel]] —— Panel — 多绘图后端的 Python dashboard
- [[seaborn]] —— seaborn — matplotlib 之上的一行统计图
- [[vega-lite]] —— Vega-Lite — 用 JSON 三段式画复合图

