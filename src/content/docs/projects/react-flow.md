---
title: React Flow / xyflow — 节点编辑器框架
来源: "https://github.com/xyflow/xyflow"
日期: 2026-06-01
分类: projects / 前端 / dataviz
难度: 中级
---

## 是什么

React Flow（现归属 **xyflow** 组织，包名 `@xyflow/react`）是一个**给 React 应用做"节点 + 连线"编辑器**的库。日常类比：你见过 Dify、n8n、LangGraph Studio 那种"拖一个方块、拉一根线、连成工作流"的画布——那个画布层就是 React Flow 干的事。

它放弃用 SVG 画节点，而是把每个节点渲染成**绝对定位的 div**，里面塞任意 React 组件（按钮、表单、卡片都行）。连线（edge）才用 SVG。这是它能让节点长得"像一个真正的 UI 组件"的关键。

```tsx
// 最小例子：两个节点 + 一条连线
const nodes = [
  { id: "a", position: { x: 0, y: 0 }, data: { label: "Input" } },
  { id: "b", position: { x: 200, y: 100 }, data: { label: "LLM" } },
];
const edges = [{ id: "a-b", source: "a", target: "b" }];

<ReactFlow nodes={nodes} edges={edges} />
```

## 为什么重要

不理解 React Flow，下面这些事都说不清：

- 为什么 2024 年起很多主流 AI 工作流编辑器（Dify / Flowise / LangGraph Studio）都用同一类画布——底层常见选择就是 React Flow
- 为什么"节点编辑器"这个 UI 模式早年主要在 Nuke、Houdini、Blender、Unreal Blueprints 这类桌面工具里，2023 年后突然在浏览器里遍地开花——React Flow 把门槛打到约 30 行代码
- 为什么 vis-network / cytoscape 这些"图可视化"库不能直接用来做编辑器——它们的节点是数据点，不是 UI 组件
- 为什么团队选这个 MIT 库还能维持得住——`React Flow Pro` 订阅 + 商业咨询养住了核心维护者

## 核心要点

React Flow 的抽象可以拆成 **四层**：

1. **Node**：一个数据对象 `{ id, position, data, type? }`，配一个 React 组件（"自定义节点"）来渲染。`data` 字段你随便塞——它是节点的"业务数据"。

2. **Edge**：连接两个节点的线，`{ id, source, target }`。可以自定义形状（贝塞尔 / 直线 / 阶梯）和路径算法。

3. **Handle**：节点上的"连接点"。一个节点可以有多个 handle（左进右出、或者上中下三个出口）——LLM 工作流里"成功分支 / 失败分支"就是两个 handle。

4. **ReactFlow Provider**：整个画布的根组件，内部用 **Zustand** 管状态，**D3-zoom** 处理缩放平移，所有 hook（`useReactFlow` / `useStore`）都从这里取上下文。

四层加起来，就够你画 99% 的工作流编辑器。

## 实践案例

### 案例 1：Dify 工作流编辑器长什么样

Dify 画布里你看到的 "LLM 节点"、"知识检索节点"、"分支节点"——每一个都是**一个自定义 React 组件**，外面套 React Flow 的 `<NodeWrapper>`，内部该写表单写表单、该写下拉选下拉。React Flow 只管：拖动位置、连线判定、缩放平移、minimap。**业务逻辑（节点跑什么）完全是 Dify 自己的**——这是关键的责任划分。

### 案例 2：自定义节点 30 行

```tsx
function LLMNode({ data }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <Handle type="target" position={Position.Left} />
      <div>模型: {data.model}</div>
      <input value={data.prompt} onChange={...} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { llm: LLMNode };
<ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
```

`Handle` 决定了"线从哪进哪出"。剩下都是普通 React。

### 案例 3：自动布局（auto-layout）

手动摆 50 个节点很痛苦。社区习惯接 **dagre** 或 **ELK**（两个图布局算法库）：

```tsx
import dagre from "dagre";
const g = new dagre.graphlib.Graph();
nodes.forEach(n => g.setNode(n.id, { width: 160, height: 60 }));
edges.forEach(e => g.setEdge(e.source, e.target));
dagre.layout(g);
// 把算出来的 x/y 写回 node.position
```

React Flow 不内置布局算法（它说"我只管视图，布局你选"）——这是有意的：算法换得勤，绑死会拖累用户。

## 踩过的坑

1. **v11 → v12 包名换**：老代码 `import { ReactFlow } from "reactflow"`，v12 改成 `from "@xyflow/react"`，全部 import 路径要改，CSS import 也换名。

2. **节点尺寸必须能立刻测量**：自定义节点写 `width: auto` + 异步加载内容（图片、API），React Flow 会按"测量瞬间"的尺寸算连线落点，结果连到节点中间空气里。修复：给节点固定宽高，或在内容到位后调 `updateNodeInternals(id)`。

