---
title: ApexCharts — 自带响应式与注解的 SVG 图表库
来源: 'ApexCharts.js 仓库与官网, https://github.com/apexcharts/apexcharts.js + https://apexcharts.com/'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 初级
provenance: pipeline-v3
---

## 是什么

ApexCharts 是一个**走 SVG 路线、自带响应式与注解、配齐三大框架 wrapper 的开箱图表库**。你给它一段 series 数据加几行 chart 配置，它就吐出折线、柱状、面积、饼、雷达、热力、treemap、K 线等十几种图。日常类比：像超市里的预制菜——已经切好配好酱包，回家加热三分钟上桌；ApexCharts 的预制菜里还附赠"放大镜小图（Sparkline）"和"在某天画一条参考线（annotation）"两道小菜。

底层直接画 SVG（基于 SVG.js 衍生的渲染层）。这条路线决定了它的强项和短板：DOM 节点可以被 CSS 改样式、被 DevTools inspect、动画过渡顺滑；代价是数据点超过五万左右就开始掉帧。

跟 [[echarts]] 是一对镜像选择——ECharts 走 Canvas，百万点不卡但样式难改；ApexCharts 走 SVG，样式随心改但只适合中量数据。

## 为什么重要

不理解 ApexCharts 的取舍，下面这些事都解释不了：

- 为什么后台模板（Vuexy / Sneat / Materio 这种付费 admin template）几乎清一色配 ApexCharts，而不是 ECharts 或 Chart.js
- 为什么 Sparkline（一行一个 KPI 旁边的小趋势线）这种场景 ApexCharts 一个 prop 搞定，别家要自己拼
- 为什么 react-apexcharts 包不到 200 行——它真的只是一个挂载/卸载薄壳
- 为什么图表上"标一条参考线说今天发版了"这种需求，用 ApexCharts 写五行，用 Chart.js 要装插件

## 核心要点

ApexCharts 配置的心智模型可以收敛到 **5 段**：

1. **chart**：画布元属性——`type` 决定主图类型（line / bar / pie / heatmap...）、`height` 容器高度、`toolbar` 工具栏、`animations` 动画。
2. **series**：数据数组，每个元素是一个图层。两种数据形态：纯数值 `[10, 20, 30]` 或键值对 `[{x: '2026-01', y: 10}, ...]`。混用会让部分图类型静默渲染异常。
3. **xaxis / yaxis**：坐标轴配置——type（category / datetime / numeric）、tick 格式化、min/max。
4. **responsive**：响应式断点数组，按**窗口宽度**切配置。开箱即用，不用自己写 ResizeObserver 的逻辑。
5. **annotations**：区域、点、文字三类标注——业务里"标 11 月 1 日发版"、"高亮 9-12 点高峰段"这种需求一行配置完事。

把这 5 段记住，剩下都是查 option 文档。

## 实践案例

### 案例 1：5 行画一个折线图

```js
import ApexCharts from 'apexcharts'

const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'line', height: 350 },
  series: [{ name: '订单', data: [10, 41, 35, 51, 49, 62] }],
  xaxis: { categories: ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月'] }
})
chart.render()
```

`new ApexCharts` 拿容器+配置，`render()` 触发首次渲染。后续 `chart.updateSeries(newData)` 增量更新，不用重建实例。

### 案例 2：Sparkline——卡片旁的迷你趋势

```js
new ApexCharts(el, {
  chart: { type: 'area', height: 60, sparkline: { enabled: true } },
  series: [{ data: last30Days }],
  stroke: { width: 2 },
  tooltip: { fixed: { enabled: false } }
}).render()
```

`sparkline.enabled = true` 一打开，库自己把坐标轴、网格、图例、padding 全砍掉，只留一根曲线。这是 ApexCharts 比 ECharts/Chart.js 更适合做仪表盘卡片的关键功能——别家要么自己手动隐藏一堆字段，要么装额外插件。

### 案例 3：annotations 标注关键时间点

```js
{
  annotations: {
    xaxis: [{
      x: new Date('2026-03-15').getTime(),
      borderColor: '#FF4560',
      label: { text: 'v2 上线' }
    }],
    yaxis: [{ y: 100, borderColor: '#00E396', label: { text: '目标线' } }]
  }
}
```

红色竖线标"v2 上线那一天"，绿色横线标"目标 100 单"。Chart.js 这类功能要装 chartjs-plugin-annotation，ApexCharts 内置。

### 案例 4：React wrapper 用法

```jsx
import Chart from 'react-apexcharts'

export function Sales({ data }) {
  const options = { chart: { type: 'bar' }, xaxis: { categories: data.months } }
  const series = [{ name: '收入', data: data.values }]
  return <Chart options={options} series={series} type="bar" height={350} />
}
```

react-apexcharts 内部就是 `componentDidMount` 时 `new ApexCharts(...).render()`，`componentDidUpdate` 比对 props 决定 `updateOptions` 还是 `updateSeries`，卸载 `destroy()`。vue-apexcharts / ng-apexcharts 同样套路，所有官方 wrapper 都不到 200 行——前提是核心库自己已经把 imperative API 做完整了。

## 踩过的坑

