---
title: Vega-Lite — 高层声明式可视化语法
来源: https://github.com/vega/vega-lite
日期: 2026-07-09
分类: dataviz
难度: 初级
---

## 是什么

Vega-Lite 是一种**用很短 JSON 描述图表**的可视化语法。日常类比：你不是亲自搬桌椅布置会场，而是写一张清单——这里放讲台，那里摆椅子，投影幕显示什么内容，布置工人按清单执行。

在普通前端画图里，你常要写很多像素级代码：画矩形、算坐标、配颜色、做坐标轴。Vega-Lite 把这些细节收起来，让你主要写三件事：数据是什么、用什么图形表示、字段怎么映射到视觉通道。

它的官方定位是 Vega 的高层语法：你写简洁的 Vega-Lite spec，它编译成更底层、更完整的 Vega spec，再由 Vega 渲染。也就是说，Vega-Lite 不是“画布画笔”，更像“图表菜谱”。

最小心智模型：

- `mark`：画什么形状，比如 bar、line、point、text
- `encoding`：哪一列数据放到 x、y、color、size、tooltip
- `transform`：画之前先过滤、聚合、排名、补字段

## 为什么重要

不理解 Vega-Lite，下面这些事都很难解释：

- 为什么几行 JSON 能画出坐标轴、图例、刻度和交互，而不是只画几个矩形
- 为什么 Altair 这种 Python 图表库可以把 DataFrame 翻译成浏览器图表
- 为什么同一份图表 spec 可以放在网页、Notebook、编辑器和文档系统里复用
- 为什么复杂图表不一定要靠大量手写 DOM / Canvas 代码，而可以靠声明式语法组合

## 核心要点

Vega-Lite 的核心可以拆成 **三步**：

1. **先说图形，不说像素**：`mark: "bar"` 表示“我要柱子”，不是“从 x=10 画到 x=40”。类比点餐时说“牛肉面”，不会告诉厨师每根面条多长。

2. **把字段贴到视觉通道**：`encoding.x.field = "day"` 表示把 `day` 这一列放到横轴。类比做表格时把“姓名”放第一列，把“分数”放第二列。

3. **画之前先变数据**：`transform` 可以先筛选 Top-K、计算排名、按日期汇总。类比做报表前先把流水账整理成“每周总额”，再交给图表。

这三步合起来，就是用户给的价值点：把 `mark / encoding / transform` 三段式收口成最小 JSON，用很少代码写出复合图。

## 实践案例

### 案例 1：一周销售额汇总成柱状图

这个场景来自官方入门教程的思路：表格里有类别和数值，先按类别聚合，再用柱状图看大小。

```json
{
  "data": {"values": [
    {"day": "Mon", "sales": 12},
    {"day": "Mon", "sales": 8},
    {"day": "Tue", "sales": 18},
    {"day": "Tue", "sales": 6},
    {"day": "Wed", "sales": 15}
  ]},
  "mark": "bar",
  "encoding": {
    "x": {"field": "day", "type": "ordinal"},
    "y": {"aggregate": "sum", "field": "sales", "type": "quantitative"}
  }
}
```

逐部分解释：

- `data.values` 是直接写在 spec 里的小表格，真实项目也可以换成外部数据源
- `mark: "bar"` 说明每个聚合结果用柱子表示
- `encoding.x` 把星期放到横轴，`encoding.y` 把销售额求和后放到纵轴

### 案例 2：柱状图上叠文字标签

官方 example gallery 里有“bar + text label”的层叠图。它展示了 Vega-Lite 的一个强点：不是重写整张图，而是把两个小图层叠起来。

```json
{
  "data": {"values": [
    {"team": "A", "score": 28},
    {"team": "B", "score": 55},
    {"team": "C", "score": 43}
  ]},
  "encoding": {
    "y": {"field": "team", "type": "nominal"},
    "x": {"field": "score", "type": "quantitative", "scale": {"domain": [0, 60]}}
  },
  "layer": [
    {"mark": "bar"},
    {
      "mark": {"type": "text", "align": "left", "baseline": "middle", "dx": 3},
      "encoding": {"text": {"field": "score", "type": "quantitative"}}
    }
  ]
}
```

逐部分解释：

- 顶层 `encoding` 让两个图层共享同一套横轴和纵轴
- 第一层只写 `mark: "bar"`，负责画柱子
- 第二层用 `text` mark，把 `score` 贴到柱子右侧；`dx: 3` 只是让文字离柱子边缘远一点

### 案例 3：先排名，再只画 Top-K

官方 window transform 示例展示了一个常见需求：不是把所有学生都画出来，而是先按分数排名，只看前三名。

```json
{
  "data": {"values": [
    {"student": "A", "score": 100},
    {"student": "B", "score": 56},
    {"student": "C", "score": 88},
    {"student": "D", "score": 65},
    {"student": "E", "score": 97}
  ]},
  "transform": [
    {
      "window": [{"op": "rank", "as": "rank"}],
      "sort": [{"field": "score", "order": "descending"}]
    },
    {"filter": "datum.rank <= 3"}
  ],
  "mark": "bar",
  "encoding": {
    "x": {"field": "score", "type": "quantitative"},
    "y": {"field": "student", "type": "nominal", "sort": "-x"}
  }
}
```

