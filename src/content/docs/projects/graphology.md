---
title: Graphology — 浏览器里的图数据结构与算法库
来源: 'https://github.com/graphology/graphology'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

Graphology 是一个**只管数据、不管画面**的 JavaScript/TypeScript 图论库：你 `new Graph()` 拿到一个空图，往里加节点和边，再调 PageRank、社区检测、广度优先这些算法。日常类比：它像一份"人际关系花名册"——谁认识谁、每个人有什么备注，都登记在册；至于把花名册画成关系网图，是另一个库（[[sigma-js]]）的事。

最小例子：

```js
import Graph from 'graphology'
import pagerank from 'graphology-metrics/centrality/pagerank'

const g = new Graph()
g.addNode('a', { label: 'A' })
g.addNode('b', { label: 'B' })
g.addEdge('a', 'b')
console.log(pagerank(g))   // { a: 0.35..., b: 0.65... }
```

7 行：建图、加节点和边、跑 PageRank。换 1 万个节点、换成 Louvain 社区检测，代码几乎不动——graphology 内部用普通 ES 类 + 邻接表，浏览器里几百毫秒能跑完。

## 为什么重要

不理解 graphology 这一类**专攻浏览器图数据结构**的库，下面这些事都没法解释：

- 为什么 Sigma.js 文档里几乎每段示例都先 `import Graph from 'graphology'`——**渲染层和数据层分离**已经是这一代图库的共识做法
- 为什么 JS 生态以前没有像 Python NetworkX 那样"数据结构 + 算法 + 文件 IO"打包好的图库——graphology 才把这件事补齐
- 为什么 PageRank / Louvain / 中心度这些算法可以**直接在浏览器里跑**，不必把数据往后端发一趟
- 为什么社交网络分析、引用网络、知识图谱探索这种"成千上万节点 + 想交互"的前端场景，最后总会落到 graphology 当数据底座

## 核心要点

graphology 的设计可以拆成 **四件套**：

1. **唯一入口 Graph 类**：`new Graph()` 默认混合图，`new DirectedGraph()` 有向，`new MultiGraph()` 允许同一对节点多条边。所有操作都是这个类的方法：`addNode` / `addEdge` / `dropNode` / `forEachNode`。

2. **节点和边都是字符串 id + 属性包**：`g.addNode('a', { x: 0, y: 0, label: 'A' })`。graphology 不解释这些属性的含义——`x` / `y` / `size` / `color` 是 Sigma.js 才读的约定，graphology 自己只当成黑盒数据保存。

3. **事件驱动**：每次 `addNode` / `dropEdge` / `setNodeAttribute` 都会从 Graph 实例发事件出来。Sigma.js 监听这些事件做**局部刷新**——加一个节点不用整图重绘。

4. **子包生态按需装**：核心包只有数据结构。布局算法在 `graphology-layout-forceatlas2`，社区检测在 `graphology-communities-louvain`，PageRank / 中心度在 `graphology-metrics`，文件解析在 `graphology-gexf` / `graphology-graphml`。每个都是独立 npm 包。

## 实践案例

### 案例 1：和 Sigma.js 搭档画力导向图

```js
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import Sigma from 'sigma'

const g = new Graph()
g.addNode('a', { x: 0, y: 0, size: 10, label: 'Alice' })
g.addNode('b', { x: 1, y: 0, size: 10, label: 'Bob' })
g.addNode('c', { x: 0, y: 1, size: 10, label: 'Carol' })
g.addEdge('a', 'b')
g.addEdge('b', 'c')

forceAtlas2.assign(g, { iterations: 50 })   // 算好新的 x/y 写回节点
new Sigma(g, document.getElementById('container'))
```

`forceAtlas2.assign` 把每个节点的 `x` / `y` 重算一遍写回属性，Sigma 监听到属性变化就重画——**两个库零耦合，靠属性和事件对接**。

### 案例 2：在浏览器里跑 PageRank

```js
import Graph from 'graphology'
import pagerank from 'graphology-metrics/centrality/pagerank'

const g = new Graph()
papers.forEach(p => g.addNode(p.id, { title: p.title }))
citations.forEach(([from, to]) => g.addEdge(from, to))

const scores = pagerank(g)
const top10 = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 10)
```

把"论文 + 引用关系"灌进 graphology，浏览器里直接得出 PageRank 排名。1 万节点级别在普通笔记本上 200ms 内跑完，比绕一趟后端快很多。

### 案例 3：用 Louvain 自动给节点分群

```js
import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'

const g = /* ... 已建好的图 ... */
louvain.assign(g)   // 给每个节点写一个 community 属性

g.forEachNode((node, attrs) => {
  console.log(node, '属于社区', attrs.community)
})
```

