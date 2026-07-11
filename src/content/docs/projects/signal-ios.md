---
title: Signal iOS — 让 iPhone 上的每条消息都只有两端能看见
来源: 'https://github.com/signalapp/Signal-iOS'
日期: 2026-05-30
分类: 通信基础设施
难度: 高级
---

## 是什么

Signal iOS 是 Signal 即时通讯 App 的 **iPhone / iPad 客户端**，整套代码 97% 用 Swift 写，少量 Objective-C 兜底，依赖 Signal 官方密码学库 libsignal 做端到端加密。

日常类比：像一台**自己会写信、自己会拆信、自己会上锁的邮筒**。服务端只是邮局，从头到尾不知道箱子里写了什么——所有真正的"加密 / 解密 / 认证 / 安全号码"都发生在这台手机本机上。

```
对方设备  <- 密文 -- Signal 服务端 -- 密文 -> 你的 iPhone
                       (只看信封)              (在这里解密成明文)
```

仓库里几个核心模块：`SignalServiceKit`（协议状态机 + 网络 + 存储）、`SignalUI`（界面）、`SignalNSE`（推送通知扩展，独立进程）、`SignalShareExtension`（系统分享面板的扩展进程）。这些扩展会跟主 App **共享同一份加密数据库**，但每个扩展独立运行，受 iOS 严格内存上限。

## 为什么重要

不理解 Signal iOS，下面这些事说不清楚：

- 为什么"端到端加密"这件事**真正发生在客户端**——服务端再聪明也只是中转
- 为什么 iOS 的推送扩展（NSE）经常崩、消息显示成 "Encrypted Message"
- 为什么 WhatsApp / Messenger / Wire 都借鉴了 Signal Protocol，但很少有人能复刻它在 iOS 上的完整工程
- 为什么 Signal 多年坚持中心化但仍被认为最私密——客户端把信任面收紧到几乎只剩本机

## 核心要点

iOS 客户端要把"端到端"做扎实，靠这三件事：

1. **协议状态机封装在 SignalServiceKit**：发一条消息要做 X3DH 协商初始密钥、Double Ratchet 一轮一轮换密钥。类比：每说一句话就把锁芯换一次，旧钥匙立刻作废。这套状态机被独立成 framework，主 App 和扩展都能调。

2. **本地数据库整库加密**：所有聊天、密钥、会话状态都存进 GRDB 包装的 SQLite，文件层用 SQLCipher 整库加密，密钥放进 iOS Keychain。类比：本子写完后整本扔进保险箱，钥匙挂在硬件安全模块上。

3. **多进程共享同一份钥匙**：主 App、NSE、Share Extension 是三个独立进程，但通过 App Group + Keychain access group 共享同一个数据库密钥。类比：一家三个房间但用同一把电子门卡，进哪间都能看到加密文件。

## 实践案例

### 案例 1：A 给 B 发一条消息时，iPhone 端的全链路

```
1. UI 层把明文交给 SignalServiceKit
2. SSK 取出 B 的会话状态（X3DH + Double Ratchet）
3. 给 B 的每台设备各加密一份密文
4. POST /v1/messages/{B} 走 TLS 1.3 长连
5. APNs 唤醒 B 的设备（载荷为空，仅"有新消息"）
6. B 端的 NSE 进程被系统拉起，限时约 30 秒、内存约十几到二十多 MB（随 iOS 版本）
7. NSE 打开同一份 SQLCipher 数据库，解密这一条
8. 写预览到通知中心，进程退出
```

整个过程**没有任何一处把明文交给服务端**。

### 案例 2：Safety Numbers 验证

```
两人各自计算: SHA-512(本人公钥 || 对方公钥) → 截取 60 位数字
显示成 12 组 5 位 / 一张 QR 码
```

线下见面对扫一次，结果一致就把这次"已验证"持久化。下次对方公钥变了——可能换手机、可能被中间人替换——客户端会**红色横幅警告**。

这是 Signal 把"密码学正确"翻译成"普通用户能用"的关键步骤——即使用户完全不懂公钥指纹，也能通过"对一下 60 位数字"完成最强等级的验证。Telegram 的 secret chat 也用类似机制，但 Signal 是默认开启、所有人都享有这层保护。

### 案例 3：分享扩展用同一把钥匙打开数据库

```swift
// SignalShareExtension/.../ShareViewController.swift（示意）
let keychainAccessGroup = "group.org.whispersystems.signal.shared"
let dbKey = SSKKeychain.fetch(accessGroup: keychainAccessGroup)
let db = GRDB.DatabasePool(path: appGroupContainer.path,
                           configuration: .encrypted(dbKey))
// 用同一份会话状态发消息
SSKEnvironment.messageSender.send(text, to: recipient)
```

主 App 没启动也能发消息，因为扩展进程拿到同一把密钥后，能直接复用 SignalServiceKit 的会话状态。

## 踩过的坑

1. **NSE 内存预算极紧**：通知扩展通常只有约十几到二十多 MB（随 iOS 版本），libsignal + 数据库连接 + 协议状态稍一展开就爆。修法是延迟初始化、把迁移挡在主 App，扩展只做"打开数据库 → 解密一条 → 写通知 → 退出"。

