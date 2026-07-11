---
title: Zulip — 强制 topic 的开源团队聊天（Django + Tornado 长轮询）
来源: 'https://github.com/zulip/zulip'
日期: 2026-05-30
分类: communication
难度: 中级
---

## 是什么

Zulip 是**开源团队聊天平台**，最大的特色一句话：每条消息必须挂在某个 **stream（频道）下的某个 topic（话题）**。日常类比：传统群聊像一条没分段的长河，所有人都往里丢消息，水冲水；Zulip 像把河分成一格格的"邮件主题盒"，每条消息进盒前必须先贴标签，事后想翻只看那个盒就够。

技术形态（先记柜台类比，再对号入座）：

- **办业务的柜台** = **Django**（Python 主业务：发消息、权限、存库）
- **门口等通知的窗口** = **Tornado**（长连接事件推送；客户端挂着等新消息）
- **柜台和窗口之间的传话筒** = **RabbitMQ**；**账本** = PostgreSQL；旁边还有 memcached / Redis 做缓存
- **前端**：TypeScript + Handlebars 模板（历史上重 jQuery，正在迁移）
- **移动端**：老 Zulip Mobile 用 React Native；下一代 zulip-flutter 用 Flutter

约 2 万+ GitHub stars（2026 年量级）、Apache-2.0。代表用户包括 **Rust 语言团队**（rust-lang.zulipchat.com）、**Lean prover 社区**、Recurse Center，以及大量学术 / 开源项目——共同点是"远程、异步、多话题并行"。

## 为什么重要

不理解 Zulip，下面这些事都没法解释：

- 为什么开源 Slack 替代赛道里 Zulip / [[mattermost]] / [[rocket-chat]] / [[element-web]] 同时活着——它们押的是不同的产品定位（话题 UX / Go 合规 / omnichannel 客服 / 联邦协议）
- 为什么 Rust 团队这种"全员异步、全球时区"的项目放弃 IRC 和 Discord 选 Zulip——topic 强制模型让今天写代码的人能直接读懂上周的讨论，不用 scroll 三千条
- 为什么 Zulip 选了 Django + Tornado 双进程而不是 Node.js 或 Go 单体——2012 年那个时间点 Python 生态成熟、长连接交给 Tornado 单独扛是当时的主流取舍
- 怎么把"实时推送 + 历史可搜 + 话题分线"用 Python 做出来并支撑数千用户的开源社区

## 核心要点

Zulip 跟其他开源 IM 的差异可以拆成 **三层**：

1. **数据模型层 — streams + topics 双层**：消息表里每条消息有 `stream_id` 和 `topic`（字符串）两个字段。topic 不预创建、不预声明，发消息时填一个就有；同 stream 下同 topic 的消息天然成线程。类比：Slack 默认是平铺大厅、thread 是事后补丁；Zulip 默认就是"先贴主题再说话"。

2. **实时推送层 — Tornado 事件队列**：业务逻辑跑 Django，长连接跑 Tornado，两个进程之间走 RabbitMQ。客户端访问 `/json/register` 拿一个 `queue_id`，再 long-poll `/json/events?queue_id=...` 拿增量事件。类比：柜台办完事，传话筒喊门口窗口，窗口再通知所有排队的人。

3. **客户端层 — 富客户端 + 本地状态机**：浏览器/桌面/移动端都从 register 拉一个完整初始状态（消息、用户、频道、未读），然后只用事件流增量更新。类比：先复印整本通讯录，之后只收"某页改了"的便条——跟 [[element-web]] 用 matrix-js-sdk 的思路一致，只是 Zulip 不联邦、协议是自家。

## 实践案例

### 案例 1：发一条消息后端发生了什么

```
用户在 web 端按回车
  → POST /json/messages  (stream=python-help, topic=asyncio bug, content=...)
  → Django 视图 zerver/views/message_send.py（HTTP 入口）
  → check_message() 校验权限
  → do_send_messages()（在 actions 层）写 PostgreSQL，生成 message_id
  → 通过 RabbitMQ 发布 event 到 user_event_queue
  → Tornado event_queue.py 收到，分发给所有订阅这个 stream 的在线 queue
  → 客户端的 long-poll 返回，UI 渲染新消息
```

**逐部分解释**：`views/message_send.py` 是 HTTP 入口；真正写库与发事件在 `zerver/actions/message_send.py`；`zerver/tornado/event_queue.py` 维护内存里"每个客户端一个 queue"，决定哪个事件该推给谁——这是实时链路的心脏。

### 案例 2：30 分钟自建一台（建议 ≥4GB 内存）

```bash
git clone https://github.com/zulip/zulip
cd zulip
./tools/provision        # 在 Vagrant/Docker 里装好 PostgreSQL/RabbitMQ/memcached
./tools/run-dev          # 同时拉起 Django（柜台）和 Tornado（窗口）
# 浏览器打开 http://localhost:9991
```

**逐步解释**：

1. `provision`：装齐依赖；机器内存/磁盘不够时最常在这步失败（先给 ≥4GB）
2. `run-dev`：一次起双进程，不必手开两个终端
3. 浏览器打开 `9991`：应看到登录/注册页；生产部署用 `./scripts/setup/install`（nginx + supervisor 一整套）

### 案例 3：topic 模型在异步团队怎么用

Rust 团队把 stream 当大领域（`#t-compiler`、`#t-types`），topic 当具体话题（`weekly meeting 2026-05-30`、`PR #12345 review`）。一个新成员两年后想读"types 团队怎么决定加 GAT"，只需进 `#t-types` 搜对应 topic，**不用 scroll 三年时间线**。这是 Slack/Mattermost/Rocket.Chat 都做不到的——它们的 thread 是事后补丁，不强制。

