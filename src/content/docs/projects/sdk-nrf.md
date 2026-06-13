---
title: sdk-nrf — Nordic nRF Connect SDK 零基础学习笔记
来源: nrfconnect/sdk-nrf
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
难度: 高级
provenance: pipeline-v3
---

## 是什么

**nRF Connect SDK**（仓库名 `sdk-nrf`，社区常简称 NCS）是 Nordic Semiconductor 为自家 nRF 系列无线芯片提供的**统一软件开发套件**。它把 Zephyr RTOS、无线协议栈、驱动、安全组件和示例应用打包成一套可量产的工具链，让你用同一套构建流程，从蓝牙心率带写到 Matter 智能灯泡，再到 LTE-M 资产追踪器。

日常类比：**宜家全屋定制系统**。

想象你要装修一套房子，里面有不同房间（蓝牙耳机、Thread 传感器、蜂窝定位器），每种房间需要不同建材（BLE 栈、OpenThread、LTE 调制解调器）。如果每间房都找不同包工队、用不同螺丝规格，成本爆炸。宜家做法是：**统一卡扣标准（Zephyr + west）+ 自家加固件（SoftDevice Controller、MPSL）+ 样板间（samples）**。你选板型、勾功能开关、改 overlay，剩下的框架 Nordic 已经搭好。

和裸跑 [[zephyr]] 的区别：Zephyr 是通用 RTOS 发行版，NCS 是在其上叠加 Nordic 专有无线控制器、多协议射频调度、认证样例和 VS Code 工具链的**厂商发行版**——类似 Ubuntu 之于裸 Linux 内核。

## 解决什么问题

Nordic 的 nRF 芯片家族横跨低功耗 BLE（nRF52/nRF54）、双核无线 SoC（nRF5340）、Wi-Fi 6 伴侣芯片（nRF7002）、蜂窝 IoT（nRF91）。若每个系列各维护一套闭源 SDK，开发者将面临：

| 痛点 | NCS 的回应 |
| --- | --- |
| 跨芯片迁移等于重写 | 统一 west manifest + Kconfig，换板子主要改 devicetree overlay |
| BLE 控制器各家实现质量参差 | 默认 **SoftDevice Controller**（与历史 SoftDevice 同代码基，带 QDID 认证路径） |
| BLE + Thread 同时跑会抢射频 | **MPSL**（Multiprotocol Service Layer）时间片调度同一颗天线 |
| Matter 要拼 BLE 配网 + Thread 传输 + CSA 合规 | 官方 Matter fork 以 Zephyr module 集成，样本可直接过生态互操作 |
| 团队不懂 Zephyr 构建链 | nRF Connect for VS Code 封装 west build / flash / debug / Devicetree 可视化 |
| 超简单裸机项目不想上 RTOS | 并行提供 **nRF5 SDK**（无 Zephyr），按场景二选一 |

一句话：**NCS 解决的是「在 Nordic 硬件上做可认证、可量产、可扩展的无线 IoT 产品」这条完整链路**，而不是只给你一个裸 BLE 例程。

### 支持硬件与协议（2026 年视角）

- **芯片系列**：nRF54、nRF53、nRF52、nRF70（Wi-Fi）、nRF91（LTE-M / NB-IoT）
- **无线协议**：Bluetooth LE / Mesh、Thread、Zigbee、Matter、Wi-Fi、蜂窝 IoT
- **网络与云**：IPv6、UDP/TCP、MQTT、CoAP、LwM2M
- **安全**：mbedTLS、MCUboot、TF-M（Trusted Firmware-M）可选集成

## 核心概念

理解 NCS 等于理解四层栈：**West 元构建 → Zephyr 内核与驱动 → Nordic 无线专有层 → 应用 / 协议样本**。

### 1. Zephyr RTOS — 地基

NCS 以 [[zephyr]] 为操作系统底座，继承其四件套：

