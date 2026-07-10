---
title: AntV G6 — 把"关系数据"画成会自己摆位置的图
来源: 'AntV 团队（蚂蚁集团）官网与仓库, https://g6.antv.antgroup.com/ + https://github.com/antvis/G6'
日期: 2026-06-01
分类: projects / 数据可视化
难度: 中级
---

## 是什么

AntV G6 是一个**专门画"图论结构"的可视化引擎**——节点（圆/方/图标）+ 边（直线/曲线/折线）+ 组（把若干节点框起来）。你不告诉它每个节点画在哪里，而是告诉它"用 force 力导向布局"或"用 dagre 分层布局"，库自己算坐标。日常类比：把一堆带线相连的小球丢进玻璃缸，让物理规则把它们自动摆成一张读得懂的图。

G6 里的 G 可以先记成 graph：它在 AntV 家族里专攻一件事——**关系数据**。普通图表（柱/折/饼）走兄弟项目 [[antv-g2]]，金融行情走 F2，地理走 L7，整个 AntV 全家桶各管一摊。

写一个最小例子大致是：

```js
import { Graph } from '@antv/g6'
const graph = new Graph({
  container: 'app',
  data: { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }] },
  layout: { type: 'force' },
  behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
})
graph.render()
```

## 为什么重要

不理解 G6 的设计，下面这些事没法解释：

- 为什么国内知识图谱 / 反欺诈 / 资金流向 / 组织架构这类项目第一选项常是它——内置 30+ 布局直接用，不必手搓
- 为什么 G6 和 [[cytoscape-js]] / [[sigma-js]] 长期共存——三者站在不同取舍点（生态完整 vs 跨语言 vs 极致性能）
- 为什么 v5（2024）相对 v4 是大重写——AntV 整体倒向 TS + 配置项 + 插件化，老用户基本要重学
- 为什么"图可视化"和"BI 图表"分两个库——节点-边的布局算法、Combo 嵌套、行为系统都是图特有的

## 核心要点

G6 v5 的心智模型是 **"配一个 Graph 实例，告诉它数据 + 布局 + 行为 + 插件，剩下交给库"**。五个抽象：

1. **数据（data）**：`{ nodes, edges, combos }` 三个数组。节点必须有 `id`，边必须有 `source` / `target`（指向 id），combo 是把节点框起来的"组"——这是 G6 比通用图库多出来的一层，专门服务知识图谱和组织架构。

2. **layout（布局）**：把抽象数据变成 x/y 坐标。内置 30+ 种：力导向系（force / d3-force / forceAtlas2 / fruchterman）、分层系（dagre / antv-dagre）、树系（compact-box / mindmap / dendrogram / indented）、环形系（circular / concentric / radial）、网格 / comboCombined。每种是独立 npm 包，按需安装。

3. **behaviors（行为）**：一组订阅事件的对象，组合而非继承。常用 `drag-canvas`（平移画布）/ `zoom-canvas`（滚轮缩放）/ `drag-element`（拖节点）/ `click-select` / `brush-select`（框选）/ `hover-activate`（悬浮高亮）/ `collapse-expand`（折叠展开）。要哪个塞进数组就行。

4. **plugins（插件）**：minimap（缩略图）/ toolbar / tooltip / legend / grid / contextmenu / fullscreen / edge-bundling（边捆绑） / fisheye（鱼眼放大） / timebar（时间轴）。和 behavior 的区别：plugin 通常带 UI，behavior 只改交互逻辑。

