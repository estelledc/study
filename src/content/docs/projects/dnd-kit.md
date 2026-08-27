---
title: dnd-kit — 可换框架的拖拽 toolkit（React 适配 0.5.0）
description: 把拖拽拆成 abstract manager + DOM sensors + 框架适配；固定阅读 @dnd-kit/react 0.5.0
来源: https://github.com/clauderic/dnd-kit
日期: 2026-08-27
分类: 前端交互
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/clauderic/dnd-kit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cc98bdd52c06e55221e8cf77aaa0c2ec0f55b86f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.5.0
---

## 是什么

dnd-kit 是一套**把拖拽拆成 manager、sensor、collision、框架适配**的 toolkit。日常类比：旧笔记里的 `@dnd-kit/core` 6.x 像一辆已经量产的 React 专用车；固定 `0.5.0` 是同一仓库的重写线——底盘在 `@dnd-kit/abstract`，方向盘在 `@dnd-kit/dom`，React 只是其中一块仪表盘。

```tsx
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

<DragDropProvider onDragEnd={(event) => {
  if (event.canceled) return;
  setParent(event.operation.target?.id ?? null);
}}>
  <Draggable />
  <Droppable />
</DragDropProvider>
```

同一提交里还有 `@dnd-kit/vue` / `@dnd-kit/solid` / `@dnd-kit/svelte` 的 0.5.0 包。本文只读 React 适配，不把它们写成已验证运行时。

## 为什么重要

不区分 rewrite 和仍在 npm 上的 6.x，下面这些事会对不上：

- 为什么顶层组件叫 `DragDropProvider`，不再叫 `DndContext`
- 为什么 collision 默认是 `pointerIntersection ?? shapeIntersection`，而不是旧的 `closestCenter`
- 为什么键盘、指针、无障碍都是 DOM 插件，而不是 React Context 里的一组 hooks
- 为什么「同一 id 既是 source 又是 target」时，源码测试强制 `dragstart` 早于 `dragover`

一句话：读 0.5.0 是为了看当前 canonical 仓库的合同；6.x 是另一条仍在发布的旧线。

## 核心要点

固定源码的主链可以拆成五步：

1. **Provider 创建 manager**：`DragDropProvider` 默认 `new DragDropManager(input)`。`defaultPreset.sensors` 是 `PointerSensor` + `KeyboardSensor`；plugins 是 Accessibility、AutoScroller、Cursor、Feedback、PreventSelection；manager 还会再前置 ScrollListener、Scroller、StyleInjector。默认 modifiers 是空数组。

2. **hooks 登记实体**：`useDraggable` / `useDroppable` / `useSortable` 构造 `@dnd-kit/dom` 的实体，用 callback `ref` 挂 DOM。sortable 从 `@dnd-kit/react/sortable` 导入，不是独立的 `@dnd-kit/sortable` 包。

3. **Sensor 决定何时开始**：Pointer 默认——鼠标点在 handle 上立即激活；touch 是 Delay 250ms / tolerance 5；文本输入 Delay 200ms / tolerance 0；其余 Delay 200ms / tolerance 10 再叠加 Distance 5。交互元素默认 `preventActivation`。Keyboard 默认 `offset=10`，`Space`/`Enter` 开始，`Escape` 取消。

4. **Collision 决定落点**：`useDroppable` 没传 `collisionDetector` 时走 `defaultCollisionDetection`：先看指针相交，否则看形状相交。

5. **应用改数据**：`@dnd-kit/helpers` 的 `move` / `swap` 只在 `dragover`/`dragend` 上返回新数组。库不持有你的 list state。

状态枚举是 `idle → initialization-pending → initializing → dragging → dropped`。事件包括可取消的 `beforedragstart`、`dragmove`、`dragover`、`collision`，以及不可取消的 `dragstart`。

## 实践示例

### 案例 1：最小放置

```tsx
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

function Card() {
  const { ref } = useDraggable({ id: 'card' });
  return <div ref={ref}>card</div>;
}
function Zone() {
  const { ref, isDropTarget } = useDroppable({ id: 'zone' });
  return <div ref={ref} data-over={isDropTarget}>zone</div>;
}
```

`onDragEnd` 读的是 `event.operation.target?.id` 和 `event.canceled`，不是 6.x 的 `{ active, over }`。

### 案例 2：排序用 helpers，不手写 splice

```tsx
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';

function Item({ id, index }) {
  const { ref } = useSortable({ id, index });
  return <li ref={ref}>{id}</li>;
}

<DragDropProvider onDragEnd={(event) => setItems((items) => move(items, event))}>
  {items.map((id, index) => <Item key={id} id={id} index={index} />)}
</DragDropProvider>
```

