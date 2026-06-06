---
title: visx — 把 d3 拆成 30 块乐高的 React 可视化原语
来源: 'https://github.com/airbnb/visx + Airbnb Engineering 2018 "vx, an alternative to traditional chart libraries"'
日期: 2026-05-30
子分类: 前端工程
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

visx 是 **Airbnb 把 d3 拆成 30+ 个 React 子包的可视化原语库**。日常类比：[[recharts]] 像超市买现成蛋糕（柜里挑一个就走）；visx 像烘焙原料店（面粉、糖、模具分开卖，自己揉自己烤）。

最小用法：

```tsx
import { scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';

const xScale = scaleLinear({ domain: [0, 100], range: [0, 500] });
// xScale(50) → 250；xScale.invert(250) → 50

<svg width={500} height={200}>
  <Bar x={xScale(20)} y={0} width={20} height={150} fill="steelblue" />
</svg>
```

它不替你画"柱状图"——你得自己拼 axis / grid / shape / tooltip。代价是初学陡，回报是任意自定义。原项目 2018-04 叫 **vx**，2020-09 改名进 Airbnb 主仓库变 **visx**。

## 为什么重要

不理解 visx，下面这些事都没法解释：

- 为什么 React 项目里用原生 d3 总撞墙：`d3.select(svg).selectAll(...)` 是 imperative，跟 React 的 declarative 重渲染时序对不上
- 为什么 [[recharts]] 易上手但深度自定义就卡死，visx 反过来——慢上手但天花板高
- 为什么 SSR / Next.js 场景里大家选 SVG-based 方案而不是 Canvas
- 为什么"按需 import 几个 schema"在 [[d3]] 这种工具库时代变成硬性优势（bundle 4KB vs 全量 50KB）

## 核心要点

visx 的设计可以拆成 **三句话**：

1. **数学引擎用 d3，UI 层用 React**：`@visx/scale` 直接 re-export d3-scale 实例，没重写 scaleLinear/scaleLog。类比：visx 是 d3 的"翻译官"，不是替代品。

2. **每个原语是独立 React 组件**：scale / axis / shape 都是 props 驱动的 SVG 组件，没有 imperative `chart.update()`。data 变 → props 变 → React reconciliation → SVG 重渲染，整条链跟普通 React 应用一样。

3. **monorepo 拆 30+ 子包**：`@visx/scale` `@visx/shape` `@visx/zoom` 各自独立发布、独立版本。bundler 看到你只 import 几个，剩下的全部 dead-code-eliminate。

合在一起：**继承 d3 数学战斗经验 + React 心智一致 + tree-shake 友好的 bundle**。

## 实践案例

### 案例 1：scale 当函数用

```ts
import { scaleLinear } from '@visx/scale';

const xScale = scaleLinear({
  domain: [0, 100],   // 数据范围
  range: [0, 500],    // 像素范围
  nice: true,         // tick 自动取整
});

xScale(50);           // → 250（数据 50 映射到像素 250）
xScale.invert(250);   // → 50（反向，pixel → data）
xScale.ticks(5);      // → [0, 25, 50, 75, 100]
```

`scaleLinear` 返回的对象**就是 d3-scale 实例**，本身是个函数，同时挂了 `.invert / .ticks / .domain / .range`。visx 只补 TS 类型，没改算法。

### 案例 2：响应式容器（@visx/responsive）

```tsx
import { ParentSize } from '@visx/responsive';

<ParentSize debounceTime={50}>
  {({ width, height }) => <MyChart width={width} height={height} />}
</ParentSize>
```

`ParentSize` 用 ResizeObserver 监听父容器，把宽高通过 render-prop 传给子组件，默认 debounce 300ms 防止拖动时每帧重渲染。SSR 时给 fallback 尺寸。

### 案例 3：state-based zoom（@visx/zoom）

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

Zoom 内部用 transformMatrix state（scaleX / scaleY / translateX / translateY），事件 handler 通过 props 注入到 SVG。**不直接操作 DOM**，跟原生 d3-zoom 的 imperative 路径形成对照——这是 visx 的关键设计代价。

## 踩过的坑

1. **没成品图表**：做柱状图要手动组合 BarStack + AxisLeft + AxisBottom + Grid（30+ 行 JSX）。新人第一次写经常卡 1-2 小时，[[recharts]] 一行 `<BarChart>` 就搞定。

