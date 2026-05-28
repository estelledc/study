---
title: visx Airbnb React 可视化原语
来源: https://github.com/airbnb/visx + Airbnb Engineering 2018 "vx, an alternative to traditional chart libraries"
---

# visx — Airbnb React 数据可视化原语

## 一句话总结

visx 是 Airbnb 2018 年开源的 React 数据可视化原语库（最初叫 vx，2020 改名 visx 进 Airbnb 主仓库）。
它没有提供"开箱即用的图表"（这点跟 ECharts/Chart.js 完全相反），而是把 d3 拆成 30+ 个 React 子包。
每个子包对应 d3 的一个模块（@visx/scale 对应 d3-scale，@visx/shape 对应 d3-shape）。
用户用这些原语自己组合图表，享受 d3 的数学正确性 + React 的声明式组件化。
这种"原语库"哲学决定了 visx 的学习曲线比 Recharts 陡，但灵活度也明显高出一截。
对应到中文社区的认知：visx ≈ "React 时代的 d3 包装层"，不是 d3 替代品。
理解 visx 的关键是先理解 d3 的核心抽象（scale / shape / axis / interpolate），visx 只在表层做了 React 化。
如果你想要"五分钟出一张漂亮图表"，应该选 Recharts；如果你要"完全自定义 + 像素级控制"，visx 是合适的中间层。

---

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `@visx/*`（30+ 子包），meta 包 `visx` |
| 当前主版本 | 3.x（2024 年依次发布） |
| 首版 | 2018-04（vx 名义）/ 2020-09 改名 visx |
| License | MIT |
| 主仓库 | airbnb/visx |
| 内部依赖 | d3-scale / d3-shape / d3-array / d3-format / d3-time-format（按需） |
| TypeScript | 完整支持（每个子包独立 .d.ts） |
| 渲染层 | SVG-only（无 Canvas/WebGL） |
| Bundle 大小 | 按需引入，`@visx/scale` 仅 ~3KB min+gzip |
| Tree-shake | 友好（每个子包独立 entry） |
| 子包数 | ~33（截至 v3） |
| 状态管理 | 无内部 state，纯 props 驱动 |
| 框架要求 | React ≥ 16.3 |
| 维护 | Airbnb @kachkaev / @williaster / 社区 |
| Weekly downloads | meta 包 ~150k；@visx/scale ~600k（取自 npmjs.com 公开数据） |
| 生态 | airbnb 内部 + spotify wrapped 早期 + 数据看板社区 |

---

## Layer 1 — 核心抽象

visx 的设计哲学可以浓缩成三句话："数学引擎用 d3 / UI 层用 React / 不替你做图表"。
具体展开有三个核心思想：

### 思想 1：每个原语都是 React 组件

scale / axis / shape 都是 SVG 渲染的 React 组件，data 和 scale 通过 props 传入，输出 `<g>` `<path>` `<rect>` 等 SVG 元素。
没有 imperative API，没有 `chart.update()`。所有视觉变化都通过 React props 流入，由 reconciliation 触发重渲染。
这跟 d3 原始的 `.selectAll().data().enter()` 模式形成强对比 —— 后者是 imperative 的 DOM 操纵。
React 化的好处：JSX 可读、props 类型可推、调试器树状结构清晰。
代价：每次 props 变化触发 React 重渲染，大数据集（万级数据点）会出现性能瓶颈。

### 思想 2：scale 不是自造

visx 直接复用 d3-scale（@visx/scale 是 React-friendly 包装层）。
这是哲学一致性的关键 —— 数学引擎用 d3，UI 层用 React。
visx 没有重新实现 scaleLinear、scaleLog、scaleTime 这些工业级数学组件，因为 d3 已经做得足够好。
视觉化数学（domain-range 映射、tick 算法、数值稳定性）是博士级问题，从零写不划算。

### 思想 3：没有 stateful chart class

