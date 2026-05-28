---
title: Observable Plot Grammar of Graphics in JS
来源: https://github.com/observablehq/plot + observablehq.com/plot 官方文档
---

# Observable Plot — Grammar of Graphics 在 JS 的工业化重生

## 一句话总结

Observable Plot（@observablehq/plot）是 Mike Bostock（d3 创始人）和 Observable 团队 2021 年启动的开源数据可视化库。它没有走 d3 的"低层乐高"路线，也没像 Chart.js 提供"开箱图表组件"，而是走第三条路：Wilkinson 1999《The Grammar of Graphics》和 Wickham 2009 ggplot2 的思想 + JS 函数式 API。

核心思想：你描述"数据列怎样映射到视觉变量"（mark / channel / scale / facet），Plot 自动选合适的 scale、画 axis、做 facet 分图、推断颜色映射。学习曲线比 d3 平很多，灵活度比 Recharts 高很多，默认输出就好看（Bostock 极度执着 typography 与 spacing）。

设计目标三大支柱：

1. Visualization that just works — 默认产物可发布
2. Grammar of graphics — 基于 ggplot2 的层叠 mark 思想
3. Built on top of d3 — 不重复造轮，d3 数学底座

Plot 的目标用户不是"想做炫酷可视化的前端工程师"（那是 d3 的用户），也不是"想加个折线图的产品工程师"（那是 Recharts 的用户），而是"想用 JS 做严肃数据分析的数据科学家"——这是个 R 和 Python 长期统治的人群。

放在更宽的可视化库光谱上看：左端是 d3（最低层、最自由、最难），中间偏左是 visx（d3 + React），中间是 Recharts / Nivo（React 组件 + 标准图表），中间偏右是 ECharts（配置式，超大内置图表库），右端是 Plot 和 Vega-Lite（grammar of graphics，最声明式）。

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `@observablehq/plot` |
| 当前主版本 | 0.6.x（截至 2024，仍在 0.x 主版本，API 高度稳定） |
| 首版 | 2021-04（v0.1） |
| License | ISC |
| 主仓库 | observablehq/plot |
| 内部依赖 | d3-array / d3-axis / d3-format / d3-geo / d3-scale / d3-shape / d3-time-format / d3-time / interval-tree-1d / isoformat |
| TypeScript | 完整支持（每个 mark / transform / scale 有类型） |
| 渲染层 | SVG-only（无 Canvas / WebGL） |
| Bundle 大小 | 全量 ~150KB min+gzip |
| Tree-shake | 部分支持（Plot.plot 是入口，部分依赖会拉过来） |
| Marks 数量 | 35+（dot / line / bar / area / cell / rect / hexagon / arrow / link / vector / text / image / tick / rule / frame / waffle / box / contour / density / raster / bollinger / ...） |
| Transforms 数量 | 15+（bin / group / map / select / sort / stack / window / normalize / dodge / hexbin / aggregate / interval / shift / centroid / filter） |
| Scales 数量 | 11（linear / log / time / ordinal / band / point / sqrt / pow / quantile / quantize / threshold） |
| Projections | 12+（geo: equal-area / equirectangular / mercator / orthographic / stereographic / azimuthal-equal-area / albers-usa / albers / conic / gnomonic / azimuthal-equidistant） |
| 状态管理 | 无内部 state，每次 `Plot.plot(spec)` 重渲染 |
| 框架要求 | 无（vanilla DOM） |
| Weekly downloads | 280k+（npmjs.com 公开数据，2024） |
| 维护 | Observable 官方 + Mike Bostock 主导 + 社区 |

## Layer 1 — 核心抽象

Plot 的整个 API 折叠成一个函数：`Plot.plot(spec)`。spec 对象有几个关键字段：

```js
Plot.plot({
  width: 640,
  height: 400,
  marks: [
    Plot.dot(data, {x: "carat", y: "price", fill: "color"}),
    Plot.linearRegressionY(data, {x: "carat", y: "price"})
  ],
  x: {label: "克拉数 (ct)"},
  y: {grid: true, label: "价格 ($)"},
  color: {legend: true},
  facet: {data, x: "cut"}
})
```

四个核心概念：

