---
title: Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
来源: 'https://github.com/cytoscape/cytoscape.js'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

Cytoscape.js 是一个用 JavaScript 写的**图论库**：把"一堆节点 + 一堆边"丢给它，浏览器里就能画出来、拖动、放大、跑算法。日常类比：像 Google Maps 之于"地点 + 路线"——你只管报数据，它管画图、管交互、管路径计算。

你写：

```js
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: [
    { data: { id: 'a' } },
    { data: { id: 'b' } },
    { data: { id: 'ab', source: 'a', target: 'b' } }
  ],
  layout: { name: 'grid' }
})
```

7 行：两个节点 a / b，一条边 ab，自动按网格摆位置。换成 `name: 'cose'` 就是力导向布局，节点会像弹簧一样自己散开。同一份数据想看树形、看环形、看分层，改一个字符串就行。

## 为什么重要

不理解 Cytoscape.js 这一类**图论可视化库**，下面这些事写起来都很别扭：

- 为什么 [[d3]] 给你画线画圆的原语，但"画一张几百节点的关系图还能拖动"得自己拼 200 行
- 为什么生物信息领域的 pathway 图（基因/蛋白质相互作用）几乎全用 Cytoscape 系——它从 2002 年的桌面版起就是学术标配
- 为什么"节点 + 边"的可视化能复用同一套抽象：知识图谱、依赖关系、社交网络、IT 拓扑，画法都是一回事
- 为什么 Mermaid 渲染某些图、Obsidian 的关系图视图、Kibana 的拓扑视图，底下都坐着 Cytoscape

## 核心要点

Cytoscape.js 的设计可以拆成 **四件套**：

1. **数据模型（elements）**：所有内容都是节点（node）或边（edge），每个带一个 `data` 对象。节点的 `id` 唯一，边的 `source` / `target` 指向节点 id。这套模型简单到能直接序列化成 JSON，也是和后端交换数据的格式。

2. **样式表（style）**：像 CSS 一样写选择器 + 属性。`node[weight > 50] { background-color: red }` 表示"权重大于 50 的节点涂红"。**数据和外观分离**——同一份图数据换个样式表就是另一种视觉风格。

3. **布局（layout）**：内置 6 种（grid / circle / concentric / breadthfirst / cose / random），通过插件能扩到 100+（`fcose` / `cola` / `dagre` / `elk` / `klay`）。`cose` 是默认的力导向，节点互斥、边像弹簧。

4. **算法 API**：BFS / DFS / Dijkstra / A* / Bellman-Ford / Floyd-Warshall / 介数中心性 / PageRank / Kruskal / Prim / 层次聚类 / Markov 聚类——研究生写论文要的图算法基本齐了，全都一行调用。

## 实践案例

### 案例 1：3 行画一张可拖拽的依赖图

```js
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: [
    { data: { id: 'app' } },
    { data: { id: 'react' } },
    { data: { id: 'app-react', source: 'app', target: 'react' } }
  ],
  layout: { name: 'cose' },
  style: [
    { selector: 'node', style: { 'label': 'data(id)' } },
    { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle' } }
  ]
})
```

把 `package.json` 的 dependencies 转成节点 + 边，就是一张能拖、能缩、能点的依赖图。这是 npm 生态里 `npm-graph` / `dependency-cruiser` 一类工具的核心做法。

### 案例 2：跑一次 Dijkstra 找最短路

```js
const dijkstra = cy.elements().dijkstra({ root: '#a' })
const pathToD = dijkstra.pathTo(cy.$('#d'))   // 返回边和节点序列
const distToD = dijkstra.distanceTo(cy.$('#d'))   // 返回数字距离
```

三行就能拿到 a 到 d 的最短路径和距离。背后是教科书里的 Dijkstra，区别是你不用自己实现，也不用为了画在屏幕上再写一层渲染。

### 案例 3：CSS 风格的选择器筛子图

```js
const heavyNodes = cy.$('node[weight > 50]')          // 权重大的节点
const aToB = cy.$('#a -> #b')                          // a 指向 b 的边
const neighbors = cy.$('#a').neighborhood()            // a 的一阶邻居
const subgraph = neighbors.union(cy.$('#a'))           // 把 a 自己也加进来
```

像 jQuery 那样筛 DOM、像 CSS 那样写选择器——Cytoscape 把"图论操作"写成了前端开发者熟悉的形态。集合操作 `union` / `intersection` / `difference` 让图变成可链式组合的小积木。

### 案例 4：布局插件按需加

```js
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
cytoscape.use(fcose)
cy.layout({ name: 'fcose', quality: 'default' }).run()
```

默认 `cose` 在 500+ 节点时会卡。装上 `cytoscape-fcose`（更快的 Compound Spring Embedder）只多两行。70+ 个官方插件覆盖布局、拖动建边、tooltip、右键菜单——核心库保持小，能力靠插件长出来。

