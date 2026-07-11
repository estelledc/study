---
title: 3d-force-graph — 把网络拓扑搬进三维空间
来源: https://github.com/vasturiano/3d-force-graph
日期: 2026-06-01
分类: 数据可视化
难度: 中级
---

## 是什么

**3d-force-graph** 是一个浏览器组件，把"节点 + 连线"这种网络数据画在 **3D 空间**里，节点的位置由**物理模拟**自己跑出来，不用你手动摆。

日常类比：你把一堆磁铁随便扔进玻璃缸，它们会自己排成一个稳定的形状——同性互相推开、连着的相互吸引，最后落到不再晃动的位置。3d-force-graph 干的就是这件事，只不过磁铁是"节点"，缸是"3D 浏览器画布"。

底下踩两块基石：

- **three.js**：WebGL 渲染引擎，负责把 3D 物体画到屏幕
- **d3-force-3d**：物理模拟引擎，负责算每个节点该往哪儿飘

作者 Vasco Asturiano 同时维护 `force-graph`（2D 版）和 `react-force-graph`（React 绑定）。

## 为什么重要

不上 3D 时，遇到"上千节点的网络图"会有几个躲不掉的痛：

- **2D 力导向图节点一多就糊成毛球**——所有点挤在一个平面，连线交叉到看不出结构
- **手写 three.js + 物理模拟太重**——你要自己实现斥力、引力、阻尼、相机轨道控制，几百行
- **想加交互（点节点跳走、悬浮高亮）每次都要从零开始**

3d-force-graph 把这三件事一次性收拾干净：

- 多一个维度（z 轴），节点可以"前后"分开，毛球散开
- 物理模拟一句 `Graph(elem).graphData(data)` 就跑起来
- 事件 / 相机 / 标签 / 粒子都是配置项，链式 API 调

## 核心要点

整个库的心智模型是 **"装配一个会自己动的 3D 网络"**，三步：

1. **数据**：给一份 `{nodes: [...], links: [...]}`，节点要有 `id`，连线要有 `source` 和 `target`
2. **装配**：选个 `<div>` 容器，调 `ForceGraph3D()(elem)` 拿到图实例，再链式调 `.graphData(data).nodeColor(...).linkWidth(...)`
3. **物理跑起来**：库自动启动 d3-force-3d 模拟，每帧重算位置、重画 three.js 场景，直到能量耗尽稳定下来

关键能力清单：

- **节点可定制**：默认是小球，也能换成自定义 three.js 几何体 / 贴图 / HTML 标签
- **边可定制**：宽度、颜色、曲率、虚线，还能加 **directional particles**（粒子顺着边流，肉眼看出方向）
- **DAG 模式**：传 `dagMode: 'td'`（top-down）能把图按层级排，适合树和依赖图
- **相机 API**：`zoomToFit()` 一键拉到全图可见，`cameraPosition()` 飞到某节点正面
- **事件**：`onNodeClick` / `onNodeHover` / `onNodeDrag`，鼠标行为都有钩子

## 实践案例

### 案例 1：30 行画一个会动的网络

```html
<div id="graph"></div>
<script src="//unpkg.com/3d-force-graph"></script>
<script>
  const data = {
    nodes: [{id: 'A'}, {id: 'B'}, {id: 'C'}, {id: 'D'}],
    links: [
      {source: 'A', target: 'B'},
      {source: 'B', target: 'C'},
      {source: 'C', target: 'D'},
      {source: 'D', target: 'A'}
    ]
  };
  ForceGraph3D()
    (document.getElementById('graph'))
    .graphData(data)
    .nodeAutoColorBy('id')
    .linkDirectionalParticles(2);
</script>
```

打开页面，4 个彩色小球自己排成一个四边形，边上有粒子在流。**全程没写一行 three.js 或物理代码**。

### 案例 2：知识图谱风格——HTML 标签节点

把节点换成带文字的 HTML 卡片，做成 Obsidian 那种双链笔记可视化：

```js
import {CSS2DRenderer, CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';

ForceGraph3D({extraRenderers: [new CSS2DRenderer()]})
  (elem)
  .graphData(data)
  .nodeThreeObject(node => {
    const div = document.createElement('div');
    div.textContent = node.title;
    div.className = 'node-label';
    return new CSS2DObject(div);
  })
  .nodeThreeObjectExtend(true);
```

这里 `nodeThreeObjectExtend(true)` 表示"在默认小球之上**叠**一个标签"，而不是替换。

### 案例 3：依赖图用 DAG 模式分层

npm 包依赖天然是有向无环图，开 DAG 模式更清楚：

