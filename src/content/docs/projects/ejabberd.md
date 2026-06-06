---
title: ejabberd — Erlang 写的电信级 XMPP/MQTT 多协议服务器
来源: 'https://github.com/processone/ejabberd'
日期: 2026-05-30
子分类: 实时通信
分类: 通信
难度: 高级
provenance: pipeline-v3
---

## 是什么

ejabberd 是一个**用 Erlang 写的工业级即时通信服务器**，2002 年发布，至今活了 24 年。它同时支持 **XMPP / MQTT / SIP / Matrix** 四种协议，单台机器能撑数十万并发连接，集群轻松百万+。

三个关键词拆开：

- **XMPP**：1999 年开放的联邦化 IM 协议（前身 Jabber）。`alice@a.com` 直接给 `bob@b.com` 发消息，跟邮件 SMTP 一样不依赖任何中央公司。
- **Erlang/OTP**：爱立信 1986 年为电话交换机发明的语言 + 框架。专门为"7×24 小时不停机 + 海量并发"设计——9 个 9 的可用性（每年宕机不超过 30 秒）就是它的招牌。
- **服务器**：负责接消息、转发到别家服务器、托管群聊（MUC）、推送离线消息、维护好友列表。

日常类比：如果 [[prosody]] 是用一个员工 + 一台旧电脑开的小邮局，ejabberd 就是**国家邮政总局**——它要管几百万封信、几千个分拣点、十几条专线，而且**永远不能停**。

## 为什么重要

不理解 ejabberd，下面这些事讲不清：

- 为什么 **WhatsApp 早期能用 50 个工程师撑 9 亿用户**——核心后端就是基于 ejabberd + FreeBSD + Erlang 这一路线
- 为什么"电信级稳定性"在工程上是真实的：BEAM 虚拟机 + actor 模型 + 监督树（supervisor tree）让单个 bug 不会拖垮整个系统
- 为什么联邦化 IM 不是新概念——XMPP 玩了 20 年，Matrix / Mastodon 这波只是换了协议
- 为什么大型电信运营商、银行内部 chat、Nintendo / 暴雪游戏 backend 仍然在用 ejabberd

## 核心要点

ejabberd 的设计可以拆成 **四个支柱**：

1. **BEAM 虚拟机的轻量进程**：每个连上来的用户在 BEAM 里就是一个独立的 Erlang 进程（不是 OS 线程，是协程级别，开销 KB 量级）。100 万用户 = 100 万进程，调度器自己管。日常类比：每个客人来了配一个专属服务员，但服务员特别便宜（一个 KB）。

2. **OTP 监督树**：进程崩溃了怎么办？OTP 的答案是"让它崩，监督者自动重启"——叫 **let it crash**。监督树是一棵"谁挂了谁负责重启"的层级关系图，根节点宕机的概率极低。

3. **模块化协议栈**：核心很小，所有功能（群聊、离线消息、推送、archive、PubSub）都是**模块**（`mod_muc` / `mod_offline` / `mod_pubsub` / `mod_mam` ...）。配置文件里挑要哪些。

4. **多存储后端**：Mnesia（Erlang 自带的分布式数据库，集群里自动同步）/ PostgreSQL / MySQL / Redis / Riak 都行。小集群用 Mnesia 不需要外部 DB；大集群上 SQL 扛容量。

## 一行 Erlang 简史（理解 ejabberd 必须先有的背景）

- **1986**：爱立信 Joe Armstrong 团队为电话交换机发明 Erlang——电话交换的核心需求是"百万通呼叫并发 + 永不停机"，这正好预言了 IM 服务器的需求
- **1996**：Erlang 开源，OTP（Open Telecom Platform）框架定型
- **1998**：爱立信 AXD301 ATM 交换机用 Erlang 写，达到 9 个 9 可用性（每年宕机 < 30 秒）
- **2002**：Alexey Shchepin 用 Erlang 实现 ejabberd，把电信级技术栈引入 IM 领域
- **2009**：WhatsApp 诞生，后端基于 ejabberd 改造，最终 50 工程师撑 9 亿用户
- **2014**：Facebook 收购 WhatsApp 190 亿美金，业界开始重新审视 Erlang
- **2024**：ejabberd 仍在活跃开发，新增 Matrix 桥接、MQTT5 支持

## 实践案例

### 案例 1：BEAM 进程模型为什么适合 IM

