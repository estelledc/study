---
title: Observable Plot — 你说想看哪两列的关系，库自己画图
来源: 'https://github.com/observablehq/plot'
日期: 2026-05-30
分类: 数据可视化
难度: 初级
---

## 是什么

Observable Plot 是一个 **JS 画图库**，你只告诉它"我有这些数据，请把 A 列放横轴、B 列放纵轴、按 C 列染色"，它**自己**算坐标轴、自己选颜色、自己画刻度。日常类比：像点菜——你说"我要辣的、要清淡的、要海鲜"，厨师自己决定油盐糖怎么配。

它由 D3.js 的作者 Mike Bostock 在 2021 年带队开源。同一个人，同一群用户，两条路：D3 给你画笔和颜料（什么都能画但什么都得自己画），Plot 给你菜单（图表类型多、默认美观、几乎不用调）。

```js
import * as Plot from "@observablehq/plot"

Plot.plot({
  marks: [Plot.dot(data, {x: "克拉数", y: "价格", fill: "切工"})]
})
```

四行代码 → 一张带坐标轴、刻度、图例的散点图。**没**问你 scale 怎么选、轴怎么画、颜色怎么映射。

## 为什么重要

不理解 Plot，下面这些事都没法解释：

- 为什么 D3 火了 12 年后，作者又做了一个**声明式高层**库（Plot 仍依赖 D3，但把画轴/选色藏起来）
- 为什么数据科学家在 R 里用 ggplot2 用得很爽，到 JS 里就抱怨"画图好难"——Plot 就是回应
- 为什么 LLM 自动生成可视化（"画一个 X vs Y 的散点图"）越来越好用——声明式 API 比命令式好生成 10 倍
- 为什么"默认美观"也是一种核心竞争力——前端工程师可能不在乎，数据分析师非常在乎

## 核心要点

Plot 的整个 API 折叠成 **四个概念**：

1. **Mark（标记）**：你想画什么形状？点、线、柱、面、文字……Plot 提供 35+ 种 mark。类比：菜单上的菜名（"红烧肉"、"清炒时蔬"）。

2. **Channel（通道）**：把数据列**接到**视觉变量上。`x: "克拉数"` 意思"横轴接克拉数列"，`fill: "切工"` 意思"颜色接切工列"。类比：把电源插头**接到**电器（数据是电、视觉是电器）。

3. **Scale（尺度）**：把数据值（数字、字符串、日期）转换成屏幕坐标 / 颜色 / 大小。Plot **自动**从数据类型推断（连续数字 → 线性轴，日期 → 时间轴，字符串 → 类别轴）。

4. **Transform（变换）**：在数据进 mark 前预处理（分桶、分组、归一化、堆叠）。类比：菜送上桌前的"切丝/切丁/打成泥"。

写过 D3 的人对这四个概念会感慨"原来这些都该库自己做"。

## 实践案例

### 案例 1：散点图叠拟合线（grammar 的层叠思想）

```js
Plot.plot({
  marks: [
    Plot.dot(diamonds, {x: "carat", y: "price", fill: "cut"}),
    Plot.linearRegressionY(diamonds, {x: "carat", y: "price"})
  ]
})
```

**逐部分解释**：

- `marks: [...]` 是图层数组，**顺序就是叠放顺序**（后面的盖前面）
- 第一个 mark 画散点（颜色按 `cut` 切工分组）
- 第二个 mark 画线性回归拟合线（自动算斜率截距）
- 横纵轴**共享**：两个 mark 都映射到同一对 `x/y`，scale 只算一次

这就是 grammar of graphics 的核心：**多 mark 叠加** = **多语言句子组合**。

### 案例 2：facet 分面（ggplot2 招牌移植到 JS）

```js
Plot.plot({
  marks: [Plot.dot(diamonds, {x: "carat", y: "price"})],
  facet: {data: diamonds, x: "cut"}
})
```

**逐部分解释**：

- `facet.x: "cut"` → 按切工取值拆成 N 张并排子图（small multiples）
- **默认共享同一套 `x`/`y` scale**（方便跨切工对比）；Plot **没有** ggplot2 那种 `scales="free"` 开关
- 若某切工需要独立坐标，通常改成循环多次 `Plot.plot(...)`，而不是指望 facet 自动"放开"轴

**为什么有用**：传统 dashboard 要画 5 张子图得手写 5 遍循环 + 5 个 SVG 容器 + 5 套 axis。Plot 一行 `facet`，库自己拆。

### 案例 3：bin 变换 → 直方图

```js
Plot.plot({
  marks: [
    Plot.rectY(diamonds, Plot.binX({y: "count"}, {x: "carat"}))
  ]
})
```

**逐部分解释**：

- `Plot.binX({y: "count"}, {x: "carat"})` 是 transform：把 `carat` 列**分桶**，每桶算个数
- 套在 `Plot.rectY` 外面：rect mark 画柱子，柱子的高度是桶里的个数
- transform 与 mark **解耦**：同一个 binX 可以套到 dot / line / area 任何 mark 上

这就是"先把数据揉一揉，再交给画图"的声明式管道。

## 踩过的坑

1. **完全声明式无逃生舱口**：grammar 表达不了的图（如力导向图、3D 网格）必须退回 D3，**不能**在 Plot.plot 内部插自己写的 d3 代码——只能写完整的自定义 mark。

