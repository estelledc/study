---
title: Conversations — Android 上把 XMPP 加上 OMEMO 端到端加密的客户端
来源: 'https://github.com/iNPUTmice/Conversations'
日期: 2026-05-30
分类: communication
难度: 中级
---

## 是什么

Conversations 是一款 **Android 上的 XMPP 即时通讯客户端**，2014 年由德国开发者 Daniel Gultsch 开始写，到现在一直由他主导维护。代码主体是 Java（近年部分 Kotlin），GPLv3 开源。

三个词拆开讲：

- **XMPP**：1999 年从 Jabber 演化来的 IM 协议（IETF 标准）。地址长得像邮箱：`alice@a.im` 给 `bob@b.im` 发消息，**两边各自的服务器互相联邦**，不经过任何中央公司。
- **OMEMO**（XEP-0384，2015）：把 Signal 的 Double Ratchet 算法套到 XMPP 多终端场景上的扩展协议。底层直接用 **libsignal-protocol-java**——和 Signal 是同一套加密核心。
- **客户端**：UI、长连接、本地数据库、推送唤醒、密钥管理都在 Android 端做完。

日常类比：邮件 + 端到端加密。`alice@a.im → bob@b.im` 走的是 XMPP 邮局网络，但每封信进信封前先用 OMEMO 上锁，**只有 bob 那台手机里的钥匙能打开**，中途经过的服务器（包括 alice 自己的）都只看到密文。

## 为什么重要

不理解 Conversations，下面这些事说不清楚：

- 为什么"联邦化 IM" + "端到端加密"能在 Android 上做出**商业级体验**——按一次性买断在 Google Play 卖（F-Droid 免费），证明了不靠广告也能活
- 为什么 Signal 的加密算法能"跨协议复用"——同一份 libsignal，跑在 Signal 协议上叫 Signal，跑在 XMPP 上就成了 OMEMO
- 为什么作者要专门做一个 **compliance.conversations.im** 给 XMPP 服务器打分——开放协议的代价是"名义支持但实际不通"，得有人倒逼服务端跟上
- 在中国大陆环境下，为什么 Conversations 是**少数无需国内手机号、能自托管**的隐私 IM 选项

## 核心要点

读这份代码要抓住四件事：

1. **XmppConnectionService 是大脑**：常驻前台 Service，里面跑 XMPP 长连接的状态机——TCP/TLS 拨号、SASL 鉴权、resource 绑定、stanza 收发都在它身上。Activity 切走也不能掉线，否则 IM 体验崩。类比：一台**永远开机的对讲机**，UI 只是它的显示屏。

2. **AxolotlService 是 OMEMO 实现入口**：封装 libsignal Java 绑定。每条消息发出去前，先按收件人**所有已注册设备**各加密一份——这就是 OMEMO 比 Signal 更复杂的地方，XMPP 天生支持一个账号多终端（手机、平板、PC 客户端各一个）。

3. **省电靠两个 XEP 配合**：CSI（XEP-0352，Client State Indication）告诉服务器"我屏幕灭了"，服务器立刻减少 presence 类噪声推送；Stream Management（XEP-0198）让 TCP 断了也能 0 丢失续上——不用每次都重新握手。类比：值班员看到你按了"勿扰"就只挑要紧事报。

4. **推送可降级**：默认走 FCM（Google Play Services），但作者还提供了 **push proxy** 和 **UnifiedPush** 通路，**去 Google 化的设备**（华为、LineageOS、/e/OS）也能用。代价是锁屏唤醒延迟高一些。

四点合起来：**Conversations = "把 Signal 加密强度装进联邦 IM 邮局的 Android 客户端"**。

读代码的入口顺序建议：`XmppConnectionService` → `AxolotlService` → `MessageParser` → `NotificationService`。前两个搞清楚，整个 App 的骨架就立起来了。

## 实践案例

### 案例 0：自己跑一遍最小闭环

最小可运行配置：

```
设备：一台 Android 手机 + 一台便宜 VPS（1GB 内存够）
服务端：apt install prosody，配置一个 VirtualHost
客户端：F-Droid 装 Conversations
账号：在 prosody 命令行 prosodyctl adduser alice@your.domain
```

5 分钟内就能给身边人发一条**真正端到端加密**的消息，**所有数据都在你自己的服务器上**。这是为什么作者敢说"卖给普通人也能用"。

