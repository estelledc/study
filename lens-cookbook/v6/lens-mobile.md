---
schema_version: 6
lens: mobile
lens_id: mobile
title: lens-mobile
domain: lens
version: 6
layer: app
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 教学/工具创业；iOS+Android 双端；1k-50k DAU；团队 1-3 人含 1 全栈；预算<1 人 native 专家；70% 表单+列表+详情，30% 重交互；国内多渠道+海外双发
ring_summary: { adopt: 11, trial: 7, assess: 0, hold: 1 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
wikilinks: [react, realm, sqlite, sqlite-2022, axios, ky, ofetch, tanstack-query, tanstack-router, drizzle, kysely, automerge, sentry]
out_of_corpus: [react-native, expo, flutter, capacitor, swiftui, jetpack-compose, mmkv, op-sqlite, watermelondb, expo-router, eas-update, shorebird, fcm, apns, jpush, getui, onesignal]
provider_coverage_checklist:
  - React Native + Expo（JS 跨端默认 / Expo Router + EAS Update 一栈）
  - Flutter（UI 一致最强 / 动画 60fps / Shorebird OTA）
  - Capacitor（Web 套壳最快 / 团队 ≤2 人）
  - SwiftUI（iOS 16+ NavigationStack / 双原生分支）
  - Jetpack Compose（Android 1.7 类型路由 / 双原生分支）
  - MMKV / op-sqlite / WatermelonDB（本地存储三层）
  - FCM+APNs / 极光-个推 / OneSignal（推送跨端）
sources:
  - React Native / Expo Router / EAS Update 文档
  - Flutter docs / Shorebird OTA
  - Capacitor docs
  - Apple WWDC 2024 SwiftUI / Compose 1.7 release notes
  - MMKV / op-sqlite / WatermelonDB README
  - OneSignal pricing / 极光 JPush 文档
  - Microsoft CodePush 2025 EOL 公告
open_questions:
  - RN 0.74 新架构 (Fabric+Hermes) 中端安卓 60fps 滚动 2025 实测分位数据缺
  - Expo EAS Update 在国内 CDN 下载稳定性 + 自托 manifest 文档零散
  - 国内厂商推送通道 (小米/华为/OPPO/vivo) 2025 真机后台到达率波动 60-90%
  - Flutter Shorebird OTA 在 Apple 4.3 条款下的拒审风险案例缺
  - WatermelonDB 10k+ 行真实业务初次同步耗时与抖动数据缺
---

## 候选表

verified 2026-05-31。layer 全=app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| React-Native | adopt | RN: JS 跨端默认 | 团队会 React | app |
| Expo | adopt | Expo: RN 一栈托管 | RN+OTA 默认 | app |
| Flutter | adopt | Flutter: UI 一致最强 | 动画/图表重 | app |
| Capacitor | adopt | Capacitor: Web 套壳最快 | 团队 ≤2 人 | app |
| SwiftUI | trial | SwiftUI: iOS 体验上限 | 双原生分支 | app |
| Jetpack-Compose | trial | Compose: Android 声明式 | 双原生分支 | app |
| MMKV | adopt | MMKV: KV 30× AsyncStorage | KV 缓存 | app |
| op-sqlite | adopt | op-sqlite: RN 最快 SQLite | 结构化表 | app |
| WatermelonDB | trial | Watermelon: 10k+ 行 ORM | 双端同步 | app |
| Realm | trial | Realm: 对象 ORM | Mongo 后端 | app |
| TanStack Query | adopt | TanStack: 缓存重试栈 | API 状态 | app |
| ky | trial | ky: fetch 装饰器 | 轻量 transport | app |
| axios | hold | axios: 体积偏大 | 已用旧栈 | app |
| Expo Router | adopt | ExpoRouter: 文件路由 | RN+Expo 默认 | app |
| EAS Update | adopt | EAS: RN OTA 一栈 | RN+OTA 必选 | app |
| Shorebird | trial | Shorebird: Flutter OTA | Flutter+OTA | app |
| FCM/APNs | adopt | FCM: 原厂直连免费 | 海外默认 | app |
| JPush/GeTui | adopt | 极光/个推: 国内厂商通道 | 国内安卓 | app |
| OneSignal | trial | OneSignal: 跨端面板 | ≤10k 早期 | app |

## ADR 索引

### ADR-1 跨平台 RN+Expo vs Flutter vs Capacitor

subtype: vendor-selection

### context

团队 1-3 人会 React，70% 业务页表单+列表+详情，30% 重交互。RN+Expo 复用 React 知识 + Expo Router + EAS Update 一栈；Flutter UI 一致性最强、动画 60fps 稳；Capacitor Web 套壳人力最省；双原生上限最高但人力 2 倍。

### decision

默认 RN+Expo；动画/图表/游戏化重 → Flutter；现有 Web app + 团队 ≤2 人 → Capacitor；DAU > 100k 且需极致体验 → SwiftUI+Jetpack-Compose 双原生。

### alternatives

Tauri Mobile（拒：v2 alpha 不稳）；Ionic（拒：已被 Capacitor 取代）；NativeScript（拒：社区活跃度低）。

### consequences

RN+Expo 1 周 MVP + OTA 当天发；代价 prebuild 后回不去托管 + 原生模块需 EAS Build。Flutter 启动 2 周、招人难。Capacitor 3 天上架但 WebView 性能瓶颈。回滚：6 个月内不切栈。

### ADR-2 RN 本地存储三层 MMKV / op-sqlite / WatermelonDB

subtype: vendor-selection

### context

需存 token + API 缓存 ≤10MB + 列表 10k 行。MMKV 比 AsyncStorage 快 30×、支持加密；op-sqlite 比 expo-sqlite 快 5-10×、支持 sync API；WatermelonDB 懒加载 ORM + 双向同步 SDK。

### decision

KV (token/配置) → MMKV；表 < 10k 行 → op-sqlite + drizzle-orm；> 10k 行 + 跨端同步 → WatermelonDB。

### alternatives

AsyncStorage（拒：慢 30×、仅小数据时勉强可用）；Realm（拒：绑死 Mongo Atlas、schema 升级痛）；expo-sqlite（拒：op-sqlite 5-10× 更快、sync API 更顺）。

### consequences

MMKV 5 行接入 + 加密一行；schema 演进需手写。op-sqlite migration 用 drizzle/kysely。WatermelonDB 学习 1 周。回滚：MMKV → AsyncStorage 一行 import；op-sqlite → expo-sqlite 仅换包。

### ADR-3 OTA bundle 上限 + 灰度策略

subtype: implementation-tuning

### context

Apple 4.3 仅允许 OTA 更 JS bundle。EAS Update 默认 50MB。灰度需 channel + rollout %。Microsoft CodePush 2025 EOL，存量项目须迁出。

### decision

ota_bundle_max_mb = 15, ota_rollout_pct_step = 10, ota_canary_users = 100, ota_force_update_floor = "major+1", ota_rollback_window_hours = 6.

### rationale

15MB 上限保 4G 弱网 30s 拉取；10% 步进给 1h 观察期；canary 100 用户 30min 内见 crash 率；major+1 才强更避骚扰。

### consequences

新功能排队 6h+；crash-free < 99.5% 自动暂停。回滚：EAS Update revert 30s 生效；监控 Sentry crash-free + Bugsnag session。

### ADR-4 推送 FCM+APNs vs OneSignal vs 国内通道

subtype: architecture

### context

国内 Android 后台杀严重 + FCM 国内不可用，必须接小米/华为/OPPO/vivo 厂商通道才能后台到达 > 80%。海外 FCM+APNs 是默认。OneSignal 封装多通道但国内仍需自申请厂商账号。

### decision

海外 FCM+APNs 直连；国内 Android 极光 JPush / 个推 GeTui 接厂商通道；订阅 ≤10k 早期 OneSignal 临时跨端管理。

### consequences

直连免费 + 数据自管，token 续命要自写。极光/个推 ¥299-3000/月 + 接通道 1-2 周/家；省 80% 后台到达。OneSignal 超 10k 跳 $99/月起。

### rollback

条件：到达率 < 60% 持续 1 周或预算超 ¥3k/月。操作：换商需重写 token 上报（2 天）+ 用户重装重置 deviceToken（一周自然替换）；提前在 schema 留 push_provider 字段切换零迁移。

### ADR-5 离线写入冲突 LWW vs CRDT vs 服务端仲裁

subtype: architecture

### context

多端离线写入冲突。LWW 实现 1 天但丢更新；CRDT (Yjs/Automerge) 天然合并、体积大、学习 2 周；服务端仲裁 (version vector + 业务规则) 实现 3-5 天、灵活。

### decision

默认 LWW + 服务端单调时间戳（避端时钟漂移）；协作文档 → Yjs；订单/库存强规则 → 服务端仲裁 + 409 回前端。

### consequences

LWW 99% 个人 app 够；Yjs 文档膨胀 2-3×。服务端仲裁需每实体写规则。

### rollback

条件：冲突丢更新投诉 > 1%/月。操作：LWW → 服务端仲裁需补 version_vector 字段 + 全量数据迁移；提前 schema 留 version int 成本几乎 0。

## 决策树

```
Q0 cost-gate：团队 ≤ 2 人 + 不需原生模块（蓝牙/相机底层/后台服务）？
  Y → Capacitor 套现有 Web app（3 天上架，跳 Q5）
  N → Q1
Q1 团队会哪个栈？
  会 React → Q2
  会 Dart 或愿学 → Flutter（动画/图表强 → ADR-1 Flutter 分支）
  会 Swift+Kotlin → SwiftUI+Jetpack-Compose 双原生（DAU>100k 才合算）
Q2 需 OTA 热更新？
  Y/N → 都 RN+Expo + EAS Update（ADR-1 RN 分支 + ADR-3 OTA 参数）
Q3 数据规模？
  仅 KV → MMKV + TanStack Query persist（ADR-2 KV）
  表 < 10k 行 → op-sqlite + drizzle-orm（ADR-2 op-sqlite）
  > 10k 行 + 双端同步 → WatermelonDB（ADR-2 + ADR-5 仲裁）
Q4 推送场景？
  仅海外 → FCM+APNs 直连（ADR-4 直连）
  含国内 → 极光 JPush / 个推 GeTui 厂商通道（ADR-4 国内）
  ≤10k 早期 → OneSignal 临时（ADR-4 中间商）
Q5 离线冲突？
  无 → 不处理
  弱（个人 app）→ LWW + 服务端时间戳（ADR-5 LWW）
  协作文档 → Yjs CRDT（ADR-5 CRDT）
  订单/库存 → 服务端仲裁 409（ADR-5 仲裁）
```

## 外迁 excludes

- sources/mobile.md
- reading_list/mobile.md
- getting_started/mobile.md
- what_is_not/mobile.md