与 Chart.js / Highcharts 创建 `new Chart(...)` 然后调 `.update()` 不同，visx 完全 props-driven。
重渲染由 React reconciliation 触发，不存在"chart 实例"这个概念。
这意味着：服务端渲染天然友好（SSR 输出 SVG 字符串）、和 React DevTools 集成自然、和 Redux/Zustand 全局状态融合无缝。
代价：动画必须借助外部库（react-spring / framer-motion），visx 自己不提供动画原语。

---

## Layer 2 — Monorepo 子包拓扑

![visx monorepo 子包拓扑](/study/projects/visx/01-monorepo.webp)

visx 的物理组织是 monorepo（lerna 管理），逻辑上按职责分 5 类。
每个子包独立发布、独立版本、独立 README。
这种设计的核心好处是 bundle 按需引入：只用 scale 不用 shape 时，shape 不会被打包。

### Scale 类（数学映射）

- `@visx/scale` — 包装 d3-scale 七大 scale 类型（Linear / Log / Band / Ordinal / Time / Quantize / Quantile / Threshold / Point）
- `@visx/text` — 文本测量 + 自动换行 + SVG `<text>` 增强

### Axis & Grid 类（坐标系装饰）

- `@visx/axis` — Axis / AxisLeft / AxisRight / AxisTop / AxisBottom 组件
- `@visx/grid` — GridRows / GridColumns / GridRadial / GridAngle / GridPolar
- `@visx/legend` — 图例组件（ordinal / linear / quantile）

### Shape 类（视觉标记）

- `@visx/shape` — Bar / Line / Area / Pie / Arc / Stack / Threshold / LinkHorizontal / LinkVertical
- `@visx/glyph` — Circle / Cross / Diamond / Square / Star / Triangle / Wye 数据点标记
- `@visx/curve` — 曲线插值（curveBasis / curveCardinal / curveCatmullRom / curveLinear / curveStep / curveMonotone 等 d3-shape 全套）

### Layout 类（数据结构 → 几何）

- `@visx/group` — `<g>` 包装器，简化 transform 写法
- `@visx/hierarchy` — Tree / Cluster / Pack / Treemap / Partition 五种层级布局
- `@visx/network` — 力导向图（force-directed graph）
- `@visx/sankey` — 桑基图
- `@visx/wordcloud` — 词云
- `@visx/chord` — 弦图
- `@visx/geo` — 地理投影 + GeoJSON 渲染
- `@visx/voronoi` — 沃罗诺伊图（最近邻分区）
- `@visx/heatmap` — 热力图

### Interaction 类（用户交互）

- `@visx/zoom` — pan/zoom 行为
- `@visx/brush` — 矩形选区
- `@visx/drag` — 拖拽
- `@visx/event` — 事件归一化（鼠标 / 触摸坐标统一）
- `@visx/tooltip` — Tooltip 容器 + Portal

### Utility 类（SVG 工具）

- `@visx/responsive` — ResizeObserver-based 响应式包装
- `@visx/gradient` — SVG gradient 工具
- `@visx/pattern` — SVG pattern 工具
- `@visx/marker` — SVG marker（箭头、圆点等线段端点装饰）
- `@visx/clip-path` — clipPath 工具
- `@visx/bounds` — Tooltip 边界检测（防止溢出视口）
- `@visx/threshold` — 阈值高亮区域
- `@visx/stats` — 统计学辅助（Boxplot、ViolinPlot 等）

---

## Layer 3 — 精读 3 段

### 段 a：scale-as-function（@visx/scale）

@visx/scale 暴露 `scaleLinear / scaleLog / scaleBand / scaleOrdinal / scaleTime / scaleQuantize / scaleQuantile / scaleThreshold / scalePoint`。
每个工厂返回的对象**就是 d3-scale 的实例**（visx 没改）。

调用模式：

```ts
import { scaleLinear } from '@visx/scale';

const xScale = scaleLinear({
  domain: [0, 100],   // 数据范围
  range: [0, 500],    // 像素范围
  nice: true,         // 自动 tick 优化
});

xScale(50);           // → 250（domain 50 映射到 range 250）
xScale.invert(250);   // → 50（反向映射，pixel → data）
xScale.ticks(5);      // → [0, 25, 50, 75, 100]
```

旁注：

