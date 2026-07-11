---
title: Sigma.js — 上万节点仍流畅的 WebGL 图渲染器
来源: 'https://github.com/jacomyal/sigma.js'
日期: 2026-06-01
分类: 数据可视化
难度: 入门
---

## 是什么

Sigma.js 是一个**只管画图、不管数据**的 JavaScript 库：你把"一堆节点 + 一堆边"传给它，它用 WebGL 在浏览器里高速渲染，**上万节点也能 60 帧拖来拖去**。日常类比：像游戏引擎之于"模型 + 场景"——它专门负责把东西画到屏幕上、让你拖拽缩放，至于这些"东西"长什么关系，是另一个库（graphology）的事。

最小例子：

```js
import Graph from 'graphology'
import Sigma from 'sigma'

const graph = new Graph()
graph.addNode('a', { x: 0, y: 0, size: 10, label: 'A' })
graph.addNode('b', { x: 1, y: 1, size: 10, label: 'B' })
graph.addEdge('a', 'b')

new Sigma(graph, document.getElementById('container'))
```

8 行：graphology 建图，sigma 接管渲染。换 1 万个节点、改一下布局算法，代码几乎不动——Sigma 内部走 WebGL，浏览器仍然不卡。

## 为什么重要

不理解 Sigma.js 这一类**专攻大规模图渲染**的库，下面这些事都没法解释：

- 为什么 [[cytoscape-js]] 默认用 Canvas，过 5000 节点就开始掉帧——通用图论库的取舍是"算法全 + 渲染中等"
- 为什么 Gephi（桌面 Java 老牌）2008 年就能画几万节点，但搬到浏览器后大家又重写了一遍——浏览器的渲染天花板只有 GPU 能撑
- 为什么 Sigma 文档里反复出现 graphology——**渲染层和数据层分离**已经是这一代图库的共识做法
- 为什么社交网络分析、知识图谱探索、引用网络这些"成千上万节点 + 想交互"的场景，最后总会落到 Sigma 或 Cosmograph

## 核心要点

Sigma.js 的设计可以拆成 **四件套**：

1. **数据结构外置**：Sigma 不存图，它**接收一个 graphology 实例**。graphology 是同一作者写的**纯图数据结构 / 算法库**（数据层，不是数据库），专门管节点/边的增删改查、广度优先、连通分量等。两边职责清爽：graphology 算，Sigma 画。

2. **WebGL 渲染管线**：节点和边各自走一对 vertex shader + fragment shader，把"画 1 万个圆"压成一次 GPU 调用。日常类比：原来一笔一笔涂色（Canvas），现在一次性把所有形状塞给显卡（WebGL），延迟差一个数量级。

3. **Camera 抽象**：pan / zoom / rotate 都只改一个变换矩阵，**不重新计算布局**。鼠标滚轮缩放时不触发任何节点位置重算，所以 10 万节点也能丝滑缩放。

4. **Reducer 动态视觉**：你提供 `nodeReducer(node, data) => newData` 这种函数，Sigma 在渲染前调用一次。想 hover 高亮某节点的邻居？写一个 reducer 把非邻居 alpha 调低就行——**不改原图数据**，纯渲染层效果。

## 实践案例

### 案例 1：接 graphology 跑 ForceAtlas2 布局

```js
import Graph from 'graphology'
import { circular } from 'graphology-layout'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import Sigma from 'sigma'

const graph = new Graph()
// 假装有 5000 节点 + 1.2 万边
circular.assign(graph)                       // 先初始化为圆形
forceAtlas2.assign(graph, { iterations: 50 }) // 力导向收敛 50 次
new Sigma(graph, container)
```

Sigma 不内置布局——这是有意的设计。布局算法属于"数据层"，写在 graphology 生态里（`graphology-layout` / `graphology-layout-forceatlas2` / `graphology-layout-noverlap`）。这种解耦让换一个布局只是 import 不同包。

### 案例 2：reducer 实现 hover 高亮

先接上案例 1 的 `graph`，再创建 `sigma`，然后挂 hover：

```js
const container = document.getElementById('container')
const sigma = new Sigma(graph, container)

let hovered = null
sigma.on('enterNode', ({ node }) => { hovered = node; sigma.refresh() })
sigma.on('leaveNode', () => { hovered = null; sigma.refresh() })

sigma.setSetting('nodeReducer', (node, data) => {
  if (!hovered) return data
  const neighbors = graph.neighbors(hovered)
  if (node === hovered || neighbors.includes(node)) return data
  return { ...data, color: '#ddd', label: '' }   // 非邻居灰掉
})
```

reducer 是交互的灵魂：每次 `refresh()` 问一遍"这个节点现在该长什么样"。原图不变，只临时改渲染属性——撤销 hover 不需要 undo。

### 案例 3：camera API 编程式定位

```js
const camera = sigma.getCamera()
camera.animate({ x: 0.5, y: 0.5, ratio: 0.2 }, { duration: 600 })
```

`ratio: 0.2` 表示放大到原本视野的 1/5（数字越小越大，反直觉）。camera 是世界坐标 → 屏幕坐标的中介，所有交互都通过它——后续做"点节点定位""跨视图同步"都站在 camera 上。

### 案例 4：自定义节点形状（programs）

