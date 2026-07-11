---
title: react-dnd — React 时代第一个把拖拽拆成四层的库
来源: 'https://github.com/react-dnd/react-dnd'
日期: 2026-05-30
分类: projects / 前端
难度: 中级
---

## 是什么

react-dnd 是 **Dan Abramov 在 2015 年写的 React 拖拽库**，把"拖一个东西到另一个地方"拆成 source / target / monitor / backend 四层，每层各管一件事。

日常类比：搬家公司。搬运工是 source（要被搬的箱子），新房间是 target（接收的地方），调度员是 monitor（监视全场谁在搬什么），运输工具是 backend（卡车 / 货车 / 推车，可换）。你只要告诉公司"这箱子叫 fruit、那房间收 fruit"，剩下的全包。

```jsx
const [, dragRef] = useDrag(() => ({ type: 'fruit', item: { id: 1 } }));
const [, dropRef] = useDrop(() => ({ accept: 'fruit', drop: (item) => save(item) }));
```

两个 hook 加一个 `<DndProvider backend={HTML5Backend}>` 包根组件，整套就跑起来了。

## 为什么重要

- 不理解四层抽象，就看不懂为什么同一套业务代码能在 PC、移动端、单元测试三个环境跑
- 不知道 HTML5 native DnD API 的坑，自己写拖拽会被 Safari/Firefox/Chrome 的差异折磨到放弃
- 不熟悉 monitor + collect 的精确订阅模式，写出的拖拽组件每次状态变都全树重渲染
- 不了解它的历史地位，会以为 dnd-kit 凭空冒出来，其实 dnd-kit 是在批判性继承 react-dnd

## 核心要点

1. **四层抽象**：source 声明"我能被拖、类型是什么"，target 声明"我接收哪些类型"，monitor 维护全局状态，backend 适配平台输入。类比餐厅：菜（source）、桌（target）、服务员调度（monitor）、外卖/堂食/打包（backend）。

2. **backend 可换**：HTML5Backend 用浏览器原生 DnD 事件，TouchBackend 用 touchstart/move/end，TestBackend 用代码模拟。换 backend 时业务代码不动——这是 react-dnd 最被低估的工程价值，本质上把"输入设备"做成了可插拔依赖。

3. **collect 是 selector**：每个 useDrag/useDrop 传一个 collect 函数，声明"我只关心 isDragging、isOver"。monitor 状态变化时，react-dnd 重跑 collect，再做浅比较（只看返回对象第一层字段变没变），只有结果变了才让组件重渲染——和 Redux 里"只订阅关心的那几字段"是同一个思想。

4. **dnd-core 是 Redux store**：react-dnd 把状态机拆成独立包 dnd-core，actions (BEGIN_DRAG / HOVER / DROP) + reducers + 单 store。这让拖拽状态机可以脱离 React 单测，也是 2015 年那波 Redux 浪潮在 UI 库内部的典型应用。

## 实践案例

### 案例 1：水果拖到篮子里

```jsx
function Fruit({ id, name }) {
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: 'fruit',
    item: { id, name },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }));
  return <div ref={dragRef} style={{ opacity: isDragging ? 0.5 : 1 }}>{name}</div>;
}
```

`type: 'fruit'` 是字符串标签，target 必须 `accept: 'fruit'` 才能收。`collect` 返回什么，组件就拿到什么。

### 案例 2：篮子作为接收容器

```jsx
function Basket({ onAdd }) {
  const [{ isOver }, dropRef] = useDrop(() => ({
    accept: 'fruit',
    drop: (item) => onAdd(item),
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  }));
  return <div ref={dropRef} style={{ background: isOver ? '#cfc' : '#fff' }}>篮子</div>;
}
```

`drop` 回调拿到的 `item` 就是 source 的 `item: { id, name }`。`isOver` 用来在悬停时高亮——这种"声明派生状态"是 react-dnd 的招牌。

### 案例 3：根组件包 DndProvider

```jsx
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <Page />
    </DndProvider>
  );
}
```

DndProvider 通过 React Context 把 DragDropManager 单例传给所有后代。换成 `TouchBackend` 移动端就跑起来了，业务组件一行不改。

## 踩过的坑

1. **忘包 DndProvider**：useDrag/useDrop 拿不到 manager，报 "Expected drag drop context" 这种看不懂的错——必须在 root 包一层。
2. **HTML5Backend 不吃 touch**：在手机上完全没反应，因为浏览器的 dragstart 在触屏不触发，必须换 TouchBackend 或加一层 dual backend。
3. **collect 闭包陷阱**：useDrag(() => ({ ..., item: { id } }))，如果 id 是 props 但没传 deps 数组，spec 会一直用首次渲染的旧 id。
4. **跨 iframe 不可用**：HTML5 DnD 事件在 frame 边界会丢 dataTransfer，react-dnd 也救不了，跨 frame 场景必须自己用 postMessage 模拟。

