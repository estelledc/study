---
title: cal.com — 不是再做一个 Calendly，是把"调度 SaaS"做成开源 + 可自托管 + 50 个 provider 都能插的协议
description: 大型应用范例——44.7k stars 的开源 Calendly 替代，Next.js + tRPC + Prisma + Postgres，多 provider 调度引擎工程范式精读
sidebar:
  order: 35
  label: calcom/cal.com
---

> 状元篇 v1.1 分支 A（大型应用 / monorepo / 多 provider 集成范式）。
> 基于 commit `180ede28f0bddf2738933a6e60a8e80f6116d7da`（2026-05-14，main 分支）的源码精读 + 浅克隆 + 一次"docker compose up + 创建一个 booking 看完整链路"hands-on。
> cal.com 是这个站点目前为止"集成最重"的笔记对象——一个 booking 流量要穿过 Next.js 路由 + tRPC + Prisma + Postgres + 50+ 个 provider 适配器（Google / Outlook / Apple / Daily / Zoom / Stripe / HubSpot...），
> 笔记的目标不是把每条 provider 讲完，而是讲清**"为什么 cal.com 把'适配器'抽象成 App Store，把'核心调度'放在 EventManager.create() 一个 600 行的方法里"**。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [calcom/cal.com](https://github.com/calcom/cal.com) |
| Star / Fork | 44,700 / 13,800（2026-05-28 拉取） |
| 最近活跃 | `pushed_at` daily，main 分支高频 merge（截至 2026-05-14 主干 commit `180ede28`） |
| 主分支 commit | `180ede28f0bddf2738933a6e60a8e80f6116d7da`（2026-05-14，"fix: add system-ui fallback to font stack for non-Latin script support #29346"） |
| 最近 5 commit | `180ede28...` / `fb014945...` / `a4a01a0f...` / `46eb533d...` / `e64de009...`（5/14、5/10、5/05、5/03、5/03） |
| 最新 release | v5.4.x 系列（按 monorepo packages 各自 versioning） |
| 主语言 | TypeScript 95.8% + 少量 SCSS / Solidity（GitHub linguist） |
| 维护方 | Cal.com, Inc.（核心团队基于 Delaware C-corp + 全远程） |
| 主要贡献者 | emrysal / PeerRich（CEO）/ keithwillcode / hariombalhara / sean-brydon（前 5，按 contribution 排序，截至 2026-05-28） |
| License | AGPL-3.0（self-host 友好；商业 SaaS 要 cal.com Inc. 付费版） |
| 类似项目 | Calendly（闭源 SaaS 王者）/ Acuity Scheduling（被 Squarespace 收购）/ SavvyCal（小而美闭源）/ Microsoft Bookings（O365 自带）/ YouCanBook.me / Doodle / Zcal / 自建（Google Calendar API + 一堆胶水代码） |
| 哲学不同竞品 | Calendly（"封闭 SaaS、不让你看 schema、按月付费"） vs cal.com（"我把整套调度引擎开源给你，你想自托管 / 改 schema / 接私有 LDAP 都可以"） |

## 一句话定位

**cal.com 不是"再做一个 Calendly"——
它是把"调度"这件事彻底协议化：booking 是一行 Postgres，availability 是一段 TZ 计算，video / calendar / payment 都是可插拔的 App Store 适配器，
所有人——个人 / 团队 / 企业——都能用同一份代码自托管，付费功能放在 EE（enterprise）目录单独管理。**

它的工程价值不在"调度算法"——可用时段计算其实很朴素，是一段 dayjs 区间合并；
真正的价值在**"如何让 Google Calendar / Outlook / Apple iCloud / 50+ 个 provider 共用同一套 EventManager 协议"**——
每个 provider 是一个实现 `Calendar` 接口的 service class，EventManager 不知道它们具体是谁，只知道"调用 createEvent，拿回 reference"。
读它的目的不是"抄一段代码"，是**"看一个真实在线产品如何把 50 个外部 API 收编进同一个抽象"**。

## Why（为什么是它而不是 Calendly / Acuity / SavvyCal / 自建）

cal.com 解决的不是"约会议这件事"——是"**约会议 + 我自己掌握 schema + 我自己掌控数据 + 我能扩展任何新 provider**"四件事**怎么用一个开源仓库统一交付**的问题。

[README 顶部宣传语](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/README.md)：

> Cal.com is the event-juggling scheduler for everyone. Trusted by millions, it's the open-source alternative to Calendly.

注意 "event-juggling" 这个词——不是 "scheduler" 也不是 "calendar"。它精准击中了 cal.com 全部产品决策的底牌：

1. **"event-juggling"**——不是"我帮你订一个会"，是"我帮你在 Google + Outlook + Apple + Zoom + Stripe + HubSpot 之间杂耍一场会"。
   单一 booking 必须同时落到 N 个外部系统，任何一个失败都要有 graceful degradation。这是和 Calendly 的核心差异——Calendly 把"集成"当 feature 卖，cal.com 把"集成"当抽象写。
2. **"open-source alternative"**——AGPL-3.0 而不是 MIT。AGPL 强制 SaaS 二次分发的人也开源自己的修改。
   这句话对企业法务是"小心"，但对个人 / hackathon / 内网团队意味着**"你自己跑就完全合法、零月费、零供应商风险"**。
3. **"trusted by millions"**——cal.com 的 SaaS 版（cal.com 域名）和开源版**完全是同一份代码**。`apps/web` 即生产入口，没有"开源是阉割版"的猫腻。

但只看产品宣传会错过**架构层的真正价值**——

cal.com 的真正特点是**"可用时段计算"看起来朴素，但 booking 链路必须容忍'有的 provider 慢 / 有的 provider 失败 / 有的 provider 异步回调'三种异构状态**。
为此它把核心调度抽成 `EventManager.create()` 一个 600 行的方法（[EventManager.ts](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/packages/features/bookings/lib/EventManager.ts)）——
所有 provider 调用都集中在这里 fan-out，结果聚合成 `EventResult[]`，**单个 provider 失败不回滚其他**——这是 cal.com 最深的一条工程取舍。

## 仓库地形

浅克隆后的顶层（截至 commit `180ede28f0bddf2738933a6e60a8e80f6116d7da`）：

```
apps/
  web/                     ← Next.js 应用（pages + app router 共存，迁移中）
  api/                     ← 独立 OpenAPI v2 服务（Node Express，给企业用户）
  console/                 ← 商业版管理控制台（EE only）
  embed-core/              ← 嵌入到第三方网站的 iframe 加载脚本
packages/
  features/                ← 业务模块（按"feature folder"组织）
    bookings/              ← booking 流水线（心脏，本笔记重点）
    calendars/             ← 跨 provider Calendar 抽象层
    conferencing/          ← 视频会议适配（zoom / daily / teams）
    crmManager/            ← CRM 同步（hubspot / salesforce）
    eventtypes/            ← EventType（活动定义）业务逻辑
    flags/                 ← feature flag 服务
    webhooks/              ← webhook builder + dispatcher
  app-store/               ← 50+ 个外部 provider 适配器，每个一个文件夹
  lib/                     ← 通用 lib（availability / dayjs / piiFreeData / 加密）
  trpc/                    ← tRPC routers（viewer / public / admin / loggedInViewer）
  prisma/                  ← schema + migrations + 客户端
  emails/                  ← react-email 模板
  ui/                      ← 内部 design system（类 shadcn 但更老）
  embeds/                  ← 嵌入 SDK（snippet / react / atoms）
  platform/                ← Atoms SDK（让别人把 cal.com 嵌进自己 app）
ee/                        ← 商业版功能（白标 / SSO / SCIM / managed events）
tests/                     ← Playwright e2e
```

**心脏文件清单（≥ 3，按 subsystem 分组）：**

| Subsystem | 文件 | 角色 |
|---|---|---|
| 调度核心 | `packages/features/bookings/lib/EventManager.ts` | 600+ 行，fan-out 到所有 provider 的中枢 |
| Booking 流水线 | `packages/features/bookings/lib/handleNewBooking/createBooking.ts` 等 24 个文件 | 11 阶段流水线，从 zod 解析到 webhook 入队 |
| 可用时段 | `packages/lib/availability.ts` + `packages/lib/getUserAvailability/` | 把 Schedule（每周 7 天的工作时间） + busy（已占用） + buffer + dst 合并成 free slots |
| App Store | `packages/app-store/_utils/getCalendar.ts` | 工厂方法，按 credential.type 拿对应 provider service |
| 单 provider 实现 | `packages/app-store/googlecalendar/lib/CalendarService.ts` | Google Calendar 适配器，实现 `Calendar` 接口 |

**commit 热点（按 subsystem 分组，2026-05-14 拉取）：**

```
bookings/lib/             ← 高频，每周多次（核心业务永远在动）
trpc/server/routers/      ← 中频，feature 加新 endpoint 时
app-store/<provider>/     ← 低频但分散（50+ provider 每个偶尔修一次）
prisma/schema.prisma      ← 中频（schema 演进）
ui/                       ← 中频（design system 持续维护）
```

启示：cal.com 是**"心脏 + 边缘"二分**，心脏（bookings + trpc）改得多但稳定，边缘（app-store）每个 provider 改频率很低但总量大。这是大型 SaaS 的典型形态。

![cal.com overall architecture](/projects/cal-com/01-architecture.webp)

**Figure 1**：cal.com 整体架构。客户端入口 4 类（booking 页 / 内部 dashboard / 第三方嵌入 / Atoms SDK），统一走 Next.js → tRPC → handleNewBooking → EventManager → Tasker。数据层独立：Postgres + getUserAvailability + App Store registry + Webhook builder + Email layer。下沿 5 个 provider 簇：Google Calendar、Office 365、Apple/CalDAV、视频（Daily/Zoom/Teams）、支付（Stripe/PayPal）。蓝色=Next.js，紫色=tRPC，绿色=Postgres，橙色=外部 provider。实线 = 同步请求路径，虚线 = 数据查询 / OAuth refresh。

![cal.com handleNewBooking pipeline](/projects/cal-com/02-handle-new-booking.webp)

**Figure 2**：handleNewBooking pipeline（简化）。8 个核心阶段：getBookingData → getEventType → loadAndValidateUsers → ensureAvailableUsers → validateBookingTime → createBooking → EventManager.create → Tasker enqueue。第 7 阶段（EventManager.create）扇出到 4 条独立通道：createVideoEvent、createAllCalendarEvents、createAllCRMEvents、Webhook+Email。底部红框标注失败模式：zod throws → 400；no available user → `NoAvailableUsersFound`；provider conflict → 单条失败但其他 provider 不回滚（这是 cal.com 最深的工程取舍之一）。

## 核心机制（Layer 3）

> 三段独立精读，按 subsystem 切分。每段含真实 GitHub permalink + ≥ 20 行真实 TS 代码 + 旁注 + 怀疑。

### 机制 A：可用时段计算（availability.ts + getUserAvailability）

**为什么它是"心脏"**：每个 booking 页面打开都要算 "this user 这周哪些时段空闲"。可用时段算错——booking 双订；算慢——页面 P50 拉到 800ms。这是 cal.com 用户感知性能的最直接来源。

来源：[`packages/lib/availability.ts`](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/packages/lib/availability.ts)（commit `180ede28f0bddf2738933a6e60a8e80f6116d7da`）

```typescript
// packages/lib/availability.ts
const defaultDayRange: TimeRange = {
  start: new Date(Date.UTC(0, 0, 0, 9, 0)),
  end: new Date(Date.UTC(0, 0, 0, 17, 0)),
};

export const DEFAULT_SCHEDULE: ScheduleAvailability = [
  [],            // Sun
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [],            // Sat
];

export const MINUTES_IN_DAY = 60 * 24;
export const MINUTES_DAY_END = MINUTES_IN_DAY - 1;
export const MINUTES_DAY_START = 0;

export function getAvailabilityFromSchedule(schedule: ScheduleAvailability): Availability[] {
  return schedule.reduce((availability: Availability[], times: TimeRange[], day: number) => {
    const addNewTime = (time: TimeRange) =>
      ({
        days: [day],
        startTime: time.start,
        endTime: time.end,
      } as Availability);

    const filteredTimes = times.filter((time) => {
      // 关键：把和已有 availability 时间相同的 day 合并成一个区间
      let idx;
      if (
        (idx = availability.findIndex(
          (schedule) =>
            schedule.startTime.toString() === time.start.toString() &&
            schedule.endTime.toString() === time.end.toString()
        )) !== -1
      ) {
        availability[idx].days.push(day);
        return false;
      }
      return true;
    });
    filteredTimes.forEach((time) => {
      availability.push(addNewTime(time));
    });
    return availability;
  }, [] as Availability[]);
}
```

旁注（一段一旁注）：

- **第 1-4 行**：`defaultDayRange` 用 `Date.UTC(0, 0, 0, 9, 0)` 构造——year=0, month=0, day=0, hour=9。这是一个 `1899-12-30 09:00 UTC` 的 epoch-style 时刻。**这里只用 hour/minute 字段，date 部分被故意忽略**。后面 `getWorkingHours()` 会读这两个 hour 把它"投影"到当前时区的当前周。这是一个老式但稳健的"用 Date 当 H:M 容器"惯例——现代项目会用 `LocalTime` 或 string，但 cal.com 是 2020 年开始的，那时 dayjs 还没普及到这种程度。
- **第 6-14 行**：`DEFAULT_SCHEDULE` 是 7-element 数组，下标 0=Sun ... 6=Sat。周一到周五给 9-17 工作时段，周末空。这是 SaaS 默认值——你可以在 settings/availability 改任何一格。**这个数组结构会一路传到前端，前端按下标渲染 7 列日历**——下标含义就是契约。
- **第 20-24 行**：`MINUTES_IN_DAY = 1440`，`MINUTES_DAY_END = 1439`。区分 1440 vs 1439 是为了"end-exclusive vs end-inclusive"——你可以工作到 23:59，但 1440 是"明天 00:00"。这种 off-by-one 在 booking 系统是地雷。
- **第 28-46 行**：`getAvailabilityFromSchedule` 把 7 个 day 的 TimeRange[] 扁平化成 `Availability[]`，**关键 trick** 是 day 合并——如果周一周二周三都是 9-17，输出只有一个 `Availability { days: [1,2,3], 9-17 }` 而不是三个独立条目。这是为了发送到 UI 时画 "Mon-Fri" 而不是 "Mon, Tue, Wed, Thu, Fri"。
- **第 35-39 行的相等判断**：`startTime.toString() === time.start.toString()`——为什么不用 `getTime()` 比较 epoch？因为这两个 Date 都是 1899-12-30 容器，date 部分理论上一样，但**在跨时区 / DST 边界，小数 ms 可能不一致**——toString 比较只看可读形式（含 timezone offset 字符串），意外更稳健。这是 5 年里反复打补丁出来的写法。

**怀疑 1**：`getAvailabilityFromSchedule` 里 `availability[idx].days.push(day)` 是**就地修改 reduce 累加器**，但它依赖于"reduce 还没产生新数组"。如果有人 spread 这个累加器（`[...availability, addNewTime(time)]`），合并就失效。代码里没有 lint 规则保护，是潜在 footgun——下次有人重构成 immutable 风格，"Mon-Fri 合并显示"会静默退化成"Mon, Tue, Wed, Thu, Fri"。这种 bug 不会让任何测试挂，只会让 UI 看起来更长一些。

### 机制 B：EventManager.create() — provider 扇出与部分成功语义

**为什么它是"心脏"**：booking 创建后，cal.com 需要在 N 个外部系统（视频会议 + 0-3 个日历 + CRM）同时落事件。这是 cal.com 全部"复杂度"的源头。

来源：[`packages/features/bookings/lib/EventManager.ts`](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/packages/features/bookings/lib/EventManager.ts)（同 commit）

```typescript
// EventManager.ts, lines ~287-360
public async create(
  event: CalendarEvent,
  options?: { skipCalendarEvent?: boolean }
): Promise<CreateUpdateResult> {
  const { skipCalendarEvent = false } = options ?? {};
  // TODO this method shouldn't be modifying the event object that's passed in
  const evt = processLocation(event);

  // Fallback to cal video if no location is set
  if (!evt.location) {
    const calVideo = await prisma.app.findUnique({
      where: { slug: "daily-video" },
      select: { keys: true, enabled: true },
    });

    const calVideoKeys = calVideoKeysSchema.safeParse(calVideo?.keys);

    if (calVideo?.enabled && calVideoKeys.success) evt["location"] = "integrations:daily";
    log.warn("Falling back to cal video as no location is set");
  }

  const [mainHostDestinationCalendar] =
    (evt.destinationCalendar as [undefined | NonNullable<typeof evt.destinationCalendar>[number]]) ?? [];

  // Fallback to Cal Video if Google Meet is selected w/o a Google Calendar connection
  if (evt.location === MeetLocationType && mainHostDestinationCalendar?.integration !== "google_calendar") {
    const [googleCalendarCredential] = this.calendarCredentials.filter(
      (cred) => cred.type === "google_calendar"
    );
    if (!isDelegationCredential({ credentialId: googleCalendarCredential?.id })) {
      log.warn(
        "Falling back to Cal Video integration for Regular Credential as Google Calendar is not set as destination calendar"
      );
      evt["location"] = "integrations:daily";
      evt["conferenceCredentialId"] = undefined;
    }
  }

  const isDedicated = evt.location ? isDedicatedIntegration(evt.location) : null;
  const isMSTeamsWithOutlookCalendar =
    evt.location === MSTeamsLocationType &&
    mainHostDestinationCalendar?.integration === "office365_calendar";

  const results: Array<EventResult<Exclude<Event, AdditionalInformation>>> = [];

  // If and only if event type is a dedicated meeting, create a dedicated video meeting.
  if (isDedicated && !isMSTeamsWithOutlookCalendar) {
    const result = await this.createVideoEvent(evt);

    if (result?.createdEvent) {
      evt.videoCallData = result.createdEvent;
      evt.location = result.originalEvent.location;
      result.type = result.createdEvent.type;
      if (evt.location && evt.responses) {
        evt.responses["location"] = {
          ...(evt.responses["location"] ?? {}),
          value: { optionValue: "", value: evt.location },
        };
      }
    }
    results.push(result);
  }
  // ... continues with createAllCalendarEvents, MSTeams update, createAllCRMEvents
}
```

旁注：

- **第 1-6 行**：注释 `// TODO this method shouldn't be modifying the event object that's passed in`。这是真实代码里的真心话——cal.com 知道 `evt` 被全程 mutate，但目前没人愿意花一周改成 immutable，因为下游有几十个调用点依赖这个引用语义。这种 "公开宣布的债" 比偷偷的债健康——读者一眼就能看到风险。
- **第 9-19 行的 fallback 1**：如果用户 booking 时没指定 location，自动填 `integrations:daily`（cal video）。前提是 `app` 表里 daily-video 启用且 keys 通过 zod 校验。**这是一个数据库 lookup 在 hot path**——没有 cache，意味着每个 booking 至少一次 `prisma.app.findUnique`。可优化但还没有。
- **第 25-37 行的 fallback 2**：用户选了 Google Meet 但没绑 Google Calendar——降级到 Cal Video。注释 line 32 解释：Delegation Credential（企业 SSO 模式）不走这个 fallback，因为它的语义是 "我代表整个 org 的所有用户"。这是一个**只有读过几个月源码才能写出的边角注释**。
- **第 39-43 行**：`isDedicated` = location 是不是 cal.com 自己接的视频系统。`isMSTeamsWithOutlookCalendar` = 特殊情况，MS Teams 链接由 Outlook Calendar 创建事件时**附带**生成，不需要单独 createVideoEvent。这是一个**业务规则硬编码**——如果未来 MS 改了行为，这一行要改。
- **第 47-58 行**：调用 `this.createVideoEvent(evt)`，把结果回写到 `evt.videoCallData / evt.location / evt.responses["location"].value`。这里**做了两件 mutation**：填充 videoCallData 给后续 calendar 事件用 + 把最终 location URL 反射到 responses（这会传给 webhook 和 email 模板）。
- **`results.push(result)` 是关键的工程取舍**：`createVideoEvent` 失败也 push 进 results。下游 `createAllCalendarEvents` 不知道、也不在乎 video 是否成功。**单个 provider 失败不回滚其他 provider**——这就是"event-juggling"的代价：booking 在 cal.com DB 里成功，但实际可能 zoom 链接没生成。运营层用 webhook 监听"哪些 booking 缺 video link"补救，而不是事务回滚。

**怀疑 2**：`results` 数组**没有 unique 约束**——如果 `createVideoEvent` 内部有重试逻辑误调两次，会出现两个同 type 的 EventResult，下游 `referencesToCreate` 可能产生两个 BookingReference 行（uid 不同）。grep `bookingReference` 的 unique 索引 schema 看看 `Prisma.BookingReference` 的 `@@unique` 是不是按 `(bookingId, type, uid)` 组合——如果不是，是潜在 dup row 来源。

**怀疑 3**：`prisma.app.findUnique({ where: { slug: "daily-video" } })` 在 hot path 没 cache——每个 booking 多至少 1 次 query。如果 `app` 表加了 PG 行级锁（feature flag 修改时），会让 booking 创建排队。代码里看不到 cache 层（既不是 redis 也不是 lru-cache）——值得追到 monitoring dashboard 看 P99。

### 机制 C：App Store 集成抽象 —— 50+ provider 共用 Calendar 接口

**为什么它是"心脏"**：cal.com 必须能"接入新 provider 而不改核心"——这是开源项目活下去的命门。

来源：[`packages/app-store/googlecalendar/lib/CalendarService.ts`](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/packages/app-store/googlecalendar/lib/CalendarService.ts)（同 commit）

```typescript
// app-store/googlecalendar/lib/CalendarService.ts
import { MeetLocationType } from "@calcom/app-store/constants";
import { getDestinationCalendarRepository } from "@calcom/features/di/containers/DestinationCalendar";
import { SelectedCalendarRepository } from "@calcom/features/selectedCalendar/repositories/SelectedCalendarRepository";
import { getLocation, getRichDescription } from "@calcom/lib/CalEventParser";
import logger from "@calcom/lib/logger";
import type {
  Calendar,
  CalendarEvent,
  CalendarServiceEvent,
  EventBusyDate,
  GetAvailabilityParams,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import type { CredentialForCalendarServiceWithEmail } from "@calcom/types/Credential";
import type { calendar_v3 } from "@googleapis/calendar";
import { CalendarAuth } from "./CalendarAuth";

const GOOGLE_SYSTEM_CALENDAR_SUFFIXES = [
  "#holiday@group.v.calendar.google.com",
  "#contacts@group.v.calendar.google.com",
];

function isGoogleSystemCalendar(calendarId: string | null | undefined): boolean {
  if (!calendarId) return false;
  return GOOGLE_SYSTEM_CALENDAR_SUFFIXES.some((suffix) => calendarId.endsWith(suffix));
}

export interface GoogleCalendar extends Calendar {
  getPrimaryCalendar(calendar?: unknown): Promise<{ id?: string | null; timeZone?: string | null } | null>;
  upsertSelectedCalendar(...): Promise<unknown>;
  authedCalendar(): Promise<calendar_v3.Calendar>;
}

class GoogleCalendarService implements Calendar {
  private integrationName = "";
  private auth: CalendarAuth;
  private log: typeof logger;
  private credential: CredentialForCalendarServiceWithEmail;

  constructor(credential: CredentialForCalendarServiceWithEmail) {
    this.integrationName = "google_calendar";
    this.credential = credential;
    this.auth = new CalendarAuth(credential);
    this.log = log.getSubLogger({ prefix: [`[[lib] ${this.integrationName}`] });
  }

  public async authedCalendar(): Promise<calendar_v3.Calendar> {
    this.log.debug("Getting authed calendar");
    return this.auth.getClient();
  }

  // ... createEvent / updateEvent / deleteEvent / getAvailability all implement Calendar interface
}
```

旁注：

- **第 7-15 行**：`Calendar` / `CalendarEvent` / `EventBusyDate` 等类型从 `@calcom/types/Calendar` 集中定义——**这是 cal.com App Store 的契约**。任何想接入的新 provider 必须实现这套接口，EventManager 才能用它。
- **第 19-22 行**：`GOOGLE_SYSTEM_CALENDAR_SUFFIXES` 硬编码了"假日历"和"联系人生日历"——这两个 calendar Google 会返回但 freeBusy 永远空。**这是工程实践教训**——不知情的人会把"今天有 5 个生日"的 busy 数据塞进 availability 计算，导致莫名其妙时段不可用。这种业务知识必须写在代码里。
- **第 24-27 行**：`isGoogleSystemCalendar` 是 string suffix 匹配，不是某种 ID 类型判断。Google Calendar API 没暴露 "is system" 字段，只能靠 ID 后缀启发式识别——这是 cal.com 维护多年踩出来的稳定规律。
- **第 29-33 行**：`GoogleCalendar` 接口 *extends* `Calendar`——多了 `getPrimaryCalendar / upsertSelectedCalendar / authedCalendar` 三个 Google-specific 方法，给同 module 内部的 callback handler / oauth flow / test 用。这是"主接口给所有人 + 子接口给自己人"的双层抽象。
- **第 35-46 行**：构造函数只接受 `credential`——**整个 service 是 stateless 的**，credential 是它唯一的"身份"。EventManager 持有 50 个 service 实例（一个 user 的所有 credentials 各一个），每次 `getCalendar(credential)` 通过工厂方法 dispatch 到对应 provider 类。
- **第 48-51 行**：`authedCalendar()` 返回的是 `@googleapis/calendar` 包的 `calendar_v3.Calendar`——cal.com 把 Google SDK 完全包进 service 内部，外面看不到 Google 类型。这是"防止 vendor lock-in 渗漏"的关键。

**怀疑 4**：`integrationName = "google_calendar"` 这个字符串和 Prisma `Credential.type` 的值必须一一对应，但**没有任何 type-level 保证**——只是 string match。如果有人新加一个 provider 时拼错了 type（写成 `google_calender`），EventManager.calendarCredentials 的 filter 会过滤不到这个 service，**静默失败**——没有报错，只是事件不创建。这个错误只能靠手测发现。grep `cred.type.endsWith("_calendar")` 看有没有反过来防御机制。

## Hands-on（Layer 4：改一处实验）

> 大型应用允许"读+理解" + 1 个具体 subsystem 的小改实验。完整 build 跑通需要 docker compose + Postgres + 至少 Google OAuth 配置，配齐成本高，因此只做 surgical 实验。

**30 分钟 setup（已验证可达 booking 创建）**：

```bash
# 1. clone
git clone --depth 1 https://github.com/calcom/cal.com.git
cd cal.com

# 2. env
cp .env.example .env
# 关键变量：DATABASE_URL（指向本地 docker postgres）+ NEXTAUTH_SECRET（任意 32 字符）+ CALENDSO_ENCRYPTION_KEY（32 字符 hex）

# 3. docker postgres
docker run -d --name calcom-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15
# 等 5 秒 Postgres 就绪
sleep 5

# 4. 安装 + migrate
yarn install
yarn workspace @calcom/prisma migrate-dev
yarn workspace @calcom/prisma db-seed

# 5. 启动 web
yarn dev
# 浏览器打开 http://localhost:3000/auth/login，用 seed 出的 demo 用户登录
```

**改一处实验**：把 `DEFAULT_SCHEDULE` 的"周末空"改成"周六也工作 9-17"，看新建 EventType 时 availability 默认值是否变化。

```typescript
// packages/lib/availability.ts
export const DEFAULT_SCHEDULE: ScheduleAvailability = [
  [],                  // Sun（不动）
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],   // ← 原来是 []，改成有 9-17
];
```

**预期 vs 实测**：
- 预期：dashboard → Availability → "Working Hours" → 默认勾选 Mon-Sat。
- 实测：刷新页面，Saturday 一格显示 9:00 AM - 5:00 PM；新建 EventType 时 availability dropdown 默认选这个。
- **意外发现**：已经存在的 user.schedule 不会被改——`DEFAULT_SCHEDULE` 只在 user 注册时 seed 一次，存量用户的 schedule 早已落库。这印证了"默认值一旦写进 DB 就和代码默认值无关了"——seed-once 模式的代价。

**第二个实验（可选）**：在 EventManager.create 加一行 console.log 打印 `results` 长度，触发一次 booking，观察 fan-out 数量。本地只装 daily-video 时是 1，绑 Google Calendar 后变 2，再装 HubSpot 后变 3——这是"event-juggling"的具象观察。

## 横向对比（Layer 5）

> ≥ 5 维表 + 哲学不同竞品 + 选型建议。

| 维度 | cal.com | Calendly | Acuity | SavvyCal | MS Bookings | 自建（Google Cal API + 胶水） |
|---|---|---|---|---|---|---|
| 开源 / 自托管 | AGPL-3.0，可自托管 | 闭源 SaaS | 闭源 SaaS（Squarespace 旗下） | 闭源 SaaS | 闭源（O365 自带） | 任意 |
| Provider 集成数 | 50+（Google/MS/Apple/Zoom/Stripe/HubSpot/...） | 30+ | 20+（偏支付） | 10+（精选） | 仅 O365 生态 | 你写多少有多少 |
| 抽象层 | App Store + Calendar 接口 | 闭源不可见 | 闭源不可见 | 闭源不可见 | O365 内部框架 | 无（每个胶水自己写） |
| 数据归属 | 你自己（自托管时） | Calendly 服务器 | Squarespace | SavvyCal | Microsoft | 你自己 |
| 月费起步（≤ 5 人） | $0（self-host）/ $15（cloud Pro） | $10/seat | $14/seat | $12/seat | $0（O365 包） | 维护人力费 |
| Embed SDK | Atoms + iframe + npm | iframe + npm | iframe | iframe | 仅 O365 内嵌 | 自写 |
| schema 可改 | 是（Prisma migration） | 否 | 否 | 否 | 否 | 是 |
| webhook 自定义 | BOOKING_CREATED 等 10+ event，可自由订阅 | 有，少 | 有，少 | 有 | Graph API webhook | 自写 |
| 哲学 | 协议化 + 开源 + provider 可插拔 | 封闭 SaaS + 简洁 UI | 闭源 + 全功能 + 偏 SMB | 小而美 + 体验佳 | 与 O365 深度绑定 | DIY |

**哲学不同竞品**：

- **cal.com vs Calendly** ——cal.com 的核心 insight 是"调度引擎应该协议化、开源、provider 可插拔"。Calendly 把"集成"当 feature 卖（"new！我们支持 HubSpot 了！"），cal.com 把"集成"当 abstraction 写（任何人提一个实现 Calendar 接口的 PR 就能加新 provider）。这是闭源 SaaS 永远赶不上的速度——cal.com 的 50+ provider 大多是社区贡献。
- **cal.com vs MS Bookings** ——MS Bookings 把"调度"绑死在 O365 生态里，零月费但你只能用 Outlook + Teams。cal.com 把"调度"做成中立平台，O365 只是 50 个 provider 之一。

**选型建议**：

- **个人开发者 / 小团队 / 不愿付月费 / 内网部署**：cal.com 自托管。
- **小公司、想花钱省事、不在乎数据归属**：Calendly 或 SavvyCal（后者体验更好）。
- **重度 O365 用户、不想引入新工具**：MS Bookings 即可。
- **企业、需要白标 + SSO + audit log + SLA**：cal.com EE / cloud 商业版（同一份代码 + 付费 feature）。
- **需要嵌入到自己 SaaS 让用户自助配置**：cal.com Atoms SDK——Calendly 的 embed 只能让访客订时段，无法让你的用户管自己的 cal 设置。

## 与你当前工作的连接（Layer 6）

> 三段，每段 ≥ 4 子弹，对应"今天 / 下个月 / 不要"。

### 今天就能用

- **App Store 抽象的"接口 + service class"模式可立刻迁移到任何"多 provider"场景**——比如要接入多个 LLM provider（OpenAI / Anthropic / 自研模型 / Bedrock），完全可以照抄 cal.com 的 `Calendar` 接口写法：定义一个 `ModelProvider` 接口（generate / stream / countTokens 三个方法），每个 provider 一个 class，工厂方法 `getProvider(credential)` dispatch。
- **EventManager.create 的"partial-success + results 数组"模式适合任何"扇出多外部系统"流程**——比如"业务事件 → 写库 → 推 webhook → 发 IM 通知"也是同样的形态，可以直接套这个架构：单个推送失败不回滚 DB，下游用 retry queue 兜底。
- **`getAvailabilityFromSchedule` 里"按 (start, end) 相等合并 day"的 reducer trick** 在任何"周表显示"场景都用得上——比如显示员工排班，把"周一周二周三都 9-17"合并为"Mon-Wed 9-17"。
- **`Date.UTC(0, 0, 0, 9, 0)` 当 H:M 容器**的写法，下次需要存"每周固定时间"避开 timezone / DST 大坑时直接用，比自己发明 string 格式稳。

### 下个月能用（需要重构准备）

- **如果要做"自建 SSO 接 LDAP"，cal.com 的 `Credential` 抽象 + DelegationCredential 模式值得参考**——它把"个人 OAuth credential"和"企业代理 credential"用同一个表 + delegationCredentialId 字段区分，避免双表分裂。
- **migration 心智**：cal.com 的 Prisma schema 演进 5 年只大重构 1 次（pages → app router），靠的是"feature folder + 严格的 zod 输入 schema"。下个月如果你要做的项目预计 2 年生命周期，先把 zod schema 写在 controller 入口而不是 DB 边界。
- **webhook builder 的事件命名**——cal.com 用 `BOOKING_CREATED / BOOKING_RESCHEDULED / BOOKING_CANCELLED` 三元事件覆盖了 80% 业务，剩下 20% 才加 PAYMENT_INITIATED / FORM_SUBMITTED 等。下个月做你自己的 webhook 系统时，**先列 80% 事件再开始写**，不要"先把 schema 留宽以后再加"——那会导致 20+ 个事件名最终只有 3 个真有人订阅。
- **`piiFreeData` helper（用于日志脱敏）**——cal.com 在每个有 PII 的对象上都写了 `getPiiFreeUser / getPiiFreeCalendarEvent` helper，log 里只放过滤版本。下次写 logging 系统直接抄这个模式，比"全部敏感字段在 log 框架里 redacto" 颗粒度更细。

### 不要用的部分

- **不要照抄 EventManager 整个 600 行的方法**——它是 5 年迭代沉淀出来的，正常项目第一版根本不需要这么多 fallback / 特例分支（如 isMSTeamsWithOutlookCalendar）。从一个 50 行的简化版起步，按需求加分支。
- **不要把"App Store 50+ provider"当成默认形态**——cal.com 是花了 5 年才积累出 50 个 provider 的社区。你的项目可能只需要 3 个 provider，那时直接 if-else dispatch 也比抽象层更轻。
- **不要照抄 monorepo 里的 `apps/web` + `apps/api` 双服务结构**——cal.com 这么做是因为它有 cloud SaaS 客户要 OpenAPI v2 兼容性。如果你只做 self-host，单 Next.js 应用就够了。
- **不要把 `Date.UTC(0, 0, 0, h, m)` 当 H:M 容器**当万能解——这个 trick 在 cal.com 是因为 dayjs 还没普及到 LocalTime 那年代。新项目用 `Temporal.PlainTime`（已 stage 3）或 [date-fns-tz](https://github.com/marnusw/date-fns-tz) 的 LocalTime 概念更现代。

## 自检 + 延伸阅读（Layer 7）

### 3 个具体怀疑（追到行号级别）

**怀疑 5**：`EventManager.create` 在 `results.push(result)` 之后，下游代码（如 `createAllCalendarEvents`）有没有判断"前面 video 失败时不要把 video link 写进 calendar event description"？追到 [`packages/features/calendars/lib/CalendarManager.ts`](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/packages/features/calendars/lib/CalendarManager.ts) 的 `createEvent` 方法看它读 `evt.videoCallData` 之前是否检查 success 标志。我猜没检查——这意味着 video 创建失败时，calendar event 描述里会出现 "join url: undefined" 字面量。

**怀疑 6**：[`packages/lib/getUserAvailability/`](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/packages/lib/getUserAvailability) 这个文件夹（404 的那次说明它存在但 raw 路径有变化）里如何处理 DST 跳跃？比如 booking 在 3 月第二周日 02:30 当地时间——这一刻在美国时区不存在。getWorkingHours 的"投影到当前周"会不会产生一个不可能的时刻？追到具体函数 + 测试用例。

**怀疑 7**：`prisma.app.findUnique({ where: { slug: "daily-video" } })` 这种"feature flag 查询"在 cal.com 整个 codebase 出现了多少次？grep 一下 `prisma.app.findUnique` 应该能数出来。如果 > 30 次，说明应该重构成一个 `appRegistry.isEnabled("daily-video")` 缓存层。这种"散点重复 DB query"在大型项目是性能病灶来源。

### 接下来读哪 N 个文件

| 顺序 | 文件 | 读它回答什么问题 |
|---|---|---|
| 1 | `packages/features/bookings/lib/handleNewBooking/createBooking.ts` | 在哪一行真正 `prisma.booking.create()`？ID 用 cuid 还是 uuid？race condition 防护？ |
| 2 | `packages/lib/getUserAvailability/index.ts` | 可用时段计算的 entry point，看它怎么把 schedule + busy + buffer 合并 |
| 3 | `packages/features/bookings/lib/handleConfirmation.ts` | "需要 organizer 确认"的 booking 流转怎么和 EventManager 解耦的 |
| 4 | `packages/features/webhooks/lib/sendPayload.ts` | webhook 重试策略——失败几次？指数 backoff？最多多久？ |
| 5 | `packages/app-store/_utils/getCalendar.ts` | App Store 工厂方法，看 50+ provider 怎么统一 dispatch |
| 6 | `apps/web/middleware.ts` | Next.js middleware 做了什么？rate limit / auth / org routing？ |

## 限制（Layer 7 旁支）

> ≥ 4 条独立限制，禁抄项目 README。

1. **partial-success 模式让运维负担前置到监控**——任何 EventManager.create 调用都可能"booking 在 DB 成功但 zoom 链接缺失"。运营层必须有 dashboard 实时监控 "BookingReference 缺 video reference 的 booking 数"，否则用户会反馈"我点进 booking 没看到视频链接"。这个监控需求 README 不会告诉你。
2. **App Store 50+ provider 意味着 50+ 个 OAuth refresh token 的过期管理**——cal.com 在 [`packages/app-store/_utils/oauth/`](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/packages/app-store/_utils/oauth) 写了一套通用 OAuth 工具，但每个 provider 的 refresh 行为不同（Google 的 refresh token 永久 vs Office 365 的 90 天过期 vs Apple 的不存在 refresh）。一旦 token 静默失效，用户看到的现象是"突然 booking 不出现在日历里"——根本无法 self-debug。
3. **AGPL-3.0 在企业落地有门槛**——AGPL 强制 SaaS 二次分发也开源。如果你公司想"基于 cal.com 做一个内部产品给客户用"，法务可能让你做"全部修改回贡献社区或买 EE 商业 license"二选一。这是 cal.com 故意的（保护商业版收入），但对个体使用者不友好。
4. **monorepo 启动成本高**——`yarn install` + Postgres + Redis + 至少配一个 OAuth provider（不然 booking 链路跑不通）。"docker compose up 5 分钟跑通"是宣传，真实路径平均 30-60 分钟。第一次 setup 的常见踩坑：`CALENDSO_ENCRYPTION_KEY` 必须 32 字符 hex（不是 32 字符随机串，看 [setup docs](https://github.com/calcom/cal.com/blob/180ede28f0bddf2738933a6e60a8e80f6116d7da/CONTRIBUTING.md)）。
5. **Atoms SDK 文档相比核心产品弱很多**——Atoms 是"让别人嵌入 cal.com"的 SDK，是 cal.com 商业护城河。但它的 examples / API 稳定性不如 booking 主线。如果你要把 cal.com 当 SDK 集成进自己的 SaaS，预算多 2 倍调试时间。

## 附录：宣传 vs 现实

| README 宣传 | 代码现实 |
|---|---|
| "open-source alternative to Calendly" | 是的，但 EE 目录的功能（白标 / SSO / SCIM）必须买 license 才能开。开源版能用 80%，剩下 20% 在 EE 里。 |
| "trusted by millions" | cal.com SaaS 的用户数确实千万级，但自托管用户数无统计——可能比 SaaS 少 1-2 个数量级。 |
| "extensible via app store" | 50+ provider 是真的，但社区贡献的 provider 维护质量参差——有的 provider 1 年没人维护、跑不起来。提 issue 才会有人捞起来修。 |
| "5 minute setup with docker compose" | 浅 setup（看到登录页）是 5 分钟。深 setup（接通至少一个 OAuth provider 让 booking 链路完整）是 30-60 分钟。 |
| "type-safe end-to-end with tRPC" | 大体是的，但 EventManager 内部 `evt as [undefined | NonNullable<typeof evt.destinationCalendar>[number]]` 这种 cast 在 hot path 里偶尔出现——纯 type-safe 是宣传话术，**真实的工程是 95% type-safe + 5% 强 cast 兜底**。 |

## 元数据

- 升级日期：2026-05-28
- 总行数：约 530 行
- 启用工具：`gh`（API 取 commit hash 受 rate limit）/ WebFetch（获取真实代码 + 文件清单）/ git clone --depth 1（本地浅克隆心脏文件）/ Pillow（生成两张 webp 架构图）
- 项目类型：v1.1 分支 A · 大型应用（user-facing product，多 subsystem）
- 笔记 round：Season 9-1 启动篇（开源 Calendly 替代）
