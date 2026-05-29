---
title: 项目候选 — 通信 / 协作 / 实时通话
日期: 2026-05-29
---

# 通信 / 协作 / 实时通话 项目候选

候选 50 个，按子类分组（Matrix 协议 5 / Element 客户端 2 / Signal 生态 3 / E2E 加密协议库 2 / 团队聊天 3 / XMPP 3 / 视频会议 直播服务端 3 / 实时协作 CRDT OT 5 / 邮件 邮箱基础设施 6 / 聊天机器人 IM SDK 6 / WebRTC 信令 5 / SIP VoIP 4 / 会议 SDK 3）。

study 通信类此前几乎空白：atlas 现有仅 `chatwoot`（开源客服）/ `yjs`（CRDT 协作内核），其余 200 条 atlas 与 9 份 `projects-*.md` 均不涉及 IM / 视频会议 / 邮件 / WebRTC 主体。本表 50 条全部新增 slug，与 atlas 200 条 + research 各类目（含 `projects-media.md` 已收 `mediasoup` / `janus-gateway` / `livekit` / `jitsi-meet` / `ant-media-server` / `nginx-rtmp-module` / `obs-studio` / `pion`，`projects-backend-api.md` 已收 `socket-io` / `centrifugo` / `soketi` / `hocuspocus`）互斥，不复用任何 slug。

Stars 量级为 2025-2026 区间近似值，仅作影响力参考。门槛 ≥ 1k stars，部分协议核心（vodozemac / prosody mirror / openmeetings Apache mirror / postfix git mirror / libsignal / livekit-flutter SDK）远低于阈值但属生态必读。

## 子类分布

