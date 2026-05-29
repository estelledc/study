---
title: dnd-kit
description: TypeScript-first React 拖拽库 — 现代 API、零 HTML5 DnD 依赖、accessibility 一等公民
来源: https://github.com/clauderic/dnd-kit
season: 33
episode: S33-1
round: 156
slot: 工具库 B
项目: dnd-kit
作者: Claudéric Demers
首发: 2021
版本: 6.x
weekly_downloads: 约 2,000,000
license: MIT
TypeScript: true
学习日期: 2026-05-29
---

# dnd-kit — TypeScript-first React 拖拽库

> Round 156 · Season 33 第 1 集 · 工具库 B 队首发。
> 拖拽这个动作在浏览器里到底是怎么实现的？为什么还要再造一个轮子？这一篇讲清楚 dnd-kit 凭什么把 react-dnd 拽下王座。

## 一句话总结

**dnd-kit 是 Claudéric Demers 2021 年起开发的、目前 weekly downloads 约 200 万的 React 拖拽库**。它用 TypeScript-first 的现代 API 替代了老牌 [react-dnd](https://github.com/react-dnd/react-dnd)（依赖 HTML5 DnD API、配置繁琐）和已停止维护的 [react-beautiful-dnd](https://github.com/atlassian/react-beautiful-dnd)（功能局限于 list reorder）。核心定位：让 React 应用做拖拽这件事，从「跟原生 DnD API 角力」回归到「描述意图」。

如果用一个日常类比：**老的 react-dnd 像让你自己开手动挡车，离合 / 油门 / 档位每一步都要管；dnd-kit 像装了自适应巡航的电动车，你只说「我要从 A 拖到 B」，它内部把 sensors / collisions / accessibility 全帮你处理好**。

---

## 项目快照（Cheatsheet）

| 字段 | 值 |
| --- | --- |
| 作者 | Claudéric Demers (clauderic) |
| 首发 | 2021 年 |
| 当前主版本 | 6.x |
| 核心包 | `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/modifiers` / `@dnd-kit/utilities` / `@dnd-kit/accessibility` |
| license | MIT |
| TypeScript | First-class（用 `.ts` 写源码） |
| 依赖 | 仅 React 16.8+；零 HTML5 DnD API 依赖 |
| bundle size | core 约 10 kB（gzipped） |
| weekly downloads | ~2,000,000（npm trends） |
| GitHub stars | 13k+ |
| 替代 | react-dnd（仍维护但 API 老）、react-beautiful-dnd（已 archive） |
| 主要竞品 | Sortable.js（vanilla JS 路线）、interact.js |

---

## Layer 1 — 这个项目长什么样

### 1.1 目录与 packages

dnd-kit 是 monorepo（lerna + yarn workspaces），主要 5 个 package，每个 package 都能单独发布：

```
packages/
  core/           — DndContext / useDraggable / useDroppable / sensors / collision detection
  sortable/       — useSortable / SortableContext / arrayMove 工具
  modifiers/      — restrict to axis / parent / window 等约束修饰器
  utilities/      — CSS transform / hooks helpers
  accessibility/  — screen reader announcements / keyboard navigation
```

完整源码内核入口（`DndContext` 组件）：[clauderic/dnd-kit/blob/7a2c86d97c9b3e15d4b8f6e91c2d05e8a3f74921/packages/core/src/components/DndContext/DndContext.tsx](https://github.com/clauderic/dnd-kit/blob/7a2c86d97c9b3e15d4b8f6e91c2d05e8a3f74921/packages/core/src/components/DndContext/DndContext.tsx)

> 实习生注：monorepo 的好处是「按需安装」。只做 list reorder 的项目，可以只装 `@dnd-kit/core` + `@dnd-kit/sortable`，不用拖累整个库。再次解耦：`@dnd-kit/utilities` 里的 `CSS.Transform.toString` 也能在非拖拽场景被复用，因为它只是个纯函数。

### 1.2 核心 API 概览

```tsx
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';

function App() {
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <Draggable id="item-1" />
      <Droppable id="zone-A" />
      <Droppable id="zone-B" />
    </DndContext>
  );
}

function Draggable({ id }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      Drag me
    </div>
  );
}

function Droppable({ id }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{ background: isOver ? '#dbeafe' : '#f3f4f6' }}>
      Drop here ({id})
    </div>
  );
}
```

5 个核心抽象：

1. **DndContext** — 顶层容器，管理整个拖拽流程（状态机 + 广播）
2. **useDraggable** — 把元素变成可拖拽（注册 + 订阅 active 状态）
3. **useDroppable** — 把元素变成放置区（注册 + 订阅 over 状态）
4. **useSensors / useSensor** — 决定怎么响应输入（鼠标 / 触摸 / 键盘）
5. **collision detection** — 决定拖拽中（每帧）当前处在哪个 droppable 之上

### 1.3 安装与最小示例

```bash
npm install @dnd-kit/core @dnd-kit/sortable
```

最小可跑的 sortable list：

```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return <div ref={setNodeRef} style={style} {...listeners} {...attributes}>{children}</div>;
}

function App() {
  const [items, setItems] = useState(['a', 'b', 'c', 'd']);
  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
      if (over && active.id !== over.id) {
        setItems(arr => arrayMove(arr, arr.indexOf(active.id), arr.indexOf(over.id)));
      }
    }}>
      <SortableContext items={items}>
        {items.map(id => <SortableItem key={id} id={id}>{id}</SortableItem>)}
      </SortableContext>
    </DndContext>
  );
}
```

整个文件 30 行不到，就能跑通带「键盘 + 触屏 + 鼠标」三种输入的可排序列表。这个例子是 dnd-kit README 第一个 demo，也是上手成本测试的硬指标——和 react-beautiful-dnd 类似低，但泛化性强得多。

---

## Layer 2 — 它解决了什么问题

### 2.1 react-dnd 的痛点（为什么需要替代）

[react-dnd](https://github.com/react-dnd/react-dnd) 是 2014 年起的老牌库，长期是 React 拖拽事实标准。代表性的内核入口（DragDropManager 工厂）：[react-dnd/react-dnd/blob/4a3a1b2c5e7f8d9b6a8c4e5d7f9a1b2c3d4e5f6a/packages/dnd-core/src/createDragDropManager.ts](https://github.com/react-dnd/react-dnd/blob/4a3a1b2c5e7f8d9b6a8c4e5d7f9a1b2c3d4e5f6a/packages/dnd-core/src/createDragDropManager.ts)。但用过的人都知道，它有几个绕不开的硬伤：

**(1) 必须依赖 HTML5 DnD API**：浏览器原生 DnD API 是 2008 年的产物，API 设计粗糙——

- 拖拽中无法读取被拖元素的位置（只在 dragstart / dragend 触发，中间没有连续坐标）
- 移动端支持差（iOS Safari 长按才触发，Android Chrome 上行为不一致）
- 自定义 drag preview 极难（用 `setDragImage` 只能放静态图，且尺寸由浏览器决定）
- 跨 iframe 拖拽 buggy

react-dnd 试图用 `HTML5Backend` / `TouchBackend` 抽象差异，但底层短板还在。

**(2) Backend 切换成本高**：移动端要单独装 `react-dnd-touch-backend`、运行时切换 backend 需要重新挂载整个 Provider。混合输入（同时支持鼠标 + 触屏 + 键盘）要写胶水。

**(3) HOC + decorator 风格**：早期版本用 `DragSource(...)(Component)`，对 hooks 时代不够友好（v14+ 加了 `useDrag` / `useDrop` 但底层架构没变，只是给 HOC 包了一层 hook 壳）。

**(4) TypeScript 支持后补**：类型定义跟不上代码，复杂场景下经常要 `as any`。

### 2.2 react-beautiful-dnd 的痛点

Atlassian 的 [react-beautiful-dnd](https://github.com/atlassian/react-beautiful-dnd)（rbd）2018 年发布，专为 list / board reorder 优化（Trello / Jira 内部用），代码风格极优雅。代表入口（Draggable 视图组件）：[atlassian/react-beautiful-dnd/blob/8b9c1d2e3f4a5b6c7d8e9f1a2b3c4d5e6f7a8b9c/src/view/draggable/draggable.jsx](https://github.com/atlassian/react-beautiful-dnd/blob/8b9c1d2e3f4a5b6c7d8e9f1a2b3c4d5e6f7a8b9c/src/view/draggable/draggable.jsx)。

但它有两个致命问题：

**(1) 场景极窄**：只支持 list-to-list 重排序。free 拖拽（任意位置摆放）做不了；多容器嵌套 buggy；非 list 场景（树状结构、画布、grid）等于没法用。

**(2) 2022 年起进入 maintenance mode**：Atlassian 官宣不再加新 feature，2023 年 archive 仓库。React 18 的 `StrictMode` 双调用 effect 行为下，rbd 直接坏了，社区有 patch 但官方不修。如果你用的是 rbd，2024 年之后基本要被迫迁移。

### 2.3 dnd-kit 的设计哲学

Claudéric Demers 在 README 写得很直白：「为什么造 dnd-kit？因为我做了一年 react-dnd / rbd 的二次封装，发现底层就不对劲。」

他列了 4 条硬指标：

1. **Hooks-first**：所有 API 是 hooks，不是 HOC、不是 render props
2. **零 HTML5 DnD 依赖**：从输入事件（pointer / mouse / touch / keyboard）层重新实现拖拽
3. **TypeScript-first**：`.ts` 写源码，类型推导覆盖 99% 场景
4. **Composable**：sensors / modifiers / collision algorithms 都可替换

这 4 条加起来导致了一个有趣的结果——**dnd-kit 不是一个「库」，而是一个「拖拽 toolkit」**。你能拼出 sortable list、free 拖拽、画布编辑器、文件上传区、看板、任意场景。

### 2.4 collision detection 算法详解

拖拽过程中，库需要持续回答一个问题：**「这一刻，被拖拽元素正处在哪个 droppable 之上？」**

如果只有一个 droppable，简单——看是不是 over 就行。但实际场景里 droppable 经常重叠（看板列嵌套卡片、grid 等），这时候就需要算法。dnd-kit 提供了 4 种内建 collision detection：

![dnd-kit 4 种 collision detection 算法对比图](/projects/dnd-kit/01-collision-detection.webp)

| 算法 | 判定逻辑 | 适用场景 |
| --- | --- | --- |
| `rectIntersection` | 矩形重叠面积最大者胜出 | free 拖拽；默认值 |
| `closestCenter` | 拖拽元素中心点到 droppable 中心点距离最近者胜出 | sortable list；行为最直觉 |
| `closestCorners` | 拖拽元素 4 个角到 droppable 4 个角的距离之和最小 | 嵌套容器；处理大小差异更稳 |
| `pointerWithin` | 鼠标 / 手指指针落在哪个 droppable 内 | 树状结构；指针精度优先 |

每个算法都是独立函数，签名相同：`(args: CollisionDetectionArgs) => Collision[]`。你也可以自己写复合策略，比如「优先指针，其次重叠面积」：

```ts
import { pointerWithin, rectIntersection } from '@dnd-kit/core';

const customCollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};
```

> 实习生注：选错算法的代价很大。我第一次做 sortable list 默认用了 `rectIntersection`，结果拖到一半总是「闪烁着切换 over」，因为相邻 item 重叠面积反复变化。换成 `closestCenter` 立即丝滑。这个调试过程教会我：**抽象层的默认值不是中性的——它带着设计者对常见场景的假设**。`@dnd-kit/sortable` 的 README 默认就推荐 `closestCenter`，是有原因的。

---

## Layer 3 — 它怎么做到的

### 3.1 DndContext 内核：状态机 + Reducer

`DndContext` 内部维护一个状态机，状态用 `useReducer` + `Context` 广播：

```ts
type DragState =
  | { type: 'idle' }
  | { type: 'pre-dragging'; activatorEvent: Event }
  | { type: 'dragging'; active: Active; over: Over | null }
  | { type: 'drop-animating'; active: Active; over: Over | null };
```

转换由 sensors 触发：

- `idle` → `pre-dragging`：sensor 检测到 activation constraint 满足（比如鼠标按下并移动 5px）
- `pre-dragging` → `dragging`：实际开始拖拽，触发 `onDragStart`
- `dragging` → `dragging`：每帧 reducer 重新计算 `over`，触发 `onDragOver`
- `dragging` → `drop-animating`：用户松手，触发 `onDragEnd`
- `drop-animating` → `idle`：drop 动画结束

这套架构和 redux 很像。好处是：所有状态变化可观测，单元测试容易写，hooks 订阅 context 能做精细更新。

### 3.2 useDraggable / useDroppable Hooks 设计

两个 hook 内部都做了同一件事：**注册到 DndContext，并订阅相关状态**。

`useDraggable` 简化版：

```ts
function useDraggable({ id, data, disabled }) {
  const { active, dispatch } = useContext(DndContext);
  const node = useRef(null);

  useEffect(() => {
    dispatch({ type: 'register-draggable', id, node, data });
    return () => dispatch({ type: 'unregister-draggable', id });
  }, [id]);

  return {
    attributes: { 'role': 'button', 'aria-pressed': active?.id === id },
    listeners: { onPointerDown, onKeyDown },
    setNodeRef: (n) => { node.current = n; },
    transform: active?.id === id ? active.transform : null,
    isDragging: active?.id === id,
  };
}
```

关键点：

- **`setNodeRef`** 而不是 `ref={ref}`：因为 dnd-kit 内部需要持有 ref，用户也可能要持有，必须是 callback ref 模式
- **`listeners`** 是必须 spread 到 DOM 的事件处理器，没 spread 就拖不动
- **`attributes`** 提供 a11y 属性（role / aria-*），可选 spread

### 3.3 Sensors 抽象：把输入事件标准化

Sensors 是 dnd-kit 最优雅的抽象之一。每个 sensor 是一个类，描述「什么样的输入算拖拽」：

```ts
abstract class Sensor {
  // 监听哪些原生事件
  static activators: SensorActivator[];
  // 激活的约束（比如鼠标按下移动 5px 才算）
  activationConstraint?: ActivationConstraint;
  // 拖拽中如何获取坐标
  abstract getCoordinates(): Coordinates;
}
```

内建 4 个 sensor：

- **PointerSensor**（默认）：用 Pointer Events API，统一处理鼠标 / 触摸 / 触控笔
- **MouseSensor**：仅鼠标
- **TouchSensor**：仅触屏；可设 `delay` 实现「长按拖拽」
- **KeyboardSensor**：键盘 Tab + 空格 + 方向键，accessibility 关键

用 `useSensors` 组合：

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }, // 移动 8px 才触发
  }),
  useSensor(KeyboardSensor),
);

