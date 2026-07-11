---
title: Kamailio — 把电信级 SIP 流量塞进一台 Linux 服务器
来源: 'https://github.com/kamailio/kamailio'
日期: 2026-05-31
分类: 通信
难度: 中级
---

## 是什么

Kamailio 是一台**只管信令、不碰声音**的 SIP 服务器。日常类比：电话总台里那个分发员——只负责"这通电话该转给谁、走哪条线"，至于通话本身的声音流，他不参与。

它能干这几件事：把"我是 alice@example.com"的注册信息存下来（registrar）、把请求按规则转发到下一跳（proxy）、做 5 万条注册的负载均衡（dispatcher）、给 WebRTC 浏览器和传统 SIP 电话搭桥。

GitHub ~2.8k 星，C 写成，GPLv2+ 协议。**核心配置文件 `kamailio.cfg` 用一种 C 风格 DSL 写路由逻辑**——类似 nginx 的 location 块，但流过来的是 SIP 信令而不是 HTTP。

## 为什么重要

- **电信级吞吐**——单机 10K+ CPS（calls per second），T-Mobile / 1&1 / 大量 Tier-1 运营商在用它跑生产流量
- **IMS 参考组件**——4G/5G 语音核心网（IP Multimedia Subsystem）里的 P-CSCF / I-CSCF / S-CSCF 经常就是 Kamailio
- **WebRTC 进电信网络的标准入口**——浏览器走 WebSocket+SIP 进来，Kamailio 翻译成 UDP+SIP 转给传统设备
- 想理解"为什么生产 VoIP 集群要拆成两层（信令层 + 媒体层）"，Kamailio 是看得最清楚的样本

## 核心要点

Kamailio 的设计有四个关键决定：

1. **只做信令，不做媒体**——SIP 信令（谁找谁、协商编解码）走 Kamailio；真正的语音 RTP 流由 rtpengine / rtpproxy 转发。这是它和 Asterisk / FreeSWITCH 最大的区别——后者是 B2BUA，信令媒体一锅端，重得多
2. **预分叉多进程 + 共享内存**——启动时 fork 出 N 个 worker 进程，请求来了任一 worker 都能处理。状态（注册表、事务）放在共享内存，用锁同步。**不是多线程**
3. **路由脚本 DSL**——`route { ... }` 块定义请求该怎么走。每个 SIP 方法（INVITE / REGISTER / SUBSCRIBE）有自己的入口
4. **KEMI（Kamailio Embedded Interface）**——cfg DSL 写复杂分支会变意大利面，KEMI 让你换成 Lua / Python / JavaScript / Ruby 写路由逻辑

200+ 模块按需加载：`tm`（事务管理）、`usrloc`（用户位置存储）、`registrar`（注册处理）、`auth`（鉴权）、`dispatcher`（负载均衡）、`presence`（在线状态）、`websocket`、`tls`、`rtpengine`（媒体桥接调用）。

传输层：UDP / TCP / TLS / WebSocket / SCTP 都支持。

## 实践案例

### 案例 1：最小路由脚本长什么样

```
request_route {
    if (is_method("REGISTER")) {
        save("location");
        exit;
    }
    if (is_method("INVITE")) {
        if (!lookup("location")) {
            sl_send_reply("404", "Not Found");
            exit;
        }
        t_relay();
    }
}
```

逐行翻译：

- `request_route` 是所有请求的入口
- 来的是注册（`REGISTER`）就调 `save("location")` 存进 usrloc 表
- 来的是呼叫（`INVITE`）先用 `lookup` 查对方现在注册在哪台设备
- 查不到回 404，查到了 `t_relay()` 转发出去（`t_` 前缀代表走事务模块，会重传 / 超时）

### 案例 2：典型生产架构

```
浏览器 / 软电话                     传统 SIP 话机
     |                                   |
     | WebSocket + SIP                   | UDP + SIP
     v                                   v
  +----------------------------------------+
  |              Kamailio (前)             |   <- 只管信令路由
  |   注册 / 鉴权 / 负载均衡 / 黑名单     |
  +-------------------+--------------------+
                      |
            +---------+---------+
            v                   v
      FreeSWITCH 1         FreeSWITCH 2     <- 媒体层：录音/IVR/会议
            |                   |
            +---------+---------+
                      |
                      v
                  rtpengine          <- RTP 流转发
```

Kamailio 在前面挡住所有信令、按需分发到后面的媒体集群；媒体引擎可以单独扩缩容。这种**信令媒体分离**是大流量 VoIP 的标准做法。

