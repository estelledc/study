---
title: Apache ECharts 配置式数据可视化
description: 不是底层乐高，是开箱图表 + 声明式 option JSON——把 17 种 series 类型 + zrender 自家渲染层封装成一个 setOption 调用
来源: https://github.com/apache/echarts + Apache ECharts 官网（echarts.apache.org）
season: 20
episode: 2
tier: champion
category: tool-library
status: published
---

import Figure from '../../../components/Figure.astro';

## 一句话定位

Apache ECharts 不是底层乐高，是**开箱即用的图表库 + 声明式 option JSON**——把 17 种 series 类型（line / bar / pie / scatter / heatmap / graph / treemap / sankey / sunburst / parallel / candlestick / boxplot / themeRiver / tree / map / radar / lines / pictorialBar / custom）封装在一个 `setOption(option)` 的配置对象里。和 [d3](./d3) 形成互补：d3 是**写图表库的底层乐高**，ECharts 是**写好了的图表库**。

历史定位：

- **2013**：百度商业前端团队（FEX）开源 ECharts 1.0；起点是商业 BI dashboard，针对中文移动端 + 大数据场景
- **2014-2017**：ECharts 2 / 3 / 4 迭代；v3 引入 SVG backend，v4 引入 dataset 把数据和配置解耦
- **2018-01**：进入 Apache 软件基金会孵化器，是中国前端项目首个进 ASF 孵化的
- **2021-01**：毕业为 Apache 顶级项目（TLP），同时发布 ECharts v5——加入 Universal Transition、Aria 无障碍、按需引入完整支持
- **2024-2026**：v5.4 / v5.5 维护期，每年 minor + 频繁 patch；Apache 治理保证不被单一厂商裹挟

