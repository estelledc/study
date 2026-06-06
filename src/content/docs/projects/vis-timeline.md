---
title: vis-timeline — 时间轴 / 日程 / 历史事件三合一组件
来源: 'https://github.com/visjs/vis-timeline + visjs 社区文档 https://visjs.github.io/vis-timeline/docs/timeline/'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

vis-timeline 是 **横向时间轴可视化组件，把一堆带时间戳的事件画成可缩放、可拖拽、可分组的轨道**。日常类比：像视频剪辑软件 Premiere 的轨道时间线——上面堆着片段（item），左边是轨道名（group），鼠标滚轮缩放、拖拽平移，**同一份组件能当项目甘特图、个人日程、历史事件长河三种用**。

最小用法：

```js
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';

const items = new DataSet([
  { id: 1, content: '需求评审', start: '2026-06-01', end: '2026-06-03' },
  { id: 2, content: '开发',     start: '2026-06-04', end: '2026-06-15' },
  { id: 3, content: '上线',     start: '2026-06-16', type: 'point' },
]);

new Timeline(container, items, { stack: true, zoomable: true });
```

3 条数据，组件自己画轴、自己挂滚轮缩放、自己堆叠避免重叠。它和 [[vis-network]] 是同一家族（荷兰 Almende B.V. 的 vis.js），2019 年拆成独立 npm 包 `vis-timeline` 由 visjs 社区维护，是这个家族里**仅次于 Network 还在活跃**的子项目。

## 为什么重要

不理解 vis-timeline，下面这些事都没法解释：

- 为什么"项目甘特图 + 个人日程 + 历史长河"看着差很远，**底层都是同一种数据结构**——一组带 `start` / `end` / `group` 的 item
- 为什么自己用 div 拼时间轴永远做不利索：**缩放 / 平移 / 重叠堆叠**这三件事各自就是一坨边界条件
- 为什么这类组件多用 DOM 不用 Canvas：item 经常带富文本和点击事件，DOM 的事件冒泡比 Canvas 自己 hit-test 省事
- 为什么时间组件离不开 moment.js：跨时区、跨夏令时、跨日历的"+1 个月"语义不是 `Date` 能扛的

## 核心要点

vis-timeline 的设计可以拆成 **三句话**：

1. **DataSet 双源驱动**：`items`（事件本体）+ `groups`（横向轨道，可选）。两者都是 `vis-data` 的 DataSet，命令式 `add / update / remove`，组件订阅变化自动重画。

2. **item 有 4 种类型**：`box`（默认方块）/ `point`（圆点，无 end）/ `range`（带 end 的横条）/ `background`（铺满整列做高亮）。类型决定渲染样式和能不能拖动改时长。

3. **DOM 渲染 + 视口虚拟化**：所有 item 是绝对定位的 div，但**视口外的不渲染**。缩放 / 平移时只重排可见 item，1000+ 条数据也撑得住。代价是富 CSS 自定义自由但性能上限不如 Canvas。

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
new Timeline(container, items, groups, { stack: true });
```

`nestedGroups` 让组可折叠，点击父组名收起所有子轨道——团队 30 人也不会糊成一片。

### 案例 2：受控缩放范围 + 跳转

```js
const timeline = new Timeline(container, items, {
  start: '2026-06-01',
  end:   '2026-06-30',
  min:   '2026-01-01',  // 滚轮缩到这之前就停
  max:   '2026-12-31',  // 拖到这之后也停
  zoomMin: 1000 * 60 * 60 * 24,           // 最细 1 天一格
  zoomMax: 1000 * 60 * 60 * 24 * 365 * 5, // 最粗 5 年一屏
});

