---
title: Sortable.js 框架无关 DnD 库
来源: https://github.com/SortableJS/Sortable + sortablejs.github.io 官方文档
season: 33
episode: S33-3
---

# Sortable.js — 框架无关的 jQuery-Free 拖拽库

## 一句话总结

Sortable.js 是 RubaXa（Lebedev Konstantin）2013 年开源的 JavaScript drag-and-drop 库。它和 react-dnd / dnd-kit 完全不同路线：纯 JS 框架无关 + mouse + touch 双事件实现拖拽 + 不依赖 HTML5 DnD API。

设计哲学三个支柱：

1. **零依赖**：纯 vanilla JS，不需 jQuery / React / Vue
2. **统一 mouse + touch**：移动端原生支持（不像 react-dnd 在 touch 设备失效）
3. **DOM-first**：直接操作 DOM 节点（appendChild / insertBefore），不像 React DnD 改 vDOM

技术贡献：

- 在 HTML5 DnD API 出现前已有完整 DnD 库（2013 时 HTML5 DnD 移动端基本不可用）
- 是 jQuery UI sortable 的现代替代（更轻 + 更快 + 更可靠）
- 框架适配：vue.draggable.next / Sortable-React-2 / @ng-sortable / Vue 3 拖拽

定位 vs 竞品：

- vs **dnd-kit**：dnd-kit React-only，Sortable 框架无关
- vs **react-dnd**：react-dnd 用 HTML5 DnD（移动端不友好），Sortable 用 mouse + touch（移动端 OK）
- vs **react-beautiful-dnd**：rbd 已停维，Sortable 仍活跃但节奏放缓

2024 状态：仍是非 React 项目（jQuery / vanilla / Vue 3）的 DnD 首选。weekly downloads ~2M。

补充：在小红书 / 知乎 / B 站等中文技术社区，Sortable.js 仍是「拖拽排序」教程关键词第一名，因为门槛低 + 不绑框架。

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `sortablejs` |
| 当前主版本 | 1.15.x（2024）|
| 首版 | 2013-09 |
| License | MIT |
| 主仓库 | SortableJS/Sortable |
| 维护 | RubaXa（Konstantin Lebedev）+ 社区 |
| 框架适配 | Vue（vue.draggable.next）/ React (Sortable-React-2 / react-sortablejs) / Angular (@ng-sortable) |
| TypeScript 支持 | 通过 @types/sortablejs |
| 内部依赖 | 0 |
| Bundle 大小 | ~30 KB min+gzip |
| 浏览器支持 | IE 9+ / 现代 |
| 移动端 | 原生支持（touch event） |
| Weekly downloads | ~2M |
| GitHub stars | 28k+ |
| 商业版 | 无 |
| 文档站 | sortablejs.github.io |
| API 风格 | `new Sortable(el, options)` + 事件 |
| 中文资料 | 多（小红书 / 掘金 / 知乎） |

## Layer 1 — 核心抽象

```js
import Sortable from 'sortablejs';

const list = document.getElementById('my-list');

const sortable = Sortable.create(list, {
  group: 'shared',         // 跨列表共享
  animation: 150,          // 拖拽动画时长 ms
  handle: '.drag-handle',  // 仅触发指定子元素
  draggable: '.item',      // 可拖动的子元素 selector
  ghostClass: 'sortable-ghost',  // 拖动占位元素 class
  chosenClass: 'sortable-chosen',  // 被选中元素 class
  
  onStart: (evt) => console.log('start', evt.oldIndex),
  onEnd: (evt) => console.log('end', evt.newIndex),
  onAdd: (evt) => console.log('add to list'),
  onRemove: (evt) => console.log('remove from list'),
  onUpdate: (evt) => console.log('item moved within list'),
  onSort: (evt) => console.log('any order change')
});
```

四要素：

1. **`Sortable.create(el, options)`** —— 创建实例，绑定 DOM 元素
2. **options.group** —— 同 group 的列表可跨拖拽
3. **options.handle / draggable** —— 限定哪些元素可拖
4. **events: onStart / onEnd / onAdd / onRemove / onUpdate** —— 拖拽生命周期回调

