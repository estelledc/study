---
title: Mosquitto — C 写的轻量 MQTT 消息中转站
来源: 'https://github.com/eclipse-mosquitto/mosquitto'
日期: 2026-07-07
分类: embedded
难度: 初级
---

## 是什么

Mosquitto 是一个开源 MQTT broker：它不生产消息，也不消费消息，而是站在中间，把设备发来的消息按 topic 转发给订阅者。

日常类比：像小区门口的快递驿站。传感器把“厨房温度 32 度”放到 `sensors/kitchen/temperature` 这个货架，手机、后台服务、自动化脚本谁订了这个货架，谁就收到。

最小例子是三个终端：

```bash
# 终端 1：启动本机 broker
mosquitto -v

# 终端 2：订阅一个 topic
mosquitto_sub -t 'test/topic' -v

# 终端 3：发布一条消息
mosquitto_pub -t 'test/topic' -m 'hello world'
```

`mosquitto` 是 broker，`mosquitto_sub` 是收消息的客户端，`mosquitto_pub` 是发消息的客户端。三者放在一起，就是最小 MQTT 系统。

它的特别之处不是“功能最多”，而是小、稳、标准：C 写的单机 broker，支持 MQTT 5.0、3.1.1、3.1，还附带 C/C++ client library 和常用命令行工具。

## 为什么重要

不理解 Mosquitto，很多 IoT 和边缘设备场景会卡在第一步：

- 你会把传感器数据直接 HTTP POST 到服务器，结果每个设备都要知道服务器地址、重试策略和在线状态。
- 你会分不清“消息队列”和“发布订阅”，看到 `topic/#`、`+` 通配符时不知道它们在保护什么复杂度。
- 你会在局域网测试能连，上线后突然连不上，因为 Mosquitto 2.0 起默认更保守，不会随便向外网开放匿名访问。
- 你会以为 broker 只是转发器，忽略 retained message、QoS、Last Will、ACL 这些让设备系统可靠起来的小机关。

## 核心要点

1. **Broker 是中转站，不是数据库**。类比快递驿站：它知道包裹放在哪个货架，但不会替你理解包裹内容。Mosquitto 负责连接、订阅匹配、转发、鉴权和少量持久化，不负责业务计算。

2. **Topic 是地址树，不是表名**。类比楼栋门牌：`home/kitchen/temp` 比 `temp` 更容易管理，因为你能用 `home/+/temp` 订阅所有房间温度，也能用 `home/#` 订阅整棵家居树。topic 设计得好，ACL 和监控都会轻很多。

3. **轻量意味着边缘友好，也意味着别指望它包办集群**。Mosquitto 很适合树莓派、网关、小型服务器和协议实验。需要大规模集群、规则引擎、可视化管理时，通常会看 EMQX、RabbitMQ MQTT 插件或云服务。

## 实践案例

### 案例 1：本机验证“发布订阅”是否跑通

官方 README 的 quick start 就是这个姿势，适合第一次确认 MQTT 的基本链路。

```bash
# 先开 broker；-v 让你看到连接、订阅、发布日志
mosquitto -v

# 另开一个终端，订阅温度 topic，-q 1 表示至少送达一次
mosquitto_sub -t sensors/temperature -q 1 -v

# 再开一个终端，发布温度
mosquitto_pub -t sensors/temperature -m 32 -q 1
```

逐部分解释：

- `sensors/temperature` 是 topic，像“温度货架”的名字。
- `-q 1` 是 QoS 1，意思是 broker 和客户端会确认一次，减少丢消息概率。
- `-v` 对订阅端会打印 `topic payload`，适合新人看清消息确实经过了 broker。

这不是生产配置，因为默认本机启动只适合本机测试。README 也提醒：要让别的机器连接，应该写配置文件，并认真处理认证。

### 案例 2：给局域网 broker 加用户名和 topic 权限

小实验室或宿舍里常见场景：几块开发板上报数据，只有后台服务能订阅全部数据。

```bash
# 创建密码文件；-c 会覆盖旧文件，第一次创建才用
mosquitto_passwd -c /etc/mosquitto/passwd sensor1
mosquitto_passwd /etc/mosquitto/passwd dashboard
```

```conf
# /etc/mosquitto/conf.d/lab.conf
listener 1883 0.0.0.0
allow_anonymous false
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl
persistence true
persistence_location /var/lib/mosquitto/
```

```conf
# /etc/mosquitto/acl
user sensor1
topic write lab/sensor1/#

user dashboard
topic read lab/+/#
```

逐部分解释：

- `listener 1883 0.0.0.0` 才让局域网其他机器能连进来；只运行 `mosquitto` 通常偏向本机测试。
- `allow_anonymous false` 是门禁：没有用户名密码就不能进。
- `acl_file` 是货架权限表：`sensor1` 只能写自己的分支，`dashboard` 只能读所有传感器分支。
- `persistence true` 让订阅、会话和部分消息状态能落盘，broker 重启后不至于全忘。

### 案例 3：把边缘 broker 桥接到云端或上级 broker

工厂、家庭网关、车载设备常常先在本地收消息，再把一部分 topic 同步到上级 broker。Mosquitto 的 bridge 配置就是为这种“边缘到中心”准备的。

```conf
# edge-bridge.conf
connection cloud
address mqtt.example.com:8883
remote_username edge-gateway
remote_password change-me
bridge_tls_use_os_certs true
topic factory/line1/# out 1
notifications true
restart_timeout 10 60
```

逐部分解释：

