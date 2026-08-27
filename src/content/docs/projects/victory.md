---
title: Victory — 用可组合系列拼出 React 图表
description: Formidable Victory composes standalone series into a shared domain, then draws SVG through a responsive viewBox container
来源: https://github.com/FormidableLabs/victory
日期: 2026-08-27
分类: 数据可视化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/FormidableLabs/victory
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d9d9ca2d5038d6ef9de91f2cef39e6fb2733baa6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 37.3.6
---

## 是什么

Victory 是一套按系列拆开的 React 图表库。日常类比：`VictoryBar` / `VictoryLine` 像可以单独摆上桌的菜；`VictoryChart` 再给它们同一张桌布——共享 domain、scale 和默认坐标轴。

你写：

```jsx
import { VictoryChart, VictoryBar, VictoryAxis } from "victory";

<VictoryChart>
  <VictoryBar data={[{ x: "a", y: 12 }, { x: "b", y: 30 }]} />
</VictoryChart>
```

固定 37.3.6 的顶层 `victory` 包只做 `export *` 聚合。真正实现分布在 `victory-chart`、`victory-bar`、`victory-core` 等子包。`VictoryBar` 也可以单独使用，但那时不会自动带轴。

## 为什么重要

不理解 Victory 的“系列可独立、图表再合成”，下面这些事会对不上：

- 为什么只写 `<VictoryBar />` 也能出柱，却看不到坐标轴
- 为什么柱状图的 y 轴默认从 0 起，即使数据全是正数
- 为什么设了 `width={450}` 父容器却仍被 `100%` 拉伸
- 为什么 `import { VictoryBar } from "victory"` 会把整组图表子包装进来

## 核心要点

Victory 的主链可以拆成五步：

1. **读数据**：`Data.formatData` 默认按字段名 `x` / `y` / `y0` 取值。字符串类目会建成 string map，内部再变成 `_x` / `_y`。

2. **算 domain / scale**：`VictoryBar` 的 `getDomain` 走 `Domain.getDomainWithZero`，所以 y 域默认含 0。scale 经 `victory-vendor/d3-scale` 创建，字符串名只认 linear / time / log / sqrt。

3. **图表注入共享合同**：`VictoryChart` 算出统一 domain 与 scale，把默认独立轴、因变量轴和计算后的 props clone 给子系列。

4. **容器画 SVG**：`standalone: true` 时包一层 `VictoryContainer`。默认 `responsive: true`，CSS 宽高是 `100%`，数值宽高只进入 `viewBox`。

5. **事件可选叠加**：有 events 时走 `VictorySharedEvents`。`createContainer` 只能组合 zoom / selection / brush / cursor / voronoi 五种 web container。

## 实践示例

### 案例 1：一张带默认轴的柱状图

```jsx
import { VictoryChart, VictoryBar } from "victory";

const data = [
  { x: "CN", y: 12 },
  { x: "US", y: 30 },
];

<VictoryChart>
  <VictoryBar data={data} />
</VictoryChart>
```

`VictoryChart` 缺省尺寸是 450×300、padding 50、主题 `VictoryTheme.grayscale`。子系列拿到共享 domain 后，默认轴才会出现。不写 `VictoryChart` 时，`VictoryBar` 仍会画柱，但没有这套默认轴。

### 案例 2：换 accessor，不要改数据形状

```jsx
<VictoryBar
  data={[
    { country: "CN", hotdog: 12 },
    { country: "US", hotdog: 30 },
  ]}
  x="country"
  y="hotdog"
/>
```

accessor 未写时按字段名 `x` / `y` 取。这里显式指定后，`formatData` 才会去读 `country` / `hotdog`。字符串类目仍会进入 string map，不要把内部的 `_x` 当成原始字段。

### 案例 3：固定像素尺寸，关掉 responsive

```jsx
import { VictoryChart, VictoryBar, VictoryContainer } from "victory";

<VictoryChart
  width={600}
  height={300}
  containerComponent={<VictoryContainer responsive={false} />}
>
  <VictoryBar data={data} />
</VictoryChart>
```

