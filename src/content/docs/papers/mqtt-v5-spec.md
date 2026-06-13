---
title: MQTT Version 5.0 — 物联网里的「小区广播站 + 信箱系统」
来源: https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象一栋公寓楼装了一套**小区广播站**：

- 住户（**Client**）不用彼此认识，也**不用同时在线**。有人想说话，就对着某个**频道名**（**Topic**）喊一嗓子；订阅了这个频道的人（别的 Client）就会收到。
- 楼里有一台**总机**（**Broker**），负责收消息、查订阅表、转发。住户不直接串门，一切都经过总机——这就是 **发布/订阅（Publish/Subscribe）**，不是点对点打电话。

MQTT（Message Queuing Telemetry Transport）就是这套广播站的标准操作规程。OASIS 在 **2019 年 3 月** 发布 **MQTT Version 5.0**（编辑：Andrew Banks 等），在 **MQTT 3.1.1**（ISO/IEC 20922）之上做了大量增强，但**核心模型不变**：轻量、基于 TCP（或 WebSocket 等有序可靠连接）、适合带宽窄、设备弱的 **M2M / IoT** 场景。

规范全文：[MQTT Version 5.0 | OASIS Standard](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)

## 这篇规范在说什么

| 维度 | 内容 |
|------|------|
| 发布方 | OASIS Message Queuing Telemetry Transport (MQTT) TC |
| 版本 | MQTT v5.0（2019-03-07 OASIS Standard） |
| 传输 | 默认 TCP/IP；亦可在 WebSocket 等有序、无损、双向连接上运行 |
| 角色 | **Client**（发布者/订阅者）与 **Server/Broker**（消息中介） |
| 与 v3.1.1 关系 | 协议级别字段 `Protocol Level = 5`；不兼容旧版 CONNECT，Broker 可回 `0x84 Unsupported Protocol Version` |
| v5 设计目标 | 大规模可扩展、更好错误报告、能力发现、请求/响应模式、**User Properties** 扩展、小客户端性能优化 |

一句话：**MQTT 规定的是「谁连上来、订什么题、发什么字、保证送到什么程度、断线后会怎样」**——不包含业务 payload 的语义，那是应用层的事。

## 为什么值得学

| 场景 | MQTT 提供的价值 |
|------|-----------------|
| 传感器上报 | 成千上万设备用几 KB 内存即可实现定时 publish |
| 远程控制 | 手机 App 订阅 `home/living-room/light/set`，灯订阅同一 topic 收命令 |
| 车联网 / 工业 | QoS 1/2 + 会话保持，弱网下仍可恢复订阅 |
| 微服务间消息 | 与 Kafka 不同，MQTT 面向**终端设备 + 低功耗**，Broker 常部署在边缘 |
| 从 v3.1.1 升级 | v5 的 Reason Code、Session Expiry、Topic Alias 直接影响 Broker 选型与排错 |

若你学过 HTTP 或 WebSocket：**HTTP 是「我问你答」**；**MQTT 是「我贴公告栏，订阅的人自己来看」**——适合「产生数据的一方和消费数据的一方解耦」的拓扑。

## 核心概念一：控制报文与连接生命周期

MQTT 在 TCP 之上交换**二进制控制报文（Control Packet）**。常用类型：

| 报文 | 方向 | 作用 |
|------|------|------|
| CONNECT / CONNACK | C→S / S→C | 建立连接、协商能力 |
| PUBLISH | 双向 | 发布应用消息 |
| SUBSCRIBE / SUBACK | C→S / S→C | 订阅一个或多个 Topic Filter |
| UNSUBSCRIBE / UNSUBACK | C→S / S→C | 取消订阅 |
| PINGREQ / PINGRESP | C↔S | 保活（Keep Alive） |
| DISCONNECT | C→S | 优雅断开，可带 Reason Code 与 Session Expiry |
| AUTH | 双向 | 增强认证（Challenge/Response） |

连接建立流程（简化）：

