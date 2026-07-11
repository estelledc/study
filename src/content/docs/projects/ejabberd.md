---
title: ejabberd — Erlang 写的电信级 XMPP/MQTT 多协议服务器
来源: 'https://github.com/processone/ejabberd'
日期: 2026-05-30
分类: communication
难度: 高级
---

## 是什么

ejabberd 是一个**用 Erlang 写的工业级即时通信服务器**，2002 年发布，至今活了 24 年。它以 **XMPP** 为核心，并可扩展 **MQTT / SIP**；近年还提供 **Matrix 网关/桥接**（不是对等的第四套原生协议栈）。单机常能撑数十万并发连接，小集群可到百万级。

三个关键词拆开：

- **XMPP**：1999 年开放的联邦化 IM 协议（前身 Jabber）。`alice@a.com` 直接给 `bob@b.com` 发消息，跟邮件 SMTP 一样不依赖任何中央公司。
- **Erlang/OTP**：爱立信 1986 年为电话交换机发明的语言 + 框架，面向"7×24 不停机 + 海量并发"。爱立信 AXD301 交换机曾用同一技术栈做到约 9 个 9 可用性；ejabberd 继承的是这套容错思路，不是把交换机数字直接贴到自己身上。
- **服务器**：负责接消息、转发到别家服务器、托管群聊（MUC）、推送离线消息、维护好友列表。

日常类比：如果 [[prosody]] 是用一个员工 + 一台旧电脑开的小邮局，ejabberd 就是**国家邮政总局**——它要管几百万封信、几千个分拣点、十几条专线，而且**永远不能停**。

## 为什么重要

不理解 ejabberd，下面这些事讲不清：

- 为什么 **WhatsApp 早期能用 50 个工程师撑 9 亿用户**——核心后端就是基于 ejabberd + FreeBSD + Erlang 这一路线
- 为什么"电信级稳定性"在工程上是真实的：BEAM 虚拟机 + actor 模型 + 监督树（supervisor tree）让单个 bug 不会拖垮整个系统
- 为什么联邦化 IM 不是新概念——XMPP 玩了 20 年，Matrix / Mastodon 这波只是换了协议
- 为什么大型电信 / 银行内部 chat，以及部分游戏后端（公开案例里常提到任天堂、暴雪一类）仍会选 ejabberd 路线

## 核心要点

ejabberd 的设计可以拆成 **四个支柱**：

1. **BEAM 虚拟机的轻量进程**：每个连上来的用户在 BEAM 里就是一个独立的 Erlang 进程（不是 OS 线程，是协程级别，开销 KB 量级）。100 万用户 = 100 万进程，调度器自己管。日常类比：每个客人来了配一个专属服务员，但服务员特别便宜（一个 KB）。

2. **OTP 监督树**：进程崩溃了怎么办？OTP 的答案是"让它崩，监督者自动重启"——叫 **let it crash**。监督树是一棵"谁挂了谁负责重启"的层级关系图，根节点宕机的概率极低。

3. **模块化协议栈**：核心很小，所有功能（群聊、离线消息、推送、archive、PubSub）都是**模块**（`mod_muc` / `mod_offline` / `mod_pubsub` / `mod_mam` ...）。配置文件里挑要哪些。

4. **多存储后端**：Mnesia（Erlang 自带的分布式数据库，集群里自动同步）/ PostgreSQL / MySQL / Redis / Riak 都行。小集群用 Mnesia 不需要外部 DB；大集群上 SQL 扛容量。

## 实践案例

### 案例 1：最小可跟做配置

```yaml
# ejabberd.yml 精简片段（本地玩具）
hosts: ["localhost"]
listen:
  - port: 5222
    module: ejabberd_c2s
modules:
  mod_roster: {}
  mod_offline: {}
  mod_muc: { host: "conference.@HOST@" }
```

步骤：① 只开 c2s + 花名册/离线/群聊三个模块；② 用官方容器或包启动后连 `5222`；③ 默认二三十个模块先全关，避免小机器白吃几百 MB。这是比读 OTP 源码更适合上手的入口。

### 案例 2：每个用户一个 BEAM 进程

```erlang
%% 用户连上 → spawn 一个 c2s 进程当"专属服务员"
{ok, Pid} = ejabberd_c2s:start({SockMod, Socket}, Opts),
%% 发消息 = 给目标用户的 Pid 发 Erlang message；掉线 = Pid 退出回收
```

进程之间靠消息传递、无共享内存。单台 32GB 机器可开上百万这类轻量进程——这是 actor 模型落到 IM 上的直观画面。

### 案例 3：let-it-crash 的监督树

```
ejabberd_sup（根监督者）
  ├── ejabberd_listener_sup → 监听端口的进程
  ├── ejabberd_c2s_sup → 每个用户连接 1 个子进程
  ├── mod_muc_sup → 每个聊天室 1 个子进程
  └── mod_offline_sup → 离线消息存储进程
```

