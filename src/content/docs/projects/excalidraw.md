---
title: "Excalidraw — canvas + 协同的最小心脏"
description: 一个白板应用怎么把"几何 + 渲染 + 撤销 + 协同 + 持久"做到几个核心抽象里
sidebar:
  order: 27
  label: "excalidraw/excalidraw"
---

> excalidraw/excalidraw v0.18.0（2026-05），MIT。
>
> Excalidraw 是 Web 上最好用的"手绘风白板"——开源、本地优先、可协作。
> 简单到 5 分钟入门，但**底层有 13000 行的 App.tsx**。
>
> 复杂在哪？看似简单的"画图 + 撤销 + 协作 + 保存"，
> 每一项展开都是一个独立工程。Excalidraw 的设计判断是
> **把所有这些事抽象成同一个核心：Store + StoreDelta + StoreSnapshot**。
>
> Season 5「系统编辑 + 验证」开篇。

## 一句话定位

**Excalidraw = 一个 immutable scene store + delta 系统 + canvas renderer。**
Element 是数据，渲染是函数（每帧重画），undo / redo / 协同 / 持久 都是同一个 delta 模型的不同应用。

## Why（为什么是它而不是 tldraw / Figma / Miro / draw.io）

白板/协作绘图领域的产品图谱：

| 产品 | 风格 | 协作 | 开源 | 复杂度 |
|---|---|---|---|---|
| **Figma** | 像素精确 | 实时多人 | ✗ | 极高 |
| **Miro** | 商业白板 | 实时多人 | ✗ | 高 |
| **Lucidchart** | 流程图 | 多人 | ✗ | 高 |
| **draw.io** | 老牌通用 | 单人为主 | ✓ | 中 |
| **tldraw** | 类似 Excalidraw | 实时多人 | ✓ | 中 |
| **Excalidraw** | **手绘风** | **可选协作** | **✓** | **聚焦** |

**Excalidraw 的判断分水岭**：

1. **手绘风**——故意不做 Figma 的精确像素。让产出"像草图"，**降低 stakeholder 对完美度的预期**
2. **本地优先**——核心模式离线可用，协作是 opt-in
3. **简单覆盖 80%**——常用形状（矩形 / 圆 / 箭头 / 文字）做到极致，不堆 5000 个工具
4. **数据可移植**——`.excalidraw` JSON 文件，git 友好
5. **嵌入友好**——是 npm 包，可以嵌进任何 React 应用

**为什么不是 Figma**：Figma 是产品设计工具，**对工程师太重**。开会画个流程图不需要那种精度。

**为什么不是 tldraw**：tldraw 也是优秀的开源白板，技术和 Excalidraw 同代。
**判断**：tldraw 更"现代化"（多 AI 集成、SDK 更现代），Excalidraw 更"少即多"（API 更稳、用户更多、生态更丰富）。

**为什么不是 draw.io**：draw.io 是上一代产物，UI 老、协作弱。Excalidraw 是 2020 后的回答。

## 仓库地形

```
excalidraw/
├── excalidraw-app/                  ← 公开站点（excalidraw.com）
├── packages/
│   ├── excalidraw/                  ← ★ 核心 React 包（@excalidraw/excalidraw）
│   │   ├── components/
│   │   │   ├── App.tsx              ← ★★★ 13053 行：主组件 + 输入处理 + 状态
│   │   │   └── ...
│   │   ├── scene/
│   │   │   ├── Renderer.ts          ← 262 行：渲染调度
│   │   │   └── ...
│   │   ├── renderer/
│   │   │   ├── staticScene.ts       ← 501 行：完成图渲染
│   │   │   ├── interactiveScene.ts  ← 2090 行：实时绘制 + 选择 + handles
│   │   │   └── staticSvgScene.ts    ← 786 行：导出 SVG
│   │   ├── actions/                 ← 用户动作（cut/copy/paste/align/...）
│   │   ├── history.ts               ← 249 行：撤销/重做
│   │   ├── appState.ts              ← UI 状态（zoom / scroll / selection）
│   │   └── types.ts                 ← 1078 行：类型山
│   ├── element/                     ← 几何 + 元素管理
│   │   └── src/
│   │       ├── store.ts             ← 1037 行：★★★ Store/Snapshot/Delta
│   │       ├── delta.ts             ← 2066 行：★★ 增量计算
│   │       ├── binding.ts           ← 箭头-元素绑定
│   │       ├── collision.ts         ← 命中测试
│   │       ├── bounds.ts            ← 包围盒
│   │       └── ...
│   ├── common/                      ← 工具函数（Emitter 等）
│   ├── math/                        ← 几何运算
│   ├── fractional-indexing/         ← ★ 协同排序
│   └── utils/
└── examples/
```

