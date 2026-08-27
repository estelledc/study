---
title: billboard.js — c3.js 的 TypeScript 继任者
来源: https://github.com/naver/billboard.js
日期: 2026-05-31
分类: 数据可视化
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/naver/billboard.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f599730a0a0428ab4717c8f57b826d1cf9beff63
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.3
---

## 是什么

billboard.js 是 Naver 维护的 **D3 模块封装图表库**，生成入口仍是 c3 风格的 `bb.generate({ bindto, data, axis })`。日常类比：方向盘布局尽量不动，但 v4 把图类型和可选 API 拆成要自己拧开的开关。

```js
import bb, { line } from "billboard.js"

bb.generate({
  bindto: "#chart",
  data: {
    columns: [
      ["销量", 30, 200, 100]
    ],
    type: line()
  }
})
```

固定 `4.0.3` 依赖一组 `d3-*` 包（如 `d3-selection@^3`、`d3-scale@^4`），不是单一 `d3`。npm `gitHead` 与 tag `4.0.3` 同指 `f599730a...`。

## 为什么重要

不理解 v4 的拆包，下面这些事会对不上：

- 为什么 ESM 里 `chart.xgrids()` 会提示先 import `grid`
- 为什么 `type: "line"` 有时能用、有时不行
- 为什么 `/canvas` 入口和默认 SVG 入口不是同一个开关
- 为什么旧文里的 sunburst / sankey 在这份源码里找不到

## 核心要点

固定版本可以拆成四层：

1. **generate 仍是命令式入口**：`bb.generate` 把 `bb.defaults` 与 config merge 后 `new Chart`。`bindto` 默认 `"#chart"`；也可传 DOM 或 d3 selection。
2. **ESM resolver 必须先跑**：`line()` / `bar()` 首次调用把模块挂到 prototype，返回值是 `"line"` / `"bar"`。同一页先 `line()` 一次后，后面可以写 `data.type: "line"`。UMD / CDN 入口会预装全部 shape 与 optional API。
3. **v4 从默认 ESM 拆出五块 API**：`exportApi`、`flow`、`grid`、`regions`、`category`。缺 import 时走 stub，报“请确认模块已导入”，不是含糊的 `is not a function`。
4. **Canvas 是另一条 ESM 入口**：`import { canvas, bar } from "billboard.js/canvas"` 且 `render: { mode: canvas() }` 才切渲染器。arc 族（pie / donut / gauge / polar / radar）仍只走 SVG。

## 实践示例

### 案例 1：c3 风格最小迁移

```js
import bb, { line } from "billboard.js"

bb.generate({
  bindto: "#chart",
  data: {
    columns: [
      ["A", 1, 2, 3]
    ],
    type: line()
  }
})
```

字段名仍接近 c3。事件回调、主题路径和 v4 resolver 不是 100% 复制旧项目就能过。

### 案例 2：先注册、再写普通 config

```js
import bb, { bar, line, grid } from "billboard.js"

bar(); line(); grid();

bb.generate({
  bindto: "#chart",
  data: {
    type: "bar",
    columns: [
      ["A", 30, 200, 100]
    ]
  },
  grid: { x: { show: true } }
})
```

resolver 全局、幂等。多图页面可以初始化一次，后面不再写 `type: bar()`。

### 案例 3：可选 canvas

```js
import bb, { bar, canvas } from "billboard.js/canvas"

bb.generate({
  render: { mode: canvas() },
  data: {
    columns: [
      ["A", 30, 200, 100, 400]
    ],
    type: bar()
  }
})
```

canvas 支持 line / spline / step / area 族 / bar / scatter / bubble / candlestick / treemap。它不给每个柱子建 DOM，`.bb-bar` 这类选择器打不到像素。

## 踩过的坑

