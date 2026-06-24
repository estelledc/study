---
title: BigBlueButton — 教育向开源 Web 会议平台（HTML5 + WebRTC + 白板）
来源: 'https://github.com/bigbluebutton/bigbluebutton'
日期: 2026-05-30
分类: 基础设施 / 实时协作
难度: 中级
---

## 是什么

BigBlueButton（**BBB**）是一台**专门为线上课堂设计的开源 Web 会议服务器**。日常类比：Zoom 是给商务开会用的"电话会议+屏幕共享"，BBB 是给老师上课用的"虚拟教室"——白板能在 PPT 上画批注、学生能举手、老师能开"分组讨论房"把全班拆成 4 个小组。

具体形态：

- **服务端**：一堆组件凑起来——Java（bbb-web 控制面）+ Scala/Akka（会议状态机）+ Node.js（mediasoup WebRTC SFU）+ FreeSWITCH（音频混音）+ Etherpad（共享记事）+ Redis（事件总线）+ nginx
- **客户端**：纯 HTML5（React 前端），2018 年起彻底抛弃 Flash
- **集成**：通过 LTI 协议接入 Moodle / Canvas / Sakai 等 LMS（Learning Management System），自带轻量前台 Greenlight

GitHub 上 8.7k stars，**LGPL-3.0** 协议（比 [[ovenmediaengine]] 的 AGPL 宽松，商用集成不传染主仓）。源起 2007 年加拿大 Carleton 大学，2020 疫情远程教学装机量爆发。

## 为什么重要

不理解 BBB，下面这些事都没法解释：

- 为什么"开源会议"赛道里 BBB 和 Jitsi 长得不一样——BBB 押**教学场景**（白板/分组/录像），Jitsi 押**通用会议**
- 为什么 [[ovenmediaengine]] 和 BBB 都用 WebRTC 但完全不撞车——OME 是**一推多拉直播**（一个主播 → N 个观众），BBB 是 **N×N 会议**（每人都推都拉），这是 WebRTC 协议族里的两条不同路线
- 为什么 BBB 的"录像"不是录视频而是**离线渲染的可回放页面**——它把会议事件流（chat / cursor / slides）一起回放，比单纯视频文件能拖更精确的时间点
- 为什么"装一台 BBB"是出了名的劝退——7-8 个进程依赖一起编排，不像 [[mattermost]] 一个 Go 单体起来就能跑

## 核心要点

BBB 架构可以拆成 **五层**：

1. **接入层**：nginx 做 HTTPS 终止 + WebSocket 反向代理 + 录像静态文件分发。所有客户端流量先撞 nginx。

2. **控制面**：bbb-web（Java/Spring Boot）暴露 REST API（创建会议、踢人、上传演示文档），供 LMS 通过 LTI 调用；HTML5 client（React + Meteor 后端）跟它对接。

3. **状态机**：bbb-apps-akka（Scala + Akka actor 模型）维护"谁举手 / 谁在演示 / 白板坐标"等会议实时状态，用 Redis pub/sub 跨进程广播。

4. **媒体层**：FreeSWITCH 做音频混音 + SIP 拨入；mediasoup（Node 写的 SFU，2.7+ 替换早期的 Kurento）做视频 + 屏幕共享 + WebRTC 信令转发。SFU = Selective Forwarding Unit，每人推一路，服务器转发给其他人，不在服务端混流。

5. **协作组件**：Etherpad 实例嵌进会议做"共享记事"；白板基于 SVG 在 PDF/PPT 转出的图上批注；聊天是会议的附属，不是主功能（这点跟 [[mattermost]] / [[rocket-chat]] 完全相反）。

## 实践案例

### 案例 1：30 分钟自建一台 BBB

```bash
# 单机版（要求 Ubuntu 20.04 + 公网 IP + 域名 + 真证书）
wget -qO- https://raw.githubusercontent.com/bigbluebutton/bbb-install/v2.7.x/bbb-install.sh \
  | bash -s -- -v focal-270 -s bbb.example.com -e admin@example.com -g
```

`-g` 是同时装 Greenlight（自家轻量前台，没接 LMS 时用它当注册/排课入口）。装完浏览器开 `https://bbb.example.com` 就能注册老师账号开课。脚本背后做的事：拉 nginx + freeswitch + kurento/mediasoup + redis + bbb-* 一堆 deb 包，配 TLS 证书，写 nginx 站点。