timeline.setWindow('2026-07-01', '2026-07-31', { animation: true });
```

`min / max` 防止用户滚到史前或下个世纪；`zoomMin / zoomMax` 框住缩放档位，避免一不小心缩到"一秒一屏"卡死。`setWindow` 带动画跳转，做"今天" / "下月"快捷按钮很顺手。

### 案例 3：可编辑 + 事件回调

```js
new Timeline(container, items, {
  editable: { add: true, updateTime: true, remove: true },
  onMove: (item, callback) => {
    if (item.start < new Date()) return callback(null);  // 不让拖到过去
    callback(item);
  },
});
```

`editable` 一开，用户能直接拖动 item 改起止时间、双击空白处新增、右键删除。`onMove` 是拦截钩子——传 `null` 给 `callback` 就拒绝这次修改，做权限校验或边界保护很方便。

## 踩过的坑

1. **moment.js 是隐性依赖**：vis-timeline 内部用 moment 处理时区和格式化，bundle 里会塞进 60KB+。想瘦身要走 `vis-timeline/peer` 入口手动注入 moment 实例，而不是用默认的 `standalone`。

2. **`stack: true` 在大数据下卡顿**：堆叠避重叠是 O(n²) 的贪心算法。500+ item 同视口时，缩放时能感觉到掉帧。解法：开 `stack: false` 让 item 重叠（用 z-index 区分），或按 group 拆分降低单组数量。

3. **时区坑：start 用字符串 vs Date 对象不一致**：`'2026-06-01'` 被解析成 `UTC` 0 点，但显示用本地时区，**东 8 区会看到 6 月 1 日 8:00**。要么全统一用 `new Date(...)`，要么用 `'2026-06-01T00:00:00+08:00'` 显式带时区。

4. **`type: 'background'` 不参与 stack**：背景类 item 用来铺色块（如"周末"高亮），它不跟普通 item 抢位置。但**多个 background 会互相覆盖**，后加的盖前面，新人常以为透明叠加。

## 适用 vs 不适用场景

**适用**：

- 项目甘特图（任务 + 起止 + 负责人轨道）
- 个人 / 团队日程视图（按天 / 周 / 月切换）
- 历史事件长河（缩放看十年 vs 看一天，同一份数据）
- 视频 / 音频编辑器轨道占位（item 当片段，group 当轨道）

**不适用**：

- 万级 item 同屏 → 切 [[d3]] 自定义 Canvas / WebGL 方案，DOM 撑不住
- React 项目想 props 驱动 → 看 `react-vis-timeline` 包装（更新慢）或自己写 `useEffect` 同步 DataSet
- 复杂日历视图（月格子 + 跨日事件） → 用 [[fullcalendar]] 类专业日历，vis-timeline 的横向轴不擅长月格子
- 需要纵向时间轴（向下滚） → vis-timeline 只支持横向，竖版要自己做

## 历史小故事（可跳过）

- **2010 年代初**：荷兰研究公司 Almende B.V. 开源 vis.js，里面 Timeline 子模块和 Network、Graph2d 一起发版。
- **2018-2019**：Almende 缩减投入，社区 fork。原仓库拆成 `vis-network` / `vis-timeline` / `vis-data` 各自独立 npm 包，由 `visjs` GitHub 组织接管。
- **2019 至今**：版本走到 7.x，提交节奏放缓但 issue 仍在响应。Graph2d / Graph3d 几乎停更，Timeline 跟 Network 是家族里**仅有的两个还活的**。
- **moment.js 的渊源**：vis-timeline 早期就把 moment 当核心，2020 年 moment 进入"完成态"（不再加新功能）后社区一直想换 date-fns 或 [[temporal-polyfill]]，至今未完成迁移。

## 学到什么

1. **时间轴 / 日程 / 甘特三件套底层是同一抽象**——带 `start` / `end` / `group` 的 item 数组。换皮就是换样式和交互配置。
2. **缩放 / 平移 / 堆叠是时间组件的三大"麻烦事"**，自己写永远做不利索，用专业组件把这层封掉是高 ROI 决策。
3. **DOM vs Canvas 的取舍**：vis-timeline 选 DOM 换来富 CSS 和事件冒泡，付了"item 数量上限"的代价；vis-network 选 Canvas 换节点数量，付了"没法 CSS 调试"。**同家族不同子项目可以走不同路线**。
4. **moment.js 这种"功能完成态"的依赖** 提醒：不是所有库都活在持续演进里，"稳定"和"停滞"有时只差一线。

## 延伸阅读

- 官方文档：[visjs.github.io/vis-timeline](https://visjs.github.io/vis-timeline/docs/timeline/)（每个 option 有可玩 sandbox）
- 官方仓库：[github.com/visjs/vis-timeline](https://github.com/visjs/vis-timeline)
- 示例集合：[visjs.github.io/vis-timeline/examples/timeline/](https://visjs.github.io/vis-timeline/examples/timeline/)（30+ 个 demo 覆盖大多数场景）
- [[vis-network]] —— 同家族另一个还活跃的子项目，思路可对照
- [[date-fns]] —— moment.js 的现代替代，未来 vis-timeline 可能迁过去

## 关联

- [[vis-network]] —— 同 visjs 家族姐妹项目，Network 画关系图、Timeline 画时间，**核心抽象都是 DataSet**
- [[d3]] —— 底层造轮选项；vis-timeline 是把"时间轴 + 缩放 + 堆叠"这三件事高层化封装
- [[date-fns]] —— moment.js 后继者，处理时间运算的现代库
- [[temporal-polyfill]] —— JavaScript 原生时间标准的备胎，未来时间组件的基础
- [[fullcalendar]] —— 专攻日历视图（月格子）的替代方案，跟 vis-timeline 互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
- [[timelinejs]] —— TimelineJS — 把 Google Sheet 一键变成新闻时间线
- [[vis-network]] —— vis-network — barnesHut 物理引擎驱动的网络图

