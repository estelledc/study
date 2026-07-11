---
title: Jitsi Meet — 开源视频会议的自托管套件
来源: 'https://github.com/jitsi/jitsi-meet'
日期: 2026-07-09
分类: media
难度: 中级
---

## 是什么

Jitsi Meet 是一套**开源视频会议系统**：浏览器和手机 App 负责开会体验，Jitsi Videobridge 负责把多人音视频按需转发，Prosody 和 Jicofo 负责会议里的信令与协调。

日常类比：它像一整套可自建的会议中心。前台网页负责让人进门、改名字、开关麦；调度员决定这场会由哪间会议室承接；真正的音视频传送带在后场把每个人的声音和画面送给其他人。

更技术一点说，Jitsi Meet 不是单个库，而是一组项目拼成的产品栈：React / React Native 客户端、XMPP 信令、Jicofo 会议焦点、Jitsi Videobridge（JVB）媒体路由、Jibri 录制和直播、Jigasi SIP 电话接入。

GitHub README 把它定位成 open source video conferencing platform，约 25.4k stars 的价值在于：你可以直接用 `meet.jit.si`，也可以把同一套技术栈部署到自己的域名上，做私有会议、白牌会议或产品内嵌通话。

## 为什么重要

不理解 Jitsi Meet，下面这些事都没法解释：

- 为什么“视频会议”不只是前端摄像头 API，还要有信令、媒体服务器、NAT 穿透、权限、录制和移动端
- 为什么 2 人通话可以点对点，但多人会议需要 SFU：每个人直连所有人会让上行带宽和连接数爆炸
- 为什么 Jitsi 文档里总出现 Prosody、Jicofo、JVB、Jibri：它们分别管“聊天协议”“会议主持”“媒体转发”“录制直播”
- 为什么自托管会议比想象中难：DNS、TLS、UDP 10000、TURN 5349、证书和浏览器权限任何一环错，用户只会看到黑屏或无声

## 核心要点

Jitsi Meet 可以先记住 **三层心智模型**：

1. **Web 客户端是会议前台**：用户看到的房间、按钮、聊天、举手、共享屏幕都在这里。类比：前台负责登记、发胸牌、提醒大家谁在说话。

2. **Prosody + Jicofo 是会议调度**：Prosody 用 XMPP 传递“谁进房、谁静音、谁要建媒体会话”，Jicofo 像主持人一样分配会议焦点和 JVB。类比：调度员不搬椅子，但决定谁坐哪间房。

3. **Jitsi Videobridge 是媒体分发台**：每个浏览器把音视频发到 JVB，JVB 按需转发给其他人，尽量不做重编码。类比：它像快递分拣线，只把包裹送到需要的人手里，不拆开重装。

这三层合起来解释了 Jitsi 的取舍：它比 mediasoup 更像成品会议系统，比 LiveKit 更偏“开源会议产品”，比 OpenMeetings 更现代但组件更多。

## 实践案例

### 案例 1：小团队自托管一台会议域名

官方 Debian / Ubuntu 文档给出的生产入口是 apt 包，而不是从源码编译：

```sh
sudo apt update
sudo apt install apt-transport-https gnupg2 nginx-full
curl -sL https://download.jitsi.org/jitsi-key.gpg.key \
  | sudo sh -c 'gpg --dearmor > /usr/share/keyrings/jitsi-keyring.gpg'
echo "deb [signed-by=/usr/share/keyrings/jitsi-keyring.gpg] https://download.jitsi.org stable/" \
  | sudo tee /etc/apt/sources.list.d/jitsi-stable.list
sudo apt update
sudo apt install jitsi-meet
```

**逐部分解释**：

- `jitsi-meet` 会装 web、Prosody、Jicofo、JVB 等核心包，不是只装一个前端页面
- 安装时填 `meet.example.org` 这样的域名，后续 TLS、虚拟主机和会议 URL 都围绕它生成
- 防火墙至少要放行 `443/tcp` 和 `10000/udp`，否则网页能打开但媒体可能完全不通

### 案例 2：在自己的产品里嵌入会议

Jitsi 的 IFrame API 适合把会议当作一个现成模块塞进课程、客服、协作工具：

```html
<div id="meet"></div>
<script src="https://meet.jit.si/external_api.js"></script>
<script>
  const api = new JitsiMeetExternalAPI('meet.jit.si', {
    roomName: 'support-room-42',
    parentNode: document.querySelector('#meet'),
    width: '100%',
    height: 640,
    configOverwrite: { startWithAudioMuted: true },
    userInfo: { displayName: 'Alice' }
  });
</script>
```

**逐部分解释**：

- `external_api.js` 来自你使用的 Jitsi 域名；自托管时要换成自己的 `https://meet.example.org/external_api.js`
- `roomName` 是会议房间名，产品里通常要用订单号、课程号或随机短码生成，避免撞房
- `configOverwrite` 改的是会议配置，不等于后端鉴权；需要强权限时要接 JWT 或 secure domain

### 案例 3：给会议加录制、直播和电话接入

Jibri 和 Jigasi 是 Jitsi 生态里的两个真实生产扩展：一个让会议被录成文件或推到直播平台，一个让 SIP 电话加入会议。Docker 部署里常这样按需打开：

```sh
# 开核心会议栈
docker compose up -d

# 加 SIP 音频网关
docker compose -f docker-compose.yml -f jigasi.yml up -d

# 加录制 / 直播组件
docker compose -f docker-compose.yml -f jibri.yml up -d
```

**逐部分解释**：

