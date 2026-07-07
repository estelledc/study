---
title: Nordic Connect SDK — Nordic nRF 全家桶物联网 SDK
来源: 'https://github.com/nrfconnect/sdk-nrf + https://nrfconnectdocs.nordicsemi.com/ncs/latest/nrf/index.html'
日期: 2026-07-07
分类: embedded
难度: 中级
---

## 是什么

Nordic Connect SDK，官方更常写作 **nRF Connect SDK（NCS）**，是 Nordic 给 nRF52、nRF53、nRF54、nRF70、nRF91 这些无线芯片准备的一整套开发包。

日常类比：买厨房电器时，单买锅只能炒菜；买“全家桶”会同时给你锅、刀、菜谱、燃气接口和售后。NCS 就是嵌入式开发里的全家桶：Zephyr RTOS 是灶台，west 是采购清单，Kconfig 是开关表，Devicetree 是家里水电图，samples 是菜谱。

最小命令长这样：

```bash
west init -m https://github.com/nrfconnect/sdk-nrf --mr v3.4.0 ncs
cd ncs
west update
west build -b nrf52840dk/nrf52840 nrf/samples/bluetooth/peripheral_uart
```

这几行不是“下载一个库”，而是在拉一个 west 工作区：`nrf` 是 manifest 仓库，旁边还会有 `zephyr`、`modules`、`nrfxlib`、`bootloader` 等目录。

一句话记住：NCS 是 Nordic 把 Zephyr、BLE、Thread、Matter、蜂窝 IoT、bootloader、安全库和样例工程绑在一起后的官方交付物，约 1.7k stars，主打“同一套工程方法覆盖整条 nRF 产品线”。

## 为什么重要

不理解 NCS，下面这些事会很难解释：

- 为什么 Nordic 新项目不再从旧 nRF5 SDK 起步，而是从 Zephyr 的 `west build`、`prj.conf`、`.overlay` 起步。
- 为什么同一块 nRF52840 可以今天跑 BLE UART，明天跑 Thread CLI，后天又变成 Matter 灯泡。
- 为什么 nRF5340 这种双核芯片要分 `cpuapp` 和网络核，构建时还会出现 sysbuild、IPC radio、TF-M。
- 为什么 nRF91 蜂窝板的代码看起来像 Zephyr 网络程序，但真正连网还依赖 Nordic modem library 和 SIM/运营商环境。

## 核心要点

1. **NCS 不是单个库，是 west 工作区**。类比：不是一本菜谱，而是一整个厨房仓库。`sdk-nrf` 仓库既放 Nordic 自己的 samples、subsys、drivers，也放 `west.yml`，用来锁定 Zephyr、MCUboot、Matter、nrfxlib 等依赖版本。

2. **Kconfig 管“要不要”，Devicetree 管“接哪里”**。类比：Kconfig 像菜单勾选“我要蓝牙、日志、FOTA”，Devicetree 像装修图写“按钮接 P0.11，串口接 USB CDC”。两者都在编译前生效，但职责完全不同。

3. **samples 是最好的入口**。类比：新手先照菜谱做一道菜，再改调料。NCS 的 BLE、Thread、Matter、cellular samples 通常已经写好 `prj.conf`、board overlay、测试步骤，真实产品常从复制 sample 开始。

4. **协议边界要先分清**。BLE 是近距离连接；Thread 是低功耗 IPv6 mesh；Matter 是设备互通应用层；蜂窝 IoT 是 nRF91 通过 LTE-M/NB-IoT 出公网。它们会组合，但不是同一层东西。

## 实践案例

### 案例 1：BLE 串口桥，手机和开发板互发文字

```bash
cd ncs/nrf/samples/bluetooth/peripheral_uart
west build -b nrf52840dk/nrf52840 -p -- \
  -DEXTRA_CONF_FILE=prj_cdc.conf \
  -DDTC_OVERLAY_FILE=usb.overlay
west flash
```

关键 Kconfig：

```conf
CONFIG_BT=y
CONFIG_BT_NUS=y
CONFIG_UART_ASYNC_ADAPTER=y
```

关键 overlay：

