---
title: Nodemailer — Node.js 发邮件的事实标准
来源: https://github.com/nodemailer/nodemailer
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 入门
provenance: pipeline-v3
---

## 是什么

Nodemailer 是一个**让 Node.js 应用发送邮件的库**。日常类比：像家里那台只管"把信塞进邮筒"的小机器——你告诉它收件人、标题、正文，它去搞定后面那一长串协议握手、登录、附件编码、签名。

最短的能跑示例：

```js
import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: "smtp.example.com",
  port: 587,
  auth: { user: "you@example.com", pass: "app-password" },
})

await transporter.sendMail({
  from: "you@example.com",
  to: "friend@example.com",
  subject: "Hello",
  text: "第一封从代码发出去的邮件",
})
```

GitHub **17k stars**，MIT 许可，npm 周下载 700 万次。Node.js 生态发邮件几乎只用它——没有"它和谁谁谁竞争"，只有"它和它的不同 transport"。

## 为什么重要

不理解 Nodemailer，下面这些事都没法做：

- 应用注册邮件 / 找回密码 / 双因素验证码——后端发出口几乎只有 SMTP 这一条路
- **邮件协议族 (SMTP / DKIM / SPF / OAuth2)** 单独学每个都很枯燥，Nodemailer 把它们包成一个对象，让你**先发出去再回头看协议**
- Node.js **零依赖库** 的范例——它不引一个第三方 npm 包，纯 Node 标准库写完整套 SMTP 客户端，安全审计极简单

## 核心要点

整个 API 围绕**两个动作**：

1. **造一个 transporter（运输工具）**——告诉它"用什么协议、连哪台服务器、用谁的身份认证"
2. **调 sendMail()**——把信封 + 信纸交给它

`createTransport` 接收的 options 决定了**走哪条路**：

| transport | 何时用 | 实质 |
|---|---|---|
| SMTP | 自建邮件服务器 / Gmail / Outlook | TCP 连 25/465/587 端口 |
| SMTP pool | 批量发，要复用连接 | 几条 SMTP 连接轮流用 |
| AWS SES | 量大、要送达率 | 走 AWS HTTPS API |
| sendmail | Linux 本地有 sendmail | 调本地二进制 |
| stream | 单测，不真发 | 把邮件写到字符串 |

**认证方式**也分三种：

- 用户名 + 密码（PLAIN/LOGIN）——最简单，但 Gmail 2022 起禁了
- App Password——Gmail / Outlook 给"传统应用"留的后门
- **OAuth2**（在 SMTP 里也叫 XOAUTH2）——现代推荐，token 过期自动刷新

## 实践案例

### 案例 1：发一封带附件 + 内嵌图片的 HTML 邮件

```js
await transporter.sendMail({
  from: '"运营" <ops@example.com>',
  to: "user@example.com",
  subject: "你的发票",
  html: '<p>请见正文图片：<img src="cid:logo"></p>',
  attachments: [
    { filename: "invoice.pdf", path: "./invoice.pdf" },
    { filename: "logo.png", path: "./logo.png", cid: "logo" },
  ],
})
```

`cid:logo` 是邮件协议里的"内嵌资源 id"——HTML 引用它，附件那边声明 `cid: "logo"`，邮件客户端就把图片**嵌进正文**而不是当附件。

### 案例 2：用 Ethereal 在不真发的情况下看效果

学的时候最烦的就是"我不知道发出去到底长啥样"。作者自己运营了一个测试邮箱服务 **Ethereal**：

```js
const account = await nodemailer.createTestAccount()
const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  auth: { user: account.user, pass: account.pass },
})

const info = await transporter.sendMail({ /* ... */ })
console.log(nodemailer.getTestMessageUrl(info))
// 打印一个 https://ethereal.email/message/xxx 链接
```

打开那个链接，邮件已经躺在网页上——不打扰任何真实收件人，方便联调。

### 案例 3：用 Gmail OAuth2 发邮件

```js
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: "you@gmail.com",
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    refreshToken: GOOGLE_REFRESH_TOKEN,
  },
})
```

