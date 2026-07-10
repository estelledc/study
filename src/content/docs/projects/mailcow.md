---
title: mailcow — Docker compose 一键起一整套邮件服务
来源: https://github.com/mailcow/mailcow-dockerized
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

mailcow（**mailcow-dockerized**）是一个**用 docker-compose 把 13 个邮件相关容器打包成一键部署**的开源项目。日常类比：像宜家家具——零件（Postfix、Dovecot、Rspamd 等）都是独立的成熟组件，mailcow 把它们装进一个箱子，附一张说明书，让你在 VPS 上半小时拼出能发能收的邮件系统。

你只要：

```bash
git clone https://github.com/mailcow/mailcow-dockerized
cd mailcow-dockerized
./generate_config.sh   # 问你域名/时区，生成 mailcow.conf
docker compose up -d
```

20 分钟后，浏览器打开 `https://你的域名`（默认 `HTTPS_PORT=443`；若前面还有反代，才常改成 `8443`），登录 admin 账号，加邮箱/域名/DKIM——全是点鼠标。

GitHub **10k stars**，AGPLv3，适合中小企业自托管邮件、个人多域名邮箱。

## 为什么重要

不理解 mailcow，下面这些事都没法体验：

- 邮件协议族（SMTP / IMAP / SPF / DKIM / DMARC / RBL / 反垃圾 / 反病毒）单独学每个都难，mailcow 让你**先把整套跑起来**再回头看协议
- 它是 **「多容器编排怎么真用」的范例**——13 个服务、依赖关系、共享卷、健康检查、日志聚合，都在一个 compose 文件里
- 证明 self-hosted 邮件**不是禁区**：一台 IP 干净的 VPS + 正确的反向 DNS，就能跑出和 Gmail 一样的协议栈

## 核心要点

mailcow 编排的 **13 个容器**按职责分组：

1. **收发主链路**：`postfix-mailcow`（SMTP MTA）+ `dovecot-mailcow`（IMAP/POP3 + 用户认证）
2. **过滤层**：`rspamd-mailcow`（反垃圾 + DKIM 签名）+ `clamd-mailcow`（反病毒）+ `olefy-mailcow`（Office 宏检测）
3. **应用层**：`sogo-mailcow`（Webmail + 日历 CalDAV/CardDAV）+ `nginx-mailcow`（反代 + 管理 UI）
4. **数据层**：`mysql-mailcow`（MariaDB，存账号/别名/规则）+ `redis-mailcow`（缓存 + ratelimit）+ `solr-mailcow`（全文索引）
5. **基础设施**：`unbound-mailcow`（递归 DNS，避免依赖外部）+ `acme-mailcow`（Let's Encrypt 自动续签）+ `watchdog-mailcow`（健康检查 + 自愈）

**一条主线串起来**：邮件进入 → Postfix 收 → Rspamd 过滤 → Dovecot 投递 → 用户用 IMAP/SOGo 取。

## 实践案例

### 案例 1：mailcow.conf 是怎么把所有容器串起来的

`mailcow.conf` 是顶层配置，30 多个变量，最关键的几个：

```bash
MAILCOW_HOSTNAME=mail.example.com   # 邮件服务的 FQDN
HTTP_PORT=80                        # 给 Let's Encrypt 验证用
HTTPS_PORT=443                      # 给 Webmail / 管理 UI
SMTP_PORT=25
SMTPS_PORT=465
SUBMISSION_PORT=587
IMAPS_PORT=993
TZ=Asia/Shanghai
SKIP_CLAMD=n                        # 1G 小机器可设 y 关掉省 1.5G 内存
```

`docker-compose.yml` 里每个 service 用 `${VAR}` 读这个文件，于是改一处变量，整个栈跟着变。

### 案例 2：管理 UI 加一个邮箱时，背后发生什么

你在 8443 UI 点「添加邮箱」，输入 `alice@example.com`：

1. PHP 后端写一行进 MariaDB 的 `mailbox` 表
2. Dovecot 下次认证查询时，从 SQL 拿到密码哈希校验
3. Postfix 的 `virtual_mailbox_maps` 也指向同一张表，所以收件路由立刻生效
4. SOGo 同样查 SQL，Webmail 自动看到这个账号

**没有重启**——因为 Postfix/Dovecot 的 SQL map 是查询式的，加一行就是一行。

### 案例 3：Watchdog 是怎么自愈的

`watchdog-mailcow` 容器里跑一个 bash 循环，每 30 秒：

- 用 `swaks` 给自己发一封测试邮件，看 SMTP 是否通
- `imaptest` 登录 Dovecot 检查 IMAP 端
- `redis-cli ping` 检查缓存层
- `mysqladmin ping` 检查数据库
- HTTP 拉一下 `/api/v1/get/status/version` 检查管理 UI