`move` 认 id，也对带 `initialIndex` / `index` / `group` 的 sortable 实体做乐观位置对账。跨组时按指针相对 target 中心决定插入上下。

### 案例 3：键盘是一等 sensor

不传 `sensors` 时，`KeyboardSensor` 已经在 preset 里。默认方向键每次移动 10px；`Space`/`Enter`/`Tab` 结束。Accessibility 插件默认给 handle `role="button"`、`tabIndex={0}`，并用 `dnd-kit-announcement-*` live region 播报。

## 踩过的坑

1. **把 6.x 教程贴到 0.5.0**：本 checkout 没有 `@dnd-kit/core`、`DndContext`、`closestCenter`、`arrayMove`（旧 utilities）。那些属于 `master` 上的 `@dnd-kit/core@6.3.1`（`e9215e82...`）。

2. **以为默认立刻开拖**：除「鼠标点在自己的 handle」外，Pointer 默认带 delay/distance。触摸默认先等 250ms。

3. **在按钮/输入框上拖父节点**：`preventActivation` 看到交互元素会拦住，除非 target 就是 source 或 handle。

4. **卸载正在拖的节点**：`ref` 在 `!status.idle` 且旧节点仍 `isConnected` 时会忽略 `null`，避免拖拽中把 element 清掉。

5. **同一 id 既拖又放**：测试要求 `dragstart` 先于 `dragover`。Feedback 插件只在 `initialized && !initializing` 时设置 drag shape。

## 适用 vs 不适用场景

**适用**：

- React 18/19 项目，接受 `@dnd-kit/react` 0.5.0 的 Provider/hooks 合同
- 需要指针、键盘和无障碍作为默认插件，而不是事后补丁
- 列表、放置区、自由画布共用同一 manager，数据仍由应用持有

**不适用**：

- 还在跟 6.x `@dnd-kit/core` / `@dnd-kit/sortable` 例子走的代码——那是另一条 npm 线
- 非 React 运行时却只装 `@dnd-kit/react`（同提交有 vue/solid/svelte 包，本文未读它们的运行合同）
- 需要列表自己管理数组、自带动画时长公式的看板库——对照 [[hello-pangea-dnd]]

## 固定版本边界

- 本文绑定 `clauderic/dnd-kit@cc98bdd52c06e55221e8cf77aaa0c2ec0f55b86f`。annotated tag `@dnd-kit/react@0.5.0` 与 npm `gitHead` 一致。
- 同提交上 `@dnd-kit/dom`、`abstract`、`collision`、`helpers`、`state` 也是 `0.5.0`。
- `@dnd-kit/react` peer 为 `react` / `react-dom` `^18.0.0 || ^19.0.0`。
- 旧线 `@dnd-kit/core@6.3.1` 仍在 npm，tag 指向 `e9215e82...`，不在本包图里。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **仓库默认分支不等于还在用的旧包名**——canonical GitHub 现在是 rewrite；教学必须写清读的是哪一条线。
2. **框架适配应该薄**——React hooks 只登记实体和转发事件，sensor/collision/a11y 在 DOM 层。
3. **默认激活策略是产品决策**——delay/distance/交互元素拦截都写在 PointerSensor defaults 里。
4. **列表数据不属于 toolkit**——`move` 是纯函数，`event.canceled` 时可以直接不改数组。

## 应用型自测

1. 固定 0.5.0 的顶层组件还叫 `DndContext` 吗？
2. 未自定义时，触摸开始拖拽的默认 delay 是多少？
3. `useDroppable` 不传 `collisionDetector` 时，先用哪种算法？

检查点：

1. 不叫。React 入口是 `DragDropProvider`。
2. 250ms，tolerance 5。
3. `pointerIntersection`，没有命中再退回 `shapeIntersection`。

## 延伸阅读

- 固定源码：[clauderic/dnd-kit](https://github.com/clauderic/dnd-kit) —— 本文绑定提交 `cc98bdd52c06e55221e8cf77aaa0c2ec0f55b86f`
- 官方文档：[dndkit.com/react](https://dndkit.com/react)
- 共享审查记录：`docs/drag-drop-source-review-20260827-bi.md`
- [[hello-pangea-dnd]] —— 列表/看板 render-props 对照
- [[react-dnd]] —— 更早的 backend 四层模型

## 关联

- [[hello-pangea-dnd]] —— 专精列表重排，Redux + render-props
- [[react-dnd]] —— HTML5 backend 前辈
- [[sortablejs]] —— 直接改 DOM 的 vanilla 路线，和 React state 两套真相
- [[react]] —— `@dnd-kit/react` 绑定 React 18/19

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
