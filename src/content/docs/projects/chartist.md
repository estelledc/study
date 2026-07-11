---
title: Chartist — 极简 SVG 图表
来源: 'https://github.com/chartist-js/chartist'
日期: 2026-05-31
分类: 数据可视化
难度: 初级
---

## 是什么

Chartist 是一个**用 SVG 画图、用 CSS 改主题、零依赖**的图表库。日常类比：像一张可复印的描红——画出来的每一根线、每一个柱子都是 HTML 节点，你想换颜色直接改 CSS，不必碰 JS。

你写：

```js
new Chartist.Line('.ct-chart', {
  labels: ['一月','二月','三月'],
  series: [[10, 20, 15]]
})
```

3 行，一条折线就出现在 `.ct-chart` 容器里。它把图画在 SVG 上（不是 Canvas），所以每个点都是 DOM 节点，能用 dev tools 选中，能用 CSS 选择器换主题。

## 为什么重要

不理解 Chartist 的设计，下面这些事都没法解释：

- 为什么"零依赖 + 10 KB"还能在主流图表库里活了 13 年——因为它切的是"博客小图"细分市场
- 为什么设计师能直接接手图表样式而不必学 JS——所有外观都走 `ct-` 前缀的 CSS class
- 为什么 SVG 派和 Canvas 派是 Web 可视化第一个大分叉——一个是"DOM 节点 + CSS"，一个是"位图 + JS API"
- 为什么响应式不是给个 `width: 100%` 那么简单——不同尺寸要切不同 options（比如手机隐藏 Y 轴）

## 核心要点

Chartist 的设计可以拆成 **三个主张**：

1. **SVG 优先**：每个点、每根线都是 SVG 元素 + DOM 节点。类比：拼图的每一块都能单独捏起来；Canvas 是"已经印好的纸"。

2. **CSS 主题化**：图表外观不在 JS 里写，全部走 `ct-series-a` / `ct-line` / `ct-point` 这类 class。类比：JS 负责"画什么"，CSS 负责"长什么样"——前后端职责清楚。

3. **响应式 options**：通过 `responsiveOptions` 数组 + media query 字符串，让同一份 chart 在不同屏幕宽度用不同配置。类比：一份食谱，宴会版加大、午餐版简化。

三个主张加起来叫 **convention over configuration**——默认就够好看，要改也直接改 CSS。

## 实践案例

### 案例 1：5 分钟最小起手式

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/chartist/dist/index.css">
<div class="ct-chart ct-perfect-fourth"></div>
<script type="module">
  import { LineChart } from 'https://cdn.jsdelivr.net/npm/chartist/+esm'
  new LineChart('.ct-chart', {
    labels: ['周一','周二','周三','周四','周五'],
    series: [[3, 5, 2, 6, 4]]
  })
