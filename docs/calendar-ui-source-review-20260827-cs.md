# Calendar UI source review

> 用途：记录 FullCalendar 与 TOAST UI Calendar 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL CS
- evidence：GitHub metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## FullCalendar

- canonical source：`https://github.com/fullcalendar/fullcalendar`
- revision：`f413ddfe7cf28b4c82bc6d5dfb861f1a55cca161`
- package：`fullcalendar@7.0.2`（monorepo `@fullcalendar-monorepos/standard@7.0.2`）
- tag：annotated `v7.0.2`（tag object `fede0946...`，tag name `subrepo/standard/v7.0.2`）peel 到上述 commit
- npm：`fullcalendar@7.0.2` 与 `@fullcalendar/core@7.0.2` 的 `gitHead` 均为空；版本号与 GitHub tag 对齐，未另猜 commit
- inspected：
  - `package.json`
  - `packages/vanilla/package.json`
  - `packages/vanilla/src/Calendar.tsx`
  - `packages/vanilla/src/index.ts`
  - `packages/vanilla/src/public-api.ts`
  - `packages/preact/src/api/CalendarApiImpl.ts`
  - `packages/preact/src/reducers/CalendarDataManager.ts`
  - `packages/preact/src/options.ts`
  - `packages/preact/src/global-plugins.ts`
  - `packages/preact/src/event-sources/array-event-source.ts`
  - `packages/preact/src/event-sources/json-feed-event-source.ts`
  - `packages/preact/src/daygrid/index.ts`
  - `packages/headless-calendar/src/env.ts`
  - `packages/core-types/package.json`
  - `CHANGELOG.md`
- observed：
  - vanilla `Calendar` 构造函数接收 `HTMLElement`，用 Preact `createRoot` 挂到该节点，但不会自动 `render()`；
  - 状态走 `CalendarDataManager` 的 action 队列；拖拽/缩放/`MERGE_EVENTS` 立即重绘，其余可按 `rerenderDelay` 合并；
  - 视图与主题都是 plugin：`fullcalendar/daygrid` 默认 `initialView` 为 `dayGridMonth` 且 `fixedWeekCount: true`；
  - 全局 plugin 只注册 array / function / JSON feed 三种 event source，以及 simple recurring；
  - JSON feed 默认 method 为 GET，查询参数默认 `start` / `end` / `timeZone`；
  - `DateEnv` 在 `local`/`UTC` 之外用 `temporal-polyfill` 的 Instant / ZonedDateTime；`temporal-polyfill@^1.0.1` 是 peerDependency；
  - `@fullcalendar/core` 在 v7 只剩类型包，vanilla 入口是 `fullcalendar`。

## TOAST UI Calendar

- canonical source：`https://github.com/nhn/tui.calendar`
- revision：`99ee702948d0473b18534df14e62128057b4fcf4`
- package：`@toast-ui/calendar@2.1.3`
- tag：lightweight `calendar@2.1.3` 与 npm `gitHead` 同指上述 commit
- later tags：`react-calendar@2.1.3` / `vue-calendar@2.1.3` 指向后续 wrapper 版本提交 `3b239554...`，不是 calendar 包本身
- inspected：
  - `apps/calendar/package.json`
  - `apps/calendar/src/index.ts`
  - `apps/calendar/src/factory/calendar.tsx`
  - `apps/calendar/src/factory/calendarCore.tsx`
  - `apps/calendar/src/contexts/calendarStore.ts`
  - `apps/calendar/src/store/index.ts`
  - `apps/calendar/src/slices/options.ts`
  - `apps/calendar/src/slices/calendar.ts`
  - `apps/calendar/src/model/eventModel.ts`
  - `apps/calendar/src/controller/base.ts`
  - `apps/calendar/src/time/timezone.ts`
  - `apps/calendar/src/utils/sanitizer.ts`
- observed：
  - `Calendar` 构造函数在校验 `defaultView` 后立刻 `render()`；容器可以是 selector 或 Element；
  - 合法视图只有 `day` / `week` / `month`，非法值抛 `InvalidViewTypeError`；
  - 状态是 Zustand 风格 store + immer `produce`；事件 CRUD 写进 `calendar` slice；
  - `EventModel` 默认 `category: 'time'`；`category === 'allday'` 会强制 `isAllday`；milestone/task 把 `start` 改成 `end`；
  - `getEvent` / `getElement` 必须同时给 event id 与 calendar id；
  - `usageStatistics` 默认 `true`，构造时会 `sendHostname('calendar', GA_TRACKING_ID)`；
  - `month.isAlways6Weeks` 默认 `true`，`visibleEventCount` 默认 6；
  - IANA 时区走 `Intl.DateTimeFormat.prototype.formatToParts`；不支持时退回本地 offset 并 warn；
  - 实例创建时给 DOMPurify 加全局 attribute hook，`destroy()` 调用 `removeAllHooks()`。
