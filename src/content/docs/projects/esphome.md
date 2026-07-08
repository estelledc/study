---
title: ESPHome — 用 YAML 给 ESP32 / ESP8266 生成智能家居固件
来源: 'https://github.com/esphome/esphome'
日期: 2026-07-08
分类: embedded
难度: 初级
---

## 是什么

ESPHome 是一个把 **YAML 配置文件变成 ESP32 / ESP8266 等小板子固件**的工具链。你写“这里接了温度传感器、那里接了继电器”，它负责生成、编译、烧录和之后的远程更新。

日常类比：像给装修师傅一张清单。你不用自己焊电路图、写 C++ 主循环、处理 Wi-Fi 重连；你把“客厅温度计”“车库门开关”写清楚，ESPHome 把清单翻译成能跑在小板子上的固件。

最小感觉大概是这样：

```yaml
switch:
  - platform: gpio
    name: "Living Room Dehumidifier"
    pin: GPIO5
```

这几行不是 Home Assistant 的界面配置，而是设备固件的“物料表”。烧到板子后，它会在 Home Assistant 里出现为一个可控制实体。

## 为什么重要

不理解 ESPHome，下面这些事会很难解释：

- 为什么智能家居玩家可以不用写 C++，也能把十几块钱的小板子变成传感器、灯带控制器或继电器。
- 为什么第一次要用 USB 烧录，但之后可以 OTA 远程更新；固件里已经带了后续升级入口。
- 为什么 Home Assistant 会自动发现设备；ESPHome 默认围绕本地网络、native API 和实体模型设计。
- 为什么同样是“刷固件”，ESPHome 更适合自定义硬件，Tasmota 更像刷进很多现成插座和开关的通用固件。

## 核心要点

1. **YAML 是设备说明书**。类比：菜单上写“番茄炒蛋”，厨房才去切菜、开火、装盘。ESPHome 读取 `sensor:`、`switch:`、`binary_sensor:` 等块，再生成对应 C++ 组件代码。

2. **编译和烧录被包进同一条流水线**。类比：不是只给你图纸，还把工厂、质检、快递都连上。`esphome run livingroom.yaml` 会校验配置、调用底层构建工具、上传固件，并打开日志。

3. **Home Assistant 是默认好朋友，不是唯一出口**。类比：默认把门牌接到同一个物业系统，但也能走 MQTT 等旁路。ESPHome 的强项是本地联动、自动发现、实体状态直接进入 Home Assistant。

## 实践案例

### 案例 1：命令行创建客厅节点并加一个继电器

官方命令行教程先用 wizard 创建配置，再在 YAML 里加入 GPIO switch：

```bash
esphome wizard livingroom.yaml
esphome run livingroom.yaml
```

```yaml
switch:
  - platform: gpio
    name: "Living Room Dehumidifier"
    pin: GPIO5
```

逐部分解释：

- `wizard livingroom.yaml`：生成第一份设备配置，通常包含板型、Wi-Fi、日志、API、OTA 等基础块。
- `switch:`：告诉 ESPHome 这块板子要暴露一个开关实体。
- `platform: gpio`：这个开关直接控制某个芯片引脚，常用来接继电器、LED 或简单负载。
- `esphome run`：先检查配置，再编译固件，最后通过 USB 或 OTA 上传。

### 案例 2：DHT22 温湿度传感器进 Home Assistant

DHT 文档给出的典型配置是把一个数据脚拆成温度和湿度两个实体：

```yaml
sensor:
  - platform: dht
    pin: D2
    temperature:
      name: "Living Room Temperature"
    humidity:
      name: "Living Room Humidity"
    update_interval: 60s
```

逐部分解释：

- `platform: dht`：选择 DHT11 / DHT22 这一类单总线温湿度传感器驱动。
- `pin: D2`：说明数据线接在哪个板卡引脚；NodeMCU 这类板子常用 `D2` 这种别名。
- `temperature` 和 `humidity`：一个硬件模块产出两个 Home Assistant 实体。
- `update_interval: 60s`：每分钟读一次，避免便宜传感器被过度轮询。

### 案例 3：用两个继电器做车库门 cover

官方 cookbook 里有车库门例子：两个 GPIO 继电器分别模拟“开”和“关”，再包成一个 `cover`：

```yaml
switch:
  - platform: gpio
    pin: GPIOXX
    name: "Garage Door Open Switch"
    id: open_switch
  - platform: gpio
    pin: GPIOXX
    name: "Garage Door Close Switch"
    id: close_switch

cover:
  - platform: template
    name: "Garage Door"
    open_action:
      - switch.turn_off: close_switch
      - switch.turn_on: open_switch
      - delay: 0.1s
      - switch.turn_off: open_switch
    close_action:
      - switch.turn_off: open_switch
      - switch.turn_on: close_switch
      - delay: 0.1s
      - switch.turn_off: close_switch
```