```
Client                          Broker
   | CONNECT (ClientID, Keep Alive, Properties)
   |------------------------------------------>|
   |                    CONNACK (Reason Code, Session Present, 能力标志)
   |<------------------------------------------|
   | SUBSCRIBE (filters + QoS)                 |
   |------------------------------------------>|
   | SUBACK (per-subscription Reason Codes)    |
   |<------------------------------------------|
   | PUBLISH (topic, payload, QoS, properties) |
   |------------------------------------------>|
   |        ... 转发给所有匹配的订阅者 ...      |
```

**Client Identifier** 在 Broker 上唯一标识会话；空 ClientID 仅允许 **Clean Start = 1** 的瞬时连接（规范约束）。

## 核心概念二：Topic、通配符与 QoS

**Topic Name** 是 UTF-8 字符串，用 `/` 分层，例如 `factory/line3/temperature`。  
**Topic Filter** 用于订阅，除精确名外还支持：

- `+`：单层通配（`home/+/temp` 匹配 `home/kitchen/temp`）
- `#`：多层通配，且**只能出现在 filter 末尾**（`home/#`）

**QoS（Quality of Service）** 决定传递保证：

| QoS | 名称 | 行为 | 类比 |
|-----|------|------|------|
| 0 | 最多一次 | 发了就忘，可能丢 | 楼道里喊一嗓子 |
| 1 | 至少一次 | PUBACK 确认，可能重复 | 挂号信 |
| 2 | 恰好一次 | 四步握手 PUBREC/PUBREL/PUBCOMP | 银行转账回执 |

v5 在 CONNACK 里用 **Maximum QoS** 等属性声明 Broker 能力；订阅时也可为每个 filter 单独指定 QoS（SUBSCRIBE payload 里每项一个）。

## 核心概念三：v5 相对 v3.1.1 的关键变化

### Clean Start 与 Session Expiry Interval

v3.1.1 的 **Clean Session** 一个布尔值管两件事：是否复用旧会话、断线后会话何时销毁。  
v5 拆成：

- **Clean Start**（CONNECT 标志位）：`1` = 不复用旧会话，开新会话；`0` = 若 Broker 有该 ClientID 的会话则恢复。
- **Session Expiry Interval**（属性，秒）：断线后 Broker **保留会话状态**（订阅、未发完的 QoS 1/2 消息等）多久。`0` = 断线即结束；`0xFFFFFFFF` = 永不过期。

等价关系（规范附录 C）：**Clean Start=1 且 Session Expiry=0** ≈ v3.1.1 的 **Clean Session=1**。

DISCONNECT 报文也可携带 **Session Expiry Interval**，在断开时**修改**保留时长——适合「临时下线但希望 Broker 继续替我收消息」。

### Properties 与 User Properties

v5 在 CONNECT、CONNACK、PUBLISH、SUBSCRIBE 等报文的 Variable Header 末尾增加 **Properties** 列表。每个 Property 由 **Identifier（变长整数）+ 类型化值** 组成。

**User Property** 是键值对（UTF-8 字符串对），由**应用或实现自定义**：

- PUBLISH 上的 User Property 随消息转发给订阅者（如设备序列号、时间戳、追踪 ID）。
- CONNECT 上的 User Property 由 Server 实现定义语义。
- CONNACK / SUBACK 等上的由发送方定义。

协议**不解释** User Property 的含义——这是 v5 **可扩展** 的核心机制。

### Reason Code

v5 为 CONNACK、PUBACK、DISCONNECT、SUBACK 等引入 **Reason Code**（单字节）：

- `< 0x80`：成功（通常 `0x00`）
- `≥ 0x80`：失败（如 `0x84` 协议版本不支持、`0x87` 未授权、`0x91` Packet Identifier 占用中）

排错时终于不必猜「Broker 为啥踢我」——CONNACK 里常有明确原因。

### 其他重要 v5 特性（速览）

