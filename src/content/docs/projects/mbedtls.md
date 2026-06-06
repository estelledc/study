---
title: Mbed TLS — 嵌入式设备的 TLS 1.3 / X.509 / 加密原语库
来源: 'https://github.com/Mbed-TLS/mbedtls'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

Mbed TLS 是一个 C99 写的 TLS/加密库，专为**资源极度受限的嵌入式设备**设计。日常类比：就像家用路由器里那块芯片——只有 256 KB Flash、64 KB RAM，还要负责把你的请求安全地加密送出去。Mbed TLS 就是这块芯片上跑的"安全引擎"，一份代码裁剪后能塞进去。

它覆盖三层：

- **密码原语**：AES、RSA、ECDSA、SHA-256/384/512、HMAC、HKDF——实现 PSA Cryptography API，可对接硬件加速器。
- **X.509**：证书解析、链验证、SAN 比对——设备认证的基础。
- **TLS 1.3 / DTLS 1.2**：完整握手、会话恢复、0-RTT——工业界认可的 ESP-IDF 和 Zephyr 默认后端。

三层被编译成三个静态库（`libtfpsacrypto` → `libmbedx509` → `libmbedtls`），引用方向单向，只需要密码原语时完全不用拉进 TLS 栈。

```c
/* 最小 TLS 客户端握手骨架 */
mbedtls_ssl_context ssl;
mbedtls_ssl_config conf;
mbedtls_x509_crt cacert;
/* CTR-DRBG = 基于 AES 计数模式的确定性随机数生成器，TLS 握手里所有随机数的来源 */
mbedtls_ctr_drbg_context ctr_drbg;
/* entropy = 平台真随机源（如 TRNG 寄存器），喂给 CTR-DRBG 做种子 */
mbedtls_entropy_context entropy;

mbedtls_ssl_init(&ssl);
mbedtls_ssl_config_init(&conf);
mbedtls_x509_crt_init(&cacert);
mbedtls_ctr_drbg_init(&ctr_drbg);
mbedtls_entropy_init(&entropy);

/* 绑定 entropy → ctr_drbg → ssl_config，加载 CA 证书，配置 SNI */
mbedtls_ssl_config_defaults(&conf, MBEDTLS_SSL_IS_CLIENT,
                             MBEDTLS_SSL_TRANSPORT_STREAM,
                             MBEDTLS_SSL_PRESET_DEFAULT);
mbedtls_ssl_conf_ca_chain(&conf, &cacert, NULL);
mbedtls_ssl_setup(&ssl, &conf);
mbedtls_ssl_handshake(&ssl);   /* 阻塞直到握手完成或出错 */
```

## 为什么重要

不了解 Mbed TLS，下面这些事很难解释清楚：

- 为什么 ESP32 连 AWS IoT / Azure Hub 时默认开了 TLS，而开发板只有 400 KB Flash——Mbed TLS 裁剪后只占其中 ~80 KB。
- 为什么嵌入式固件升级（FOTA）不需要完整 TLS 栈也能安全校验签名——PSA API 让你只调 `psa_verify_hash`，独立于协议层。
- 为什么 Zephyr / ESP-IDF 不自己写 TLS——审计成本太高，Mbed TLS 有 Arm 投入 + 第三方安全审计（NCC Group、Trail of Bits）背书。
- 为什么嵌入式 TLS 配置错了往往静默成功握手但实际没验证证书——没有 `mbedtls_ssl_conf_authmode(MBEDTLS_SSL_VERIFY_REQUIRED)` 时默认 OPTIONAL，证书错了也不断开。

## 核心要点

**1. 单一配置头文件控制所有特性**

`include/mbedtls/mbedtls_config.h` 里每一行 `#define MBEDTLS_XXX` 开关一个功能模块。`configs/` 目录提供了已裁剪的预设（`config-suite-b.h` 只留 Suite B 算法，Flash 降至 ~45 KB）。类比：乐高积木盒——你想要 TLS 1.3 就放这块，不要 RSA 就不放那块，最终体积正好等于你装进去的积木总和。

**2. PSA API 与 legacy API 的分水岭**

v3.x 起 Mbed TLS 同时暴露两套 API：旧的 `mbedtls_aes_xxx`（legacy）和新的 `psa_xxx`（PSA Cryptography API）。两套 API 底层共享同一份实现，但链接符号不同。v4.0 起 legacy API 进入 deprecated 阶段，新代码应统一用 PSA API——这样未来可以通过 PSA 驱动层透明地把运算卸载到硬件 SE（Secure Element）。

**3. 移植三件套：entropy / time / mutex**

把 Mbed TLS 搬到新平台必须实现三个平台回调：

