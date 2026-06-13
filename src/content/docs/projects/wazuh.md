---
title: Wazuh — 开源安全监控的瑞士军刀
来源: https://github.com/wazuh/wazuh
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Wazuh — 开源安全监控的瑞士军刀

## 日常类比：小区保安 + 消防队 + 巡检员

想象你经营一个大型小区。你雇了三拨人：

- **巡检员**：每天巡视每扇门有没有被撬过、窗户有没有被打破（文件完整性监控）
- **保安**：盯着监控摄像头，看到有人鬼鬼祟祟就报警（日志分析和入侵检测）
- **消防队**：一旦发现可疑人员，直接上去拦住并通知警察（主动响应）

这三拨人汇报到一个"保安室"，保安室的管理员汇总所有信息，你坐在监控大屏前就能看清整个小区的状态。

Wazuh 做的就是这件事——只不过"小区"变成了你的服务器，"门和窗"变成了系统和文件。

## 一句话定义

Wazuh 是一个开源的、免费的安全监控平台。它能做三件事：**检测威胁**（入侵、恶意软件）、**分析日志**（集中收集所有服务器日志）、**合规检查**（自动验证系统是否符合安全标准如 PCI DSS、HIPAA）。

## 核心概念

### 1. Agent（代理）— 巡检员

Agent 安装在每台被监控的机器上（Linux、Windows、macOS 都行）。它在后台静静工作，采集数据：文件有没有被改过、正在运行的程序有哪些、系统日志写了什么。采集到的数据加密后发给 Manager。

一个 Wazuh 架构至少需要一个 Manager 和至少一个 Agent。

### 2. Manager（管理器）— 保安室

Manager 接收所有 Agent 上报的数据，进行分析、匹配规则、生成告警。它是整个系统的大脑。

### 3. Wazuh Indexer + Dashboard — 监控大屏

Indexer 是一个搜索引擎（基于 OpenSearch），负责把告警和数据存起来、快速检索。Dashboard 是可视化界面，你可以在上面看到所有告警、图表和仪表盘。

### 4. Syscheck（系统巡检）— 巡检员的核心任务

Syscheck 是 Agent 内置的守护进程，默认每小时扫描一次你指定的文件目录。它记录每个文件的哈希值、权限、所有者等信息。如果任何文件被修改或新增，Agent 会立即上报告警。

### 5. 规则与解码器（Rules & Decoders）— 保安的判断手册

Wazuh 有一套强大的规则引擎。解码器教 Wazuh 如何"读懂"不同格式的日志，规则则定义"什么样的日志算威胁"。比如一条规则说："如果 SSH 日志中出现 'Failed password' 且连续 3 次，就生成一个告警"。

### 6. 主动响应（Active Response）— 消防队

当告警级别超过某个阈值时，Wazuh 可以自动执行预设动作：比如用 iptables 封禁某个 IP、禁用某个用户账号、甚至启动杀毒扫描。这不是被动观察，而是自动反击。

## 配置示例

### 示例 1：配置 Syscheck 文件完整性监控

在 Agent 的 `ossec.conf` 中，你可以指定要监控哪些目录：

```xml
<syscheck>
    <!-- 每 2 小时扫描一次 -->
    <frequency>7200</frequency>

    <!-- 监控这些系统文件 -->
    <directories>/etc,/usr/bin,/usr/sbin</directories>
    <directories>/bin,/sbin</directories>

    <!-- 也监控 Windows 系统目录（如果在 Windows Agent 上） -->
    <windows_registry>HKEY_LOCAL_MACHINE\Software</windows_registry>

    <!-- 监控文件的变化：大小、权限、所有者、哈希值 -->
    <check_all>yes</check_all>
</syscheck>
```

这告诉 Agent：每隔 2 小时检查一次 `/etc`、`/usr/bin` 等目录，只要任何文件的属性变了（哪怕内容没变），就会产生告警。

### 示例 2：配置日志收集和自定义规则

在 Manager 端，你可以让 Wazuh 收集自定义日志并编写规则来告警：

```xml
<!-- manager 的 ossec.conf：收集应用日志 -->
<localfile>
    <log_format>syslog</log_format>
    <location>/var/log/myapp/application.log</location>
</localfile>
```

然后在自定义规则文件中（`/var/ossec/etc/rules/local_rules.xml`）：

```xml
<group name="local,application,">

    <!-- 应用日志中出现 ERROR 时生成告警 -->
    <rule id="100001" level="5">
        <match>ERROR</match>
        <description>检测到应用级错误</description>
    </rule>

    <!-- 出现 5 次以上 ERROR 时升级为高危告警 -->
    <rule id="100002" level="10" frequency="5" timeframe="60">
        <if_matched_sid>100001</if_matched_sid>
        <description>应用在 60 秒内出现 5 次以上 ERROR，可能存在攻击或故障</description>
    </rule>

</group>
```

第一条规则是"看到 ERROR 就记下来"（级别 5，中等）。第二条规则是"如果在 60 秒内同一来源出现 5 次 ERROR"（级别 10，高危），就会触发升级告警。

### 示例 3：开启漏洞检测

在 Manager 的 `ossec.conf` 中启用漏洞扫描：

```xml
<vulnerability-detection>
    <enabled>yes</enabled>
    <index-status>yes</index-status>
    <!-- 每 60 分钟从 NVD 更新一次漏洞数据 -->
    <feed-update-interval>60m</feed-update-interval>
</vulnerability-detection>
```

启用后，Wazuh 会自动对比每台机器上安装的软件版本和 NVD（美国国家漏洞数据库）中的 CVE 记录，发现你系统里有哪些软件存在已知漏洞，直接告诉你："你的 OpenSSL 是 1.1.1，存在 CVE-2022-XXXXXXXX 漏洞，建议升级到 3.0.1"。

## 架构图（简化版）

```
[Agent A] ──┐
[Agent B] ──┼──→ [Wazuh Manager] ──→ [Wazuh Indexer] ──→ [Wazuh Dashboard]
[Agent C] ──┘         │                                      ▲
                      └── 主动响应 ──→ 防火墙/杀软/自定义脚本
```

## 总结

Wazuh 的强大在于它把安全监控的三件事（检测、分析、响应）整合到一个免费工具里。你不需要分别买日志收集系统、入侵检测系统、合规检查工具——一个 Agent 装上，整个系统的安全状态就在你眼前。

对于初学者来说，建议从"单 Manager + 单 Agent"开始，先看 Syscheck 的文件监控告警，再逐步加入规则引擎和主动响应。

## 快速上手路径

1. 装一台虚拟机当 Manager，按官方文档一行一行执行安装脚本
2. 在被控机器上装 Agent，填入 Manager IP 即可自动注册
3. 打开 Dashboard，看"系统完整性"面板——你会立刻看到 Agent 扫描到的文件清单
4. 去 SSH 故意输错几次密码，看看 Dashboard 里是否出现"SSH 登录失败"告警
5. 试着加一条自定义规则，让 Wazuh 对特定关键词告警
