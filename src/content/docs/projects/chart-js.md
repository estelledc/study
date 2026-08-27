---
title: Chart.js — Canvas 渲染入门级图表
来源: https://github.com/chartjs/Chart.js
日期: 2026-08-27
分类: 数据可视化
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/chartjs/Chart.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9c5cf9fac7ec04a71b516e2aff3f7d76876be369
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.5.1
---

## 是什么

Chart.js 是一个用一份 `type / data / options` 配置在 HTML5 Canvas 上画常规统计图的库。日常类比：Excel 的“插入图表”——你给标签和数组，它用对应的 controller 把数据集翻成像素。

固定 `chart.js@4.5.1` 的入口是 `new Chart(item, userConfig)`。`item` 可以是 canvas、2D context 或元素 id；同一 canvas 已有实例会直接抛错。

```js
import {Chart, registerables} from "chart.js"
Chart.register(...registerables)
new Chart(ctx, {
  type: "line",
  data: {labels: ["一月", "二月"], datasets: [{data: [10, 20]}]},
})
```

默认入口**不会**注册 controller。`chart.js/auto` 只是替你执行上面这句 `Chart.register(...registerables)`。

## 为什么重要

不按固定 4.5.1 读源码，下面这些印象会过期：

- 为什么复制旧教程的 `Chart.defaults.global` 或 `xAxes: [{...}]` 会失效
- 为什么 `import Chart from "chart.js"` 后 `type: "line"` 可能报未注册
- 为什么 `responsive` 其实已经是默认值，真正让图变糊的是 CSS 尺寸和 canvas 像素尺寸不一致
- 为什么打开 decimation 仍可能完全不采样：它默认关闭，且要求 line-like、线性/时间 x 轴，以及 `parsing: false`

## 核心要点

固定实现可以拆成四层：

1. **Chart 实例**：持有 platform、canvas context、scales、plugin service。构造时 `_initialize` 发 `beforeInit` / `afterInit`；`attached` 则立刻 `update()`。

2. **Registry + Controller**：`registry` 分 controllers / elements / plugins / scales。内置 controller 只有 bar、bubble、doughnut、line、polarArea、pie、radar、scatter。`LineController` 把 dataset 画成 `line` 元素，点画成 `point`，并声明 `supportsDecimation = true`。

3. **Update → layout → render → draw**：`update()` 刷新 option resolver、重建 scale、让每个 dataset controller 建元素，再 `render()`。无动画时 `draw()` 清 canvas，先画 `z<=0` 的层，再画 datasets，再画其余层。

4. **Plugin**：`notify(hook)` 按描述符调用；cancelable hook 返回 `false` 会中断。内置插件含 Tooltip、Legend、Title、Filler、Colors、Decimation。本地 `config.plugins` 可以再挂自己的对象。

## 实践示例

### 案例 1：显式注册后的最小柱图

```js
import {Chart, BarController, BarElement, CategoryScale, LinearScale} from "chart.js"
Chart.register(BarController, BarElement, CategoryScale, LinearScale)
new Chart(document.getElementById("c"), {
  type: "bar",
  data: {
    labels: ["周一", "周二", "周三"],
    datasets: [{label: "杯数", data: [3, 5, 2]}],
  },
})
```

这比 `/auto` 多几行，但能看清 tree-shake 边界：没用到的 doughnut / time scale 不会进入 registry。

### 案例 2：默认响应式 + 改 tooltip 文案

```js
new Chart(ctx, {
  type: "line",
  data,
  options: {
    maintainAspectRatio: false,
    plugins: {
      tooltip: {callbacks: {label: (item) => `销量 ${item.parsed.y} 件`}},
    },
  },
})
```

`responsive` 默认就是 `true`。父容器没有明确高度时，`maintainAspectRatio: false` 才会按容器重算。外观不能靠 CSS 改柱子颜色，必须走 `options`。

### 案例 3：`afterDraw` 画水印

```js
const watermark = {
  id: "watermark",
  afterDraw(chart) {
    const {ctx, chartArea} = chart
    ctx.save()
    ctx.fillStyle = "rgba(0,0,0,0.08)"
    ctx.fillText("DRAFT", chartArea.left + 16, chartArea.top + 32)
    ctx.restore()
  },
}
new Chart(ctx, {type: "line", data, plugins: [watermark]})
```

`afterDraw` 拿到的是原生 canvas context。插件还可以实现 `install` / `start` / `stop` / `uninstall`；不要假定自己写的钩子一定在 datasets 之后——那是 `afterDraw` 的位置，不是所有 hook。