1. **Mark**：图形元素（dot / line / bar / area ...），是 Plot 的"乐高积木"。每个 mark 接受 `data` 数组 + `options` 对象（声明 channel 映射）
2. **Channel**：数据列到视觉属性的映射（`x / y / fill / stroke / r / opacity / symbol / dx / dy / fontSize / src / href`）
3. **Scale**：把 channel 数据值（数字、字符串、日期）映射到屏幕坐标 / 颜色 / 大小。Plot 自动从数据类型推断 scale 类型（连续数值 → linear，时间 → time，类别 → ordinal）
4. **Transform**：在数据进 mark 前预处理（bin / group / stack / window / normalize / dodge）。Transform 是函数，可链式套用

Plot 与 d3 的根本不同：d3 让你自己写 scale、自己画 axis、自己写 enter/update/exit；Plot 帮你做完所有这些，你只声明意图。

写 Plot 的心理模型与写 d3 的心理模型完全不同：

- d3：我有数据 → 我要在 SVG 上画什么形状 → 怎样把数据值映射到形状属性 → 怎样写 enter/update/exit 让它对数据变化反应
- Plot：我有数据 → 我要展示哪几列之间的关系 → 用哪种 mark 表达这个关系最自然

这个心理模型差异是 grammar of graphics 与传统命令式 viz 的本质分野。Wilkinson 1999 的原书副标题就是"a system for the creation of statistical graphics"——他想造的是一套语言而不是一组工具。

## Layer 2 — 与 d3 的关系

Plot 完全建在 d3 之上：

- `Plot.dot` 内部调 `d3-shape` 的 symbol generator
- 所有 scale 来自 `d3-scale`（共享 d3 的 ticks 算法）
- `Plot.geo` 用 `d3-geo` 的 projection
- 数据聚合用 `d3-array` 的 group / rollup / bin
- 时间格式化用 `d3-time-format`

但 Plot **不暴露** d3 给用户。你 import Plot 不需要 import d3。这是 Plot 与 visx 的关键差别：

| 维度 | Plot | visx | d3 |
|---|---|---|---|
| 暴露 d3 | 否 | 是 | — |
| 声明式 | 是 | 部分 | 否 |
| React 友好 | 中（命令式 API） | 极佳 | 弱 |
| 学习曲线 | 平 | 中 | 陡 |
| 默认美观 | 极佳（Bostock 调） | 中 | 自己写 |

Plot 用户**完全不需要懂 domain / range / scale / ticks**——这些 Plot 自动从数据推断。需要时再覆盖（`x: {domain: [0, 100]}`）。

这是 grammar of graphics 哲学的本质：**让用户用"我要展示什么数据 → 什么视觉变量"的思维**，而不是"我要怎样画 SVG"的思维。

但这种封装也有代价：当你要做的事情超出 grammar 表达能力时（例：实时拖动节点的力导向图、3D 网格），你必须从 Plot 退出，回到 d3。Plot 没有提供"逃生舱口"——你不能在 Plot.plot 内部插入一段自己写的 d3 代码（除了写一个完整的自定义 mark）。这是 Plot 与 ECharts 的另一差别——ECharts 提供 `graphic` 配置项让你插任意 SVG。

## Layer 3 — 精读 3 段

### 段 a — Mark 设计

Plot 的 mark 是"图形元素的最小单元"。每个 mark 是个工厂函数，调用产生一个对象，对象里有 `render(facets, scales, channels)` 方法：

```js
Plot.dot(data, options) → {
  data, channels, transforms, render(facets, scales) {
    // 输出 SVG <circle> 或 <symbol>
  }
}
```

旁注：

1. mark 的 channel options 可以是常量（`fill: "blue"`）、数据列名字符串（`fill: "category"`）、accessor 函数（`fill: d => d.category`）
2. mark 输出 SVG `<g>` 包一组同类元素，每个数据点一个子节点
3. 多个 mark 按数组顺序叠加：`marks: [Plot.dot(...), Plot.line(...)]` line 在 dot 上方
4. mark 之间不共享 state，但共享 plot-level scales
5. 用户可写自定义 mark：实现 `render` 函数符合接口即可（例：自定义 violin / ridgeline）
6. 每个 mark 都有标准 channel（x/y/fill/stroke/opacity/...）+ mark-specific channel（dot 有 r、symbol；text 有 fontSize、text；arrow 有 bend、headAngle）
7. mark 的初始化做最少工作（保存 options），重活全在 render 时做（这样 spec 可被序列化、缓存）
8. mark 与 transform 的边界很清晰：mark 负责"画什么"，transform 负责"画前数据怎么处理"

