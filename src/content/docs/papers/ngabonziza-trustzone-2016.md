---
title: TrustZone Explained — 把手机 CPU 分成普通区和保密区
来源: 'Bernard Ngabonziza, Daniel Martin, Anna Bailey, Haehyun Cho, Sarah Martin, "TrustZone Explained: Architectural Features and Use Cases", IEEE CIC 2016'
日期: 2026-05-29
分类: security-privacy
难度: 中级
---

## 是什么

日常类比：一台手机像一座商场。大部分顾客在普通营业区活动，但支付钥匙、指纹模板、DRM 证书这些贵重物品放在后场金库里；普通区的人可以按流程递交申请，却不能直接进金库翻柜子。

TrustZone 就是 ARM 处理器提供的这套“普通区 / 金库区”硬件隔离机制。论文把它叫作一种 Trusted Execution Environment（TEE）：同一个主处理器被分成 **Normal World** 和 **Secure World**，普通操作系统跑在 Normal World，安全服务跑在 Secure World。

这篇论文不是提出新算法，而是做了一次体系结构地图：ARMv7、ARMv8、Cortex-A、Cortex-M 上 TrustZone 分别长什么样；总线、缓存、内存控制器、异常和中断怎样一起守边界；它又和 TPM、Secure Element、SGX、虚拟化有什么不同。

如果只记一句话：TrustZone 是“把整台 SoC 按安全状态分区”，不是“给某个进程套一个保险箱”。

## 为什么重要

不理解 TrustZone，下面这些事会很难解释：

- 为什么 Android Keystore、指纹支付、DRM、可信 UI 这类功能总说自己有“硬件背书”
- 为什么手机 root 了以后，某些密钥仍然不能被普通 Linux 进程直接读出来
- 为什么 TrustZone 和 Intel SGX 都叫 TEE，但一个偏“整机两世界”，一个偏“进程内 enclave”
- 为什么论文反复提醒：TrustZone 本身不等于安全存储，也不自动提供 root of trust
- 为什么车机、IoT、智能卡式安全服务会关心 Cortex-M 版本的 TrustZone

## 核心要点

1. **两个世界：一颗 CPU，两套安全状态**。类比：同一个车站有普通通道和工作人员通道，门禁决定你能去哪里。ARMv7/ARMv8 上，处理器通过 Secure Configuration Register 的 NS bit、异常级别和 monitor/EL3 这类机制区分 Secure World 与 Normal World。

2. **隔离不只在 CPU，也在总线和外设**。类比：只锁办公室门不够，电梯、仓库、收银台也要刷卡。AXI 总线带 NS bit，TZASC 划分外部内存，TZMA 划分片上 SRAM，GIC 区分安全/非安全中断，TZPC 控制外设信号；这些部件一起避免 Normal World 绕路访问安全资源。

3. **软件入口必须受控**。类比：普通区可以按铃找金库管理员，但不能自己推门进去。Cortex-A 上通常通过 Secure Boot 先启动安全世界，再让 Normal World 通过 `SMC`、IRQ/FIQ 或 monitor mode 发起世界切换；Cortex-M 上没有 monitor mode，状态由代码所在的安全内存区域决定，切换路径更短。

## 实践案例

### 案例 1：Android Keystore 签名一次

```text
App -> Android Keystore API: sign(data)
Normal World driver -> SMC: request_sign(key_id, data_hash)
Secure World TA -> use_key_inside_secure_world()
Normal World <- signature
App <- signature
```

**逐部分解释**：

- `App` 只拿到一个 `key_id`，不是密钥明文
- `SMC` 是从普通世界请求安全世界服务的硬件入口
- `TA` 是 Trusted Application，跑在安全世界，负责真正使用密钥
- 返回的是签名结果；密钥材料不需要离开安全世界

### 案例 2：安全启动先把边界画好

```text
ROM bootloader verifies secure monitor
secure monitor configures TZASC and TZPC
secure OS boots OP-TEE or vendor TEE
normal bootloader starts Linux or Android
normal OS can only see non-secure resources
```

**逐部分解释**：

- ROM 先验证安全 monitor，避免一开始就跑进恶意代码
- TZASC/TZPC 在普通系统启动前把内存和外设标成 secure 或 non-secure
- 安全 OS 可以是 OP-TEE、厂商 TEE，或更小的安全库
- 普通 OS 后启动，它看到的是已经被裁剪过的资源视图

### 案例 3：Cortex-M 设备调用安全服务

```c
// Normal World firmware
int status = secure_sign_sensor_value(value, out_sig);

// Secure World gateway
int secure_sign_sensor_value(int value, uint8_t *out) {
  check_non_secure_pointer(out);
  return sign_with_device_key(value, out);
}
```

**逐部分解释**：

- Cortex-M 版本面向微控制器，没有 Cortex-A 那种完整 monitor mode
- 安全入口函数像一道“受控门”，Normal World 只能从指定入口调用
- `check_non_secure_pointer` 很关键，避免安全世界把结果写到错误地址
- `sign_with_device_key` 使用设备密钥，但密钥不暴露给普通固件

## 踩过的坑

1. **把 TrustZone 当成独立安全芯片**：它通常仍和普通系统共享主 CPU，只是通过安全状态、总线标记和控制器做隔离，所以普通世界的调度和通信路径仍要认真设计。

