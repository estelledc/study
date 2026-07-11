---
title: Mattermost — Slack 的开源自托管替代（Go 服务端 + React 客户端）
来源: 'https://github.com/mattermost/mattermost'
日期: 2026-05-30
分类: communication
难度: 中级
---

## 是什么

Mattermost 是一个**能在自己机房跑起来的 Slack**。日常类比：Slack 像把公司微信开在别人家服务器，Mattermost 像把同样的微信搬回自家保险柜——长得几乎一样，但数据全在自己手里。

具体形态：

- **服务端**：用 Go 写的单体二进制，启动一个 HTTP/WebSocket 服务，背后接 PostgreSQL（首选）或 MySQL
- **客户端**：网页（React + TypeScript）、桌面（Electron 套壳）、手机（React Native）
- **协议**：自家 REST + WebSocket，不是开放协议（这点跟 Matrix 阵营不一样）

GitHub 上约 3 万+ stars，主仓 MIT 协议开源，外加付费的 Enterprise 版。在工程团队里特别流行，因为它跟 GitHub / GitLab / Jira / Jenkins 的 webhook 一接就联起来。

## 为什么重要

不理解 Mattermost，下面这些事都没法解释：

- 为什么有公司宁愿自己运维一个聊天系统，也不用 Slack——**合规和数据主权**是真需求（金融、政府、军工、欧盟 GDPR 严格行业）
- 为什么"开源 Slack 替代"这条赛道有 Mattermost / [[rocket-chat]] / [[element-web]] 三家并存——技术路线不同（Go / Meteor / 联邦协议），各自吃不同的客户
- 为什么 Mattermost 现在不止聊天，还塞进了**事件响应 Playbooks** 和 **看板 Boards**——它在赌"工程团队的协作中心"这个位置
- 怎么把"实时聊天 + 持久消息 + 文件 + 通话"在一个 Go 单体里做出来，并且能横向扩展

## 核心要点

1. **四层架构（瑞士军刀单体）**：存储层（PostgreSQL/MySQL 存消息与元信息，S3/本地盘存附件，可选 Redis 做缓存）→ 服务层（Go 单体处理 REST、WebSocket、全文搜索、推送通知）→ 客户端层（webapp/desktop/mobile 共享同一套协议）→ 插件层（Go `.so`/RPC + React 前端插件）。日常类比：像一把超大瑞士军刀，所有功能内置，部署比微服务简单一个数量级。

2. **无状态实例 + 共享存储横向扩展**：前面挂 nginx/HAProxy，多实例之间用数据库 + 集群事件总线（PG LISTEN/NOTIFY 或 Redis）同步。类比：多个收银台共用一个仓库——柜台可加，库存只有一份。官方主推 PostgreSQL；MySQL 仍支持但全文搜索等能力落后。

3. **有意不做联邦**：Matrix（[[element-web]]）让不同服务器互加好友；Mattermost 公司与公司是孤岛。企业自托管要的是隔离，不是联邦。附加模块 Playbooks（事件剧本）、Boards（看板，吸收 Focalboard）、Calls（WebRTC + 自托管 SFU）都在主仓，把聊天往"协作中心"推。

## 实践案例

### 案例 1：本地把服务端和前端跑起来

```bash
git clone https://github.com/mattermost/mattermost
cd mattermost/server
make run-server   # Docker 起 PG + Mattermost，端口 8065
# 另一个终端
cd ../webapp && make run
```

**逐部分解释**：

- `make run-server`：官方推荐路径，用 Docker 拉 PostgreSQL/minio，再编译启动 Go 服务端
- 需要 Go（≥ 1.21）、Node、Docker；第一次拉镜像会慢，属正常
- 浏览器打开 `http://localhost:8065` 完成首次管理员注册，即可建 team / channel
- 生产部署通常前面再挂反向代理，并按官方文档配置 `config.json` / 环境变量

### 案例 2：从源码摸清"发一条消息"的调用链

读源码建议顺序：

1. `server/cmd/mattermost` — 入口、配置加载、信号处理
2. `server/channels/api4/` — REST 路由，每个 endpoint 对应 handler
3. `server/channels/app/` — 业务逻辑（发消息、建频道）
4. `server/channels/store/sqlstore/` — SQL 都在这里
5. `webapp/channels/src/` — React + Redux，先看 `actions/` 与 `components/`

**逐部分解释**：

- 发消息：HTTP handler 在 `api4/`，真正写库在 `app/`，SQL 在 `sqlstore/`
- 实时推送走 WebSocket；大文件用 REST 上传，再经 WS 推 `file_uploaded` 事件（默认 WS 约 8MB 上限）
- 前端主仓在 `webapp/channels/`（monorepo 合并后路径）；改 UI 别再找已失效的 `mattermost-webapp` 仓
- 组件名里常见 `*_v2` / `_view`——几次改版留下的层，新功能尽量用新组件

### 案例 3：用 slash command 插件扩展机器人

服务端插件用 Go 编译成 `.so`/RPC 进程，前端插件用 React；通过 `plugin.json` 声明 slash command / 设置面板 / 频道 header / 全屏页面等能力。

**逐部分解释**：

