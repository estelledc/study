---
title: 项目候选 — 嵌入式 / 物联网 / 边缘计算
日期: 2026-05-29
---

# 嵌入式 / 物联网 / 边缘计算 项目候选

候选 50 个，按子类分组（RTOS 5 / 嵌入式 Linux 3 / MCU 框架 4 / Rust embedded 3 / C/C++ 协议库 3 / 无线网络栈 3 / MQTT/IoT 3 / 边缘 AI 5 / 3D 打印·CNC 4 / 机器人·ROS 4 / 家庭自动化 4 / 音视频边缘 3 / 嵌入式 DB·FS 2 / 网络边缘 2 / OTA 升级 2）。

现有 atlas 200 个 projects 中**嵌入式 / IoT / 边缘几乎为零**——只有 `sqlite` / `redis` 这种通用引擎可在嵌入式跑（已存在，本表跳过），以及 `nginx` / `docker` 这种偏服务端基建。RTOS / MCU 框架 / Rust embedded / 边缘 AI / 机器人 / 家庭自动化 / OTA 这一整条主线完全空白。

本表 50 条 slug 与 200 个现有 atlas 条目、`projects-cli.md` / `projects-devops.md` / `projects-databases.md` / `projects-runtimes.md` 等已收清单互斥，不复用任何 slug。

Stars 量级为 2026 年 5 月近似值。

## 总览

- **总数**：50 个
- **挑选维度**：RTOS 实时操作系统 / 嵌入式 Linux / MCU 框架 / Rust embedded / 通信协议栈 / 边缘 AI 推理 / 机器人 / 家庭自动化 / 音视频边缘 / OTA
- **过滤**：闭源（TI BLE-Stack / Silicon Labs Gecko SDK / Nordic SoftDevice 二进制部分）跳过；归档项目（drogue-iot / contiki-ng v2 已停滞 / mbed-os 2024-07 EOL / motion-eye 主仓停更）跳过；ROS 1 已 EOL（2025-05）跳过

### 子类分布