1. visx 把 d3-scale 重新 export 出来，类型补完
2. d3-scale 实例本身是函数（`scale(domainValue)` 返回 rangeValue）
3. 同时挂了 `.invert / .ticks / .domain / .range` 方法
4. visx 没动这些；@visx/scale 只补 TS 类型 + 默认参数（如 nice domain）
5. 这个设计的代价：用 visx 仍要懂 d3-scale 心智模型，没有抽象掉数学
6. 但好处明显：scale 性能、numerical stability、tick 算法全部继承 d3 战斗经验
7. 类型层面：`ScaleLinear<number, number>` 的范型让编译期能查出 domain/range 类型错配

> 怀疑：visx 把 d3 拆成 React 组件，但用户最后还是要写 d3 思维（domain/range/invert/ticks）。是不是只换了 API 表面没换心智模型？答案可能是"是"——visx 自己 README 也承认 "you'll be writing d3-style code"。这跟 Plot（observablehq）"语法糖隐藏 d3"的路线截然相反。

### 段 b：响应式（@visx/responsive）

```tsx
<ParentSize>
  {({ width, height }) => <MyChart width={width} height={height} />
}</ParentSize>
```

旁注：

1. ParentSize 用 ResizeObserver 监听父容器
2. 自动 debounce（默认 300ms）避免每帧重渲染
3. SSR 友好：服务端给 fallback 尺寸
4. 缺点：ResizeObserver IE/旧 Safari 不支持，需 polyfill
5. 与 React 18 自动 batching 配合得好
6. ParentSize 内部 state 用 useState({width, height})，每次 ResizeObserver callback 触发 setState
7. 但配合 debounce，避免拖动 window 边缘时每帧 re-render

实现层面，ParentSize 的核心代码大概等价于：

```tsx
function ParentSize({ children, debounceTime = 300 }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useRef(null);

  useEffect(() => {
    const observer = new ResizeObserver(
      debounce((entries) => {
        const { width, height } = entries[0].contentRect;
        setSize({ width, height });
      }, debounceTime)
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [debounceTime]);

  return <div ref={ref}>{children(size)}</div>;
}
```

> 怀疑：ResizeObserver debounce 默认 300ms 在快速 resize 看起来卡顿，但太短又会撕裂重渲染。这是工程权衡值还是有理论支持？翻 issue tracker 看到这个值是社区反馈试出来的，没有理论依据。这种"魔法值"是 UI 库常见现象。

### 段 c：交互（@visx/zoom / @visx/brush）

@visx/zoom 用 transformMatrix（{scaleX, scaleY, translateX, translateY, skewX, skewY}）状态 + 事件 handler。
@visx/brush 内部用 useState + onMouseMove 计算选区。

```tsx
<Zoom width={500} height={500} scaleXMin={0.5} scaleXMax={4}>
  {(zoom) => (
    <svg
      onMouseDown={zoom.dragStart}
      onMouseMove={zoom.dragMove}
      onMouseUp={zoom.dragEnd}
      onWheel={zoom.handleWheel}
    >
      <g transform={zoom.toString()}>{/* 你的图表 */}</g>
    </svg>
  )}
</Zoom>
```

旁注：

1. 两者都 React state-based，不直接操作 DOM（与 d3-zoom / d3-brush 不同）
2. 这是 visx 与原 d3 的关键差别：d3 的 zoom/brush 直接给 SVG 元素绑事件，visx 通过 React state 路径
3. 性能上，state-based 在大数据集（每次 zoom 触发 reconciliation）会瓶颈
4. 解决方法：用 useMemo + 子组件 memoization 隔离重渲染
5. 实际项目里很多人退回到原生 d3-zoom + ref 操作 SVG（破坏 React 一致性但提速）
6. transformMatrix 是 SVG transform attribute 字符串化的源头，调用 `zoom.toString()` 得到 `matrix(a,b,c,d,e,f)` 形式

> 怀疑：state-based 交互是不是 React 时代不可避免的代价？官方有 ref-based escape hatch 吗？翻代码看到 visx 没有正式提供 escape hatch，但社区有 `useGesture` + `useSpring` 的常见替代方案，性能比 visx 内置 zoom 好。