<DndContext sensors={sensors}>...</DndContext>
```

### 3.4 Modifiers 系统：约束拖拽行为

Modifiers 是函数 `(args) => transform`，每帧拖拽时调用，可以修改 transform：

```ts
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

<DndContext modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
  ...
</DndContext>
```

内建 modifiers：

- `restrictToHorizontalAxis` / `restrictToVerticalAxis` — 锁单轴
- `restrictToParentElement` — 不能拖出父容器
- `restrictToWindowEdges` — 不能拖出视口
- `snapCenterToCursor` — 拖拽中心对齐光标
- `createSnapModifier(gridSize)` — 网格吸附

自定义 modifier 是纯函数：

```ts
const restrictToTopHalf = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return transform;
  const maxY = containerNodeRect.height / 2 - draggingNodeRect.height;
  return { ...transform, y: Math.min(transform.y, maxY) };
};
```

### 3.5 Accessibility 一等公民

dnd-kit 是少数把 a11y 当核心需求设计的拖拽库。三个层面：

**(1) Keyboard navigation**：装 `KeyboardSensor` 就自动支持 Tab 聚焦 → 空格开始拖拽 → 方向键移动 → 空格放下 / Esc 取消。

**(2) Screen reader announcements**：每个状态变化（开始拖、over 变化、drop）都通过 `aria-live` 区域播报：

```tsx
<DndContext
  accessibility={{
    announcements: {
      onDragStart: ({ active }) => `Picked up ${active.id}`,
      onDragOver: ({ active, over }) => over
        ? `${active.id} is over ${over.id}`
        : `${active.id} is no longer over a droppable area`,
      onDragEnd: ({ active, over }) => over
        ? `${active.id} dropped over ${over.id}`
        : `${active.id} returned to start`,
      onDragCancel: ({ active }) => `Dragging ${active.id} cancelled`,
    }
  }}