逐部分解释：

- `id: open_switch`：给内部自动化动作引用，不一定要暴露给用户看。
- `cover:`：在 Home Assistant 里表现成“门 / 窗帘 / 卷帘”这类实体，而不是两个零散开关。
- `delay: 0.1s`：继电器短按一下，模拟车库门按钮，不是一直通电。
- `switch.turn_off` 在前面：先取消反方向动作，避免开关同时触发。

## 踩过的坑

1. **把 YAML 当普通缩进文本乱改**：缩进错一级，组件含义就变了，报错常常看起来不像“少了两个空格”。
2. **第一次刷机低估硬件连接**：USB 串口、驱动、供电、电平、BOOT 按键都会影响烧录，尤其是裸 ESP 模块。
3. **忘记 DHT 上拉电阻**：DHT11 / DHT22 数据线通常需要上拉到 3.3V，连接不稳会表现成随机读不到值。
4. **把 OTA 当永远可靠**：Wi-Fi 信号、固件过大、设备离线都会让远程更新失败，关键设备要保留物理访问方案。

## 适用 vs 不适用场景

**适用**：

- 家里已有 Home Assistant，想把自制传感器、继电器、灯带、红外、蓝牙代理接进统一界面。
- 硬件逻辑清晰，主要是“某个引脚接某个传感器 / 开关”，不想从零写嵌入式主循环。
- 需要本地控制和本地自动化，不能把所有状态都发到云端再回来。
- 想用 OTA、日志、dashboard、secrets、packages 这些成熟配套管理多块板子。

**不适用**：

- 要写复杂实时控制、精细功耗管理或深度自定义协议栈，直接用 ESP-IDF / Zephyr 更合适。
- 产品要大规模量产、严格认证、复杂安全生命周期，ESPHome 更像原型和 DIY 的快车道。
- 设备根本不在 Home Assistant 生态里，也不想维护 YAML 配置仓库。
- 需要高带宽音视频、摄像头分析或大模型推理；小 MCU 和 YAML 抽象不是为这个设计的。

## 历史小故事（可跳过）

- **2018 年前后**：ESPHome 从智能家居 DIY 场景里长出来，目标是让 ESP8266 / ESP32 自定义固件变得像写配置。
- **后来**：项目和 Home Assistant 生态越走越近，设备发现、实体模型、Device Builder 都围绕普通家庭自动化用户优化。
- **2023 年**：ESPHome 成为 Open Home Foundation 相关项目之一，定位更明确：本地、开放、可自己掌控。
- **2026 年**：GitHub 上已经是万星量级项目，支持 ESP32、ESP8266、BK72xx、RP2040 等多类芯片和大量组件。

## 学到什么

- ESPHome 的核心不是“省几行代码”，而是把硬件描述、固件生成、烧录、日志和 Home Assistant 接入做成一条路。
- YAML 配置是边界：简单设备会非常快，复杂设备会逼你理解底层引脚、电源、总线和组件限制。
- 第一次 USB 烧录是门槛，OTA 才是长期维护体验；这也是它适合装进墙里、灯里、盒子里的原因。
- 和同类工具相比，ESPHome 的差异点是“自定义硬件 + Home Assistant 深度集成”，不是通用物联网平台。

## 延伸阅读

- 官方仓库：[esphome/esphome](https://github.com/esphome/esphome)
- 官方文档：[ESPHome Documentation](https://esphome.io/)
- 命令行入门：[Getting Started with the ESPHome Command Line](https://esphome.io/guides/getting_started_command_line/)
- YAML 说明：[YAML Configuration in ESPHome](https://esphome.io/guides/yaml/)
- Cookbook：[Simple Garage Door](https://esphome.io/cookbook/garage-door/)
- [[home-assistant]] —— ESPHome 最常见的上层控制中心。

## 关联

- [[home-assistant]] —— 设备实体、自动发现和本地控制体验主要在那里呈现。
- [[platformio-core]] —— ESPHome 底层构建会借助 PlatformIO 生态处理板卡和依赖。
- [[arduino-cli]] —— 同样服务嵌入式开发，但更偏通用开发工具而不是智能家居配置生成。
- [[esp-dl]] —— 都跑在 ESP 系列芯片上，一个偏固件配置，一个偏端侧 AI 推理。
- [[openthread]] —— 都属于智能家居底层能力，ESPHome 更靠近设备固件，OpenThread 更靠近低功耗网络。
- [[openhab]] —— 另一类家庭自动化平台，可帮助对比 Home Assistant 生态路线。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