- **Kernel**：抢占式调度、线程、同步原语、低功耗 tickless
- **Kconfig**（`prj.conf`）：编译期功能开关，如 `CONFIG_BT=y`
- **Devicetree**（`.dts` / `.overlay`）：引脚、时钟、外设拓扑
- **west**：按 `west.yml` manifest 拉取 Zephyr + HAL + OpenThread + Matter 等子模块

在 NCS 里执行 `west build -b <board> <app>` 时，CMake 先解析 devicetree，再按 Kconfig 裁剪协议栈，最后链接 Nordic 提供的控制器库。与纯 Zephyr 的差异在于：板级支持包（BSP）和无线控制器由 Nordic 维护并随 NCS 版本锁定测试矩阵。

### 2. BLE（Bluetooth Low Energy）— 近场对话

BLE 在 NCS 中采用经典 **Host + Controller** 分层：

```
应用（GATT 服务 / Nordic UART Service）
  ↓
Zephyr Bluetooth Host（L2CAP / ATT / GAP / GATT）
  ↓
HCI 分界线
  ↓
Controller：SoftDevice Controller（默认）或 Zephyr Controller（社区级）
  ↓
2.4 GHz 射频硬件
```

**SoftDevice Controller** 是 Nordic 从商业 SoftDevice 演进的开源控制器实现，量产项目默认选项，支持 LLPM（低延迟分包）、LE Audio 等 Nordic 强化特性。**Zephyr Controller** 可替换用于实验，但 Nordic 不为其提供量产支持。

典型开发路径：从 `samples/bluetooth/peripheral_uart` 或 `peripheral_hr` 入手，用 `prj.conf` 打开 `CONFIG_BT_PERIPHERAL`，用 nRF Connect for Mobile 连上验证。

### 3. Thread — 低功耗 IPv6 Mesh

Thread 在 NCS 里由 **OpenThread**（见 [[openthread]]）+ Nordic 802.15.4 射频驱动 + Zephyr 网络层拼成。设备获得可路由 IPv6 地址，可在 mesh 内多跳通信，经 Border Router 接入家庭宽带。

关键角色：

- **Router**：常供电、转发包（智能插座、灯泡）
- **Sleepy End Device（SED）**：电池设备，周期性醒来 polling
- **Leader**：分区自动选举的管理节点，无单点硬件依赖

NCS 样本路径如 `samples/net/openthread/cli`，配合 nRF52840 DK 或 nRF5340 DK 可快速 form/join 网络。Nordic 是 Thread 1.4 认证的主要贡献者，客户产品可继承相关认证徽章。

### 4. Matter — 跨生态智能家居应用层

Matter 由 CSA（Connectivity Standards Alliance）制定，目标是让 Apple Home、Google Home、Amazon Alexa 等设备**互操作同一套应用数据模型**。在 NCS 上的协议分工：

| 阶段 | 协议 | 作用 |
| --- | --- | --- |
| 配网（Commissioning） | Bluetooth LE（可选 NFC / QR） | 手机把 Wi-Fi/Thread 凭证交给新设备 |
| 日常通信 | Thread 或 Wi-Fi | 低功耗传感器走 Thread，高带宽走 Wi-Fi |
| 应用语义 | Matter Cluster | 统一「开关」「亮度」「门锁」数据模型 |

NCS 通过专用 Matter fork 以 Zephyr module 引入；Matter 栈用 GN 构建成库，再与 CMake 构建的 Zephyr 应用链接。平台适配层实现 `BLE Manager`、`Thread Stack Manager` 等抽象接口，应用代码可保持生态无关。

**多协议同芯片**：Matter over Thread 典型拓扑是 **BLE 配网 + Thread 跑业务**。nRF5340 / nRF52840 上靠 **MPSL** 在单天线时间片上交替调度 BLE 与 802.15.4，避免两套固件抢射频。

### 5. West Manifest 与仓库结构

`sdk-nrf` 仓库本身是 **west manifest 根**：

