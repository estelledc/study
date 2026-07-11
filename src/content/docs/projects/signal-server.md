---
title: Signal-Server — 服务端看不到任何明文的即时通信后端
来源: 'https://github.com/signalapp/Signal-Server'
日期: 2026-05-30
分类: 通信基础设施
难度: 高级
---

## 是什么

Signal-Server 是 Signal 这款即时通信 App 的**服务端实现**——账号注册、设备同步、消息中转、推送下发、群组、联系人查找都跑在它身上。但它有一个反常识的设计：**服务端自己看不到任何一条消息的内容**。

日常类比：像快递公司的分拣中心。包裹（消息）从寄件人到收件人都封着不透明的箱子，分拣中心只看箱子上的"地址"（账号 + 设备 ID），把它送到下一站，**箱子里装什么从头到尾不知道**。

```
客户端 A  -- 加密信封 --> Signal-Server -- 同样的信封 --> 客户端 B
            (服务端只读地址，不能拆)
```

技术上这是用 Java 17 + Dropwizard 写的标准 Web 服务，账号和消息队列存在 FoundationDB，在线状态走 Redis，长连用 WebSocket，推送解耦给苹果 APNs / 谷歌 FCM。**加密本身不在这里**——加密在两端的客户端用 Signal Protocol 完成，服务端只是一个"特别小心的快递员"。

## 为什么重要

不理解 Signal-Server，下面这些事都说不清楚：

- 为什么 WhatsApp / Facebook Messenger 等借鉴了 Signal Protocol，但服务端实现各家各做
- 为什么"端到端加密"的关键在客户端，但**服务端的设计同样决定隐私下限**（元数据泄漏）
- 为什么自己架一个 Signal-Server 仍然不够私密——通讯录、谁给谁发过消息这些元数据还在
- 为什么 Signal 反复强调"我们也读不到你的消息"——这不是营销话术，是后端架构强制保证的

## 核心要点

服务端"装作没看见"靠这三件事：

1. **信封模型**：每条消息进服务端时，外层是个"地址 + 时间戳"的明信片，里层是一坨密文。服务端只读外层。类比：信封上的邮编、收件人姓名能看，**信纸上的字看不到**。

2. **多设备扇出**：一个用户可能在手机、桌面、平板上同时登录。寄件人的客户端要把同一条消息**为每台设备各加密一份**（设备数 N → N 份密文），服务端再分别投递。服务端因此不能"广播一份"省事——它根本没有那把密钥。

3. **私密计算保护查找**：当你装好 Signal 想看通讯录里谁也用 Signal，服务端不能拿到你的整本通讯录。Signal 把这一步放进了 Intel SGX / AWS Nitro 的可信计算飞地（enclave，像上了锁的小黑屋），客户端可以远程验证"飞地里跑的是公开审计过的代码"，再把数据交进去。

三件事加起来，让服务端从"理论上读不到"升级成"机制上读不到"。

## 实践案例

### 案例 1：A 发一条消息给 B 时，服务端到底做了什么

```
1. A 客户端：用 Signal Protocol 给 B 的每台设备加密一份密文
2. POST /v1/messages/{B 账号} → Signal-Server   # 路径为教学示意
3. 服务端校验 A 的认证 token、检查 B 在线
4. B 在线：通过 WebSocket 直接推
   B 不在线：把信封塞进 FoundationDB 的待投队列
5. 给 B 的所有设备发一条"有新消息"的推送（载荷为空，仅唤醒）
6. B 上线后调 GET /v1/messages 取走 + 返回 ACK，服务端才删
```

**逐部分解释**：

- 步骤 1：密钥在客户端，服务端没有私钥，所以必须按设备各封一份。
- 步骤 4–6：待投队列按收件设备存信封；推送只响铃不带正文，避免苹果/谷歌通道看到预览。

### 案例 2：私密联系人发现

```
朴素做法：客户端把通讯录上传，服务端比对返回交集
                           ↑ 服务端拿到了你认识的所有人

Signal 做法：
1. 客户端用远程证明确认服务端 enclave 跑的是公开代码
2. 通讯录加密后送进 enclave
3. enclave 内做比对，输出加密后的交集，服务端拿不到中间结果
```

**逐部分解释**：

- 远程证明像验门锁编号：确认小黑屋里跑的是已公开审计的代码，再交通讯录。
- 比对只在飞地内完成；主机进程拿不到明文名单，代价是要维护 enclave 服务。

### 案例 3：自架一台 Signal-Server 的最小依赖盘点

```
必备：Java 17 + Maven；FoundationDB（账号/队列）；Redis（在线/限流）；
      APNs + FCM 凭证；域名 + TLS（证书钉扎）；TURN（音视频穿透 NAT）
可选但实际要：私密联系人发现 enclave；反垃圾；日志监控告警
```

**逐部分解释**：

- 跑通 Web API 不难；要接近官方隐私，还得上 enclave 查找 + 空载荷推送 + 证书钉扎。
- 自架仍看得见元数据（谁何时联系谁），别把"能编译"当成"一样私密"。

## 踩过的坑