> 怀疑：Plot mark 数量 35+ 还在涨（每年加几个 contour / density / waffle / bollinger）。这是 grammar 没收敛的迹象，还是社区驱动的健康扩张？相比 ggplot2 长期稳定在 ~30 geoms，Plot 是不是在重新探索 grammar 的边界？

### 段 b — Channel 系统

Plot 的 channel 是"数据列到视觉变量的命名映射"。spec 写法极简：

```js
Plot.dot(diamonds, {
  x: "carat",       // 字符串：列名
  y: "price",
  fill: "cut",      // 同上
  r: d => d.price ** 0.5,  // accessor
  opacity: 0.7      // 常量
})
```

旁注：

1. channel 名字典化（`x` 横轴、`y` 纵轴、`fill` 填色、`stroke` 描边、`r` 半径、`opacity` 透明度、`symbol` 符号形状、`fontSize` 字号）
2. Plot 自动检测：channel 值类型 → scale 类型推断（数字 → linear / sqrt；日期 → time；字符串 → ordinal）
3. 同一个 channel 可被多 mark 共享（plot-level scale）
4. 也可 mark-specific：`Plot.dot(data, {x: "carat", scale: "log"})` 局部 override
5. transforms（bin / group / stack）会重写 channel：`bin` 把连续 `x` 替换成 bin midpoint
6. derived channel：`Plot.dot(data, Plot.binX({y: "count"}, {x: "carat"}))` y 由 binX 派生
7. `fx`、`fy` 是特殊 facet channel，触发 small multiples（多图分面）
8. channel 接 `null` 表示"显式不映射"，与 `undefined`（默认值）有微妙差别

> 怀疑：channel 系统理论上优雅，但实际很多用户卡在"什么时候用 string vs accessor function"。Plot 文档对 short-hand 解释不够清晰，是 API 教程问题还是 grammar 表达力天生模糊？

### 段 c — Transforms 链

Transform 在数据进 mark 之前做预处理。多个 transform 可链式：

```js
Plot.dot(data,
  Plot.binX({y: "count"},
    Plot.normalizeY({basis: "sum"}, {x: "carat"})
  )
)
```

旁注：

1. transform 是 `(options, data) => ({channels, data})` 形式
2. 链式套用：内层先执行（normalizeY 先做归一化，binX 再 bin）
3. 内置 transform 覆盖最常用：bin / group / stack / window / normalize / dodge / map / select / sort / aggregate / hexbin / interval / centroid
4. transform 与 mark 解耦：`Plot.binX({y: "count"}, {x: "carat"})` binX 可与 dot / line / bar / rect 任意 mark 组合
5. 类似 dplyr / pandas pipeline，但完全声明式（无中间变量）
6. 自定义 transform：实现接口即可（社区有 d3-array 桥接版）
7. transform 之间的执行顺序由"嵌套层级"决定，不是"数组顺序"——这一点很多新手踩坑
8. 性能上：每个 transform 都遍历一次数据，链式 N 个 transform 就是 N 倍数据遍历

> 怀疑：Plot transform 与 dplyr / pandas 重合很多。数据科学家是会先用 Plot 一步到位，还是分两步（pandas 预处理 → Plot 可视化）？Plot 文档示例都很简单，复杂场景的边界在哪？

![Observable Plot grammar of graphics 模型](/study/projects/observable-plot/01-grammar.webp)

## Layer 4 — 与框架集成

Plot 完全 vanilla DOM，无 React/Vue/Angular 适配层。集成方式：

### React

```jsx
import * as Plot from "@observablehq/plot";
import {useEffect, useRef} from "react";

function PlotChart({data}) {
  const ref = useRef();
  useEffect(() => {
    const plot = Plot.plot({
      marks: [Plot.dot(data, {x: "x", y: "y"})]
    });
    ref.current.append(plot);
    return () => plot.remove();
  }, [data]);
  return <div ref={ref} />;
}
```

旁注：

