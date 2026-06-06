---
title: AntV X6 — 把 mxGraph 的图编辑思路搬到 TypeScript
来源: 'AntV 团队（蚂蚁集团）官网与仓库, https://x6.antv.antgroup.com/ + https://github.com/antvis/X6'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 中级
provenance: pipeline-v3
---

## 是什么

AntV X6 是一个**专门用来"做图编辑器"的引擎**——给你画布、节点、连线、拖拽、撤销、对齐、缩略图这些零件，你拼出一个 BPMN 流程编辑器、DAG 调度编辑器、ER 数据库设计器或思维导图。日常类比：X6 不是一张画好的画，而是一套乐高底板和零件——它假设你会让用户**自己拖、自己连、自己改**。

写一个最小例子大致是：

```ts
import { Graph } from '@antv/x6'
const graph = new Graph({ container: document.getElementById('app')!, grid: true })
const a = graph.addNode({ x: 40, y: 40, width: 80, height: 40, label: 'A' })
const b = graph.addNode({ x: 200, y: 40, width: 80, height: 40, label: 'B' })
graph.addEdge({ source: a, target: b })
```

它和兄弟项目 [[antv-g6]] 的分工很清楚：**G6 看图**（给你数据，库帮你布局展示），**X6 编辑图**（给你画布，让最终用户自己摆）。同一家族但服务两类完全不同的需求。

## 为什么重要

不理解 X6 的定位，下面这些事都没法解释：

- 为什么国内做工作流 / 数据建模 / 流程审批这类内部系统时，X6 几乎是默认选项——它把"可编辑的图"这件事的脏活全收掉了
- 为什么有了 [[antv-g6]] 还要 X6——G6 的布局算法和"用户拖动连线"是两套问题，硬拼会把两个库都拖肿
- 为什么 X6 长期被叫做 "**JS 版 mxGraph**"——它公开承认参考了 mxGraph（Draw.io 的底座）的心智模型，但用现代 TypeScript 重写并以 MIT 开源
- 为什么 React Flow 火但 X6 在国内仍有空间——React Flow 绑死 React，X6 框架无关，Vue / Angular / 原生 JS 都能用

## 核心要点

X6 的心智模型是 **"画布 + 单元 + 插件"**。记住六个抽象就够入门：

1. **Graph（画布实例）**：挂到 DOM 上的根。所有操作都通过它的方法走。

2. **Cell（单元）**：节点（Node）和边（Edge）的共同祖先。所有可见对象都是 Cell，状态、事件、序列化都统一在这一层。

3. **Shape（形状）**：内置 rect / circle / ellipse / polygon / image，自定义可走 SVG / HTML / React 组件 / Vue 组件四条路（`@antv/x6-react-shape` / `@antv/x6-vue-shape`）。把"业务组件长什么样"和"画布怎么管它"解耦。

4. **Port（连接桩）**：节点边缘的小圆点，决定边从哪里进、从哪里出。BPMN 框上下左右四个桩、ER 表头一个出桩多个入桩，这些细节都在 port 层配。

5. **Connector + Router（边的形状与走线）**：connector 控制视觉（直线 normal / 平滑 smooth / 圆角 rounded / 跳线 jumpover），router 控制路径（正交 orth / 曼哈顿 manhattan / 地铁 metro / 单边 oneSide）。两层正交。

6. **Plugin（插件）**：v2 把可选能力全部抽出主仓库，独立 npm 包按需装。常用 `@antv/x6-plugin-snapline`（对齐线）/ `-history`（撤销重做）/ `-selection`（框选与多选）/ `-minimap`（缩略图）/ `-clipboard`（剪贴板）/ `-keyboard`（快捷键）/ `-stencil`（左侧拖拽面板）/ `-transform`（缩放/旋转手柄）。

底层渲染走 SVG（这点和 [[antv-g6]] v5 走 @antv/g 多 driver 不同），换来更精细的可交互性，代价是节点数 >3000 会肉眼卡。

