---
title: ESPurna — 给 Sonoff 等 ESP8266 插座换「本地大脑」的固件
来源: 'https://github.com/xoseperez/espurna'
日期: '2026-06-13'
分类: 操作系统
子分类: 嵌入式
难度: 初级
provenance: pipeline-v3
---

## 日常类比：给廉价智能插座换一套「本地操作系统」

你花几十块买了一个 Wi-Fi 插座（Sonoff Basic、Shelly、各种「智能通断器」）。出厂固件通常长这样：

- 必须连厂商云，断网或停服就失控；
- App 里功能有限，很难和自家 NAS、[[home-assistant]] 深度联动；
- 想改 MQTT 主题、加传感器、做「有人经过才开灯」——官方固件基本不给你机会。

**ESPurna**（加泰罗尼亚语「火花」）做的事，相当于给这块 ESP8266/ESP8285 芯片 **刷一套开源的本地操作系统**：

| 现实世界 | ESPurna 对应 |
| --- | --- |
| 插座里的原厂程序 | 厂商闭源固件 |
| 自己装 Linux 的迷你主机 | 刷入 ESPurna 定制固件 |
| 物业前台登记 + 对讲机 | Web UI 配置 + MQTT 上报/订阅 |
| 电工改接线、加传感器 | 支持 DHT、功率计、RF Bridge 等模块 |
| 遥控器上的「夜灯模式」宏 | 设备内 RPN Rules 自动化 |