## 踩过的坑

1. **容器没尺寸什么都不画**：`container` 那个 div 必须有非零的宽高才能渲染。新手常忘了给 CSS `height: 600px`，然后看着空白页一脸懵。

2. **id 必须全局唯一**：节点 id 和边 id 同处一个命名空间。`{id: 'a'}` 节点和 `{id: 'a'}` 边会冲突，运行时直接报错。

3. **集合是不可变的**：`cy.elements().filter(...)` 返回**新集合**，不会改原集合。新手以为是 in-place 操作，结果改完发现原图没变。要么链式写下去，要么把结果重新赋值。

4. **默认 cose 在大图上慢**：>500 节点直接 `name: 'cose'` 会卡几秒到十几秒。应该换 `fcose`（插件）或 `cola`，差一个数量级。

5. **WebGL 渲染要装扩展**：默认是 Canvas，>10k 节点会力不从心。`cytoscape-webgl` 是单独的扩展，不在核心包里——不少人以为开个开关就能用，实际要 `npm install` + `cytoscape.use()`。

## 适用 vs 不适用场景

**适用**：

- 节点 + 边的关系可视化：知识图谱、依赖图、社交网络、生物 pathway
- 需要现成图算法（最短路、中心性、聚类）+ 可视化一站搞定的场景
- 学术发论文场景——Franz 2016 论文 1500+ 引用，审稿人见怪不怪
- 中等规模（<5k 节点）的浏览器内交互式探索

**不适用**：

- 通用图表（柱状/折线/饼）→ 用 [[echarts]] / [[d3]]
- 几十万节点的超大图 → 用 [[sigma-js]] / Graphistry（GPU 渲染）
- 只要数据结构不要渲染 → 用 graphology（纯数据层）
- React 项目想要声明式 → reagraph / react-flow 更顺手

## 历史小故事（可跳过）

- **2002 年**：多伦多大学 Donnelly 中心 Gary Bader 的实验室开始做 Cytoscape Desktop（Java），给生物学家画蛋白质相互作用网络。
- **2010 年代初**：Web 时代，团队做 Cytoscape Web（Flash），但 Flash 末路。
- **2016 年**：Max Franz / Christian Lopes 等人在 *Bioinformatics* 期刊发表 "Cytoscape.js: a graph theory library for visualisation and analysis"，纯 JS 重写，无外部依赖，浏览器和 Node.js 都能跑。
- **2026 年**：Cytoscape.js 已到 3.33.x，GitHub 10.5k Star，那篇 2016 论文 1500+ 引用——生物信息领域是基础设施级地位。

## 学到什么

1. **节点 + 边 + 样式表 + 布局算法** 是图论可视化的通用四件套，理解这四个词，跨库迁移（vis-network / sigma / react-flow）只是查 API
2. **数据和外观分离**（CSS 思想）让一份数据复用——这套范式从 Web 迁移到了图可视化领域
3. **核心小 + 插件长** 的开源治理，让一个库 10 年保持迭代而不臃肿
4. **学术工具走向工业** 的典型路径：先解决一个具体科学问题（蛋白质网络），抽象足够通用后被前端工程师拿来画一切节点-边关系

## 延伸阅读

- 官网与文档：[js.cytoscape.org](https://js.cytoscape.org/)（API + 样例齐全，可在浏览器里直接跑）
- 论文 PDF：[Franz et al. 2016 Bioinformatics](https://academic.oup.com/bioinformatics/article/32/2/309/1744007)
- 桌面版（Java 老大哥）：[cytoscape.org](https://cytoscape.org/)
- 插件目录：[js.cytoscape.org/#extensions](https://js.cytoscape.org/#extensions)（70+ 个官方插件）

## 关联

- [[d3]] —— 通用可视化原语，Cytoscape 不用 d3，但思想上是"d3-force + 图算法 + 选择器"的合订本
- [[echarts]] —— 通用图表库，也有 graph 系列但远不如 Cytoscape 专门
- [[antv-g2]] —— 蚂蚁的图形语法库，G6 是它家的图可视化对应物
- [[kepler-gl]] —— 地理数据可视化，思路类似（数据 + 图层 + 样式）
- [[playwright]] —— 端到端测试，能 assert Cytoscape 渲染后的 DOM/Canvas

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[antv-g2]] —— AntV G2 — 把 Grammar of Graphics 写成 JavaScript
- [[antv-g6]] —— AntV G6 — 把"关系数据"画成会自己摆位置的图
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[graphology]] —— Graphology — 浏览器里的图数据结构与算法库
- [[kepler-gl]] —— kepler.gl — 拖拽式百万点 GIS 探索界面
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[sigma-js]] —— Sigma.js — 上万节点仍流畅的 WebGL 图渲染器
- [[vis-network]] —— vis-network — barnesHut 物理引擎驱动的网络图

