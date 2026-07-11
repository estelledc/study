---
title: Chart.js — Canvas 渲染入门级图表
来源: 'https://github.com/chartjs/Chart.js'
日期: 2026-05-31
分类: 数据可视化
难度: 初级
---

## 是什么

Chart.js 是一个**让你用三行配置画出图表**的 JavaScript 库。日常类比：像 Excel 的"插入图表"按钮——你给它一份表格、选一个图类型，它直接把图画出来，连配色、坐标轴、Tooltip 都默认调好。

你写：

```js
new Chart(ctx, {
  type: 'line',
  data: { labels: ['一月','二月','三月'], datasets: [{ data: [10, 20, 15] }] },
  options: {}
})
```

3 行，一条折线就上线。它默认在 HTML5 Canvas 上画图（不是 SVG），所以几千点也不卡 DOM。

## 为什么重要

不理解 Chart.js 的设计，下面这些事都没法解释：

- 为什么前端教学第一周的"画个图"作业基本都用它（极简 API + 文档友好）
- 为什么后台管理项目宁可不要花哨效果也选它，而不是 D3——D3 学一周才能出第一张图
- 为什么 Canvas 上画图比 SVG 省内存——SVG 每个点都是 DOM 节点，Canvas 是一张位图
- 为什么数据量超过 1 万点要启用 decimation——Canvas 每帧都要重画整张图

## 核心要点

Chart.js 的设计可以拆成 **四层对象**：

1. **Chart 实例**：每张图一个 `new Chart(ctx, config)`，持有那块 canvas 的画笔。类比：一张画布 + 一个画家。

2. **Controller**：每种图类型一个（line / bar / pie ...），决定"怎么把数据翻成像素位置"。类比：菜谱——同样的食材，按"折线菜谱"画就是折线，按"柱状菜谱"画就是柱图。

3. **Element + Scale**：Element 是真正画的零件（一根线、一根柱、一个点）；Scale 是坐标轴算法（线性 / 时间 / 类别）。类比：尺子（Scale）+ 笔触（Element）。

4. **Plugin**：生命周期钩子（`beforeDraw` / `afterDraw` / `beforeUpdate` 等），让你在画图过程的任意一帧插入自己的代码。类比：流水线上的工位，你可以在任意工位加自己的动作。

四层加起来叫 **可扩展的成品库**——默认就能用，要改也改得动。

## 实践案例

### 案例 1：5 分钟最小起手式

```html
<canvas id="c"></canvas>
<script type="module">
  import Chart from 'https://cdn.jsdelivr.net/npm/chart.js/auto/+esm'
  new Chart(document.getElementById('c'), {
    type: 'bar',
    data: {
      labels: ['周一','周二','周三','周四','周五'],
      datasets: [{ label: '咖啡杯数', data: [3, 5, 2, 6, 4] }]
    }
  })
</script>
```

不需要打包工具、不需要 React，浏览器里就能跑。`/auto` 后缀让它自动注册所有 controller，最省事的入门姿势。

### 案例 2：响应式 + 自定义 Tooltip

```js
new Chart(ctx, {
  type: 'line',
  data: { /* ... */ },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: (item) => `销量 ${item.parsed.y} 件`
        }
      }
    }
  }
})
```

`responsive: true` 让图随容器 resize 重画；`tooltip.callbacks` 改一行就能定制悬浮提示文字。这两个是 90% 项目的第一改动。

### 案例 3：插件钩子画水印

```js
const watermark = {
  id: 'watermark',
  afterDraw: (chart) => {
    const { ctx, chartArea } = chart
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.05)'
    ctx.font = '40px sans-serif'
    ctx.fillText('DRAFT', chartArea.left + 20, chartArea.top + 50)
    ctx.restore()
  }
}
new Chart(ctx, { type: 'line', data, plugins: [watermark] })
```

`afterDraw` 在每次重画之后执行，你拿到原生 canvas context，想画啥画啥。这是 Chart.js 真正的扩展点。

## 踩过的坑

1. **Canvas 没有 DOM**：不能用 CSS 改图表元素的样式，所有外观（颜色、字号、间距）都得走 `options`。新人第一次想 inspect 元素改 hover 颜色就懵了。

2. **手动改 canvas 尺寸后变糊**：CSS 宽高和实际像素宽高不一致时，文字边缘会有锯齿。解法：让父容器有明确宽高，交给 Chart.js 响应式逻辑同步 DPR。

