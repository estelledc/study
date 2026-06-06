---
title: Zephyr — 一份代码树跑遍所有嵌入式芯片的开源 RTOS
来源: https://github.com/zephyrproject-rtos/zephyr
日期: 2026-06-01
子分类: 嵌入式
分类: 操作系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Zephyr 是 Linux Foundation 托管、Apache 2.0 授权的**开源实时操作系统**（RTOS）。日常类比：手机和服务器有 Linux 当通用底座，那些只有几十 KB 内存的小芯片（你家智能灯泡、蓝牙耳机、心率手环里那块）也想要一个通用底座——Zephyr 就是这个底座。

它的核心野心写在第一行 README 里：**一份代码树同时支持 8KB 内存的 MCU 到几 GB 的应用处理器**。具体覆盖：

- 架构层面：ARM Cortex-M / Cortex-A、RISC-V、Intel x86、Xtensa（ESP32）、ARC、MIPS、SPARC
- 板型层面：170+ 官方 BSP，从 Nordic nRF52、ST STM32、NXP i.MX RT 到 SiFive RISC-V
- 协议层面：完整 TCP/IP（v4/v6）、Bluetooth 5.0 LE（含 Mesh）、IEEE 802.15.4、Thread、CoAP / MQTT / LwM2M
- 治理层面：Linux Foundation 中立托管，会员含 Intel、NXP、Nordic、ADI、Antmicro

一句话：嵌入式世界的"Linux 候选人"，主攻 FreeRTOS 覆盖不到的"既要 RTOS 内核，也要现代构建系统 + 协议栈 + 安全认证"那一档。

## 为什么重要

不用 Zephyr 的嵌入式开发是什么样子：

- 每家芯片厂自带闭源 SDK，跨厂迁移基本等于重写
- 蓝牙栈、TCP/IP 栈各家协议自实现，安全漏洞修复看厂家心情
- 构建脚本一锅 Makefile，没有 package manager，HAL 靠手动 `git submodule`
- 想做 PSA 安全认证，得自己从零搭

Zephyr 的存在让这些事统一：

- **构建系统现代化**：CMake + Kconfig + devicetree + west，前两个直接复用 Linux 内核生态
- **驱动模型可移植**：写一次驱动，靠 devicetree 描述硬件差异，理论上换芯片只改 overlay
- **安全有正式认证**：拿到 PSA Certified Level 1，是少数能进汽车 / 医疗准入清单的开源 RTOS
- **LTS 版本长支持**：LTS3（v3.7.0）2024 年发布，承诺 2.5 年安全更新；季度滚动 release（v4.x）

简单说：FreeRTOS 给你一个内核，Zephyr 给你**整套发行版**。

## 核心要点

理解 Zephyr 等于理解四件套：

1. **Kernel**：抢占式 + 协作式双调度，支持 ticking 和 tickless 两种 timer 模式。线程、信号量、互斥锁、消息队列、工作队列这些 RTOS 标配都有。

2. **Kconfig**：从 Linux 内核搬来的"功能开关"。要不要带 BLE 协议栈？要不要 LittleFS？每个特性一个开关，编译时按需裁剪。配置文件叫 `prj.conf`。

3. **devicetree**：从 Linux 内核搬来的"硬件描述"。这块板子上 UART2 接到哪几个引脚、SPI1 时钟多少 MHz、I2C 上挂了什么传感器——全写在 `.dts` 文件里，编译时生成 C 头文件。**关键差异**：Kconfig 管"启不启用"，devicetree 管"硬件长什么样"。

4. **west**：Zephyr 的 meta build tool（用 Python 写的）。负责把主仓库 + 所有 modules（HAL / mbedTLS / TF-M）按一个 manifest 文件拉下来，再统一派发 `west build` / `west flash` / `west debug` 命令。

四件套底层是 CMake 在生成构建图。新人看到的"复杂"基本都来自这四层职责分工。

具体到一次完整构建会经历的步骤：

