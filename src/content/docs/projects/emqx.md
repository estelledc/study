---
title: EMQX — 单集群千万连接的 MQTT 物联网消息总线
来源: https://github.com/emqx/emqx
日期: 2026-06-01
分类: 数据库 / 消息队列
难度: 中级
---

## 是什么

EMQX 是一个**用 Erlang/OTP 写的 MQTT broker（消息代理）**，把海量 IoT 设备发来的小消息按主题（topic）路由给订阅方。2013 年由杭州 EMQ 团队开源（最初叫 emqttd），核心协议是 MQTT 3.1 / 3.1.1 / 5.0，也支持 MQTT over QUIC、WebSocket。社区版 Apache 2.0，企业版收费。

日常类比：**像一个电视台 + 频道订阅系统**——汽车、空调、电表（设备）把数据按频道（topic，如 `car/123/gps`）发出去，云端服务订阅自己关心的频道就能拿到。EMQX 是中间那台调度机，记得"谁订了哪个频道"，新消息一来就分发。

最小例子（Python paho-mqtt）：

```python
import paho.mqtt.client as mqtt
c = mqtt.Client()
c.connect("broker.local", 1883)
c.publish("car/123/gps", '{"lat":31.2,"lon":121.5}')
```

千万级设备同时挂在 EMQX 上做这种 publish，broker 负责把每条消息送到所有订阅 `car/+/gps` 的后端服务。

## 为什么重要

不理解 EMQX，下面这些事都讲不通：

- 为什么车联网场景能让百万辆车同时上报 GPS 而接入层不先被打挂
- 为什么智能家居（Home Assistant 等）默认走 MQTT 长连接，而不是每次传感器读数都打一次 HTTP
- 为什么"设备消息"和"业务消息"基础设施长得不一样——同样叫消息队列，Kafka / RabbitMQ / EMQX 的工程取舍完全不同
- 为什么 Erlang 这门 1986 年的电信语言在 2026 年还活得很好

简单说：**它把"长连接 + 小消息 + 海量设备 + 必须不停机"这四件事打包成一个开箱即用的 broker**，是 IoT 后端架构里最常见的那一块。

## 核心要点

EMQX 的设计是 **四件套**：

1. **轻量进程模型**：每个 MQTT 客户端 = 一个 Erlang 进程（不是 OS 线程）。Erlang VM 本来就是为电信交换机设计的——单机几百万协程很正常，调度器负责切换。这是它能扛千万连接的根本原因。

2. **路由表 ETS + 一致性哈希**：哪个 topic 谁订阅了，存在 ETS（Erlang 内置内存表）里，集群间用一致性哈希定位 topic 的"拥有者"节点，避免广播。

3. **Mria 集群拓扑**：5.x 起的核心改动。core 节点负责写入 + 元数据（少数，3-5 台），replicant 节点只读拉副本（横向扩到几十台）。老版本 4.x 全 mesh，节点一多元数据同步爆炸。

4. **插件 hooks**：连接、认证、订阅、消息收发都暴露为钩子。规则引擎（用 SQL 写转发逻辑）、数据桥接（出消息到 Kafka / Redis / HTTP）、exhook（gRPC 远程钩子，用任意语言写扩展）都是基于这套 hook 系统。

对照其他消息中间件：Kafka 像"水管"做高吞吐流处理，RabbitMQ 像"快递柜"做应用解耦，EMQX 像"电视台"做海量长连接的设备 fan-in/fan-out。

## 实践案例

### 案例 1：车联网设备上报

每辆车每秒上报一次 GPS：

```python
client.publish(f"car/{vin}/gps", payload, qos=1)
```

百万辆车 = 百万个长连接挂在 EMQX 上。后端订阅 `car/+/gps`（`+` 是单层通配）就能收齐。Erlang 进程模型让每个连接独占一个进程，互相隔离，某个连接异常断不影响别人。

### 案例 2：规则引擎转 Kafka（企业版常见）

设备消息进 EMQX 后，用规则引擎落到 Kafka 给数据团队（Kafka sink 多属企业版能力）：

```sql
SELECT payload.lat AS lat, payload.lon AS lon, clientid
FROM "car/+/gps"
```

把 sink 配成 Kafka topic `gps-stream`。EMQX 扛设备长连接，Kafka 做后端批量回放——两层各干各的。社区版可先用 MQTT 转发或 HTTP 出口验证链路。
### 案例 3：QoS 的取舍

MQTT 三档：QoS 0（最多一次，发了就忘）、QoS 1（至少一次，broker 收到才回 PUBACK）、QoS 2（恰好一次，四次握手）。生产环境绝大多数用 QoS 1——QoS 2 在大集群下吞吐显著掉，因为每条消息要持久化两次状态机。"我宁可重投一次也不接受丢"是默认选择。

### 案例 4：共享订阅做后端横向扩

后端服务消费设备消息时不能多实例都收到同一条（会重复处理）。EMQX 早期就支持共享订阅扩展，MQTT 5 把它纳入标准：

```
$share/billing/car/+/payment
```

订阅这个 topic 的多个实例之间，broker 会按策略（round_robin / sticky / hash）把每条消息只送给其中一个，等价于 Kafka 的 consumer group。后端就能像无状态服务一样横向扩。

## 踩过的坑

1. **4.x 升 5.x 不能原地滚动**：Mria 和老 mesh 集群的元数据格式不兼容，需要双跑 + 业务切流。新搭集群直接 5.x，老集群提前规划停机窗口。

