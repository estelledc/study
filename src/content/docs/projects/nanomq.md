---
title: NanoMQ — 面向 IoT 边缘的超轻量 MQTT Broker
来源: 'https://github.com/nanomq/nanomq'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
难度: '初级'
provenance: 'pipeline-v3'
---

## 是什么

**NanoMQ** 是 [nanomq/nanomq](https://github.com/nanomq/nanomq) 维护的开源 **MQTT 消息代理（broker）**，由 EMQ Edge Computing 团队开发，现为 **LF Edge** 孵化项目。它面向 **IoT / IIoT 边缘** 与 **软件定义汽车（SDV）** 场景：在资源有限的 ARM 网关、车载 ECU、工业边缘盒子上，用极小的内存 footprint 跑完整的 MQTT 5.0/3.1.1 服务，并附带桥接、规则引擎、Webhook、HTTP 管理 API 等「边缘消息平台」能力。

日常类比：**带多窗口的快递中转站**。

传统单线程 broker（例如经典 Mosquitto 模型）像只有一个收银台的小驿站——包裹（MQTT 消息）一多，所有人排队等同一个窗口，磁盘持久化时整个站还可能「暂停营业」。NanoMQ 则在站内建了 **多个并行窗口（Actor + 多线程）**：收发、解析 MQTT、写盘、转发云端各自有专职「岗位」，通过内部消息传递协作。设备仍然只认 **topic 名字**（像快递单上的分区码），不用知道谁在听；但中转站本身能在多核 CPU 上 **横向扩展吞吐**，弱网断线时还能 **先落库、后补发**。

与 [[mosquitto]] 的对比：两者都是 MQTT broker，Mosquitto 以 **简单、生态老、单进程单线程模型** 著称；NanoMQ 强调 **纯 C、POSIX 可移植、异步 I/O + SMP 多核**，官方 benchmark 称在多核上吞吐可达 Mosquitto 数倍量级，并内置 SQL 规则引擎、MQTT Bridge、离线缓存等边缘特性。若你只是树莓派上跑 Home Assistant 插件，Mosquitto 往往足够；若边缘要 **高并发 + 断网续传 + 边云桥接 + HTTP 运维**，NanoMQ 更对口。

与 [[nginx]] 不同：Nginx 终止 HTTP 请求；NanoMQ 维护 **长连接 MQTT 会话**，按 pub/sub 语义路由字节流，还可把 MQTT 桥到 QUIC、WebSocket、ZeroMQ 等。

## 解决什么问题

边缘侧常见矛盾：**设备多、带宽贵、网络抖、CPU 核数在涨，但内存仍只有几百 MB**。HTTP 轮询费电；单线程 broker 在持久化或桥接高峰时 latency 飙升。NanoMQ 的设计目标是把这些问题打包回答：

| 痛点 | 没有合适 broker 时 | NanoMQ 的回应 |
| --- | --- | --- |
| 多核利用率低 | 单线程 broker CPU 只跑满一核 | 内置 Actor 任务层 + 可配置 `parallel` 工作上下文 |
| 弱网/断线丢数据 | 仅内存转发，断网即丢 | SQLite/文件持久化，恢复后自动续传 |
| 边缘只连 MQTT，云上要 EMQX | 手写同步程序 | 内置 **MQTT Bridge**（含 QUIC 桥可选编译） |
| 要在边缘过滤/transform | 另起服务消费再写回 | **SQL 规则引擎** + Webhook + 与 eKuiper 集成 |
| 运维要改配置、看状态 | 只能 SSH 改文件重启 | **HTTP REST API**、环境变量、Docker 友好 |
| 固件资源极小 | 重量级中间件装不进 | 最小特性集 footprint 可至 **200KB 级**（官方宣称） |

核心问题：**如何在嵌入式 Linux / 车载网关里，用 MQTT 标准协议做高吞吐、可观测、可桥接边云的消息枢纽？**

## 核心概念

### 1. Broker / Client / Topic：MQTT 三角（与标准一致）

```
Publisher ──publish──►  NanoMQ Broker  ──deliver──► Subscriber(s)
              topic: factory/line1/temp         subscribe: factory/+/temp
```

- **Broker**：`nanomq` 进程，默认 TCP **1883**（MQTT），常见还有 **8083**（WebSocket）、**8883**（TLS）。
- **Client**：`nanomq_cli`、MQTTX、NanoSDK、Paho 等任意标准 MQTT 客户端。
- **Topic**：层级字符串 `/` 分隔；broker 按订阅匹配转发，不解释业务含义。

### 2. 分层架构：从硬件到应用

官方架构可粗分为五层（便于理解代码与性能调优）：

| 层级 | 职责 |
| --- | --- |
| Platform adaptor | 适配 POSIX / 不同 OS·芯片，避免平台锁死 |
| Task Layer（Actor） | 线程级并行，把计算拆成 Actor，消息驱动调度 |
| Transport Layer | 管理 TCP/UDP 管道，**零拷贝** 降低内存 |
| Protocol Layer | 解析 MQTT 字节流、in-flight 窗口、MQTT 5 属性 |
| Application Layer | Topic trie、规则引擎、Webhook、与桥接交互 |

底层基于 **NNG（nanomsg-next-generation）** 的异步 I/O；每个连接由 `nano_work` 状态机在 **INIT → RECV → WAIT → SEND** 间循环，由 `nng_aio` 回调驱动，避免阻塞式线程 per connection。

### 3. QoS、Retain、通配符

与 MQTT 标准相同，不再赘述细节，只记三条实用规则：

- **QoS 0/1/2**：最多一次 / 至少一次 / 恰好一次；实际等级取 publish 与 subscribe 的 **较小值**。
- **Retain**：适合「当前状态」topic（阀门开/关），不适合高频 telemetry 流。
- **`+` / `#`**：仅用于订阅侧通配；`#` 必须在末尾。

### 4. MQTT Bridge：边缘到云的双向管道

Bridge 在配置里声明远端 broker（如 `mqtt-tcp://broker.emqx.io:1883`），并定义：

- **forwards**：本地 topic → 远端 topic（上行）
- **subscription**：远端 topic → 本地 topic（下行）

断网时 NanoMQ 可结合持久化 **排队**，恢复后补发；桥接连接状态还会通过 **系统 topic** 发 online/offline 事件（见下文 `$SYS`）。

### 5. 规则引擎与 Webhook

NanoMQ 可用 **类 SQL** 语句对消息做过滤、投影、转发到外部 sink（具体语法见官方 Rule Engine 文档）。**Webhook** 则把 MQTT 事件 POST 到现有 HTTP 服务——适合边缘已有 REST 微服务、暂不想全改 MQTT 的迁移路径。

### 6. 系统 Topic `$SYS/`：可观测性

订阅系统 topic 可收到客户端上下线、桥接状态等 JSON 事件，例如（0.24.1+ 合并为单 topic）：

```
Topic: $SYS/brokers/client_status/${clientid}
Message: {"status":"online", "client_id":"...", "IPv4":"127.0.0.1", ...}
```

生产环境应为 `$SYS` 单独设 ACL，避免泄露拓扑。

### 7. 配置文件 `nanomq.conf` 与环境变量

启动：

```bash
nanomq start
# 或
nanomq start --conf /etc/nanomq.conf
```

Docker 常用挂载：

```bash
docker run -d --name nanomq \
  -p 1883:1883 -p 8083:8083 -p 8883:8883 \
  -v /path/to/nanomq.conf:/etc/nanomq.conf \
  emqx/nanomq:latest
```

大量选项可用 **环境变量** 覆盖（如 `NANOMQ_PARALLEL`、`NANOMQ_ALLOW_ANONYMOUS`、`NANOMQ_WEBSOCKET_ENABLE`），适合 K8s ConfigMap / Docker Compose 部署。

### 8. `nanomq_cli` 工具集

除 broker 外，同一仓库还提供：

| 命令 | 用途 |
| --- | --- |
| `nanomq_cli pub` / `sub` | 发布、订阅、测连通 |
| `nanomq_cli conn` | 测试连接与 keepalive |
| bench（需 `-DBUILD_BENCH=ON` 编译） | MQTT 压测 |
| ZMQ / DDS proxy 等 | 多协议网关（可选编译） |

客户端库 **NanoSDK** 见 [nanomq/NanoSDK](https://github.com/nanomq/NanoSDK)。

## 快速上手

### 用 Docker 一分钟跑起来

```bash
docker run -d --name nanomq \
  -p 1883:1883 -p 8083:8083 -p 8883:8883 \
  emqx/nanomq:latest
```

### 本机二进制

从 [nanomq.io/downloads](https://nanomq.io/downloads) 下载对应架构包，或使用包管理 / 源码编译（需 CMake ≥ 3.13、C99）：

```bash
git clone https://github.com/nanomq/nanomq.git
cd nanomq && git submodule update --init --recursive
mkdir build && cd build
cmake -G Ninja ..
ninja
# 安装后
nanomq start
```

常用 CMake 开关：`-DNNG_ENABLE_TLS=ON`（TLS）、`-DNNG_ENABLE_QUIC=ON`（QUIC 桥）、`-DNNG_ENABLE_SQLITE=ON`（SQLite 持久化）。

## 代码示例

### 示例 1：用 `nanomq_cli` 验证 pub/sub

终端 A——订阅 topic，QoS 1：

```bash
nanomq_cli sub -h 127.0.0.1 -p 1883 -t 'demo/status' -q 1 -v
```

终端 B——发布 retained 状态（新订阅者立刻看到 `online`）：

```bash
nanomq_cli pub -h 127.0.0.1 -p 1883 -t 'demo/status' -m 'online' -q 1 -r
```

再发一条普通心跳：

```bash
nanomq_cli pub -h 127.0.0.1 -p 1883 -t 'demo/status' -m "heartbeat-$(date +%s)" -q 1
```

`-r` 为 retain；`-v` 打印详细日志。若 broker 在 Docker 内，把 `127.0.0.1` 换成宿主机 IP 或 `-p` 映射后的地址。

### 示例 2：最小 Bridge 配置片段（边 → 公有云）

在 `nanomq.conf` 中增加（路径与用户名请按环境修改；以下为官方 Quick Start 精简版）：

```hcl
bridges.mqtt.emqx_cloud {
  server = "mqtt-tcp://broker.emqx.io:1883"
  proto_ver = 4
  clientid = "edge_gateway_01"
  keepalive = 60s
  clean_start = false
  username = "your_user"
  password = "your_pass"

  forwards = [
    {
      remote_topic = "cloud/factory/line1"
      local_topic  = "factory/line1/#"
      qos = 1
    }
  ]

  subscription = [
    {
      remote_topic = "cloud/cmd/factory"
      local_topic  = "factory/cmd/#"
      qos = 1
    }
  ]

  max_parallel_processes = 2
  max_send_queue_len = 32
  max_recv_queue_len = 128
}
```

启动：

```bash
nanomq start --conf ./nanomq.conf
```

本地 `nanomq_cli pub -t 'factory/line1/temp' -m '26.3'` 后，在云端订阅 `cloud/factory/line1` 应能收到转发；云端向 `cloud/cmd/factory` 发布的指令会落到本地 `factory/cmd/#`。

### 示例 3：Python（paho-mqtt）连接 NanoMQ

```python
import json
import paho.mqtt.client as mqtt

BROKER = "127.0.0.1"
PORT = 1883

def on_connect(client, userdata, flags, reason_code, properties):
    print("connected:", reason_code)
    client.subscribe("edge/+/telemetry", qos=1)

def on_message(client, userdata, msg):
    print(msg.topic, msg.payload.decode())

sub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="edge-monitor")
sub.on_connect = on_connect
sub.on_message = on_message
sub.connect(BROKER, PORT, 60)
sub.loop_forever()
```

发布端（另开进程）：

```python
import paho.mqtt.client as mqtt

pub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
pub.connect("127.0.0.1", 1883, 60)
pub.publish("edge/sensor01/telemetry", '{"t":22.1}', qos=1)
pub.disconnect()
```

若关闭匿名登录，在 `connect` 前调用 `username_pw_set(...)`，并与 `nanomq.conf` 中认证配置一致。

## 典型应用场景

1. **工厂边缘网关**：PLC/传感器 pub 到本地 topic，NanoMQ bridge 汇总到 EMQX Cloud / 私有云，断网时 SQLite 缓存。
2. **车联网 SDV**：车内多 ECU 经 MQTT 总线交换信号，NanoMQ 作轻量 message bus，可选 DDS proxy 与 CycloneDDS 互通。
3. **智能家居边缘盒**：比 Mosquitto 更高并发多房间设备，同时 Webhook 推送到现有 Home Server HTTP API。
4. **规则下沉**：用 SQL 规则在边缘丢弃无效采样、只上报告警，节省 4G 流量。
5. **开发与压测**：`nanomq_cli` bench 对比边缘硬件选型，HTTP API 做自动化运维。

## 踩过的坑

1. **默认匿名与 Docker 暴露端口**：`-p 1883:1883` 映射到公网且 `NANOMQ_ALLOW_ANONYMOUS=true` 时极易被扫描滥用；生产必须认证 + TLS + 防火墙。
2. **Bridge 的 subscription 必须写 qos**：官方文档强调每条 `subscription` 都要设 `qos`，否则 NanoMQ **不会**向远端订阅，表现为「下行永远收不到」。
3. **混淆 broker 与 cli 配置**：`nanomq.conf` 只给 **broker** 用；`nanomq_cli pub/sub` 参数走命令行，不要指望在同一个 conf 里配 pub。
4. **QoS 2 与业务幂等**：MQTT QoS 2 只保证协议层不重复，消费端写库仍要自己做 dedup。
5. **Retain 用于错误 topic**：对秒级 telemetry 开 retain 会让新订阅者误以为旧值仍有效。
6. **并行度不是越大越好**：`NANOMQ_PARALLEL` / `max_parallel_processes` 过高在小内存设备上反而增加调度开销，需结合 benchmark 调参。
7. **MQTT 5 部分特性**：README 列出 Auth、Server Redirection 等 **尚未支持** 的 5.0 特性，混用新客户端时要查版本说明。

## 与其他组件怎么配合

```
[传感器 / ECU] ──MQTT──► [NanoMQ 边缘] ──bridge──► [EMQX / 云端 MQTT]
        │                        │
        │                        ├── SQL Rule ──► [本地 SQLite / 时序库]
        │                        ├── Webhook ──► [现有 HTTP 微服务]
        ▼                        ▼
   [NanoSDK 固件]          [HTTP API 运维 / Prometheus 抓取]
```

- **EMQX 全家桶**：NanoMQ 常作边缘节点，EMQX 作云端汇聚；Bridge 配置对称即可。
- **eKuiper**：流式 SQL 处理与 NanoMQ 规则互补，复杂 CEP 可下沉到 eKuiper。
- **Telegraf / 自研消费者**：sub 边缘 topic 写入 [[influxdb]]、[[postgresql]] 等。
- **Kubernetes**：官方 Docker 镜像 + ConfigMap 挂载 `nanomq.conf`，用 HTTP 健康检查与 `$SYS` 监控。
- **与 Mosquitto 选型**：要极简、插件生态、Home Assistant 一键 addon → Mosquitto；要多核吞吐、内置桥与规则 → NanoMQ。

## 学习路径建议

1. **第 1 天**：Docker 或 `nanomq start`，`nanomq_cli sub/pub` 理解 topic、QoS、retain。
2. **第 2 天**：读默认 `nanomq.conf`，关匿名、配 TLS listener（`-DNNG_ENABLE_TLS=ON` 构建或使用官方带 TLS 包）。
3. **第 3 天**：配置一条到 `broker.emqx.io` 的 bridge，验证 forwards 与 subscription 双向。
4. **第 4 天**：订阅 `$SYS/brokers/client_status/#`，观察上下线 JSON；试 HTTP API 改配置（若启用）。
5. **第 5 天**：读 [NanoMQ 文档](https://nanomq.io/docs/en/latest/) 中 Rule Engine、Persistence；用 bench 在目标硬件上压测，对照 [test report](https://nanomq.io/docs/latest/test-report.html)。

## 参考资料

- 源码与 README：[github.com/nanomq/nanomq](https://github.com/nanomq/nanomq)
- 官网：[nanomq.io](https://nanomq.io/)
- 快速开始：[Quick Start](https://nanomq.io/docs/en/latest/quick-start/quick-start.html)
- CLI 手册：[Command Line Interface](https://nanomq.io/docs/en/latest/toolkit/command-line.html)
- LF Edge 项目页：[lfedge.org/projects/nanomq](https://lfedge.org/projects/nanomq/)
- MQTT 规范：[MQTT 3.1.1](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html) / [MQTT 5.0](https://docs.oasis-open.org/mqtt/mqtt/v5.0/cs02/mqtt-v5.0-cs02.html)
- 客户端示例：[MQTT-Client-Examples](https://github.com/emqx/MQTT-Client-Examples)
- C SDK：[NanoSDK](https://github.com/nanomq/NanoSDK)