### 案例 3：KEMI 把路由写成 Python

```python
def ksr_request_route(msg):
    if KSR.is_method("REGISTER"):
        KSR.registrar.save("location", 0)
        return 1
    if KSR.is_method("INVITE"):
        if KSR.registrar.lookup("location") < 0:
            KSR.sl.send_reply(404, "Not Found")
            return 1
        KSR.tm.t_relay()
    return 1
```

同样的逻辑，写成 Python 后能用 IDE 补全、能 import 第三方库、能写单元测试。代价是性能比 cfg DSL 略低（每次调用要过 Python 解释器）。

## 踩过的坑

1. **Kamailio 单独不能"接通话"**——新人装完 Kamailio 拿两台话机互打，一边能听到对方说话另一边听不到。原因是没装 rtpengine，RTP 流没人转发。**信令通了不等于媒体通了**
2. **NAT 穿越是大头**——客户端在 NAT 后面，SIP 包里写的是内网 IP。要靠 `nathelper` 模块改写包头，再加 rtpengine 强制 RTP 走它中转。生产环境一半的故障都是 NAT
3. **共享内存调小了会神秘崩溃**——`shm` 默认 64MB，注册数一多就 OOM。要按"注册数 × 2KB + 事务并发数 × 8KB"估容量
4. **cfg 脚本错一个分号编译期不报错**——某些语法错误要请求来了才触发崩溃。上线前必须 `kamailio -c -f kamailio.cfg` 检查

## 适用 vs 不适用

**适用**：

- 大规模 SIP 注册 / 路由场景（10K+ 在线用户）
- 运营商级 IMS / VoLTE 部署
- WebRTC ↔ SIP 网关
- 需要把信令和媒体解耦的生产架构

**不适用**：

- 小规模（<100 分机）—— Asterisk 一台搞定，省得拆两层
- 需要 IVR / 录音 / 会议等媒体功能 —— 那是 FreeSWITCH / Asterisk 的活
- 不想自己写路由脚本 —— Kamailio 没有"开箱即用"的图形界面，需要懂 SIP

## 历史小故事（可跳过）

- **2001 年**：德国 Fraunhofer FOKUS 启动 SER（SIP Express Router），目标是开源跑电信级流量
- **2005 年**：核心开发者 fork 出 OpenSER，加新模块更激进
- **2008 年**：OpenSER 因商标问题改名 Kamailio（巴西土著词，意为"喜悦的呼喊"）；同年末与 SER 启动合并（SIP Router Project），代码后来统一到 Kamailio 名下
- **现在**：GitHub ~2.8k 星，约 250+ 名贡献者，每年发两个主版本

## 学到什么

1. **信令和媒体能分开**——VoIP 生产架构用这一招把成本和扩展性都解了
2. **预分叉多进程仍然好用**——不是所有 C 服务都要追着 epoll + 单线程跑；fork 出 worker + 共享内存在状态共享类服务里依然有竞争力
3. **DSL vs 嵌入语言**——Kamailio 的 cfg DSL 让简单场景一行就够，KEMI 让复杂场景能用 Python 写。两条路同时给，比强推一条更务实
4. **开源软交换不是一种产品**——Asterisk / FreeSWITCH / Kamailio 看似竞品，实际生产里经常组合使用，分别管不同的层

## 延伸阅读

- 官方文档：[Kamailio Wiki](https://www.kamailio.org/wiki/)
- 入门书：Daniel-Constantin Mierla, *Kamailio SIP Server Cookbook*
- KEMI 介绍：[Kamailio KEMI Framework](https://www.kamailio.org/wikidocs/devel/kemi/)
- [[asterisk]] —— 同代另一开源 PBX，B2BUA 路线
- [[freeswitch]] —— 媒体引擎，常和 Kamailio 配对使用

## 关联

- [[asterisk]] —— 1999 年开源 PBX，B2BUA 路线，信令媒体一锅端
- [[freeswitch]] —— 媒体引擎，生产中常做 Kamailio 的下游
- [[nginx]] —— Kamailio 的 cfg 路由脚本设计参考了 nginx 的 location 块思路
- [[haproxy]] —— 同样是"前置代理"思路，只不过 Kamailio 处理的是 SIP 不是 HTTP

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/asterisk]] —— Asterisk — 把企业总机变成一台 Linux 服务器
- [[freeswitch]] —— FreeSWITCH — 多线程软交换内核，给电话/视频会议当骨架
- [[jitsi-videobridge]] —— Jitsi Videobridge — 只读 RTP 包头的 WebRTC 视频转发器