- `mbedtls_hardware_poll()`：给 entropy 源喂真随机数（TRNG 寄存器）
- `mbedtls_time()`：返回当前 Unix 时间戳，用于证书有效期校验
- `mbedtls_threading_set_alt()`：在多线程 RTOS 里注册 mutex 实现

这三件套缺一不可，遗漏任何一个都会在不同的地方"随机失败"。

## 实践案例

### 案例 1：ESP32 上 MQTT over TLS 1.3

ESP-IDF 的 `esp-mqtt` 组件内部调 Mbed TLS，但理解底层配置能救命：

```c
// sdkconfig 里的对应选项
// CONFIG_MBEDTLS_TLS_VERSION_1_3=y
// CONFIG_MBEDTLS_SSL_MAX_CONTENT_LEN=4096  // 调小节省 RAM

// 代码里校验证书链（不要省略！）
esp_mqtt_client_config_t cfg = {
    .broker = {
        .address.uri = "mqtts://your-broker.com:8883",
        .verification.certificate = server_cert_pem,  // CA 证书 PEM
    },
};
```

默认配置下 ESP-IDF 已经把 `MBEDTLS_SSL_VERIFY_REQUIRED` 打开，但一旦手动 `menuconfig` 关掉证书验证节省内存，设备就对中间人攻击完全透明。实际部署时用 `mbedtls_ssl_get_verify_result()` 在握手后再做一次断言。

### 案例 2：Zephyr FOTA 只用 PSA API 校验 ECDSA 签名

不需要 TLS 栈，只验固件签名：

```c
#include "psa/crypto.h"

/* AEAD（认证加密）= 一次操作同时完成加密 + 防篡改；ECDSA 是椭圆曲线数字签名算法 */
psa_status_t verify_firmware(const uint8_t *fw_hash, size_t hash_len,
                              const uint8_t *sig, size_t sig_len,
                              psa_key_id_t pub_key_id) {
    return psa_verify_hash(
        pub_key_id,
        PSA_ALG_ECDSA(PSA_ALG_SHA_256),  /* 用 SHA-256 先哈希，再 ECDSA 验签 */
        fw_hash, hash_len,
        sig, sig_len
    );
}
```

这段代码只链入 `libtfpsacrypto`，Flash 开销 < 15 KB，剩余空间留给应用。与完整 TLS 栈对比，省去了 X.509 解析、握手状态机、记录层——这正是三库分层设计的价值所在。

### 案例 3：mTLS 设备身份认证中的证书链解析

IoT 设备接入时需要验证设备证书中的 SAN 字段是否匹配设备 ID：

```c
mbedtls_x509_crt chain;
mbedtls_x509_crt_init(&chain);
mbedtls_x509_crt_parse(&chain, device_cert_der, cert_len);

/* 遍历 SAN：找 URI 类型的 device_id */
const mbedtls_x509_sequence *san = &chain.subject_alt_names;
while (san != NULL) {
    mbedtls_x509_subject_alternative_name san_name;
    mbedtls_x509_parse_subject_alt_name(&san->buf, &san_name);
    if (san_name.type == MBEDTLS_X509_SAN_UNIFORM_RESOURCE_IDENTIFIER) {
        /* 比对 device_id */
    }
    san = san->next;
}
mbedtls_x509_crt_free(&chain);
```

X.509 层独立于 TLS 层，可以在不建立 TCP 连接的情况下离线验证证书链——适合资源受限的 gateway 预检场景。

## 踩过的坑

1. **默认配置 Flash 超限**：`mbedtls_config.h` 默认几乎开启所有算法，直接编进嵌入式固件轻松超过 200 KB。正确做法是从 `configs/` 里选最接近的预设，再逐项比对项目需求删减，并用 `scripts/config.py` 检查依赖关系。

2. **PSA / legacy 混用链接炸了**：`psa_encrypt` 和 `mbedtls_aes_crypt_xxx` 底层实现在 v3.x 中有重叠，同时调用两套 API 可能导致符号冲突或内存对齐问题。统一用 PSA API，并在 `mbedtls_config.h` 里开启 `MBEDTLS_PSA_CRYPTO_C`、关闭不再需要的 legacy 宏。

3. **time() 未移植证书静默过期**：MCU 上没有 `gettimeofday`，如果不实现 `mbedtls_platform_set_time()`，Mbed TLS 会用 epoch 0（1970年）做证书有效期比对，所有证书都"已过期"——要么握手失败，要么（更糟）被某些配置跳过验证。

4. **多线程 RTOS 忘注册 mutex 竞态**：FreeRTOS 上如果多个任务同时做 TLS 握手，`MBEDTLS_THREADING_C` 打开但没调 `mbedtls_threading_set_alt()` 注册 FreeRTOS mutex，会出现随机握手失败，在测试环境低并发下完全不复现，量产后才爆。

