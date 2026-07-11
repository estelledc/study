---
title: vis-network — barnesHut 物理引擎驱动的网络图
来源: 'https://github.com/visjs/vis-network + Barnes & Hut 1986 "A hierarchical O(N log N) force-calculation algorithm" Nature 324'
日期: 2026-06-01
分类: 前端工程
难度: 中级
---

## 是什么

vis-network 是 **Canvas 渲染的网络图库，靠物理引擎自动把节点摆开**。日常类比：你抓一把磁铁随手撒桌上，它们互相排斥、连线像橡皮筋拉着，**最后自己滑到看着不打架的位置**——vis-network 干的就是这件事。

最小用法：

```js
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

const nodes = new DataSet([
  { id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' },
]);
const edges = new DataSet([{ from: 1, to: 2 }, { from: 1, to: 3 }]);

new Network(container, { nodes, edges }, { physics: { solver: 'barnesHut' } });
```

3 个节点 2 条边，库自己算物理、自己画 Canvas、自己挂拖拽和缩放事件。它原本是荷兰 Almende B.V. 的 vis.js 项目里的 Network 子模块，2019 年拆成独立仓库 `visjs/vis-network`，是 vis.js 家族里最稳定、最聚焦的那一个。

## 为什么重要

不理解 vis-network，下面这些事都没法解释：

- 为什么知识图谱、依赖图、社交网络这些"关系数据"画起来要靠物理模拟而不是手动布局——节点位置**没标准答案**
- 为什么力导向能跑得动几千节点：核心是 **barnesHut 把 O(n²) 降到 O(n log n)**，1000 节点直接快 10 倍
- 为什么这类库基本都用 Canvas 不用 SVG：节点频繁重绘时 SVG 的 reflow 开销吃不消
- 为什么 [[d3]] 的 d3-force 强但要自己拼 SVG / Canvas，vis-network 是把 d3-force 这层"高层化"了

## 核心要点

vis-network 的设计可以拆成 **三句话**：

1. **物理引擎自动布局**：每个节点是带电荷的点，边是弹簧。库每帧算一次合力、更新位置，几百帧后系统收敛，节点摆到稳态。这就是力导向布局（force-directed）。

2. **barnesHut 是默认求解器**：暴力两两算斥力是 O(n²)，1000 节点 100 万次计算每帧。barnesHut 用四叉树把"远处一群节点"近似成一个质心，复杂度降到 O(n log n)。这套方法 1986 年 Josh Barnes 和 Piet Hut 发表在 Nature，原本用于星系演化模拟。

3. **Canvas 渲染 + 命令式 DataSet**：节点用 `nodes.add({...})` / `nodes.update({...})` 增删改，不是 React 那种 props 驱动。Canvas 重绘整张图，不存 DOM 节点，所以撑得到 5000+ 节点。

## 实践案例

### 案例 1：调 barnesHut 参数

```js
network.setOptions({
  physics: {
    solver: 'barnesHut',
    barnesHut: {
      gravitationalConstant: -2000,  // 节点间斥力，越负越散
      centralGravity: 0.3,           // 整体往中心拉的力
      springLength: 95,              // 弹簧自然长度
      springConstant: 0.04,          // 弹簧刚度
      damping: 0.09,                 // 阻尼，决定多久停下来
    },
  },
});
```

调参直觉：**图太挤**就把 `gravitationalConstant` 调更负（`-5000`）；**图太散飞出去**就把 `centralGravity` 调大（`0.5`）；**抖太久不停**就把 `damping` 调大（`0.2`）。

### 案例 2：监听稳定化进度

```js
network.on('stabilizationProgress', ({ iterations, total }) => {
  console.log(`物理收敛中 ${iterations}/${total}`);
});
network.on('stabilizationIterationsDone', () => console.log('稳了'));
```

默认 `stabilization.iterations: 1000`——库会**先空跑 1000 帧物理再渲染第一帧**，大图首屏会卡 1-2 秒看着像死机。监听这两个事件给进度条，体感就好很多。也能 `stabilization: { enabled: false }` 直接边跑边显示。

### 案例 3：切换层级布局

```js
const options = {
  layout: {
    hierarchical: {
      enabled: true,
      direction: 'UD',          // 上到下；可选 DU / LR / RL
      sortMethod: 'directed',   // 按边方向排；或 hubsize 按入度
      levelSeparation: 150,
    },
  },
  physics: { solver: 'hierarchicalRepulsion' },
};
```

不是所有图都适合力导向——**有明确层级关系的 DAG**（流程图 / 组织架构 / 任务依赖）用 `hierarchical` 布局更易读。注意 solver 也要换成 `hierarchicalRepulsion`，barnesHut 在层级模式下会把好不容易摆好的层挤乱。

## 踩过的坑

