---
title: dnd-kit — React 现代拖拽 toolkit
来源: 'https://github.com/clauderic/dnd-kit'
日期: 2026-05-30
分类: projects / 前端
难度: 中级
---

## 是什么

dnd-kit 是一套**给 React 应用做拖拽**的 toolkit。日常类比：老的 react-dnd 像手动挡车——离合、油门、档位每一步都要你管；dnd-kit 像装了自适应巡航的电动车——你只说"我要从 A 拖到 B"，库内部把识别意图、跟手移动、判定落点全帮你处理好。

它放弃浏览器原生 HTML5 DnD API（2008 年的老古董，移动端差、自定义难、跨 iframe 有 bug），改从 pointer / touch / keyboard 输入事件层重新实现拖拽。所有 API 是 hooks，源码用 TypeScript 写，bundle 仅约 10kB。

```tsx
// 最小例子：注册一个可拖元素 + 一个放置区
<DndContext onDragEnd={e => console.log(e.active.id, '到', e.over?.id)}>
  <Draggable id="card-1" />
  <Droppable id="zone-A" />
</DndContext>
```

## 为什么重要

不理解 dnd-kit，下面这些事都没法解释：

- 为什么 2024 年起 React 项目几乎都不再用 react-dnd（对手太硬）
- 为什么拖拽库非要把 sensors / collision detection / modifiers 拆开（不是花架子，是 4 步本质拆解）
- 为什么键盘和屏幕阅读器用户能正常用一个"拖拽"功能（accessibility 不是事后补的）
- 为什么 react-beautiful-dnd 那么优雅却被淘汰（场景窄 + 停更 + React 18 不兼容）

## 核心要点

1. **DndContext = 拖拽状态机**：顶层容器内部是 `idle → pre-dragging → dragging → drop-animating → idle` 的状态机，用 `useReducer` 实现，订阅靠 Context 广播。类比红绿灯——所有路口看同一个信号源。

2. **hooks 注册 + 订阅**：`useDraggable({ id })` 和 `useDroppable({ id })` 把元素登记到 Context，再订阅自己关心的状态片段（被拖中？正在 over？）。返回的 `setNodeRef` 是 callback ref，因为内部要算元素几何信息。

3. **Sensors 决定"什么算拖拽"**：PointerSensor / TouchSensor / KeyboardSensor 各管一种输入，可叠加。`activationConstraint: { distance: 8 }` 表示按下移动 8px 才算开始拖（防止误触）。

4. **Collision detection 决定"现在在谁头上"**：拖拽中每帧要回答"被拖元素正处在哪个 droppable 上"。4 种内建算法（rectIntersection / closestCenter / closestCorners / pointerWithin）签名一致，按场景选。

5. **Modifiers 决定"能拖到哪"**：纯函数 `(args) => transform`，每帧调用，可锁单轴、限父容器、网格吸附等。多个 modifier 可叠加成数组。

把这 5 个抽象拆开看，恰好对应了拖拽这件事的本质 4 步：识别意图（sensors）/ 跟随移动（context + transform）/ 判定落点（collision）/ 完成或取消（生命周期回调）。第 5 块 modifiers 是这 4 步上的"约束层"。

## 实践案例

### 案例 1 — 可排序待办列表（最常见）

`@dnd-kit/sortable` + `closestCenter`，30 行跑通鼠标 / 触屏 / 键盘三种输入。

```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function Item({ id }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...listeners} {...attributes}>{id}</div>;
}
function App() {
  const [items, setItems] = useState(['a', 'b', 'c']);
  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
      if (over && active.id !== over.id) setItems(arr => arrayMove(arr, arr.indexOf(active.id), arr.indexOf(over.id)));
    }}>
      <SortableContext items={items}>{items.map(id => <Item key={id} id={id} />)}</SortableContext>
    </DndContext>
  );
}
```

### 案例 2 — 看板（Trello 风格）

多个 `SortableContext` 嵌套在一个 `DndContext` 里，每个 context 一列。`onDragOver` 中检测卡片是否拖到另一列、动态更新数据；`onDragEnd` 决定最终位置。collision detection 推荐 `closestCorners`——卡片大小不一时比 `closestCenter` 稳。

```ts
// 跨列搬运的核心逻辑
function onDragOver({ active, over }) {
  const fromCol = findColumn(active.id);
  const toCol = findColumn(over?.id);
  if (fromCol && toCol && fromCol !== toCol) moveCard(active.id, fromCol, toCol);
}
```

### 案例 3 — 自由画布（Figma 风格）

不用 sortable，直接 `useDraggable` + `useDroppable`，每个元素自己 `transform` 跟手。collision 用 `rectIntersection`；用 `<DragOverlay>` 渲染拖拽残影（避免原节点位置错位）；用 `restrictToWindowEdges` modifier 防止拖出视口。配合 `useSensor(KeyboardSensor)` 还能让用户用方向键精确移动 1px。

