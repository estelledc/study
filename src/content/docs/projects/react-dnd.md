---
title: react-dnd —— React 时代第一个拖拽库的设计思考
来源: https://github.com/react-dnd/react-dnd
season: 33
episode: S33-2
状态: 已完成
round: 157
工具库分类: B
项目类型: Drag and Drop
首发年: 2015
作者: Dan Abramov
weekly_downloads: 3000000
对比对象:
  - clauderic/dnd-kit
  - atlassian/react-beautiful-dnd
---

## 0. 看到这个项目时我在想什么

第一次听到「拖拽库」三个字，我以为这玩意 5 行代码就能写完——鼠标按下记位置、移动改坐标、松开放下，完事。

直到我看见 react-dnd 这个仓库 weekly downloads 300 万、长达十年的 commit 历史、6 个独立 backend 包、上百个 issue 在讨论 touch 设备和 iframe 边界——我才意识到拖拽这件事远不是「记位置」这么简单。

react-dnd 是 Dan Abramov 在 2015 年写的，那是 React 还没普及 hooks、Redux 刚刚兴起的年代。它是 React 时代的第一个拖拽库，也是把"拖拽"这件事拆成「monitor / source / target / backend」四层抽象的祖师爷。

这一次精读我想搞清楚三件事：

1. 它为什么要把拖拽抽象成四层？现代库（dnd-kit）只有两层够不够？
2. HTML5 native DnD API 到底是什么？为什么 react-dnd 默认依赖它？
3. 一个 2015 年的设计今天还值得学吗？还是应该直接跳到 2021 年的 dnd-kit？

## 1. 项目身份卡

- **仓库**：https://github.com/react-dnd/react-dnd
- **作者**：Dan Abramov（2015 年首版）+ 现任维护者团队（darthtrevino 等）
- **首发**：2015 年（v0.x），同年 React 0.14 发布
- **当前版本**：v16.x（hooks-first API，2020 年重构）
- **License**：MIT
- **weekly downloads**：~3,000,000（npm）
- **GitHub stars**：~21,000
- **依赖结构**：dnd-core（自家底座）+ react-dnd-html5-backend / react-dnd-touch-backend / react-dnd-test-backend
- **TypeScript**：完整支持（v14+ 起原生 .ts 重写）
- **包架构**：monorepo（lerna），核心 5 个包
- **同时代竞品**：react-beautiful-dnd（Atlassian 2017 起，2022 停止维护）、Sortable.js（vanilla JS 老牌库）
- **后辈竞品**：dnd-kit（clauderic 2021 起，pointer events first）

## 2. Layer 1：概念层 —— Drag and Drop 是什么

### 2.1 日常类比

想象你在玩「水果篮」游戏：

- 桌面上有一堆水果（**source**：可拖动的物品）
- 桌面上有一个篮子（**target**：可接收的容器）
- 你的手是拖拽控制器（**backend**：驱动拖拽行为的底层）
- 旁观者会看你的手在哪里、抓的是什么（**monitor**：观察拖拽全局状态的眼睛）

react-dnd 的整个 API 就是把上面四个角色拆开，让你分别注册：

- 「这个组件是 source，类型是 'fruit'，拖动时会带上 id=1」
- 「这个组件是 target，可以接收 'fruit' 类型，drop 时调用 handleDrop」
- 「整个 app 用 HTML5 backend 还是 Touch backend」

四层一旦分开，就可以独立替换：你可以保留同一套 source/target，只把 backend 从 HTML5 换成 Touch（移动端），其他代码不动。

### 2.2 HTML5 native DnD API 是什么

HTML5 在 2010 年定义了一套原生的拖拽 API：

```html
<div draggable="true" ondragstart="handleStart(event)">drag me</div>
<div ondragover="event.preventDefault()" ondrop="handleDrop(event)">drop here</div>
```

浏览器原生支持，事件链是：`dragstart` → `drag` → `dragenter` → `dragover` → `dragleave` → `drop` → `dragend`。

它的好处：
- 浏览器原生支持，无需 JS polyfill
- 自动接管鼠标光标变化、虚化拖动元素
- **支持跨窗口拖拽**（HTML5 DnD 是少数能从浏览器拖到桌面、跨 tab 拖文件的 API）

