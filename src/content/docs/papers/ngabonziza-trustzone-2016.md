---
title: TrustZone — ARM 给 CPU 装上"双重人格"隔离安全世界
来源: 'Ngabonziza et al., "TrustZone Explained: Architectural Features and Use Cases", IEEE CIC 2016'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

ARM TrustZone 是一种**硬件级安全隔离扩展**，让一颗 CPU 同时跑两个完全隔开的世界：**Normal World（普通世界）** 运行 Android/Linux 和普通应用，**Secure World（安全世界）** 运行受保护的可信代码和密钥。

日常类比：就像一栋写字楼里有两套门禁——普通访客用普通电梯，只有拿到安全卡的人才能进特殊楼层；两边共用同一栋楼（同一颗 CPU），但电梯（总线）和通道（内存分区）完全隔离，普通访客连特殊楼层的门在哪都看不见。

实现这个"双重人格"的核心是一个**NS（Non-Secure）bit**——CPU 内部的一个硬件标志位。所有内存访问、总线事务、外设请求都带着这个 bit：NS=1 代表普通世界的请求，NS=0 代表安全世界。NS=1 的请求会被 TZASC（TrustZone Address Space Controller）和 TZPC（TrustZone Protection Controller）挡在安全区域门外，硬件强制，不过软件。

两个世界之间的切换通过一条特殊指令 **SMC（Secure Monitor Call）** 完成，执行时 CPU 跳入 EL3（AArch64）或 Monitor Mode（AArch32）——EL3 是 ARM 对 CPU 特权层的编号，数字越大权限越高，EL3 比操作系统内核（EL1）还高一级——由 Secure Monitor（如 ARM Trusted Firmware）把守。

## 为什么重要

不理解 TrustZone，下面这些事都没法解释：

- 为什么你手机上的指纹数据从不存在 Android 能访问的内存里——它住在 Secure World，Android 内核被 root 也拿不到
- 为什么 Netflix 在 Android 上能播 4K DRM 视频，而截屏时画面是黑的——解密在 Secure World，明文数据直送显卡，绕过所有应用层
- 为什么 STM32 IoT 芯片能做安全启动——Cortex-M33 的 TrustZone-M 让验签代码和密钥住在 Secure World，即使固件被篡改也无法绕过验证
- 为什么"手机安全芯片"和"TEE"不是一回事——TrustZone 是 CPU 内嵌的隔离，安全芯片（SE）是完全独立的物理芯片，TrustZone 是二者中更普及但隔离更弱的方案

## 核心要点

1. **NS-bit 是隔离的物理基础**：整个 SoC 的所有资源（DRAM 分区、外设寄存器、中断控制器、DMA 通道）都受 NS-bit 管控。TZASC 把 DRAM 分成安全区和普通区；TZPC 控制哪些外设只响应 NS=0 的请求。类比：门禁卡里写着你能进哪层楼，读卡器（TZASC/TZPC）在硬件层面验证，不经过任何软件。

2. **SMC + Secure Monitor 是切换的唯一通道**：Normal World 需要安全服务时，通过 SMC 指令陷入 EL3，Secure Monitor 保存 Normal World 的寄存器上下文、恢复 Secure World 上下文、跳入 TEE OS（如 OP-TEE）。TEE 执行完毕后再反向切换。整个切换过程在硬件层面完成，Secure Monitor 是两个世界之间唯一的裁判员。类比：外交部翻译官——两个独立国家（两个世界）所有通信必须经过他，他决定翻译什么、传递什么。

3. **Cortex-A 和 Cortex-M 的 TrustZone 实现不同**：Cortex-A（手机/服务器）用 EL3 + Secure Monitor 切换，隔离粒度到整个 OS 级别；Cortex-M（IoT 微控制器）用 SAU（Security Attribution Unit）和 IDAU（Implementation-Defined Attribution Unit）做静态内存分区，没有完整操作系统切换，代价低但灵活性也低。Cortex-M 的 TrustZone-M 是 2016 年 ARMv8-M 才引入的，把 TEE 概念带入了最小的嵌入式设备。

## 实践案例

### 案例 1：Android Keystore 密钥不可导出

Android 的 Keystore 服务让应用在 Secure World 生成非对称密钥，私钥永远不离开 Secure World。

```java
// Android 应用层：请求生成密钥（实际在 Secure World 执行）
KeyPairGenerator kpg = KeyPairGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
kpg.initialize(new KeyGenParameterSpec.Builder(
    "my_key_alias",
    KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
    .setDigests(KeyProperties.DIGEST_SHA256)
    .build());
KeyPair kp = kpg.generateKeyPair();
// kp.getPrivate() 返回的是一个句柄，调用时通过 SMC 进入 Secure World 完成签名
// 私钥字节本身永远无法从 Normal World 读取
```

