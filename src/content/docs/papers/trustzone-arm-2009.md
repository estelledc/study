---
title: ARM TrustZone Technology Overview — 一颗 CPU 上的双世界安全隔离
来源: https://developer.arm.com/documentation/PRD29-GENC-009492/c/
日期: 2026-06-13
分类: 操作系统
子分类: 嵌入式与 IoT
难度: 中级
provenance: pipeline-v3
---

## 是什么

**ARM TrustZone Technology Overview**（白皮书 PRD29-GENC-009492C，2009）是 ARM 官方对 TrustZone 安全扩展的入门总览：它说明如何把一颗 SoC 的硬件与软件资源切成两个世界——**Secure World（安全世界）** 与 **Normal World（普通世界）**——并在总线、内存、外设、调试口各层用硬件强制隔离。

日常类比：想象一栋银行大楼。一楼大厅（Normal World）对公众开放，办业务、取号、排队，人来人往；地下金库（Secure World）只有持特殊门禁卡的人能进，而且**大厅的电梯按钮根本接不到金库楼层**——不是软件拒绝，是建筑结构就不通。TrustZone 做的就是在芯片里建这套"结构隔离"：普通世界的 CPU、DMA、总线主设备带着 **NS=1（Non-Secure）** 标记，硬件解码逻辑保证它们**物理上无法访问** NS=0 的安全资源。

白皮书强调：TrustZone 不是单一指令或单一 IP，而是三层组合——**处理器 Security Extensions**、**AMBA3 总线上的 NS 信号**、以及 **TZASC / TZPC / TZMA** 等配套外设 IP。目标是用可编程方式保护几乎任何资产的**机密性与完整性**，成本低于传统独立安全芯片方案。

## 为什么重要

不理解这份 2009 概述，后面这些现象都只是在背名词：

- 为什么 Android 指纹、支付密钥、Widevine L1 DRM 都强调"在 TEE 里"——TEE 就建在 Secure World 之上
- 为什么 root 了 Linux 仍可能拿不到私钥——私钥字节在 **SP:** 物理地址空间，Normal World 的页表永远翻译不到那里
- 为什么世界切换必须走 **SMC（Secure Monitor Call）**——Normal World 不能直接改 SCR 的 NS 位，否则流水线里未刷新的敏感寄存器会泄露
- 为什么手机启动链从 ROM 开始就在 Secure World——复位后 SCR.NS=0，整条 boot 链负责"逐级降权"后才把 Rich OS 放进 Normal World
- 为什么 [[sgx-2013]]、[[ngabonziza-trustzone-2016]]、OP-TEE、TF-A 都绕不开 TrustZone 这套硬件语义——它们是在这套隔离原语上叠软件

TrustZone 从 Armv6K 引入，贯穿 Armv7-A / Armv8-A，今天仍部署在数十亿颗应用处理器上，是移动与嵌入式**硬件信任根**的事实标准之一。

## 核心要点

### 1. 两个世界 + NS-bit：隔离的物理基础

SoC 上每个总线主设备（CPU、DMA、GPU）发起读写时，AXI 的 **AWPROT[1] / ARPROT[1]** 携带 NS 位：0 = Secure，1 = Non-secure。从 Normal World 发出的访问**硬件上**不能命中 Secure 从设备；非法访问可能静默失败或返回 SLVERR/DECERR。

处理器内部，当前世界由 **SCR（Secure Configuration Register）的 NS 位**决定（AArch64 下为 `SCR_EL3.NS`）。白皮书特别提醒：**只有 Monitor 软件应直接修改 NS 位**；若在非 Monitor 模式下把 NS 置 1，流水线中尚未退休的 Secure 指令和寄存器内容可能对 Normal World 可见，构成安全违规。

可以把 NS 位想象成地址空间的"第 33 位"：同一物理地址 0x8000_0000 存在 **SP:0x8000_0000** 与 **NP:0x8000_0000** 两个独立位置，缓存标签也带安全属性，互不命中。

### 2. 虚拟双核 + Monitor：世界切换的唯一守门人

