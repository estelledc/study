---
title: tldraw — 把白板做成可嵌入的 SDK
来源: 'tldraw/tldraw v2, 2026-05 读, tldraw license'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 中级
provenance: pipeline-v3
---

## 是什么

tldraw 是一个**把白板拆成乐高积木卖给开发者**的 React 库。日常类比：Excalidraw 像一台预装好菜单的咖啡机，按一下就出咖啡；tldraw 像一套咖啡器材——磨豆机、滤杯、秤分开卖，你自己拼一台属于自己的机器。

打开 [tldraw.com](https://tldraw.com) 看到的产品白板，只是它顺手做的官方演示。真正卖的是 `@tldraw/tldraw` 这个 npm 包，三行代码就能在自己的应用里嵌一个能画图、能多选、能撤销、能多人协作的画布。

它做的事情是：定义一套**形状（Shape）+ 工具（Tool）+ 编辑器（Editor）** 三件套抽象，让你既能用现成的（矩形、箭头、便签），也能写自己的（流程图节点、UI 控件、3D 预览框）。

## 为什么重要

不理解 tldraw 这种"SDK 优先"思路，下面这些事都没法解释：

- 为什么 Vercel v0、几款 AI 设计工具用的画布都长得很像——它们都嵌了 tldraw
- 为什么 2023 年的 Make Real demo 能在推特爆火——画布里的草图通过 SDK 直接序列化成图像 + JSON 喂给 GPT-4V，返回的 HTML 当场渲染回画布
- 为什么 tldraw v2 不再是 MIT 协议——作者要靠付费去水印养活团队，**商用前必须读条款**
- 为什么它的形状不在 DOM 里——自研的 canvas/SVG 渲染层，浏览器 Devtools 看不到形状层级

## 核心要点

tldraw 的架构可以拆成 **三层**：

1. **Editor 是单一真相**：整个画布的状态（哪些形状、相机在哪、谁选中了什么）都挂在 `editor` 这一个对象上。所有改动都通过 `editor.createShape()` / `editor.updateShape()` 等方法。类比：游戏引擎里的 `world` 对象——你不直接动像素，你告诉 world 改某个 entity 的属性，world 自己重绘。

2. **Tool 是状态机**：选择工具、矩形工具、画笔工具不是 if/else 分支，而是一棵 StateNode 树（idle → pointing → dragging）。每个状态自己处理 `onPointerDown` / `onPointerMove` 这些事件。类比：自动售货机——投币、选商品、出货是几个状态，转换由事件触发，不是一锅端。

3. **Shape 可扩展**：内置的矩形/箭头/文本只是默认实现，用户可以写 `class MyNode extends ShapeUtil`，实现 `component()`（渲染 React 节点）和 `getGeometry()`（碰撞箱），编辑器把它当原生形状对待——一样能选中、一样能撤销、一样能协作同步。

## 实践案例

### 案例 1：3 行代码嵌进 React 应用

```tsx
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

export default function App() {
  return <div style={{ inset: 0, position: 'fixed' }}>
    <Tldraw />
  </div>
}
```

打开就是一个完整白板：能画形状、能多选、能撤销、能本地保存（IndexedDB）、能导出 PNG。**这一步连后端都不用。**

### 案例 2：Make Real——把画布当 LLM 的 prompt

```tsx
const editor = useEditor()

async function makeReal() {
  const selectedShapes = editor.getSelectedShapes()
  const png = await editor.toImage(selectedShapes, { format: 'png' })
  const json = editor.getContentFromCurrentPage(selectedShapes)

  const response = await fetch('/api/make-real', {
    method: 'POST',
    body: JSON.stringify({ image: png, shapes: json })
  })
  const { html } = await response.json()

  editor.createShape({ type: 'iframe', props: { html } })
}
```

后端拿 image + json 拼成 GPT-4V 的多模态 prompt，让模型根据草图生成 HTML，回写到画布上一个 `iframe` 形状里。这就是 2023 年那个出圈 demo 的全部秘密——**SDK 把"画布序列化"这件事做透了，AI 集成只是一层薄壳**。

### 案例 3：自定义形状（流程图节点）

```tsx
class FlowNodeShapeUtil extends ShapeUtil<FlowNodeShape> {
  static type = 'flow-node'

  getDefaultProps() { return { label: '节点', w: 120, h: 60 } }

  component(shape: FlowNodeShape) {
    return <HTMLContainer>
      <div className="rounded border-2 p-2">{shape.props.label}</div>
    </HTMLContainer>
  }

  getGeometry(shape: FlowNodeShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }
}
```

注册后，`flow-node` 就是一等公民——能选中、能拖、能撤销、能进 undo 栈、能在多人协作里同步。**自定义和内置之间没有特权差别**，这是它和 Konva/Fabric 这类底层 canvas 库最大的不同。

## 踩过的坑

1. **License 不是 MIT**：v2 起用自有 tldraw license，免费版强制水印，去水印要付费订阅。商用前一定看 LICENSE 文件，**别照搬 Excalidraw 的心智**。

2. **v1 → v2 API 几乎全改**：v1 的 `TldrawApp` / `useFileSystem` 已废弃，v2 是 `Editor` / `store`。Google 搜到的老博客几乎全是 v1，**只看官方 docs**。

3. **形状不在 DOM 里**：debug 时 Devtools 的 Elements 面板只能看到 canvas/SVG 容器，看不到具体形状。要查状态用 `editor.getCurrentPageShapes()` 在 Console 打。

4. **协作要自己跑 sync server**：内置只是本地 IndexedDB。多人协作要部署 `@tldraw/sync` 服务（基于 WebSocket + 类 CRDT 算法），或者用官方付费 SaaS。

## 适用 vs 不适用场景

**适用**：

- 在 React 应用里嵌一个**功能完整**的白板（画图、撤销、协作）
- 做 LLM 多模态前端——画布即 prompt，截图喂模型，结构化形状回流
- 需要自定义形状（业务节点、UI 控件、3D 预览）的可视化编辑器

**不适用**：

- 纯 OSS 项目（介意自有 license）→ 选 Excalidraw（MIT）
- 只需要简单画图，不需要 SDK 扩展 → Excalidraw 体验更好
- 非 React 栈（Vue/Svelte/原生）→ 官方只支持 React
- 需要 PPT 级排版/动画 → tldraw 不是设计工具，是白板

## 历史小故事（可跳过）

- **2021 年**：Steve Ruiz 一个人在 Twitter 上直播开发 tldraw v1，免费产品起家，靠社区口碑传播
- **2022 年**：拿到 a16z 投资，组小团队，开始重写 v2
- **2023 年 11 月**：v2 beta + Make Real demo 同时发布，画布草图变 HTML 在推特刷屏
- **2024 年**：v2 正式版，明确 SDK 定位，license 从 MIT 改成自有协议
- **2025 年**：sync server 开源，Vercel v0 用它做画布层

## 与 Excalidraw 的关键差异（一张表）

| 维度 | tldraw v2 | Excalidraw |
|---|---|---|
| 定位 | SDK 先 | 产品先 |
| License | tldraw license（自有） | MIT |
| 形状扩展 | `ShapeUtil` 一等公民 | 有限，需 fork |
| 渲染 | 自研 canvas/SVG | canvas + Rough.js 手绘 |
| 协作 | 自部署 sync server | 内置加密中继（socket.io） |
| 学习曲线 | 陡（抽象多） | 平（嵌入即用） |
| 商业模式 | 付费去水印 + SaaS | 纯开源 + 第三方 SaaS |

一句话总结：**Excalidraw 是 IKEA 的成品桌，tldraw 是宜家板材**——前者拿来就用，后者能拼出更多花样但要自己学装配。

## 学到什么

1. **画布 = 状态 + 渲染 + 工具**，三件套拆开后每一件都能扩展，这就是 SDK 心智
2. **Editor 单一真相**比"组件各管各"更好做撤销和协作——所有改动走同一根管子
3. **AI 集成的关键不是模型，是序列化**——能把画布转成图像 + JSON，prompt 就成立了
4. **License 是产品决策**，MIT 不是默认；商业可持续是开源软件长期活下去的真问题

## 延伸阅读

- 官方 docs：[tldraw.dev](https://tldraw.dev)（v2 API + 自定义形状教程）
- Make Real 源码：[github.com/tldraw/make-real](https://github.com/tldraw/make-real)（完整可跑的 GPT-4V 集成示例）
- Steve Ruiz 演讲：[The Story of tldraw](https://www.youtube.com/watch?v=eTEU0ge1LzI)（v1 → v2 心路）
- [[excalidraw]] —— 同类产品但 MIT，对比看 SDK vs 产品两种路径
- [[affine]] —— 文档 + 白板一体化，另一种 canvas 集成思路

## 关联

- [[excalidraw]] —— 手绘风白板，MIT，产品先；tldraw 是 SDK 先
- [[affine]] —— 文档 + 白板 + 数据库一体化的 local-first 工作空间
- [[react-flow]] —— 流程图专用，比 tldraw 轻，不带通用画布能力
- [[3d-force-graph]] —— 也是 canvas 渲染但目标是图布局，不是白板