</script>
```

`ct-perfect-fourth` 是预设宽高比（黄金比的近亲），让图自动按音乐音程比例排版——细节，但很 Chartist。

### 案例 2：CSS 换主题

```css
/* 默认是 5 种颜色，按 ct-series-a/b/c/d/e 自动循环 */
.ct-series-a .ct-line, .ct-series-a .ct-point { stroke: #ff5722; }
.ct-series-b .ct-line, .ct-series-b .ct-point { stroke: #2196f3; }
```

注意：**JS 里一行颜色都没改**。这就是 Chartist 与 Chart.js 最大的视觉哲学差异——前者把视觉决定全部交还 CSS，后者必须 `options.borderColor` 配。

### 案例 3：响应式 options

```js
new LineChart('.ct-chart', data, {
  showArea: true
}, [
  ['screen and (max-width: 640px)', {
    showArea: false,
    axisY: { offset: 0 }
  }]
])
```

第四个参数是 `responsiveOptions`，数组每项 = `[mediaQuery, optionsOverride]`。窄屏自动隐藏面积填充和 Y 轴 offset，省空间。

## 踩过的坑

1. **数据点上千就卡**：SVG 每个点都是 DOM 节点，1000 点就是 1000 个 `<circle>`，浏览器重排会肉眼可见地慢。这是 SVG 路线天生的天花板。

2. **v0 → v1 不向后兼容**：v0 用 `Chartist.Line(...)`（命名空间），v1 用 ESM `import { LineChart } from 'chartist'`。旧教程多是 v0，看到 `Chartist.` 前缀先核版本。

3. **Tooltip 要装插件**：内置不带悬浮提示，要装 `chartist-plugin-tooltips` 或自己监听 mouseover。Chart.js 是默认就带，对比之下 Chartist 更"裸"。

4. **响应式 options 只在初始化生效**：动态加点 / 改 series 后，要手动 `chart.update(newData)`，不会自动重算 responsiveOptions。

5. **图类型只有 3 个**：Line / Bar / Pie。要雷达、散点、热力、地图——直接换库（ECharts / D3 / Observable Plot）。

## 适用 vs 不适用场景

**适用**：

- 博客 / 内容站每页几十点的小图（性能不是问题，包大小是问题）
- 设计师主导的项目——CSS 改主题不必排队等前端开 PR
- 强可访问性需求——SVG 节点能加 `aria-label`，屏幕阅读器能读到
- 极简打包预算（<15 KB），不想引入 Chart.js 的 60 KB

**不适用**：

- 数据量上千点的探索式图表 → 走 Canvas（Chart.js / ECharts）或 WebGL（deck.gl）
- 需要丰富插件生态（缩放 / 框选 / 联动）→ Chart.js / ECharts 插件多十倍
- 需要高级图类型（地图、桑基、关系、3D）→ ECharts / D3
- 团队已用 Chart.js 且性能没瓶颈 → 没必要单独换

## 历史小故事（可跳过）

- **2014 年**：Gion Kunz 在 Snack 工作时不满意当时的图表库（D3 太重、Highcharts 收费），自己写了 Chartist v0，开源到 GitHub。
- **2015-2018 年**：星数从 1k 涨到 12k，主打 "responsive + CSS 主题"，那阵子前端正在"扁平化"，CSS 改主题刚好对味。
- **2022 年**：原作者退出维护，社区成立 `chartist-js/chartist` 组织接管，发布 v1.0 用 TypeScript 重写。
- **现在**：维护节奏慢于 Chart.js / Recharts，但仍是"小图 + CSS 主题"细分市场的稳态选项。

13 年下来证明：**够轻 + 够垂直** 也能在巨头夹缝里长期存活。

## 学到什么

1. **SVG vs Canvas 是 Web 可视化的第一个分叉点**——一个走 DOM 节点 + CSS，一个走位图 + JS API；选错了往后所有交互、性能、可访问性决定都跟着走
2. **样式归 CSS 是一个工程主张**——把视觉从 JS 配置里搬出来，前后端分工更清楚，设计师不必学 JS 也能改图
3. **响应式不是给个 width: 100% 那么简单**——不同断点切换不同 options 才叫真响应式（手机隐藏副轴、平板压缩 padding）
4. **细分定位 + 极轻包**也能活——不是每个库都要做"全功能 + 大生态"，13 年下来 Chartist 证明垂直市场也有稳态

## 延伸阅读

- 官方文档：[Chartist Docs](https://chartist.dev/)（v1 文档）
- 仓库：[chartist-js/chartist](https://github.com/chartist-js/chartist)（v1 在这里）
- [[chart-js]] —— 同样的入门定位，但走 Canvas 路线，刚好对照
- [[d3]] —— SVG 数据驱动祖师，Chartist 是 D3 思路的简化结晶
- [[recharts]] —— 同样 SVG 但走 React 声明式组件，对照看 imperative vs declarative
- [[echarts]] —— 走 Canvas，配置项体量大十倍

## 关联

- [[chart-js]] —— Canvas 派代表，与 Chartist 是"渲染哲学"两端的镜像
- [[d3]] —— SVG + 数据驱动祖师，Chartist 是它的极简后裔
- [[recharts]] —— React + SVG，把 Chartist 的"声明 + CSS"路线装进组件
- [[echarts]] —— 同样配置式 API，但走 Canvas + 海量图类型路线
- [[observable-plot]] —— grammar of graphics 风格的现代 SVG 库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