事件含义对照：

- onStart：开始拖动（mousedown / touchstart 触发后立即调用）
- onEnd：结束拖动（无论成功落下还是取消）
- onAdd：当前列表新增了来自其他列表的元素（接收方触发）
- onRemove：从当前列表拖走到其他列表（发送方触发）
- onUpdate：列表内顺序变化（不跨列表）
- onSort：任何顺序变化（含 onAdd / onUpdate）

事件参数 evt 关键字段：

- evt.item：被拖元素
- evt.oldIndex / newIndex：原位置 / 新位置
- evt.from / to：原 sortable 容器 / 目标容器
- evt.clone：clone 模式下的副本元素

## Layer 2 — 内部架构

Sortable 内部 4 大组件：

1. **Event Layer**：mouse + touch 双事件统一处理
   - mousedown / mousemove / mouseup
   - touchstart / touchmove / touchend
   - PointerEvent（现代浏览器统一）
2. **Drag State Machine**：idle / dragging / animating
3. **DOM Manipulator**：appendChild / insertBefore / classList toggle
4. **Animation Engine**：CSS transition + getBoundingClientRect 计算

工作流：

```
1. mousedown / touchstart 事件触发
2. 检测点击元素是否匹配 draggable selector
3. 创建 ghost element（视觉占位）
4. mousemove / touchmove → 更新 ghost 位置
5. 检测 hover 元素 → 计算 insertBefore 位置
6. 实时移动原元素到新位置（DOM）
7. mouseup / touchend → 清理 ghost + 触发 onEnd
```

vs HTML5 DnD API：

- HTML5 DnD：浏览器内置但移动端基本不可用
- Sortable.js：自实现 mouse+touch，移动端可用

DOM 操作策略对比：

| 项 | Sortable.js | HTML5 DnD | dnd-kit |
|---|---|---|---|
| 拖动期 DOM 是否实时移动 | 是 | 否（释放时移动） | 否（CSS transform 模拟） |
| ghost 视觉 | 自创建 div | 浏览器原生（无法定制） | 用 transform + opacity |
| 跨浏览器一致性 | 高 | 低（Safari/FF/Chrome 不同） | 高 |
| 移动端 | 是 | 否 | 是 |

## Layer 3 — 精读 3 段

### 段 a — 跨列表拖拽（group + pull/put）

```js
const list1 = Sortable.create(el1, {
  group: { name: 'shared', pull: true, put: true }  // 双向
});

const list2 = Sortable.create(el2, {
  group: { name: 'shared', pull: 'clone', put: false }  // 只能从 list2 拖到其他，且是 clone
});
```

旁注：

1. **pull**: true（可拉）/ false（不可拉）/ 'clone'（拉走的是副本，原元素留着）
2. **put**: true（可放入）/ false / Array（限制只接受指定 group 来的元素）
3. **group.name** 字符串 / 对象都支持
4. **pull/put 函数**：可动态决定（如根据元素 type 拒绝）
5. 跨列表事件：onAdd（接收方）/ onRemove（发送方）
6. 注意 onSort 在两侧都触发，不要重复处理状态

> 怀疑：跨列表拖拽的 group 配置过于灵活，pull / put 各 5+ 种取值组合。文档写的不算清晰，新手容易配错。是不是过度设计？

### 段 b — touch 事件处理

Sortable 关键创新是统一 mouse + touch：

```js
// 伪代码
function onPointerDown(evt) {
  if (evt.type === 'touchstart') {
    // touch 事件特殊处理
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onUp);
  } else {
    // mouse
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
```

旁注：

1. PointerEvent（IE 11+ / 现代浏览器）统一两种 → Sortable 优先用，fallback 到 mouse + touch
2. iOS Safari touch 事件有 300ms delay（FastClick / pointer-events: none 解决）
3. preventDefault 时机：touchmove 时阻止滚动（否则页面滚动而非拖拽）
4. 触摸长按拖拽：需配 delay 选项（`delay: 500`）
5. 多指触摸：Sortable 不支持，只取第一指
6. delayOnTouchOnly: true 仅 touch 才生效 delay（鼠标即按即拖，触摸长按）