默认 `responsive: true` 时，`width` / `height` 只决定 viewBox，外层 SVG 仍是 `100%`。需要固定像素盒时，必须把 container 的 `responsive` 关掉。

## 踩过的坑

1. **把顶层 `victory` 当按需包**：37.3.6 的 `victory` 会 re-export 全部图表子包。要缩小安装面，应直接依赖 `victory-bar` / `victory-chart`。

2. **以为 `width` / `height` 就是 CSS 尺寸**：`VictoryContainer` 默认 responsive，数值尺寸只进 viewBox。

3. **柱状图 y 轴从最小值起画**：`VictoryBar` 使用 `getDomainWithZero`，y 域默认含 0；需要贴着数据最小/最大时要显式 `domain`。

4. **把 `animate` 当默认开启**：`shouldAnimate()` 看的是 `this.props.animate`。没传就没有 onLoad 2000ms 那套过渡。

5. **把 Victory Native 合同写进本页**：`createContainer` 明确区分 web hook 与 Native 自己的 container。本文只绑定 web 包。

## 适用 vs 不适用场景

**适用**：

- React >=16.6 的 SVG 仪表板，希望系列能单独测、再放进共享坐标系
- 需要把 zoom / brush / voronoi 等交互容器组合起来
- 数据量停留在 SVG DOM 可接受的范围

**不适用**：

- 不是 React 项目——Victory 的系列和 container 都是 React 组件
- 需要按图表分包、默认开启动画、同一套 props 换 Canvas——那是 [[nivo]] 的合同
- 想用 JSX 零件拼轴和格子，而不是“系列 + 图表容器”——[[recharts]] 更接近那种写法
- 要自己握 d3 原语——[[visx]] 才把 scale / shape 直接交给你

## 固定版本边界

- 本文绑定 `FormidableLabs/victory@d9d9ca2d...`，Git tag 与仓内 package 均为 `37.3.6`。
- npm `victory@37.3.6` 未发布 `gitHead`，不以 registry 反推 revision。
- peer 声明 React `>=16.6.0`；package engines 为 Node `>=18.0.0`。
- d3 scale 经 `victory-vendor` 引入，不是直接依赖应用侧的 `d3`。
- 本文未安装依赖、运行上游测试、渲染浏览器或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **可组合不等于自动带轴**——系列能独立画数据，坐标系是 `VictoryChart` 另加的一层。
2. **domain 规则按系列变化**——柱状图默认含 0，不能把折线经验直接套过来。
3. **responsive 改的是 CSS，不是计算**——计算仍用数值宽高，铺满由 viewBox 完成。
4. **聚合包和实现包不是一回事**——`victory` 方便入门，体积边界在子包。

## 应用型自测

1. 只渲染 `<VictoryBar data={data} />`，不包 `VictoryChart`，默认会画出坐标轴吗？
2. 数据 y 全是 20 到 30，未设 `domain` 时，柱状图 y 域会从 20 开始吗？
3. `VictoryContainer` 保持默认 `responsive`，`width={450}` 会把 SVG 的 CSS 宽度钉成 450px 吗？

检查点：

1. 不会。默认轴由 `VictoryChart` 注入。
2. 不会。`getDomainWithZero` 让 y 域默认含 0。
3. 不会。默认 CSS 是 `100%`，450 只进入 viewBox。

## 延伸阅读

- 文档：[commerce.nearform.com/open-source/victory](https://commerce.nearform.com/open-source/victory)
- 固定源码：[FormidableLabs/victory](https://github.com/FormidableLabs/victory) —— 本文绑定提交 `d9d9ca2d5038d6ef9de91f2cef39e6fb2733baa6`
- [[nivo]] —— 同赛道 React 图表，默认动画与 Canvas 变体不同
- [[recharts]] —— JSX 零件拼图，对照 Victory 的系列合成
- [[visx]] —— 更低层的 d3 原语，Victory 不走这条路

## 关联

- [[nivo]] —— 按图表分包、默认 stacked / 开启动画的对照
- [[recharts]] —— 另一条 React 声明式图表路线
- [[visx]] —— 需要自己拼轴和 layout 时的下一站
- [[d3]] —— Victory 通过 vendor 使用的 scale 来源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
