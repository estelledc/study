---
title: nivo — 按图表分包的 React + d3 组件
description: nivo turns d3 scales and shapes into per-chart React packages, with SVG or Canvas renderers and AutoSizer-based responsive wrappers
来源: https://github.com/plouc/nivo
日期: 2026-08-27
分类: 数据可视化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/plouc/nivo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a2d9dab855365926cb41267eb20af154ca8fd558
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.99.0
---

## 是什么

nivo 是一组把 d3 的 scale / shape / color 包成 React 组件的图表库。日常类比：d3 给你尺子和笔，nivo 按图种做成独立玩具盒——`@nivo/bar` 只负责柱，`@nivo/line` 只负责线。

你写：

```jsx
import { ResponsiveBar } from "@nivo/bar";

<ResponsiveBar
  data={[{ id: "CN", value: 30 }, { id: "US", value: 45 }]}
  keys={["value"]}
  indexBy="id"
/>
```

固定 0.99.0 必须同时装 `@nivo/core` 和具体图表包。顶层 npm 名 `nivo@0.31.0` 停在 2017，不是本页绑定对象。`Bar` 吃固定宽高；`ResponsiveBar` 先用 AutoSizer 量父容器，再把尺寸交给 `Bar`。

## 为什么重要

不理解 nivo 的分包和默认值，下面这些判断会偏：

- 为什么示例写成 `country` / `value` 却什么都不画——默认 `indexBy` 是 `id`
- 为什么两组 key 叠在一起，而不是并排——默认 `groupMode` 是 `stacked`
- 为什么 `ResponsiveBar` 在 `height: auto` 的父级里消失
- 为什么同一套 props 还能换成 Canvas，e2e 却摸不到柱子

## 核心要点

nivo 柱状图的主链可以拆成五步：

1. **取字段**：`usePropertyAccessor` 把 `indexBy` / `keys` 收成函数。默认 `indexBy='id'`、`keys=['value']`。

2. **用 d3 算，不画 DOM**：`useBar` 按 `groupMode` 选择 stacked 或 grouped 生成器，产出 `bars`、`xScale`、`yScale`。颜色默认 `{ scheme: 'nivo' }`。

3. **定尺寸**：`Bar` 要求 `width` / `height`。`useDimensions` 再减 margin（默认全 0）得到 inner 区域。

4. **React 画 SVG 或 Canvas**：SVG 路径用 `useTransition` 做进出场；Canvas 路径复用同一份 `useBar` 结果，改调 `renderBar`。

5. **外层 provider**：`Container` 叠 Theme、Motion、Tooltip。`animate` 默认 true，`motionConfig` 默认 `'default'`，对应 `@react-spring/web` 的 preset。

## 实践示例

### 案例 1：按默认字段画出堆叠柱

```jsx
import { Bar } from "@nivo/bar";

const data = [
  { id: "CN", "hot dog": 12, burger: 20 },
  { id: "US", "hot dog": 30, burger: 15 },
];

<Bar
  width={800}
  height={400}
  data={data}
  keys={["hot dog", "burger"]}
  indexBy="id"
/>
```

`groupMode` 未写时是 `stacked`。要并排必须显式 `groupMode="grouped"`。`Bar` 是固定尺寸版本，服务端也能渲成 SVG 字符串；`ResponsiveBar` 在没有尺寸的环境里要另给 `defaultWidth` / `defaultHeight`。

### 案例 2：Responsive 依赖父容器，不靠 ResizeObserver

```jsx
import { ResponsiveBar } from "@nivo/bar";

<div style={{ height: 400 }}>
  <ResponsiveBar data={data} keys={["value"]} indexBy="id" />
</div>
```

`ResponsiveWrapper` 用的是 `react-virtualized-auto-sizer`。父级若是 `height: auto`，量到的高度经常是 0，图就不出现。`useMeasure` 里才有 `ResizeObserver`，而且实现缺失时直接返回 `null`；那不是 Responsive 主路径。

### 案例 3：同一计算，换 Canvas 渲染

```jsx
import { ResponsiveBarCanvas } from "@nivo/bar";

<ResponsiveBarCanvas data={data} keys={["value"]} indexBy="id" />
```