```erlang
%% 一个用户连上来，spawn 一个进程
{ok, Pid} = ejabberd_c2s:start({SockMod, Socket}, Opts),
%% Pid 现在是这个用户的"服务员"
%% 用户发消息 → Pid 收到 message，路由给目标用户的 Pid
%% 用户掉线 → Pid 自然死亡，资源回收
```

每个用户 = 一个 Pid，进程之间靠**消息传递**，没有共享内存。这是 actor 模型，跟 [[prosody]] 用 Lua 协程是同一思想，但 BEAM 的进程更轻、更隔离，单台 32GB 机器可以开 200 万个。

### 案例 2：let-it-crash 的监督树

```
ejabberd_sup（根监督者）
  ├── ejabberd_listener_sup → 监听端口的进程
  ├── ejabberd_c2s_sup → 每个用户连接 1 个子进程
  ├── mod_muc_sup → 每个聊天室 1 个子进程
  └── mod_offline_sup → 离线消息存储进程
```

某个 `c2s` 进程因为客户端发了畸形包崩了，监督者捕获 EXIT 信号、记录日志、按策略**自动重启**——其他用户毫无感知。这是 ejabberd 9 个 9 可用性的工程基础。

### 案例 3：模块化的扩展点

写一个"消息撤回"功能，新增一个模块：

```erlang
-module(mod_recall).
-behaviour(gen_mod).
-export([start/2, stop/1, on_message/3]).

start(Host, _Opts) ->
    ejabberd_hooks:add(user_send_packet, Host, ?MODULE, on_message, 50).

on_message(Packet, _C2SState, _From) ->
    %% 检查是不是撤回包，处理后返回新 Packet
    Packet.
```

挂上 hook 就能拦截所有消息。整个生态 70+ 模块都是这套路子——这是为什么 ejabberd 能同时支持 XMPP/MQTT/SIP，新协议本质是新模块。

### 案例 4：跟 prosody / signal-server / mattermost 的真实差别

把同一个需求"开一个 5 万人在线的开源 IM 后端"放在四个项目上：

- **[[prosody]]**：单机 8GB 内存够；写两个 Lua 模块即可；缺点是没有内置高可用
- **ejabberd**：3 节点集群，Mnesia 同步状态；OTP 监督树兜底崩溃；标准答案
- **[[signal-server]]**：要自建 Redis + DynamoDB + 推送服务，门槛高 10 倍；优势是端到端加密
- **[[mattermost]]**：本质是产品不是协议——只能开"频道型"chat，不支持联邦

## 踩过的坑

1. **Erlang 学习曲线陡**：语法跟主流 C-family 语言完全不同（小写变量是 atom、大写才是变量）；actor 思维需要时间适应。新人想直接读 ejabberd 源码会被 OTP behaviour（gen_server / gen_fsm）劝退。

2. **默认配置对小规模过重**：`ejabberd.yml` 默认开二三十个模块，小团队部署只用 5-6 个就够。不裁剪的话内存白吃几百 MB。

3. **集群拓扑要前期想清楚**：Mnesia 复制（每节点一份全量）适合 10 节点内、读多写少；上 50 节点 / 高写入必须切 SQL 共享后端，否则同步延迟把集群拖垮。

4. **XMPP 扩展（XEP）数百个，挑哪些是技术活**：MAM（消息归档）、Carbons（多端同步）、Push（移动推送）、OMEMO（端到端加密）每个都是大坑，挑错组合会导致客户端兼容性碎成渣。

## 适用 vs 不适用场景

**适用**：

- 大型 IM 后端（电信、银行、教育、游戏）——百万并发是 ejabberd 的舒适区
- 需要联邦化（不同公司服务器互通）——XMPP 原生支持
- 需要多协议（同时跑 XMPP + MQTT 给 IoT）——一台 ejabberd 全包
- 需要"让它崩了自己重启"的高可用——OTP 监督树

**不适用**：

- 个人 / 小团队自托管 → 用 [[prosody]]，门槛低 10 倍
- 端到端加密为第一目标 → 用 [[signal-server]]，协议本身就考虑加密
- 团队协作产品（频道、文件、看板） → 用 [[mattermost]]，ejabberd 只是协议服务器，不是产品

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
- [[signal-server]] —— 中心化 + 端到端加密路线，与 ejabberd 联邦化思路完全相反
- [[mattermost]] —— Go 写的团队 chat 产品；ejabberd 是协议服务器，定位上是上下游
- [[erlang-otp]] —— ejabberd 的根技术栈，理解它必须先理解 OTP
- [[milner-pi-calculus]] —— Actor 模型 / 进程消息传递的理论源头
