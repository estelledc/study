---
title: nivo — React + d3 组件化图表
来源: https://github.com/plouc/nivo
日期: 2026-05-31
分类: 数据可视化
难度: 中级
---

## 是什么

nivo 是把 **d3 的图表能力包成一组 React 组件**的库。日常类比：d3 像一堆零件（量尺、画笔、布局算法），nivo 把这堆零件装成成品玩具——你只要说"我要一个柱状图，数据是这些"，玩具自己出来了。

你写：

```jsx
import { ResponsiveBar } from '@nivo/bar'

<ResponsiveBar
  data={[{ country: 'CN', value: 30 }, { country: 'US', value: 45 }]}
  keys={['value']}
  indexBy='country'
/>
```

这一行就能渲一张可交互的柱状图。**没碰过 d3.select、没写过 enter/exit**。这种"props 进，svg 出"的写法，就是 nivo 的核心承诺。

## 为什么重要

不理解 nivo 解决的问题，下面这些事都不好理解：

- 为什么 d3 那么强大但在 React 项目里不好用——两个 DOM 引擎打架
- 为什么 React 仪表板首屏要么白屏闪烁、要么直接出图——SSR 友好与否的差别
- 为什么 Storybook 是组件库的"活文档"——每个 prop 都能实时调
- 为什么数据多了图就卡——SVG 节点上限 vs Canvas 像素绘制

## 核心要点

nivo 的设计可以拆成 **三个分工**：

1. **d3 只算，不画**。d3-scale 算坐标映射，d3-shape 生成 path 字符串，d3-hierarchy 算树/树形图布局。这些函数返回的是**数据**，不是 DOM。

2. **React 只画，不算**。算好的坐标和路径作为 props 传给 React 组件，React 渲成 `<svg><rect /><path /></svg>`。整个过程没有 `d3.select(...).enter().append()`。

3. **react-spring 动画，不用 d3-transition**。组件卸载时动画自然停，不会留"幽灵节点"。

合起来，d3 与 React 各司其职，互不打架。

## 实践案例

### 案例 1：一张柱状图的完整 props

```jsx
const data = [
  { country: 'CN', 'hot dog': 12, burger: 20 },
  { country: 'US', 'hot dog': 30, burger: 15 },
]

<ResponsiveBar
  data={data}
  keys={['hot dog', 'burger']}
  indexBy='country'
  margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
  colors={{ scheme: 'nivo' }}
  theme={{ axis: { ticks: { text: { fontSize: 12 } } } }}
/>
```

**逐字段解释**：

- `data`：每行一个国家，后面字段是各组柱子的数值
- `keys`：每组里画哪几根柱子（堆叠或并排）
- `indexBy`：x 轴用哪个字段当类目
- `margin / colors / theme`：外观——通过 React Context 下传给所有子图元

### 案例 2：SVG vs Canvas 同一份 props

```jsx
import { ResponsiveBar } from '@nivo/bar'         // SVG，DOM 可点
import { ResponsiveBarCanvas } from '@nivo/bar'   // Canvas，性能版
```

数据点几百以内用 SVG，每根柱子是 `<rect>`，能加 hover/click。**几千个点**以上换 Canvas——React 只调 `ctx.fillRect`，没有 DOM 节点。代价是不能用 CSS 选到具体柱子，要走 nivo 提供的 hover 事件。

### 案例 3：SSR 渲完直接发

```jsx
// Next.js / Astro 服务端
import { Bar } from '@nivo/bar'   // 注意：固定尺寸版本，不是 Responsive

<Bar width={800} height={400} data={data} keys={['v']} indexBy='c' />
```

服务端 React 渲完是一段 `<svg>...</svg>` 字符串，直接发给浏览器，**首屏不闪**。Responsive 版本在服务端会找不到 ResizeObserver——所以 SSR 必须用固定尺寸版本，到客户端再换 Responsive。

## 踩过的坑

1. **import 整个 nivo 包体积爆炸**——用 `@nivo/bar` 而不是顶层 `nivo`。每个图表是独立 npm 包，按需引入才能 tree-shake。

2. **Responsive 父容器塌成 0**——`ResponsiveBar` 用 ResizeObserver 测父容器，如果父级是 `height: auto`，测到 0 就什么都不画。要么显式给父级高度，要么用固定尺寸版本。

3. **Canvas 版 e2e 测试取不到元素**——没有 DOM 节点意味着 `getByRole('img')` 抓到的是整张 canvas。要测某个柱子，得走 nivo 的 `onMouseMove` 事件拿到数据。

4. **TypeScript 自定义 tooltip 类型严**——nivo 的 generics 推不动你自定义的 datum，要手写 `BarTooltipProps<MyDatum>`。

5. **theme 不会自动跟随 dark mode**——主题对象是静态的，要自己监听 `prefers-color-scheme` 切换 theme prop。

## 适用 vs 不适用场景

**适用**：

- React 仪表板、Next.js / Astro / Remix 项目里需要图表
- 数据点几百到几千，需要交互（hover、点击下钻）
- 需要 Storybook 风格的文档/playground
- 需要服务端渲染首屏图

**不适用**：

- 不是 React 项目——直接用 d3 或 Chart.js
- 数据点上万——用 Canvas 也吃力，考虑 deck.gl / regl 走 WebGL
- 需要完全自定义图表形态（不是标准柱/线/饼/散点）——用 visx 或裸 d3 自己拼
- 静态展示用 PNG 就够——可以用 nivo 的 HTTP API 服务端生成图片

## 历史小故事（可跳过）

- **2017**：作者 Raphael Benitte 发布第一版，目标"把 d3 React 化"
- **2018–2020**：陆续加 Canvas 变体、HTTP API（服务端渲 PNG/JSON）、整体 TypeScript 重写
- **2022 起**：迁到 pnpm monorepo，30 多个 `@nivo/*` 包独立发版
- **2026 现状**：社区常用 React 图表库之一（常与 Recharts、visx 并列讨论）

## 学到什么

1. **声明式包装命令式**——d3 的 selection/enter/exit 跟 React vDOM 冲突；nivo 只用 d3 算坐标，渲染交还 React
2. **monorepo + 按图表分包**——避免"装一个用全部"的体积问题，是中大型组件库标配
3. **和同类怎么选**——Recharts 像乐高细调轴；visx 给 d3 原语自己拼；nivo 一个组件一张图、开箱即用但定制有边界
4. **SSR 友好的代价**——Responsive 在 server 不可用，要按"固定尺寸 server 端 + Responsive 客户端"分层
5. **react-spring 替代 d3-transition**——动画系统也要跟着框架走，否则卸载留残骸

## 延伸阅读

- 官方文档（Storybook 形态）：[nivo.rocks](https://nivo.rocks/)
- 源码入口：[github.com/plouc/nivo](https://github.com/plouc/nivo)
- 作者 Raphael Benitte 的 d3+React 思路文章（GitHub 仓库 README 链接）
- [[react-server-components]] —— 现代 SSR 的演化方向，解释 nivo 为何要在服务端渲完直发
- [[playwright]] —— Canvas 版 e2e 测试的兜底工具（hover 事件抽数据）

## 关联

- [[react-server-components]] —— 服务端渲染的现代方案，与 nivo SSR 友好同根
- [[starlight]] —— 同样是 Astro 生态，文档站点常用 nivo 嵌图
- [[playwright]] —— Canvas 版图表的 e2e 测试方案
- [[tanstack-router]] —— 同属"用 React 心智重写传统库"的代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