实现 Security Extensions 的 Cortex-A 核心提供两个"虚拟处理器"——Secure 与 Non-secure——通过 **Monitor Mode（Armv8-A 下为 EL3）** 时间片切换。进入 Monitor 的入口被严格限定：

- Normal World：**SMC 指令**、IRQ、FIQ、外部 Data Abort、外部 Prefetch Abort（可配置）
- Secure World：除上述外，还可直接写 CPSR 进入 Monitor

Monitor 软件（典型实现为 **ARM Trusted Firmware** 中的 Secure Monitor）负责：

1. 保存离开世界的通用寄存器、CP15/系统寄存器、必要时 NEON/VFP 状态
2. 翻转 SCR.NS
3. 恢复目标世界上下文
4. 异常返回，继续执行

状态必须保存在 **Secure 内存区域**，防止 Normal World 篡改。

### 3. 内存与外设：TZASC / TZPC / TZMA

| 组件 | 作用 |
|------|------|
| **TZASC** | 把 DRAM 等 AXI 从设备地址范围切成多个 region，按 region 配置 Secure/Non-secure 读写权限 |
| **TZPC** | 控制 APB 外设的安全属性，配合 AXI→APB 桥拒绝错误安全级别的访问 |
| **TZMA** | 片上 SRAM 分区，适合小容量安全 RAM |

TZASC 典型用法：放在 **DMC（DRAM 控制器）** 与 SoC 主设备之间，把片外 RAM 切成安全区与普通区。需要多个 Secure region 时 TZASC 必不可少。

Secure 外设（安全中断控制器、安全定时器、可锁定键盘接口）让 TEE 能做**不可被 Normal World 抢占**的监控任务——白皮书用"安全输入密码"举例。

### 4. 软件栈：Boot → Monitor → TEE → TA

启动顺序（白皮书第 5 章）：

1. 复位后 CPU 处于 **Secure 状态**，从 `RVBAR` 指向的 ROM 开始执行
2. Boot ROM 验证下一级镜像，**就地执行或复制到已划定的安全 RAM**——注意"先验证再复制"的 TOCTOU 窗口是设计陷阱
3. 加载 Secure Monitor、TEE OS（如 OP-TEE）、Trusted Applications（TA）
4. 配置 TZASC/TZPC，建立内存与外设分区
5. 将 NS 位置 1，跳转到 Normal World 的 Bootloader → U-Boot → Linux/Android

Normal World 通过 **SMC + 寄存器传参** 调用 TEE 服务；高效协议可在寄存器中携带"消息载荷"，避免每次全量上下文切换。

### 5. 中断模型（一种常见配置）

白皮书给出一种典型划分：**IRQ 给 Normal World，FIQ 给 Secure World**。Monitor 在每次世界切换时调整 SCR 的 IRQ/FIQ 路由位。若中断发生时 CPU 已在正确世界，硬件可直接跳向量表，**不必**先进 Monitor——降低延迟。

代价：需要进 Secure World 处理的 FIQ 会触发世界切换，Monitor 成为**最坏情况中断延迟**路径的一部分。A-profile 应用处理器通常不追求 μs 级硬实时，但设计时需计入。

## 代码示例

### 示例 1：Normal World 通过 SMC 请求 Secure 服务（AArch64 汇编骨架）

OP-TEE 等 TEE 遵循 **SMC Calling Convention（SMCCC）**：`x0`–`x7` 传参，功能号放 `w0`（bit[31]=0 表示 SMC32）。

```asm
// Normal World 内核驱动片段：调用 OP-TEE 标准入口
// x0 = OPTEE_SMC_CALL_WITH_ARG (0x32000004)
// x1 = 指向 optee_msg_arg 的物理地址（须在 Non-secure 可共享内存）

    mov     x0, #0x32000004
    mov     x1, arg_phys
    smc     #0                  // 陷入 EL3 Monitor
    // 返回后 x0 = 状态码，x1-x3 可能带返回值

// C 侧封装（Linux drivers/tee/optee/smc_abi.c 同类逻辑）
static u32 optee_smc_call(struct optee_smc_arg *arg)
{
    struct arm_smccc_res res;

    arm_smccc_smc(OPTEE_SMC_CALL_WITH_ARG,
                  virt_to_phys(arg), 0, 0,
                  0, 0, 0, 0, &res);
    return res.a0;
}
```