2. **群聊别按 N·M 份密文想**：现代 Signal 群消息用 **Sender Keys**——发送端对群会话密钥加密一次，服务端再扇出；N·M 更贴近 1:1 多设备，或成员变更时的 Sender Key 分发。真瓶颈常在密钥分发、多设备同步和 NSE 预算，不是"每条群消息循环加密 N·M 次"。

3. **数据库密钥跨进程**：共享数据库必须用 App Group 容器 + Keychain access group。漏配任何一边，扩展进程打开就报 "file is encrypted or is not a database"——而且这个错往往在用户实际使用分享扩展时才暴露。

4. **Sealed Sender 让拉黑失效**：服务端不知道发件人，垃圾过滤就要在客户端做。老用户经常遇到陌生号码绕过黑名单——Signal 后来加了"只接收联系人"开关补救，但默认仍开放。

5. **iOS 后台限制**：消息长连接在后台只能维持几分钟，必须靠 APNs 推送把客户端拉起，再走 NSE 短暂解密。不依赖推送的"纯长连"方案在 iOS 上根本走不通。

## 适用 vs 不适用场景

**适用**：

- 学习"如何在 iOS 极受限运行环境（推送扩展 / 分享扩展）里做密码学"
- 看一份**生产级 Signal Protocol** 的 Swift 集成参考
- 自架私密通信客户端，对照看 NSE / Share / 主 App 三进程怎么协作
- 想理解一个 IM 客户端如何把"密钥管理 / 数据库加密 / 多设备同步"这套基本功做到工业级

**不适用**：

- 想要服务端能搜索 / 备份历史聊天——结构上做不到，要做就得拆掉 E2E
- 想要联邦化（不同服务器互通）——这是 Matrix 的目标，Signal 故意收紧到中心化
- 想做云端聊天迁移工具——Signal 的设计就是不让这件事发生
- 想做 Web / 跨平台共享代码库——Signal iOS 是纯 Apple 平台栈，跨端要看 libsignal 这一层

## 历史小故事（可跳过）

- **2010 年**：Open Whisper Systems 发布 TextSecure for Android。
- **2014 年**：iOS 阵营合并 RedPhone，统一改名 Signal，开源仓库正式叫 Signal-iOS。
- **2016 年**：WhatsApp 在十亿用户上启用 Signal Protocol，证明这套设计能扛大规模。
- **2018 年**：Sealed Sender 发布，连"谁发给你"都向服务端隐藏。
- **2020 年**：私密群组系统（Private Group System）上线，群成员变更也对服务端保密。
- **2022 年至今**：核心密码学逐步迁到 Rust 写的 libsignal，iOS 通过 Swift bridge 调用，工程上把"易出错的 C 代码"换成更安全的实现。

## 学到什么

1. **客户端是端到端加密真正的主战场**——服务端再开放也只能做到"看不见"，做到"做不了恶"全靠客户端。
2. **iOS 扩展进程是最小化信任面的天然边界**：通知扩展只解一条消息、分享扩展只发一次消息，主 App 不在线也能干活。
3. **整库加密 + Keychain 是移动端密钥安全的事实标准**，配合 App Group 才能让多个进程协同。
4. **协议正确不等于工程可用**：Safety Numbers / NSE 内存预算 / 群组扇出，每一项都是把数学翻译成可用产品的硬功夫。
5. **从 Objective-C 到 Swift 再到 Rust 的渐进迁移**展示了一个工业级加密客户端 10 年量级的演化路径——能跑、能改、还能继续推进。

## 延伸阅读

- 规范：[The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)（Signal Protocol 核心算法）
- 规范：[X3DH Key Agreement Protocol](https://signal.org/docs/specifications/x3dh/)（异步初始密钥协商）
- 博客：[Sealed Sender for Signal](https://signal.org/blog/sealed-sender/)（密封发件人怎么实现）
- 博客：[Technology Preview: Signal Private Group System](https://signal.org/blog/signal-private-group-system/)（私密群组协议）
- [[signal-server]] —— Signal iOS 对接的服务端实现，看两端如何配合

## 关联

- [[signal-server]] —— 配套的服务端，理解客户端必先理解它"看不见消息"的设计
- [[matrix-rust-sdk]] —— 联邦化路线的对照组，端到端但生态选型完全不同
- [[element-android]] —— Matrix 阵营的 Android 客户端，对照看两条路线
- [[element-web]] —— Matrix 的 Web 客户端，看 E2E 在浏览器里的妥协
- [[matrix-js-sdk]] —— Matrix 客户端 SDK，对照 SignalServiceKit 的封装思路
- [[sqlite]] —— SQLCipher 包装的 SQLite，是本地加密存储的底层
- [[tls-1.3]] —— 长连传输层，配合证书钉扎收紧 MITM 面
- [[diffie-hellman]] —— X3DH / Double Ratchet 的数学基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[diffie-hellman]] —— Diffie-Hellman 密钥交换
- [[element-android]] —— Element Android — Matrix 协议官方 Android 客户端（Kotlin + Realm）
- [[element-web]] —— Element Web — Matrix 协议旗舰 web 客户端（React + matrix-js-sdk）
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[matrix-js-sdk]] —— matrix-js-sdk — Matrix Web/Node 端的"老大哥"客户端 SDK
- [[matrix-rust-sdk]] —— matrix-rust-sdk — Matrix 客户端的"共享发动机"
- [[signal-android]] —— Signal Android — 让 Android 上的每条消息都只有两端能看见
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库