3. **v2 / v3 / v4 多次 breaking**：旧教程里 `Chart.defaults.global.xxx` 在 v3+ 已经移除；scale 配置从 `xAxes: [{...}]` 数组变成 `x: {...}` 对象。看教程先确认版本。

4. **大数据量卡顿**：超过 1 万点每帧都要重画，CPU 占满。解法：开启 Chart.js 内置 decimation 采样，或换成 WebGL 系（deck.gl / regl）。

5. **无障碍弱**：屏幕阅读器读不到 canvas 内容。政府站、教育站要么提供 `<table>` fallback，要么换 SVG 系（Recharts / Observable Plot）。

## 适用 vs 不适用场景

**适用**：

- 后台管理面板的常规折线 / 柱图 / 饼图（占 80% 业务图表需求）
- 教学场景：让零基础学生第一次出图的最短路径
- 需要 Canvas 性能（千点级散点图）但又不想啃 D3 的项目
- framework-agnostic：原生 JS / Vue / Svelte / Astro 都直接能用，不绑死框架

**不适用**：

- 需要复杂交互（地理地图、桑基图、关系图、3D） → 用 ECharts / D3
- 数据量极大（10 万 +）→ 走 WebGL（deck.gl / regl）
- 需要每根柱子独立动画 + 形变的极端定制视觉 → D3 + 手画 SVG
- 强无障碍要求 → 改用 SVG 系（Recharts / Observable Plot）

## 历史小故事（可跳过）

- **2013 年**：Nick Downie 一个人写了第一版 Chart.js，开源到 GitHub。当时 D3 已经火了，但 D3 太硬核——Nick 想做"傻瓜版"，让人三行出图。
- **2017 年**：v2 改写为可扩展架构，引入 Controller 概念——第一次让用户能加自定义图类型。
- **2020 年**：v3 重构为 ESM + tree-shaking，bundle 可以压到 30KB；代价是要手动 register 用到的 controller / scale。
- **2023 年**：v4 用 TypeScript 重写，类型完全暴露，性能优化又上一档。

13 年过去，它仍是 npm 上下载量最高的图表库之一——证明"够用就好"在工程界永远有市场。

## 学到什么

1. **API 极简是产品力**——三个字段 `type / data / options` 击败了无数功能更全的库
2. **Canvas vs SVG 不是优劣是权衡**——DOM 数 / 交互精度 / 内存 / 无障碍各有取舍
3. **插件钩子机制**让"成品库"也能"定制"，避开了"功能多但僵硬"的死局
4. **教学库 ≠ 玩具**：基础够扎实、够稳定，反而成了真实业务的常驻选项

## 延伸阅读

- 官方文档：[Chart.js Docs](https://www.chartjs.org/docs/latest/)（中文翻译有但更新慢，建议读英文）
- 例子大全：[Chart.js Samples](https://www.chartjs.org/samples/latest/)（每种图都有 live demo + 源码）
- [[d3]] —— Chart.js 仰望的"硬核祖师"，理解 D3 才知道 Chart.js 替你省了什么
- [[recharts]] —— React 项目首选 SVG 系，对照看 declarative API 和 Canvas 的差异
- [[echarts]] —— 配置项更全的中国系图表库，体量更大但学习曲线也更陡
- [[plotly-js]] —— 自带缩放框选交互，科学计算和数据探索更顺手
- [[observable-plot]] —— 新一代 grammar of graphics 风格，思路完全不同

## 关联

- [[d3]] —— 底层数据驱动祖师，Chart.js 的设计哲学在它对面
- [[recharts]] —— 同类教学定位，但走 React + SVG 路线
- [[echarts]] —— 同样 Canvas 渲染，但配置项体量大十倍
- [[observable-plot]] —— grammar of graphics 思路，对比"配置式"和"组合式"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amcharts5]] —— amCharts 5 — TypeScript 重写的商业级图表库
- [[antv-f2]] —— AntV F2 — 移动端 Canvas 图表，G2 同语法的轻量子集
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[billboard-js]] —— billboard.js — c3.js 的 TypeScript 继任者
- [[chartist]] —— Chartist — 极简 SVG 图表
- [[leaflet]] —— Leaflet — 轻量交互式地图
- [[regl]] —— regl — 函数式 WebGL 封装
- [[vega]] —— Vega — 整张图就是一棵 JSON