## 实践案例

### 案例 1：拖拽 + 撤销 + 对齐线，三件套搭出"像样的编辑器"

```ts
import { Graph } from '@antv/x6'
import { Snapline } from '@antv/x6-plugin-snapline'
import { History } from '@antv/x6-plugin-history'
import { Selection } from '@antv/x6-plugin-selection'

const graph = new Graph({ container, grid: true, panning: true, mousewheel: true })
graph.use(new Snapline({ enabled: true }))
graph.use(new History({ enabled: true }))
graph.use(new Selection({ enabled: true, rubberband: true }))

document.getElementById('undo')!.onclick = () => graph.undo()
```

四个插件加几行配置，编辑器最常用的"拖、对齐、撤销、框选"就齐了。这一段是 80% 流程编辑器 demo 的骨架。

### 案例 2：自定义 React 节点（把业务组件画到画布）

```tsx
import { register } from '@antv/x6-react-shape'

const TaskCard = ({ node }) => {
  const { name, status } = node.getData()
  return <div className={`card status-${status}`}>{name}</div>
}
register({ shape: 'task-card', component: TaskCard, width: 160, height: 60 })

graph.addNode({ shape: 'task-card', x: 40, y: 40, data: { name: '审批', status: 'doing' } })
```

注册一次，全画布都能用。React 状态、CSS、事件正常工作，X6 只负责把这块 DOM 摆到画布坐标系里。Vue 走 `@antv/x6-vue-shape`，模式一样。

### 案例 3：BPMN 风的端口 + 正交连线

```ts
graph.addNode({
  shape: 'rect', x: 40, y: 40, width: 100, height: 40, label: 'Start',
  ports: { groups: { in: { position: 'left' }, out: { position: 'right' } },
           items: [{ id: 'i', group: 'in' }, { id: 'o', group: 'out' }] },
})
graph.addEdge({ source: { cell: 'A', port: 'o' }, target: { cell: 'B', port: 'i' },
                connector: 'rounded', router: 'manhattan' })
```

port + manhattan 走线，画出来就是 BPMN / DAG 的标准观感——边从端口出，走直角，避开节点。

## 踩过的坑

1. **v1 教程在 v2 跑不动**：v2（2022）把功能彻底插件化，原本写在主包的 keyboard / clipboard / history 全抽到独立 npm 包。搜中文博客时间在 2022 之前的，import 路径基本要照着官方迁移指南手翻。

2. **destroy 不调浏览器吃内存**：X6 内部跑 RAF 和 DOM 事件监听，组件卸载不调 `graph.dispose()` 就泄漏。和 [[antv-g6]] / ECharts 同一类坑。

3. **节点 >3000 SVG 卡**：SVG DOM 节点数线性堆，3000+ 拖拽明显掉帧。要么虚拟滚动（只挂可视区），要么这个体量直接换 [[antv-g6]] 走 WebGL。

4. **Stencil 拖到画布坐标错位**：stencil 插件的拖拽落点经常受外层 `transform: scale` 或自定义滚动容器影响，结果节点掉到屏幕外。修法是给 stencil 配 `target: graph` 并手动校正 `localToGraph` 转换，或者把 stencil 容器和画布容器放同一坐标系祖先下。

5. **history 默认不记 attr 变更**：撤销时只回滚位置 / 添加 / 删除，节点颜色 / label 改了不被记录。要改样式也能撤销，需要在 history 插件里把对应的 attr 路径加白名单。

6. **TypeScript 类型对插件配置覆盖不全**：复杂 stencil / minimap 的 options 类型经常推不出，只能 `as any` 绕过去。等社区补完。

## 适用 vs 不适用场景

**适用**：

- BPMN / 工作流 / 流程审批编辑器（端口 + 正交连线 + 撤销是日常组合）
- DAG 调度编辑器（DolphinScheduler / Airflow 替代 UI 国内常用 X6）
- ER 数据库设计器（表头一个出桩、多列入桩，自定义 React 节点画字段列表）
- 思维导图 / 组织架构（虽然 G6 也能做，但需要"用户自己改结构"时 X6 更顺）
- 框架无关需求（Vue 项目 / 多框架混合 / 老旧 jQuery 系统接图编辑）

