---
title: Signal Android — 让 Android 上的每条消息都只有两端能看见
来源: 'https://github.com/signalapp/Signal-Android'
日期: 2026-05-30
子分类: 实时通信
分类: 通信
难度: 高级
provenance: pipeline-v3
---

## 是什么

Signal Android 是 Signal 即时通讯 App 的 **Android 客户端**，主体由 Kotlin（约 65%）+ Java（约 33%）写成，通过 JNI 调用官方密码学库 libsignal（已迁到 Rust）做端到端加密。

日常类比：像一台**自己装了保险箱的对讲机**。手机本机负责造钥匙、加密、解密、记本子，服务端只负责把不透明的信封从一台机器搬到另一台。

```
对方设备  <- 密文 -- Signal 服务端 -- 密文 -> 你的 Android
                       (只看信封)              (在这里解密成明文)
```

代码按 Gradle 多模块拆开：`app`（Activity / Fragment / 启动入口）、`core-util` 与 `core-ui`（共享工具）、`libsignal-service`（协议状态机 + 网络）、`libnetwork`（HTTP / WebSocket 长连）、`reproducible-builds` 配置（让任何人都能编出二进制一致的 APK 并和官方包对照）。

## 为什么重要

不理解 Signal Android，下面这些事说不清楚：

- 为什么"端到端加密"在 Android 上要和**碎片化厂商后台杀进程策略**正面硬刚
- 为什么 Signal Android 选了 **JNI + Rust libsignal** 而不是直接用 Java 写密码学
- 为什么这份代码是 WhatsApp / Messenger / Wire 等大型 IM 在 Android 上的事实参考实现
- 为什么 Reproducible Builds 在加密通讯客户端上是必须而不是加分项

## 核心要点

Android 客户端要把"端到端"做扎实，靠这三件事：

1. **协议状态机封装在 libsignal-service**：发一条消息要做 X3DH 协商初始密钥、Double Ratchet 一轮换一次链密钥。类比：每说一句话就把锁芯换一次，旧钥匙立刻作废。这套状态机是纯 Java/Kotlin 写的协议层，下沉到 JNI 才调 Rust 做密码学原语。

2. **本地数据库整库加密**：所有聊天、密钥、会话状态都存进 SQLCipher 包装的 SQLite，主密钥放进 Android Keystore（依赖 TEE / StrongBox）。类比：本子写完后整本扔进保险箱，钥匙挂在芯片级硬件上，App 只能"使用"密钥，不能"读出"密钥。

3. **FCM 推送 + 前台 Service 双保险**：网络好时维持 WebSocket 长连，被系统杀掉就靠 FCM 推一个空载荷把进程拉起，再走一次 Sealed Sender 解密。类比：值班电话挂断了，靠门铃把人叫醒，再自己去开锁拿信。

## 实践案例

### 案例 1：A 给 B 发一条文字消息时，Android 端的全链路

```
1. UI 把明文交给 libsignal-service
2. 取出 B 的会话状态（X3DH + Double Ratchet）
3. 给 B 的每台设备各加密一份密文
4. POST /v1/messages/{B}，走 TLS 1.3 长连
5. FCM 唤醒 B 的设备（载荷为空，仅"有新消息"）
6. B 端 MessageRetriever 拿到通知，启动前台 Service
7. WebSocket 拉取这条消息 → JNI 调 libsignal 解密
8. 写进 SQLCipher 数据库，发系统通知
```

整个过程**没有任何一处把明文交给服务端**。

### 案例 2：Disappearing messages（阅后即焚）的本地实现

```kotlin
// ExpiringMessageManager.kt（示意）
fun scheduleDeletion(messageId: Long, expiresInSeconds: Long) {
    val expireAt = System.currentTimeMillis() + expiresInSeconds * 1000
    SignalDatabase.messages.markExpireStarted(messageId, expireAt)
    scheduleNextCheck(expireAt)
}
// 计时器到点：从加密数据库里硬删那一条 + 关联附件
```

计时器跑在客户端本地，到期把数据库里那条记录与附件一并擦掉。**服务端从头到尾不知道这条消息存在过多久**——它只在密文层面看到一次投递。

### 案例 3：Reproducible Builds —— 二进制一致对照官方 APK

```
$ git clone https://github.com/signalapp/Signal-Android
$ cd Signal-Android && ./reproducible-builds/go.sh <version>
# 产物 SHA-256 与 Play Store / 官网 APK 完全一致
```

任何审计者都能拿官方 APK 二进制比对自己 Gradle 编出来的产物，证明发布版本里**没植入额外代码**。这是把"开源即审计"从口号变成可机器验证的事实——闭源 IM 做不到这一步。

## 踩过的坑

1. **JNI 越界与生命周期错配**：libsignal 的 native handle 必须严格配 `close()`；漏了 GC 不会替你回收 Rust 那侧的内存，长跑下来会泄漏。封装层用 try-with-resources / `use {}` 是硬规矩。

2. **厂商深度定制系统的后台杀进程**：小米 / 华为 / OPPO / vivo 各家"省电策略"会在不同时机杀掉前台 Service，必须靠 FCM 兜底。Signal 用一套 `MessageRetriever` 抽象把"长连 + 推送"两条路统一。