| 特性 | 作用 |
|------|------|
| **Topic Alias** | 用 2 字节整数代替长 Topic 字符串，省带宽 |
| **Message Expiry Interval** | 消息在 Broker 最长停留时间，过期则不下发 |
| **Subscription Identifier** | 订阅时打标，PUBLISH 带回，便于客户端多路复用回调 |
| **Shared Subscription** | `$share/{ShareName}/{TopicFilter}`，多客户端负载分担同一订阅 |
| **Request / Response** | 通过 **Response Topic** + **Correlation Data** 属性实现类 RPC |
| **Will Message** | CONNECT 时注册「遗嘱」，异常断线后 Broker 代发；v5 增加 **Will Delay Interval** |
| **AUTH** | 支持多次往返的增强认证（如 SASL） |

## 代码示例一：Python 发布者与订阅者（paho-mqtt）

需安装 `paho-mqtt`（≥1.5 支持 v5 API）。本地可先起 Broker：`docker run -d -p 1883:1883 eclipse-mosquitto`。

**订阅者** `subscriber.py`：

```python
import paho.mqtt.client as mqtt

def on_connect(client, userdata, flags, reason_code, properties):
    # v5: reason_code 为 ReasonCode 对象；flags.session_present 表示是否恢复会话
    print(f"已连接, reason={reason_code}, session_present={flags.session_present}")
    client.subscribe("demo/sensors/#", qos=1)

def on_message(client, userdata, msg):
    # msg.properties 为 MQTT v5 属性（含 User Property）
    props = getattr(msg.properties, "UserProperty", None)
    print(f"topic={msg.topic} payload={msg.payload!r} user_props={props}")

client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="study-sub-01",
    protocol=mqtt.MQTTv5,
)
client.on_connect = on_connect
client.on_message = on_message

# Session Expiry: 断线后 Broker 保留订阅 60 秒
connect_properties = mqtt.Properties(mqtt.PacketTypes.CONNECT)
connect_properties.SessionExpiryInterval = 60

client.connect("localhost", 1883, keepalive=30)
client.loop_forever()
```

**发布者** `publisher.py`：

```python
import json
import time
import paho.mqtt.client as mqtt

client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="study-pub-01",
    protocol=mqtt.MQTTv5,
)
client.connect("localhost", 1883)

publish_props = mqtt.Properties(mqtt.PacketTypes.PUBLISH)
publish_props.UserProperty = [("source", "pipeline-v3"), ("unit", "celsius")]
publish_props.MessageExpiryInterval = 120  # 消息 120 秒内有效

payload = json.dumps({"temp": 23.5, "ts": int(time.time())})
client.publish(
    "demo/sensors/room1",
    payload,
    qos=1,
    properties=publish_props,
)
client.disconnect()
```

运行顺序：先 `python subscriber.py`，再 `python publisher.py`。观察订阅端是否收到 JSON 与 User Property。

## 代码示例二：请求/响应模式（Response Topic）

MQTT 原生是单向 publish，v5 用属性约定「回帖地址」：

```
Client A                          Broker                          Client B
   | PUBLISH topic=cmd/req                                      |
   |   Response Topic=cmd/res/42                                |
   |   Correlation Data=0xdeadbeef                              |
   |----------------------------------------------------------->|
   |                              转发给订阅 cmd/req 的 B        |
   |                              B 处理后 PUBLISH              |
   |                              topic=cmd/res/42              |
   |                              Correlation Data=0xdeadbeef   |
   |<-----------------------------------------------------------|
```

Node.js（`mqtt` 包）片段：

```javascript
import mqtt from 'mqtt'

const client = mqtt.connect('mqtt://localhost', { protocolVersion: 5 })

client.on('connect', () => {
  const correlation = Buffer.from('req-1001')
  const responseTopic = 'demo/rpc/responses/alice'

  client.subscribe(responseTopic)

  client.publish(
    'demo/rpc/requests',
    JSON.stringify({ action: 'get_status' }),
    {
      properties: {
        responseTopic,
        correlationData: correlation,
        userProperties: { schema: 'v1' },
      },
    },
  )
})

client.on('message', (topic, payload, packet) => {
  const { correlationData } = packet.properties
  console.log('reply on', topic, correlationData?.toString(), payload.toString())
})
```

