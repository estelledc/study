---
title: hello-pangea-dnd — 维护中的 React 列表拖拽
description: Atlassian react-beautiful-dnd 的社区续作；固定阅读 @hello-pangea/dnd 18.0.1
来源: https://github.com/hello-pangea/dnd
日期: 2026-08-27
分类: 前端交互
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/hello-pangea/dnd
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 410173402853654f64436d116d68e3f89359d496
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 18.0.1
---

## 是什么

`@hello-pangea/dnd` 是 **Atlassian `react-beautiful-dnd` 的社区续作**。日常类比：原版像一家停业的精品店，菜单和装修都还在；hello-pangea 把店盘下来，换了 React 18/19 和 Redux 5，但点菜方式没变——仍然是 `DragDropContext` + render-props。

```tsx
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

<DragDropContext onDragEnd={onDragEnd}>
  <Droppable droppableId="list">
    {(provided) => (
      <div ref={provided.innerRef} {...provided.droppableProps}>
        {items.map((item, index) => (
          <Draggable key={item.id} draggableId={item.id} index={index}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                {item.label}
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

库本身**不保存列表数组**。`onDragEnd` 把 `result.destination` 交给你，你再 `setState`。

## 为什么重要

不理解这条续作线，就很难解释：

- 为什么 rbd 在 React 18 严格模式后被大量项目抛弃，而同一套 API 还能继续用
- 为什么它能把「让开、占位、放下动画」做得很完整，却拒绝嵌套 context 和嵌套滚动容器
- 为什么键盘拖拽是 `SNAP`、鼠标是 `FLUID`——两种输入走两套移动合同
- 为什么它和 [[dnd-kit]] 不是换包名的关系：一边是列表专用状态机，一边是可换框架的 toolkit

## 核心要点

固定 18.0.1 的主链可以拆成五步：

1. **Context 装配 Redux store**：`app.tsx` 把 style、lift、drop、auto-scroll、focus、responders 等 middleware 串起来。phase 是 `IDLE → DRAGGING → (COLLECTING|DROP_PENDING) → DROP_ANIMATING → IDLE`。

2. **Render-props 登记尺寸**：`Droppable` / `Draggable` 的 `children` 必须是函数。`provided.innerRef` 必须落到 **HTMLElement**；SVG 会 invariant 失败。

3. **Sensor 抢一把全局 lock**：默认 `useMouseSensor` + `useKeyboardSensor` + `useTouchSensor`。`enableDefaultSensors !== false` 才会装上。同时只能有一个 sensor 持有 lock。

4. **按 type 收集 dimension**：默认 `type: 'DEFAULT'`。`lift` 只发布同 type 的 droppable/draggable，所以跨 type 拖不过去。

5. **放下后应用改数组**：responders middleware 在 `DROP_COMPLETE` 调 `onDragEnd`。drop 动画时长在 0.33s–0.55s 之间按距离插值，超过 1500px 用上限；`CANCEL` 再乘 0.6。

## 实践示例

### 案例 1：单列重排

```tsx
function onDragEnd(result) {
  if (!result.destination) return;
  setItems((items) => {
    const next = items.slice();
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    return next;
  });
}
```

没有 destination（拖到外面）或 `reason === 'CANCEL'` 时，不要改数组。库不会替你 rollback 一份隐藏副本。

### 案例 2：键盘是 SNAP，鼠标是 FLUID

- 鼠标：移动超过 `sloppyClickThreshold = 5` px 才开始，之后跟指针走（`FLUID`）。
- 键盘：Space 开始，方向键一次跳一格（`SNAP`），Space 放下，Escape 取消。
- 自定义 sensor 时用导出的 `useMouseSensor` / `useTouchSensor` / `useKeyboardSensor`，不是 `useDraggable`。

### 案例 3：多列靠 type 和独立列表，不靠嵌套 Context

同一 `DragDropContext` 里可以放多个 `Droppable`。要隔离「卡片不能进另一类列表」，给它们不同的 `type`。文档和源码都不支持**嵌套** `DragDropContext`；并列的两个 context 可以各自 `tryGetLock`。

## 踩过的坑

1. **当它是通用画布库**：虚拟列表只在 `mode: 'virtual'` 时允许拖拽中增删项；标准模式下会 warning。嵌套 scroll parent 会报 unsupported。

2. **把 innerRef 绑到组件实例或 SVG**：校验函数要求 HTMLElement。

3. **忘记 placeholder**：标准列表靠 `provided.placeholder` 留出被拖走的空间；漏掉会在拖拽中塌高度。

4. **嵌套滚动或嵌套 Context**：前者有专门检查，后者文档写明不支持。不要用「再包一层 Context」解决多看板。

5. **以为 18.0.1 的 npm `gitHead` 等于 Git tag**：tag commit 是 `41017340...`；npm `gitHead` 是它的父提交 `1afeefe0...`（只改了 release-it 配置）。本文按 tag commit 绑定。

## 适用 vs 不适用场景

**适用**：

- React 18/19 的列表、看板、横排 chip，需要占位和放下动画
- 希望键盘和屏幕阅读器走内建 announcer / focus marshal
- 能接受 Apache-2.0，以及 Redux + react-redux 作为运行时依赖

**不适用**：

- 自由画布、树、任意几何碰撞——那是 [[dnd-kit]] 0.5.0 的范围
- React 16/17：17.0.0 已丢掉这些 peer
- 需要嵌套滚动容器，或在拖拽中给非 virtual 列表插入节点
- 想用 hooks 而不是 render-props 登记每一项

## 固定版本边界

- 本文绑定 `hello-pangea/dnd@410173402853654f64436d116d68e3f89359d496`，annotated tag `v18.0.1`，`package.json` 版本 `18.0.1`。
- npm `gitHead` 指向父提交 `1afeefe08ac304ff0bdd262904a25d09e6af7ad5`，不与 tag commit 相同。
- peer：`react` / `react-dom` `^18.0.0 || ^19.0.0`。`check-react-version` 解析 peer 字符串的第一个 semver（`18.0.0`），actual major 更大则通过。
- 运行时依赖包含 `redux@^5.0.1`、`react-redux@^9.2.0`、`css-box-model`、`raf-schd`。没有 `engines` 字段。
- 本文未安装依赖、运行上游测试或在浏览器里拖列表，状态保持 `UNVERIFIED`。

## 学到什么

1. **停更的优雅 API 可以被 fork 续命**——续作保住 render-props，把 React/Redux 版本往前推。
2. **专精库的边界写在校验函数里**——nested scroll、virtual-only mutation、HTMLElement ref 都是硬约束。
3. **输入模式会变成移动语义**——FLUID 跟手，SNAP 步进，不能用同一套坐标更新去猜。
4. **库动画 ≠ 应用状态**——放下曲线再漂亮，列表顺序仍要你在 `onDragEnd` 自己写。

## 应用型自测

1. 默认不传 `type` 时，两个 Droppable 能否互相接收？
2. 鼠标要移动多少像素才开始拖？
3. 嵌套的 `DragDropContext` 是否受支持？

检查点：

1. 能。默认都是 `DEFAULT`，lift 会收集同 type。
2. `sloppyClickThreshold = 5`。
3. 不受支持；并列 context 可以各自持有 lock。

## 延伸阅读

- 固定源码：[hello-pangea/dnd](https://github.com/hello-pangea/dnd) —— 本文绑定提交 `410173402853654f64436d116d68e3f89359d496`
- 共享审查记录：`docs/drag-drop-source-review-20260827-bi.md`
- [[dnd-kit]] —— 0.5.0 rewrite：manager + sensor + 框架适配
- [[react-dnd]] —— 更早的 source/target/backend 模型
- [[sortablejs]] —— 不经过 React state 的 DOM 排序

## 关联

- [[dnd-kit]] —— 通用 toolkit 对照
- [[react-dnd]] —— HTML5 DnD 前辈
- [[react]] —— peer 绑定 React 18/19
- [[react-dnd]] —— 更早的 source/target/backend 模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