## 适用 vs 不适用场景

**适用**：

- MCU/SoC 嵌入式固件（ESP32、STM32、nRF52），Flash ≤ 1 MB 的受限环境
- 需要 PSA Cryptography API 对接硬件 SE/HSM 的场景
- Zephyr / FreeRTOS / Mbed OS 的 TLS 集成——三者均原生支持
- 服务端证书或设备证书的离线解析与验证（不需要完整 TLS 栈）
- 需要编译期裁剪、代码可审计（Apache-2.0 许可）的商业产品

**不适用**：

- 服务器端高并发 TLS（单线程 C 实现无法与 OpenSSL 的多线程 + 硬件加速竞争）
- 需要 QUIC / HTTP/3 支持（Mbed TLS 目前无 QUIC 层，需配合 ngtcp2 等）
- 对 FIPS 140-2/3 认证有强制要求（Mbed TLS 无官方 FIPS 认证；商业替代品是 wolfSSL、AWS-LC）
- 纯 Python/Go/Java 项目——直接用语言内置 TLS 库即可，无需绑 C FFI

## 历史小故事（可跳过）

- **2006 年**：荷兰开发者 Paul Bakker 发起 PolarSSL 项目，目标是"让 TLS 实现可读"——当时 OpenSSL 代码已庞大到连安全研究员也难以审计。
- **2014 年**：Arm 收购 PolarSSL，更名为 mbed TLS，与 mbed OS 捆绑，推向 Cortex-M 生态，一时间成为 IoT 设备的事实标准。
- **2015 年**：正式更名 Mbed TLS（大写 M），版本进入 2.x 系列，引入更严格的 API 边界。
- **2021 年 v3.0**：PSA Cryptography API（Arm 主导的 IETF 标准草案）正式集成，legacy API 开始 deprecated，标志着从"可裁剪的 C 库"向"可插拔的安全框架"的转变。
- **2024 年 v4.0**：加密部分完全拆分为独立仓库 TF-PSA-Crypto，Mbed TLS 本体专注协议栈——两个仓库可独立发布、独立审计，架构更清晰。

## 学到什么

1. **裁剪即设计**：嵌入式安全库的核心不是"功能最全"，而是"能删掉什么"——单一配置头文件 + 三库分层是这一理念的工程表达。
2. **抽象层值得提前投入**：PSA API 让 Mbed TLS 从"一个 TLS 实现"变成"一套安全框架接口"，硬件 SE、软件实现可以互换——这个架构决策花了 Arm 七年才完成。
3. **移植三件套是坑的来源**：entropy / time / mutex 三个平台回调覆盖了嵌入式平台差异的 90%，任何"奇怪的随机失败"几乎都能追溯到这三个地方。
4. **安全库的 API 稳定性有代价**：PSA 和 legacy 并行导致了三年的混乱期；好的迁移路径需要明确的 deprecation 时间表和机器可检测的 lint 规则。

## 延伸阅读

- 官方文档：[Mbed TLS ReadTheDocs](https://mbed-tls.readthedocs.io/) — API 参考 + 移植指南 + 配置手册，质量很高
- 配置工具：[scripts/config.py](https://github.com/Mbed-TLS/mbedtls/blob/development/scripts/config.py) — 命令行查依赖、批量开关特性
- PSA API 规范：[PSA Certified Crypto API](https://arm-software.github.io/psa-api/crypto/) — Arm 主导的 IETF 标准草案原文
- [[tls-1.3]] — TLS 1.3 握手协议的设计与安全证明
- [[mitls-2014-triple-handshake]] — 三重握手攻击：Mbed TLS 等库早期受影响的历史漏洞

## 关联

- [[tls-1.3]] —— Mbed TLS 实现的协议上层，理解握手流程才知道配置项的含义
- [[rsa]] —— RSA 密钥交换与签名，Mbed TLS 中用 `mbedtls_rsa_xxx` / `PSA_ALG_RSA_PKCS1V15_SIGN`
- [[aes]] —— AES-128/256-GCM 是 TLS 1.3 默认 cipher suite 的对称加密核心
- [[zephyr]] —— Zephyr RTOS 默认集成 Mbed TLS，提供 TLS socket 和 PSA key store
- [[freertos]] —— FreeRTOS + Mbed TLS 是 MCU 上最常见的 TLS 组合，mutex 移植是关键
- [[lwip]] —— lwIP 提供 TCP 层，Mbed TLS 提供 TLS 层，两者组合构成嵌入式 HTTPS 栈
- [[libsignal]] —— 同为 C/Rust 安全库，libsignal 专注端到端加密，Mbed TLS 专注协议栈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
