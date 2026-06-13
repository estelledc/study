---
title: OP-TEE — Open Portable Trusted Execution Environment 零基础学习笔记
来源: https://optee.readthedocs.io/en/latest/
日期: 2026-06-13
分类: 操作系统
子分类: 嵌入式与 IoT
难度: 中级
provenance: pipeline-v3
---

## 是什么

**OP-TEE**（Open Portable Trusted Execution Environment）是运行在 **ARM TrustZone Secure World** 上的开源 TEE 实现，与 Normal World 里的 Linux/Android（REE，Rich Execution Environment）配对工作。它实现了 GlobalPlatform 定义的 **TEE Client API v1.0**（给普通世界客户端用）和 **TEE Internal Core API v1.3.1**（给 Secure World 里的 Trusted Application 用）。

日常类比：把整台手机想成一家银行。Android 是面向公众的一楼营业厅——办业务、装 App、连 Wi‑Fi，功能强大但不可完全信任；OP-TEE 是地下金库里的 **专用保险库操作系统**：面积不大、功能聚焦，专门存放指纹模板、支付密钥、DRM 许可证。营业厅客户（CA，Client Application）不能直接进金库，只能把 **填好的业务单**（共享内存 + 命令号）交给 **前台保安**（Linux `optee` 驱动 + EL3 Monitor），由保安转交金库职员（TEE Core）再调度具体 **保险柜管理员**（TA，Trusted Application）。金库职员之间也互相隔离——一个 TA 被攻破，不应拖垮另一个 TA。

2014 年 6 月 12 日 OP-TEE 在 GitHub 首次开源（前身是 ST-Ericsson/STMicroelectronics 的闭源 TEE）；2013 年已通过 GlobalPlatform 合规认证。如今维护方是 **TrustedFirmware.org**，是 Android Keymaster/Gatekeeper、Automotive 安全启动、IoT 密钥保护等场景的事实参考实现之一。

## 为什么重要

- **TrustZone 的软件落地层**：[[trustzone-arm-2009]] 讲硬件双世界；OP-TEE 讲 Secure World 里具体跑什么 OS、怎么调度 TA
- **GlobalPlatform 标准参考**：学 TEE 接口（Context / Session / Command）最省力的开源样本
- **Android 安全栈底座**：KeyMint、StrongBox、Widevine L1 等常基于 OP-TEE 或同类 GP-TEE
- **可复现**：`optee_os` + `optee_client` + `optee_examples` + QEMU 可在笔记本上跑通 CA↔TA 全链路
- **与 [[sgx-2013]] 对照**：SGX 是应用级 enclave；OP-TEE 是 **系统级 Secure World + 多 TA** 模型

## 核心要点

### 1. 组件地图

| 组件 | 仓库/位置 | 职责 |
|------|-----------|------|
| **optee_os** | Secure EL1 | TEE 内核：调度 TA、加密服务、安全存储、SMC 处理 |
| **optee_client** | REE 用户态 | `libteec`：GlobalPlatform Client API |
| **tee-supplicant** | REE 守护进程 | 代 TEE 访问 REE 文件系统、RPMB、插件等"远程服务" |
| **Linux TEE 框架** | 内核 ≥4.12 | `/dev/tee0`、`drivers/tee/optee/` |
| **ldelf** | Secure 用户态 | ELF 加载器，把 TA 映像装进 Secure 内存 |
| **xtest / optee_examples** | 测试与示例 | 回归 API 行为、学习 CA/TA 写法 |

设计目标（官方文档）：**隔离**（TEE 与 REE、TA 与 TA）、**小 footprint**（适合片上 SRAM/有限 DRAM）、**可移植**（多 SoC、多 Rich OS）。

### 2. CA / TA / Pseudo-TA 三种"程序"

- **CA（Client Application）**：跑在 Normal World（Linux 用户态或内核），通过 `TEEC_*` API 发起请求
- **User-mode TA**：跑在 Secure World **用户态**（低于 TEE Core 特权），实现具体安全业务；通过 **UUID** 标识，对外暴露若干 **commandID**
- **Pseudo-TA（PTA）**：编译进 `optee_os` 内核的"伪 TA 接口"，如 `system` PTA、RPMB 相关服务；无 GlobalPlatform Internal API，直接调 Core 内部例程

多数开发者写的是 **User-mode TA**；PTA 用于平台级特权服务。

### 3. 调用链：从 App 到 TA

