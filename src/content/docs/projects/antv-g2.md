---
title: AntV G2 — 把 Grammar of Graphics 写成 JavaScript
来源: 'AntV 团队（蚂蚁集团）官网与仓库, https://g2.antv.antgroup.com/ + https://github.com/antvis/G2'
日期: 2026-05-31
子分类: 数据可视化
分类: 数据可视化
难度: 中级
provenance: pipeline-v3
---

## 是什么

AntV G2 是一个**用 JavaScript 实现的图形语法库**：你不直接说"画柱状图"，而是说"用 interval 这种几何标记，把 month 列编码到 x、sales 列编码到 y"——库根据这套语法拼出一张图。日常类比：像点菜不是说"番茄炒蛋"，而是说"主料用蛋，配料加番茄，做法选炒"——你描述结构，厨师按结构做菜。

G2 的"G"指的就是 Wilkinson 1999 年那本《The Grammar of Graphics》。这本书把所有图表拆成 5 层：数据、几何、坐标、标度、标签。Wickham 2007 年用 R 实现成 ggplot2 火了，2017 年蚂蚁的 AntV 团队把同一套思想搬到 JS。

写一张柱状图大致是：

```js
import { Chart } from '@antv/g2'
const chart = new Chart({ container: 'app' })
chart.interval().data(sales).encode('x', 'month').encode('y', 'value')
chart.render()
```

`interval` 是几何标记（柱状用矩形条），`encode` 是数据列到视觉通道的映射。看上去像 ggplot2 的链式 JS 翻版。

## 为什么重要

不理解 G2 的设计，下面这些事没法解释：

- 为什么国内中后台仪表盘除了 ECharts 还有 G2 一席之地——它走的是完全不同的语法路线
- 为什么 G2Plot / G6 / X6 / L7 这些库能共用一套 AntV 视觉规范——底层就是 G2 的图形语法
- 为什么 G2 v5（2023）和 v4 写法差这么大——团队整体倒向函数式 + Observable Plot 风格
- 为什么"图形语法"这条路能和"配置项"路线长期共存——表达力 vs 上手成本是权衡不是优劣

## 核心要点

G2 v5 把所有 API 收到 **6 个核心抽象**：

1. **mark（标记）**：图形原语，决定用什么形状画——interval（矩形）/ line（折线）/ point（点）/ area（面）/ cell（格子）/ link（连线）。一张图可以叠多个 mark。

2. **encode（编码）**：哪一列数据映到哪个视觉通道——x / y / color / size / shape / opacity。这是图形语法的核心动作：把表格列变成视觉属性。

3. **scale（标度）**：值怎么变到坐标——linear / log / time / ordinal / threshold。日常类比：地图比例尺，告诉你"1cm 等于 1km"。

4. **transform（变换）**：画之前先处理数据——stackY（堆叠）/ dodgeX（分组并排）/ binX（分箱）/ sortX（排序）。和 SQL 的 GROUP BY/ORDER BY 同一思路。

5. **coordinate（坐标系）**：cartesian（直角）/ polar（极坐标）/ transpose（行列翻转，柱图秒变条图）/ radial。换坐标系不改 mark，柱图自动变玫瑰图。

6. **view（视图组合）**：spaceLayer 叠加 / spaceFlex 并排 / repeatMatrix 矩阵 / facetRect 分面。复合图就是多个 view 拼出来。

记住这六层，剩下的细节都是查文档。

## 实践案例

### 案例 1：写一张分组柱状图

```js
chart
  .interval()
  .data(sales)
  .encode('x', 'month')
  .encode('y', 'value')
  .encode('color', 'category')
  .transform({ type: 'dodgeX' })
chart.render()
```

`encode('color', 'category')` 把 category 列映到颜色，`dodgeX` 把同一 month 的不同 category 并排错开。换成 `stackY` 就变堆叠柱图——数据和 mark 都没变，只换了一个 transform。

### 案例 2：直角换极坐标，柱图变玫瑰图

```js
chart.coordinate({ type: 'polar' })
```

加这一行，原来横向的柱图就绕中心展开成玫瑰图。这就是图形语法的复利：你不需要专门学"玫瑰图怎么画"，只需要知道"柱图 + 极坐标 = 玫瑰图"。ECharts 想做同样效果要换 `series.type` 并重写一堆配置。

### 案例 3：和 React 集成

```jsx
import { useEffect, useRef } from 'react'
import { Chart } from '@antv/g2'

export function Sales({ data }) {
  const ref = useRef()
  useEffect(() => {
    const chart = new Chart({ container: ref.current })
    chart.interval().data(data).encode('x', 'month').encode('y', 'value')
    chart.render()
    return () => chart.destroy()
  }, [data])
  return <div ref={ref} />
}
```

@ant-design/charts 提供了更薄的 React 包装，但比 echarts-for-react 厚一些——因为 G2 API 是流式的，不是一个 option 对象，包装要把 props 翻译成方法调用。

## 踩过的坑

1. **v4 教程在 v5 跑不动**：v4 是 `chart.geom('point').position('x*y')`，v5 是 `chart.point().encode('x', 'x').encode('y', 'y')`。整个心智模型都换了。网上 2022 年前的博客文章绝大多数是 v4。

2. **encode 字段名错只在运行时报错**：`encode('x', 'mont')` 拼错列名，TypeScript 不检查（字段名是字符串），结果是图渲染出来空白。Vega-Lite 把 schema 锁死在 JSON 里至少有 schema 校验。

3. **G2 vs G2Plot 容易混**：要快上手用 G2Plot（`new Line({ data })` 一行）；要表达力用 G2（写完整 mark/encode）。新手常拿 G2 写 G2Plot 的活儿，结果代码长五倍。