客户端侧配套（long polling 标准玩法）：

```http
POST /json/register
→ { queue_id: "abc", last_event_id: 0, streams: [...], users: [...], unread: {...} }

GET  /json/events?queue_id=abc&last_event_id=0
→ 服务器挂着不返回，直到有新事件
→ { events: [{type: "message", message: {...}, id: 1}], ... }
```

比 WebSocket 简单、对代理/防火墙友好；代价是每次事件一次 HTTP，Tornado 用单进程异步 IO 把代价压低。客户端拿到事件后立刻再发下一次 GET，循环往复。

## 踩过的坑

1. **双进程开发部署较重**：本地必须同时有 Django + Tornado + RabbitMQ + Postgres + memcached + Redis；比 Mattermost 的"一个 Go 二进制 + 一个 Postgres"重得多，新人 provision 失败常见原因是 Vagrant/Docker 资源不够（先给 ≥4GB）。
2. **topic 命名靠团队自律**：模型强制选 topic，但**不强制**好的 topic 名；满屏 `general`/`chat`/`misc` 时强制模型反而变成噪声放大器——Rust 团队有专门 wiki 教命名。
3. **无端到端加密，无联邦**：服务器能看所有明文消息；需要 E2EE 或跨组织联邦必须看 [[element-web]] / Matrix，不是 Zulip 的赛道。
4. **搜索与升级偏脆**：全文靠 Postgres tsvector（中文分词、复杂排名有限）；前端还有 jQuery/Handlebars/TS 混搭包袱；in-place 升级易卡在 migrate / Tornado queue schema，自定义部署很容易踩进死胡同。

## 适用 vs 不适用场景

**适用**：

- 学术社区 / 开源项目 / 远程团队——异步、多话题并行、新人需要回溯历史
- 已有 Python 团队要自托管，能接受 Django + Tornado 双进程（开发机建议 ≥4GB 内存）
- 想要"邮件主题 + 即时聊天"的混合体验

**不适用**：

- 需要联邦 / 跨组织互通 → 用 [[element-web]] + Matrix 协议
- 需要 omnichannel 客服（接 WhatsApp、Twitter、邮件）→ 用 [[rocket-chat]]
- 需要 Go 单体 + 企业合规审计 → 用 [[mattermost]]
- 团队全员同步在线、几乎没异步需求 → Slack/Mattermost 更轻，topic 强制反而是负担
- 高安全场景必须 E2EE → libsignal / Matrix（Zulip 服务器看明文）

## 历史小故事（可跳过）

- **2012**：Kandra Labs 做企业聊天产品，坚持"每条消息必须有 topic"——当时主流还是 IRC/Campfire 式平铺时间线
- **2013–2014**：开源并迁到 Apache-2.0；Tim Abbott 把 Django 业务与 Tornado 长连接拆成双进程，成为沿用至今的骨架
- **2010s 末**：Rust / Lean / 学术社区大量迁入；"异步可回溯"成为卖点，而不是跟 Slack 比表情包速度
- **2020s**：web 端从 jQuery 迁 TypeScript；移动端推进 Flutter（zulip-flutter），协议仍是自家、不走联邦

## 学到什么

1. **数据模型会塑造文化**：Zulip 把"必须选 topic"写进表结构，用户行为天然向异步靠；Slack 把 thread 做成可选按钮，结果多数人不点——**默认值就是文化**。
2. **双进程拆分是有用的旧技巧**：Django 同步、Tornado 异步长连，2012 年的方案在 2026 年依然能撑大型开源社区。不一定要 Go 重写一切。
3. **开源 IM 的差异不是 UI 是定位**：Mattermost 卖合规、Rocket.Chat 卖客服、Element 卖联邦、Zulip 卖话题 UX——**同一赛道四个项目共存**是开源生态的正常状态。
4. **小众 UX 也能赢精英用户**：Rust / Lean 接受陡学习曲线，换来"两年后还能读懂讨论"——**为正确的人而不是所有人优化**。
5. **Long polling 在 2026 仍然能打**：人们容易觉得 WebSocket 才是现代答案；简单可靠往往胜过时髦协议，前提是你知道权衡在哪（代理友好 vs 每次事件一次 HTTP）。

## 延伸阅读

- 官方文档（含完整架构说明）：[zulip.readthedocs.io](https://zulip.readthedocs.io/)
- "Why Zulip" 官方对比页：[zulip.com/why-zulip](https://zulip.com/why-zulip/)（最直接的产品定位陈述）
- Tim Abbott, "Zulip: Open source team chat that makes you more productive", PyCon US 2017（topic 模型讲解）
- Rust 团队的 Zulip 使用规范：[rust-lang.github.io/rust-forge](https://rust-lang.github.io/rust-forge/)（community → Zulip）
- 源码导读起点：`zerver/tornado/event_queue.py`（实时推送）、`zerver/views/message_send.py`（HTTP 入口）、`zerver/actions/message_send.py`（写库与发事件）

## 关联

- [[mattermost]] —— 开源 IM 同赛道 Go 单体路线，卖企业合规，没强制 topic
- [[rocket-chat]] —— 开源 IM 同赛道 Meteor + MongoDB 路线，卖 omnichannel 客服
- [[element-web]] —— 开源 IM 同赛道 Matrix 协议路线，卖联邦 + E2EE，是协议不是产品
- [[django]] —— Zulip 服务端主框架；Zulip 是 Django 大型生产项目的样板
- [[postgresql]] —— Zulip 主存储；消息表 + 全文搜索都靠 Postgres
- [[react-native]] —— 老 Zulip Mobile 的实现，正在被 Flutter 版替代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
