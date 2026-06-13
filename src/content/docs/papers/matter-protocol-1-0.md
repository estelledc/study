---
title: Matter 1.0 — 智能家居设备的「通用语言 + 入职流程」
来源: https://csa-iot.org/all-solutions/matter/
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象你搬进一栋**智能公寓楼**，楼里住着苹果、谷歌、亚马逊、三星各派来的管家，每家以前只认自家门锁：

- 飞利浦灯泡只跟 Hue App 说话，宜家插座只认 HomeKit，用户手机里装了五六个 App，配网时要连不同的 Wi-Fi 热点、扫不同的二维码。
- **Matter** 想做的事，相当于给整栋楼发一套**统一的房卡系统 + 房间编号规则**：灯泡、门锁、传感器都讲同一种「业务语言」，配网流程也标准化；你仍然可以用 Siri、Google Home 或 Alexa 当管家，但设备端不必为每家各写一套私有协议。

技术上说：Matter 1.0 Core Specification（Connectivity Standards Alliance，2022 年 10 月发布）在 **IPv6 承载的 IP 网络**（Wi-Fi、Thread、以太网）上，定义了**数据模型、交互模型、安全与会话、配网（Commissioning）** 等完整栈。设备通过 CSA 认证后，可用 QR 码或手动配对码完成入网，并在多个生态的 **Fabric** 上同时工作。

