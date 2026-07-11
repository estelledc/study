---
title: Asterisk — 把企业总机变成一台 Linux 服务器
来源: 'https://github.com/asterisk/asterisk'
日期: 2026-05-31
分类: 通信
难度: 中级
---

## 是什么

Asterisk 是一套**用软件实现的 PBX**（企业内部电话总机）。日常类比：以前公司前台旁边那台几万美元的 Avaya 黑盒子——分机互打、外线进来转给谁、留言、IVR 语音菜单——它把这堆事全用 C 写成一台 Linux 服务器上能跑的程序。

1999 年 Mark Spencer 在奥本大学读书时为自己创业的 Linux 技术支持公司省钱写出来，2004 年发 1.0，公司后来更名 Digium，2018 年被 Sangoma 收购。GPL 许可，**开源软交换的事实标准**，至今还在维护。

GitHub 3.1k 星，名字来自 Unix shell 通配符 `*`——象征"什么都能接"。

## 为什么重要

- **直接催生整个 VoIP 经济**——把企业级电话从 5 万美元的硬件黑盒变成一台 PC + 开源软件，门槛塌了
- **20 多年仍在维护**，是开源长期主义的样本：FreePBX / Elastix / 大量 ITSP 服务商的内核都是它
- **抽象被云电话借鉴**——Twilio 的 TwiML 本质上就是 dialplan 的 XML 化版本
- 学一遍电信协议栈（SIP / RTP / DTMF / 编解码）最直接的活教材

## 核心要点

Asterisk 内核就四个概念外加一个粘合层：

1. **channel（通道）**：抽象的"一通呼叫的一端"。它可以是 SIP 软电话、IAX 客户端、模拟电话线、PSTN 数字中继。类比：socket——内核不在乎对面是谁、走什么协议
2. **channel driver**：每种协议一个 `.so` 模块（`chan_pjsip` / `chan_iax2` / `chan_dahdi`）。新协议进来只要再写一个 driver
3. **dialplan**：写在 `extensions.conf` 里，结构是 `context → extension → priority → application`。"按了 100 该去哪"用一种自创 DSL 描述
4. **application**：dialplan 里能调的动作——`Dial`（拨号）/ `Playback`（放语音）/ `Voicemail`（留言）/ `Queue`（呼叫队列）/ `Background`（边放语音边收按键）
5. **PBX core**：上面四件事的事件循环 + 桥接器（bridge），把两端 channel 接起来

支持的协议：SIP、IAX2、H.323、MGCP、SCCP、DAHDI（数字/模拟硬件）。其中 IAX2 是 Asterisk 自创——单 UDP 端口 4569 同时载信令和媒体，**比 SIP 更友好穿越 NAT**。

## 实践案例

### 案例 1：dialplan 长什么样

```ini
[from-internal]
exten => 100,1,Dial(PJSIP/alice,20)
exten => 100,2,Voicemail(100@default)
exten => 100,3,Hangup()
```

逐行翻译：

- `[from-internal]` 是一个 context（一组规则的命名空间）
- `100` 是 extension（号码），`,1,2,3` 是优先级（按顺序往下走）
- 第 1 步：拨 alice 这个 SIP 用户，振铃 20 秒
- 第 2 步：没人接 → 进信箱
- 第 3 步：挂断

这就是为什么有人说 dialplan "是脚本不是配置"——它有顺序、能跳转、能调函数。

### 案例 2：典型架构

一台中小企业部署看起来是：

```
SIP 软电话 ─┐
SIP 硬话机 ─┼─→ Asterisk ──→ SIP trunk 服务商 ──→ PSTN（外线）
模拟电话  ─┘    （PBX core）
```

内部分机互打不出 Asterisk 的盒子；打外线时它把 channel 一端接到 SIP trunk（运营商提供的批发线路），另一端接你的话机，bridge 起来后媒体直接两头流。

### 案例 3：dialplan 写不动了怎么办

dialplan 这套 DSL 写复杂逻辑（数据库查、API 调外部）会很难看。逃生口叫 **AGI（Asterisk Gateway Interface）**——一个文本协议，让 dialplan 调用外部 Python / PHP 脚本，stdin/stdout 通信。再复杂的业务逻辑都跳出 DSL 用熟悉的语言写。

伪代码：

```python
#!/usr/bin/env python3
# /var/lib/asterisk/agi-bin/route.py
import sys
caller = sys.argv[1]  # 主叫号码
# 查数据库决定路由
target = lookup_db(caller)
# 通过 stdout 把变量写回 dialplan
print(f"SET VARIABLE TARGET {target}")
```

dialplan 端：

```ini
exten => _X.,1,AGI(route.py,${CALLERID(num)})
exten => _X.,2,Dial(PJSIP/${TARGET})
```

类比 nginx 的 `try_files` 失败后跳到 PHP-FPM——常见路径在 DSL 里跑得快，复杂分支跳出去用通用语言。

### 案例 4：bridge 是怎么把两个 channel 接起来的

