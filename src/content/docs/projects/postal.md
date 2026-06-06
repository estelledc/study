---
title: Postal — 自托管的 Mailgun / SendGrid 替代
来源: https://github.com/postalserver/postal
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Postal 是一个**用 Ruby on Rails 写的开源 transactional 邮件投递平台**。日常类比：像自家厨房版的"外卖配送中心"——SendGrid / Mailgun / Postmark 是别人开的连锁店（你按单付费），Postal 是同样的设备和流程搬到自家服务器，只是**所有运营开销自己扛**。

它专门做"程序触发的单封邮件"——注册验证、密码重置、订单收据、推送通知。**不是**面向终端用户的收件箱（那是 mailcow / Dovecot 的活）。

GitHub **16k stars**，MIT 协议，最早由英国主机商 Krystal Hosting 写来给自己处理客户邮件，2017 年开源后由社区维护，如今每天处理几百万封邮件。

```bash
# 最小依赖跑起来
docker compose up -d  # 起 postal + mariadb + rabbitmq
postal initialize      # 建库 + admin 账号
postal make-user       # 创建第一个登录用户
```

打开 `https://你的域名` 进管理 UI，建 organization → mail server → credential，调 HTTP API 就能开始发。

## 为什么重要

不理解 Postal，下面这些事都没法解释：

- 为什么"发邮件"看起来一行 `smtp.send()` 的事，背后却要 RabbitMQ + MariaDB + worker 池——单封邮件从入队到 ISP 接收的**生命周期**远比你想的长
- 为什么 transactional 邮件平台**清一色都做 IP pool**——发件方 IP 信誉是个长期资产，不能跟 marketing bulk 邮件混
- 为什么 self-host 邮件这件事**听起来酷做起来痛**——投递率不是技术问题，是"你的 IP 在 Gmail 黑名单里待了多久"的政治问题
- 为什么 webhook 在邮件系统里是一等公民——bounce / complaint / open / click 不推回业务系统，下次你就不知道用户的邮箱已经死了

## 核心要点

Postal 的运行时由 **5 个组件**串起来：

1. **Web Server (Rails)**：管理 UI + HTTP API。建 org / 看日志 / 调 send 都走这里
2. **SMTP Server**：自己写的 SMTP 实现（不是 Postfix），处理收发连接
3. **Worker**：从队列里取消息，做 SPF/DKIM 签名、调 ISP 的 SMTP、记录投递结果
4. **MariaDB / MySQL**：组织、邮件服务器、credential、消息日志，全在 SQL
5. **RabbitMQ**：组件之间传消息的管道——API 收到一封 → 写 RabbitMQ → Worker 取出去发

**一条主线**：业务系统调 HTTP API → API 写库 + 入 RabbitMQ → Worker 出队列 → SMTP 连 ISP → 投递成功/失败回写 → webhook 推回业务系统。

**层级模型**：Postal 把邮件账户切成三层 `Organization → Mail Server → Credential`。一个 org 下挂多个 mail server（按业务线 / 按租户分），每个 mail server 下发多个 credential（按调用方分）。这样**封号粒度细到 credential**——某个 client 滥用，吊销它的 token 就行，其他 mail server 不受影响。

## 实践案例

### 案例 1：HTTP API 发一封邮件

```bash
curl -X POST https://你的域名/api/v1/send/message \
  -H "X-Server-API-Key: <credential token>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["alice@example.com"],
    "from": "noreply@yourdomain.com",
    "subject": "Welcome",
    "plain_body": "Hi Alice"
  }'
```

返回 `message_id`。Postal 把它入 RabbitMQ，Worker 异步处理，UI 上能看到 "Held → Sent → Delivered" 的状态变化。

### 案例 2：Webhook 把投递结果推回业务系统

在 mail server 设置里加一个 webhook URL，Postal 会在事件发生时 POST 过来：

```json
{
  "event": "MessageBounced",
  "message_id": "abc123",
  "recipient": "alice@example.com",
  "details": "550 5.1.1 mailbox does not exist"
}
```

业务系统收到后把这个邮箱标记为"死信"，下次群发跳过。这一步**不做**的话，发件方 IP 信誉会被 ISP 持续降级。

### 案例 3：IP pool 怎么用

一个 org 可以挂多个 IP，分组成 pool：

- pool A：高信誉老 IP，发关键邮件（密码重置）
- pool B：新 warmup 中的 IP，只发低优先级（营销）
- pool C：批量邮件专用，万一被 block 不影响交易邮件

每个 mail server 指定用哪个 pool，做"鸡蛋不放一个篮子"。