**心脏文件**：

1. `packages/element/src/store.ts:78`——`Store` 类（1037 行总，单类是核心）
2. `packages/element/src/delta.ts`——`StoreDelta` 计算（2066 行）
3. `packages/excalidraw/history.ts`——撤销栈基于 delta
4. `packages/excalidraw/components/App.tsx`——13053 行的主组件（不要硬读）

13000 行的 App.tsx 是因为**所有交互处理都在一个组件**——pointer 事件、选择、拖拽、缩放、
键盘快捷键……React 组件的"上帝模式"。

## 核心机制 · Layer 3 精读

### 机制 1 · Store / Snapshot / Delta —— 不可变 + 增量

`packages/element/src/store.ts:78-100`：

```typescript
export class Store {
  public readonly onDurableIncrementEmitter = new Emitter<[DurableIncrement]>()
  public readonly onStoreIncrementEmitter = new Emitter<...>()

  private scheduledMacroActions: Set<CaptureUpdateActionType> = new Set()
  private scheduledMicroActions: MicroActionsQueue = []

  private _snapshot = StoreSnapshot.empty()

  public get snapshot() { return this._snapshot }
  // ...
}
```

**关键设计**：

- `Store` 不是状态本身，是**状态的协调器**
- `StoreSnapshot` 是某一时刻的不可变快照
- `StoreDelta` 是 snapshot A → B 的增量（增删改的具体内容）

每次用户操作：

```
当前 snapshot
   ↓
计算变化 → StoreDelta
   ↓
应用 delta → 新 snapshot
   ↓
emit increment 事件
   ↓
   ├─ history.ts 监听 → push 到 undo 栈
   ├─ collab 模块监听 → 广播给其他用户
   └─ persistence 监听 → 存到 localStorage / firebase
```

→ **同一个 delta 模型解决了 4 个问题**：状态更新、撤销、协同、持久。
这就是抽象的力量——不是各搞各的，是**找到通用的中间表示**。

### 机制 2 · DurableIncrement vs EphemeralIncrement

`store.ts:78-83` 出现两种 increment：

- **Durable**：写到 undo 栈、写到 firebase、广播给协作者
- **Ephemeral**：只是 UI 反馈（hover、selection 高亮、临时绘制中状态），不影响真实文档

→ 这个区分**避免了"鼠标移动一下就广播"的灾难**。
拖拽过程中是 Ephemeral，松开鼠标才转成 Durable，**这是协同性能的关键 idiom**。

### 机制 3 · Macro / Micro Action — 调度优先级

```typescript
private scheduledMacroActions: Set<CaptureUpdateActionType> = new Set()
private scheduledMicroActions: MicroActionsQueue = []
```

- **Macro action**：会触发 capture（拍快照、emit increment）
- **Micro action**：在 commit 之前先执行的"准备步骤"

→ 类似 [XState 笔记](/study/projects/xstate/) 的 microstep / macrostep——
都是"先稳定再 emit"的思想。让外部观察者看到的是**事件，不是过程**。

### 机制 4 · Renderer — 每帧重画的纯函数式渲染

`packages/excalidraw/scene/Renderer.ts`（262 行）调度。
`packages/excalidraw/renderer/staticScene.ts`（501 行）和 `interactiveScene.ts`（2090 行）做实际绘制。

**核心思路**：