2. **以为 TrustZone 自带 root of trust**：论文明确说 TrustZone 本身不提供非易失安全存储，也不保证私钥物理保密；真正的根信任还要 ROM、OTP、TPM、Secure Element 或厂商密钥配合。

3. **把 Secure World 写成第二个大系统**：安全世界越大，可信计算基越大，漏洞越难审；如果把复杂文件系统、网络栈、业务逻辑都塞进去，隔离收益会被代码风险吃掉。

4. **忽略 SMC 入口鉴权**：普通世界的特权代码可以触发 `SMC`，如果 monitor 或 TEE 没校验调用者、参数和共享内存，攻击者就能把入口当成攻击面。

## 适用 vs 不适用场景

**适用**：

- 手机和 IoT 的硬件背书密钥、指纹模板、设备证书
- DRM、可信 UI、支付确认这类“普通系统可以请求，但不能直接读数据”的服务
- 需要把安全服务和普通 OS 隔离，但仍想复用同一颗 ARM SoC 的设备
- 嵌入式虚拟化或安全监控：让 Secure World 观察 Normal World 的关键状态

**不适用**：

- 想保护大型普通应用的所有内存访问模式；TrustZone 不是按进程细粒度分区
- 需要硬件自带长期密钥存储；必须额外设计 root of trust 和 sealed storage
- Secure World 需要频繁运行复杂业务逻辑；世界切换、调试和审计成本都会上升
- 想完全替代 hypervisor；TrustZone 主要分两世界，不是通用多 VM 管理器

## 历史小故事（可跳过）

- **2004 年前后**：ARM 开始把 TrustZone 作为 SoC 级安全扩展推广，目标是移动设备和嵌入式设备。
- **2009 年**：ARM 发布 Building a Secure System using TrustZone Technology，产业界开始围绕 secure monitor、secure boot 和 TEE 软件栈建生态。
- **2014-2015 年**：ARMLock、SeCRet、TrustZone 虚拟化等研究出现，说明社区开始把它当作可编程安全边界，而不只是厂商功能。
- **2016 年**：Ngabonziza 等人发表这篇解释型论文，把 ARMv7、ARMv8、Cortex-A、Cortex-M、TPM、SGX、虚拟化放在同一张对照表里。
- **2019-2020 年**：Demystifying Arm TrustZone 和 TrustZone-assisted TEE SoK 进一步系统化漏洞、实现差异和研究缺口。

## 学到什么

1. **TEE 不是一种形状，而是一类信任边界**：TrustZone、SGX、TPM、Secure Element 都在保护敏感计算，但边界大小、入口方式、信任根完全不同。
2. **硬件隔离要全链路看**：CPU 状态、总线 NS bit、内存控制器、缓存、中断控制器、启动链缺一环，普通世界都可能找到绕路。
3. **“安全世界”越小越好**：TrustZone 的强项是隔离关键服务，不是把所有业务搬进去；越小越容易审计，越符合最小权限。
4. **名字里有 Trust 不代表自动可信**：没有安全启动、密钥存储、调用鉴权和 TEE 代码审计，TrustZone 只是提供了隔离材料，还没有变成完整安全系统。

## 延伸阅读

- 论文 PDF：[TrustZone Explained: Architectural Features and Use Cases](https://sefcom.asu.edu/publications/trustzone-explained-cic2016.pdf)（本文原文，适合按 ARMv7/ARMv8/对比章节读）
- DOI 页面：[10.1109/CIC.2016.065](https://doi.org/10.1109/CIC.2016.065)（OpenAlex 显示引用约 133 次）
- 后续综述：[Demystifying Arm TrustZone](https://doi.org/10.1145/3291047)（2019，图谱中高相关、高引用的 TrustZone survey）
- 后续 SoK：[Understanding the Prevailing Security Vulnerabilities in TrustZone-assisted TEE Systems](https://doi.org/10.1109/SP40000.2020.00061)（2020，分析商业 TEE 漏洞）
- [[costan-sgx-explained-2016]] —— 对照 Intel SGX：同样是 TEE，但粒度和威胁模型不同
- [[sgx-2013]] —— SGX 原始公开设计，适合和本文的 TrustZone 两世界模型对照

## 关联

- [[costan-sgx-explained-2016]] —— SGX 把进程内 enclave 做深，TrustZone 把整台 ARM SoC 分成两个世界
- [[sgx-2013]] —— 两者都属于 TEE，但 SGX 更依赖远程证明，TrustZone 更依赖 secure boot 和 SoC 分区
- [[capsicum-2010]] —— Capsicum 在 OS 层发 capability，TrustZone 在硬件层给资源打 secure/non-secure 标签
- [[saltzer-schroeder-1975]] —— 最小权限、完全仲裁这些原则，是设计 SMC 入口和 Secure World TCB 的基本准绳
- [[diffie-hellman]] —— 安全世界常用密钥协商把远端秘密送进 TEE 服务，协商协议仍要单独设计
- [[signal-android]] —— 移动端端到端加密应用会依赖 Android Keystore 这类硬件背书能力保存长期密钥
- [[certikos-2016]] —— CertiKOS 走形式化验证路线，TrustZone 走硬件隔离路线，都是缩小可信边界的不同答案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
