---
title: Mbed TLS — 嵌入式设备的轻量级 TLS 加密库
来源: 'https://github.com/Mbed-TLS/mbedtls'
日期: 2026-06-24
分类: embedded
难度: 中级
---

## 是什么

Mbed TLS 是一个用 C 语言写的开源加密库，提供 TLS/DTLS 协议、X.509 证书操作和底层加密原语（AES、RSA、ECC、SHA 等）。日常类比：它像快递公司的"防拆封条 + 身份证核验"一体包——你把它贴在数据包裹外面，包裹在路上就既不怕被偷看，也不怕有人冒充收件人。

最小使用片段——初始化一个 TLS 握手上下文：

```c
mbedtls_ssl_context ssl;
mbedtls_ssl_init(&ssl);
mbedtls_ssl_setup(&ssl, &conf);
```

三行代码就建好了 TLS 会话的骨架。ESP-IDF 和 Zephyr 都把它作为默认 TLS 后端，意味着你用 ESP32 发一个 HTTPS 请求，底层跑的就是 Mbed TLS。约 5.9k stars，Apache 2.0 / GPL 2.0+ 双许可证，既能用在开源项目也能用在闭源固件里。

整个库用可移植的 C99 编写，大部分代码不依赖特定操作系统或硬件平台，只需要 8 位字节、补码整数、32 位以上的 `int` 和 `size_t`。

## 为什么重要

不理解 Mbed TLS，下面这些事都没法解释：

- 为什么 ESP32 上跑 HTTPS 请求只多了约 30KB 代码体积，而桌面端 OpenSSL 动辄数 MB——Mbed TLS 的模块化设计让你只编译用到的算法
- 为什么物联网设备固件升级（OTA）需要 TLS 验证——没有它，攻击者可以伪装成服务器推送恶意固件
- 为什么 2014 年 Heartbleed 能让全球一半的 HTTPS 服务器沦陷——嵌入式设备如果用了有漏洞的库同样会暴露密钥
- 为什么 Arm 要在 2015 年收购一个荷兰小公司的 SSL 库——IoT 安全是 Arm 生态的战略命脉

## 核心要点

1. **三层分离架构**：库拆成 `libmbedcrypto`（加密原语）、`libmbedx509`（证书）、`libmbedtls`（TLS 协议）三层。类比乐高积木——你可以只用最底层的加密模块（比如只算个 SHA-256），不需要拖整个 TLS 协议栈进来。这种松耦合让代码体积可控，`libmbedtls` 依赖 `libmbedx509`，后者又依赖 `libmbedcrypto`，层次清晰。

2. **编译时配置裁剪**：所有功能开关集中在 `mbedtls_config.h` 一个文件里。不需要 RSA？注释掉 `#define MBEDTLS_RSA_C`，编译器就不编 RSA 代码。类比自助餐——只拿你吃得下的菜，不付整桌钱。这对 Flash 只有 512KB 的 MCU 至关重要，可以把代码体积从 100KB 压到 20KB。

3. **PSA Crypto API 参考实现**：Mbed TLS 是 Arm 平台安全架构（PSA）加密接口的参考实现。意味着它不只是"一个 TLS 库"，而是 Arm 定义的加密 API 标准的标尺——其他实现都要跟它对齐。TF-A、TF-M、OP-TEE 等Arm 固件组件都依赖它。

## 实践案例

### 案例 1：ESP32 上的 HTTPS 请求

ESP-IDF 里你写 HTTP 请求时，底层自动调用 Mbed TLS：

```c
esp_http_client_config_t config = {
    .url = "https://api.example.com/data",
    .cert_pem = ca_cert_pem_start,  // 内嵌 CA 证书
};
esp_http_client_handle_t client = esp_http_client_init(&config);
esp_http_client_perform(client);  // Mbed TLS 在这里完成握手 + 加密
```

**逐部分解释**：`cert_pem` 是服务器的 CA 证书，Mbed TLS 用它验证服务器身份，防止中间人攻击。`perform()` 内部触发 TLS 握手，握手成功后所有 HTTP 数据自动加密传输。开发者不需要手写任何 TLS 代码——ESP-IDF 把 Mbed TLS 封装在了 HTTP 客户端层下面。如果握手失败（证书过期、域名不匹配），`perform()` 会返回错误码，你根据错误码判断是网络问题还是安全问题。

### 案例 2：只用加密原语——算 SHA-256

不想要 TLS，只想算个哈希？直接用底层 crypto 模块：

```c
mbedtls_sha256_context ctx;
mbedtls_sha256_init(&ctx);
mbedtls_sha256_starts(&ctx, 0);           // 0 = SHA-256
mbedtls_sha256_update(&ctx, data, len);   // 喂数据，可多次调用
mbedtls_sha256_finish(&ctx, output);      // 取结果，32 字节
mbedtls_sha256_free(&ctx);                // 释放资源
```

**逐部分解释**：`init → starts → update → finish → free` 是 Mbed TLS 所有增量式加密操作的标准五步。`update` 可以多次调用，适合流式数据（比如逐块读 Flash 再算哈希）。这种 API 设计在所有原语（AES、HMAC、RSA）上保持一致，学一套通全部。

### 案例 3：DTLS 用于无连接加密——CoAP 场景

物联网常用 UDP 协议（如 CoAP），TLS 不能直接用于 UDP，需要 DTLS：

```c
mbedtls_ssl_config_defaults(&conf,
    MBEDTLS_SSL_IS_CLIENT,                    // 客户端模式
    MBEDTLS_SSL_TRANSPORT_DATAGRAM);          // 选 DTLS 而非默认 TLS
mbedtls_ssl_handshake(&ssl);  // 在 UDP 上完成握手
```