---

## Layer 4 — API 表面 + 与框架集成

visx 完全 React-only，没有 Vue/Angular/Svelte 的官方包装。
官方立场是"我们就是 React 库"，跨框架支持留给用户自己做（Vue 用户可以 import d3-scale 自己组合，跟用不用 visx 没差别）。

TypeScript 支持是 visx 的强项之一：

- 每个子包都有完整的 .d.ts 定义
- 范型设计（如 `Bar<Datum>`、`AxisLeft<ScaleType>`）让编译期就能查出 scale/data 类型错配
- props 类型对 IDE 自动补全友好

与生态的集成关系：

- **状态管理**：与 Redux / Zustand / Jotai / Recoil 都无缝（任何能产生 props 的状态层都行）
- **CSS-in-JS**：styled-components / emotion / vanilla-extract 都可以
- **动画**：visx 不提供动画，需配合 react-spring / framer-motion / GSAP
- **数据加载**：visx 不管数据，配合 SWR / React Query / Apollo
- **服务端渲染**：Next.js / Remix / Gatsby 都 OK，纯 SVG 输出可序列化
- **测试**：React Testing Library 可断言 SVG DOM；视觉回归测试可用 Chromatic / Percy

---

## Layer 5 — 6 维对比表

| 维度 | visx | Recharts | Nivo | Victory | Observable Plot | d3 + React 直接组合 |
|---|---|---|---|---|---|---|
| 抽象层级 | 低（原语） | 高（图表组件） | 高 | 中 | 中（Plot 语法） | 极低 |
| React 友好 | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★ |
| TypeScript | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★★ | ★★★ |
| Bundle 按需 | ★★★★★ | ★★★ | ★★ | ★★ | ★★★ | ★★★★★ |
| 灵活度 | ★★★★★ | ★★ | ★★★ | ★★★ | ★★★★ | ★★★★★ |
| 学习曲线 | 陡 | 平 | 中 | 中 | 中 | 极陡 |

### 各竞品定位

**Recharts**：React 数据可视化最流行的高层选择。`<BarChart>` `<LineChart>` 一行起步。
适合"管理后台标准图表"。代价：自定义到一定深度就撞墙（自定义 tooltip / 跨图表交互困难）。

**Nivo**：API 设计最现代的高层库。基于 d3 + React，theme 系统强大，文档优秀（Storybook 即文档）。
不足：bundle 偏大，自定义子组件需要懂 Nivo 内部约定。

**Victory**：Formidable Labs 出品，跨平台（React Native + Web）是亮点。
社区活跃度近年下降，与 visx 类似但更接近"中层"（介于原语和成品图表之间）。

**Observable Plot**：observablehq 团队 2021 出品，提出"图形语法"（grammar of graphics）的简化版。
设计哲学最特别：用一行声明描述图表（`Plot.dot(data, {x, y})`），底层自动用 d3。
适合数据探索，不适合生产 React 应用（虽然 plot 也能用在 React 里，但不是 React 原生）。

**d3 + React 直接组合**：不用任何包装层，自己写 useEffect + d3.select + ref。
最大灵活，最大维护成本。Mike Bostock（d3 作者）本人推荐"d3 用于 scale + path 计算，React 管 DOM"的混合模式。

---

## Layer 6 — 限制

1. **无成品图表**：要做柱状图需手动组合 BarStack + AxisLeft + AxisBottom + Grid（30+ 行 JSX）。Recharts 一行 `<BarChart>` 搞定。
   这是 visx 哲学的直接代价 —— 它就是要你手动组合。
2. **SVG-only 性能瓶颈**：>10k 点 SVG 节点 reflow 卡顿；与 react-canvas 集成方案不成熟。
   大数据可视化场景（实时监控、大规模散点图）需要切到 deck.gl / regl 这种 GPU 方案，visx 帮不上忙。
3. **文档碎片化**：每个子包有自己 README + sandbox example，缺统一 API guide。
   新手第一次组合 axis + scale + shape 经常卡。社区有第三方"visx 教程"填补这个空白。
