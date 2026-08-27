# Drag-and-drop source review (writer BI)

> 用途：记录 dnd-kit、hello-pangea-dnd 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BI
- evidence：GitHub release/tag metadata、npm `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `/tmp/research-worktrees/`，不进入 Git
- target pair：`dnd-kit`、`hello-pangea-dnd`
- excluded slugs：开放 PR 已占用的 A–AI 主题对（含 `zustand`、`jotai`、`framer-motion`、`gsap` 等）；同主题未迁移的 `react-dnd`、`sortablejs` 本轮不改写

## dnd-kit

- canonical source：`https://github.com/clauderic/dnd-kit`
- revision：`cc98bdd52c06e55221e8cf77aaa0c2ec0f55b86f`
- packages：`@dnd-kit/react@0.5.0`、`@dnd-kit/dom@0.5.0`、`@dnd-kit/abstract@0.5.0`、`@dnd-kit/collision@0.5.0`、`@dnd-kit/geometry@0.5.0`、`@dnd-kit/helpers@0.5.0`、`@dnd-kit/state@0.5.0`
- tag：annotated `@dnd-kit/react@0.5.0` 指向上述 commit；npm `@dnd-kit/react@0.5.0` 的 `gitHead` 一致
- license：MIT
- React peer（`@dnd-kit/react`）：`^18.0.0 || ^19.0.0`
- inspected：
  - `packages/react/package.json`
  - `packages/react/src/core/index.ts`
  - `packages/react/src/core/context/DragDropProvider.tsx`
  - `packages/react/src/core/draggable/useDraggable.ts`
  - `packages/react/src/core/droppable/useDroppable.ts`
  - `packages/react/src/sortable/useSortable.ts`
  - `packages/react/README.md`
  - `packages/dom/package.json`
  - `packages/dom/src/core/manager/manager.ts`
  - `packages/dom/src/core/sensors/pointer/PointerSensor.ts`
  - `packages/dom/src/core/sensors/keyboard/KeyboardSensor.ts`
  - `packages/dom/src/core/plugins/accessibility/defaults.ts`
  - `packages/dom/src/core/plugins/accessibility/Accessibility.ts`
  - `packages/abstract/package.json`
  - `packages/abstract/src/core/manager/status.ts`
  - `packages/abstract/src/core/manager/events.ts`
  - `packages/abstract/src/core/manager/actions.ts`
  - `packages/abstract/src/core/sensors/activation.ts`
  - `packages/abstract/tests/drag-event-order.test.ts`
  - `packages/collision/src/algorithms/default.ts`
  - `packages/helpers/src/move.ts`
- observed：
  - 固定提交是 rewrite 线，包目录是 `react` / `dom` / `abstract` / `collision` / `helpers` / `state` / `vue` / `solid` / `svelte`；没有 `@dnd-kit/core` 或 `@dnd-kit/sortable` 包；
  - React 公开入口是 `DragDropProvider`、`useDraggable`、`useDroppable`、`DragOverlay`，sortable 从 `@dnd-kit/react/sortable` 导出 `useSortable`；
  - `defaultPreset.sensors` 为 `PointerSensor` + `KeyboardSensor`；`defaultPreset.plugins` 为 Accessibility、AutoScroller、Cursor、Feedback、PreventSelection；manager 还会再前置 ScrollListener、Scroller、StyleInjector；默认 modifiers 为空数组；
  - 状态枚举是 `idle` → `initialization-pending` → `initializing` → `dragging` → `dropped`；
  - 事件顺序测试要求：同一 id 既是 draggable 又是 droppable 时，`dragstart` 必须早于 `dragover`；
  - Pointer 默认激活：鼠标点在 handle 上立即激活；touch 是 Delay 250ms / tolerance 5；文本输入 Delay 200ms / tolerance 0；其余 Delay 200ms / tolerance 10 再叠加 Distance 5；交互元素默认 `preventActivation`；
  - Keyboard 默认 `offset=10`，`Space`/`Enter` 开始，`Escape` 取消，`Space`/`Enter`/`Tab` 结束，方向键移动；
  - `useDroppable` 未传 `collisionDetector` 时使用 `pointerIntersection ?? shapeIntersection`；
  - `@dnd-kit/helpers` 的 `move` / `swap` 在 `dragover`/`dragend` 上改数组，不持有列表状态；
  - Accessibility 默认 `role=button`、`roleDescription=draggable`、`tabIndex=0`；`dragover`/`dragmove` 播报默认 debounce 500ms。