Louvain 算完直接把社区编号写回节点属性，配合 Sigma 的 `nodeReducer` 按 `community` 染色，一行配置就有"自动聚类高亮"效果。

## 踩过的坑

1. **节点 id 必须是字符串**：传 `number` 会被隐式 `toString`，看似能用，但 `0` 和 `"0"` 之后会撞键。`addNode(id)` 文档里写的就是 `string`，老老实实给字符串。

2. **MultiGraph 的边要自己给 id**：普通 `Graph` 里 `(a, b)` 唯一，`g.addEdge('a', 'b')` 返回自动 id；`MultiGraph` 里同一对节点能加多条边，必须 `g.addEdgeWithKey('e1', 'a', 'b')`，否则后面 `dropEdge` 找不到目标。

3. **直接改 attrs 对象不发事件**：`g.getNodeAttributes('a').x = 100` 这样改不会触发 `nodeAttributesUpdated` 事件，Sigma 不刷新。必须 `g.setNodeAttribute('a', 'x', 100)` 才走事件通道。

4. **算法包得单独装**：`import pagerank from 'graphology-metrics/centrality/pagerank'` 报"Cannot find module"——大概率是只装了 `graphology` 没装 `graphology-metrics`。每个子包都是独立依赖。

5. **大图（10 万节点以上）算法会卡线程**：graphology 的算法都是同步 JS，跑 10 万节点的 Louvain 浏览器主线程会僵住几秒。要么换 web worker，要么换更轻的算法（比如只跑 PageRank 不跑社区检测）。

## 适用 vs 不适用场景

**适用**：
- 浏览器里做"网络图可视化"，配 [[sigma-js]] 当渲染层
- 中小规模（万级节点）社交网络 / 引用网络 / 知识图谱分析
- 教学场景：想给学生演示 PageRank / Louvain 怎么跑，不想让他们自己写邻接表
- TypeScript 项目里需要类型安全的图数据结构

**不适用**：
- 服务端大规模图（百万节点以上）——JS 内存撑不住，换 [[memgraph]] / [[janusgraph]] / [[dgraph]] 之类的图数据库
- 需要持久化存储——graphology 是纯内存，存盘自己负责
- 需要 GPU 加速的算法——graphology 全是 CPU JS
- 想要"什么图算法都内置"——子包覆盖主流但比 NetworkX 少

## 历史小故事（可跳过）

- **2017 年前后**：作者 Guillaume Plique 在重写 Sigma.js v2 时发现 v1 的"既管渲染又管数据"太挤，把数据层独立出来叫 graphology。
- **v1 时代（2017-2020）**：API 收敛，确定"graphology + sigma + 子包"的三层架构，社区检测、中心度算法陆续以子包形式上线。
- **2021 至今**：核心包迁移到 TypeScript，节点/边属性可以泛型化，IDE 直接推出 `g.getNodeAttributes(id)` 的字段。
- **维护方**：Sciences Po médialab——巴黎的社科研究机构，长年做网络分析工具（Gephi 当年也有他们的人参与），所以 graphology 的算法选择偏"网络科学"口味。

## 学到什么

1. **数据/视图分离在前端可视化里同样适用**——graphology 管图本身，[[sigma-js]] 管画图，换任意一边代码不动
2. **属性即数据**——graphology 不解释 `x` / `y` / `color`，谁来读再谁来约定，最干净的"非耦合"设计
3. **事件机制让局部刷新成本贴近 0**——加一个节点不用整图重绘，是大图交互流畅的前提
4. **子包按需装**——核心库小，算法做成生态，比一次性塞 50 个算法的"全家桶"更适合 npm 世界

## 延伸阅读

- 官方文档：[graphology.github.io](https://graphology.github.io)（API 全 + 子包索引）
- 仓库：[github.com/graphology/graphology](https://github.com/graphology/graphology)（monorepo 含所有子包）
- 配套示例：[github.com/jacomyal/sigma.js](https://github.com/jacomyal/sigma.js) 的 `examples/` 目录（每个 demo 都先建 graphology 再交给 Sigma）
- [[sigma-js]] —— 默认渲染搭档，看完这篇再看那篇就理解为什么"graphology 必先 import"
- [[cytoscape-js]] —— 同类对手，自带数据层和渲染层不分家的另一种取舍

## 关联

- [[sigma-js]] —— 同一团队，渲染层；graphology 是它的默认数据底座
- [[cytoscape-js]] —— 通用图论 + 渲染一体的对手；graphology 选了拆开
- [[d3]] —— 通用 SVG 可视化，靠 d3-force 做布局，没专门"图数据结构"类
- [[memgraph]] —— 服务端图数据库，处理 graphology 内存撑不住的规模
- [[dgraph]] —— 同上，分布式图数据库
- [[janusgraph]] —— 同上，JVM 系图数据库
