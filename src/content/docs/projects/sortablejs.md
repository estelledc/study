---
title: SortableJS — 一行代码让任何列表能用手拖排序
来源: 'https://github.com/SortableJS/Sortable'
日期: 2026-05-30
分类: projects
难度: 初级
---

## 是什么

SortableJS 是一个**零依赖的 JavaScript 拖拽排序库**——你给它一个装着列表项的 DOM 容器，它就让用户能用鼠标或手指把里面的项拖来拖去重新排顺序。日常类比：像超市货架的可调挡板——你不用拆货架，只需要让原本固定的隔板变成可以推着滑动的，整个排列就活了。

最小用法只有两行：

```html
<ul id="my-list"><li>A</li><li>B</li><li>C</li></ul>
<script>new Sortable(document.getElementById('my-list'), { animation: 150 });</script>
```

页面加载完，这个 `ul` 里的 `li` 就能用鼠标按住拖、也能在手机上用手指按住拖。**不需要 React，不需要 Vue，不需要 jQuery**，所以 2013 年到现在，它一直是「想加个拖拽排序但又不想引一个框架」的默认选择。

它的核心定位是「**框架无关 + 移动端 + 零依赖**」三件套——直到今天，能同时满足这三条的拖拽库依然不多。

## 为什么重要

不理解 SortableJS 解决了什么，下面这些事都不好解释：

- 为什么浏览器原生有 HTML5 DnD API，开源社区还要再造一个轮子——因为原生 DnD 在手机上几乎不能用，而且 API 设计成 1990s 风格的「拷贝 / 粘贴」语义
- 为什么把一份「能跑在桌面 + 移动端 + IE9」的拖拽逻辑写到 30KB 已经是社区共识的工业标准
- 为什么 Vue 的官方拖拽方案 `vue.draggable.next` 内部其实是 SortableJS——Vue 团队选择套壳而不是从零写
- 为什么同样是拖拽，dnd-kit 用 hooks 而 SortableJS 用 `new + 事件回调`——背后是 imperative DOM 思路 vs React 受控思路
- 为什么一个 28k 星、周下载 2M 的库，主要 commit 集中在 2013-2018，之后还能继续被广泛使用——API 稳定、需求面窄、没什么可加的

## 核心要点

把 SortableJS 拆成三件事：

1. **构造**：`new Sortable(el, options)` 接收一个 DOM 容器和一份配置；类比就像给一段电线装上插头，从此这段电线能通电。容器子元素自动变成可拖项，不用再手动 `addEventListener`。

2. **配置**：`group / handle / draggable / animation / ghostClass` 这一组选项决定**什么能拖、和谁能换、长什么样**。`group: 'shared'` 让两个列表能互拖；`handle: '.drag'` 限定只有子元素里带 `.drag` class 的部分被按下才算拖。

3. **事件**：`onStart / onEnd / onAdd / onRemove / onUpdate / onSort` 是六个回调，告诉你「拖动开始 / 结束 / 新增了来自别处的元素 / 元素被拖走了 / 列表内顺序变了 / 任意顺序变化」。每个回调都收到 `evt`，里面有 `oldIndex / newIndex / from / to / item`。

三件事合起来：**给容器装拖拽能力 + 配置怎么拖 + 监听拖完了之后做什么**。这跟你给一个 `<input>` 加 `oninput` 是同一种心智，只是「拖动」比「输入」复杂得多。

## 实践案例

### 案例 1：vanilla 看板（todo / doing / done 互拖）

```js
import Sortable from 'sortablejs';

const opt = { group: 'kanban', animation: 200, ghostClass: 'opacity-50' };
['todo', 'doing', 'done'].forEach(id => {
  Sortable.create(document.getElementById(id), {
    ...opt,
    onAdd: evt => console.log(`${id} +1`, evt.item.dataset.id),
  });
});
```

**逐部分解释**：三个列表共享同一个 `group: 'kanban'`，所以任意两列之间都能互拖；`onAdd` 在「接收方」触发，告诉你哪张卡片被拖进来——这是经典的 Trello 式看板雏形。

### 案例 2：React 受控列表（react-sortablejs）

```jsx
import { ReactSortable } from 'react-sortablejs';
const [todos, setTodos] = useState([{ id: '1', name: '买菜' }, { id: '2', name: '遛狗' }]);

<ReactSortable list={todos} setList={setTodos} animation={150}>
  {todos.map(t => <div key={t.id}>{t.name}</div>)}
</ReactSortable>
```

**逐部分解释**：`list / setList` 把数组当受控值；用户拖完，库自己调 `setTodos(新顺序)`，React 重新渲染——这样 React 的 vDOM 和实际 DOM 顺序就对齐了，避免了下一节会讲的踩坑 1。

### 案例 3：只让 handle 区域可拖 + 高亮原位置

```js
new Sortable(list, {
  handle: '.drag-handle',     // 只按住 .drag-handle 才算拖
  draggable: '.item',         // 只有 .item 子元素能被拖
  ghostClass: 'sortable-ghost', // 拖动中给原位置加这个 class
  onEnd: evt => track('reorder', { from: evt.oldIndex, to: evt.newIndex }),
});
```

**逐部分解释**：很多场景里整张卡片可点击（打开详情），但只有左上的小图标用来拖——`handle` 就是干这个的，避免「想点开却拖错」。`onEnd` 拿到 `oldIndex / newIndex` 适合做埋点。