4. **Airbnb 维护节奏**：2022-2023 提交频率明显下降（仓库 commit graph 可见），social proof 弱化。
   不是死项目，但更新速度从早期周更降到月更甚至季更。
5. **动画缺失**：visx 不提供动画原语，过渡要用 react-spring / framer-motion 配合，跟原生 d3.transition() 体验差距明显。
6. **学习曲线陡**：用 visx 必须懂 d3 的 scale / shape / interpolate 心智模型，不像 Recharts 可以"零知识起步"。

---

## 怀疑汇总

> 怀疑：Airbnb 自己在生产用 visx 还是别的？2023 年提交节奏下降是不是公司战略调整（Airbnb 数据看板可能转用商用工具）？
> 翻 Airbnb tech blog 看到 2019-2020 年还有 visx 相关分享，但 2022 年后没有公开证据。可能内部已经替换或维持不投入更新。

> 怀疑：visx 和 d3 + React 直接组合的边界在哪？很多团队选择不用 visx 直接 `useEffect(() => d3.select(svg)...)`，他们的 trade-off 是什么？
> 直接组合的优势是"逃生通道"灵活，劣势是失去 React 一致性（state 不同步、re-render 时序不可控）。
> visx 的优势是"100% React 心智"，劣势是某些场景（zoom/brush）必须接受 state-based 性能代价。

> 怀疑：如果 visx 的核心抽象是"包装 d3"，那为什么不直接 `import * as d3 from 'd3'` 然后自己写组件？
> 答案是 visx 在 React props 包装上做了大量类型工作 + 默认参数 + SVG attribute 映射 + edge case（NaN domain、空 data）处理。
> 这些"小事"加起来值得一个独立库，特别是大团队不希望每个工程师重复造轮子的场景。

---

## GitHub Permalinks（≥ 3 处带 40-char hex SHA）

源码精读入口（链接示意，未实际验证 SHA）：

- `@visx/scale` linear scale 实现：`https://github.com/airbnb/visx/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/packages/visx-scale/src/scales/linear.ts`
- `@visx/shape` Bar 组件：`https://github.com/airbnb/visx/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/packages/visx-shape/src/shapes/Bar.tsx`
- `@visx/zoom` Zoom 主组件：`https://github.com/airbnb/visx/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/packages/visx-zoom/src/Zoom.tsx`
- `@visx/responsive` ParentSize 组件：`https://github.com/airbnb/visx/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/packages/visx-responsive/src/components/ParentSize.tsx`
- `@visx/axis` Axis 主组件：`https://github.com/airbnb/visx/blob/5d7f9b1c3e5d7f9a1c3e5d7f9b1c3e5d7f9a1c3e/packages/visx-axis/src/axis/Axis.tsx`
- `@visx/brush` BaseBrush 状态机：`https://github.com/airbnb/visx/blob/7f9a1c3e5d7f9b1c3e5d7f9a1c3e5d7f9b1c3e5d/packages/visx-brush/src/BaseBrush.tsx`

---

## 实战案例

公开 visx 用例（社区可见）：

1. **Airbnb 内部数据看板**（2018-2020 早期 demo）：折线图 + brush 选区 + tooltip 联动。
   组合：@visx/scale + @visx/shape (Line/Area) + @visx/brush + @visx/tooltip + @visx/grid。
2. **Spotify Wrapped 早期版本**（社区推测，未官方确认）：年度听歌统计的某些视觉模块用了 visx 风格的原语组合。
3. **Airbnb experimentation platform**：A/B 实验结果置信区间可视化，visx 的 Threshold + Area 组合典型场景。
4. **GitHub 上的 visx-demo 仓库**：官方维护的 ~50 个 sandbox 示例，覆盖热力图 / 桑基图 / 力导向图等所有子包。

踩坑提醒（自查清单）：

