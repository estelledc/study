---
title: ApexCharts — 默认 SVG、可按类型拆包的图表库
来源: https://github.com/apexcharts/apexcharts.js
日期: 2026-06-01
分类: projects / 数据可视化
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/apexcharts/apexcharts.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1579e97ce9bb7eeca9f35f969259f10fff6e00a2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.0
---

## 是什么

ApexCharts 是一个 JavaScript 图表库：你给容器和一份 options，它画出折线、柱、饼、热力等图。日常类比：它像一套可拆的预制菜——默认入口把常用类型和日常功能装齐；也可以从 `apexcharts/core` 只引进需要的类型和 feature。

你写：

```js
import ApexCharts from 'apexcharts'

const chart = new ApexCharts(document.querySelector('#chart'), {
  chart: { type: 'line', height: 350 },
  series: [{ name: '订单', data: [10, 41, 35, 51, 49, 62] }],
  xaxis: { categories: ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月'] },
})
chart.render()
```

固定 7.0.0 里，`render()` 返回 Promise，并且幂等：第二次调用复用进行中/已完成的那份 Promise。`destroy()` 会清掉这份 Promise，所以销毁后可以再 `render()`。默认 `chart.renderer` 是 `'svg'`。

## 为什么重要

不按固定 7.0.0 读，旧页会把几件已经变了的事写成事实：

- 许可不再是 MIT：`package.json` 写 `SEE LICENSE IN LICENSE`，LICENSE 是按年收入 200 万美元划线的 Community / Commercial 双许可
- 默认渲染仍是 SVG；Canvas 是 `apexcharts/features/renderer-canvas` 的 opt-in，`renderer: 'auto'` 才按 mark 数考虑切换
- `responsive` 断点比的是 `window.innerWidth`（为 0 时退到 `screen.width`），不是图表容器宽度
- `updateSeries` 若收到非数组会 `console.warn` 并原样 resolve，不会改数据

## 核心要点

固定 7.0.0 的主链可以拆成五步：

1. **构造即合并默认值**：`new ApexCharts(el, opts)` 经 `Base` 扩成 `w.config`。默认 `chart.type` 是 `'line'`，`toolbar.show` 为 `true`，`animations.enabled` 为 `true`（`speed: 800`，`respectReducedMotion: true`）。
2. **render 挂载**：检查 `chart` 配置、登记可选的 `chart.id`、跑 `beforeMount`，再走 Core 建 SVG 纸面。缺 `chart` 会 reject。
3. **系列层可换 renderer**：默认 SVG。`renderer: 'svg' | 'canvas' | 'auto'`，`rendererThreshold` 默认 `8000`。未打包 canvas feature、或 fill 是 pattern / image / gradient 时，选择会退回 SVG。轴、tooltip、annotation 仍走 SVG。
4. **更新两条入口**：`updateSeries(array)` 换数据；`updateOptions(partial)` 合并配置。`series` 不是数组时被丢弃。同对象浅相等会直接 resolve，跳过重绘。
5. **销毁必须自己或 wrapper 调用**：`destroy()` 移除 window / parent resize 监听、清 `resizeTimer`、拆 watermark 观察者，并从 `Apex._chartInstances` 按 `chart.id` 删掉实例。

## 实践示例

### 案例 1：Sparkline 会关掉哪些默认 chrome

```js
const chart = new ApexCharts(el, {
  chart: { type: 'area', height: 60, sparkline: { enabled: true } },
  series: [{ data: [12, 18, 9, 22, 17] }],
})
await chart.render()
```

`Config.init` 在 `sparkline.enabled` 时套 `Defaults.sparkline()`：隐藏 grid / legend / x 轴标签与刻度、关掉 toolbar 与 zoom，并 `hideYAxis()`。这是类型默认覆盖，不是另装插件。

### 案例 2：annotation 仍是配置，不是独立插件名

```js
{
  annotations: {
    xaxis: [{ x: 3, borderColor: '#FF4560', label: { text: '发版' } }],
    yaxis: [{ y: 40, borderColor: '#00E396', label: { text: '目标' } }],
  }
}
```

`XAxisAnnotations.addXaxisAnnotation` 按 `x` / `x2` 画线或区域。从 `apexcharts/core` 起步时，annotation 要显式 `import 'apexcharts/features/annotations'`；默认全量入口已带日常 feature。

### 案例 3：SSR 走另一条 exports

