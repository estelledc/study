---
title: Prosody — Lua 写的轻量 XMPP 服务器（嵌入式部署 + 模块化插件）
来源: 'https://prosody.im/ (Matthew Wild et al.; source https://hg.prosody.im/)'
日期: 2026-05-30
分类: communication
难度: 中级
---

## 是什么

Prosody 是一个**用 Lua 语言写的 XMPP 服务器**。三个词拆开讲：

- **XMPP**：1999 年定型的开放即时通信协议（前身叫 Jabber）。它跟邮件的 SMTP 是一个套路——你的 `alice@a.com` 能直接给 `bob@b.com` 发消息，**不用经过任何中央公司**。
- **服务器**：负责接消息、存离线消息、转发到别家 XMPP 服务器、托管群聊（MUC）。
- **Lua**：一门小巧的脚本语言，常嵌在游戏（Roblox / WoW）和 Nginx 里。Prosody 用它的特点是核心代码只有 ~10k 行，跑在 32MB 内存 VPS 上能撑几千用户。

日常类比：你想自己开一个**邮局**，但只用一个员工 + 一台旧电脑。Prosody 就是这样的 IM 邮局。

## 为什么重要

不理解 XMPP 系 IM 后端，下面这些事讲不清：

- 为什么 Signal / WhatsApp / 微信都是**中心化**的，而 IM 协议本身可以**联邦**——XMPP 早就证明了
- 为什么有人愿意自托管聊天后端（隐私、协议开放、不被某公司绑死）
- 为什么 Matrix / Mastodon 这波"联邦化"潮流并不新——XMPP 玩了 20 年了
- 为什么大学实验室、开源基金会内部 chat 不少还是 Jabber/XMPP——开放、稳定、零授权费

Prosody 是这条路线里**门槛最低**的一个实现：装好不到 5 分钟，写插件 50 行起步。

## 核心要点

Prosody 设计的四个关键决定：

1. **Lua 单进程 + 协程**：靠 Lua coroutine 写异步，不是多线程。读代码时谁在主循环、谁是回调要分清楚。好处是没锁、没竞态；代价是单 CPU 核心——撑不住几十万并发。
2. **一切皆模块**（`mod_*.lua`）：MUC 群聊、WebSocket、HTTP 上传、PEP、推送、存储后端——全部是插件。核心只管 stanza（XMPP 数据单元）路由，其余按需加载。一个新插件通常 50-200 行 Lua 就能写完。
3. **配置即 Lua 脚本**：`prosody.cfg.lua` 不是 yaml/json，是真正的 Lua 代码。可以写函数、读环境变量、循环生成 VirtualHost——比静态配置灵活得多。
4. **存储抽象层**：业务模块只调用统一的 `storage` API，底下是 flat file / SQLite / MySQL / PostgreSQL 都可以——换后端不用改业务代码。

这四点合起来：**Prosody = "可读可改的 IM 邮局"**。新人能在一周内读完核心 + 自己加一个插件。

## 实践案例

### 案例 1：写一个最小插件

`plugins/mod_helloworld.lua`：

```lua
module:hook("message/bare", function(event)
  local stanza = event.stanza
  module:log("info", "收到 %s 发给 %s 的消息", stanza.attr.from, stanza.attr.to)
end)
```

**逐部分解释**：

- `module:hook("message/bare", …)`：消息路由到本机用户时触发（bare = 不带 `/resource`）
- `event.stanza`：这条 XMPP 消息本身；`attr.from` / `attr.to` 是收发双方 JID
- 启用：把文件放进 plugins 目录，并在 `modules_enabled` 里加上 `"helloworld"`

### 案例 2：联邦（s2s）跟外面通话

```lua
-- prosody.cfg.lua
VirtualHost "alice.example"
  enabled = true
  ssl = {
    key = "/etc/letsencrypt/live/alice.example/privkey.pem";
    certificate = "/etc/letsencrypt/live/alice.example/fullchain.pem";
  }
```

**逐部分解释**：