4. **Tooltip 行为默认开但定制要 chart.interaction**：v5 的交互模型是 interaction 注册式，不是 ECharts 那样在 series 内部配 tooltip。文档查找路径不一样。

5. **destroy 不调浏览器吃内存**：和 ECharts 一样，G2 用 RAF 跑动画循环，组件卸载不调 `chart.destroy()` 就泄漏。

## 适用 vs 不适用场景

**适用**：

- 中后台 BI 仪表盘——蚂蚁内部主力可视化技术，社区案例丰富
- 需要图形语法表达力——复合图、分面图、坐标变换"为什么 + 怎么"
- 中文团队对中文文档/社区有要求——AntV 文档质量国内开源里第一梯队
- 和 Ant Design 体系搭配——视觉规范、调色板、字体一致

**不适用**：

- 极简场景（只画一个柱图）→ G2Plot 或 ECharts 更直接
- 需要极致性能（百万级点）→ ECharts 有 LTTB 内置 sampling
- 需要跨语言规范（Python/R 同款图）→ Vega-Lite 是 JSON DSL，G2 绑 JS
- 完全自定义视觉（艺术化数据图）→ d3 直接画更灵活

## 历史小故事（可跳过）

- **1999 年**：Leland Wilkinson 出版《The Grammar of Graphics》，把所有图拆成数据/几何/坐标/标度/标签 5 层。学界经典，工业界没人用，因为没实现。
- **2007 年**：Hadley Wickham 在 R 里实现 ggplot2，把 GoG 工程化跑通，成了 R 数据科学的事实标准。
- **2017 年**：阿里数据 EE 团队开源 G2 1.0，把 ggplot2 思想搬到 JS。当时蚂蚁内部的中后台开始用，外部 ECharts 已经火了 4 年。
- **2018-2021 年**：v2 / v3 / v4 迭代；用法是 `chart.geom('interval').position('month*sales')`，类 ggplot2 的字符串 DSL。
- **2023 年**：G2 5.0 大重写，倒向 Observable Plot 风格的函数式 mark API（`chart.interval().encode(...)`），告别字符串 DSL。这是一次彻底的 breaking change。
- **2024-2026 年**：v5.x 进入维护期，G2Plot / G6 / X6 / L7 跟进 v5，整个 AntV 生态在视觉规范和底层 API 上收敛。

## 学到什么

1. **Grammar of Graphics 是图表设计的"标准答案之一"**：从 1999 年的书到 ggplot2 / Vega-Lite / G2，30 年里这套范式在不同语言里被反复实现，说明它捕到了图表的本质结构。
2. **JS 实现 GoG 比 R 难**：R 是函数式 + 数据帧友好，ggplot2 写得自然；JS 没有数据帧，列名要靠字符串 + scale 推导，类型安全和 IDE 提示都吃亏。
3. **配置项 vs 语法**：ECharts 是配置项路线（写 JSON），G2 是语法路线（写代码）。前者抄文档就能用，后者学完受用一辈子。两条路长期共存不是因为用户分裂，是表达力维度本就有取舍。
4. **AntV 生态的复利**：G2 / G2Plot / G6 / X6 / L7 共用同一套视觉规范和图形哲学，整套用下来心智模型一致。这是组件库做生态的好处。
5. **重写 v5 的勇气**：从字符串 DSL 转函数式 mark，等于让所有老用户重学。但这是为了向 Observable Plot 风格靠拢、让 TypeScript 推导更顺。重写换长期清爽是值得的。

## 延伸阅读

- 官方文档：[g2.antv.antgroup.com](https://g2.antv.antgroup.com/) ——v5 中文文档完整
- 仓库 README：[github.com/antvis/G2](https://github.com/antvis/G2)
- AntV 总站：[antv.antgroup.com](https://antv.antgroup.com/) ——G2 / G2Plot / G6 / X6 / L7 全家桶
- Wilkinson 1999：[The Grammar of Graphics](https://www.springer.com/gp/book/9780387245447)（理论原书）
- Wickham 2010：[A Layered Grammar of Graphics](https://vita.had.co.nz/papers/layered-grammar.pdf)（ggplot2 的论文版本）
- [[vega-lite]] —— 同主题 GoG 落地，JSON 风格
- [[echarts]] —— 配置项路线对照阅读
- [[d3]] —— G2 的底层乐高灵感来源

## 关联

- [[vega-lite]] —— 都是 GoG 在前端的落地，JSON DSL vs JS DSL
- [[echarts]] —— 配置项路线代表，G2 的对照参考
- [[d3]] —— 底层渲染和 scale 思想的源头
- [[observable-plot]] —— G2 v5 函数式 API 的设计参考
- [[plotnine]] —— Python 版 ggplot2，跨语言对照
- [[recharts]] —— React 组件式可视化，另一条 JSX 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[antv-f2]] —— AntV F2 — 移动端 Canvas 图表，G2 同语法的轻量子集
- [[antv-g6]] —— AntV G6 — 把"关系数据"画成会自己摆位置的图
- [[antv-x6]] —— AntV X6 — 把 mxGraph 的图编辑思路搬到 TypeScript
- [[cytoscape-js]] —— Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[dhtmlx-gantt]] —— DHTMLX Gantt — 给企业级排期用的全功能甘特组件
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[frappe-gantt]] —— Frappe Gantt — 200 行 SVG 写出的甘特图
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[pdfmake]] —— pdfmake — 用对象树声明 PDF，浏览器和 Node 都能跑
- [[react-flow]] —— React Flow / xyflow — 节点编辑器框架
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[sigma-js]] —— Sigma.js — 上万节点仍流畅的 WebGL 图渲染器
- [[vega-lite]] —— Vega-Lite — 用 JSON 三段式画复合图

