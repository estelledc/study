---
title: Haraka — 用 Node.js 写插件链式架构的 SMTP 服务器
来源: https://github.com/haraka/Haraka
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Haraka 是一个用 **Node.js 写的 SMTP 服务器**。SMTP 就是邮件协议——你按 send 按钮后，发件箱和收件箱之间靠它说话。Haraka 既能收（接外面打进来的邮件），也能发（把邮件投递出去）。

日常类比：像一家邮件分拣中心。门口（SMTP 端口 25/587）有人喊"我有信要寄"，分拣中心按一条流水线判断——是不是黑名单？地址写对没？内容是不是垃圾邮件？过了所有关才放进出库队列。

写一个最小插件长这样：

```js
exports.hook_rcpt = function (next, connection, params) {
  const rcpt = params[0]
  if (rcpt.host === 'evil.com') return next(DENY, '不收这个域')
  next()
}
```

一个文件就是一个插件。注册到对应 hook（这里是 RCPT TO 阶段），整条链就把它串进去。

## 为什么重要

不理解 Haraka，下面这些事都不好解释：

- 为什么有些团队宁可自建邮件网关也不用 Postfix——因为想用 JS 写反垃圾规则，热重载，不用学 m4 配置
- 为什么 SMTP 这么老的协议还有新实现——Node 单进程几千连接的 I/O 模型刚好契合 SMTP 的长连接特性
- 为什么"插件链"是基建项目的常见架构——Express 中间件、Webpack loader、Haraka hook 都是同一招

## 核心要点

Haraka 的设计可以拆成 **三块**：

1. **plugin chain（插件链）**：SMTP 的每个阶段（CONNECT / HELO / MAIL FROM / RCPT TO / DATA / queue / disconnect）都暴露成一个 hook。你写的插件挂到 hook 上，按 `config/plugins` 里的顺序串成链。类比：流水线的工位——工位顺序你能改，每个工位塞什么人由你决定。

2. **返回值即指令**：每个插件函数收一个 `next` 回调，调用 `next(CONTINUE)` 放行、`next(DENY, msg)` 拒收、`next(OK)` 终止本阶段直接进下一阶段。链上任一环 DENY，整封邮件就被拦截。类比：流水线任何一个工位喊"停"，传送带就停。

3. **outbound queue（出站队列）**：Haraka 收下来的邮件先落盘成文件队列，再由后台 worker 一封封投递出去。失败重试、bounce 回信、TLS 协商、连接池都在这一层。类比：分拣中心后院的发货区——白天进货，晚上慢慢发，发不出的退回邮筒。

底层是 Node 的 `net.Server`，一连接对应一个 `Connection` 对象，事件循环驱动。

## 实践案例

### 案例 1：最小服务器跑起来

```bash
npm install -g Haraka
haraka -i mailserver
cd mailserver
haraka -c .
```

四条命令一个 SMTP 服务器就在 25 端口起来了。`config/plugins` 列出默认启用的插件，把不要的注释掉，把自己写的塞进去就行。

### 案例 2：写一条反垃圾规则

需求：发件人域名带 `.xyz` 一律拒收。

```js
// plugins/block_xyz.js
exports.hook_mail = function (next, connection, params) {
  const sender = params[0]
  if (sender.host && sender.host.endsWith('.xyz')) {
    return next(DENY, '该域被本服务器策略拒绝')
  }
  next()
}
```

加到 `config/plugins`：

```
block_xyz
dnsbl
spamassassin
```

顺序很重要——`block_xyz` 在前，本地一秒拒掉；`dnsbl` 在后，要查外部 DNS 黑名单慢得多。

### 案例 3：感受 plugin chain 的威力

一封邮件进来，链路是：

```
CONNECT  → tls.js（启 STARTTLS）
HELO     → helo.checks（语法校验）
MAIL FROM→ block_xyz（自定义）→ spf（发件人域 SPF 验证）
RCPT TO  → rcpt_to.in_host_list（白名单收件域）
DATA     → data.headers（头部规范）→ dkim_verify → spamassassin
queue    → queue/smtp_forward（转发到下游）
```

每一段你都可以替换、重排、加自己的逻辑。同一份代码服务"邮件网关 / 反垃圾过滤 / 中继转发"三种角色——只是插件配置不同。

## 踩过的坑

1. **插件顺序敏感到病态**：reject 类插件必须排在 accept 类前面。把 `spamassassin` 放到 `queue` 之后等于"先收下垃圾邮件再判断"，磁盘已被填满。

2. **同步 I/O 直接拖垮 worker**：插件里用 `fs.readFileSync` 或同步数据库调用，事件循环卡住，几千个连接同时超时。所有 I/O 必须 async。

3. **outbound queue 的目录别放 NFS**：队列文件靠 rename 实现锁，NFS 上 rename 不原子，会出现两个 worker 同时投递同一封邮件。本地盘最稳。

4. **DKIM/SPF 默认不开**：装完默认配置只能收邮件，反垃圾完全裸奔。要手动启用 `dkim_verify`、`spf`、`dnsbl` 三个插件才有最低防线。

## 适用 vs 不适用场景

**适用**：
- 自建邮件网关，规则要常改、热重载、灰度发布
- 团队 JS 栈，不想再学一门 Postfix m4 配置
- 需要把 SMTP 和现代后端（Redis / Kafka / HTTP webhook）打通
- 中小流量（单机几百万封/天）的中继 / 过滤场景

**不适用**：
- 超大流量（一天几亿封）→ 用 Postfix / Exim 调优过的 C 实现更稳
- 不想自运维 → 直接用 SES / SendGrid / Mailgun
- 只想发邮件不收 → 客户端用 nodemailer 就够，不必上 SMTP server
- 想在浏览器或 Lambda 跑 → SMTP 长连接和短期 runtime 不匹配

## 历史小故事（可跳过）

- **2010 年前后**：Matt Sergeant（前 SpamAssassin 核心作者）想用 JS 写自己的 SMTP server，把"插件链"思路从 Perl qpsmtpd 搬到 Node。
- **2012 年**：Haraka 1.0 发布，定位"模块化、纯 JS、能在所有 Node 平台跑"。
- **之后十年**：被 Craigslist、DataPacket 等场景采用做企业邮件网关，社区维护 100+ 插件。

## 学到什么

1. **插件链是协议处理的通用解法**——SMTP 的每个阶段、HTTP 的每个 phase、消息队列的每个 stage 都能抽成 hook + 顺序配置
2. **返回值控制流**比 try/catch 更适合这种"链上任一环可以否决"的场景
3. **落盘队列 + 重试**是所有"必须送到的消息"的标配——邮件、推送、webhook 都长这样
4. **架构优雅 ≠ 默认安全**：Haraka 默认配置裸奔，安全要靠主动叠加插件——和很多基建项目一脉相承

## 延伸阅读

- 官方文档：[Haraka Plugin Architecture](https://haraka.github.io/core/Plugins/)
- SMTP 协议：[RFC 5321](https://datatracker.ietf.org/doc/html/rfc5321)（看一遍就懂为什么 hook 这么分）
- 对照阅读：[[apollo-server]] —— 同样是"schema + 中间件链"的服务器
- 同思想项目：[[postfix]] / [[exim]] —— 同领域 C 系老前辈

## 关联

- [[apollo-server]] —— 中间件链 + 插件机制的近邻设计
- [[signal-server]] —— 同样是"协议服务器 + 插件式扩展"的范式
- [[fastify]] —— Node 生态另一个 hook-driven 框架，思路同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端

