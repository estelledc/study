---
title: AntV F2 — 移动端 Canvas 图表，G2 同语法的轻量子集
来源: AntV 团队（Ant Group）F2 官网与仓库, https://f2.antv.antgroup.com/ + https://github.com/antvis/F2
日期: 2026-06-01
分类: projects / 数据可视化
难度: 中级
---

## 是什么

AntV F2 是一个**专门画在手机屏幕上的 JavaScript 图表库**，把 G2 那套图形语法搬到 Canvas + 触屏环境，只取移动端真正用得到的部分。日常类比：F2 之于 G2，像便携相机之于全画幅单反——同一套构图语言，但镜头变小、操作变简单、贴身能用。

为什么不直接用 G2？G2 默认带桌面 BI 才需要的功能（复杂图例交互、富文本标签、SVG/Canvas 双渲染、宽窄屏布局自适应）。在手机上这些大半用不到，但 gzip 包体先吃掉两三百 KB。F2 砍掉桌面假设，只保留移动端常见的柱/线/饼/面/点，包体压到 **44KB（无交互）/ 56KB（含全部交互）**。

写一张柱状图大致是：

```jsx
import { Canvas, Chart, Interval, Axis, Tooltip } from '@antv/f2'
const ctx = document.getElementById('app').getContext('2d')
const { props } = (
  <Canvas context={ctx} pixelRatio={window.devicePixelRatio}>
    <Chart data={sales}>
      <Axis field="month" />
      <Axis field="value" />
      <Interval x="month" y="value" color="category" />
      <Tooltip />
    </Chart>
  </Canvas>
)
```

`Interval` 是几何标记（柱状用矩形条），`x="month" y="value"` 是数据列到视觉通道的映射。语法上你能一眼看出这是 G2 family。

## 为什么重要

不理解 F2 的设计取舍，下面这些事没法解释：

- 为什么国内移动端图表场景里它能和 ECharts 移动版长期并存——走的是图形语法路线，表达力高于配置项
- 为什么 H5 / WeChat 小程序 / Alipay 小程序 / React Native 都能用同一份 F2 代码——它的渲染层抽象了平台 Canvas 差异
- 为什么 v5（2023 起）API 整个换成 JSX 声明式——为了和 G2 v5、Observable Plot 这一波函数式潮流对齐
- 为什么"专门为移动端做一个库"在 2017 年是个大决定——那时候 ECharts 移动方案是"桌面版强行缩小"

## 核心要点

F2 v5 的写法核心可以拆成 **5 个抽象**：

1. **Canvas（画布）**：一个 JSX 根节点，绑定到原生 `<canvas>` 元素的 2D context。这层负责跨平台——在小程序里 context 来自小程序 API，在 H5 里来自 DOM，但 F2 上层代码不变。

2. **Chart（图表容器）**：吃 `data`（数据数组），把所有几何标记和组件包在一起。一个 Canvas 里可以塞多个 Chart 做仪表盘。

3. **mark（几何标记）**：`Interval` / `Line` / `Point` / `Area` / `Schema` / `Polyline`——决定用什么形状画。一张图可以叠多个 mark（折线 + 散点）。

4. **encode（视觉编码，写成 JSX 属性）**：`x="month"` 把 month 列映到 x 轴，`color="category"` 把 category 列映到颜色。这是图形语法的核心动作：表格列变视觉属性。

5. **组件（Axis / Tooltip / Legend / Guide）**：坐标轴、提示框、图例、辅助元素。每个都是独立 JSX 子节点，按需引入按需打包。

记住这五层，剩下都是查文档。

## 实践案例

### 案例 1：折线 + 散点叠加

```jsx
<Chart data={daily}>
  <Axis field="date" />
  <Axis field="value" />
  <Line x="date" y="value" />
  <Point x="date" y="value" size={3} />
</Chart>
```

两个 mark 共用同一份 data 和编码——这就是图形语法的复利：复合图不需要换 chart 类型，叠 mark 即可。ECharts 同样效果要在 series 数组里写两份配置。

### 案例 2：Canvas 高分屏不糊的关键

```jsx
<Canvas context={ctx} pixelRatio={window.devicePixelRatio}>
```

`pixelRatio` 这一项是移动端必填。手机大多是 2x / 3x 屏，Canvas 默认按 CSS 像素画，到物理像素被放大就糊。`pixelRatio={window.devicePixelRatio}` 让 F2 内部按物理像素绘制再缩到 CSS 尺寸——同样代码在 iPhone 上锐利。

### 案例 3：小程序里换适配层

```js
// WeChat 小程序
import { Canvas } from '@antv/f2-wx-canvas'
// H5
import { Canvas } from '@antv/f2'
```

各端 Canvas 实现不同（小程序的 `wx.createSelectorQuery` 拿 context 流程独特），所以官方拆了几个适配包。Chart / mark / 组件部分共用，只有 Canvas 换。这就是它能"一份代码跑五端"的边界——边界在最外层。

## 踩过的坑

