---
title: billboard.js — c3.js 的 TypeScript 继任者
来源: 'https://github.com/naver/billboard.js'
日期: 2026-05-31
分类: 数据可视化
难度: 初级
---

## 是什么

billboard.js 是 Naver 出品的 **D3 v7 封装图表库**，定位是"接住停滞的 c3.js"。日常类比：c3.js 像一台 2014 年的相机，能用但厂家不再出固件；billboard.js 像另一家维修站照着旧相机接口做的新机身，按键布局尽量不变，老用户少看说明书也能上手。

你写：

```js
bb.generate({
  bindto: '#chart',
  data: { columns: [['销量', 30, 200, 100, 400, 150]], type: 'line' }
})
```

API 尽量贴近 c3.js——这就是它的核心承诺：**老 c3 项目先从改 import 开始，再逐项处理少量差异**。

## 为什么重要

不理解 billboard.js 的定位，下面这些事都没法解释：

- 为什么 Naver 自己会维护一个看板图表库，而不是只等 c3.js 原作者继续修
- 为什么 2018 年之后 c3.js 项目在 GitHub 评论区都被人推荐"换 billboard"
- 为什么它有 TypeScript 类型却仍走"配置对象 + bindto" 的命令式 API——继承 c3 的历史包袱
- 为什么它支持的图类型比 c3.js 多一倍（sunburst / treemap / sankey / radar）

## 核心要点

billboard.js 的设计可以拆成 **三个承诺**：

1. **API 兼容 c3.js**：`generate({ bindto, data, axis, legend })` 字段几乎对齐。类比：换发动机不换方向盘——司机还是同一个司机。

2. **TypeScript 全量重写**：每个 option 都有类型，IDE 补全友好。这是 c3 永远做不到的（c3 是纯 JS）。类比：从手写菜单升级成有图有价的扫码菜单。

3. **D3 v7 + 模块化加载**：底层换上现代 D3，按图类型分包，按需 import 才能 tree-shake 出小 bundle。类比：自助餐拆成档口，要哪盘点哪盘，不用全端上来。

三件加起来叫 **平滑继承**——老用户零成本迁移，新用户拿到的是 TS 友好的现代库。

## 实践案例

### 案例 1：从 c3 迁移过来的最小改动

```js
// 老代码（c3.js）
import c3 from 'c3'
c3.generate({ bindto: '#chart', data: { columns: [['A', 1, 2, 3]] } })

// 新代码（billboard.js）
import bb from 'billboard.js'
bb.generate({ bindto: '#chart', data: { columns: [['A', 1, 2, 3]] } })
```

最小例子只改了 import 名。这就是 billboard 卖点最直接的体现——存量项目可以先用很小改动跑通，再按迁移指南处理事件回调、主题路径等差异。

### 案例 2：按需加载省 bundle

```js
import bb, { line, bar } from 'billboard.js'
bb.generate({
  bindto: '#chart',
  data: { columns: [['A', 1, 2, 3, 4, 5]], type: line() },
  // 只 import 用到的图类型，未用的 pie/gauge/sankey 不会进 bundle
})
```

`type: line()` 而不是 `type: 'line'` 是新写法——它把图类型当成可摇树的模块。生产项目压完几十 KB 就够。

### 案例 3：TypeScript 提示一眼能看清配置

```ts
import bb, { ChartOptions } from 'billboard.js'
const options: ChartOptions = {
  bindto: '#chart',
  data: { columns: [['A', 30, 200, 100]], type: 'line' },
  axis: { y: { tick: { format: (v) => `${v} 件` } } }
}
bb.generate(options)
```

`ChartOptions` 类型让你写到 `axis.y.tick` 时 IDE 直接列出所有字段——c3.js 时代靠记文档，现在交给编译器。

## 踩过的坑

1. **不是 React 组件，是命令式 API**：`bindto` 接 DOM 选择器，所以在 React 里要在 `useEffect` 里手动 generate 并保存实例 destroy。新人常把 ref.current 直接传进去然后 React 18 严格模式双调用导致重复实例。

2. **API "几乎"兼容 c3 不是"100%" 兼容**：`onrendered` 回调签名 / `data.onclick` 参数顺序 / 主题文件路径都微调过，盲目复制 c3 老代码会有沉默 bug。

