---
title: Mattermost — Slack 的开源自托管替代（Go 服务端 + React 客户端）
来源: 'https://github.com/mattermost/mattermost'
日期: 2026-05-30
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Mattermost 是一个**能在自己机房跑起来的 Slack**。日常类比：Slack 像把公司微信开在别人家服务器，Mattermost 像把同样的微信搬回自家保险柜——长得几乎一样，但数据全在自己手里。

具体形态：

- **服务端**：用 Go 写的单体二进制，启动一个 HTTP/WebSocket 服务，背后接 PostgreSQL（首选）或 MySQL
- **客户端**：网页（React + TypeScript）、桌面（Electron 套壳）、手机（React Native）
- **协议**：自家 REST + WebSocket，不是开放协议（这点跟 Matrix 阵营不一样）

GitHub 上 32k stars，主仓 MIT 协议开源，外加付费的 Enterprise 版。在工程团队里特别流行，因为它跟 GitHub / GitLab / Jira / Jenkins 的 webhook 一接就联起来。

## 为什么重要

不理解 Mattermost，下面这些事都没法解释：

- 为什么有公司宁愿自己运维一个聊天系统，也不用 Slack——**合规和数据主权**是真需求（金融、政府、军工、欧盟 GDPR 严格行业）
- 为什么"开源 Slack 替代"这条赛道有 Mattermost / [[rocket-chat]] / [[element-web]] 三家并存——技术路线不同（Go / Meteor / 联邦协议），各自吃不同的客户
- 为什么 Mattermost 现在不止聊天，还塞进了**事件响应 Playbooks** 和 **看板 Boards**——它在赌"工程团队的协作中心"这个位置
- 怎么把"实时聊天 + 持久消息 + 文件 + 通话"在一个 Go 单体里做出来，并且能横向扩展

## 核心要点

Mattermost 架构可以拆成 **四层**：

1. **存储层**：PostgreSQL/MySQL 存消息、用户、频道、文件元信息；S3 兼容对象存储或本地磁盘存附件；Redis 可选作为缓存和消息总线。

2. **服务层**：Go 单体二进制，处理 REST API（发消息、加好友）、WebSocket（实时推送）、文件上传、搜索（PostgreSQL 全文索引或可选 Elasticsearch）、推送通知（HPNS proxy 转 APNs/FCM）。

3. **客户端层**：webapp（React + Redux）、desktop（Electron）、mobile（React Native）共享一套 REST/WebSocket 协议；webapp 主仓在 `webapp/channels/` 子目录下。

4. **插件层**：服务端插件用 Go 写并编译成 `.so`/RPC 进程，前端插件用 React 写；通过 `plugin.json` 声明能力，能扩展 slash command / 设置面板 / 频道 header / 全屏页面。

附加模块（都在主仓）：

- **Playbooks**：把"线上事件响应"做成可复用的剧本——每次出 P0 自动开频道、按步骤打勾、记录时间线
- **Boards**：吸收了 Focalboard 项目，做成 Trello/Notion 风格的轻量看板
- **Calls**：基于 WebRTC + 自托管 SFU（Selective Forwarding Unit）做语音/视频会议

## 关键架构选择

### Go 单体 vs 微服务

Mattermost 选了**Go 单体**——一个二进制起来就能跑。日常类比：像一个超大瑞士军刀，所有功能内置；不像 Rocket.Chat 那种 Meteor + 一堆 npm 包凑出来的工具盒。

好处是部署简单、性能稳、go routine 天然适合 WebSocket 大并发；代价是代码量大（主仓 server 部分百万行级），新人改一个小功能可能要绕过一堆"上下文耦合"。

横向扩展靠在前面挂 nginx/HAProxy，多个 Mattermost 实例之间通过数据库 + 集群事件总线（基于 PG 的 LISTEN/NOTIFY 或 Redis）同步。这种"无状态实例 + 共享存储"的形态在 Go 后端里很常见，部署比微服务简单一个数量级。

### 数据库选 PostgreSQL

官方主推 PG，MySQL 仍支持但功能落后（比如全文搜索、JSON 字段）。这跟 Rocket.Chat 押 MongoDB 是两条不同的路：

- PostgreSQL：强 schema、事务、能用 SQL 做关联——适合"严肃业务"
- MongoDB（Rocket.Chat）：弱 schema、文档型——适合快速迭代但聚合查询绕

### 不是联邦协议

Matrix（[[element-web]] 用的协议）让"不同服务器的人能互相加好友"。Mattermost 没有：你公司的 Mattermost 和别人公司的 Mattermost 是两个孤岛。这是有意为之——**企业自托管不需要联邦，反而要隔离**。

## 阅读这个仓库的路线

如果你想读源码，建议这个顺序：

1. **`server/cmd/mattermost`**：入口，看启动流程、配置加载、信号处理
2. **`server/channels/api4/`**：REST API 路由，从这里能找到每个 endpoint 对应哪个 handler
3. **`server/channels/app/`**：业务逻辑层，handler 调用 app 层完成实际工作（发消息、建频道）
4. **`server/channels/store/sqlstore/`**：数据访问层，SQL 都在这里
5. **`webapp/channels/src/`**：前端入口，React + Redux，先看 `actions/` 和 `components/`
6. **`server/channels/app/plugin*`**：插件加载和 RPC，理解扩展机制