1. **把 UMD 习惯带进 ESM**：默认 `billboard.js` 入口不自动安装 `grid` / `regions` / `exportApi`。要用 `chart.xgrids()` 就得 `import { grid }` 并调用。
2. **以为固定版本有 sunburst / sankey**：`TYPE` 常量到 treemap / radar / funnel / polar / candlestick 为止，没有这两项。
3. **把主题当成 runtime option**：README 提供默认 CSS 以及 datalab / dark / insight / graph / modern 五套文件，切换靠换样式表，不是 `theme: "dark"`。
4. **把 resize 写成必须手调**：`resize.auto` 默认 `true`，还可 `"parent"` / `"viewBox"`。`chart.resize()` 是显式改 `size_width` / `size_height` 再 `flush`。
5. **在 React 里忽略实例生命周期**：API 仍是 `bindto` + `generate`。严格模式双调用会建两份实例，需要自己 `destroy`。
6. **把 changelog 里某次 esbuild 体积写成你的产物保证**：那是作者在特定配置下的测量，本文未复现。

## 适用 vs 不适用场景

**适用**：

- 存量 c3 配置要迁到仍维护的 TS 库
- 需要 radar / treemap / funnel / candlestick / polar，且接受 D3 模块依赖
- ESM 项目愿意按图类型和 API 做 resolver import
- 高密度轴图可以评估 opt-in canvas（未在本文实测）

**不适用**：

- 要把每个柱、每条线当 DOM/CSS 节点改——canvas 模式做不到
- 需要 sunburst / sankey 或纯 React 声明式组件（看 [[recharts]] / [[echarts]]）
- 不能为 ESM 补 resolver，却按 UMD“全自动”推理
- 要把未测 bundle / 帧率写成结论

## 固定版本边界

- 本文绑定 `naver/billboard.js@f599730a0a0428ab4717c8f57b826d1cf9beff63`，包版本 `4.0.3`。npm `gitHead` 一致。
- 4.0.3 的 changelog 还记了一处文本背景滤镜属性转义修复；本文未验证该修复的运行效果。
- 本文未安装依赖、未跑 Vitest / Playwright、未渲染 SVG 或 canvas，状态保持 `UNVERIFIED`。

## 学到什么

1. **兼容入口和解耦打包是两件事**——`generate` 看起来像 c3，ESM 却要求显式 resolver。
2. **字符串类型名是注册之后的别名**——`line()` 先挂模块，才安全写 `type: "line"`。
3. **Canvas 是第二条入口，不是 `render: "canvas"` 开关**。
4. **图类型清单以 `src/config/const.ts` 为准**，不能沿用旧文的 sunburst / sankey。

## 应用型自测

1. ESM 只 `import bb from "billboard.js"`，不 import `grid`，`chart.xgrids()` 会怎样？
2. 固定 `TYPE` 里有 `sunburst` 或 `sankey` 吗？
3. `resize.auto` 的默认值是必须手调 `chart.resize()` 吗？

检查点：

1. 走 stub，提示先导入 `grid` 模块。
2. 没有。常量止于 area 族、bar、bubble、candlestick、donut、funnel、gauge、line、pie、polar、radar、scatter、spline、step、treemap。
3. 不是。默认 `resize.auto === true`。

## 延伸阅读

- 文档：[naver.github.io/billboard.js](https://naver.github.io/billboard.js/)
- 固定源码：[naver/billboard.js](https://github.com/naver/billboard.js) —— 本文绑定提交 `f599730a0a0428ab4717c8f57b826d1cf9beff63`
- 模块导入说明：仓内 `MODULE_IMPORTS.md`
- [[chart-js]] —— 不依赖 D3 的 Canvas 配置式对照
- [[d3]] —— 底层 selection / scale / shape
- [[echarts]] —— 更重的配置式看板
- [[chartist]] —— 零依赖 SVG，图类型更少

## 关联

- [[d3]] —— billboard 把 d3 模块包成一份配置
- [[chart-js]] —— 同类配置式，Canvas 主路线
- [[echarts]] —— 企业看板另一条主流
- [[recharts]] —— React 声明式对照
- [[chartist]] —— 更小的 SVG 合同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