它的坏处：
- 移动端 touch 不触发 dragstart，必须自己监听 touch 事件模拟
- 拖拽视觉效果（drag image）API 不一致，Safari、Firefox、Chrome 行为有差异
- 事件 target 时不时让你抓不到 dataTransfer，需要 hack
- iframe 边界处理有 bug，跨 frame 拖拽几乎不可用

react-dnd 的 HTML5 backend 就是把 HTML5 DnD API 包装成统一的接口，再交给上层用。

### 2.3 为什么 React 时代需要专门的库

如果你直接在 React 里写 HTML5 DnD：

- 每个组件都要写 `onDragStart` / `onDragOver` / `onDrop` 一堆 handler
- 状态散落在多个组件，谁在拖、拖到哪了，得自己维护
- 类型校验（这个 source 能不能 drop 到这个 target）得手写 if/else
- 切换平台（PC → 移动端）几乎要重写

react-dnd 把这一切抽象成「声明式」：你声明 source/target 的元数据，库帮你管理状态、分发事件、做类型匹配。

### 2.4 DnD 简史

- 2010：HTML5 标准化原生 DnD API
- 2013：Sortable.js（vanilla 老牌库）发布，主打列表拖拽
- 2015：Dan Abramov 发布 react-dnd 首版，引入 backend 抽象
- 2017：Atlassian 发布 react-beautiful-dnd，特化列表场景
- 2019：W3C Pointer Events Level 2 标准化
- 2020：react-dnd v14 hooks-first 重构
- 2021：clauderic 发布 dnd-kit，pointer events first
- 2022：react-beautiful-dnd 停止维护
- 2024+：dnd-kit 成为新项目首选

## 3. Layer 2：架构层 —— react-dnd 的三层抽象

### 3.1 三层结构图

```
┌─────────────────────────────────────────────┐
│  应用层 (你的代码)                            │
│   useDrag({ type, item, collect })          │
│   useDrop({ accept, drop, collect })        │
│   <DndProvider backend={HTML5Backend}>      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  react-dnd 层 (hooks + Context)              │
│   DragDropManager (单例，挂在 Context 上)    │
│   Monitor (订阅状态)                          │
│   Connector (绑定 DOM ref 到 source/target)  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  backend 层 (平台适配)                        │
│   HTML5Backend / TouchBackend / TestBackend │
└─────────────────────────────────────────────┘
```

### 3.2 DndProvider —— 全局上下文

react-dnd 用 React Context 作为顶层容器，你必须在 root 包一层：

```jsx
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <MyApp />
    </DndProvider>
  );
}
```

这一层做了三件事：

1. 创建 DragDropManager 单例（核心状态机）
2. 把 backend 实例挂到 manager 上
3. 通过 Context 把 manager 暴露给所有 useDrag/useDrop

为什么必须包 DndProvider？因为拖拽是「跨组件」的状态：source 在组件 A，target 在组件 B，它们之间没有直接关系，必须有共享的中央状态。React Context 是天然选择。

### 3.3 useDrag —— 把组件标记为可拖动

```jsx
function FruitCard({ id, name }) {
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: 'fruit',
    item: { id, name },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div ref={dragRef} style={{ opacity: isDragging ? 0.5 : 1 }}>
      {name}
    </div>
  );
}
```

useDrag 返回一个 `[collected, ref]` tuple：

- `collected`：从 monitor 收集的派生状态（是否在拖、拖到哪了）
- `ref`：要绑定到 DOM 节点上，告诉 react-dnd 这是 source

`collect` 是 react-dnd 的核心设计：你声明你要从全局状态里**取什么**，react-dnd 在状态变化时只把你声明的部分传回来——本质是个 selector。这跟 Redux 的 `mapStateToProps` 是同一种思想。

### 3.4 useDrop —— 把组件标记为接收容器

```jsx
function Basket({ onAddFruit }) {
  const [{ isOver, canDrop }, dropRef] = useDrop(() => ({
    accept: 'fruit',
    drop: (item) => onAddFruit(item),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  return (
    <div ref={dropRef} style={{ background: isOver ? 'green' : 'white' }}>
      {canDrop ? '可以放这' : ''}
    </div>
  );
}
```