```text
CA (libteec)
  → ioctl(/dev/tee0)
    → Linux optee driver
      → SMC (SMCCC) → EL3 Secure Monitor (TF-A)
        → OP-TEE Core (Secure EL1)
          → ldelf 加载 TA → TA_InvokeCommandEntryPoint
```

参数与返回值通过 **共享内存（Shared Memory）** 传递：`TEEC_AllocateSharedMemory` 或注册已有 buffer。Monitor 与 TZASC 保证 Normal World 不能随意读写任意 Secure 内存，只能访问 **显式共享窗口**。

### 4. GlobalPlatform 会话模型

1. **TEEC_InitializeContext**：建立 CA 与 TEE 的逻辑连接
2. **TEEC_OpenSession(uuid)**：针对某个 TA 打开会话（类似 TCP connect）
3. **TEEC_InvokeCommand(session, cmd_id, operation)**：调用 TA 内具体功能
4. **TEEC_CloseSession / TEEC_FinalizeContext**：释放资源

Secure World 侧 TA 入口对称：`TA_CreateEntryPoint` → `TA_OpenSessionEntryPoint` → `TA_InvokeCommandEntryPoint` → `TA_CloseSessionEntryPoint` → `TA_DestroyEntryPoint`。

### 5. 安全存储（Secure Storage）

OP-TEE 提供两类后端（详见 Architecture → Secure Storage）：

- **REE FS Secure Storage**：加密对象存 Normal World 文件系统（`tee-supplicant` 代读写），密钥由 **SSK/HUK** 派生，防 REE 直接读明文
- **RPMB Secure Storage**：对象存 eMMC **Replay Protected Memory Block**，防回滚

TA 侧 API 形如 `TEE_CreatePersistentObject` / `TEE_ReadObjectData`，对开发者屏蔽后端差异。

### 6. tee-supplicant 为何必需

TEE Core 在 Secure World **不应**直接挂载 ext4、发网络包。当 TA 需要"让 Rich OS 帮忙读一个文件"时，Core 通过 **RPC** 把请求发给 Normal World 的 **tee-supplicant**，由它完成文件 I/O 再把结果写回共享内存。没有 supplicant，REE FS 安全存储和部分插件功能无法工作。

## 代码示例

### 示例 1：Normal World CA — 打开会话并调用 TA 命令

以下片段来自 `optee_examples` 的典型模式（如 `hello_world` / `aes`），展示 GlobalPlatform Client API 最小闭环：

```c
#include <tee_client_api.h>
#include <stdio.h>
#include <string.h>

/* hello_world TA 的固定 UUID（示例） */
static const TEEC_UUID ta_uuid = {
    0x8aaaf200, 0x2450, 0x11e4,
    { 0xab, 0xe2, 0x00, 0x02, 0xa5, 0xd5, 0xc5, 0x1b }
};

#define TA_CMD_INC_VALUE 0

int main(void)
{
    TEEC_Context ctx;
    TEEC_Session sess;
    TEEC_Operation op;
    TEEC_Result res;
    uint32_t err_origin;

    res = TEEC_InitializeContext(NULL, &ctx);
    if (res != TEEC_SUCCESS)
        return 1;

    res = TEEC_OpenSession(&ctx, &sess, &ta_uuid,
                           TEEC_LOGIN_PUBLIC, NULL, NULL, &err_origin);
    if (res != TEEC_SUCCESS) {
        TEEC_FinalizeContext(&ctx);
        return 1;
    }

    memset(&op, 0, sizeof(op));
    op.paramTypes = TEEC_PARAM_TYPES(TEEC_VALUE_INOUT,
                                     TEEC_NONE, TEEC_NONE, TEEC_NONE);
    op.params[0].value.a = 42;

    res = TEEC_InvokeCommand(&sess, TA_CMD_INC_VALUE, &op, &err_origin);
    if (res == TEEC_SUCCESS)
        printf("TA returned: %u\n", op.params[0].value.a);

    TEEC_CloseSession(&sess);
    TEEC_FinalizeContext(&ctx);
    return (res == TEEC_SUCCESS) ? 0 : 1;
}
```

**阅读要点**：

- `TEEC_UUID`  globally 唯一标识一个 TA 二进制；Android 里 `gatekeeper`、`keymaster` 各有固定 UUID
- `paramTypes` 用宏编码四个参数各自是 **value** 还是 **memref**、输入还是输出
- `err_origin` 区分错误来自 TEE 客户端库、TEE Core 还是 TA 本身（GlobalPlatform 排错惯例）