`ghostClass` 给「原位置那个空缺」加 class——拖动时通常做成半透明虚线框，让用户知道「我是从这里出发的」，提升 UX。

## 踩过的坑

1. **在 React 里直接用裸 Sortable 改 DOM**：Sortable 把 `<li>` 实际位置改了，但 React 的 state 还是旧顺序，下次 render 又把顺序「修正」回去——必须用 react-sortablejs 把变化回写到 state。
2. **跨列表 `group` 的 `pull / put` 配置组合多到容易写错**：`true / false / 'clone' / 数组 / 函数` 五种取值，新手常搞反「这个列表能不能拖出去」和「能不能拖进来」。
3. **移动端 touchmove 不 `preventDefault` 会页面跟着滚**：手指按住拖，结果整个页面也在滚——必须依赖库内部的 `preventDefault`，自己别在外层再绑 `touchmove` 把它吞掉。
4. **SSR 框架（Next / Nuxt）下 hydration 失败**：服务端渲染列表后，客户端 Sortable 接管前如果列表已经被脚本改过顺序，hydration mismatch 直接报警告——拖拽逻辑应放在 `useEffect` 或 `onMounted` 里再初始化。

## 适用 vs 不适用场景

**适用**：

- 纯 vanilla / jQuery 老项目：没有现代框架运行时，SortableJS 几乎是唯一干净选项
- Vue 项目：通过 `vue.draggable.next` 间接使用，是 Vue 拖拽事实标准
- 看板 / Todo / 表单字段排序这类「列表内 + 跨列表」需求，开箱即用
- 想 5 分钟原型：`new Sortable(el)` 一行就有效果，没有学习曲线

**不适用**：

- 复杂的 React 项目，需要 keyboard a11y / 多种 collision detection → 选 dnd-kit 更顺手
- 需要画布式自由拖动（不是列表，是 x/y 任意位置）→ 用 interact.js 或自写
- 严格 TypeScript 项目要求原生类型 → SortableJS 类型定义靠 `@types/sortablejs`，没原生 TS 完整
- 需要长期未来支持：主作者节奏放缓，bus factor 偏低，关键依赖前要权衡

## 历史小故事（可跳过）

- **2013 年**：俄罗斯开发者 Konstantin Lebedev（GitHub 名 RubaXa）发布 SortableJS 1.0；当时 jQuery UI sortable 是主流，但在 iPad / 手机上几乎不能用，他直接重写了一份原生 mouse + touch 实现。
- **2015-2018 年**：黄金期。React 时代来临，社区做了 `react-sortablejs` 桥；Vue 团队借它写 `vuedraggable`，几乎所有 Vue 应用的拖拽都走它。
- **2019-2024 年**：作者 commit 节奏明显放缓，主要靠社区维护；同期 dnd-kit（2021）作为 React 时代的替代崛起；但 Vue 生态和 vanilla 场景里 SortableJS 仍是首选。
- **现在**：稳定在 1.15.x，~30KB min+gzip，星 28k+，周下载 2M，是「写完就不用怎么维护」的典型工具型库。

## 学到什么

- **API 稳定本身就是价值**：一个库 10 年没变 API，意味着 10 年前写的代码今天还能跑——这是工程上的稀缺品
- **框架无关 = 适配层多**：不绑框架的代价是每个框架都要一层 wrapper（react-sortablejs / vuedraggable），生态分散但天花板高
- **imperative DOM 在 React 时代仍有位置**：直接改 DOM 不是「错」，关键是和 vDOM 的边界划清楚（受控组件回写 state）
- **mobile-first 比看起来更重要**：HTML5 DnD 死在移动端这一点上，10 年内没被原生修好，留给开源库一个长期生态位
- **回调 API 比 hooks API 更通用**：`onStart / onEnd / onAdd` 是任何语言任何框架都能消费的事件回调，所以适配层好写

## 延伸阅读

- 官方文档：[sortablejs.github.io](https://sortablejs.github.io/Sortable/) —— 在线 demo 直接上手
- React 适配：[react-sortablejs GitHub](https://github.com/SortableJS/react-sortablejs)
- Vue 适配：[vue.draggable.next GitHub](https://github.com/SortableJS/vue.draggable.next)
- 替代方案对比：[[dnd-kit]] —— React 时代主流拖拽库
- 早期 React 拖拽：[[react-dnd]] —— HTML5 DnD 风格的 React 库
- 在线试玩：sortablejs.github.io 顶部栏的 5 个示例（list / handle / nested / clone / multi-drag）覆盖了 90% 用法
- 源码导读：`src/Sortable.js` 主入口大约 3000 行，重点看 `_onDragStart` / `_onDragOver` / `_onDrop` 三段

## 关联

- [[dnd-kit]] —— React 生态新一代拖拽，hooks API + 内置 a11y，与 SortableJS 走完全不同路线
- [[react-dnd]] —— 老牌 React 拖拽，靠 HTML5 DnD 协议，移动端是它的硬伤
- [[react-aria]] —— 同样「框架/UI 解耦 + accessibility 第一」的设计哲学，可对照 SortableJS 的 framework-agnostic
- [[playwright]] —— 自动化测试 SortableJS 列表常用工具，模拟 mouse + touch 全场景
- [[axios]] —— 同属「API 稳定多年，maintenance mode」的工具型 JS 库代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[dnd-kit]] —— dnd-kit — React 现代拖拽 toolkit
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[recharts]] —— Recharts — 用 JSX 直接拼出图表的 React 组件库
- [[zod]] —— Zod — TypeScript-first schema 验证