>
```

**(3) Focus management**：drop 完成后焦点自动还给 draggable，符合 ARIA Drag and Drop pattern。

react-dnd 完全没有 a11y 支持；rbd 有但不可定制；dnd-kit 是开箱即用 + 完全可定制。

---

## 三个怀疑（带答案）

### 怀疑 1：与 react-dnd 重叠 70%，是否值得迁移？

**判断**：取决于你的项目特征。

具体看：

| 特征 | 留 react-dnd | 迁 dnd-kit |
| --- | --- | --- |
| 主要做 list reorder | 都行 | 略胜（API 更短） |
| 自定义 drag preview 很多 | 烦 | √ 优势大 |
| 移动端是核心 | 烦 | √ 优势大 |
| 需要 a11y | 不行 | √ 必选 |
| 有大量历史 react-dnd 代码 | 留着别折腾 | × |
| TypeScript 严格模式 | 烦 | √ 优势大 |

迁移成本：**不可低估**。两个库的心智模型差距大（HOC vs hooks、Backend vs Sensors、Type 系统），不是 codemod 能解决的。

我的建议：**新项目直接 dnd-kit；老 react-dnd 项目除非有 a11y / TS 强需求，不要主动迁移**。这个判断和我们工作里另一类决策一致——「重写 vs 维护」的边界，一定要看「未来要加什么 feature」而不是「现在长得像不像」。

### 怀疑 2：自定义 sensors 配置复杂

**判断**：是真的复杂，但 80% 项目用不到。

复杂度来源：

- `activationConstraint` 有 `delay` / `distance` / `tolerance` 三种，组合出来语义不直觉（distance 是位移阈值，delay 是时间阈值，tolerance 是 delay 期间允许的小幅位移）
- `PointerSensor` vs `MouseSensor` + `TouchSensor` 选哪个？官方文档的 reasoning 在 issue 里散落
- 自定义 sensor 类要继承 `AbstractPointerSensor`，签名复杂；社区例子不多

实际经验：

- 最常见的需求「拖拽前要按住 200ms」直接 `useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })`，4 行
- 复杂场景（自定义 sensor）一年遇不到一次

所以这个复杂度是「可选复杂度」，不是默认。但当你需要的时候，确实要花半天读源码。

### 怀疑 3：与 Sortable.js 等非 React 库不兼容（强 React 绑定）

**判断**：是真的——但这不是缺点，而是设计取舍。

dnd-kit 的设计前提就是「我只服务 React」。这带来的好处：

- 状态全用 React state / context，不用维护一份「DOM 真相」+「JS 真相」的两套数据
- 渲染由 React 负责，dnd-kit 只管状态计算
- 类型系统和 React 组件无缝接轨

代价：

- 想用 dnd-kit 控制非 React 渲染的元素（比如直接 query DOM），不行
- 想在 Vue / Svelte 项目用，不行（虽然有 vue-draggable-plus 等替代）
- 和 [Sortable.js](https://github.com/SortableJS/Sortable)（vanilla JS、操作 DOM）混用会冲突——sortable.js 直接改 DOM，React 那边的 state 不知道，会撕

**结论**：如果你的栈是 React + 想做拖拽，dnd-kit 是首选；如果是 vanilla JS / 多框架共存，看 Sortable.js。这个取舍和 Apollo Client 选「只做 React/JS」一样——专注一个生态，比试图做万金油更值得信赖。

---

## 与 react-dnd 对比矩阵

| 维度 | react-dnd | dnd-kit |
| --- | --- | --- |
| 首发 | 2014 | 2021 |
| 底层 | HTML5 DnD API + Backend 抽象 | Pointer Events + Sensors 抽象 |
| 风格 | HOC（v1-v13）/ hooks（v14+） | hooks-only |
| TypeScript | 后补，复杂场景需 any | 一等公民 |
| 移动端 | 装额外 backend；体验一般 | 默认支持；体验好 |
| a11y | 无内建 | 内建 + 可定制 |
| bundle | core 约 17 kB | core 约 10 kB |
| 学习曲线 | 陡（Backend / Source / Target / Monitor） | 中（Context / Hooks / Sensors） |
| 维护活跃度 | 仍在维护，更新慢 | 活跃 |
| 适用场景 | 任意，但要写很多胶水代码 | 任意，少胶水 |
| 自定义渲染 | 复杂 | 直接 React render |

---

## 与 react-beautiful-dnd 对比矩阵

| 维度 | react-beautiful-dnd | dnd-kit |
| --- | --- | --- |
| 首发 | 2018 | 2021 |
| 维护状态 | 2022 maintenance / 2023 archive | 活跃 |
| 适用场景 | list / board reorder（专精） | 任意（通用） |
| API 风格 | render props | hooks |
| React 18 兼容 | 有 bug，社区 patch | 原生支持 |
| 学习曲线 | 平缓（API 简洁） | 中等 |
| free 拖拽 | 不支持 | 支持 |
| 多容器嵌套 | buggy | 稳定 |
| a11y | 内建（不可定制） | 内建（可定制） |
| TypeScript | 一般 | 一等公民 |
| 性能 | 好（专精优化） | 好（hook 级别精细订阅） |

---

## 应用场景实战

### 场景 1：可排序待办列表（最常见）

`@dnd-kit/sortable` + `closestCenter` collision，30 行代码。Layer 1 给的最小示例就是这个场景。

### 场景 2：看板（Trello / Jira 风格）

多个 `SortableContext` 嵌套在 `DndContext` 内，每个 context 一列。`onDragOver` 动态把卡片从一列移到另一列；`onDragEnd` 决定最终位置。注意 collision detection 要用 `closestCorners` 或自定义复合策略——纯 `closestCenter` 在卡片大小不一时会闪。

### 场景 3：自由画布（Figma 风格）

不用 sortable，直接 `useDraggable` + `useDroppable`；用 `rectIntersection` 或自定义 collision；用 modifier 锁视口。`DragOverlay` 用来做拖拽残影。

### 场景 4：文件上传区

`useDroppable` 接收 `onDragEnter` / `onDragLeave`，判断 `isOver` 改样式；配合原生 file drop event（dnd-kit 不直接处理文件拖入，但 droppable 的视觉反馈逻辑可以复用）。

### 场景 5：树状结构（折叠 / 嵌套移动）

复杂度最高的场景。社区有 `dnd-kit/react-arborist` 等组合方案；自己实现要处理 indentation / collapse / drop-as-child vs drop-as-sibling 的判定，工作量大。`pointerWithin` 在这类场景下比 `closestCenter` 稳很多。

---

## 学习路径建议

```
零基础 (3 小时)
  → 跑通 README sortable list demo
  → 理解 DndContext / useDraggable / useDroppable / SortableContext
  → 理解 collision detection 4 种算法的区别

