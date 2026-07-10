---
title: Postfix — 把 sendmail 拆成一群最小权限的小工
来源: https://github.com/vdukhovni/postfix
日期: 2026-05-31
分类: 基础设施 / 通信
难度: 中级
---

## 是什么

Postfix 是 1998 年 IBM 研究员 Wietse Venema 写的一个**邮件服务器**——准确说是 **MTA（Mail Transfer Agent，邮件传输代理）**。它在互联网上接收邮件、转发邮件、把邮件投到本地用户邮箱。它要替代的是当时统治了二十年的 sendmail。

日常类比：

- sendmail 像一个**一个人开的全能餐厅**——同一个老板既接待客人、又点菜、又下厨、又洗碗、又收银，权限一把抓
- Postfix 像**流水线分工**——前台只接客（smtpd），传菜员只送单（cleanup），厨师只做菜（local/smtp），洗碗工只洗碗（bounce），每个人只能进自己那间小屋

为什么这种拆分重要：sendmail 是单进程 setuid root，一旦哪段代码有漏洞，攻击者直接拿 root；Postfix 拆成十来个小进程，每个只能做自己那一档活，被攻破也只能动那一小块。

## 为什么重要

不理解 Postfix，下面这些事都没法解释：

- 为什么 1990s 几乎所有 Unix 服务器都跑 sendmail，而 Debian/Ubuntu 等不少主流发行版后来默认 MTA 切到 Postfix（仍有发行版默认 Exim 等）
- 为什么"邮件服务器"这种 80 年代的老技术现在还在每天跑——只要有 SMTP，就有 MTA
- 为什么 Postfix 和 nginx、Redis 一样被列为"工业级开源基础设施"——它们都是把一个老问题用更安全/更快的架构重写一遍
- 为什么 Google 等大型站点曾大规模使用并维护 Postfix（Wietse 后来也在 Google 继续维护），而不是从零自研 MTA

## 核心要点

Postfix 把传统 MTA 的活拆成 **三层** 来理解：

1. **多进程隔离**：master 进程像工头，按需 fork 一组小进程——`smtpd` 负责接外面的连接，`smtp` 负责往外投，`cleanup` 负责清洗邮件头，`qmgr` 管队列调度，`local` / `virtual` 负责落到本地用户。每个进程跑在不同 unix 用户下，chroot 到 `/var/spool/postfix`，互相看不到对方的文件。

2. **四档队列**：邮件不是收到就立刻投出去，先进 `incoming` → 排到 `active`（最多几百封同时跑）→ 投不出去的进 `deferred`（暂存重试，最长 5 天指数退避）→ 坏掉的进 `corrupt`（隔离不删）。每档是磁盘上的一个目录，崩了重启不丢邮件。

3. **配置直白**：只两个文件——`main.cf`（一堆 `key = value` 参数）+ `master.cf`（进程清单）。改 `main.cf` 后用 `postfix reload` 通知工头重读，**不用重启**。这一点是 sendmail 的反面——sendmail 配置是 m4 宏，写一行得查半天文档。

## 实践案例

### 案例 1：在 Linux 上看一眼 Postfix 在干什么

装好 Postfix 后随便起来：

```bash
sudo systemctl start postfix
ps -ef | grep postfix
```

会看到一串：

```
root      master
postfix   pickup
postfix   qmgr
postfix   smtpd  ← 收外面来信
postfix   smtp   ← 往外发信
```

`master` 是 root，其他全是 `postfix` 普通用户。这就是"最小权限"的物理体现。

### 案例 2：发一封信看队列流转

```bash
echo "test body" | mail -s "hi" you@example.com
mailq
```

`mailq` 列出当前队列。如果对方域名 DNS 查不到、或者对方服务器拒收，邮件不会消失，会停在 `deferred` 队列里，之后每隔几分钟到几小时重试，最多 5 天。这是 SMTP 协议本身要求的"尽力而为"语义。

### 案例 3：关掉开放中继（最常见配置）

`main.cf` 里这行决定谁能借你服务器往外发：

```
smtpd_relay_restrictions =
    permit_mynetworks
    permit_sasl_authenticated
    reject_unauth_destination
```

意思是：只有自己内网、或者登录过的用户、或者目标是自己服务的域，才允许中继；其他全拒。配错了变成"开放中继"，几小时内就被全球垃圾邮件机器人灌爆。

### 案例 4：用 lookup table 改写收件人