A 拨给 B，Asterisk 内部其实建了两个 channel（`PJSIP/A-00001` 和 `PJSIP/B-00002`），然后调 `Dial` 把它们 bridge 在一起。bridge 模块负责：

- 把 A 收到的 RTP 包转给 B（甚至能直接命令两端互相直发，自己退出媒体路径，叫 **direct media** / re-INVITE）
- 处理转接、会议（多个 channel 进 ConfBridge）、监听（spy）
- 任一边挂断就拆桥

理解了 bridge，就理解了为什么 Asterisk 能把"模拟电话 + SIP 软电话 + 会议"放一起开会——它只看 channel 抽象。

## 踩过的坑

1. **`chan_sip` 已死**：老教程里满屏的 `chan_sip` 在 2018 后已经废弃，新部署一律用 **`chan_pjsip`**（基于 PJSIP 协议栈）。配置语法有差异，照搬老博客会碰壁
2. **NAT 是头号杀手**：SIP 信令里写的是内网 IP，过 NAT 后对面拨不回来——表现就是"能呼出但听不到声音"。要嘛配 `external_media_address`，要嘛干脆走 IAX2
3. **音频回音和 jitter**：实时音频对延迟敏感，时钟源没配好（`/etc/asterisk/chan_dahdi.conf` 里的 timing source）会出现金属音、回声
4. **单进程 + C**：扩展性靠多机集群（DUNDi 分布式拨号方案）。单机几千并发 channel 是上限，再上去要堆机器
5. **dialplan 调试只能看日志**：没有断点、没有 IDE，靠 `core set verbose 5` + `agi debug` 看输出。习惯前会很痛

## 适用 vs 不适用场景

**适用**：

- 中小企业内部分机 + IVR + 留言信箱
- 呼叫中心后端（配上 Queue + 报表插件）
- SIP trunk 网关（把老 PRI/E1 数字中继接到 SIP 世界）
- 学 VoIP 协议栈的实验台

**不适用**：

- 运营商级千万级并发 → 用 OpenSIPS / Kamailio（这俩是纯 SIP 代理，不做媒体）
- 多线程高吞吐媒体处理 → FreeSWITCH（2006 年由前 Asterisk 开发者另起炉灶，主打多线程）
- WebRTC 浏览器直连为主 → janus-gateway / mediasoup
- 想要现代云原生 → Asterisk 的进程模型还停在 2004，容器化勉强能做，不算优雅

## 历史小故事（可跳过）

- **1999**：Mark Spencer 在奥本大学读书，自己开 Linux Support Services 公司，没钱买 Avaya，写了 Asterisk
- **2004**：1.0 正式发布，公司更名 Digium，开始卖配套硬件卡
- **2006**：前开发者 Anthony Minessale 觉得单线程不够用，分叉出 FreeSWITCH
- **2018**：Sangoma 收购 Digium，Asterisk 仍开源
- **现在**：每年发新版（最新 22.x），核心架构没大变——证明这套抽象选对了

## 学到什么

1. **channel + dialplan + application** 这三件抽象 20 年没变形，是软交换领域的"x86 指令集"
2. **DSL 配脚本钩子**（dialplan 配 AGI）是工程上经典模式——常见路径在 DSL 里短小，复杂逻辑跳到通用语言
3. **协议适配靠模块**（channel driver `.so`）：内核不动，新协议挂上来即可，是开源项目长寿的常见配方
4. **专用硬件 → 通用 PC + 开源软件** 这条曲线 1999 年发生在电话上，2010 年发生在网络（SDN），2015 年发生在存储（Ceph）——同一种"软件吃硬件"的剧本

## 延伸阅读

- 官方文档：[Asterisk Documentation](https://docs.asterisk.org/)（docs.asterisk.org，最权威，按版本分）
- 经典书：[Asterisk: The Definitive Guide](https://www.asteriskdocs.org/)（O'Reilly 出的免费版，作者 Russell Bryant 等核心开发者）
- 入门发行版：FreePBX（图形界面套壳的 Asterisk，新人不想啃 dialplan 直接用它）
- 对比阅读：[FreeSWITCH](https://github.com/signalwire/freeswitch)（同源不同路）
- [[aiortc]] —— Python WebRTC 协议栈，和 Asterisk 同属"软件实现协议栈"流派

## 关联

- [[freeswitch]] —— 同样做软交换，但更偏多线程媒体处理
- [[kamailio]] —— 纯 SIP 代理路线，适合把信令层扩到更大规模
- [[janus-gateway]] —— WebRTC 网关，和 Asterisk 都在处理实时音视频协议边界
- [[mediasoup]] —— 浏览器实时音视频的 SFU 方案，适合对比 PBX 与 WebRTC 架构
- [[aiortc]] —— Python 里的协议栈实现，和 Asterisk 一样把通信协议软件化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[freeswitch]] —— FreeSWITCH — 多线程软交换内核，给电话/视频会议当骨架
- [[kamailio]] —— Kamailio — 把电信级 SIP 流量塞进一台 Linux 服务器