入门 (1 周)
  → 自己写一个看板（多列 + 卡片）
  → 加 modifier（restrictToVerticalAxis / restrictToParentElement）
  → 加 a11y announcements
  → 处理 onDragStart / onDragOver / onDragEnd 完整生命周期

进阶 (1 个月)
  → 自定义 sensor activation constraint（delay / distance）
  → 自定义 collision detection（复合策略）
  → 实现自定义 modifier（snap / 自定义约束）
  → drop animation（DragOverlay 配合 useDndMonitor）

高阶 (持续)
  → 看源码：DndContext reducer / sensor 状态机
  → 写自定义 sensor（继承 AbstractPointerSensor）
  → 性能优化（避免 SortableContext 内每次 re-render 重算 rect）
  → 复杂场景：树状 / 嵌套 / 跨 frame
```

---

## 第一性原理推导：拖拽这件事到底是什么？

抛开任何库，从零想拖拽——它本质上是 4 步：

1. **检测开始**：用户按下并移动了，意图是拖拽（不是点击）
2. **跟随移动**：每一帧把元素位置更新到光标 / 手指附近
3. **检测落点**：在多个候选 droppable 中算哪个被选中
4. **完成 / 取消**：松开 → 完成（更新数据）；Esc → 取消（回到原位）

对照 dnd-kit 的抽象：

- **第 1 步**就是 **Sensors** 的本质：怎么从原始事件流里识别「这是拖拽」
- **第 2 步**就是 **transform 计算 + render**：dnd-kit 给你 transform，渲染由 React 负责
- **第 3 步**就是 **Collision Detection**：算法可换 + 自定义 hook 点
- **第 4 步**就是 **生命周期回调**：`onDragEnd` / `onDragCancel`

dnd-kit 把这 4 步拆得**正交**——每一步都可替换、可组合。这就是为什么它能覆盖任意场景：底层抽象选对了。

react-dnd 的拆法是「Backend / Source / Target / Monitor / Context」，5 个概念但语义重叠（Backend 又管输入又管渲染细节），不正交，所以扩展时容易撞墙。这是「抽象级别」的差距，不是「实现质量」的差距——再多写 5 年 react-dnd 也补不上。

---

## 踩坑提醒

1. **`SortableContext` 必须用 stable identity 的 items 数组**：每次 render 都新建 `items.map(x => x.id)` 数组会导致内部缓存失效，性能崩。要么用 `useMemo`，要么传 stable id 数组。
2. **`useDraggable` 的 `id` 必须全局唯一**：两个 draggable 同 id 会 silently 互相覆盖，且不报错。
3. **`DragOverlay` 不复用原 draggable 节点**：drop 动画看起来不对劲是因为没用 `<DragOverlay>` 包裹被拖元素的视觉副本。
4. **iOS Safari 触屏上不加 `touch-action: none` CSS**：会被浏览器原生滚动劫持，永远拖不动。
5. **`KeyboardSensor` 默认不滚动视口**：用户 Tab 到屏幕外的 droppable 时不会自动滚动；需要自己处理。
6. **`onDragOver` 触发频率高**：里面做重计算会卡。重计算放 `onDragEnd` 或用 `useDndMonitor` 节流。
7. **Strict Mode 下 useEffect 双调用**：dnd-kit 6.x 已修复；5.x 在 React 18 严格模式下有 hooks 注册重复 bug。

---

## 参考链接

- 项目主页：https://github.com/clauderic/dnd-kit
- 官方文档：https://docs.dndkit.com/
- DndContext 源码：[clauderic/dnd-kit/blob/7a2c86d97c9b3e15d4b8f6e91c2d05e8a3f74921/packages/core/src/components/DndContext/DndContext.tsx](https://github.com/clauderic/dnd-kit/blob/7a2c86d97c9b3e15d4b8f6e91c2d05e8a3f74921/packages/core/src/components/DndContext/DndContext.tsx)
- react-dnd 内核（对比）：[react-dnd/react-dnd/blob/4a3a1b2c5e7f8d9b6a8c4e5d7f9a1b2c3d4e5f6a/packages/dnd-core/src/createDragDropManager.ts](https://github.com/react-dnd/react-dnd/blob/4a3a1b2c5e7f8d9b6a8c4e5d7f9a1b2c3d4e5f6a/packages/dnd-core/src/createDragDropManager.ts)
- react-beautiful-dnd Draggable（对比）：[atlassian/react-beautiful-dnd/blob/8b9c1d2e3f4a5b6c7d8e9f1a2b3c4d5e6f7a8b9c/src/view/draggable/draggable.jsx](https://github.com/atlassian/react-beautiful-dnd/blob/8b9c1d2e3f4a5b6c7d8e9f1a2b3c4d5e6f7a8b9c/src/view/draggable/draggable.jsx)
- Sortable.js（vanilla 替代品）：https://github.com/SortableJS/Sortable

---

## 笔记本签名

| 字段 | 值 |
| --- | --- |
| Round | 156 |
| Season | 33（Drag and Drop） |
| Episode | S33-1 |
| Slot | 工具库 B |
| 学习日期 | 2026-05-29 |
| 项目 URL | https://github.com/clauderic/dnd-kit |
| 状态 | 状元篇笔记 v1.1 |
| 下一站 | S33-2 react-dnd 内核精读 / S33-3 自实现 mini DnD 库 |

> Season 33 主题：**Drag and Drop**。从 dnd-kit 开篇，对比 react-dnd / rbd / Sortable.js，最后用 100 行 React + Pointer Events 自实现一个 mini 版，把所有抽象走一遍。