## 适用 vs 不适用场景

**适用**：
- 有明确"类型"概念的拖拽：看板、文件上传、工具箱到画布
- 需要在 PC + 移动端 + 单元测试 三套环境跑同一套逻辑
- 已在用 react-dnd v14 之前 HOC 写法的存量项目，整库迁 hooks 成本高
- 要支持从浏览器外拖文件进来（HTML5Backend 天然支持 dataTransfer.files）

**不适用**：
- 纯列表排序（推荐 react-beautiful-dnd 的精神继承者或 dnd-kit）
- 需要键盘可访问 / screen reader 公告（react-dnd 弱，dnd-kit 强）
- 新项目，没历史包袱（首选 dnd-kit，更小、更现代、TypeScript 推导更好）
- 跨 iframe / 跨窗口拖拽（HTML5 DnD 自身限制）

## 历史小故事（可跳过）

- **2010 年**：HTML5 标准化原生 DnD API，浏览器开始支持 draggable 属性 + dragstart/drop 事件
- **2013 年**：Sortable.js 发布，纯 JS 列表拖拽老牌库，至今还活跃
- **2015 年**：Dan Abramov（同年也写出 redux）发布 react-dnd v1.0.0，把 backend 抽象引入 React 生态
- **2017 年**：Atlassian 发布 react-beautiful-dnd，特化 Trello/Jira 这种列表场景
- **2019 年**：react-dnd 把 hooks API（useDrag/useDrop）升为稳定推荐写法，HOC 仍兼容
- **2021 年**：v14.0.0（3 月）拆开 type/item、修 collect 活性；同年 clauderic 发布 dnd-kit，pointer events 优先、内建 a11y
- **2022 年起**：react-dnd 维护者轮换，进入"稳定但慢更新"状态，仓库 issue 多但内核基本不动，因为 API 已经够用

## 学到什么

- **抽象层数对了，平台适配几乎免费**——换 backend 就跨端，业务代码零改
- **collect + monitor = 可订阅的状态机**，2015 年就把"selector + memo"写明白了，今天 zustand/jotai 是这一思想的简化版
- **声明式 > 命令式**：你不写 onDragStart/onDragOver 一堆 handler，只说"我是 fruit"，库帮你算出每一帧应该是什么状态
- 一个看似"拖一下"的小功能，背后是十年浏览器 API 不一致和移动端踩坑的沉淀
- **老库不是没用，是带着包袱**：react-dnd 的设计今天看仍优秀，劣势主要在 a11y 和 bundle 体积，新项目可选 dnd-kit，但读 react-dnd 源码仍是理解 React 状态库设计的好教材

## 延伸阅读

- 官网文档：[react-dnd.github.io](https://react-dnd.github.io/react-dnd/about)（含完整 API + 案例）
- 仓库源码：[react-dnd/react-dnd](https://github.com/react-dnd/react-dnd)（monorepo，核心 5 个包）
- HTML5 DnD 规范：[HTML Living Standard - Drag and Drop](https://html.spec.whatwg.org/multipage/dnd.html)
- 视频：[Dan Abramov - The Story of React DnD (2016)](https://www.youtube.com/results?search_query=react+dnd+dan+abramov)
- 对比文章：作者 clauderic 在 dnd-kit README 里的"为什么不用 react-dnd"
- dnd-core 源码：[react-dnd/react-dnd 的 packages/dnd-core](https://github.com/react-dnd/react-dnd/tree/main/packages/dnd-core)（剥离 React 看状态机本体）
- 入门教程：[官方 Tutorial - Chess](https://react-dnd.github.io/react-dnd/examples)（用国际象棋走子讲完整 API）

## 关联

- [[dnd-kit]] —— 2021 年的"现代继承者"，pointer events first，bundle 更小、a11y 更强
- [[react]] —— 宿主框架，DndProvider 用 React Context，hooks 用 React 18 调度
- [[react-spring]] —— 拖拽 + 物理动画的常见组合：react-dnd 给位置，spring 给过渡
- [[react-hook-form]] —— 同样是"声明式 + selector + 精确订阅"的设计哲学，可对照学习
- [[preact]] —— 兼容层下 react-dnd 也能在 preact 跑，证明它的"React-only"耦合其实很浅
- [[react-intl]] —— 同时代 HOC 风格的国际化库，迁移到 hooks 时遇到的工程问题和 react-dnd v14 类似
- [[react]] hooks 调度——理解 useDrag 内部的 useEffect 注册/清理，要先理解 React 18 的 effect 时序

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dnd-kit]] —— dnd-kit — React 现代拖拽 toolkit
- [[preact]] —— Preact — 3KB React 替代
- [[react]] —— React UI 组件库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
- [[sortablejs]] —— SortableJS — 一行代码让任何列表能用手拖排序

