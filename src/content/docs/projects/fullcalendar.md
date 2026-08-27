---
title: FullCalendar — 插件化的月格子与时间格日历
description: Vanilla FullCalendar v7：CalendarDataManager 驱动视图插件，主题和 event source 都是可组合合同
来源: https://github.com/fullcalendar/fullcalendar
日期: 2026-08-27
分类: 日期时间
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/fullcalendar/fullcalendar
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f413ddfe7cf28b4c82bc6d5dfb861f1a55cca161
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.2
---

## 是什么

FullCalendar 是一个用 JavaScript 画月格子、周时间格和列表的日历组件。日常类比：它像一块可换镜头的相机机身——机身是 `Calendar` + `CalendarDataManager`，镜头是 daygrid / timegrid / interaction / theme 这些 plugin。

v7 的 vanilla 入口已经从 `@fullcalendar/core` 改成 `fullcalendar`：

```js
import { Calendar } from "fullcalendar";
import classicThemePlugin from "fullcalendar/themes/classic";
import dayGridPlugin from "fullcalendar/daygrid";
import interactionPlugin from "fullcalendar/interaction";
import "fullcalendar/skeleton.css";
import "fullcalendar/themes/classic/theme.css";

const calendar = new Calendar(document.getElementById("calendar"), {
  plugins: [classicThemePlugin, dayGridPlugin, interactionPlugin],
  initialView: "dayGridMonth",
  events: [{ title: "Meeting", start: new Date() }]
});
calendar.render();
```

构造函数只接收一个真实 `HTMLElement`。它会 `createRoot(el)` 并建好 data manager，但**不会**自动画出来；必须再调 `render()`。

## 为什么重要

不理解 v7 这套拆分，下面这些事会对不上：

- 为什么抄 v6 的 `import { Calendar } from '@fullcalendar/core'` 会拿到一个几乎只剩类型的包
- 为什么只 `new Calendar(el)` 却看不到格子——视图、主题、拖拽都要显式 plugin
- 为什么 named timezone 要装 `temporal-polyfill`，而 `timeZone: 'local'` 不必
- 为什么拖事件立刻重绘，改 option 却可能被 `rerenderDelay` 合并

## 核心要点

主链可以拆成五步：

1. **挂到 DOM 节点**：`packages/vanilla/src/Calendar.tsx` 用 Preact compat 的 `createRoot`。传入 selector 字符串不是这条 API 的合同。

2. **action 队列**：`CalendarDataManager` 把 option、日期、event store 收成内部 state。`dispatch` 先入队再 `drainActionQueue()`。

3. **plugin 拼出视图**：`fullcalendar/daygrid` 注册 `dayGridMonth` 等视图，并把自己的 `initialView` 设成 `dayGridMonth`；`dayGridMonth` 的 `fixedWeekCount` 为 `true`。没有对应 plugin，`initialView` 默认是空字符串。

4. **三种内建 event source**：全局 plugin 只接 array、function 和 JSON feed。JSON feed 默认 `GET`，查询参数名默认 `start` / `end` / `timeZone`。`lazyFetching` 默认 `true`。

5. **时区与日期算术**：`DateEnv` 对 `local`/`UTC` 走本地/UTC Date；其他 IANA 名走 `temporal-polyfill` 的 Instant / ZonedDateTime。包声明 peer `temporal-polyfill@^1.0.1`。

## 实践示例

### 案例 1：最小月视图

上面那段就是最小路径：plugin + CSS + `render()`。`editable` 默认 `false`，所以还没装 interaction 或没开 `editable` 时，格子不会变成可拖日程表。

### 案例 2：JSON feed 与可见范围

```js
calendar.addEventSource({
  url: "/api/events",
  method: "GET"
});
```

`json-feed-event-source.ts` 在 `url` 存在且 format 为空或 `json` 时认成 JSON source。请求会带上当前可见范围；参数名可被 `startParam` / `endParam` / `timeZoneParam` 覆盖。这不是 WebSocket，也不是自动重试层。

### 案例 3：切视图并停在某一天

```js
calendar.changeView("timeGridWeek", "2026-08-27");
calendar.next();
```

`changeView` 会先 `unselect()`。若第二参数同时有 `start` 和 `end`，它改的是 `visibleRange`，不是单日 `dateMarker`。`timegrid` 必须已经作为 plugin 注册，否则没有这张视图。

## 踩过的坑