2. **SVG-only 性能瓶颈**：>10k 数据点时 SVG 节点 reflow 明显卡顿。visx 没有 Canvas/WebGL 出口，大数据场景（实时监控、万级散点）必须切到 deck.gl / pixi-react。

3. **ParentSize debounce 默认 300ms**：拖动 window 边缘时看起来有"延迟"。传 `debounceTime={50}` 能调短，但太短又会撕裂重渲染。这是社区试出来的魔法值，没理论依据。

4. **state-based zoom 在大数据集卡**：每次 zoom 触发 reconciliation，5k+ 点开始有掉帧。workaround：`useMemo` 把数据 transform 提到 Zoom 外面，子组件用 React.memo 隔离重渲染。

## 适用 vs 不适用场景

**适用**：
- 数据集 1k-10k 点，需要自定义坐标轴 / 渐变 / 复合图层
- 强 SSR / Next.js 需求（SVG 友好，hydration 体积小）
- 团队有 d3 经验，愿意承担陡学习曲线换灵活度
- 移动端 H5 首屏 < 50KB JS 预算（按需引入子包优势明显）

**不适用**：
- 数据集 < 1k 点的常规柱/线/饼/散点 → 用 [[recharts]] 省样板代码
- 数据集 > 10k 点或要 60fps 动画 → 切 Canvas（react-konva / regl / pixi-react）
- 团队 React 经验浅、希望"props 即配置" → [[recharts]] 更声明式
- 学习目的想理解可视化底层 → 直接学 [[d3]]，别被包装层屏蔽细节

## 历史小故事（可跳过）

- **2018-04**：Airbnb 工程师 Harrison Shoff 等开源 **vx**（visualization expressions），项目独立托管，不在 airbnb 组织下。
- **2020-09**：改名 **visx**，迁入 airbnb 主仓库，标志 Airbnb 官方背书。
- **2022-2023**：提交节奏从周更降到月更甚至季更，社区维护为主，但仍是 React 生态低层可视化的事实标准。
- **2024**：发布 v3.x，最低 React 版本提到 16.8（强制 hooks），@visx/zoom 矩阵字段从 string 改 number，bundle 平均缩 8-12%。

## 学到什么

1. **包装 d3 vs 替代 d3 是两种哲学**：visx 选包装（承认 d3 数学不可替代），[[observable-plot]] 选替代（用语法糖隐藏 d3）。前者天花板高、上手陡，后者反之。
2. **React 化 imperative 库的核心难点是事件系统映射**：visx 在 zoom/brush 上的 state-based 路径就是这个难点的典型样本——选了 React 心智一致，付了性能代价。
3. **monorepo 30+ 子包是 bundle 友好的代价**：文档分散、新手组合时卡，跟 lodash-es / date-fns 同样的 trade-off。
4. **API 形状决定 bundle 形状**：modular function export 让 tree-shake 真生效，class chain 模式做不到。这是结构性决策，事后无法补救。

## 延伸阅读

- 官方文档：[airbnb.io/visx](https://airbnb.io/visx/)（每个子包都有 sandbox 示例）
- 官方仓库：[github.com/airbnb/visx](https://github.com/airbnb/visx)
- bundle 对比：[bundlephobia.com/package/@visx/scale](https://bundlephobia.com/package/@visx/scale)
- [[d3]] —— visx 内部依赖，理解它是用 visx 的前置知识
- [[recharts]] —— 同生态高层竞品，对比维度
- [[observable-plot]] —— 不同哲学路线（语法糖隐藏 d3）

## 关联

- [[d3]] —— visx 的底层数学引擎，scale/shape/hierarchy 全部 re-export 或包装 d3 模块
- [[recharts]] —— 同生态高层对比，visx 是低层原语 / Recharts 是高层成品
- [[observable-plot]] —— 反例哲学（用语法糖隐藏 d3）
- [[echarts]] —— 高层 vs 低层哲学对比的另一极，配置驱动
- [[react-spring]] —— visx 不做时间动画，过渡要靠这种动画原语补
- [[gsap]] —— 同上，与 visx 互补的动画方案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[vega]] —— Vega — 整张图就是一棵 JSON
- [[vis-network]] —— vis-network — barnesHut 物理引擎驱动的网络图

