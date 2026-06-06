---
title: Apache ECharts — 给一个 JSON 就能画图的可视化库
来源: 'Apache ECharts 官网与仓库, https://echarts.apache.org/ + https://github.com/apache/echarts'
日期: 2026-05-30
子分类: projects / 数据可视化
分类: 数据可视化
难度: 初级
provenance: pipeline-v3
---

## 是什么

Apache ECharts 是一个**开箱即用的图表库**：你给它一个 JSON 描述（叫 option），它就帮你画出折线图、柱状图、饼图、热力图、关系图、地图等 30 多种图表。日常类比：像点菜——你说"我要一份番茄炒蛋，少盐多糖"，厨师自己处理刀工、火候、装盘；你不用进厨房。

底层用的是自家造的渲染层叫 **zrender**，可以一行配置切换 Canvas 或 SVG 输出，不改业务代码。

跟另一个流行库 [d3](./d3) 的关系是互补：d3 像一盒乐高，给你 scale、axis、selection 这些零件，让你拼自己的图；ECharts 是已经拼好的成品，写一句 `type: 'bar'` 就有完整的柱状图。

## 为什么重要

不理解 ECharts 的设计，下面这些问题没法解释：

- 为什么国内 BI 仪表盘、运维大屏几乎清一色 ECharts，而国外更常见 d3 / Chart.js
- 为什么 ECharts 一个全量包 1MB，按需引入却能压到 100KB——它的模块边界长什么样
- 为什么百万级数据点画折线，ECharts 不卡 d3 卡——sampling 是怎么救场的
- 为什么 vue-echarts / echarts-for-react 这些封装都只有几百行——薄壳能薄成什么样

## 核心要点

ECharts 的所有 API 表面可以归到 **3 个核心抽象**：

1. **option（声明式配置）**：一个深嵌套 JSON。类比 CSS——你不告诉浏览器"画个红色矩形在 (50, 50)"，你说"`background: red; left: 50px`"。怎么变成像素是库的事。

2. **series（图层数组）**：每个元素是一个图层，`type` 字段决定它怎么画——bar / line / pie / scatter / heatmap / sankey 等 30+ 种。同一张图可以叠多种 series（柱+折线+散点同框）。

3. **component（坐标系 + 交互）**：和 series 平行的概念。series 管"画什么"，component 管"在哪个坐标系画 / 怎么交互"——grid（直角坐标）/ polar（极坐标）/ dataZoom（缩放）/ tooltip / legend。

把这三个搞清楚，剩下的细节都是查文档。

## 实践案例

### 案例 1：3 行代码画一个柱状图

```js
import * as echarts from 'echarts'
const chart = echarts.init(document.getElementById('main'))
chart.setOption({
  xAxis: { type: 'category', data: ['衬衫', '羊毛衫', '裤子'] },
  yAxis: {},
  series: [{ type: 'bar', data: [5, 20, 36] }]
})
```

`init` 拿到容器，`setOption` 喂数据。如果用 d3 写同样的图大约要 15 行（建 svg、建 scale、join data、画 rect、画 axis）。差别在心智模型：ECharts 让你思考结果，d3 让你思考过程。

### 案例 2：百万点折线 + 缩放不卡

```js
chart.setOption({
  xAxis: { type: 'time' },
  yAxis: {},
  dataZoom: [{ type: 'slider' }, { type: 'inside' }],
  series: [{ type: 'line', data: bigArray, sampling: 'lttb', large: true }]
})
```

`sampling: 'lttb'` 启用 **LTTB 算法**（Largest-Triangle-Three-Buckets，2013 年 Steinarsson 提出）。它对每个区间挑一个能让相邻三角形面积最大的点，保留视觉拐点扔掉冗余中间点。一百万点降到两千点，曲线肉眼几乎一致。`dataZoom` 提供滑块和滚轮缩放，缩放时重新触发 sampling。

### 案例 3：在 React 里用 echarts-for-react