> "ECharts 是一个使用 JavaScript 实现的开源可视化库，可流畅地运行在 PC 和移动设备上，兼容当前绝大部分浏览器（IE9/10/11，Chrome，Firefox，Safari 等），底层依赖矢量图形库 ZRender，提供直观、交互丰富、可高度个性化定制的数据可视化图表。"——来自 [echarts.apache.org](https://echarts.apache.org/) 首页定义

## Layer 0 项目档案

| 字段 | 值 |
|------|----|
| 仓库 | apache/echarts（核心 + 子包） |
| Stars | 60k+（GitHub 数据可视化第二，仅次于 d3） |
| 主版本 | 5.5.x（v5 系列从 2021 起） |
| License | Apache-2.0（强 patent grant，比 d3 的 ISC 更适合企业） |
| Weekly downloads | ~1.2M（npm `echarts` 主包） |
| Apache 治理 | TLP since 2021-01；PMC + committers + 月度发版 |
| Repo | [github.com/apache/echarts](https://github.com/apache/echarts) |
| 渲染子包 | [github.com/ecomfe/zrender](https://github.com/ecomfe/zrender)（独立 repo，但同 PMC 维护） |
| CI | GitHub Actions + Travis 历史矩阵 |
| Test 框架 | jest（单元）+ playwright（视觉回归）+ visual-test 自家工具 |
| TS 支持 | 仓库内置完整 .d.ts；v5 起核心代码迁 TypeScript |
| Bundle 大小 | 全量 ~1MB min+gzip / 按需引入可降到 100-200KB |
| Tree-shake | 支持，但需用 `import { ... } from 'echarts/core'` 显式引入 |
| 子包 / series 数 | 17 种内置 series + 12 种 component（grid / polar / radar / dataZoom / visualMap / tooltip / title / legend / toolbox / brush / geo / parallel） |
| 依赖 | zrender（自家渲染层）+ tslib（TS runtime helper）—— 仅 2 个 |
| 生态包装 | [vue-echarts](https://github.com/ecomfe/vue-echarts) / [echarts-for-react](https://github.com/hustcc/echarts-for-react) / [ngx-echarts](https://github.com/xieziyu/ngx-echarts) |

## Layer 1 核心抽象

ECharts 的所有 API 表面可以归结为 3 个核心抽象：option、series、component。理解了这 3 个，剩下 17 种图表类型都是 series 的 type 字段不同。

### 抽象 1：option（声明式配置对象）

ECharts 的核心契约就一句话：**你给我一个 JSON，我画图**。

```js
echarts.init(dom).setOption({
  title: { text: '销量' },
  tooltip: {},
  legend: { data: ['销量'] },
  xAxis: { data: ['衬衫', '羊毛衫', '裤子'] },
  yAxis: {},
  series: [{ name: '销量', type: 'bar', data: [5, 20, 36] }]
})
```

option 是一个**深嵌套的 JSON 对象**，顶层字段覆盖所有视觉元素：

- `title` / `legend` / `tooltip` / `toolbox` / `grid` / `axisPointer` —— UI 组件
- `xAxis` / `yAxis` / `radiusAxis` / `angleAxis` / `polar` / `radar` / `geo` —— 坐标系
- `dataZoom` / `visualMap` / `brush` —— 数据交互
- `dataset` —— 数据源（v4+）
- `series` —— 必填，数组，每个元素描述一个图层
- `animation` / `animationDuration` / `animationEasing` —— 动画总开关
- `media` —— 响应式断点（针对移动端）

类比：option 就像 CSS——你不告诉浏览器"画个红色矩形在 (50, 50) 位置"，你告诉它"这个 div `background: red; left: 50px`"。声明式。具体怎么变成像素，ECharts 自己 figure out。

### 抽象 2：series（图层 + 类型多态）

`series` 是个数组，每个元素是一个**图层（layer）**——不同 type 决定它怎么渲染。同一个图表里可以叠多个 series：

```js
series: [
  { type: 'bar', data: [...] },          // 柱
  { type: 'line', data: [...] },         // 折线
  { type: 'scatter', data: [...] }       // 散点
]
```

17 种 series 类型按用途分组：

- **直角坐标系**：line / bar / scatter / boxplot / candlestick / heatmap / pictorialBar
- **极坐标系 / 雷达**：radar / pie / sunburst
- **关系图**：graph（力导向）/ tree / treemap / sankey / parallel
- **地理**：map / lines（迁徙图）
- **专用**：themeRiver / custom（自定义渲染回调）

每种 series 是 **一个独立的子模块**——`echarts/lib/chart/line/install` 就是 line 的入口。这是按需引入的基础。

### 抽象 3：component（坐标系 + 交互组件）

component 是和 series 平行的概念——series 管"画什么"，component 管"怎么交互、坐标系怎么布局"。常用 12 种：

- 坐标系：grid（直角）/ polar / radar / geo / parallel / calendar / single
- 交互：dataZoom（缩放）/ visualMap（颜色/大小映射） / brush（框选）
- UI：title / legend / tooltip / toolbox / axisPointer / markPoint / markLine / markArea

按需引入时**坐标系组件必须显式 import**——这是初学最常踩的坑：`import { LineChart } from 'echarts/charts'` 但忘了 `import { GridComponent } from 'echarts/components'`，结果折线图没坐标轴。

## Layer 2 渲染引擎 zrender

ECharts 不直接写 DOM，它写**zrender 的虚拟图元树**，再让 zrender 落到 Canvas / SVG。zrender 是 ECharts 的"渲染抽象层"，类比关系：

| 项目 | 渲染抽象层 | 落地后端 |
|------|------------|----------|
| ECharts | zrender | Canvas / SVG / VML（IE8） |
| Recharts | React DOM | SVG |
| Chart.js | 内置 | Canvas（仅 Canvas，无 SVG） |
| d3 | 无（直接写 DOM） | SVG / Canvas（手写） |
| react-konva | Konva | Canvas |
| fabric.js | 自家 | Canvas |

zrender 的核心抽象：

- **Element**：基类，所有图元（Rect / Circle / Path / Text / Image / Group / Sector）的父类
- **Storage**：z-order 树，管理图元层级
- **Painter**：渲染后端，CanvasPainter 写 `<canvas>`，SVGPainter 写 `<svg>`
- **Animation**：基于 `requestAnimationFrame` 的 timeline，按 ease 函数插值

**为什么 ECharts 要自己造一个 zrender 而不直接用 SVG？** 这是 2013 年的历史决策：当时 IE8 还活着，IE8 没有 SVG（只有 VML），SVG 渲染上千节点也卡顿。Canvas 在大数据场景（万级散点、热力图）压倒性快。所以 zrender 出生就是 Canvas-first，SVG 是后加的备选 backend——这跟 d3 的 SVG-first 思路完全相反。

到了 2026 年，IE8 早死了，但 zrender 的 Canvas/SVG 双 backend 价值仍在：

- **Canvas backend**：大数据（>10k 点）、动画密集场景
- **SVG backend**：SSR 服务端渲染、高 DPI 报告导出（PDF）、可访问性 + 可选中文字

切换只需 `echarts.init(dom, null, { renderer: 'svg' })`——业务代码零改动。这是 zrender 抽象层带来的红利。

## Layer 3 精读 3 段

### 段 a：option 设计——声明式 JSON vs d3 命令式

ECharts 的 option 是一个深嵌套 JSON。和 d3 的对比是教科书级的"声明式 vs 命令式"对照。

**d3 命令式画一个柱状图**（伪代码，~15 行）：

```js
const svg = d3.select('body').append('svg').attr('width', 800).attr('height', 400)
const x = d3.scaleBand().domain(data.map(d => d.name)).range([0, 800]).padding(0.1)
const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value)]).range([400, 0])
svg.selectAll('rect').data(data).join('rect')
  .attr('x', d => x(d.name))
  .attr('y', d => y(d.value))
  .attr('width', x.bandwidth())
  .attr('height', d => 400 - y(d.value))
  .attr('fill', 'steelblue')
svg.append('g').attr('transform', 'translate(0,400)').call(d3.axisBottom(x))
svg.append('g').call(d3.axisLeft(y))
```

**ECharts 声明式画同一个图**（~6 行）：

```js
echarts.init(dom).setOption({
  xAxis: { type: 'category', data: data.map(d => d.name) },
  yAxis: {},
  series: [{ type: 'bar', data: data.map(d => d.value), itemStyle: { color: 'steelblue' } }]
})
```

差异不只是行数。**心智模型**完全不同：

- d3 让你**思考过程**：先 scale，再 join，再 attr，再 axis。每一步是一个动作。
- ECharts 让你**思考结果**：我要 type=bar 的柱状图，给我画。具体过程是 ECharts 决定。

> 怀疑：ECharts option 声明式设计是不是 React 时代的产物？回答其实相反——ECharts 2013 出生就是 option，比 React (2013-05) 还早几个月。但**声明式 UI** 这个范式在 2013 年还没普及，ECharts 是中国前端社区早期声明式探索之一。后来 React 流行让大家更接受这种模式，反过来给 ECharts 做了背书。但 d3 命令式在小数据集 + 高自定义场景仍然有优势——你做一个不规则蜂巢热力图，ECharts 的 custom series 写起来不一定比 d3 短。

option 的内部实现（伪代码）：

```ts
class ECharts {
  private _model: GlobalModel  // option 解析后的 model 树
  private _chartsViews: ChartView[] = []
  setOption(option) {
    this._model = parseOption(option)
    // diff 旧 model 和新 model，决定哪些 series 增删改
    const diff = diffModel(this._oldModel, this._model)
    this._render(diff)
  }
}
```

`_model` 是 ECharts 内部的 IR（intermediate representation），option JSON 经过一轮 normalize / merge / 默认值填充变成这个 model 树，然后 diff 渲染。这跟 React 的 Virtual DOM 机制神似——都是把声明式描述变成 IR 再 diff。

链接示意：[apache/echarts core entry](https://github.com/apache/echarts/blob/0123456789abcdef0123456789abcdef01234567/src/core/echarts.ts) 大约 200 行附近的 `setOption` 实现。

### 段 b：Universal Transition——series 类型间的形变动画

v5.1（2021-06）引入的 **Universal Transition** 是 ECharts 跨版本最酷的特性——允许一个 pie 图变成 bar 图，bar 图变成 scatter 图，过渡是平滑形变动画，不是先消失再出现。

API 看起来很简单：

```js
chart.setOption({
  series: [{
    type: 'pie',
    universalTransition: true,
    data: [...]
  }]
})

// 一段时间后
chart.setOption({
  series: [{
    type: 'bar',
    universalTransition: true,
    data: [...]
  }]
})
```

`universalTransition: true` 一开，ECharts 会做这些事：

1. **建立 ID 对应关系**：每个 data 项需要一个稳定 id（手动 `data: [{id: 'apple', value: 5}]` 或 ECharts 自动从 dimension 推断）
2. **计算插值路径**：pie 的扇区是一个 Path（带 startAngle / endAngle），bar 的矩形也是一个 Path（rect to path）。用 SVG path morphing 算法（基于 [flubber](https://github.com/veltman/flubber) 思路）找一组中间帧
3. **逐帧渲染**：在 zrender 的 Animation engine 里调度，每帧 `requestAnimationFrame` 推进一次

> 怀疑：Universal Transition 的实现是不是被 GSAP / motion-one 启发？时序 reconciliation 算法是否文档化？我没在 ECharts 源码 README 找到明确引用，但 path morphing 这个数学问题在 graphics 社区早就有公开论文（Surazhsky 2003 关于 SVG path interpolation）。ECharts 自家实现可能受 [d3-interpolate](https://github.com/d3/d3-interpolate) 和 flubber.js 启发——这两个都是 path morphing 的开源参考实现。

链接示意：[apache/echarts universal transition impl](https://github.com/apache/echarts/blob/abcdef0123456789abcdef0123456789abcdef01/src/animation/universalTransition.ts) —— 这是 v5.1 引入的新文件。

**为什么 d3 不内置类似功能？** 因为 d3 的哲学是"我给你乐高"——data join + transition 子模块就是工具，至于怎么把 pie 变 bar，你自己组合。ECharts 是开箱即用，所以把这种高层动画封装好。

### 段 c：dataZoom + 大数据 sampling

ECharts 一个杀手锏是**百万数据点不卡**。原理是 series 内置的 **sampling 策略**：

```js
series: [{
  type: 'line',
  data: bigArray,       // 100万个点
  sampling: 'lttb',     // Largest-Triangle-Three-Buckets 算法
  large: true,
  largeThreshold: 2000
}]
```

`sampling` 字段支持 4 种值：

- `'average'`：等区间平均
- `'min'` / `'max'`：取每个区间最小 / 最大
- `'sum'`：求和
- `'lttb'`：[LTTB 算法](https://github.com/sveinn-steinarsson/flot-downsample)，2013 年 Sveinn Steinarsson 论文提出，保留视觉特征点（峰谷）的 downsampling

LTTB 的核心思想是"对每个 bucket，选一个能让相邻三角形面积最大的点"——直觉上保留了视觉上最显眼的拐点，丢掉视觉冗余的中间点。100 万个点 sampling 到 2000 个，肉眼看曲线形状几乎一致。

**dataZoom** 配合 sampling 实现"概览 + 缩放" UI：

- `dataZoom: [{ type: 'slider', start: 0, end: 100 }]` —— 底部加一条滑块
- `dataZoom: [{ type: 'inside' }]` —— 鼠标滚轮缩放
- 缩放时**重新触发 sampling**——窗口越窄，每个像素覆盖的原始点越少，最终渲染的 sample 点越接近 1:1

> 怀疑：sampling 在 zoom 时的 throttle / debounce 策略是不是源码里硬编码的？如果用户拖 dataZoom 滑块拖得很快，每一帧都重新跑 LTTB（O(n) per bucket），会不会卡？我倾向于 ECharts 内部用了 `requestAnimationFrame` 节流，但具体节流间隔需要看源码确认。

链接示意：[ecomfe/zrender Painter](https://github.com/ecomfe/zrender/blob/fedcba9876543210fedcba9876543210fedcba98/src/Painter.ts) —— Canvas backend 的核心绘制循环。

## 架构总览

<Figure
  src="/projects/echarts/01-architecture.webp"
  alt="ECharts 架构四层：上层 option JSON（title/legend/tooltip/grid/xAxis/yAxis/dataZoom/visualMap/toolbox），中层 series 17 种 + component；下层 zrender 渲染（Canvas / SVG painter / Storage / Animation engine）；右侧数据层 dataset / dataZoom / Universal Transition / sampling"
  caption="ECharts 四层架构。上：声明式 option JSON。中：series（17 种图表类型，每个独立可 tree-shake）+ component（坐标系 + 交互组件）。下：zrender 渲染抽象层（Canvas / SVG 双 backend + Animation engine）。右：数据层（dataset 解耦 + dataZoom 缩放 + Universal Transition 跨类型动画 + LTTB sampling）。和 d3 关键差异——d3 直接写真实 DOM，没有 zrender 这一层；和 Recharts 关键差异——Recharts 用 React 管 DOM，ECharts 用自家 zrender 不依赖框架"
/>

## Layer 4 API 表面 + 框架集成

### 原生 JS

最小可运行单元就 3 行：

```js
import * as echarts from 'echarts'
const chart = echarts.init(document.getElementById('main'))
chart.setOption({ /* option */ })
```

实例方法：

- `setOption(option, opts)` —— 设置 / 更新 option，第二参 `notMerge: true` 强制覆盖
- `getOption()` —— 拿当前 option
- `resize()` —— 容器尺寸变了要手动调（ECharts 不监听 ResizeObserver，要自己接）
- `dispatchAction({ type, ... })` —— 编程式触发交互（高亮、tooltip、dataZoom）
- `on(event, handler)` —— 事件，包括 click / mouseover / legendselectchanged / datazoom 等
- `dispose()` —— 销毁，必须手动调，否则 zrender 的 RAF 循环会泄漏

### 按需引入（v5 主推）

全量 import 1MB 太重，v5 起官方主推按需：

```js
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])
```

这种写法 bundle 可降到 100-200KB。痛点是初学者经常忘了 `use(...)` 导致运行时报错。

### Vue 集成（vue-echarts）

```vue
<template>
  <v-chart :option="option" autoresize />
</template>

<script setup>
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart])

const option = ref({ /* ... */ })
</script>
```

vue-echarts 是个**很薄的壳**——本质就是 `<canvas>` + `onMounted(() => echarts.init().setOption())` + watch option 变化时 setOption。

### React 集成（echarts-for-react）

```jsx
import ReactECharts from 'echarts-for-react'

function Chart() {
  return <ReactECharts option={option} style={{ height: 400 }} />
}
```

也是同样的薄壳。**和 d3 在 React 里的张力消失了**——d3 直接写 DOM，React 也想管 DOM，会打架；ECharts 写 zrender，React 只看到一个 `<div>` 容器，互不干涉。这是 ECharts 在 React 时代仍能流行的关键。

### SSR

v5 起官方支持 SSR（服务端渲染）：

```js
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

const chart = echarts.init(null, null, {
  renderer: 'svg',
  ssr: true,
  width: 800, height: 600
})
chart.setOption(option)
const svgString = chart.renderToSVGString()
chart.dispose()
```

SSR 必须用 SVG renderer，因为 Canvas 在 Node 端要 `node-canvas` 这种重依赖。SVG 是字符串拼接，无依赖。

## Layer 5 六维对比表

| 维度 | d3 | Observable Plot | Chart.js | ECharts | Vega-Lite | Highcharts | Recharts |
|------|----|-----------------|----------|---------|-----------|------------|----------|
| 抽象层级 | 最低（乐高） | 中（grammar） | 高（图表） | 高（图表） | 中（grammar） | 高（图表） | 高（React 组件） |
| 学习曲线 | 陡峭 | 平缓 | 平缓 | 中等（option 嵌套深） | 中等（JSON DSL） | 平缓 | 平缓 |
| 灵活度 | 极高 | 中 | 低 | 高（custom series） | 中 | 中 | 中 |
| 性能（大数据） | 看你怎么写 | 一般 | 一般 | 高（LTTB sampling） | 一般 | 中 | 一般（受 React diff 拖累） |
| Bundle | 子包 5-30KB | ~80KB | ~70KB | 100-1000KB | ~150KB | ~200KB | ~150KB |
| SSR | 难（要 jsdom） | 难 | 难 | 内置 SVG SSR | 内置 | 商业版有 | 难 |
| 商业 license | ISC（免费） | ISC | MIT | Apache-2.0 | BSD-3 | 商业（个人免费） | MIT |

## Layer 6 限制 ≥ 4 条

ECharts 不是银弹，明确的限制：

### 限制 1：全量 bundle 大（~1MB），按需引入门槛

`import * as echarts from 'echarts'` 全量是 ~1MB min+gzip。要降到 100-200KB 必须按需，但按需的心智模型是：

- 你要用 `LineChart`，必须 `use(LineChart)`
- 但 LineChart 自己要 GridComponent 才能有坐标轴，必须 `use(GridComponent)`
- 你想要 tooltip，必须 `use(TooltipComponent)`
- 你想要 legend，必须 `use(LegendComponent)`
- 想要响应式 resize，可能还要 `use(ContainerComponent)`（看版本）

这套依赖图官方文档不直观，新手常常 import 错了组件，运行时 silent fail——折线图显示出来但没坐标轴。

### 限制 2：option 嵌套深（5-6 层），新手心智模型重

一个完整的折线图 option：

```js
{
  title: { text, subtext, textStyle: { color, fontSize } },
  tooltip: { trigger, axisPointer: { type, snap } },
  legend: { data, type, orient, top },
  grid: { left, right, top, bottom, containLabel },
  xAxis: { type, data, axisLabel: { rotate, formatter }, splitLine: { show } },
  yAxis: { type, min, max, axisLabel: { formatter } },
  dataZoom: [{ type, start, end, xAxisIndex }],
  series: [{
    name, type, data, smooth, symbol, symbolSize,
    lineStyle: { color, width, type },
    itemStyle: { color, borderRadius },
    label: { show, position, formatter },
    emphasis: { focus, itemStyle, label },
    markLine: { data: [{ type: 'average' }] }
  }]
}
```

光是 series 一个对象就 6 层。初学者要么靠官方编辑器试错，要么靠 ChatGPT 翻 schema。

### 限制 3：custom series API 不太一致

当内置 17 种 series 满足不了需求时，要写 `type: 'custom'`，提供 `renderItem(params, api)` 回调。但这个 API 设计有点别扭：

- `api.value(0)` —— 拿当前数据点的第 0 维值
- `api.coord([x, y])` —— 把数据空间转屏幕空间
- `api.size([1, 1])` —— 拿坐标系单位的像素尺寸

返回的对象是 zrender 的 ShapeProto——但 zrender 内部 API 没完全公开 doc，custom series 写起来要看源码或 issue。这跟 d3 的 `g.append('path').attr('d', ...)` 简洁度差距很大。

### 限制 4：移动端 SVG renderer 性能不如桌面 Canvas

ECharts 在 zrender 层抽象了 Canvas / SVG，但**两者性能不对等**：

- Canvas backend：万级点 60fps OK，dataZoom 拖动不卡
- SVG backend：千级以上节点开始有 jank，特别是 iOS Safari

移动端用 Canvas 默认是对的，但 Canvas 不能选中文字、不能 a11y。如果做仪表盘需要 SSR + 高 DPI 截图，要在 Canvas（客户端）和 SVG（服务端）之间切，业务代码要分两套。

## 怀疑段（汇总）

> **怀疑 1**：ECharts option 声明式设计是不是 React 时代的产物？回答相反：ECharts (2013-06) 比 React (2013-05) 晚一个月，但**声明式 UI** 范式在 2013 年还没普及。ECharts 是中国前端社区早期声明式探索之一。后来 React 流行反过来给 ECharts 做了背书。但 d3 命令式在小数据集 + 高自定义场景仍有优势——做不规则蜂巢热力图，ECharts custom series 写起来不一定比 d3 短。

> **怀疑 2**：Universal Transition 的实现是不是被 GSAP / motion-one 启发？时序 reconciliation 算法是否文档化？我没在 ECharts 源码 README 找到明确引用，但 path morphing 在 graphics 社区早有公开论文（Surazhsky 2003 SVG path interpolation）。ECharts 自家实现可能受 d3-interpolate 和 flubber.js 启发——这两个都是 path morphing 的开源参考实现。需要翻 v5.1 release notes 和当年 PMC 邮件列表才能确认。

> **怀疑 3**：sampling 在 dataZoom 拖动时的 throttle / debounce 策略是不是源码里硬编码的？如果用户拖滑块很快，每帧都重跑 LTTB（O(n) per bucket）会不会卡？我倾向于 ECharts 内部用了 RAF 节流，但具体节流间隔（16ms / 32ms / 50ms）需要看源码确认。如果是 16ms（即每帧），高刷屏 120Hz 下其实是 8ms 任务，反而更紧。

> **怀疑 4**：zrender 自己造一个 Canvas/SVG 抽象层 vs 直接用浏览器原生 SVG，2026 年来看是不是过度工程？反方观点：CanvasKit (Skia 编译到 WASM) 已经成熟，Figma / Polotno 等都在用。zrender 的 Painter 抽象本可以直接换 CanvasKit 后端，但 ECharts 至今没尝试。这是技术债还是审慎不冒险？我倾向于后者——Apache 顶级项目稳定性优先，breaking change 谁也不敢做。

> **怀疑 5**：ECharts 进 Apache 的代价是什么？Apache 治理（PMC + 邮件列表 + 月度发版）在中国前端项目里很罕见。代价之一是：所有 commit 必须有 DCO sign-off、所有依赖必须是 Apache-compatible license。这导致 ECharts 不能用 GPL / AGPL 子库——但前端可视化生态本来就是 MIT/BSD 主导，这个约束实际影响不大。

## GitHub 链接（permalink 示意）

> 注：以下 commit hash 为示意 SHA，写于 2026-05；用户实际访问需用最新 main HEAD 替换。

- ECharts 核心入口：[apache/echarts/src/core/echarts.ts @ 0123456789abcdef0123456789abcdef01234567](https://github.com/apache/echarts/blob/0123456789abcdef0123456789abcdef01234567/src/core/echarts.ts) —— `setOption` / `_render` / `_chartsViews` 主调度逻辑
- LineSeries 模型层：[apache/echarts/src/chart/line/LineSeries.ts @ abcdef0123456789abcdef0123456789abcdef01](https://github.com/apache/echarts/blob/abcdef0123456789abcdef0123456789abcdef01/src/chart/line/LineSeries.ts) —— 看一个 series 子模块的标准结构（Model + View + install）
- zrender Canvas Painter：[ecomfe/zrender/src/Painter.ts @ fedcba9876543210fedcba9876543210fedcba98](https://github.com/ecomfe/zrender/blob/fedcba9876543210fedcba9876543210fedcba98/src/Painter.ts) —— Canvas backend 主绘制循环，看 ECharts 怎么把图元落到像素
- Universal Transition 实现：[apache/echarts/src/animation/universalTransition.ts @ 1122334455667788991122334455667788990011](https://github.com/apache/echarts/blob/1122334455667788991122334455667788990011/src/animation/universalTransition.ts) —— v5.1 引入的跨 series morphing 算法

## 实战：Apache 治理后的版本节奏

进 Apache 之后 ECharts 的发版节奏有明显变化：

- **进 ASF 之前（2013-2017）**：百度内部驱动，发版随业务节点；v3 → v4 间隔 1.5 年
- **孵化器期（2018-2020）**：每月 patch 发版，季度 minor，进 Apache JIRA 跟踪 issue
- **TLP 后（2021-2026）**：v5 大版本一次定下，后续每年 1-2 个 minor（5.1 → 5.5），patch 每月一次

这种节奏对**生产级项目**很友好：

- 你 pin 在 5.4.x，未来 1-2 年不用担心 breaking change
- 安全 / 性能 patch 自动滚出来
- 重大新特性（Universal Transition 这种）攒到 minor 才进，可控

对比 d3 的"7 年 7 个大版本"（v1 → v7），ECharts 的稳定度更高。但代价是迭代速度慢——v5 已经 5 年了，没看到 v6 的 RFC。

## 学到什么 + 关联

学到的核心点：

1. **声明式 option vs 命令式 selection**：ECharts 和 d3 是同一个数据可视化问题的两个相反答案。前者结果导向，后者过程导向。理解了这个差异，你就知道什么场景选哪个。
2. **抽象层的红利**：zrender 让 ECharts 可以一行代码切 Canvas/SVG backend，这是抽象层带来的可替换性。代价是多一层间接调用 + 自己造轮子的维护成本。
3. **按需引入是 v5 的灵魂**：1MB 全量 vs 100KB 按需，差 10 倍。但心智模型变重——你要懂依赖图。
4. **Apache 治理的稳定性溢价**：进 ASF 之后版本节奏可预测，企业愿意 pin 在 5.x 用 5 年。这种稳定性是"中国前端开源项目"少见的优势。
5. **Universal Transition 是高层封装的天花板**：把 pie 变 bar 这种"过去想都不敢想"的动画做成一行配置，证明了高层图表库的封装空间还远没到顶。d3 不会做这个——因为 d3 的哲学是"我给你乐高，你自己拼"。

关联笔记：

- [[d3]] —— 同 Season 20-1 状元篇，d3 是底层乐高，ECharts 是开箱图表，互补共存
- [[gsap]] —— Universal Transition 的动画引擎相关，GSAP 是通用动画库，ECharts 是图表内置
- [[lottie]] —— 都属"声明式动画" 阵营，Lottie 是 After Effects 导出，ECharts 是数据可视化
- [[framer-motion]] —— React 生态的动画库，对照 vue-echarts 的薄壳设计哲学
- [[d3]] 的 Layer 5 对比表 vs 本笔记 Layer 5 对比表—— d3 视角和 ECharts 视角看同样 7 个项目，结论一致但侧重不同

---

写完这篇 status：S20 第二集（episode 2）。Season 20 的主题是"数据可视化高层 vs 底层"——20-1 d3（底层乐高），20-2 ECharts（高层图表）。下一集（20-3）打算写 Vega-Lite 或 Observable Plot，把"图形语法（grammar of graphics）"这条第三阵营写齐。
