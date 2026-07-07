---
title: LoRaMac-node — LoRaWAN 终端协议栈参考实现
来源: 'https://github.com/Lora-net/LoRaMac-node'
日期: 2026-07-07
分类: embedded
难度: 中级
---

## 是什么

LoRaMac-node 是一套 **LoRaWAN 终端设备协议栈参考实现**：它把传感器节点加入网络、按地区限速、加密、收发窗口、Class A/B/C 行为这些底层规则，用 C 代码整理成可移植工程。

日常类比：如果 LoRa 射频芯片像一部只能发短信的对讲机，LoRaMac-node 就像对讲机旁边的值班手册，告诉你什么时候能说、用哪个频道说、收到指令后该不该回话。

最小感觉长这样：

```bash
git clone https://github.com/lora-net/loramac-node.git loramac-node
cd loramac-node
git submodule update --init
cmake -DAPPLICATION="LoRaMac" -DSUB_PROJECT="periodic-uplink-lpp" ..
```

它不是云平台，也不是网关程序；它主要跑在 MCU 上，帮一个终端节点遵守 LoRaWAN MAC 层规则。

## 为什么重要

不理解 LoRaMac-node，下面这些事会很难解释：

- 为什么 LoRaWAN 终端不是"想发就发"，而要受区域参数、占空比、重传和接收窗口约束。
- 为什么同一块板子在 EU868、US915、AS923 下配置差很多，MAC 层要按地区切不同信道计划。
- 为什么 Class A/B/C 不是三个应用模式，而是三套"终端什么时候打开接收窗口"的省电策略。
- 为什么量产设备要认真处理 DevEUI、JoinEUI、AppKey、NwkKey，密钥写错会表现成"永远 join 不上"。

## 核心要点

1. **MAC 层是交通规则**。类比：射频芯片只管把声音喊出去，MAC 层管红绿灯、车道、限速和回执。LoRaMac-node 把 Join、上行、下行、ADR、Duty Cycle、MAC Command 都收进同一个状态机。

2. **区域参数是本地法规**。类比：同一辆车到不同国家要按当地车道和限速开。项目支持 EU868、US915、AS923、CN470、KR920、IN865 等区域，编译时只打开需要的区域能省 Flash。

3. **参考实现的价值在可对照**。类比：学做菜时先看标准菜谱，再改成自家口味。LoRaMac-node 给出 Class A/B/C、FUOTA、认证协议、常见开发板和射频模块的组合样例，让芯片厂和产品团队有共同起点。

## 实践案例

### 案例 1：周期性上报 Cayenne LPP 数据

README 给出的主例子是 `LoRaMac/periodic-uplink-lpp`，用 NucleoL476 + LR1110 shield 做周期性上报：

```bash
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="../cmake/toolchain-arm-none-eabi.cmake" \
  -DAPPLICATION="LoRaMac" \
  -DSUB_PROJECT="periodic-uplink-lpp" \
  -DCLASSB_ENABLED="ON" \
  -DACTIVE_REGION="LORAMAC_REGION_EU868" \
  -DBOARD="NucleoL476" \
  -DMBED_RADIO_SHIELD="LR1110MB1XXS" \
  -DSECURE_ELEMENT="LR1110_SE" \
  -DSECURE_ELEMENT_PRE_PROVISIONED="ON" ..
make
```

逐部分解释：

- `APPLICATION="LoRaMac"` 说明这次不是裸射频测试，而是跑 LoRaWAN MAC 栈。
- `SUB_PROJECT="periodic-uplink-lpp"` 选择周期性上报样例，适合温湿度、表计、状态量这类小数据。
- `ACTIVE_REGION` 决定初始化哪套区域规则；地区选错，设备可能能发包但网关不认。
- `SECURE_ELEMENT` 决定密钥从哪里来：软件模拟、LR1110 crypto engine，或 ATECC608A/B。

### 案例 2：先用 ping-pong 验证射频链路

另一个官方样例是 `ping-pong`，它不先碰 LoRaWAN 网络，先验证两块板之间 LoRa 调制收发是否正常：

```bash
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="../cmake/toolchain-arm-none-eabi.cmake" \
  -DAPPLICATION="ping-pong" \
  -DMODULATION="LORA" \
  -DREGION_EU868="ON" \
  -DBOARD="NucleoL476" \
  -DMBED_RADIO_SHIELD="LR1110MB1XXS" \
  -DUSE_RADIO_DEBUG="ON" ..
make
```

逐部分解释：

- `APPLICATION="ping-pong"` 绕开 Join Server 和网络服务器，专心测板子、天线、射频路径。
- `MODULATION="LORA"` 表示用 LoRa 调制；同一例子也可用于 FSK 测试。
- `USE_RADIO_DEBUG` 让调试引脚暴露射频状态，示波器或逻辑分析仪能看到收发节奏。
- 这个案例常用于排除"硬件没焊好"和"协议配置错"之间的边界。

### 案例 3：给设备写入身份和密钥

README 说明 `soft-se` 会从 `src/peripherals/soft-se/se-identity.h` 读取设备身份和 AES128 key；真实项目要替换默认值：

```c
#define STATIC_DEVICE_EUI 1
#define LORAWAN_DEVICE_EUI { 0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF }
#define LORAWAN_JOIN_EUI   { 0x10, 0x32, 0x54, 0x76, 0x98, 0xBA, 0xDC, 0xFE }

{ .KeyID = APP_KEY,
  .KeyValue = { 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
                0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF } }
```