Canvas 版仍走 `useBar`，但层列表没有 `markers`，柱子也不是 DOM `<rect>`。命中检测用矩形几何，不是 CSS 选择器。`pixelRatio` 在浏览器取 `window.devicePixelRatio`，非浏览器环境为 1。

## 踩过的坑

1. **把 2017 的 `nivo` 顶层包当现行入口**：现行合同是 `@nivo/bar` + `@nivo/core`。

2. **沿用 `country` 当默认类目字段**：`indexBy` 默认是 `id`。旧教程不改字段名就会对空。

3. **以为默认是分组柱**：`groupMode` 默认 `stacked`。

4. **把 Responsive 失败写成 ResizeObserver 缺失**：Responsive 主路径是 AutoSizer；父级高度才是常见原因。

5. **把 README 的 HTTP API 写成已核验服务**：`renderWrapper={false}` 只说明不要包外层 `div`。本轮未检视 server 包，也不声称托管 PNG 接口可用。

## 适用 vs 不适用场景

**适用**：

- React 16.14 到 19 的仪表板，希望一个图表一个包
- 需要同一套计算在 SVG 与 Canvas 之间切换
- 固定尺寸的服务端 SVG，或父级有明确高度的 Responsive 图

**不适用**：

- 不是 React 项目
- 希望系列像积木一样拆轴、拆 grid——[[recharts]] / [[victory]] 更接近那条路
- 要自己握 d3 selection 或原语——回到 [[d3]] 或 [[visx]]
- 把默认动画、默认 stacked、默认 `id`/`value` 字段当成可忽略细节

## 固定版本边界

- 本文绑定 `plouc/nivo@a2d9dab8...`，tag `v0.99.0` 与 `@nivo/core` / `@nivo/bar` 的 npm `gitHead` 一致。
- peer 声明 React `^16.14 || ^17.0 || ^18.0 || ^19.0`。
- 动画默认开启，preset 名 `'default'` 映射到 `@react-spring/web` 的 `config`。
- README 提到 SSR 与 HTTP API；本轮只读了 React 包，未安装依赖、未跑上游测试、未启动任何服务。
- 状态保持 `UNVERIFIED`。

## 学到什么

1. **分包是体积边界，也是心智边界**——装 `@nivo/bar` 不会自动带折线。
2. **默认字段比示例更硬**——`id` / `value` / stacked 写在 `commonDefaultProps` 里。
3. **Responsive 和 Measure 不是同一条路**——AutoSizer 量父级，ResizeObserver 只出现在 `useMeasure`。
4. **Canvas 换的是渲染，不是计算**——`useBar` 共用，命中方式变了。

## 应用型自测

1. 数据是 `{ country, value }`，只写 `<Bar width={400} height={200} data={data} />`，柱会按国家对齐吗？
2. 两个 key 未设 `groupMode`，柱是并排还是堆叠？
3. `ResponsiveBar` 放进 `height: auto` 的 div，固定 0.99.0 是否保证能量到非零高度？

检查点：

1. 不会。默认 `indexBy` 是 `id`，需要改字段或改 `indexBy`。
2. 堆叠。默认 `groupMode` 是 `stacked`。
3. 不保证。AutoSizer 依赖父级尺寸；auto 高度常得到 0。

## 延伸阅读

- 文档（组件 playground）：[nivo.rocks](https://nivo.rocks/)
- 固定源码：[plouc/nivo](https://github.com/plouc/nivo) —— 本文绑定提交 `a2d9dab855365926cb41267eb20af154ca8fd558`
- [[victory]] —— 系列合成 + 默认轴，对照 nivo 的整图组件
- [[recharts]] —— JSX 零件拼图
- [[visx]] —— 更低层的 d3 React 原语

## 关联

- [[victory]] —— 同赛道 React 图表，standalone 系列 vs 整图组件
- [[recharts]] —— 另一条声明式 React 图表路线
- [[visx]] —— 需要自己拼 layout 时的下一站
- [[d3]] —— nivo 用来算坐标、不用来写 DOM 的底座
- [[react-spring]] —— SVG 进出场动画的来源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
