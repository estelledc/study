---
title: Dovecot — 主流 IMAP/POP3 服务器
来源: https://github.com/dovecot/core
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Dovecot 是一台**专门让你的邮件客户端能拉到邮件**的服务器。日常类比：邮局把信送到小区门口的快递柜（Postfix 干这个），Dovecot 是**那个柜子本身**——它替你把信存好、给每户分格子、并且配合手机上的"取件 App"把信掏出来。

它实现两个协议：

- **IMAP**：长连接协议。客户端登上来后保持连接，服务器把整个邮箱目录、已读标记、搜索结果都同步给客户端。
- **POP3**：短连接协议。客户端连上来→把所有信下载回去→（一般会）从服务器删掉→断开。

绝大多数主流邮件 App（Apple Mail、Outlook、Thunderbird、QQ 邮箱客户端）背后服务器约有 7 成跑的是 Dovecot——GMX、Rackspace、OVH、Apple 托管邮箱都在用。

## 为什么重要

不理解 Dovecot，下面这些就糊：

- 为什么手机刚打开邮件 App 一秒就出新邮件——服务端长连接 + 索引文件
- 为什么 Postfix 和 Dovecot 永远配对出现——一个传一个收，分工清楚
- 为什么"邮件搜索"在 Outlook 里几百毫秒返回——服务端预建了 dovecot.index
- 为什么 IMAP 比 POP3 复杂这么多——POP3 拿走删掉就完事，IMAP 要在服务端维护**所有客户端共享的状态**

## 核心要点

### 一句话定位

```
SMTP（Postfix）→ LMTP → Dovecot 存盘 → 客户端 IMAP/POP3 拉
   收信传输          投递          访问
```

Postfix 是 **MTA**（Mail Transfer Agent，做信件中继传输）；Dovecot 是 **MDA + 访问服务**（Mail Delivery Agent + IMAP/POP3 server）。

### 多进程架构（安全 = 隔离）

Dovecot 启动后你 `lsof` 能看到三类进程：

- **master**：主守护进程，只做"监听端口 + fork 子进程"，不碰用户数据
- **imap-login / pop3-login**：登录前进程，做 TLS 握手 + 鉴权
- **imap / pop3**：每个登录后用户一个独立进程，跑在该用户的 UID 下

这样设计的好处：A 用户的 imap 进程**没有权限**读 B 用户的内存或邮箱目录。哪怕 imap 进程被攻击劫持，也只能炸掉这一个用户。

### 插件机制（动态 .so）

```conf
mail_plugins = quota acl fts sieve
```

写一行配置就动态加载对应的 `.so`：

- `quota`：磁盘配额
- `acl`：邮箱共享权限
- `fts`：全文搜索（背后接 Solr / Lucene）
- `sieve`：服务端规则过滤（"标题含 X 自动归档到 Y"）

思路和 Linux 内核模块一样——核心精简、扩展点全靠插件。

### 邮箱格式可插拔

| 格式 | 一句话 | 适用 |
|---|---|---|
| mbox | 一个用户一个大文件，所有邮件首尾相接 | 几百封以下 |
| Maildir | 一封信一个文件，按 new/cur/tmp 三目录 | 主流，几万封以内 |
| dbox / sdbox | Dovecot 自家高性能格式 | 百万邮件级 |

格式抽象在 `src/lib-storage`，上层不关心存储细节。

### 索引文件 = O(1) 体验

`dovecot.index` 是给邮箱目录建的小数据库，记录每封邮件的 UID、Flags、大小、内容偏移。结果：

- 显示"未读数 99+" → 读 index 一次就出，不扫信件正文
- 搜索 "subject:发票" → 命中 index/fts，不全表扫
- 标记已读 → 改 index flag，毫秒级

## 实践案例

### 案例 1：典型部署链路

```
外部互联网 → Postfix（25/587 端口） → LMTP（本地） → Dovecot 存盘
                                                       ↓
                            手机 App ← IMAP/993 ← Dovecot
```

Postfix 收下信，通过 LMTP（Local Mail Transfer Protocol）把信交给本机 Dovecot，Dovecot 落到 Maildir 或 dbox。客户端开 IMAP 连接拉。

### 案例 2：仓库目录速览

```
src/master/      master 守护进程，监听 + fork
src/imap/        imap 用户进程入口
src/pop3/        pop3 用户进程入口
src/lmtp/        LMTP 投递服务
src/auth/        认证（PAM/LDAP/SQL/OAuth2）
src/lib/         自家 C 工具库（防溢出 string、内存池）
src/lib-imap/    IMAP 协议解析编码
src/lib-storage/ 存储抽象（mbox/Maildir/dbox）
src/plugins/     可加载插件（quota、acl、fts、sieve）
```

阅读路径建议：`src/master/main.c` → `src/imap/main.c` → `src/lib-storage/`。

### 案例 3：Director 做高可用

多台 Dovecot 后端组集群时，"同一用户"需要落到"同一节点"——否则两个节点同时改一个邮箱目录会冲突。Dovecot Director 模块用一致性哈希把用户映射到节点，长连接级别保持亲和。

## 踩过的坑

1. **小看 IMAP 的"状态"**：IMAP 是长连接、有会话状态的协议。10 万用户在线 = 10 万个进程在跑——内存预算要按"每进程几 MB × 用户数"算。不是 HTTP 那种短请求模型。
2. **存储格式选错**：百万邮件级用 Maildir 会让文件系统 inode 爆掉，必须迁 dbox。前期选错后期迁很痛。
3. **认证后端搞混**：`auth` 子系统支持太多后端（PAM / passwd-file / LDAP / SQL / OAuth2），配错 dovecot.conf 直接 500 个用户登不上——日志先看 `auth_debug = yes`。
4. **没装 fts 就开搜索**：默认搜索是顺序扫，邮箱大了会卡几十秒。要装 `fts-solr` 或 `fts-lucene` 插件。

## 适用 vs 不适用

**适用**：

- 自建邮件服务（公司、社区、ISP）
- 需要 IMAP/POP3 标准协议、客户端无需改
- 想要插件化的二次开发

**不适用**：

- 只想转发不想存的场景 → 用 Postfix
- 想做 Web 邮件 UI → Dovecot 只管协议层，UI 用 Roundcube / SOGo

## 学到什么

1. **协议形态决定服务端形态**：IMAP 长连接 + 会话状态，把 Dovecot 推向多进程隔离架构
2. **隔离 = 安全**：每用户一进程，攻击面被切到最小
3. **抽象是为了演化**：存储格式抽象 + 插件机制让 20 年前的代码现在还在长
4. **索引文件思想**：服务端付出"建索引"的代价，换"客户端一秒出未读数"的体验

## 延伸阅读

- 官方文档：[doc.dovecot.org](https://doc.dovecot.org/)
- 仓库：[github.com/dovecot/core](https://github.com/dovecot/core)
- IMAP 协议本身：RFC 3501
- [[postfix]] —— 通常配对的 MTA
- [[redis]] —— 索引文件思想的另一种实现

## 关联

- [[postfix]] —— SMTP 一端，Dovecot 是 IMAP 一端，二者合起来 = 完整邮件栈
- [[redis]] —— 同样用"内存数据结构 + 持久化"做加速
- [[nginx]] —— 多进程 + master/worker 模型在 Web 服务器侧的同构

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mailcow]] —— mailcow — Docker compose 一键起一整套邮件服务
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[redis]] —— Redis — 内存键值数据库