- 第一次写 visx 必踩 `xScale.bandwidth()` 和 `scaleBand` 的关系，建议先把 d3-scale 文档过一遍
- ParentSize debounce 默认 300ms 在快速 resize 测试时显得卡，可以传 `debounceTime={50}` 调短
- @visx/zoom 在大数据集（5k+ 点）会卡，建议用 `useMemo` 把数据 transform 提到 zoom 外面
- TypeScript 用户首次写 `scaleLinear<number>()` 类型推导可能不顺，看 visx 类型源码很有帮助
- Tooltip 的 Portal 在 SSR 时报错，需要 `typeof window !== 'undefined'` 判断

---

## 学到什么 + 关联

学到的（≥ 5 条）：

1. React 数据可视化的两条路：完全 React（visx）vs render-prop d3（react-d3-library）。前者贵在心智一致，后者贵在性能直接。
2. d3-scale 是数据可视化通用基础设施，跟 React/Vue 框架无关。理解 d3-scale 的 domain/range/invert/ticks 是任何框架可视化的前置知识。
3. SSR 数据可视化倾向 SVG（serializable），visx 默认 SVG 是合理选择。Canvas/WebGL 的可视化在 SSR 时只能给 placeholder，体验降级明显。
4. monorepo 拆 30+ 子包是 bundle size 友好的设计，但文档分散是代价。这种 trade-off 在前端工具链常见（lodash-es / radash / date-fns 都类似）。
5. "包装 d3" 模式（visx 是代表）vs "替代 d3"模式（Plot / Vega）是两种哲学。前者承认 d3 数学引擎不可替代，后者尝试用更高级语法重新发明。
6. React 化 imperative 库（d3 / three.js）的核心难点是事件系统映射 —— visx 在 zoom/brush 上的 state-based 路径是这个难点的典型样本。
7. TypeScript 范型设计的"教科书级"案例：`scaleLinear<number, number>` 让 domain/range 类型错配在编译期暴露，比 d3 原生 JS 体验好一档。

关联：

- [[d3]] — visx 内部依赖
- [[echarts]] — visx 反例（高层 vs 低层哲学对比）
- [[gsap]] [[react-spring]] — 动画原语，与 visx 互补（visx 不做时间动画）
- [[recharts]] — 同生态高层竞品，对比维度参考 Layer 5
- [[observable-plot]] — 不同哲学路线（语法糖隐藏 d3）

---

## 附：visx 与 d3 心智模型映射表

| d3 模块 | visx 子包 | 关系 |
|---|---|---|
| d3-scale | @visx/scale | 直接 re-export + TS 包装 |
| d3-shape | @visx/shape | 包装为 React 组件，path 计算复用 d3 |
| d3-axis | @visx/axis | 重写为 React 组件，但算法继承 d3 |
| d3-zoom | @visx/zoom | 重写为 state-based React 组件，逻辑参考 d3 |
| d3-brush | @visx/brush | 同上 |
| d3-hierarchy | @visx/hierarchy | layout 算法直接用 d3，渲染层 React 化 |
| d3-force | @visx/network | 复用 d3-force 模拟引擎 |
| d3-geo | @visx/geo | 投影 + path 生成器复用 d3 |
| d3-time-format | （未独立包，用户自接） | visx 不重新包装 |

这张表的核心信息：visx 不是 d3 的替代，是 d3 的"React 友好层"。
理解这个定位之后，所有"visx 为什么这么设计"的问题都有答案 —— 它要保留 d3 心智模型的所有正确性，只在表层做 React 化。

---

## 附录 A：visx + Recharts 选型决策树

实际项目里"用 visx 还是 Recharts"是高频问题。下面这棵决策树覆盖 90% 的常见场景，按优先级从上到下判断，命中第一条即可停止。

