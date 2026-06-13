---
title: CrowdSec — 从社区共享中学习如何保护服务器
来源: https://github.com/crowdsecurity/crowdsec
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# CrowdSec — 从社区共享中学习如何保护服务器

## 日常类比：小区保安联防

想象你住在一个大小区里。以前每个楼的保安只盯着自己楼栋——302 被盗了，只有 3 楼知道小偷长什么样。

CrowdSec 的做法是：所有小区的保安共用一个"可疑人员名单"。你家楼下的保安发现有人在深夜反复按错门（像是撞门），他会把这个人的特征登记下来并传给整个联盟。隔壁小区的保安第二天就收到通知："注意，这种人可能想撞门"，即使他们自己还没遇到过。

这就是 CrowdSec 的核心思想：**检测 + 共享 + 防御**。

## 一句话定义

CrowdSec 是一个开源的、轻量级的**入侵检测与响应引擎**（IDS）。它分析服务器日志和 HTTP 请求，发现攻击行为，然后自动封禁恶意 IP，同时从社区共享其他服务器遭遇的攻击情报。

## 核心概念

### 1. Security Engine（安全引擎）

Security Engine 是你安装在服务器上的软件本体，相当于小区的"监控系统 + 保安队长"。它内部有两个关键组件：

- **Log Processor（日志处理器）**：读取你的服务日志（比如 Nginx 访问日志、SSH 认证日志），分析每一行内容，看有没有可疑行为。
- **Local API（本地 API）**：存储检测到的告警，并根据预设规则决定如何处理（比如封禁多长时间）。

### 2. Collections（集合）

集合是检测内容的打包单位。一个集合通常包含：

- **Parsers（解析器）**：教 CrowdSec 如何读懂某种日志格式。
- **Scenarios（场景）**：定义什么样的行为算攻击。比如"1 分钟内同一 IP 失败登录超过 5 次"就是一个场景。

你可以从 CrowdSec Hub 安装别人写好的集合，也可以自己写。

### 3. Alerts & Decisions（告警与处置）

这个流程是 CrowdSec 的核心链路：

> 日志被采集 → 解析器提取字段 → 场景匹配到攻击模式 → 产生 Alert → Local API 根据 Profile 生成 Decision（如 ban）→ Bouncer 执行封禁

### 4. Bouncers（执行器 / 保安）

Bouncer 是实际执行封禁动作的外部组件。它可以：

- 在你的防火墙规则里加一条（iptables nftables）
- 在 Nginx / Apache 里返回 403
- 在 CDN 层面拦截

它从 Local API 拉取决策列表，然后在你的网络边界实际挡住恶意 IP。

### 5. Central API & Community Blocklist（中央 API 与社区黑名单）

这是 CrowdSec 最聪明的地方。每台安装了 CrowdSec 的服务器都是"参与者"——你把检测到的攻击信号匿名上报到 Central API，作为回报，你从中央拉取其他所有人已经验证过的恶意 IP 列表（Community Blocklist）。

这意味着：**即使你的服务器什么都没检测到，你也在受到保护**——因为别人已经替你发现并记录了这些威胁。

## cscli 命令行工具

`cscli` 是你管理 CrowdSec 的主要工具。下面来看两个最常见的操作。

### 示例 1：安装检测集合 + 安装 Bouncer

```bash
# 安装检测集合（比如 Linux 服务器的 SSH 暴力破解检测 + Nginx Web 攻击检测）
sudo cscli collections add crowdsecurity/linux
sudo cscli collections add crowdsecurity/nginx

# 安装 Bouncer（用 iptables 来封禁恶意 IP）
sudo cscli bouncers add my-iptables-bouncer --api-key <API_KEY>
```

安装 `crowdsecurity/linux` 集合后，CrowdSec 会自动获得：

- 一组解析器，能读懂 auth.log、syslog、apt 日志等
- 几十个场景，覆盖 SSH 暴力破解、端口扫描、cron 异常等常见攻击

### 示例 2：查看告警、手动处置与解除封禁

```bash
# 查看最近产生的所有告警
cscli alerts list -o json

# 手动封禁某个 IP（绕过场景规则，直接 ban）
cscli decisions add --type ban --duration 24h --value 192.168.1.100

# 解除封禁
cscli decisions delete --value 192.168.1.100

# 把某个 IP 加入白名单（永远不封它）
cscli allowlists add --value 10.0.0.1
```

### 示例 3：模拟模式（在正式启用前先测试）

模拟模式让 CrowdSec 只检测不封禁，相当于"旁路观察"：

```bash
# 开启模拟模式（只记录告警，不产生 ban 决策）
cscli simulation add -i 0.0.0.0/0

# 查看模拟状态
cscli simulation list
```

这在刚安装 CrowdSec 时特别有用——你可以先观察它检测到了什么，确认没有误报后再正式启用封禁。

## 典型部署架构

单台服务器（最简单）：

```
[系统日志 / Nginx] → Log Processor → Local API → Bouncer (iptables)
                         ↑
                   Central API (上传/下载黑名单)
```

多机分布式（大型部署）：

```
[多台机器的 LP] →→ [共享的 LAPI] →→ [Bouncers]
                     ↑
               Central API
```

Log Processor 负责检测，Local API 负责存储和决策，Bouncer 负责执行——三者可以放在同一台机器，也可以分开部署。

## 为什么值得了解

| 传统防火墙 / 静态规则 | CrowdSec |
|---|---|
| 规则需要自己维护更新 | 社区共享，自动更新 |
| 只能匹配已知规则 | 通过行为分析发现未知攻击模式 |
| 每台机器独立判断 | 全网协作，一人发现大家受益 |
| 被动防御 | 主动学习和共享 |

作为安全领域的入门工具，CrowdSec 的学习曲线很平缓：安装 → 装集合 → 开模拟模式观察 → 调整 → 正式启用。整个过程不需要你是安全专家。

## 参考

- 项目主页：https://github.com/crowdsecurity/crowdsec
- 官方文档：https://docs.crowdsec.net
- 检测内容市场（Hub）：https://hub.crowdsec.net
- 在线管理平台（Console）：https://app.crowdsec.net
- 社区 Discord：https://discord.gg/crowdsec
