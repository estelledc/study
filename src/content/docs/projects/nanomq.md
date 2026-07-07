---
title: NanoMQ — 边缘侧超轻量 MQTT Broker
来源: 'https://github.com/nanomq/nanomq'
日期: 2026-07-07
分类: embedded
难度: 初级
---

## 是什么

NanoMQ 是一个用 C 写的边缘侧 MQTT Broker：它负责把设备发来的消息收进来，再按主题转发给订阅者。日常类比：像小区门口的快递驿站，传感器把包裹放进来，App、云平台、仪表盘按门牌号取走。

它不像大型云端消息平台那样默认假设你有很多机器和宽裕内存，而是面向网关、车机、工控盒子、容器边车这种空间紧的地方。

最小例子可以先把它当成本地 MQTT 收发站：

```bash
docker run -d --name nanomq -p 1883:1883 emqx/nanomq:latest
nanomq_cli sub -h 127.0.0.1 -p 1883 -t "sensor/#" -q 1
nanomq_cli pub -h 127.0.0.1 -p 1883 -t "sensor/temp" -m "24.8" -q 1
```

上面三行的意思是：先启动 Broker；再开一个订阅者盯住 `sensor/#`；最后发布一条温度消息。NanoMQ 做的事情，就是把第三行的消息送到第二行的订阅者手里。

## 为什么重要

不理解 NanoMQ，会很难解释下面这些事：

- 为什么边缘设备不一定要把每条数据都直接打到云端，大多数时候先在本地 Broker 汇聚更稳
- 为什么 MQTT Broker 也分“云端大集群”和“嵌入式小节点”，两者的资源假设完全不同
- 为什么网关侧常常需要桥接、协议转换、HTTP API、Prometheus 指标，而不只是收发消息
- 为什么 Docker 镜像、编译选项、配置格式选错后，功能明明在文档里却跑不起来

## 核心要点

NanoMQ 可以拆成三个核心要点：

1. **边缘优先**：它优先服务小机器上的本地消息汇聚。类比：不是建一个全国物流中心，而是在楼下放一个小驿站，先把楼里的包裹分清楚。

2. **异步 I/O + Actor 思路**：README 里强调它基于 NNG 的异步 I/O，并在内部做消息传递和调度。类比：前台只登记快递，不一直等一个人填完表，所以队伍不容易堵住。

3. **Broker 之外还有桥和网关**：NanoMQ 不只会本地发布订阅，还能把本地主题映射到远端 MQTT Broker，也能通过工具支持 ZMQ、DDS、SOME/IP 等边缘协议场景。类比：驿站既能本楼配送，也能把包裹转给城际物流。

这三个点加起来，就是“边缘侧消息枢纽”：先把设备消息在近处接住，再决定是本地消费、转发到云端，还是跨协议转出去。

## 实践案例

### 案例 1：在开发机上跑一个本地 MQTT 驿站

官方 README 和 Docker 文档都给出 Docker 启动方式，适合第一次验证 Broker 是否工作：

```bash
docker run -d --name nanomq \
  -p 1883:1883 \
  -p 8083:8083 \
  -p 8883:8883 \
  emqx/nanomq:latest

nanomq_cli sub -h 127.0.0.1 -p 1883 -t "demo/#" -q 1
nanomq_cli pub -h 127.0.0.1 -p 1883 -t "demo/hello" -m "hi" -q 1
```

逐部分解释：

- `1883:1883` 是普通 MQTT 端口，设备和客户端通常连这里
- `sub` 是订阅，相当于“我关心 `demo/` 下面的所有消息”
- `pub` 是发布，相当于“往 `demo/hello` 这个信箱塞一封信”

这个案例适合做本地联调：前端仪表盘、采集脚本、模拟设备都可以先连同一个本地 Broker。

### 案例 2：把边缘主题桥接到云端 Broker

桥接适合“设备在边缘，分析在云端”的场景。NanoMQ 文档给出的 MQTT over TCP Bridge 支持本地主题和远端主题的双向映射：

```hcl
bridges.mqtt.cloud {
  server = "mqtt-tcp://broker.emqx.io:1883"
  proto_ver = 4
  clean_start = true
  keepalive = 60 s

  forwards = [
    { local_topic = "sensor/temperature", remote_topic = "edge/temperature", qos = 1 }
  ]

  subscription = [
    { remote_topic = "cloud/cmd", local_topic = "device/cmd", qos = 1 }
  ]
}
```

逐部分解释：

- `server` 是远端 Broker 地址，像“上级物流中心”
- `forwards` 是本地到远端：边缘温度数据被转成云端主题
- `subscription` 是远端到本地：云端控制命令会回到设备命令主题

这个案例常见于工厂网关、车端网关、门店盒子：本地继续跑，即使云端网络抖动，也不用每个设备都自己处理远端连接。

### 案例 3：用 HTTP API 和指标做运维观察

NanoMQ 文档提供 HTTP API 和 Prometheus 风格指标，适合回答“现在连了多少客户端、有没有丢消息”：