> 怀疑：touch 事件兼容性细节多（iOS / Android / 鸿蒙的 WebView 行为微差），Sortable.js 通过 14000+ 行代码消化。但维护节奏放缓后，新设备出现可能 fail。

### 段 c — DOM 操作 vs vDOM

Sortable.js 直接改 DOM（`parent.insertBefore(el, ref)`）。这与 React 的 vDOM 矛盾：

- React 认为 DOM 是 vDOM 渲染结果，不该直接改
- Sortable 直接改 DOM 后，React 下次 render 会"修复"回原顺序

解决方案：

1. **react-sortablejs**：把 Sortable 包装成受控 React 组件，Sortable 改 DOM 后立即 dispatch 状态更新，下次 React render 输出新顺序
2. **vue.draggable.next**：Vue 的 v-model:list 双向绑定，Sortable 改 DOM 后同步 list array
3. **不在 React 受控组件用**：直接用 vanilla JS + Sortable，绕过 React

> 怀疑：在 React 项目里用 Sortable.js + react-sortablejs，本质是"vDOM 与 imperative DOM 的妥协"。性能好但心智复杂。dnd-kit 完全用 React 风格更直觉。

![Sortable 列表内拖拽 / 跨列表拖拽 / 嵌套列表](/study/projects/sortablejs/01-list-sort.webp)

## Layer 4 — 与 dnd-kit / react-dnd / react-beautiful-dnd 对比

| 维度 | Sortable.js | dnd-kit | react-dnd | react-beautiful-dnd |
|---|---|---|---|---|
| 框架绑定 | 无（vanilla） | React only | React only | React only |
| 移动端 | 原生 touch | PointerSensor | HTML5 DnD 不支持 | 自实现 |
| API 风格 | imperative（操作 DOM） | hooks + render prop | hooks / HOC | render-prop |
| 学习曲线 | 平 | 中 | 中 | 中 |
| Bundle | ~30 KB | ~14 KB | ~25 KB | ~45 KB |
| 与 React 集成 | react-sortablejs 包装 | 原生 React | 原生 React | 原生 React，但已停维 |
| 维护节奏 | 放缓（2018 后） | 活跃（2021-）| 放缓 | 停止维护 |
| 适用场景 | jQuery / vanilla / Vue | React 项目首选 | React 老项目 | 已弃用 |
| TypeScript | @types/sortablejs | 原生 TS | DefinitelyTyped | DefinitelyTyped |
| 嵌套列表 | 支持（fallback 模式）| 支持（多 sensor）| 支持但繁琐 | 支持 |

每个对手简评：

- **dnd-kit (2021-)**：React 时代 DnD 首选，TypeScript 友好 + 移动端 OK
- **react-dnd (2015)**：HTML5 DnD API 时代代表，移动端死路
- **react-beautiful-dnd**：Atlassian 出品，已停维（2023-）
- **react-sortablejs**：Sortable 在 React 的桥梁，受控模式

跨场景选择参考：

- Vue 项目：Sortable + vue.draggable.next（事实标准）
- React 项目：dnd-kit 优先，复杂表格用 react-sortablejs
- vanilla JS / jQuery：Sortable 唯一选择
- Angular 项目：@ng-sortable 或 Angular CDK DragDrop

## Layer 5 — 6 维评分

| 维度 | Sortable.js | dnd-kit | react-dnd |
|---|---|---|---|
| 框架适配性 | 5 | 2（React） | 1（React） |
| 移动端友好 | 5 | 5 | 1 |
| Bundle 友好 | 3 | 4 | 3 |
| TypeScript | 3 | 5 | 4 |
| 维护活跃度 | 3（放缓） | 5 | 3 |
| 学习曲线（易） | 4 | 3 | 3 |
| 总分 | 23 | 24 | 15 |

读分析：

- Sortable 在「框架适配性」「移动端」满分，但「TypeScript」「维护活跃度」拉跨
- dnd-kit 唯一短板是「框架绑定」（仅 React）
- react-dnd 整体落后，已不推荐新项目

## Layer 6 — 限制