```js
ForceGraph3D()
  (elem)
  .graphData(npmDeps)
  .dagMode('radialout')   // 中心向外辐射，根包在中央
  .dagLevelDistance(80)
  .nodeLabel('id');
```

`radialout` 还有几个兄弟：`td`（top-down）/`bu`（bottom-up）/`lr`（左右）/`rl`（右左）。

## 踩过的坑

1. **看不到东西，黑屏**：默认相机距离原点 200，节点也在原点附近，**完全重叠**。第一帧画完调一次 `graph.zoomToFit(400)` 才能看到。

2. **节点 > 5000 帧率掉到 10fps**：粒子 + 高质量节点开太多，关 `linkDirectionalParticles` 或把节点降级成 `nodeRelSize(2)` 的小点。

3. **WebGL 上下文一个 tab 最多 16 个**：同时挂 16+ 个图实例会"context lost"，老的图变白屏。解决方法是用单实例 + 切数据，或销毁不可见的实例。

4. **VR 模式要求安全来源**：`3d-force-graph-vr` 走 WebXR，浏览器要求 secure context。`localhost` 通常可以开发调试；手机或头显访问开发机 IP 时，普通 HTTP 不行，得用 mkcert / ngrok 提供 HTTPS。

5. **数据要"引用同一对象"才认得**：`links` 里的 `source` 和 `target` 第一次传是字符串 ID，库会**就地把它替换成节点对象**。下一次更新数据如果你又传字符串，库以为是新节点，整个图重排。建议用 `graphData(data)` 后操作返回的 `data.nodes`。

## 适用 vs 不适用

**适用**：

- 节点数在 100 到 3000 之间的网络，3D 拉开维度看结构
- 想要"漂亮、能转、能点"的可视化（产品 demo / 数据故事 / 知识图谱）
- 已经在用 React → 直接上 `react-force-graph`

**不适用**：

- 节点 > 5000 的大图——上 sigma.js 或 cosmograph（GPU 加速）
- 严格图论分析（最短路 / 社区检测） → 用 cytoscape.js
- 移动端低端机——WebGL 跑物理模拟挺重，老安卓会卡

## 历史小故事（可跳过）

- **2011 年前后**：d3-force 把力导向布局做成前端常用工具，网络图开始能直接在浏览器里跑。
- **2013-2015 年**：three.js 和 WebGL 生态成熟，普通网页也能承载 3D 场景、相机和材质。
- **2016 年后**：Vasco Asturiano 把 force-graph 系列拆成 2D、3D、VR、AR 和 React 绑定，统一成相近的链式 API。
- **今天**：3d-force-graph 常被用来做知识图谱、依赖关系和安全拓扑 demo，重点不是严肃分析，而是让复杂关系先“看得见”。

## 学到什么

1. **物理模拟 + WebGL 渲染** 是一对天然搭子：模拟算位置，渲染照位置画，每帧循环一次
2. **链式配置 API** 在可视化库里非常常见（d3 / chart.js / 3d-force-graph 都是），适合"声明式装配"
3. **从 2D 到 3D 不只是加一个轴**——交互（鼠标转视角）/ 性能（多 6 倍三角形）/ 调试（找不到节点）都是新麻烦
4. **同一作者的家族库**（force-graph 2D / 3D / VR / AR / React）共享 API，学一个会一片

## 延伸阅读

- 仓库与示例画廊：[vasturiano/3d-force-graph](https://github.com/vasturiano/3d-force-graph)（example/ 目录有 30+ 个可跑 demo）
- React 绑定：[react-force-graph](https://github.com/vasturiano/react-force-graph)
- 物理引擎：[d3-force-3d](https://github.com/vasturiano/d3-force-3d)
- [[three-js]] —— WebGL 渲染基石
- [[d3]] —— 力导向布局算法的来源

## 关联

- [[three-js]] —— 提供渲染层，3d-force-graph 把它包成"画图就一行"
- [[d3]] —— 力导向布局来自 d3-force，搬到 3D 后是 d3-force-3d
- [[graphology]] —— 纯数据结构层的图库，可与 3d-force-graph 配合（前者算，后者画）
- [[cytoscape]] —— 同领域偏分析的替代方案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[antv-g6]] —— AntV G6 — 把"关系数据"画成会自己摆位置的图
- [[antv-x6]] —— AntV X6 — 把 mxGraph 的图编辑思路搬到 TypeScript
- [[react-flow]] —— React Flow / xyflow — 节点编辑器框架
- [[tldraw]] —— tldraw — 把白板做成可嵌入的 SDK