### 示例 2：Secure World TA — 处理 InvokeCommand

User-mode TA 必须实现 GP 规定的入口函数；下面是与示例 1 配套的 TA 侧逻辑骨架：

```c
#include <tee_internal_api.h>
#include <tee_internal_api_extensions.h>

TEE_Result TA_CreateEntryPoint(void)
{
    return TEE_SUCCESS;
}

void TA_DestroyEntryPoint(void)
{
}

TEE_Result TA_OpenSessionEntryPoint(uint32_t param_types,
                                    TEE_Param params[4],
                                    void **sess_ctx)
{
    (void)param_types;
    (void)params;
    (void)sess_ctx;
    return TEE_SUCCESS;
}

void TA_CloseSessionEntryPoint(void *sess_ctx)
{
    (void)sess_ctx;
}

TEE_Result TA_InvokeCommandEntryPoint(void *sess_ctx,
                                        uint32_t cmd_id,
                                        uint32_t param_types,
                                        TEE_Param params[4])
{
    (void)sess_ctx;

    if (cmd_id != 0) /* TA_CMD_INC_VALUE */
        return TEE_ERROR_BAD_PARAMETERS;

    if (param_types != TEE_PARAM_TYPES(TEE_PARAM_TYPE_VALUE_INOUT,
                                       TEE_PARAM_TYPE_NONE,
                                       TEE_PARAM_TYPE_NONE,
                                       TEE_PARAM_TYPE_NONE))
        return TEE_ERROR_BAD_PARAMETERS;

    params[0].value.a++;
    return TEE_SUCCESS;
}
```

**阅读要点**：

- TA 链接 **libutee**，系统调用进入 OP-TEE Core；CA 永远不能直接调用这些符号
- `TA_InvokeCommandEntryPoint` 里必须 **严格校验** `param_types`，否则 CA 传错类型会导致越界或信息泄露
- 真实 TA 会在 `TA_CreateEntryPoint` 里初始化 crypto context，在 `TA_OpenSessionEntryPoint` 里做 access control

### 示例 3：TA 内创建加密持久化对象（安全存储）

```c
#define OBJ_ID   ((void *)"my_secret_key_v1")
#define OBJ_ID_LEN 16

TEE_Result store_secret(const uint8_t *data, size_t len)
{
    TEE_ObjectHandle obj;
    TEE_Result res;

    res = TEE_CreatePersistentObject(TEE_STORAGE_PRIVATE,
                                     OBJ_ID, OBJ_ID_LEN,
                                     TEE_DATA_FLAG_ACCESS_READ |
                                     TEE_DATA_FLAG_ACCESS_WRITE,
                                     TEE_HANDLE_NULL,
                                     data, len, &obj);
    if (res != TEE_SUCCESS)
        return res;

    TEE_CloseObject(obj);
    return TEE_SUCCESS;
}
```

`TEE_STORAGE_PRIVATE` 表示对象仅本 TA 可访问；底层可能走 REE FS 或 RPMB，由平台配置决定。

## 实践案例

### 案例 1：Android KeyMint / Keymaster

Android 把密钥生成、认证、密钥派生交给 Secure World TA。Framework 经 HIDL/AIDL 调到 vendor KeyMint 实现，底层常见 OP-TEE TA + 硬件 RoT（eFuse/HUK）。即使 Root 了 REE，私钥材料仍以加密对象形式存在 TEE 保护存储中。

### 案例 2：QEMU + OP-TEE 本地实验

官方 `build.git` 可构建：`qemu-system-aarch64` + TF-A + OP-TEE + BusyBox/Linux。启动后运行 `xtest` 验证 thousands 项 GP API 行为；再跑 `optee_example_hello_world` 观察 CA/TA 日志。这是零基础理解 SMC 路径最低成本方式。

### 案例 3：Automotive 与安全启动

车机 SoC 用 OP-TEE 配合 TF-A 验证下一级镜像、保管车辆身份密钥。Normal World 跑 IVI（信息娱乐系统），TA 持有 CAN 总线认证密钥——与手机模型同构，但 threat model 更强调长期供应链完整性。

## 踩过的坑