5. **renderer（渲染器）**：底层走 [@antv/g](https://g.antv.antgroup.com/)，对上抽象出 Canvas / SVG / WebGL 三种 driver。同一份配置切 driver 就能换渲染后端，大图切 WebGL，需要矢量导出切 SVG。

记住这五层，剩下的是查文档。

## 实践案例

### 案例 1：力导向 + 拖拽 + 缩放，画一张关系图

```js
const graph = new Graph({
  container: 'mount',
  data,
  layout: { type: 'force', linkDistance: 100, nodeStrength: -50 },
  node: { style: { size: 24, labelText: (d) => d.name } },
  edge: { style: { stroke: '#999', endArrow: true } },
  behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element', 'hover-activate'],
})
await graph.render()
```

`linkDistance` 控制边长，`nodeStrength` 负数表示节点互相排斥（数值越小排得越远）。这一段就是 90% 知识图谱 demo 的骨架。

### 案例 2：Combo 把节点分组，做组织架构

```js
const data = {
  nodes: [
    { id: 'alice', combo: 'eng' },
    { id: 'bob', combo: 'eng' },
    { id: 'carol', combo: 'design' },
  ],
  combos: [{ id: 'eng', label: '工程组' }, { id: 'design', label: '设计组' }],
  edges: [{ source: 'alice', target: 'bob' }],
}
const graph = new Graph({ container, data, layout: { type: 'comboCombined' } })
```

Combo 是 G6 的招牌——节点可以归到组、组可嵌套组、组能整体折叠成一个大节点。Cytoscape.js 用 parent 字段也能做，但布局算法不专为 combo 设计，效果不如 G6。

### 案例 3：和 React 集成（用 Graphin）

```jsx
import Graphin from '@antv/graphin'
export function RelGraph({ data }) {
  return <Graphin data={data} layout={{ type: 'dagre' }} style={{ height: 600 }} />
}
```

[Graphin](https://graphin.antv.antgroup.com/) 是 G6 的 React 包装，把生命周期、resize、热更新都收掉。直接用 G6 也行（`useEffect` 里 `new Graph` + 卸载时 `graph.destroy`），就是要自己写胶水。

## 踩过的坑

1. **v4 教程在 v5 跑不动**：v4 用 `new G6.Graph({ ... modes: { default: ['drag-canvas'] } })`，v5 改成 `behaviors: ['drag-canvas']`。modes / 状态机 / 旧布局命名全废。搜中文博客时间在 2024 之前的，基本要照着官方迁移指南手翻。

2. **数据更新不能改引用**：直接 `data.nodes.push(...)` 不会重渲染。必须 `graph.addNodeData([...])` / `graph.updateData(newData)`。和 React 一样，库通过方法调用感知变更。

3. **布局收敛要时间**：`force` 用迭代算法，5000 节点常跑 1-2 秒。卡顿明显时切 `d3-force`（更快但参数语义略不同），或者预计算坐标存进数据库，加载时 `layout: { type: 'preset' }` 跳过算。

4. **Combo 嵌套深时拖动卡**：每拖一下默认会触发 layout 局部重算。深嵌套（>3 层）时关掉 `enableAdjustPosition` 或换静态布局。

5. **destroy 不调浏览器吃内存**：G6 内部跑 RAF 动画循环（layout tick + 渲染），组件卸载不调 `graph.destroy()` 就泄漏。和 ECharts / G2 同一类坑。

6. **TS 类型对 plugin 配置覆盖不全**：复杂插件（timebar / edge-bundling）的 options 类型经常推不出，只能 `as any`。等社区补完。

## 适用 vs 不适用场景

**适用**：

- 知识图谱可视化（实体-关系网络，有 Combo 加分）
- 金融反欺诈 / 资金流向图（节点几百到几千，行为丰富）
- 组织架构图 / 族谱 / mindmap（树布局齐全）
- 微服务依赖 / 网络拓扑（dagre 分层布局直接出效果）
- 中文团队对中文文档/社区有要求——AntV 文档质量国内开源里第一梯队

**不适用**：

- 节点 10w+ 的超大图 → [[sigma-js]] WebGL 原生更快
- 跨语言（Python/R 同款图）→ [[cytoscape-js]] 的 cytoscape.js JSON 是行业通用
- 通用 BI 图表（柱/折/饼）→ [[antv-g2]] / [[echarts]]，G6 只画图论结构
- 简单 2D 力导向 + React 一行集成 → react-force-graph 更轻
- 需要 3D 视角 → [[3d-force-graph]] 走 three.js 路线

## 历史小故事（可跳过）

- **2017**：AntV 团队开源 G6 1.0，定位补 G2 不能画的关系图。当时国内画关系图主流是 ECharts 的 graph series 或自己用 D3 力导向。
- **2018-2021**：v2 / v3 / v4 迭代，逐步加 Combo / 树布局 / 行为系统 / TypeScript 重构。v3 引入 modes 状态机，v4 把 Combo 做厚。
- **2023**：v5 alpha，全面 TS 重写、API 收敛、底层换 @antv/g。这是一次彻底的 breaking change，等于重新做一个库。
- **2024**：v5 GA。Graphin 同步升级；社区 demo 重新写了一遍。
- **2025-2026**：进入维护期，重点在性能（WebGL 渲染路径）和大图布局（百万级节点的增量布局算法）。

## 学到什么

1. **图可视化 ≠ 图表可视化**：节点-边 + 布局算法 + Combo + 行为系统是图特有的栈，硬塞进通用图表库会很别扭。这就是为什么 AntV 全家桶把 G6 单独拆出来。
2. **布局系统插件化是好设计**：30+ 布局每个独立 npm 包，按需安装。否则首屏要把所有算法都打包进来，bundle 直接爆。
3. **行为系统的 ECS 思路**：每个 behavior 是订阅事件的小对象，组合到 `behaviors` 数组里。要新行为不动核心代码，写一个新 class 注册进去就行。这套思路在游戏引擎里叫 ECS（实体-组件-系统）。
4. **重写 v5 的勇气**：从状态机模式转配置项 + 插件化等于让所有老用户重学。但这是为了 TS 友好和长期清爽，重写换长期可维护是值得的——和 [[antv-g2]] v5 同一时期重写一脉相承。
5. **国内开源生态的样本**：G6 / G2 / X6 / L7 / F2 共用 AntV 视觉规范和底层 G 渲染层，整套用下来心智一致。这是组件家族做生态的复利。

## 延伸阅读

- 官方文档：[g6.antv.antgroup.com](https://g6.antv.antgroup.com/)（v5 中英文齐全）
- 仓库 README：[github.com/antvis/G6](https://github.com/antvis/G6)
- React 包装：[graphin.antv.antgroup.com](https://graphin.antv.antgroup.com/)
- AntV 总站：[antv.antgroup.com](https://antv.antgroup.com/)（G2 / G6 / X6 / L7 / F2 全家桶）
- 底层渲染：[g.antv.antgroup.com](https://g.antv.antgroup.com/)（@antv/g 抽象层）

## 关联

- [[antv-g2]] —— 同 AntV 家族，BI 图表路线，G6 的兄弟
- [[cytoscape-js]] —— 跨语言图可视化，cyjs JSON 是行业通用格式
- [[sigma-js]] —— WebGL 原生大图渲染，性能极致路线
- [[3d-force-graph]] —— 3D 力导向，three.js 路线
- [[d3]] —— 力导向算法的源头，G6 部分布局参考 d3-force 实现
- [[echarts]] —— 配置项路线代表，graph series 是 G6 的轻量替代
- [[recharts]] —— React JSX 组件式可视化，另一条路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