### 案例 2：从 Moodle 一键开课

后台装 BigBlueButton 插件后，老师在 Moodle 课程页"添加活动 → BigBlueButton"，配会议名 + 起止时间，学生在课程页点"加入"自动跳转到 BBB 教室。整条链路通过 **LTI 1.3** 协议标准化：Moodle 是 LTI Tool Consumer，BBB 是 LTI Tool Provider，跨产品鉴权 + 上下文传递走 OAuth/OIDC。

### 案例 3：用 REST API 远程开会

```bash
# 创建会议
curl "https://bbb.example.com/bigbluebutton/api/create?\
name=Math101&meetingID=math-2026-05-30&\
attendeePW=ap&moderatorPW=mp&checksum=<sha1>"

# 生成学生加入链接
echo "https://bbb.example.com/bigbluebutton/api/join?\
fullName=Alice&meetingID=math-2026-05-30&password=ap&checksum=<sha1>"
```

签名规则：`sha1(API名 + query + sharedSecret)`。这套 API 让任何系统都能集成 BBB——LMS 用、自家工单系统用、AI 课表机器人用。

## 关键架构选择

### 教学优先 vs 通用会议

BBB 的功能清单不是 "Zoom 抄作业"——它是反过来从教室倒推：

- **分组讨论房（breakout）**：老师把 30 人班拆成 6 个小组各自讨论，10 分钟后拉回主房——这是 Zoom 后来才学的
- **演示者权限**：默认只有"演示者"能放幻灯片、画白板，其他人是"观众"；老师切换演示者把控制权交给学生展示
- **举手 / emoji 状态**：学生不打断老师就能"我有问题"
- **多选投票**：当堂小测就能跑

这些都是"商务会议软件"懒得做的，但教学场景天天用。BBB 押的就是 LMS 集成 + 教学闭环这条窄赛道。

### 录像不是录视频

BBB 录像的核心是**事件流回放**：会议过程中所有动作（谁说话、鼠标在哪、幻灯片翻到哪、白板画了什么）都按时间戳写进 Redis，会议结束后异步渲染成一个可回放的网页。代价是渲染慢（1 小时会议常要 20+ 分钟出录像），好处是比单纯 MP4 文件能精确跳到"老师讲第 3 章那 5 分钟"。

### 媒体栈换过两次

2.6 之前用 Kurento（C++ 的 WebRTC 媒体服务器），后来 Kurento 上游维护停滞，2.7+ 切到了 mediasoup（Node 写的 SFU）。这件事的教训：**底层媒体栈选型要看上游活跃度**，否则被迫做大版本不兼容迁移。生产环境跨 2.5→2.7 基本要重装。

## 阅读这个仓库的路线

如果你想读源码，建议这个顺序：

1. **`bbb-web/`**：Java 控制面入口，看 REST API 怎么映射到会议生命周期
2. **`akka-bbb-apps/`**：Scala 状态机，看 actor 怎么处理"举手/投票/演示者切换"
3. **`bigbluebutton-html5/`**：React + Meteor 前端，看客户端怎么订阅会议状态
4. **`bbb-webrtc-sfu/`**：Node 媒体网关，看 mediasoup 怎么管 WebRTC peer
5. **`record-and-playback/`**：Ruby 写的录像渲染管线，最难读但最值得读

## 踩过的坑

1. **bbb-install.sh 强烈推荐用单机版**：手动装 7-8 个组件几乎必踩坑；官方维护的 install 脚本帮你拉齐版本依赖

2. **单机用户上限 ~50-100**：媒体服务器 CPU 密集（视频转发 + 音频混音），超过这个量级要用 **Scalelite** 做负载均衡多机集群

3. **WebRTC 公网必须配 STUN/TURN**：跟 [[ovenmediaengine]] 一样的坑——内网测试都通公网连不上，必须装 coturn 兜底

4. **录像渲染队列容易堆积**：渲染是单进程异步任务，并发会议多时录像会堆几小时；监控要盯 `record:archive` 队列长度

5. **LGPL ≠ 完全无传染**：商用集成主仓没问题，但**修改 BBB 源码再分发**仍要开源；商业 SaaS 不动主仓只调 API 是安全的

## 适用 vs 不适用场景

