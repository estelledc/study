---
title: Element Android — Matrix 协议官方 Android 客户端（Kotlin + Realm）
来源: 'https://github.com/element-hq/element-android'
日期: 2026-05-30
分类: communication
难度: 中级
---

## 是什么

Element Android 是 **Matrix 协议**的官方 Android 客户端，由 Element 公司维护，全 Kotlin 编写。日常类比：把"邮箱客户端"改成"聊天客户端"——你在手机上点开 Element 看消息，它在背后向你自己（或别人架的）Matrix homeserver 不停拉新事件，再把端到端加密的密文解出来摆给你看。

Matrix 是去中心化协议：每家服务器（Synapse / Dendrite）跑一份，用户消息在不同服务器之间**联邦**同步——像邮件跨邮局投递，你家服务器帮你把消息转给对方服务器。Element Android 不关心联邦怎么走——那是服务端的事——它只跟自己登录的那台 **homeserver**（你家"邮局"/账号所在服务器）说话，剩下的它当作"远端用户"看待。

最小用法：从 Google Play 装一个 Element，登录 matrix.org（或自架的 homeserver），就能加房间、收发加密消息、视频通话（走 Jitsi）。

```kotlin
// matrix-android-sdk2 登录入口示意（方法名随 SDK 小版本可能微调，以仓库为准）
val matrix = Matrix.getInstance(context)
val session = matrix.authenticationService()
    .getLoginWizard()
    .login("alice", "pw", "device-name")
session.startSync(true)  // 后台长轮询拉事件
```

注意：Element 公司已经在主推**新一代** Element X Android（用 [[matrix-rust-sdk]] 当核心，启动更快、加密 bug 三端一次修），原 Element Android 进入"安全维护，不再加新功能"模式。

## 为什么重要

- 不理解 Element Android，就解释不清"为什么 Slack/Discord 是中心化的、Matrix 不是"——前者数据全在一家公司，后者每个 homeserver 各自存
- 它是迄今为止 Matrix 在 Android 端**用户量最大**的客户端；多国政府与医疗私有部署常基于它 fork（德国 TI-M 医疗即时通讯、法国 Tchap 都是改品牌重打包）
- 想看"Kotlin + 协程 + Realm + 端到端加密"在一个真生产 app 里怎么搭，这是公开样本里最完整的一个
- 看它怎么被 Element X 替代，能理解"为什么 Element 公司决定把核心搬到 Rust"——这是 [[matrix-rust-sdk]] 的反面教材

## 核心要点

Element Android 的工程价值集中在 **三件事**：

1. **matrix-android-sdk2 是协议大脑**：所有 Matrix 协议逻辑都在 SDK 里——登录、长轮询 `/sync`、解析房间事件、维护时间线、跑加密握手。UI 层（activity/fragment）只订阅 SDK 的 LiveData/Flow，不直接碰 HTTP 或 JSON。

2. **Realm 当本地缓存**：每个房间的事件、状态、密钥都先写进 Realm 数据库，UI 从 Realm 读。好处是离线可用 + 秒级冷启动；代价是 Realm 强引用线程（见踩坑 1），跨线程传对象会崩。

3. **E2EE（端到端加密）走 Olm + Megolm + libolm**：双人对话用 **Olm**（两人之间的密钥协商，底层是 X3DH 一类双棘轮，直觉类似 Signal）；群聊用 **Megolm**（先把一把"会话密钥"分给成员，再单向推进，省群聊算力）。底层是 C 写的 **libolm**，Kotlin 经 **JNI**（Java 调本地库的桥）调用。密钥本身存在 Realm 加密 store 里；跨设备恢复靠 **SSSS**（把密钥加密备份到服务器，用恢复密码取回）。

外面再裹两件事：**flavor 拆分**（Google Play 用 FCM 推送、F-Droid 用 UnifiedPush）和 **Jitsi WebRTC**（视频会议另起一套，不走 Matrix 自己的 1:1 RTP）。

关键设计决定：**SDK 与 UI 分两层 repo**——`matrix-android-sdk2` 是协议层、`element-android` 是 UI 层，每次发版前者拷一份到独立仓库给社区集成。这种"可剥离"的设计在维护期反而成了优势：UI 不再演进，SDK 也能独立给三方 app 续命。

## 实践案例

### 案例 1：政府/医院私有部署

德国国家医疗 TI-M、法国 Tchap、英国 NHS 都是这么干的：架自己的 [[synapse]] homeserver，把 Element Android 源码 fork 一份，改默认 homeserver URL、改品牌色 logo、改账号注册流程（接对接已有的 SSO），重打包发内部分发。

```kotlin
// vector/src/main/res/values/config.xml
<string name="matrix_org_server_url">https://matrix.gov.example</string>
<string name="matrix_org_identity_server_url">https://vector.gov.example</string>
```

整个 app 因此变成"政府专用 IM"，员工装上即用，数据完全留在本国机房。

### 案例 2：F-Droid 隐私党

Google Play 版用 Firebase Cloud Messaging 推送——这意味着每条消息的"提醒"事件先经 Google 服务器。隐私党不接受，所以 F-Droid 上有一个独立 flavor 用 **UnifiedPush**（开源推送规范），消息提醒走自己选的开源 Push Distributor（比如 ntfy）。

```kotlin
// build.gradle
flavorDimensions "store"
productFlavors {
    gplay { dimension "store" }       // 含 FCM
    fdroid { dimension "store" }      // 不含 FCM，用 UnifiedPush
}
```

同一份代码两个 APK，谁也不依赖谁。

### 案例 3：迁移到 Element X Android

