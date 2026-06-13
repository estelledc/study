---
title: ESPHome — 用 YAML 给 ESP 芯片写「说明书」的固件工厂
来源: 'https://github.com/esphome/esphome'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
难度: 初级
provenance: pipeline-v3
---

## 日常类比：给电工一张「接线清单」，工厂自动造遥控器

想象你要在阳台装一个温湿度计，顺便控制除湿机开关。传统做法是：

1. 买一块 ESP32 开发板；
2. 打开 Arduino IDE，写 C++，调 Wi-Fi 库、MQTT 库、传感器驱动；
3. 烧录、改 bug、再烧录；
4. 最后在 Home Assistant 里手动建实体、对 MQTT 主题。

**ESPHome 换了一种思路**：你不写程序，只写一份 **YAML「接线清单」**——「D4 脚接 DHT22，每 60 秒读一次温湿度；GPIO5 接一个开关，名字叫阳台除湿机」。ESPHome 把这份清单 **编译成定制固件**，刷进芯片；设备连上 Wi-Fi 后，通过 **Native API** 主动推状态给 [[home-assistant]]，实体自动出现在仪表盘里。

类比延伸：

| 现实世界 | ESPHome 对应 |
| --- | --- |
| 接线图 + 功能说明 | `.yaml` 配置文件 |
| 工厂按图生产电路板 | `esphome compile` 生成固件 |
| 第一次 USB 装机 | 首次 `esphome run` / Web Flasher |
| 以后远程换程序 | OTA（Over-The-Air）无线更新 |
| 物业前台登记设备 | Home Assistant 自动发现 / 添加 ESPHome 集成 |