1. **维护节奏放缓**：Konstantin Lebedev 2018 后 commit 频率明显下降，社区 PR 合并慢
2. **TypeScript 不原生**：通过 @types/sortablejs 定义（v1.15+ 才完整）
3. **vDOM 集成痛点**：React / Vue 项目需 react-sortablejs / vue.draggable.next 包装
4. **跨 group 配置复杂**：pull/put 文档不算清晰，新手易配错
5. **嵌套深度问题**：嵌套 sortable 在某些情况会触发误判（pull-up 跨 group 边界）
6. **Bundle 比 dnd-kit 大 2x**：30 KB vs 14 KB
7. **多指触摸不支持**：仅取第一指；多指手势需要外部 hammer.js 配合
8. **拖拽期间 DOM 变更**：可能与 React 调和冲突，需要 react-sortablejs 调度

## 怀疑总集

> 怀疑：Sortable.js 原生 mouse + touch 实现意味着每次 DOM 标准更新（PointerEvent / Touch Events Level 2 / Pointer Events 2024）都需要适配。维护放缓后，这种"自实现兼容层"是不是注定失败？答案可能：是。框架库（dnd-kit）依靠 React 抽象 + 框架团队适配新 API，而 Sortable 直接面对 DOM，更脆弱。

> 怀疑：Konstantin 一人主导 + 社区贡献者多但合并慢，这是 bus factor=1 的典型。如果 Konstantin 退出，Sortable 多快萎缩？

> 怀疑：Sortable 的 group / pull / put 设计走了 jQuery UI sortable 的老路（option-driven 配置）。在现代 hooks 时代，是不是该重新想一套 declarative API？

> 怀疑：「直接改 DOM」这条路在 SSR / Hydration 框架（Next.js / Nuxt）下越来越不友好。Server 渲染 + 客户端 Sortable 接管时，hydration mismatch 风险大。

> 怀疑：移动端「touch 事件 vs PointerEvent」两套兼容是历史负担。2024 后浏览器全支持 PointerEvent，是不是该砍掉 touch event 分支精简代码？

## GitHub Permalinks

源码精读入口（链接示意，未实际验证 SHA）：

- Sortable 主类：`https://github.com/SortableJS/Sortable/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/src/Sortable.js`
- vue.draggable.next：`https://github.com/SortableJS/vue.draggable.next/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/vuedraggable.js`
- react-sortablejs：`https://github.com/SortableJS/react-sortablejs/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/src/index.tsx`
- 对比 react-dnd：`https://github.com/react-dnd/react-dnd/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/packages/core/src/connection.ts`

## Layer 7 — 实战

完整 Sortable + react-sortablejs + 状态管理例子：

```jsx
import { ReactSortable } from "react-sortablejs";
import { useState } from "react";

export function TodoList() {
  const [todos, setTodos] = useState([
    { id: '1', name: 'Buy groceries' },
    { id: '2', name: 'Walk dog' },
    { id: '3', name: 'Code review' }
  ]);
  
  return (
    <ReactSortable
      list={todos}
      setList={setTodos}
      animation={150}
      ghostClass="opacity-50"
      onEnd={(evt) => console.log('moved', evt.oldIndex, '→', evt.newIndex)}
    >
      {todos.map((todo) => (
        <div key={todo.id} className="p-2 bg-white border">
          {todo.name}
        </div>
      ))}
    </ReactSortable>
  );
}
```

要点：

1. ReactSortable 把 Sortable 包装成受控组件
2. list / setList 实现双向绑定
3. ghostClass 在拖动时给原元素加 class（半透明效果）
4. animation 是 CSS transition 时长
5. onEnd 回调拿到 oldIndex / newIndex

跨列表 + 不同行为：

```jsx
<ReactSortable list={list1} setList={setList1} group={{ name: 'shared', pull: true, put: true }} />
<ReactSortable list={list2} setList={setList2} group={{ name: 'shared', pull: 'clone', put: false }} />
```

vanilla JS 看板（不依赖任何框架）：

```js
const todoList = document.getElementById('todo');
const doingList = document.getElementById('doing');
const doneList = document.getElementById('done');

const opt = { group: 'kanban', animation: 200, ghostClass: 'opacity-50' };
Sortable.create(todoList, opt);
Sortable.create(doingList, opt);
Sortable.create(doneList, {
  ...opt,
  onAdd: (evt) => console.log('done +1', evt.item.dataset.id)
});
```