3. **大图性能**：1000 节点以上，即便 v12 重写了 measurement layer，也要开 `onlyRenderVisibleElements`，并把 `nodeTypes` / 自定义节点用 `React.memo` 稳住引用，否则拖动画布时整树重渲染会卡顿。

4. **controlled / uncontrolled 混用**：API 同时支持"我自己管 state（用 `onNodesChange` 接 patch）"和"库帮我管（用 `useNodesState` hook）"。混着用——比如一半节点你自己 setState、一半用 hook——会出现拖动一下跳回原位的诡异现象。**选一种，别混**。

5. **CSS 不引会"看上去什么都没渲染"**：必须 `import "@xyflow/react/dist/style.css"`，否则节点宽高、连线样式全没了，画布看起来空白，新人常被这个问题卡半小时。

## 适用 vs 不适用场景

**适用**：

- AI 工作流 / agent pipeline 编辑器（LangGraph Studio / Dify / Flowise）
- 数据管道编辑器（ETL / 任务依赖图，Airflow 替代品的 UI 层）
- 决策树 / 流程图 / 思维导图 类应用
- 任何"节点是 UI 组件，连线表达关系"的可视化

**不适用**：

- 纯数据可视化（节点是几万个数据点）→ 用 vis-network / cytoscape / sigma.js，它们 canvas/WebGL 渲染能扛十万级
- 需要节点参与"求值/数据流计算"（dataflow programming）→ 用 rete.js，它把求值引擎也写好了
- 移动端为主的应用 → React Flow 触控支持 OK 但不是核心场景，复杂手势（捏合缩放 + 多指拖动同时）调起来累
- 你需要的是白板/绘图工具（自由画线、便签）→ 用 tldraw / excalidraw

## 历史小故事（可跳过）

- **2019**：柏林一家叫 webkid 的小公司做客户项目时反复写"节点编辑器"，把它抽出来开源
- **2022**：协议从私有改成 MIT，GitHub stars 起飞，成为当时唯一"成熟 + 商用许可 + React"的方案
- **2023**：成立 **xyflow** 组织，把 Svelte Flow 也做出来，共享 `@xyflow/system` 核心包
- **2024**：v12 重写节点 measurement layer，支持 SSR，大图性能跃迁
- 维护团队靠 **React Flow Pro**（订阅制，提供高级示例 + 优先 issue 支持）+ 商业咨询养活——是开源项目少见的"维护得起"案例

## 学到什么

1. **责任划分清晰的库才活得久**：React Flow 只管"视图 + 交互"，布局、求值、业务逻辑全是用户的事。这让它不被某一个用例绑死
2. **DOM 节点 + SVG 连线** 是节点编辑器的最优解——节点要 UI 复杂度，连线要数学精度，各自用对的工具
3. **MIT + 订阅商业化** 这条路走通了：核心永远开源，赚钱靠"省你时间的高级示例"和"专家支持"
4. **抽象的力量**：Node / Edge / Handle / Provider 四个概念，覆盖了从 ComfyUI 类风格到 Dify 这么大跨度的应用——好抽象的标志
5. **少数派的渲染选择有时是正确的**：业界默认"图节点用 SVG"，React Flow 反潮流用 div，反而吃到了"节点可以是任意 React 组件"的红利

## 延伸阅读

- 官网 + 交互式示例：[reactflow.dev](https://reactflow.dev)（每个 feature 都有 live demo，强烈推荐）
- 源码：[github.com/xyflow/xyflow](https://github.com/xyflow/xyflow)（monorepo，看 `packages/system` 是核心）
- v12 升级指南：[reactflow.dev/learn/troubleshooting/migrate-to-v12](https://reactflow.dev/learn/troubleshooting/migrate-to-v12)（v11 老项目必读）
- Dify 工作流源码：[github.com/langgenius/dify](https://github.com/langgenius/dify)（搜 `react-flow` 看真实业务用法）
- [[dnd-kit]] —— 同样是 React 交互库，专攻拖拽，可对比设计哲学

## 关联

- [[dnd-kit]] —— React 拖拽工具库，React Flow 内部拖拽自己实现，没用 dnd-kit
- [[comfyui]] —— 节点式扩散模型 GUI，用 LiteGraph.js（Canvas 渲染），是 React Flow 在另一个生态的对应物
- [[3d-force-graph]] —— 力导向图可视化，节点是数据点，定位与 React Flow 不同
- [[antv-g2]] —— 蚂蚁的图形语法库，做统计图表，与节点编辑器场景互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[tldraw]] —— tldraw — 把白板做成可嵌入的 SDK
- [[vis-network]] —— vis-network — barnesHut 物理引擎驱动的网络图