3. **Android 没有原生 Keychain**：iOS 的 Keychain 在 Android 上要用 Android Keystore + EncryptedSharedPreferences 包一层，密钥迁移（旧设备 → 新设备）容易把数据库带不走，账号迁移流程要单独设计 PIN + Secure Value Recovery。

4. **群组扇出消耗电量**：群里 N 人 × 平均 M 设备 = N·M 份密文，发一条消息要循环加密 N·M 次。万人级群组的发件方手机会肉眼可见地发热，靠 Sender Keys 优化把单 fanout 摊销到一次群密钥协商。

5. **多设备链接（Linked Devices）的密钥同步**：手机是主设备，桌面端是 Linked Device，密钥协商要在两端各跑一次 PNI / ACI 注册，迁移期间最容易丢消息。

## 适用 vs 不适用场景

**适用**：

- 学习"如何在 Android 这种碎片化、后台限制严的平台上做生产级 E2E IM"
- 看一份**Kotlin/Java + JNI Rust** 的工业级密码学集成参考
- 自架私密通信客户端，对照看 FCM / 前台 Service / SQLCipher 三件套怎么协作
- 理解 Reproducible Builds 在加密通讯里的工程必要性

**不适用**：

- 想做"服务端可搜索 / 云端备份历史聊天"——结构上做不到，要做就得拆掉 E2E
- 想做联邦化（不同服务器互通）——这是 Matrix / Element 的目标，Signal 故意收紧中心化
- 想做完全跨平台共享业务代码——Android 客户端是 Kotlin/Java 栈，跨端共享只能下沉到 libsignal 这一层
- 不愿意用 FCM / Google Play 服务——Signal 也提供 WebSocket 直连版本（FOSS flavor），但兼容性差很多

## 历史小故事（可跳过）

- **2010 年**：Open Whisper Systems 发布 TextSecure for Android，是 Signal Android 的前身。
- **2014 年**：与 RedPhone 合并改名 Signal，开源仓库正式叫 Signal-Android。
- **2016 年**：WhatsApp 在十亿用户上启用 Signal Protocol，证明这套设计能扛大规模。
- **2018 年**：Sealed Sender 发布，连"谁发给你"都向服务端隐藏。
- **2020 年**：私密群组系统上线，群成员变更也对服务端保密。
- **2022 年起**：核心密码学从 C 写的 libsignal-protocol-c 迁到 Rust 写的 libsignal，Android 通过 JNI 调用，工程上把"易出错的 C 代码"换成更安全的实现。

## 学到什么

1. **客户端是端到端加密真正的主战场**——服务端再开放也只是"看不见"，做到"做不了恶"全靠客户端。
2. **JNI + Rust libsignal** 是把"内存安全"和"跨平台密码学"绑到一起的当代答案——Java/Kotlin 守状态机，Rust 守原语。
3. **整库加密 + Android Keystore** 是移动端密钥安全的事实标准，硬件级密钥不可导出是底线。
4. **FCM + 前台 Service** 是 Android 上现实可行的消息送达组合，纯长连方案在厂商魔改系统上根本走不通。
5. **Reproducible Builds 不是炫技**——它把"开源即审计"从信誉变成可被任何人二进制验证的工程事实。

## 延伸阅读

- 规范：[The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)（Signal Protocol 核心算法）
- 规范：[X3DH Key Agreement Protocol](https://signal.org/docs/specifications/x3dh/)（异步初始密钥协商）
- 博客：[Reproducible Builds for Android](https://signal.org/blog/reproducible-android/)（二进制对照 APK 的工程细节）
- 博客：[Sealed Sender for Signal](https://signal.org/blog/sealed-sender/)（密封发件人怎么实现）
- [[signal-ios]] —— Signal 在 iOS 上的对应实现，对照看两端工程取舍
- [[signal-server]] —— 配套服务端，理解"看不见消息"的设计

## 关联

- [[signal-ios]] —— iOS 阵营的同源客户端，对照看 Swift / Kotlin 两栈差异
- [[signal-server]] —— 配套的服务端，理解客户端必先理解它"看不见消息"的设计
- [[matrix-rust-sdk]] —— 联邦化路线的对照组，端到端但生态选型完全不同
- [[element-android]] —— Matrix 阵营的 Android 客户端，对照看两条路线
- [[element-web]] —— Matrix 的 Web 客户端，看 E2E 在浏览器里的妥协
- [[sqlite]] —— SQLCipher 包装的 SQLite，是本地加密存储的底层
- [[tls-1.3]] —— 长连传输层，配合证书钉扎收紧 MITM 面
- [[diffie-hellman]] —— X3DH / Double Ratchet 的数学基础
- [[dropwizard]] —— Signal-Server 的 Java 服务框架，看客户端连接的另一端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[conversations]] —— Conversations — Android 上把 XMPP 加上 OMEMO 端到端加密的客户端
- [[diffie-hellman]] —— Diffie-Hellman 密钥交换
- [[dropwizard]] —— Dropwizard — Java 微服务的"开箱即用 12-factor 起步包"
- [[element-android]] —— Element Android — Matrix 协议官方 Android 客户端（Kotlin + Realm）
- [[element-web]] —— Element Web — Matrix 协议旗舰 web 客户端（React + matrix-js-sdk）
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[matrix-rust-sdk]] —— matrix-rust-sdk — Matrix 客户端的"共享发动机"
- [[signal-ios]] —— Signal iOS — 让 iPhone 上的每条消息都只有两端能看见
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库

