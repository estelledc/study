---
title: Dovecot — 主流 IMAP/POP3 服务器
来源: https://github.com/dovecot/core
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

Dovecot 是一台**专门让你的邮件客户端能拉到邮件**的服务器。日常类比：邮局把信送到小区门口的快递柜（Postfix 干这个），Dovecot 是**那个柜子本身**——它替你把信存好、给每户分格子，并配合手机上的「取件 App」把信掏出来。

它实现两个协议：

- **IMAP**：长连接。客户端保持在线，服务器同步邮箱目录、已读标记、搜索结果。
- **POP3**：短连接。客户端连上 → 下载邮件 →（常会）从服务器删除 → 断开。

GMX、Rackspace、OVH 等托管邮箱，以及不少自建邮件栈，都把 Dovecot 当作 IMAP/POP3 访问层；它和 Postfix 常成对出现。

## 为什么重要

不理解 Dovecot，下面这些就糊：

- 为什么手机刚打开邮件 App 一秒就出新邮件——服务端长连接 + 索引文件
- 为什么 Postfix 和 Dovecot 永远配对出现——一个传一个收，分工清楚
- 为什么「邮件搜索」能几百毫秒返回——服务端预建了 `dovecot.index` / FTS
- 为什么 IMAP 比 POP3 复杂这么多——IMAP 要在服务端维护**所有客户端共享的状态**

## 核心要点

### 一句话定位

```
SMTP（Postfix）→ LMTP → Dovecot 存盘 → 客户端 IMAP/POP3 拉
   收信传输          投递          访问
```

Postfix 是 **MTA**（Mail Transfer Agent，信件中继）；Dovecot 是 **MDA + 访问服务**（投递落盘 + IMAP/POP3）。

### 多进程架构（安全 = 隔离）

- **master**：只监听端口并 fork，不碰用户数据
- **imap-login / pop3-login**：TLS 握手 + 鉴权
- **imap / pop3**：登录后每用户一进程，跑在该用户 UID 下

A 用户的 imap 进程**没有权限**读 B 用户邮箱；被劫持也只影响这一户。

### 插件与存储

```conf
mail_plugins = quota acl fts sieve
mail_location = maildir:~/Maildir
```

`quota` / `acl` / `fts` / `sieve` 以 `.so` 动态加载。存储可选 mbox（小邮箱）、Maildir（主流，约几万封内）、dbox（百万级）。`dovecot.index` 让未读数、flag、粗搜索走 O(1) 路径。

## 实践案例

### 案例 1：最小可跟做配置骨架

```conf
# /etc/dovecot/dovecot.conf（示意）
protocols = imap lmtp
mail_location = maildir:~/Maildir
ssl = required
```

逐步看：

1. `protocols`：对外开 IMAP，对内收 Postfix 的 LMTP 投递。
2. `mail_location`：每用户一棵 Maildir（`new/` / `cur/` / `tmp/`）。
3. `ssl = required`：强制加密，避免明文密码上线。

### 案例 2：用 doveadm 看邮箱与索引

```bash
doveadm mailbox list -u alice
doveadm index -u alice INBOX
doveadm search -u alice mailbox INBOX subject 发票
```

逐步看：

1. `mailbox list`：列出该用户文件夹，确认存储抽象工作正常。
2. `index`：重建 `dovecot.index`，未读数/flag 不再全表扫。
3. `search`：走索引/FTS；若未装 `fts-*` 插件，大邮箱会退化成顺序扫。

### 案例 3：Director 做多机亲和

多台后端时，同一用户必须落到同一节点，否则并发改同一 Maildir 会冲突。Director 用一致性哈希把用户映射到节点，IMAP 长连接保持亲和。

适合大约数千到数万在线会话的水平扩展：前面用 Director（或同类代理）做用户亲和，后面多台 Dovecot 只服务「自己的」用户集合——这不是单机「再加插件」能解决的问题。

## 踩过的坑

1. **小看 IMAP 状态**：10 万在线 ≈ 10 万进程，内存按「每进程数 MB × 用户数」预算，不是 HTTP 短请求模型。
2. **存储格式选错**：百万邮件级用 Maildir 易打爆 inode，应迁 dbox；后期迁移很痛。
3. **认证后端配错**：PAM / LDAP / SQL / OAuth2 配错会成批登不上——先开 `auth_debug = yes` 看日志。
4. **没装 FTS 就开搜索**：默认顺序扫，大邮箱可卡几十秒；需 `fts-solr` 或 `fts-lucene`。

## 适用 vs 不适用

**适用**：

- 自建邮件（公司 / 社区 / ISP），大约数百到数万用户、标准 IMAP/POP3 客户端
- 需要插件化二次开发（配额、ACL、Sieve、FTS）
- 与 Postfix 组成完整收发栈

**不适用**：

- 只想转发不想存 → 用 Postfix 即可
- 想做 Web 邮件 UI → Dovecot 只管协议层，UI 用 Roundcube / SOGo
- 超大规模多活写同一邮箱 → 需 Director/对象存储方案，不是默认单机 Maildir

## 历史小故事（可跳过）

- **2002 年前后**：Timo Sirainen 开始写 Dovecot，目标是比当时 UW-IMAP / Cyrus 更安全、更好配的开源 IMAP 服务器
- **2000s 中后期**：Maildir + 索引文件路线站稳，自建邮件栈开始广泛采用
- **2.x 时代**：插件、dbox、Director、FTS 等能力成熟，进入托管邮箱与 ISP 场景
- **今天**：仍是 Linux 自建邮件访问层的常见默认选择，与 Postfix 文档成对出现

## 学到什么

1. **协议形态决定服务端形态**：IMAP 长连接 + 会话状态 → 多进程隔离
2. **隔离 = 安全**：每用户一进程，攻击面被切开
3. **抽象是为了演化**：存储格式 + 插件让老代码还能长新能力
4. **索引换体验**：服务端建索引，换客户端一秒出未读数

## 延伸阅读

- 官方文档：[doc.dovecot.org](https://doc.dovecot.org/)
- 仓库：[github.com/dovecot/core](https://github.com/dovecot/core)
- IMAP 协议：RFC 3501
- [[postfix]] —— 通常配对的 MTA
- [[nginx]] —— master/worker 多进程模型的对照

## 关联

- [[postfix]] —— SMTP 一端；与 Dovecot 合起来 = 完整邮件栈
- [[mailcow]] —— 把 Postfix + Dovecot 等打成一键邮件套件
- [[nginx]] —— 多进程 + master/worker 在 Web 侧的同构
- [[haproxy]] —— 多机部署时常见的前端负载与亲和层
- [[redis]] —— 「预计算结构换读延迟」的另一种实现
- [[docker]] —— 自建邮件栈常被容器化交付
- [[ansible]] —— 批量下发 dovecot.conf / 证书的常见方式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mailcow]] —— mailcow — Docker compose 一键起一整套邮件服务