ESPHome 由 Home Assistant 生态团队（Nabu Casa / Open Home Foundation）维护，GitHub 仓库 [esphome/esphome](https://github.com/esphome/esphome)。它 **不依赖云端**：配置、编译、运行都在你的局域网；和 [[home-assistant]] 是「黄金搭档」，也可单独用 CLI 或 Docker 管理节点。

---

## 解决什么问题

| 痛点 | 裸写嵌入式时 | ESPHome 的回应 |
| --- | --- | --- |
| 开发门槛高 | C++、内存、看门狗、Wi-Fi 重连都要自己管 | 声明式 YAML，框架生成样板代码 |
| 与 HA 对接繁琐 | 自建 MQTT 主题、Discovery、加密 | Native API 推送，实体自动注册 |
| 维护成本高 | 改一行逻辑要重新熟悉整个 sketch | 改 YAML → 编译 → OTA，版本可 Git 管理 |
| 硬件碎片化 | 每种传感器 copy 一份驱动代码 | 600+ 组件，统一配置语法 |
| 密钥泄露风险 | Wi-Fi 密码写死在仓库里 | `secrets.yaml` + `!secret` 标签 |

核心问题：**如何用一份人类可读的配置，把廉价 MCU（ESP32/ESP8266/BK72xx/RP2040 等）变成可 OTA、可本地集成、可长期维护的智能家居节点？**

---

## ESPHome 在智能家居栈中的位置

```
┌─────────────────────────────────────────────────────────────┐
│  Home Assistant Core — 自动化、仪表盘、语音                  │
│         ▲ Native API（加密、推送，默认端口 6053）              │
├─────────┴───────────────────────────────────────────────────┤
│  ESPHome 节点（每块板子一份 YAML → 一份固件）                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │
│  │ 温湿度   │  │ 继电器   │  │ 毫米波   │  …                  │
│  │ ESP32   │  │ ESP8266 │  │ ESP32-C3│                      │
│  └────┬────┘  └────┬────┘  └────┬────┘                      │
│       │ 传感器/执行器/GPIO/I2C/SPI/UART                       │
└───────┴───────────────────────────────────────────────────────┘

侧路工具链：
  ESPHome Device Builder（HA 加载项 / Docker Web UI）
  CLI：`esphome run`、`compile`、`upload`、`logs`
  浏览器首次刷机：web.esphome.io
```

与 [[openhab]]、[[home-assistant]] 等「中枢」不同，ESPHome 专注 **边缘节点固件**。中枢负责编排；ESPHome 负责让 **单块板子** 可靠地上报状态、执行开关动作。

---

## 核心概念

### 1. 配置（Configuration）与节点（Node）

- **一份 YAML = 一个节点**（一台物理板子）。文件名常叫 `porch-sensor.yaml`，其中 `esphome.name` 决定主机名（如 `porch-sensor.local`）。
- 配置由多个 **顶层块** 组成：`esphome`、`esp32`/`esp8266`、`wifi`、`logger`、`api`、`ota`，以及 `sensor`、`switch`、`binary_sensor` 等 **组件块**。
- 块顺序通常 **不影响语义**；ESPHome 先读完整个文件再校验、生成代码。

### 2. 平台（Platform）与板型（Board）

- **Platform**：芯片系列，如 `esp32:`、`esp8266:`。
- **Board**：具体开发板型号，如 `esp32dev`、`nodemcuv2`，影响默认引脚映射（可写 `D1` 代替 `GPIO5`）。
- 近年还支持 BK72xx、RP2040、RTL87xx、nRF52 等；选型以 [官方支持列表](https://esphome.io/) 为准。

### 3. 组件（Component）与实体（Entity）

- **Component**：YAML 里的一种设备抽象，例如 `sensor`、`switch`、`light`、`climate`。
- 每个组件下用 **platform** 指定驱动，如 `platform: dht`、`platform: gpio`。
- 带 `name:` 的条目会在 Home Assistant 里变成 **实体**（如 `sensor.porch_temperature`）。

### 4. 基础设施块（几乎每个项目都要有）

| 块 | 作用 |
| --- | --- |
| `wifi` | SSID、密码、可选 AP 热点、`captive_portal` |
| `logger` | 串口 / 网络日志，调试生命线 |
| `api` | Home Assistant Native API；建议开 `encryption.key` |
| `ota` | 无线刷机；可设密码或复用 API 加密 |
| `web_server` | 可选，板载简易网页 |

### 5. 编译与烧录流程

1. **validate**：检查 YAML 语法、引脚冲突、组件依赖。
2. **compile**：生成 C++ 工程并用 PlatformIO 交叉编译。
3. **upload**：首次常走 USB；之后走 **OTA**。
4. **logs**：`esphome logs xxx.yaml` 看运行输出。

命令行等价于在 Device Builder 里点 Install / Wirelessly。

### 6. 与 Home Assistant 的对接

- 设备上线且 API 可达后，HA 常通过 **mDNS 自动发现**（`xxx.local`）。
- 手动添加：设置 → 设备与服务 → ESPHome → 输入 IP 或主机名 + **Noise PSK**（与 YAML 里 `api.encryption.key` 一致）。
- 通信是 **本地加密长连接**，状态变化 **推送**，不是轮询 MQTT。

### 7. 配置进阶能力

- **`!secret`**：从 `secrets.yaml` 读 Wi-Fi、API 密钥，避免进 Git。
- **`substitutions`**：全局变量，方便同一模板刷多块板。
- **`packages:` / `!include`**：拆分大项目、复用片段。
- **`!lambda`**：嵌入小段 C++，做 YAML 表达不了的逻辑（见下方示例）。

---

## 从零开始：三种入口

| 方式 | 适合谁 | 第一步 |
| --- | --- | --- |
| Home Assistant 加载项 | 已跑 HA，想图形化管理 | 安装 **ESPHome Device Builder**，向导新建设备 |
| CLI | 熟悉终端、CI 批量编译 | `pip install esphome` → `esphome wizard livingroom.yaml` |
| Docker | 不想污染本机 Python | `docker run ... ghcr.io/esphome/esphome wizard` |

首次烧录：

- **USB**：`esphome run config.yaml`（自动 compile + upload + logs）。
- **浏览器**：打开 [web.esphome.io](https://web.esphome.io/)，选板型、粘贴 YAML 或导入。

---

## 代码示例一：最小可用节点 + DHT22 温湿度

下面是一份 **完整可编译** 的入门配置：ESP32 连 Wi-Fi，通过 API 对接 HA，每 60 秒读 DHT22。

```yaml
esphome:
  name: porch-sensor
  friendly_name: 阳台环境传感器

esp32:
  board: esp32dev
  framework:
    type: arduino

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "Porch Fallback"
    password: !secret ap_password

captive_portal:

logger:

api:
  encryption:
    key: !secret api_encryption_key

ota:
  - platform: esphome
    password: !secret ota_password

sensor:
  - platform: dht
    pin: GPIO4
    model: DHT22
    temperature:
      name: "阳台温度"
      unit_of_measurement: "°C"
    humidity:
      name: "阳台湿度"
      unit_of_measurement: "%"
    update_interval: 60s
```

配套 `secrets.yaml`（与 YAML 同目录，**不要提交到公开仓库**）：

```yaml
wifi_ssid: "你的WiFi名"
wifi_password: "你的WiFi密码"
ap_password: "fallback123"
api_encryption_key: "从 esphome wizard 生成的 base64 密钥"
ota_password: "ota123"
```

**读这段配置时看什么：**

- `esphome.name` → mDNS 主机名 `porch-sensor.local`。
- `wifi.ap` + `captive_portal` → 连不上家 Wi-Fi 时板子开热点，手机可配网。
- `sensor.platform: dht` 一行声明，自动生成两个 HA 实体。
- `update_interval` 控制采样频率，平衡精度与功耗。

编译上传：

```bash
esphome run porch-sensor.yaml
```

---

## 代码示例二：GPIO 开关 + 门窗磁 + 简单 Lambda 逻辑

第二份示例展示 **执行器 + 输入 + 轻量逻辑**：GPIO 控制除湿机；窗口磁簧触发时，在日志里标记并可配合 HA 自动化关开关。

```yaml
esphome:
  name: balcony-controller
  friendly_name: 阳台控制器

esp8266:
  board: nodemcuv2

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

logger:
  level: INFO

api:
  encryption:
    key: !secret api_encryption_key

ota:

switch:
  - platform: gpio
    name: "阳台除湿机"
    pin: GPIO5
    id: dehumidifier
    restore_mode: RESTORE_DEFAULT_OFF

binary_sensor:
  - platform: gpio
    name: "阳台窗户"
    pin:
      number: GPIO0
      mode:
        input: true
        pullup: true
      inverted: true
    on_press:
      - logger.log: "窗户打开"
      - switch.turn_off: dehumidifier
    on_release:
      - logger.log: "窗户关闭"

sensor:
  - platform: template
    name: "除湿机状态摘要"
    lambda: |-
      if (id(dehumidifier).state) {
        return {"运行中"};
      } else {
        return {"已停止"};
      }
    update_interval: 30s
```

要点说明：

- **`switch.platform: gpio`**：最常用继电器/ MOSFET 控制；`restore_mode` 决定重启后默认开还是关。
- **`binary_sensor`**：`inverted: true` 常表示磁簧 **常闭** 接线；`pullup` 启用内部上拉。
- **`on_press` / `on_release`**：ESPHome 内置 **自动化**，在设备端即时响应，不经过 HA 也能执行（延迟更低）。
- **`template` + `!lambda`**：返回字符串供 HA 显示；复杂场景可返回数值参与本地逻辑。

在 Home Assistant 里可再写一条自动化：「`binary_sensor.阳台窗户` 打开 → 通知手机」，与设备端 `turn_off` **叠加**，形成云边协同。

---

## 常用 CLI 命令速查

| 命令 | 用途 |
| --- | --- |
| `esphome wizard foo.yaml` | 交互式生成首份配置 |
| `esphome config foo.yaml` | 仅校验，不编译 |
| `esphome compile foo.yaml` | 编译固件到 `.esphome/build/` |
| `esphome upload foo.yaml` | OTA / USB 上传 |
| `esphome run foo.yaml` | 校验 + 编译 + 上传 + 日志 |
| `esphome logs foo.yaml` | 查看设备输出（含 Wi-Fi IP） |
| `esphome clean foo.yaml` | 清理构建缓存 |

Docker 用户把当前目录挂载为 `/config`，命令形如：

```bash
docker run --rm -v "${PWD}":/config -it ghcr.io/esphome/esphome run porch-sensor.yaml
```

---

## 调试与排错清单

| 现象 | 常见原因 | 建议 |
| --- | --- | --- |
| 编译报 YAML 缩进错误 | 混用 Tab、列表 `-` 不对齐 | 用 2 空格；IDE 开 YAML 插件 |
| 上传失败 | USB 驱动、端口占用、供电不足 | 换线、换口；5V 稳定电源 |
| 连不上 Wi-Fi | 2.4G 频段、密码错误、信号弱 | ESP 多数 **不支持 5G-only** 路由 |
| HA 发现不了设备 | mDNS 被隔离（访客网络） | 手动填 IP；保证 HA 与 ESP 同网段 |
| API 连接失败 | 加密密钥不一致 | 核对 `api.encryption.key` 与 HA 集成里 PSK |
| 随机重启 | 电源纹波、看门狗、堆栈 | 加大电容；查 `logs` 里 Guru Meditation |
| 传感器读数 NaN | 接线错、上拉缺失、GPIO 冲突 | 对照板型引脚图；I2C 加 4.7k 上拉 |
| OTA 反复失败 | 固件体积过大、Wi-Fi 不稳定 | USB 刷一次；靠近路由器 |

---

## 和相邻方案怎么选

| 方案 | 特点 | 何时考虑 |
| --- | --- | --- |
| **ESPHome + HA** | YAML、OTA、Native API、生态最大 | 已用或计划用 Home Assistant |
| **Tasmota** | 刷机快、MQTT 成熟、模板多 | 重度 MQTT、不用 HA Native API |
| **Arduino 自写** | 自由度最高 | 算法重、量产定制、ESPHome 无组件 |
| **Zigbee/Z-Wave 成品** | 免刷机、Mesh | 不想维护固件，接受更高单价 |

若你的目标是 **「几块 ESP 板子 + 本地 homeassistant + 长期 OTA」**，ESPHome 通常是阻力最小的路径。

---

## 学习路径建议（零基础）

1. **硬件**：先买 ESP32 DevKit + USB 线；加一个 DHT22 或继电器模块练手。
2. **软件**：HA 用户直接装 Device Builder；否则 `pip install esphome` + `wizard`。
3. **第一份 YAML**：复制本文示例一，改 `name` 和引脚，跑通 `esphome run`。
4. **对接 HA**：确认实体出现；用仪表盘加一个温湿度卡片。
5. **加执行器**：示例二开关 + 磁簧；在 HA 写一条简单自动化。
6. **读官方组件页**：需要什么传感器，就搜 [esphome.io/components](https://esphome.io/components/) 复制官方片段。
7. **工程化**：`secrets.yaml`、Git 管理配置、命名规范（`room-device-function`）。

---

## 延伸阅读

- 官方文档：[Getting Started with ESPHome](https://esphome.io/guides/getting_started_hassio.html)
- YAML 语法与 `!include`：[YAML Configuration](https://esphome.io/guides/yaml.html)
- Home Assistant 集成说明：[ESPHome Integration](https://www.home-assistant.io/integrations/esphome/)
- 同生态中枢笔记：[[home-assistant]]、[[openhab]]
- 预配置项目灵感：[devices.esphome.io](https://devices.esphome.io/)

---

## 小结

ESPHome 把「写固件」变成「写配置」：YAML 描述硬件与行为，工具链生成 C++ 并 OTA 维护，Native API 让 [[home-assistant]] 即插即用。零基础只需记住 **一份 YAML、一次 USB、以后全 OTA**；进阶再学 `packages`、lambda 与多节点命名规范。对于想亲手做传感器、又不深陷嵌入式细节的人来说，它相当于 **智能家居领域的 Dockerfile + 编译器**——声明要什么，系统帮你造出来。