```js
import ApexCharts from 'apexcharts/ssr'
const html = await ApexCharts.renderToHTML(options, { width: 500, height: 300 })
```

`src/ssr/index.js` 把 `renderToString` / `renderToHTML` 挂到类上。浏览器水合走 `apexcharts/client` 的 `hydrate` / `hydrateAll`。本页未执行这两条路径。

## 踩过的坑

1. **把许可当成 MIT**：7.0.0 不是 MIT。Community 许可有年收入门槛；部分功能（`unit` / storyboard / link / ink / measure / context-menu / perspectives / history）无有效 key 时仍可用，但会打 `APEXCHARTS` 水印。
2. **responsive 看窗口不看容器**：弹窗很窄、窗口很宽时断点不触发。源码比的是 `window.innerWidth`。
3. **第二次 `render()` 不会重建**：幂等 Promise。要重挂必须先 `destroy()`。
4. **`updateSeries(null)` 是空操作**：非数组被拒绝，图表保持原 series。
5. **`renderer: 'auto'` 不会在未导入 canvas feature 时生效**：缺 feature 或遇到 gradient / pattern / image fill 会回退 SVG。不要把 README 的“数十万点”写成已测结论。

## 适用 vs 不适用场景

**适用**：

- 需要声明式 options、toolbar / sparkline / annotation 作为一等配置
- 可以接受默认 SVG，并在需要时再拆 `core` + 类型 + feature
- 组织规模落在 LICENSE 写明的 Community 范围，或不使用带水印的 premium 功能

**不适用**：

- 年收入达到 LICENSE 商业门槛、却假设“开源即可商用”
- 必须把静态阅读写成“已在目标浏览器跑通 canvas / SSR / 水印”
- 需要本轮未核验的固定体积、点数上限或框架 wrapper 行数——wrapper 是独立仓库，本文未打开

## 固定版本边界

- 本文绑定 `apexcharts/apexcharts.js@1579e97ce9bb7eeca9f35f969259f10fff6e00a2`。annotated tag `v7.0.0` 解引用到该提交；npm `apexcharts@7.0.0` 的 `gitHead` 一致；`package.json` 版本为 `7.0.0`。
- `engines.node` 为 `^20.19.0 || ^22.12.0 || >=24.0.0`。运行时依赖 `apex-commons`。
- README 另写 SSR 需要 Node 18+；与 `engines` 不一致时以 `package.json` 为准。
- 本文未安装依赖、未跑 unit / e2e、未测 bundle 或渲染，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认可不是“永远只有 SVG”**——7.0.0 把 canvas 做成可拆 feature，默认值仍是 `'svg'`。
2. **响应式合同写在窗口上**——容器宽度要自己听，不能幻想 `responsive` 已做 ResizeObserver。
3. **更新 API 对坏输入 fail-soft**——非数组 series 被忽略，避免把 `config.series` 写成 null。
4. **许可和水印是源码合同的一部分**——LicenseEnforcer 明确说客户端可绕过，只做 deterrence，不会 throw。

## 应用型自测

1. 固定 7.0.0 默认 `chart.renderer` 是什么？Canvas 要额外导入哪条 feature？
2. `responsive` 比较的宽度来自哪里？
3. `updateSeries(undefined)` 会不会清空图？

检查点：

1. `'svg'`。`apexcharts/features/renderer-canvas`。
2. 浏览器里是 `window.innerWidth`（为 0 则 `screen.width`）。
3. 不会。非数组会被 warn 并 `Promise.resolve(this)`。

## 延伸阅读

- 官方文档：[apexcharts.com/docs](https://apexcharts.com/docs/)
- 固定源码：[apexcharts/apexcharts.js](https://github.com/apexcharts/apexcharts.js) —— 本文绑定提交 `1579e97ce9bb7eeca9f35f969259f10fff6e00a2`
- 对照入口：`src/apexcharts.js`、`src/modules/settings/Options.js`、`src/modules/Responsive.js`、`src/renderers/Renderer.js`、`LICENSE`
- [[echarts]] —— 默认 Canvas 的对照
- [[chart-js]] —— 更小的 Canvas 图表核

## 关联

- [[echarts]] —— 渲染路线与许可模型都不同
- [[chart-js]] —— 插件式 annotation，而不是内置 `annotations`
- [[recharts]] —— React JSX 图元，不是跨框架 options 对象
- [[d3]] —— 底层绘制，不是现成 chart type 目录

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