### 案例 4：消息状态机

Postal UI 的消息日志页能看到一封邮件的完整生命周期：

```
Held（API 收到，等 Worker）
 → Sent（已交给目标 ISP 的 SMTP）
 → Delivered（ISP 返回 250 OK）
 → 或 SoftFail（4xx，临时失败，会重试）
 → 或 HardFail（5xx，永久失败，进死信）
 → Bounced（事后被退信）
```

排查"邮件没收到"时第一站永远是看这条状态线，能 30 秒区分**没发出去**（Held 卡住 = Worker 死了）还是**ISP 拒收**（HardFail = 看 details 字段里的 SMTP 错误码）。

## 踩过的坑

1. **云厂商 IP 默认被 Gmail / Microsoft block**：AWS / DigitalOcean / GCP 的 IP 段大部分在反垃圾名单里。Postal 装好了发不出去**不是 Postal 的问题**，是 IP 选错了。要么用住宅 IP / 干净机房，要么花钱买"已 warmup"的 IP。

2. **IP warmup 要 2-4 周**：新 IP 第一天发 50 封，第二天 100 封，慢慢爬到几千封——爬太快直接进黑名单。这件事 Postal **不会替你做**，要自己写脚本控制 rate limit。

3. **MariaDB / RabbitMQ 不是无状态**：备份策略不能漏。MariaDB 挂了消息日志全丢，RabbitMQ 挂了队列里 in-flight 的邮件可能重复发。生产部署得做 replication + 监控。

4. **bounce 不处理 = 自杀**：用户填错邮箱 → 你一直发 → ISP 看到高 bounce rate → 把你 IP 拉黑。webhook 必须接，业务系统必须有"死信表"。

5. **2.x 版本架构换了**：早期 Postal 强依赖 RabbitMQ，2.0 之后部分组件改用 MariaDB 做队列，老教程的 docker-compose 直接抄会缺组件。

## 适用 vs 不适用场景

**适用**：
- 月发量 50k+ 起步，托管服务费用开始肉疼
- 数据主权要求（GDPR / HIPAA / 国产合规），邮件正文不能给第三方
- 已经有 DevOps 团队，能 IP warmup + blocklist 监控
- 多租户 SaaS：每个租户一个 org / mail server，credential 隔离天然适配

**不适用**：
- 月发量 < 50k：SendGrid 免费档 100 封/天 + 低价档已经够，自托管净亏
- 邮件是关键路径（密码重置 / 一次性验证码）：投递率不能赌，托管服务的 ISP 关系不是钱能短期买到的
- 团队没 sysadmin：邮件运维比想象复杂，IP / DNS / 反垃圾每一项单独都是坑
- 想要收件箱（IMAP/POP3 给真人用）：Postal **只发不收终端邮件**，要这个用 mailcow

## 学到什么

1. **transactional 邮件 ≠ 邮箱服务器**：前者是"一次性触发的程序邮件"，后者是"长期存放用户邮件"。架构不一样，工具不一样
2. **IP 信誉是核心资产**：技术只占发邮件这件事的 30%，剩下 70% 是 IP / 域名 / 历史发送行为的长期声誉
3. **异步队列是邮件平台的脊柱**：RabbitMQ + Worker 池让"高峰期 10 万封/分钟"和"重试退避"两件事都能优雅处理
4. **webhook = 反向数据流**：发出去之后的命运（bounce / open / click）不推回来，业务系统就是瞎子
5. **三层账户模型适合多租户**：org / mail server / credential 这种切法不仅是 Postal 的，几乎所有面向开发者的发邮件 SaaS 都长这样——值得抄到自家"对外 API"的权限设计里
6. **自托管不是省钱第一**：算 TCO 时把 IP warmup 时间、运维人时、bounce 率监控算进去，月发量 < 50k 几乎一定亏。它的核心卖点是**控制权**，不是单价

## 延伸阅读

- 官网：[postalserver.io](https://postalserver.io/)（架构图 + 部署指南）
- 文档：[docs.postalserver.io](https://docs.postalserver.io/)（API / webhook / 监控）
- 源码：[github.com/postalserver/postal](https://github.com/postalserver/postal)（Ruby on Rails，读 `app/models/message.rb` 看消息状态机）

## 关联

- [[mailcow]] —— 同样自托管邮件，但做的是"完整邮箱服务"（IMAP + Webmail），和 Postal 互补不重叠
- [[nginx]] —— Postal 前面通常挂 nginx 做 TLS 终止 + 反代
- [[caddy]] —— nginx 的现代替代，自动 HTTPS 对单 VPS 部署 Postal 更友好