```hcl
http_server = {
  port = 8081
  ip_addr = "0.0.0.0"
  username = "admin"
  password = "public"
  auth_type = "basic"
}
```

```bash
curl -u admin:public http://localhost:8081/api/v4/clients
curl -u admin:public http://localhost:8081/api/v4/prometheus
```

逐部分解释：

- `/clients` 像查看驿站门口现在排了哪些人
- `/prometheus` 会吐出连接数、会话数、收发消息数、丢弃消息数等指标
- `username/password` 说明这个接口不是给公网裸奔用的，至少要先做基础认证和网络隔离

这个案例适合线上排障：先看连接和丢消息，再决定是客户端问题、Broker 压力问题，还是桥接链路问题。

## 踩过的坑

1. **镜像版本选错**：Docker Basic、Slim、Full 支持的能力不同；例如规则引擎、QUIC、Bench 工具不一定在默认镜像里。

2. **HOCON 字符串忘了加引号**：新版配置偏向 HOCON，`0.0.0.0:8083/mqtt` 这类值需要按 HOCON 规则写成字符串。

3. **旧 KV 配置和新 HOCON 混着抄**：0.14 到 0.19 附近配置格式有迁移，旧教程能看懂思路，但不一定能直接贴到新版。

4. **桥接主题映射写太宽**：`#`、`+`、透明桥接、前缀后缀组合起来很方便，也很容易把不该转发的主题一起转走。

## 适用 vs 不适用场景

**适用**：

- 网关、边缘容器、车机、工控盒子上需要一个本地 MQTT Broker
- 设备数据要先在近端汇聚，再桥接到云端 Broker 或统一命名空间
- 需要 C / POSIX / 小体积 / 可裁剪编译选项的消息基础设施
- 想顺手拿到 HTTP API、Prometheus 指标、桥接、网关这类边缘运维能力

**不适用**：

- 需要多租户、大规模云端集群、复杂权限控制的中心平台；这类更像 [[emqx]] 的主场
- 只是单机桌面脚本之间发几条消息，用普通队列或本地 IPC 可能更简单
- 团队完全不熟 MQTT 主题、QoS、保留消息、会话语义，直接上线容易把“消息到了”误解成“业务成功”
- 需要某个高级功能时却不愿确认 Docker 镜像、编译参数、配置版本

## 历史小故事（可跳过）

- NanoMQ 由 EMQ 边缘计算团队维护，README 把它定位成 LF Edge 生态里的边缘消息平台。
- 它的底层思路和 NNG 有渊源：用异步 I/O 和消息传递把 MQTT Broker 做得更适合嵌入式环境。
- 文档后来逐步把桥接、HTTP API、网关、Bench 工具拆成独立章节，说明它从“小 Broker”演化成“边缘消息工具箱”。
- 候选池记录的 stars 量级约 1.9k，说明它不是巨无霸项目，但在 MQTT 边缘场景里有稳定关注。

## 学到什么

- Broker 不是越大越好；边缘侧最重要的是小、稳、能桥接、能观察。
- MQTT 的主题映射是系统边界：本地主题怎么改名到云端，决定后续数据治理是否清楚。
- “文档里有功能”不等于“当前二进制里有功能”，嵌入式项目经常靠编译选项裁剪能力。
- NanoMQ 的价值不是替代所有消息系统，而是在设备和云之间补上一个轻量消息枢纽。

## 延伸阅读

- 官方仓库：[NanoMQ GitHub](https://github.com/nanomq/nanomq)
- 官方文档：[NanoMQ Documentation](https://nanomq.io/docs/en/latest/)
- Docker 部署：[Deploy with Docker](https://nanomq.io/docs/en/latest/installation/docker.html)
- 桥接文档：[MQTT over TCP Bridge](https://nanomq.io/docs/en/latest/bridges/tcp-bridge.html)
- [[mosquitto]] —— 另一个常见轻量 MQTT Broker，对比后更容易理解 NanoMQ 的边缘工具箱定位
- [[emqx]] —— 云端和企业级 MQTT 平台，适合作为 NanoMQ 的上游或对照组

## 关联

- [[mosquitto]] —— 同是 MQTT Broker，适合比较“极简 Broker”和“边缘消息平台”的差异
- [[emqx]] —— NanoMQ 常被放在边缘侧，EMQX 更像云端或中心侧
- [[prometheus]] —— NanoMQ 的 HTTP API 可以输出 Prometheus 风格指标，方便监控连接和消息量
- [[mbedtls]] —— TLS 构建和证书能力会影响 MQTT over TLS 的部署
- [[openwrt]] —— 很多边缘网关运行类 Linux 系统，轻量 Broker 更容易落地
- [[zephyr]] —— 嵌入式生态里的 RTOS，对理解资源受限环境很有帮助
- [[lwip]] —— 轻量 TCP/IP 栈，和 NanoMQ 一样体现“网络能力也可以为小设备裁剪”

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
