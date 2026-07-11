---
title: cal.com — 自己能托管的开源 Calendly
来源: calcom/cal.com（GitHub，AGPL-3.0，v6.2.0）
日期: 2026-05-29
分类: SaaS 应用
难度: 中级
---

## 是什么

cal.com 是一套**用网页约会议时间**的开源系统。日常类比：像饭店门口贴的"今日 9-18 营业，每 30 分钟一桌"小黑板——客人看一眼就知道哪些时段还能预订，按下去就成。Calendly 是闭源的小黑板服务商，cal.com 是把"小黑板加预订系统"的源代码全摆出来给你抄。

它用 Next.js + tRPC + Prisma + Postgres 写成 monorepo，背后接 50+ 个外部 provider（Google Calendar、Outlook、Zoom、Stripe、HubSpot 等等）。一次预订要同时落到 cal.com 自己的数据库 + 你的日历 + 视频会议系统 + 可能的 CRM——它把这件事做成"一个抽象接口套所有 provider"。

License 是 AGPL-3.0，意味着自己在内网跑完全免费且合法，但要拿它做 SaaS 卖给别人就必须开源你的修改。

## 为什么重要

不理解 cal.com 这种"开源 SaaS 替代品"，下面这些事讲不清：

- 为什么开源项目要 AGPL 而不是 MIT——商业护城河和社区贡献怎么平衡
- 为什么"接 50 个外部 API"不必写 50 套胶水代码——一个 `Calendar` 接口能管所有
- 为什么 SaaS 写一个 booking 要碰 N 个外部系统、其中一个挂了到底要不要回滚
- 为什么"自托管开源"和"商业 cloud 版"可以共用同一份代码，靠目录和 license 切

## 核心要点

cal.com 的工程价值可以拆成 **三件事**：

1. **App Store 抽象**：每个 provider 是一个实现 `Calendar` 接口的 class（createEvent / getAvailability 等几个方法），核心调度器不知道它具体是 Google 还是 Outlook，只调接口。类比：充电插座只认电压电流，不管墙后面发电站烧什么。

2. **EventManager 扇出 + 部分成功**：booking 创建后扇出到视频 / 日历 / CRM 多个 provider，**任何一个失败不回滚其他**。类比：寄快递走顺丰挂了不会让京东那单也退货。代价是要在监控层补"哪些 booking 缺 video link"的 dashboard。

3. **可用时段是朴素计算**：把 Schedule（每周 7 天工作时间）+ busy（已占用）+ buffer + 时区合并成空闲段，靠 dayjs 区间运算。看起来无聊，但 timezone / DST / 跨日 / end-exclusive 这些边界全要踩稳——是 cal.com 用户感知性能的最直接来源。

## 实践案例

### 案例 1：默认 Schedule 的 7 元素数组

```typescript
// packages/lib/availability.ts
export const DEFAULT_SCHEDULE: ScheduleAvailability = [
  [],                  // Sun
  [defaultDayRange],   // Mon 9-17
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],   // Fri 9-17
  [],                  // Sat
];
```

**逐部分解释**：

- 7 个元素，下标 0=周日 ... 6=周六，整个前后端都遵循这个契约
- `defaultDayRange` 用 `Date.UTC(0, 0, 0, 9, 0)` 当 H:M 容器——只认时分，不认日期
- 这是 dayjs 还没普及到 LocalTime 那个年代的写法，新项目应当用 `Temporal.PlainTime`

### 案例 2：把"周一到周五 9-17"合并成一行显示

```typescript
const filteredTimes = times.filter((time) => {
  const idx = availability.findIndex(
    (s) => s.startTime.toString() === time.start.toString() &&
           s.endTime.toString() === time.end.toString()
  );
  if (idx !== -1) {
    availability[idx].days.push(day);  // 就地 push
    return false;
  }
  return true;
});
```

reducer 累加器里就地 push，让 UI 显示 "Mon-Fri 9-17" 而不是 5 行重复。但这种"reduce 内 mutate" 是潜在 footgun——如果有人重构成 immutable 风格（spread），合并失效，UI 默默退化。

### 案例 3：EventManager 扇出多个 provider

```typescript
const results: EventResult<Event>[] = [];
if (isDedicated) {
  const result = await this.createVideoEvent(evt);
  results.push(result);   // 失败也 push
}
// 接着调 createAllCalendarEvents、createAllCRMEvents
// 每个内部 try-catch，单个失败不抛出
```

`createVideoEvent` 失败时，下游 `createAllCalendarEvents` 不知情、也不回滚。代价是 calendar event description 里可能出现 `join url: undefined`——必须在监控层兜底，不是在调用层做事务。