**逐部分解释**：
- `"AndroidKeyStore"` provider 背后是 Keymaster TA（Trusted Application），跑在 Secure World
- 签名调用走 SMC → Secure Monitor → TEE OS → Keymaster TA，整个过程 Normal World 只能看到返回的签名结果
- 即使 Android 系统被 root，攻击者也无法提取私钥字节——因为私钥存储在 Secure World 内存中

### 案例 2：Widevine L1 DRM 视频解密路径

Netflix/YouTube 的最高质量 DRM（Widevine Level 1）要求解密在 TEE（Secure World）内完成：

```
Normal World                    Secure World
─────────────────────────────────────────────
[DRM Client]                    [Widevine TA]
    │                                │
    │ 1. 发送加密 Content Key ──────►│
    │                         2. 在 Secure World 解密 Content Key
    │                         3. 用 Content Key 解密视频帧
    │ 4. 解密后帧直送显卡 ◄──────────│
    │                                │
    │ ← Android 截屏API 在这里 →     │
    │   只能看到 Normal World 内存    │
    │   视频帧已绕过去，截到黑屏      │
```

关键点：视频帧解密后通过**安全视频路径**直接送入显示控制器，整条路径上都是 NS=0 的总线事务，Android 进程空间（NS=1）无法截获。

### 案例 3：STM32 Cortex-M33 安全启动

IoT 设备用 TrustZone-M 实现防篡改固件验证（以下是嵌入式 C 代码，只需看注释理解逻辑即可）：

```c
/* Secure World 代码（SAU 划定的安全区域）*/
#include "mbedtls/pk.h"

int secure_boot_verify(const uint8_t *firmware, size_t fw_len,
                       const uint8_t *signature, size_t sig_len) {
    mbedtls_pk_context pk;
    mbedtls_pk_init(&pk);
    /* 公钥硬编码在 Secure World 只读 Flash 区域 */
    mbedtls_pk_parse_public_key(&pk, PUBLIC_KEY_DER, PUBLIC_KEY_LEN);
    
    uint8_t hash[32];
    mbedtls_sha256(firmware, fw_len, hash, 0);
    
    /* 验签成功才允许跳转到 Normal World 固件入口 */
    return mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256,
                             hash, sizeof(hash), signature, sig_len);
}
/* SAU 把这段代码和公钥所在 Flash 区域标记为 Secure，
   Normal World 代码无法读取公钥或修改验签逻辑 */
```

**逐部分解释**：
- SAU 在 Flash 地址空间上划出 Secure 区域，Normal World 代码（包括可能被攻击者篡改的固件）读这块地址会触发 HardFault
- 公钥存在 Secure Flash，攻击者即使物理读取芯片也需要绕过 Read Protection
- 只有 `secure_boot_verify()` 通过后，Secure World 代码才执行 `BLXNS`（跳转到 Non-Secure）让控制权进入 Normal World 固件

## 踩过的坑

1. **TZASC 配置不完整导致 DMA 穿透**：若外设 DMA 控制器的 NS-bit 配置遗漏，该外设可以用 NS=0 的总线事务直接读写 Secure World 内存。实际案例：早期 Android 设备的 GPU DMA 配置缺陷，使得从 Normal World 可以通过 GPU 访问某些 Secure World 区域。

2. **Secure Monitor 代码 bug 是致命的**：EL3 代码（如 ARM Trusted Firmware 的 BL31）处于整个系统最高特权级。历史上 Trustonic Kinibi TEE 和多款 SoC 的 Secure Monitor 存在整数溢出、堆溢出 CVE，攻击者从 Normal World 构造恶意 SMC 参数即可提权到 Secure World，完全击穿隔离。

3. **TrustZone 不能防侧信道攻击**：缓存时序攻击（Cache Timing Attack）可以从 Normal World 推断 Secure World 正在做什么操作，甚至泄露密钥材料。TrustZone 的硬件隔离只阻断直接内存访问，共享的 L2/L3 缓存仍是信息泄漏通道。

4. **TA 间隔离依赖 TEE OS 质量**：多个 Trusted Application 共享同一个 TEE OS（如 OP-TEE），若 TEE OS 有堆漏洞，恶意 TA 可以横向攻击其他 TA。"Secure World 里的 App 互不信任"这个假设必须靠 TEE OS 自己保证，TrustZone 硬件本身只保证 Normal World 进不来。

## 适用 vs 不适用场景

**适用**：
- 在手机/平板上保护密钥材料（Android Keystore、Apple Secure Enclave 的 ARM 平台对应物）
- DRM 内容保护（Widevine L1、PlayReady SL3000）需要硬件级解密隔离
- 设备可信启动（Trusted Boot）—— 验签逻辑和根公钥放在 Secure World
- IoT 设备固件保护（Cortex-M33/M55 的 TrustZone-M）
- 企业移动管理（MDM）：企业数据区隔离在 Secure World

