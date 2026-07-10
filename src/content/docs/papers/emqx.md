---
title: EMQX — Erlang 写的 MQTT broker，单集群扛千万 IoT 长连接
来源: EMQX 官方文档与源码（github.com/emqx/emqx）/ MQTT 5.0 标准（OASIS, 2019）
日期: 2026-06-01
分类: infrastructure
难度: 中级
---

## 是什么

EMQX 是一个**专门给海量 IoT 设备做消息中转的服务器**。日常类比：像一个超大型快递分拣中心——千万个设备（车、家电、传感器）寄包裹（数据），它按"地址"（topic）分发给该收的人（订阅者）。

它说的协议叫 **MQTT**——一种为弱网、低功耗设备设计的极简消息协议（消息头最小 2 字节）。

技术栈一句话：**Erlang/OTP 写核心 + Mria 集群 + ETS 内存路由表**，Apache 2.0 开源。

定位类比：
- Kafka 之于"事件流" → EMQX 之于"IoT 设备消息"
- Redis 之于"缓存" → EMQX 之于"长连接网关"

## 为什么重要

不理解 EMQX，下面这些事都没法解释：

- 为什么特斯拉、蔚来、米家这类"百万设备实时在线"场景，常见做法是走 MQTT broker，而不是让每台设备 HTTP 短连接或裸 WebSocket 直连业务服务
- 为什么这个领域里 **Erlang 写的 broker 常在单机连接密度上占优**（同内存下往往能挂更多长连接）——和 Java/Go 实现比，差距可以到一个数量级，但具体还看调优与硬件
- 为什么 5.x 版本要把集群方案从"全 mesh"换成"core + replicant"——千万连接逼着架构改一次
- 为什么 IoT 团队总在讨论"QoS 0 还是 1"——这不是参数选择，是吞吐和可靠性的取舍

## 核心要点

EMQX 能扛千万连接，靠**三个硬核设计**：

1. **每个客户端 = 一个 Erlang 进程**：Erlang 进程不是 OS 线程，是 VM 内调度的轻量协程，开销 ~2KB。一台 64GB 内存的机器开几百万进程没压力。类比：你开 100 万个浏览器 tab 电脑会死，但 Erlang 的"tab"成本只有 Chrome 的万分之一。

2. **Mria 集群（5.x 引入）**：节点分两类——**core 节点**负责写元数据（订阅关系、路由表），**replicant 节点**只读副本，横向加机器只加 replicant。类比：报社总部（core）写头版，分发中心（replicant）复印分发，加分发中心不影响总部。

3. **ETS 路由表 + topic 树**：订阅关系存在 Erlang 自带的内存表 ETS 里，topic 用前缀树组织。一条消息进来，O(log n) 找到所有订阅者。

三件加起来，让"100 万设备同时在线 + 每秒 100 万条消息"成了单集群能跑的事。

## 实践案例

### 案例 1：一个温度传感器到手机 App 的完整链路

```
温度传感器 ──MQTT──> EMQX ──MQTT──> 手机 App
   (publish)              (subscribe)
   topic: home/livingroom/temp
   payload: 26.5
```

设备做的事：
1. 连上 EMQX，发一个 `CONNECT` 包（带 client_id）
2. 发 `PUBLISH` 到 `home/livingroom/temp`，payload 是 `26.5`

App 做的事：
1. 连 EMQX，发 `SUBSCRIBE` 订阅 `home/livingroom/+`（`+` 是单层通配）
2. 收到 `PUBLISH`，UI 刷新

EMQX 在中间做：维护两条 TCP 长连接、把消息从一边转到另一边、记住"这个 client 订了什么"。设备从来不知道 App 存在。

### 案例 2：QoS 0 / 1 / 2 怎么选

| QoS | 含义 | 类比 | 用途 |
|-----|------|------|------|
| 0 | 至多一次 | 寄平信，丢就丢 | 高频遥测（车速每 100ms 一次） |
| 1 | 至少一次（可能重复）| 挂号信，签收即可 | 状态变更（车门锁了） |
| 2 | 恰好一次 | 邮政公证，全程对账 | 金融交易（很少在 IoT 用） |

实战里 90% 的流量是 QoS 1，QoS 2 在大集群下吞吐降一个数量级，多数团队避开。

### 案例 3：规则引擎把消息转到 Kafka

EMQX 内置一个 SQL 风格的"规则引擎"。这条规则：

```sql
SELECT clientid, payload.temp AS temperature
FROM "home/+/temp"
WHERE payload.temp > 30
```

意思是：从 `home/<任意>/temp` 这种 topic 收消息，只保留温度 > 30 的，再交给下游动作。

开源版常见下游是 **HTTP / MQTT**（webhook、再发布到别的 topic）。**Kafka / Pulsar / 多数数据库 Sink 属于企业版**——规则引擎能过滤，不等于开源就能一键进 Kafka。选型时先对版本能力清单。

这让 EMQX 不只是"转消息"，还是"实时过滤 + 路由"的小型流处理器。