**不适用**：

- 节点 1w+ 的超大图 → SVG 撑不住，换 [[antv-g6]] WebGL 路线
- 只看不改的图（知识图谱探索 / 网络拓扑展示）→ [[antv-g6]] 内置布局丰富
- React Only 项目且对 hook 风格强需求 → React Flow 的开发体验更顺
- 需要 3D 视角 → [[3d-force-graph]] 走 three.js
- 通用 BI 图表（柱 / 折 / 饼）→ [[antv-g2]] / [[echarts]]，X6 不是图表库

## 历史小故事（可跳过）

- **2020**：X6 1.0 开源，定位补 G6 不能做的"可编辑场景"。当时国内做流程编辑器主流要么自己用 SVG 拼，要么硬上 mxGraph。
- **2021**：v1.x 持续迭代加端口、router、stencil。这一阶段功能堆主仓库，包体偏大。
- **2022**：v2 GA，全面 TypeScript 重写、API 收敛、插件抽离主仓库。这是一次彻底的 breaking change，等于重新做一个库——和 [[antv-g6]] v5 同期重写一脉相承。
- **2023-2024**：插件生态稳定，企业内部系统大规模采用。React Flow 在国外火，X6 在国内站稳工作流编辑器底座。
- **2025-2026**：进入维护期，重点在 React/Vue 节点的渲染性能、Stencil 的拖拽体验改进，以及与 [[antv-g6]] 共享底层渲染层的探索。

## 学到什么

1. **"看图" vs "编辑图" 是两个完全不同的库的设计点**：布局算法 vs 拖拽 / 端口 / 撤销，硬合一起会让两个用例都难用。AntV 把 G6 / X6 拆开是正确选择。
2. **mxGraph 思路移植到 JS 还有空间**：mxGraph（Draw.io 底座）协议陈旧、代码风格老。X6 用现代 TS + MIT 重做，证明这条赛道仍未被吃透。
3. **插件化是 v2 的关键决定**：v1 把所有能力塞主包，bundle 爆且配置爆。v2 抽成独立 npm 包，按需引入——这套思路和 [[antv-g6]] 把布局拆独立包一致。
4. **框架无关是国内开源的优势**：React Flow 在国外火但绑 React。X6 框架无关 + 提供 React/Vue shape 适配，让 Vue 占比仍高的国内市场有自己的选择。
5. **AntV 全家桶的复利**：[[antv-g2]] / [[antv-g6]] / X6 / L7 / F2 共用视觉规范和底层 G 渲染层，整套用下来心智一致。组件家族做生态的标准范式。

## 延伸阅读

- 官方文档：[x6.antv.antgroup.com](https://x6.antv.antgroup.com/)（v2 中英文齐全）
- 仓库 README：[github.com/antvis/X6](https://github.com/antvis/X6)
- 实战教程：[X6 教程合集 — AntV 官网](https://x6.antv.antgroup.com/tutorial/about)（从零搭流程编辑器）
- 灵感来源：[mxGraph / Draw.io](https://github.com/jgraph/mxgraph)（X6 心智模型的源头，已停更但可对照）
- AntV 总站：[antv.antgroup.com](https://antv.antgroup.com/)（G2 / G6 / X6 / L7 / F2 全家桶）

## 关联

- [[antv-g6]] —— 同 AntV 家族，"看图"路线，X6 的兄弟（编辑 vs 展示）
- [[antv-g2]] —— 同 AntV 家族，BI 图表路线
- [[d3]] —— SVG 数据驱动祖师，X6 内部很多 DOM 操作思路与 d3-selection 类似
- [[echarts]] —— graph series 是轻量替代，但不可编辑
- [[3d-force-graph]] —— 3D 视角的图可视化路线