```jsx
import ReactECharts from 'echarts-for-react'

export function Sales({ data }) {
  const option = {
    xAxis: { type: 'category', data: data.map(d => d.month) },
    yAxis: {},
    series: [{ type: 'line', data: data.map(d => d.value) }]
  }
  return <ReactECharts option={option} style={{ height: 400 }} />
}
```

这种封装本质就是 `useEffect(() => echarts.init(ref.current).setOption(option))` + 卸载时 `dispose`。React 只看到一个 `<div>` 容器，ECharts 在容器内独立画图——和 d3 直接写 DOM 跟 React 抢控制权的麻烦完全没了。

vue-echarts 同样套路，几百行包装一个组件。这两个生态封装能薄成这样，正是因为 ECharts 自己已经是个完整图表库，外壳只负责挂载和销毁。

## 踩过的坑

1. **按需引入忘了 use 组件会 silent fail**：`import { LineChart } from 'echarts/charts'` 但忘了 `GridComponent`，结果折线图渲染出来但没坐标轴，控制台还不报错——只能盯着图发现"咦怎么没轴"。LineChart 要 GridComponent 才有坐标轴；想要 tooltip 还要 TooltipComponent；想要图例还要 LegendComponent。这套依赖图官方文档不直观，新手要花一两个项目才记住。
2. **option 嵌套深 5-6 层心智重**：一个 series 内部 `itemStyle` / `lineStyle` / `emphasis` / `markLine` / `label.formatter` 全是嵌套对象，新人记不住，要么靠官方编辑器试错要么查 ChatGPT。
3. **dispose 不调会内存泄漏**：zrender 启了 `requestAnimationFrame` 循环，单页应用切路由时如果不手动 `chart.dispose()`，老图实例的动画循环还在跑——切几次页面浏览器吃满 CPU。
4. **resize 不会自动跟容器**：ECharts 不监听 ResizeObserver，容器尺寸变了你得自己 `chart.resize()`，否则图就停在初始尺寸里，缩放窗口图不动。

## 适用 vs 不适用场景

**适用**：

- 标准业务图表（BI 仪表盘、运维大屏、报表导出）——30+ 种图表覆盖 95% 需求
- 大数据量场景（万级到百万级点）——LTTB sampling + Canvas backend 是杀手锏
- 需要 SSR / 服务端导出 PDF——v5 内置 SVG SSR，无 jsdom 依赖
- 中文移动端——出生就考虑了移动端 + 中文字体
- 跨框架嵌入——原生 JS 用法 + 各框架薄壳，Vue/React/Angular 都有官方/社区维护

**不适用**：

- 完全自定义、不规则视觉（蜂巢热力、艺术化数据图）——custom series API 难写，不如 d3 直接画
- 极致 bundle 大小（小于 50KB）——按需引入最低也要 100KB 左右
- 需要深度复用 React 组件树、用 hooks 控制每个图元——选 Recharts / visx
- 需要 Grammar of Graphics 风格的声明（图形语法）——选 Vega-Lite / Observable Plot

## 历史小故事（可跳过）

- **2013 年**：百度前端团队（FEX）开源 ECharts 1.0，起点是商业 BI dashboard，针对中文移动端 + 大数据
- **2014-2017 年**：v2 / v3 / v4 迭代；v3 加 SVG backend，v4 引入 dataset 把数据和配置解耦
- **2018-01**：进 Apache 软件基金会孵化器，是中国前端项目首个进 ASF 的
- **2021-01**：毕业为 Apache 顶级项目（TLP），同时发 v5——按需引入 + Universal Transition + 无障碍 Aria
- **2024-2026**：v5.4 / v5.5 维护期，每年一两个 minor，每月 patch，Apache 治理保证不被单一厂商裹挟

为什么当年要自己造一个 zrender 而不直接用 SVG？2013 年 IE8 还活着，IE8 没有 SVG 只有 VML，加上 SVG 渲染上千节点就卡，Canvas 在大数据场景碾压。所以 zrender 出生就是 Canvas-first，SVG 是后加的备选——这跟 d3 的 SVG-first 思路完全相反。