## 踩过的坑

1. **学 Erlang 本身有门槛**：函数式语法 + actor 模型 + 模式匹配，对 Java/Go 背景的工程师陌生。但**用 EMQX 不需要写 Erlang**，配置和规则引擎都是 SQL 和 YAML；只有改源码或写原生插件才需要。

2. **4.x → 5.x 不能原地升级**：4.x 集群是全 mesh（所有节点互联），5.x 是 Mria（core + replicant）。生产环境必须搭新集群、灰度迁连接。

3. **QoS 2 在大集群下吞吐塌**：QoS 2 需要 4 次握手（PUBLISH / PUBREC / PUBREL / PUBCOMP），跨节点路由时延迟放大。大流量场景一律 QoS 1 + 业务层去重。

4. **开源版数据集成很窄**：社区版主要是 HTTP Server / MQTT 服务；Kafka、Pulsar、InfluxDB、TDengine 等 Sink 多在企业版。案例 3 的"进 Kafka"不要按开源默认能力来规划。

5. **共享订阅（shared subscription）容易踩**：`$share/group1/topic` 让多消费者负载均衡，但**离线消息不会重发给已离开的成员**——QoS 1 + 共享订阅会丢消息，文档里写得不显眼。

6. **clean_session 默认行为变了**：MQTT 5.0 用 `Session Expiry Interval` 替代 3.x 的 `clean_session` 标志位。老 SDK 升 5.0 时如果没显式设过期时间，会话默认立刻过期，**离线下发的消息全丢**。迁移前先把 SDK 行为对一遍。

## 适用 vs 不适用场景

**适用**：
- IoT 设备接入：车联网、智能家居、工业遥测、智能表计
- 实时双向通信：移动 App 推送 + 上行（聊天、协作工具有时也用）
- 大量长连接 + 小消息：消息平均几十到几百字节，连接数百万级

**不适用**：
- 大消息流式传输（视频、文件）→ 用 Kafka / Pulsar / 对象存储
- 强事务保证（金融下单）→ MQTT QoS 2 不够，用消息中间件 + 数据库事务
- 请求响应模式（RPC）→ MQTT 是发布订阅，做 RPC 很别扭，用 HTTP/gRPC
- 单机几千连接的小场景 → Mosquitto / NanoMQ 更轻

## 历史小故事（可跳过）

- **1999 年**：IBM 的 Andy Stanford-Clark 为石油管道传感器发明 MQTT，目标是带宽贵到按字节算的卫星链路
- **2011 年**：MQTT 捐给 OASIS，2014 年成为国际标准
- **2013 年**：feng-lee 在 GitHub 开源 emqttd（EMQX 前身），Erlang 写
- **2017 年**：改名 EMQ X（X 代表横向扩展），成立 EMQ 公司
- **2023 年**：发布 5.0，集群方案换成 Mria，单集群目标做到 1 亿连接

MQTT 从"省卫星带宽"诞生，30 年后变成 IoT 默认协议。

## 学到什么

1. **场景塑造架构**：千万长连接逼出 Erlang，强一致逼出 Raft，海量分析逼出列存——技术选型本质是**对场景做减法**
2. **协议设计的简洁有复利**：MQTT 头 2 字节、5 种核心包、QoS 三档——简单到嵌入式 8 位机也能实现，就跑遍世界
3. **Erlang 的"长连接 + 不停机"是真护城河**：在海量长连接场景里，Erlang/OTP 的调度模型常让同类 Java/Go broker 难追平连接密度——不全是业务代码没优化，VM 模型就不一样
4. **集群方案随规模迭代**：4.x mesh 在百万连接够用，千万连接必须 core+replicant；下一代可能再换

## 延伸阅读

- [EMQX 官方文档](https://docs.emqx.com/zh/emqx/latest/)（中文齐全）
- [MQTT 5.0 标准 PDF](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.pdf)（180 页，前 30 页讲清协议骨架）
- 视频：[HiveMQ — MQTT Essentials](https://www.hivemq.com/mqtt-essentials/)（10 集，每集 5 分钟讲清一个概念）
- 源码导读：[EMQX GitHub](https://github.com/emqx/emqx) `apps/emqx/src/emqx_channel.erl` 是单连接生命周期
- [[erlang-otp]] —— EMQX 的语言 + 框架基础
- [[mqtt-protocol]] —— MQTT 协议本身的笔记（待写）

## 关联

- [[erlang-otp]] —— EMQX 跑在 Erlang/OTP 上，监督树和热升级是核心特性
- [[kafka]] —— 同样大流量消息系统，定位互补：Kafka 做事件流，EMQX 做设备接入
- [[redis]] —— 都吃长连接，但 Redis 是 KV 存储，EMQX 是消息路由
- [[grpc]] —— 设备和云之间的另一种协议，请求响应风格，对比 MQTT 的发布订阅
- [[loki]] —— 同样是基础设施，定位完全不同（日志聚合 vs 设备消息）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[redis]] —— Redis — 内存键值数据库