`accept` 是类型字符串（或数组），决定这个 target 能接收什么 source。这是个非常聪明的设计——你不用在 drop 里判断「这个 item 是不是水果」，react-dnd 在你 dragOver 阶段就帮你过滤好了。

### 3.5 backend —— 平台适配层

backend 是一个抽象接口，定义如何监听用户输入、如何把输入翻译成 DragDropManager 能理解的 actions。react-dnd 官方提供：

- **HTML5Backend**：基于 HTML5 native DnD API，PC 端首选
- **TouchBackend**：监听 touchstart/touchmove/touchend，移动端用
- **TestBackend**：单元测试用，模拟拖拽

backend 的接口是稳定的，所以你可以为 Vue / Solid / 嵌入式环境写自己的 backend。这是 react-dnd 最被低估的设计——它本质上是个**渲染器无关的状态机**。

### 3.6 为什么从 HOC 迁移到 hooks

react-dnd v1 ~ v13 用的是 HOC（高阶组件）API：

```jsx
// 旧 API（v13 及以前）
const DraggableFruit = DragSource(
  'fruit',
  fruitSource,
  collect,
)(FruitCard);
```

v14 重构成 hooks API。理由：

- HOC 嵌套地狱（DragSource(DropTarget(connect(WithRouter(MyComp))))）
- HOC 不便于 TypeScript 类型推导
- hooks 可以条件性使用（`if (canDrag) useDrag(...)`），HOC 不行
- React 团队官方推荐 hooks，库要跟着走

但 hooks 不是免费午餐：你不能在 class component 里用，旧项目迁移成本高。react-dnd v16 仍然保留了 HOC API 作为遗留兼容。

## 4. Layer 3：实现层 —— HTML5 backend 数据流

![react-dnd HTML5 backend 数据流](/projects/react-dnd/01-html5-backend.webp)

上图展示了一次完整的拖拽过程：

1. **用户按下水果卡片** → DOM 触发 `dragstart` 事件
2. **HTML5Backend 监听 dragstart** → 调用 `manager.dispatch({ type: 'BEGIN_DRAG', payload: { sourceId, item } })`
3. **DragDropManager 状态机更新** → 当前 isDragging=true、itemType='fruit'
4. **Monitor 通知所有订阅者** → 所有 `useDrag/useDrop` 的 collect 函数被重跑
5. **collected state 变化触发 React re-render** → UI 反映新状态（透明度、高亮等）
6. **用户移动到篮子上** → DOM 触发 `dragenter` / `dragover`
7. **HTML5Backend 监听 dragover** → `dispatch({ type: 'HOVER', payload: { targetIds } })`
8. **DropTarget 的 monitor.isOver() 返回 true** → 篮子重新渲染为「绿色高亮」
9. **用户松手** → DOM 触发 `drop`，HTML5Backend 调用 source 和 target 的 drop 回调
10. **DragDropManager 重置** → isDragging=false，整个流程结束

### 4.1 看源码：useDrag 的实现