**不适用**：
- 需要物理级别隔离（防拆卸攻击、防 JTAG）→ 用独立安全元件（SE）或 HSM
- 对侧信道攻击有极高安全要求（如密码签名卡、金融 IC 卡）→ TrustZone 没有侧信道防护
- 需要 TEE 跨多厂商标准互操作 → GlobalPlatform API 覆盖了基础，但各厂商实现仍有差异，碎片化严重
- 开发资源极为受限的 Cortex-M0/M0+ 设备 → 没有 TrustZone-M 支持

## 历史小故事（可跳过）

- **2004 年**：TrustZone 随 ARMv6K（Cortex-A8 的前身）首次引入，最初目的是保护 IPTV 机顶盒的 DRM 解密密钥，防止内容盗版。
- **2013 年**：GlobalPlatform 发布 TEE Client API 和 Internal Core API 规范，TrustZone 从各家自研私有方案走向统一接口，催生 OP-TEE（Linaro 主导开源实现）和 Trustonic Kinibi。
- **2014-2016 年**：Android Pay / Apple Pay 普及，TrustZone 成为移动支付安全基础设施标配；同年多篇安全论文披露 TrustZone 实现漏洞（CVE-2015-6639 等）。
- **2016 年**：ARMv8-M 规范发布，TrustZone-M 登陆 Cortex-M23/M33，IoT 安全隔离进入微控制器市场；同年本文（Ngabonziza et al.）在 IEEE CIC 上系统性梳理了整个 TrustZone 生态。
- **2019 年后**：RISC-V 社区发布 Keystone Enclave（[[lee-keystone-2020]]），尝试在开放指令集上复现类 TrustZone 的 TEE 能力，TrustZone 的 ARM 独占格局开始被挑战。

## 学到什么

1. **硬件隔离 = 一个标志位 + 全系统一致执行**：TrustZone 的核心是 NS-bit，但它能工作是因为 SoC 里所有总线主设备（CPU、DMA、GPU）都被要求遵守这个 bit——架构简单，但需要整个平台的配合。
2. **安全边界越高，bug 代价越大**：EL3 Secure Monitor 是整个系统最高特权代码，一个整数溢出就能让所有隔离失效。安全功能不是越复杂越好，最小可信计算基（TCB）越小越安全。
3. **隔离 ≠ 不可见**：TrustZone 阻断了直接内存访问，但阻断不了时序信道、功耗信道等侧信道攻击——安全系统设计必须同时考虑这两类威胁。
4. **同一个想法可以在不同约束下落地**：Cortex-A（全功能 OS 切换）和 Cortex-M（静态内存分区）用同样的 TrustZone 名字，但实现完全不同——架构设计要根据目标场景调整约束。

## 延伸阅读

- ARM 官方文档：[TrustZone for Cortex-A](https://www.arm.com/technologies/trustzone-for-cortex-a)（官方技术概述，权威入口）
- 开源实现：[OP-TEE 文档](https://optee.readthedocs.io/)（Linaro 维护的开源 TEE，世界切换机制讲得最清楚）
- 对比阅读：[[sgx-2013]] —— Intel 的 Enclave 方案与 TrustZone 的根本设计差异
- 攻击视角：Lipp et al., "ARMageddon: Cache Attacks on Mobile Devices"（2016）—— 从 Normal World 利用缓存侧信道攻击 Secure World
- RISC-V 替代方案：[[lee-keystone-2020]] —— 开放指令集上的可定制 TEE

## 关联

- [[sgx-2013]] —— Intel SGX 是 TrustZone 在 x86 上的对应物，两者设计目标相同但隔离粒度不同（SGX 到 Enclave 级，TrustZone 到世界级）
- [[aes]] —— AES 是 Secure World 内最常见的加密算法，TrustZone 保护 AES 密钥不被 Normal World 读取
- [[libsignal]] —— Signal 协议的密钥派生和签名密钥在 Android 上可以存放在 TrustZone Secure World 的 Keystore 中
- [[tls-1.3]] —— TLS 握手中的私钥操作在 Android 平台通过 Keystore TA 委托给 Secure World 执行
- [[lee-keystone-2020]] —— Keystone 是 RISC-V 上受 TrustZone 启发的开源 TEE，解决了 TrustZone 闭源和 ARM 锁定问题
- [[mitls-2014-triple-handshake]] —— TLS 实现中的协议层漏洞，与 TrustZone 这类硬件层隔离形成互补——硬件保护密钥，协议层保证密钥被正确使用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lee-keystone-2020]] —— Keystone — 开源可定制 RISC-V TEE 框架
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[mitls-2014-triple-handshake]] —— Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁
- [[sgx-2013]] —— Innovative Instructions and Software Model for Isolated Execution

