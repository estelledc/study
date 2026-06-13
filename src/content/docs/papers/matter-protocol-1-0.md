---
title: "Matter 1.0 — 智能家居设备的「通用语言 + 入职流程」"
来源: 'CSA (Connectivity Standards Alliance), "Matter 1.0 Core Specification", 2022'
日期: 2026-06-13
分类: 操作系统
子分类: 嵌入式与 IoT
难度: 中级
provenance: pipeline-v3
---

## 是什么

Matter 1.0 是一套**让智能家居设备跨品牌互通的应用层标准**，由 CSA（Connectivity Standards Alliance）于 2022 年 10 月发布。日常类比：给一栋智能公寓楼发一套统一的房卡系统和房间编号规则——灯泡、门锁、传感器都讲同一种"业务语言"，你扫一下设备上的 QR 码，它就自动完成安全的"入职手续"（配网）。之后不管用 Siri、Google Assistant 还是 Alexa，都能控制它。

技术上，Matter 是跑在 IPv6（Wi-Fi、Thread、以太网）之上的应用层协议。它不依赖云——局域网内设备可以直接通信。定义了数据模型（Endpoint/Cluster）、交互模型（Read/Write/Invoke/Subscribe）、安全会话（PASE/CASE）和标准配网流程。开源 SDK 在 GitHub 上维护（project-chip/connectedhomeip），Apache 2.0 许可证。

最核心的特色是 **Multi-Admin（多管理员）**：一台设备可以同时被 Apple Home 和 Google Home 控制，不需要"二选一"。这是 Matter 区别于所有前辈智能家居协议的根本差异。

## 为什么重要

不理解 Matter，下面这些事都没法解释：

- 为什么同一个智能灯泡可以同时被 Apple Home 和 Google Home 控制——Matter 的多 Fabric 机制让一台设备同时属于多个信任圈
- 为什么嵌入式固件开发者只需写一套代码就能覆盖 Apple/Google/Amazon 三个生态——Matter 统一了应用层，控制器侧的差异由各生态自己消化
- 为什么 BLE 只在初次配网时使用，日常通信走 Wi-Fi/Thread——BLE 只是"入职通道"，不是运营通道，配完网就断开
- 为什么 Thread 设备需要一个 Border Router 才能和 Wi-Fi 上的手机 App 通信——Thread 是独立的低功耗 IPv6 mesh 网络，不直接连接 Wi-Fi 路由器

## 核心要点

Matter 的设计可以拆成三层来理解：

1. **数据模型——给每个功能贴上统一标签**：设备内部按 Node（节点）→ Endpoint（功能实例）→ Cluster（功能规范）→ Attribute/Command/Event 组织。类比：公寓楼里每间房（Endpoint）的开关面板上贴了统一标签名（Cluster），标签上写了可读状态（Attribute）和可操作按钮（Command）。Endpoint 0 是每台设备的"身份证口袋"，里面放了设备信息、配网状态等工具集群，不负责具体业务。

2. **配网流程——一套标准化的"入职手续"**：新设备通过 BLE 广播宣告自己，用户扫码拿配对码，Commissioner（手机 App 或 Hub）通过 PASE（Passcode-Authenticated Session Establishment）建立加密通道，验证设备认证证书（DAC），下发 Wi-Fi/Thread 网络凭证。入网后设备拿到 NOC（节点运营证书），成为 Fabric 正式成员。之后所有业务通信在 CASE（Certificate Authenticated Session Establishment）会话中加密进行。类比：PASE 像临时访客码（只用于入职），CASE 像正式门禁卡（日常进出用）。

3. **多 Fabric 共存——一张工牌不够，可以多张**：Fabric 是一组共享同一根证书的节点集合。Apple Home、Google Home 各自给灯泡发一张"工牌"（NOC），灯泡同时属于多个 Fabric。同一个灯泡，Siri 说"开灯"、Google Assistant 说"关灯"，都有效——这是 Multi-Admin，也是 Matter 对之前所有智能家居协议的降维打击。

## 实践案例

### 案例 1：用 chip-tool 从零配网并控制灯泡

CHIP Tool 是 Matter SDK 自带的命令行调试工具。假设你有一台 Matter 灯泡，包装上印了 QR 码：