2. **SVG-only 大数据卡死**：≤10k 数据点流畅，>10k 浏览器明显卡顿。作者在 Twitter 公开说"暂不计划 Canvas 后端"——金融实时图表 / 科学计算大数据场景请用 D3 + Canvas 或 deck.gl。

3. **与 React 集成不优雅**：Plot 是**命令式** vanilla DOM API，不是 React 组件。每次 data 变就要 `useEffect → remove → append`，整张图重画，tooltip 状态 / 鼠标位置都丢。

4. **transform 链顺序看嵌套不看数组**：`Plot.binX({y: "count"}, Plot.normalizeY({basis: "sum"}, {x: "carat"}))` 里 normalizeY **先**执行（内层先），binX 后执行。新手以为是数组顺序常踩坑。

## 适用 vs 不适用场景

**适用**：
- 数据探索性分析（EDA）：写 5 行就出散点 / 直方 / 箱线图，比 matplotlib 还快
- Observable notebook 内的可视化（Plot 的"原生家园"）
- 需要 ggplot2 风格 facet 分面 / mark 叠加的场景
- 静态站点 SSR 出图（构建期算完，运行期零 JS）

**不适用**：
- 需要 React 组件式 API → 用 [[recharts]] / [[visx]]
- 需要 >10k 数据点流畅交互 → 用 [[d3]] + Canvas，或 deck.gl
- 需要丰富内置图表 + 配置式 API → 用 [[echarts]]
- 需要复杂动画时序（缓动、关键帧）→ 用 [[gsap]] 配合

## 历史小故事（可跳过）

- **1999 年**：统计学家 Leland Wilkinson 出版《The Grammar of Graphics》，第一次用"图表语法"思维系统化所有统计图，纯理论无实现。
- **2005 年**：Hadley Wickham 在 R 实现 ggplot2，让 grammar of graphics 走进数据科学日常，成为 R 数据分析的可视化标准。
- **2011 年**：Mike Bostock 发布 D3.js，给 JS 社区底层武器，能画一切但学习曲线极陡。
- **2017 年**：Bostock 离开纽约时报，创立 Observable 公司做 reactive notebook（JS 版 Jupyter）。
- **2021 年 4 月**：Plot 0.1 发布，把 ggplot2 思想搬进 JS，10 个 mark 起步。
- **2023 年**：Plot 0.6 加 transition 动画 + 35+ marks，成为 Observable notebook 默认引擎。

## 学到什么

1. **隐藏底层 vs 暴露底层** 是设计哲学分野：Plot 隐藏 D3 让团队效率高，[[visx]] 暴露 D3 让用户进阶
2. **"默认美观"是核心卖点**——Bostock 把 typography 与 spacing 调到工业级，这是 D3 默认产物的弱项
3. **声明式 API 在 LLM 时代价值放大**：自然语言"画一个 X vs Y 的散点图"能直接生成 Plot spec，比让 LLM 写 D3 代码可靠得多
4. **目标用户错位**也是一种风险：Plot 想给数据科学家，但 JS 主用户是前端工程师；前端用 Recharts 多于 Plot

## 延伸阅读

- 官方文档：[observablehq.com/plot](https://observablehq.com/plot)（最佳入口，含数百实例）
- 官方教程：[Plot Cheatsheets](https://observablehq.com/@observablehq/plot-cheatsheets)（一图速览所有 mark）
- 设计哲学：[Plot's Design Principles](https://observablehq.com/@observablehq/plot-design-principles)（Bostock 亲自写）
- 经典书：Hadley Wickham《ggplot2: Elegant Graphics for Data Analysis》（grammar of graphics 在 R 的标准教程）
- [[d3]] —— Plot 内部依赖的底层库，反向哲学
- [[echarts]] —— 配置式可视化库，与 Plot 声明式同一阵营但思路不同

## 关联

- [[d3]] —— Plot 内部依赖 + 哲学反向（D3 命令式底层，Plot 声明式高层）
- [[echarts]] —— 配置式可视化库，与 Plot 声明式同一阵营
- [[visx]] —— React-first + 暴露 D3，Plot 的反例
- [[recharts]] —— 完全 React 组件 + JSX，Plot 的另一反例
- [[gsap]] —— 动画引擎，Plot 没有内建动画系统的对照
- [[dnd-kit]] —— 拖拽 toolkit，与 Plot 同样选了"声明式 + 命令式 vanilla"两栖路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[antv-f2]] —— AntV F2 — 移动端 Canvas 图表，G2 同语法的轻量子集
- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[chart-js]] —— Chart.js — Canvas 渲染入门级图表
- [[chartist]] —— Chartist — 极简 SVG 图表
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[dnd-kit]] —— dnd-kit — React 现代拖拽 toolkit
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[matplotlib]] —— matplotlib — Python 绘图基石
- [[observable-framework]] —— Observable Framework — 编译期跑数据，浏览器只看结果
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[vega]] —— Vega — 整张图就是一棵 JSON
- [[vega-lite]] —— Vega-Lite — 用 JSON 三段式画复合图
- [[visx]] —— visx — 把 d3 拆成 30 块乐高的 React 可视化原语

