---
title: libsignal — 端到端加密的 Rust 内核
来源: 'https://github.com/signalapp/libsignal'
日期: 2026-05-30
子分类: 实时通信
分类: 通信
难度: 高级
provenance: pipeline-v3
---

## 是什么

libsignal 是 Signal 协议的**统一密码学内核**——X3DH 首次握手 + Double Ratchet 每条消息换钥 + Sealed Sender 隐藏发件人身份。它用 Rust 写核心，对外暴露 **Java / Swift / TypeScript / Node.js** 四套绑定，是 Signal Android / iOS / Desktop 三大客户端共用的同一份密码学代码。

日常类比：像一个**保险柜厂**。Signal 公司不在每个分店各打一把锁（C / Java / Swift 各写一遍），而是在一个工厂（Rust libsignal）里做出锁芯，再给每个分店配一个**接口转换头**（FFI 绑定），分店只负责把"门"装上去。

```
Signal-Android (Kotlin) ─┐
Signal-iOS    (Swift)    ─┼─→ FFI ─→ libsignal core (Rust)
Signal-Desktop(TS/Node)  ─┘            (X3DH + Double Ratchet + zkgroup)
```

加密本身在客户端两端完成，**服务端只是密文路由器**——这就是 [[signal-server]] 反复强调"我们也读不到你的消息"的工程依据。

## 为什么重要

不理解 libsignal，下面这些事都说不清楚：

- 为什么 **WhatsApp / Messenger / Skype / Google Messages RCS** 都基于 Signal 协议——它们的实现都在向 libsignal 这套参考实现对齐
- 为什么 Signal 在 2022 年把核心从 C 重写到 Rust——密码学库选 Rust 做内存安全是工业级标杆
- 为什么端到端加密的"端到端"是真的——服务端连密钥派生的中间产物都拿不到
- 为什么自己实现 Signal 协议**几乎一定踩坑**——X3DH 与 Double Ratchet 的状态机有大量边界条件，业界共识是"用 libsignal，不要自己写"

## 核心要点

libsignal 把端到端加密拆成 **三层协议** + **一层凭证体系**：

1. **X3DH（首次握手）**：DH（Diffie-Hellman）是一种"两人各自手里有一把私钥，公开各亮一把公钥，就能算出同一把共享密钥"的数学魔术。X3DH 是它的"三 DH 加强版"：双方注册时各上传一组公钥到服务端（身份键 + 签名预共享键 + 一批一次性预共享键）。第一次发消息时，发件人下载收件人的公钥包，本地做四次 DH 混合派生出共享根密钥。**整个过程收件人甚至不用在线**——这是 Signal 区别于 OTR 等老协议的关键。

2. **Double Ratchet（每条消息换钥）**：根密钥拿到后，每发一条消息推一步对称 KDF 链；每收到对方一条消息就做一次 DH ratchet 换新密钥对。**前向安全**（forward secrecy）——旧密钥泄漏不影响新消息；**后向（破后续）保密**（post-compromise security）——新密钥泄漏不影响旧消息。日常类比：每说一句话就把锁芯换一次，旧钥匙立刻作废。

3. **Sealed Sender（隐藏发件人）**：把"我是谁"也加密装进密文里。服务端连"A 给 B 发了消息"这条元数据都看不到，只看到"某人给 B 发了消息"。这一层是 2018 年才加上的，当时已经有大量协议借鉴 Signal 但没人敢做这一步。

4. **zkgroup（群组匿名凭证）**：用零知识证明让服务端验证"你是这个群的合法成员"但不知道你是谁。群组消息也能不暴露成员关系，这是把零知识证明从学术搬到 IM 工程的样板。

> 这套协议组合的学术依据是 Marlinspike & Perrin 2016 的《The Double Ratchet Algorithm》与同期的《X3DH Key Agreement》。

## 实践案例

### 案例 1：发一条消息走完整条链路

Alice 第一次给 Bob 发 "hello"：

1. Alice 客户端从服务端拉 Bob 的预共享键包
2. 调 libsignal 的 `process_prekey_bundle()` → 本地完成 X3DH，得到根密钥
3. 调 `encrypt()` → 推一步 Double Ratchet 链，得到这条消息的密钥
4. 用这个密钥加密 "hello"，再用 Sealed Sender 把"Alice"也加密
5. 把整个密文 POST 到 [[signal-server]]，服务端**完全不知道**这是 Alice 发的也不知道内容