## 学到什么

1. **声明式 vs 命令式**：ECharts 和 d3 是同一个可视化问题的两种相反答案。前者结果导向，后者过程导向——选哪个看场景，不是哪个更好。
2. **抽象层的红利**：zrender 让 ECharts 一行切 Canvas/SVG backend，是抽象层换来的可替换性。代价是多一层间接调用 + 自己造轮子的维护。
3. **按需引入是 v5 的灵魂**：1MB 全量 vs 100KB 按需差 10 倍。前提是你愿意背依赖图——LineChart 要 GridComponent 要 TooltipComponent。
4. **Apache 治理的稳定性溢价**：进 ASF 之后版本节奏可预测，企业愿意 pin 在 5.x 用五年。这种稳定度在国内开源项目里少见。
5. **Universal Transition 是高层封装的天花板**：v5.1 里把饼图变柱图这种过去想都不敢想的动画做成一行 `universalTransition: true`，证明高层图表库的封装空间还远没到顶。d3 的哲学不会做这个——它给你乐高让你自己拼。

## 延伸阅读

- 官方文档：[echarts.apache.org](https://echarts.apache.org/) ——配置项查询和在线编辑器
- 配置项手册：[ECharts Option 文档](https://echarts.apache.org/zh/option.html)——所有字段在这一页
- 仓库 README：[github.com/apache/echarts](https://github.com/apache/echarts)
- 渲染层独立仓库：[github.com/ecomfe/zrender](https://github.com/ecomfe/zrender)——Canvas/SVG 双 backend 的图元抽象，独立项目同 PMC 维护
- LTTB 论文：[Downsampling Time Series for Visual Representation](https://skemman.is/handle/1946/15343)（Steinarsson 2013）
- [[d3]] —— 同主题底层乐高视角，对照阅读
- [[lottie]] —— 都属"声明式动画"阵营，Lottie 来自 After Effects 导出

## 关联

- [[d3]] —— 底层乐高 vs 开箱图表，互补共存的两条路
- [[lottie]] —— 声明式描述驱动渲染，思路同源不同领域
- [[framer-motion]] —— 动画库视角下 vue-echarts / echarts-for-react 的薄壳设计有相通处
- [[playwright]] —— ECharts 自家用 playwright 做视觉回归测试
- [[vitepress]] —— 文档站点常嵌 ECharts 做交互图，按需引入的典型消费方
- [[storybook]] —— 给 ECharts 配置项做 visual catalog 的常见工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amcharts5]] —— amCharts 5 — TypeScript 重写的商业级图表库
- [[antv-f2]] —— AntV F2 — 移动端 Canvas 图表，G2 同语法的轻量子集
- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[antv-g6]] —— AntV G6 — 把"关系数据"画成会自己摆位置的图
- [[antv-x6]] —— AntV X6 — 把 mxGraph 的图编辑思路搬到 TypeScript
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[babylonjs]] —— Babylon.js — 微软开源的企业级 Web 3D 引擎
- [[billboard-js]] —— billboard.js — c3.js 的 TypeScript 继任者
- [[chart-js]] —— Chart.js — Canvas 渲染入门级图表
- [[chartist]] —— Chartist — 极简 SVG 图表
- [[cytoscape-js]] —— Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[framer-motion]] —— Framer Motion — React 声明式动画
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[leaflet]] —— Leaflet — 轻量交互式地图
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[openlayers]] —— OpenLayers — 全功能 GIS 前端
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[plotly-js]] —— Plotly.js — 一个 JSON 描述任何图表的浏览器全家桶
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[sigma-js]] —— Sigma.js — 上万节点仍流畅的 WebGL 图渲染器
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[vega]] —— Vega — 整张图就是一棵 JSON
- [[vega-lite]] —— Vega-Lite — 用 JSON 三段式画复合图
- [[visx]] —— visx — 把 d3 拆成 30 块乐高的 React 可视化原语
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器