```text
/ { chosen {
  zephyr,console = &cdc_acm_uart0;
  nordic,nus-uart = &cdc_acm_uart0;
}; };
```

逐部分解释：`peripheral_uart` 使用 Nordic UART Service，把 UART 数据搬到 BLE GATT；`prj_cdc.conf` 打开 USB CDC ACM；`usb.overlay` 把 NUS 的串口入口从物理 UART 换成 USB 虚拟串口。

### 案例 2：先跑 Thread CLI，再理解 Matter 灯泡

```bash
west build -b nrf52840dk/nrf52840 nrf/samples/openthread/cli -p -- \
  -DEXTRA_CONF_FILE=extra_conf/low_power.conf
west flash
```

Thread CLI 的核心配置：

```conf
CONFIG_OPENTHREAD=y
CONFIG_OPENTHREAD_SHELL=y
CONFIG_OPENTHREAD_NORDIC_LIBRARY_MASTER=y
```

串口里可以这样验证网络状态：

```text
uart:~$ ot state
leader
```

如果换成 Matter 灯泡，入口变成：

```bash
west build -b nrf52840dk/nrf52840 nrf/samples/matter/light_bulb
chip-tool onoff on 1 1
```

逐部分解释：Thread CLI 让你直接操作底层 mesh；Matter light bulb 在更上层定义“灯泡开关、亮度”这些设备语义。`chip-tool` 控制的是 Matter 节点，不是直接控制 802.15.4 radio。

### 案例 3：nRF91 蜂窝 FOTA，从服务器下载新固件

```conf
# app_update.conf
CONFIG_DOWNLOAD_HOST="firmware.example.com"
CONFIG_DOWNLOAD_FILE_V1="nrf91/app_update_v1.bin"
CONFIG_DOWNLOAD_FILE_V2="nrf91/app_update_v2.bin"
CONFIG_USE_HTTPS=y
```

```bash
west build -b nrf9160dk/nrf9160/ns \
  nrf/samples/cellular/http_update/application_update -p -- \
  -DEXTRA_CONF_FILE=app_update.conf
west flash
```

逐部分解释：`http_update` 用 `fota_download` 下载镜像，用 MCUboot 的 secondary slot 做升级；`nrf9160dk/nrf9160/ns` 表示应用跑在非安全世界，TF-M 负责安全边界；下载成功不等于立即生效，重启后 bootloader 才会切换镜像。

## 踩过的坑

1. **把 west 当 git 用**：只在某个子仓库 `git pull` 会破坏 manifest 一致性，原因是 NCS 依赖版本由 `west.yml` 统一锁定。

2. **Kconfig 和 overlay 写反**：把 `CONFIG_BT=y` 写进 `.overlay` 或把引脚号写进 `prj.conf` 都不会对，原因是软件功能和硬件事实由两套系统分别处理。

3. **nRF5340 忽略网络核**：BLE 或 802.15.4 跑不起来常不是应用代码错，而是网络核镜像、IPC radio 或 sysbuild 配置没跟上。

4. **Matter 当成 Thread 的替代品**：Matter 不是无线协议，原因是它位于应用层，底下仍要 Thread、Wi-Fi 或以太网承载。

## 适用 vs 不适用

**适用**：

- Nordic nRF52/nRF53/nRF54 做 BLE、Thread、Matter、低功耗传感器、键盘鼠标、智能家居设备。
- nRF91 做 LTE-M/NB-IoT 上云、FOTA、定位、远程传感器和工业网关子模块。
- 团队愿意接受 Zephyr 的 CMake、Kconfig、Devicetree、west 工作流，换来长期可维护。
- 产品需要 bootloader、DFU、安全存储、TF-M、协议栈这些“量产周边能力”。

**不适用**：

- 只想点灯、读一个 GPIO、做课堂演示，Arduino 或裸机 HAL 会更轻。
- 非 Nordic 芯片为主的产品线，直接用上游 Zephyr、ESP-IDF 或厂商 SDK 更自然。
- 极端硬实时或极小 ROM/RAM 场景，NCS 的协议栈和构建层会显得太重。
- 团队无法投入硬件 bring-up、射频认证、运营商测试，NCS 不能替你跳过这些现实流程。