1. **忘记启动 tee-supplicant**：REE FS 存储、部分 RPC 全失败，xtest 大面积报错
2. **共享内存未对齐/未注册**：CA 把栈上指针直接传给 TA，驱动拒绝或 TA 读 garbage
3. **UUID 不匹配**：换了 TA 二进制但没更新 CA 头文件里的 UUID，OpenSession 返回 `TEEC_ERROR_ITEM_NOT_FOUND`
4. **param_types 校验缺失**：TA 侧最常见漏洞类——恶意 CA 可混淆 in/out buffer
5. **混淆 Pseudo-TA 与 User TA**：PTA 在内核里，调试方式与 `ta/` 目录下的 ELF TA 完全不同
6. **只测 QEMU 不上真板**：TZASC、RPMB、eFuse HUK 等行为因 SoC 而异，移植时要读 Platform porting 文档

## 适用 vs 不适用

**适用**：

- Arm TrustZone A-profile + Linux/Android 需要 GP 标准 TEE
- 需要开源可审计的 TEE 参考实现、培训与原型验证
- 密钥/生物特征/DRM/计量计费类 **小状态、高价值** 安全服务
- 与 TF-A、U-Boot、AOSP 已有 OP-TEE 移植的 SoC

**不适用**：

- 无 TrustZone（或等价隔离）的 MCU——应看 Secure Element 或 **TrustZone for Armv8-M** 其他栈
- x86 机密计算首选 SGX/TDX——OP-TEE 主要生态在 Arm
- 需要极大算力 Secure 工作负载（大模型推理）——Secure World 内存与算力预算通常很小
- 威胁模型仅防普通恶意 App、无需硬件隔离——Linux 进程沙箱 + Keystore 软件实现可能足够

## 架构一图流

```text
┌──────────────────────────────────────────────────────────────┐
│ Normal World (REE)                                            │
│  App → CA (libteec) → /dev/tee0 → optee driver               │
│  tee-supplicant ← RPC ← (文件/RPMB/插件)                        │
└────────────────────────────┬─────────────────────────────────┘
                             │ SMC + 共享内存
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ EL3 Secure Monitor (TF-A)                                     │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Secure World — OP-TEE Core (EL1)                              │
│  Crypto │ Storage │ Scheduler │ ldelf │ PTA (system, …)       │
│       ┌─────────┴─────────┬─────────────┐                    │
│       ▼                   ▼             ▼                    │
│   Keymaster TA      Gatekeeper TA   Custom TA (UUID)         │
└──────────────────────────────────────────────────────────────┘
```

## 与 TrustZone / SGX 对照

| 维度 | OP-TEE + TrustZone | Intel SGX |
|------|-------------------|-----------|
| 隔离粒度 | Secure World 整区 + 多 TA | 每 enclave 页级 |
| 标准接口 | GlobalPlatform TEE API | Intel SGX SDK |
| Rich OS 态度 | 与 Linux 共生 | OS 仍管理 enclave 外资源 |
| 开源参考 | optee_os 完整树 | SDK 开源，CPU 微码闭源 |
| 典型部署 | 手机、IoT、车载 | 服务器、桌面机密计算 |

## 延伸阅读

- 官方文档：[OP-TEE Read the Docs](https://optee.readthedocs.io/en/latest/)
- 架构索引：[Architecture](https://optee.readthedocs.io/en/latest/architecture/index.html)
- GlobalPlatform API：[GlobalPlatform API](https://optee.readthedocs.io/en/latest/architecture/globalplatform_api.html)
- 代码仓库：[optee_os](https://github.com/OP-TEE/optee_os)、[optee_examples](https://github.com/OP-TEE/optee_examples)
- 本库相关：[[trustzone-arm-2009]]、[[ngabonziza-trustzone-2016]]、[[sgx-2013]]

## 自测题

1. CA 和 TA 分别运行在哪个 World、哪个特权级？
2. 为什么 TEE 需要 tee-supplicant，而不是 Core 自己读 `/data/tee/` 文件？
3. `TEEC_OpenSession` 与 `TEEC_InvokeCommand` 的职责划分是什么？
4. REE FS 安全存储防的是 REE 里的什么攻击者？RPMB 额外防什么？

**参考答案要点**：(1) CA 在 Normal World 用户态；User TA 在 Secure World 用户态，低于 OP-TEE Core；(2) 最小 TCB、Core 不实现完整文件系统、减少 Secure 侧攻击面；(3) OpenSession 建立到特定 UUID 的通道，InvokeCommand 在该通道上发 cmd_id；(4) REE FS 防 REE 窃读/篡改密文对象；RPMB 还防回滚（旧版本密文重放）。