- `VirtualHost`：声明本机托管的域名（像邮局的本地分局名）
- `ssl.key` / `ssl.certificate`：s2s 握手用的 TLS 材料，缺一不可
- DNS 再加 `_xmpp-server._tcp.alice.example. SRV 0 0 5269 alice.example.`，alice@alice.example 就能给 bob@jabber.org 发消息——两台服务器自己握手转发，跟 SMTP 一个意思

### 案例 3：换存储后端

默认 internal storage 是 flat file（一人一目录）。生产环境换 SQL 只要：

```lua
storage = "sql"
sql = { driver = "PostgreSQL", database = "prosody", host = "localhost", username = "prosody", password = "secret" }
```

**逐部分解释**：

- `storage = "sql"`：告诉核心用 `mod_storage_sql`，而不是默认 flat file
- `sql = { … }`：驱动与连接参数；模块自己建表、做迁移
- 业务模块仍只调统一 `storage` API——换后端不用改插件代码

## 踩过的坑

1. **Lua 协程不是异步神药**：所有 IO 都要用 prosody 提供的非阻塞 API（`module:add_timer` / `net.http`）。如果你直接 `io.read` 或 `os.execute` 阻塞调用，**整台服务器卡住**——单线程模型的代价。新人写第一个插件时最常踩。
2. **插件加载顺序敏感**：`mod_storage_sql` 必须早于任何要存储的模块加载。配置里 `modules_enabled` 数组顺序就是加载顺序——不是字母序、不是依赖图。
3. **联邦 s2s 调通常卡在 DNS / TLS，不是 Prosody**：新人 90% 的"prosody 不工作"实际是 SRV 记录写错或证书链不全。先用 `prosodyctl check` 自检——这命令会从 DNS 一路检查到 TLS 握手。
4. **0.11 → 0.12 配置语法有变**：`VirtualHost` 块的缩进规则改了，老教程照抄会启动失败。看官方升级 note。
5. **flat file 存储并发写差**：默认 internal 后端只适合 < 几百用户。上规模一定换 SQL，不然大量小文件 + flock 让磁盘 IO 爆。
6. **OMEMO（XMPP 的 E2EE）是客户端职责**：Prosody 服务端不存明文也不能解密——但密钥分发、设备列表这些 XEP 实现得正不正确，决定了 E2EE 真不真。这是协议级问题，不是 Prosody bug。

## 适用 vs 不适用场景

**适用**：

- 想**自托管** IM 后端，要跟外网联邦（XMPP/Jabber 网络）
- **学术/研究小群体**（高校实验室、开源社区）私有 chat
- **嵌入式**场景（家用 NAS、单板机跑 IM）
- 学 XMPP 协议时**拿来当参考实现读**——Lua 代码量少、可读性高

**不适用**：

- 想做 Slack 那种**封闭团队聊天** → 用 Mattermost / Rocket.Chat（直接看 [[mattermost]] 对比）
- 想要 Signal 级别**强 E2EE 默认开** → 用 Signal 系（[[signal-server]]）或 Matrix（[[element-web]] 前端）
- 单机要扛**几十万并发** → Lua 单进程撑不住，换 ejabberd（Erlang）或 ejabberd 集群
- 团队**没人懂 Lua** → 写插件 / 读源码 / debug 门槛会比 Go/Java 系后端高

## 历史小故事（可跳过）

- **1999 年**：Jeremie Miller 启动 Jabber 项目，提出"开放 IM 协议"对抗 ICQ/MSN/AIM 的封闭协议。
- **2004 年**：Jabber 协议被 IETF 标准化为 XMPP（RFC 3920/3921，后续 6120/6121）。
- **2008 年**：Matthew Wild 启动 Prosody——主流 XMPP 服务器（ejabberd、Openfire）已经存在，但他想要一个**Lua 写的、读得懂的、嵌入式能跑的**版本。
- **2010s**：Google Talk、Facebook Chat 短暂用过 XMPP 网关然后退出，XMPP 联邦退潮。
- **2020s**：Matrix 协议崛起带回"联邦 IM"概念，Prosody 仍在维护（0.12.x LTS），是学习 XMPP 最易读的服务端实现。

## 学到什么