- provenance：
  - GitHub annotated tag `@dnd-kit/react@0.5.0` 与 npm `gitHead` 均为 `cc98bdd52c06e55221e8cf77aaa0c2ec0f55b86f`。
  - 旧线 `@dnd-kit/core@6.3.1` 的 annotated tag 指向 `e9215e820798459ae036896fce7fd9a6fe855772`（历史 `master`），不在本 checkout 的包图里；本文不把 6.x hooks/`DndContext` 写成当前合同。

## hello-pangea-dnd

- canonical source：`https://github.com/hello-pangea/dnd`
- revision：`410173402853654f64436d116d68e3f89359d496`
- package：`@hello-pangea/dnd@18.0.1`
- tag：annotated `v18.0.1` 指向上述 commit
- license：Apache-2.0
- React peer：`react` / `react-dom` 均为 `^18.0.0 || ^19.0.0`
- engines：`package.json` 无 `engines` 字段
- inspected：
  - `package.json`
  - `CHANGELOG.md`
  - `src/index.ts`
  - `src/types.ts`
  - `src/animation.ts`
  - `src/state/reducer.ts`
  - `src/state/create-store.ts`
  - `src/state/action-creators.ts`
  - `src/state/middleware/drop/get-drop-duration.ts`
  - `src/view/drag-drop-context/drag-drop-context.tsx`
  - `src/view/drag-drop-context/app.tsx`
  - `src/view/drag-drop-context/check-react-version.ts`
  - `src/view/draggable/draggable.tsx`
  - `src/view/droppable/connected-droppable.ts`
  - `src/view/use-sensor-marshal/use-sensor-marshal.ts`
  - `src/view/use-sensor-marshal/sensors/use-mouse-sensor.ts`
  - `src/view/use-sensor-marshal/sensors/use-keyboard-sensor.ts`
  - `src/view/use-announcer/use-announcer.ts`
  - `src/view/use-droppable-publisher/check-for-nested-scroll-container.ts`
  - `src/view/check-is-valid-inner-ref.ts`
  - `src/screen-reader-message-preset.ts`
- observed：
  - 公开组件仍是 render-props：`DragDropContext` / `Droppable` / `Draggable`；另导出 `useMouseSensor`、`useTouchSensor`、`useKeyboardSensor` 供自定义 `sensors`；
  - 默认 sensors 为 mouse + keyboard + touch；`enableDefaultSensors !== false` 才会装上；
  - 鼠标 `sloppyClickThreshold = 5`；键盘 Space 启动为 `SNAP`，鼠标/触摸为 `FLUID`；
  - Redux phase：`IDLE` / `DRAGGING` / `COLLECTING` / `DROP_PENDING` / `DROP_ANIMATING`；库不持有列表数组，`onDragEnd` 才把 `destination` 交给应用重排；
  - drop 动画 `minDropTime=0.33`、`maxDropTime=0.55`，距离 ≥ 1500px 用上限，`CANCEL` 乘 `0.6`；
  - 默认 `type='DEFAULT'`，lift 时只收集同 type；嵌套 `DragDropContext` 与嵌套 scroll parent 不受支持；非 `virtual` droppable 拖拽中增删项会 warning；
  - `innerRef` 必须是 HTMLElement；announcer 使用 `aria-live="assertive"`；
  - `check-react-version` 从 peer 字符串解析出第一个 semver（`18.0.0`），actual major 更大则通过，因此 React 19 不会因 major 升高而 warning。
- provenance：
  - GitHub annotated tag `v18.0.1` 指向 `410173402853654f64436d116d68e3f89359d496`（`chore: release 18.0.1`），该提交上 `package.json` 版本为 `18.0.1`。
  - npm `@hello-pangea/dnd@18.0.1` 的 `gitHead` 是父提交 `1afeefe08ac304ff0bdd262904a25d09e6af7ad5`（`chore: update release-it configuration`）。两提交只差 release commit，源码合同按 tag commit 绑定，不伪造 npm `gitHead` 与 tag 相等。
