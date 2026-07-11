---
title: Apache OpenMeetings — 单 Java 进程跑完整 Web 会议系统
来源: 'https://github.com/apache/openmeetings'
日期: 2026-05-30
分类: 基础设施 / 实时协作
难度: 中级
---

## 是什么

Apache OpenMeetings（**OM**）是一台**用一个 Java 进程把视频会议 + 白板 + 文档共享 + 录像全做了的开源 Web 会议系统**。日常类比：[[bigbluebutton]] 像组装的发烧音响——前级、解码、功放、音箱七八件器材凑一台才出声；OpenMeetings 像一体机——插电就响，音质未必顶级但不用调七根线。

具体形态：

- **后端**：Java + Spring + **Apache OpenJPA**（JPA ORM，不是 Hibernate），跑在 Tomcat/Jetty 里，单 JVM 内嵌一切
- **前端**：Apache Wicket 服务端组件框架——HTML 在服务器上拼好发给浏览器，不是 SPA（与 BBB 的 React 前端走相反路线）
- **媒体**：早年 Red5（Java 写的 RTMP 服务器，Flash 时代主力），后切 Kurento WebRTC，仍嵌在主进程里
- **文档转换**：依赖 LibreOffice headless + ImageMagick + GhostScript——上传 PPT/Word 自动转 PDF/PNG 给白板批注
- **数据库**：MySQL / PostgreSQL / MariaDB / DB2 / Oracle / MSSQL 都行，OpenJPA 把 SQL 方言全屏蔽

GitHub 0.7k stars，**Apache-2.0** 协议（比 [[bigbluebutton]] 的 LGPL-3.0 还宽松——商业闭源衍生不需要开源）。2007 年由 Sebastian Wagner 在德国发起，2011 进 Apache 孵化器，2012 升级为 Apache 顶级项目（TLP）至今。

## 为什么重要

不理解 OpenMeetings，下面这些事都没法解释：

- 为什么"开源 Web 会议"赛道里同样是会议但 OM 和 [[bigbluebutton]] 部署难度差一个量级——单 JVM vs 7-8 个进程
- 为什么 Apache 基金会的会议系统在 stars 数上输给后起的 Jitsi/BBB——技术栈（Wicket、Red5）押在了 Flash 终结那一代
- 为什么 OpenJPA 这种 "JPA 实现" 在企业 Java 圈仍有人用——它让一份代码兼容 6 种数据库
- 为什么"上传 PPT 能在线批注"这件事看着简单实际很麻烦——背后是 LibreOffice + ImageMagick + GhostScript 一条转换流水线

## 核心要点

OM 架构可以拆成 **四层**：

1. **接入层**：Tomcat/Jetty 起 HTTPS，Wicket 处理页面请求，HTML5 client 通过 WebSocket 长连接拿实时事件。没有 nginx 反代是默认形态（与 [[bigbluebutton]] 必上 nginx 不同）。

2. **应用层**：Java + Spring 管会议状态、用户、房间、日历、聊天。Wicket 在服务端把组件树渲染成 HTML，模型变化 → 推 JS 更新片段。这是 2005-2010 那一代"服务端 UI"思路，与现代 React/Vue 客户端渲染完全相反。

3. **媒体层**：早年 Red5（RTMP）配 Flash 浏览器插件，2018 后切 Kurento WebRTC SFU 走 HTML5。媒体进程仍嵌在主 JVM 里，不像 [[bigbluebutton]] 拆出独立 mediasoup 进程。SFU 含义参考 [[bigbluebutton]] 笔记，不重复。

4. **数据 + 转换层**：OpenJPA 抽象 SQL 方言（同份代码切 6 种数据库不改一行）；外部进程调 LibreOffice/ImageMagick/GhostScript 做"上传 PPT → 一页一张 PNG"的预处理，让白板能在文档上画批注。

## 实践案例

### 案例 1：30 秒装一台单机版

```bash
# 装依赖（Ubuntu）
apt install openjdk-17-jre-headless libreoffice imagemagick ghostscript

# 下载 + 解包 + 跑（以官网当前 9.0.0 为例）
wget https://dlcdn.apache.org/openmeetings/9.0.0/bin/apache-openmeetings-9.0.0.tar.gz
tar -xzf apache-openmeetings-*.tar.gz
cd apache-openmeetings-9.0.0 && bin/startup.sh
```