```typescript
function renderScene(elements, appState, canvas) {
  ctx.clearRect(0, 0, w, h)            // ← 每帧清空
  for (const el of elements) {
    drawElement(ctx, el, appState)     // ← 每个元素重画
  }
  drawSelectionHandles(ctx, ...)
}

// requestAnimationFrame 循环里调用
```

**为什么"每帧全画"不慢**：
- canvas 2D API 经过浏览器深度优化
- 元素数量通常 < 1000
- viewport culling（不画屏外元素）

→ 这种"全量重渲"模式比 React 的"diff 局部更新"在 canvas 场景**更适合**——
canvas 没有 DOM 节点的 diff，整个就是一张图，重画反而省心。

### 机制 5 · `interactiveScene.ts` 2090 行 —— 交互的复杂度

为什么 interactive scene 这么大？

它要处理：
- 选中框（dashed border）
- 选中后的 8 个调整 handle（角 + 边）
- 旋转 handle
- 多选时的 group bounding box
- snap 到网格 / 其他元素的辅助线
- 拖拽预览 / 复制预览
- 文本编辑光标
- 协作其他用户的 cursor / selection

每一个都是几十行代码。**累加成 2090 行**。

→ 这是**真实产品的复杂度**。简单 demo 看不到这些，自己做一个产品才知道
"画几个矩形"和"做出 Excalidraw 体验"差几个数量级。

### 机制 6 · `fractional-indexing` —— 协同排序的关键

独立 package（`packages/fractional-indexing/`）。

**问题**：多人协作时，元素的 z-order（图层顺序）怎么处理？

朴素方案：用整数索引 `[0, 1, 2, 3]`。问题：A 想把元素放在 1 和 2 之间，
要把 2 改成 3、3 改成 4——**导致大量元素的索引变了**，造成 merge conflict。

Fractional indexing 方案：用字符串 `"a0"`, `"a1"`, ... 之间可以无限插入 `"a0V"` 这样的中间值。
**任何位置插入都不影响其他**。

→ 这是 CRDT（无冲突复制数据类型）领域的经典 trick。Figma / tldraw / Notion 都用类似方案。
Excalidraw 把它独立成 package 共享。

### 机制 7 · 协同模式 —— 自定义 portal + WebRTC

Excalidraw 的协作不依赖中央服务（除了"开房间"）：
- 一个 portal 服务（excalidraw 自托管）做信令
- 客户端之间走 WebRTC P2P
- 数据用上面的 Store/Delta 模型增量同步

**判断**：本地优先 + P2P，**避免数据集中**。
对比 Figma 是中央集权架构，每次操作都过 Figma 服务器。

→ 这是**隐私和成本的判断**：Excalidraw 团队不想运营存储服务，让用户自己掌控数据。

## 横向对比

### vs tldraw — 同代竞品的不同取舍

tldraw 是 Excalidraw 后期出现的优秀竞品：
- **tldraw 更"现代"**：内置 AI（draw → SQL）、SDK 更整洁、TS-first
- **Excalidraw 更"稳"**：早 2 年，社区大、用户多、生态丰富

如果你做新产品集成：tldraw SDK 可能更适合。
如果你需要"用户已经熟悉的体验"：Excalidraw 更合适。

### vs Figma — 不同物种

Figma 解决的是"高保真设计 + 实时多人 + 设计系统"——核心是产品设计工作。
Excalidraw 解决的是"快速画想法 + 嵌入文档/PR + 不焦虑完美度"——草图工具。

→ **不竞争**，互补。

### vs Miro / draw.io — 商业 vs 开源

Miro 是企业 SaaS，bell-and-whistle 多但贵。
draw.io 老牌但 UX 老。
Excalidraw 介于"开源免费 + 体验好 + 嵌入友好"之间。

## Hands-on（10 分钟内能跑）

```bash
mkdir excalidraw-demo && cd excalidraw-demo
npm create vite@latest . -- --template react-ts
npm install @excalidraw/excalidraw
```

写 `src/App.tsx`：