Nodemailer 内部会用 refresh_token 去 Google 换 access_token，过期自动续——你只管 `sendMail`。

## 踩过的坑

1. **Gmail 用密码会一直 535 认证失败**：Google 2022 年起禁了 "Less secure apps"。要么用 App Password（开了二次验证后生成），要么走 OAuth2。

2. **云厂商封 25 端口**：AWS / GCP / 阿里云默认禁出站 25，本机起 SMTP 客户端连别人的 25 也常被拦。**走 587 (submission) 或 465 (smtps)** + 经过认证的服务商。

3. **`pool: true` 让进程不退出**：连接池没关，event loop 一直有活动 socket。脚本结尾要 `transporter.close()`。

4. **中文乱码 90% 是字段写错**：传 `text: "中文"` 或 `html: "<p>中文</p>"` 时 Nodemailer 自动 UTF-8。**别手动拼 raw stream**——一旦走 stream/raw，编码就要自己声明。

5. **忘 `await`，进程退出邮件没发**：`createTransport` 同步、`sendMail` 异步。短脚本里没 await，主线程结束 socket 还没握完手就 GG。

## 适用 vs 不适用场景

**适用**：

- Node.js 后端的所有事务性邮件（注册 / 重置密码 / 通知）
- 中小批量营销邮件（结合 SES + DKIM）
- CI / 监控系统的告警邮件
- 配 Bull / BullMQ 做**异步邮件队列**

**不适用**：

- 浏览器前端（库是 Node-only，浏览器没有 socket）
- 纯静态站点（要起 serverless function 或后端）
- 需要**打开率 / 点击追踪 / Webhook 回执** —— 用 SendGrid / Mailgun / Resend 这类托管 SaaS
- 大规模营销（百万级）—— 直接接 SES API 或专业 ESP

## 历史小故事（可跳过）

- **2010 年**：Andris Reinman（爱沙尼亚开发者）开源 Nodemailer，比 npm 1.0 还早一年。
- 同作者后续写了 **smtp-server**（收邮件的服务端）、**ZoneMTA**（出站邮件中继）、**WildDuck**（IMAP 服务器）、**EmailEngine**（IMAP 转 HTTP API）——形成一整套 Node.js 邮件全家桶。
- v6 (2020) 开始改成 **MIT-0** 许可——比 MIT 更宽松，连署名都可以省。
- 16 年没换主作者、没大版本断裂、API 形状基本不变——开源软件里少见的稳定。

## 学到什么

1. **抽象"信封 + 信纸"** 比"协议握手"更适合做 API——绝大多数用户不关心 EHLO / STARTTLS 的细节
2. **零依赖** 是一种生产级承诺——别人 audit 你的代码只看本仓库就够
3. **transport 抽象** 让"换底层"零成本：从自建 SMTP 切到 SES，只改 `createTransport` 那一行
4. **测试邮箱（Ethereal）** 是作者很有共情心的设计——把"发不出去 / 看不到效果"这个新人卡点直接消除

## 延伸阅读

- 官方文档：[nodemailer.com](https://nodemailer.com/)（每个 transport / 选项都有完整示例）
- 仓库：[github.com/nodemailer/nodemailer](https://github.com/nodemailer/nodemailer)
- Ethereal 测试邮箱：[ethereal.email](https://ethereal.email/)
- [[express]] —— 最常一起用的 Node.js Web 框架
- [[fastify]] —— 另一个常见 Node.js 后端起点
- [[mailcow]] —— 自建一整套**收发邮件**服务（Nodemailer 是发，mailcow 是全栈）

## 关联

- [[express]] —— Express 后端 + Nodemailer 是 Node.js 应用最常见组合
- [[fastify]] —— 同理，事务邮件 hook 进路由 handler
- [[mailcow]] —— Nodemailer 发邮件，邮件可以发到自建的 mailcow；学协议双向理解
- [[apollo-server]] —— GraphQL 后端发邮件场景（注册 mutation 后触发邮件）