```bash
# 1. 扫码配网（pairing 是 commissioning 的旧称）
# 0x12344321 = 分配给设备的 Node ID
# MT:... = QR 码载荷，包含 discriminator + passcode
./chip-tool pairing code 0x12344321 MT:-24J0AFN00KA0648G00

# 2. 读灯泡的开关状态
./chip-tool onoff read on-off 0x12344321 1

# 3. 开灯
./chip-tool onoff on 0x12344321 1

# 4. 订阅状态变化（长连接推送，门磁传感器最常用）
./chip-tool onoff subscribe on-off 1 10 0x12344321 1
```

命令模式始终是 `chip-tool <cluster> <动作> ... <node-id> <endpoint-id>`。即使零基础，三行命令就能完整跑通配网到控制——这就是统一协议的价值：不写 App 也能跟设备对话。

### 案例 2：设备端声明一个 On/Off 灯（C++ 固件片段）

固件侧要在某个 Endpoint 上挂载 On/Off Cluster，使控制器能发命令。核心是注册属性回调和命令处理函数：

```cpp
#include <app-common/zap-generated/ids/Clusters.h>
#include <app-common/zap-generated/attributes/Accessors.h>

using namespace chip::app::Clusters::OnOff;

// 控制器 chip-tool onoff on/off 最终调用这个回调
Protocols::InteractionModel::Status emberAfOnOffClusterOnOffAttributeWriteCallback(
    EndpointId endpoint, AttributeId attributeId, uint8_t * value)
{
    if (attributeId != Attributes::OnOff::Id) {
        return Protocols::InteractionModel::Status::Failure;
    }
    SetPhysicalLight(*value);  // 驱动真实 GPIO / PWM
    return Protocols::InteractionModel::Status::Success;
}

// chip-tool onoff toggle 触发
bool emberAfOnOffClusterToggleCallback(EndpointId endpoint)
{
    bool current;
    Attributes::OnOff::Get(endpoint, &current);
    Attributes::OnOff::Set(endpoint, !current);
    return true;
}
```

实际工程里，Endpoint 与 Cluster 列表由 ZAP（Zigbee Cluster Configurator）代码生成工具产出。开发者主要填 Device Type、厂商 ID、配网参数，并实现上述回调。

### 案例 3：QR 码里到底编码了什么

设备包装上的 QR 码不是普通 URL，它携带 **Onboarding Payload**——配网所需的所有种子信息：

| 字段 | 作用 |
|------|------|
| Version | 载荷格式版本 |
| Vendor ID / Product ID | 识别厂商与产品型号 |
| Discriminator | 12 位，区分同时待配的多个同型号设备 |
| Passcode | PASE 密钥交换的共享秘密（27 位有效位） |
| Discovery Capabilities | 标记支持 BLE / Soft AP / On IP 哪种发现方式 |

生产环境 Passcode 必须每台设备随机且唯一——如果所有设备共用同一个 Passcode，邻居扫到你家 QR 码就能把设备偷走。

## 踩过的坑

1. **平台 Matter 版本不同步**：设备标着"Matter 认证"，但三星 SmartThings 支持 1.5、Amazon Alexa 在 1.4、Google Home 仅约 1.2。某个生态认这个设备、另一个不认——和设备、配网都没关系，纯粹是控制器侧没升级。

2. **通过 Bridge 接入会丢功能**：把 Philips Hue 灯泡通过 Bridge 桥接进 Matter 后，Apple Adaptive Lighting 不工作。原因是 Matter 只定义"最小公分母"（开/关/调亮度），任何品牌特有高级功能仍锁在厂商私有 App 里。

3. **配网超时是常态**：多管理员加入第二个生态时经常报"Operation timed out"。根因可能是 IPv6 组播被路由器拦截、RF 干扰、或 Thread Border Router 之间互相不协作形成了隔离的 Thread 分区。

4. **电池设备功耗远高于 Zigbee**：Matter-over-Thread 的纽扣电池传感器续航约 18-24 个月，Zigbee 同类设备轻松 3 年。原因是 Matter 要维持多 Fabric 会话，IPv6 协议头开销更大，芯片"醒着"的时间更长。

## 适用 vs 不适用场景

**适用**：

- 做跨生态智能家居产品——一套固件覆盖 Apple Home / Google Home / Amazon Alexa / Samsung SmartThings
- 局域网内设备间直接通信——不依赖云，隐私敏感场景（门锁、传感器）
- 已有 Thread/Wi-Fi 基础设施的住宅——不需要额外布线或新增网关
- 需要多用户/多生态同时控制的场景——Multi-Admin 允许多个家庭成员用不同的语音助手控制同一台设备

**不适用**：