官方入口：[Matter | CSA-IOT](https://csa-iot.org/all-solutions/matter/)  
规范全文（1.0）：[Matter 1.0 Core Specification PDF](https://csa-iot.org/wp-content/uploads/2022/11/22-27349-001_Matter-1.0-Core-Specification.pdf)

## 这篇文档在说什么

| 维度 | 内容 |
|------|------|
| 发布方 | Connectivity Standards Alliance（CSA），前身 Zigbee Alliance |
| 版本 | Matter 1.0（2022-10-04 认证启动）；后续有 1.1、1.2 等增量，1.0 是奠基版 |
| 承载网络 | IPv6 over Wi-Fi / Thread / Ethernet；跨网段经 Border Router |
| 开源实现 | [connectedhomeip](https://github.com/project-chip/connectedhomeip)（CHIP SDK） |
| 核心承诺 | 互操作、本地优先、基于证书的强身份、多管理员（多 Fabric） |
| 与 Zigbee 关系 | 应用层重新设计；集群概念继承自 Zigbee Cluster Library 思路，但协议栈完全不同 |

Matter **不是**又一个专有云 API。它规定的是设备与设备、控制器与设备之间**如何在局域网里安全地读写状态、发命令**；云端同步由各生态自行实现，但本地控制路径标准化。

## 为什么值得学

| 场景 | Matter 提供的价值 |
|------|-------------------|
| 做智能硬件固件 | 一套 SDK 覆盖多生态，减少「为 HomeKit 再 port 一遍」 |
| 做网关 / Hub | 明确 Commissioner、Bridge、Border Router 角色边界 |
| 做自动化 / 测试 | `chip-tool` 可脚本化配网与控制，适合 CI |
| 理解智能家居安全 | PASE / CASE、设备认证（Attestation）、Fabric 隔离 |
| 选型 Thread vs Wi-Fi | Matter 在链路层之上，Thread 常作低功耗设备的 L2 |

若你之前学过 Zigbee 的 Endpoint / Cluster，Matter 的 **Node → Endpoint → Cluster → Attribute/Command/Event** 层次会似曾相识；但传输、安全、发现机制已全部换成 **IP + TLS 类会话 + DNS-SD**。

## 核心概念一：协议栈分层

规范第 2 章把 Matter 设备从下到上拆成：

```
┌─────────────────────────────────────────┐
│  Application（灯亮灭、门锁逻辑等业务）      │
├─────────────────────────────────────────┤
│  Data Model（Endpoint / Cluster / 属性） │
├─────────────────────────────────────────┤
│  Interaction Model（Read/Write/Invoke/   │
│                        Subscribe）       │
├─────────────────────────────────────────┤
│  Action Framing + Security（消息帧、加密）  │
├─────────────────────────────────────────┤
│  Session Management（PASE / CASE 会话）   │
├─────────────────────────────────────────┤
│  Transport（TCP / UDP / BLE 等）         │
├─────────────────────────────────────────┤
│  Network（IPv6、Thread、Wi-Fi、Ethernet）  │
└─────────────────────────────────────────┘
```

日常类比：**网络层**是公寓楼里的邮政系统（信怎么送到房间）；**会话层**是房卡加密（PASE 像临时访客码，CASE 像正式门禁卡）；**数据模型**是房间里的开关、温湿度计各贴什么标签；**交互模型**是你「读温度」「按开关」「订阅门铃事件」的动作种类。

## 核心概念二：数据模型（Node / Endpoint / Cluster）

Matter 里每台物理设备至少是一个 **Node（节点）**。节点内部再拆：

| 概念 | 含义 | 类比 |
|------|------|------|
| **Node** | 网络中可寻址的一台 Matter 设备 | 公寓里的一户人家 |
| **Endpoint** | 节点上的功能实例；**Endpoint 0** 保留给工具类集群 | 一户里的「客厅灯」「卧室灯」 |
| **Cluster** | 一组属性、命令、事件的规范（如 On/Off、Level Control） | 每种电器的「操作面板」标准 |
| **Attribute** | 可读/可写的状态（如 `OnOff` 开或关） | 面板上的指示灯状态 |
| **Command** | 可调用的动作（如 `Toggle`） | 面板上的按钮 |
| **Event** | 带来时间戳的历史记录（如 `SwitchLatched`） | 门禁日志 |

每个节点**必须有 Endpoint 0（Root Node）**，上面挂 `Descriptor`、`Basic Information`、`General Commissioning` 等**工具集群**，用于描述设备能力与配网，而不是具体业务。

**Server Cluster** 提供属性/命令；**Client Cluster** 在另一端发起调用。同一 Cluster ID 在客户端与服务端成对出现——类似 gRPC 的 service 定义与 stub。

## 核心概念三：Fabric 与多生态共存

**Fabric** 是一组共享**同一信任根（Root CA）** 的 Matter 节点集合。日常类比：同一家公司发的工牌——Apple Home、Google Home 各自可以给你的灯泡发一张工牌（**多 Fabric**），灯泡同时属于多个「信任圈」，但每个圈里节点 ID 独立分配。

- **Fabric ID**：64 位，在 Root CA 范围内唯一；`Fabric ID 0` 保留不可用。
- **Node ID**：64 位，在 Fabric 内唯一标识节点。
- **NOC（Node Operational Certificate）**：配网时 Commissioner 签发，CASE 会话用它证明身份。
- **Operational Discovery**：入网后通过 DNS-SD 广播，实例名形如 `<FabricId>-<NodeId>.local`。

因此：**配网一次到苹果生态，并不等于锁死在苹果**——同一设备可被第二个 Commissioner 以「多管理员」流程加入 Google Fabric，规范第 12 章专门讲 Multiple Fabrics。

## 核心概念四：配网（Commissioning）全流程

配网 = 把 **Commissionee**（待入网设备）加入 Fabric 的完整仪式，由 **Commissioner**（手机 App、Hub、或 `chip-tool`）主导：

```
  发现设备          PASE 安全通道        证明是真货
 (BLE / SoftAP      (配对码/QR)         (Attestation)
  / DNS-SD)              │                    │
      └──────────────────┴────────────────────┘
                           │
              写入监管域、时间、网络凭证
              (General Commissioning /
               Network Commissioning Cluster)
                           │
              安装 NOC，加入 Fabric
              (Node Operational Credentials)
                           │
              设备连上 Wi-Fi / Thread
                           │
              CASE 建立运营会话
                           │
              CommissioningComplete
```

要点摘录（Matter 1.0 Core Spec §2.8、Chapter 5）：

1. **Device Discovery**：未入网设备用 BLE、Wi-Fi Soft AP 或 IP 上的 DNS-SD 宣告自己；用户从 **QR Code / Manual Pairing Code / NFC** 取得 **Passcode**（开箱贴纸上的 11 位码或 QR 里的 `MT:...` 载荷）。
2. **PASE（Passcode-Authenticated Session Establishment）**：用 Passcode 做 SPAKE2+ 密钥交换，在**配网信道**上加密后续消息；此时还没有 NOC。
3. **Device Attestation**：Commissioner 验证设备 DAC（Device Attestation Certificate）链，确认是 CSA 认证产品，防山寨设备混入 Fabric。
4. **Network Commissioning**：对 Wi-Fi/Thread 设备下发 SSID、密钥或 Thread 数据集；以太网设备可能跳过此步。
5. **Operational Credentials**：CA 签发 NOC，写入 Node ID；设备成为 Fabric 正式成员。
6. **CASE（Certificate Authenticated Session Establishment）**：运营阶段所有单播业务消息在 CASE 会话中加密；连接断开需重新 CASE。

**并发 vs 非并发配网**：部分设备配网时 BLE 与 Wi-Fi 可同时在线（并发）；另一些在连上运营网络后会断开 BLE 配网信道（非并发）——实现与芯片资源相关，规范均允许。

## 核心概念五：交互模型（Interaction Model）

节点之间建立加密会话后，通过四种**交互类型**操作对方的数据模型（Chapter 8）：

| 交互 | 作用 | 典型用途 |
|------|------|----------|
| **Read** | 读一个或多个属性/事件 | 查询灯是否亮 |
| **Write** | 写属性 | 设定目标亮度 |
| **Invoke** | 调用命令 | `Off`、`Toggle` |
| **Subscribe** | 订阅属性/事件变化 | 门磁状态推送 |

每次交互需指定 **Path**，形如：

```
<node> <endpoint> <cluster> <attribute | command | event>
```

也支持 **Group ID** 或通配符，一次操作多个端点——类似「广播给全屋所有灯」。

消息在链路上用 **TLV（Tag-Length-Value）** 编码，由 Action Framing 层打包；这与 JSON-RPC 类协议不同，偏向嵌入式紧凑二进制。

## 代码示例一：用 chip-tool 配网并控制 On/Off 灯

[connectedhomeip](https://github.com/project-chip/connectedhomeip) 自带的 **chip-tool** 是最常用的 Matter 控制器 CLI，适合开发调试。编译后（见官方 [First Example](https://project-chip.github.io/connectedhomeip-doc/getting_started/first_example.html)）：

**1. 用 QR 码配网（pairing 为 commissioning 旧称）**

```bash
# 0x12344321 = 分配给设备的 Node ID（测试常用默认值）
# MT:-24J0AFN00KA0648G00 = 示例 QR 载荷（默认 discriminator + passcode 的灯具）
./out/linux-x64-chip-tool/chip-tool pairing code 0x12344321 MT:-24J0AFN00KA0648G00
```

**2. 入网后读 OnOff 属性**

```bash
# 集群 onoff · 动作 read · 属性 on-off · Node ID · Endpoint 1
./out/linux-x64-chip-tool/chip-tool onoff read on-off 0x12344321 1
```

**3. 发命令开灯**

```bash
./out/linux-x64-chip-tool/chip-tool onoff on 0x12344321 1
```

**4. 订阅属性变化（长连接推送）**

```bash
./out/linux-x64-chip-tool/chip-tool onoff subscribe on-off 1 10 0x12344321 1
# 参数含义：min-interval=1s, max-interval=10s，超出则服务器主动上报
```

命令模式始终是：`chip-tool <cluster> <read|write|subscribe|command> ... <node-id> <endpoint-id>`。多 Fabric 场景可加 `--commissioner-name <name>` 指定用哪张「工牌」发令。

## 代码示例二：设备端声明 On/Off Server Cluster（C++ 片段）

固件侧（基于 Matter SDK 的 lighting-app 模式）要在某个 Endpoint 上挂载 **On/Off Server Cluster**，使控制器能 `Invoke` `Toggle`。逻辑上包含三步：定义 Endpoint 配置、注册 Cluster 回调、在属性变化时驱动硬件。

```cpp
// 简化示意：在 Endpoint 1 上启用 On/Off Server（ZAP 代码生成会产出大量样板）
#include <app-common/zap-generated/ids/Clusters.h>
#include <app-common/zap-generated/attributes/Accessors.h>

using namespace chip;
using namespace chip::app;
using namespace chip::app::Clusters::OnOff;

// 属性写入回调：控制器 chip-tool onoff on/off 会走到这里
Protocols::InteractionModel::Status emberAfOnOffClusterOnOffAttributeWriteCallback(
    EndpointId endpoint, AttributeId attributeId, uint8_t * value)
{
    if (attributeId != Attributes::OnOff::Id) {
        return Protocols::InteractionModel::Status::Failure;
    }
    bool on = *value;
    // 驱动真实 GPIO / PWM
    SetPhysicalLight(on);
    return Protocols::InteractionModel::Status::Success;
}

// 命令处理：chip-tool onoff toggle 触发
bool emberAfOnOffClusterToggleCallback(EndpointId endpoint)
{
    bool current;
    Attributes::OnOff::Get(endpoint, &current);
    Attributes::OnOff::Set(endpoint, !current);
    return true;
}
```

实际工程里，Endpoint 与 Cluster 列表多由 **ZAP（Zigbee Cluster Configurator）** 生成到 `zap-generated/`；开发者主要填 **Device Type**（如 `0x0100` On/Off Light）、厂商 ID、配网参数，并实现上述 Attribute/Command 回调。动态 Endpoint（如 Bridge 在运行时添加子设备）需调用 SDK 的 Dynamic Endpoint API，见 [bridge-app 示例](https://github.com/project-chip/connectedhomeip/tree/master/examples/bridge-app)。

## 配网载荷：QR 里到底编码了什么

Manual Pairing Code / QR Code 携带 **Onboarding Payload**（§5.1），解码后得到配网所需字段，例如：

| 字段 | 作用 |
|------|------|
| Version | 载荷格式版本 |
| Vendor ID / Product ID | 识别厂商与产品（可选出现在广播里） |
| Custom Flow | 是否需厂商自定义配网 UI |
| **Discriminator** | 12 位，区分同时待配的多个相同设备 |
| **Passcode** | PASE 用的共享秘密（27 位有效位） |
| Discovery Capabilities | 支持 BLE / Soft AP / On IP |

`chip-tool` 的 `pairing code` 子命令即解析 `MT:...` 字符串并自动走 BLE/IP 发现 + PASE。生产环境 Passcode 必须随机且每机唯一，防止邻居蹭网。

## 发现机制：Commissionable vs Operational

| 阶段 | 方式 | 何时用 |
|------|------|--------|
| **Commissionable Discovery** | BLE 广播、Wi-Fi Soft AP、有限 DNS-SD | 设备未入网，等待配网 |
| **Operational Discovery** | 运营网络 DNS-SD（mDNS 等） | 设备已入网，控制器找 `<Fabric>-<Node>.local` |

若设备**已属于另一个 Fabric** 且占用了 Wi-Fi/Thread，二次配网通常只能走 **On-Network Commissioning**（IP 上 DNS-SD），不能再开 Soft AP——这是多生态共存时的常见坑。

## 与 Thread、Wi-Fi、Bridge 的关系

```
        ┌─────────────── Matter 应用层 ───────────────┐
        │  Data Model / Interaction / Security       │
        └────────────────────┬────────────────────────┘
                             │ IPv6
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
      Wi-Fi STA          Thread 1.3        Ethernet
           │                 │
           └──────── Border Router ────────┘
                    （跨网段转发）
```

- **Thread** 设备通过 Border Router 获得与 Wi-Fi 上 Commissioner 的 IPv6 连通。
- **Bridge** 把 Zigbee/红外等非 Matter 设备映射为 Matter Endpoint，对外仍是一个 Node。
- **OTA**：`OTA Provider` / `OTA Requestor` 集群负责固件升级，与配网证书体系正交。

## 1.0 之后发生了什么（读笔记时的坐标系）

Matter 1.0 首发设备类型以灯、插座、门锁、传感器、窗帘、恒温器为主。后续版本增量扩展：**1.1** 改进配网与多管理员；**1.2** 增加机器人吸尘器等；规范以 CSA 发布为准，SDK 在 GitHub 上 `connectedhomeip` 主分支跟进。学 1.0 仍必要——**Fabric、PASE/CASE、Cluster 路径、Commissioning 状态机** 是后续版本的超集基础。

## 常见误区

| 误区 | 事实 |
|------|------|
| 「Matter = Wi-Fi」 | Matter 运行在 IPv6 上，Wi-Fi / Thread / Ethernet 均可 |
| 「配网完只能用一个 App」 | 多 Fabric 设计允许多个生态各管一张工牌 |
| 「Cluster = MQTT Topic」 | Cluster 是强类型 schema，含 Access 权限与 conformance 规则 |
| 「有开源 SDK 就不用认证」 | 上市销售仍需 CSA 认证与合法 VID/PID、DAC |
| 「CASE 一次建立永久有效」 | 连接断开后需重新建立 CASE 会话 |

## 进一步阅读

- [Matter 1.0 Core Specification（HTML 镜像）](https://leconiot.com/matter/1.0/index.html) — 全文检索友好
- [Google Home Matter Primer — Commissioning](https://developers.home.google.com/matter/primer/commissionable-and-operational-discovery)
- [Matter Handbook — Interaction Model](https://handbook.buildwithmatter.com/how-it-works/interaction-model/)
- [CHIP Tool 指南](https://project-chip.github.io/connectedhomeip-doc/development_controllers/chip-tool/chip_tool_guide.html)
- [connectedhomeip 示例索引](https://github.com/project-chip/connectedhomeip/tree/master/examples)

## 小结

Matter 1.0 的本质不是「又一个 App 协议」，而是：**在 IP 网络上用统一数据模型描述设备能力，用 PASE/CASE 解决身份，用标准 Commissioning 把设备拉进 Fabric**。日常类比是「全屋智能的通用工牌 + 房间编号 + 入职流程」；技术上则是 Endpoint/Cluster 数据模型、四种交互、以及 `chip-tool` 里一行 `onoff on` 背后整条协议栈。从零开始，先跑通 lighting-app + `chip-tool pairing code`，再读规范 Chapter 5（Commissioning）与 Chapter 7–8（Data Model / Interaction Model），比从 PDF 第 1 页硬啃高效得多。