- `nrf/`：Nordic 子系统、库、应用、文档
- `zephyr/`、`modules/`：由 `west update` 拉取的依赖
- `west.yml`：锁定各 module 版本，保证可复现构建

版本号如 **NCS v3.2.x** 对应 Matter 1.5、Thread 1.4 等上游协议版本；升级 SDK 前务必查 Release Notes 里的协议兼容性表。

### 6. 构建与配置工具链

| 工具 | 用途 |
| --- | --- |
| `west` | 仓库管理、`west build` / `west flash` / `west debug` |
| `nrfutil` / `nrfjprog` | 烧录、UICR 配置 |
| nRF Connect for VS Code | 扩展包集成 Toolchain Manager、Kconfig、Devicetree 编辑器 |
| `twister` | Zephyr 测试框架，NCS CI 用于回归 |
| `sysbuild` | 多镜像构建（如 nRF5340 应用核 + 网络核） |

## 使用场景

### 场景 1：可穿戴心率监测（BLE Peripheral）

**需求**：nRF52833 手环，BLE 广播心率与步数，手机 App 连接，续航 7 天。

**为何选 NCS**：

- SoftDevice Controller 功耗曲线经大量产品验证
- `samples/bluetooth/peripheral_hr` 可直接 fork
- Zephyr 电源管理（`CONFIG_PM`）+ 外设 devicetree 描述传感器 I2C

**关键配置片段**（`prj.conf`）：

```ini
CONFIG_BT=y
CONFIG_BT_PERIPHERAL=y
CONFIG_BT_DEVICE_NAME="HeartRateBand"
CONFIG_PM=y
CONFIG_PM_DEVICE=y
```

**流程概要**：`west build -b nrf52833dk/nrf52833 app` → `west flash` → nRF Connect for Mobile 查看 GATT Heart Rate Service。量产前走 QDID 相关认证路径时，保持默认 SoftDevice Controller 不切换 Zephyr Controller。

### 场景 2：Matter over Thread 智能灯泡（多协议量产）

**需求**：nRF5340 灯泡，支持 Apple Home / Google Home 配网，Thread mesh 内可控，固件 OTA。

**为何选 NCS**：

- 官方 `matter/light_switch` / `matter/lock` 样本展示完整配网 + Cluster 实现
- MPSL 协调网络核上 BLE 与 802.15.4 并发
- MCUboot + SMP 提供签名 OTA 通道
- Matter 多 Fabric 支持，同一设备可加入多个家庭生态

**架构要点**：

```
应用核（Cortex-M33）：Matter 应用 + OpenThread + BLE Host
网络核（可选）：SoftDevice Controller + 802.15.4 驱动
配网阶段：手机经 BLE 把 Thread 数据集写入设备
运行阶段：设备作为 Thread Router 或 SED，Matter Cluster 控制继电器
```

**开发入口**：`west build -b nrf5340dk/nrf5340/cpuapp samples/matter/light_switch`。调试配网失败时，先查 BLE 广播是否可见，再查 Thread dataset active 状态（`ot-ctl` / UART log）。

### 场景 3：资产追踪器（蜂窝 LTE-M + GNSS）

**需求**：nRF9160 SiP，仓库冷链箱定位，每天上报温湿度 + GPS，电池 2 年。

**为何选 NCS**：

- 集成 LTE-M/NB-IoT 调制解调器栈与 PSM/eDRX 省电模式
- `samples/cellular/` 覆盖 MQTT、CoAP、HTTP 上云
- 同一 SDK 团队若另有 BLE 网关，代码风格与 west 流程一致

此场景不强调 Matter/Thread，但体现 NCS 作为 **Nordic 全系列统一 SDK** 的广度——不是只会 BLE。

## 从零上手：推荐路径

### 环境准备（macOS / Linux / Windows）

1. 安装 **nRF Connect for Desktop** → Toolchain Manager → 选择 NCS 版本（如 v3.2.x）一键装 toolchain
2. 或手动：`west init -m https://github.com/nrfconnect/sdk-nrf --mr v3.2.x` 后 `west update`
3. VS Code 安装 **nRF Connect for VS Code** 扩展，绑定 SDK 路径