## 踩过的坑

1. **AGPL-3.0 让企业法务皱眉**——SaaS 二次分发要开源自己的修改。想"基于 cal.com 做内部产品给客户"得做"全部回贡献社区"或"买 Enterprise Edition license"二选一。

2. **OAuth refresh token 静默过期**——50+ provider 的 token 行为各不同（Google 永久 vs Outlook 90 天 vs Apple 没有 refresh）。一旦失效，用户只看到"booking 不出现在日历"，无法 self-debug，运营层必须主动监控。

3. **monorepo 启动成本高**——README 说 "5 minute setup with docker compose" 是浅层（看到登录页）。深层（接通 OAuth、跑通完整 booking）实际 30-60 分钟，第一次最容易卡在 `CALENDSO_ENCRYPTION_KEY` 必须 32 字符 hex 不是随机串。

4. **partial-success 把运维负担前置到监控**——任何 booking 都可能"DB 成功但 zoom 链接缺失"。需要 dashboard 实时盯 BookingReference 缺 video reference 的行——这个需求 README 不会告诉你。

## 适用 vs 不适用场景

**适用**：

- 个人开发者 / 小团队 / 内网团队想"免费 + 数据自留"——自托管 cal.com
- 需要嵌入到自己 SaaS 里给用户配置自己的预约页——cal.com Atoms SDK
- 想学"如何把多个外部 API 收编进同一个抽象"——它是真实生产级范例
- 做调度类业务想从 schema 起步——Prisma schema 是开源的，可以 fork

**不适用**：

- 想花钱省事、不在乎数据归属——Calendly 或 SavvyCal 体验更好
- 重度 O365 用户、不想引入新工具——Microsoft Bookings 即可，免费
- 项目只需要 3 个 provider——直接 if-else dispatch 比抽象层更轻
- 需要"看到登录页就当跑通"的 hackathon——setup 成本超 30 分钟

## 历史小故事（可跳过）

- **2020 年**：Peer Richelsen 和 Bailey Pumfleet 在英国创立，最初叫 Calendso，定位是"Calendly 的开源替代"
- **2021 年**：改名 cal.com，拿到 YC W21 + 后续 a16z / OSS Capital 数千万美元投资
- **2022 年**：发布 v2.0，引入 App Store 架构——把"接新 provider"从核心改成插件目录
- **2023-2024 年**：Atoms SDK、Enterprise Edition、organizations / teams 分级订阅相继上线
- **2026 年 3 月**：v6.2.0 发布，主线仍每天 merge，star 44.8k / fork 13.8k，是开源 SaaS 替代品里最活跃的之一

## 学到什么

1. **"扇出 + 部分成功"是真实分布式系统的常态**——事务回滚听起来漂亮，但跨 5 个外部 API 几乎不可能保证。代价转嫁到监控和补偿队列
2. **接口抽象 + 工厂方法**是"接 N 个外部 provider"的最朴素答案——一个 `Calendar` 接口、一个 `getCalendar(credential)` 工厂、N 个 implementation class
3. **公开宣布的债比偷偷的债健康**——cal.com 在 EventManager 里写 `// TODO this method shouldn't be modifying...` 让所有读者看见风险，比悄悄欠债强
4. **AGPL 是开源 SaaS 的护城河**——既保留商业版收入，又让自托管和社区贡献合法。这是 MIT 做不到的平衡

## 延伸阅读

- 项目主页：[cal.com](https://cal.com)（看 cloud SaaS 长什么样）
- 仓库：[calcom/cal.com](https://github.com/calcom/cal.com)（44.8k stars，AGPL-3.0）
- 视频：[cal.com Founder Peer Richelsen on Lenny's Podcast](https://www.youtube.com/results?search_query=peer+richelsen+lennys)（讲开源 SaaS 商业模式）
- 类似项目：[[supabase]] —— 同样"开源 + cloud 商业版同份代码"的模式
- 类似抽象：[[trpc]] —— cal.com 内部的 RPC 层就是 tRPC

## 关联

- [[trpc]] —— cal.com 用 tRPC 串前后端，type-safe end-to-end
- [[prisma]] —— cal.com 用 Prisma 做 ORM 和 migration 管理
- [[next-js]] —— cal.com 主应用是 Next.js，apps/web 是 pages + app router 共存的迁移中状态
- [[supabase]] —— 类似的"开源 + 商业 cloud 同份代码"哲学
- [[tailwind]] —— cal.com 的 UI 用 Tailwind，类 shadcn 但更早期
- [[playwright]] —— cal.com 的 e2e 测试栈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