| 子类 | 数量 |
|---|---:|
| [Matrix 协议 / 服务端 / SDK](#1-matrix-协议--服务端--sdk) | 5 |
| [Element 客户端](#2-element-客户端) | 2 |
| [Signal 生态](#3-signal-生态) | 3 |
| [E2E 加密协议库](#4-e2e-加密协议库) | 2 |
| [团队聊天 / 协作平台](#5-团队聊天--协作平台) | 3 |
| [XMPP 生态](#6-xmpp-生态) | 3 |
| [视频会议 / 直播服务端](#7-视频会议--直播服务端) | 3 |
| [实时协作（CRDT / OT）](#8-实时协作crdt--ot) | 5 |
| [邮件 / 邮箱基础设施](#9-邮件--邮箱基础设施) | 6 |
| [聊天机器人 / IM SDK](#10-聊天机器人--im-sdk) | 6 |
| [WebRTC 工具 / 信令](#11-webrtc-工具--信令) | 5 |
| [SIP / VoIP / 语音](#12-sip--voip--语音) | 4 |
| [会议 SDK / SFU 组件](#13-会议-sdk--sfu-组件) | 3 |

---

## 1. Matrix 协议 / 服务端 / SDK

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| synapse | Synapse | 第一代 Matrix 主流 homeserver，Python + Twisted 实现，Element 官方维护 | 13k | https://github.com/element-hq/synapse |
| conduit | Conduit | Rust 单二进制 Matrix homeserver，自托管 minimal footprint | 3k | https://github.com/famedly/conduit |
| dendrite | Dendrite | Element 官方第二代 Matrix homeserver，Go 微服务架构可水平拆分 | 5.6k | https://github.com/element-hq/dendrite |
| matrix-rust-sdk | matrix-rust-sdk | Matrix 官方 Rust 客户端 SDK，含 sliding sync + crypto，多语言 binding 上游 | 1.8k | https://github.com/matrix-org/matrix-rust-sdk |
| matrix-js-sdk | matrix-js-sdk | Matrix 官方 JS / TS 客户端 SDK，element-web 底座 | 2.2k | https://github.com/matrix-org/matrix-js-sdk |

## 2. Element 客户端

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| element-android | Element Android | Matrix Android 旗舰客户端，Kotlin + Realm + 端到端加密 | 3.5k | https://github.com/element-hq/element-android |
| element-web | Element Web | Matrix Web / Desktop 旗舰客户端，React + matrix-js-sdk + Olm | 11k | https://github.com/element-hq/element-web |

## 3. Signal 生态

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| signal-server | Signal Server | Signal 服务端，Java + Dropwizard + 私密计算 attestation 范本 | 3k | https://github.com/signalapp/Signal-Server |
| signal-ios | Signal iOS | Signal iOS 客户端，Swift + libsignal，端到端加密 IM 教科书 | 11k | https://github.com/signalapp/Signal-iOS |
| signal-android | Signal Android | Signal Android 客户端，Java/Kotlin + libsignal，最普及 E2E IM 实现 | 26k | https://github.com/signalapp/Signal-Android |

## 4. E2E 加密协议库

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| libsignal | libsignal | Signal 协议统一 Rust 实现 + 跨语言绑定，X3DH + Double Ratchet 学术参考 | 1.6k | https://github.com/signalapp/libsignal |
| vodozemac | vodozemac | Matrix 官方 Olm / Megolm Rust 重写，替代 libolm 为 SDK 加密底座 | 0.4k | https://github.com/matrix-org/vodozemac |

## 5. 团队聊天 / 协作平台

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| rocket-chat | Rocket.Chat | 开源团队聊天平台，Meteor + MongoDB + Apps Engine 插件 | 41k | https://github.com/RocketChat/Rocket.Chat |
| mattermost | Mattermost | Slack 兼容自托管协作平台，Go server + React Native 客户端 | 32k | https://github.com/mattermost/mattermost |
| zulip | Zulip | 主题化团队聊天（streams + topics 双层），Django + Tornado 长连接 | 22k | https://github.com/zulip/zulip |

## 6. XMPP 生态

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| prosody | Prosody | Lua 实现的 XMPP 服务器，可嵌入式部署 + 模块化 plugin | 0.9k | https://github.com/bjc/prosody |
| ejabberd | ejabberd | Erlang 实现的工业级 XMPP / Matrix / MQTT 多协议服务器 | 6k | https://github.com/processone/ejabberd |
| conversations | Conversations | XMPP Android 客户端事实标杆，OMEMO 端到端加密 + OAuth 集成 | 2.6k | https://github.com/iNPUTmice/Conversations |

## 7. 视频会议 / 直播服务端

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| ovenmediaengine | OvenMediaEngine | 亚秒级 LL-HLS / WebRTC streaming server，C++ ingest + transcode + delivery 一体 | 3k | https://github.com/AirenSoft/OvenMediaEngine |
| bigbluebutton | BigBlueButton | 教育向 Web 会议平台，Meteor 前端 + FreeSWITCH 音频 + Kurento 视频 | 8.7k | https://github.com/bigbluebutton/bigbluebutton |
| openmeetings | Apache OpenMeetings | Apache 老牌 Web 会议系统，Java + Wicket + Kurento，企业自托管首选之一 | 0.7k | https://github.com/apache/openmeetings |

## 8. 实时协作（CRDT / OT）

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| automerge | Automerge | 论文派 JSON CRDT，Rust 内核 + JS / Swift 绑定，local-first 应用首选 | 3.5k | https://github.com/automerge/automerge |
| liveblocks | Liveblocks | TS 实时协作 SaaS + 自托管 SDK，Yjs / Tiptap / Zustand 适配齐全 | 3.6k | https://github.com/liveblocks/liveblocks |
| sharedb | ShareDB | OT 派 realtime DB，Google Docs 同代际，MongoDB / Postgres 后端可选 | 5.2k | https://github.com/share/sharedb |
| partykit | PartyKit | Cloudflare Durable Objects 上的实时协作 framework，开发体验 first-class | 1.5k | https://github.com/partykit/partykit |
| collabora-online | Collabora Online | LibreOffice Online 分支，文档协同编辑后端 + WOPI 协议 | 2.7k | https://github.com/CollaboraOnline/online |

## 9. 邮件 / 邮箱基础设施

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| postfix | Postfix | 工业 SMTP 服务器，C 实现的 sendmail 现代替代（github 为权威 mirror） | 0.5k | https://github.com/vdukhovni/postfix |
| dovecot | Dovecot | 主流 IMAP / POP3 服务器，C 实现 + 高扩展插件 | 1.4k | https://github.com/dovecot/core |
| mailcow | mailcow-dockerized | Docker compose 一键全栈邮件服务（Postfix + Dovecot + Rspamd + SOGo） | 10k | https://github.com/mailcow/mailcow-dockerized |
| postal | Postal | Ruby 实现的开源 transactional 邮件平台，Mailgun / SendGrid 自托管替代 | 16k | https://github.com/postalserver/postal |
| haraka | Haraka | Node.js SMTP 服务器，plugin chain 架构 + outbound queue | 5k | https://github.com/haraka/Haraka |
| nodemailer | Nodemailer | Node.js 邮件发送事实标准，SMTP / SES / OAuth2 全协议覆盖 | 17k | https://github.com/nodemailer/nodemailer |

## 10. 聊天机器人 / IM SDK

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| botpress | Botpress | 开源对话式 AI 平台，可视化 flow + LLM 节点 + 多渠道分发 | 13k | https://github.com/botpress/botpress |
| rasa | Rasa | 开源对话式 AI 框架，DIET intent 分类 + dialogue policy + slot 填充 | 19k | https://github.com/RasaHQ/rasa |
| errbot | Errbot | Python 写的多 IM 渠道 chatops bot 框架，plugin 即 Python 类 | 3k | https://github.com/errbotio/errbot |
| discord-py | discord.py | Python Discord API 客户端事实标准，async + slash command 全支持 | 14.5k | https://github.com/Rapptz/discord.py |
| discord-js | discord.js | Node.js Discord API 客户端事实标准，gateway + REST + voice 一体 | 25k | https://github.com/discordjs/discord.js |
| botbuilder-js | Bot Framework SDK JS | 微软 Bot Framework JS SDK，Teams / Skype / 多渠道 connector | 7k | https://github.com/microsoft/botbuilder-js |

## 11. WebRTC 工具 / 信令

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| coturn | coturn | 主流 TURN / STUN 服务器，C 实现的 WebRTC NAT 穿透必备 | 12k | https://github.com/coturn/coturn |
| webrtc-rs | webrtc-rs | Rust 纯实现 WebRTC 协议栈，pion 同代际的多语言对照实现 | 4.4k | https://github.com/webrtc-rs/webrtc |
| simple-peer | simple-peer | feross 出品 WebRTC P2P 简化 API，"3 行代码 connect 两端" | 7.2k | https://github.com/feross/simple-peer |
| peerjs-server | PeerJS Server | PeerJS 配套信令服务器，浏览器端 P2P 连接最易上手方案 | 6.5k | https://github.com/peers/peerjs-server |
| aiortc | aiortc | Python asyncio WebRTC + ORTC 实现，机器学习 / IoT 端集成首选 | 4.4k | https://github.com/aiortc/aiortc |

## 12. SIP / VoIP / 语音

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| asterisk | Asterisk | 老牌开源 PBX，Dialplan / SIP / IAX 多协议软交换内核 | 3.1k | https://github.com/asterisk/asterisk |
| freeswitch | FreeSWITCH | C 实现可扩展软交换，模块化 mod_* 架构 + WebRTC gateway | 3.9k | https://github.com/signalwire/freeswitch |
| kamailio | Kamailio | 高性能 SIP 代理 / registrar / load balancer，C + Lua / Python 路由脚本 | 2.4k | https://github.com/kamailio/kamailio |
| mumble | Mumble | 低延迟 VoIP 客户端 + 服务器，游戏语音事实标准，Opus + 位置音频 | 6.3k | https://github.com/mumble-voip/mumble |

## 13. 会议 SDK / SFU 组件

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| openvidu | OpenVidu | Kurento 之上的 WebRTC 视频会议 PaaS，开源版自托管 + REST 控制 | 7.5k | https://github.com/OpenVidu/openvidu |
| livekit-flutter | LiveKit Flutter SDK | LiveKit 官方 Flutter 客户端 SDK，移动 / 桌面 WebRTC 全平台覆盖 | 0.5k | https://github.com/livekit/client-sdk-flutter |
| jitsi-videobridge | Jitsi Videobridge | Jitsi 系 SFU 主体（与 jitsi-meet 分仓），WebRTC 媒体路由 + simulcast | 3k | https://github.com/jitsi/jitsi-videobridge |

---

## 备注

- 已规避 atlas 现有 200 条全部 slug（含 `chatwoot` / `yjs`）。
- 已规避 research 现有 9 份 `projects-*.md` 全部 slug，重点覆盖：
  - `projects-media.md`：`mediasoup` / `janus-gateway` / `livekit`（核心仓 / 区别于本表 livekit-flutter SDK） / `jitsi-meet`（区别于本表 jitsi-videobridge SFU 主体） / `ant-media-server` / `nginx-rtmp-module` / `obs-studio` / `pion`（Go WebRTC，区别于本表 webrtc-rs）。
  - `projects-backend-api.md`：`socket-io` / `centrifugo` / `soketi` / `hocuspocus` 已覆盖通用 realtime / WebSocket，本表通信类不重复。
  - `projects-databases.md`：`nats-server` / `rabbitmq-server` / `emqx` 已覆盖消息总线 / pub-sub，本表不收录通用 message broker。
- 用户原列表中以下条目主动替换 / 剔除：
  - `matrix-react-sdk` 已于 2024 归档并合入 `element-web` → 替换为 `matrix-js-sdk`（仍活跃）。
  - `pexip-engine` 不开源（Pexip Infinity 商业产品）→ 替换为 `dendrite`（Matrix Go 官方第二代）。
  - `cursor-collab` / `openchatkit-server` / `freshdesk-clone` / `botfront-engine` / `dialogflow-cx-cli` / `nodemailer-server` / `mediasoup-demo` / `livekit-cloud` / `100ms-sdk` / `ant-media-sdk` / `agora-flutter` 不存在 / 已归档 / 闭源 / 仅 demo → 替换为 `errbot` / `discord-py` / `discord.js` / `botbuilder-js` / `coturn` / `webrtc-rs` / `peerjs-server` / `mumble` / `kamailio` / `freeswitch` / `asterisk` / `openmeetings` / `collabora-online` / `vodozemac` / `conversations` / `ejabberd` 等仍活跃 / 协议代表性项目。
  - `obs-studio` / `ant-media-server` / `nginx-rtmp` / `mediasoup` / `janus-gateway` / `livekit` / `jitsi-meet` / `hocuspocus` 已在 media / backend-api 收录 → 不重复。
- `wechaty`（用户列表未含但属临近候选）因 MDM 域名拦截 + 微信 bot 合规风险（见全局 memory 条目）主动剔除。
- 红线词扫描：未出现任何业务 / 公司内部词。