1. **series 必须换引用才触发重渲染**：React/Vue 里 `series[0].data.push(x)` 这种 in-place mutate 不会让 wrapper 检测到变化。要 `setSeries([{...series[0], data: [...series[0].data, x]}])`。这是所有响应式框架 + 配置式图表库的通病。
2. **数据格式两种混用静默异常**：同一个 series 里既有 `[10, 20]` 又有 `[{x, y}]`，部分图类型（heatmap / range bar）会渲染空或错位，**不报错**。统一格式。
3. **destroy 漏调内存泄漏**：SPA 切路由时不 `chart.destroy()`，SVG DOM 残留 + window resize 监听器不清理，几次切换后内存翻倍。React/Vue wrapper 在 unmount 自动调，但裸 JS 用法要记得自己调。
4. **toolbar 默认开但视觉不轻**：admin 后台常嫌右上角那排图标抢风头，要 `chart.toolbar: { show: false }` 关掉。
5. **animations 大屏场景要关**：默认动画在仪表盘批量初始化 12 个图时会闪一下、有延迟感。`chart.animations: { enabled: false }` 关掉，刷新瞬间出图。
6. **responsive 断点是窗口宽度不是图表宽度**：很多人以为是 chart 容器宽度，结果在弹窗/抽屉里窗口很宽但容器很窄，断点不触发。要么自己监听 ResizeObserver，要么在 wrapper 外层 key 上重建。

## 适用 vs 不适用场景

**适用**：

- admin 后台、SaaS 控制台仪表盘——Sparkline + annotation + responsive 三件套全自带
- 中量数据（百到一万点）——SVG 方案在这个区间样式可控、动画顺滑
- 需要导出 SVG/PNG/CSV——toolbar 默认带，不用自己拼
- React / Vue / Angular 都要支持——三套 wrapper 官方维护，迁移成本低
- 想用 CSS 改图表局部样式（比如品牌色覆盖、暗黑模式）——SVG 节点直接被 CSS 覆盖

**不适用**：

- 大数据量（5 万点以上）——SVG 节点数撑不住，选 [[echarts]] / [[plotly-js]] 走 Canvas
- 极致 bundle 大小（< 50KB）——ApexCharts 全量约 150KB
- 完全自定义视觉（艺术化数据图、不规则布局）——选 [[d3]] 自己拼
- Grammar of Graphics 心智（用变量映射想图）——选 [[vega-lite]] / [[observable-plot]]
- React 组件树里需要 hooks 控制每个图元——选 [[recharts]] / [[visx]]

## 历史小故事（可跳过）

- **2018 年**：ApexCharts 1.0 开源，作者 Juned Chhipa，起点是给商业 admin 模板做配套图表层——这解释了为什么它的 toolbar、Sparkline、annotation 全是后台仪表盘最常见的需求
- **2019 年**：react-apexcharts、vue-apexcharts 官方 wrapper 出炉，wrapper 仓库与核心库分开维护
- **2020-2021 年**：v3 重写，加 ng-apexcharts（Angular 官方支持），三大框架齐活
- **2022-2023 年**：v3.x 持续 minor，加 treemap、boxplot、polar area 等图类型
- **2024 年**：v4 进入预览，目标砍体积、改 build pipeline、treeshaking 友好；v3 仍是稳定主线
- **2026 年**：~14k star，MIT 协议，定位"商用 Highcharts 的开源对标"

## 学到什么

1. **SVG vs Canvas 是路线不是优劣**：ApexCharts 选 SVG 换来"样式可改 / DOM 可查 / 动画顺滑"，代价是大数据掉帧。ECharts 选 Canvas 换百万点，代价是样式难深度改。选哪个看数据量级和样式定制需求。
2. **声明式配置 + 薄壳 wrapper**：官方 wrapper 不到 200 行的前提，是核心库自带完整 imperative API（render / updateSeries / updateOptions / destroy）。封装层只负责 mount/update/unmount 的桥接，不重新造一套响应式状态。这套思路 [[echarts]] / [[chart-js]] 同样适用。
3. **场景定位决定功能集**：ApexCharts 把 Sparkline、annotation、toolbar 做成内置一等公民，因为 admin 模板场景就是它的出生地。Chart.js 没把这些做内置，是因为 Chart.js 出生在博客嵌图表的轻量场景。库的功能取舍永远跟它最早的客户绑定。
4. **响应式开箱即用是少数派优势**：大多数图表库把响应式甩给消费者写 ResizeObserver，ApexCharts 把 breakpoints 数组做进配置——这种"在配置层就能表达响应式"的能力，省下来的样板代码可观。

## 延伸阅读

- 官方文档：[apexcharts.com/docs](https://apexcharts.com/docs/)——配置项手册 + 在线编辑器
- 仓库：[github.com/apexcharts/apexcharts.js](https://github.com/apexcharts/apexcharts.js)
- React wrapper：[github.com/apexcharts/react-apexcharts](https://github.com/apexcharts/react-apexcharts)
- Vue wrapper：[github.com/apexcharts/vue-apexcharts](https://github.com/apexcharts/vue-apexcharts)
- Angular wrapper：[github.com/apexcharts/ng-apexcharts](https://github.com/apexcharts/ng-apexcharts)
- [[echarts]] —— Canvas-first 的镜像选择，对照阅读
- [[chart-js]] —— 同走 Canvas 的轻量级方案，体积更小但功能更少

## 关联

- [[echarts]] —— SVG vs Canvas 的镜像选择，路线相反
- [[chart-js]] —— 同样定位 admin 后台但 Canvas 路线 + 更轻
- [[recharts]] —— React-only JSX 组件式，跨框架场景对比 ApexCharts 配置式
- [[d3]] —— 底层乐高，需要完全自定义视觉时换它
- [[plotly-js]] —— 同样 JSON 配置但偏科研可视化
- [[storybook]] —— 给 ApexCharts 配置项做 visual catalog
- [[playwright]] —— 跨浏览器视觉回归测试图表渲染

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台
- [[vega-lite]] —— Vega-Lite — 用 JSON 三段式画复合图
- [[visx]] —— visx — 把 d3 拆成 30 块乐高的 React 可视化原语

