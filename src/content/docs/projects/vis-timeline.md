---
title: vis-timeline — 时间轴 / 日程 / 历史事件三合一组件
来源: 'https://github.com/visjs/vis-timeline + visjs 社区文档 https://visjs.github.io/vis-timeline/docs/timeline/'
日期: 2026-06-01
分类: 前端工程
难度: 入门
---

## 是什么

vis-timeline 是 **横向时间轴可视化组件，把一堆带时间戳的事件画成可缩放、可拖拽、可分组的轨道**。日常类比：像视频剪辑软件 Premiere 的轨道时间线——上面堆着片段（item），左边是轨道名（group），鼠标滚轮缩放、拖拽平移，**同一份组件能当项目甘特图、个人日程、历史事件长河三种用**。

最小用法（先准备一个带宽高的 `div` 当画布，并引入样式）：

```js
import { Timeline, DataSet } from 'vis-timeline/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.css';

const items = new DataSet([
  { id: 1, content: '需求评审', start: '2026-06-01', end: '2026-06-03' },
  { id: 2, content: '开发',     start: '2026-06-04', end: '2026-06-15' },
  { id: 3, content: '上线',     start: '2026-06-16', type: 'point' },
]);

new Timeline(document.getElementById('viz'), items, { stack: true, zoomable: true });
```

3 条数据，组件自己画轴、挂滚轮缩放、堆叠避重叠。它和 [[vis-network]] 同属荷兰 Almende B.V. 的 vis.js 家族，2019 年拆成独立 npm 包 `vis-timeline`，是家族里**仅次于 Network 还在活跃**的子项目。`standalone` 入口自带依赖，不要再从 `vis-data` 另引一份 DataSet。

## 为什么重要

不理解 vis-timeline，下面这些事都没法解释：

- 为什么"项目甘特图 + 个人日程 + 历史长河"看着差很远，**底层都是同一种数据结构**——一组带 `start` / `end` / `group` 的 item
- 为什么自己用 div 拼时间轴永远做不利索：**缩放 / 平移 / 重叠堆叠**这三件事各自就是一坨边界条件
- 为什么这类组件多用 DOM（网页里的真实标签）不用 Canvas（一块像素画布）：item 常带富文本和点击，DOM 的事件冒泡比自己在画布上做 hit-test（点哪里算点中）省事
- 为什么时间组件离不开 moment.js：跨时区、跨夏令时、跨日历的"+1 个月"语义不是原生 `Date` 能扛的

## 核心要点

vis-timeline 的设计可以拆成 **三句话**：

1. **DataSet 双源驱动**（像两本活页账本）：`items` 记事件，`groups` 记横向轨道（可选）。两者都是可 `add / update / remove` 的 DataSet，组件订阅变化自动重画——改数据就改画面，不用手动画图。

2. **item 有 4 种类型**（像四种贴纸）：`box` 默认方块 / `point` 圆点无 end / `range` 带 end 的横条 / `background` 铺满整列做高亮。类型决定样式和能不能拖动改时长。

3. **DOM 渲染 + 视口虚拟化**（像只给镜头里的演员化妆）：所有 item 是绝对定位的 div，但**屏幕外的不渲染**。缩放 / 平移时只重排可见 item，千级数据也撑得住；代价是性能上限不如 Canvas。

## 实践案例

### 案例 1：分组 + 嵌套（团队甘特图）

```js
const groups = new DataSet([
  { id: 'fe', content: '前端', nestedGroups: ['fe-a', 'fe-b'] },
  { id: 'fe-a', content: 'A 同学' },
  { id: 'fe-b', content: 'B 同学' },
  { id: 'be', content: '后端' },
]);
const items = new DataSet([
  { id: 1, group: 'fe-a', content: '登录页', start: '2026-06-01', end: '2026-06-05' },
  { id: 2, group: 'be',   content: '鉴权 API', start: '2026-06-02', end: '2026-06-08' },
]);
new Timeline(document.getElementById('viz'), items, groups, { stack: true });
```

三步：① 用 `groups` 建轨道，父组写 `nestedGroups` 挂子轨道；② `items` 用 `group` 字段挂到某条轨道；③ `new Timeline(..., items, groups, options)`。点父组名可折叠子轨道——团队 30 人也不糊成一片。

### 案例 2：受控缩放范围 + 跳转

```js
const timeline = new Timeline(document.getElementById('viz'), items, {
  start: '2026-06-01', end: '2026-06-30',
  min: '2026-01-01', max: '2026-12-31',
  zoomMin: 1000 * 60 * 60 * 24,
  zoomMax: 1000 * 60 * 60 * 24 * 365 * 5,
});
timeline.setWindow('2026-07-01', '2026-07-31', { animation: true });
```