1. **把 v6 的 `@fullcalendar/core` 当运行时**：固定源码里这个包只剩类型；vanilla 日历在 `fullcalendar`。connectors 走各自的包，不再依赖旧 core。

2. **以为构造等于上屏**：`isRendering` 要等 `render()` 才翻成 true。只 `new Calendar` 时节点上还没有格子。

3. **忽略 peer polyfill**：named timezone 路径直接 import `temporal-polyfill/fns/*`。没装 peer 时，这条路径在打包期就会断，不是运行时悄悄降级到 `local`。

4. **把 scheduler / resource 视图当成 MIT 包内功能**：本仓 changelog 把 resource / timeline 指到 `fullcalendar-scheduler`。本文只读了 standard monorepo，不把 Premium API 写成默认能力。

## 适用 vs 不适用场景

**适用**：

- 需要月格子、周时间格、列表，并且愿意按 view/theme 拆 plugin
- 事件来自静态数组、函数或按可见窗口拉取的 JSON
- 浏览器里已经能提供 `HTMLElement`，并且接受 Preact 作为内部渲染器

**不适用**：

- 只要横向甘特/轨道，不要月格子 → 看 [[vis-timeline]]
- 只要日期算术、不要 UI → 看 [[dayjs]] / [[date-fns]] / [[temporal-polyfill]]
- 需要资源排程、timeline 商业视图 → 那是另一条 scheduler 产品线，不在本次固定源码里
- 想把 CSS 选择器字符串直接丢进构造函数 → v7 vanilla 不接受

## 固定版本边界

- 本文绑定 `fullcalendar/fullcalendar@f413ddfe...`，annotated tag `v7.0.2` peel 到该提交；npm `fullcalendar@7.0.2` 的 `gitHead` 为空，未另猜 commit。
- 包名是 `fullcalendar`；`@fullcalendar/core` 在同一 monorepo 里只发布类型。
- 默认 `timeZone` 为 `local`，`editable` 为 `false`，`defaultTimedEventDuration` 为 `01:00:00`。
- 本文未安装依赖、未在浏览器里 `render()`、未跑上游测试或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **日历 UI 的可组合性来自 plugin 边界**——视图、主题、拖拽、event source 不是同一个对象上的开关。
2. **v7 的包名本身就是迁移合同**——旧 `@fullcalendar/core` 入口不能靠“差不多”混用。
3. **时区策略必须显式**：`local` / `UTC` / IANA 走三条实现，IANA 还要 polyfill。
4. **重绘时机是状态机的一部分**——拖拽热路径和普通 option 更新不是同一条渲染预算。

## 应用型自测

1. `new Calendar(document.getElementById("c"), { plugins: [dayGridPlugin] })` 之后，页面上会立刻出现月格子吗？
2. 只设置 `timeZone: 'Asia/Shanghai'`，不安装 `temporal-polyfill`，named timezone 路径还能按源码合同工作吗？
3. JSON event source 没写 `method` 时，默认用哪一种 HTTP 方法？

检查点：

1. 不会。构造只建 root 和 data manager，必须再调 `render()`。
2. 不能。`DateEnv` 对非 local/UTC 直接依赖 `temporal-polyfill` peer。
3. `GET`。`json-feed-event-source.ts` 把 `refined.method` 缺省值规范成大写 GET。

## 延伸阅读

- 文档：[fullcalendar.io/docs](https://fullcalendar.io/docs)
- 仓库：[github.com/fullcalendar/fullcalendar](https://github.com/fullcalendar/fullcalendar)
- 固定源码：[fullcalendar/fullcalendar](https://github.com/fullcalendar/fullcalendar) —— 本文绑定提交 `f413ddfe7cf28b4c82bc6d5dfb861f1a55cca161`
- v7 升级说明见仓库 `CHANGELOG.md` 的 Vanilla JS 一节
- [[tui-calendar]] —— 另一条 week/month 日历合同，构造即渲染
- [[temporal-polyfill]] —— v7 named timezone 的 peer
- [[vis-timeline]] —— 横向时间轴，不是月格子

## 关联

- [[tui-calendar]] —— 同样画日历，但是 store + 内置 day/week/month，不是 plugin 机身
- [[vis-timeline]] —— 轨道时间线，互补而不是替代
- [[dayjs]] —— 日期算术，不负责画格子
- [[date-fns]] —— 函数式日期工具
- [[temporal-polyfill]] —— FullCalendar v7 的 timezone peer
- [[preact]] —— vanilla 包内部的渲染器
- [[react]] —— 官方另有 React connector 包