- `west update` 按 `west.yml` manifest 把所有 modules 拉到本地（首次几分钟，之后增量）
- `west build -b <board>` 触发 CMake，先解析 devicetree 生成 `devicetree_generated.h`，再按 Kconfig 决定哪些源文件参与编译
- 链接阶段把内核、驱动、协议栈、应用代码一起打成一个 ELF
- `west flash` 调用各家芯片的烧录工具（OpenOCD / J-Link / nrfjprog）下板

理解这条链路后，绝大多数"为什么我改了配置没生效"都能自己定位到具体环节。

## 实践案例

### 案例 1：BLE 心率广播 — 5 分钟跑通

Nordic nRF52840-DK 是 Zephyr 入门首选板。流程：

```bash
west init zephyrproject && cd zephyrproject
west update                              # 拉所有 modules
west build -b nrf52840dk/nrf52840 \
  zephyr/samples/bluetooth/peripheral_hr # 编译心率外设例子
west flash                               # 烧录
```

烧完后用手机装 nRF Connect App 连上去，能直接看到心率数据广播。整个过程**不写一行 C 代码**——例子里的 `prj.conf` 已经把 `CONFIG_BT=y` 这种 Kconfig 开关打好。

### 案例 2：自定义板子 BSP — 入门到进阶的分水岭

手头一块自己设计的 STM32 板子，想让它跑 `hello_world`。要写三份文件：

- `boards/myvendor/myboard/myboard.dts` — 板级 devicetree（哪个 UART 是 console、LED 接哪个 GPIO）
- `boards/myvendor/myboard/Kconfig.defconfig` — 板级默认 Kconfig
- `boards/myvendor/myboard/myboard_defconfig` — 必要的 CONFIG 开关

跨过这一步，才算真正"懂 Zephyr"——理解 devicetree binding、pinctrl、clock tree 怎么联动。

### 案例 3：Thread Mesh 网络节点

同一块 nRF52840 跑 `samples/net/openthread/coap_server`，能组建一个 802.15.4 + IPv6 over low-power 的 Thread mesh。对比同一块板子跑 BLE / Wi-Fi 的功耗和拓扑差异，是理解 IoT 协议栈的最好实验。

## 踩过的坑

1. **Kconfig 和 devicetree 职责不分**：新人常把"UART2 的引脚号"塞 Kconfig，或反过来把"启不启用 BLE"写 devicetree。build 报错信息基本看不懂。**铁律**：选不选某模块 → Kconfig；硬件长什么样 → devicetree。

2. **忘了跑 `west update`**：克隆完仓库直接 build 会找不到 `hal_nordic` 之类的 module。同步主分支后也要再跑一次 `west update`，否则可能编出不一致的 module 状态。

3. **devicetree overlay 静默失败**：overlay 语法松散，binding 不匹配只会让某个节点被静默忽略，编译还能通过，但你的 GPIO 死活点不亮。养成 build 后看 `build/zephyr/zephyr.dts`（preprocess 后的最终 devicetree）确认节点真的存在。

4. **stack overflow 难抓**：`CONFIG_HEAP_MEM_POOL_SIZE` / `CONFIG_MAIN_STACK_SIZE` / 各线程 stack size 各管一摊，BLE 和 TCP/IP 栈对栈深度敏感，跑着跑着 hang 住通常是 stack overflow。开 `CONFIG_STACK_SENTINEL=y` 能尽早抓到。

5. **west 和 git 的关系容易混**：west 不是 git 替代，是套在 git 外面的批量调度器。manifest 仓库本身用 git 管理，但你 `cd` 进 module 子目录跑 `git pull` 不会更新整个工作树状态——必须从顶层跑 `west update` 才能保持一致。

6. **样例代码版本飘移**：Zephyr 主分支节奏快，旧博客里的 `samples/` 路径或 Kconfig 名经常已经改了。看教程时一定确认它跑的是哪个版本（v3.7 LTS 还是 v4.x），用 git tag 切到对应版本再编。

## 适用 vs 不适用场景

**适用**：