1. useEffect + ref + Plot.plot.append 是标准模式
2. 缺点：每次 data 变就 remove+append（无 React reconciliation）
3. 优化：Plot 0.6+ 支持 `Plot.plot(spec).update(newSpec)` 部分增量更新（实验性）
4. SSR：Plot 默认输出 SVG node，可在 jsdom 包装环境跑（Observable Framework 这样做）
5. RSC（React Server Components）：直接序列化 SVG 字符串到 HTML 流（与 visx / Recharts 一致）
6. React 19 的 concurrent rendering 与 Plot 的命令式 append 没有理论冲突，但调试体验仍然不如组件化方案

### Vue / Svelte

类似 React 模式：onMount + ref + append。社区有 `vue-plot` 包装但活跃度低。

### Observable notebook

是 Plot 的"原生家园"。Observable runtime 自动检测 Plot.plot 返回值并渲染。

### Astro / 静态站点

SSR 输出 SVG 字符串非常合适静态站点：

```astro
---
import * as Plot from "@observablehq/plot";
const svg = Plot.plot({marks: [...]}).outerHTML;
---
<div set:html={svg} />
```

构建期算完，运行期零 JS。这是 Plot 在静态站点的最大优势。

## Layer 5 — 6 维对比表

| 维度 | Plot | d3 | visx | Recharts | Nivo | Chart.js | ECharts | Vega-Lite |
|---|---|---|---|---|---|---|---|---|
| API 简洁度 | ★★★★★ | ★ | ★★ | ★★★★ | ★★★★ | ★★★★ | ★★ | ★★★★★ |
| 默认美观 | ★★★★★ | ★★ | ★★★ | ★★★ | ★★★★ | ★★★ | ★★★★ | ★★★★ |
| 灵活度 | ★★★★ | ★★★★★ | ★★★★ | ★★ | ★★★ | ★★ | ★★★★ | ★★★ |
| TS | ★★★★ | ★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★★★ | ★★★ |
| Bundle | 中 | 全量 250KB | 按需 ~3KB | 全量 100KB | 全量 200KB | 全量 90KB | 全量 1MB | 全量 200KB |
| 与框架关系 | 命令式（中） | 命令式（中） | React 组件（佳） | React 组件（佳） | React 组件（佳） | 命令式 | 命令式 | JSON spec |
| 哲学 | grammar | 数学引擎 | d3 + React | JSX 图表 | 高层 + theme | 标准图表 | 配置式 | grammar (JSON) |

## Layer 6 — 限制

1. **完全 declarative**：自定义图表（如 Sankey 之外的 flow）需写自定义 mark，比 d3 写 d3-shape 函数更曲折
2. **无内建动画系统**：v0.6.0 加了一点 transition 支持，但远不及 GSAP / framer-motion 时序粒度
3. **SVG-only**：≤ 10k 数据点 OK，> 10k 卡顿；想要 Canvas 性能需自己绕（Bostock 在 Twitter 公开说"暂不计划 Canvas backend"）
4. **与 React 集成不优雅**：不是组件，是命令式 API，每次渲染整图重建，state preservation（cursor 位置、tooltip 状态）需自己管
5. **TS 类型仍在演进**：0.6 系列 type 偶有 break；mark options 的 union 类型推断在复杂场景失败
6. **文档碎片**：核心 API 在 observablehq.com/plot，但 examples 散在 Observable notebook 上千份，新人难导航
7. **无 dashboard 组件**：Plot 只画单图。要做 dashboard（多图联动、cross-filter、shared brush）需自己实现联动逻辑
8. **i18n 支持弱**：axis label / tooltip 文本无内建 i18n hook，需在 spec 里手写

## 怀疑总集

> 怀疑：Plot 完全 vanilla DOM 在 React 时代是不是反潮流？Observable 团队为什么没做官方 React 包装层？是哲学坚持还是维护成本考量？我猜：Bostock 个人不想被 React API 绑死，但代价是 React 生态采用率低于 Recharts / visx。

> 怀疑：grammar of graphics 在 R/Python（ggplot2 / plotnine）有强生态，因为这两个语言的核心用户是数据科学家。JS 的核心用户是前端工程师，他们的需求是"在 web 应用里加图表"，更接近 Recharts 而非 ggplot2。Plot 的目标用户错位了？还是在赌"未来数据科学家也用 JS"？