- `plugin.json` 的 `id` 是唯一索引——上线后改 id 等于换新插件，老用户设置全丢
- 工程团队常用 webhook + slash command 接 GitLab/Jira/Jenkins，把聊天变成协作入口
- Enterprise 功能（LDAP/SAML/Compliance Export/多租户）在闭源仓，OSS 编译进不去；文档写 E10/E20 的能力开源没有

## 踩过的坑

1. **不要直接改 webapp，要改 `webapp/channels/`**：分仓合并到 monorepo 后，老教程路径已失效。
2. **插件 ID 一旦上线不能改**：`plugin.json` 的 `id` 是唯一索引，改了等于新插件。
3. **WebSocket 消息有 size 限制**：默认约 8MB，大文件走 REST 上传，别塞 base64 进 WS。
4. **Enterprise 功能不在 OSS 主仓**：文档写 E10/E20 的能力，开源编译没有。
5. **数据库迁移要用官方工具**：直接 `ALTER TABLE` 可能和下次官方 migration 冲突；走 `mattermost db migrate` 或在 `server/channels/db/migrations/` 加脚本。
6. **WebSocket 重连要客户端配合**：断线后需重新订阅频道事件，二次开发自接 WS 时容易漏。

## 适用 vs 不适用场景

**适用**：

- 公司要自托管的团队聊天，要跟内部 GitLab/Jira 深度集成
- 合规严格行业（金融、政府、医疗）数据不能出本地机房
- 工程团队为主的协作场景——Slash command / Bot / Webhook 玩得很顺

**不适用**：

- 想要"跨公司联邦聊天"——选 [[element-web]] / Matrix
- 想要"零运维 SaaS、加好友就用"——直接用 Slack/飞书/钉钉
- 想要"端到端加密私聊"——Mattermost 默认服务端可见明文，要 E2EE 看 [[signal-server]]

## 历史小故事（可跳过）

- **2015 年**：Mattermost 在 GitHub 开源，定位企业自托管 Slack 替代，Go 服务端 + 网页客户端起步
- **2016–2018 年**：插件系统与 DevOps 集成（GitLab/Jira/Jenkins webhook）成为工程团队主卖点；移动端与桌面端跟上
- **2021 年前后**：吸收 Focalboard，Boards 看板进入主产品；Playbooks 把线上事件响应做成可复用剧本（自动开频道、打勾、记时间线）
- **近年**：Calls（WebRTC + 自托管 SFU）补齐语音视频；仓库合并为 monorepo（`webapp/channels/`）；继续走"开源主仓 MIT + Enterprise 双仓"商业模式

## 学到什么

1. **企业市场不需要花哨的协议**——Slack 体验 + 自托管 + DevOps 集成，就够吃一大块市场
2. **Go 单体在中等复杂度系统里仍是好选择**——部署简单、并发模型友好、性能可预测
3. **聊天系统要能扩展为协作平台**——Playbooks/Boards/Calls 是"协作入口"位置之争
4. **开源 + Enterprise 双仓**是 B 端开源常见模式——主仓 MIT 拉社区，Enterprise 卖企业功能
5. **架构选型要算清耦合代价**——单体/微服务、PG/Mongo、中心化/联邦，没有"对的架构"，只有贴合定位的架构

## 延伸阅读

- 官方文档：[Mattermost Developer Docs](https://developers.mattermost.com/) — 插件、API、贡献指南
- 架构概览：[mattermost/mattermost README](https://github.com/mattermost/mattermost) 里的 architecture 章节
- 贡献与本地开发：[Developer Setup](https://developers.mattermost.com/contribute/server/developer-setup/) — 环境与 `make` 目标说明
- [[rocket-chat]] —— 同赛道竞品（Meteor + MongoDB 路线），适合横向对比
- [[element-web]] —— 联邦协议路线（Matrix），跟 Mattermost 中心化思路对照
- [[signal-server]] —— 端到端加密路线，思考"服务端能不能看消息"

## 关联

- [[rocket-chat]] —— 同样定位"开源 Slack 替代"，技术栈完全不同（Meteor/Node vs Go）
- [[element-web]] —— Matrix 协议旗舰客户端，"联邦 vs 中心化"对照
- [[signal-server]] —— 端到端加密 IM 后端，"消息能不能被服务端看"的另一极
- [[zulip]] —— 强制 topic 的开源团队聊天（Django + Tornado）
- [[ejabberd]] —— Erlang 写的电信级 XMPP 服务器，协议开放路线对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigbluebutton]] —— BigBlueButton — 教育向开源 Web 会议平台（HTML5 + WebRTC + 白板）
- [[ejabberd]] —— ejabberd — Erlang 写的电信级 XMPP/MQTT 多协议服务器
- [[element-web]] —— Element Web — Matrix 协议旗舰 web 客户端（React + matrix-js-sdk）
- [[openmeetings]] —— Apache OpenMeetings — 单 Java 进程跑完整 Web 会议系统
- [[prosody]] —— Prosody — Lua 写的轻量 XMPP 服务器（嵌入式部署 + 模块化插件）
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[zulip]] —— Zulip — 强制 topic 的开源团队聊天（Django + Tornado 长轮询）
