---
title: visx — 把 vendored d3 拆成 React 可视化原语
来源: https://github.com/airbnb/visx
日期: 2026-05-30
分类: 数据可视化
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/airbnb/visx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 78839796081beb0370fc928cc922b21908bbabaf
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.0
---

## 是什么

visx 是 Airbnb 的 **React 可视化原语 monorepo**。日常类比：不是超市成品蛋糕（[[recharts]]），而是烘焙原料店——scale、shape、axis 分开卖；若不想从零拼，同一提交里还有 `@visx/xychart` 这套半成品模具。

固定 `v4.0.0` 的最小用法：

```tsx
import { scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';

const xScale = scaleLinear({ domain: [0, 100], range: [0, 500] });

<svg width={500} height={200}>
  <Bar x={xScale(20)} y={0} width={20} height={150} fill="steelblue" />
</svg>
```

`scaleLinear` 返回的是 `@visx/vendor/d3-scale` 的 d3 scale；`Bar` 只是带 `visx-bar` class 的 `<rect>`。

## 为什么重要

不理解 visx v4，旧教程会对不上：

- 为什么 React 项目里直接 `d3.select` 会和声明式渲染抢 DOM
- 为什么“没有成品图”不再完整——`@visx/xychart` 已导出 `XYChart` 与一组 series
- 为什么最低 React 不再是 16.8：`@visx/zoom` peer 是 `^18 || ^19`
- 为什么 scale 不重写算法，却多一层 `scaleOperator` 配置顺序

## 核心要点

固定版本可以拆成四层：

1. **数学来自 vendor d3**：`@visx/vendor` 钉死 `d3-scale@4.0.2` 等模块。`scaleOperator` 按 domain → nice → zero → interpolate → round → range → reverse 套配置。
2. **shape 是 SVG 组件**：`Bar` 把剩余 props 铺到 `<rect>`。没有 imperative `chart.update()`——data 变则 props 变。
3. **响应式与缩放是 state**：`ParentSize` 用 ResizeObserver；默认 debounce 300ms，且 `enableDebounceLeadingCall=true`，初始宽高是 0。`Zoom` 把 `transformMatrix` 放 React state，`toString()` 写成 SVG `matrix(...)`；默认缩放上下限是 `0` / `Infinity`。
4. **分包很多，但有一层组装**：此提交 `packages/` 有 38 个 `visx-*` 目录（含 demo 与 umbrella）。`@visx/xychart` 提供 `XYChart`、`LineSeries`、`BarSeries` 等。

## 实践示例

### 案例 1：scale 当函数用

```ts
import { scaleLinear } from '@visx/scale';

const xScale = scaleLinear({
  domain: [0, 100],
  range: [0, 500],
  nice: true,
});

xScale(50);        // d3-scale 映射
xScale.invert(250);
xScale.ticks(5);
```

`nice` 发生在 domain 之后、range 之前。返回值仍是 d3 scale，不是 visx 自研映射器。

### 案例 2：ParentSize 的默认合同

```tsx
import { ParentSize } from '@visx/responsive';

<ParentSize>
  {({ width, height }) => <MyChart width={width} height={height} />}
</ParentSize>
```

首帧宽高可能是 0，要等 ResizeObserver。把 `debounceTime` 调到 50 能缩短等待，也会更频繁 setState。SSR 时库不会凭空猜容器尺寸。

### 案例 3：Zoom 输出 SVG matrix

```tsx
import { Zoom } from '@visx/zoom';

<Zoom width={500} height={500}>
  {(zoom) => (
    <svg>
      <g transform={zoom.toString()}>{/* 图层 */}</g>
    </svg>
  )}
</Zoom>
```

默认不限制到 0.5–4；要夹紧需自己传 `scaleXMin` / `scaleXMax`。拖拽与 pinch 走 `@use-gesture/react`，不是 d3-zoom 的 DOM 手势。

## 踩过的坑

1. **仍按 v3 / React 16.8 写 peer**：固定 zoom 包要 React 18 或 19。
2. **以为完全没有成品图**：`@visx/xychart` 已提供笛卡尔组装层。
3. **把 0.5–4 当成 Zoom 默认值**：源码默认是 `0` / `Infinity`。
4. **把 debounce 300ms 当成“延迟 bug”**：这是 `useParentSize` 默认值，可用 props 改。
5. **把“SVG 过 10k 点就卡”写成测量结论**：本页未跑渲染 benchmark。

## 适用 vs 不适用场景

**适用**：

- React 里要自己拼 SVG，并复用 d3 scale / shape
- 需要按包引入，而不是一份巨型 chart 配置
- 愿意读 operator 顺序和 ResizeObserver 首帧 0 尺寸

**不适用**：

- 只要一份 options 出图，并接受商业许可 → [[highcharts]]
- 只要 JSX 成品图 → [[recharts]]
- 需要本页未验证的 Canvas / WebGL 吞吐
- 还在 React 17：对不上 `@visx/zoom@4.0.0` peer

## 固定版本边界

- 本文绑定 `airbnb/visx@78839796...`，tag `v4.0.0`。
- npm `@visx/scale@4.0.0`、`@visx/shape@4.0.0`、`@visx/zoom@4.0.0` 的 `gitHead` 与该 tag 一致。
- 未安装依赖、未跑 vitest 或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **包装 d3 和替代 d3 是两种哲学**——visx 选包装，并用 vendor 钉版本
2. **配置对象的字段顺序也是合同**——nice 在 range 前，会改 domain
3. **原语库也可以再长一层组装**——xychart 没有否定 shape 层
4. **手势库换了，心智还是 state → transform 字符串**

## 应用型自测

1. `scaleLinear({ domain, range, nice: true })` 会重写 d3 的映射算法吗？
2. 不传 `debounceTime` 时，`ParentSize` 默认多重渲染间隔是多少？
3. `<Zoom width={500} height={500}>` 默认把缩放夹在 0.5 到 4 吗？

检查点：

1. 不会。它创建 vendor `d3-scale` 再套 operator。
2. 300ms，且默认允许 leading call。
3. 不会。默认上下限是 `0` 与 `Infinity`。

## 延伸阅读

- 官方文档：[airbnb.io/visx](https://airbnb.io/visx/)
- 固定源码：[airbnb/visx](https://github.com/airbnb/visx) —— 本文绑定 `78839796081beb0370fc928cc922b21908bbabaf`
- 审查记录：仓库内 `docs/highcharts-visx-source-review-20260827-ea.md`
- [[d3]] —— vendor 里的数学引擎
- [[recharts]] —— 同生态高层成品图
- [[highcharts]] —— 配置对象 / 商业许可对照

## 关联

- [[d3]] —— scale / shape 的算法来源
- [[recharts]] —— React 成品图对照
- [[highcharts]] —— options 工厂对照
- [[observable-plot]] —— 用语法糖藏 d3 的另一条路
- [[echarts]] —— 配置驱动对照，本页未审查其固定源码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[vega]] —— Vega — 整张图就是一棵 JSON
- [[vis-network]] —— vis-network — barnesHut 物理引擎驱动的网络图