浏览器开 `http://localhost:5080/openmeetings/install` 走向导建管理员账号、配数据库——内嵌 H2 也能直接跑（仅试用别上生产）。官方安装页写的是 `bin/startup.sh`（老文档里的 `red5.sh` 已退役）。对比 [[bigbluebutton]] 的 `bbb-install.sh`（公网 IP + 域名 + 真证书 + 7-8 个 deb）轻一个量级。

### 案例 2：从 Moodle 一键开课

后台装 OpenMeetings 插件后，老师在课程页 "添加活动 → OpenMeetings"，配房间名 + 起止时间，学生点链接跳到会议。鉴权走 SOAP/REST API，跨产品账号映射用 LDAP 或 OAuth2。这条链路和 [[bigbluebutton]] 的 LTI 1.3 标准协议不同——OM 走自定义 API，集成深度受插件维护活跃度限制。

### 案例 3：用 REST API 远程开会

```bash
# 登录拿 sessionId
curl 'http://om.example.com/openmeetings/services/user/login?\
user=admin&pass=xxx'
# → {"sessionId": "abc123"}

# 创建房间
curl -X POST 'http://om.example.com/openmeetings/services/room' \
  -d 'sid=abc123&room.name=Math101&room.type=conference'
```

签名比 [[bigbluebutton]] 的 sha1 校验链路简单（先登录拿 session，后续操作带 sid），但需要保管 session 生命周期。

## 关键架构选择

### 单进程内嵌 vs 多组件编排

OM 把 Java + Spring + Wicket + Kurento + Red5 都塞同一个 JVM。优势：装一次跑一次，依赖统一在 `pom.xml`，运维心智模型简单。代价：媒体崩溃整站挂；扩展只能整机加机器（不能像 [[bigbluebutton]] 单独扩 mediasoup 节点）；JVM 启动慢（30-60 秒）。

这条路线的反例是 [[bigbluebutton]]——多进程编排允许细粒度扩缩容，但部署复杂度上一个数量级。两种思路没绝对优劣，看你团队规模和扩容需求。

### Wicket 服务端组件 vs 现代 SPA

Wicket 是 2004 年的服务端组件框架——按钮/表单/列表都是 Java 对象，状态在 session 里，HTML 在服务器拼好发给浏览器。优势：Java 程序员零学习成本，不用懂 React/Vue；XSS/CSRF 框架自动防。代价：每次交互一次往返；前端体验比 SPA 钝；移动端响应慢。

[[bigbluebutton]] 选 React + Meteor 走 SPA 路线，[[mattermost]] 选 React + Go API 走 SPA 路线，OM 是这片赛道里最后一个仍坚持服务端组件的——这是 "技术栈选型十年没换" 的双刃剑。

## 阅读这个仓库的路线

如果你想读源码，建议这个顺序：

1. **`openmeetings-web/`**：Wicket 页面 + 组件入口，看 "服务端组件" 长什么样
2. **`openmeetings-core/`**：会议核心逻辑（房间、用户、状态机）
3. **`openmeetings-db/`**：OpenJPA 实体定义，看怎么用 ORM 屏蔽数据库方言
4. **`openmeetings-server/`**：Red5/Kurento 媒体集成层
5. **`openmeetings-install/`**：安装向导和默认配置生成器，最适合新人改一行试一试

## 踩过的坑

1. **LibreOffice headless 版本敏感**：上传 PPT 转 PDF 时，LibreOffice 7.x 对某些 .pptx 渲染会偏移；生产建议固定一个 LibreOffice 版本

2. **Kurento 上游维护停滞**：和 [[bigbluebutton]] 当年遇到的同一个坑——Kurento 社区活跃度低，OM 最近版本仍在用，未来可能也得迁 mediasoup

3. **WebRTC 公网必须配 STUN/TURN**：和 [[ovenmediaengine]] / [[bigbluebutton]] 一样的坑——内网通公网不通，必须装 coturn

4. **OpenJPA 比 Hibernate 冷门**：找人维护或排查 ORM 问题时社区资源少 5-10 倍；新项目不建议跟着选 OpenJPA

