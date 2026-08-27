---
title: TOAST UI Calendar — 带日历分组的 day/week/month 组件
description: NHN TOAST UI Calendar uses a Zustand-style store and EventModel, then renders the week view immediately
来源: https://github.com/nhn/tui.calendar
日期: 2026-08-27
分类: 日期时间
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/nhn/tui.calendar
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 99ee702948d0473b18534df14e62128057b4fcf4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.3
---

## 是什么

TOAST UI Calendar 是 NHN 的浏览器日历组件，包名 `@toast-ui/calendar`。日常类比：它像一本已经装订好的三栏日程本——封面写死只有 day / week / month，里面用一本 immer 记事本（store）记下所有事件。

```js
import Calendar from "@toast-ui/calendar";
import "@toast-ui/calendar/toastui-calendar.css";

const calendar = new Calendar("#calendar", {
  defaultView: "week",
  usageStatistics: false,
  calendars: [{ id: "1", name: "Work", backgroundColor: "#00a9ff" }]
});

calendar.createEvents([
  {
    id: "evt-1",
    calendarId: "1",
    title: "Standup",
    category: "time",
    start: "2026-08-27T09:30:00",
    end: "2026-08-27T10:00:00"
  }
]);
```

`Calendar` 构造函数在确认 `defaultView` 合法后**立刻** `render()`。容器可以是 CSS 选择器或 Element；选不中时 `container` 为 `null`，`render()` 会静默跳过。

## 为什么重要

不理解这条内置三视图合同，下面这些事会踩空：

- 为什么 `defaultView: 'dayGridMonth'` 会直接抛错，而不是退化成月视图
- 为什么 `getEvent('evt-1')` 不够，还必须带 `calendarId`
- 为什么没改任何选项也会对 Google Analytics 发 hostname
- 为什么 `destroy()` 一个实例，可能拆掉页面上其他实例的 DOMPurify hook

## 核心要点

主链可以拆成五步：

1. **工厂立刻上屏**：`factory/calendar.tsx` 只接受 `day` / `week` / `month`。默认 `week`。非法值抛 `InvalidViewTypeError`。

2. **Zustand 风格 store**：`initCalendarStore` 把 options / events / view / popup / dnd 切成 slice；写操作走 immer `produce`。UI 用 Preact hook 订阅。

3. **EventModel 而不是裸对象**：默认 `category: 'time'`。`category === 'allday'` 会强制 `isAllday`。`milestone` / `task` 会把 `start` 改成 `end`。查找键是 `(id, calendarId)` 一对，不是单 id。

4. **时区可选、能力不齐**：`timezone.zones` 默认空数组。IANA 名走 `Intl.DateTimeFormat.prototype.formatToParts`；没有 `formatToParts` 时退回本地 offset 并 `warn`。也可以自己给 `customOffsetCalculator`。

5. **副作用默认开**：`usageStatistics` 默认 `true`，构造时 `sendHostname('calendar', GA_TRACKING_ID)`。模板字符串会进 `isomorphic-dompurify`。

## 实践示例

### 案例 1：构造即 week 视图

上面的例子已经是主路径。`useFormPopup` / `useDetailPopup` 默认都是 `false`，所以双击格子不会自动弹出官方表单；那是选项，不是隐藏默认 UI。

### 案例 2：按日历分组查事件

```js
const event = calendar.getEvent("evt-1", "1");
const el = calendar.getElement("evt-1", "1");
```

`getEvent` 在 store 里用 `id` **和** `calendarId` 查找，找不到返回 `null`。`getElement` 再按 `[data-event-id][data-calendar-id]` 去容器里查节点。两个 id 都要给对。

### 案例 3：关掉统计并改成月视图

```js
const calendar = new Calendar(el, {
  defaultView: "month",
  usageStatistics: false,
  month: { isAlways6Weeks: true, visibleEventCount: 6 }
});
calendar.changeView("day");
```

`month.isAlways6Weeks` 默认就是 `true`，`visibleEventCount` 默认 6。`changeView` 只切这三张内置视图，不会加载 plugin。

## 踩过的坑

1. **把 FullCalendar 的 view 名抄过来**：这里没有 `dayGridMonth` / `timeGridWeek`。只有三个字符串，写错就 throw。

