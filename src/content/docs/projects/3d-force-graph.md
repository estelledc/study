---
title: 3d-force-graph — 把网络拓扑搬进三维空间
来源: https://github.com/vasturiano/3d-force-graph
日期: 2026-06-01
分类: 数据可视化
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vasturiano/3d-force-graph
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 957c1831157416e88ea9faf8e6a4edfe7b545858
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.80.0
---

## 是什么

**3d-force-graph** 是一个浏览器 UI 组件：你给 `{nodes, links}`，它用 Three.js 画 3D 网络，并把力模拟交给内层 `three-forcegraph`。日常类比：本包是控制室——只管相机、灯光、指针和每帧调度；真正摆节点、算力的是另一间机房。

```js
import ForceGraph3D from '3d-force-graph'

const graph = new ForceGraph3D(document.getElementById('graph'))
  .graphData({
    nodes: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }],
    links: [{ source: 'A', target: 'B' }]
  })
```

固定 `1.80.0` 是 MIT、Kapsule 链式 API。`package.json` 要求运行时 `three` 为 `>=0.179 <1`；布局引擎版本写的是 `three-forcegraph@1`，本轮只读了本仓，没有打开该依赖源码。

## 为什么重要

不按固定源码读它，下面这些事会对不上：

- 为什么 `new ForceGraph3D(elem)` 之后还能链式 `.graphData()` / `.dagMode()`——属性被 `kapsule-link` 转发
- 为什么第一帧相机 Z 不是常数 200，而是 `Math.cbrt(节点数) * 170`
- 为什么拖节点在 `forceEngine: 'ngraph'` 时不会安装 `DragControls`
- 为什么 HTML 标签节点要在构造时传入 `extraRenderers`，而不是事后 `.nodeThreeObject()` 就自动有 CSS 渲染器

## 核心要点

固定版本是两层壳：

1. **ThreeForceGraph**：`graphData`、`dagMode`、`nodeThreeObject`、`linkDirectionalParticles`、`forceEngine` 都经 `linkKapsule('forceGraph', ThreeForceGraph)` 转发。本仓不实现力公式。
2. **ThreeRenderObjects**：负责宽高、背景、nav info、指针交互、`cameraPosition`、`lights`、`postProcessingComposer`。默认灯是 `AmbientLight(0xcccccc, Math.PI)` 加 `DirectionalLight(0xffffff, 0.6 * Math.PI)`。
3. **动画循环**：`_animationCycle` 每帧调用 `forceGraph.tickFrame()` 再 `renderObjs.tick()`，然后 `requestAnimationFrame`。`pauseAnimation` 取消 rAF；`resumeAnimation` 只在 id 为 `null` 时重启。
4. **相机默认值**：`onUpdate` 里若相机仍在 `(0,0,lastSetCameraZ)` 且已有节点，就把 `z` 设为 `Math.cbrt(nodes.length) * 170`（常量 `CAMERA_DISTANCE2NODES_FACTOR`）。`zoomToFit(ms, padding, nodeFilter)` 用 `getGraphBbox` + `fitToBbox`，不是改那个 170 公式。

## 实践示例

### 案例 1：构造 + 链式数据

README 的脚本标签入口是 `cdn.jsdelivr.net/npm/3d-force-graph`。构造函数签名是 `new ForceGraph3D(domElement, { controlType, rendererConfig, extraRenderers })`。`controlType` 默认 `trackball`，也可 `orbit` / `fly`。`nodeId` 默认 `'id'`，`nodeLabel` 默认 `'name'`——只有 `id`、没有 `name` 时标签不会按 id 自动出现。

```js
new ForceGraph3D(document.getElementById('graph'))
  .graphData(data)
  .nodeAutoColorBy('id')
  .linkDirectionalParticles(2)
  .nodeLabel('id')
```

### 案例 2：第二渲染器叠 HTML

`extraRenderers` 的类型是 `Renderer[]`。要把 CSS2D / CSS3D 对象画出来，必须在 **构造期** 传入对应 renderer；只设 `nodeThreeObject` 不会自动加第二渲染器。`nodeThreeObjectExtend(true)` 表示在默认节点网格上叠加，而不是替换——该属性同样转发给 `three-forcegraph`。

### 案例 3：DAG 约束与销毁

```js
graph.dagMode('radialout').dagLevelDistance(80)
graph.zoomToFit(400)
graph._destructor()
```

