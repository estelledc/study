---
title: FreeSWITCH — 多线程软交换内核，给电话/视频会议当骨架
来源: https://github.com/signalwire/freeswitch
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 中级
---

## 是什么

FreeSWITCH 是一套**用 C 写的软交换平台**（softswitch）——和 [[asterisk]] 同一类，但内核是**多线程 + 状态机**，目标是单机扛上千路并发呼叫。日常类比：Asterisk 像家里的小总机，FreeSWITCH 像电信机房里那台能同时开几千通电话还能开视频会议的中央交换机。

它的工作不是"接打电话"本身，而是**把两端语音/视频流接通、转码、录音、混流、转发事件**。常见用途：

- 给运营商当 Class-5 软交换
- 当 SBC（会话边界控制器）守在企业入口处过滤 SIP 流量
- 跑 WebRTC 视频会议（mod_conference）
- 把语音桥接到 ASR/TTS/LLM 实现智能客服

仓库现归 SignalWire 维护（创始人 Anthony Minessale 的公司），3.7k GitHub star，MPL 1.1 许可——比 GPL 商业友好，所以电信厂商愿意基于它二次开发。

## 为什么重要

- **2006 年从 Asterisk 分家**——三位 Asterisk 核心开发者认为单线程内核在高并发场景撑不住，重起炉灶。FreeSWITCH 的存在证明"软电话不一定要单线程"
- **WebRTC 时代的网关担当**——浏览器要打电话进 PSTN，FreeSWITCH 是中间那台机器
- **开源视频会议的早期王者**——mod_conference 在 Jitsi 普及前就提供多方视频混流
- **Verto 协议**比标准的 SIP-over-WebSocket 早出现，启发了后续 WebRTC 信令设计

## 核心要点

FreeSWITCH 内核可以拆成**五块**：

1. **State Machine（状态机）**：每通呼叫的生命周期（CS_NEW → CS_INIT → CS_ROUTING → CS_EXECUTE → CS_HANGUP）由状态机驱动，每个状态可挂回调。和 Asterisk 用 dialplan 解释器单步走的模型完全不同
2. **Endpoint（端点）**：抽象一端，由 mod_sofia（SIP）/ mod_verto（WebSocket）/ mod_skinny 等模块实现
3. **Application（应用）**：dialplan 里能调的动作——bridge / answer / playback / record / conference
4. **Event System**：内核里发生任何事都生成事件，订阅者通过 Event Socket（TCP 端口 8021）拿到——这是远程驱动的入口
5. **Module Loader**：所有功能都是 `.so` 模块，启动时按 `modules.conf.xml` 加载

XML 配置是它的"操作面板"——`dialplan/default.xml` 里写呼叫路由，`sip_profiles/internal.xml` 里写 SIP 监听口，`directory/default/*.xml` 里写分机账号。

底层信令栈用的是 **Sofia-SIP**（诺基亚开源的 SIP 库），不是自己写的——这是它能稳定多年的关键之一。

## B2BUA 模型

理解 FreeSWITCH 必须先理解 **B2BUA**（Back-to-Back User Agent，背靠背用户代理）：

- Asterisk 视角：A 打给 B，Asterisk 在中间像一根管道把两段桥接
- FreeSWITCH 视角：A 打给 FreeSWITCH（这是一通独立呼叫，叫 a-leg），FreeSWITCH 再打给 B（另一通独立呼叫 b-leg），两边媒体流由内核中转

好处：

- 媒体能在内核里被转码、录制、混流
- 一端挂了，另一端能转给别人（呼叫转移真做得到）
- 编解码两端可以不同（A 用 G.711，B 用 Opus，内核中间转）

代价：调试时要同时看两条腿的日志，故障排查比 Asterisk 复杂。

## 实践案例

### 案例 1：dialplan 长什么样（XML 而不是 ini）

```xml
<extension name="ring_alice">
  <condition field="destination_number" expression="^100$">
    <action application="answer"/>
    <action application="bridge" data="user/alice"/>
  </condition>
</extension>
```

读法：拨 100 号 → 接听 → 桥接到注册名为 alice 的分机。和 Asterisk 的 `exten => 100,1,Dial(...)` 等价，但用 XML 写。

### 案例 2：Event Socket 远程驱动

```python
import ESL
con = ESL.ESLconnection("localhost", "8021", "ClueCon")
con.api("originate sofia/internal/1000@example.com &echo")
```

这段 Python 让 FreeSWITCH 主动呼叫分机 1000，接通后跑 echo 应用（回放对方的声音）。AGI 在 Asterisk 里也能做类似事，但 ESL 是**异步事件流**，不会卡住外部进程。

### 案例 3：WebRTC 接入电话网

浏览器开 `mod_verto` 提供的 JS SDK → WebSocket 连到 FreeSWITCH → FreeSWITCH 在 b-leg 用 mod_sofia 拨给运营商 SIP 中继 → 浏览器和 PSTN 通话。中间媒体由内核转码（Opus ↔ G.711）。

## 配置目录结构

