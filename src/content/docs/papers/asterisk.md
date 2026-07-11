---
title: Asterisk — 把企业总机做成一台 Linux 服务器
来源: Asterisk 开源项目 (https://github.com/asterisk/asterisk)，Mark Spencer 1999 起
日期: 2026-05-31
分类: 通信 / 开源 PBX
难度: 初级
---

## 是什么

Asterisk 是一套**用软件实现传统电话总机**（PBX）的开源系统。日常类比：以前公司前台有个"总机姑娘"，分机互打、外线进来转接、不在帮你留言；Asterisk 把这件原本要花 5 万美元买黑盒子硬件做的事，变成一台普通 Linux 服务器跑的软件。

它最经典的一行配置长这样：

```
exten => 100,1,Dial(SIP/jason,20)
exten => 100,2,Voicemail(100,u)
```

读作："拨 100 时，先响 jason 那台 SIP 软电话 20 秒；没人接就转到 100 号信箱。"

这种"按了什么号该去哪"的脚本叫 **dialplan**，是 Asterisk 的灵魂。

## 为什么重要

不理解 Asterisk 这套东西，下面这些事都说不清：

- 为什么 2000 年后中小企业能"装个软件就有总机"，不再被 Avaya / Cisco 卡脖子
- 为什么 Twilio 的 TwiML（用 XML 描述呼叫流程）那么眼熟——它就是 dialplan 的云化版
- 为什么呼叫中心、IVR（"普通话请按 1"）、SIP trunk 网关基本都跑在 Asterisk 上
- 一个 1999 年大学生写的项目，怎么撑起整个 VoIP 经济 20 多年

## 核心要点

Asterisk 把"打电话"这件事拆成 **四个抽象**：

1. **channel（通道）**：一通呼叫的一端。它可以是 SIP 软电话、IAX 通道、传统模拟电话线、甚至 Skype 网关。**PBX 核心不关心对面是谁、走什么协议，只看 channel 抽象**——很像 Unix 的 socket。

2. **channel driver（通道驱动）**：每种协议一个 `.so` 模块。`chan_pjsip` 管 SIP，`chan_iax2` 管 IAX2，`chan_dahdi` 管硬件电话卡。要支持新协议？写个新模块加载进去。

3. **dialplan（拨号方案）**：写在 `extensions.conf`，结构是 **contexts → extensions → priorities → applications**。可以条件、可以跳转、可以调函数，本质是一门自创 DSL。

4. **application（应用）**：dialplan 里能调的动作——`Dial` 拨号、`Playback` 放语音、`Voicemail` 留言、`Queue` 排队、`Background` 等用户按键。

把这四件事粘起来跑事件循环 + 桥接器（bridge），就是 Asterisk 的 **PBX core**。

## 实践案例

### 案例 1：一个最小可用的呼叫中心 IVR

```
[incoming]
exten => s,1,Answer()
exten => s,2,Background(welcome)        ; 放"按 1 找销售，按 2 找技术"
exten => 1,1,Dial(SIP/sales-group,30)
exten => 2,1,Dial(SIP/tech-group,30)
exten => i,1,Playback(invalid)          ; 按错键
exten => t,1,Voicemail(100,u)           ; 超时转留言
```

**逐部分解释**：

- `[incoming]` 是上下文（context），外线进来就走这一段
- `s` 是 "start"，呼叫一进来先跑这条
- `Background` 边放音边等用户按键，按 1 就跳到 `exten => 1`
- `i`/`t` 是特殊扩展，分别处理"按错"和"超时"

整个 IVR 系统不到 10 行配置。

### 案例 2：channel 抽象的力量

一个 PSTN（传统电话网）来电要转给一台 SIP 软电话，Asterisk 内部做的事：

1. `chan_dahdi` 从硬件卡上接到来电 → 创建 channel A
2. dialplan 决定要 `Dial(SIP/jason)` → `chan_pjsip` 创建 channel B 去呼 jason
3. jason 接听 → core 调用 **bridge**，把 A 和 B 的音频流互相转发
4. 双方挂机 → bridge 销毁，channel 释放

**A 和 B 走完全不同的协议**，PBX core 完全不关心——这就是 channel 抽象的价值。

### 案例 3：IAX2 为什么在 Asterisk 里特别

SIP 用两个端口：5060 信令 + RTP 媒体走另一段端口范围，**NAT 穿透是出名地痛**——你在公司路由器后面，对方根本不知道把媒体包送到哪个外部 IP/端口。Asterisk 早期自创了 **IAX2**：

- 单一 UDP 端口 4569，信令和媒体都走它
- 多通道可以复用同一个 UDP 流（trunking），10 通呼叫合并成一条流，省带宽
- 因为只走一个端口，NAT 穿透几乎零配置

代价是：IAX2 是 Asterisk 自家协议，标准化程度远不如 SIP，主流软电话不一定支持。今天主流仍是 SIP，IAX2 多用于 Asterisk 服务器之间的内部互联（中继）。

### 案例 4：AGI 让 dialplan 跳到通用语言

dialplan 写"按数据库判断 VIP 走金牌客服队列"这种逻辑会很丑。Asterisk 提供 AGI 出口：

```
exten => 200,1,AGI(check-vip.py,${CALLERID(num)})
exten => 200,2,GotoIf($["${VIP}" = "yes"]?vip,s,1:normal,s,1)
```

`check-vip.py` 是普通 Python 脚本，从 stdin 读 channel 变量，往 stdout 输出指令。这套设计早于 Twilio 的 webhook 模型十几年，思想完全一致——**核心做最少的事，复杂业务跳出去用通用语言写**。

## 踩过的坑

1. **chan_sip 已废弃，新项目必须用 chan_pjsip**：老教程里满天飞的 `sip.conf` 配置在 Asterisk 18+ 默认不再加载，要改用 `pjsip.conf`，语法完全不一样。

2. **dialplan 写复杂逻辑容易乱**：自创 DSL 没有真正的函数和作用域。复杂呼叫流（比如根据数据库判断 VIP）建议用 **AGI**（Asterisk Gateway Interface）跳到 Python/PHP 写，dialplan 只做路由。

3. **音频质量调优是黑魔法**：codec 协商、jitter buffer、回音消除（echo canceller）、抖动 ── 配置不当会出现回音、卡顿、断续。生产环境要监控 RTCP 报告。

4. **单进程瓶颈**：Asterisk 是 C 写的单进程多线程模型，单机能撑几千通并发但不能再多。运营商级要靠多机集群 + DUNDi 分布式拨号方案。

## 适用 vs 不适用场景

**适用**：
- 中小企业内部分机系统（替代昂贵 Avaya/Cisco 硬件 PBX）
- 呼叫中心 IVR / 自动外呼 / 录音质检
- SIP trunk 网关（把模拟线路或 PSTN 接入 IP 网络）
- 自建 VoIP 服务商基础设施

**不适用**：
- 想要"快速上手 + 现代界面" → 用 **FreePBX**（图形化发行版，底层还是 Asterisk）
- 媒体处理量很大 / 要多线程并发 → 用 **FreeSWITCH**（2006 年前 Asterisk 开发者另起炉灶，架构更现代）
- 完全云原生、按 API 调用计费 → 用 **Twilio / Plivo**（API 化的云电话，dialplan 变成 TwiML）

## 历史小故事（可跳过）

- **1999 年**：Mark Spencer 在奥本大学读书，开了家 Linux 技术支持公司，需要电话总机但买不起 Avaya 的 5 万美元盒子，干脆自己写一个。取名 Asterisk（星号），象征 Unix 通配符——什么都能接。
- **2004 年**：Asterisk 1.0 正式发布。同期他成立 Digium 公司卖配套硬件电话卡（DAHDI）。
- **2006 年**：前 Asterisk 开发者 Anthony Minessale 觉得 Asterisk 架构太老，另写了 FreeSWITCH。两个项目至今仍是 VoIP 双雄。
- **2018 年**：Sangoma Technologies 收购 Digium，Asterisk 进入 Sangoma 旗下，至今仍活跃维护（最新主线 v22）。

## 学到什么

1. **正确的抽象能让一段代码活 20 年**——channel + dialplan 这套设计撑住了从模拟线路到 5G VoLTE 几代电信技术变化
2. **开源能彻底改写一个行业的成本结构**——电话总机从 5 万美元降到一台二手服务器
3. **DSL 是把双刃剑**——dialplan 让简单事极简单（10 行 IVR），但复杂事要靠 AGI 逃出去
4. **协议穿透 NAT 的痛能催生新协议**——IAX2 就是为此而生，但标准化路径通常赢不过 SIP

## 延伸阅读

- 官方文档：[Asterisk Wiki](https://docs.asterisk.org/)（核心架构 + dialplan 完整参考）
- 入门书：*Asterisk: The Definitive Guide*（O Reilly 出版，第 5 版覆盖 chan_pjsip）
- 视频：[Asterisk World](https://www.youtube.com/@AsteriskOpenSource)（每年 ITExpo 的官方分享）
- 实战教程：[VoIP-Info Wiki](https://www.voip-info.org/asterisk/)（社区维护的 dialplan 例子库）
- 源码：[github.com/asterisk/asterisk](https://github.com/asterisk/asterisk)（C 实现，约 60 万行）
- [[twilio]] —— Asterisk dialplan 的云 API 化版本，TwiML 就是 dialplan 的 XML

## 关联

- [[twilio]] —— 把 Asterisk 的"程序化呼叫流"做成云 API
- [[freeswitch]] —— 2006 年从 Asterisk 分支出去的现代多线程版
- [[sip-rfc-3261]] —— Asterisk chan_pjsip 实现的核心协议
- [[linux-kernel]] —— Asterisk 长在 Linux 上，DAHDI 直接接内核驱动

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