`dagMode` 只对无环图有定义：`td` / `bu` / `lr` / `rl` / `zout` / `zin` / `radialout` / `radialin`。`_destructor` 会停动画、把数据清空成 `{nodes:[],links:[]}`，并调用两层内对象的析构。节点拖拽还要求 `enableNodeDrag && enablePointerInteraction && forceEngine === 'd3'`；换 ngraph 后这段 `DragControls` 根本不会安装。

## 踩过的坑

1. **把默认相机写成“距离原点 200”**：固定源码是 `cbrt(n) * 170`，且只在相机未被用户改过时重设。
2. **用 `ForceGraph3D()(elem)` 当唯一写法**：README / `index.d.ts` 写的是 `new ForceGraph3D(elem)`。Kapsule 工厂调用可能仍能跑，但本文按类型声明绑定构造函数。
3. **以为本包会复制一份图数据**：`onUpdate` 只做 `state.graphData = forceGraph.graphData()`。链接里 source/target 是否被改成节点对象，属于 `three-forcegraph`，本轮未打开。
4. **给 ngraph 引擎开拖拽**：源码明确“Can't access node positions programmatically in ngraph”。
5. **把 README 的 ~4k 元素示例或未测 fps 写成容量保证**：本轮没有跑 example，也没有测 WebGL 上下文上限。

## 适用 vs 不适用场景

**适用**：

- 需要在浏览器里快速看 `{nodes, links}` 的 3D 力导向草图
- 接受把布局细节交给 `three-forcegraph`，本包只调相机与指针
- 要用 `extraRenderers` 叠 HTML / CSS3D 标签，而不是重写整个 renderer

**不适用**：

- 需要本包内独立实现社区检测、最短路——它不提供图算法
- 必须用 ngraph 还想拖节点
- 把未绑定的节点规模、帧率或“比 2D 少交叉”写成结论
- 要 VR/AR 发行版：那是独立仓库 `3d-force-graph-vr` / `-ar`，不在本 revision

## 固定版本边界

- 本文绑定 `vasturiano/3d-force-graph@957c1831157416e88ea9faf8e6a4edfe7b545858`，包版本 `1.80.0`。tag 与 npm `gitHead` 一致。
- 未打开 `three-forcegraph` / `three-render-objects` / `d3-force-3d` 源码；力公式、ID 解析和 mesh 实现以那些仓库的固定 revision 为准。
- 未安装依赖、未创建 WebGL 上下文、未跑 example，状态保持 `UNVERIFIED`。

## 学到什么

1. **这个 npm 包是编排层**：图对象与 renderer 是两个 kapsule 子实例。
2. **默认相机距离随节点数立方根变化**，不是常量。
3. **拖拽、指针、导航是三扇独立开关**，拖拽还被锁在 d3 引擎。
4. **第二渲染器必须构造期注入**，不能靠事后改 `nodeThreeObject` 补齐。

## 应用型自测

1. 4 个节点、相机未被拖过时，默认 `camera.position.z` 是 200 吗？
2. `forceEngine('ngraph')` 之后还默认能拖节点吗？
3. `nodeLabel` 在不传参时读节点的 `id` 还是 `name`？

检查点：

1. 不是。公式是 `Math.cbrt(4) * 170`。
2. 不能。`DragControls` 只在 `forceEngine === 'd3'` 时安装。
3. 默认 `'name'`。只有 `id` 字段时要显式 `.nodeLabel('id')`。

## 延伸阅读

- 固定源码：[vasturiano/3d-force-graph](https://github.com/vasturiano/3d-force-graph) —— 本文绑定提交 `957c1831157416e88ea9faf8e6a4edfe7b545858`
- 布局依赖（未绑定）：[three-forcegraph](https://github.com/vasturiano/three-forcegraph)
- 2D / VR / React 是独立仓库，不能把本页 API 直接外推
- [[threejs]] —— WebGL 渲染基石；本包要求 `three >= 0.179 < 1`
- [[d3]] —— d3-force 家族是默认 `forceEngine` 的上游思路，不是本仓源码

## 关联

- [[threejs]] —— renderer / camera / lights 的底层对象
- [[d3]] —— 默认力引擎路线的概念来源
- [[graphology]] —— 纯图数据与算法，可在本包之外算完再交给 `graphData`
- [[cytoscape-js]] —— 偏分析的 2D 图可视化，不是本包的 3D 壳

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[antv-g6]] —— AntV G6 — 把"关系数据"画成会自己摆位置的图
- [[antv-x6]] —— AntV X6 — 把 mxGraph 的图编辑思路搬到 TypeScript
- [[react-flow]] —— React Flow / xyflow — 节点编辑器框架
- [[tldraw]] —— tldraw — 把白板做成可嵌入的 SDK