5. **Wicket session 内存吃紧**：服务端组件把状态放 session，1000 并发会议 session 占用很可观；要调 servlet container 的 session 持久化策略

## 适用 vs 不适用场景

**适用**：

- 中小企业内部自托管会议——10-50 人规模，Apache-2.0 闭源衍生友好
- Java 技术栈团队——已有 Spring/Hibernate 知识，不想引 Node/Scala/Erlang
- 预算紧但需要 "会议 + 白板 + 录像 + 文档共享" 全套——一个进程一次部署

**不适用**：

- 教育场景深度集成 LMS → 用 [[bigbluebutton]]，LTI 标准 + breakout room + 事件流录像更专业
- 直播 / 一推多拉场景 → 用 [[ovenmediaengine]]，OM 不是为大观众设计
- 异步聊天为主 → 用 [[mattermost]]，OM 聊天功能弱
- 需要现代 SPA 前端体验 → Jitsi Meet 更顺手
- 千人级并发 → 单 JVM 扩不动，要么换 BBB+Scalelite 要么换商业方案

## 历史小故事（可跳过）

- **2007 年**：Sebastian Wagner 在德国发起，初版基于 OpenLaszlo（Flash 编译器）+ Red5（Java 实现的 RTMP）
- **2011 年**：进入 Apache 软件基金会孵化器，开始按 Apache 流程治理
- **2012 年**：升级为 Apache 顶级项目（TLP），改名 Apache OpenMeetings
- **2018 年前后**：Flash 终结大潮迫使切 HTML5 + WebRTC，引入 Kurento；这一刀比 [[bigbluebutton]] 晚 1-2 年
- **2020+**：远程办公风口被 Zoom/Teams/Jitsi/BBB 抢走，OM 维持稳定但增长放缓；仍是 Apache 基金会少数活跃的实时协作项目

## 学到什么

1. **单进程内嵌 vs 多进程编排是会议系统的两条主路**——OM 走简，BBB 走分层；选型看团队规模和扩容需求
2. **服务端组件框架 vs SPA 是前端的另一条岔路**——Wicket 让 Java 程序员零学习成本，但牺牲交互流畅度；现代主流押 SPA
3. **ORM 抽象 6 种数据库是 OpenJPA 的卖点也是冷门点**——卖点能落地但社区资源稀薄是代价
4. **Apache-2.0 是商用最友好的 OSS 协议**——比 BBB 的 LGPL、OME 的 AGPL 都宽松，闭源衍生无传染
5. **媒体栈选型仍要看上游活跃度**——Kurento 停滞的坑 BBB 已踩过一次，OM 可能轮到下一个

## 延伸阅读

- 官网：[openmeetings.apache.org](https://openmeetings.apache.org/)（含 demo 和文档）
- 安装文档：[openmeetings.apache.org/installation.html](https://openmeetings.apache.org/installation.html)
- API 文档：[openmeetings.apache.org/RestAPI.html](https://openmeetings.apache.org/RestAPI.html)
- 同类对比：[[bigbluebutton]]（教学场景多组件）/ [[ovenmediaengine]]（直播 SFU）/ Jitsi Meet（通用会议 SPA 前端）
- [[mattermost]] —— 异步聊天为主，对比 OM 同步会议的镜像设计

## 关联

- [[bigbluebutton]] —— 同样开源 Web 会议但路线相反：BBB 多进程编排 + 教学场景 + LGPL；OM 单 JVM + 通用会议 + Apache-2.0
- [[ovenmediaengine]] —— 同样 WebRTC 但定位 "一推多拉直播"；OM 是 N×N 会议，与 OME 在 WebRTC 协议族里走两条路
- [[mattermost]] —— 同样自托管协作平台但定位 "异步聊天"；OM 反过来是 "同步会议"，互为镜像

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigbluebutton]] —— BigBlueButton — 教育向开源 Web 会议平台（HTML5 + WebRTC + 白板）
- [[mattermost]] —— Mattermost — Slack 的开源自托管替代（Go 服务端 + React 客户端）
- [[ovenmediaengine]] —— OvenMediaEngine — 亚秒级直播流媒体服务器