- `connection cloud` 给这条桥取名，也会影响默认 client id。
- `address` 指向远端 broker；`8883` 通常表示 MQTT over TLS。
- `topic factory/line1/# out 1` 表示把本地 `factory/line1/` 下的消息向外同步，QoS 用 1。
- `notifications true` 会发布桥连接状态，运维可以订阅 `$SYS/broker/connection/.../state` 看断连。
- `restart_timeout 10 60` 是重连退避，避免网络抖动时疯狂重连。

这个案例的关键不是“会写配置”，而是看懂 Mosquitto 的定位：它能做边缘网关，但不是自动集群系统。桥接是显式连线，你要自己设计哪些 topic 出去、哪些留下。

## 踩过的坑

1. **只运行 `mosquitto` 后外部机器连不上**：2.0 之后默认更保守，未配置 listener 时主要用于本机测试。

2. **把 `#` 当普通字符串**：`#` 是多级通配符，放错位置会订阅太多消息，也可能把敏感 topic 暴露给不该看的人。

3. **在公网开 `allow_anonymous true`**：这等于把消息驿站大门敞开，别人可能乱发、乱订阅、刷爆资源。

4. **以为 retained message 等于历史消息库**：retained 只保存某个 topic 的最后一条状态，适合“灯当前开关”，不适合查完整时间序列。

## 适用 vs 不适用场景

**适用**：

- 本机学习 MQTT、写协议 demo、验证传感器消息链路。
- 树莓派、OpenWrt、工业网关这类资源有限但需要稳定 broker 的边缘节点。
- 小到中等规模的单机 IoT 系统，需要密码、ACL、TLS、桥接、持久化这些基础能力。
- 作为测试环境里的标准 MQTT broker，让应用代码不用依赖大型云服务。

**不适用**：

- 天然需要多节点集群、水平扩容、跨地域容灾的消息平台。
- 需要内置规则引擎、数据转存、仪表盘、设备影子等一整套 IoT 平台能力。
- 需要通用任务队列语义，比如延迟任务、消费者组重平衡、复杂确认模型。
- 业务团队不想维护配置文件、证书、ACL 和运维监控，只想买托管服务。

## 历史小故事（可跳过）

- **2009 年**：Roger Light 听到 MQTT 的开放规格后，把 Mosquitto 做成业余项目；当时开源 MQTT broker 选择很少。
- **2013 年左右**：项目进入 Eclipse IoT 生态，Roger Light 也成为 Eclipse Mosquitto 的 project lead。
- **2017 年**：Mosquitto 发表 JOSS 软件论文，定位为标准兼容的 MQTT server、client utilities 和 C client library。
- **2020 年前后**：Mosquitto 2.0 把默认安全姿态收紧，新手最容易感知到的变化就是“默认不再随便给外部匿名连”。
- **2026 年**：GitHub 页面显示约 1.1 万 star，仓库仍保持活跃，man pages 也在持续更新到 2.x 系列。

## 学到什么

1. **MQTT 的核心不是请求响应，而是“按主题广播”**：设备不用互相知道地址，只要约好 topic。
2. **Mosquitto 的价值在标准和朴素**：它把 MQTT broker、命令行客户端、C 库打包成一套小而稳的工具箱。
3. **安全配置不是上线后的补丁**：listener、匿名访问、密码文件、ACL、TLS 要从第一版配置就一起想。
4. **边缘系统要先划 topic 树**：topic 树像文件目录，早期乱放，后面权限、桥接、监控都会变痛。

## 延伸阅读

- 官方仓库：[eclipse-mosquitto/mosquitto](https://github.com/eclipse-mosquitto/mosquitto)（README 有 quick start 和项目组成）
- 官方首页：[Eclipse Mosquitto](https://mosquitto.org/)（一句话理解它为什么适合低功耗设备到服务器）
- 在线手册：[Mosquitto man pages](https://mosquitto.org/man/)（`mosquitto_pub`、`mosquitto_sub`、`mosquitto.conf` 都在这里）
- 认证文档：[Authentication methods](https://mosquitto.org/documentation/authentication-methods/)（密码文件、插件、匿名访问三类入口）
- 动态安全：[Dynamic Security Plugin](https://mosquitto.org/documentation/dynamic-security/)（运行中管理 clients、groups、roles）
- [[mqtt-s-2008]] —— MQTT-SN / MQTT 传感器网络方向，理解更小设备上的 MQTT 变体

## 关联

- [[mqtt-s-2008]] —— Mosquitto 实现的是 MQTT broker，理解协议变体能看清它的边界。
- [[emqx]] —— 同类 MQTT broker，更偏大规模集群和企业 IoT 平台能力。
- [[rabbitmq-server]] —— 通用消息队列也能通过插件接 MQTT，但设计重心不是 IoT topic 树。
- [[nats]] —— 同样是轻量消息系统，可对比 subject 与 MQTT topic 的差异。
- [[embedded-hal]] —— 嵌入式设备采集数据后，常需要类似 Mosquitto 的 broker 把数据送出去。
- [[freertos]] —— 微控制器侧常跑 RTOS，网络侧常用 MQTT 把遥测数据传到网关。
- [[kafka]] —— Kafka 更像持久化事件日志；Mosquitto 更像实时转发的轻量驿站。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[espurna]] —— ESPurna — 给便宜智能开关换一套本地大脑
- [[nanomq]] —— NanoMQ — 边缘侧超轻量 MQTT Broker
- [[nats]] —— NATS — 极简云原生消息系统
- [[openhab]] —— openHAB — Java OSGi 家庭自动化框架