某个 `c2s` 进程因畸形包崩了，监督者捕获 EXIT、记日志、按策略**自动重启**——其他用户无感。这是把 AXD301 那套容错哲学落到 IM 上的工程基础。

### 案例 4：跟 prosody / signal-server / mattermost 的差别

同一需求"开一个 5 万人在线的开源 IM 后端"：

- **[[prosody]]**：单机 8GB 够；Lua 模块好写；无内置高可用
- **ejabberd**：3 节点 + Mnesia/SQL；OTP 监督树兜底；工业默认选项
- **[[signal-server]]**：要 Redis + DynamoDB + 推送，门槛高；优势是端到端加密
- **[[mattermost]]**：产品不是协议——频道型 chat，不支持联邦

## 踩过的坑

1. **Erlang 学习曲线陡**：语法跟主流 C-family 语言完全不同（小写变量是 atom、大写才是变量）；actor 思维需要时间适应。新人想直接读 ejabberd 源码会被 OTP behaviour（gen_server / gen_fsm）劝退。

2. **默认配置对小规模过重**：`ejabberd.yml` 默认开二三十个模块，小团队部署只用 5-6 个就够。不裁剪的话内存白吃几百 MB。

3. **集群拓扑要前期想清楚**：Mnesia 复制（每节点一份全量）适合 10 节点内、读多写少；上 50 节点 / 高写入必须切 SQL 共享后端，否则同步延迟把集群拖垮。

4. **XMPP 扩展（XEP）数百个，挑哪些是技术活**：MAM（消息归档）、Carbons（多端同步）、Push（移动推送）、OMEMO（端到端加密）每个都是大坑，挑错组合会导致客户端兼容性碎成渣。

## 适用 vs 不适用场景

**适用**：

- 大型 IM 后端（电信、银行、教育、游戏）：常见是 **3–10 节点**、每节点数十 GB 内存、SQL 共享后端时冲向百万在线
- 需要联邦化（不同公司服务器互通）——XMPP 原生支持
- 需要多协议（XMPP + MQTT 给 IoT，必要时再加 Matrix 网关）——一台进程树里挂模块即可
- 需要"崩了自己重启"的高可用——OTP 监督树

**不适用**：

- 个人 / 小团队自托管（<1 万在线）→ 用 [[prosody]]，门槛低一个数量级
- 端到端加密为第一目标 → 用 [[signal-server]]
- 团队协作产品（频道、文件、看板） → 用 [[mattermost]]；ejabberd 是协议服务器，不是产品

## 历史小故事（可跳过）

- **1986**：爱立信 Joe Armstrong 团队为电话交换机发明 Erlang
- **1996**：Erlang 开源，OTP 框架定型
- **1998**：AXD301 ATM 交换机用 Erlang，公开案例约 9 个 9 可用性
- **2002**：Alexey Shchepin 发布 ejabberd，把电信级栈引入 IM
- **2009**：WhatsApp 后端基于 ejabberd 改造起步，后来高度定制
- **2014**：Facebook 收购 WhatsApp，Erlang 路线被重新审视
- **2024**：ejabberd 仍活跃，补 Matrix 桥接、MQTT5 等模块

## 学到什么

1. **"语言选型"在 IM 后端是决定性的**——Erlang/OTP 几乎是为这个场景量身定做。Java / Go / Rust 能写 IM 但都不如 BEAM 自然
2. **let-it-crash 是反直觉的高可用哲学**：不是"防止崩溃"，而是"承认必崩、设计成崩了不影响整体"
3. **24 年长寿的开源项目共同点**：模块化架构 + 协议而非产品 + 后端可换。ejabberd 三条都占
4. **WhatsApp 神话拆穿**：50 工程师撑 9 亿用户不是天才团队，是选对了工具栈

## 延伸阅读

- 官方文档：[ejabberd Docs](https://docs.ejabberd.im/)
- WhatsApp Erlang 案例：[Rick Reed: Scaling to Millions](https://www.erlang-factory.com/upload/presentations/558/efsf2012-whatsapp-scaling.pdf)
- 论文级参考：[[erlang-otp]] —— 容错并发系统设计的母论文
- [[milner-pi-calculus]] —— Actor 模型的理论根基
- [[prosody]] —— 同协议轻量版，对照学习

## 关联

- [[prosody]] —— 同样实现 XMPP，Lua 写的轻量版；ejabberd 是工业版
- [[signal-server]] —— 中心化 + 端到端加密路线，与联邦化思路相反
- [[mattermost]] —— Go 写的团队 chat 产品；定位是上下游而非竞品
- [[erlang-otp]] —— ejabberd 的根技术栈，理解它必须先理解 OTP
- [[milner-pi-calculus]] —— Actor / 进程消息传递的理论源头
- [[kafka]] —— 同属高并发消息路径，但 Kafka 是日志总线不是在线会话服务器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