```
/usr/local/freeswitch/conf/
  freeswitch.xml          # 顶层入口，include 其他文件
  dialplan/default.xml    # 呼叫路由
  sip_profiles/           # SIP 监听端口配置
    internal.xml          # 5060 内网
    external.xml          # 5080 外网
  directory/default/      # 分机账号
    1000.xml
    1001.xml
  autoload_configs/       # 各模块独立配置
    conference.conf.xml
    event_socket.conf.xml
```

学习曲线陡的根因：配置散在很多 XML 文件里，第一次调试要同时打开 5-6 个文件来回跳。

## 踩过的坑

1. **学习曲线比 Asterisk 陡**——同样实现"按 100 拨给 Alice"，FreeSWITCH 要懂 XML 节点 + 模块加载顺序，Asterisk 三行 ini 就够
2. **B2BUA 调试双倍工作量**——`uuid_dump <a-leg>` 和 `uuid_dump <b-leg>` 都要看，单看一边定位不到问题
3. **mod_conference CPU 吃得猛**——视频会议混流用 CPU 软编码 H.264/VP8，10 人会议就要一颗高频核
4. **ESL 跨进程**——外部脚本死了不会通知 FreeSWITCH，注意心跳和超时
5. **大版本升级配置不兼容**——1.6 → 1.10 期间 mod_sofia 和 mod_dptools 配置项变过几次，照搬旧配置会启动失败
6. **文档分散**——官方 wiki、Confluence、GitHub README、SignalWire docs.signalwire.com 各占一部分，找一个东西常要搜三个站

## 适用 vs 不适用场景

**适用**：

- 高并发场景（>200 路并发，Asterisk 单线程瓶颈明显）
- 需要内核级视频混流 / WebRTC 网关 / SBC
- 需要 ESL 异步事件流和外部服务（ASR/TTS/LLM）协作
- 商业产品需要 MPL 而不是 GPL

**不适用**：

- 几十路并发的小企业 PBX——Asterisk + FreePBX 上手更快
- 团队没人懂 SIP/RTP——配置门槛会反噬
- 想要图形化管理界面——FreeSWITCH 自身没有，要装第三方（FusionPBX）
- 需要自创私有协议——内核多线程 + B2BUA 改动比 Asterisk 风险更大

## 替代品对比

- **[[asterisk]]**：兄弟项目，社区最大，dialplan 上手快。中小规模选 Asterisk
- **Kamailio / OpenSIPS**：纯 SIP 代理（proxy），不处理媒体——比 FreeSWITCH 更轻量但只做信令
- **Janus / mediasoup**：纯 WebRTC SFU，不接 PSTN
- **Drachtio**：Node.js 写的 SIP 应用框架，开发者友好但生态小

经验法则：**信令多 + 媒体少**用 Kamailio；**媒体多 + 视频会议**用 FreeSWITCH；**纯 WebRTC**用 Janus；**简单 PBX**用 Asterisk。

## 学到什么

1. **多线程 vs 单线程**是同类工具的分水岭——Asterisk 单线程更简单但有上限，FreeSWITCH 多线程更复杂但能扩
2. **B2BUA** 是软交换的标准模型——两端独立呼叫 + 内核转媒体是商业级软电话的基础
3. **状态机 vs 解释器**：把通话拆成显式状态比顺序执行 dialplan 更适合并发
4. **事件驱动外部协作** —— Event Socket 让任何语言都能远程驱动呼叫流，这套架构在 LLM 接电话场景被反复重新发明

## 历史小故事（可跳过）

- **2006 年**：Anthony Minessale、Brian West、Michael Jerris 三位 Asterisk 核心开发者因为单线程内核扛不住高并发，分家创立 FreeSWITCH
- **2008 年**：v1.0 发布，主打多线程 + 模块化 + B2BUA
- **2012 年**：Verto 协议先于 SIP-over-WebSocket 落地，给 WebRTC 信令开路
- **2018 年**：Anthony Minessale 创立 SignalWire 公司，把 FreeSWITCH 做成商业云服务
- **2024 年**：仓库从 freeswitch/freeswitch 迁到 signalwire/freeswitch
- **现在**：v1.10.12 是稳定版，仍是开源软交换的两大选项之一

## 延伸阅读

- 官方仓库：[signalwire/freeswitch](https://github.com/signalwire/freeswitch)
- 官网：[freeswitch.com](https://freeswitch.com/)
- 入门书：《FreeSWITCH 1.8》(Packt, 2017)，比官方 wiki 系统
- Sofia-SIP 文档：[sofia-sip.sourceforge.net](http://sofia-sip.sourceforge.net/)
- [[asterisk]] —— 兄弟项目，对照学习能很快理解软交换概念
- [[webrtc]] —— FreeSWITCH 是少数原生支持 WebRTC 的软交换

## 关联

- [[asterisk]] —— 同类工具，分家自此；功能重叠但架构哲学不同
- [[webrtc]] —— mod_verto / mod_sofia 让浏览器能打 SIP 电话
- [[kamailio]] —— SIP proxy 的代表，常和 FreeSWITCH 组合（Kamailio 做信令负载、FreeSWITCH 做媒体）