```typescript
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

export default function App() {
  return (
    <div style={{ height: '100vh' }}>
      <Excalidraw
        onChange={(elements, appState) => {
          console.log('Elements:', elements.length)
        }}
      />
    </div>
  )
}
```

```bash
npm run dev
```

打开 http://localhost:5173 —— 一个完整 Excalidraw 嵌进你的应用。

### 改一处的实验（必做）

挂上 `onChange` 看每次操作产生的 elements 数组：

```typescript
<Excalidraw onChange={(els, state) => {
  console.log('elements:', els.length)
  console.log('selection:', state.selectedElementIds)
}} />
```

**画几个矩形 + 拖拽 + 撤销**——观察 elements 怎么变。
你会发现"撤销"不是改 elements，是**回到上一个 snapshot**。

第二个实验：导出和导入：

```typescript
import { serializeAsJSON } from '@excalidraw/excalidraw'

// 拿当前 elements + appState
// serializeAsJSON 输出可保存的 JSON
const json = serializeAsJSON(elements, appState, files, 'database')
console.log(json)
```

理解 Excalidraw 的数据格式——这是它"git 友好"的来源。

## 与你工作的连接

**能立刻迁移**：

- 任何**文档 / blog / 学习站**需要嵌入手绘示意图——用 Excalidraw 而不是上传 PNG
- 内部 PRD / 设计文档——用 Excalidraw 画流程比 Figma 快 10 倍
- AI agent 输出可视化（比如 Mermaid → Excalidraw 转换器）

**下个月可能用到**：

- 给项目加"白板模式"——用 `@excalidraw/excalidraw` 的 `<Excalidraw />` 组件
- 用 store/delta 模型做自己的 canvas 应用——抽象很值得复用

**不要用 Excalidraw 的部分**：

- **设计系统 / 高保真 UI 设计**——Figma 不可替代
- **数据可视化 / 流程图自动布局**——D3 / Mermaid 更合适
- **极大画布**（10000+ 元素）——Excalidraw 用 canvas 2D，性能不如 GPU 加速的 PixiJS / Konva

## 读完你能做之前做不了的事

- **判断**：写画布应用时，能识别"哪些状态是 durable / 哪些是 ephemeral"
- **设计**：要做撤销栈时，第一反应不是存全量历史，而是**存 delta**
- **解释**：被问"协同编辑怎么实现"时，能用 Excalidraw 的 fractional indexing 解释一个 trick
- **下钻**：看懂 tldraw / Figma 的核心架构——它们和 Excalidraw 同思路
- **对照**：识别"我这个 React 状态能不能用 store + delta 模型"——这是协作的预备工作

## 自检 · 5 个问题

1. Durable vs Ephemeral increment 的区分是什么？为什么没有这个区分会导致协同性能爆炸？
2. fractional indexing 用字符串而不是浮点数。如果用浮点数 `(a + b) / 2` 求中间值会有什么问题？
3. interactiveScene.ts 2090 行——这种"巨型 Renderer"的优劣是什么？
   能不能拆成 50 个小组件？为什么 Excalidraw 没拆？
4. Excalidraw 的 store/delta 模型是 [zustand](/study/projects/zustand/) 这种朴素 store 解决不了的吗？为什么？
5. 协同走 P2P 而不是中央服务器。**对哪些 use case 是好处，哪些是劣势**？

## 延伸阅读

读完这篇笔记后下一步：

1. `packages/element/src/store.ts:78-200`——Store 类的完整设计
2. `packages/fractional-indexing/`——独立 package，几十行就能读完
3. `packages/excalidraw/history.ts`——基于 store delta 的撤销实现
4. **tldraw 源码**——同代对照，看不同设计判断
5. **Figma 工程博客** - "How Figma's multiplayer technology works"——理解中央集权协同的代价

---

**笔记完成**：2026-05-28（v0.18.0）
**研究方法**：本地克隆 + 阅读 Store 类 + 设计模式分析（不读 13000 行 App.tsx）
**心脏文件**：`packages/element/src/store.ts:78-200`（Store/Snapshot/Delta 三剑客）