## 踩过的坑

1. **忘记 `Chart.register`**：默认入口是显式注册模型。`/auto` 会注册全部 built-in，也更难 tree-shake。
2. **同一 canvas 复用**：构造函数发现已有实例会抛错，必须先 `destroy()`。
3. **手动改 CSS 宽高导致发糊**：`retinaScale` 用 `devicePixelRatio` 设像素宽高并 `setTransform`。只改 CSS、不让 Chart 同步，文字会锯齿。
4. **把 decimation 理解成“超过 1 万点自动降采样”**：默认 `enabled=false`，算法默认 `min-max`，阈值默认 `4 * chart.width`，还要求 `parsing: false` 和 linear/time x 轴。
5. **沿用 v2 配置**：`Chart.defaults.global` 已删除；scale 是 `options.scales.x`，不是 `xAxes` 数组。

## 适用 vs 不适用场景

**适用**：
- 管理后台的折线 / 柱 / 饼 / 散点
- 框架无关的 Canvas 图表，能接受配置对象而不是 JSX
- 需要 plugin 钩子插入水印、自定义 tooltip 或轻量采样

**不适用**：
- 地理、桑基、关系图、3D → [[echarts]] / [[d3]]
- 强无障碍、需要每个图形都是 DOM → [[recharts]] / [[observable-plot]]
- 未实测就把“Canvas 一定比 SVG 快”写成结论 → 本文没有跑帧率
- 把 v4 源码说成纯 TypeScript 重写 → 固定树仍是 JS/TS 混写

## 固定版本边界

- 本文绑定 `chartjs/Chart.js@9c5cf9fa...`，GitHub lightweight tag 与 npm `gitHead` 均为 `4.5.1`。
- 运行时依赖只有 `@kurkle/color`。`engines` 只写 `pnpm>=8`，没有 Node 版本字段。
- 内置 plugin / controller 集合以本提交的 `src/plugins/index.js` 与 `src/controllers/index.js` 为准。
- 本文只做静态源码阅读，没有安装依赖、启动 Karma 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **成品库的真正合同是 registry**：类型字符串只是查表键
2. **默认响应式 ≠ 默认不糊**：CSS 尺寸和 backing store 是两套数字
3. **插件钩子是扩展点，也是中断点**：cancelable hook 返回 `false` 会停掉后续步骤
4. **降采样是可选插件，不是数据量阈值魔法**
5. **v2 / v3 / v4 不能共用一份“Chart.js 常识”**

## 应用型自测

1. 只 `import {Chart} from "chart.js"`，不 `register`，`type: "line"` 会画出折线吗？
2. 不写 `options.responsive`。固定 4.5.1 会监听容器尺寸吗？
3. 打开 `plugins.decimation.enabled=true`，但 `parsing` 仍是默认 `true`。会采样吗？

检查点：

1. 不会。未注册时 `registry.getController("line")` 会抛错。
2. 会。默认 `responsive` 为 `true`。
3. 不会。decimation 在 `parsing` 开启时直接返回。

## 延伸阅读

- 文档：[chart.js 4.5.1 docs](https://www.chartjs.org/docs/4.5.1/)
- 固定源码：[chartjs/Chart.js](https://github.com/chartjs/Chart.js) —— 本文绑定提交 `9c5cf9fac7ec04a71b516e2aff3f7d76876be369`
- [[d3]] —— 对照乐高原语和成品 Chart
- [[recharts]] —— React + SVG 的同类教学定位
- [[echarts]] —— 同样走 Canvas，但配置面更宽
- [[observable-plot]] —— grammar of graphics，不是 controller 查表

## 关联

- [[d3]] —— 底层数据驱动原语，Chart.js 省掉的就是这一层拼接
- [[recharts]] —— 声明式 SVG
- [[echarts]] —— 另一条配置式 Canvas
- [[plotly-js]] —— 更重的交互默认值
- [[observable-plot]] —— 组合式统计图

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amcharts5]] —— amCharts 5 — TypeScript 重写的商业级图表库
- [[antv-f2]] —— AntV F2 — 移动端 Canvas 图表，G2 同语法的轻量子集
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[billboard-js]] —— billboard.js — c3.js 的 TypeScript 继任者
- [[chartist]] —— Chartist — 极简 SVG 图表
- [[leaflet]] —— Leaflet — 轻量交互式地图
- [[regl]] —— regl — 函数式 WebGL 封装
- [[vega]] —— Vega — 整张图就是一棵 JSON