### 第一个程序：Hello + BLE 广播

```bash
cd nrfconnect-sdk   # west workspace 根
west build -b nrf52840dk/nrf52840 zephyr/samples/basic/bluetooth_ibeacon
west flash
```

手机 nRF Connect 扫描到 iBeacon 报文，即验证 **工具链 + 控制器 + 射频** 全链路正常。

### 学习顺序建议

1. **Zephyr 四件套**：读懂 `prj.conf`、板级 `.overlay`、`west build` 日志
2. **BLE GATT 服务**：peripheral_uart → 自定义 UUID
3. **OpenThread CLI**：form/join/ping，理解 Router / SED
4. **Matter 样本**：在官方 light_switch 上改 Cluster 属性
5. **安全与 OTA**：MCUboot、签名密钥、多镜像 sysbuild

预计有 C 语言与基础嵌入式经验者，从 Hello 到改 Matter 样本约 **4–8 周业余学习**；无 RTOS 经验者应先读完 [[zephyr]] 笔记中的 Kconfig/devicetree 章节。

## 与相关技术的关系

| 技术 | 关系 |
| --- | --- |
| [[zephyr]] | NCS 的 OS 底座；纯 Zephyr 不含 SoftDevice Controller / MPSL |
| [[openthread]] | Thread 协议实现，由 NCS 以 module 集成并配 Nordic 射频驱动 |
| nRF5 SDK | 老一代裸机/轻量 SDK，无 Zephyr；新无线项目优先 NCS |
| Arduino nRF52 | 面向原型，底层仍可追溯到 Nordic 栈，但不适合 Matter 量产 |
| ESP-IDF | 竞品生态（Wi-Fi + BLE），Matter 路径不同；NCS 强项在超低功耗 BLE + Thread |

## 踩坑备忘

1. **没跑 `west update`**：克隆后直接 build 报缺 `hal_nordic`、`openthread` 等 module——首次和换分支后都要更新。
2. **BLE 和 Thread 同时开射频冲突**：未启用 MPSL 或错误 pinmux 会导致配网超时；Matter 样本默认已配，自建项目要对照 `nrf5340dk` 参考设计。
3. **错用 Zephyr BLE Controller 上量产**：`bt-ll-sw-split` snippet 仅适合实验；认证产品保持 SoftDevice Controller。
4. **Devicetree 与 Kconfig 混用**：使能某驱动 → Kconfig；引脚/频率 → devicetree overlay。搞反了会遇「配置开了但硬件没接上」的灵异 bug。
5. **Matter 版本与 NCS 版本绑定**：升级 NCS 大版本前查 Matter Release Notes，Cluster 变更可能导致手机生态 App 认不出旧固件。
6. **nRF5340 双核镜像**：应用核与网络核需 sysbuild 分别编译合并，只烧应用核会导致 BLE 控制器缺失。

## 资源

- 官方文档：https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/index.html
- 主仓库：https://github.com/nrfconnect/sdk-nrf
- Nordic DevZone：论坛搜 NCS 标签，配网/认证类问题响应快
- 工具：nRF Connect for Desktop / Mobile / VS Code
- 相关笔记：[[zephyr]]、[[openthread]]

## 小结

**sdk-nrf（nRF Connect SDK）** 是 Nordic 为 nRF 无线芯片打造的 Zephyr 发行版：用 west 统一管理依赖，用 SoftDevice Controller 和 MPSL 解决 BLE/Thread 量产与多协议共存，用官方 Matter 集成打通智能家居生态。零基础应先跑通 BLE 样本理解构建链，再进入 Thread 与 Matter——切忌跳过 Zephyr 的 Kconfig/devicetree 基本功直接改 Cluster。掌握 NCS，等于掌握在 Nordic 硬件上做**可认证低功耗无线产品**的完整地图。