**适用**：

- 高校 / K12 在线课堂——LMS 深度集成 + 录像回放 + 分组讨论是刚需
- 企业内训——同样吃"演示者权限 + 录像"模式
- 自托管教育平台 SaaS——可基于 BBB 二次开发

**不适用**：

- 通用商务会议（Zoom 替代）→ 用 Jitsi Meet，更轻量更快起
- 直播 / 一推多拉场景 → 用 [[ovenmediaengine]]，BBB 不是为大观众设计
- 即时聊天为主、会议为辅 → 用 [[mattermost]] / [[rocket-chat]]，BBB 的聊天功能很弱
- 端到端加密刚需 → BBB 媒体走 SFU，服务端能解密；E2EE 看 Signal 那条路

## 历史小故事（可跳过）

- **2007 年**：加拿大 Carleton 大学项目启动，定位 "web conferencing for online learning"，那时候 Flash 还是浏览器音视频唯一选择
- **2010 年**：BigBlueButton Inc 成立，开始做商业支持；社区版仍然 LGPL
- **2018 年**：v2.0 发布，**彻底抛弃 Flash 全 HTML5**——这一刀比 YouTube/Bilibili 切 HTML5 还激进
- **2020 年**：疫情远程教学爆发，Moodle/Canvas 集成 BBB 的装机量翻 10 倍以上
- **2022+**：v2.6/2.7 把 Kurento 换成 mediasoup，原因是 Kurento 上游维护停滞——这是开源项目"被生态拖着走"的典型案例

## 学到什么

1. **WebRTC 不是一种产品而是协议族**——同样一套 RTP/SDP/ICE，OME 做"一推多拉直播"、BBB 做"N×N 会议"、Janus 做"信令网关"，三种架构服务三种场景
2. **教育场景是会议的窄赛道但够养项目**——分组房、白板、举手、演示者切换在商务会议里没人做，BBB 把它做透就站住了
3. **多组件编排是双刃剑**——能复用 Etherpad/FreeSWITCH/Kurento 这些成熟项目，代价是部署复杂度上一个数量级
4. **底层选型要看上游活跃度**——Kurento 停滞迫使 BBB 大改媒体栈，是技术决策被生态拖着走的典型案例
5. **录像 = 事件流而非视频文件**——这是教学/审计场景的核心差异化设计，但代价是渲染管线复杂

## 延伸阅读

- 官网：[bigbluebutton.org](https://bigbluebutton.org/)（含 demo 和文档）
- 架构概览：[docs.bigbluebutton.org/development/architecture](https://docs.bigbluebutton.org/development/architecture)
- 多机集群：[Scalelite](https://github.com/blindsidenetworks/scalelite)（BBB 官方推荐的负载均衡器）
- 同类对比：[Jitsi Meet](https://github.com/jitsi/jitsi-meet)（更通用的会议）/ [Galène](https://galene.org/)（轻量 SFU）
- [[ovenmediaengine]] —— 同样 WebRTC 但定位"一推多拉直播"，对比"广播 vs 会议"
- [[mattermost]] —— 同样自托管协作但定位"异步聊天"，对比"同步会议 vs 异步消息"

## 关联

- [[ovenmediaengine]] —— 都是 WebRTC 服务器，但 OME 偏直播（一推多拉）BBB 偏会议（N×N），看清楚就理解 WebRTC 协议族的两条主路
- [[mattermost]] —— 异步聊天为主 + 会议为辅；BBB 反过来——会议为主聊天为辅，互为镜像
- [[rocket-chat]] —— 同样自托管协作平台，但走 omnichannel 客服路线，跟 BBB 的教学路线分叉
- [[ffmpeg]] —— BBB 录像渲染管线深度依赖 ffmpeg 做视频/音频合成
- [[nginx]] —— BBB 必备前置代理，做 HTTPS 终止 + WebSocket 升级 + 静态录像分发

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ffmpeg]] —— FFmpeg — 几乎所有视频工具背后都藏着它
- [[mattermost]] —— Mattermost — Slack 的开源自托管替代（Go 服务端 + React 客户端）
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[openmeetings]] —— Apache OpenMeetings — 单 Java 进程跑完整 Web 会议系统
- [[ovenmediaengine]] —— OvenMediaEngine — 亚秒级直播流媒体服务器