2. **忘记 `usageStatistics: false`**：默认值是 `true`。这是网络副作用，不是文档里的可选项装饰。

3. **`destroy()` 清掉全局 DOMPurify hook**：`sanitizer.ts` 在构造时 `addHook`，销毁时 `removeAllHooks()`。多个实例共存时，销毁其中一个等于拆掉所有实例的 sanitizer hook。

4. **以为 `EventModel.schema.required = ['title']` 会拦空标题**：`createEvents` 只是 `new EventModel(event)` 再放进 collection，构造函数不会按 schema throw。

## 适用 vs 不适用场景

**适用**：

- 产品只要 day / week / month，并且事件天然带日历分组（`calendarId`）
- 需要里程碑/任务条（`category: 'milestone' | 'task'`）和 allday 车道
- 能接受 Preact + immer 运行时，并显式关掉 usage statistics

**不适用**：

- 要自己拼 plugin 视图、JSON feed、主题包 → 看 [[fullcalendar]]
- 要横向轨道/甘特，不要月格子 → 看 [[vis-timeline]]
- 只要时区安全的日期对象，不要 UI → 看 [[temporal-polyfill]] / [[dayjs]]
- 需要持续上游发布：固定 2.1.3 的 calendar 包停在 2022-08-16，本文不把它写成当前活跃主线

## 固定版本边界

- 本文绑定 `nhn/tui.calendar@99ee7029...`，lightweight tag `calendar@2.1.3` 与 npm `@toast-ui/calendar@2.1.3` 的 `gitHead` 一致。
- 同日的 `react-calendar@2.1.3` / `vue-calendar@2.1.3` 指向后续提交 `3b239554...`，不是这个 calendar 包 revision。
- 默认 `defaultView='week'`，`usageStatistics=true`，月视图 `isAlways6Weeks=true`。
- 本文未安装依赖、未在浏览器渲染、未验证 GA 请求或 DOMPurify 运行结果，状态保持 `UNVERIFIED`。

## 学到什么

1. **“日历组件”可以完全不走 plugin 机身**——三视图写死，换来的是更短的构造路径和更窄的扩展面。
2. **事件身份可以是一对键**：`id` 不够，`calendarId` 才是分组合同。
3. **默认统计是安全/隐私边界**：开源 UI 库的默认网络行为必须写进笔记，不能只写“可选”。
4. **全局 hook 的生命周期要按实例数来想**——`removeAllHooks` 不是实例局部清理。

## 应用型自测

1. `new Calendar(el, { defaultView: 'timeGridWeek' })` 会得到一周时间格，还是抛错？
2. 两个事件都叫 `id: '1'`，但 `calendarId` 分别是 `work` 和 `life`。`getEvent('1')` 能取到哪一个？
3. 两个 Calendar 实例共享一页。销毁第一个之后，第二个的链接 sanitizer hook 还在吗？

检查点：

1. 抛 `InvalidViewTypeError`。合法值只有 `day` / `week` / `month`。
2. 都不能。`getEvent` 需要 `(eventId, calendarId)` 两个参数。
3. 按源码不应再在。`destroy()` 调用的是 DOMPurify `removeAllHooks()`，作用域是进程全局。

## 延伸阅读

- 仓库：[github.com/nhn/tui.calendar](https://github.com/nhn/tui.calendar)
- 固定源码：[nhn/tui.calendar](https://github.com/nhn/tui.calendar) —— 本文绑定提交 `99ee702948d0473b18534df14e62128057b4fcf4`
- 包：`@toast-ui/calendar@2.1.3`
- [[fullcalendar]] —— plugin 化的对照实现
- [[vis-timeline]] —— 横向时间轴对照
- [[immer]] —— store 写入用的 produce
- [[preact]] —— 渲染层

## 关联

- [[fullcalendar]] —— v7 用 plugin 拼视图；这里把三视图写进工厂
- [[vis-timeline]] —— 轨道时间线，不是月/周格子
- [[immer]] —— `createEvents` / `setOptions` 的不可变更新实现
- [[preact]] —— 日历 UI 的渲染器
- [[dayjs]] —— 日期算术，不负责画日历
- [[temporal-polyfill]] —— 对照：TUI 用 Intl，FullCalendar v7 用 Temporal polyfill