1. **联邦 vs 中心化是 IM 后端的根本分水岭**——XMPP 走联邦，Signal 走中心化，各有取舍。Prosody 让你看懂联邦那一边长啥样。
2. **Lua + 协程 + 插件**是搭轻量服务的一种成熟模式（Nginx/OpenResty、Redis Module 也是这思路）。单进程协程 = 简单 + 没锁，代价是单核。
3. **配置即代码**比静态 yaml 灵活——但需要团队接受脚本式配置。同一思路也出现在 Hashicorp HCL、Pulumi。
4. **可读的源码**本身是产品价值。10k 行 Lua 让 Prosody 在"想读懂 IM 服务器内部"的人群里赢过更工业的 ejabberd（Erlang，实现工业但读起来陡）。
5. **协议是开放的，实现是分层的**：XMPP 本身只定义 stanza 路由和 JID；具体功能（群聊、归档、推送、E2EE）都拆成 XEP，由插件按需实现。这种"小核心 + 一堆扩展"的范式，跟 IETF 的 RFC + Internet-Draft 一脉相承。

## 学习路径建议

如果你想真把 Prosody 读懂，按这个顺序走：

1. **先懂 XMPP 协议大纲**：知道 stanza 三大类（`<message>` / `<presence>` / `<iq>`）、JID 格式（`alice@host/resource`）、c2s/s2s 概念。RFC 6120 前 30 页够。
2. **装一台跑起来**：Debian/Ubuntu 一行 `apt install prosody`，写最小 `prosody.cfg.lua`，`prosodyctl adduser` 加用户，用 Gajim/Conversations 客户端登入。
3. **读 `core/stanza_router.lua`**：核心 ~500 行，看一条消息怎么从 socket 进来、怎么决定本地投递还是 s2s 转发。这是整个服务器的"心脏"。
4. **照官方教程写 mod_helloworld**：50 行起步，先 hook `message/bare` 打日志，再 hook `presence` 改状态。
5. **挑一个 XEP 看对应 mod_***：比如 XEP-0313（消息归档）对照 `mod_mam.lua`——能看见协议规范怎么落地成 Lua 代码。
6. **自己加一个 storage 后端**或 auth 后端——这是检验是否真懂插件系统的最佳练习。

走完这 6 步，你不仅懂 Prosody，也会**对 XMPP 协议本身的设计哲学**有第一手感受——这比读 100 篇博客都管用。

## 延伸阅读

- 官方文档：[Prosody Documentation](https://prosody.im/doc)（模块列表 + 配置示例齐全）
- 模块开发指南：[Developers' Manual](https://prosody.im/doc/developers/modules)
- XMPP 协议入门：[RFC 6120](https://tools.ietf.org/html/rfc6120) + XEP 列表（[xmpp.org/extensions](https://xmpp.org/extensions/)）
- 对比阅读：[ejabberd](https://github.com/processone/ejabberd)（Erlang 实现，工业级）
- [[signal-server]] —— 中心化私有协议 IM 的反面参照
- [[element-web]] —— Matrix 协议前端，跟 XMPP 同属"联邦 IM"阵营但协议不同
- [[mattermost]] —— 封闭团队聊天后端，第三种 IM 形态

## 关联

- [[signal-server]] —— 同样是 IM 后端，但走中心化 + 私有协议 + 强 E2EE 路线，跟 Prosody 形成"中心化 vs 联邦化"对立。读完两边能看清 IM 后端的两种世界观
- [[element-web]] —— Matrix 协议旗舰客户端，Matrix 跟 XMPP 都是联邦化开放 IM 协议，是直接的协议级竞争。Matrix 比 XMPP 晚 15 年但默认 E2EE
- [[mattermost]] —— 自托管团队聊天后端，但封闭、不联邦，目标是 Slack 替代而非开放协议——画出 IM 后端的另一象限：自托管不等于联邦

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[conversations]] —— Conversations — Android 上把 XMPP 加上 OMEMO 端到端加密的客户端
- [[ejabberd]] —— ejabberd — Erlang 写的电信级 XMPP/MQTT 多协议服务器
- [[jitsi-meet]] —— Jitsi Meet — 开源视频会议的自托管套件
- [[love2d]] —— LÖVE — 用 Lua 写 2D 游戏的轻量框架