逐部分解释：

- `DevEUI` 像设备身份证，`JoinEUI` 像要找的入网服务入口。
- `APP_KEY` / `NWK_KEY` 是根密钥，Join 成功后再派生会话密钥。
- 代码里的字节只是示例占位，不能把公开示例密钥烧进量产设备。
- LR1110 预置安全元件和 ATECC608A/B 的流程不同，不一定允许你直接改这份头文件。

## 踩过的坑

1. **把 LoRa 和 LoRaWAN 混成一件事**：LoRa 是调制方式，LoRaWAN 是网络协议；`ping-pong` 能通不代表 LoRaWAN Join 一定能通。
2. **区域开关选错**：EU868 固件拿去 US915 网络跑，信道和数据率计划不匹配，表现像"偶尔能听见但永远不稳定"。
3. **忘记初始化 submodule**：仓库含子模块，少了 `git submodule update --init` 会在构建或链接阶段缺文件。
4. **忽略维护模式提醒**：项目 README 已说明 LoRaMac-node 进入维护模式，新设计应优先评估 LoRa Basics Modem。

## 适用 vs 不适用场景

**适用**：

- 做 LoRaWAN 终端节点，想学习或对照 MAC 层状态机、区域参数和 Class A/B/C 行为。
- 芯片厂、模组厂、硬件团队需要参考实现来移植到自家 MCU / radio 组合。
- 认证、FUOTA、周期上报、点对点射频测试这些官方样例能覆盖的开发验证。
- 需要读一套成熟 C 代码，理解窄带、低功耗、长距离设备如何组织协议栈。

**不适用**：

- 新产品从零选型且希望跟随未来 LoRaWAN 特性，官方更推荐 LoRa Basics Modem。
- 只想做私有 LoRa 点对点遥控，不需要 Join、区域参数、网络服务器和密钥体系。
- 想在 Linux 网关或云端跑服务端逻辑；LoRaMac-node 面向终端，不是 Network Server。
- 团队没有嵌入式 C、CMake、交叉编译、烧录调试经验，只想要高层 Python/Arduino 快速 Demo。

## 历史小故事（可跳过）

- **2013 年前后**：Semtech / Stackforce 体系开始把 LoRaWAN 终端栈整理成可公开参考的 C 工程。
- **2018-2020 年**：项目持续补齐 Class B/C、FUOTA、认证协议和多种 secure element，社区用它做移植和对照。
- **2022 年**：v4.7.0 基于 LoRaWAN 1.0.4、1.1.0 + FCntDwn ERRATA 和 Regional Parameters RP2-1.0.3 发布。
- **2023 年后**：官方文档把 LoRaMac-node 标为维护模式，新增特性转向 LoRa Basics Modem。
- **现在**：仓库约 2k stars，仍是理解 LoRaWAN 终端 MAC 层和历史设备代码的重要入口。

## 学到什么

1. **低功耗广域网不是"把包发远一点"这么简单**，真正难点在时隙、地区法规、密钥、重传和省电窗口。
2. **参考实现适合学习边界**：从 `ping-pong` 到 `periodic-uplink-lpp`，能一步步区分硬件问题、射频问题和协议问题。
3. **嵌入式项目的配置就是架构**：`APPLICATION`、`ACTIVE_REGION`、`SECURE_ELEMENT`、`BOARD` 共同决定最终固件的能力。
4. **维护模式也是重要信息**：老项目仍值得读，但新产品选型要看官方推荐和未来协议路线。

## 延伸阅读

- GitHub 仓库：[Lora-net/LoRaMac-node](https://github.com/Lora-net/LoRaMac-node)
- 官方 API 文档：[LoRaMac-node Doxygen Documentation](https://stackforce.github.io/LoRaMac-doc/)
- 开发环境文档：[development-environment.md](https://github.com/Lora-net/LoRaMac-node/blob/master/doc/development-environment.md)
- 相关替代方向：[LoRa Basics Modem](https://github.com/Lora-net/SWL2001)
- [[mqtt-s-2008]] —— 低功耗传感网络上层消息协议，可和 LoRaWAN 底层网络配合理解。
- [[openthread]] —— 另一类低功耗无线协议栈，对照 LoRaWAN 的星型长距离模型。

## 关联

- [[mqtt-s-2008]] —— LoRaWAN 常承载极小 IoT 消息，MQTT-SN 解释上层消息为什么要省字节。
- [[openthread]] —— 同属低功耗无线，但 Thread 是短距离 mesh，LoRaWAN 是长距离星型网络。
- [[lwip]] —— 都是嵌入式协议栈，lwIP 面向 TCP/IP，LoRaMac-node 面向 LoRaWAN MAC。
- [[mbedtls]] —— LoRaWAN 也依赖加密密钥管理，和嵌入式 TLS 共享"安全材料不能乱放"的工程约束。
- [[zephyr]] —— 现代 RTOS 常集成无线协议栈，适合对照构建系统和板级移植方式。
- [[embedded-hal]] —— 从 Rust 生态看硬件抽象；LoRaMac-node 则是 C 生态里手写 board/radio porting。
- [[metcalfe-boggs-1976]] —— 理解 MAC 层共享信道后，再看 LoRaWAN 的占空比和收发窗口更直观。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

