---
title: Cytoscape.js — 浏览器里画网络图、跑图算法的 JS 库
来源: 'Franz et al., "Cytoscape.js: a graph theory library for visualisation and analysis", Bioinformatics 2016'
日期: 2026-06-01
分类: 可视化
难度: 入门
---

## 是什么

Cytoscape.js 是一个**让浏览器里能画"点和线"组成的网络图、还能跑各种图算法**的 JavaScript 库。日常类比：把人际关系图、地铁线路图、蛋白质相互作用网络这些「**节点 + 连线**」结构搬到网页上，既能拖、能缩、能上色，也能问它「从北京站到天安门最短几步」。

你写：

```js
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: [
    { data: { id: 'a' } },
    { data: { id: 'b' } },
    { data: { id: 'e1', source: 'a', target: 'b' } }
  ],
  layout: { name: 'cose' }
});
```

浏览器里立刻出现两个圆 + 一条线，自动排好版，鼠标可拖。这就是 Cytoscape.js 的最小例子。

## 为什么重要

不理解 Cytoscape.js，下面这些事都没法解释：

- 为什么生物信息学论文几乎都用它画**蛋白质互作网络**——母项目 Cytoscape 桌面版被引超 5 万次
- 为什么很多**知识图谱前端**直接挑它而不是 D3——D3 要自己写碰撞检测、布局、缩放，Cytoscape.js 全内置
- 为什么它能在**浏览器里跑** Dijkstra / PageRank / 介数中心性——它把图算法 API 从桌面版移植了过来
- 为什么 GitHub 上 1 万星的图可视化库里它和 Sigma.js / vis-network 三足鼎立，而它在**学术圈占有率最高**

## 核心要点

Cytoscape.js 的脑子可以拆成 **四件事**：

1. **Element（元素）**：节点和边都叫 element，统一用 `{ data: {...} }` 描述。类比：每张拼图块都贴一张身份证。

2. **Selector（选择器）**：像 CSS 一样筛元素。`cy.$('node[weight > 50]')` 选所有权重大于 50 的节点。学过 jQuery 的人 5 分钟就上手。

3. **Layout（布局）**：决定每个节点摆在哪。内置 `grid` / `circle` / `concentric` / `breadthfirst` / `cose`（力导向）等，扩展生态里还有 `dagre`（树状）/ `klay` / `fcose` / `elk` / `cola`——十几种常用布局 + 一批社区扩展，按图形状选即可。

4. **Algorithm（图算法）**：BFS、DFS、Dijkstra、A*、Floyd-Warshall、Kruskal 最小生成树、PageRank、介数中心性、社区检测——一行 API 调用。这点是学术工具的**底气**。

四件事打通后，Cytoscape.js 既是可视化库，也是图算法库，可在 **headless 模式**（不渲染只算）里当后端用。

## 实践案例

### 案例 1：迷你知识图谱浏览器（3 步）

```js
// 1) 喂节点+边（人 / 作品 / 时代）
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: [
    { data: { id: 'turing', label: '图灵' } },
    { data: { id: 'imitation', label: '模仿游戏' } },
    { data: { id: 'e1', source: 'turing', target: 'imitation', rel: '创作' } }
  ],
  style: [{ selector: 'node', style: { label: 'data(label)' } }],
  layout: { name: 'cose' }
});
// 2) 点节点：高亮一跳邻居
cy.on('tap', 'node', (evt) => {
  const n = evt.target;
  cy.elements().removeClass('highlight');
  n.neighborhood().add(n).addClass('highlight');
});
// 3) 更大图可换成扩展布局：cytoscape.use(coseBilkent); cy.layout({ name: 'cose-bilkent' }).run();
```

三步就够：装数据 → 点选展开邻居 → 需要时换力导向扩展布局。

### 案例 2：跑最短路

```js
const dijkstra = cy.elements().dijkstra({
  root: '#beijing',
  weight: edge => edge.data('km')
});
const path = dijkstra.pathTo(cy.$('#tianjin'));
console.log(path.map(el => el.id()));
```

`path` 就是一串元素，包含节点和边交替——直接拿去高亮（加 class `path-on`）即可让用户看到红色路线。

### 案例 3：生物信息蛋白质网络

```js
cy.add(proteinNetwork);   // 几千节点 + 几万边
cy.layout({ name: 'fcose' }).run();
const central = cy.elements().betweennessCentrality();
cy.nodes().forEach(n => {
  n.style('width', central.betweenness(n) * 50 + 10);
});
```

跑完介数中心性，节点大小自动反映「桥接重要性」。这是 Cytoscape 桌面版插件最经典的工作流，现在浏览器里也能跑。

## 踩过的坑

1. **大图（>5 万节点）会卡**：Canvas 渲染不分块，DOM 事件每帧触发一次 hit-test。**解法**：设 `pixelRatio: 1`；平移时可开 `textureOnViewport: true` 用纹理缓存减轻重绘；或用 `headless` 算完再只渲染子图，再不行换 Sigma.js（WebGL）。

