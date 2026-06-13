---
title: Eclipse Mosquitto — 轻量级 MQTT 消息代理，物联网的「社区广播站」
来源: 'https://github.com/eclipse-mosquitto/mosquitto'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
难度: '初级'
provenance: 'pipeline-v3'
---

## 是什么

**Eclipse Mosquitto** 是 [eclipse-mosquitto/mosquitto](https://github.com/eclipse-mosquitto/mosquitto) 维护的开源 **MQTT 消息代理（broker）**。它实现了 MQTT 协议 5.0、3.1.1 和 3.1，负责接收客户端发布的消息、按主题（topic）路由、并按 QoS 等级投递给订阅者。同一项目还提供 C 语言客户端库 **libmosquitto**，以及命令行工具 `mosquitto_pub`、`mosquitto_sub`、`mosquitto_passwd` 等。

日常类比：**小区里的社区广播站**。

传统 HTTP 像「一对一打电话」——你要找谁，就得知道对方的号码，对方不在线就失败。MQTT + Mosquitto 则像广播站：住户（设备/应用）不用彼此认识，只要订阅自己关心的频道（topic），广播站（broker）就会把消息推给所有订阅该频道的人。有人发「3 号楼电梯故障」（publish），订阅了 `building/3/elevator/#` 的物业 App、维修工手机、大屏看板（subscriber）会同时收到，发消息的人不必知道谁在听。

Mosquitto 的定位是**轻、小、快**：从树莓派到 x86 服务器都能跑，RAM 占用通常在 MB 级，是智能家居、工业传感、车联网边缘网关里最常见的 MQTT broker 之一。公开测试实例见 [test.mosquitto.org](https://test.mosquitto.org/)；生产环境建议自建并配置认证与 TLS。

与 [[rabbitmq-server]] 的对比：RabbitMQ 原生是 AMQP（队列 + 交换机），MQTT 只是插件之一；Mosquitto **专精 MQTT**，协议栈更薄、部署更轻，但功能面（复杂路由、多协议、管理 UI）不如 RabbitMQ 全家桶。和 [[nginx]] 也不同——Nginx 终止 HTTP 请求并反向代理；Mosquitto 处理的是**长连接、发布/订阅语义**的 MQTT 会话。

## 解决什么问题

物联网和边缘场景里，设备数量大、网络不稳定、带宽贵，HTTP 轮询（设备每隔 N 秒问一次「有新数据吗？」）既费电又浪费流量。MQTT 用**持久 TCP 连接 + 推送**解决这类问题，Mosquitto 则是把这套协议跑成可运维的服务：

| 痛点 | 没有 broker 时 | Mosquitto 的回应 |
| --- | --- | --- |
| 设备互不认识 | 每台设备要知道对端 IP，拓扑一变就全改配置 | 全部连 broker，只关心 topic 名字 |
| 弱网/断线 | TCP 直连丢消息无标准重试 | QoS 0/1/2 分级保证，会话可恢复 |
| 新设备上线要历史状态 | HTTP 得额外查 API | Retained message 保留「最后已知值」 |
| 资源受限 | 重量级消息中间件装不进 MCU 网关 | 单二进制、配置简单，适合嵌入式 Linux |
| 安全暴露 | 裸奔端口被扫 | 密码文件、ACL、TLS、MQTT 5 动态安全插件 |

核心要回答的问题：**如何用最小运维成本，让成百上千个客户端通过主题名松耦合地交换消息？**

## 核心概念

### 1. Broker / Client / Topic：三角关系

```
Publisher ──publish──►  Mosquitto Broker  ──deliver──► Subscriber(s)
              topic: home/living/temp              subscribe: home/+/temp
```

- **Broker**：Mosquitto 进程本身，默认监听 `1883`（明文 MQTT）或 `8883`（TLS）。
- **Client**：任何连上来的发布者或订阅者——可以是 `mosquitto_pub`、Python `paho-mqtt`、ESP32 固件、Node-RED 节点。
- **Topic**：层级字符串，用 `/` 分隔，如 `sensor/kitchen/humidity`。Broker **不解析** topic 含义，只做字符串匹配路由。

### 2. 发布/订阅（Pub/Sub）vs 队列

MQTT **没有** RabbitMQ 意义上的「队列」概念（除非用共享订阅等扩展用法）。一条消息发布到 `factory/line1/speed` 后，**当前所有**匹配订阅都会收到一份拷贝；若当时没有订阅者，消息对该 topic 而言就「没人收」（除非设置了 retain 或持久会话 + QoS>0 的离线队列机制）。

### 3. QoS（Quality of Service）：投递保证三档

| QoS | 名称 | 行为 | 典型场景 |
| --- | --- | --- | --- |
| 0 | 最多一次 | 发了就忘，可能丢 | 高频 telemetry、可容忍丢失 |
| 1 | 至少一次 | 有 ACK，可能重复 | 一般传感数据 |
| 2 | 恰好一次 | 四次握手，最慢最安全 | 计费、关键指令 |

注意：**实际投递 QoS = min(发布 QoS, 订阅 QoS)**。客户端订阅 QoS 0 时，即使对方用 QoS 2 发布，你收到的仍是 QoS 0。

### 4. Topic 通配符：订阅时的模式匹配

只在**订阅**侧使用（发布 topic 必须是字面量）：

- `+`：匹配单层。`home/+/temp` 匹配 `home/kitchen/temp`，不匹配 `home/kitchen/dining/temp`。
- `#`：匹配剩余所有层，**必须出现在末尾**。`home/#` 匹配 `home/a/b/c`。

### 5. Retained Message：新订阅者的「快照」

发布时带上 retain 标志，broker 会为该 topic **保留最后一条**消息。之后任何新订阅者连上并订阅该 topic，会**立即**收到这条 retained 消息，而不必等设备下次上报。适合「当前温度」「阀门开/关状态」这类低频更新但新人需要立刻知道的场景。

### 6. Clean Session / 持久会话（MQTT 3.1.1）与 Session Expiry（MQTT 5）

客户端断线后，broker 是否为其缓存 QoS 1/2 未确认消息、是否记住订阅，取决于会话标志。MQTT 5 用 Session Expiry Interval 细化了超时行为。Mosquitto 对两者均支持。

### 7. 配置文件 `mosquitto.conf`：从「本机玩具」到「可上线」

不带 `-c` 启动时，Mosquitto 2.x 默认只监听 **loopback** 的 1883，且允许本机匿名访问——适合第一次冒烟测试。要接受局域网或公网设备，必须显式配置 **listener** 和 **认证**：

```conf
# /etc/mosquitto/mosquitto.conf 片段

listener 1883 0.0.0.0
allow_anonymous false
password_file /etc/mosquitto/passwd

# 可选：按 topic 限制读写
# acl_file /etc/mosquitto/acl

# 持久化（重启后保留 retained 与部分状态）
persistence true
persistence_location /var/lib/mosquitto/
```

创建用户：

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd sensor01
# 按提示输入密码；-c 仅首次创建文件时使用，追加用户时去掉 -c
```

ACL 文件示例（每行：`topic [read|write|readwrite|deny] <pattern>`）：

```conf
user sensor01
topic write factory/line1/#

user dashboard
topic read factory/#
```

### 8. 桥接（Bridge）：broker 之间同步 topic

大型部署常把边缘 Mosquitto 与云端 Mosquitto 用 **bridge** 连接，按 topic 模式单向或双向转发。配置块以 `connection <name>` 开头，内部用 `address`、`topic` 等指令定义远端 broker 与映射规则——适合「工厂边缘采集 → 总部汇总」拓扑。

### 9. 可观测性：`$SYS/` 主题

Mosquitto 发布 broker 自身指标到 `$SYS/broker/...` 层次，例如 `$SYS/broker/clients/connected`、`$SYS/broker/messages/received`。订阅 `$SYS/#` 可接入监控（注意 `$SYS` 不匹配单独的 `#` 订阅，需显式写 `$SYS/#`）。

## 快速上手

### 安装

| 平台 | 方式 |
| --- | --- |
| macOS | `brew install mosquitto` |
| Debian/Ubuntu | `apt install mosquitto mosquitto-clients` 或 Mosquitto PPA |
| Windows | 官网安装包 [mosquitto.org/download](https://mosquitto.org/download/) |
| Docker | `docker run -it -p 1883:1883 eclipse-mosquitto:2` |

安装后包管理器通常会注册 systemd 服务；开发机也可前台启动：

```bash
mosquitto -v
# 另开终端：订阅
mosquitto_sub -t 'test/topic' -v
# 再开终端：发布
mosquitto_pub -t 'test/topic' -m 'hello world'
```

`-v` 在 `sub` 端会打印 topic 名与 payload，便于确认路由是否正确。

## 代码示例

### 示例 1：命令行验证 QoS 与 retain

终端 A——订阅 QoS 1，观察 retained 消息：

```bash
mosquitto_sub -h localhost -t 'demo/status' -q 1 -v
```

终端 B——发布 retained 状态（新订阅者会立刻看到 `online`）：

```bash
mosquitto_pub -h localhost -t 'demo/status' -m 'online' -q 1 -r
```

再发一条非 retain 的普通消息：

```bash
mosquitto_pub -h localhost -t 'demo/status' -m 'heartbeat-'$(date +%s) -q 1
```

你会看到：后连上的订阅者先收到 retained 的 `online`，再收到后续实时 heartbeat。`-r` 即 retain 标志；`-q 1` 指定 QoS 1。

### 示例 2：Python 客户端（paho-mqtt）

需要先安装：`pip install paho-mqtt`

**subscriber.py**——订阅通配符并打印：

```python
import paho.mqtt.client as mqtt

def on_connect(client, userdata, flags, reason_code, properties):
    print("connected:", reason_code)
    client.subscribe("home/+/temperature", qos=1)

def on_message(client, userdata, msg):
    print(f"{msg.topic} => {msg.payload.decode()}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.on_message = on_message

client.connect("localhost", 1883, keepalive=60)
client.loop_forever()
```

**publisher.py**——定时上报（另开终端运行）：

```python
import json
import time
import paho.mqtt.client as mqtt

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect("localhost", 1883, keepalive=60)
client.loop_start()

rooms = ["kitchen", "bedroom", "balcony"]
for room in rooms:
    payload = json.dumps({"c": 22.5, "ts": int(time.time())})
    topic = f"home/{room}/temperature"
    client.publish(topic, payload, qos=1, retain=False)
    print("published", topic)
    time.sleep(0.5)

client.loop_stop()
client.disconnect()
```

若 broker 启用了 `allow_anonymous false`，需在 `connect` 前调用 `client.username_pw_set("sensor01", "your_password")`。

### 示例 3：最小 TLS listener（生产方向）

```conf
listener 8883
cafile /etc/mosquitto/certs/ca.crt
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key
require_certificate false
```

客户端连接时使用 `--cafile` 校验服务器证书。内网测试可用 `mosquitto-tls` 文档中的自签流程；公网务必用正规 CA 或私有 PKI。

## 典型应用场景

1. **智能家居**：Home Assistant、OpenHAB 默认集成 Mosquitto，灯、温湿度、开关统一走 MQTT topic。
2. **工业网关**：边缘 Linux 盒子跑 Mosquitto，PLC/传感器 pub 到本地 topic，bridge 同步到云端时序库。
3. **移动 App 推送链路**：后端 pub 到 `user/{id}/notify`，App 长连 sub，比 FCM 直连更可控（需自建保活与认证）。
4. **车联网 telematics**：车辆终端 QoS 1 上报 GPS，服务端 sub `fleet/+/gps` 聚合。
5. **开发与联调**：连 [test.mosquitto.org](https://test.mosquitto.org/) 公共 broker 快速验证协议，**勿传生产密钥**。

## 踩过的坑

1. **默认只监听 127.0.0.1**：Mosquitto 2.0 起安全默认值收紧，局域网设备连不上往往不是防火墙，而是没配 `listener 1883 0.0.0.0`。
2. **匿名访问误开公网**：不带配置或 `allow_anonymous true` 暴露在公网，几小时内会被扫描滥用（转发垃圾 topic、当代理打内网）。公网必须密码 + ACL 或 TLS 客户端证书。
3. **QoS 2 并非「业务恰好一次」**：QoS 2 只保证 **MQTT 传输层** 不重复，消费者业务仍要做幂等（自己写 DB unique key 等）。
4. **retain 滥用**：对高频 telemetry 开 retain 会让新订阅者收到一条「过期的最后一帧」，误以为当前仍有效；retain 适合**状态类** topic，不适合**事件流**。
5. **通配符订阅性能**：`#` 订阅整个树在大流量下 CPU 升高；按业务拆 topic 层级，监控用 `$SYS/#` 单独开只读账号。
6. **MQTT 3.1.1 与 5.0 混部**：老固件连 3.1.1、新服务用 5.0 特性（如 topic alias）时要确认 broker 与库版本；Mosquitto 同时支持，但客户端能力不一致会导致「连上却订阅失败」。
7. **配置文件改完不生效**：部分 listener 选项标注为 reload 时不生效，改 TLS 证书或 `max_qos` 后需 `systemctl restart mosquitto`，或用 `mosquitto --test-config -c /path/to/mosquitto.conf` 先校验语法（2.1+）。

## 与其他组件怎么配合

```
[ESP32 / 传感器] ──MQTT──► [边缘 Mosquitto] ──bridge──► [云端 Mosquitto]
                                │                              │
                                ▼                              ▼
                          [Node-RED 规则]              [Telegraf / 自研消费者]
                                                              │
                                                              ▼
                                                      [InfluxDB / PostgreSQL]
```

- **Home Assistant**：Add-on 一键装 Mosquitto，实体 state 与 MQTT discovery 自动映射。
- **Telegraf**：`inputs.mqtt_consumer` 订阅 topic 写入 [[influxdb]] 或 Prometheus remote write 前级。
- **Kubernetes**：Helm chart 或 StatefulSet 跑 Mosquitto，前面挂 LoadBalancer；注意 sticky session 与 TLS 终止位置。
- **与 RabbitMQ 并存**：MQTT 设备走 Mosquitto，后端 AMQP 微服务走 RabbitMQ，中间用 bridge 或应用层双写——别指望一个协议解决所有集成。

## 学习路径建议

1. **第 1 天**：本机 `mosquitto` + `pub/sub`，理解 topic、QoS 0/1、retain。
2. **第 2 天**：写 `mosquitto.conf`，`mosquitto_passwd` + ACL，局域网手机 MQTT 客户端工具连上。
3. **第 3 天**：用 Python 或 Go `paho` 客户端写「一 pub 多 sub」，观察 QoS 1 断线重连。
4. **第 4 天**：配置 TLS listener，读 [mosquitto-tls(7)](https://mosquitto.org/man/mosquitto-tls-7.html)。
5. **第 5 天**：试 bridge 或连 test.mosquitto.org，读 `$SYS` 指标，对照 [MQTT 介绍](https://mosquitto.org/documentation/) 与 man page `mqtt(7)`。

## 参考资料

- 源码与 Quick start：[github.com/eclipse-mosquitto/mosquitto](https://github.com/eclipse-mosquitto/mosquitto)
- 官网与下载：[mosquitto.org](https://mosquitto.org/)
- Broker 手册：[mosquitto(8)](https://mosquitto.org/man/mosquitto-8.html)
- 配置参考：[mosquitto.conf(5)](https://mosquitto.org/man/mosquitto-conf-5.html)
- MQTT 概念：[mqtt(7)](https://mosquitto.org/man/mqtt-7.html)
- 认证方式概览：[Authentication methods](https://mosquitto.org/documentation/authentication-methods/)