要点：

1. 三个列表共享 group: 'kanban'，可任意跨拖
2. 仅 done 列表关心 onAdd（用于"完成 +1"埋点）
3. 不写 setList，DOM 自身就是真值（vanilla 模式）

## 学到什么 + 关联

学到的：

1. 框架无关 DnD 库的核心技术：mouse + touch + PointerEvent 统一处理
2. vDOM vs imperative DOM 的张力是 React 时代库设计的根本难题
3. Bus factor=1 的开源项目是潜在风险，需要预案
4. 跨列表 group 配置在 UX 上可灵活但 API 易错
5. 移动端 first 是 2020s 的强需求，老库（react-dnd）跟不上
6. ghost 元素 + 实时 DOM 移动 是 2013-2024 拖拽 UX 的事实标准
7. 受控组件包装（react-sortablejs）是连接 imperative 库与 React 的通用模式

类比：

- Sortable.js 之于 dnd-kit ≈ jQuery 之于 React：底层操作 vs 抽象层
- group/pull/put 的灵活性 ≈ CSS flex 的 justify/align：强但易错
- bus factor=1 的隐忧 ≈ moment.js 的故事（曾经第一，现在被 dayjs / date-fns 替代）

关联：

- [[dnd-kit]] [[react-dnd]] —— 同领域 React 替代方案
- [[zod]] [[react-hook-form]] [[d3]] [[recharts]] —— 同 React 生态对比
- [[react-aria]] —— 类似「框架无关 + accessibility 第一」哲学
- [[lodash]] [[axios]] —— 同样是「老库稳定但维护放缓」的代表

下一步可深挖：

1. 对比 Sortable 1.15 与 vue.draggable.next 在 SSR 场景的 hydration 行为
2. 把 Sortable 的 mouse+touch 适配层做成 standalone 包（pointer-shim）
3. 调研 dnd-kit 的 PointerSensor 实现是否可学习并现代化 Sortable

## 附录 — 与 dnd-kit 选型决策树（≥ 25 行）

### 用 Sortable.js 的场景
1. **vanilla JS / jQuery 项目**：没有 React / Vue，必须 framework-agnostic
2. **Vue 3 项目**：vue.draggable.next 是 Vue 生态首选（vs vue-dnd 不成熟）
3. **快速 prototype**：Sortable.create + 几行配置，5 分钟出 demo
4. **嵌入第三方页面**：浏览器扩展 / Web Component，不强制框架

### 用 dnd-kit 的场景
1. **React 18+ 项目**：dnd-kit hooks API 与 React 心智一致
2. **TypeScript 严格**：dnd-kit 类型定义完整，Sortable 需 @types/sortablejs
3. **复杂 collision detection**：dnd-kit 内置 5 种算法可切换
4. **accessibility first**：dnd-kit 内置 keyboard navigation + screen reader 支持

### 用 react-dnd 的场景
1. **维护已有老项目**（不要新建）：react-dnd 维护节奏放缓
2. **需要 HTML5 DnD API 和外部应用交互**（如 file drop from desktop）

### 用 react-beautiful-dnd 的场景
1. **不要用**：已停止维护 2023+
2. 老项目迁移路径：rbd → dnd-kit

## 附录 B — Sortable 内部学到（≥ 15 行）

读 Sortable.js 源码学到的工程模式：

1. **state machine**：drag state 用 enum + 转换函数管理（idle / dragstart / dragmove / dragend）
2. **delegated event listener**：单一 mousedown 监听父元素，e.target 反查 .item 子元素 → 减少 listener 数量
3. **transform vs reflow**：拖动 ghost element 用 CSS transform（GPU 加速），避免 reflow
4. **clone vs move**：pull: 'clone' 用 cloneNode(true) 而非 move，原元素留在 source list
5. **boundingRect cache**：预计算每个 item 的 boundingRect 避免拖动时重复 query

这些都是任何 imperative DOM 库可借鉴的工程模式。