逐部分解释：

- 第一个 `transform` 给每行数据新增 `rank` 字段，分数越高排名越靠前
- 第二个 `transform` 只保留 `rank <= 3` 的记录
- 后面的 `mark` 和 `encoding` 不需要知道排名怎么算，只负责把过滤后的数据画出来

## 踩过的坑

1. **把 Vega-Lite 当成 Vega**：Vega-Lite 是高层语法，能省很多细节；需要像素级控制时才下探到 Vega。
2. **忘记写 `type`**：字段类型不是数据库类型，而是视觉语义；数字也可能是 nominal，比如邮编。
3. **把所有整理都塞进前端代码**：很多筛选、聚合、排名可以写进 `transform`，这样图表 spec 更自解释。
4. **滥用 layer**：层叠适合共享坐标系的图层；如果是并排对比，通常该用 concat、facet 或 repeat。

## 适用 vs 不适用场景

**适用**：

- 数据探索：快速试出柱状图、散点图、折线图、热力图
- Notebook / 文档图表：一份 JSON spec 易保存、易复现、易分享
- 需要复合图但不想手写底层绘制逻辑：比如柱子加标签、线图加规则线、误差带加均值线
- 生态桥接：Python 里用 Altair，网页里用 Vega-Embed，底层都能落到 Vega-Lite 思路

**不适用**：

- 游戏 UI、自由手绘、粒子动画这类逐帧控制场景
- 每个像素都要定制的品牌大屏，可能需要直接用 D3、Canvas 或 Vega
- 数据规模巨大且需要专门后端聚合的场景，Vega-Lite 只能描述前端图表，不替代数据仓库
- 团队完全不愿意维护 JSON spec，只想拖拽生成一次性截图

## 历史小故事（可跳过）

- **2014 年前后**：Vega 已经把“整张可视化写成 JSON spec”做出来，但完整 Vega 仍然偏底层。
- **2016 年**：Vega-Lite 论文以 “A Grammar of Interactive Graphics” 为题发表，把高层图表语法系统化。
- **2017 年后**：Altair 等工具把 Vega-Lite 带进 Python 数据分析工作流，让很多人不用直接写 JavaScript。
- **今天**：Vega-Lite 约 4.7k stars，常被用作声明式可视化、可复现图表和图表语法教学的入口。

## 学到什么

- Vega-Lite 的价值不是“图表类型多”，而是把图表拆成可组合的声明：数据、图形、映射、变换。
- `mark / encoding / transform` 是读懂大多数 Vega-Lite spec 的主线，先抓这三段就不会迷路。
- 复合图的关键不是复制粘贴整张图，而是让多个 layer 共享数据和坐标，再各自声明自己的 mark。
- 声明式图表适合长期复用，因为 spec 本身就是文档：别人能读出你为什么这么画。

## 延伸阅读

- 官方仓库：[vega/vega-lite](https://github.com/vega/vega-lite)
- 官方文档总览：[Vega-Lite Documentation](https://vega.github.io/vega-lite/docs/)
- 入门教程：[Introduction to Vega-Lite](https://vega.github.io/vega-lite/tutorials/getting_started.html)
- 官方示例库：[Vega-Lite Examples](https://vega.github.io/vega-lite/examples/)
- 论文页面：[Vega-Lite: A Grammar of Interactive Graphics](https://idl.cs.washington.edu/papers/vega-lite)

## 关联

- [[vega]] —— Vega-Lite 会编译到 Vega，Vega 是更底层的完整图表语法
- [[d3]] —— D3 更像手工工具箱，Vega-Lite 更像声明式菜谱
- [[altair]] —— Altair 是 Python 侧常见的 Vega-Lite 封装
- [[observable-plot]] —— 同样面向快速数据可视化，但 API 更偏 JavaScript 函数调用
- [[antv-g2]] —— 都受 Grammar of Graphics 影响，只是生态和语法选择不同
- [[echarts]] —— ECharts 更像现成图表组件库，Vega-Lite 更强调语法组合和可编译 spec
- [[plotly-js]] —— Plotly.js 也用 JSON 描述图表，但 Vega-Lite 的语法更贴近 mark/encoding/transform

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[altair]] —— Altair — Python 上的 Vega-Lite 绑定
- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[leaflet]] —— Leaflet — 轻量交互式地图
- [[mapbox-gl-js]] —— Mapbox GL JS — 矢量瓦片 + WebGL 客户端渲染地图
- [[matplotlib]] —— matplotlib — Python 绘图基石
- [[projects/panel]] —— Panel — 多绘图后端的 Python dashboard
- [[seaborn]] —— seaborn — matplotlib 之上的一行统计图