> 怀疑：Plot 与 Vega-Lite 都是 grammar of graphics 实现，但 Vega-Lite 用 JSON spec，Plot 用 JS 函数。两种 API 哪个更适合 LLM 自动生成？JSON 更结构化（更好生成），但 JS 函数有类型推断 + IDE 补全。这是不是 LLM 时代的新维度？

> 怀疑：Plot 押注 SVG 而拒绝 Canvas，是哲学坚持还是迟到？deck.gl / regl 这样的 WebGL 数据可视化库正在崛起，10 万+点的散点图已是常见需求。Plot 的"SVG-only"会不会在 5 年后变成包袱？

## GitHub Permalinks

源码精读入口（链接示意，未实际验证 SHA）：

- Plot.plot 主入口：`https://github.com/observablehq/plot/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/src/plot.js`
- Plot.dot mark 实现：`https://github.com/observablehq/plot/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/marks/dot.js`
- Plot.binX transform：`https://github.com/observablehq/plot/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/src/transforms/bin.js`
- Plot.scale 系统：`https://github.com/observablehq/plot/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/src/scales.js`

## Layer 7 — 实战

Observable notebook 工作流：

1. 浏览器打开 observablehq.com，新建 notebook
2. 写 `Plot.plot({...})` 立即可视化
3. 单 cell 编辑 → 全图重渲（reactive runtime 自动）
4. 数据可来自 file upload、fetch、Observable 数据集
5. notebook 可 fork、share、embed 到博客

数据科学家偏爱场景：

- 探索性分析（EDA）：写 5 行 Plot 出散点图比 matplotlib 快
- 报告生成：notebook 直接发布
- 教学：Bostock 在 Observable 上发布数百个 Plot 示例

vs jupyter / matplotlib：

- Plot：网页原生、reactive、share via URL
- jupyter + matplotlib：本地 ipynb、静态图、conda 安装

vs ggplot2：

- ggplot2 在 R 用户里地位无可撼动
- Plot 在 JS 是"Bostock 的钦定继任者"，但 JS 数据科学用户基数远小于 R

工业实战的常见 pattern：

- 多 mark 叠加：散点 + 拟合线 + 标注
- facet 分面：按类别切多张子图，每张子图共享 scale
- bin + 颜色编码：连续变量分桶 → 离散颜色映射，做密度图
- transform 链 + tooltip：先 group 再 stack，再用 Plot.tip 加交互

学一遍后回头看 Recharts / Nivo，会觉得它们的"组件式 API"在表达力上有明显短板——你能在 Recharts 里画一个 facet 吗？能链式做 bin → normalize → stack 吗？基本不能。

## 学到什么 + 关联

学到的：

1. grammar of graphics 思想 30 年（Wilkinson 1999 → ggplot2 2009 → Plot 2021）跨语言生命力极强
2. "默认美观"是关键卖点 —— Bostock 把 Plot 的 typography 与 spacing 调到工业级，这是 d3 的弱项（d3 默认很粗糙）
3. 命令式 API（vanilla DOM）vs 声明式 API（React 组件）是数据可视化库的根本分野
4. 隐藏底层（Plot 隐藏 d3）vs 暴露底层（visx 暴露 d3）是设计哲学
5. JSON spec（Vega-Lite）vs JS 函数（Plot）是 LLM 时代的新维度
6. 一个库的"目标用户错位"问题：Plot 想给数据科学家用，但 JS 的主用户是前端工程师
7. 库的"逃生舱口"设计：Plot 没有，ECharts 有 graphic 配置项，d3 本身就是底层——不同设计选择适合不同人群

关联：

- [[d3]] — Plot 的内部依赖 + 哲学反向
- [[echarts]] — 命令式 + 配置式（option JSON），与 Plot grammar JS 同一阵营
- [[visx]] — React-first + 暴露 d3，Plot 的反例
- [[recharts]] — 完全 React 组件 + JSX，Plot 的另一反例
- [[gsap]] — 动画引擎，Plot 没有内建动画系统的对照
- [[chart-js]] — 标准图表组件库，Plot 在 grammar 抽象上层级更高
- [[nivo]] — React + theme 优先，与 Plot 设计哲学正交