1. **stabilization 阶段空白屏**：默认先跑 1000 帧再画第一帧，大图首屏静默 1-2 秒，新人会以为页面挂了。要么监听 `stabilizationProgress` 给进度条，要么 `stabilization.enabled: false` 边跑边显示（视觉上节点会"飞着归位"，看你接受不接受）。

2. **节点位置每次刷新都微动**：浮点累积误差让稳态后位置仍有亚像素抖动。想要**稳定截图**必须 `network.setOptions({ physics: false })` 冻结，或者 `nodes.update({ id, fixed: true })` 钉住。

3. **Canvas 渲染没法 querySelector 节点**：不像 SVG 能用 CSS 选中调试，只能 `network.getNodeAt({x, y})` 反查 ID，或者 `network.canvasToDOM(...)` 做坐标换算。截图工具、E2E 测试要适配这点。

4. **vis-data 是命令式 API**：`nodes.add / update / remove` 跟 React 的声明式心智不一致。有个 `react-vis-network` 社区包装但更新慢；多数 React 项目要自己写 `useEffect` 同步 props 到 DataSet，写错就内存泄漏。

## 适用 vs 不适用场景

**适用**：

- 节点 10-3000 的关系数据（知识图谱 / 依赖图 / 社交网络）
- 需要开箱即用的拖拽、缩放、悬停高亮
- 教学演示场景，想让物理过程本身被看到（节点弹弹弹"摆好"的过程很直观）
- DAG 类层级图（用 `hierarchical` 模式）

**不适用**：

- 节点 > 5000 → 切 sigma.js（WebGL）或 cosmograph，Canvas 撑不住
- React 项目希望 props 驱动 → 用 react-flow，专为 React 设计
- 需要 3D 网络图 → react-force-graph / three-forcegraph
- 需要内置图算法（PageRank、社区检测、最短路）→ cytoscape.js 学术血统更厚

## 历史小故事（可跳过）

- **2010 年代初**：荷兰研究公司 **Almende B.V.** 开源 vis.js 三件套：Network / Timeline / Graph2d。当时是单仓库，每个组件一个目录。
- **2018-2019**：Almende 缩减开源投入，社区 fork。原仓库拆成多个独立子项目（`vis-network` / `vis-timeline` / `vis-data` 各自 npm 包）。
- **2019 至今**：`visjs` GitHub 组织接管，社区维护。提交节奏放缓但 issue 响应仍在，版本到 9.x。其他子项目（Graph2d / Graph3d）几乎停更，**只有 Network 还活跃**。
- **Barnes-Hut 算法本体**：1986 年发表在 Nature 324，原意是模拟星系演化（10⁶ 颗恒星），后来被 d3-force / vis-network / Gephi / Cytoscape 全部借去做图布局。

## 学到什么

1. **关系数据没有标准布局**——节点位置是优化问题不是配置问题。物理模拟是当前最广泛接受的解法。
2. **算法复杂度直接决定能画多大图**：O(n²) → O(n log n) 这一步，让"几千节点的网络图"从研究问题变成 UI 组件。
3. **Canvas vs SVG 是结构性选择**：Canvas 撑节点数量，SVG 撑可调试性。vis-network 选了前者，付了"没法用 CSS 调试"的代价。
4. **命令式 vs 声明式 API 是另一笔账**：vis-data 的 `add / update / remove` 像 jQuery，跟 React 时代不合，但跟物理引擎的"逐帧推进"心智一致。

## 延伸阅读

- 官方文档：[visjs.github.io/vis-network](https://visjs.github.io/vis-network/docs/network/)（每个 option 都有 sandbox 示例）
- 官方仓库：[github.com/visjs/vis-network](https://github.com/visjs/vis-network)
- physics 详解：[visjs.github.io/vis-network/docs/network/physics.html](https://visjs.github.io/vis-network/docs/network/physics.html)
- Barnes-Hut 原论文：[Barnes & Hut 1986, Nature 324](https://www.nature.com/articles/324446a0)（4 页，密度极高）
- [[d3]] —— vis-network 是 d3-force 这层的高层封装思路对照
- [[react-flow]] —— React 声明式替代方案

## 关联

- [[d3]] —— 底层力学引擎对照，d3-force 要自拼 SVG / Canvas，vis-network 是开箱即用包装
- [[cytoscape-js]] —— 学术向网络可视化，内置 PageRank / 社区检测；vis-network 偏轻量交互
- [[sigma-js]] —— WebGL 路线，万节点起步；vis-network 是 Canvas 几千节点封顶
- [[react-flow]] —— React 节点编辑器，声明式 props 驱动，强项是流程图编辑
- [[visx]] —— 同 vis 字头但完全不同项目（Airbnb 的 React 可视化原语）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bullet]] —— Bullet — C++ 经典 3D 物理引擎与 PyBullet 仿真工具
- [[vis-timeline]] —— vis-timeline — 时间轴 / 日程 / 历史事件三合一组件