读 web 客户端时一个常见困惑：很多组件名字叫 `*_v2` / `_view`——这是几次改版留下的层；改新功能尽量用新组件。

## 怎么本地跑起来

最快路径（官方推荐）：

```bash
git clone https://github.com/mattermost/mattermost
cd mattermost/server
make run-server  # 起 PostgreSQL + Mattermost server，端口 8065
# 另一个终端
cd ../webapp && make run  # 前端 dev server
```

需要装好 Go（≥ 1.21）、Node、Docker（用来起 PG 和 minio）。第一次会拉一堆 docker image，慢一点正常。

## 踩过的坑

1. **不要直接改 webapp，要改 `webapp/channels/`**：仓库前两年从分仓合并到 monorepo，老教程里的 `mattermost-webapp` 路径已经失效。

2. **插件 ID 一旦上线不能改**：插件的 `plugin.json` 里 `id` 字段是唯一索引，发布后改 id 等于"换了个新插件"——老用户的设置全丢。

3. **WebSocket 消息有 size 限制**：默认 8MB，发大文件用 REST 上传后通过 WS 推 `file_uploaded` 事件，不要把 base64 文件塞 WS。

4. **Enterprise 功能不在 OSS 主仓**：LDAP / SAML / Compliance Export / 多租户这些功能在闭源仓库，文档会说"available in E10/E20"，OSS 编译不进去。

5. **数据库迁移要用官方工具**：直接 `ALTER TABLE` 加索引可能跟下次官方 migration 冲突；务必走 `mattermost db migrate` 或在 `server/channels/db/migrations/` 加新脚本。

6. **WebSocket 重连要客户端配合**：服务端断开后客户端要重新订阅频道事件——前端封装在 `webapp/channels/src/client/` 里，二次开发自己接 WS 时容易漏。

## 适用 vs 不适用场景

**适用**：

- 公司要自托管的团队聊天，要跟内部 GitLab/Jira 深度集成
- 合规严格行业（金融、政府、医疗）数据不能出本地机房
- 工程团队为主的协作场景——Slash command / Bot / Webhook 玩得很顺

**不适用**：

- 想要"跨公司联邦聊天"——选 [[element-web]] / Matrix
- 想要"零运维 SaaS、加好友就用"——直接用 Slack/飞书/钉钉
- 想要"端到端加密私聊"——Mattermost 默认是服务端可见明文，要 E2EE 看 [[signal-server]] 那套设计

## 学到什么

1. **企业市场不需要花哨的协议**——Slack 体验 + 自托管 + DevOps 集成，就够吃一大块市场
2. **Go 单体在中等复杂度系统里仍是好选择**——部署简单、并发模型友好、性能可预测
3. **聊天系统要能扩展为协作平台**——Mattermost 把 Playbooks/Boards/Calls 都吃进来，是"协作入口"位置之争
4. **开源 + Enterprise 双仓**是这种 B 端开源公司的常见商业模式——主仓 MIT 拉社区，Enterprise 卖企业功能
5. **架构选型要算清楚耦合代价**——单体之于微服务、PostgreSQL 之于 MongoDB、中心化之于联邦，每一个选择都换来一组好处和一组限制；没有"对的架构"，只有"贴合定位的架构"

## 延伸阅读

- 官方文档：[Mattermost Developer Docs](https://developers.mattermost.com/) — 插件、API、贡献指南
- 架构概览：[mattermost/mattermost README](https://github.com/mattermost/mattermost) 里的 architecture 章节
- [[rocket-chat]] —— 同赛道竞品（Meteor + MongoDB 路线），适合横向对比
- [[element-web]] —— 联邦协议路线（Matrix），跟 Mattermost 中心化思路对照
- [[signal-server]] —— 端到端加密路线，思考"服务端能不能看消息"这个根本问题

## 关联

- [[rocket-chat]] —— 同样定位"开源 Slack 替代"，技术栈完全不同（Meteor/Node vs Go），值得对比
- [[element-web]] —— Matrix 协议旗舰客户端，跟 Mattermost 是"联邦 vs 中心化"两条路
- [[signal-server]] —— 端到端加密 IM 后端，思考"消息能不能被服务端看"的另一极

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigbluebutton]] —— BigBlueButton — 教育向开源 Web 会议平台（HTML5 + WebRTC + 白板）
- [[ejabberd]] —— ejabberd — Erlang 写的电信级 XMPP/MQTT 多协议服务器
- [[element-web]] —— Element Web — Matrix 协议旗舰 web 客户端（React + matrix-js-sdk）
- [[openmeetings]] —— Apache OpenMeetings — 单 Java 进程跑完整 Web 会议系统
- [[prosody]] —— Prosody — Lua 写的轻量 XMPP 服务器（嵌入式部署 + 模块化插件）
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[zulip]] —— Zulip — 强制 topic 的开源团队聊天（Django + Tornado 长轮询）