```js
import { NodeImageProgram } from '@sigma/node-image'

new Sigma(graph, container, {
  nodeProgramClasses: { image: NodeImageProgram },
  defaultNodeType: 'image',
})
// 节点 data 加 image: 'https://...' 即可
```

`program` 是 Sigma 的扩展点——一对 shader 加一段 JS 描述如何往 GPU buffer 写数据。官方提供 image / border / outline / pictogram 等。要自定义形状（六边形、星形）就再写一个 program，几十行 GLSL。

## 踩过的坑

1. **节点必须有 x / y / size**：忘了任何一个，那个节点就**渲染不出来也不报错**。新人常以为 Sigma 会自动布局，结果传一堆 `{label: 'A'}` 看到空白画布。

2. **graphology 是 peerDependency**：`npm install sigma` 不会自动装 graphology，得 `npm install sigma graphology` 一起来。文档里有写但很容易漏。

3. **reducer 别做重活**：reducer 在每次 refresh 都会跑遍**所有节点和边**——10 万节点里搜邻居就是 10 万次循环。要么 hover 时缓存邻居集合，要么用 graphology 的 `neighbors()`（内部 Set，O(1)）。

4. **camera 的 ratio 反直觉**：`ratio = 1` 是默认视野，**数字变小是放大**（zoom in），变大是缩小。有人想"缩小到一半就是 0.5"，结果反而放大了。

5. **WebGL context 丢了不会自动恢复**：浏览器在 GPU 紧张时可能回收 WebGL context（尤其是切到后台再切回来）。要监听 `webglcontextlost` / `webglcontextrestored`，不然回到页面发现一片黑。

## 适用 vs 不适用场景

**适用**：

- 上万节点的图想在浏览器里**交互式探索**（拖、缩、点）
- 网络科学 / 知识图谱 / 社交网络分析的 Web 版
- 已经有 graphology 数据流，只缺渲染层
- 想做"Gephi 网页版"——Sigma 就是这条路线的精神继承

**不适用**：

- 几百节点的小图 + 想要丰富算法 → [[cytoscape-js]] 一站搞定
- 节点 + 边 + 复杂 HTML 弹窗（节点里嵌组件）→ react-flow 更顺
- 几十万节点 + 实时模拟 → Cosmograph / Graphistry（GPU 做物理模拟）
- 通用图表（柱状/折线）→ [[d3]] / [[echarts]]

## 历史小故事（可跳过）

- **2010 年代初**：巴黎 Sciences Po 的 médialab（社会科学计算实验室）需要在网页上展示研究的关系网络。同一个实验室此前还诞生了桌面老牌 Gephi。
- **2013–2014 年**：Alexis Jacomy 公开 Sigma.js v1（约 2013 draft / 2014 正式），主线是 **Canvas + WebGL** renderer（SVG 多为导出/插件路径），能跑约千级节点。社交网络研究圈快速采纳。
- **2021 年**：v2 完全重写——TypeScript + WebGL 默认，作者把图数据结构剥离成独立项目 graphology。这一刀让两边都长得更快。
- **2026 年**：Sigma 已到 v3.x（另有 v4 alpha），GitHub 约 12k Star。配合 graphology 几乎成为"网页大图可视化"的事实标准之一。

## 学到什么

1. **渲染层 / 数据层分离**：Sigma + graphology 的搭档是这一代图库的范式——一个画图、一个算图，各自迭代。CSS-in-JS / 状态-视图分离 / ORM-数据库分离都是同一个思想
2. **WebGL 是浏览器画大图的天花板**——Canvas 5k 节点开始掉，WebGL 把这个数推到 10 万。一次性把数据塞 GPU，比一笔笔画快一个数量级
3. **Reducer + Camera 抽象**：把"原始数据"和"此刻怎么显示"分开，让交互（hover / zoom / 高亮）只动渲染层不动数据，撤销/重做天然成立
4. **学术工具 → 工业基础设施** 的又一例：médialab 起家，今天在 Bloomberg 终端、生物制药知识图谱、企业内网可视化里都能见到

## 延伸阅读

- 官网与示例：[sigmajs.org](https://www.sigmajs.org/)（Storybook 全套样例）
- graphology 文档：[graphology.github.io](https://graphology.github.io/)（数据层 API）
- 论文/介绍：[médialab Sciences Po](https://medialab.sciencespo.fr/)
- GitHub：[jacomyal/sigma.js](https://github.com/jacomyal/sigma.js)

## 关联

- [[cytoscape-js]] —— 同样是图论库，但偏算法+小中型图，Sigma 偏纯渲染+大图
- [[d3]] —— 通用可视化原语，Sigma 在"画大图"这一块做了 d3-force 做不到的性能
- [[antv-g2]] —— 蚂蚁的可视化语法，G6 是它家的图可视化对应物
- [[playwright]] —— 端到端测试，能 assert Sigma 渲染后的 WebGL Canvas

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[antv-g6]] —— AntV G6 — 把"关系数据"画成会自己摆位置的图
- [[projects/cytoscape-js]] —— Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
- [[graphology]] —— Graphology — 浏览器里的图数据结构与算法库
- [[vis-network]] —— vis-network — barnesHut 物理引擎驱动的网络图