3. **D3 v7 ESM 化导致 IE11 死路**：billboard 3.x 起依赖现代 ESM 浏览器，老国内政府项目还要 IE11 的话只能停留在 2.x 或换其它库。

4. **多主题切换需要换 CSS 文件不是切 option**：`billboard.css` / `billboard-datalab.css` / `billboard-graph.css` 是四份独立 CSS，要在 build 阶段决定，不能运行时切——这一点和 ECharts 不一样。

5. **bundle 没按需 import 时很大**：`import bb from 'billboard.js'` 会把所有图类型打进来，几百 KB。生产必须显式 `import { line }` 这种 named export 才能 tree-shake。

6. **resize 必须手动触发**：容器宽度被父级 flex 改变时图不会自动重画，要调 `chart.resize()` 或自行监听 ResizeObserver。c3 时代踩过的坑这里没修。

7. **TypeScript 类型有时和实际行为不一致**：极少数 option（特别是新加的 sankey / treemap）类型还在补，IDE 报红但运行时其实接受——遇到时翻 GitHub issue 比读类型定义快。

## 适用 vs 不适用场景

**适用**：

- 老 c3.js 项目升级，想要 TS 类型 + 维护活跃
- 企业后台 dashboard：折线 / 柱 / 饼 / radar / treemap 等常规图齐全
- 团队已经懂 D3 v7，需要"省心默认 + 必要时下钻到 D3"
- 韩国 / 日本 / 国内 toB 后台项目（生态熟、issue 响应快）

**不适用**：

- 极度自定义视觉（每根柱独立形变 / 自定义动画曲线） → 直接用 D3
- 移动端追求最小 bundle → Chart.js 更轻
- 复杂关系图 / 地理 / 3D → ECharts 或 deck.gl
- 需要服务器端渲染（SSR）首屏出图 → billboard 强依赖 DOM，要走 jsdom workaround

## 历史小故事（可跳过）

- **2014 年**：Masayuki Tanaka 一个人写了 c3.js，把 D3 包成"配置式 API"，迅速火起来。
- **2017 年**：c3 长期由作者一人维护，PR 排队半年，bug 修不完。Naver 的 dataviz 团队决定 fork 不是策略——他们直接用 TypeScript 重写，但保持 API 兼容。
- **2018 年**：billboard.js 1.0 发布，主打"无痛迁移 + 类型友好"。
- **2020 年**：3.0 引入模块化加载，按需 import 图类型，兼容 D3 v6 ESM。
- **2024 年至今**：稳定迭代，新增 sankey / treemap / sunburst 等 c3 没有的图，主题系统扩到四套。

c3 的 issue 区现在仍有人留言"已迁移到 billboard，谢谢作者"——这是开源社区"接力"的典型样本。

## 学到什么

1. **API 兼容是迁移项目的护城河**——重写引擎但不动方向盘，是最便宜的用户增长策略
2. **后继者不一定要"颠覆"前任**——平滑接棒比另起炉灶更受存量项目欢迎
3. **TS 重写不是炫技**：类型暴露让 IDE 替文档干活，新人上手时间断崖式下降
4. **模块化 + tree-shaking** 是现代库的及格线，不做就被 bundle 体积淘汰

## 延伸阅读

- 官方文档：[billboard.js docs](https://naver.github.io/billboard.js/)（example 极多，每种图都有可改的 live demo）
- 迁移指南：[c3 to billboard migration](https://github.com/naver/billboard.js/wiki/Migration-from-C3)
- [[chart-js]] —— 同样定位"易用图表"，但 Canvas 渲染、不依赖 D3
- [[d3]] —— billboard 的底层引擎，看懂 D3 就理解了 billboard 的留白
- [[echarts]] —— 同样配置式，但生态体量大十倍，更适合复杂关系图
- [[recharts]] —— React 项目首选 SVG 系，对照看 declarative 与 imperative 的差异

## 关联

- [[d3]] —— billboard 把 D3 v7 的 selection / scale / shape 包成一份配置
- [[chart-js]] —— 同类"配置式"图表库，但 Canvas 渲染路线
- [[echarts]] —— 配置项体量更大，企业级看板的另一条主流选项
- [[recharts]] —— React 生态对位选手，走 declarative 组件路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