请求方订阅自己的 `responseTopic`，把同一 **Correlation Data** 在请求与响应中配对——多并发 RPC 时不会串线。

## 实践注意点

### Broker 能力发现

连接后读 **CONNACK Properties**：`Maximum QoS`、`Retain Available`、`Wildcard Subscription Available`、`Shared Subscription Available`、`Topic Alias Maximum` 等。客户端应**按 Broker 声明的能力**降级行为，而不是假设全功能。

### Retain 与 LWT

- **RETAIN** 标志：Broker 保存该 Topic **最后一条**消息，新订阅者立即收到「当前状态」——适合温度、开关状态。
- **Will Message（遗嘱）**：CONNECT 时登记，**非正常断线**且 Will Delay 过后发布——适合「设备离线告警」。若发 DISCONNECT 且 Reason Code 为 `0x00 Normal disconnection`，遗嘱**不触发**。

### 安全

规范假定传输层可配 TLS（`mqtts://`）、用户名密码或增强 AUTH。生产环境：**TLS + 强 ClientID/密码策略 + ACL 按 Topic 授权**；不要把 MQTT 端口裸奔在公网。

### 与 HTTP、CoAP、Kafka 的边界

| 协议 | 模型 | 典型场景 |
|------|------|----------|
| HTTP | 请求/响应 | REST API、网页 |
| MQTT | 发布/订阅 | 传感器、家居、车联网 |
| CoAP | REST over UDP | 极受限 MCU |
| Kafka | 日志流、高吞吐 | 数据中心、流处理 |

MQTT 优势在**极低客户端开销 + 海量连接 + Topic 路由**；不适合大文件传输或复杂查询——那是别的层该做的事。

## 读懂规范时的阅读顺序

1. **第 1–2 章**：术语、数据类型、Properties 编码规则、Reason Code 表  
2. **第 3 章**：各 Control Packet 二进制布局（CONNECT / PUBLISH 优先）  
3. **第 4 章**：操作流程（会话、订阅、QoS 2 状态机、共享订阅、请求响应）  
4. **附录 C**：v5 新特性一览（非规范性，适合快速对照）  
5. **附录 B**：与 MQTT v3.1.1 的差异及迁移提示  

## 小结

| 要点 | 一句话 |
|------|--------|
| 模型 | Client 经 Broker 按 Topic 发布/订阅，彼此解耦 |
| v5 会话 | Clean Start + Session Expiry 精细控制断线后会话寿命 |
| 可扩展 | Properties / User Property 给报文和消息挂自定义元数据 |
| 可观测 | Reason Code 让拒绝与失败可机器可读 |
| 进阶模式 | Shared Subscription 负载均衡；Response Topic 做 RPC |
| 实现 | Mosquitto、EMQX、HiveMQ、paho-mqtt、mqtt.js 等均已支持 v5 |

MQTT v5.0 不是重写协议，而是把物联网十年实践里「说不清、做不到、排错难」的部分**写进标准**：会话怎么留、错误为什么、元数据怎么带、请求怎么回。零基础入门时，先跑通 **connect → subscribe → publish**，再逐项打开 Session Expiry、User Property 和 Reason Code——对照 OASIS 正文查表，比死记报文字节容易得多。

## 延伸阅读

- [MQTT Version 5.0 - OASIS Open](https://www.oasis-open.org/standard/mqtt-v5-0-os/) — 标准页与引用格式  
- [MQTT 3.1.1 ISO/IEC 20922](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html) — 对比迁移基线  
- [Eclipse Mosquitto](https://mosquitto.org/) — 轻量开源 Broker，适合本地实验  
- [Eclipse Paho](https://www.eclipse.org/paho/) — 多语言客户端参考实现  