- BLE / Thread / Matter 设备开发——协议栈现成，认证现成
- 需要跨芯片厂的产品线（同一份固件想跑 Nordic 和 ST）
- 需要正式安全认证（PSA L1、IEC 62304 医疗、ISO 26262 汽车）
- 多核异构 SoC（主核跑 Linux + 协核跑 Zephyr，AMP 模式）

**不适用**：

- 只想做最简单的"按键点灯"裸机程序——杀鸡用牛刀，Arduino / 厂商 HAL 更轻
- 硬实时要求极严（μs 级抖动）——上 RT-Thread / Threadx 或专用硬实时核
- 团队完全没碰过 Linux 内核 Kconfig / devicetree——学习曲线陡，需要前置知识
- 需要 GUI / 应用层框架——Zephyr 是底层 RTOS，不是 Android

## 历史小故事（可跳过）

- **2015 年**：Wind River 把内部商用 RTOS Rocket（VxWorks Microkernel Profile 的精简版）开源
- **2016 年**：Wind River 把代码捐给 Linux Foundation，Zephyr Project 成立。Wind River 自己继续卖 VxWorks 商业线，两条线并存
- **2017–2020 年**：Nordic、Intel、NXP 陆续把自家 HAL 上游到 Zephyr，BSP 数量从几十块涨到上百块
- **2024 年**：v3.7.0 LTS3 发布，PSA Certified Level 1 通过，进入汽车 / 医疗准入清单
- **当前（2026）**：v4.x 季度滚动，GitHub 15k+ stars、140k+ commits，是 FreeRTOS 之外最活跃的开源 RTOS

## 学到什么

1. **嵌入式世界正在 Linux 化**——构建系统、配置体系、设备描述都向 Linux 靠拢，Zephyr 是这个趋势最完整的载体
2. **Kconfig + devicetree 的二分**是现代硬件抽象的核心思想：什么能选 vs 什么是事实，分清楚才不混乱
3. **west 这种 meta build tool** 是当代复杂项目（Yocto / Bitbake / repo / west）的共同模式——多仓库 manifest + 命令派发
4. **开源 RTOS 终于有了"发行版"概念**——以前 RTOS 只给内核，Zephyr 给的是从 bootloader 到协议栈的完整 stack

## 延伸阅读

- 官方文档：[Zephyr Project Documentation](https://docs.zephyrproject.org/latest/)（入门首选 Getting Started Guide）
- BLE 实战：[Nordic Developer Academy — Bluetooth LE Fundamentals](https://academy.nordicsemi.com/)（用 Zephyr 教 BLE 的免费课程）
- 视频：[Zephyr Project YouTube](https://www.youtube.com/@zephyrproject)（每年 Zephyr Developer Summit 的演讲）
- 源码：[zephyrproject-rtos/zephyr](https://github.com/zephyrproject-rtos/zephyr)
- [[freertos]] —— Zephyr 之前的开源 RTOS 主流，对比理解差异
- [[nix]] —— 同样的"用 manifest 描述依赖"思想，Zephyr 的 west 是嵌入式版

## 关联

- [[freertos]] —— FreeRTOS 给内核，Zephyr 给整套发行版
- [[tcp]] —— Zephyr 内置 TCP/IP 栈，是嵌入式领域少有的完整实现
- [[tls-1.3]] —— Zephyr 通过 mbedTLS 提供，PSA 认证依赖它
- [[nix]] —— west manifest 和 Nix 一样在做"声明式依赖管理"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[buildroot]] —— Buildroot — 用 Make 给嵌入式板子烤一张完整 Linux 镜像
- [[embassy]] —— Embassy — 嵌入式 Rust 的 async/await 运行时
- [[freertos]] —— FreeRTOS-Kernel — KB 级 RAM 跑得动的可抢占多任务内核
- [[micropython]] —— MicroPython — 在 MCU 上跑 Python 3 的精简实现
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[nuttx]] —— Apache NuttX — POSIX 接近完整的小型实时操作系统
- [[platformio-core]] —— PlatformIO Core — 一套命令行，统管千块嵌入式开发板
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流

