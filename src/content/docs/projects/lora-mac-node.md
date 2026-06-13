---
title: LoRaMac-node — LoRaWAN 终端协议栈参考实现零基础学习笔记
来源: 'https://github.com/Lora-net/LoRaMac-node'
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

**LoRaMac-node** 是 LoRa Alliance 成员 Semtech / Stackforce 维护的 **LoRaWAN 终端（End-Device）协议栈参考实现**，仓库地址 [Lora-net/LoRaMac-node](https://github.com/Lora-net/LoRaMac-node)。它用 C 语言完整实现了 LoRaWAN L2 规范（1.0.4 / 1.1.0 等分支）、区域参数（Regional Parameters）、Class A/B/C 三种设备类，并附带 SX127x、SX126x、LR1110 等射频驱动与多款开发板示例。

日常类比：**小区门禁系统里的「住户端 App + 对讲机固件」**。

想象一栋 LoRa 物联网「小区」：网关是物业前台，网络服务器是总部调度中心，而你的温湿度传感器、水表、烟感就是住户。住户不能自己随便选频道、随便喊话——必须按章程（LoRaWAN 规范）先登记入网（Join），再在规定窗口收发信件（上行/下行），还要遵守各国无线电法规（EU868、US915 等频段与占空比）。**LoRaMac-node 就是这套章程在 MCU 里的完整落地代码**：加密、帧格式、入网、ADR、Class B 信标同步……你不用从零写 MAC 层，只需填 DevEUI、写应用 payload、选开发板编译烧录。

> **维护状态（2024 起）**：Semtech 已将新功能开发迁移到 **LoRa Basics Modem**；LoRaMac-node 进入 **maintenance mode**（仍修关键 bug，但不追新特性如 Relay、CSMA、LoRaWAN 1.2）。**存量项目与教学仍极有价值**；全新量产设计官方更推荐 LoRa Basics Modem。

## 解决什么问题

LoRa 物理层（Semtech 的 LoRa 调制）只解决「远距离、低功耗传比特」；要组成可运营的大规模 IoT 网络，还需要 MAC 层以上的 LoRaWAN：**OTAA/ABP 激活、帧计数防重放、AES 加解密、自适应速率 ADR、多区域合规、Class B/C 下行调度**。自己实现一遍 MAC 既容易与认证测试不一致，又难以跟进 Alliance  errata。

LoRaMac-node 的定位是：

| 角色 | 说明 |
| --- | --- |
| **规范对照实现** | 与 LoRaWAN Spec / RP 文档一一对应，便于理解「标准到底长什么样」 |
| **认证参考** | 各 `LoRaMac/*` 示例内置 LoRa Alliance 认证协议实现 |
| **可移植栈** | 分层清晰：Radio / Region / MAC / Handler，换芯片主要动 Board + Radio |
| **学习样板** | Doxygen 文档：<http://stackforce.github.io/LoRaMac-doc/> |

## 协议栈分层

从下到上，可以把仓库理解成五层：

```
应用层     LmHandler + periodic-uplink-lpp / fuota-test-01 等示例
           ↓
MAC 核心   LoRaMac.c — 状态机、MCPS/MLME、MAC 命令、Join/Rejoin
           ↓
安全       LoRaMacCrypto + Secure Element（soft-se / lr1110-se / ATECC608A）
           ↓
区域       Region/ — EU868、US915、AS923… 信道、功率、占空比
           ↓
射频       radio/ — SX1272/73、SX1276/77/78/79、SX1261/2、LR1110 驱动
           ↓
板级       boards/ — Nucleo、B-L072Z-LRWAN1、SAMR34、SKiM 等 BSP + Timer/RTC
```

上层应用**不应直接**频繁调用 `Radio.Send()` 发裸 LoRa 包（那是 `ping-pong` 示例做的事）；LoRaWAN 应用应走 **MCPS 发数据、MLME 管网络** 的 API 或更封装一层的 **LmHandler**。

## 核心概念

### 1. MCPS 与 MLME：两套「服务窗口」

LoRaMAC API 借鉴 IEEE 802.15.4 的 **Request → Confirm** 与 **Indication → Response** 原语：

| 服务 | 全称 | 典型用途 |
| --- | --- | --- |
| **MCPS** | MAC Common Part Sublayer | 发/收应用数据（Confirmed / Unconfirmed） |
| **MLME** | MAC Layer Management Entity | Join、LinkCheck、Class 切换、DevStatus 等管理 |
| **MIB** | MAC Information Base | 读写 DevAddr、密钥、区域、Class 等运行时配置 |

记忆口诀：**MCPS 运货，MLME 办手续，MIB 查户口。**

### 2. Class A / B / C：设备「有多闲才能听下行」

| Class | 行为 | 典型场景 |
| --- | --- | --- |
| **A** | 每次上行后开两个短 RX 窗口收下行；其余时间可睡 | 电池传感器（默认） |
| **B** | 在 A 基础上，按网关信标在固定时刻开 ping-slot | 需定时下行调度 |
| **C** | 几乎持续 RX，只有发上行时短暂关闭 | 有电插座、执行器 |

Class A 最省电；Class C 下行延迟最低但功耗最高。示例 `periodic-uplink-lpp` 可通过 CMake 的 `LORAWAN_DEFAULT_CLASS` 与 `CLASSB_ENABLED` 配置。

### 3. OTAA vs ABP：两种「入户方式」

- **OTAA（Over-The-Air Activation）**：设备带 DevEUI / JoinEUI / AppKey 上电发 Join-Request，网络下发 Join-Accept 并分配 DevAddr 与会话密钥。**可更换网络、可量产烧录统一固件**，推荐方式。
- **ABP（Activation By Personalization）**：DevAddr 与密钥预先写死，跳过 Join。**调试快**，但密钥泄露风险高、不利于大规模运维。

LoRaMac-node 通过 `CommissioningParams.IsOtaaActivation` 与 `LmHandlerJoin()` 统一入口；ABP 设备调用 Join 实际是 pass-through。

### 4. Regional Parameters：同一套栈，不同国家不同「交规」

`ACTIVE_REGION` 与 `REGION_EU868` 等 CMake 开关决定编译进哪些 Region 实现。EU868 默认若干信道与 1% 占空比；US915 用 64+8 信道方案；AS923 还分子频段。**选错 Region 的表现往往是 Join 成功但上行全丢、或 duty-cycle 报错**——这不是射频坏了，是「交规」不对。

### 5. Secure Element：密钥放在哪

仓库支持三种抽象：

| 实现 | 说明 |
| --- | --- |
| `soft-se` | 密钥在 Flash/RAM，开发常用 |
| `lr1110-se` | LR1110 片上安全区 |
| `atecc608a-tnglora-se` | Microchip ATECC608A-TNGLORA 预置证书，不可改写 |

量产应倾向硬件 SE；学习阶段 `soft-se` 足够。

### 6. LmHandler：应用层的「大堂经理」

直接调 `LoRaMacMcpsRequest()` 可行但样板代码普遍用 **LmHandler**：封装 Join、Send、Class 切换、NVM 存储、回调通知。示例 `periodic-uplink-lpp` 演示定时上行 **Cayenne LPP** 编码温湿度——这是最常见的应用骨架。

## 代码示例

### 示例 1：注册回调并完成 OTAA Join

以下片段摘自 `periodic-uplink-lpp` 各板型 `main.c` 的通用模式：先挂回调，入网成功后申请目标 Class。

```c
static void OnJoinRequest(LmHandlerJoinParams_t *params)
{
    if (params->Status == LORAMAC_HANDLER_ERROR) {
        /* Join 失败则重试 */
        LmHandlerJoin();
    } else {
        /* 入网成功，切换到编译期默认 Class（A/B/C） */
        LmHandlerRequestClass(LORAWAN_DEFAULT_CLASS);
    }
}

static LmHandlerCallbacks_t LmHandlerCallbacks = {
    .GetBatteryLevel = BoardGetBatteryLevel,
    .GetRandomSeed   = BoardGetRandomSeed,
    .OnMacProcess    = OnMacProcessNotify,  /* 驱动 LoRaMacProcess() */
    .OnJoinRequest   = OnJoinRequest,
    .OnTxData        = OnTxData,
    .OnRxData        = OnRxData,
    .OnClassChange   = OnClassChange,
    /* … 其余回调可置 NULL … */
};

int main(void)
{
    BoardInitMcu();
    LmHandlerInit(&LmHandlerCallbacks, &LmHandlerParams);
    LmHandlerConfigure(&LmHandlerParams);
    LmHandlerJoin();           /* 启动 OTAA 或 ABP */
    while (1) {
        LmHandlerProcess();    /* 必须在主循环或 RTOS 任务中周期调用 */
    }
}
```

要点：`OnMacProcessNotify` 里应调用 `LmHandlerProcess()`（或 `LoRaMacProcess()`），否则 MAC 状态机不推进，Join 永远卡住。

### 示例 2：构造应用数据并发送（MCPS）

LmHandler 内部将应用数据转为 MCPS 请求；等价逻辑如下（摘自 `LmHandler.c` 思路）：

```c
LmHandlerErrorStatus_t SendSensorUplink(uint8_t *payload, uint8_t len)
{
    if (LmHandlerJoinStatus() != LORAMAC_HANDLER_SET) {
        LmHandlerJoin();
        return LORAMAC_HANDLER_ERROR;
    }

    LmHandlerAppData_t appData = {
        .Port    = 2,              /* LoRaWAN FPort，0 保留给 MAC 命令 */
        .Buffer  = payload,
        .BufferSize = len,
    };

    /* LORAMAC_HANDLER_UNCONFIRMED_MSG：省下行确认、适合高频遥测 */
    return LmHandlerSend(&appData, LORAMAC_HANDLER_UNCONFIRMED_MSG);
}
```

若需 **可靠送达**（网络会回 Ack，可触发重传），改用 `LORAMAC_HANDLER_CONFIRMED_MSG`。发送前栈会调用 `LoRaMacQueryTxPossible()` 检查 payload 是否超过当前 DR 的 MAC 帧上限；过长时会先发空帧 flush MAC 命令队列。

### 示例 3：CMake 构建 periodic-uplink-lpp（EU868 + LR1110）

官方 README 推荐 CMake 交叉编译，典型命令：

```bash
git clone https://github.com/lora-net/loramac-node.git loramac-node
cd loramac-node
git submodule update --init

mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_TOOLCHAIN_FILE="../cmake/toolchain-arm-none-eabi.cmake" \
      -DAPPLICATION="LoRaMac" \
      -DSUB_PROJECT="periodic-uplink-lpp" \
      -DCLASSB_ENABLED="ON" \
      -DACTIVE_REGION="LORAMAC_REGION_EU868" \
      -DREGION_EU868="ON" \
      -DBOARD="NucleoL476" \
      -DRADIO="LR1110" \
      -DSECURE_ELEMENT="LR1110_SE" \
      ..
make -j$(nproc)
```

烧录前在 `se-identity.h` 或相应 commissioning 头文件中填入与 ChirpStack / TTN / 私有 NS 一致的 **DevEUI、JoinEUI、AppKey**（OTAA）或 ABP 参数。

## 仓库里还有哪些示例

| 路径 | 用途 |
| --- | --- |
| `LoRaMac/periodic-uplink-lpp` | Class A/B/C 周期上行 + Cayenne LPP |
| `LoRaMac/fuota-test-01` | FUOTA 固件升级测试场景 |
| `ping-pong` | 纯 LoRa 点对点，**不经过 LoRaWAN** |
| `rx-sensi` / `tx-cw` | 射频灵敏度、连续波实验室测试 |

Certification 相关逻辑已嵌入 LoRaMac 应用公共包，对接 Alliance 测试工具时有参考价值。

## 与相关项目的关系

- **LoRa Basics Modem**：Semtech 新栈，支持 Relay、CSMA 等新特性；新设计优先评估。
- **[[zephyr]] / [[sdk-nrf]]**：Nordic NCS 等可通过 Zephyr 模块集成 LoRaWAN，部分产品不再直接裸用 LoRaMac-node，但 MAC 概念相通。
- **ChirpStack / The Things Stack**：开源或商业 **LoRaWAN Network Server**；终端侧 LoRaMac-node 与之通过 air interface 对接，无直接代码依赖。
- **[[tinygo]]**：Go 语言嵌入式路线；若要坚持 C 栈 + 多射频参考实现，LoRaMac-node 仍是教科书级选择。

## 常见问题

**Join 一直超时**

- 检查 DevEUI / JoinEUI / AppKey 字节序（LoRaWAN 常要求 MSB 显示与代码数组顺序一致）。
- 确认 `ACTIVE_REGION`、天线、网关是否在相同频段（如 EU868 vs US915）。
- 串口日志看 MLME-Confirm 的 `Status` 与 duty-cycle 等待时间。

**上行有日志但 NS 收不到**

- FPort、MIC、帧计数 FCntUp 不同步（ABP 手动配帧计数）。
- 网关与 NS 之间的 IP 链路或 routing 问题（终端 MAC 可能已成功）。

**Class B 不工作**

- 需 `CLASSB_ENABLED=ON`，且网络下发 Beacon 配置；GPS 或精确时间源影响同步。

## 学习路径建议

1. 读 Wiki：<https://github.com/Lora-net/LoRaMac-node/wiki> 与 Doxygen 的 Quick-Start / Porting Guide。
2. 用 `soft-se` + 手头 Nucleo / ST 官方 LoRa 板编译 `periodic-uplink-lpp`，对接一个免费 NS（如 TTN v3）。
3. 串口打开 `ACTIVE_REGION` 对应 trace，观察 **Join → MCPS Confirm → RX 窗口** 时序。
4. 再读 `src/mac/LoRaMac.c` 里 `LoRaMacHandleMcpsRequest` / MLME Join 分支，对照 LoRaWAN 1.0.4 PDF 的 MAC 帧图。
5. 若做量产，评估是否迁移 **LoRa Basics Modem**，或选用芯片厂 SDK 中已集成的栈。

## 小结

LoRaMac-node 是理解 **LoRaWAN 终端侧** 的最佳开源参考之一：从 RF 驱动到 Join 加密，从 EU868 占空比到 Class C 常开接收，层次分明、示例可跑。它像一本带可运行代码的规范注解——即使 Semtech 把创新栈迁往 LoRa Basics Modem，掌握 LoRaMac-node 仍能让你在读任何 LoRaWAN 产品固件、抓包、排 Join 故障时，知道 MAC 层**本该**发生什么。