**逐行理解**：

- `smc #0` 触发 **SMC 异常**，CPU 从 NS.EL1 进入 **EL3 Secure Monitor**——Normal World 无法伪造这条路径
- Monitor 检查调用者安全状态与参数地址是否在允许的 **World-shared memory** 窗口内
- 验证通过后 Monitor 切到 Secure World，把参数交给 TEE 内核调度对应 TA
- 返回路径再次经过 Monitor，恢复 NS 上下文；Normal World 只看到寄存器里的结果，看不到 Secure 栈

### 示例 2：TZASC 区域配置（寄存器级伪代码）

TZASC 把一片 DRAM 切成最多 8 个 region（具体数量因 IP 版本而异）。Region 0 通常覆盖全地址空间作为背景；Region 1–N 可覆盖更具体的范围并设置访问权限。

```c
// 伪代码：把 0x8000_0000–0x800F_FFFF 标为仅 Secure 可读写
#define TZASC_BASE        0x2A4A0000
#define TZASC_REGION_ATTR  (TZASC_BASE + 0x100)

void tzasc_config_secure_region(void)
{
    // 仅 Secure World 在 boot 早期可写 TZASC
    write32(TZASC_BASE + 0x00, 0x1);           // 使能 TZASC

  // Region 1: 基址 0x8000_0000, 大小 1MB
    write32(TZASC_BASE + 0x108, 0x80000000);   // REGION_BASE_LOW
    write32(TZASC_BASE + 0x10C, 0x00000000);   // REGION_TOP_LOW → 0x800FFFFF

  // 属性：Secure 读写允许；Non-secure 读写均拒绝
    uint32_t attr = TZASC_ATTR_SEC_RW          // Secure read/write
                  | TZASC_ATTR_NS_NONE;        // NS 无权限
    write32(TZASC_REGION_ATTR + 1 * 4, attr);

    // 之后 Normal World 对 0x8000_0000 的访问在总线层被拒绝
}
```

**设计要点**：

- TZASC 寄存器本身必须位于 **Secure 外设空间**，否则 Normal World 可改写分区表
- 与 MMU 页表协同：即使页表允许映射，总线层 TZASC 仍可能拒绝——**两道门禁**
- 多核系统中所有主设备共享同一 TZASC 视图；DMA 引擎若标记为 Non-secure，同样无法读写 Secure region

## 实践案例

### 案例 1：Gadget2008 参考设计（白皮书第 6 章）

白皮书用虚构的 **Gadget2008** 产品说明端到端设计：安全启动、DRM、移动支付、企业 VPN。设计清单（第 7 章）要求工程师逐项核对：

- 所有 Non-secure 主设备硬件固定 NS=1
- 关键密钥材料只放在 TZASC 保护的 Secure DRAM
- Monitor 代码体积尽量小、关中断、不可重入
- 调试接口（JTAG）默认锁定或仅 Secure 可解锁

### 案例 2：与 [[sgx-2013]] 的对比

| 维度 | TrustZone（本白皮书） | Intel SGX |
|------|----------------------|-----------|
| 隔离单元 | 整颗 SoC 分世界 | Enclave 页级 |
| 信任根 | Secure ROM + Monitor + TEE | CPU 微码 + MEE |
| 典型 OS | Rich OS 跑在 Normal World | OS 仍可管理 enclave 外资源 |
| 攻击面 | Monitor/TEE 实现质量 | Enclave 接口 + 侧信道 |

二者解决"在不可信 OS 旁跑可信代码"的同族问题，但 TrustZone 是**系统级分区**，SGX 是**应用级飞地**。

## 踩过的坑

1. **内存别名一致性**：同一数据同时以 Secure 与 Non-secure 别名存在于缓存中，若两边都可写会导致静默不一致。设计共享缓冲区时必须明确**单一写入方**或使用硬件一致的原子窗口。

2. **TOCTOU 启动漏洞**："验证镜像 → 再复制到安全 RAM"之间若攻击者可写源缓冲区，验签通过仍能植入恶意代码。应 **verify-in-place** 或复制与验证原子化。