三步：① `start/end` 定初始窗口；② `min/max` 锁可拖边界，`zoomMin/zoomMax` 锁缩放档（毫秒），防缩到"一秒一屏"；③ `setWindow` 带动画跳转，适合做"今天 / 下月"按钮。

### 案例 3：可编辑 + 事件回调

```js
new Timeline(document.getElementById('viz'), items, {
  editable: { add: true, updateTime: true, remove: true },
  onMove: (item, callback) => {
    if (item.start < new Date()) return callback(null);
    callback(item);
  },
});
```

三步：① `editable` 打开拖改 / 双击新增 / 删除；② `onMove` 在落盘前拦截；③ 传 `callback(null)` 拒绝，传 `callback(item)` 放行——做权限或"不许拖到过去"很方便。

## 踩过的坑

1. **moment.js 是隐性依赖**：内部用 moment 处理时区与格式化，`standalone` bundle 会塞进 60KB+。想瘦身走 `vis-timeline/peer`，自己注入一份 moment。
2. **`stack: true` 在大数据下卡顿**：堆叠避重叠近似 O(n²)（条数翻倍，比对次数约翻四倍）。500+ item 同视口缩放易掉帧——关 stack 或按 group 拆薄。
3. **时区坑：字符串 vs Date 不一致**：`'2026-06-01'` 按 UTC 0 点解析，本地东 8 区会显示 6 月 1 日 8:00。统一用 `new Date(...)` 或带 `+08:00` 的 ISO 串。
4. **`type: 'background'` 不参与 stack**：用来铺"周末"色块；多个 background 后加盖前加，不是透明叠加。

## 适用 vs 不适用场景

**适用**：项目甘特图（任务 + 起止 + 负责人轨道）；个人 / 团队日程（按天 / 周 / 月切换）；历史事件长河（同一份数据缩放看十年或一天）；音视频编辑器轨道占位。

**不适用**：万级 item 同屏 → 切 [[d3]] Canvas / WebGL；React 想 props 驱动 → `react-vis-timeline`（更新慢）或自写 `useEffect` 同步 DataSet；复杂月格子日历 → [[fullcalendar]]；纵向时间轴 → vis-timeline 只支持横向。

## 历史小故事（可跳过）

- **2010 年代初**：荷兰 Almende B.V. 开源 vis.js，Timeline 与 Network、Graph2d 同发。
- **2018-2019**：Almende 缩减投入，社区 fork；拆成 `vis-network` / `vis-timeline` / `vis-data`，由 `visjs` 组织接管。
- **2019 至今**：版本走到 7.x，节奏放缓但 issue 仍在响应。Graph3d 几乎停更；Graph2d 仍随 Timeline 同仓维护，社区重心在 Timeline 与 Network。
- **moment.js 渊源**：早期就绑 moment；2020 年 moment 进入"完成态"后社区想换 [[date-fns]] 或 [[temporal-polyfill]]，至今未迁完。

## 学到什么

1. **时间轴 / 日程 / 甘特底层是同一抽象**——带 `start` / `end` / `group` 的 item；换皮就是换样式和交互配置。
2. **缩放 / 平移 / 堆叠是时间组件三大麻烦事**，用专业组件封掉是高 ROI。
3. **DOM vs Canvas**：Timeline 选 DOM 换富 CSS 与事件；Network 选 Canvas 换节点规模——同家族可走不同路线。
4. **moment 这类"功能完成态"依赖**提醒："稳定"和"停滞"有时只差一线。

## 延伸阅读

- 官方文档：[visjs.github.io/vis-timeline](https://visjs.github.io/vis-timeline/docs/timeline/)（每个 option 有 sandbox）
- 官方仓库：[github.com/visjs/vis-timeline](https://github.com/visjs/vis-timeline)
- 示例集合：[examples/timeline](https://visjs.github.io/vis-timeline/examples/timeline/)（30+ demo）
- [[vis-network]] —— 同家族另一个还活跃的子项目
- [[date-fns]] —— moment.js 的现代替代

## 关联

- [[vis-network]] —— 同 visjs 家族，Network 画关系图、Timeline 画时间，**核心抽象都是 DataSet**
- [[d3]] —— 底层造轮选项；vis-timeline 把"时间轴 + 缩放 + 堆叠"高层封装
- [[date-fns]] —— moment.js 后继者
- [[temporal-polyfill]] —— JS 原生时间标准的备胎
- [[fullcalendar]] —— 专攻月格子日历，与 vis-timeline 互补
- [[timelinejs]] —— 新闻叙事时间线，偏故事讲述而非甘特编辑

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/timelinejs]] —— TimelineJS — 把 Google Sheet 一键变成新闻时间线