**逐部分解释**：DTLS 是 TLS 的 UDP 版本，需要处理丢包、乱序、重放问题。Mbed TLS 同一套 API，只需切换 transport 参数为 `MBEDTLS_SSL_TRANSPORT_DATAGRAM`。这在 LoRa、Thread 等低功耗协议栈中很常见，因为 UDP 比 TCP 省电且适合短报文。注意 DTLS 握手比 TLS 多几轮往返（用于应对丢包重传），在窄带网络上可能需要数秒。

## 踩过的坑

1. **内存碎片导致握手失败**：长时间运行的设备反复建立 TLS 连接，`mbedtls_ssl_setup()` 偶尔返回 `MBEDTLS_ERR_SSL_ALLOC_FAILED`。根因是嵌入式 heap 分配器碎片化——大块连续内存被之前的小块占碎。解法是用静态内存池或自定义 `calloc`/`free` 回调。

2. **证书链不完整导致验证失败**：服务器只发了叶子证书没发中间证书，Mbed TLS 严格验证直接拒绝握手。浏览器能自动补全证书链，但嵌入式 TLS 库不会自动下载中间证书。必须把完整的证书链预置到设备里。

3. **配置宏关了但代码还在调**：`mbedtls_config.h` 里注释掉了 `MBEDTLS_RSA_C` 但代码里调用了 RSA 函数，编译不报错（头文件声明还在）但链接时报 undefined reference。因为 Mbed TLS 用宏控制编译单元，不会在 API 层做检查。

4. **TLS 1.3 默认可能没开**：Mbed TLS 3.x 支持 TLS 1.3，但默认配置里 `MBEDTLS_SSL_PROTO_TLS1_3` 可能没启用。升到 4.0 后 TLS 1.3 支持更完善，但仍需检查配置文件确认已打开。

## 适用 vs 不适用场景

**适用**：

- 资源受限的嵌入式设备（MCU 级别，RAM 小于 256KB）需要 HTTPS 或 DTLS
- 只需要加密原语（AES、SHA、RSA）不需要完整 TLS 协议栈
- 需要 PSA Crypto API 合规的 Arm 平台项目
- IoT 固件 OTA 升级的签名验证与安全传输

**不适用**：

- 桌面或服务器端高性能 TLS——OpenSSL 或 BoringSSL 更适合，Mbed TLS 不是为高吞吐设计的
- 需要最新加密算法实验特性——学术前沿算法通常先进入 OpenSSL
- 非 Arm 生态且不需要 PSA 合责——wolfSSL 也可以考虑（ESP-IDF 可选）
- 对 TLS 性能有极高要求的高并发服务器场景

## 历史小故事（可跳过）

- **2009 年**：荷兰公司 Offspark 发布 PolarSSL，定位为比 OpenSSL 更轻量、更易读的 TLS 库。
- **2014 年**：Heartbleed 漏洞爆发，OpenSSL 代码质量问题暴露，社区开始寻找替代品，PolarSSL 受到更多关注。
- **2015 年 2 月**：Arm 收购 Offspark，PolarSSL 更名为 Mbed TLS，并入 Mbed IoT 生态。
- **2018 年**：Mbed TLS 移入 TrustedFirmware.org 社区治理，脱离 Arm 内部独立运营。
- **2024 年**：4.0 版本发布，TLS 1.3 支持成熟，加密层拆分为独立的 TF-PSA-Crypto 仓库。

## 学到什么

1. **模块化是嵌入式生存之道**：三层分离加编译时裁剪让 Mbed TLS 能塞进 32KB RAM 的 MCU，这是 OpenSSL 做不到的
2. **安全库的"配置即代码"**：`mbedtls_config.h` 一个文件决定整个库的形态，这是嵌入式 C 项目的典型设计模式
3. **生态绑定比技术优势更重要**：Arm 收购不是因为 PolarSSL 技术最强，而是因为它能让 Arm IoT 生态有统一的加密标准
4. **TLS 不只用于 TCP**：DTLS 证明同一套加密协议可以适配 UDP，关键是处理无连接带来的丢包和重放问题

## 延伸阅读

- 官方文档：[Mbed TLS ReadTheDocs](https://mbed-tls.readthedocs.io/)（API 文档加入门教程）
- 官方教程：[Mbed TLS Tutorial](https://mbed-tls.readthedocs.io/en/latest/kb/how-to/mbedtls-tutorial/)（从零开始集成到已有项目）
- [[tls-1.3]] —— Mbed TLS 实现的最新 TLS 协议标准
- [[aes]] —— Mbed TLS 加密原语中最常用的对称加密算法
- [[heartbleed-2014]] —— 嵌入式 TLS 安全事件的典型教训
- [[diffie-hellman]] —— TLS 握手中密钥交换的理论基础

## 关联

- [[tls-1.3]] —— Mbed TLS 3.x/4.x 实现的协议标准
- [[aes]] —— Mbed TLS 加密原语库的核心算法之一
- [[heartbleed-2014]] —— 催生轻量 TLS 库替代 OpenSSL 的安全事件
- [[lwip]] —— 嵌入式 TCP/IP 栈，常与 Mbed TLS 配合实现 HTTPS
- [[freertos]] —— 嵌入式 RTOS，Mbed TLS 常运行其上
- [[smoltcp]] —— Rust 生态的嵌入式网络栈，对标 lwip 加 Mbed TLS 的组合
- [[libsignal]] —— 另一种加密通信库，侧重端到端加密而非传输层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