Bob 上线，反着走一遍：服务端推密文 → libsignal 解 Sealed Sender → 解 Double Ratchet → 拿到 "hello"。

### 案例 2：FFI 绑定怎么跨语言

[[signal-android]] 通过 JNI 调 libsignal：

```kotlin
// Kotlin 侧（signal-android）
val ciphertext = sessionCipher.encrypt(plaintext)
// 内部走 JNI → Rust 的 signal_session_cipher_encrypt_message
```

[[signal-ios]] 通过 C ABI 调同一份 Rust 代码：

```swift
// Swift 侧（signal-ios）
let ciphertext = try sessionCipher.encrypt(plaintext)
// 内部走 C 头文件 → 同一个 Rust 函数
```

**两端调的是字节级一致的同一份 Rust 实现**——这就是 libsignal 重写的最大工程红利：协议升级一次性同步三大客户端。

### 案例 3：为什么从 C 迁到 Rust

老版 `libsignal-protocol-c` 在 2014-2020 年用 C 写。密码学代码 + C 内存管理 = 高危组合，业界审计一致认为是高风险设计。Rust 重写带来：

- **内存安全**：所有权 + borrow checker，编译期排除 use-after-free / double-free / data race
- **无 GC**：跨 FFI 不引入运行时，Java / Swift / Node.js 都能直接调，没有暂停
- **类型系统约束协议状态机**：Double Ratchet 的状态用 enum + 模式匹配建模，编译器替你查"这个状态能不能调这个方法"
- **统一三客户端**：迁 Rust 之前 Android 一份 C 代码、iOS 一份 Swift 代码、Desktop 一份 TS 代码，协议升级要改三遍；现在改一遍 Rust，三家同步

## 踩过的坑（业界普遍踩）

1. **自己实现 Signal 协议几乎必翻车**：Double Ratchet 的乱序消息、丢失消息、密钥跳跃（skipped key）这些边界条件极多。Matrix 的 Olm / Megolm 早期就被审计出过实现 bug。业界共识——用 libsignal，不要自己写。

2. **FFI 边界泄漏 native handle**：Java / Swift 拿到的是 Rust 那侧的内存指针。漏了 `close()` / `drop()` → Rust 端不释放，长跑下来泄漏。详见 [[signal-android]] 里"JNI 越界与生命周期错配"。封装层用 try-with-resources / Swift `defer` 是硬规矩。

3. **预共享键耗尽 → 降级**：一次性预共享键被用一个少一个。如果 Alice 离线很久，她的一次性键被耗光，新发给她的会话只能用签名预共享键（signed prekey）——前向安全等级降一档。客户端要定期补充上传，[[signal-server]] 也会在余量低于阈值时通知客户端补货。

4. **Sealed Sender 不防元数据全集**：服务端虽然看不到发件人身份，但仍能看到 IP、连接时间、收件人。完全的元数据私密需要叠加 Tor / 私密联系人发现（PCS）等额外手段，光靠 libsignal 是做不到的。

5. **Double Ratchet 多设备语义复杂**：一个用户登录手机 + 平板 + 桌面三台设备，每台要各自跑一份 ratchet 状态。libsignal 用 deviceId 做了多设备扩展，但客户端层（[[signal-android]] / [[signal-ios]]）仍要处理"消息发到哪台设备"的路由。

## 适用 vs 不适用场景

**适用**：
- 端到端加密 IM（直接调 libsignal，省下 90% 的协议实现工作）
- 学习 X3DH / Double Ratchet 的工业实现细节——Rust 源码注释密度高，是学协议的最佳样本
- 跨语言密码学库的 Rust + FFI 范式参考——Java JNI / Swift C ABI / Node N-API 三套绑定都做了
- 零知识证明工程化样板（zkgroup / 用户名加密 / SVR3 Secure Value Recovery）

**不适用**：
- 群聊 > 1000 人 / 直播万人弹幕（Double Ratchet 每对一会话不适合超大规模，群消息走 SenderKey 但仍有上限）
- 服务端可见明文的场景（libsignal 的设计前提就是服务端不可信，业务端审核 / 关键词过滤完全做不了）
- 需要"密钥托管 / 合规可解密"——和端到端加密本质冲突，监管要求明文留存的国家无法直接用