刷完以后，设备连上你家 Wi-Fi 和 [[mosquitto]] 之类的 MQTT Broker，**不经过云端** 就能被 [[home-assistant]]、Node-RED、Domoticz 控制。作者 Xose Pérez（[@xoseperez](https://github.com/xoseperez)）从 2016 年起维护，仓库 [xoseperez/espurna](https://github.com/xoseperez/espurna) 约 3k Stars，GPL-3.0 开源。

和 [[esphome]] 的 YAML 编译路线不同，ESPurna 是 **C++ 单体固件 + Web 配置**：为 Sonoff、Shelly、MagicHome 等上百种硬件预编译 profile，刷入后在浏览器里填 Wi-Fi、MQTT、Home Assistant Discovery 即可。

---

## 解决什么问题

| 痛点 | 原厂固件 | ESPurna 的回应 |
| --- | --- | --- |
| 厂商锁定 | 依赖云端 App | 本地 Web UI + MQTT/REST，数据留在局域网 |
|  homeassistant 对接 | 无标准协议 | 原生 MQTT，支持 HA MQTT Discovery |
| 硬件白名单 | 只认自家型号 | 大量 Sonoff / Shelly / 第三方 preset |
| 功率/环境感知 | 高端型号才有 | HLW8012、CSE7766、DHT、BME280 等驱动内置 |
| 简单自动化 | 只能在中枢写规则 | **RPN Rules** 可在设备端执行（断网也能跑部分逻辑） |
| 维护更新 | 厂商 OTA 不可控 | Web OTA、NoFUSS 自动更新、PlatformIO 自编译 |

核心问题：**如何把市面上大量 ESP8266 智能开关/灯控，变成可本地配置、MQTT 友好、可长期维护的智能家居节点？**

---

## ESPurna 在智能家居栈中的位置

```
┌─────────────────────────────────────────────────────────────┐
│  Home Assistant / Node-RED / Domoticz — 编排与仪表盘         │
│         ▲ MQTT（状态 topic / 命令 topic …/set）              │
├─────────┴───────────────────────────────────────────────────┤
│  Mosquitto 等 MQTT Broker — 消息总线                         │
├─────────┴───────────────────────────────────────────────────┤
│  ESPurna 节点（每块板子一份预编译或自编译固件）               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Sonoff Basic │  │ Sonoff POW   │  │ MagicHome RGB│       │
│  │ 继电器 ×1    │  │ 功率+继电器  │  │ PWM 灯带     │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │ GPIO / I2C / 1-Wire / HLW8012 …                   │
└─────────┴───────────────────────────────────────────────────┘

侧路能力：
  Web UI（AsyncWebServer）— 配置、开关测试、备份/恢复、OTA
  REST API — GET/PUT 继电器、读传感器
  Telnet / Serial Terminal — 调试与 `set`/`get` 命令
  mDNS — `hostname.local` 发现
```

ESPurna 专注 **边缘固件**；中枢负责场景。它与 [[esphome]] 是同类竞品/互补方案：ESPHome 偏「配置即代码」；ESPurna 偏「刷现成 bin + Web 点选」。

---

## 核心概念

### 1. 硬件 Profile（构建预设）

ESPurna 不为「裸 ESP8266」只提供一份通用固件，而是为 **具体商品** 维护 build flag 预设（如 `ITEAD_SONOFF_BASIC`、`SHELLY1`、`MAGICHOME_LED_CONTROLLER_2_0`）。每个 profile 固定了：

- 继电器/LED 引脚映射；
- 板载按钮、状态 LED 行为；
- 可选传感器芯片（如 Sonoff POW 的 HLW8012）。

**零基础建议**：先确认你的硬件型号在 [Supported hardware](https://github.com/xoseperez/espurna#supported-hardware) 列表里，再下载对应的 **预编译 bin** 或 `pio run -e <ENV>` 编译。

### 2. Web UI 与配置持久化

首次启动（或长按恢复出厂）会进入 **AP 模式**（也可双击主按钮进入）。连上设备热点后，浏览器打开设备 IP 或 `http://<hostname>.local/`：

- **Wi-Fi**：最多 5 组 SSID，可扫描选最强信号；
- **MQTT**：Broker 地址、端口、用户名、Root Topic、QoS、Retain；
- **Home Assistant**：`haEnabled` 开启 MQTT Discovery；
- **Admin**：HTTP 基本认证、API Key、OTA 开关。

配置保存在 EEPROM/Flash 分区。注意：大版本 OTA 偶尔会因分区布局变化需要 **USB 线刷**（见仓库 Notice 2017-07-24）。

### 3. MQTT 主题模型：状态 vs 命令

自 v1.9.0 起，**命令 topic 统一带 `/set` 后缀**：

| 类型 | Topic 模式 | 示例 payload |
| --- | --- | --- |
| 状态（设备发布） | `{root}/relay/0` | `0` / `1` |
| 命令（设备订阅） | `{root}/relay/0/set` | `on` / `off` / `toggle` 或 `0`/`1`/`2` |

`{root}` 默认为 `{hostname}`，可在 Web UI 的 `mqttTopic` 改成如 `home/living/light`。

**与 Home Assistant 对接时**：Wiki 明确建议使用标准 MQTT 平台，**关闭 Web UI 里 MQTT 的 JSON payload 模式**——每条消息一个 topic，而不是整包 JSON。

### 4. 继电器语义：脉冲、同步、分组

- **Pulse mode**：收到 ON 后自动定时 OFF（门铃、门禁脉冲）；
- **Boot status**：上电默认 ON/OFF/保持/翻转；
- **mqttGroup**：跨设备同步——多台 ESPurna 订阅同一 group topic，一台切换则其余跟随；
- **Interlock**：多路继电器互斥（只允许一路 ON）。

### 5. RPN Rules（设备端自动化）

RPN = **逆波兰表示法**（后缀表达式）。规则由「操作数 + 运算符」组成，在芯片上直接执行，无需中枢在线。

典型能力：读 `$motion`（MQTT 变量）、`now hour`、比较、`relay` 写继电器。适合「夜间有人经过才开灯」这类 **低延迟、本地** 逻辑。

### 6. 按钮手势

主按钮（各 profile 可能不同）：

- **单击**：切换继电器；
- **双击**：进入 AP 配置模式；
- **长按 ~1s**：重启；
- **超长按 ~10s**：恢复出厂。

---

## 代码示例一：用 MQTT 控制 Sonoff 继电器

假设 Web UI 里把 Root Topic 设为 `bedroom/heater`，Broker 为 `192.168.1.10:1883`。

**订阅状态**（Home Assistant、mosquitto_sub 或 Node-RED 监听）：

```bash
# 监听第 0 路继电器状态
mosquitto_sub -h 192.168.1.10 -t 'bedroom/heater/relay/0' -v
# 输出示例：bedroom/heater/relay/0 1
```

**发送命令**：

```bash
# 打开
mosquitto_pub -h 192.168.1.10 -t 'bedroom/heater/relay/0/set' -m 'on'

# 关闭
mosquitto_pub -h 192.168.1.10 -t 'bedroom/heater/relay/0/set' -m 'off'

# 翻转
mosquitto_pub -h 192.168.1.10 -t 'bedroom/heater/relay/0/set' -m 'toggle'
```

**Node-RED Function 节点**（构造相同语义）：

```javascript
// msg.topic 发往 inject 或 mqtt out
const root = 'bedroom/heater';
const action = 'on'; // 'off' | 'toggle'
return {
  topic: `${root}/relay/0/set`,
  payload: action
};
```

带功率计的 Sonoff POW 还会发布 `energy/0`、`power/0`、`voltage/0` 等状态 topic，可在 HA 里映射为 `sensor` 实体。

---

## 代码示例二：Home Assistant 手动 MQTT 开关

若暂时不用 Discovery，可在 `configuration.yaml`（或 UI 等价配置）里声明 MQTT Switch：

```yaml
mqtt:
  broker: 192.168.1.10
  # username: mqtt_user
  # password: !secret mqtt_password

switch:
  - platform: mqtt
    name: "Bedroom Heater"
    state_topic: "bedroom/heater/relay/0"
    command_topic: "bedroom/heater/relay/0/set"
    payload_on: "1"
    payload_off: "0"
    state_on: "1"
    state_off: "0"
    optimistic: false
    qos: 1
    retain: true
```

**更省事的做法**：在 ESPurna Web UI → MQTT → Home Assistant 区域开启 **MQTT Discovery**（`haEnabled: 1`），并在 HA 侧启用：

```yaml
mqtt:
  discovery: true
  discovery_prefix: homeassistant
```

设备上线后会向 `homeassistant/switch/<id>/config` 等 topic 发送 retained 配置，HA 自动创建设实体。Wiki 建议 Discovery 配置消息也 **Retain**，避免 HA 重启后「失忆」。

---

## 代码示例三：RPN Rules — 夜间人体感应开灯

场景：ESPurna 控制卧室灯继电器；人体传感器通过 MQTT 发布到 `bedroom/motion`，payload `1` 表示有人。

**在 Telnet 或 Serial Terminal 中配置**（Web UI 也有 RPN 页面，视版本而定）：

```text
# 1. 把 MQTT topic 绑定到变量名 motion
set rpnMqttTopic0 bedroom/motion
set rpnMqttName0 motion

# 2. 规则：当前小时在 22–8 点之间 且 有 motion → 关继电器(0=off) 或开灯(1=on)
#    表达式：now hour 8 23 cmp3 abs $motion and 1 relay
#    含义：hour 是否落在 [8,23] 外（夜间） ∧ motion → relay 0 设为 1
set rpnRule0 now hour 8 23 cmp3 abs $motion and 1 relay

# 3. 测试子表达式
RPN.TEST "now hour 8 23 cmp3 abs"

# 4. 查看变量与定时器
RPN.VARS
RPN.RUNNERS
```

解释 `cmp3`：三值比较，配合 `abs` 可表达「小时在 8–23 之外（即夜间）」。实际阈值请按自家作息改数字。

---

## 从零开始的推荐路径

### 路径 A：预编译 bin（最快）

1. 确认硬件型号 → 在 [Releases](https://github.com/xoseperez/espurna/releases) 找对应 **Snapshot** 或稳定版 bin；
2. USB + `esptool` 或 Sonoff  UART 刷入（Sonoff 需拆壳焊针或买编程座）；
3. 手机/电脑连设备 AP → Web UI 配 Wi-Fi；
4. 填写 MQTT → 测试 `mosquitto_sub` / HA Discovery；
5. 改默认 Admin 密码，启用 HTTP Auth。

### 路径 B：PlatformIO 自编译（可定制）

仓库 README 推荐 **PlatformIO**（VS Code 插件或 CLI）。克隆仓库后：

```bash
git clone https://github.com/xoseperez/espurna.git
cd espurna/code
# 列出所有硬件环境
pio run --list-targets
# 编译 Sonoff Basic 预设
pio run -e espurna-itead-sonoff-basic
# USB 上传
pio run -e espurna-itead-sonoff-basic -t upload
```

可在 `platformio.ini` 或 `custom.h` 里关闭不需要的模块（如 `MQTT_SUPPORT`、`TERMINAL_SUPPORT`）以节省 Flash——ESP8266 只有 1MB/4MB 闪存，功能开太多会 **编译失败或运行时 OOM**。

---

## 与 ESPHome、Tasmota 怎么选

| 维度 | ESPurna | [[esphome]] | Tasmota |
| --- | --- | --- | --- |
| 配置方式 | Web UI + Terminal | YAML → 编译 | Web UI + Console |
| 主要芯片 | ESP8266/ESP8285 | ESP32/8266/… | ESP8266/ESP32/… |
| HA 集成 | MQTT Discovery | Native API（也可 MQTT） | MQTT Discovery |
| 设备端规则 | RPN Rules | 有限（lambda/模板） | Rules / Berry（新） |
| 适合谁 | 已有 Sonoff 等预设、爱 MQTT | 愿意维护 YAML、深度 HA 用户 | 社区最大、Topic 文档多 |

三者并非互斥：同一家庭可以 **ESPurna 管老 Sonoff，ESPHome 管新 ESP32 传感器**。

---

## 常见问题与踩坑

1. **命令发了没反应**：检查是否发到 `…/set` topic；payload 是否为 `on`/`1` 而非 JSON 包（除非刻意启用 JSON）。
2. **HA 不出现实体**：Discovery 前缀要一致；Broker 上 retain 的 config 是否被清空；ESPurna 侧 `haEnabled` 是否打开。
3. **OTA 后配置丢失**：跨大版本 OTA 可能踩分区变更，备 USB 线刷。
4. **SSL MQTT**：常规 build 默认关闭 TLS（占内存），需要特编译；内网明文 MQTT + VLAN 隔离是常见折中。
5. **内存不足**：8266 上同时开 Web + MQTT + 多传感器 + SSL 易崩溃；用 **Unstable system check** 会自动退回 AP+OTA 安全模式。

---

## 和本仓库其它笔记的关系

- 中枢编排：[[home-assistant]]
- 消息总线：[[mosquitto]]
- 同类 ESP 固件路线：[[esphome]]
- 若用 RF Bridge 433MHz：ESPurna Wiki 有 Sonoff RF Bridge + Portisch 自定义 EFM8 固件说明

---

## 延伸阅读

| 资源 | 说明 |
| --- | --- |
| [ESPurna Wiki](https://github.com/xoseperez/espurna/wiki) | MQTT、Terminal、RPN、各硬件页 |
| [Home Assistant 集成](https://github.com/xoseperez/espurna/wiki/HomeAssistant) | Discovery 与手动 YAML |
| [MQTT 主题参考](https://github.com/xoseperez/espurna/wiki/MQTT) | relay/light/sensor topic 一览 |
| [RPN Rules](https://github.com/xoseperez/espurna/wiki/RPN-Rules) | 运算符与变量完整列表 |
| [PlatformIO 构建](https://github.com/xoseperez/espurna/wiki/Using-PlatformIO-CLI) | 自编译与 custom.h |
| 作者博客 [tinkerman.cat](https://tinkerman.cat/) | Sonoff 改装系列原文 |

---

## 小结

ESPurna 把「十块钱 Wi-Fi 插座」变成 **听 MQTT 指挥、可 Web 配置、可选设备端自动化** 的节点。零基础最短路径是：**认型号 → 刷对应 bin → Web 配 Wi-Fi/MQTT → HA Discovery**。掌握 `{root}/relay/0` 与 `{root}/relay/0/set` 的读写分工，你就已经能驱动家里大部分 ESPurna 继电器；需要夜间本地逻辑时，再进阶 RPN Rules 与 Telnet 调试。