## 踩过的坑

1. `SortableContext` 的 `items` 数组每次 render 新建会让内部缓存失效，性能直接塌——必须 `useMemo` 或传稳定 id 数组。
2. `useDraggable` 的 `id` 全局必须唯一，两个同 id 会被静默覆盖，且不报错，调试极痛。
3. iOS Safari 触屏元素必须加 `touch-action: none` CSS，否则被浏览器原生滚动劫持，永远拖不动。
4. sortable list 别用默认的 `rectIntersection`——相邻 item 重叠面积反复变化会闪烁，换 `closestCenter` 立即丝滑。

## 适用 vs 不适用场景

适用：

- React 项目里任意拖拽需求（排序、看板、画布、文件区、树状）
- 需要键盘 / 屏幕阅读器无障碍的拖拽功能
- 移动端是核心场景（默认支持，不用装额外 backend）
- TypeScript 严格项目（一等公民，几乎不用 `any`）

不适用：

- Vue / Svelte 等非 React 项目（强 React 绑定）
- 想直接操作 DOM 不通过 React state 的场景（会和 React 撕）
- 需要和 Sortable.js 等 vanilla 库混用（两套真相必冲突）

## 历史小故事（可跳过）

- **2014**：react-dnd 发布，用 HTML5 DnD API + Backend 抽象，长期是 React 拖拽事实标准。
- **2018**：Atlassian 发布 react-beautiful-dnd，专为 list / board reorder 优化，API 极优雅但场景窄。
- **2021**：Claudéric Demers 因为常年做 react-dnd / rbd 的二次封装受不了底层短板，决定从输入事件层重写，发布 dnd-kit。
- **2022-2023**：Atlassian 把 rbd 进 maintenance / archive；React 18 严格模式下 rbd 直接坏，社区被迫迁移到 dnd-kit。
- **至今**：dnd-kit weekly downloads 约 200 万，已成为 React 拖拽事实标准。

这条曲线很有意思——一个老牌库（react-dnd）和一个新贵专精库（rbd）夹击下，dnd-kit 凭借底层架构选对，反而把两边的份额都吃了。

## 学到什么

- **底层抽象选对了，上层场景才能任意覆盖**——dnd-kit 把拖拽拆成"识别意图 / 跟随移动 / 判定落点 / 完成或取消"4 步正交抽象，所以能同时覆盖 list、看板、画布、树。react-dnd 的 5 个概念语义重叠，扩展时容易撞墙。
- **依赖原生 API 不一定是优势**——HTML5 DnD 看起来"用浏览器自带"很好听，实际是 2008 年的设计债。dnd-kit 主动抛弃它换来体验质变。
- **accessibility 不能事后补**——dnd-kit 把键盘 sensor、aria-live 播报、焦点回归从第一天就当核心需求设计；rbd 内建但不可定制；react-dnd 干脆没有。
- **专精库 vs 通用库的取舍**——rbd 在 list reorder 场景下确实更优雅，但项目要扩展到看板嵌套时一夜变成债。

## 延伸阅读

- 项目主页：[clauderic/dnd-kit](https://github.com/clauderic/dnd-kit)
- 官方文档：[docs.dndkit.com](https://docs.dndkit.com/)
- 作者动机：[Why I Built dnd-kit](https://github.com/clauderic/dnd-kit#motivation)
- ARIA Drag and Drop pattern：[W3C WAI 文档](https://www.w3.org/WAI/ARIA/apg/patterns/) —— 理解 a11y 设计的依据
- 对比阅读：[[react-dnd]] —— 老牌前辈的设计与短板
- vanilla 替代：[[sortablejs]] —— 多框架场景下的另一选择
- 动画协作：[[react-spring]] —— drop 动画常配它做物理曲线

## 关联

- [[react]] —— dnd-kit 基于 React 16.8+ hooks，强绑定
- [[react-dnd]] —— 同领域前辈，API 抽象差距是"设计级"不是"实现级"
- [[sortablejs]] —— vanilla JS 路线，操作 DOM；和 dnd-kit 混用必冲突
- [[react-spring]] —— 物理动画库，常配合 dnd-kit 做 drop 弹跳
- [[hindley-milner]] —— TypeScript 推导能力的根，让 dnd-kit 类型推得出来

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[fabric-js]] —— Fabric.js — 给 Canvas 加一层"对象模型"，让画布图形可以拖
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[pdfme]] —— pdfme — TypeScript 模板化 PDF
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[react-flow]] —— React Flow / xyflow — 节点编辑器框架
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
- [[sortablejs]] —— SortableJS — 一行代码让任何列表能用手拖排序