3. **Monitor 过于臃肿**：Monitor 是 TCB（可信计算基）核心，功能越多审计面越大。浮点/SIMD 若 Secure World 不用，启动时把协处理器全交给 Normal World，可省掉大量上下文切换。

4. **中断延迟被低估**：每个需切世界的 FIQ/IRQ 都叠加 Monitor 保存/恢复开销；硬实时任务不宜依赖 Secure World 频繁抢占。

5. **调试口是后门**：Non-secure 调试器若能读 Secure 内存，隔离形同虚设。生产设备必须烧 **eFuse** 锁调试或限 Secure 调试。

6. **只信软件不设 TZASC**：仅靠 MMU 属性位不够——恶意或 compromised 的 DMA 可绕过 CPU MMU。**总线级 TZASC** 是最后一道硬墙。

## 适用 vs 不适用场景

**适用**：

- 智能手机、机顶盒、IoT 网关需要 TEE（密钥、DRM、生物识别）
- 成本敏感但仍需硬件隔离，不愿加独立安全元件
- 需要 Normal World 跑完整 Linux/Android，同时把少量关键服务放进 Secure World
- 安全启动链、Measured Boot、远程证明（配合 TA）

**不适用**：

- 需要物理级隔离防侧信道（Secure World 与 Normal World 共享 L1/L2 缓存，仍受 [[spectre-attack-2018]] 类攻击影响）
- 超高保障场景要求独立安全芯片（SIM/eSE）——TrustZone 是集成方案，攻击面大于分立 SE
- Cortex-M 极小资源设备应看 **TrustZone for Armv8-M**（SAU/IDAU 模型不同，本白皮书聚焦 A-profile）
- 纯软件沙箱即可满足威胁模型时，不必引入 TEE 复杂度

## 架构一图流

```text
┌─────────────────────────────────────────────────────────────┐
│                     Normal World (NS=1)                      │
│   Android / Linux  │  Apps  │  Drivers  │  (可选 Hypervisor) │
└───────────────────────────┬─────────────────────────────────┘
                            │ SMC / IRQ / Abort
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              EL3 Secure Monitor (始终 Secure)                  │
│         保存/恢复上下文 · 路由 SMC · 配置 SCR.NS             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Secure World (NS=0)                      │
│        TEE OS (OP-TEE)  │  Keymaster TA  │  Widevine TA     │
└───────────────────────────┬─────────────────────────────────┘
                            │ 仅 NS=0 或受控共享窗口
                            ▼
┌─────────────────────────────────────────────────────────────┐
│   TZASC 分区 DRAM  │  Secure 外设  │  TZPC 锁定 APB 设备    │
└─────────────────────────────────────────────────────────────┘
```

## 延伸阅读

- 官方白皮书：[Building a Secure System using TrustZone Technology](https://developer.arm.com/documentation/PRD29-GENC-009492/c/)
- Arm Learn the Architecture：[TrustZone for Armv8-A](https://developer.arm.com/-/media/Arm%20Developer%20Community/PDF/Learn%20the%20Architecture/TrustZone%20for%20Armv8-A.pdf)（寄存器与 EL3 语义更完整）
- 开源参考实现：[Trusted Firmware-A (TF-A)](https://github.com/ARM-software/arm-trusted-firmware)
- 本库相关笔记：[[ngabonziza-trustzone-2016]]、[[sgx-2013]]、[[sel4-formal-2009]]

## 自测题

1. 为什么 Normal World 不能直接写 `SCR_EL3.NS` 切换到 Secure World？
2. `NP:0x4000_0000` 与 `SP:0x4000_0000` 在缓存里会命中同一行吗？
3. 若省略 TZASC，仅依赖 MMU 的 Secure 属性位，DMA 攻击路径是什么？
4. SMC 与普通系统调用（SVC）在安全语义上本质区别是什么？

**参考答案要点**：(1) 架构限制 + 防流水线泄露；(2) 不会，物理标签含安全状态；(3) Non-secure DMA 主设备可直接读写 DRAM；(4) SMC 进入 EL3/Monitor 并可能触发世界切换，SVC 仅在当前世界内陷到内核。