- 超低功耗纯电池场景（纽扣电池 + 需工作 5 年以上）→ Zigbee 或 BLE Mesh 更合适
- 需要大量数据带宽（如安防摄像头）→ Matter 1.5 才开始支持摄像头，且视频流仍需 Wi-Fi 直连
- 已有大量 Zigbee/Z-Wave 设备且不想更换 → 用 Bridge 做映射可行但功能会丢失
- 完全离线无 IP 网络的环境 → Matter 依赖 IPv6，需要至少局域网 IP 连通

## 历史小故事（可跳过）

- **2019 年 12 月**：CSA（当时还叫 Zigbee Alliance）联合 Apple、Google、Amazon 启动 Project CHIP（Connected Home over IP）。取名"CHIP"不是因为半导体芯片，而是"把家连上 IP"。

- **2021 年 5 月**：Project CHIP 更名为 Matter。官方说法是"物质——构建互联世界的基础元素"，但业内更直白的解读是：别再叫 CHIP 了，和芯片行业撞名太尴尬。

- **2022 年 10 月**：Matter 1.0 正式发布，280+ 成员公司加入，8 个授权测试实验室开张，开源 SDK 在 Apache 2.0 许可证下发布。首批设备类型：灯、插座、门锁、传感器、窗帘、恒温器、电视、Bridge。

- 此后版本节奏：1.1（bug 修复，2023.5）→ 1.2（扫地机器人、空气净化器，2023.10）→ 1.3（EV 充电桩，2024.4）→ 1.4（太阳能、电池，2024.11）→ 1.5（安防摄像头，2025 底）。

## 学到什么

1. **标准化协议的价值不在于技术有多炫，而在于"谁都认"**——Matter 的核心贡献不是发明了新加密算法或传输协议，而是让 280+ 家公司同意用同一套语言说话。这在消费电子行业极为罕见。

2. **多生态共存靠的不是"选一个"，而是"都加入"**——Multi-Admin 机制让设备同时属于 Apple 和 Google 的 Fabric。不是二选一，是我都要。

3. **配网（Commissioning）是一台 IoT 设备最危险的时刻**——Passcode 泄露、DAC 被篡改、网络凭证被截获，全部集中在从开箱到入网的那几分钟。Matter 用 PASE + Attestation + NOC 三道关卡把这个窗口尽可能收窄。

4. **协议好不等于体验好**——Matter 1.0 发布三年后碎片化依然存在。标准的文字是一回事，各厂商实现质量、更新节奏、功能取舍是另一回事。学协议时要区分"规范说了什么"和"市场发生了什么"。

## 延伸阅读

- 规范全文：[Matter 1.0 Core Specification (PDF)](https://csa-iot.org/wp-content/uploads/2022/11/22-27349-001_Matter-1.0-Core-Specification.pdf)
- 可搜索 HTML 版：[Matter 1.0 HTML 镜像](https://leconiot.com/matter/1.0/index.html) — 全文检索友好
- 开源 SDK：[project-chip/connectedhomeip](https://github.com/project-chip/connectedhomeip) — 所有示例代码的源头
- CHIP Tool 指南：[chip-tool 使用文档](https://project-chip.github.io/connectedhomeip-doc/development_controllers/chip-tool/chip_tool_guide.html)
- [[zigbee-vs-matter-thread-2026]] — Zigbee / Matter / Thread 三大协议对比，各自擅长什么场景
- [[openthread]] — Thread 协议的开源实现，Matter over Thread 设备的底层 mesh 网络栈

## 关联

- [[zigbee-vs-matter-thread-2026]] —— 把 Zigbee、Matter、Thread 三条线放在一起比较，理解各自的分工和重叠
- [[openthread]] —— Google 开源的 Thread 协议实现，Matter over Thread 设备的底层网络栈
- [[mqtt-v5-spec]] —— 另一个 IoT 通信协议，发布/订阅模式 vs Matter 的 Client/Server 模式，设计哲学完全不同
- [[coap-rfc7252]] —— 受限应用协议（CoAP），Matter 的消息模型参考了 CoAP 的 RESTful 思路但更偏二进制紧凑编码
- [[tls-1.3]] —— CASE 会话的密码学基础，理解 TLS 握手后更容易理解 PASE/CASE 的密钥协商
- [[esp-idf-overview]] —— 乐鑫的嵌入式开发框架，大量 Matter 设备在 ESP32 芯片上运行
- [[freertos-overview]] —— 嵌入式实时操作系统，Matter SDK 底层依赖的 RTOS 之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[coap-rfc7252]] —— CoAP RFC 7252 — 给传感器用的「超短明信片 HTTP」