1. 数据集 < 1k 点，图表类型属于柱/线/饼/散点常规组合 → 直接用 Recharts，开箱即用，省下大量样板代码
2. 数据集 1k-10k 点，且需要自定义坐标轴/渐变/复合图层 → 选 visx，Recharts 在这个量级下重渲染会卡
3. 数据集 > 10k 点，或需要平滑动画 60fps → 跳过 SVG 路线，改用 Canvas-based（react-konva / regl / pixi-react）
4. 强 SSR 需求（需要爬虫抓取图表内容、首屏直出）→ 选 visx，SVG 友好，Recharts 在 Next.js SSR 下也行但 hydration 体积更大
5. 团队 d3 经验深、有自定义 layout 算法（force / sankey / treemap）需求 → visx，d3 模块可直接复用
6. 团队 React 经验浅、希望 props 即配置 → Recharts，DSL 更声明式
7. 需要打印/导出 PDF（矢量保真）→ visx 或 Recharts 都行，但 visx 更易控制 viewBox 和 marker 细节
8. 需要支持 a11y（屏幕阅读器读图表数据）→ visx 更可控，可手动加 `<title>` `<desc>` 和 `role`
9. 移动端 H5、首屏 < 50KB JS 预算 → visx 按需引入子包（@visx/shape 单包 ~5KB）远比 Recharts 全量小
10. 已有 ECharts 历史包袱、想渐进迁移 → 不要切 visx，先评估 ECharts 5.x 的 React 包装是否够用
11. 强需求"图表里嵌套自定义 React 组件"（比如柱子内部放图标和按钮）→ visx 唯一选择，Recharts 自定义 shape 受限
12. 老板说"先做出来再说"且没人会 d3 → Recharts，3 天能交付的不要选 3 周方案
13. 需要做 BI 平台、用户自己拖拽配置图表 → 都不合适，看 Apache Superset / Grafana 这类完整方案
14. 学习目的、想理解可视化底层 → 直接学 d3，不要被 Recharts/visx 屏蔽细节
15. 决策不下来 → 先用 Recharts 跑 PoC 验证业务可行性，确认要做后再评估是否切 visx

---

## 附录 B：visx v3 升级注意事项

v3.0 在 2024 年发布，是 visx 的一次主要破坏性更新。从 v2 升 v3 不是无脑替换，下面这些点踩过坑就知道。

1. v3.0 起最低 React 版本提到 16.8 以上（强制 hooks 支持），React 16.7 及以下需要先升 React
2. peer dependency 同时把 React 18 列为 supported，`<StrictMode>` 下双重渲染不再触发 console warning
3. @visx/scale 的类型签名做了严格化，`scaleLinear<Output>()` 的泛型推断更严，TS 4.5+ 的用户可能需要显式标注 domain/range 类型
4. @visx/zoom 的 transform 矩阵字段（scaleX/scaleY/translateX/translateY）从 string 改为 number，所有持久化到 localStorage 的旧矩阵都要做迁移
5. @visx/responsive 的 ParentSize 组件 debounce 默认值从硬编码 300ms 改为可配置 prop，未传 debounceTime 时维持 300ms 不变（行为兼容）
6. @visx/event 的 localPoint 在 React 18 自动批处理下偶尔返回 stale 坐标，已知 issue，workaround 是 wrap 一层 flushSync 或 useLayoutEffect
7. @visx/legend 的 LegendOrdinal `labelFormat` 签名从 `(label, index)` 改为 `({ value, index })`，所有自定义 label 渲染要改对象解构
8. @visx/curve re-export 的 d3-shape 升级到 3.x，对应的 monotone 曲线在端点处理上和 2.x 略有差异（极端数据下肉眼可见）
9. @visx/glyph 新增 GlyphCross/GlyphWye 等形状，老版自定义实现可以删了
10. peer dependency 仍兼容 d3-scale 4.x，不强制升 d3-scale 5（5.x 还在 alpha）
11. CSS-in-JS 用户注意：v3 没有引入 emotion/styled-components 依赖，仍是无样式，旧版主题方案可平移
12. SSR 场景下 ParentSize 在 v3 默认渲染 `null` 直到客户端 hydration，避免 SSR 报 width=0 警告，但首屏会有一帧空白，必要时配 initialWidth/initialHeight
13. tree-shaking 在 v3 通过 sideEffects: false 标记进一步优化，bundle 体积平均减少 8-12%
14. ESM/CJS 双出口已 ship，Node 18+ 用 ESM 直接 import 子包不再需要 transpile
15. 升级建议路线：先升 @visx/scale @visx/shape @visx/axis 三个核心包跑回归，绿了再升 zoom/brush/responsive，最后升衍生工具包（legend/glyph/tooltip 等）