- Jigasi 需要 SIP 账号，它把传统电话世界接进 WebRTC 房间，但通常只处理音频
- Jibri 会启动一个 Chrome，在虚拟屏幕里加入会议，再用 ffmpeg 捕获输出，所以它比普通后端服务更吃机器资源
- 录制和直播不是 JVB 自带魔法，必须额外部署 Jibri，并配置内部 XMPP 用户、录制目录和回收脚本

## 踩过的坑

1. **只开了 443 没开 10000/udp**：网页能进房，但 JVB 媒体包进不来，结果是“能聊天但没声音没画面”。

2. **把房间名当权限**：知道 URL 的人就能进公开房间，真正限制开房要用 secure domain、JWT 或前置业务系统。

3. **自签证书上线移动端**：浏览器可以点“继续访问”，但 Jitsi 手机 App 通常要求受信任证书。

4. **以为 Jibri 只是一个按钮**：录制需要独立机器资源、Chrome、音频 loopback、ffmpeg 和上传脚本，失败点比普通会议多。

## 适用 vs 不适用场景

**适用**：

- 公司、学校、社群想自托管通用视频会议，并能接受自己维护域名、证书和服务器
- 产品需要快速嵌入多人会议，不想从 WebRTC 信令和 SFU API 开始造
- 需要会议常见功能：聊天、举手、投票、共享屏幕、移动端、录制、SIP 电话接入
- 对开源和数据可控有要求，但仍希望拿到接近成品的 Web UI

**不适用**：

- 只做 1 对 1 通话且产品 UI 完全自定义 → P2P WebRTC、Pion 或 aiortc 更轻
- 想把媒体层当低层库细粒度编排 → mediasoup / LiveKit SDK 的控制颗粒度更合适
- 要千人级单向直播 → HLS / DASH / RTMP 架构通常比会议 SFU 更省资源
- 团队不愿维护网络、证书、TURN、日志和升级 → 直接用托管会议服务更现实

## 历史小故事（可跳过）

- **2003 年前后**：Jitsi 的前身是 SIP Communicator，最早更像一个支持 SIP / XMPP 的桌面通信客户端。
- **2011 年**：项目改名 Jitsi，逐渐从桌面软电话扩展到实时通信组件集合。
- **2010 年代中期**：WebRTC 在浏览器落地，Jitsi Meet 和 Jitsi Videobridge 成为“浏览器多人会议”的核心组合。
- **2018 年**：8x8 收购 Jitsi 团队，`meet.jit.si` 和商业 JaaS 继续建立在开源项目之上。
- **2020 年以后**：远程办公和在线课堂爆发，Jitsi 作为可自托管替代方案被大量组织重新发现。

## 读源码路线

如果只是想理解仓库，不建议从 WebRTC 细节直接钻进去，可以按这条线读：

1. **`react/features/`**：会议 UI 的大部分功能入口，聊天、举手、背景、设置都能在这里找到。
2. **`conference.js`**：用户加入会议、静音、离会、拿参与者信息的核心流程。
3. **`modules/external-api/`**：IFrame API 的实现，适合理解“外部产品如何控制会议”。
4. **Jicofo / JVB 仓库文档**：当你已经看懂前端状态，再去看会议焦点和媒体路由，概念会清楚很多。

## 学到什么

1. **Jitsi Meet 的核心不是一个网页，而是一套会议栈**：Web、XMPP、focus、SFU、录制、电话网关各管一段。
2. **SFU 让多人会议从 N² 连接退回到“每人连服务器”**：这就是它比纯 P2P 更适合多人房间的原因。
3. **成品体验来自很多小组件**：举手、投票、聊天、移动端、录制都不是 WebRTC 本身给的，而是产品层补齐的。
4. **自托管的真正成本在网络边界**：TLS、UDP、防火墙、TURN、日志和监控比“能跑起来”更决定用户体验。

## 延伸阅读

- 官方仓库：[jitsi/jitsi-meet](https://github.com/jitsi/jitsi-meet)（先看项目边界和 README，不要从源码树硬啃）
- 官方架构：[Jitsi Architecture](https://jitsi.github.io/handbook/docs/architecture/)（Prosody、Jicofo、JVB、Jibri 的分工）
- 自托管文档：[Debian / Ubuntu server](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart/)（理解端口和证书坑）
- 集成文档：[IFrame API](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/)（产品内嵌会议的入口）
- [[coturn]] —— 解释 TURN 为什么是视频会议公网部署的兜底组件

## 关联

- [[mediasoup]] —— 同样是 SFU 方向，但 mediasoup 更像底层媒体路由库，Jitsi 更像成品会议套件
- [[livekit]] —— 同样可自托管 WebRTC 平台，LiveKit 更偏开发者平台和多端 SDK
- [[openmeetings]] —— 同样开源会议系统，可对比“单 Java 进程一体机”和“Jitsi 多组件栈”
- [[coturn]] —— Jitsi 的 P2P / TURN 兜底链路离不开 NAT 穿透
- [[prosody]] —— Jitsi 用它做 XMPP 信令服务器，承载房间和组件之间的控制消息
- [[nginx]] —— Jitsi Web 前端和 TLS 入口常由 Nginx 承接
- [[freeswitch]] —— 传统 VoIP / SIP 世界的代表，能帮助理解 Jigasi 为什么有价值

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/coturn]] —— coturn — 帮 WebRTC 穿越 NAT 的开源 TURN/STUN 中转服务器
- [[jitsi-videobridge]] —— Jitsi Videobridge — 只读 RTP 包头的 WebRTC 视频转发器