1. **服务端事后想补 E2E 几乎不可能**：先按"服务器是受信"建好的系统，账号、群组、消息历史都在服务端有明文备份，要改成端到端意味着推翻数据模型——所以 Signal 一开始就把"服务端看不到"当架构红线。

2. **元数据是最大破口**：内容加密了，但"谁在什么时间给谁发过"这张图还在服务端。Signal 用密封发件人（sealed sender）让服务端连寄件人是谁都不知道，但社交图仍可能被请求模式反推。

3. **推送通道是第三方信道**：APNs / FCM 由苹果 / 谷歌运营。如果你把消息预览塞进推送载荷，等于在最后一公里把 E2E 打穿了。Signal 的推送只是空响铃，让客户端起来自己取。

4. **WebSocket 重连风暴**：手机网络一切就抖动，几亿台设备同时重连能把任何后端打挂。必须做指数退避、抖动随机化、服务端会话粘连，重连成本要远低于完整握手。

## 适用 vs 不适用场景

**适用**：

- 学习"零信任服务端"：账号、消息、密钥、查找边界怎么划；多设备扇出按 O(设备数) 份密文计成本
- 自架小型私密通信（公司内部 / 记者团体）；接受中心化与元数据仍可能落在自管服务器上
- 想看 E2E 外围工程支撑（认证、注册、推送、密钥包分发），而不是只读协议论文

**不适用**：

- 想要服务端做内容审核、广告匹配、消息搜索——与 E2E 互斥，强行做等于拆掉信封模型
- 想要联邦化通信（不同服务器互通）——这是 Matrix 的目标，Signal 故意选中心化以收紧攻击面
- 想要"我替你存完整聊天记录"的云备份——设计不存历史明文，重开这个口子会毁掉隐私下限

## 历史小故事（可跳过）

- **2010 年**：Moxie 等创立 Whisper Systems，推出 TextSecure；服务端谱系由此起步。
- **2013 年**：Moxie 另立 Open Whisper Systems，继续开源维护 TextSecure / RedPhone。
- **2014 年**：TextSecure 与 RedPhone 合并为 Signal，服务端仓库随之改名 Signal-Server。
- **2016 年**：WhatsApp 在十亿用户上启用 Signal Protocol，证明这套 E2E 能扛大规模。
- **2017 年**：私密联系人发现技术预览上线（SGX enclave），随后接入客户端。

## 学到什么

1. **隐私不是事后补丁，是开局红线**——一个"服务端可以看一眼"的系统永远改不成 E2E。
2. **元数据的威胁常被低估**：内容加密只是第一步，谁联系谁、什么时候联系，本身就是高敏感信号。
3. **可信硬件 + 远程证明** 是当前对"私密查找"最务实的工程答案，但部署门槛高。
4. **简单的依赖栈也能服务亿级用户**：Java + Dropwizard + FoundationDB + Redis，没有银弹，关键在边界划得对。

## 延伸阅读

- 论文：[The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)（Signal Protocol 核心算法规范）
- 论文：[X3DH Key Agreement Protocol](https://signal.org/docs/specifications/x3dh/)（异步初始密钥协商）
- 博客：[Technology Preview: Sealed Sender for Signal](https://signal.org/blog/sealed-sender/)（密封发件人怎么实现）
- 博客：[Private Contact Discovery with SGX](https://signal.org/blog/private-contact-discovery/)（enclave 联系人发现工程实录）
- [[matrix-rust-sdk]] —— 联邦化路线的对照组，看两种设计取舍

## 关联

- [[dropwizard]] —— Signal-Server 选用的轻量 Java Web 框架，决定了服务端的技术口味
- [[matrix-rust-sdk]] —— Matrix 走联邦化、Signal 走中心化，同一问题的两条路线
- [[element-android]] / [[element-web]] —— Matrix 阵营的客户端，可与 Signal 客户端做架构对照
- [[dendrite]] —— Matrix 的 Go 服务端，结构上对应 Signal-Server 但信任模型完全不同
- [[tls-1.3]] —— Signal 长连的传输层基础，配合证书钉扎收紧 MITM 攻击面
- [[redis]] —— 在线状态与限流的 KV 引擎选择
- [[envoy]] —— 大规模 WebSocket 长连入口的常见前置代理

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ejabberd]] —— ejabberd — Erlang 写的电信级 XMPP/MQTT 多协议服务器
- [[haraka]] —— Haraka — 用 Node.js 写插件链式架构的 SMTP 服务器
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[mailcow]] —— mailcow — Docker compose 一键起一整套邮件服务
- [[mattermost]] —— Mattermost — Slack 的开源自托管替代（Go 服务端 + React 客户端）
- [[prosody]] —— Prosody — Lua 写的轻量 XMPP 服务器（嵌入式部署 + 模块化插件）
- [[rocket-chat]] —— Rocket.Chat — 开源 Slack 替代，Meteor + MongoDB 全栈实时聊天
- [[signal-android]] —— Signal Android — 让 Android 上的每条消息都只有两端能看见
- [[signal-ios]] —— Signal iOS — 让 iPhone 上的每条消息都只有两端能看见