老 Element Android 加密会话存在本地 crypto store。换设备或迁移到新 app（Element X）时，得先打开**密钥备份（SSSS，Secure Secret Storage）**：用一串恢复密码把所有 Megolm 群聊会话密钥加密上传到 homeserver，新设备登录后输入恢复密码拉回来。

```text
设置 → 加密 → 安全密钥与备份 → 设置恢复密码 → 备份所有密钥
（在 Element X Android 登录同账号，输入恢复密码，历史加密消息能解开）
```

**没做这一步直接卸载 = 历史加密消息永久解不开**——这是新人最容易踩的悬崖。

## 踩过的坑

1. **Realm 跨线程崩**：Realm 对象只在打开它的线程有效。把 `RoomSummary` 从 IO 线程传去主线程直接 throw `IllegalStateException`，必须 `realm.copyFromRealm(obj)` 出来一份普通 POJO 再传。

2. **crypto store 丢了 = 历史 E2EE 消息解不开**：升级、刷机、清数据前必须先做 SSSS 密钥备份。新人常以为"重新登录就能看到老消息"——错，密钥没了再登也是密文。

3. **推送通道分裂**：Google Play 版用 FCM，F-Droid 版用 UnifiedPush，**两个 flavor 的 BroadcastReceiver 注册路径不一样**。改推送相关代码必须两个 flavor 都测，否则一边收得到、一边收不到。

4. **/sync 在大账号慢**：账号加了 500+ 房间后，首次 `/sync?full_state=true` 能拉几兆 JSON，冷启动要十几秒。sliding sync（MSC3575）能解决，但需要 [[synapse]] 开实验功能或挂 sliding sync proxy，部署门槛高。

## 适用 vs 不适用场景

**适用**：
- 在 Android 上做一个能联邦互通、自托管的 IM 客户端
- 给政府/医院/军方做"换皮版" Matrix 客户端（fork 改品牌即上线）
- 想读"Kotlin + Realm + 端到端加密"的生产级源码

**不适用**：
- 新启动的 Matrix 客户端项目——官方推荐直接用 [[matrix-rust-sdk]] + Element X Android 模板
- 要明显更快的冷启动 / 更少加密三端不一致——旧版 matrix-android-sdk2 的纯 Kotlin 状态机通常慢于 Element X 的 Rust 核心
- 不需要 E2EE 的内部公司 IM——直接用 Mattermost / Rocket.Chat 简单得多

## 历史小故事（可跳过）

- **2014 年**：Matrix 协议在英国诞生（创始公司 Amdocs Unified Communications 内部孵化）
- **2016 年**：第一代 Android 客户端发布，叫 **Riot Android**，用老的 matrix-android-sdk（Java）
- **2019 年**：matrix-android-sdk2 重写为纯 Kotlin + 协程，Riot Android 切到新 SDK
- **2020 年**：Riot 整体改名 **Element**（公司、产品同时改），Riot Android → Element Android
- **2022-2023 年**：Element 启动"Rust 化"，新一代 Element X Android 基于 [[matrix-rust-sdk]]
- **2024 年起**：Element Android 标记为 previous-generation，仅接收安全更新

## 学到什么

1. **去中心化协议的客户端只面对自己那台服务器**——联邦由服务端代办，移动端代码不必懂联邦
2. **Realm 这种"对象数据库"换走线程上下文很危险**——任何"持久化对象"设计都要想清楚生命周期边界
3. **加密客户端的备份策略不是可选项**——SSSS / 密钥备份要做成默认开启，否则用户必丢消息
4. **"重写比修旧"是 Element 的选择**——matrix-android-sdk2 本来就够好了，但跨端共享逻辑的需求让 Rust 核心赢了

## 延伸阅读

- 仓库：[element-hq/element-android](https://github.com/element-hq/element-android)（含 matrix-android-sdk2 子模块入口）
- Matrix 协议规范：[spec.matrix.org](https://spec.matrix.org/)（Client-Server API + Olm/Megolm）
- Element X Android：[element-hq/element-x-android](https://github.com/element-hq/element-x-android)（继任者）
- libolm 源码：[gitlab.matrix.org/matrix-org/olm](https://gitlab.matrix.org/matrix-org/olm)
- Realm Kotlin：[github.com/realm/realm-kotlin](https://github.com/realm/realm-kotlin)
- UnifiedPush 规范：[unifiedpush.org](https://unifiedpush.org/)（F-Droid flavor 用的开源推送）

## 关联

- [[matrix-rust-sdk]] —— 继任者用的核心 SDK（Element X Android 吃这个，Element Android 不吃）
- [[matrix-js-sdk]] —— Matrix Web 端老牌客户端 SDK，跟 matrix-android-sdk2 是兄弟
- [[synapse]] —— Matrix 主流参考服务端，Element Android 默认连的就是它（matrix.org 跑的也是它）
- [[dendrite]] —— Matrix 第二代 Go 服务端，Element Android 也能连
- [[diffie-hellman]] —— Olm/Megolm 端到端加密底层用的密钥交换数学

## 一句话总结

**全 Kotlin 写、跑了八年的 Matrix Android 客户端**——它把 Matrix 推到了千万级私有部署用户面前，也用自己的"维护成本"促成了 [[matrix-rust-sdk]] 的诞生。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[element-web]] —— Element Web — Matrix 协议旗舰 web 客户端（React + matrix-js-sdk）
- [[flutter]] —— Flutter — Google 的 Dart 跨平台 UI 框架
- [[signal-android]] —— Signal Android — 让 Android 上的每条消息都只有两端能看见
- [[signal-ios]] —— Signal iOS — 让 iPhone 上的每条消息都只有两端能看见
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