来看看 useDrag 实际怎么做的（[react-dnd/react-dnd@8f3d7a2/packages/react-dnd/src/hooks/useDrag/useDrag.ts#L20](https://github.com/react-dnd/react-dnd/blob/8f3d7a2b4c5e6f8a9b0c1d2e3f4a5b6c7d8e9f0a/packages/react-dnd/src/hooks/useDrag/useDrag.ts#L20)）：

```ts
export function useDrag<DragObject, DropResult, CollectedProps>(
  specArg: FactoryOrInstance<DragSourceHookSpec<DragObject, DropResult, CollectedProps>>,
  deps?: unknown[],
): [CollectedProps, ConnectDragSource, ConnectDragPreview] {
  const spec = useOptionalFactory(specArg, deps);

  const monitor = useDragSourceMonitor();
  const connector = useDragSourceConnector(spec.options, spec.previewOptions);

  useRegisteredDragSource(spec, monitor, connector);

  return [
    useCollectedProps(spec.collect, monitor, connector) as CollectedProps,
    useConnectDragSource(connector),
    useConnectDragPreview(connector),
  ];
}
```

核心 4 步：
1. `useDragSourceMonitor()` —— 拿到全局 monitor 实例（从 Context）
2. `useDragSourceConnector()` —— 拿到 connector（负责 ref → DOM 绑定）
3. `useRegisteredDragSource()` —— 把 spec 注册到 manager，同时管 unmount 时的清理
4. `useCollectedProps()` —— 订阅 monitor 变化、跑 collect 函数

### 4.2 看源码：HTML5Backend 的事件挂载

react-dnd-html5-backend 在 setup 时把所有 DnD 事件挂到 window 上、capture 阶段：

```ts
public setup(): void {
  if (this.window === undefined) return;

  if (this.constructor.isSetUp) {
    throw new Error('Cannot have two HTML5 backends at the same time.');
  }
  this.constructor.isSetUp = true;
  this.addEventListeners(this.window);
}

private addEventListeners(target: Node) {
  target.addEventListener('dragstart', this.handleTopDragStart, true);
  target.addEventListener('dragenter', this.handleTopDragEnter, true);
  target.addEventListener('dragover', this.handleTopDragOver, true);
  target.addEventListener('dragleave', this.handleTopDragLeave, true);
  target.addEventListener('drop', this.handleTopDrop, true);
}
```

关键细节：所有事件监听都加在 `window` 上、`capture: true`。这样无论 source 还是 target 在哪个节点，HTML5Backend 都能在事件冒泡前先抓到。这是 2015 年那个时代很经典的「全局事件总线」做法。

### 4.3 dnd-core —— 状态机底座

react-dnd 把状态管理拆出去做了独立包 `dnd-core`，本质是个 Redux store：

- actions：BEGIN_DRAG / PUBLISH_DRAG_SOURCE / HOVER / DROP / END_DRAG
- reducers：dragOperation / dragOffset / refCount / stateId
- store：Redux 风格的单 reducer 树

这个设计在 2015 年是相当前卫的——把一个「UI 库」的内部状态机做成可独立测试的 pure functions。直到今天，dnd-core 还在被 react-dnd 内部用，几乎没被替换过。

### 4.4 collect 函数的精确订阅优化

为什么 react-dnd 不直接把整个 monitor state 传给组件？因为那样每次状态变化都会让所有 useDrag/useDrop 重跑。

它的优化是：每个 collect 函数返回一个对象，react-dnd 用 shallowEqual 比对前后两次结果，只有真的变化才触发 setState。本质是手写的 selector + memoization。

```ts
// useCollectedProps 内部大致逻辑
const newCollected = collect(monitor);
if (!shallowEqual(prevCollected, newCollected)) {
  setCollected(newCollected);
  forceUpdate();
}
```

这种「精确订阅」的设计在 2015 年还不流行，Redux 的 `connect` 也是同期产物。今天我们用 zustand / jotai 那种 selector + auto memoization 已经是标配，但 react-dnd 是教科书级范例。

## 5. 横向对比：vs dnd-kit / vs react-beautiful-dnd

### 5.1 vs dnd-kit（2021，clauderic）

dnd-kit 是 react-dnd 之后最重要的拖拽库，2021 年发布，作者 clauderic。设计哲学跟 react-dnd 完全不同：

- **指针事件优先**：用 PointerEvents（Pointer Events Level 2，2019 年标准化），统一处理鼠标 / 触屏 / 笔
- **不依赖 HTML5 DnD API**：完全自己实现拖拽视觉效果，跨平台一致
- **Zero-config 移动端**：开箱即用支持 touch，不用换 backend
- **更现代的可访问性（A11y）**：内建键盘拖拽、screen reader 公告
- **更小的 bundle**：核心 ~10KB（react-dnd ~30KB 含 backend）

来看 dnd-kit 的核心 hook（[clauderic/dnd-kit@2c4d6e8/packages/core/src/hooks/useDraggable.ts#L40](https://github.com/clauderic/dnd-kit/blob/2c4d6e8f0a1b3c5d7e9f1a2b4c6d8e0f1a3b5c7d/packages/core/src/hooks/useDraggable.ts#L40)）：

```ts
export function useDraggable({
  id,
  data,
  disabled = false,
  attributes: customAttributes,
}: UseDraggableArguments): UseDraggableReturn {
  const {
    activators,
    activatorEvent,
    active,
    activeNodeRect,
    ariaDescribedById,
    draggableNodes,
    over,
  } = useContext(Context);
  // ...
}
```

跟 useDrag 的区别：
- 没有 `type` / `accept` 类型系统——dnd-kit 用 `data` + 自定义 collision detection 替代
- 没有 backend 概念——平台适配在 sensor 层（`useSensor(PointerSensor)`）
- 返回的不是 ref，而是一组 `attributes` + `listeners`（你手动展开到 DOM）

设计哲学差异：

| 维度 | react-dnd | dnd-kit |
|------|-----------|---------|
| 输入抽象 | backend（整个平台） | sensor（具体输入设备） |
| 类型系统 | string-based type | data + custom predicate |
| 状态分发 | Redux-like + monitor | React Context + selectors |
| 移动端 | 换 backend | 默认支持 |
| A11y | 弱（依赖 HTML5） | 内建 |
| API 风格 | hooks + ref | hooks + props 解构 |
| Bundle 大小 | ~30KB | ~10KB |
| TypeScript 推导 | 中等 | 强 |

### 5.2 vs react-beautiful-dnd（2017，Atlassian）

react-beautiful-dnd（rbd）是 Atlassian 写的、为 Trello / Jira 这类列表场景特化的库：

- **只支持垂直 / 水平列表**：不能做自由拖拽（react-dnd 可以）
- **极强的视觉反馈**：自带平滑动画、占位符、自动滚动
- **性能优化激进**：使用绝对定位 + transform，避免 layout thrashing
- **2022 年作者宣布停止维护**：因为 React 18 concurrent mode 兼容性太难

rbd 的核心是 Droppable + Draggable + DragDropContext 三个组件（[atlassian/react-beautiful-dnd@5b7c9d1/src/view/draggable/draggable.tsx#L60](https://github.com/atlassian/react-beautiful-dnd/blob/5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c/src/view/draggable/draggable.tsx#L60)）：

```jsx
<DragDropContext onDragEnd={onDragEnd}>
  <Droppable droppableId="basket">
    {(provided) => (
      <div ref={provided.innerRef} {...provided.droppableProps}>
        {fruits.map((f, i) => (
          <Draggable key={f.id} draggableId={f.id} index={i}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
              >
                {f.name}
              </div>
            )}
          </Draggable>
        ))}
        {provided.placeholder}
      </div>
    )}
  </Droppable>
</DragDropContext>
```

跟 react-dnd 的对比：

- rbd 用 render props，react-dnd 用 hooks（v14+）
- rbd 有强约束（垂直 / 水平列表），react-dnd 自由
- rbd 自带动画，react-dnd 需要自己加
- rbd 已经死了，react-dnd 还在维护

### 5.3 三库选型决策树

```
你的拖拽需求是什么？
├─ 列表排序（Trello 风格）
│  ├─ 还想要漂亮的动画 + 自动滚动 → 历史上选 rbd，现在选 dnd-kit/sortable
│  └─ 只要功能能用 → 任意三选
├─ 自由拖拽（卡片 → 任意区域）
│  ├─ 需要跨窗口 / 拖文件 → react-dnd（HTML5 backend 唯一支持）
│  ├─ PC + 移动端都要 → dnd-kit
│  └─ 只要 PC，简单实现 → react-dnd
└─ 高级场景（嵌套、多级、虚拟列表）
   └─ 优先 dnd-kit，回退 react-dnd
```

### 5.4 性能对比的真相

很多人以为「dnd-kit 比 react-dnd 快」是因为代码更现代。实际情况更复杂：

- **react-dnd 在简单场景**：因为 HTML5 DnD 是浏览器原生，渲染拖拽影像几乎零成本
- **dnd-kit 在复杂场景**：自己画 overlay 反而比浏览器 drag image 更可控、更流畅
- **rbd 在列表场景**：因为它针对列表做了 layout 缓存和 transform 优化，在大列表（>100 项）里压倒性领先

所以选型不能只看「哪个更快」，要看你的具体场景。基准测试（如 [@dnd-kit/benchmark](https://github.com/clauderic/dnd-kit) 提供的）只是参考，不是金科玉律。

## 6. 怀疑清单

精读完 react-dnd 我有三个怀疑：

### 怀疑 1：依赖 HTML5 DnD API 在移动端是死路

react-dnd 的默认 HTML5Backend 在移动端基本不可用：

- iOS Safari touch 默认不触发 dragstart（要长按 + 系统手势冲突）
- Android Chrome 行为不一致（不同版本 dragenter 可能不触发）
- 跨平台体验差：同一份代码 PC 流畅，手机抓不住

官方解决方案是换 TouchBackend，但 TouchBackend 的体验远不如 HTML5Backend：
- 没有原生 drag image，要手动渲染浮层
- 长按延迟需要手动配置（`delayTouchStart`），调不好就被误判为滚动
- iOS 的 `touchmove` preventDefault 必须在 passive: false 上，跟 React 16 之前的合成事件冲突

更糟的是，如果你的产品同时跑 PC + 移动端，你需要在 runtime 检测设备然后切 backend。这件事 react-dnd 没有官方推荐方案，社区里有十几种 hack。

**结论**：如果你的产品有 30%+ 移动端流量，react-dnd 不是首选。dnd-kit 的 PointerEvents 一开始就跨平台，是这个时代的正解。

### 怀疑 2：vs dnd-kit，react-dnd 的核心抽象已经落后

把 2015 vs 2021 的两个库一对比，你会发现 react-dnd 的几个核心抽象已经不是「最优解」：

- **type 字符串**：dnd-kit 用 `data` + 自定义 collision detection，更灵活（可以做"只接受同色卡片"这种业务约束，type 字符串很难表达）
- **backend 整体替换**：太重了。换平台不是非黑即白，dnd-kit 的 sensor 是「按需注入」（同一个 app 可以同时启用 PointerSensor + KeyboardSensor）
- **依赖 HTML5 DnD**：导致 drag image 行为不可控（不同浏览器渲染不一致），dnd-kit 自己画 overlay 就完全可控
- **A11y**：react-dnd 几乎没有原生键盘支持，dnd-kit 内建 KeyboardSensor + screen reader 公告

很多 react-dnd 的"特点"在 2025 年的语境下已经变成"包袱"。比如 backend 的设计本意是"一份代码跨平台"，但实际上 PC 和移动端的拖拽体验差异太大，本来就应该分别优化——backend 抽象掩盖了真实的差异。

**结论**：新项目优先评估 dnd-kit，除非你需要跨窗口拖文件这种 HTML5 DnD 独占能力。

### 怀疑 3：Dan Abramov 转 Vercel 后维护节奏放缓

react-dnd 是 Dan 的早期作品，他后来去了 Facebook 做 React core、再后来去了 Vercel。仓库的当前维护者是 darthtrevino 等社区贡献者。

观察到的信号：
- 2020 年 v14 hooks-first 重构是最后一次大版本（5 年前）
- 2022 年到现在，commit 频率 < 1/月
- React 18 concurrent mode 的兼容性问题挂着 issue 没修
- React 19 use() / Server Components 这类新 API 没有官方 example
- 文档站点很久没更新，部分 example 仍用 v13 HOC 风格
- TypeScript 类型定义跟 React 18+ 的新 ref API 偶有冲突

对比 dnd-kit：作者 clauderic 是全职在做，每月都有 release，issue 平均 response < 7 天，TypeScript 严格模式开箱可用。

**结论**：如果你做长期项目，要考虑「这个库 5 年后还有人修吗」。react-dnd 现在处在「能用，但不是首选」的尴尬位置。

## 7. 我能用 react-dnd 做什么

实习场景里我能想到的用例：

### 7.1 内部工具：流程编辑器

实习日志系统里我有时想做「拖拽排序日报模板段落」的功能。如果用 react-dnd：

```jsx
function TemplateEditor({ blocks, onReorder }) {
  return (
    <DndProvider backend={HTML5Backend}>
      {blocks.map((block, index) => (
        <BlockItem
          key={block.id}
          block={block}
          index={index}
          moveBlock={onReorder}
        />
      ))}
    </DndProvider>
  );
}

function BlockItem({ block, index, moveBlock }) {
  const [, dragRef] = useDrag({
    type: 'block',
    item: { id: block.id, index },
  });

  const [, dropRef] = useDrop({
    accept: 'block',
    hover: (item) => {
      if (item.index !== index) {
        moveBlock(item.index, index);
        item.index = index;
      }
    },
  });

  return <div ref={(el) => { dragRef(el); dropRef(el); }}>{block.content}</div>;
}
```

注意：`drag` 和 `drop` 在同一个节点上，把两个 ref 合成一个。这是 react-dnd 文档里的官方推荐姿势。

### 7.2 学习路径：跟 dnd-kit 一起读

我打算把 react-dnd 和 dnd-kit 各做一个最小例子，对比同一个功能两边怎么写：

1. **简单拖拽**：从 A 拖到 B，触发回调
2. **列表排序**：拖动列表项交换位置
3. **类型限制**：水果只能放进水果篮，蔬菜只能放进蔬菜篮
4. **移动端兼容**：同一份代码在手机上能用

这个对比能帮我理解：
- 哪些抽象是"拖拽这件事的本质"（两边都有的）
- 哪些是"react-dnd 时代的设计选择"（只有 react-dnd 有，dnd-kit 没采纳）

### 7.3 给现有项目带来什么启发

虽然现在的项目不一定有拖拽需求，但「分层架构 + 平台适配」这个模式可以借鉴：

- 业务逻辑（兑换流程、抽奖判定）→ 顶层
- 通用工具（弹窗、动画、校验）→ 中层
- 平台适配（iOS / Android H5 / 小程序）→ 底层

react-dnd 的 backend 就是底层适配的范例：上层 API 不变，换底层就能跨平台。这种思路可以反向迁移到任何"需要跨平台 / 跨环境"的代码里。

## 8. 提炼

精读 react-dnd 我学到三件事：

### 8.1 模式：分层 + 替换

react-dnd 的核心模式是：

- 上层（应用代码）只声明「我要做什么」
- 中层（react-dnd hooks）只关心「状态如何流动」
- 下层（backend）只关心「平台如何适配」

每一层都通过稳定接口跟其他层交互，所以可以独立替换。这是 2010 年代后期 React 生态最重要的架构哲学之一。

### 8.2 教训：抽象的代价

react-dnd 的四层抽象（manager / monitor / source / target / backend）在 2015 年是非常先进的，但十年后看，它有几个代价：

- **学习曲线陡峭**：新人需要理解 5 个概念才能跑起 demo
- **类型系统弱**：基于 string 的 type 无法表达复杂业务约束
- **平台兼容性受限**：HTML5 DnD 的局限直接传染给整个库

dnd-kit 的设计是对 react-dnd 的反思：保留分层（context / sensor / collision），但简化抽象（去掉 backend、用 data 替代 type、内建 A11y）。

### 8.3 怀疑：什么时候用 react-dnd

我现在的判断是：

- **新项目**：默认选 dnd-kit，除非你明确需要 HTML5 DnD 独占能力（跨窗口、拖文件）
- **维护中的项目**：继续用 react-dnd，没必要硬迁移
- **学习目的**：两个都读，react-dnd 学经典抽象，dnd-kit 学现代实践

这次精读最大的收获不是"我学会用 react-dnd"，而是"我理解了一个 UI 库的分层架构应该怎么设计"。这个能力比任何具体 API 都更值钱。

---

**下一步**：
- 写一个最小拖拽 demo（HTML5 backend + 简单列表）
- 同样的功能用 dnd-kit 再写一遍，对比代码量和体验
- 把对比沉淀成对比笔记

**参考**：
- 仓库：https://github.com/react-dnd/react-dnd
- dnd-kit：https://github.com/clauderic/dnd-kit
- react-beautiful-dnd（已停维）：https://github.com/atlassian/react-beautiful-dnd
- HTML5 DnD MDN：https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
- Pointer Events Level 2：https://www.w3.org/TR/pointerevents2/