### 案例 1：alice 给 bob 发一条 OMEMO 加密消息的全链路

```
1. UI 把明文交给 AxolotlService
2. 拉取 bob 在 PEP 节点上发布的所有设备 ID 和身份公钥
3. 对 bob 的每台设备各跑一遍 Double Ratchet，产出 N 份密文
4. 把 N 份密文塞进一个 <message> stanza，发给 alice 自己的 XMPP 服务器
5. 服务器看到收件人是 bob@b.im，转给 b.im 的服务器（联邦）
6. b.im 服务器把 stanza 推给 bob 在线的设备（或存 MAM 离线消息）
7. bob 设备收到，AxolotlService 用本机密钥解出明文
```

**关键观察**：服务器从头到尾**只看到密文 + 元数据**（谁发给谁、什么时间）。元数据没法藏，但内容藏住了——和邮件的 PGP 同思路，只是密钥换得更勤。

### 案例 2：多终端同步靠 Carbons + MAM

```
- Carbons（XEP-0280）：alice 在手机发的消息，自动抄送一份到她自己的电脑客户端
- MAM（XEP-0313）：服务器存归档，新设备登录可以拉历史记录
```

这两个 XEP 在 Conversations 里是**默认强依赖**——服务器没实现就用得很别扭。这也是为什么作者要做 Compliance Suite 排行榜。

### 案例 3：OMEMO 的"信任决定"丢回给用户

第一次和 bob 聊天时，Conversations 弹出 bob 所有设备的指纹（fingerprint），让你**手动勾选信任哪几台**。新增设备会再弹一次。

这是 OMEMO 比 Signal 麻烦的地方：Signal 服务端帮你自动同步设备列表，OMEMO 不信任任何中央方，**信任决定必须落到人**。两种取舍各有道理：Signal 把信任建在"服务端没作恶"，OMEMO 把信任建在"用户自己核对指纹"。

### 案例 4：换服务器只改一个字段

XMPP 地址 `alice@a.im` 里 `a.im` 就是服务器域名。alice 哪天对当前服务器不满意，注册一个 `alice@new.im` 的新账号，**联系人列表手动迁移一遍**就行——协议层就支持，没有"被某 App 绑死"。这和换微信号要重加好友是两个世界。

### 案例 5：传图片走 HTTP File Upload

OMEMO 只加密文本？不是。Conversations 传图片时：

```
1. 客户端把图片用一个一次性 AES key 加密
2. 把密文 PUT 到服务器的 HTTP File Upload 端点（XEP-0363）
3. 在 OMEMO 加密的消息里发出"下载链接 + 解密 key"
4. 对方收到消息→解密→GET 链接→拿 AES key 解图
```

服务器只见到一坨密文 blob，不知道是图、视频还是文件。这套机制和邮件附件比，**密钥不离开端**。

## 踩过的坑

1. **OMEMO 多终端门槛高**：每台新设备都要双方手动 verify 一次指纹。家庭用户经常嫌麻烦直接"全部信任"，实际上削弱了端到端保证。
2. **服务端实现差异巨大**：很多 XMPP 服务器号称"支持 OMEMO"，但 MAM 不全、Carbons 没开、HTTP File Upload 缺失——结果客户端体验断崖。Compliance Suite 就是为这事生的。
3. **推送依赖 Google**：默认走 FCM，去 Google 化的国内设备需要切 UnifiedPush 或自托管 push proxy，配置门槛不低。
4. **代码风格偏传统 Android**：长期单人维护，Jetpack Compose / Hilt / Coroutine flow 用得很少，仍是 AsyncTask + LoaderManager 时代的味道。读起来直白，但和现代 Android 教程对不上。
5. **元数据没法藏**：OMEMO 加密了消息**内容**，但"谁在什么时间给谁发了消息"——这层元数据服务器看得清清楚楚。要藏元数据得换 Tor 或 Mix Network 这种更重的方案。
6. **群聊（MUC）历史是默认明文**：MUC 群聊里的 OMEMO 是后加上的扩展（OMEMO MUC，XEP-0420 等），早期 Conversations 群聊默认明文存服务器。开端到端的群之前要确认双方都升级到了支持版本。

## 适用 vs 不适用场景

**适用**：