2. **共享订阅容易踩坑**：`$share/group/topic` 让多个消费者负载均衡同一个 topic，但负载策略（random / round_robin / sticky / hash）默认值在不同版本变过，跨版本升级行为可能突然变。

3. **认证插件顺序敏感**：JWT、PSK、X.509、HTTP 回调几个认证插件按配置顺序逐个尝试，第一个返回"通过"就放行。配错顺序可能让弱认证先匹配上，业务级权限校验完全不走。

4. **企业版才有的重型 sink**：社区版规则引擎可做 MQTT 转发、部分 Webhook/HTTP 出口；直连 Kafka / Pulsar / InfluxDB 等数据桥接多在企业版。开源选型时先对一下功能对照表。

5. **MQTT 5 properties 要客户端配合**：MQTT 5 加了 user properties、reason code 这些好东西，但客户端 SDK（尤其嵌入式 C 库）支持参差。设备侧不升级，broker 这边的新特性用不上。

## 适用 vs 不适用场景

**适用**：

- IoT 设备接入：车联网、智能家居、工业遥测、能源采集
- 海量长连接 + 小消息（< 几 KB）+ 低延迟（百毫秒级）
- 设备到云端的 fan-in、云端到设备的命令下发
- 需要规则引擎做轻量流式预处理（过滤、字段抽取、格式转换）

**不适用**：

- 高吞吐数据管道、长保留回放 → Kafka（按时间回到一周前 EMQX 做不到）
- 强 routing 表达力的微服务事件总线 → RabbitMQ（topic exchange + headers 比 MQTT topic 灵活）
- 单机几万连接就够用 → Mosquitto / NanoMQ 更轻
- 团队没 Erlang 经验、规模小、不愿运维集群 → 直接用云厂商托管 MQTT 服务
- 服务端到服务端的 RPC / 业务消息 → gRPC / Kafka / RabbitMQ 都比 MQTT 合适

## 跟其他消息系统对比

| 维度 | EMQX | Kafka | RabbitMQ | Mosquitto |
|---|---|---|---|---|
| 主要协议 | MQTT 全家族 | 自定义二进制 | AMQP / MQTT 插件 | MQTT |
| 单机连接数 | 百万 | 几万 | 几十万 | 几万 |
| 单条消息大小 | 小（< KB） | 中（MB） | 中（MB） | 小 |
| 路由模型 | topic 通配 | topic + partition | exchange + binding | topic 通配 |
| 集群规模 | 千万连接 | 高吞吐 | 中等吞吐 | 单机 |
| 长保留 | 弱 | 强（按时间回放） | 中 | 无 |
| 运行时 | Erlang BEAM | JVM | Erlang BEAM | C |

选型判据：**设备数量 + 消息大小 + 是否需要回放**——三者决定走哪条路。

## 历史小故事（可跳过）

- **2013**：杭州 EMQ 团队（创始人冯硕）开源 emqttd，定位 Erlang 版的 Mosquitto 替代
- **2017**：改名 EMQ X，企业版商业化，开始接车联网项目
- **2020**：4.x 稳定，单集群百万连接成熟，进 ASF 孵化讨论但未成形
- **2022**：5.0 发布，引入 Mria 集群、MQTT over QUIC、规则引擎 SQL 升级
- **2023-2024**：开始重写部分 hot path 为 Rust（NIF），追性能极限

中国厂商在基础设施开源里少有的能在全球 IoT 领域站住脚的项目。

## 学到什么

1. **协议选型决定基础设施长相**：MQTT 协议天生为低带宽、长连接、海量设备设计，broker 也跟着长成"百万进程 + 简单 topic"的样子，跟 Kafka / RabbitMQ 完全不是一类东西
2. **Erlang/OTP 的轻量进程 + 监督树 + 热升级**是 IoT broker 几乎无替代的运行时——电信交换机时代的设计目标恰好对上 IoT 的需求
3. **集群拓扑要为读写比例服务**：4.x 全 mesh 适合中等规模，5.x core+replicant 适合"读多写少 + 横向扩"的物联网场景
4. **开源 + 企业版分层**：免费版够小项目用，规则引擎全部 sink、跨集群复制、可视化监控放企业版

## 延伸阅读

- 官方文档：[EMQX Docs](https://docs.emqx.com/zh/emqx/latest/)（中文文档质量很高，安装到调优一条龙）
- MQTT 5 协议：[MQTT 5.0 OASIS Standard](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- Mria 设计博客：[EMQX blog — Mria internals](https://www.emqx.com/en/blog/mria-introduction)
- [[erlang-otp]] —— EMQX 的运行时基础
- [[kafka]] —— 高吞吐流处理对照
- [[rabbitmq-server]] —— 同样 Erlang 写的消息中间件，但走应用解耦路线

## 关联

- [[erlang-otp]] —— 提供 BEAM 运行时、监督树和轻量进程模型
- [[kafka]] —— 流处理对照：高吞吐 + 长保留 vs 海量长连接 + 实时
- [[rabbitmq-server]] —— 同 Erlang 阵营但定位不同：应用解耦 vs 设备接入
- [[redis]] —— Redis Pub/Sub 是单机轻量级替代，无持久化、无集群

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[rabbitmq-server]] —— RabbitMQ — 用 Erlang 写的多协议消息总线
- [[redis]] —— Redis — 内存键值数据库