2. **布局是异步的**：`cy.layout({ name: 'cose' }).run()` 立刻返回，但节点位置还没算完。要监听 `layoutstop` 事件再操作，或 `await layout.promiseOn('layoutstop')`。

3. **样式选择器和 CSS 不完全一样**：没有 `:hover`，要用 mouseover 事件 + class 切换；`:selected` 是有的但要先开 `selectionType`。新人常以为是 CSS 写错。

4. **生态分两半**：核心库 `cytoscape` 体积小，但 `cose-bilkent` / `dagre` / `popper` / `cxtmenu` 这些**扩展是另装**。`npm install cytoscape-cose-bilkent` 后还要 `cytoscape.use(coseBilkent)` 注册一次。

5. **元素 id 不能改**：一旦 `cy.add({ data: { id: 'x' } })`，id 是只读的；想换得 `remove` 再 `add`。和数据库主键一样的语义，但文档里写得不显眼。

6. **数据更新要走 API，不能直接改对象**：`node.data().weight = 5` 不会触发样式重算，必须 `node.data('weight', 5)`。直接赋值在内存里改了但视图没刷新。

## 适用 vs 不适用场景

**适用**：
- 中小规模网络图（< 5 万节点）的浏览器可视化
- 需要图算法 + 可视化**一体**的研究/教学工具
- 知识图谱、社交网络、引用网络、生物网络的快速原型
- 桌面 Cytoscape 用户想把工作流搬到网页

**不适用**：
- 超大规模（百万节点）→ 用 WebGL 方案：Sigma.js / Graphology + Sigma / Cosmograph
- 严格 2D 几何关系（地铁地图、电路图）→ D3 + 自定义 SVG 更灵活
- 只要画一个静态 DAG → Mermaid / Graphviz 更省事
- 3D 网络 → 用 3d-force-graph / threejs

## 历史小故事（可跳过）

- **2002 年**：以色列人 Gary Bader 在多伦多大学搭出 **Cytoscape 桌面版**（Java），生物学家用它画蛋白质网络，论文成了 Bioinformatics 史上最常被引的软件论文之一。
- **2013 年**：Bader 实验室的 Max Franz 想让网页里也能用，重写出 **Cytoscape.js**。第一版只有布局和渲染，没有算法。
- **2016 年**：Bioinformatics 上正式发表论文，把图算法 API 补齐，从此学术圈有了「浏览器里也能跑图分析」的标配。
- **2024 年至今**：核心库由 Max Franz 继续维护，扩展生态由社区贡献，已支撑 KEGG / Reactome / WikiPathways / NDEx 等大型生物数据库的网页前端。

## 学到什么

1. **可视化和算法可以共用一份数据结构**——Cytoscape.js 的 Collection 既能画也能算，省去前后端两次建模
2. **选择器抽象**让操作图就像操作 DOM，门槛比直接写 D3 低一截
3. **布局是搜索/优化问题**，不是简单几何——力导向、层次化、正交各有所长，没万能方案
4. **学术软件的传播力**靠两点：跨平台（浏览器 > 桌面 Java）+ 友好 API。Cytoscape.js 两条都占了
5. **headless 模式**让一个"画图库"能在 Node.js 里当批处理算图工具，复用同一套 API——边界设计的胜利

## 延伸阅读

- 官网交互教程：[js.cytoscape.org](https://js.cytoscape.org/)（10 分钟把核心概念跑一遍）
- 论文 3 页：[Bioinformatics 2016](https://doi.org/10.1093/bioinformatics/btv557)（极简，主要看 API 总览）
- 扩展索引：[blog.js.cytoscape.org/extensions](https://blog.js.cytoscape.org/2020/05/11/extensions/)（选布局/右键菜单/工具提示前先看）
- [[graphrag]] —— 知识图谱 + RAG，前端常用 Cytoscape.js 展示检索路径
- [[d3]] —— 更底层、更灵活，但要自己造很多轮子

## 一句话上手清单

如果今天就要起一个 Cytoscape.js 项目，按这五步走最少坑：

1. `npm i cytoscape` 装核心，先跑通官网最小例子
2. 选定布局：树状选 `dagre`，自由网络选 `fcose` 或 `cose-bilkent`，分层无环选 `elk`
3. 把数据规范化成 `{ nodes: [...], edges: [...] }` 两份数组，再合并喂给 `elements`
4. 样式用「选择器 + 属性」批量定义，不要给每个元素单独设 style
5. 算法和渲染分开：先 headless 算完中心性/路径，再把结果当数据回写到节点上驱动样式

## 关联

- [[graphrag]] —— GraphRAG 的可视化层经常用 Cytoscape.js
- [[memgraph]] —— Memgraph Lab 等图数据库 GUI 的网页端常基于 Cytoscape.js
- [[observable-framework]] —— 数据笔记本里嵌图谱可视化的常见组合
- [[chaitin-graph-coloring]] —— 图算法的另一面：寄存器分配里的着色问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