- 想自托管 IM 服务器（搭 [[prosody]] 或 [[ejabberd]]）+ 给身边人发个安全聊天 App
- 想读"端到端加密在 Android 上怎么落地"的真实代码——比 [[signal-android]] 简单一档，逻辑更直白
- 学习 OMEMO 协议本身（XEP-0384 + libsignal Java 绑定的工业用法）
- 隐私敏感的小团队（记者、法律咨询、跨境家人沟通）想要一个无需手机号的 IM

**不适用**：

- 想要 Signal 那种"零配置开箱即用"——Conversations 需要先有一个 XMPP 账号
- 想用现代 Android 架构（Compose / Hilt / Room）做参考——这份代码不是
- 大规模运营级客户端——单人维护，issue 响应慢
- 想要"完全藏住元数据"的极端隐私需求——XMPP 服务器始终知道流量图谱

## 历史小故事（可跳过）

- **1999 年**：Jabber 社区启动，后来标准化为 XMPP，把即时通讯做成类似邮件的联邦协议。
- **2014 年**：Daniel Gultsch 开始发布 Conversations，把 Android 客户端体验和 XMPP 扩展打磨到普通用户可用。
- **2015 年**：OMEMO 以 XEP-0384 形式进入 XMPP 世界，把 Double Ratchet 带到多终端联邦聊天。
- **2017 年以后**：Conversations 推动 Compliance Suite，让服务端别只写"支持 XMPP"，还要把 MAM、Carbons、HTTP Upload 等现代扩展配齐。
- **2020 年代**：Matrix、Signal、XMPP 三条路线继续并存，Conversations 成了"联邦 + 端到端 + Android 原生"这一路线的代表样本。

## 学到什么

1. **协议和加密可以解耦**：libsignal 的 Double Ratchet 不绑死 Signal Protocol，XMPP 用得起，Matrix 也用得起（Olm/Megolm 思路类似）。**密码学是模块**。
2. **联邦化 = 把信任决定还给用户**：OMEMO 不替你决定信不信对方设备，代价是体验，收益是抗审查。这和中央化 IM 的取舍正好相反。
3. **XEP 拼装**：XMPP 的现代体验靠十几个扩展协议（MAM / Carbons / Push / CSI / SM / OMEMO / HTTP Upload / MUC）拼起来，缺一个就明显短板——开放协议的现实。
4. **单人长期维护开源 + 商业 + 协议倒逼**：Conversations 同时是开源项目、Google Play 付费 App、协议 compliance 推手。**一个人 + 十年 + 商业可持续**的样本。
5. **同一个问题域可以有多条路线**：Signal（中央化 + 强可用）、Conversations/XMPP（联邦 + 极简服务端）、Matrix（联邦 + 重客户端）三条路在端到端加密 IM 这件事上**都跑通了**——选哪条取决于你愿意为隐私牺牲多少便利。

## 延伸阅读

- 官网与 Compliance：[conversations.im](https://conversations.im/) / [compliance.conversations.im](https://compliance.conversations.im/)
- OMEMO 协议规范：[XEP-0384](https://xmpp.org/extensions/xep-0384.html)（看一遍后再读 AxolotlService 的代码会顺得多）
- 作者博客（中文社区少见的 XMPP 实战经验）：[gultsch.de](https://gultsch.de/)
- Signal 协议原始论文（OMEMO 的算法源头）：[The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)
- 同源对照：libsignal-protocol-java（已逐步被 libsignal Rust + JNI 取代，Conversations 仍用 Java 版）

## 关联

- [[prosody]] —— 最常配套的 XMPP 服务端（Lua，轻量，5 分钟搭好够 Conversations 用）；Conversations 客户端的体验上限基本由 prosody 模块装得齐不齐决定
- [[ejabberd]] —— 大规模场景下的 XMPP 服务端（Erlang OTP，企业级运营）；运营商级 / 万人公司内部 IM 多用它做后端
- [[signal-android]] —— 同一套 libsignal 加密核心，但走 Signal Protocol，信任模型集中（服务端帮你管设备列表，体验顺、抗审查弱一档）
- [[element-web]] —— 另一条联邦化 IM 路线（Matrix），同样做端到端加密，对照取舍：Matrix 把状态同步建在客户端，XMPP 把简单留给服务端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[element-web]] —— Element Web — Matrix 协议旗舰 web 客户端（React + matrix-js-sdk）
- [[prosody]] —— Prosody — Lua 写的轻量 XMPP 服务器（嵌入式部署 + 模块化插件）
- [[signal-android]] —— Signal Android — 让 Android 上的每条消息都只有两端能看见