| 子类 | 数量 |
|---|---:|
| [RTOS / 嵌入式实时操作系统](#1-rtos--嵌入式实时操作系统) | 5 |
| [嵌入式 Linux 发行](#2-嵌入式-linux-发行) | 3 |
| [MCU 开发框架](#3-mcu-开发框架) | 4 |
| [Rust embedded 生态](#4-rust-embedded-生态) | 3 |
| [嵌入式 C/C++ 协议库](#5-嵌入式-cc-协议库) | 3 |
| [无线 / 网络协议栈](#6-无线--网络协议栈) | 3 |
| [MQTT / IoT 消息](#7-mqtt--iot-消息) | 3 |
| [边缘 AI 推理](#8-边缘-ai-推理) | 5 |
| [3D 打印 / CNC 控制](#9-3d-打印--cnc-控制) | 4 |
| [机器人 / ROS](#10-机器人--ros) | 4 |
| [家庭自动化](#11-家庭自动化) | 4 |
| [音视频边缘](#12-音视频边缘) | 3 |
| [嵌入式 DB / 文件系统](#13-嵌入式-db--文件系统) | 2 |
| [网络边缘](#14-网络边缘) | 2 |
| [OTA 升级](#15-ota-升级) | 2 |

---

## 1. RTOS / 嵌入式实时操作系统

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| freertos | FreeRTOS-Kernel | AWS 接管的全球第一 MCU 内核，~10k 行 C，调度+IPC+内存全栈源码教科书 | 2.8k | https://github.com/FreeRTOS/FreeRTOS-Kernel |
| zephyr | Zephyr | Linux Foundation 的现代 RTOS，Apache 2.0，多板 BSP / 网络栈 / BLE / Thread 一体 | 11k | https://github.com/zephyrproject-rtos/zephyr |
| rt-thread | RT-Thread | 中文社区主导的物联网 RTOS，组件化设计，国产 MCU 板级支持最广 | 11k | https://github.com/RT-Thread/rt-thread |
| nuttx | Apache NuttX | POSIX 接近完整的小型 RTOS，Sony PS5 摄像头 / Espressif 部分产品在用 | 3k | https://github.com/apache/nuttx |
| embassy | Embassy | Rust async/await 跨平台 embedded 框架，零分配、低功耗优先，no_std 异步范式开创者 | 6.2k | https://github.com/embassy-rs/embassy |

---

## 2. 嵌入式 Linux 发行

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| buildroot | Buildroot | 用 Make 生成定制嵌入式 Linux 镜像的工具链，5 万+ 软件包，~30 分钟出 image | 1.9k | https://github.com/buildroot/buildroot |
| yocto-poky | Yocto Project (poky) | 工业级嵌入式 Linux 构建系统参考发行，bitbake + recipe + layer 三层抽象 | 1.4k | https://github.com/yoctoproject/poky |
| openwrt | OpenWrt | 路由器 / 网关事实标准 Linux 发行，opkg 包管理 + LuCI Web UI + 网络功能完整 | 23k | https://github.com/openwrt/openwrt |

---

## 3. MCU 开发框架

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| arduino-cli | Arduino CLI | Arduino 官方下一代命令行工具链，Go 写的 board manager / compiler / uploader | 4.2k | https://github.com/arduino/arduino-cli |
| platformio-core | PlatformIO Core | Python 写的跨平台嵌入式构建系统，1500+ 板 / 40+ 框架统一 IDE 接入 | 8.4k | https://github.com/platformio/platformio-core |
| circuitpython | CircuitPython | Adafruit 的 MicroPython fork，主打教学友好与硬件外设 USB 自动挂载 | 4.4k | https://github.com/adafruit/circuitpython |
| micropython | MicroPython | 在 MCU 上跑 Python 3 的精简实现，REPL + GC 全在 ~256KB Flash 内 | 21k | https://github.com/micropython/micropython |

---

## 4. Rust embedded 生态

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| embedded-hal | embedded-hal | Rust embedded 生态的 HAL trait 标准，I2C / SPI / GPIO 跨芯片解耦的顶层抽象 | 2.4k | https://github.com/rust-embedded/embedded-hal |
| probe-rs | probe-rs | Rust 写的 embedded 调试 / 烧录工具，替代 OpenOCD，支持 CMSIS-DAP / J-Link / ST-Link | 2.7k | https://github.com/probe-rs/probe-rs |
| smoltcp | smoltcp | no_std / no-alloc 的 Rust TCP/IP 协议栈，单 binary 跑完 ARP / IPv4/6 / TCP / DHCP | 4.3k | https://github.com/smoltcp-rs/smoltcp |

---

## 5. 嵌入式 C/C++ 协议库

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| lwip | lwIP | 轻量级 TCP/IP 协议栈，~40KB ROM 跑 IPv4/6 + TCP + DHCP，FreeRTOS / Zephyr 默认网卡栈 | 2.6k | https://github.com/lwip-tcpip/lwip |
| mbedtls | Mbed TLS | Arm 维护的小型 TLS 1.3 / X.509 / 加密原语库，ESP-IDF / Zephyr 默认 TLS 后端 | 5.9k | https://github.com/Mbed-TLS/mbedtls |
| freemodbus | FreeModbus | 工业现场总线 Modbus RTU / TCP 主从机协议栈 C 实现，PLC 通信学习样本 | 0.7k | https://github.com/cwalter-at/freemodbus |

---

## 6. 无线 / 网络协议栈

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| openthread | OpenThread | Google 开源的 Thread 1.3 协议实现，IPv6 over 802.15.4 mesh 事实标准 | 3.7k | https://github.com/openthread/openthread |
| sdk-nrf | Nordic Connect SDK | Nordic nRF52/nRF53/nRF54 全家桶 SDK，BLE / Thread / Matter / 蜂窝 IoT 一体 | 1.7k | https://github.com/nrfconnect/sdk-nrf |
| lora-mac-node | LoRaMac-node | LoRa Alliance 参考实现，LoRaWAN MAC 层 + 区域参数 + Class A/B/C 完整 | 1.9k | https://github.com/Lora-net/LoRaMac-node |

---

## 7. MQTT / IoT 消息

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| mosquitto | Eclipse Mosquitto | C 写的 MQTT broker 事实标准，~30k 行，IoT 入门 broker 首选 | 9.5k | https://github.com/eclipse-mosquitto/mosquitto |
| emqx | EMQX | Erlang 写的分布式 MQTT 5.0 broker，单集群千万连接，国产 IoT 后端常选 | 14k | https://github.com/emqx/emqx |
| nanomq | NanoMQ | C 写的边缘超轻量 MQTT broker，单线程 / 100KB 二进制，运行在网关 / 容器侧 | 1.9k | https://github.com/nanomq/nanomq |

---

## 8. 边缘 AI 推理

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| tflite-micro | TensorFlow Lite Micro | Google 的微控制器 TF Lite runtime，~16KB ROM 跑 INT8 推理，无 OS / 无 malloc | 2.5k | https://github.com/tensorflow/tflite-micro |
| esp-dl | ESP-DL | Espressif 的 ESP32 神经网络推理库，针对 ESP32-S3 向量指令优化 | 1.1k | https://github.com/espressif/esp-dl |
| cmsis-nn | CMSIS-NN | 1k | Arm 的 Cortex-M 神经网络算子库，SIMD/Helium 加速，TFLM 默认后端 | https://github.com/ARM-software/CMSIS-NN |
| ncnn | ncnn | 21k | 腾讯开源的端侧 CPU 推理框架，无第三方依赖，ARM NEON / Vulkan 双后端 | https://github.com/Tencent/ncnn |
| paddle-lite | Paddle Lite | 百度的端侧轻量推理引擎，支持 ARM CPU / GPU / NPU / FPGA，模型转换 + 运行时一体 | 7k | https://github.com/PaddlePaddle/Paddle-Lite |

---

## 9. 3D 打印 / CNC 控制

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| klipper | Klipper | Python + C 双进程 3D 打印固件，运动学算到主机减压主控，开源圈最先进 | 10k | https://github.com/Klipper3d/klipper |
| marlin | Marlin Firmware | 16k | 8-bit / 32-bit MCU 上跑的开源 3D 打印固件，G-code 解析教科书 | https://github.com/MarlinFirmware/Marlin |
| grbl | grbl | Arduino UNO 上跑的 G-code 解释器，~30 年的 CNC 控制鼻祖，500 行运动规划核心 | 6.4k | https://github.com/gnea/grbl |
| linuxcnc | LinuxCNC | RTLinux 实时内核上的 CNC 机床控制系统，HAL + 实时步进 + GUI 一体 | 2k | https://github.com/LinuxCNC/linuxcnc |

---

## 10. 机器人 / ROS

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| ros2 | ROS 2 | 机器人操作系统 v2，DDS 消息总线 + lifecycle + composability，工业级实时设计 | 4k | https://github.com/ros2/ros2 |
| moveit2 | MoveIt 2 | ROS 2 上的机械臂运动规划框架，IK / 轨迹 / 碰撞检测 / RViz 一体 | 1.2k | https://github.com/moveit/moveit2 |
| navigation2 | Nav2 | ROS 2 上的移动机器人导航栈，behavior tree + planner + controller 解耦 | 3.6k | https://github.com/ros-navigation/navigation2 |
| gazebo-classic | Gazebo Classic | OSRF 的物理仿真器，URDF / SDF / 物理引擎插件，机器人仿真训练事实标准 | 1.4k | https://github.com/osrf/gazebo |

---

## 11. 家庭自动化

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| home-assistant | Home Assistant Core | Python 的开源家庭自动化平台，2000+ integration，端侧 SQLite + WebSocket 架构 | 79k | https://github.com/home-assistant/core |
| openhab | openHAB | Java OSGi 家庭自动化框架，bundle / binding 双层架构，欧洲社区强 | 3.3k | https://github.com/openhab/openhab-core |
| esphome | ESPHome | YAML 配置生成 ESP32 / ESP8266 固件的工具链，与 Home Assistant 深度集成 | 9.5k | https://github.com/esphome/esphome |
| espurna | ESPurna | 可商用的 ESP8266 / ESP32 通用智能开关固件（C++），MQTT / HTTP / 调试一体 | 3k | https://github.com/xoseperez/espurna |

---

## 12. 音视频边缘

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| gstreamer | GStreamer | C 写的多媒体 pipeline 框架，element 模型 + 异步 dataflow，嵌入式 / 桌面通用 | 2.5k | https://github.com/GStreamer/gstreamer |
| ffmpeg-kit | FFmpegKit | iOS / Android / tvOS 移动端 FFmpeg 封装，二进制 + 高层 Java/Swift API 一体 | 5.1k | https://github.com/arthenica/ffmpeg-kit |
| janus-gateway | Janus WebRTC Gateway | C 写的 WebRTC 服务器，plugin 架构，SFU / 录制 / 流转推一体，边缘部署轻量 | 8.4k | https://github.com/meetecho/janus-gateway |

---

## 13. 嵌入式 DB / 文件系统

> 注：atlas 已收 `sqlite`（嵌入式关系库事实标准），本表跳过；`lmdb` 已被 `projects-databases.md` 候选池纳入，本表跳过。

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| unqlite | UnQLite | C 写的 NoSQL embedded DB，单文件 KV + JSON 文档双模，~50KB 代码量 | 2k | https://github.com/symisc/unqlite |
| littlefs | littlefs | ARM 维护的 MCU 友好故障可恢复文件系统，掉电安全 + 损耗均衡 + 极小 RAM | 5.5k | https://github.com/littlefs-project/littlefs |

---

## 14. 网络边缘

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| wireguard-go | WireGuard-Go | WireGuard VPN 的 Go 用户态实现，参考 ~3000 行密码学实现学习 VPN 内核 | 3.7k | https://github.com/WireGuard/wireguard-go |
| shadowsocks-libev | shadowsocks-libev | C 写的 SOCKS5 加密代理服务端 / 客户端，OpenWrt / 嵌入式路由器主流方案 | 16k | https://github.com/shadowsocks/shadowsocks-libev |

---

## 15. OTA 升级

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| mender | Mender | Go 写的 IoT OTA 客户端 + 服务端，A/B 双分区原子升级，工业级 fleet 管理 | 1.8k | https://github.com/mendersoftware/mender |
| rauc | RAUC | C 写的嵌入式 Linux A/B 更新框架，bundle 签名 + dbus 控制，Yocto / Buildroot 集成 | 1k | https://github.com/rauc/rauc |

---

## 与现有 atlas / 已有候选池的去重确认

已扫过 200 个现有 atlas slug + `projects-cli.md` / `projects-devops.md` / `projects-databases.md` / `projects-runtimes.md` / `projects-data-science-ai.md` / `projects-graphics.md` / `projects-media.md` 等候选池，本文件 50 条**全部互斥**：

- 与 atlas `sqlite` / `redis` 区分：sqlite / redis 都是已存在的通用嵌入式 DB / KV，本表跳过；嵌入式 DB 段只收 `unqlite`（NoSQL 单文件）和 `littlefs`（MCU 文件系统）
- 与 atlas `nginx` / `caddy` / `traefik` 区分：那些是数据中心反向代理，本表 `dnsmasq`-类（dnsmasq 因 GitHub 镜像非官方未列入）/ `wireguard-go` / `shadowsocks-libev` 是边缘 / 路由器场景
- 与 `projects-data-science-ai.md` 区分：`ncnn` / `paddle-lite` / `tflite-micro` 是端侧推理引擎，与该文件的 PyTorch / vLLM / TensorRT 等大算力服务端推理引擎不同主线
- 与 `projects-devops.md` 区分：`mender` / `rauc` 是嵌入式 OTA，与 `argocd` / `flux` 这种 K8s GitOps 完全不同领域
- 与 `projects-media.md` 区分：`gstreamer` / `ffmpeg-kit` / `janus-gateway` 强调"边缘 / 端侧 / 移动端"场景，与该文件已收的服务端转码 / 媒体存储 slug 互斥

## 备注

- stars 数为 2026/05 前后估算，前后浮动 < 15%
- 候选过滤规则：
  - 闭源（TI BLE-Stack / Silicon Labs Gecko SDK 二进制部分 / Nordic SoftDevice 二进制部分 / drogue-iot 已归档）跳过
  - 已 EOL / 停滞（mbed-os 2024-07 EOL / contiki-ng 主仓 2 年无 commit / motion-eye 主仓停更 / ROS 1 Noetic 2025-05 EOL）跳过
  - 重复 / 已收（sqlite / lmdb / ansible / docker / kubernetes / helm 等已存在）跳过
- 嵌入式 Linux 段未收 raspberrypi/linux：那是上游 Linux 内核的 RPi 厂商 fork，更适合"操作系统内核"主线而非"嵌入式发行版"
- 协议栈段未收 BlueZ / Apache mynewt-nimble：BLE 学习路径覆盖度低于 OpenThread + sdk-nrf，且 sdk-nrf 内部已含 BLE Host 完整实现
- ROS 段未收 ROS 1 / micro-ros：ROS 1 Noetic 已 EOL；micro-ros 是 ROS 2 在 RTOS 端的子集，留待后续按需补充
- 边缘 AI 段未收 onnxruntime-mobile：ONNX Runtime 通用版本（含 mobile）属于 `projects-data-science-ai.md` 主推理引擎主线，本表只收"专为 MCU / 端侧硬件设计"的轻量推理库
- 所有候选都是**烧到设备 / 跑在网关 / 编译进固件**链上的独立基础设施，符合 study 站"读项目源码学设计"主线
- 如需进一步压缩到 30，建议优先保留 ★ ≥ 5k 的：openwrt / micropython / ncnn / marlin / klipper / home-assistant / esphome / shadowsocks-libev / janus-gateway / emqx / mosquitto / mbedtls / smoltcp / circuitpython / arduino-cli / platformio-core / embassy / zephyr / rt-thread / paddle-lite / grbl / littlefs / ffmpeg-kit / openhab / espurna / freertos / probe-rs / nuttx / sdk-nrf / openthread