## 历史小故事（可跳过）

- **2013 年**：Marlinspike 在 OWS（Open Whisper Systems）发布 TextSecure，最早的 Signal 协议雏形
- **2014 年**：libsignal-protocol-c 开源，WhatsApp 把它集成进 10 亿用户的客户端
- **2016 年**：Marlinspike & Perrin 发表《Double Ratchet》《X3DH》两篇规范文档，成为业界公认参考
- **2018 年**：加入 Sealed Sender，从协议层而不是道德承诺保证发件人匿名
- **2020-2022 年**：核心从 C 重写到 Rust，成立 Signal Messenger LLC（脱离 OWS），libsignal 名字定型
- **2024 年起**：陆续加入 zkgroup（群组零知识凭证）、SVR3（Secure Value Recovery）、用户名加密

## 学到什么

1. **协议核心 + 多语言绑定**是密码学库的当代正解——Rust 写一份，FFI 出三份，协议升级一次同步
2. **X3DH + Double Ratchet** 不是单点算法，是一套状态机；理解它要把"会话生命周期"在脑里跑一遍，光看公式不够
3. **服务端看不见**靠的是协议设计而不是道德承诺——架构强制保证才是隐私下限，[[signal-server]] 配合 libsignal 才完整
4. **从 C 重写到 Rust** 不是炫技，是密码学行业对内存安全的工程共识，业界陆续跟进（rustls / ring 等）
5. **零知识证明可以工程化**：zkgroup 把学术论文里的复杂构造做到能在手机上每秒跑几十次的程度

## 延伸阅读

- 规范：[The Double Ratchet Algorithm — Marlinspike & Perrin 2016](https://signal.org/docs/specifications/doubleratchet/)（80 页，把状态机讲到位）
- 规范：[X3DH Key Agreement — Marlinspike & Perrin 2016](https://signal.org/docs/specifications/x3dh/)（30 页，握手部分）
- 规范：[Sealed Sender Blog — 2018](https://signal.org/blog/sealed-sender/)（讲清楚为什么要再裹一层）
- 仓库 README：[libsignal — Github](https://github.com/signalapp/libsignal)（rust/protocol 是入手点）
- [[signal-server]] —— 配套的服务端，看"路由器视角"
- [[signal-android]] —— Android 客户端，看 JNI 怎么调 libsignal
- [[signal-ios]] —— iOS 客户端，看 Swift 通过 C ABI 调 libsignal

## 关联

- [[signal-server]] —— 服务端只看密文，加解密的另一半在 libsignal 里
- [[signal-android]] —— Kotlin/Java 阵营，JNI 桥接 Rust 核心
- [[signal-ios]] —— Swift 阵营，C ABI 桥接同一份 Rust 核心
- [[hindley-milner]] —— Rust 类型系统能编译期约束 Double Ratchet 状态机，受 HM 体系影响

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[age]] —— age — 把"用 GPG 加密一个文件"重新做对
- [[heartbleed-2014]] —— Heartbleed — 一个忘了写边界检查的 bug 让全网 1/3 的 HTTPS 站点漏内存
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[li-t-closeness-2007]] —— t-Closeness — 用"分布距离"堵住匿名化的最后漏洞
- [[lucky13-2013]] —— Lucky 13 — 用毫秒级时间差把 TLS 加密看穿
- [[madry-pgd-2017]] —— Madry PGD 2017 — 用最强对手训练最强防御
- [[mitls-2014-triple-handshake]] —— Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁
- [[mumble]] —— Mumble — 游戏圈用了 20 年的低延迟开源语音
- [[piotrowska-loopix-2017]] —— Loopix — 低延迟 mix 网络实现发送方和接收方双向匿名
- [[reed-onion-routing-1998]] —— 洋葱路由 1998 — 把匿名通信从理论搬进真实互联网
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[signal-android]] —— Signal Android — 让 Android 上的每条消息都只有两端能看见
- [[signal-ios]] —— Signal iOS — 让 iPhone 上的每条消息都只有两端能看见
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[vodozemac]] —— vodozemac — Matrix 端到端加密的 Rust 内核
- [[webrtc-rs]] —— webrtc-rs — Rust 纯实现 WebRTC 协议栈，对标 Go 世界的 Pion