## 边界：BLE / Thread / Matter / 蜂窝 IoT

BLE 的关键词是“近距离连接”：手机配网、传感器同步、鼠标键盘、NUS 串口桥都属于这一类。
Thread 的关键词是“低功耗 mesh”：它让灯泡、门锁、传感器用 802.15.4 组成 IPv6 小网络，常见实现是 OpenThread。
Matter 的关键词是“设备语义互通”：它关心灯泡怎么开关、门锁怎么上锁、温控器怎么暴露能力；它可以跑在 Thread 或 Wi-Fi 上。
蜂窝 IoT 的关键词是“出公网”：nRF91 通过 LTE-M/NB-IoT 连接基站，适合户外、物流、工业传感器，不适合拿来替代 BLE 配件。

所以选型时先问一句：我要的是手机旁边的低功耗连接、家里的 mesh、智能家居生态互通，还是无需网关的远程联网？

## 历史小故事（可跳过）

- **2016 年前后**：Zephyr Project 成立，Nordic 逐渐把新一代 SDK 方向押到 Zephyr 生态上。
- **2019 年**：nRF Connect SDK 早期版本公开，核心思路是用 west 管 Zephyr 和 Nordic 自有组件。
- **2020-2022 年**：Thread、Matter、TF-M、MCUboot、nRF91 cellular samples 持续进入 NCS，SDK 从 BLE 工具箱变成 IoT 平台。
- **2024 年以后**：nRF54、nRF70、nRF91 新硬件继续纳入同一套文档和构建模型。
- **2026 年**：GitHub release 已到 v3.x，仓库里能看到 applications、samples、drivers、subsys、sysbuild 等完整工程层次。

## 学到什么

1. **现代嵌入式 SDK 越来越像 Linux 发行版**：不是给你一个 zip，而是给一套 manifest、依赖、配置系统和样例生态。
2. **NCS 的学习主线是 Zephyr 四件套**：west 拉代码，CMake 编译，Kconfig 选功能，Devicetree 描硬件。
3. **协议栈要按层理解**：BLE、Thread、Matter、蜂窝 IoT 可以同场出现，但它们解决的问题不同。
4. **真实产品从 sample 到量产还有长路**：overlay、功耗、DFU、认证、日志、内存裁剪，都是 NCS 必须认真学的部分。

## 延伸阅读

- GitHub README：[nrfconnect/sdk-nrf](https://github.com/nrfconnect/sdk-nrf)
- 官方文档：[nRF Connect SDK latest docs](https://nrfconnectdocs.nordicsemi.com/ncs/latest/nrf/index.html)
- 官方介绍：[nRF Connect SDK product page](https://www.nordicsemi.com/Products/Development-software/nRF-Connect-SDK)
- BLE 样例：[Bluetooth Peripheral UART](https://nrfconnectdocs.nordicsemi.com/ncs/3.2.1/nrf/samples/bluetooth/peripheral_uart/README.html)
- Matter 架构：[Matter integration in nRF Connect SDK](https://nrfconnectdocs.nordicsemi.com/ncs/2.5.3/nrf/protocols/matter/overview/integration.html)
- 蜂窝样例：[HTTP application update README](https://github.com/nrfconnect/sdk-nrf/blob/main/samples/cellular/http_update/application_update/README.rst)

## 关联

- [[zephyr]] —— NCS 的底座 RTOS，Kconfig、Devicetree、west 都从这里来。
- [[openthread]] —— Thread 支持的核心开源协议栈，NCS samples 会直接用到。
- [[mbedtls]] —— 嵌入式 TLS 与安全能力的常见底层组件。
- [[freertos]] —— 对比理解：FreeRTOS 偏内核，NCS/Zephyr 更像完整发行版。
- [[embedded-hal]] —— Rust 嵌入式硬件抽象，对照看“硬件差异如何被抽象”。
- [[lwip]] —— 嵌入式 TCP/IP 栈，对照理解 Zephyr networking 和 cellular sample。
- [[mqtt-s-2008]] —— IoT 设备上云常见消息协议背景，适合和 nRF91 场景连起来看。

## 反向链接
<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