1. **v3/v4 教程在 v5 直接跑不动**：v3 是 `chart.interval().position('month*sales')`，v4 是 mark 链式 API，v5 改成 JSX。社区博客大半是 v3/v4，新手照抄无一成功。先看官网版本再看博客。

2. **小程序里 npm 包不是直接装 `@antv/f2`**：要用对应的 `@antv/f2-wx-canvas` / `@antv/f2-my-canvas` 等适配包。直接装主包会因为 Canvas API 不兼容报错。

3. **Canvas 渲染调试不能 inspect 元素**：和 SVG 不一样，Canvas 画完就是一张位图，浏览器开发者工具看不到柱子的 DOM。出了视觉 bug 只能靠 console.log 数据 + 暂停帧抓图。

4. **pixelRatio 写错或不写**：不写，手机上糊；写成固定 2，部分 3x 屏（iPhone Pro 系列）糊；写成 `window.devicePixelRatio` 才稳。小程序场景要从 systemInfo 取。

5. **destroy 不调内存泄漏**：移动端 SPA 切页时 Chart 实例不释放，Canvas 持有的位图和事件监听都泄漏。组件卸载必须 `chart.destroy()`。

## 适用 vs 不适用场景

**适用**：

- H5 活动页 / 移动端 BI / 小程序仪表盘——核心场景就是为它设计的
- 包体敏感的场景（首屏要快）——50KB 量级远小于 ECharts 移动版的 200KB+
- 需要 G2 语法表达力 + 移动端体验——一份 mark/encode 心智搬过来即可
- 跨小程序生态（WeChat + Alipay + 抖音/百度小程序等）——适配层覆盖广

**不适用**：

- 桌面端中后台 BI → 用 G2 / ECharts，F2 反而少功能
- 极复杂复合图（双轴 + 分面 + 矩阵）→ G2 v5 表达力更全
- 需要 SVG 可访问性（屏幕阅读器）→ Canvas 不友好，选 D3 或 Chart.js SVG 模式
- 百万级数据点 → Canvas + 移动端 GPU 跑不动，下采样（LTTB）后再画

## 历史小故事（可跳过）

- **2017 年**：AntV 团队同时开源 G2 和 F2，定位互补——G2 桌面、F2 移动端。当时移动端图表方案基本是 ECharts 缩小版，体验不佳。
- **2018-2021 年**：F2 v3 / v4 跟着 G2 节奏迭代，主要 API 是 `chart.interval().position(...)` 字符串 DSL。这一时期的中文教程主要在这两个版本上沉淀。
- **2023 年**：F2 v5 重构，整体 API 改为 JSX 声明式，对齐 G2 v5 的函数式 mark + Observable Plot 风格。这是一次彻底的 breaking change——v4 用户基本要重学。
- **2024-2026 年**：v5.x 进入稳定期，截至 2025-11 发布到 v5.14。GitHub 上 8k+ stars，53 个 release，2600+ commits，AntV 内部维护未停。

## 学到什么

1. **"专门版"vs"通用版缩小"是两条路**：F2 选了前者，砍掉桌面假设换来包体和体验。ECharts 选了后者，一套配置走天下但移动端不够轻。两条路适合不同团队心智。
2. **图形语法的可移植性**：同一套 mark/encode/scale 抽象，在桌面 G2、移动 F2、Python plotnine、JSON Vega-Lite 里反复出现。这说明 Wilkinson 1999 抓到的是图表的本质结构，不是某个语言的 API 风格。
3. **跨平台抽象的关键是边界放在最外层**：F2 把"平台差异"全压到 Canvas 适配层，上层 Chart / mark 完全平台无关。这种"洋葱"结构是跨端库的通用做法。
4. **重写 v5 的代价**：从字符串 DSL 到 JSX，所有老用户要重学。但这是为了 TypeScript 推导更顺、心智模型和 G2/Plot 对齐。AntV 团队和 G2 同步做这件事，证明组织内部是有节奏的。
5. **包体是移动端真实约束**：50KB 不是数字游戏，是用户首屏白屏时间的直接换算。在 4G 弱网环境下，每 50KB 都是肉眼可见的等待。

## 延伸阅读

- 官方文档：[f2.antv.antgroup.com](https://f2.antv.antgroup.com/) ——v5 中文文档完整
- 仓库 README：[github.com/antvis/F2](https://github.com/antvis/F2)
- AntV 总站：[antv.antgroup.com](https://antv.antgroup.com/)
- Wilkinson 1999：The Grammar of Graphics（理论原书）
- [[antv-g2]] —— 桌面端兄弟项目，语法同源
- [[echarts]] —— 配置项路线对照阅读
- [[chart-js]] —— 另一个轻量 Canvas 图表库（非语法路线）

## 关联

- [[antv-g2]] —— 桌面 BI 场景的兄弟库，同一图形语法
- [[echarts]] —— 配置项路线代表，移动端方案的对照
- [[d3]] —— 底层 Canvas 渲染和 scale 思想的源头
- [[observable-plot]] —— F2 v5 JSX API 的设计参考
- [[chart-js]] —— 同样 Canvas 渲染但走配置项路线
- [[recharts]] —— 同样 JSX 但目标是 React 桌面端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