Postfix 一个隐藏特性：所有"名单"——别名、虚拟域、转发——共用一套 lookup 抽象。比如把 `support@example.com` 全部转给三个人：

```
# /etc/postfix/virtual
support@example.com  alice@example.com bob@example.com carol@example.com
```

再 `postmap /etc/postfix/virtual` 编译成哈希表。后端可以无缝换成 LDAP / MySQL / PostgreSQL，配置语法不变。这种"接口不变、后端可换"的设计是 Postfix 长寿的另一个原因。

## 踩过的坑

1. **改完配置用 reload 不用 restart**：`postfix reload` 通知 master 重读 `main.cf`，正在跑的连接不断；`restart` 会断所有活动连接

2. **VPS 上 25 端口被封**：很多云商默认封禁出站 25（防垃圾邮件），Postfix 配好了但邮件卡在 deferred——这是网络层问题不是配置错

3. **smtpd_recipient_restrictions 和 smtpd_relay_restrictions 容易混**：前者管"这封信收件人是不是合法"，后者管"这台机器能不能帮人转发"，写错位置等于没设防

4. **TLS 证书路径错 → STARTTLS 协商失败**：smtpd 启动看似正常，对端连上才报错，得看 `/var/log/mail.log` 才能定位

5. **Postfix 不做 DKIM 签名**：现代邮件要 SPF/DKIM/DMARC 三件套才能投到 Gmail 的收件箱，Postfix 本体只管投递，DKIM 签名要配 OpenDKIM 插件

## 适用 vs 不适用场景

**适用**：
- 自托管邮件服务器（公司域名邮箱、社区邮件列表）
- 应用系统的发信中转（注册验证邮件、通知邮件）
- 替代老旧 sendmail 部署
- 高并发邮件投递（每秒数千封不成问题）

**不适用**：
- 只发不收的纯 API 场景 → 用 SendGrid / Mailgun / SES 这种 SaaS 更省事
- 不想碰 DNS / SPF / DKIM / IP 信誉 → SaaS 替你处理
- 单机小服务想要极简 → 用 OpenSMTPD 或者 msmtp 转发到外部 relay

## 历史小故事（可跳过）

- **1998 年**：Wietse Venema 在 IBM T.J. Watson 研究院内部写了 VMailer，目的是给 sendmail 一个安全替代
- **1999 年**：开源发布，改名 Postfix（"post fix"——邮局后修）
- **2000s**：Wietse 加入 Google 继续维护；几乎所有 Linux 发行版默认 MTA 从 sendmail 切到 Postfix
- **2010s**：TLS、DANE、IPv6 等现代特性陆续进入主线
- **2020s**：Viktor Dukhovni（vdukhovni）维护 GitHub 上权威 mirror；官方代码仍走 SVN（postfix.org），GitHub 是镜像

到 2026 年依然是大量自托管邮件、企业内网中继的默认选择。

## 学到什么

1. **多进程 + 最小权限是 1990s 服务端安全的一个关键转折**——不是改算法，是改架构
2. **磁盘队列 + 重试** 是 SMTP "尽力而为" 语义的物理实现，崩了不丢
3. **配置文件可以很直白**——`main.cf` 的可读性是 Postfix 战胜 sendmail 的隐藏武器
4. **老技术不死**——SMTP 是 1982 年的协议，MTA 这个角色 40 年没变，但实现一直在迭代

## 延伸阅读

- 官方文档：[Postfix Documentation](https://www.postfix.org/documentation.html)
- 配置入门：[Postfix Basic Configuration](https://www.postfix.org/BASIC_CONFIGURATION_README.html)
- 设计文档：[Wietse Venema — Postfix Architecture](https://www.postfix.org/OVERVIEW.html)
- [[nginx]] —— 同样把单进程旧架构换成多进程/事件驱动新架构
- [[redis]] —— 另一个工业级 C 写的网络服务示范

## 关联

- [[nginx]] —— 都是把"老软件 + 单进程"换成"新架构 + 多进程/事件"的代表
- [[redis]] —— 同为 C 写的工业基础设施，单线程对照 Postfix 多进程
- [[kafka]] —— 队列设计思路对照：Postfix 用磁盘目录队列，Kafka 用 append-only log
- [[envoy]] —— 都把"多进程隔离 + 配置即数据"作为核心架构选择
- [[haproxy]] —— 同为 C 写的高并发网络组件，单进程事件驱动对照 Postfix 多进程拆分

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