任一项连续失败 N 次 → 调用 Docker socket 重启对应容器 + 通过 SMTP 给管理员发告警邮件。这是**用最朴素 shell 实现的 self-healing**，没有 Kubernetes 也行。源码就在 `data/Dockerfiles/watchdog/watchdog.sh`，**不到 2000 行**。

### 案例 4：升级一次发生什么

跑 `./update.sh` 前，先用 `helper-scripts/backup_and_restore.sh` 备份。然后：

1. 检测当前 commit 与 master 的差异，列出本机要被覆盖的本地修改
2. 拉新镜像（`docker compose pull`）
3. 停旧容器，跑数据库迁移脚本（`data/web/inc/init_db.inc.php`）
4. 重新 `docker compose up -d`
5. Watchdog 接管健康检查：容器不健康时会**重启对应服务**，但**不会自动回滚到旧镜像**——真要回退，靠事先备份

升级的关键是**数据卷不动**——MariaDB / 邮件文件 / DKIM key 全在 named volume 里，重建容器不影响数据。

## 踩过的坑

1. **VPS IP 进 RBL 黑名单 / 反向 DNS 没设 / 25 端口被云厂封**：发出的邮件全进垃圾箱或被拒。装 mailcow 前先在 mxtoolbox.com 查 IP 信誉，PTR 反向解析必须配。
2. **端口漏开**：compose 看着 65 行，实际暴露 **80/443/25/465/587/993/995/4190** 八个端口，云厂商安全组少开一个就部分功能挂。
3. **跨大版本升级**：`update.sh` 偶尔会要求重建数据库（如 4.x → 5.x 切 ARM 架构），备份脚本 `helper-scripts/backup_and_restore.sh` 必须先跑。
4. **内存最低 2G**：Rspamd + ClamAV + MariaDB + Solr 默认全开，1G 机器分分钟 OOM。可以 `SKIP_CLAMD=y` + `SKIP_SOLR=y` 压到 1G。
5. **DKIM 没开**：UI 里默认不开 DKIM，新域名很容易被收件方判垃圾。一定去 Configuration → ARC/DKIM Keys 生成密钥并把 TXT 放进 DNS。

## 适用 vs 不适用场景

**适用**：
- 个人 / 小团队 (10-200 人) 自托管邮件
- 想用 self-hosted 替代 Gmail / Outlook 365 但不想手搓
- 教学：理解 SMTP/IMAP/反垃圾全栈最快路径
- 多域名共享一套邮件服务（一个 mailcow 实例可挂数百个域名）

**不适用**：
- 不想运维任何邮件运营事——直接买 Fastmail / ProtonMail / Google Workspace
- 高可用 / 多机房——mailcow 是单机方案，HA 要自己叠 keepalived + DRBD
- 极小 VPS（512M / 1G）——硬塞会 OOM，至少 2G + 20G 磁盘

## 怎么开始读源码

mailcow 主要不是 Go/Rust 项目，它是**编排 + 配置 + 少量 PHP/JS UI**：

1. `docker-compose.yml`（顶层编排，先读这个）
2. `mailcow.conf` 模板（看默认值就懂能调什么）
3. `data/conf/`（每个组件的真实配置文件，按子目录分）
4. `data/web/`（PHP 写的管理 UI，加邮箱/别名的逻辑都在这）
5. `helper-scripts/`（备份、更新、调试一类工具）
6. `update.sh`（升级流程：拉镜像 → 重建容器 → 跑迁移）

## 学到什么

1. **「一键部署」的本质是把领域知识压进配置文件 + 健康检查 + 合理默认值**——mailcow 的 mailcow.conf 是这个思想的好范本
2. **Docker compose 编排 10+ 容器的生产栈完全可行**——不是所有东西都得用 K8s，单机邮件场景 compose 反而更稳
3. **邮件协议族学一遍最佳路径**：装 mailcow → 在 UI 里点每一个开关 → 回头读协议 RFC
4. **Watchdog 容器**是 self-healing 系统的**最小成本实现**——纯 bash + Docker socket，没有 Operator 没有 Reconcile Loop

## 延伸阅读

- 官方文档：[docs.mailcow.email](https://docs.mailcow.email)（含安装/升级/迁移完整指南）
- 仓库：[github.com/mailcow/mailcow-dockerized](https://github.com/mailcow/mailcow-dockerized)
- 邮件协议入门：[Postfix 官网](https://www.postfix.org/) + [Dovecot Wiki](https://wiki.dovecot.org/)
- DKIM/SPF/DMARC 速通：[dmarc.org Overview](https://dmarc.org/overview/)
- [[postfix]] —— mailcow 的 SMTP 引擎
- [[dovecot]] —— mailcow 的 IMAP 引擎

## 关联

- [[postfix]] —— 核心 MTA，mailcow 把 main.cf 的手写工作变成 UI
- [[dovecot]] —— 核心 IMAP/POP3 + 用户认证，mailcow 让 SQL backend 开箱即用
- [[signal-server]] —— 同样是端到端通信后端，但走自定义协议而非邮件标准
